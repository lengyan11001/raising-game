# Codex Task State

This file is the durable handoff for this task. After compaction, read this file first.

## Current live verification

- Production `/etc/raising-game-demo.env` now has the Tencent VOD international credentials supplied by the user. Values are intentionally not recorded here.
- VOD credentials were verified against `DescribeSubAppIds` on the international host; the account returned one application.
- Real Vega 1.5 Lite 720P / 4-second text-to-video tasks completed successfully.
- Successful test task IDs:
  - `1524935253-AigcVideoTask-6c72d17c36d7390bc113b180f3abfaaft` (with `EnhancePromptMode=enable`)
  - `1524935253-AigcVideoTask-87f79f53e45b8865dc811fd6670bb00bt` (no ExtInfo)
- Output URLs were returned by `DescribeTaskDetail`; video generation is live.
- Upstream rejects `GenerateMode` and `VideoQualityMode` for `1.5-lite`, despite the generic Lite guide listing them. The backend now omits both for Lite and the UI hides those unsupported controls for Lite.

## Active request

- Vega 1.5 Lite (`h3-vega`) integration is complete for the current phase.
- Sale-price rows are available in Backoffice; prices default to `0` and generation remains fail-closed until the user sets positive values.
- Vega Pro remains disabled/fail-closed.

## Decisions

- Lite has five editable output-second sale-price rows: `480p`, `720p`, `1080p`, `2k`, `4k`.
- All five default to `0` and persist from PostgreSQL-backed `app_config`.
- Admin purchase price is intentionally unconfigured and displayed as unavailable; no fallback to Pro or another model.
- Lite generation uses `configured sale credits/second × billing duration`; smart duration (`-1`) pre-deducts 30 seconds.
- Zero/missing Lite price throws `MODEL_PRICING_UNAVAILABLE` (HTTP 422) before charging or calling upstream.
- Vega Pro remains fail-closed behind its existing pricing-unavailable guard.
- Tencent VOD integration targets the **international site only**:
  - Host: `vod.intl.tencentcloudapi.com`
  - Default region: `ap-singapore`
  - Mainland host `vod.tencentcloudapi.com` and default region `ap-guangzhou` must not be used.

## Changed files

```text
server.parts/part-01.js
server.parts/part-02.js
server.parts/part-11.js
server.parts/part-38.js
server.parts/part-39.js
tencent-vod-vega.js
test/advanced-pricing.test.js
test/tencent-vod-vega.test.js
CODEX_TASK_STATE.md
```

## Verification

- `node --require ./test/source-compat.js --test test/advanced-pricing.test.js test/tencent-vod-vega.test.js test/source-split.test.js`: 49 pass, 0 fail.
- `node --check server.js`, `node --check tencent-vod-vega.js`, and `git diff --check`: passed.
- Pricing tests cover row presence/save mappings, zero-safe defaults/persistence, runtime rate calculation, zero-price fail-closed behavior, and Pro fail-closed behavior.
- International VOD test asserts calls use `vod.intl.tencentcloudapi.com`, header region `ap-singapore`, and never the mainland VOD host.

## Prior completed work in this task

- Fixed Vega 1.5 Pro/Lite being incorrectly treated as Draft to Final from stale template/record parameters.
- That fix was committed as `eb873be`, release snapshot `e576a05`, and deployed to `123vips.com`.

## Deployment

- `old-site`: `9e50a6a` (`Fix Vega Lite unsupported generation controls`), pushed to origin.
- `platform-release`: `6e4ac1c`, built from `9e50a6a`; pushed to origin.
- Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`.
- Production checkout: `/opt/raising-game-demo` at `6e4ac1ca45f3e0a5d8bdfd03a63713c90b6391aa`.
- Production service: `raising-game-demo` is `active`.
- Production server-local health: `200 {"ok":true}`.
- Public verification: homepage `200`, `platform.config.js` `200`, and `https://123vips.com/api/health` `200 {"ok":true}`.
- Production asset includes the Lite capability flags hiding unsupported Generate Mode and Quality Mode controls.
- Live release was not deployed.

## Deployment rule

- Commit this phase to `old-site`, then:
  - `python3 scripts/build_release_snapshot.py --source old-site`
  - `scripts/deploy_local.sh --site old`
- Never deploy `old-site` directly. Do not deploy Live for this task.
- Do not print or commit `LOCAL_CREDENTIALS.md`.
- Business/runtime data remains PostgreSQL-only.
