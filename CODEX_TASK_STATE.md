# Codex Task State

This file is the durable handoff for this task. After compaction, read it first.

## Active request

- Deploy the completed main-site result-thumbnail/poster fixes together with the oversized-source split.
- Confirm the two change sets do not conflict.
- Run tests, build the platform release, and deploy only `123vips.com`.

## Root cause and architecture

- Repeated compaction was caused by whole-file reads of `server.js` (~54.6k lines), `platform.ui.js`, and `platform.create.js`.
- Backend source is now `server.parts/part-01.js` through `part-43.js`; largest part is 1,472 lines.
- `server-source.js` concatenates ordered parts, and `server.js` is a 23-line VM wrapper preserving CommonJS-like scope and `require.main`.
- Frontend is now `platform.ui.parts/part-01..07.js` and `platform.create.parts/part-01..06.js`.
- `platform.js` loads frontend parts in order; `platform.ui.js` and `platform.create.js` remain small compatibility loaders.
- PostgreSQL-only runtime rule remains unchanged; missing `DATABASE_URL` fails clearly.

## Merge decision

- Current split branch was based on `9c4a6fb`.
- Main-site poster/thumbnail repair landed afterward on `origin/old-site` through `cd7fca9`.
- Poster commits changed the old monolithic `server.js` and `platform.create.js`, so Git reported structural conflicts with split files.
- Resolution: independently three-way merge the original monolith sources, regenerate parts from the merged source, and verify concatenated parts match the merged result.
- No business changes should be dropped from either side.

## Existing poster/backfill fixes being deployed

- PostgreSQL query covers successful, non-deleted, non-API video records missing posters across all users.
- Bounded background poster backfill: 2 records per batch, max 3 attempts, 30-minute retry backoff, self-scheduling.
- Poster-only repair does not persist historical full videos.
- Generate Result UI accepts poster-only records and retries poster refresh.
- DB maintenance fields are retained.
- Remaining unrecoverable historical records need a valid provider/local video source.

## Required verification after merge

- Rebuild split parts and prove concatenated content equals merged monolith.
- Syntax-check every part/wrapper; require server successfully.
- Run focused poster/result tests and source-split/deploy tests.
- Run full test suite and compare failures against the established baseline.

## Deployment rules

- Use only `scripts/deploy_local.sh --site old` after committing on `old-site` and building `platform-release`.
- `LOCAL_CREDENTIALS.md` exists and is gitignored; never print or commit it.
- Never deploy `old-site` directly.
- Never include Live files in `platform-release`; never modify/deploy `live-release`.
- Source split release paths must include `server-source.js`, `server.parts/**`, `platform.ui.parts/**`, `platform.create.parts/**`.

## Status

- Merge is in progress; conflicts are structural only.
- No deployment has occurred yet for the combined change set.
