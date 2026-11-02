#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
from pathlib import Path

import paramiko


HOST = "101.47.76.188"
PORT = 22
USER = "root"
PASSWORD_FILE = Path(r"D:\raising-game\scripts\fyshark_tail_log.py")


REMOTE_SQL = r"""
CREATE OR REPLACE FUNCTION slim_generation_jsonb(value jsonb)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  result jsonb := '{}'::jsonb;
  item jsonb;
  entry record;
  key_lower text;
  text_value text;
BEGIN
  IF value IS NULL OR value = 'null'::jsonb THEN
    RETURN value;
  END IF;
  IF jsonb_typeof(value) = 'array' THEN
    result := '[]'::jsonb;
    FOR item IN SELECT jsonb_array_elements(value) LOOP
      result := result || jsonb_build_array(slim_generation_jsonb(item));
    END LOOP;
    RETURN result;
  END IF;
  IF jsonb_typeof(value) = 'object' THEN
    result := '{}'::jsonb;
    FOR entry IN SELECT e.key, e.value AS child_value FROM jsonb_each(value) AS e(key, value) LOOP
      key_lower := lower(entry.key);
      IF key_lower IN ('dataurl', 'data_url', 'b64_json', 'base64') THEN
        text_value := CASE WHEN jsonb_typeof(entry.child_value) = 'string' THEN trim(both '"' from entry.child_value::text) ELSE entry.child_value::text END;
        result := result || jsonb_build_object(entry.key, format('[%s omitted: %s bytes]', entry.key, length(text_value)));
      ELSE
        result := result || jsonb_build_object(entry.key, slim_generation_jsonb(entry.child_value));
      END IF;
    END LOOP;
    RETURN result;
  END IF;
  IF jsonb_typeof(value) = 'string' AND value::text ~ '^"data:[^;]+;base64,' THEN
    text_value := trim(both '"' from value::text);
    RETURN to_jsonb(format('[dataUrl omitted: %s bytes]', length(text_value)));
  END IF;
  RETURN value;
END;
$$;

WITH targets AS (
  SELECT task_id, payload, slim_generation_jsonb(payload) AS slim_payload
  FROM app_generation_records
  WHERE payload::text LIKE '%data:%;base64,%'
     OR payload::text LIKE '%"dataUrl"%'
     OR payload::text LIKE '%"data_url"%'
     OR payload::text LIKE '%"b64_json"%'
     OR payload::text LIKE '%"base64"%'
), updated AS (
  UPDATE app_generation_records r
  SET payload = t.slim_payload,
      updated_at = NOW()
  FROM targets t
  WHERE r.task_id = t.task_id
    AND r.payload IS DISTINCT FROM t.slim_payload
  RETURNING r.task_id, pg_column_size(t.payload) AS before_bytes, pg_column_size(r.payload) AS after_bytes
)
SELECT count(*) AS updated,
       pg_size_pretty(coalesce(sum(before_bytes), 0)::bigint) AS before_total,
       pg_size_pretty(coalesce(sum(after_bytes), 0)::bigint) AS after_total
FROM updated;

DROP FUNCTION slim_generation_jsonb(jsonb);
VACUUM (ANALYZE) app_generation_records;
"""


def password() -> str:
  value = os.environ.get("OLD_SITE_SSH_PASSWORD") or os.environ.get("FYSHARK_SSH_PASSWORD") or os.environ.get("DEPLOY_SSH_PASSWORD")
  if value:
    return value
  if PASSWORD_FILE.exists():
    match = re.search(r'(?m)^PASSWORD\s*=\s*"([^"]+)"', PASSWORD_FILE.read_text(encoding="utf-8", errors="replace"))
    if match:
      return match.group(1)
  raise SystemExit("Missing old site SSH password.")


def main() -> int:
  parser = argparse.ArgumentParser(description="Slim large generation-record JSON payloads on old production DB.")
  parser.add_argument("--dry-run", action="store_true", help="Only print candidate sizes.")
  args = parser.parse_args()
  sql = (
    "SELECT count(*), pg_size_pretty(sum(pg_column_size(payload))::bigint) "
    "FROM app_generation_records WHERE payload::text LIKE '%data:%;base64,%' "
    "OR payload::text LIKE '%\"dataUrl\"%' OR payload::text LIKE '%\"data_url\"%' "
    "OR payload::text LIKE '%\"b64_json\"%' OR payload::text LIKE '%\"base64\"%';"
  ) if args.dry_run else REMOTE_SQL
  command = "sudo -u postgres psql -d raising_game -v ON_ERROR_STOP=1 <<'SQL'\n" + sql + "\nSQL\n"

  client = paramiko.SSHClient()
  client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
  client.connect(HOST, port=PORT, username=USER, password=password(), timeout=20, banner_timeout=30, auth_timeout=20)
  try:
    _stdin, stdout, stderr = client.exec_command(command, timeout=300)
    out = stdout.read().decode("utf-8", errors="replace")
    err = stderr.read().decode("utf-8", errors="replace")
    rc = stdout.channel.recv_exit_status()
  finally:
    client.close()
  print(out)
  if err.strip():
    print(err)
  return rc


if __name__ == "__main__":
  raise SystemExit(main())
