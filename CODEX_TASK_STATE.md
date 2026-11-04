# Codex Task State

This file is the durable handoff for this task. After any context compaction or continuation, read this file first. Do not re-read large source files or repeat discovery already recorded here.

## User's active request

- Solve the repeated context-compaction problem caused by agent reads of oversized source files.
- Actually split large runtime sources into reasonable, independently readable parts.
- Preserve existing uncommitted Vega work and verify the application still works normally.
- Do not deploy unless explicitly requested. Never deploy `old-site` directly or touch `live-release`.

## Context-compaction root cause

- `server.js`, `platform.ui.js`, and `platform.create.js` were single files of roughly 54.6k, 7.4k, and 6.8k lines.
- Whole-file reads or broad searches over those files repeatedly consumed most of the model context and triggered compaction loops across sessions.
- The fix is physical source splitting, not instructing the agent to read less.

## Split architecture

### Backend

```text
server.parts/part-01.js ... part-43.js
server-source.js
server.js
```

- Largest backend part: 1,472 lines (43 parts; average about 1,270 lines).
- `server-source.js` reads ordered parts and exports `partFiles`, `readServerSource()`, and `source`.
- `server.js` is a 23-line VM wrapper that compiles the concatenated source in one CommonJS-like scope.
- Runtime semantics preserved: `require.main === module`, `module.exports`, `__dirname`, relative requires, execution order, and bootstrap behavior.
- Without `DATABASE_URL`, startup still fails clearly with the PostgreSQL-required error.

### Frontend

```text
platform.ui.parts/part-01.js ... part-07.js
platform.create.parts/part-01.js ... part-06.js
platform.ui.js
platform.create.js
```

- `platform.ui.js` and `platform.create.js` are compatibility loaders for direct callers.
- `platform.js` loads the UI/create parts directly in dependency order.
- Frontend parts retain the original shared global script scope and order.

## Static/runtime safety

- All frontend part files are included in `PLATFORM_ASSET_FILES`, so cache versions change with their content.
- `/server-source.js`, `/server.parts/`, tests, scripts, and other private paths return 404.
- Frontend parts remain publicly servable because the browser loads them.
- Release snapshots and sync include the new part directories; live release remains isolated.

## Test compatibility

- `test/source-compat.js` is preloaded by `npm test`.
- It maps legacy test reads of `server.js`, `platform.ui.js`, and `platform.create.js` to concatenated ordered part sources.
- `test/source-split.test.js` enforces:
  - wrappers stay below 100 lines;
  - part names are contiguous and ordered;
  - parts are nonempty;
  - no part exceeds 1,475 lines.
- This avoids editing dozens of tests while keeping their original whole-source assertions running against the real concatenated source.

## Build/deploy/sync updates

Updated to include split files:

- `scripts/build_release_snapshot.py`
- `scripts/deploy_site.py`
- `scripts/sync_old_to_new2.py`

Patterns include:

```text
server-source.js
server.parts/**
platform.ui.parts/**
platform.create.parts/**
```

Live-only ownership remains unchanged.

## Verification

- All backend/frontend parts and wrappers pass `node --check`.
- `require("./server-source")` loads 43 ordered backend parts.
- `require("./server")` loads successfully and exposes 43 `__sourceParts`.
- `node server.js` reaches normal bootstrap and fails clearly because local `DATABASE_URL` is absent.
- `python3 -m py_compile` passes for the three changed Python scripts.
- Focused split/deploy tests: **8 pass, 0 fail**
  - `node --require ./test/source-compat.js --test test/source-split.test.js test/deploy-targets.test.js`
- Full suite after splitting: **621 tests, 600 pass, 21 fail**.
- Baseline before splitting: **620 tests, 599 pass, 21 fail**.
- The same 21 failures exist before and after splitting; they are pre-existing Vega/control failures, not split regressions.
- `git diff --check` passes.
- Static classification smoke passed: frontend parts public, backend parts and `server-source.js` private, asset version includes all frontend parts.
- Full HTTP static smoke is blocked locally because serving platform HTML requires PostgreSQL; the database rule must not be bypassed.

## Preservation of prior Vega work

- Existing uncommitted Vega changes remain in `platform.main.js` and `tencent-vod-vega.js`, plus the split create parts.
- No Vega feature work was resumed in this pass.

## Deployment status

- No deployment performed for the source split.
- `live-release` was not modified.
- Previously deployed Vega fix remains recorded in Git history, but this split is not deployed yet.

## Next step

- Commit the verified source split on `old-site` when requested, then optionally build `platform-release` from that committed integration state.
