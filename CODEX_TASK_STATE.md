# Codex Task State

This file is the durable handoff for this task. After compaction, read this file first.

## Active request

- Add **Vega 1.5 Lite** (`h3-vega`) sale-price configuration to the admin pricing page.
- Do not research or invent upstream pricing. Default all Lite sale prices to `0`; the user will set them in Backoffice.
- Generation must stay fail-closed until a positive sale price is configured.
- Do not enable/price Vega Pro and do not change Lite generation controls in this phase.

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

- `old-site`: `41fb846` (`Add Vega 1.5 Lite admin pricing rows`), pushed to origin.
- `platform-release`: `509b663`, built from `41fb846`; published with a lease-protected update.
- Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; release boundary audit passed and service restarted.
- Production `https://123vips.com/api/health`: 200 `{"ok":true}`.
- Production admin pricing API exists at `/api/admin/pricing` and returns 401 without login, as expected.
- Live release was not deployed.

## Deployment rule

- Commit this phase to `old-site`, then:
  - `python3 scripts/build_release_snapshot.py --source old-site`
  - `scripts/deploy_local.sh --site old`
- Never deploy `old-site` directly. Do not deploy Live for this task.
- Do not print or commit `LOCAL_CREDENTIALS.md`.
- Business/runtime data remains PostgreSQL-only.
