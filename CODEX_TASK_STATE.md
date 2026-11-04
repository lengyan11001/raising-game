# Codex Task State

This file is the durable handoff for this task. After any context compaction or continuation, read this file first. Do not re-read large source files or repeat discovery already recorded here.

## User's active request

- Modify **123vips.com** Generate tab only.
- Add three independent video models; append them after all existing models/nodes without changing existing order.
- Route them through Tencent VOD `CreateAigcVideoTask` and `DescribeTaskDetail`.

| Provider ID | UI label | ModelName | ModelVersion |
|---|---|---|---|
| `seedance20-vega` | `Seedance 2.0（Vega）` | `wand-vega-video` | `1.0-pro` |
| `seedance25-vega` | `Seedance 2.5（Vega）` | `wand-vega-video` | `1.5-pro` |
| `h3-vega` | `H3（Vega）` | `wand-vega-video` | `1.5-lite` |

## Non-negotiable rules

- Preserve exact Vega provider IDs end to end: records, params, estimate/submit, polling, regeneration, public responses.
- Vega pricing is not supplied. Fail closed with HTTP 422 `MODEL_PRICING_UNAVAILABLE`; no upstream call and no deduction.
- Never reuse existing Seedance/H3 pricing.
- Do not use `publicHttpUrlForUpstream()` for Vega inputs; require real public HTTP(S) media URLs.
- Vega `FileInfos` must use `Usage` (`FirstFrame`, `LastFrame`, `Reference`) and must never send legacy `ReferenceType`.
- Force `EnhancePromptMode: "disable"`.
- Create task ID is `Response.TaskId`; query payload is `Response.AigcVideoTask`.
- Success status is `FINISH`; outputs are `AigcVideoTask.Output.FileInfos[]`.
- Choose the output with empty/absent `UsageType`, never `last_frame_url`.
- Preserve raw create/query responses in generation records.
- Tencent credentials must stay out of Git.
- Business/runtime data must use PostgreSQL via `DATABASE_URL`; no JSON/static fallbacks.

## Env vars

- `TENCENTCLOUD_SECRET_ID`
- `TENCENTCLOUD_SECRET_KEY`
- `TENCENT_VOD_SUB_APP_ID`

## Status

- Backend, frontend, upload flow, generation/polling/refund/regeneration, API docs, and focused tests are complete.
- Modified: `AGENTS.md`, `lib-providers.js`, `platform.create.js`, `platform.html`, `platform.main.js`, `platform.ui.js`, `server.js`.
- Added: `.codex/config.toml`, `CODEX_TASK_STATE.md`, `tencent-vod-vega.js`, `test/tencent-vod-vega.test.js`.
- Current state: committed as `c27caff` (`Add Tencent VOD Vega video models`); deployment pending.
- Deployment target: `123vips.com` only, through `scripts/deploy_local.sh --site old` after building from committed `old-site`.

## Test status

- Vega + pricing/docs regression: `45 pass, 0 fail`
  - `node --test test/tencent-vod-vega.test.js test/advanced-pricing.test.js test/advanced-result-refresh.test.js test/external-model-docs.test.js`
- Syntax checks passed for `server.js`, `tencent-vod-vega.js`, `platform.create.js`, `platform.ui.js`, `platform.main.js`.
- `git diff --check` passed.
- Known pre-existing UI regressions (stale assertions, also fail or mismatch at `HEAD`; unrelated to Vega):
  - `test/advanced-custom-ui.test.js:329` expects old `fallbackRatio` regex.
  - `test/custom-media-kind-tabs.test.js:17` expects old shorter image-provider array.
  - `test/custom-media-kind-tabs.test.js:28` expects literal `records.filter(...)`; implementation uses `advancedResultVisibleRecords()`.

## Critical code locations

- `server.js:32385` `handleAdvancedVegaGenerate`
- `server.js:26780` `refreshVegaGenerationRecord`
- `server.js:36906` `advancedRegenerateBody`
- `server.js:37689` Vega API docs
- `platform.create.js:2442` Vega submission branch
- `tencent-vod-vega.js` TC3/client/payload helpers

## Progress log

### Context compaction diagnosis (2026-11-04)

- Session `01a1877f-1064-7ed3-b8e9-0315abe364fb` has 311 compactions; 130 occurred on 2026-11-04.
- One turn from 03:51 to 06:02 performed 120 compactions and made 4,031 tool-output items totaling 34,803,934 characters.
- In that turn, `server.js` was read 2,622 times; exact range `lib-providers.js:1-230` was read 36 times.
- Root cause: repeated broad reads and rediscovery after summaries lost exact anchors, not the threshold by itself.
- Mitigations applied: `AGENTS.md` context-efficiency/state-first rules, this state file, repo `.codex/config.toml`, and global `~/.codex/config.toml` limits. Backup: `~/.codex/config.toml.bak_context_efficiency`.
- Global settings: `tool_output_token_limit = 1500`, `model_auto_compact_token_limit_scope = "body_after_prefix"`, `model_post_turn_compact_threshold_percent = 0`.

### Implementation

- 2026-11-04: Implemented the Vega helper module and provider normalization.
- 2026-11-04: Completed exact model IDs/labels, TC3 signing, URL safety, validation, pricing fail-closed, charging/refunds, polling, regeneration, raw upstream storage, UI controls/uploads, and public docs.
- 2026-11-04: Focused regressions pass as recorded above.
- 2026-11-04: Committed as `c27caff` (`Add Tencent VOD Vega video models`). Next step: build release snapshot, deploy old site, smoke test, and update this status.
