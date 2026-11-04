# Codex Task State

This file is the durable handoff for this task. After compaction, read this file first.

## Active request

- Fix Vega 1.5 Pro/Lite generation incorrectly treated as **Draft to Final** even when the user did not select that mode.
- Deploy the fix to `123vips.com` only. Do not deploy Live.

## Root cause and decisions

- A stale `draftTaskId` / `draft_followup` value in template or restored record params was treated as an explicit user mode.
- Draft to Final is now accepted only from explicit request fields (`mediaMode`, `seedanceMode`, `functionMode`, or direct `draftTaskId`); template params cannot select it silently.
- Real Draft to Final requests discard prompt, all first/last-frame fields, and all reference media before validation and payload construction.
- Normal regeneration ignores stale record `draftTaskId`; record restoration clears the draft ID unless the record's explicit media mode is `draft_followup`.
- A Draft to Final request without an upstream draft task ID now fails clearly with `DRAFT_TASK_ID_REQUIRED`.
- Vega 1.5 Lite rejects Draft to Final with `DRAFT_UNSUPPORTED`.

## Changed files

```text
platform.create.parts/part-04.js
server.parts/part-26.js
server.parts/part-29.js
tencent-vod-vega.js
test/tencent-vod-vega.test.js
CODEX_TASK_STATE.md
```

## Verification

- `node --require ./test/source-compat.js --test test/tencent-vod-vega.test.js test/source-split.test.js`: 35 pass, 0 fail.
- Syntax checks for all four changed runtime files and `git diff --check`: passed.
- Full `npm test`: 610 pass, 21 fail. The same 21 failures occur at unchanged `HEAD` (608 pass, 21 fail); no new failure was introduced.
- The full-suite failures are pre-existing unrelated UI/docs/payment/creator assertions, not Vega behavior.

## Deployment

- Pending commit and deployment on `old-site` -> `platform-release` -> fixed `123vips.com` target.
- Deployment commands only:
  - `python3 scripts/build_release_snapshot.py --source old-site`
  - `scripts/deploy_local.sh --site old`
- Do not deploy integration branch directly. Do not deploy Live.
- Business/runtime data remains PostgreSQL-only.
