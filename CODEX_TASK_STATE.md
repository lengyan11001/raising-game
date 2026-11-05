# Codex Task State

## Vega 1.0 Lite button cost hotfix (2026-11-05)

- User reported Vega 1.5 Lite 1080P × 6s = 162 credits and Vega 1.0 Lite 1080P × 6s = 300 credits.
- Root cause: browser-side `normalizeAdvancedProvider()` did not recognize `vega10-lite` / `vega1.0lite`, so it fell through to Seedance. Seedance 1080P at 60 credits/sec × forced 5s explained the incorrect 300.
- Fixed `platform.ui.parts/part-02.js` to preserve Vega 1.0 Lite provider identity before Seedance normalization.
- Fixed `platform.main.js` resolution-choice click handler to call `updateAdvancedButtonCost()` after changing resolution.
- Backend pricing is correct: Vega 1.5 Lite (`h3-vega`) 1080P × 6s = 162 credits; Vega 1.0 Lite (`vega10-lite`) 1080P × 6s = 69.21 credits.
- Regression coverage added in `test/vega-pricing-label.test.js` and `test/advanced-pricing.test.js`.
- Targeted tests: 64 pass, 0 fail. `node --check` and `git diff --check` pass.
- Deployment status: pending release snapshot and `scripts/deploy_local.sh --site old` after committing this hotfix.

## API docs unlock removal (2026-11-05)

- Goal: remove the $1,000 API-documentation unlock gate from the main site so everyone can view API documentation; external API calls still require authentication and the tenant API-access feature flag.
- Backend: removed `API_DOCS_PRICE_USD` / `API_DOCS_TEST_CREDITS`; public docs endpoints no longer require login or purchase; external API token/subtoken requests no longer check the paid entitlement; removed new API-doc product purchase paths from billing/manual/PayPal flows.
- Frontend: removed the $1,000 unlock card and entitlement gating from API docs, token controls, subtoken controls, account menu, and referral commission copy. Token management still requires login.
- Admin: removed the obsolete API-doc entitlement toggle/status from user management.
- Historical settlement code remains only for backward compatibility with pre-existing product orders.
- Verification: syntax checks pass; targeted `membership-entitlements`, `subtoken-user-view`, and `source-split` tests pass 12/12.
- Commit: `e2bc778` on `old-site`, pushed to origin.
- Release: `platform-release` `142ab6c`, built from `e2bc778`, pushed to origin and deployed to `123vips.com` only.
- Production verification: health `200 {"ok":true}`; `/docs/api.json` public `200` with 23 sections / 5 groups; `/api/models` public `200`; deployed `platform.html` contains `apiDocsUnlockedContent` and no purchase card / `Unlock docs` / `$1,000`; deployed copy has no retired referral API-doc commission entries.
- Live was not deployed.

## Vega 1.0 Lite integration (2026-11-05)

- Integration commit `b1eeea1` adds provider `vega10-lite` (`wand-vega-video / 1.0-lite`) with text, first frame, last frame, first+last frame, and multimodal reference modes; resolutions 480P/768P/1080P/2K/4K; duration 4-15 seconds without smart duration.
- Limits: 9 images, 3 videos, 3 audios, 12 assets total; each video/audio 2-15 seconds; total video/audio each <=15 seconds; audio requires image/video input; prompt max 7000 characters. Draft-to-final and return-last-frame are unsupported.
- International Tencent VOD only (`vod.intl.tencentcloudapi.com`, `ap-singapore`).
- Default prices in `server.parts/part-01.js`: output and input-video USD/second x1.5 x100 = 6.855 / 8.655 / 11.535 / 14.43 / 17.31 credits; extra reference image after first 5 = 4.5 credits.
- Fixed admin/public pricing view bug: `768P` and the extra-reference-image row were collapsing to 0 during whole-table save. The view now preserves Vega 1.0 Lite-specific rate keys; regression added in `test/advanced-pricing.test.js`.
- Tests for the integration and view fix: 62 pass, 0 fail (`advanced-pricing`, `vega-pricing-label`, `tencent-vod-vega`).
- Production pricing persisted through authenticated `/api/admin/pricing` into PostgreSQL `app_kv.app_config.platform.advancedPricing`; all 11 Vega 1.0 Lite rows exist.
- Production fix release `7f99e8c` was built from integration `711e328`, pushed to `platform-release`, and deployed to `123vips.com`; service active and health OK. Live was not deployed.
- Production admin pricing GET verified all 11 Vega 1.0 Lite rows numerically: 480P 6.855, 768P 8.655, 1080P 11.535, 2K 14.43, 4K 17.31; input-video rows match; extra reference image after 5 is 4.5 credits.
- Production real generation verified end to end on 2026-11-05: `cgt-20261105113839-bad741` / upstream `1524935253-AigcVideoTask-d335d5f9fcf1376c6a3f469bc168746ct`, text-to-video 480P x 4s, terminal `succeeded`, video URL present, billing settled at 27.42 credits.

## Vega Lite pricing label fix (deployed, 2026-11-05)

- Commit `acd4a5a` fixes `platform.ui.parts/part-04.js`: pending estimates show `Checking cost...`; successful estimates show actual credits/duration/resolution; only matching failures show server error text. No fabricated `pricing unavailable` / `pricing is not configured` while an estimate is pending.
- Stale estimate responses are ignored via matching pending-key guards.
- Regression: `test/vega-pricing-label.test.js` plus `advanced-pricing` and `tencent-vod-vega` suites, 57 pass, 0 fail.
- Included in production release `159c6dc` on `123vips.com`. Production asset contains the new guards; `/api/advanced/estimate` for Vega Lite 720P × 6s returns 81 credits; `/api/health` is OK. Live was not deployed.

## Current issue (2026-11-05): Admin generation records slow for specific user

- User reports querying all generation records is fast, but filtering by a specific user is slow.
- Root cause: exact user searches still ran through a large LOWER(CONCAT_WS(...)) LIKE scan over record payloads; the list also loaded full request/response JSON and ran unnecessary total counts.
- Fix in `db.js` `getAdminGenerationRecordsPageFromDb()`:
  - Resolve exact user ID/username first and query the indexed `records.payload->>'userId'` predicate.
  - Resolve full task ID through the primary key.
  - Keep broad fuzzy search only as fallback.
  - Select only list/thumbnail-needed payload fields; heavy details remain available through the click-time detail endpoint.
  - Use one windowed page query for filtered count instead of a full-table total count.
  - Stable order `created_at DESC, task_id DESC` so the existing `(payload->>'userId', created_at DESC)` index is usable.
- Detail flow remains click-time in `admin.js` / `server.parts/part-41.js`; list is one lightweight page.
- New regression test: `test/admin-generation-records-list.test.js`.
- Verification: `node --require ./test/source-compat.js --test test/admin-generation-records-list.test.js test/generation-record-list-refresh.test.js test/history-pagination.test.js test/source-split.test.js` => 21 pass, 0 fail. `node --check db.js` and `git diff --check` pass.
- Existing unrelated failure remains in `test/media-inputs.test.js` for the Seedance 2.5 dedupe source assertion; it predates this change and is not part of the deployed diff.
- Deployment status (2026-11-05): committed `e71f46e` on `old-site`; rebuilt `platform-release` as `159c6dc` (includes remote Vega pricing fix `acd4a5a`) and pushed with lease protection.
- Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; production checkout `159c6dc`, service active, `/api/health` 200. Live was not deployed.
- Unauthenticated admin API probe correctly returned 401; authenticated timing must be measured in the admin browser session.

## Current issue (2026-11-05)

- User saw `Available balance: -2.835 credits, Minimum required: 0 credits`.
- Root cause: MuleRouter upstream account balance, not the platform user wallet. Platform balance was 2513.8044 credits; the failed request pre-deducted 35 and refunded 35 exactly once.
- User explicitly rejected automatic provider fallback. Do not add fallback or change MuleRouter routing for this issue.
- Fix implemented in `mulerouter-aliyun.js`: upstream balance failures are normalized to `MULEROUTER_UPSTREAM_BALANCE_UNAVAILABLE` with a Chinese message stating MuleRouter is negative, the platform deduction is refunded, and it is not the user's platform balance.
- Regression test: `test/mulerouter-balance.test.js` (2 pass).
- Targeted regression suite: 58 pass, 0 fail.
- Full suite currently has unrelated existing UI-source failures (22); do not attribute them to this fix without targeted evidence.
- Deployed only `123vips.com`; production checkout `7f4eb18`.
- Production live probe hit MuleRouter and returned:
  `MULEROUTER_UPSTREAM_BALANCE_UNAVAILABLE`, status 503, availableBalance `-2.835`, minimumRequired `0`.
- Probe did not create a task, did not charge platform credits, and did not change MuleRouter routing.
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

## Diagnosis (2026-11-05): cgt-20261105092021-4b09c0

- Upstream Tencent VOD task: `1524935253-AigcVideoTask-a02321d6a8d0b6f5417a8ce3835b775ft`.
- Upstream status: `FINISH`, task err code `70000`, ext code `InvalidParameter.ViolationContent`.
- Message: `task failed with status: FAIL, message: Input Prompt violates policy`.
- Failure occurred 21 seconds after creation; it is an upstream content-policy rejection, not an API/parameter or model availability failure.
- Pricing was 1080P x 6s = 162 credits. `app_credit_ledger` contains the 162 deduction but no `generation_refund` entry for this task.
- Current failed record still has `billingStatus: pre_deducted` and `finalCredits: 0`. Existing `needsSeedanceFailureRefund()` requires `finalCredits > 0`, so it does not trigger on this already-zeroed failed record. This is a real refund-repair gap, separate from the upstream rejection.
