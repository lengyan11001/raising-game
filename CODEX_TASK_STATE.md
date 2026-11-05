# Codex Task State

## Current issue (2026-11-05)

- User saw `Available balance: -2.835 credits, Minimum required: 0 credits`.
- Root cause: MuleRouter upstream account balance, not the platform user wallet. Platform balance was 2513.8044 credits; the failed request pre-deducted 35 and refunded 35 exactly once.
- User explicitly rejected automatic provider fallback. Do not add fallback or change MuleRouter routing for this issue.
- Fix implemented in `mulerouter-aliyun.js`: upstream balance failures are normalized to `MULEROUTER_UPSTREAM_BALANCE_UNAVAILABLE` with a Chinese message stating MuleRouter is negative, the platform deduction is refunded, and it is not the user's platform balance.
- Regression test: `test/mulerouter-balance.test.js` (2 pass).
- Targeted regression suite: 58 pass, 0 fail.
- Full suite currently has unrelated existing UI-source failures (22); do not attribute them to this fix without targeted evidence.
This file is the durable handoff for this task. After compaction, read this file first.

## Current live verification

- Draft-to-Final bug fixed locally: stale `draftTaskId` / `draft_followup` from browser, template, or record state is normalized before pricing or upstream submission.
- Lite requests with prompt or media are always treated as ordinary generation; stale draft state is discarded and `draft_task_id` is never sent.
- Draft-only Lite intent is rejected explicitly with `DRAFT_UNSUPPORTED` before credentials, charging, or upstream submission.
- Regression suite: 54 pass, 0 fail. Syntax checks and `git diff --check` pass.
- Production deployment is complete on `123vips.com` only; Live was not deployed.
- Production verification request `cgt-20261105014851-6a45f4` included a stale `draftTaskId` and generated an ordinary Vega 1.5 Lite task.
- It returned HTTP 200, reached upstream task `1524935253-AigcVideoTask-6d6fdc965814ceba1ec5171c3cc362b5t`, and finished at 100% with a video URL.
- The persisted request had `draftTaskId=""`, and upstream `ExtInfo` contained no `draft_task_id`.

- Production `/etc/raising-game-demo.env` now has the Tencent VOD international credentials supplied by the user. Values are intentionally not recorded here.
- VOD credentials were verified against `DescribeSubAppIds` on the international host; the account returned one application.
- Real Vega 1.5 Lite 720P / 4-second text-to-video tasks completed successfully.
- Successful test task IDs:
  - `1524935253-AigcVideoTask-6c72d17c36d7390bc113b180f3abfaaft` (with `EnhancePromptMode=enable`)
  - `1524935253-AigcVideoTask-87f79f53e45b8865dc811fd6670bb00bt` (no ExtInfo)
- Output URLs were returned by `DescribeTaskDetail`; video generation is live.
- Upstream rejects `GenerateMode` and `VideoQualityMode` for `1.5-lite`, despite the generic Lite guide listing them. The backend now omits both for Lite and the UI hides those unsupported controls for Lite.

## Active request

- Vega 1.5 Lite (`h3-vega`) international pricing is configured and deployed.
- Sale prices are upstream international USD per second × 1.5, converted at 1 USD = 100 credits.
- Both output-video seconds and reference input-video seconds are billed separately.
- Vega Pro remains disabled/fail-closed.

## Decisions

- Lite output sale prices (credits/second): `480p=6.75`, `720p=13.5`, `1080p=27`, `2k=32.4`, `4k=38.88`.
- Lite reference input-video sale prices (credits/second): `480p=6.75`, `720p=13.5`, `1080p=27`, `2k=27`, `4k=27`.
- Backoffice exposes five output rows and five `+ Video` input rows.
- Pricing is evaluated before credentials, media transport, charging, or upstream submission.
- Missing input-video pricing fails closed with HTTP 422 if a reference video is present.
- Vega Pro remains fail-closed behind its existing pricing-unavailable guard.
- Tencent VOD integration targets the international site only:
  - Host: `vod.intl.tencentcloudapi.com`
  - Default region: `ap-singapore`
  - Mainland host `vod.tencentcloudapi.com` and default region `ap-guangzhou` must not be used.

## Changed files

```text
tencent-vod-vega.js
server.parts/part-01.js
server.parts/part-26.js
server.parts/part-29.js
server.parts/part-43.js
platform.create.parts/part-01.js
platform.create.parts/part-03.js
platform.create.parts/part-04.js
test/advanced-pricing.test.js
test/tencent-vod-vega.test.js
CODEX_TASK_STATE.md
```

## Verification

- `node --require ./test/source-compat.js --test test/advanced-pricing.test.js test/tencent-vod-vega.test.js test/source-split.test.js`: 51 pass, 0 fail.
- `node --check server.js`, `node --check platform.config.js`, `node --check platform.ui.js`, `node --check platform.create.js`, and `git diff --check`: passed.
- Production PostgreSQL `app_kv.app_config` now explicitly contains all 10 Lite output/input price rows.
- Production estimate without references: 720P × 6s = 81 credits.
- Production estimate with 3 reference-video seconds: output 81 + input 40.5 = 121.5 credits.
- Production `/api/health`: `200 {"ok":true}`.

## Deployment

- `old-site`: `eff6a18` (`Fix stale Vega draft state on Lite generation`), pushed to origin.
- `platform-release`: `3bfe80d`, built from `eff6a18`; pushed to origin with a lease-protected update.
- Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`.
- Production checkout: `/opt/raising-game-demo` at `3bfe80d93a6479ffdef06994cf0fbc368de7c156`.
- Production service: `raising-game-demo` is `active`.
- Live release was not deployed.

## Deployment rule

- Commit this phase to `old-site`, then:
  - `python3 scripts/build_release_snapshot.py --source old-site`
  - `scripts/deploy_local.sh --site old`
- Never deploy `old-site` directly. Do not deploy Live for this task.
- Do not print or commit `LOCAL_CREDENTIALS.md`.
- Business/runtime data remains PostgreSQL-only.

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
