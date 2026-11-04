# Codex Task State

This file is the durable handoff for this task. After compaction, read it first.

## Active request

- `其他人的记录呢`: poster/thumbnail repair must cover all users' historical records, not only the current user's lazily opened records.

## Implemented

- Added PostgreSQL query `getGenerationRecordsNeedingPosterMaintenanceFromDb` in `db.js`.
- Scans successful, non-deleted, non-API, non-`r2PurgedAt` video records missing both `cdnPosterUrl` and `localPosterUrl`.
- Excludes image provider/kind records and text/other non-video records.
- Added bounded background backfill in `server.js`: 2 records per batch, one at a time, 30 seconds between batches by default, max 3 attempts, retry backoff 30 minutes.
- Backfill is self-scheduling via `setTimeout`; it must continue after each completed batch.
- Uses `posterOnly` repair: local video when available; otherwise ffmpeg reads provider video and writes only the JPG thumbnail. It does not persist historical full videos.
- Added DB fields: `posterMaintenanceAttempts`, `posterMaintenanceRetryAt`, `posterMaintenanceError`, `posterMaintenanceCompletedAt`, `posterMaintenanceLastDurationMs`.
- On-demand poster queue still works for newly opened records.

## Verification

- `node --test test/generated-assets-on-demand.test.js test/local-media-retention.test.js test/media-url-priority.test.js test/advanced-result-order.test.js`: 27 pass, 0 fail.
- `node --check server.js`, `node --check db.js`, `git diff --check`: passed.
- Production smoke: `https://123vips.com/api/health` returns 200.
- Database after first batches: multiple other-user records repaired (seedance, seedance-nsfw, aliyun-wan30).
- Example repaired other-user record: `cgt-20261104171358-9e0d9b`, user `user-1792321148162-001c8e52`; poster URL returned HTTP 200 `image/jpeg`.
- Recoverable remaining count was 5201 before the self-scheduling worker had processed long; recount after deployment if reporting progress.

## Deployment

- `old-site`: `ca6ea9fb945ee2c7916e0d3a1bf44272803fac00` (includes `7f99968` plus continuation fix).
- `platform-release`: `8dea3b0fe4c410223c12e7872f9e0086ba1ea1a2`.
- Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`.
- `live-release` must not be deployed/defaulted; do not change it for this fix.
- `LOCAL_CREDENTIALS.md` copied into this worktree locally and remains gitignored; never print/commit it.

## Live progress observed

- Worker continues after restart; logs showed more completed batches (`startup` entries from the self-scheduling loop).
- Completed poster repairs in DB increased to 9, recoverable missing count decreased from 5201 to 5191 during a short observation.
- Another repaired other-user task `cgt-20261104165022-0c412b` poster URL returned HTTP 200 `image/jpeg`.
- The remaining backlog is processed slowly by design. No burst download.

## Important caveat

- Historical records with no local video and no still-valid provider video URL cannot be repaired. Do not count image records as missing video posters.
