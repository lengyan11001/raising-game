#!/usr/bin/env bash
set -euo pipefail
umask 077

usage() {
  cat <<'USAGE'
Usage: ops/verify-postgres-backup.sh [options]

Restore a PostgreSQL custom-format dump into a disposable database and verify it.
Run as root on the database host. The source database is only read for baseline data.

Options:
  --backup-file PATH          Dump to verify (default: newest /var/backups/raising-game/db-*.dump)
  --source-db NAME            Baseline database (default: raising_game)
  --drill-db NAME             Disposable database name (default: raising_game_restore_drill_<UTC timestamp>)
  --require-source-match      Require restored core rows and schema to match an online snapshot
  --keep-drill-db             Keep the restored database for manual investigation
  --help                      Show this help

By default the script verifies the selected backup in isolation. When
--require-source-match is used, it exports one repeatable-read snapshot from the
source, dumps that exact snapshot, records every public table count from the same
snapshot, and restores it. The restored counts must match the manifest exactly.
This permits live writes after the snapshot while still proving an exact restore.
Any table-count mismatch, orphaned relation, invalid index, or unvalidated
constraint fails the drill. Selected and snapshot backups are checked for TOC
readability and reported for audit.

Environment:
  PG_PSQL_BIN                 psql executable (default: psql)
  PG_CREATEDB_BIN             createdb executable (default: createdb)
  PG_DROPDB_BIN               dropdb executable (default: dropdb)
  PG_RESTORE_BIN              pg_restore executable (default: pg_restore)
  PG_DUMP_BIN                 pg_dump executable (default: pg_dump)
  DRAIN_TIMEOUT_SECONDS       Wait before terminating snapshot sessions (default: 120)

The script never writes to the source database. It prints timings and counts, not credentials.
USAGE
}

BACKUP_FILE=""
SOURCE_DB="raising_game"
DRILL_DB=""
REQUIRE_SOURCE_MATCH=0
KEEP_DRILL_DB=0
PSQL_BIN="${PG_PSQL_BIN:-psql}"
CREATEDB_BIN="${PG_CREATEDB_BIN:-createdb}"
DROPDB_BIN="${PG_DROPDB_BIN:-dropdb}"
PG_RESTORE_BIN="${PG_RESTORE_BIN:-pg_restore}"
PG_DUMP_BIN="${PG_DUMP_BIN:-pg_dump}"
DRAIN_TIMEOUT_SECONDS="${DRAIN_TIMEOUT_SECONDS:-120}"

while (($#)); do
  case "$1" in
    --backup-file) BACKUP_FILE="${2:?missing value for --backup-file}"; shift 2 ;;
    --source-db) SOURCE_DB="${2:?missing value for --source-db}"; shift 2 ;;
    --drill-db) DRILL_DB="${2:?missing value for --drill-db}"; shift 2 ;;
    --require-source-match) REQUIRE_SOURCE_MATCH=1; shift ;;
    --keep-drill-db) KEEP_DRILL_DB=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root so the restore can use the postgres account." >&2
  exit 1
fi

if [[ -z "$DRILL_DB" ]]; then
  DRILL_DB="raising_game_restore_drill_$(date -u +%Y%m%d%H%M%S)"
fi
if [[ ! "$DRILL_DB" =~ ^[a-z][a-z0-9_]{0,62}$ ]]; then
  echo "Invalid drill database name: $DRILL_DB" >&2
  exit 2
fi
if [[ "$DRILL_DB" == "$SOURCE_DB" ]]; then
  echo "Refusing to restore over the source database." >&2
  exit 2
fi

if [[ -z "$BACKUP_FILE" ]]; then
  BACKUP_FILE="$(ls -1t /var/backups/raising-game/db-*.dump 2>/dev/null | head -n 1 || true)"
fi
if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: ${BACKUP_FILE:-<none>}" >&2
  exit 2
fi

selected_backup="$BACKUP_FILE"
restore_backup="$selected_backup"
snapshot_file=""
snapshot_manifest=""
snapshot_dir=""
delete_snapshot_file=0
delete_snapshot_manifest=0
exporter_pid=""
exporter_fd=""

as_postgres() {
  sudo -u postgres "$@"
}

psql_value() {
  local database="$1"
  local sql="$2"
  as_postgres "$PSQL_BIN" -d "$database" -At -v ON_ERROR_STOP=1 -c "$sql"
}

count_manifest_sql() {
  cat <<'SQL'
COPY (
  SELECT c.relname,
         (xpath('/row/c/text()',
                query_to_xml(format('SELECT count(*) AS c FROM public.%I', c.relname),
                             false, true, '')))[1]::text
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  ORDER BY c.relname
) TO STDOUT WITH (FORMAT csv, DELIMITER E'\t');
SQL
}

wait_for_exporter() {
  local timeout="$DRAIN_TIMEOUT_SECONDS"
  local waited=0
  if [[ ! "$timeout" =~ ^[1-9][0-9]*$ ]]; then
    echo "Invalid DRAIN_TIMEOUT_SECONDS=$timeout" >&2
    return 2
  fi
  while [[ -n "$exporter_pid" ]] && kill -0 "$exporter_pid" 2>/dev/null; do
    if (( waited >= timeout * 10 )); then
      return 1
    fi
    sleep 0.1
    waited=$((waited + 1))
  done
  return 0
}

cleanup() {
  local status=$?
  if [[ $status -eq 0 && "$KEEP_DRILL_DB" != "1" ]]; then
    as_postgres "$DROPDB_BIN" --if-exists "$DRILL_DB" >/dev/null
    echo "DRILL_CLEANUP_OK db=$DRILL_DB"
  elif [[ "$KEEP_DRILL_DB" == "1" ]]; then
    echo "DRILL_DB_RETAINED db=$DRILL_DB"
  fi
  if [[ -n "$exporter_fd" ]]; then
    eval "exec ${exporter_fd}>&-" 2>/dev/null || true
  fi
  if [[ -n "$exporter_pid" ]] && kill -0 "$exporter_pid" 2>/dev/null; then
    kill "$exporter_pid" 2>/dev/null || true
    wait "$exporter_pid" 2>/dev/null || true
  fi
  if [[ "$delete_snapshot_file" == "1" && -n "$snapshot_file" && -f "$snapshot_file" ]]; then
    unlink "$snapshot_file"
    echo "SNAPSHOT_CLEANUP_OK file=$snapshot_file"
  fi
  if [[ "$delete_snapshot_manifest" == "1" && -n "$snapshot_manifest" && -f "$snapshot_manifest" ]]; then
    unlink "$snapshot_manifest"
  fi
  if [[ -n "$snapshot_dir" && -d "$snapshot_dir" ]]; then
    rm -rf "$snapshot_dir"
    echo "SNAPSHOT_MANIFEST_CLEANUP_OK dir=$snapshot_dir"
  fi
  exit "$status"
}
trap cleanup EXIT

if [[ "$(psql_value postgres "SELECT count(*) FROM pg_database WHERE datname = '$DRILL_DB'")" != "0" ]]; then
  echo "Drill database already exists: $DRILL_DB" >&2
  exit 2
fi

echo "SELECTED_BACKUP_FILE=$selected_backup"
echo "SELECTED_BACKUP_BYTES=$(stat -c %s "$selected_backup")"
echo "SELECTED_BACKUP_SHA256=$(sha256sum "$selected_backup" | awk '{print $1}')"
as_postgres "$PG_RESTORE_BIN" -l "$selected_backup" >/dev/null
echo "SELECTED_BACKUP_TOC_OK=1"

if [[ "$REQUIRE_SOURCE_MATCH" == "1" ]]; then
  snapshot_file="/var/backups/raising-game/verify-$(date -u +%Y%m%d-%H%M%S).dump"
  delete_snapshot_file=1
  snapshot_manifest="$(mktemp /tmp/raising-game-source-manifest.XXXXXX)"
  delete_snapshot_manifest=1
  snapshot_dir="$(mktemp -d /tmp/raising-game-exporter.XXXXXX)"
  chmod 0711 "$snapshot_dir"
  exporter_in="$snapshot_dir/exporter.in"
  exporter_out="$snapshot_dir/exporter.out"
  exporter_err="$snapshot_dir/exporter.err"
  mkfifo "$exporter_in"
  : >"$exporter_out"
  : >"$exporter_err"
  chown postgres:postgres "$exporter_in" "$exporter_out" "$exporter_err"
  chmod 0600 "$exporter_in" "$exporter_out" "$exporter_err" "$snapshot_manifest"

  as_postgres "$PSQL_BIN" -X -q -A -t -v ON_ERROR_STOP=1 -d "$SOURCE_DB" \
    <"$exporter_in" >"$exporter_out" 2>"$exporter_err" &
  exporter_pid=$!
  exec {exporter_fd}>"$exporter_in"
  printf '%s\n' \
    'BEGIN ISOLATION LEVEL REPEATABLE READ;' \
    'SELECT pg_export_snapshot();' \
    '\echo __SNAPSHOT_READY__' >&"$exporter_fd"

  snapshot_ready=0
  for _ in $(seq 1 $((DRAIN_TIMEOUT_SECONDS * 10))); do
    if ! kill -0 "$exporter_pid" 2>/dev/null; then
      break
    fi
    if grep -q '^__SNAPSHOT_READY__$' "$exporter_out" 2>/dev/null; then
      snapshot_ready=1
      break
    fi
    sleep 0.1
  done
  if [[ "$snapshot_ready" != "1" ]]; then
    cat "$exporter_err" >&2 || true
    echo "Failed to export a PostgreSQL snapshot." >&2
    exit 1
  fi
  snapshot_id="$(grep -m1 -E '^[0-9A-Fa-f-]+$' "$exporter_out")"
  if [[ -z "$snapshot_id" ]]; then
    echo "PostgreSQL did not return a snapshot identifier." >&2
    exit 1
  fi
  echo "SOURCE_SNAPSHOT_ID=$snapshot_id"

  as_postgres nice -n 10 ionice -c2 -n7 "$PG_DUMP_BIN" \
    -Fc --snapshot="$snapshot_id" -d "$SOURCE_DB" -f "$snapshot_file"
  delete_snapshot_file=0

  {
    printf '%s\n' '\echo __MANIFEST_BEGIN__'
    count_manifest_sql
    printf '%s\n' '\echo __MANIFEST_END__' 'COMMIT;'
  } >&"$exporter_fd"
  exec {exporter_fd}>&-
  exporter_fd=""

  manifest_ready=0
  for _ in $(seq 1 $((DRAIN_TIMEOUT_SECONDS * 10))); do
    if grep -q '^__MANIFEST_END__$' "$exporter_out" 2>/dev/null; then
      manifest_ready=1
      break
    fi
    if ! kill -0 "$exporter_pid" 2>/dev/null; then
      break
    fi
    sleep 0.1
  done
  if [[ "$manifest_ready" != "1" ]]; then
    cat "$exporter_err" >&2 || true
    echo "Failed to capture the source snapshot manifest." >&2
    exit 1
  fi
  if ! wait_for_exporter; then
    echo "Snapshot exporter did not finish within ${DRAIN_TIMEOUT_SECONDS}s; terminating the isolated exporter connection." >&2
    kill "$exporter_pid" 2>/dev/null || true
    wait "$exporter_pid" 2>/dev/null || true
    exporter_pid=""
  fi
  exporter_pid=""
  sed -n '/^__MANIFEST_BEGIN__$/,/^__MANIFEST_END__$/p' "$exporter_out" \
    | sed '1d;$d' | tee "$snapshot_manifest" >/dev/null
  delete_snapshot_manifest=0
  if [[ ! -s "$snapshot_manifest" ]]; then
    echo "Source snapshot manifest is empty." >&2
    exit 1
  fi
  manifest_tables="$(wc -l <"$snapshot_manifest" | tr -d '[:space:]')"
  echo "SOURCE_MANIFEST_TABLES=$manifest_tables"
  as_postgres "$PG_RESTORE_BIN" -l "$snapshot_file" >/dev/null
  restore_backup="$snapshot_file"
  echo "ONLINE_SNAPSHOT_FILE=$snapshot_file"
  echo "ONLINE_SNAPSHOT_BYTES=$(stat -c %s "$snapshot_file")"
  echo "ONLINE_SNAPSHOT_SHA256=$(sha256sum "$snapshot_file" | awk '{print $1}')"
else
  echo "ONLINE_SNAPSHOT_FILE=<not-required>"
fi

echo "RESTORE_BACKUP_FILE=$restore_backup"
as_postgres "$CREATEDB_BIN" --owner=postgres --template=template0 --encoding=UTF8 "$DRILL_DB"
echo "DRILL_DB_CREATED=$DRILL_DB"

restore_start="$(date +%s)"
as_postgres nice -n 10 ionice -c2 -n7 "$PG_RESTORE_BIN" \
  --exit-on-error --no-owner --no-privileges --single-transaction \
  -d "$DRILL_DB" "$restore_backup" >/dev/null
restore_seconds=$(( $(date +%s) - restore_start ))
echo "RESTORE_SECONDS=$restore_seconds"

tables="$(psql_value "$DRILL_DB" "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")"
sequences="$(psql_value "$DRILL_DB" "SELECT count(*) FROM information_schema.sequences WHERE sequence_schema = 'public'")"
indexes="$(psql_value "$DRILL_DB" "SELECT count(*) FROM pg_indexes WHERE schemaname = 'public'")"
foreign_keys="$(psql_value "$DRILL_DB" "SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'f'")"
invalid_indexes="$(psql_value "$DRILL_DB" "SELECT count(*) FROM pg_index WHERE NOT indisvalid")"
unvalidated_constraints="$(psql_value "$DRILL_DB" "SELECT count(*) FROM pg_constraint WHERE convalidated IS FALSE")"
null_tasks="$(psql_value "$DRILL_DB" "SELECT count(*) FROM app_generation_records WHERE task_id IS NULL")"
orphan_assets="$(psql_value "$DRILL_DB" "SELECT count(*) FROM app_user_assets a LEFT JOIN app_users u ON u.id = a.user_id WHERE u.id IS NULL")"

echo "RESTORED_TABLES=$tables"
echo "RESTORED_SEQUENCES=$sequences"
echo "RESTORED_INDEXES=$indexes"
echo "RESTORED_FOREIGN_KEYS=$foreign_keys"
echo "INVALID_INDEXES=$invalid_indexes"
echo "UNVALIDATED_CONSTRAINTS=$unvalidated_constraints"
echo "NULL_GENERATION_TASK_IDS=$null_tasks"
echo "ORPHAN_USER_ASSETS=$orphan_assets"

[[ "$tables" -gt 0 ]] || { echo "No restored tables." >&2; exit 1; }
[[ "$invalid_indexes" == "0" ]] || { echo "Invalid indexes found." >&2; exit 1; }
[[ "$unvalidated_constraints" == "0" ]] || { echo "Unvalidated constraints found." >&2; exit 1; }
[[ "$null_tasks" == "0" ]] || { echo "Generation records without task IDs found." >&2; exit 1; }
[[ "$orphan_assets" == "0" ]] || { echo "Orphaned user assets found." >&2; exit 1; }

echo "TABLE_COUNTS_BEGIN"
count_rows=0
if [[ "$REQUIRE_SOURCE_MATCH" == "1" ]]; then
  restored_manifest="$snapshot_dir/restored-manifest.tsv"
  manifest_diff="$snapshot_dir/manifest.diff"
  as_postgres "$PSQL_BIN" -X -q -A -t -v ON_ERROR_STOP=1 -d "$DRILL_DB" \
    -c "$(count_manifest_sql)" >"$restored_manifest"
  count_rows="$(wc -l <"$snapshot_manifest" | tr -d '[:space:]')"
  if ! diff -u "$snapshot_manifest" "$restored_manifest" >"$manifest_diff"; then
    cat "$manifest_diff" >&2
    echo "SNAPSHOT_MANIFEST_MISMATCH=1 tables=$count_rows" >&2
    echo "SOURCE_MATCH=0 exact_snapshot_manifest=0" >&2
    exit 1
  fi
  cat "$snapshot_manifest"
else
  while IFS= read -r table_name; do
    [[ -n "$table_name" ]] || continue
    restored_count="$(psql_value "$DRILL_DB" "SELECT count(*) FROM public.$table_name")"
    printf '%s\t%s\n' "$table_name" "$restored_count"
    count_rows=$((count_rows + 1))
  done < <(psql_value "$DRILL_DB" "SELECT quote_ident(table_name) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")
fi
echo "TABLE_COUNTS_END"
if [[ "$REQUIRE_SOURCE_MATCH" == "1" ]]; then
  echo "SOURCE_MATCH=1 exact_snapshot_manifest=1 tables=$count_rows later_writes_allowed=1"
else
  echo "SOURCE_MATCH=not-required restored_tables=$count_rows"
fi
echo "RESTORE_VERIFICATION_OK=1"
