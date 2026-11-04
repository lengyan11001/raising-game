# Codex Task State

This file is the durable handoff for this task. After compaction, read it first.

## Active request

- Deploy the completed main-site result-thumbnail/poster fixes together with the oversized-source split.
- Confirm the two change sets do not conflict.
- Run tests, build the platform release, and deploy only `123vips.com`.

## Root cause and architecture

- Repeated compaction was caused by whole-file reads of `server.js` (~54.6k lines), `platform.ui.js`, and `platform.create.js`.
- Backend source is now `server.parts/part-01.js` through `part-43.js`; largest part is 1,473 lines.
- `server-source.js` concatenates ordered parts; `server.js` is a small VM wrapper preserving shared source scope and `require.main`.
- Frontend is now `platform.ui.parts/part-01..07.js` and `platform.create.parts/part-01..06.js`.
- `platform.js` loads frontend parts in order; `platform.ui.js` and `platform.create.js` remain small compatibility loaders.
- PostgreSQL-only runtime rule remains unchanged; missing `DATABASE_URL` fails clearly.

## Merge result

- Split implementation: `adbbc93` (`Split oversized runtime sources`).
- Main-site poster/backfill tip merged in: `cd7fca9`.
- Merge commit: `883e458` (`Merge poster backfill fixes into source split branch`).
- Conflicts were structural only: upstream changed monolithic `server.js` / `platform.create.js`, while this branch had split wrappers.
- Resolution independently three-way merged the monolith sources, regenerated ordered parts, and verified both sides' functionality remains present.
- Vega target controls and poster/backfill behavior are both retained.

## Poster/backfill behavior

- PostgreSQL query covers successful, non-deleted, non-API video records missing posters across all users.
- Bounded background poster backfill: 2 records per batch, max 3 attempts, 30-minute retry backoff, self-scheduling.
- Poster-only repair does not persist historical full videos.
- Generate Result UI accepts poster-only records and retries poster refresh.
- DB maintenance fields are retained.

## Verification

- Python compile checks passed for release/deploy scripts.
- Full suite: 628 tests, 607 pass, 21 fail. The 21 failures are the established pre-existing Vega/control/payment/landing baseline, not merge regressions.
- Focused suite with required source compatibility loader: 44 tests, 44 pass, 0 fail.
- Backend split: 43 parts, largest 1,473 lines; `require('./server')` exposes 43 source parts.
- `git diff --check` passed before final state update.

## Deployment rules

- Use only `scripts/deploy_local.sh --site old` after committing on `old-site` and building `platform-release`.
- `LOCAL_CREDENTIALS.md` exists and is gitignored; never print or commit it.
- Never deploy `old-site` directly.
- Never include Live files in `platform-release`; never modify/deploy `live-release`.
- Source split release paths must include `server-source.js`, `server.parts/**`, `platform.ui.parts/**`, `platform.create.parts/**`.

## Deployment result

- `old-site` fast-forwarded to verified commit `9221fd2`.
- Built and pushed `platform-release` commit `91d5774` from source `9221fd2`.
- Deployed with `scripts/deploy_local.sh --site old`.
- Production commit confirmed as `91d5774`; health check `https://123vips.com/api/health` returns HTTP 200 with `{"ok":true}`.
- Frontend split assets return 200: `/platform.ui.parts/part-01.js`, `/platform.create.parts/part-01.js`.
- Backend source assets remain private: `/server-source.js`, `/server.parts/part-01.js` return 404.
- Platform page references asset version `mw2780u1`.
- `live-release` was not deployed or modified (`6642e17` remains remote tip).
- Production startup shows PostgreSQL and Ark configured; catalog check succeeded.

## Status

- Merge verification, release build, deployment, and production smoke checks complete.
