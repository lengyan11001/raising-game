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

## Active Vega full integration (2026-11-04)

- Goal: complete Tencent Vega integration for `1.0-pro`, `1.0-pro-fast`, `1.0-pro-mini`, `1.5-pro`, `1.0-lite`, `1.5-lite`.
- Required: all upstream modes/parameters/extInfo, complete UI controls and replay, docs, tests, build, deploy `123vips.com` only.
- Preserve existing provider IDs: `seedance20-vega`, `seedance25-vega`, `h3-vega`.
- Add IDs: `seedance20-fast-vega`, `seedance20-mini-vega`, `seedance20-lite-vega`.
- Architecture: edit `server.parts/**`, `platform.ui.parts/**`, `platform.create.parts/**`; never regenerate/rewrite monoliths.
- Tests must use `node --require ./test/source-compat.js --test`.
- Deployment: commit `old-site`, build `platform-release`, deploy via `scripts/deploy_local.sh --site old`; never touch `live-release`.


## Context compaction diagnosis (corrected 2026-11-04)

- A new thread is not by itself a fix: thread `01a1a52f-7928-73f3-83d5-86ba4d0f678d` was already a new session and still compacted 85 times in one turn.
- Effective model context is 121,600 tokens (128,000 catalog window at 95%); automatic compaction starts around 100k-112k tokens.
- The turn made about 4,650 `exec_command` calls, including about 3,800 `sed -n` calls, 1,300 `rg -n` calls, and about 4,660 function calls total.
- Tool outputs totaled about 25.4 million characters; output cap was 1,500 tokens per call. Roughly 50 capped tool calls fill the usable window and force another compaction.
- Token usage reached 136.9 million input tokens, averaging 73.9k input per model call. This is the cost of repeatedly refilling context, not a provider/compaction bug.
- The valid fix is to bound work per turn/segment (roughly under 30-40 tool calls when possible), persist state after each phase, and continue from `CODEX_TASK_STATE.md`. Do not claim that merely opening a new thread solves it.


## Vega integration verification (2026-11-04)

- Implemented all six Vega models and all upstream modes: text_to_video, first_frame, last_frame, first_last_frame, reference_video, draft_followup.
- Covered multimodal image/video/audio references, adaptive ratio, smart duration -1, generate audio, input media, taskType auto/reference/edit/extend, Draft/Draft-to-Final, ExtInfo, last-frame/usage parsing, fail-closed pricing, replay, regenerate, Add assets/public URL mirroring, and six-model UI/docs.
- Focused suite: 31/31 pass using `node --require ./test/source-compat.js --test test/tencent-vod-vega.test.js`.
- Full suite: 628 tests, 607 pass, 21 fail. The 21 failures exactly match the established pre-existing baseline; no Vega focused test fails.
- Full output: `/tmp/vega-full.out`; focused output: `/tmp/vega-test-3.out`.
- Deployment status: pending commit, `platform-release` build, and `scripts/deploy_local.sh --site old`.
