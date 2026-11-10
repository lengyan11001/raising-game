## 2026-11-10 PostgreSQL stale-submit index predicate + media pending scan (deployed Old)

- Commit/release: `725e299` / `e975126` initially deployed the stale-submit partial index. Follow-up commit makes the query predicate match the partial index exactly (`payload->>'awaitingUpstreamTask' = 'true'`), because `COALESCE(...)` prevented index use and still caused a 2.8-3.3s full table scan.
- Added `app_generation_records_advanced_download_pending_idx` for `advancedDownloadStatus IN ('preparing','queued','processing')`; production `EXPLAIN ANALYZE` dropped failed-media sync from ~1.13s / 146k buffers to ~4ms / 366 buffers (index scan).
- Production maintenance: `VACUUM (ANALYZE)` on generation, workflow canvas, and credit ledger; per-table autovacuum thresholds generation/ledger/canvas 0.05, wallet orders 0.10; `log_min_duration_statement=1000ms`, `log_lock_waits=on`.
- Verification: focused auth/refund/generation/media/notification suite 112/112; health 200; service active, NRestarts=0; sessions 947 and expired 0 (no sessions/users evicted); DB ~724MB, 0 idle-in-transaction, 0 lock waiters.
- Capacity: 4 vCPU / 7.1GiB RAM, load 0.56, swap 0, disk 57%; PostgreSQL 16.15, max_connections=100, shared_buffers=128MB, effective_cache_size=4GB. No server upgrade justified now.
- Refund audit: today's 62 failed generations all have refund status; timeout groups predate the fixes; no new charged-but-not-refunded case. The previously reconciled `img-20261110122402-fcedf9` must not be touched again.
- Deploy Old only via `scripts/deploy_local.sh --site old`; never deploy Live in this task.

## 2026-11-10 auth/me single-user summary cleanup (ready for Old deployment)

- Goal: remove the remaining full-database snapshot from the frequently polled authenticated `/api/auth/me` and `/api/companion/level` paths while preserving companion level and profile statistics.
- Code: `getUserAuthSummaryFromDb()` reads only the current user's paid wallet orders, active characters, and gift ledger rows in one aggregate query. `/api/auth/me` and `/api/companion/level` authenticate with `loadDb:false`, then hydrate that bounded summary. No session, account, balance, or media record is changed.
- Verification: refund/generation/auth/companion focused suite passes 48/48; targeted syntax checks and `git diff --check` pass.

## 2026-11-10 auth path database hotspot cleanup (deployed Old)

- Goal: remove full-database snapshots from normal email, Google, and Telegram authentication while preserving all existing sessions and password login for legacy users.
- Code: `server.parts/part-32.js` no longer calls `readDb()` for DB-backed existing-user auth. Email, password reset, email binding, Google, and Telegram paths use indexed single-user lookups; registration allocates usernames via indexed uniqueness checks.
- Safety: Google first-user admin detection now uses `hasAnyActiveUserInDb()` (`SELECT EXISTS`) instead of a loaded user count, preventing a lightweight auth object from incorrectly granting admin.
- Verification: focused refund/generation/auth suite passes 40/40; targeted syntax checks pass.
- Publish scope: `db.js`, `server.parts/part-01.js`, `server.parts/part-32.js`, `test/auth-risk.test.js`, this state entry. Exclude all unrelated WIP.
- Deployment verification: `platform-release=371a792`, service `active`, `NRestarts=0`, health 200, sessions unchanged at 946, and no pool timeout/error after 14:39 deployment. PostgreSQL was 1 active / 13 idle and host load was normal; no system upgrade required.

## 2026-11-10 repeated user/admin logout diagnosis and recovery (ready for Old deployment)

- Goal: determine why ordinary and admin accounts appeared to be logged out repeatedly, preserve valid sessions, and remove the database pressure amplifying the issue. Old only; do not deploy Live or bulk-expire/delete sessions.
- Production evidence: `app_sessions` had 946 rows and 0 expired rows; existing admin sessions were still present with `expires_at=NULL`. Sessions were not revoked. The observed logout was a client-side false negative during backend saturation.
- Root cause: PostgreSQL pool exhaustion (`PGPOOL_MAX=20`) produced `timeout exceeded when trying to connect`. Concurrent auth/session requests loaded the full application snapshot, including `app_user_assets` (~27,757 rows / 61 MB). Notification polling was the main load source: `/api/system-notifications` had 24,249 requests that day, including 9,719 HTTP 500 and 13,622 HTTP 499.
- Frontend amplification: admin bootstrap and user session restore previously deleted tokens on any request failure, including 5xx/502/timeouts. They now retain the token for transient failures and clear it only on explicit `401` / `LOGIN_REQUIRED` / `SESSION_REPLACED`.
- Backend mitigation: `getAuth()` supports `includeUserAssets:false`; `/api/auth/me` and companion-level use it; notification, support-ticket and Live-notification hot paths use `loadDb:false`. Added admin reconnect UI styles and regression assertions for these contracts.
- Verification: focused suites 54/54 pass; JS syntax checks pass. Production process `2416740` has been healthy since 14:30:48 CST and `/api/health` returns 200; the last recorded pool timeout was before that restart.
- Publish scope: `admin.css`, `test/auth-risk.test.js`, `test/support-notifications.test.js`, this state entry. The backend/session-token fixes are already in committed integration `f4d9f00`; unrelated model-picker/test/canvas WIP must not be staged.

## 2026-11-10 database safety, refund integrity, and pool pressure (ready for Old deployment)

- Goal: fix database-triggered production errors without evicting logged-in users, reverse only the confirmed bad 12-credit refund, tighten PostgreSQL settings, and deploy Old only.
- Confirmed production incident: `img-20261110122402-fcedf9` had `preDeductedCredits=12`, `billingStatus=refunded`, but no negative charge for that task. The only -12 row belonged to `img-20261110122038-dad671`. Original mistaken refund `ledger-4337e26bfcd7478c8be77d78` was preserved.
- Production data repair: inserted `ledger-reversal-img-20261110122402-fcedf9`, type `generation_refund_reversal`, delta -12, reason `refund-without-charge`; user balance is now `122646.630900`; generation billingStatus is `charge_not_found_reversed`. Idempotent fixed ledger ID.
- Code fix: `applyCreditDeltaInDb()` can require a same-task charge in the same transaction and rejects cumulative refunds exceeding that charge. `appendCreditLedger()` applies this to refund-like types; shared `refundCreditsWithSubtoken()` now uses the DB guard directly and no longer loads the full application snapshot.
- Pool pressure fix: system-notification read/list paths use `{ loadDb: false }`; Seedream task preparation uses `readGenerationJobDb(userId)` and latest user uses `getUserByIdInDb()`. Production snapshot was still the old code during inspection, so pool timeouts continued until deployment.
- PostgreSQL tuning: backup saved under `/root/postgresql*.bak-db-tuning-20261110-142722`; reloaded `work_mem=8MB`, `maintenance_work_mem=256MB`, `idle_in_transaction_session_timeout=30s`, `lock_timeout=5s`, `track_io_timing=on`. `max_connections` remains 100. Host is 4 vCPU/7.1GB/49GB and does not currently need a system upgrade.
- Verification: `refund-charge-guard`, `stalled-generation-repair`, `generation-db-scope`, and `auth-risk` tests pass 39/39; syntax checks and `git diff --check` pass.
- Publish scope: `db.js`, `server.parts/part-11.js`, `server.parts/part-12.js`, `server.parts/part-27.js`, `server.parts/part-33.js`, `test/refund-charge-guard.test.js`, this state entry. Exclude unrelated WIP files.

## 2026-11-10 unified messages entry + notification/admin loading performance (ready to deploy)

- Goal: remove duplicate top bell, bottom-right support FAB and old bottom-left support entry; keep one bottom-left **消息通知** entry that opens the existing notification panel; improve slow user notification and admin support-ticket loading.
- User UI: `platform.html`, `platform.config.js`, `platform.explore.js`, `platform.main.js`, `platform.css`. Top bell is retained hidden for compatibility; mobile bell and support FAB removed. Bottom-left entry opens `toggleNotificationPanel("nav")`, tracks `notification_open`, shares the same panel support card into ticket chat, and shows combined system/support unread dot.
- Loading UX: notification panel gets a skeleton and duplicate-request protection; panel opens immediately while data refreshes.
- Notification API: `/api/system-notifications` now calls `countUserSupportUnreadFromDb()` in parallel instead of loading up to 100 support tickets merely to sum unread counts.
- Support ticket SQL: replaced repeated correlated subqueries with one count lateral and one last-message lateral; removed `ARRAY_AGG` of all message bodies. Added message indexes for ticket/sender/time and sender/ticket/time.
- Ticket detail loading: read marker and message fetch run in parallel; mark-read returns the updated ticket directly. Admin switch detects `#ticketThread` so existing conversation stays visible and no full-screen loader flashes on each switch.
- Asset cache keys bumped to `notification-inbox-20261110-1`; cache-key assertions in `test/auth-risk.test.js` and `test/advanced-custom-ui.test.js` updated.
- Verification: support-notifications 7/7, telegram-bot 10/10, mobile-tool-ux 11/11, auth-risk + security-regressions 42/42; syntax checks and `git diff --check` pass. `advanced-custom-ui.test.js` has pre-existing unrelated failures when run alone (10 failed, affected by unrelated generated-source/advanced-model WIP); no notification assertion failed.
- Files for selective staging: `admin.js`, `db.js`, `platform.config.js`, `platform.css` (notification hunks only), `platform.explore.js`, `platform.html`, `platform.main.js`, `server.parts/part-01.js`, `server.parts/part-33.js`, `test/support-notifications.test.js`, `test/auth-risk.test.js`, `test/advanced-custom-ui.test.js`, this state entry.
- Unrelated WIP to exclude: `platform.create.parts/part-02.js`, `platform.ui.parts/part-02.js`, `test/platform-site-profile.test.js`, `platform.test-generate.css`, `test/platform-test-mode.test.js`, `workflow-react/dist/canvas.js.map`, `workflow-react/node_modules`.
- Final publish: `old-site` `bf70f2a`; `platform-release` `35f2bbb`; deployed Old only via `scripts/deploy_local.sh --site old`. Health `200 {"ok":true}`, service `raising-game-demo` active, production page shows only bottom-left `消息通知`; top bell hidden compatibility node, no support FAB or mobile bell. `live-release` remains `bf1e01a` and Live was not deployed.

## 2026-11-10 admin pricing deployment + model display config (deployed Old)

- User requested deploying the admin pricing work first, then configuring model display data before publishing the generate-page picker.
- Deployed only Old via `scripts/deploy_local.sh --site old`; source HEAD `085ed74`, release `platform-release` `8e362a2` (already equal to `origin/platform-release`). Admin pricing commit `ed0e3a7` is included.
- Production health `https://123vips.com/api/health` returned `200 {"ok":true}`; `raising-game-demo` active; served `admin.js` SHA-256 `2d6ddf8ed6f46b1de821a85515949d4364298f1680bcc647a786fad9889d87e4` matches release.
- Configured PostgreSQL `app_kv.app_config -> platform.advancedPricing.modelSettings` for display names/subtitles/discounts. Discounts remain `1`; purchase/base sale prices were not changed.
- Configured: `vega10-lite`=`h3（vega）`; `h3-vega`=`wan（vega）`; `seedance20-vega`=`seedance2.0（vega）`; `seedance25-vega`=`seedance2.5vega`; also disambiguated `seedance25` as `Seedance 2.5（官转）` and `seedance-nsfw` as `Seedance 2.5（NSFW）`.
- Config backup on Old: `/opt/raising-game-demo/.app_config.backup.1794291078295.json` (mode 0600).
- Verification: readback shows `updated_at=2026-11-10T06:11:18.272Z` and all six settings; no warning/error journal entries in the 5-minute post-write window.
- Rollback: previous Old release `origin/platform-release` before this deploy was `1e982d6`; if configuration-only rollback is needed restore the backup through PostgreSQL, not a file fallback. Live release remains untouched at `origin/live-release` `bf1e01a`.
- Unrelated platform picker/test/canvas WIP remains unstaged and unpublished.

## 2026-11-10 failed-refund ledger consistency hardening (ready to deploy)

- Root cause: several failure handlers marked `billingStatus=refunded` before the refund ledger write completed; a write error could leave a failed record showing refunded with no positive ledger entry.
- Added shared `refundCreditsWithSubtoken()` in `server.parts/part-12.js`; it returns `{ refunded, error }` and only reports success after the real credit ledger write succeeds.
- Hardened failure paths: Seedream 5, Qwen/Papaya/BytePlus text, Qwen Image 3, Z-Image, character image create/edit, Wan2.7 image edit, asset image modify, Wan2.7/Gateway polling, Vega submit, Seedance submit, and video-tool failure. Failed refunds now remain `pre_deducted` with `billingError`; free failures remain `free`.
- Added idempotent failed-refund audit/repair APIs in `server.parts/part-43.js` and `scripts/repair-stalled-generation-records.js --failed-refund-audit` (dry-run by default, targeted `--task-id`, allowlisted providers only).
- Production read-only audit found 40 bad refund records this month, 4 today (all Seedream 5): `img-20261110005317-0ce117` 12, `img-20261110104026-d66602` 12, `img-20261110122038-dad671` 12, `img-20261110125641-a2c325` 13. No production refund has been applied yet.
- Focused verification passed: 50/50 tests (`stalled-generation-repair`, auth risk, security regressions, generation DB scope, DB import scope); JS syntax and `git diff --check` passed. `test/tencent-vod-vega.test.js` now reads aggregate server source instead of the bootstrap shell.
- Unrelated platform CSS/UI/test WIP remains unstaged and must not enter this release.
- Next: selective commit on `old-site`, build/push `platform-release`, deploy Old only, then dry-run and apply the four targeted refunds, verify exactly one refund ledger each, and re-check health/auth/generation/session/logs.

## 2026-11-10 authentication DB pool optimization (ready to deploy)

- Goal: reduce PostgreSQL pool pressure across anonymous auth and credential login without invalidating existing sessions.
- Anonymous `getAuth()` now returns `lightweightAuthDb()` without loading ten tables; token-backed session validation is unchanged.
- Password login uses `getUserByUsernameInDb()` only. Existing-email login uses `getUserByVerifiedEmailInDb()`; full `readDb()` remains only for first-time email account creation and username uniqueness checks.
- Added `getSessionByUserDeviceInDb()` and `app_sessions_user_device_idx`; `createSingleLoginSession()` can recover/reuse a same-device session from DB without deleting other devices or forcing logout.
- Targeted files: `db.js`, `server.parts/part-01.js`, `server.parts/part-02.js`, `server.parts/part-12.js`, `server.parts/part-32.js`, `test/admin-password-reset.test.js`, `test/auth-risk.test.js`.
- Verification passed: syntax checks, `git diff --check`, and 49/49 focused tests (`admin-password-reset`, `auth-risk`, `security-regressions`, `generation-db-scope`, `db-import-scope`).
- Unrelated platform/test WIP remains unstaged and must not enter this release.
- Next: commit on `old-site`, build/push `platform-release` with lease protection, deploy Old only, and verify health/auth/generation/session/logs.

## 2026-11-10 Old deployment of current platform release (completed)

- Deployed `platform-release` `1ef6e48` (built from `old-site` `5616095`) to Old only with `scripts/deploy_local.sh --site old`.
- Deployment verification passed: `raising-game-demo.service` active (PID 2397458), `https://123vips.com/api/health` returned HTTP 200 `{"ok":true}`, release boundary check passed, and private media paths remained anonymously denied (404).
- Production serves support ticket and notification code: `platform.explore.js` contains `/api/system-notifications` and `/api/support/tickets` calls; `admin.js` contains `support-tickets` and `system-notifications` routes.
- Anonymous `/api/support/tickets` returned HTTP 401 `LOGIN_REQUIRED` as expected.
- This deploy used the committed release snapshot only. Local uncommitted model-picker/frontend WIP was not committed or published. `origin/live-release` was untouched and Live was not deployed.

## 2026-11-10 generation DB pool exhaustion optimization (implemented, verification in progress)

- Goal: prevent advanced generation jobs from consuming ten PostgreSQL pool connections by loading the full application snapshot.
- Changed generation preparation to `readGenerationJobDb(userId)`, which loads only the creating user and that user's own assets; gateway media preparation now reuses this scoped snapshot instead of re-running `readDb()`.
- Added `getUserAssetsForUserFromDb(userId)` using the existing `app_user_assets_user_created_idx`.
- Added the missing `listSystemNotificationsForUserFromDb` import that caused repeated `is not defined` errors in notification polling.
- Focused verification passed: `generation-db-scope`, support notifications, security regressions, media inputs, auth risk, advanced pricing, and generation record refresh (117 tests total, 0 failures). Syntax and `git diff --check` passed.
- Targeted files only: `db.js`, `server.parts/part-01.js`, `server.parts/part-02.js`, `server.parts/part-26.js`, `test/generation-db-scope.test.js`.

## 2026-11-10 user Xingfushenghuo22 failed-generation refund audit (read-only production query)

- User: `xingfushenghuo22` / `user-1781841880213-9f4b1c21`; current balance `14700.518400`.
- Today (Asia/Shanghai, through 12:11) has 15 generation records: 12 succeeded, 3 failed.
- All 3 failed records have `billingStatus=refunded`; each has exactly one negative charge and one equal positive `generation_refund` ledger entry, net zero:
  - `cgt-20261110014012-59cb86` 01:40:16, timeout connecting; charged/refunded 122.472.
  - `cgt-20261110015844-d9230a` 01:58:48, upstream copyright restriction; charged/refunded 81.648.
  - `cgt-20261110112205-79ac92` 11:22:06, upstream copyright restriction; charged/refunded 73.4832.
- Audit result: no missing refund found. No production mutation was performed.
- Root cause of `cgt-20261110014012-59cb86`: not an upstream Seedance timeout. App `pg` pool connection acquisition timed out after 5s at 01:40:23 while `runAdvancedGenerationJob` called `readDb`; stack ends at `db.js:1674 readAppDbFromTables Promise.all(index 8)` / `pg-pool/index.js:45`. It never submitted an upstream task (`upstreamTaskId`/`upstreamPayload` empty).
- That minute had app-wide DB pool saturation under concurrent traffic (`timeout exceeded when trying to connect` across notifications, generation-records, promo, advanced estimate/generate). `readDb` loads full `app_user_assets`/users/sessions/etc.; assets was 28,548 rows / 61 MB and had multiple concurrent full-table scans. System-notifications polls also hit a separate missing-function error during the same period.

## 2026-11-10 admin model pricing list/detail/config (in progress)

- Goal: pricing admin no longer renders every row at once; show a searchable model list, open one model's detailed purchase/base-sale/discounted-sale pricing, and configure display name, subtitle, and discount per model.
- Discount semantics: effective customer sale price = configured sale price x model discount (`0.9` = 90%); purchase price and configured base sale price are never discounted.
- Implemented in `admin.html`, `admin.css`, `admin.js`, `server.parts/part-02.js`, `server.parts/part-36.js`, `server.parts/part-37.js`, `server.parts/part-39.js`, `test/advanced-pricing.test.js`.
- Runtime/admin/public pricing expose `modelKey`, `modelDisplayName`, `modelSubtitle`, `modelDiscount`, configured sale, and effective sale. Persistence is `advancedPricing.modelSettings[key] = { displayName, subtitle, discount }` through the existing PostgreSQL-backed config.
- Model list search filters only the left list; card/detail/config click targets are scoped. Save preserves all pricing rows and all model settings; editable purchase values are read only from the active detail panel.
- Verification: focused `advanced-pricing.test.js` 27/27 and `advanced-pricing + platform-site-profile` 45/45; changed JS syntax checks and `git diff --check` pass. Full `npm test` currently has unrelated workspace WIP failures (34/956, including Test-mode and prompt-editor source assertions); not a pricing regression.
- Frontend generate-page model picker changes are retained locally in `platform.create.parts/part-02.js`, `platform.ui.parts/part-02.js`, `platform.css`, and `test/platform-site-profile.test.js` but must not be committed or published with the admin-only pricing release.
- Git: no commit/release/deploy yet this step. Old only when approved; Live untouched.

## 2026-11-09 Seedream/Qwen image pricing raised to 1.5x
- Goal: keep purchase prices unchanged and raise sale prices to 1.5x for Seedream 5.0 Pro (1K/2K/reference), Qwen Image 3.0 Pro (1K/2K/reference), and Qwen Image 3.0 Standard (1K/2K/reference).
- Changed: `server.parts/part-01.js`, `server.parts/part-02.js`, `server.parts/part-39.js`, `test/advanced-pricing.test.js`.
- Defaults now apply `SEEDREAM_QWEN_IMAGE_SALE_MARKUP = 1.5`; normalization migrates only exact legacy sale values equal to purchase, preserving custom configured prices. Admin display now consistently uses configured sale prices rather than substituting gateway purchase values.
- New prices: Seedream 5.0 Pro 1K 0.0675 / 2K 0.135 / reference 0.0045; Qwen Image 3.0 Pro 1K 0.05157 / 2K 0.103142 / reference 0.004125; Qwen Image 3.0 Standard 1K 0.037131 / 2K 0.037131 / reference 0.004125.
- Verification: focused pricing suites 49/49 pass; syntax and `git diff --check` pass; audit shows all 9 target rows `OK` at approximately 1.5x (Qwen Pro 2K is 1.500007x due to six-decimal storage rounding).
- Deployment completed: source `6271076`; `platform-release` / `origin/platform-release` `f6a08d8`; deployed Old only via `scripts/deploy_local.sh --site old`. Production `/api/health` returned 200 `{"ok":true}`. Rollback release `7e957b8`. Live was not updated or deployed.

## 2026-11-09 Monthly recharge and consumption report (read-only production query)

- User requested natural-month platform recharge/consumption reporting. Date boundary uses `Asia/Shanghai`; recharge order month uses `paidAt -> matchedAt -> updated_at -> created_at`; consumption uses `app_credit_ledger.created_at`.
- Results (2026): Aug recharge USD 150.02 / 4 payers / 17,000 credits, net consumption 462,250.19; Sep USD 1,419.00 / 34 / 132,000, net consumption 790,778.83; Oct USD 8,804.90 / 112 / 950,500, net consumption 1,493,060.43; Nov through Nov 9 USD 9,159.30 / about 109 / 1,042,950, net consumption 822,412.05.
- `admin_credit_add` grants are excluded from customer recharge: Aug 507,875; Sep 855,900; Oct 1,006,300.
- User supplied operating margin: Aug 30%, Sep and Oct 15%. Applying those rates gives implied gross profit USD 45.01 / 212.85 / 1,320.74 and COGS USD 105.01 / 1,206.15 / 7,484.16.
- Database lacks auditable platform-wide supplier invoices/COGS. Seedance 2.5 NSFW token-cost proxy only: Aug revenue 72,111.38 credits vs upstream base 55,432.79 (23.1%); Sep 255,032.38 vs 182,644.50 (28.4%); Oct 497,300.16 vs 361,123.04 (27.4%). Do not treat this SKU proxy as full-platform margin.
- No code changes or deployment. Production access was read-only via the repository deployment credentials; no secrets were printed.

## 2026-11-09 Chrome prompt video paste routing fix (deployed to Old)
- User report: Chrome prompt editor could paste images, not videos.
- Root cause: paste handling only uploaded video for Vega providers; normal Seedance media paste was prevented by the editor but video files were silently dropped. URL uploads also routed non-Vega video through `/api/advanced/transient-media`, which only accepts Vega Lite. Chrome clipboard videos may have empty MIME, making the data URL `application/octet-stream`.
- Fix: all applicable providers now accept pasted video files/URLs; normal Seedance and Vega Pro use `/api/user-assets`; Vega Lite uses `/api/advanced/transient-media`; MIME is promoted from the filename; document-level paste capture now follows `composedPath()` / ancestor / shadow host instead of relying only on `target.closest()`.
- Verification: `tencent-vod-vega.test.js` + `prompt-editor.test.js` 81/81; focused paste tests 4/4; syntax and `git diff --check` pass.
- Source commit: `50871d8`. Release commit: `4a5484ac734a1cb4c79bf0a6499ea746bbfd83ce`; deployed Old only. Production HTML entry version `afca6f6c063a`; CSS version `chrome-video-paste-20261109-3`; production part-03 and prompt-editor contain the new routing/capture code.
- Rollback release: `6fa69e1` (previous platform release). Live was not pushed or deployed.

## 2026-11-09 Opaque Chrome clipboard video paste fix (deployed to Old)
- Root cause: Chrome clipboard video files can have an empty `File.type`; `FileReader` then emits `data:application/octet-stream`, causing `/api/user-assets` to classify the upload by document extension instead of video.
- Fix: `readMediaFileAsDataUrl()` promotes generic/empty data-URL MIME to `uploadedFileMime(file)` (for example `.mp4` -> `video/mp4`). Pro/Lite video and audio upload paths now use it; image compression remains unchanged. Video paste also explicitly rerenders the asset list after upload.
- Clipboard handling keeps the synchronous `navigator.clipboard.read()` prefetch, recognizes empty `kind`/`type` clipboard items, and prevents ProseMirror from consuming media pastes.
- Verification: `tencent-vod-vega.test.js` 72/72 pass; focused prompt-paste tests 3/3 pass; changed JS syntax checks and `git diff --check` pass. Broader combined suite still has pre-existing unrelated failures (`isVegaProviderId` fixture issue etc.).
- Release: source `old-site` `c905eb2`; `platform-release` / `origin/platform-release` = `6fa69e1`; deployed to Old only. Production `/api/health` 200, HTML loads `platform.js?v=e759edda98ca`, and production `part-03.js` / `part-02.js` contain the MIME promotion fix.
- Rollback: previous platform release `5586d19` (source `5267277`). `origin/live-release` remains `bf1e01a`; Live was not pushed or deployed.

## 2026-11-09 Safari prompt image/video paste cache-bust follow-up (deployed to Old)
- User still reported image/video paste failing after the prior release. Production had the correct source hashes, but the HTML still referenced `platform.js?v=result-media-20261109-1`, and that URL was served as `public, max-age=31536000, immutable` with a Cloudflare HIT. The versioned URL is inherited by every child chunk, so Safari could keep executing stale `platform.prompt-editor.js` / `platform.create.parts/part-03.js` from local immutable HTTP cache.
- Cache fix: `platform.html` now loads the generated current build version (`platform.js?v=14226eccd72a` in production) and `platform.prompt-editor.css?v=safari-paste-20261109-2`. `platform-sw.js` navigation and platform chunk fetches now explicitly use `cache: "no-cache"`.
- Safari clipboard fix: paste now takes a synchronous snapshot of media files, HTML/URL candidates, and media-like clipboard types inside the paste dispatch. Upload work still runs asynchronously, but no longer rereads the expired `ClipboardEvent` in a microtask. Added capture listeners directly on the rich editor and mount; document capture remains as backup.
- Safari clipboard fallback now recognizes direct MIME clipboard types and reads `text/uri-list`, `text/html`, `text/plain` through `ClipboardItem.getType()` from both the paste items and `navigator.clipboard.read()`.
- Verification: `test/prompt-editor.test.js`, `test/tencent-vod-vega.test.js`, and `test/platform-refresh-performance.test.js` passed 92/92; all changed JS passed `node --check`; `git diff --check` passed.
- Release: source `old-site` `32c75f4`; `platform-release` / `origin/platform-release` = `a7a3108`; deployed to Old only. Production `/api/health` 200, HTML loads `platform.js?v=14226eccd72a`, and remote SHA-256 matches local for `platform.js`, `platform.prompt-editor.js`, `platform.create.parts/part-03.js`, and `platform-sw.js`.
- Rollback: tag `rollback-platform-before-safari-cache-bump-20261109` -> `35dccfe` (previous deployed Old release). `origin/live-release` remains `bf1e01a`; Live was not pushed or deployed.
- Remaining verification: needs one real Safari copy-image/copy-video test after fully closing/reopening the page (or clearing website data once). Existing open tabs can still keep the old document until reloaded.


## 2026-11-09 Safari prompt image/video paste prior attempt (superseded)
- Follow-up to the user report that text paste works but image/video paste still fails in Safari.
- `platform.prompt-editor.js` now captures `paste` at document level in the capture phase, scoped to `#advancedPromptEditorMount`, before ProseMirror handles the same event.
- `handleAdvancedPromptPaste()` is intentionally synchronous for ownership detection. When the clipboard looks like media it synchronously calls `preventDefault()` and returns `true`, so ProseMirror/Safari cannot consume the event while async uploads are still starting.
- Same-event de-duplication uses `advancedPromptPasteEvents = new WeakSet()` rather than a boolean lock; consecutive paste events are not dropped while an earlier upload is pending.
- Paste extraction supports `clipboardData.items`, `clipboardData.files`, HTML `<img>/<video>/<audio>/<source>` plus `poster`/`srcset`, CSS `url(...)`, `text/uri-list`, and HTTP(S)/data/blob URLs in plain text. Safari's hidden media path falls back to `navigator.clipboard.read()` and `item.getType()`.
- Model-aware routing is unchanged: Vega Pro models use `/api/user-assets` and `asset://...`; Vega Lite models use `/api/advanced/transient-media` and public HTTP(S) URLs, without creating user-asset rows.
- `/api/advanced/transient-media` now also accepts a remote `url`, downloads into a bounded Buffer, validates MIME/kind/size, and uploads to object storage without creating a media-library record.
- Legacy textarea paste remains routed through the same synchronous handler, with `Promise.resolve(...)` only for async error reporting.
- Verification: `test/prompt-editor.test.js` + `test/tencent-vod-vega.test.js` passed 81/81; the two focused Safari clipboard tests passed 2/2; `node --check` passed for all changed JS files including `platform.main.js`; `git diff --check` passed.
- Deployed to Old only: source `old-site` `f5c1924`; release `platform-release` / `origin/platform-release` = `35dccfe`. `origin/live-release` remains `bf1e01a` and was not pushed or deployed.
- Post-deploy health: `/api/health` returned `200 {"ok":true}`, `raising-game-demo` active, and HTTP SHA-256 hashes match local for `platform.prompt-editor.js`, `platform.create.parts/part-03.js`, and `platform.main.js`.
- Immediate rollback: tag `rollback-platform-before-safari-html-paste-20261109` points to previous release `920cdd3`.

## 2026-11-09 Prompt image/video paste fix (current deployment)
- Deployed to Old only: source `old-site` `47574a4`; release snapshot `platform-release` / `origin/platform-release` = `c827a8a`. Live is untouched at `origin/live-release` = `bf1e01a`; do not push or deploy Live without a separate request.
- Post-deploy health: `/api/health` returned `200 {"ok":true}`, `raising-game-demo` is active, and no warning/error journal entries appeared after deployment. Live HTTP hashes match local for `platform.create.parts/part-03.js` and `vendor/vipeak-prompt-editor.js`.
- Immediate rollback: tag `rollback-platform-before-prompt-paste-20261109` points to previous release `a5eb8d7`. The older Vega Pro baseline tag `rollback-platform-before-vega-pro-20261109` remains at `b0a21ab`.
- Earlier Vega Pro 1.0 / 1.5 release source was `old-site` `e1055d8`, release `a5eb8d7`. A local-only source commit `c4d384e` changes media durability test assertions and state notes, not production routing.
- Test workspace is excluded from this release: `platform.test-generate.css`, `test/platform-test-mode.test.js`, and `workflow-react/dist/canvas.js.map` remain untracked and must not be committed. Test CSS was removed from platform deploy/sync lists; no active Test navigation route remains.
- Vega Pro routes: `seedance20-vega` -> Vega 1.0 Pro, `seedance25-vega` -> Vega 1.5 Pro; both use `/api/user-assets` and submit `asset://asset-...` references. Lite routing was not changed: `vega10-lite` / `h3-vega` use `/api/advanced/transient-media` public HTTP(S) URLs and must not create user-asset rows.
- Reference limits: `seedance20-vega` 9 images / 3 videos / 3 audios / 12 total; `seedance25-vega` 30 / 10 / 10 / 50; `vega10-lite` 9 / 3 / 3 / 12; `h3-vega` 10 / 5 / 5 / 20.
- Generated media contract is now durable PostgreSQL metadata + object storage only. Video/poster/image work uses disposable OS temp workspaces; local paths are cleared and temporary workspaces are removed. `part-31/38/40` only propagate storage metadata through refresh paths and are part of this release.
- Verification: Vega/media regression suite 142/142 passed; all changed server/platform JS files pass `node --check`; `git diff --check` passed.

## 2026-11-09 Prompt image/video paste fix (pending deployment)
- User report: text paste works in the generation prompt editor, but pasted images and videos do not.
- Root cause: the rich prompt editor consumed paste events while the platform extractor only read `clipboardData.items` and only accepted `image/*`; Safari/Finder commonly exposes pasted media through `clipboardData.files`, and video was filtered out entirely.
- Fixed `pastedMediaFilesFromEvent()` to merge `items` and `files`, accept image/video/audio, and deduplicate by MIME/name/size/lastModified. The rich editor now leaves media paste to the platform handler and preserves normal plain-text paste.
- Vega image paste keeps model-aware routing: Pro uses `/api/user-assets` then `asset://`; Lite uses transient public HTTP(S). Vega video paste now uses the same Pro/Lite split, enforces per-model video limits, and shows a clear message when unsupported or full.
- Verification: focused paste tests 5/5 and complete `test/tencent-vod-vega.test.js` 70/70 pass; `node --check` and `git diff --check` pass. Committed as `47574a4`, deployed to Old as release `c827a8a`.

## 2026-11-09 Local Vega verification guidance (current)
- Focused local verification confirmed: `node --check test/tencent-vod-vega.test.js`, Vega media suite 69/69, Vega regeneration media suite 19/19, and `git diff --check` all pass.
- Full local browser generation is not currently runnable on this machine: `.env.local` is absent, `DATABASE_URL` is unset, and neither `psql` nor `docker` is installed.
- Browser-level verification requires PostgreSQL with seeded required catalogs, object storage with a public base URL, and Tencent VOD/upstream credentials. Startup is `npm start` on `127.0.0.1:4174`; Advanced UI is `http://127.0.0.1:4174/platform.html#advanced`.
- Expected routing remains: Vega Pro models use `/api/user-assets` then `asset://`; Vega Lite models use `/api/advanced/transient-media` and public HTTP(S) only, with no asset-library rows.

## 2026-11-09 Vega Pro prompt-paste media resolution (current)
- Root cause: pasted images were stored as `data:image/...` only, bypassing the normal `/api/user-assets` upload and Vega `asset://` resolution. Vega Pro then rejected the submit source with `Vega Pro requires a public HTTP(S) URL or an existing asset:// URI.`
- Fixed `handleAdvancedPromptPaste()` so Vega providers upload each pasted image via `uploadAdvancedImageReference()`, resolve it via `resolveAdvancedVegaAsset()`, and apply it through `applyAdvancedVegaSelection()`. Non-Vega/Lite paste behavior is unchanged.
- Vega first/last-frame modes now map paste into the available frame slots; Vega reference mode enforces each model's image limit from `vegaReferenceLimits()`. Added regression coverage for the upload/resolve/apply flow and the non-Vega fallback.
- Verification: focused paste tests pass 3/3; Vega regression suite passes 84/84; `node --check` and `git diff --check` pass.
- Not committed, built, or deployed.

## 2026-11-09 Vega media upload location audit (current)
- Audited every generation-page media entry: main multimodal upload, Seedance first/last frame, Wan first/last frame, Wan reference clip, asset-panel upload, prompt paste, and existing asset-library selection.
- Vega Pro `seedance20-vega` / `seedance25-vega`: media library via `/api/user-assets`, then Vega resolution to `asset://`; existing library assets resolve directly.
- Vega Lite `vega10-lite` / `h3-vega`: `/api/advanced/transient-media`, public object-storage URL only, no user-asset/library row; existing library assets reuse a public URL and resolve only when that URL is unavailable.
- Non-Vega main upload, frame controls, reference clip, asset panel, prompt paste, and library selection retain their original paths. Global asset library, legacy template image, workflow/explore/video-tool flows, and Playflux provider selection do not expose Vega providers.
- Model reference limits: `seedance20-vega` and `vega10-lite` 9 images / 3 videos / 3 audios / 12 total; `seedance25-vega` 30 / 10 / 10 / 50; `h3-vega` 10 / 5 / 5 / 20.
- Verification: focused Vega media suite 69/69 and regeneration media suite 19/19 pass; `node --check` and `git diff --check` pass. Broader existing UI/video-tool suites remain red on unrelated stale test stubs/assertions. Not committed, built, or deployed.

## 2026-11-09 Old production media completeness recovery (current)
- Scope: Old production `123vips.com` only. No Live deployment, session eviction, token rotation, or automatic asset-library insertion.
- Fixed failed media ingest jobs so a retry resets exhausted attempts, stale start/completion timestamps, and returns the job to `queued`; `ready`/`processing` jobs remain untouched.
- Added bounded historical media persistence recovery: at most 2 successful non-API generation records per run, only within 7 days, only when provider video exists and durable local/CDN media is absent; runs every 2 minutes with at most 3 attempts and exponential retry delay.
- Recovery persists local video/poster plus OSS/R2 metadata directly into PostgreSQL. It never creates a user asset-library row. Permanent 400/401/403/404/410 errors terminate retries; transient network/5xx/storage errors remain retryable.
- Poster maintenance now recognizes nested `queryResponse.content.video_url` and `createResponse.content.video_url` so provider records can still generate thumbnails.
- History lazy-image guard only treats `complete && naturalWidth === 0` as an error for non-lazy images, preventing false broken-thumbnail state before viewport load.
- Verification: focused media/result/retention/regeneration tests pass 76/76; syntax and `git diff --check` pass.
- Pending: commit relevant hunks only, build/push `platform-release` from committed `old-site`, deploy only Old, then verify health, runtime errors, sample media fields, media URLs, ingest jobs, no asset-library insertion, and unchanged Live release.

## 2026-11-09 Regeneration submission snapshot (current, supersedes old visible backfill note)
- Latest user requirement: regenerate restores only prompt, media, model, and create mode. Every currently visible control stays as-is.
- Vega hidden model parameters are never shown and are never written back into hidden controls. `.advanced-vega-option` remains permanently `hidden`.
- Vega submissions include a detached `submissionSnapshot` in the PostgreSQL generation record (`params.submissionSnapshot`). Regeneration carries that snapshot internally to `advancedVegaGenerationOptions()`, scoped to the same Vega provider.
- The UI-visible Audio control is authoritative and is not overridden by the snapshot. The snapshot only fills hidden Vega task/draft/asset-group/return/enhance/moderation/generate/quality/output options.
- Do not infer ratio or resolution from `size`, `image_size`, `width/height`; do not backfill visible ratio/resolution/duration. Do not add Auto duration. Lite behavior is unchanged.
- `submissionSnapshot` is stripped by `buildVegaCreatePayload()` and never reaches the upstream Vega request.
- Verification: `test/advanced-workspace-routing.test.js`, `test/vega-regeneration-media.test.js`, and `test/tencent-vod-vega.test.js` pass 82/82; targeted `node --check` and `git diff --check` pass.
- Not deployed or committed. Unrelated workspace WIP remains untouched.

## 2026-11-09 Result media persistence and permanent retention (current)
- Scope: Old production `123vips.com` only. Do not deploy Live, purge sessions/tokens, or evict logged-in users.
- User requirement: Result/History thumbnails and playback must work for every user; generation media must not be manually added to the asset library. The asset library remains user-initiated only.
- Root cause: `app_generation_records.payload` can have `resultAssetId` while durable media fields are empty. Hydration previously filled only the API response. Old age jobs also removed local generated media and uploaded business files after 24h, and the frontend considered older records expired even when durable media existed.
- Fix: result-asset hydration now includes `resultAssetId/resultAssetIds`, atomically backfills only missing media fields into PostgreSQL, and persists list/detail hydration results. Adding an existing result asset backfills missing fields but never creates an automatic asset record.
- Startup scan: every 5 minutes and 15 seconds after boot, scan up to 50 successful records whose result asset exists and belongs to the same user, fill only blank durable media fields, and mark completed records to prevent repeated scans.
- Retention fix: successful result R2 expiry is disabled; local generated media and uploaded source media are no longer deleted by age; only abandoned chunk-upload temporary directories are cleaned. Frontend 24h expiry ignores records with durable video/poster/image fields.
- Verification: focused media tests pass 39/39; updated auth/history regression tests pass 16/16; `node --check` for changed JS files and `git diff --check` pass. Full `npm test` is 875/909 with 34 failures; confirmed failures are stale assertions or unrelated existing WIP, not this media fix.
- Publish: `app.js`, `db.js`, `platform.ui.parts/part-02.js`, `server.parts/part-01.js`, `server.parts/part-23.js`, `server.parts/part-41.js`, `server.parts/part-43.js`, `test/local-media-retention.test.js`, `test/advanced-result-refresh.test.js`, `test/vega-regeneration-media.test.js`, `test/admin-password-reset.test.js`, `test/generation-record-list-refresh.test.js`, `CODEX_TASK_STATE.md`. Do not include unrelated WIP.
- Pending: commit, build `platform-release` from committed `old-site`, push `old-site` and `platform-release`, deploy only Old, verify sample `cgt-20261109003626-72c310` media fields are permanently written back and the UI shows the thumbnail/playback.

## 2026-11-09 Result thumbnail missing after result asset was added
- Final root cause: the Result card uses `loading="lazy"`. Before the image entered the viewport, the fallback logic treated `complete=true` plus `naturalWidth=0` as a broken poster, removed `src`, hid the image, and recorded a false failure that prevented later recovery. The CDN request itself returned 200 and the same poster decoded at 1280x720.
- Final fix: do not invoke the synthetic failure path for lazy images that have not started loading; real `error` events still fail closed. Added regression assertion in `test/advanced-result-refresh.test.js`; 17/17 focused tests pass.
- Final deployment: Old integration `756a13f`; `platform-release` `4c2abf9`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; service `raising-game-demo`, PID `2220199`, `NRestarts=0`, health `200 {"ok":true}`; deployed hashes match local for result UI and result-asset hydration. `live-release` remains remote `bf1e01a` and Live was not deployed.
- Final browser acceptance: sample `cgt-20261109003626-72c310` Result poster loaded visibly at `1280x720`, no poster failure/retry loop; click opened `previewDialog` with video `readyState=4` and poster; history thumbnail also loaded visibly. Session count remained `897`; no sessions/tokens were cleared and no logged-in user was evicted. Post-deploy filtered logs show no `[api-error]/ReferenceError/TypeError/previewVideo/advanced-download-preparation-failed`.

- User reports clicking a Generate result now reacts, but its thumbnail is still missing; sample task is `cgt-20261109003626-72c310`. Scope remains Old production only; do not deploy Live, invalidate sessions/tokens, or evict logged-in users.
- Production record has `resultAssetId=asset-1794200624991-7e34505b`; the corresponding `app_user_assets` row and both local video/poster files exist. The generation record has empty `localVideoUrl/cdnVideoUrl/posterUrl/cdnPosterUrl/storage keys`, so public history/detail responses cannot expose a durable poster even though the asset library is complete.
- Fixed `server.parts/part-41.js`: `generationRecordMediaAssetIds()` now includes `resultAssetId/resultAssetIds`; hydration fills missing result video/poster/storage fields from the owned result asset without overwriting existing values.
- Fixed `server.parts/part-36.js`: adding a result to assets now writes the media/poster fields into the generation record; the `alreadyAdded` path backfills missing fields for existing records.
- Added regression coverage in `test/vega-regeneration-media.test.js` for result-material hydration and fill-only semantics.
- Verification before deployment: focused suites 62/62 pass (`generated-assets-on-demand`, `vega-regeneration-media`, `advanced-result-refresh`, `media-url-priority`, `oss-storage`); `node --check` and `git diff --check` pass.
- Worktree contains unrelated WIP; publish only `server.parts/part-36.js`, `server.parts/part-41.js`, `test/vega-regeneration-media.test.js`, and this state record.

## 2026-11-09 Email security notice auto-opens once per account

- User requested that the email-binding/security notice popup appear only once instead of repeatedly after the prior 12-hour session snooze expired.
- Replaced session-only snooze with an account-scoped durable marker: `securityNoticeSeenAt` is stored in the PostgreSQL user payload and returned by `userView()`.
- Added `POST /api/account/security-notice-seen`; it writes the timestamp once and returns the updated user without invalidating sessions.
- Frontend marks the notice seen when it is actually displayed, uses a per-user localStorage fast path, never auto-opens again after that, and retries a failed server sync on later loads without reopening the dialog. Manually opening email binding from the avatar menu remains available.
- Bumped `platform.html` CSS/JS cache key to `email-notice-once-20261109-1` and added regression `email security notice auto-opens at most once per account`.
- Verification: focused security-notice tests 2/2, `test/email-auth.test.js` 6/6, JavaScript syntax checks, and `git diff --check` pass.
- Worktree contains unrelated media/Vega/Test/canvas WIP; publish only `platform.create.parts/part-06.js`, `platform.html`, `server.parts/part-10.js`, `server.parts/part-42.js`, `test/auth-risk.test.js`, `test/advanced-custom-ui.test.js`, and this state record.
- Integration commit `old-site` / `708bcf4`; platform release `7a2082a` built from remote base `918da4c`, pushed, and deployed only to `123vips.com`.
- Production verification: `/api/health` returned `200 {"ok":true}`; served `platform.create.parts/part-06.js` SHA-256 matches release/local (`fb55f76f...`) and contains the once-per-account logic; unauthenticated `/api/account/security-notice-seen` correctly returns `401 LOGIN_REQUIRED`; `live-release` remains `bf1e01a`; Live was not deployed.

## 2026-11-09 Latest result-thumbnail refresh recheck

- User reports Result thumbnails are again refreshing continuously. Scope remains Old production only; do not deploy Live, do not invalidate sessions/tokens or evict logged-in users.
- Current source/release state: `old-site` / `origin/old-site` `5273b90`; `platform-release` / origin `02b0cdf`; `live-release` remains `bf1e01a` and must stay untouched.
- Previous deploy is active on Old with PID `2210769`, started 2026-11-09 13:13:30 CST. `/api/health` was 200 `{"ok":true}`; served `platform.create.parts/part-01.js` SHA-256 `3bb1de2f...` matched local. Sessions at last check: 896 total, 877 legacy without expiry, 19 live-TTL sessions.
- Confirmed production 403 root cause: persisted Private OSS reference-image URLs carry expiry stamps. Generation records `cgt-20261109131204-cba517`, `...131213-ab4903`, `...131226-8734b7`, `...131233-c9ced4`, `...131237-a2f863`, `...131443-b631ef`, `...131611-6d6b73` for `user-1794195324548-0addc538` failed in preparation with `INVALID_REMOTE_MEDIA`; all free, zero credits. Reused expired URLs caused subsequent failures.
- Root cause fully isolated: result API polls can alternate equivalent image fields/origins (`cdnImageUrl`, `imageResultUrl`, `cdnImageUrls`, `localImageUrls`) while signatures rotate. Reassigning `img.src` caused the visible refresh loop; result URL ordering also made multi-image fields unstable.
- Fixed `platform.create.parts/part-01.js`: media identity uses stable object pathname, multi-image identities are deduplicated/sorted, painted images are matched by object path rather than array position, and `src` only changes when the media object changes or its signed URL expires within 60 seconds.
- Fixed `server.parts/part-14.js`: public media ingest resolves assets by canonical OSS object path, refreshes OSS signatures at the download boundary, preserves external/R2 URLs unchanged, and stores canonical source URLs.
- Regressions added in `test/advanced-result-refresh.test.js` and `test/advanced-preparation-recovery.test.js`; focused auth/result tests pass 62/62 and media/preparation tests pass 48/48. Syntax checks and `git diff --check` pass.
- Next: commit relevant files only, build/push `platform-release`, deploy only `scripts/deploy_local.sh --site old`, then verify health, served hash, session count, logs, login/generation/result flow, and Live release untouched.

## 2026-11-09 Generate prompt composer outline fix

- User reported the Generate prompt input was missing its surrounding outline after the rich prompt editor layer replaced the visible textarea styling.
- Root cause: `.advanced-prompt-input-shell` supplied background and radius but no border; the rich editor itself uses `outline: none`, and the legacy textarea border was hidden.
- Added a visible shell border plus `:focus-within` pink border/ring in `platform.css`; bumped `platform.html` CSS/JS cache key to `prompt-outline-20261109-1`.
- Added focused regression `rich prompt editor keeps the composer outline visible around its shell` in `test/advanced-custom-ui.test.js`; targeted test passes 1/1 and `git diff --check` passes.
- Worktree still contains unrelated Vega/Test/canvas WIP; only the three related files plus this state record may be staged.
- Integration commit `old-site` / `2464a86`; platform release `33087ea` built from remote base `2562061`, pushed, and deployed only to `123vips.com`.
- Production verification: `/api/health` returned `200 {"ok":true}`; served `platform.css` SHA-256 `95068a30...` exactly matches local and contains the shell border/focus rules; server uses asset version `c13fc5b8fa4c`; `live-release` remains `bf1e01a`; Live was not deployed.

## 2026-11-09 Result thumbnail polling flash fixed and deployed

## 2026-11-09 Email binding UI, translations, and compact buttons

- Moved email binding out of the account dialog into a standalone `emailBindingDialog`; avatar menu and security notice now open that dialog directly, while the account dialog contains only account summary/token/logout.
- Added translations for email binding/login flows, Support, Chat, same-style navigation, and related prompts across `en`, `vi`, `ja`, `ko`, `id`, and `zh`.
- Tightened the security notice and email binding actions: removed conflicting grid/flex declarations, reduced desktop actions to 34px, mobile actions to 32px, and made “Not now” a smaller subdued action.
- Updated cache version to `email-binding-i18n-20261109-2` and focused regression assertions to the new behavior.
- Verification: syntax checks and `git diff --check` pass; `test/email-auth.test.js`, `test/mobile-tool-ux.test.js`, `test/auth-risk.test.js`, and `test/advanced-result-refresh.test.js` pass 51/51.
- Integration commit `old-site` / `57daad9`; platform release `9c17593` built from it with parent `e47780c`, pushed, and deployed only to `123vips.com` with `scripts/deploy_local.sh --site old`.
- Production verification: `/api/health` returned `200 {"ok":true}`; `platform.css` and `platform.create.parts/part-06.js` SHA-256 match local; server-rendered HTML uses deployment asset version `be4a76b383e8` and contains standalone `emailBindingDialog`; `live-release` remains `bf1e01a`; Live was not deployed.

- User reported Result thumbnails appearing, disappearing, reloading, and the panel jumping every few seconds.
- Root cause: the 10-second generation-completion poll called `renderAdvancedResultPanel()`, which always replaced the entire result grid `innerHTML`; every poll destroyed and recreated thumbnail/video nodes.
- Fix: render the result grid HTML first, cache a render key (media kind, page, totals, language, HTML), and skip DOM replacement when the visible payload has not changed. Empty state clears the cache.
- Added regression test `unchanged result payloads do not tear down and reload thumbnails`.
- Verification: `node --check platform.create.js`; `test/advanced-result-refresh.test.js` 10/10 pass; staged diff check passed.
- Integration commit `old-site` / `e1a0697`; platform release `e47780c` built from it with parent `bb6c666` and pushed. Deployed only to `123vips.com` with `scripts/deploy_local.sh --site old`.
- Production verification: `/api/health` `200 {"ok":true}`, home/platform JS `200`, production `platform.create.parts/part-01.js` SHA-256 matches release (`214d20df...`), fix markers present, and no new runtime exceptions in the post-restart log scan. `live-release` remains `bf1e01a`; Live was not deployed.

## 2026-11-09 logout confirmation and expired-session cleanup deployed

- Added a second-confirmation dialog to all three logout entry points: desktop account menu, mobile drawer, and account dialog. Cancelling keeps the session, current page, and visible lists unchanged.
- Expired or replaced sessions now clear the client token, account state, history, and advanced-result state before showing the login prompt; stale generation records are no longer left visible.
- Added `state.logoutPending`, multilingual confirmation copy, and regression coverage. The buffered fetch response cannot trigger a second logout dialog.
- Focused verification: `test/mobile-tool-ux.test.js`, `test/auth-risk.test.js`, `test/advanced-result-refresh.test.js`: 45/45 passed with the repository test bootstrap. `node --check` and `git diff --check` passed.
- Integration commit `old-site` / `aee5f3f`; platform release `bb6c666` built from it with parent `f700be8` and pushed. Deployed only to `123vips.com` with `scripts/deploy_local.sh --site old`; `/api/health` returned `200 {"ok":true}`.
- Production hashes match local for `platform.config.js`, `platform.copy.js`, `platform.create.parts/part-06.js`, `platform.ui.parts/part-01.js`, and `platform.ui.parts/part-04.js`; server-rendered asset version is `62fa241dca46`. `live-release` remains `bf1e01a`, and Live was not deployed.

## 2026-11-09 security notice modal polish deployed

- Polished the account security notice: desktop primary actions use two equal-width 46px buttons, “Not now” is centered on its own row; mobile actions stack into full-width single-column buttons with no horizontal overflow.
- Fixed Telegram support webhook `crypto is not defined` by importing `node:crypto` in `lib-http.js`; production webhook smoke test returns HTTP 200 `{"ok":true}`.
- Old-site release deployed only to `123vips.com`; `/api/health` returns `200 {"ok":true}`. Local and production `platform.css` SHA-256 match: `99680b5951a42dcfa39d6ee877014a9c38421074682a326139a3d068f1e74afd`. Live was not deployed.
- Password registration returns `403 PASSWORD_REGISTRATION_DISABLED`; existing password login remains available. Existing sessions were preserved: 891 sessions / 658 session users / 881 active users.
- Post-restart log scan found no `crypto is not defined`, `tenantid is not defined`, uncaught exceptions, API errors, or HTTP 4xx/5xx responses.
- Focused suite: 58/60. The two failures are unrelated/stale: an exact logout regex blocked by dirty logout-confirmation work, and an old admin-reset count expecting 5 canonical login-session calls instead of 4.
- Visual checks: `/tmp/vipeak-dialog-check/desktop.png`, `/tmp/vipeak-dialog-check/mobile-real.png`.

## 2026-11-09 account identity close-out and Old-only deployment

- Goal: finish the Old-site security release without displacing existing logged-in users; Live must remain untouched.
- Password registration is disabled for new accounts; existing password login and the existing failed-password lockout remain.
- Email-code and Google sign-in resolve through one verified-email identity. `verifiedEmailForUser()` prefers the bound email and falls back to `googleEmail`; `findUserByVerifiedEmailInDb()` is tenant-scoped.
- Added `app_users_tenant_verified_email_uidx` on normalized verified email for active users. Email login, Google login, and email binding handle concurrent `23505` conflicts and re-read the canonical account where safe.
- Production duplicate groups were audited and merged transactionally:
  - `bonku1005@gmail.com`: canonical Google `user-1794111631896-a0f42fa6`; duplicate email `user-1794133138611-7d95b2ed`; moved 1 session, 1 chat conversation, and 1 chat message, then soft-deleted the duplicate.
  - `mittylhz94@gmail.com`: canonical Google `user-1790238237512-d652fc3e`; duplicate email `user-1794192239171-7498b074`; moved 1 session, then soft-deleted the duplicate.
  - Both groups snapshotted into `app_risk_events` as `account_identity_merge`; `payload.mergedIntoUserId` records the target. No global session purge or credential rotation.
- Post-merge production checks: 0 duplicate verified-email groups, unique index present, 2 risk events, canonical accounts active, `mittylhz94` retained 2993.23 credits / 26 generation refs / 52 asset refs / 1 wallet order, and migrated chat data present.
- Legacy users without a bound email or Google identity receive the security notice; CTA opens email binding, support CTA opens the anonymous support dialog, and the 60-second email-code resend countdown remains.
- Anonymous support is available without sign-in and source attribution supports `security notice` and `chat report`; support limits are 3/hour/IP and 2/hour/address for anonymous users, 5/hour/user for authenticated users. Existing sessions remain valid.
- Added regression coverage for the unique verified-email index, identity-conflict codes, anonymous support/chat source attribution, cache version, password registration rejection, and auth module crypto import.
- Verification: focused auth/mobile/email/security suite 54/54; JavaScript syntax checks passed for changed server/frontend files; `git diff --check` passed.
- Pending in this step: selective commit, release snapshot, `platform-release` push, Old-only deployment, and post-deploy live verification. Live was not deployed.

## 2026-11-09 admin generation detail inline playback

- Result videos in the admin generation-record detail now use an inline deferred player: the detail dialog initially shows only a play trigger, and clicking it replaces that preview area with a playable `<video>` in the same dialog.
- The global media-lightbox handler is no longer used for the detail result, so it does not create a second modal behind/outside the detail dialog. Reference-material tiles still use the existing enlarged-preview behavior.
- `adminMediaPreviewTrigger` supports an `inline` mode via `data-admin-media-inline`; targeted admin preview/list suites pass 14/14.
- Deployment: `old-site` `7cfa245`; `platform-release` `0f4694c`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned 200 and production `admin.js` contains the inline playback path. Live was not deployed.

## 2026-11-09 admin generation detail playback CDN preference

- Follow-up to deferred loading: detail playback was still slower because `recordPreviewHtml()` preferred `adminResultPreviewUrl` (the `/api/admin/.../media` proxy) over the same signed CDN/provider URL used by the fast list preview.
- Detail result playback now prefers `recordVideoUrl(record)` (durable CDN first) while retaining the admin media proxy as fallback when no direct media URL is available.
- Targeted admin preview/list suites pass 14/14; added assertions for the direct URL preference.
- Deployment: `old-site` `f5878a9`; `platform-release` `95862f3`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned 200; production `admin.js` contains `const directVideo` / `const playbackVideo` and no explicit `previewVideo.load()`. Live was not deployed.

## 2026-11-09 admin generation detail preview performance

- Admin generation-record list had always used `adminMediaPreviewTrigger({ preloadVideo: false })`, so it did not request video files until the user clicked play.
- Generation detail and its reference-video tiles preloaded `video` metadata, and detail binding explicitly called `previewVideo.load()`, forcing the proxied admin media endpoint on dialog open.
- Changed `admin.js` so result and reference videos use the same deferred preview trigger as the list; removed the explicit load and added a detail preview style in `admin.css`.
- Added regression coverage in `test/admin-media-preview.test.js`. Targeted suites pass 14/14 with `node --require ./test/source-compat.js --test test/admin-media-preview.test.js test/admin-generation-records-list.test.js`.
- Not deployed in this step.

## 2026-11-09 attack-source inspection (SSH/Web)

- Scope: read-only inspection of Old production `123vips.com` / `47.84.76.131`; no service restart, session purge, firewall mutation, or deployment.
- SSH hardening verified live: `PasswordAuthentication no`, `PermitRootLogin prohibit-password`, `MaxAuthTries 3`, empty passwords disabled, UFW exposes only 22/80/443. fail2ban sshd has 56 currently banned IPs; policy is 4 retries / 15 minutes / 24-hour ban.
- SSH attack volume: 618 distinct source IPs failed authentication in 7 days. Highest counts: `27.118.23.21` 3,483 root attempts (VN/Hanel), `185.237.15.70` 3,020 root (DE/Kamatera), `148.66.128.231` 2,849 root (SG/GoDaddy), `66.116.224.187` 2,610 root (IN/PDR), `192.252.215.125` 2,290 wordpress (US/Performive), `148.72.211.221` 2,221 root (SG/GoDaddy). Large coordinated clusters include `109.160.32.0/24` and `45.148.10.0/24`.
- SSH successful-auth review since 2026-11-02 found only operator addresses `223.204.231.152` / `223.204.226.184`; post-hardening success is public-key only from `223.204.231.152`. No evidence of a successful internet SSH brute-force login.
- Web scanner farms identified today: Microsoft/Google cloud addresses repeatedly probing WordPress/PHP paths, including `20.217.186.29` (480 requests), `20.46.43.126` (420), `34.15.128.228` / `34.131.36.85` / `34.130.68.64` (274 each), `52.179.208.167` (198), plus Azure/Google ranges. Secret discovery is concentrated from `45.148.10.5` / `45.148.10.21` (`.env`, `.git`, `.aws`) and LLM endpoint probing from `103.219.170.149`.
- One-minute mass scan from `34.95.235.21` made 236 requests at 01:34 with rotating/spoofed crawler UAs and attempted `//.env`; the historical `200` response was 550 bytes and current `//.env` plus encoded/path-traversal variants return 404. No successful `.env`/`.git`/`.aws` secret-file response or credential markers were found. `216.244.66.236` DotBot generated 25,298 random-path requests (mostly 308), which is crawler load rather than exploit success.
- Credential-stuffing/takeover signal: `50.7.21.105` (SG/FDCservers, `curl/7.55.1`) successfully logged into existing `test04`/`test03` accounts at 01:05-01:07, bound an email and reset `test03` password, then created one API generation. Those historic sessions still exist. This is a targeted compromise/credential reuse event, not ordinary web scanning, and should be contained by revoking only the affected sessions/tokens after user confirmation.
- Current application auth risk controls are active: 24h DB shows only 2 login-failure subjects, 43 `auth_rate_limited` events, and 1 `auth_login_locked`; no broad application password brute force was observed.

## 2026-11-09 production private-media hardening (deployment wave)

- Production safety gate checked at 2026-11-09 06:00 +08: app active, no Node restarts, 879 sessions. No generation work in the prior 2 hours; only three historical stale rows remain (`mychar-img-20261106152856-a086bc4` submitting from 2026-11-06; `cgt-20260619181126-95cc3c` and `cgt-20260619181025-801a09` running from 2026-06-19). They are not live work and do not block the planned restart.
- Live Nginx exposure confirmed immediately before deploy: `/assets/user-characters/` and `/assets/generated/characters/apiz/` still returned anonymous HTTP 200; `/assets/generated/panoramas/` had no local test object but still had a direct alias. `/assets/user-uploads/` and `/assets/admin/voice-preview/` already returned 403.
- Deployment ordering fixed: `scripts/deploy_site.py` now declares an Old `post_restart_commands` Nginx hardening action; `scripts/deploy_pull.py` supports `--post-restart-command` and runs it only after the restarted service passes health, before final private-media verification. This preserves the new Node authorization path during rollout.
- Nginx hardening correctness fixed: the transformer now scopes edits to media-serving server blocks only, leaving redirect-only/API-only virtual hosts in the same file untouched. Regression coverage added for multi-server files and for keeping repository/backup/key deny regexes ahead of `^~ /assets/` locations.
- Verified before deploy: focused media/site/admin/voice/Wan/deploy suite 32/32 pass; Nginx hardening suite 3/3 pass; Python compilation, JavaScript syntax, and `git diff --check` pass.
- Deployed snapshot: source `old-site` `95dcd8d`; `platform-release` `062e561`, deployed only to Old. Production release verified at `062e561`; `/api/health` returned 200, Nginx reload succeeded, public root/platform/admin/JS/CSS returned 200, all five private media probes returned 403 with `private, no-store`, and `app_sessions` remained 879. Live was not pushed or deployed.
- Deployment verifier correction: the first post-deploy run exited 1 because the private-media probe accepted only 403, while a sampled upload returned a safe 404 during release-time path resolution. The probe now treats 403/404 as safe and still fails on every other status; release/deploy tests pass 9/9.
- Historical context: before this wave `123vips.com` was on `platform-release` `d59114aa74c1939ee14ce52770126eb19d5a4cfd` from source `old-site` `a52e7c6`. The prior release already protected `/assets/user-uploads/` and `/assets/admin/voice-preview/`; this wave closes the remaining protected-character/panorama aliases. Manual Cloudflare purge remains required for every private prefix because previously public edge objects may persist. Built-in generated characters remain public, while generated APiz/panorama/user content must be signed.


## Upstream reference image 403 investigation (2026-11-08/09)

### 2026-11-09 production safety and generation-record fix

- Confirmed the remaining deterministic visibility gap: pre-billing advanced request validation returned 400/404/503 without a generation record or `taskId`. The request was rejected before charging, but admins/users could not see it in generation history.
- Added a shared `sendAdvancedRequestFailure()` persistence path and converted pre-billing provider, prompt, duration/resolution/ratio, Seedance content/media/reference, Aliyun resolution, and Aliyun input validation failures to write `status=failed`, `billingStatus=free`, zero pre-deducted/final credits, `awaitingUpstreamTask=false`, and return `taskId`.
- Added regression coverage for validation-failure persistence and the returned `taskId`; extended media-preparation assertions to reject direct pre-billing error returns.
- Production read-only audit: 879 sessions, 880 active users, 0 stale pre-submit tasks, 0 failed pre-deducted/refund-failed records, 0 orphan sessions, 24h generation 490 with 29 failed. `cgt-20261109033312-ecbfdf` was not present in generation records or ledger (no refund needed); no duplicate refund was made.
- Verification passed: 58 targeted tests, syntax checks, Python compilation, and `git diff --check`.

### 2026-11-09 proactive production audit addendum

- Production user `user-1793787605853-9f11a964` (`jesney`) had stale generation `cgt-20261109034544-3e1d0d`; the pre-deducted 150 credits were refunded exactly once after the service restart lost the in-memory submission job. Record now has `status=failed`, `billingStatus=refunded`, `finalCredits=0`, `awaitingUpstreamTask=false`, `lastUpdateReason=operator-restart-recovery-refund`; ledger refund is `ledger-f9a7b5f1c0a7468588cfa0f2`; user credits and payload credits both `32320`. No service restart was used for the repair.
- Root cause candidate for the recovery gap: `scanStalePreSubmitGenerationRecords()` sets `staleSubmitScanRunning=true` before an unbounded DB query. If that first scan never settles, every later timer exits early forever with no start/finish diagnostic. The fix must bound the query and each record, log scan start/end/timeout, and release the guard reliably.
- Deployment-key authentication is implemented in `scripts/deploy_pull.py`, `scripts/deploy_site.py`, and `test/deploy-targets.test.js`; key auth never falls back to password/agent/default keys. `LOCAL_CREDENTIALS.md` contains only the local key path and must not be printed or committed. This change is not yet committed or deployed.

- Real production listener is `127.0.0.1:4174`; `/api/health` returns `{"ok":true}`. Earlier checks against port 3000 were invalid.
- Service remains `root` with weak systemd hardening (`NoNewPrivileges=no`, `PrivateTmp=no`, `ProtectSystem=no`, `ProtectHome=no`). Three stale root test processes were terminated (PIDs 359303/359304, 2083103/2083104, 2083461/2083462); DB connections dropped to about 21 and the processes are gone.
- `app_sessions` has no `expires_at`; it currently has 877 sessions for 657 users. Session tokens are stored in browser `localStorage`. Existing users must not be logged out, so expiry/cookie migration is a staged hardening item rather than an immediate destructive change.
- Last 24h risk events: 33 auth_rate_limited, 6 auth_login_failed, 1 registration attempt, 1 registration created. Login-failure table currently has only `test06` at 1 failure, unlocked. Quarantine count is 154; 879 active/non-deleted accounts.
- Public nginx audit: `/assets/admin` is exposed as a whole, including advanced-cases (68MB), platform-templates (54MB), undress-examples (24MB), home (12MB), voice-preview (1.6MB). `home` is required for public page/template assets; the other directories need business-use confirmation before being restricted. `/assets/user-uploads/...` is anonymously readable and may be required as an upstream URL; preferred fix is signed/controlled asset URLs. `/__protected_assets__/` is internal-only and safe externally.
- Credential work still pending: rotate IGNEX API key, mainland bypass token, Telegram support bot token/webhook secret; then remove old backup files containing previous values. SSH allows root password login and `MaxAuthTries 3`; fail2ban is active (about 52 bans, 1381 cumulative failures). A dedicated deploy user/key must be created before disabling root password login.
- Verified: app DB role is non-superuser without role/db creation or RLS bypass; daily PostgreSQL backups are 50-69MB and mode 600; security headers are complete; Cloudflare real-IP handling is configured; sensitive paths (`/.git`, `/.env`, `/data`, `server.parts`, `LOCAL_CREDENTIALS.md`, backups) return non-200; homepage and health return 200.
- Reconciliation count mismatch remains: 512 paid orders, 492 with ledger, 20 detailed zero-credit orders, aggregate query reported 23. Three aggregate-only rows require follow-up.
- Current code changes are not committed or deployed. Live is untouched.

### 2026-11-09 deployment-blocking payment concurrency fix

- Fixed same-user payment settlement races: order advisory lock remains, and a second user-level settlement advisory lock serializes different orders for the same payer.
- Membership and API-docs entitlements now use targeted JSONB payload patches instead of writing a stale full user snapshot.
- Referral reward now re-reads both users under a referrer mutation lock, rechecks ledger idempotency, patches only the referred user's referral field, and no longer overwrites credits/membership/entitlements.
- Added database helper `patchUserPayloadInDb()` and `withWalletUserSettlementLockInDb()`.
- Verification: targeted security suite 67/67 passed; syntax and `git diff --check` passed. Full suite baseline has pre-existing unrelated frontend/page assertion failures; current tree has the same class of failures and no new security-suite failures.
- Current production remains old commit `64e88d2` until this security release is deployed.

### 2026-11-09 security follow-up in progress

- Highest-priority finding: `userView()` exposed the full long-lived primary API token in `/api/auth/me`, login, payment, generation, and other browser responses. This is now changed to `apiToken: ""` plus `apiTokenPreview`; the owner fetches the full token only through `GET /api/access/token` (`cache-control: no-store`, primary token/browser session only, subtokens rejected). Frontend keeps it only in memory after an explicit show/copy action.
- Password reset and admin password reset now rotate `apiToken` but intentionally preserve existing browser sessions, matching the requirement not to kick normal logged-in users. Explicit admin `forceLogout` remains the separate destructive action.
- Targeted regression after these changes: subtoken/user view, admin password reset, security regressions, auth risk = 31/31 pass; syntax checks pass.
- Production checks already completed: data directory changed from 777 to 700; Aegis unit reset but AliYunDun processes left running; PostgreSQL app roles are non-superuser; Nginx 502 burst was limited to the restart window; poster retry log storm awaits deployment of the bounded retry code.
- Payment reconciliation still needs exact explanation of aggregate `paid_no_ledger=23` vs 20 detailed rows. Detailed 20 are zero-credit subscription/entitlement orders with no wallet ledger by design; 3-row difference must be resolved. One historical order has order credits 2034.06 and ledger 2000 + adjustment 34.06, totaling correctly; verify business reason.
- Remaining production audit: deployment script/data permissions, repo/server key and sensitive-file permissions, pending wallet order abuse/DoS, fail2ban/SSH constraints, CSP/XSS exposure, and normal-user login/generation/upload regression after deployment.

- User report: generation fails with `Failed to download Upstream reference image: 403`; admin generation history cannot find the failed requests. Existing logged-in users must remain logged in.
- Production: `123vips.com` / `47.84.76.131`, service `raising-game-demo`, deployed commit `7076763`, restarted 2026-11-08 20:58:33 CST.
- Failure times from journal: 2026-11-09 00:21:13, 00:22:03, 00:23:53, 00:36:36 CST. Requests: `POST /api/advanced/generate`. Error code `INVALID_REMOTE_MEDIA`; message `Failed to download Upstream reference image: 403`.
- Last 12h generation records: 240 success, 30 completed, 23 failed, 4 running. The 23 failed records are upstream safety/copyright/Seedance timeout cases; no 403 preparation failures were persisted.
- Static origin URL for sampled upload returns 200; same object on `assets-cdn.123vips.com` returns 403 (Tengine/OSS CDN, `x-oss-ec: 0003`). All 37 most recent user image assets exist locally, while their CDN URLs return 403.
- Production env: `STORAGE_PROVIDER=oss`, `OSS_CDN_BASE_URL=https://assets-cdn.123vips.com`, `OSS_BUCKET=vipeak-media-sg`, `R2_PUBLIC_BASE_URL=https://media.123vips.com`.
- Root cause: when a historical local upload is missing, recovery selected the unsigned private `assets-cdn.123vips.com` URL from the asset's CDN/public fields. That request returns 403. Media preparation also happens before billing and `upsertGenerationRecord()`, so these failures never appeared in admin history and were not charged.
- Production evidence: recent 24h had 177 new users but only 3 with any balance (max 8795.88); 51 sessions / 45 users. The four failing requests came from one IPv6 client, normal browser UA and `https://123vip.fans/` referer, so this incident is not an account-abuse or stolen-credit pattern.
- Relevant code: `server.parts/part-22.js:566-600` downloader; `server.parts/part-13.js:986/1040/1203` restore/public URL normalization; `server.parts/part-19.js:995` public URL preparation; `server.parts/part-19.js:1203-1255` image normalization and mirror; `server.parts/part-29.js:400-550/750-853` validation/billing/record creation.
- Constraints: PostgreSQL only; deploy only `123vips.com` through `scripts/deploy_local.sh --site old`; do not revoke sessions/tokens, clear sessions, rotate user tokens, or deploy Live. Do not print credentials/secrets. Known dirty files remain excluded from commits.
- Fix implemented: private OSS/CDN URLs are freshly signed only at the download/delivery boundary; PostgreSQL keeps the unsigned canonical URL. Seedance and Aliyun media-preparation failures now persist a free failed generation record (`status=failed`, `failureStage=preparation`, `preparationErrorCode`, `billingStatus=free`, zero pre-deducted/final credits) before returning the error.
- Normal-user regression: the committed normal-user end-to-end acceptance remains at `6824f79`; no session cleanup, token rotation, login-expiry shortening, or forced logout is performed.
- Verification: `git diff --check` and syntax checks pass; targeted regression suite passes 66/66 (including signed OSS media, local retention, media inputs, generation-record refresh, URL priority, and character reference restore).
- Release/deployment: `old-site` code commit `9e905b8`; `platform-release` remote `64e88d2`; deployed only `123vips.com` with `scripts/deploy_local.sh --site old`. Release boundary passed and production is running `64e88d2`; Live and `live-release` were not deployed.
- Production acceptance: `/api/health` returned `200 {"ok":true}`. A sampled historical user image key had an unsigned CDN URL returning 403, while the freshly signed delivery URL returned `200 image/jpeg` (62521 bytes). Recent 10m generation statuses were 4 succeeded and 2 running with no new preparation failures. Session count remained intact; no sessions were cleared, tokens rotated, or users forced out.

## Security incident and auth risk controls (2026-11-08)

- User report: sudden large user growth on 123vips.com, suspected bot registration; requested behavior analysis, vulnerability review, auth lockout/risk controls, SSH/key/env exposure review, remediation, and deployment.
- Production evidence: 875 total users; 182 created in 24h, 175 today. About 120 at 17:00 and 35 at 18:00. 129 adjacent registrations within 5s, 143 within 10s, median gap 4s. Dictionaries included aaa..zzz, admin/founder/owner/super/god/king, test/john/mike/david/lisi/zhangsan/xiaoming and numeric names. New accounts are ordinary users with zero balance but generated password hashes/API tokens. This is confirmed automated bulk registration, not organic growth.
- Logging gap: legacy registration attribution generally lacked UA/host; 223 sessions in 24h had only one `"unknown"` IP, so real client IP/UA was not persisted. New auth audit data stores IP hash/masked IP, UA, device ID and fingerprint hash; risk events use hashes only.
- Public-directory exposure: legacy JSON files were moved from `/opt/raising-game-demo/data/` to `/var/backups/raising-game-demo/quarantine-20261108/`; directory 700 root:root, files 600 root:root. Moved app-db.json, app-config.json, two config backups, generation-records.json, character-assets.json. HTTP checks for `/data/app-db.json`, `/data/app-config.json`, `/data/generation-records.json` return 404; `/api/health` returns 200.
- SSH host 47.84.76.131: PermitRootLogin yes, PasswordAuthentication yes, PubkeyAuthentication yes, MaxAuthTries 3, UFW only 22/80/443. fail2ban and ufw active. `/etc/raising-game-demo.env` is 600 root:root and contains DB/payment/R2/Aliyun/Telegram/Stripe secrets.
- SSH risk: about 154,131 failed auth attempts in 14 days while fail2ban reported 40 current / 74 total failed and 0 banned. Root authorized_keys is 600 root:root with keys SHA256:9dXui+h61hDMajo7NhkFAn81fV3rHBvuhkHyE5wZ7ZM (skp-t4n1yusxv5bvbiw3tbwz), SHA256:q8i6b9xN4f7/eDh29Zi+nd0fyNTlcY7yo80Vqcrkbp0 (root@iv-yek2lytjwgplsv0brvhc new-site-proxy), SHA256:Yd0ua08nOD8wYb90YijH7GE/9vCXnHq6AfxatCuRo6s (m007@mac). No matching local public key was found. Deployment currently uses root password; do not disable root password auth until a verified non-root/key deployment path exists.
- Deployment risk: `scripts/deploy_pull.py` around line 466 uses Paramiko AutoAddPolicy with no pinned host key. nginx scans for `.env`/`.git` return 404; no confirmed successful legacy app-db.json download. Registration burst coincided with upstream prematurely-closed/connection-refused errors.
- Implemented code (ready to deploy): `server.parts/part-46.js` new auth-risk module with DB-backed registration/login/email/Google limiters, Cloudflare-aware IP extraction, device/fingerprint audit, dictionary/automation heuristics, login failure lockout and hash-only risk events.
- Login compatibility fix: browser password login now rejects only empty credentials; the 10-character password minimum applies only to new registration and password reset. Existing 6–9 character legacy passwords still work, and copy explains “new accounts need 10+ characters.” Regression coverage added.
- Verification before security deploy: `node --test test/auth-risk.test.js test/admin-password-reset.test.js test/deploy-targets.test.js` passes 27/27; `node --check` passes for modified server/admin/platform/db files; `py_compile` and `git diff --check` pass. `server.parts/part-32.js` wires registration/login/Telegram/email auth, 32KB body limits, riskStatus/riskReasons and attribution fields. `db.js` adds risk tables/functions and parametrized IP lockout. Admin dashboard/risk-summary endpoints and cards are partially implemented.
- Completed: global device bucket, admin risk filtering/status update, retention cleanup, historical bot quarantine (marked, not deleted), host-key pinning, fail2ban review, 32/32 targeted tests, security commit `b92a88d`, platform release `8ef4ab5`, old-site deploy, and post-deploy sensitive-path checks. Remaining SSH risk: root password login is still required by the deployment path and must not be disabled without a verified non-root/key deployment route.
- Follow-up hardening: Node static serving now uses an explicit allowlist instead of a root-file denylist. Safe roots include named pages/assets, media directories, downloads, vendor, Workflow release assets, and verification files. Source, config, docs, dotfiles, maps, backups and unknown extensions are denied before filesystem access. Regression coverage added in `test/site-http.test.js`.

## Static allowlist hardening (2026-11-08)

- Current user constraint: do not invalidate any existing logged-in user. No session purge, token rotation, or shorter lifetime was performed. Quarantined bot accounts keep their existing browser sessions; API token/subtoken issuance and new logins are rejected.
- Changed: `site-http.js` adds `publicStaticPath()`; `server.parts/part-01.js` imports it; `server.parts/part-41.js` removes the old private-root denylist; `server.parts/part-42.js` requires a positive allowlist match before static file handling; `test/site-http.test.js` covers permitted assets and encoded/path-traversal/private-file bypass attempts.
- Verification: `node --require ./test/source-compat.js --test test/auth-risk.test.js test/site-http.test.js test/deploy-targets.test.js` passes 32/32; modified JS files pass `node --check`; `git diff --check` passes.
- Release: integration `old-site` / `6d28c5b`; release snapshot `platform-release` / `7076763`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. Live was not deployed.
- Production verification: `/api/health` returned `200 {"ok":true}`; `/platform.html`, `/platform.css`, `/platform.js`, `/platform-sw.js`, canonical brand assets, the 123tops APK/mobileconfig and `/workflow-react/dist/canvas.js` returned `200`. Sensitive checks (`/.env`, `/.git/config`, `/data/app-db.json`, `/server.parts/part-42.js`, `/assets/ATTRIBUTION.md`, `/workflow-react/dist/canvas.js.map`, `/package.json`, `/server.js`, `/db.js`, `/LOCAL_CREDENTIALS.md`, `/test/site-http.test.js`, `/downloads/backup.zip`, `/assets/secret.json`) and encoded/case/double-slash variants all returned `404`. Security headers including CSP, HSTS, `nosniff`, `DENY` and referrer policy are present.
- Session compatibility: the release diff from `b92a88d` to `6d28c5b` contains only the static allowlist files and state record; `server.parts/part-32.js` and `db.js` hashes are unchanged. No sessions were purged, no tokens rotated, and no lifetime was shortened. `/api/auth/me` returned `200 {"ok":true,"user":null}` without credentials.
- Normal-user end-to-end acceptance (2026-11-08): targeted security tests still pass 32/32. Live `123vips.com` one-time browser-style registration returned 200 with a token, `user.role=user`, `riskStatus=clear`, and zero credits. Same-device re-login reused the original token; a second device received a distinct token; both remained valid after further login. `/api/auth/me` returned the test user on both tokens, `/api/access/subtokens` and `/api/workflow/canvases` returned 200, and `/api/admin/users` correctly returned 403 `ADMIN_REQUIRED`. Only the test user, its 2 sessions, default workflow canvas, and 2 matching risk events were deleted; post-cleanup counts for user/session were 0/0. No existing session was purged or revoked, and health remained `200 {"ok":true}`.

## Persistent multi-device login (2026-11-08)

- User request: determine login lifetime, fix frequent logouts, and make login state effectively permanent.
- Root cause: `app_sessions` has no expiry; normal-user login deleted every prior session via `replaceUserSessionInDb`, causing other browsers to receive `401 SESSION_REPLACED`.
- Decision: independent permanent sessions per browser/device. Same browser re-login reuses its token; different devices receive separate tokens. Login never deletes another device's session. Logout revokes only the current token. Password reset, admin reset, and ban/deletion still revoke all sessions.
- Changed: `server.parts/part-02.js`, `server.parts/part-32.js`, `platform.config.js`, `platform.ui.parts/part-04.js`, `platform.create.parts/part-06.js`, `platform.google.js`, `platform.telegram.js`, `test/admin-password-reset.test.js`.
- Verification: auth tests 4/4; auth+Telegram 13/13; chat-live diagnostics 13/13; mobile tool UX 11/11; syntax checks and `git diff --check` pass.
- Deployment: `old-site` / `d1f8a34` (`9544cca` code commit); `platform-release` / `b8a5f05` (force-with-lease from `3053c86`). Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; `live-release` remains `bf1e01a` and Live was not deployed.
- Production verification: `/api/health` returned `200 {"ok":true}`; production `platform.ui.js` SHA-256 `ea7cf585...` matches local; deployed source contains device-aware session creation and all five auth call sites. Real production register/login probe passed: same device reused token, second device got a separate token, both remained valid after another login, and a no-device login did not revoke either. Temporary test user and sessions were cleaned up.

## Wan 系列 AI 提示词优化器（2026-11-08）

- 用户要求：所有 Wan 系列提示词控件加入“AI 优化”按钮；弹窗展示优化结果，用户确认后才填回；按 W3 文档规则改写；使用 Papaya；18+ 产品，不加入合规/审核/净化限制。
- 实现：新增共享 `platform.prompt-optimizer.js` 弹窗和 Wan provider 识别；Advanced/Custom、React Flow、旧工作流、React bridge 均接入。原提示词只读，优化结果可编辑，只有点击“填入提示词”才写回。
- 服务端：新增认证接口 `POST /api/advanced/prompt-optimize`，调用现有 `papayaLanguageRequest`，模型 `carrothub-papaya-1.0`，5000 字符限制；不扣积分、不创建生成记录。
- Skill：`/Users/x042/.codex/skills/w3-prompt-optimizer/SKILL.md` 及 `references/w3-guidelines.md`，用于按 W3 结构、节拍、物理动作、镜头、连续性、音频和稳定性改写。该目录在仓库外，不进入发布。
- 18+：保留用户已有成人意图和明确内容；服务端、客户端和 Skill 均未加入合规、审核、未成年人、政策、净化、消音或删减限制。
- 验证：优化器定向测试 36/36；`node --check`、`git diff --check` 通过。独立发布快照中 36 项为 33 通过，3 项失败来自既有 11.11 促销服务端块未在 `old-site` 提交，与本次功能无关。
- 提交：`old-site` / `9fe94b5`；`platform-release` / `b58f9dc`，从 `ebbbdc7` 使用 `--force-with-lease` 更新。
- 部署：仅执行 `scripts/deploy_local.sh --site old`，部署到 `123vips.com`；release boundary 通过，服务运行正常。未部署 Live，`live-release` 仍为 `bf1e01a`。
- 线上验证（首次发布）：`/api/health` 返回 `200 {"ok":true}`；`platform.html` 含 `advancedPromptOptimizeBtn`；线上 `platform.prompt-optimizer.js` 哈希一致；未登录接口返回 `401 LOGIN_REQUIRED`。
- 修复后续（2026-11-08）：真实 Papaya 验证发现客户端发送 `document.documentElement.lang=en`，导致中文源提示词被整体翻成英文；同时负向约束未稳定转换成正向结尾约束。
- 修复提交：`ab81343` 增加提示词语言检测、服务端中文语言锁定与中文失败重试；增加负向约束正向化及稳定结尾栈。`67ef301` 移除误入发布快照的 Test UI。定向测试 13/13 通过。
- 真实 Papaya 输出已确认：中文为主；含 `00:00/00:03/00:06/00:09` 时间码、可量化动作、Dolly-in 镜头、Ambient 音频、正向结尾约束；`避免动作过快` 转为 `动作节奏平稳连续`。
- 修复发布：`platform-release` / `3053c86`（源 `67ef301`），仅用 `scripts/deploy_local.sh --site old` 部署到 `123vips.com`；`live-release` 保持 `bf1e01a`，未部署 Live。
- 线上复核：`/api/health` 为 `200 {"ok":true}`；页面含 AI 优化按钮；线上优化器 JS SHA-256 为 `8d030daae7ee6f4bb0f042804ad051baffb4323d70a6c273e56ca99f0da630df`，与本地一致；未登录优化接口为 `401 LOGIN_REQUIRED`。线上 CSS/JS 查询参数由服务端平台资源内容哈希动态改写为 `3e6774a63a71`，不能再用固定 `20261108-2` 作为线上版本判断。
- 回滚：本次发布前 `platform-release` 为 `b58f9dc`；需要时仅按发布流程回退平台分支并重新部署 old 站。

## Fix undefined advanced workspace tab after regeneration (2026-11-08)

- User reported `Can't find variable: etAdvancedWorkspaceTab` (browser truncation of `setAdvancedWorkspaceTab`) on Regenerate, and local Generate appeared unresponsive.
- Root cause: commit `125a828` accidentally published two unfinished Test-mode route calls in `platform.create.parts/part-04.js`; the function was only defined by unpublished Test-mode changes. A successful health check could not detect a browser-only JavaScript error.
- Fix: restored the previously deployed, defined `setTab("advanced")` routing in `restoreRecordToAdvancedCreate()` and `useAssetInAdvanced()`. Kept all unrelated Test/Vega/workflow changes out of the release.
- Added `test/advanced-workspace-routing.test.js` to reject unexplained `setAdvancedWorkspaceTab(...)` calls in `part-04.js` and assert both regeneration/asset routes use `setTab("advanced")`.
- Verification: targeted result/routing tests 10/10 pass; `node --check platform.create.parts/part-04.js` and `git diff --check` pass.
- Published integration commit `old-site` / `c6eb122`; platform release `ebbbdc7` was pushed with lease from `5499b53` and deployed to old.
- Production verification: `/api/health` is `200 {"ok":true}`; served `platform.create.parts/part-04.js` SHA-256 is `5d8c8be81e8d7e0b91b29e1c8420ed4a4c2aed670a4f2308756ba62ae9cd4cde`; both routing paths use `setTab("advanced")`; no `setAdvancedWorkspaceTab` remains.
- Live release tree is unchanged by this platform-only fix; `https://live.123vipeak.com/api/health` is `{"ok":true}`. No Live platform files were mixed in.
- Rollback: redeploy platform release to `5499b53` if needed. This would restore the bug, so use only for release-tool incidents, not as a behavioral rollback.

## Generate prompt C 方案：Tiptap 富文本 + textarea 兼容回滚（2026-11-07）

- 用户要求按 C 方案处理 Safari 输入框删除时光标视觉位置与实际位置错位；要求可以随时回滚，并记录方案。
- 采用 Tiptap 独立富文本编辑层，`#advancedPrompt` 旧 textarea 仍是唯一兼容数据源。富文本每次变更同步写回 textarea，并继续触发原有 `input` 事件，现有提交、引用、模板、恢复历史等链路不需要改写第二套状态。
- 默认启用 rich。初始化失败自动回退 legacy；同一页面有 URL 参数时优先于 localStorage。
- 立即回滚方式：
  - 单次：打开 `platform.html?promptEditor=legacy`。
  - 持久：浏览器控制台执行 `localStorage.setItem("vipeakPromptEditorMode", "legacy")` 并刷新。
  - 会话内：控制台执行 `setVipeakPromptEditorMode("legacy")`。
  - 恢复 rich：`localStorage.setItem("vipeakPromptEditorMode", "rich")` 并刷新。
- 代码回滚：回退本次 prompt-editor 提交即可；旧 textarea 路径保留，回退不涉及数据库或业务数据迁移。
- 新增 `platform.prompt-editor.js`、`platform.prompt-editor.css`、`vendor/vipeak-prompt-editor.src.js`、构建产物 `vendor/vipeak-prompt-editor.js`、`test/prompt-editor.test.js`。构建命令：`npm run build:prompt-editor`。
- prompt 写入点改为 `window.setAdvancedPromptValue()`；提交读取改为 `window.getAdvancedPromptValue()`；引用菜单、选区坐标、替换 token 和高度调整均支持 rich/legacy 双路径。
- 验证：`test/prompt-editor.test.js` 6/6；相关 `node --check`、Python compile、`git diff --check` 均通过。真实 Chrome/CDP 验证中文、emoji、多行、@引用、Backspace、Cmd/Ctrl+Enter、textarea 同步及 rich→legacy 切换通过。
- 隔离提交只包含 prompt-editor 相关文件，明确排除了工作区中未完成的 Test 模式路由/样式、Vega 和其他改动。
- 集成提交：`old-site` / `8564b9a`；已推送远端。发布提交：`platform-release` / `925cfa6`，使用 `--force-with-lease` 从 `0e7f572` 安全更新。
- 部署：仅 `123vips.com`（old 站），`scripts/deploy_local.sh --site old` 成功；部署端 release boundary 通过，健康检查返回 `200 {"ok":true}`，线上 `platform.html` 已引用编辑器 CSS，`platform.js` 已加载编辑器资产。线上 `platform.html` 与本地哈希差异来自发布工具正常注入的 SEO 和缓存版本号；编辑器 JS/CSS/vendor 三个文件哈希一致。live 未部署。
- 回滚：优先使用 `?promptEditor=legacy` 或 localStorage 的 `vipeakPromptEditorMode=legacy`；代码可回退 `8564b9a`。发布分支回滚值：部署前 `platform-release=0e7f572`（对应 `old-site=05e397c`）。
- 恢复原工作区：原 `stash@{0}`（`pre-C-scheme-backup-20261107`）已 apply，Test 模式/Vega 等原改动已恢复，4 处仅涉及 Test CSS 发布清单的冲突已按保留 Test 样式解决；stash 暂不 drop，作为额外保险。恢复后的 Test 模式定向测试 10 项中 1 项因既有精确 `hashchange` 断言未同步而失败（不是 C 方案引入），prompt-editor 6/6 通过；语法、Python compile、`git diff --check` 通过。
- 后续问题（2026-11-07）：用户反馈复制长文本后删除，输入框反而/持续变高。根因是富文本测高直接读取 `scrollHeight`，而元素当前 `height` 未归零时 `scrollHeight` 不会低于现有高度，导致高度只能增不能减。修复为测高前统一设置 `height=0px`、`overflowY=hidden` 再读 `scrollHeight`；新增对应回归测试。
- 高度修复验证：`test/prompt-editor.test.js` 7/7；真实 Chrome/CDP 在线上富文本编辑器验证长文本高度 `192px` 删除为短文本后缩回 `138px`，且 textarea 同步值正确。
- 高度修复部署：集成提交 `old-site` / `125a828`，发布提交 `platform-release` / `9bb3dc6`；已推送并用 `scripts/deploy_local.sh --site old` 部署到 `123vips.com`，release boundary 通过，`/api/health` 返回 `200 {"ok":true}`。线上 `platform.create.parts/part-04.js` SHA-256 与本地一致（`ae795dc2...`）；live 未部署。
- 状态：已完成并部署 old 站；live 未部署。

## Canvas concurrent node generation (2026-11-07)

- User reported starting generation on one node disabled generation buttons on every other node until the first finished.
- Replaced the global run gate in `workflowNodeRunState()` with a per-node pending set (`workflowRunningNodeIds`); only the node currently generating is disabled.
- `runWorkflowSingleNode()` now adds/removes its own node id independently, and errors/cancellation are scoped so concurrent runs cannot overwrite another node's state.
- Local Chrome/CDP acceptance held the first generation request open, confirmed the first node was disabled while the second remained runnable, then started the second; both `/api/advanced/generate` requests were emitted (2 calls), the canvas stayed mounted, and no runtime errors occurred.
- Verification: targeted workflow suites 33/33; `node --check` for parts 05/06; `git diff --check`; production deployment passed.
- Commit `8b68b5c`; release `6619bde`; deployed to `123vips.com`. `/api/health` returned `200 {"ok":true}`, release boundary passed, and production hashes for config/parts 05/06 match local.

## Canvas result media ratio separation fix (2026-11-07)

- User reported generated 1:1 result media remained cropped and preview/controls were still coupled by a shared fixed height.
- Removed the `210px` cap and scrollbar from `.site-generation-result`; result preview and generation controls now size independently.
- Result media now uses intrinsic dimensions (`width: auto`, `height: auto`, `max-width: 100%`) with a safe `min(360px, 42vh)` cap, preserving 1:1 and portrait ratios without cropping.
- Local Chrome/CDP with a 512x512 generated image: result card `394x362`, result area `418x387`, controls `418x373.75`; preview overlay frame `680x680` and image `678x678`; no runtime errors.
- Verification: targeted workflow suite 29/29; production webpack build passes with bundle-size warnings only; `git diff --check` passes.
- Commit `6f0d4cf`; release `18b0aaa`; deployed to `123vips.com`. `/api/health` returned `200 {"ok":true}`, release boundary passed, and production `canvas.js` SHA-256 matches local (`c4c9e74d...`, 555087 bytes).

## Canvas generated-image 1:1 thumbnail crop fix (2026-11-07)

- User reported generated 1:1 images were still not fully visible inside canvas result cards.
- Root cause was `.site-image-result img { object-fit: cover; }`, which cropped media inside the square result tile. Changed it to `object-fit: contain` so the complete generated image is visible.
- Verification: targeted workflow suite 29/29; production webpack build passes with existing bundle-size warnings; `git diff --check` passes.

## Canvas preview intrinsic-size crash fix (2026-11-07)

- User reported the media preview still had the wrong aspect ratio and clicking a generated image/video cleared the entire canvas. Reproduction showed `fitPreviewDimensions()` received `null` before media metadata loaded and dereferenced `size.width`, throwing inside the preview portal and unmounting the editor.
- `MediaPreview.js` now null-guards missing size, reads the mounted image/video from a ref for cached media, listens to both video `loadedmetadata` and `loadeddata`, and updates the fitted frame only when real dimensions are available.
- Local Chrome/CDP acceptance with an 800x300 generated image: clicking the result keeps the canvas mounted (1 node, React Flow present) and opens the overlay; fitted frame is 960x360, intrinsic size is 800x300, body scroll is locked, and no runtime errors occur.
- Verification: targeted workflow suite 29/29; production webpack build passes with existing bundle-size warnings; `git diff --check` passes.

## Canvas preview fits intrinsic media dimensions (2026-11-07)

- User asked the canvas preview window to size itself from the media dimensions.
- `MediaPreview.js` now reads image `naturalWidth/naturalHeight` and video `videoWidth/videoHeight`, fits that ratio inside the available viewport, and recalculates on resize. Videos are no longer forced to 16:9 after metadata loads.
- Verification: targeted workflow suite 29/29 and `git diff --check` pass; production webpack build passes; local Chrome confirms the new preview sizing CSS is loaded.

## Canvas trash deletion crash fix (2026-11-07)

- User reported the node trash button still cleared the whole canvas while browser back now worked.
- Root cause was not navigation. `NodeLayout` deleted the business node while React Flow still rendered its stale node component; `SiteImageGenerationNode`/`SiteVideoGenerationNode` then called helpers such as `workflowNodeOwnResultImages`, `workflowNodeRunState`, and `workflowCostLabel` with a null business node, throwing and unmounting the canvas.
- Deletion now syncs the React Flow graph before notifying the removed node hook, and both generation node types return no node shell while their business data is momentarily absent. Result helpers also guard null records.
- Verification: targeted workflow suite 29/29; `node --check platform.ui.parts/part-06.js`; `git diff --check`; production webpack build passed. Local Chrome/CDP actual trash click on the second node leaves `editor:true`, `flow:true`, `href:#workflow`, only the first node remains, and selection clears.
- Deployment: `old-site` `5bcabad`; `platform-release` `27720cb`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`. Production `workflow-react/dist/canvas.js` SHA-256 matches local: `34a180bec16e6f8b3b2954cffe9aab883fb79528a7deedb7b268fe2cebb066bf`. Live was not deployed.

## Canvas repeat-generation parameter isolation (2026-11-07)

- User reported that clicking Generate on a node with an existing result created a new node whose reference media included the source node's result. Root cause: `workflowGenerationRunNode()` connected `source -> new`, so the new node consumed the source output as an upstream input.
- Repeat generation now clones only the source node's own generation parameters and explicit reference arrays, and copies its existing upstream input edges to the new node. It never connects the source node itself to the replacement node, so the prior result does not become an input.
- Regression contract: `test/workflow-canvases.test.js` asserts `cloneWorkflowInputEdges(node.id, newNode.id)` and rejects `connectWorkflowNodes(node.id, newNode.id)`. Targeted workflow tests pass 29/29; syntax and `git diff --check` pass.
- Repeat-generation placement now uses the actual 420px site card width plus a 28px sibling gap; additional results stack below at 644px intervals. This keeps the new result card visibly adjacent to its source instead of jumping by the legacy 520px + 56px layout.
- Deployment: `old-site` `4997746`; `platform-release` `c379eefff3e8214e766a0bd4341475ccb3ce2d2e`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. Production `/api/health` returned `200 {"ok":true}` and release boundary checks passed. Served production `platform.ui.parts/part-06.js` contains `cloneWorkflowInputEdges` and no longer contains `connectWorkflowNodes?.(node.id, newNode.id)`. Follow-up placement fix: `old-site` `23afcdc`; `platform-release` `9e08d41`; production health 200 and served `workflowGeneratedNodePosition()` uses 420px card width + 28px gap, stacking additional results at 644px intervals. Live was not deployed.

## Canvas back navigation and scoped deletion fix (2026-11-07)

- Superseded the earlier library-return behavior. Browser/Android back while a canvas project is open is now an in-canvas action: it deletes only the current selection, leaves all other nodes intact, and restores `#workflow` so the site shell cannot hide or tear down the canvas. `popstate` and `hashchange` from one back gesture are deduplicated. The explicit toolbar `← 返回` still returns to the project library.
- Deletion no longer auto-selects a fallback node, so repeated back/delete gestures cannot cascade through multiple nodes. React Flow selection and persisted business selection are synchronized on pointerdown/click; trash uses `pointerdown` so React Flow drag handling cannot swallow it. The badge uses Bootstrap Icons `bi-trash3`.
- Verification: targeted workflow tests pass 29/29; syntax checks, `git diff --check`, and production webpack build pass. Local Chrome/CDP verified that selecting `n2` then invoking browser back leaves `n1`, clears selection, and remains at `#workflow`; trash click removes only its own node.
- Deployment: `old-site` `b10eb33`; `platform-release` `acab55f`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`. Production `workflow-react/dist/canvas.js` SHA-256 matches local: `c6d099b5d551fe8ef8cf7c28fa17a225d7d5a55226189ed143ad2004b5abd7cd`; served `platform.ui.parts/part-06.js` contains the deletion fix and served `platform.main.js` contains `handleWorkflowCanvasHistoryBack`. Live was not deployed.

## Canvas generation node isolation fix (2026-11-07)

- Fixed single-node generation clearing downstream results. `runWorkflowSingleNode()` no longer calls `clearWorkflowExecutionResults({ fromNodeId })`, so generating an image cannot erase a connected video node preview.
- Single-node generation now resolves its target through `workflowGenerationRunNode()`. When the clicked node already has a preview, upload, reference, record, or task, a same-type node is created, selected, auto-connected from the source, marked `生成中`, and used for submission/polling. Nodes without prior content run in place.
- Direct image/video generation now stores the final result on that same target node through `workflowStoreCompletedNodeResult()`. It no longer creates a separate post-completion result node. The placeholder flag is cleared when generation succeeds.
- Uploading media no longer clears execution results from the receiving node or its downstream nodes; this protects existing connected previews while adding a linked upload node.
- Deletion behavior is scoped to selected canvas elements, nodes have a top-right delete badge, and project-list thumbnails use the last content-bearing node.
- Tests: `node --require ./test/source-compat.js --test test/workflow-canvases.test.js` passes 28/28. `node --check platform.ui.parts/part-05.js`, `node --check platform.ui.parts/part-06.js`, `git diff --check`, and production webpack build pass.
- Deployment: `old-site` `e592b58`; `platform-release` `63fca81`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}` and release boundary checks passed. Production `platform.ui.parts/part-06.js` and `workflow-react/dist/canvas.js` hashes match local (`d1a7e710...`, `179eb6be...`). Live was not deployed.

## Media ingest deployment verification (2026-11-07 final)

- Deployed fixes: `old-site` `812754e`, `platform-release` `4e670ed`; only `123vips.com` was deployed. Health returned 200 and release boundary verification passed.
- Production queue after deploy: `ready=402`, `processing=5`, `failed=1498`, `queued=0` at verification time. No stale processing older than 20 minutes. The five processing rows were freshly claimed and active, not stuck.
- Generation transfer state is now reconciled in bounded batches: records whose ingest job is failed can no longer remain indefinitely at `advancedDownloadStatus=preparing`. Production verification: `advanced_preparing=5` (matches active processing), `advanced_failed=1498`, `advanced_ready=806`, and `preparing_with_failed_job=0`.
- Historical failures are dominated by expired/forbidden upstream URLs (mostly old Volcengine TOS links returning 403), not host concurrency.
- R2 decision confirmed: OSS serves new media (`storageProvider=oss` / `assets-cdn.123vips.com`); R2 remains required for historical `media.123vips.com` compatibility (4,322 video URLs and 4,070 poster URLs at final inspection). Do not remove R2 until those objects are migrated.
- Tests: `node --require ./test/source-compat.js --test test/generated-assets-on-demand.test.js` passes 20/20; `node --check` and `git diff --check` pass.
- Runtime after deployment: service active, zero restarts, approximately 27-36% CPU and 5-6% memory shortly after startup.

## Admin-only Test preview route (2026-11-07)

- User requested a main-nav Test entry visible only to administrators, with the new Generate visual available inside Test while formal Generate remains unchanged until acceptance.
- Implemented `test` as an authenticated admin-only route mapped to the existing `data-panel="advanced"` business flow. No second generation state machine or backend flow was added.
- Added hidden `Test` navigation entry; role gate runs before tenant allowlists, so tenant menu restrictions cannot hide Test from admins.
- Refreshing `#test` while session restoration is pending is preserved via `state.pendingAdminTab`; explicit navigation elsewhere clears it. Non-admin/guest routes fall back safely.
- Added `platform.test-generate.css`, sourced from the previous composer design and scoped entirely to `body.platform-test-mode`. Formal `#custom`/Generate does not receive these styles.
- Registered the Test stylesheet in HTML, static asset serving, release snapshot filtering, deployment path validation, and old/new sync tooling.
- Added `test/platform-test-mode.test.js` covering nav visibility contract, role/tenant ordering, Advanced DOM reuse, refresh restoration, pending cleanup, release registration, and CSS scope isolation.
- Test-internal Advanced actions now use `setAdvancedWorkspaceTab()`, preserving `#test` when already in Test and using formal `#advanced` otherwise; template, case, asset, character and chat-to-generate flows no longer drop admins back to formal Generate.
- Fixed the self-cancelling Test upload selector (`.is-create-custom:not(.is-create-custom)`).
- Verification: syntax checks and `git diff --check` pass; targeted `platform-site-profile`, `advanced-result-refresh`, and `platform-test-mode` tests pass 36/36. `advanced-custom-ui.test.js` still has known pre-existing source-extraction failures under `source-compat` (not caused by Test route). Full server preview requires `DATABASE_URL` and fails clearly without it, per repository storage rule.
- Not deployed. Pending user acceptance/browser verification with a real PostgreSQL-backed environment.

## Media ingest queue drain and OSS/R2 decision (2026-11-07)

- Root cause of the large backlog: 1,119 queued rows had `attempts >= 5`; the claim SQL only selects `attempts < 5`, so raising worker concurrency alone could never drain them.
- `expireExhaustedMediaIngestJobsInDb()` now moves retry-exhausted queued rows to terminal `failed`. Permanent media errors (400/401/403/404/410) are marked failed immediately with `available_at='infinity'`, so the failed-row retry condition cannot re-claim them. Temporary errors (408/425/429/5xx/timeouts/network) still retry up to 5 times.
- Worker concurrency default raised from 2 to 3, matching the verified 4-vCPU/7GB host capacity; `.env.example` and tests are synchronized.
- Successful transfers now record bytes in `app_media_ingest_jobs.bytes` (video + poster + images), so future capacity reports are meaningful.
- Storage decision: new generated media uses Singapore OSS + `assets-cdn.123vips.com`; R2 is not needed for new media. R2 configuration/signing remains only for historical `media.123vips.com` records (about 4,322 rows at inspection time) until those objects are migrated. Do not remove R2 yet.
- Verification: `node --require ./test/source-compat.js --test test/generated-assets-on-demand.test.js` passes 20/20; syntax checks and `git diff --check` pass.

## Recent media ingest status report (2026-11-07)

- User asked for a recent media-transfer (转存) status report. Production PostgreSQL `app_media_ingest_jobs` snapshot at `2026-11-07T09:24:17Z`: 1,896 jobs created in the last 24h, with 391 ready, 1,172 queued, 21 processing, and 312-314 failed while the queue was moving.
- Important interpretation: 1,489 of the 1,896 jobs reference generation records older than 7 days; 939 reference records older than 30 days. This is predominantly historical backfill, not 1,896 fresh generations. Oldest source record is from 2026-08-20.
- Completed recent jobs: average 17.6s, p50 10.5s, p95 52.8s from enqueue through transfer completion.
- Dominant failures are expired/forbidden upstream source URLs: 299 final and 51 retrying `Failed to download generated video: 403`; 12 image-download 403s; one OSS multipart `SignatureDoesNotMatch`. Most failing video URLs are old Volcengine TOS links.
- Source health: `advanced-wan30` 49 ready / 959 open / 121 failed; `advanced-seedance` 189 / 218 / 154; `advanced-seedance-nsfw` 53 / 12 / 26; `advanced-seedance25-vega` 50 / 0 / 0; Vega 1.5 Pro 50/50 ready.
- Operational/data gaps: some rows with `attempts >= 5` remain status `queued`; `app_media_ingest_jobs.bytes` is 0 for all jobs, so transferred bytes/storage volume cannot be reported reliably. No code or deployment changes were made for this report.

## Canvas preview close button moved to media frame (2026-11-07)

- User reported the media preview close button was too far away at the viewport corner.
- Wrapped preview media in `.site-media-preview-frame` and moved the close button inside that frame at `top: 10px; right: 10px`, so it follows the actual image/video bounds. Mobile keeps the same frame-relative positioning.
- Verification: workflow canvas tests pass 26/26; `git diff --check` passes; webpack production build succeeds with existing size warnings.
- Deployment: `old-site` `d93bf4e`; `platform-release` `8c1d4f1`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`. Production `workflow-react/dist/canvas.js` SHA-256 matches local (`84dc6a89c3b68ec0211d4afd783e8c86fdc4da6f9b91c26845b11ecdf472fbbc`). Live was not deployed.

## Canvas media preview size bounds (2026-11-07)

- User asked to control the preview popup size rather than letting media fill the entire viewport.
- Canvas media preview stage is now capped at `960 × 680` on desktop, uses `calc(100vw - 48px)` / `calc(100vh - 80px)` bounds, scales down with a mobile breakpoint, preserves image aspect ratio, and renders video at `16:9`.
- Verification: workflow canvas tests pass 26/26; `git diff --check` passes; webpack production build succeeds with existing size warnings.
- Deployment: `old-site` `66a2b6a`; `platform-release` `3298b20`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`. Production `workflow-react/dist/canvas.js` SHA-256 matches local (`b21abeda3c8b850c1a3ef785cb6a404e24ca1f3b0a28b9f545ae64e743062656`) and contains the `960 × 680` preview bounds. Live was not deployed.

## Canvas media preview instead of download (2026-11-07)

- User reported that clicking image/video previews in canvas could navigate/download instead of previewing.
- Added `MediaPreview.js`, a portal-based in-app media viewer. Images render full-size; videos render with controls and autoplay in the preview layer. Escape, the close button, or clicking the backdrop closes it.
- Replaced canvas image-result links and reference-thumbnail links with `MediaPreviewTrigger`. Result and reference media no longer use `<a href>`, `target="_blank"`, or native navigation; context-menu download is prevented on the preview media.
- Both generated results and connected/manual reference thumbnails use the same preview behavior. Video result cards show an explicit play overlay and open the full preview on click.
- Verification: `node --require ./test/source-compat.js --test test/workflow-canvases.test.js` passes 26/26; `git diff --check` passes; production webpack build succeeds with existing bundle-size warnings.
- Deployment: `old-site` `ad4e531`; `platform-release` `441d20b`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`. Production `workflow-react/dist/canvas.js` SHA-256 matches local (`2553ef8db1d95dd6b33a78153f37863e262d077dc0133bec104e216c947f49ff`), contains the preview overlay, and has no `target="_blank"` links. Live was not deployed.

## Generate full rollback correction (2026-11-07)

- User reported the prior rollback still showed model descriptions and merged Resolution inside Ratio. Root cause: `f23e38b` rolled back `platform.css` only; `platform.create.parts/part-02.js` retained the later advanced parameter redesign.
- Restored `platform.create.parts/part-02.js` to the last pre-redesign snapshot, `8fd091b`, which has compact model options with no descriptions and a standalone Resolution chip. Re-applied only the existing 5-line video reference poster/thumbnail/cover preservation from `2a152a0`.
- Removed the regression assertion for merged Resolution from `test/platform-site-profile.test.js`; syntax and `git diff --check` pass. Targeted tests are 46 pass / 8 known unrelated failures.

## Generate pre-redesign rollback redeploy (2026-11-07)

- User requested a strict rollback using the previously established rollback only, with no new fixes or logic.
- Discarded the uncommitted second-pass Generate changes from the working tree and restored `platform.css`, `platform.html`, `platform.create.parts/part-02.js`, `test/advanced-custom-ui.test.js`, and `test/platform-site-profile.test.js` to `f23e38b` (`Restore Generate UI before composer redesign`).
- Redeployed the existing `platform-release` snapshot `ddaeb70b0ff1e5a70d3ccaf903310bb393e91122` to `123vips.com` only via `scripts/deploy_local.sh --site old`; Live was not deployed.
- Production `/api/health` returns `200 {"ok":true}`. `/platform.html` currently serves `platform.css?v=e917fa3adc9d` and `platform.js?v=e917fa3adc9d`.

## Asset video poster and content-hashed platform assets (2026-11-07)

- User report: videos added from Assets through Add had no thumbnail, while regenerated and manually uploaded videos did.
- Advanced Assets cards and the main Assets grid now set the `<video>` `poster` from `reliableAssetPosterUrl(asset)`.
- Adding an asset video as a Seedance reference now preserves `posterUrl`, `thumbnailUrl`, and `coverUrl` on the attachment, so the selected-reference preview keeps its cover.
- Fixed stale production public asset URLs: `currentPlatformAssetVersion()` now hashes shipped platform file contents instead of using file mtimes. Archive/copy releases preserve mtimes, which allowed an old newer-mtime file to keep Node serving the previous CSS/JS cache key even after deployment.
- Regression tests: `platform-refresh-performance.test.js` and `vega-regeneration-media.test.js` pass 23/23; `tencent-vod-vega.test.js` passes 62/62; syntax checks and `git diff --check` pass.
- Deployment: `old-site` `2a152a0`; `platform-release` `b6dae0e`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. Service active; `/api/health` returned `200 {"ok":true}`.
- Production verification: `/platform.html` serves content-hash assets `platform.css?v=0506b5b1df8e` and `platform.js?v=0506b5b1df8e`; immutable cache headers are present. The three deployed create-part files match local SHA-256 (`part-01` `758b8a14…`, `part-02` `f42f2887…`, `part-05` `d52dff52…`) and contain the video `poster`, preserved poster/thumbnail/cover fields, and Assets-card `poster` logic. Live was not deployed.

## Canvas save serialization and video @ mention picker (2026-11-07)

- Root cause of the intermittent `A workflow save is already in progress.` error: React had its own 350 ms canvas autosave while the site shell queued a second PUT for the same canvas. The backend correctly rejected overlapping writes with `429 WORKFLOW_CANVAS_UPDATE_IN_PROGRESS`.
- Removed the React-side autosave from `Canvas.js`; graph changes now use the site save queue only. Manual Save/Back/title commit calls `window.saveWorkflowCanvasNow({ name: titleRef.current })`.
- The remaining save path waits 3000 ms, serializes all writes through `state.workflowCanvasSavePromise`, preserves the latest pending name, and retries transient conflict/429 responses up to four attempts with increasing delay.
- Fixed early session hydration calling `loadWorkflowCanvases` before that function was defined by guarding with `typeof loadWorkflowCanvases === "function"`.
- Video generation prompts now use `PromptMentionTextarea`. Typing `@` lists only connected or manually attached image/video references, supports filtering, arrows, Enter/Tab, Escape, and clicking, then inserts `@imageN` / `@videoN`. The existing backend alias normalization supplies the generated payload labels.
- Verification: `node --require ./test/source-compat.js --test test/workflow-canvases.test.js` passes 25/25; syntax checks and `git diff --check` pass; production webpack build passes with existing size warnings.
- Real Chrome/CDP acceptance at `http://127.0.0.1:8767` reports one maximum in-flight PUT, no conflicts, no exceptions, an `@` menu with `@image1`/`@image2`, successful `@image2` insertion, and no visible save-in-progress message. Evidence: `/tmp/workflow-react-verify/save-mention-acceptance.out`.
- Deployment: `old-site` `aea742b`; `platform-release` `004cf20`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`. Production `platform.workflow-canvases.js` contains the 3000 ms delay, serialized promise, conflict retry and save bridge; production `workflow-react/dist/canvas.js` SHA-256 matches local (`99027819b1b2a20c0fac7f606677c5cbbffdd6439e30768095422f42c475b499`) and contains the mention-picker styles. Live was not deployed.

## Canvas generation keeps a separate result node per run (2026-11-07)

- Every successful image or video generation appends a new selected result node (`图片结果 N` / `视频结果 N`) connected from the source node. Previous result nodes remain visible for comparison; the source is never overwritten.
- Result nodes are placed in two columns before starting a new row. Generated result nodes aggregate their own media only, while source nodes expose generated children to downstream nodes.
- Uploaded source nodes now return only their uploaded preview from `workflowNodeOwnResult*`; task records on an upload node can no longer leak a newer generation into that uploaded preview.
- Verification: workflow access/canvas tests pass 26/26; syntax checks and `git diff --check` pass; production webpack build passes with existing size warnings.
- Real Chrome/CDP acceptance covers image upload + two image generations, video upload, and two video generations. Each run adds one result node, retains previous results, preserves the uploaded source preview, connects every result to its source, and selects the newest result.
- Evidence: `/tmp/workflow-react-verify/generation-history-video-acceptance.out`, `/tmp/workflow-react-verify/generation-history-video.png`, `/tmp/workflow-react-verify/generation-history-image.png`.
- Deployment: `old-site` `a20e7fe`; `platform-release` `cc2494f`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`; release boundary checks passed. Production `workflow-react/dist/canvas.js` SHA-256 matches local (`b92a7d46...`), and deployed canvas files contain generated-result node creation plus upload/result isolation logic. Live was not deployed.

## Canvas manual-create selection and persistent viewport (2026-11-07)

- Manually added image/video nodes now become selected immediately and expose their lower generation controls. Project entry still starts with no node selected.
- Empty projects no longer auto-fit after the first manual node is added. Auto-fit is limited to projects that already contain nodes when opened, so adding nodes does not unexpectedly reset pan/zoom.
- Canvas viewport `{x, y, zoom}` now survives project changes, project list navigation, and server-backed reloads through the PostgreSQL canvas record. Viewport normalization is covered in `workflow-canvases.js` and the client bridge.
- Verification: workflow access/canvas tests pass 25/25; syntax checks pass; `git diff --check` passes; production webpack build passes with size warnings only.
- Real Chrome/CDP acceptance passed at `http://127.0.0.1:8767`: project opens unselected, manual image node is selected with visible controls and unchanged viewport, zoom controls change the viewport, and back/reopen restores `{x:-156.96,y:-104.98,zoom:1.44}` from the mock server workflow while selection stays empty.
- Evidence: `/tmp/workflow-react-verify/manual-selection-viewport-acceptance.out`, `/tmp/workflow-react-verify/manual-selection-viewport-before-back.png`, `/tmp/workflow-react-verify/manual-selection-viewport-reopened.png`.
- Deployment: not deployed.

## Canvas upload creates linked selected preview node (2026-11-07)

- Uploading an image from a canvas node now uploads through the existing PostgreSQL-backed `/api/user-assets` flow, creates a new `imageGenerate` node, displays the uploaded image as its preview, selects it, and opens its generation controls. Uploading a video creates a `unifiedVideoGen` node the same way.
- Each uploaded file gets its own node. The new node is automatically connected from the new preview node into the node where the file was uploaded. Uploading multiple files creates multiple linked nodes; the last one stays selected.
- The uploaded preview is stored in the normal generation result fields (`resultImageUrl` / `resultVideoUrl` plus asset IDs), so a later successful generation replaces the preview through the existing result flow without separate preview state.
- Regression coverage is in `test/workflow-canvases.test.js`. Workflow access/canvas tests pass 25/25; syntax checks and `git diff --check` pass. Real-browser acceptance passed for image and video uploads, including new-node creation, auto-edge, selection, preview, visible generation controls, and generated-result replacement.
- Browser screenshots: `/tmp/workflow-react-verify/reference-graph-upload-image.png` and `/tmp/workflow-react-verify/reference-graph-upload-video.png`.
- Deployment: not deployed.

## Canvas preview and selected-only generation controls (2026-11-07)

- User clarified that image/video previews must stay separate from generation controls: unselected nodes show only the preview; controls appear only when selected.
- Added selection state to `NodeLayout`, passed `selected` from both site generation node components, and marked lower generation sections `is-selected-only`. CSS hides those sections by default and shows them on `.site-generation-card.is-selected`.
- Fixed fan-in media derivation: `workflowNodeResultImages()` and `workflowNodeResultVideos()` now trim/filter null and empty values before deduplicating, eliminating the bogus `"undefined"` video reference that made two image inputs display `参考素材 3 / Video 1`.
- Kept Seedance aliases aligned with payload order: connected/manual images are deduplicated, displayed as `Image 1`, `Image 2`, etc., and `@image1`/`@图片2` normalize to the server contract.
- Verification: workflow access/canvas tests pass 25/25; syntax checks and `git diff --check` pass; production webpack build passes with size warnings only.
- Real-browser acceptance at `http://127.0.0.1:8767`: two real pointer-dragged image->video edges produce `参考素材 2`, two thumbnails, labels `Image 1|Image 2`, payload images in matching order, and prompt `让 Image 1 和 Image 2 在雨中拥抱`. Unselected all three nodes hide controls while previews remain; selecting image/video reveals only that node's controls. Selecting the second edge and pressing Delete updates the count to 1 and thumbnail count to 1; manual plus linked references coexist.
- Screenshots: `/tmp/workflow-react-verify/reference-graph-unselected-selected.png` and `/tmp/workflow-react-verify/reference-graph-connected.png`.
- Deployment: not deployed.

## Generate composer matches supplied interaction design (2026-11-07)

- User asked to read the supplied `/Users/x042/Desktop/视频生成页面-交互重设计(1).html` carefully and apply its styles to the real Generate page without changing any generation flow.
- Production UI changes are scoped to `platform.html`, `platform.css`, and `platform.create.parts/part-02.js`. The supplied design file and unrelated dirty worktree files were not modified.
- Matched the source design's dark composer card, pink underlined tabs, 130px prompt editor with mention highlighting, dashed reference upload surface, quiet parameter chip bar, ratio/resolution grouped chip, full-width pink/purple Generate button, inline ratio picker, resolution buttons, duration slider, model/mode option rows, and responsive layout.
- Preserved `advancedPrompt`, `advancedUploadBox`, `advancedImage`, `advancedParameterChips`, `advancedParameterPanel`, `advancedParameterShell`, and `advancedSubmitBtn`. Native selects remain the submission source; picker selections update the existing select and dispatch its existing `change` event. Generation, upload, pricing, validation, API, and database behavior were not changed.
- CSS cache key bumped to `generate-composer-design-20261107-1`.
- Parameter chips now toggle closed when the same chip is clicked again; switching to another chip replaces the open picker. Picker content follows the supplied design: model rows with icon/title/description, mode rows, grouped ratio + resolution, and duration title above the slider.
- Verification: real Chrome/CDP at 1440x1100 confirmed same-chip close, cross-chip switching, and model/mode/ratio/resolution/duration content. `node --check platform.create.parts/part-02.js` and `git diff --check` pass; the targeted Generate picker test passes 1/1. Closed-state and open-picker screenshots were visually checked against the source design.
- Deployment: `123vips.com` only. `old-site` `a6af8d0`; `platform-release` `f829a69`; deployed via `scripts/deploy_local.sh --site old`; `/api/health` returned `200 {"ok":true}`. Production Generate acceptance confirms visible parameter chips and Mode/Ratio pickers. Live was not deployed.

## Download signing on every click (2026-11-07)

- Optimization: both download handlers now authenticate with `requireUser(req, res, { loadDb: false })`; click-time signing performs targeted session/user and generation-record queries instead of loading the full business database.
- Added a regression assertion in `test/download-signing.test.js`; targeted download/media/Undress tests pass 37/37, syntax checks and `git diff --check` pass.
- Production signed-download probe (temporary DB user/session/record with successful signed storage target, cleaned up immediately): 10/10 HTTP 200; median total 5.40ms, p95 7.83ms; response source `r2_signed`, `expiresIn: 600`. Warm three targeted DB queries measured median 1.39ms. Signing is local HMAC with no upstream network request.
- Deployment: old-site `1fa67ed`; platform-release `21d96f5`; deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; health returned `200 {"ok":true}`.

- User reported Safari opening generated-media download links in a player and showing a timeout. Confirmed signed OSS URLs expire after 600 seconds, while ordinary download used the cached CDN URL in the generation record and opened it with `target="_blank"`.
- Standard downloads now always request `/api/generation-records/:taskId/download-url` at click time and immediately navigate the current context to the fresh attachment URL. The stale-URL fast path and popup/new-tab behavior were removed.
- If fresh signing fails, standard downloads fall back to the same-origin authenticated `/api/generation-records/:taskId/download` proxy, which always returns `Content-Disposition: attachment`. Legacy records without a task id retain their stored URL fallback.
- `download2` keeps its existing R2 preparation polling path and also uses the attachment navigation helper.
- Added `test/download-signing.test.js` and updated `test/undress-tool.test.js`. Targeted signing/download tests pass 36/36; `node --check` and `git diff --check` pass.
- Deployment: `old-site` `9f01a1a`, `platform-release` `6567a17`; deployed only to `123vips.com` with `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}` and production `platform.ui.parts/part-02.js` contains the re-sign path with no popup/new-tab download behavior. Live was not deployed.

## Seedance recent URL audit (2026-11-07)

- User asked whether recent SD tasks had started sending URLs upstream again. Audited production PostgreSQL `app_generation_records` for the latest 24 hours, not just source code.
- Ordinary `advanced-seedance` (225 success / 24 failed) and `advanced-seedance-nsfw` (64 success / 20 failed) never store `upstreamPayload.FileInfos`; their upstream image/video/audio URLs are under `upstreamPayload.content[]`.
- All recent ordinary SD / Fast / Seedance 2.5 upstream media values are `asset://asset-...`; no public HTTP(S) media URL is present in those fields. Pro 1.0 (`advanced-seedance20-vega`, 7 success / 1 failed) and Pro 1.5 (`advanced-seedance25-vega`, 47 success / 1 failed) use `FileInfos[].Url`, also all `asset://asset-...`. No recent Pro task reverted to HTTPS `FileInfos`.
- Failure mix in the latest 24 hours is upstream content moderation and copyright/audio restriction, not media URL delivery. `advanced-seedance`: 12 sensitive-content, 11 copyright/audio, 1 other. `advanced-seedance-nsfw`: 7 sensitive-content, 6 invalid-parameter, 4 copyright/audio, 3 other. Pro 1.0 and 1.5 each had 1 copyright/audio failure.
- Example `cgt-20261107050322-50d01c` succeeded with six `asset://` references in `content[]`; example `cgt-20261107111115-77fdc1` failed on upstream sensitive-image validation while `content[1].image_url.url` was `asset://asset-20261107111115-685l7`.
- No code change was required for this audit. An exploratory local attempt to rewrite gateway `asset://` values was reverted after production evidence showed it was not the reported regression.

## Source canvas interaction port final verification (2026-11-07)

- User rejected the prior custom canvas and required a direct adoption of the source `canvas_web.zip` React Flow interactions, source-style project cards, site styling, and site-owned image/video generation nodes.
- Verified source-style project grid: 4 columns, 16:9 mini-canvas cards, whole card opens project, three-dot menu supports rename/delete; no plain button cards.
- Verified editor toolbar only has back/title/save/new and canvas toolbar only has image generation/video generation.
- Verified native React Flow interactions in real Chrome: two nodes, real handle drag creates 1 business and 1 DOM edge, wheel zoom is proportional and bounded, upload preserves 2 nodes/1 edge and adds a thumbnail, save/reopen preserves 2 nodes/1 edge/thumbnail. Browser runtime errors: none.
- Fixed opening viewport sizing: fit now waits for React Flow initialization, measures the real canvas, uses `getNodesBounds` plus card-size fallback, and applies safe top/right/bottom/left padding. Reopening shows the graph instead of `translate(0,0) scale(1)` or an extreme zoom.
- Handles are positioned directly on the card border and vertically centered in the card header (delta within 1px in verification).
- Standard targeted command passes 23/23: `node --require ./test/source-compat.js --test test/workflow-access.test.js test/workflow-canvases.test.js`. Production webpack build succeeds with bundle-size warnings only. `git diff --check` passes.
- Commit: `40d9376` (`Port source React Flow canvas interactions`) on `old-site`. Release snapshots: platform `432727f70464abe38445e7c8966ade3e73f5c68c`, live `7fb5e0148c45ef808d572ca3e75ecbaf901ebda5`.
- First deployment attempt pulled stale remote `platform-release` commit `162a302`; this was not browser caching. Pushed the correct snapshot `432727f` with force-with-lease, then redeployed. Deployment expected commit was `432727f`; release-boundary checks passed and `/api/health` returned `200 {"ok":true}`. Production canvas hash now exactly matches local build (`6073bc8b...`, 538314 bytes), and `platform.js` loads `workflow-react/dist/canvas.js` and `platform.workflow-canvases.js`. Live was not deployed.
- Visual evidence: `/tmp/workflow-react-verify/full-projects-grid.png`, `full-editor-connected.png`, `full-after-upload.png`, `full-reopened.png`. Acceptance log: `/tmp/workflow-react-verify/full-acceptance-final.out`.

## Upstream reference mirror 403 fix (2026-11-07)

- User reported generation failures with `下载上游参考镜像失败:403`; no exact string exists in local source, so traced the shared reference-media path.
- Root cause: private OSS/CDN references could be forwarded upstream as expired signed URLs, and Vega media-library cache identity used the full short-lived signed URL.
- `publicHttpUrlForUpstream()` now refreshes OSS signatures from the durable object path before submission. Vega media-library cache rows use canonical unsigned object URLs and receive a fresh signature only at `CreateAigcMaterial`.
- Seedance gateway/direct reference, video, and audio boundaries now normalize OSS URLs before forwarding. Changed `server.parts/part-11.js`, `part-24.js`, `part-26.js`, `part-43.js`, and `tencent-vod-vega.js`.
- Verification: focused 3/3 tests pass for expired OSS refresh, canonical Vega cache identity/fresh import URL, and Seedance gateway refresh. `node --check tencent-vod-vega.js`, server load, and `git diff --check` pass. Broader historical source-shape tests still have unrelated stale assertions, so they are not claimed green.
- Deployment: old-site `9cbb612`; platform-release `9ccde59`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`; release boundary checks passed. Live was not deployed.

## Video reference labels layered above posters (2026-11-07)

- User reported restored video thumbnails hid the `Video 1` / `Video 2` badges.
- Cause: the global label span was rendered outside `.advanced-video-preview`; the poster/video layers covered it after thumbnails were added.
- Fix: video chips now render their label inside the video preview surface at `z-index: 8`, while non-video chips keep the original label placement.
- Verification: `node --test test/vega-regeneration-media.test.js` 12/12; `node --check platform.create.parts/part-05.js`; `git diff --check`; headless visual fixture confirms `Video 1`/`Video 2` above the image layer.
- Deployment: old-site `3776ae6`; platform-release `355cc26`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}` and production JS/CSS contain `advanced-video-reference-label`. Live was not deployed.

## Video reference thumbnails restored in regeneration (2026-11-07)

- User reported two videos restored into `cgt-20261106224218-1800a5` regeneration without thumbnails.
- Server now generates/persists video first-frame posters, and `/api/user-assets/resolve` backfills posters for existing videos. Asset hydration preserves `posterUrl`/`thumbnailUrl`/`coverUrl`.
- Final frontend bug: shared Seedance reference restore rebuilt video objects from a whitelist and dropped poster fields. Restore now spreads the hydrated item and carries all poster aliases into the rendered chips.
- Verification: `node --test test/vega-regeneration-media.test.js` 12/12; syntax and diff checks pass. Production posters return `200 image/jpeg`. Chrome hard reload + Regenerate showed 3 chips and 2 video poster images, both `complete` with natural sizes `810x506` and `640x640`; screenshot `/tmp/video-posters-fixed.png`.
- Deployment: old-site `7792415`; platform-release `8981092`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`. Live was not deployed.


## Canvas source-adoption stepwise work (2026-11-06)

- Goal: adopt `canvas_web.zip` React Flow interactions, retain this site's dark/pink style and business model nodes. Only `imageGenerate` and `unifiedVideoGen`; result area above controls; project list/detail navigation; detail actions only Save/New.
- Actual bundled node source is `workflow-react/src/components/canvas/nodes/siteNodeTypes.js`, which imports `SiteImageGenerationNode` and `SiteVideoGenerationNode`.
- Diagnosed zero workspaces because `.workflow-react-host` had only 2px height; `platform.css` layout correction now gives the host usable canvas area.
- Replaced old `NodeLayout-container` shell with `site-generation-card`; left/right handles now directly border the card with no label/duplicate control. Updated bridge drag handle to `.site-generation-drag-handle`.
- Step 1 pending verification: rebuild workflow-react bundle and confirm node count, handle count, and center-point hit testing in browser.

- Connection fix: React Flow had node dimensions but empty `internals.handleBounds`, so pointer-down bailed before starting a connection. `Canvas.js` now calls official `useUpdateNodeInternals` after node DOM measurement; real drag from image output to video input creates the business edge and DOM edge.
- Result drag fix: dropping generated result media on a target generation node writes `referenceImages`/`referenceVideos` (and asset IDs when available), persists the graph, syncs React Flow, then calls `connectWorkflowNodes`. `useSiteNode` now returns fresh node/data snapshots so in-place business updates trigger React rendering instead of leaving stale result cards.
- Result reader fix: `SiteImageGenerationNode` and `SiteVideoGenerationNode` resolve result data through `workflowNodeById(id)` before calling the site result helpers, preventing React Flow wrapper nodes from producing `"undefined"` result URLs.
- Verification: `/tmp/workflow-react-verify/step-result-drag.out` shows two result URLs render and dropping the first gives target `referenceImages: ["https://cdn.example.test/result-a.png"]` with 1 business/DOM edge. `/tmp/workflow-react-verify/fresh-final-after-result-fix.out` shows project list/detail navigation, 3 nodes and 1 edge retained through upload/control updates, handle-to-border deltas of +/-1px, viewport `{x:0,y:0,zoom:1}`, and no console errors.
- Build: production webpack succeeds with only the existing bundle-size warnings.
- Cleanup (2026-11-07): removed unused copied `workflow-react/src/api/ApiService.js`, `LogService.js`, and `utils/taskRecord.js`; normalized trailing whitespace; `git diff --cached --check` passes. Production webpack rebuild succeeds.
- Re-verification after cleanup: `/tmp/workflow-react-verify/step-result-drag-after-cleanup.out` confirms 2 results, correct first-result reference, 1 business/DOM edge. `/tmp/workflow-react-verify/fresh-final-after-cleanup.out` confirms 3 nodes/1 edge retained through upload and controls, handle-to-border delta +/-1px, viewport zoom 1, no console errors.
- Commit: `7ebc242` (`Adopt React Flow canvas interactions`) on `old-site`.
- Release snapshots pushed: platform `d970096f18e10734ec4d742cbce62432f6693d79`, live `bf1e01a609f0b0e4075756a28748620800bb6ee3`. Platform snapshot contains `workflow-react/dist/canvas.js`; Live snapshot contains no platform files.
- Deployment (2026-11-07): `scripts/deploy_local.sh --site old` succeeded, health HTTP 200 and release boundary ok. `scripts/deploy_local.sh --site live` succeeded, health HTTP 200 and release boundary ok. Current live-release `bf1e01a` is content-identical to concurrent snapshot `0596a80`; no Live content was overwritten.
- Production verification: `https://123vips.com/platform.html` loads `platform.js`, which lazily loads `workflow-react/dist/canvas.js`; the production canvas bundle returns HTTP 200 and contains the site generation handles.

## Seedance regeneration expired signed URL fix (2026-11-06)

### Canonical media hydration and address planning follow-up

- Production record `cgt-20261106224218-1800a5` has exactly three canonical assets: one image (`asset-1792378136626-21ee3188`) and two videos (`asset-1793895814730-cea3b134`, `asset-1793940603600-bec2f1f1`).
- Server list/detail responses batch-hydrate `mediaAssets` from PostgreSQL. Each stored asset returns one preferred `imageUrl`/`videoUrl`, `url`/`publicUrl`/`cdnUrl`/`previewUrl`, the full `assetUrls`, and its internal `assetUri` identity; hydration never appends array entries.
- Frontend history detail and regeneration-restore paths now treat server `mediaAssets` as canonical. Legacy `params`/`upstreamPayload` fields remain fallback-only for records without canonical assets, so `asset://` upstream placeholders cannot become phantom fourth/fifth cards.
- Preview elements use the ordered `assetUrls` candidate chain and advance to the next browser-safe URL on `error`, exposing `素材不可用` only after all candidates fail.
- Changed files for this follow-up: `db.js`, `server.parts/part-01.js` (import only), `server.parts/part-41.js`, `platform.create.parts/part-04.js`, `platform.create.parts/part-05.js`, `platform.ui.parts/part-02.js`, `platform.explore.js`, `test/vega-regeneration-media.test.js`.
- Verification: `node --test test/vega-regeneration-media.test.js` passes 12/12; all changed files pass `node --check`; `git diff --check` passes. Broader direct Node tests still show pre-existing source-wrapper failures unrelated to this change.
- Deployment status: committed as `8e27b6a` (follow-up status commit `859f9a1`); built `platform-release` as `aa19eff` and deployed to `123vips.com`. Production `/api/health` returned `200 {"ok":true}`; deployed frontend/server files contain canonical `mediaAssets`/`assetUrls` hydration and candidate fallback logic. Live was not deployed.

- Production record `cgt-20261106230001-147d65` has a valid `userAssetId` and internal `asset://` identity, but both `mediaAssets.url` and `params.referenceImages[].url` retain an expired OSS/CDN signature. The previous preview fallback did not overwrite the stale parameter URL, so Regenerate showed `素材不可用`.
- Changed `platform.create.parts/part-04.js` so user-asset resolution hydrates both `mediaAssets` and matching `params` preview fields (`referenceImages`, video/audio lists, URL arrays, and first/last-frame URLs). Fresh delivery/local HTTP URLs replace stale signed URLs while `assetUri` remains available for generation.
- Preview URL ranking now records `assetUrls` before copied `dataUrl` values, preventing a stale duplicate in `dataUrl` from shadowing the fresh delivery URL.
- Added production-shaped regressions in `test/vega-regeneration-media.test.js`: expired parameters are replaced by a fresh delivery URL, and local HTTP remains the fallback when signing is unavailable.
- Verification: `node --test test/vega-regeneration-media.test.js` passes 10/10; targeted Vega tests pass 3/3; OSS tests pass 9/9; syntax and `git diff --check` pass.
- Deployment: old-site `c9e7c06`; platform-release `f2f4065`, built from it and pushed with lease protection after fetching the concurrently advanced remote release. Deployed only to `123vips.com` with `scripts/deploy_local.sh --site old`; health returned `200 {"ok":true}` and production `platform.create.parts/part-04.js` contains the parameter-preview hydration and URL-ranking fixes. Live was not deployed.

## Seedance regenerated-record black duplicate media fix (2026-11-06)

- Asset fallback follow-up: `publicUserAsset()` now returns `assetUrls` plus local/public/CDN/delivery preview variants, and the record-restore preview path ranks fresh HTTP URLs above relative `/assets/...` paths while excluding internal `asset://`, `javascript:`, and `file:` sources. Internal `assetUri` remains available only for regeneration.
- Asset fallback verification: `node --test test/vega-regeneration-media.test.js test/oss-storage.test.js` passes 17/17; targeted Vega resolve/regeneration/mirror tests pass 4/4 under `test/source-compat.js`; syntax and `git diff --check` pass. Committed as `4c6be24` on `old-site`.
- Asset fallback deployment: old-site `bbb4a68`; platform-release `4c89031`, built from it and pushed. Deployed only to `123vips.com` with `scripts/deploy_local.sh --site old`; health returned `200 {"ok":true}`. Production `platform.create.parts/part-04.js` contains the ranked URL fallback, and the unauthenticated resolve smoke check correctly returns `401 LOGIN_REQUIRED`.

- Follow-up finding: this production record stores only `userAssetId` values in `mediaAssets`; it has no public preview URLs. The earlier fix still fed internal `asset://` generation identities into preview fields, producing one unavailable image and two black videos.
- Follow-up fix: regeneration now batch-resolves all record asset IDs through `POST /api/user-assets/resolve` before restoring the editor. Preview fields accept only non-`asset://` URLs; internal `assetUri` remains separate for regeneration. Missing previews render the explicit unavailable placeholder, and Vega `sourceUrl` no longer falls back to `asset://`.
- Follow-up regression: production-shaped fixture now has ID-only `mediaAssets`, stubbed resolved HTTP previews, and asserts 3 restored items, HTTP image/video previews, internal `asset://` only in `assetUri`, plus no `asset://` preview fallback when resolution is empty. `node --test test/vega-regeneration-media.test.js` passes 6/6; syntax and targeted `git diff --check` pass.
- Follow-up deployment: old-site `0235583`; platform-release `5ed9b0f`, pushed with lease protection. Deployed only to `123vips.com` with `scripts/deploy_local.sh --site old`; health returned `200 {"ok":true}`. Production `platform.create.parts/part-04.js` contains the resolver/preview split, and `part-05.js` contains the guarded video preview plus unavailable placeholder.

- User record `cgt-20261106224218-1800a5` has exactly 3 persisted `mediaAssets` (1 image + 2 videos), but regeneration preview showed 5 items with 2 black tiles. Database media were correct; the frontend restore path merged public database videos and internal `asset://` videos from `upstreamPayload.content` as separate entries.
- Root cause: `restoreRecordMedia()` unconditionally concatenated `mediaAssets` and `upstreamInputMediaItems()`. The internal `asset://` entries cannot render directly in a browser, so each appeared as a black preview and repeated clicks could stack overlapping restore work.
- Fix: `platform.create.parts/part-04.js` merges upstream internal videos/audio into matching database items by kind/order, preserves the public URL, and attaches the internal `assetUri` needed for regeneration. Added order/identity dedupe. `platform.create.parts/part-01.js` serializes regenerate clicks. `platform.create.parts/part-05.js` and `platform.css` replace failed image previews with an explicit “素材不可用” tile instead of leaving a black/blank item.
- Regression: sanitized production-shaped record in `test/vega-regeneration-media.test.js` restores 1 image + 2 videos, both videos retain public URLs and receive their matching internal `assetUri`; no `asset://`-only video remains. The test file now reads split `server.parts` through `server-source.js` instead of stale `server.js` text.
- Verification: `node --test test/vega-regeneration-media.test.js` passes 5/5; syntax checks and targeted `git diff --check` pass. Broader legacy test files contain pre-existing assertions against unsplit `server.js`/`platform.js` text and fail independently of this change.
- Deployment: old-site `749cef0`; platform-release `06c672f`, pushed with lease protection. Deployed only to `123vips.com` with `scripts/deploy_local.sh --site old`; health returned `200 {"ok":true}` and the production parts contain the merge/serialization/unavailable-preview fixes.

## Automatic media transfer concurrency and large-file safety (2026-11-06)

- User goal: after upstream generation succeeds, persist success first and immediately transfer every generated video/image asset to overseas OSS/CDN without waiting for `download2`; transfer failure must never rewrite generation success/billing.
- `server.parts/part-20.js` enqueues the transfer after a succeeded record is persisted. `server.parts/part-41.js` uses the PostgreSQL `app_media_ingest_jobs` queue and an event-driven global worker pool. `download2` remains a retry/legacy fallback.
- Added a hard global cap through `MEDIA_INGEST_CONCURRENCY`, default 2 on the current 4-vCPU/7GB host, accepted maximum 8. Workers claim only free slots with `FOR UPDATE SKIP LOCKED`; completion frees a slot and wakes the scanner. Empty queues no longer spin.
- Large OSS uploads now use `uploadFileObject`: 8MB bounded reads with at most `OSS_MULTIPART_CONCURRENCY=3` parts in flight per task instead of reading the whole video into RAM. Generated video downloads stream to disk. Two tasks therefore use roughly 48MiB of upload-part buffers plus runtime/stream overhead.
- Capacity planning refreshed from production: 612 successful generations in the last 24h, 520 video-like, 7-day peak 82 successes/hour and 6/minute. Two workers support 4 videos/min at 30s average, 2/min at 60s, 1/min at 120s, and 0.4/min at 300s. The current video rate is about 0.36/min, so two workers have ample throughput; at 3x traffic it requires an average transfer under about 56s. Move to a dedicated worker host for sustained four or more.
- Keep `MEDIA_INGEST_CONCURRENCY=2` until p95 queue wait is consistently below 30s, CPU below 65%, available RAM above 1.5GB, disk free above 20%, and transfer success remains high. Scale to 3 only for a sustained backlog with those gauges still healthy. Do not exceed 4 concurrent transfers on this host for sustained video load.
- Estimated generated-media volume at 430 successes/day and 60% video is about 5–15GB/day at 20–60MB average, or about 10–26GB/day at 40–100MB average. Plan upstream ingress plus OSS egress as roughly two copies; user download traffic is separate CDN egress.
- Found and fixed an OSS V1 multipart signing defect: `uploads` is an empty subresource and must be signed/serialized as `?uploads`, not `?uploads=`. A real 9MB multipart upload to Singapore OSS now succeeds, HEAD verifies the exact byte count, and the test object is deleted.
- Verification: targeted generation/media/OSS suite passes all tests; syntax checks and `git diff --check` pass.
- Deployment: `old-site` `447de7e`, `platform-release` `c27e618`; deployed only `123vips.com` with `scripts/deploy_local.sh --site old`. Health returned `200 {"ok":true}`. Production is 4 vCPU / 7GB RAM / 49GB disk; at check time load was about 2.4, 5.5GB RAM available, disk 51% used.
- Live queue observation after restart: exactly 4 processing remained, so the global cap is not yet authoritative. Root cause: `mediaIngestRunning` is per-process, but the old service instance was draining while the new instance started. Ensure a single production Node process before treating the live count as the global cap; also expire stale 403 retries so they do not consume slots.
- Production host signal at queue sample: load average 1.90/1.78/2.04, 5.4GB RAM available, disk 51% used. Queue p50 completion 12.8s and p95 15.8s; queue wait p50 225.1s and p95 480.8s, dominated by retries of expired historical provider URLs after mass enqueue. The raw queue showed 23 queued / 8 processing, but only 2 processing rows belonged to the current process; 6 were stale rows from the previous process awaiting the 20-minute takeover window and were not consuming worker slots.
- `db.js` now excludes `attempts >= 5` rows from `claimNextMediaIngestJobsInDb`, so exhausted stale jobs cannot be re-claimed. Regression test added.
- Final verification: 126/126 targeted tests pass. Final deployment: `old-site` `14b731f`, `platform-release` `87f8ee7`, deployed only `123vips.com`; health `200 {"ok":true}`.

## Account menu email binding (2026-11-06)

- User goal: keep the Price list entry, show the bound email in the top-right avatar menu for email-login accounts, and let username/password accounts bind an email so they can later use verification-code login.
- `platform.html`: added the conditional “绑定邮箱” avatar-menu entry and account email status elements. `platform.ui.parts/part-01.js`: avatar label prefers the bound email. `platform.ui.parts/part-02.js`: binding entry is visible only for logged-in users when email auth is enabled and no email is bound.
- `platform.create.parts/part-06.js`: account dialog focuses email from the menu entry, shows the bound email read-only, hides binding controls after binding, and refreshes the user after successful verification. `platform.main.js`: wires the menu entry to the account dialog.
- Regression test added to `test/email-auth.test.js`; email auth/SMTP tests pass 9/9, syntax checks and `git diff --check` pass.
- Release: `old-site` `e2cfe4a`, `platform-release` `99957e4`. Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; `/api/health` returned `200 {"ok":true}`. Production HTML and JS contain the binding menu, email-preferred avatar label, conditional visibility, and focused binding dialog. Live was not deployed.

## Direct React Flow canvas adoption with existing business core (2026-11-06)

- User goal: adopt the canvas interaction from `/Users/x042/Desktop/canvas_web.zip` directly, while retaining this site's node definitions, model selectors, uploads/generation, execution, PostgreSQL persistence, and ownership/CRUD. There is no old canvas to preserve; do not incrementally extend the legacy canvas, import reference-project nodes/models, commit, or deploy.
- Vendored React Flow 12.11.3 under `workflow-react/vendor/`; `platform.workflow-react.js` renders native React cards instead of legacy `.workflow-node` HTML, while the existing business graph remains authoritative for creation, connection rules, deletion/bridging, execution and persistence.
- React Flow owns node dragging, selection, pan/zoom, handles, palette drop, empty-canvas double-click prompt creation, minimap, controls, and edge deletion. `platform.ui.parts/part-05.js` exposes the palette/create helpers; `part-06.js` keeps connection validation and business graph mutations.
- Final dimensions match business node widths: image/video references `300px`, prompt/output `360px`, generation nodes `520px`. Zoom is continuous and clamps at `minZoom: 0.1` / `maxZoom: 2`; initial fit uses `padding: 0.2`, `maxZoom: 1`, `minZoom: 0.1`.
- Handles are centered on card borders with no offset. `elevateNodesOnSelect: false` prevents selected cards from covering other handles; the 12px visible handles have a 30px hit target and explicit high stacking. The screenshot verifies both nodes' handles remain reachable without visual cropping.
- Selected React Flow edges now delete through the business graph with Delete/Backspace, and selected node deletion remains bridged through `removeWorkflowNode`. Palette creation, node addition/deletion, drag persistence, model changes and connection changes all update business state and DOM counts together.
- Site styling is scoped under `.workflow-react-host`: dark glass cards, dark headers/results/footer/editor controls, pink selected borders and handles, and dark/pink minimap and controls. No reference model definitions or white node cards are used.
- Verification: `node --check` for the adapter/main/UI parts, `git diff --check`, and `node --require ./test/source-compat.js --test test/workflow-access.test.js test/workflow-canvases.test.js` pass 19/19. Real Chrome verified source handle `right`, target handle `left`, real mouse connection with business edge = DOM edge = 1, edge deletion business = DOM = 0, wheel zoom and button zoom clamped to `0.1 / 2`, selection without viewport movement, prompt add/delete `3 -> 2`, node drag persistence, model `qwen-image3 -> seedream5-image`, no legacy cards, and `consoleErrors: []`.
- Final probe: `/tmp/workflow-react-verify/run-native-final-8.js`; output `/tmp/workflow-react-verify/final-8.out`; screenshot `/tmp/workflow-react-verify/canvas-native.png`; targeted tests `/tmp/workflow-react-verify/targeted-tests-final-3.out`. Cache suffix `react-flow-native-20261106-12`.
- Deployment: not deployed; user did not request deployment.

## Sidebar navigation spacing and More removal (2026-11-06)

- User goal: increase the main sidebar navigation row spacing, preserve compact capsule height, and remove the More entry.
- Desktop-only final correction: increased left sidebar `.top-tabs` row gap from `1px` to `8px` while keeping each navigation capsule at `38px`; mobile spacing and utility-nav spacing are unchanged. Removed the More button/menu markup, overflow cloning logic, post-selection menu closing logic, and related CSS/mobile overrides.
- Updated `test/side-navigation-overflow.test.js` to assert desktop left-nav gap `8px`, desktop capsule height `38px`, and no More implementation.
- Verification: targeted navigation test passes 3/3; `git diff --check` passes.
- Deployment: `old-site` `33b05d8`; `platform-release` `710d3df`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returns `200 {"ok":true}`; production CSS contains the desktop `.top-tabs { gap: 8px; }` rule and preserves `min-height: 38px` capsules. Live was not deployed.

## Unified pink tabs across navigation and sub-tabs (2026-11-06)

- User goal: unify the top navigation, page-level tabs and secondary tabs with the Character page's pink selected style.
- Added the final shared tab layer at the end of `platform.css` so it overrides older page-specific selectors. Covered navigation and grouped navigation, Same-style, Case, Generate, Assets/Result, auth/top-up, chat settings, PlayFlux, creator, access, workflow and Undress.
- Normalized containers and selected states to capsule geometry, pink border `rgba(255,79,163,.72)`, white text, pink gradient and pink glow. Kept larger Same-style tabs and compact secondary tabs.
- Added theme-level overrides in `tool-video.css`, `tool-undress.css` and `site-123vipfans.css`; also unified the Undress case and type tabs.
- Bumped `platform.html` public CSS/JS cache suffix to `pink-tabs-20261106-1`.
- Added regression assertions in `test/platform-site-profile.test.js`.
- Verification: targeted pink-tab assertions pass; CSS brace balance is 0; `git diff --check` passes; headless Chrome confirms identical computed selected styles. The full legacy tests are currently blocked by the pre-existing `server.js` split/test-helper state, unrelated to this CSS task.
- Deployment: `old-site` `3aa19aa`; `platform-release` `342d31d`, built from `3aa19aa` and pushed with lease protection. Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; production checkout is `342d31d`, service active, `/api/health` returns `200 {"ok":true}`. Production HTML serves `mw4vq2cl` and the deployed CSS contains the unified pink tab layer. Live was not deployed.

## Anime restricted to owner account (2026-11-06)

- User clarified the Anime Same-style tab must be visible only to their account, not all users.
- Kept the existing owner/test identity gate in `platform.config.js`: `canUseAnimeTemplates()` returns `isWorkflowTester()`, which currently matches `test01`.
- Updated `test/workflow-access.test.js` to guard the owner-only Anime gate.
- Verification: targeted Anime access assertion and PlayFlux template bootstrap regression test pass; anonymous production Chrome/CDP shows only `cases`, `playflux-video`, and `playflux-image` tabs with `animeAllowed=false`.
- Deployment: `old-site` `c0d09e4`; `platform-release` `cbc4538`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; `/api/health` returned `200 {"ok":true}`.

## Same-style tabs empty after config refresh (2026-11-06)

- User reported the last three Same-style tabs had no visible cards, then clarified data arrived and disappeared again.
- Root cause: `/api/platform/playflux-templates` loaded the 493-template catalog, then `installBootstrapConfig()` treated the intentionally omitted `config.playfluxTemplates` field as an empty catalog and overwrote state while leaving `playfluxTemplatesLoaded=true`, preventing retry.
- Fix: preserve an already loaded PlayFlux catalog when later public/session config snapshots omit it; enable Anime templates for all users; bump runtime cache suffix to `advanced-parameters-20261106-23`.
- Added `test/playflux-template-bootstrap.test.js`. Targeted tests pass 4/4; `git diff --check` clean.
- Production Chrome/CDP verified tabs `cases`, `playflux-video`, `playflux-anime`, `playflux-image`; cards are 103 Video, 265 Anime, 125 Image. Reload keeps 493 templates and 103 Video cards.
- Deployment: old-site `428dc0f`; platform-release `5365d42`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. Initial health poll briefly returned 502 during restart, then `/api/health` returned `200 {"ok":true}`. Production runtime key is `mw4uqr3z`.

## Private Alibaba OSS + CDN integration and production cutover (2026-11-06)

- Goal: add private overseas Alibaba OSS storage and CDN delivery for `123vips.com`, while preserving Cloudflare R2 historical media and `media.123vips.com`.
- Implemented `oss-storage.js` with Singapore/US-only validation, virtual-hosted OSS addressing, private object ACLs, signed CDN URLs, signed Range support, multipart uploads, and R2 fallback for historical records.
- Added PostgreSQL-backed media ingest jobs for asynchronous advanced downloads; no JSON or flat-file runtime fallback was introduced.
- Real Singapore OSS/CDN smoke test succeeded: upload to `vipeak-media-sg`; signed CDN GET `200`; signed Range GET `206`; unsigned GET `403`; `x-oss-cdn-auth: success`; test object deleted afterward. Do not print credentials or signed URLs.
- Production `/etc/raising-game-demo.env` had no OSS variables yet and remained R2-only before cutover. Existing R2 bucket/domain values remain unchanged for historical media. Pre-OSS environment backup: `/etc/raising-game-demo.env.bak-20261106184226` (remote, mode 600).
- Cloudflare DNS is now cut over. Authoritative DNS returns `CNAME assets-cdn.123vips.com -> assets-cdn.123vips.com.queniuaa.com`; public CDN edges resolve to `47.246.8.250` / `155.102.10.4`, and responses from the production server show `server: Tengine` with no `cf-ray`, confirming the Alibaba CDN path.
- HTTPS certificate is valid: Let's Encrypt certificate for `assets-cdn.123vips.com`, expiry 2027-02-04. Signed CDN smoke test after cutover: GET `200`, Range `206`, unsigned `403`, `x-oss-cdn-auth: success`, test object deleted.
- The supplied `cfat_` API token still cannot list DNS records (`403 / 10000 Authentication error`), so the record was changed through the Cloudflare dashboard rather than the API. No further DNS change is needed.
- Required DNS cutover after a valid Zone -> DNS -> Edit token is supplied: CNAME `assets-cdn` to `assets-cdn.123vips.com.queniuaa.com`, Proxy **DNS only**, TTL Auto. Do not touch `media.123vips.com`.
- Compatibility fix: a historical `media.123vips.com` R2 URL is no longer re-signed as an OSS CDN URL when a record-level storage key is present. OSS-origin and `assets-cdn` URLs still sign normally.
- Verification: OSS-focused suite passes 120/120; syntax checks pass; `git diff --check` passes.
- Deployment: old-site `482c2a6`; platform-release `a02ba20`, preserved in tag `oss-prod-a02ba20`; deployed only `123vips.com`. Production env now selects Singapore OSS while retaining R2 values, and `/api/health` is `200 {"ok":true}`.
- Production OSS smoke test passed after final deployment: upload succeeded; signed CDN GET `200`; signed Range GET `206`; unsigned GET `403`; test object deleted. Historical R2 URLs remain on `media.123vips.com` after compatibility fix.

## Same-style selected tab white text only (2026-11-06)

- User requested the original wide four-tab strip, with only the selected label turning white.
- Restored the long pill strip and raised selected text to `#fff`; removed the active fill, active border, pink icon, and white inner label background.
- Isolated the staged CSS to the Same-style tab block so unrelated workflow/canvas dirty changes were not included.
- Verification: `test/side-navigation-overflow.test.js` passes 3/3; `git diff --check` clean; staged diff contains no workflow changes.
- Deployment: old-site `8cbf3ac`; platform-release `cfef8fc`; deployed only to `123vips.com` with `scripts/deploy_local.sh --site old`.
- Production runtime CSS key `mw4u5p3w` confirms `background: transparent`, `color: #fff`, `border-color: transparent`; health is `200 {"ok":true}`.

## Same-style tabs restored to larger size (2026-11-06)

- User approved the Case-matching neutral color treatment and requested the earlier larger tab size.
- Kept transparent borders/background for idle tabs and the `rgba(255,255,255,.10)` active fill with no red/pink border.
- Desktop tabs restored to 38px height, 8px 13px padding, 0.86rem text, 16px icons; mobile uses 38px height, 8px 12px padding, 0.83rem text, 15px icons.
- Cache suffix bumped to `advanced-parameters-20261106-21`; production runtime resource key is `mw4u083i`.
- `test/side-navigation-overflow.test.js` passes 3/3 and `git diff --check` is clean.
- Deployment: old-site `9cb16ee`; platform-release `25883e2`; deployed only to `123vips.com` via `scripts/deploy_local.sh --site old`. Health is `200 {"ok":true}` and production CSS confirms the larger dimensions.

## Workflow canvas interaction port from canvas_web (2026-11-06)

- User asked to inspect `/Users/x042/Desktop/canvas_web.zip`, specifically node creation and connection behavior, then keep only the canvas interaction while preserving our dark/pink UI and our own node/model types.
- Reference extracted at `/tmp/canvas_web_ref_20261106/canvas_web`; useful patterns were `Toolbar.js` center insertion, `Canvas.js` `screenToFlowPosition()` drop placement and `isValidConnection`, and `NodeOperationsProvider.js` create-node-and-connect. Reference model definitions/content were not imported.
- Added a compact six-item node palette: click inserts at the visible canvas center, drag/drop uses `application/x-workflow-node` and places at pointer, and double-clicking empty canvas inserts a prompt node at pointer.
- Clicking an empty input handle now creates and connects the missing source: prompt first; image reference/input second; video generation before output when no upstream generator exists. Existing prompt/media inputs prevent duplicate auto-creation.
- Connection validation now follows our node types: image references -> image/video generation; video references -> video generation; prompt -> image/video generation; image generation/result -> video generation/output; video generation -> output. Self, duplicate, type-invalid, and cycle-producing edges are rejected; reconnect validation ignores the edge being replaced.
- Our node definitions and model IDs remain unchanged. The existing canvas, node editor, save/load, execution, upload, and preview UI stay in place.
- Changed files: `platform.ui.parts/part-05.js`, `platform.ui.parts/part-06.js`, `platform.ui.parts/part-07.js`, `platform.main.js`, `platform.css`, `test/workflow-access.test.js`, `test/workflow-canvases.test.js`.
- Verification: workflow access/canvas tests 18 pass / 0 fail after the final mobile palette CSS-order correction; syntax checks pass for the three UI parts, `platform.main.js`, and `platform.workflow-canvases.js`; `git diff --check` passes. `test/source-split.test.js` remains blocked by pre-existing `server.parts/part-29.js` length.
- Deployment: not deployed; user did not request deployment.

## Same-style tabs use outlined button states (2026-11-06)

- User requested Case-child-tab-like borders and a clear selected state for all four Same-style tabs.
- Same-style tabs now each have a 1px neutral border and subtle dark fill; the active tab uses a pink border with a 10% pink fill and muted text. The inner label remains transparent, so no white pill returns.
- Cache suffix bumped to `advanced-parameters-20261106-19`; production runtime resource key is `mw4tryqw`.
- `test/side-navigation-overflow.test.js` passes 3/3 and `git diff --check` is clean.
- Deployment: old-site `b92685b`; platform-release `54efed2`; deployed only to `123vips.com` via `scripts/deploy_local.sh --site old`. Health is `200 {"ok":true}` and production CSS contains both neutral and active outlined tab states.

## Same-style active tab label white fill removed (2026-11-06)

- User clarified the selected Same-style tab still had a white label background because generic `.gallery-mode-tab.is-active span` rules overrode the outer transparent state.
- Added scoped `.gallery-top-tabs .gallery-mode-tab.is-active span` override: `color: inherit; background: transparent;`.
- Cache suffix bumped to `advanced-parameters-20261106-18`; production runtime resource key is `mw4tnw3i`.
- `test/side-navigation-overflow.test.js` passes 3/3 and `git diff --check` is clean.
- Deployment: old-site `05a71b8`; platform-release `4b4d2ae`; deployed only to `123vips.com` via `scripts/deploy_local.sh --site old`. Health is `200 {"ok":true}`. Production CSS confirms both active button and active label are transparent.

## Same-style active tab fill removed (2026-11-06)

- User confirmed the selected Same-style tab still showed the dark pink pill in a new screenshot.
- Removed the remaining active-tab fill completely. Active tabs now retain the normal muted text color and use only the pink icon as the highlight.
- Cache suffix bumped to `advanced-parameters-20261106-17`; `test/side-navigation-overflow.test.js` passes 3/3 and `git diff --check` is clean.
- Deployment: old-site `e9e4840`; platform-release `f905492`; deployed only to `123vips.com` via `scripts/deploy_local.sh --site old`. Health is `200 {"ok":true}`; production `platform.css` confirms `background: transparent` for the active Same-style tab.

## Same-style active tab highlight refinement (2026-11-06)

- User asked to remove the red outline/white-text state from the selected Same-style tab and rely only on the soft highlight fill.
- Active tabs now keep `border-color: transparent`, `box-shadow: none`, and the normal muted text color while retaining the pink-tinted background.
- Cache suffix bumped to `advanced-parameters-20261106-16`; `test/side-navigation-overflow.test.js` passes 3/3, including assertions against the red inset bar and white active text.
- Deployment: old-site `c0a5222`; platform-release `ce350fa`; deployed only to `123vips.com`. Health returned `200 {"ok":true}` and production CSS confirms the transparent border and disabled box shadow.

## Generate button/tabs polish and deployment (2026-11-06)

- User asked for the Generate submit button to be centered in the left panel, the parameter area to sit lower with visible spacing, and the four Same-style tabs to be smaller like the Case sub-tabs.
- Generate toolbar now has a 10px top gap and centers the submit button with `margin-inline: auto`; mobile full-width behavior is unchanged.
- Same-style tabs now use the compact Case-tab treatment: 34px height, 7px/11px padding, 8px radius, 14px icons, transparent track, and a compact active-state inset bar on desktop and mobile.
- Cache suffix bumped to `advanced-parameters-20261106-15`. Targeted relevant tests pass: Create prompt/busy states 2/2; platform profile + side navigation 18/18; syntax/diff checks pass.
- Deployment: old-site `483b33c`; platform-release `481291c`, pushed with lease protection. Deployed only to `123vips.com`; health check returned `200 {"ok":true}`. Production CSS contains the compact 34px tabs and centered Generate toolbar; production HTML still has the shared tabs and no removed recharge promotion entries.

## Email login production verification and crypto hotfix (2026-11-06)

- Production SMTP configuration is present and `verifySmtp()` succeeds against Alibaba Direct Mail `smtpdm-ap-southeast-1.aliyuncs.com:465` over implicit TLS; `/api/config/public` reports `auth.email.enabled=true`.
- Production login modal serves `emailLoginTab` selected and `passwordLoginPanel` hidden.
- End-to-end production verification found `[email-challenge-db] crypto is not defined` during `/api/auth/email/verify`; `db.js` used `crypto` without importing it. Added `require("node:crypto")` and a regression assertion.
- Targeted email tests pass 8/8; syntax and diff checks pass.
- Deployment: `old-site` `c315dd6`; `platform-release` `0c0a053`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. Production health is `200 {"ok":true}`.
- Production end-to-end retest passed: `/api/auth/email/request` returned 200; challenge existed in PostgreSQL; `/api/auth/email/verify` returned 200 with a session token; `/api/auth/me` returned the email user; reusing the same code returned 401. Controlled test challenge rows and the temporary email test user were cleaned up afterward.

## R2 credential repair and CDN DNS permission check (2026-11-06)

- Production old site `/etc/raising-game-demo.env` had `R2_ACCESS_KEY_ID` already rotated to the new Cloudflare R2 access key, but `R2_SECRET_ACCESS_KEY` still held the old secret. The resulting `SignatureDoesNotMatch` broke new uploads.
- Rotated only `R2_SECRET_ACCESS_KEY` to the matching secret. Backup: `/etc/raising-game-demo.env.bak-20261106160628` (remote, mode 600). Restarted `raising-game-demo`; `https://123vips.com/api/health` returned `200 {"ok":true}`.
- Verified the live env values directly against bucket `vipeak-media` via `scripts/check-r2-storage.js`: PUT succeeded, public `https://media.123vips.com/...` read succeeded. No DNS change was made; existing `media.123vips.com` remains untouched.
- `123vip.fans` continues to resolve to the same service and shares the main user pool. `/api/config/public` on both hosts reports the same Google client and `siteProfile=custom-workflow` for fans. Fans needs no separate login database; it reuses the shared Google/Telegram/email providers. Email login is present in code but production SMTP variables are currently absent, so it correctly returns `EMAIL_NOT_CONFIGURED`.
- Alibaba Cloud CDN domain is now `online` (`assets-cdn.123vips.com`, CNAME target `assets-cdn.123vips.com.queniuaa.com`), but public DNS still has no `assets-cdn` record and HTTPS certificate status remains `off`.
- Rechecked the supplied Cloudflare token on 2026-11-06 after the permission update: zone listing succeeds and root TXT verification resolves, but `GET/POST /zones/{zone_id}/dns_records` still returns `10000 Authentication error`. The token's effective grant is `Account -> DNS Settings`; it does **not** include the required `Zone -> DNS -> Edit` (Zone Resources: `123vips.com`).
- Exact remaining DNS action: create `CNAME assets-cdn -> assets-cdn.123vips.com.queniuaa.com`, Proxy status **DNS only**, TTL Auto. Do not touch `media.123vips.com`. After DNS resolves, issue a publicly trusted certificate (Let's Encrypt HTTP-01 through the CDN), upload it via Alibaba `SetCdnDomainSSLCertificate`, then enable HTTPS and verify cache + Range `206`.
- Target CDN hostname remains `assets-cdn.123vips.com`, origin `vipeak-media-sg.oss-ap-southeast-1.aliyuncs.com`, scope `overseas`. Do not overwrite `media.123vips.com`.

## BytePlus Seedance 2.5 diagnostic acknowledgement (2026-11-06)

- Corrected an earlier mistake: production Seedance 2.5 Advanced generation is already submitted directly to BytePlus ARK (`arkRequest` / `/contents/generations/tasks`); the old `api.apiz.ai` setting is stale and must not be used to assess current data flow.
- The acknowledgement is specifically for BytePlus Model Generations Quality Diagnostics, a per-task-ID support service—not a normal inference contract and not model-training consent.
- Its scope includes prompts, user-uploaded reference materials, outputs, account identifiers, and metadata; diagnostic retention is up to 3 days, followed by de-identified retention for diagnostic-service quality purposes. Data may be transferred to and processed in mainland China under the BytePlus DPA.
- Operational position: do not submit real user task IDs by default. Before accepting or enabling diagnostic requests, require an authorized company decision, DPA review, user/legal-rights checks, and exclusion of EU/EEA/UK/Switzerland personal data as required by the acknowledgement.
- If diagnostics become necessary, use synthetic reproduction tasks and an auditable admin-only workflow; do not expose this as an ordinary user-facing feature.
- No code or deployment changes were made in this step.

## Email login via Alibaba Cloud Direct Mail SMTP (2026-11-06)

- User chose Alibaba Cloud Direct Mail SMTP after briefly considering Resend. Resend is removed from the implementation.
- `email-smtp.js` is a dependency-free Node TLS SMTP client with explicit `EMAIL_NOT_CONFIGURED` / `EMAIL_SEND_FAILED` errors and `verifySmtp()`. It requires implicit TLS and production uses Alibaba Direct Mail port 465; non-TLS / STARTTLS mode is explicitly rejected.
- Email verification codes are persisted in PostgreSQL table `app_email_challenges`, with atomic 60-second resend throttling, 10-minute expiry, SHA-256 code hashes, and a 5-attempt limit. No in-memory or file fallback remains.
- `/api/auth/email/request`, `/api/auth/email/verify`, password reset, and account email binding now use SMTP + DB challenges. Bound-email duplicate checking happens before consuming the code.
- Configuration example is in `.env.example`; production needs Direct Mail sender-domain/address verification plus the sender-address SMTP password in `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`, and `EMAIL_FROM`. Alibaba AccessKey credentials are not SMTP passwords. Use the region-specific host shown by the Alibaba Cloud International console when provided.
- Changed files: `email-smtp.js`, `db.js`, `server.parts/part-01.js`, `server.parts/part-32.js`, `.env.example`, `test/email-auth.test.js`, `test/email-smtp.test.js`, `CODEX_TASK_STATE.md`.
- Verification: syntax checks pass; targeted email tests pass 7/7; a local TLS SMTP server smoke test completed a full EHLO/AUTH/MAIL/RCPT/DATA flow; `smtpdm.aliyun.com:465` and `smtpdm-ap-southeast-1.aliyuncs.com:465` both complete verified TLS 1.3 handshakes; `npm audit --omit=dev` reports 0 vulnerabilities; `git diff --check` passes. `test/source-split.test.js` still fails only on the pre-existing oversized `server.parts/part-29.js` (1728 lines).
- Production `/etc/raising-game-demo.env` has no SMTP/email variables and no Alibaba Cloud AccessKey. Existing `ALIYUN_DASHSCOPE_API_KEY` / Wan keys are service API keys and cannot send Direct Mail. Deployment has not been performed.
- User supplied the verified sender address `no-reply@123vips.com` and SMTP password; SMTP authentication succeeded against `smtpdm-ap-southeast-1.aliyuncs.com:465`, and a real message was accepted and delivered to a temporary inbox with the correct `Vipeak <no-reply@123vips.com>` sender. The credentials are appended to gitignored `LOCAL_CREDENTIALS.md` and must never be printed or committed.
- Login modal now defaults to email verification-code login. Password login is an explicit second tab; when email auth is disabled the modal falls back to password. Third-party login buttons remain at the top. Changed frontend files: `platform.html`, `platform.create.parts/part-06.js`, `platform.config.js`, `platform.main.js`, `platform.css`, `platform.copy.js`, `test/email-auth.test.js`.
- Tests: email auth/SMTP 8/8 pass, platform refresh/email auth/SMTP 19/19 pass, syntax checks and `git diff --check` pass.

## Advanced download2 asynchronous transfer (2026-11-06)

- User reported `Request failed: 524` from download2 and asked whether transfer is synchronous. It was: the download-url handler awaited remote download, poster generation, R2 upload, and DB update behind Cloudflare.
- `GET /api/generation-records/:taskId/download-url?quality=r2` now queues preparation and returns `202 {status:"preparing"}` immediately. Failed preparation is persisted as `advancedDownloadStatus=failed` with a retryable message; `?retry=1` requeues it.
- The UI polls with 30-second per-request timeouts and a 16-minute total limit, then triggers the signed R2 browser download when ready. Stale `preparing` records with no live in-process job are requeued, covering service restarts.
- Files: `server.parts/part-41.js`, `platform.ui.parts/part-02.js`, `platform.html`, `test/generated-assets-on-demand.test.js`.
- Checks: syntax 4/4, targeted regression 13/13, `git diff --check` pass.
- Deployment: old-site `a2012f7`; platform-release `157eb4c`; deployed only to `123vips.com`. Health returned `{"ok":true}` and production `platform.ui.parts/part-02.js` contains the 30-second polling request and 16-minute limit.

## Recharge activity entry removal (2026-11-06)

- User confirmed the shared same-style tabs are no longer overlapping, and asked to remove the recharge activity entry for now.
- Removed both the global recharge promotion banner and the home-page recharge promotion entry from `platform.html`; the existing same-style tabs remain in their normal layout flow.
- Added a regression test ensuring the removed recharge promotion entries do not return to the shared same-style area. `node --test test/side-navigation-overflow.test.js` passes 3/3.
- Deployment: old-site `6fe268b`; platform-release `deec925`, built from it and pushed with lease protection. Deployed only to `123vips.com`; the wrapper's first health check hit the normal restart-window `502`, and the immediate retry returned `200 {"ok":true}`. Production HTML no longer contains either recharge promotion entry and still contains the shared same-style tab container.

## Custom editor height correction (2026-11-06)

- User clarified the Custom/Generate editor needed more height, not more width.
- Restored `.advanced-workspace.is-create-custom` to equal columns and added a desktop `min-height: calc(100dvh - 100px)` to the left `.advanced-form-card`; mobile remains natural-height.
- Updated the Custom UI regression to assert equal columns and the taller desktop editor. Cache suffix bumped to `advanced-parameters-20261106-12`.
- Targeted Custom/result/dialog tests pass 3/3; syntax and `git diff --check` pass. The full Custom test file still has the documented 6 unrelated Wan/pricing failures.
- Headless 1440x1000 production measurement with local CSS injected: left width 838 -> 579px (equal to right), height 484.5 -> 900px; editor client scroll height matched its rendered height, so no inner scrollbar was introduced.
- Deployment: old-site `dbc5437`; platform-release `b2ba5a8`; deployed only to `123vips.com`. Production health ok.
- Production verification at 1440x1000: equal 579px columns; left editor height 900px; rendered/client scroll height match, so no new inner scrollbar.

## Seedance Vega 768P correction (2026-11-06)

- User reported Seedance Vega models should not offer 768P; 768P belongs to H3 (vega).
- Frontend/backend capability matrices now omit 768P for seedance20-vega and seedance25-vega. vega10-lite (h3（vega）) retains 768P; h3-vega remains without 768P.
- Seedance Vega default resolution is 1080P; vega10-lite defaults to 768P.
- Removed Pro Vega 768P defaults, normalization, admin/public pricing rows, and pricing-key mappings. Lite 768P pricing remains.
- API docs expose resolutionsByModel; page asset cache suffix bumped to advanced-parameters-20261106-11.
- Tests: tencent-vod-vega 61/61; advanced-pricing + vega-pricing-label 29/29; syntax and git diff --check pass.
- Deployment: old-site a294849; platform-release 59a8170; deployed only 123vips.com. Production health ok; production platform.config.js omits 768P for both Seedance Vega models and keeps it for vega10-lite.

- User reported Seedance Vega models should not offer 768P; 768P belongs to H3 (vega).
- Frontend/backend capability matrices now omit 768P for seedance20-vega and seedance25-vega. vega10-lite (h3（vega）) retains 768P; h3-vega remains without 768P.
- Seedance Vega default resolution is 1080P; vega10-lite defaults to 768P.
- Removed Pro Vega 768P defaults, normalization, admin/public pricing rows, and pricing-key mappings. Lite 768P pricing remains.
- API docs expose resolutionsByModel; page asset cache suffix bumped to advanced-parameters-20261106-11.
- Tests: tencent-vod-vega 61/61; advanced-pricing + vega-pricing-label 29/29; syntax and git diff --check pass.
- Pending: commit, release snapshot, old-site deployment.

## Same-style navigation runtime errors and cache fix (2026-11-06)

- User reported `not defined` errors across many pages immediately after the same-style navigation deployment.
- Root cause: `syncGalleryShortcutNav()` still called removed helper `syncGalleryModeTabs()`. Every non-home tab switch reached it and threw `ReferenceError`; cached old chunks also caused a stale version to persist after the first repair.
- Fixed `platform.explore.js` to call `renderGalleryModeTabs()`, updated the side-navigation regression test to forbid the removed symbol, and bumped the page asset suffix to `advanced-parameters-20261106-11` so all split scripts cache-bust.
- Headless full-page tab audit also exposed a separate empty-chat null dereference in `platform.chat.js`; guarded ChatLive lookup with `hasConversation` and added a regression assertion.
- Verification: navigation/chat tests pass; production console audit across `/`, `/platform.html`, `#cases`, `#history`, `#assets`, `#custom`, `#pricing`, `#chat`, `#topups`, `#spending`, `#referral`, and `#characters` reports zero errors.
- Deployment: `old-site` `748c733`; `platform-release` `35bdc93`, built from it and deployed only to `123vips.com`. Production health `200 {"ok":true}`; production JS contains the corrected calls and empty-chat guard.

## Same-style top-level navigation and Case-first in-page tabs (2026-11-06)

- Goal: keep “Same style / 同款” as a top-level navigation entry, remove its dropdown, and show Case / Video / Anime / Image as top in-page tabs in the right content area. Case must be first and selected by default.
- Changed `platform.html`: removed the same-style dropdown group and gallery-local mode tabs; added a single `data-same-style-entry` Case button plus shared `#sameStylePanel` / `#galleryModeTabs` above gallery and cases. Bumped CSS/JS cache suffix to `advanced-parameters-20261106-10`.
- Changed `platform.explore.js` and `platform.cases.js`: shared tabs render in Case-first order, Case is active on the Case page, and selecting Video/Anime/Image routes from Case to the gallery with that mode active. Navigating to Case shows the shared tabs and refreshes the case library.
- Changed `platform.main.js` and `platform.config.js`: removed obsolete dropdown handling, added `[data-gallery-top-tab]` routing, and added the shared panel DOM reference.
- Updated `test/side-navigation-overflow.test.js` to assert the top-level entry, removed dropdown, shared Case-first tabs, routing, and active-tab styles.
- Verification: targeted side-navigation/refresh/profile/cases tests pass (30/30); all modified JS and test files pass `node --check`; `git diff --check` passes. Static Chrome DOM check confirms the top-level entry and shared tab container are present.
- Deployment: `old-site` `ecf8077`, pushed; `platform-release` `e3a1af8`, built from it and pushed with lease protection. Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; wrapper initially saw a restart-window `502`, then immediate retry returned `200 {"ok":true}`.
- Production verification: homepage and `platform.html` return the top-level same-style entry and shared `galleryModeTabs`; production JS contains `galleryTopTabItems` and Case-active logic; production CSS contains the shared pill-tab styles. Live-only paths remain `404`; Live was not deployed.
- Excluded from this change: pre-existing unrelated Generate worktree changes in `platform.create.parts/part-02.js`, `test/advanced-custom-ui.test.js`, and Generate CSS hunks.

## Generate wider editor and viewport-height dialogs (2026-11-06)

- Goal: widen the Generate left editor and let preset/asset dialogs use the available viewport height, removing redundant inner scrolling while preserving Target category filtering and video Add behavior.
- Changed `platform.css`: Custom Generate desktop columns use `1.45fr / .55fr` with a 320px minimum side panel; preset dialog and form use `100dvh - 28px`; modal body flexes to remaining height; removed its stable scrollbar gutter; Generate form card no longer nests its own scrollbar; parameter chips wrap.
- Changed `platform.create.parts/part-02.js`: parameter popover measures its natural height and caps only when neither side fits, avoiding a hard 160px minimum beyond tiny viewports.
- Updated `test/advanced-custom-ui.test.js` to guard the wider columns, viewport-height dialog structure, and non-nested editor scrolling.
- Verification: syntax and `git diff --check` pass; focused tests pass except 6 pre-existing Wan/pricing failures. Headless Chrome verified 1440x1000, 1280x900, 756x469, and 390x844: dialogs stay in viewport, use 972/872/441/816px respectively, and only the modal body scrolls when populated content exceeds available height.
- Concurrent same-style navigation work was moved to `/tmp/codex-concurrent-same-style-20261106.patch` and is not part of this change.
- Deployment: `old-site` `c32d631`; `platform-release` `1badaa4`, built from `c32d631` and pushed. Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; service active, `/api/health` returned `200 {"ok":true}`. Production serves asset version `mw4macpv` and the deployed CSS contains the wider Generate columns and viewport-height dialog rules.

## Generate parameter capsules and adaptive popover (2026-11-06)

- Goal: parameter popovers contain only pickable values, use compact capsule controls, and prefer opening downward while staying inside the viewport.
- Changed `platform.create.parts/part-02.js`: removed popover title, close button, parameter-name heading, option descriptions, and selection checks; added measured downward-first placement with automatic upward fallback when there is insufficient space below.
- Changed `platform.css`: option values and duration readout are compact capsules; popover uses the measured down/up placement on desktop and mobile.
- Changed the prompt editor minimum/default height from 68px to 136px in `platform.create.parts/part-04.js` and `platform.css`.
- Updated `test/platform-site-profile.test.js` to guard the capsule-only contents and adaptive placement.
- Verification: targeted platform/Vega tests pass (76/76); syntax and `git diff --check` pass. Headless Chrome at 1280x900 confirmed downward placement; at 756x469 confirmed automatic upward fallback, zero headings/close controls, capsule radii, option selection closure, and duration slider readout/native value synchronization.
- Deployment: `old-site` `6b0caf9`; `platform-release` `4084786`, built from `6b0caf9` and pushed. Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; service restarted successfully and `/api/health` returned `200 {"ok":true}`. Production serves asset version `mw4l1zy2`; the deployed prompt chunk has minimum height `136`, and the picker chunk/CSS contain adaptive placement without the removed heading/close markup.

## Generate picker auto-close and duration slider (2026-11-06)

- Goal: parameter option selection closes the picker, and the duration picker uses one range slider instead of shortcut buttons.
- Changed `platform.create.parts/part-02.js`: all parameter options close the picker on selection; the duration panel renders only the current value, range input, and min/max labels. Dragging updates the readout/chip; release closes the picker before the native select change handler runs.
- Changed `platform.css`: replaced duration shortcut styling with slider and endpoint label styling.
- Added regression coverage in `test/platform-site-profile.test.js`.
- Verification: targeted platform/Vega tests pass (76/76); syntax and `git diff --check` pass. Headless Chrome verified ratio selection closes the picker, the duration picker renders one slider with zero duration buttons, drag updates readout/chip, release saves the native value and closes the picker.
- Deployment: old-site `bbb4a68`; platform-release `4c89031`, pushed with lease protection. Deployed only to `123vips.com` with `scripts/deploy_local.sh --site old`; deployment verified commit `4c89031`, health returned `{"ok":true}`, and production `platform.create.parts/part-01.js`, `platform.ui.parts/part-02.js`, and `platform.css` contain no slow-save hint markup or styles. Live was not deployed.

## 123vip.fans Generate parity guard (2026-11-06)

- Confirmed `123vip.fans` and `www.123vip.fans` resolve to the shared `/platform.html`; they do not have a separate Generate implementation.
- Added a regression test in `test/platform-site-profile.test.js` that requires the shared Generate workspace, parameter chips, and submit button, and rejects profile-CSS overrides for shared Generate selectors.
- Verification: `node --check platform.create.parts/part-02.js`, `node --check platform.main.js`, `git diff --check`, and `test/platform-site-profile.test.js` all pass (14/14).
- Deployment: `old-site` `6a0fb47`; `platform-release` `8d8d388`, built from `6a0fb47` and pushed. Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; service restarted successfully and `/api/health` recovered to `200 {"ok":true}` after the restart window. Production serves asset version `mw4kals0`, and both `123vips.com` and `123vip.fans` return the shared parameter-chip HTML and updated JS/CSS. Headless Chrome loaded the production page successfully; only expected headless display-link warnings appeared.

## Generate key-parameter picker (2026-11-06)

- Goal: match the approved Generate prototype by replacing the visible native parameter fields with model/mode/ratio/resolution/duration chips that open pickers, without modifying the prototype file.
- Implemented the picker in the real Generate surface. The hidden native selects remain the sole submission/data source; no duplicate model capability table was added. Model and Mode close after selection; Ratio, Resolution, and Duration keep the picker open and update the Generate estimate immediately.
- Fixed chip clicks closing immediately: rendering replaced the clicked node, so document-click detection now uses `event.composedPath()` and recognizes the stable parameter shell.
- Layout: labels are visible for ratio/resolution/duration, long model/mode values truncate, chips scroll horizontally when space is tight, and the Generate button wraps below the chips at <=900px instead of squeezing them into vertical icons.
- Verification: syntax and `git diff --check` pass; source split/performance tests 11/12, with the sole failure being the pre-existing `server.parts/part-29.js` line-count threshold (unchanged file, 1728 lines at HEAD). Chrome CDP verified all five chips, model/mode/ratio/resolution/duration updates, estimate refresh, close button, outside click, and 756px/390px layouts without page overflow.
- Changed files: `platform.html`, `platform.config.js`, `platform.css`, `platform.create.parts/part-02.js`, `platform.main.js`, `CODEX_TASK_STATE.md`.
- Deployment: not deployed; user has not requested deployment.

## Generate prompt caret deletion fix (2026-11-06)

- Goal: fix prompt editing where deleting at the visible caret removed an earlier character, especially with Chinese/multiline text and @ asset references.
- Root cause 1: the transparent textarea and pink-highlight mirror used different wrapping rules (`word-break: normal` vs `break-word`), so the visible caret could diverge from the native editing caret on wrapped text.
- Root cause 2: `syncAdvancedPromptMentionLabels()` rewrote the whole prompt when an @ label changed/removed, reused the old numeric selection position, collapsed multi-space whitespace, and lost selection ranges.
- Fix: aligned textarea/highlight padding, font, line height, white-space, overflow-wrap, word-break, tab size, and scrollbar gutter. Reworked mention label sync to perform offset-aware single-pass token edits, preserve collapsed carets and selection ranges/direction, and leave unrelated whitespace untouched.
- Changed files: `platform.css`, `platform.create.parts/part-05.js`, `test/advanced-custom-ui.test.js`, `CODEX_TASK_STATE.md`.
- Verification: targeted prompt tests 3/3 pass; syntax and `git diff --check` pass; Chrome CDP confirmed multiline Backspace removes the expected character and auto-height updates; CDP confirmed removing/renaming an earlier @ label keeps the caret mapped and the next Backspace removes the intended character.
- Full `advanced-custom-ui.test.js` currently has 7 pre-existing failures from unrelated stale assertions/source compatibility (`isVegaProviderId` missing in extracted helpers, stale upload/pricing/cache regexes); no prompt-editing test fails.
- Deployment: `old-site` `f896f84`; `platform-release` `8d96eda`, built from `f896f84` and pushed with lease protection. Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; `/api/health` returned `200 {"ok":true}`. Live was not deployed.

## Main-site refresh performance (2026-11-05)

- Goal: reduce first-load and repeat-refresh latency on `123vips.com` without changing Live or adding file-based runtime storage.
- Benchmarked `https://ourdream.ai/`: Vercel HTML cache HIT, immutable versioned assets, fast repeat navigation. Ours previously returned platform HTML as `cf-cache-status: DYNAMIC` with `no-store`.
- Frontend: removed parser-blocking `document.write` from `platform.js`, `platform.ui.js`, and `platform.create.js`; ordered chunks now use `async=false` and start immediately. Restored Lucide icons when chunks execute after `DOMContentLoaded`.
- Bootstrap: anonymous `/api/config/public` request starts before session restore, with no Authorization header. Public config is snapshotted in `sessionStorage` for 5 minutes. Authenticated config is refreshed only after session restore and is not cached.
- Shell work: public config/shell renders before advanced presets, billing, deep-link character hydration, and chat onboarding. These now run in idle/background tasks.
- Server: platform HTML snapshot cache is coalesced per origin/host/tenant/tool/site-profile/asset-version with a 20s TTL. GEO visit stats run in the background instead of blocking each request.
- Caching: platform HTML now emits `public, max-age=0, s-maxage=15, stale-while-revalidate=60` plus CDN cache headers; anonymous public config remains 30s `s-maxage`/SWR.
- Changed: `platform.js`, `platform.ui.js`, `platform.create.js`, `platform.main.js`, `platform.ui.parts/part-01.js`, `platform.ui.parts/part-04.js`, `platform.create.parts/part-06.js`, `server.parts/part-04.js`, `server.parts/part-42.js`, `lib-http.js`, regression tests.
- Verification: targeted performance/mobile/chat/video/Vega suite 111 pass / 0 fail after updating stale cache-busting and background-analytics assertions. `source-split` still reports pre-existing `server.parts/part-29.js` >1475 lines. Syntax and `git diff --check` pass.
- Final refresh changes: critical platform chunks now load in order without parser-blocking `document.write`; workflow canvases, video tools, undress tool, chat-live, and Lucide icons load after the shell; clicks wait for deferred modules when needed. `platform-sw.js` stale-while-revalidate caches the shell/assets but never `/api/*`, non-GET, or cross-origin requests.
- Final server/cache fix: versioned platform JS/CSS is long-lived immutable; HTML and public config expose CDN cache/SWR headers. `platform-sw.js` is now registrable both with and without a `?v=` query; the previous unversioned `no-store` branch was fixed in `997b614`.
- Final release: `old-site` `997b614`, pushed; `platform-release` `c74b875`, built from it and pushed with lease protection; deployed only to `123vips.com` via `scripts/deploy_local.sh --site old`. Production health `200 {"ok":true}`, production `platform.js` hash matches the release, and `/platform-sw.js` no longer returns `no-store`.
- Final browser benchmark (Chrome headless 1440x1000, warm-cache run): repeat refresh TTFB `9.6ms`, FCP `56ms`, load `116.7ms`, transfer `22KB`, and `navigator.serviceWorker.controller=true`; hard reload FCP `32ms` with shell cached. Tab switch timings were Gallery `377ms`, Advanced `417ms`, Workflow `379ms`, Chat `364ms`, Cases `368ms`, History `365ms` including the benchmark's fixed 350ms wait.
- OurDream comparison in the same run: TTFB `149.7ms`, FCP `620ms`, load `1417.9ms`, 161 resources / 92 script requests. Ours paints faster after the shell is cached; OurDream still has stronger edge HTML caching and global asset distribution.
- Remaining infrastructure limit: Cloudflare still reports HTML `/` and `/api/config/public` as `cf-cache-status: DYNAMIC` despite our `cdn-cache-control`, so origin/edge rules must be updated outside the repository before cold first visits can match OurDream consistently. Cold probes varied from about `145ms` to `1.4s` TTFB; do not claim Cloudflare HTML/API caching is fixed.
- UI comparison: OurDream is leaner above the fold, with cleaner cards, fewer secondary badges, and a more unified filter strip. Our gallery is denser (LIVE, likes, video count, age, style, tags). Further visual cleanup is a separate UX pass; this change prioritises load/navigation latency.
- Final verification: `platform-refresh-performance` 10/10 and targeted platform suite 46/46 pass; syntax and `git diff --check` pass. Live was not deployed.

## Vega stale asset URI recovery (2026-11-05)

- Failed task `cgt-20261105203512-9b9e6c` (`seedance25-vega`) submitted three `asset://` URIs absent from Tencent VOD (`asset-20261105195615-x2vfl`, `asset-20261105195616-49c7h`, `asset-20261105195616-snf4f`). Neither `app_vega_media_library` nor `DescribeAigcMaterial` could resolve them.
- Root cause: `prepareVegaMediaLibraryFileInfos()` trusted any `asset://` URL, allowing stale browser/cache/template state to reach upstream.
- Fix: `resolveVegaMediaAssetSources()` now recovers owned public source URLs from `app_vega_media_library`, then `app_user_assets` by `userAssetId`, before FileInfos submission. Unrecoverable assets fail with `VEGA_MEDIA_ASSET_UNAVAILABLE` instead of being submitted. Helpers moved from `part-26.js` to `part-24.js` to stay under the part line limit.
- Changed: `tencent-vod-vega.js`, `server.parts/part-01.js`, `server.parts/part-24.js`, `server.parts/part-26.js`, `test/tencent-vod-vega.test.js`.
- Verification: Vega Vega/media tests 61 pass / 0 fail; advanced pricing 20 pass / 0 fail; `node --check` and `git diff --check` pass. Full `source-split` remains blocked by pre-existing `part-29.js` length.
- Deployment: `old-site` `8233799`; `platform-release` `07e2083` built from it and pushed with lease protection; deployed only with `scripts/deploy_local.sh --site old`. Production is active at `07e2083`, `/api/health` returns `200 {"ok":true}`, and both `resolveVegaMediaAssetSources` code markers are present. The deploy wrapper saw a transient 502 during restart and exited 27, so the final health/commit checks were repeated independently. Live was not deployed.

## Vega user controls limited to first two rows (2026-11-05)

- The four Vega models (`seedance20-vega`, `seedance25-vega`, `h3-vega`, `vega10-lite`) now expose only the first two control rows: model/mode/ratio and resolution/duration/audio.
- All `.advanced-vega-option` controls and the random seed are hidden for Vega models. Existing hidden defaults still flow through `advancedVegaPayloadOptions()`.
- Updated `platform.create.parts/part-02.js` and added a regression assertion in `test/tencent-vod-vega.test.js`.
- Verification: targeted Vega/media/pricing suite 115 pass / 0 fail; syntax and `git diff --check` pass.

## History download2 hint overlap fix (2026-11-05)

- History card and history detail download2 hints now stay inside the button as a compact in-flow second row instead of floating above and covering adjacent actions.
- Added History-specific CSS so the Advanced Result panel bubble treatment remains unchanged.
- Verification: desktop and mobile browser render checks show `position: static`, the button expands to about 45px, the hint stays inside the viewport, and overlap with the Add asset button is zero. Targeted save-hint test passes; `git diff --check` passes.
- Release: `old-site` `cd813cd`; `platform-release` `13d72d7` built from it and pushed. Deployed only `123vips.com`; `/api/health` is `200 {"ok":true}`, production CSS hash matches the release, and the production browser check confirms zero overlap.

## Result tab download2 save hint (2026-11-05)

- Extended the save hint bubble from the Advanced Result panel to the top-level Result/history cards and the history detail dialog.
- `setAdvancedDownloadButtonState()` now recreates the hint for transferring, ready, failed, and idle states so it remains visible after clicking download2.
- Mobile bubbles anchor to the right edge to stay inside the viewport.
- Updated `platform.create.parts/part-05.js`, `platform.explore.js`, `platform.ui.parts/part-02.js`, `platform.css`, and `test/generated-assets-on-demand.test.js`.
- Verification: syntax checks, `git diff --check`, and targeted result/history/undress tests (37 pass / 0 fail).

## Result download2 save hint (2026-11-05)

- Added a persistent speech-bubble hint inside the Result panel download2 button: “如果下载素材慢请点击我保存”.
- The bubble is absolutely positioned above the button with a tail, warm download2 styling, responsive max width, and no pointer interception; existing transferring/ready/failed behavior is unchanged.
- Updated `platform.create.parts/part-01.js`, `platform.css`, and `test/generated-assets-on-demand.test.js`.
- Verification: `node --check platform.create.parts/part-01.js`, `git diff --check`, and targeted `test/generated-assets-on-demand.test.js` (12 pass / 0 fail).

## Generate prompt @ mention pink highlight (2026-11-05)

- Added a textarea mirror layer behind `#advancedPrompt` so inserted `@Image 1`, `@Video 1`, `@Audio 1`, and document references display in pink without changing the native editing/selection behavior.
- Only labels backed by actual current reference items are highlighted; ordinary text and email-like `@` text remain unchanged. Markup is escaped before rendering, and the overlay syncs on input, scroll, resizing, and programmatic prompt loads.
- Updated `platform.html`, `platform.config.js`, `platform.css`, `platform.create.parts/part-04.js`, `platform.main.js`, and `test/advanced-custom-ui.test.js`.
- Targeted regression passes. Full `advanced-custom-ui.test.js`: 30 pass / 5 pre-existing unrelated failures. Syntax and `git diff --check` pass.
- User reported multi-line typing did not grow the control. Root cause: input-time measurement ran before layout and a prior manual-resize flag could block later growth. Input now schedules a forced next-frame measurement, measurement resets to `0px` before reading `scrollHeight`, and only active drag resizing suppresses auto-growth; native `field-sizing: content` and `max-height` are also enabled as a progressive fallback.
- Follow-up verification: Chrome headless check confirms 8 lines grow the textarea to 126px; targeted prompt regressions 2 pass / 0 fail; syntax and `git diff --check` pass.
- Deployment: `old-site` `59f97d5`, `platform-release` `50ed276`; pushed and deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. Production health `200 {"ok":true}`. Public assets `platform.css` / `platform.js` are versioned `mw3ic4fr`; deployed `part-04.js`, `platform.main.js`, and CSS contain the forced next-frame autosize, `0px` remeasure, `field-sizing: content`, pink highlight layer, and scroll synchronization. Live was not deployed.

## Generate prompt auto-height (2026-11-05)

- User clarified the target is the top-level Generate entry (the Advanced workspace), not a separate prompt panel.
- Added `autoSizeAdvancedPrompt()` and `scheduleAutoSizeAdvancedPrompt()` in `platform.create.parts/part-04.js`: measure `scrollHeight`, clamp to 68px through the existing responsive maximum, and scroll only after that maximum.
- Prompt input now follows text length. Generated/template/case/character prompt loads force a full-content remeasure and reset any manual height, while drag/keyboard resizing keeps the user's chosen height until a new loaded prompt arrives.
- The Generate/Advanced tab remeasures after it becomes visible, fixing hidden-tab `scrollHeight=0`; window resize and programmatic clears also refresh the height.
- Updated prompt assignments in `platform.create.parts/part-02.js`, `part-03.js`, `part-05.js`, `platform.explore.js`, and `platform.main.js`.
- Added regression coverage in `test/advanced-custom-ui.test.js`.
- Targeted test `prompt editor grows to show loaded generated copy and remeasures after the Generate tab is visible` passes. Full `advanced-custom-ui.test.js`: 29 pass / 5 pre-existing unrelated failures (Vega/price/frame-mode expectations). Syntax and `git diff --check` pass.

## Vega Pro asset-library API correction (2026-11-05)

- User supplied the upstream rule for Vega 1.0 Pro / 1.5 Pro: public URLs must first become VOD assets through `CreateAigcMaterial`, and the video request must reference `Type=Url`, `Url=asset://asset-...`. The previous `PullUpload` + `Type=File` + `FileId` + `InputRegion=Oversea` flow was incorrect.
- Changed Pro-only media preparation to call `CreateAigcMaterial` with `FileInfo`, `AssetType`, user/env `GroupId`, and `IsRealPerson=False`, then poll `DescribeTaskDetail` for `CreateAigcMaterialTask.Output.AssetId`.
- PostgreSQL cache `app_vega_media_library` now stores `asset_id` and `asset_uri` while retaining legacy `file_id`; successful asset entries are reused per user/source URL/sub-app. No file fallback was added.
- `FileInfos` returned for Pro now use `Type=Url` with `Url=asset://asset-...`; `InputRegion` was removed. Vega Lite providers remain unchanged and still submit public URLs.
- Create-page `assetGroupId` is passed into asset registration; `TENCENT_VOD_VEGA_ASSET_GROUP_ID` defaults to `123vips-vega`.
- Changed files: `.env.example`, `db.js`, `server.parts/part-26.js`, `server.parts/part-30.js`, `tencent-vod-vega.js`, `test/tencent-vod-vega.test.js`, `CODEX_TASK_STATE.md`.
- Verification: `node --require ./test/source-compat.js --test test/tencent-vod-vega.test.js test/advanced-pricing.test.js test/vega-pricing-label.test.js` 85 pass / 0 fail; syntax and `git diff --check` pass.
- `old-site` commit `8895462`, pushed to origin. Platform release `f1a610c` was built from that commit, pushed, and deployed to `123vips.com` only; production health returned `200 {"ok":true}`. Live was not deployed.
- Real production verification: `cgt-20261105185652-8e9597`, Vega 1.5 Pro reference-image task with two public images. Local status reached `succeeded`; upstream task `1524935253-AigcVideoTask-d671ca4033756468d91077f30c42b727t` completed and returned a playable MP4.
- Both source images were registered as VOD assets (`asset-20261105185644-jbum2` and `asset-20261105185643-rdttv`). Persisted `upstreamPayload.FileInfos` contains `Type=Url`, `Usage=Reference`, `Category=Image`, and `Url=asset://asset-...`; no `PullUpload`, `FileId`, or `InputRegion` is present.
- Refreshed generation detail returned `templateTitle=seedance2.5vega` and `providerLabel=seedance2.5vega`, confirming the public name remains stable after completion.

## Legacy regeneration runtime helper fix (2026-11-05)

- Production regression: every generation record click failed with `ReferenceError: firstNonEmpty is not defined` in `upstreamInputMediaItems`, preventing prompt/media restoration.
- Root cause: the new frontend helper referenced a function local to another function. Fixed by defining `firstPresent` in `part-04.js` scope and adding a sandboxed regression that executes `upstreamInputMediaItems` with legacy `FileInfos` and `Content` data.
- Checks passed: `git diff --check`, syntax checks, and two targeted regeneration tests (2/2).
- Commit `0856a94` on `old-site`, pushed to origin. Platform release `c832c26` deployed to `123vips.com` only.
- Production verification: health `{"ok":true}`; deployed `part-04.js` contains the scoped `firstPresent`, `upstreamInputMediaItems`, `FileInfos`, and `Content`, with the broken call absent.

## Legacy regeneration direct input restore deployment (2026-11-05)

- User asked whether an old generation must be regenerated once before its source media can be brought back. No new generation is required.
- Frontend regenerated media restoration now reads original sources from `upstreamPayload.FileInfos`, `Content`, and nested image/video/audio URL fields, while retaining first-frame, last-frame, and reference typing. Generated result URLs remain excluded.
- Backend Vega/image regeneration reconstructs original media and asset IDs from the same legacy fields.
- Targeted checks passed: syntax for all changed JS files, `git diff --check`, legacy regeneration input test, and image regeneration provider/media test.
- Commit `c4ec992` on `old-site`, pushed to origin.
- Platform release `4448a3c`, built from `c4ec992`, pushed with lease protection and deployed to `123vips.com` only.
- Production verification: `/api/health` returns `{"ok":true}`; deployed create/UI chunks contain `FileInfos`, `Content`, `upstreamInputMediaItems`, and `upstreamInputImageAssets`; homepage remains the platform site.
- Live was not deployed.

## Legacy regeneration input recovery (2026-11-05)

- User reported old generation records could not restore input media on “再次生成” and asked whether a new generation was required. It is not: old records are restored directly from their saved input fields.
- Frontend `recordImageAssets()` now reads legacy input images from `upstreamPayload` (`image`, `image_url`, `reference_images`, snake_case aliases, first/last-frame fields) and joins positional `userAssetIds` with URL-only images instead of showing duplicate placeholder/URL entries.
- Backend regeneration helpers now recover input images and asset IDs from the same legacy `upstreamPayload` fields for Seedream/Qwen Image3 and image-edit regeneration. Generated result URLs are never used as regeneration inputs.
- Added regression coverage for `mediaAssets: []` records with `userAssetIds + sourceImageUrl` and upstream-only input images. The new regression passes; known unrelated media-input assertion failures remain.
- Pending: commit, platform release snapshot, old-site deployment.

## Regeneration restores original image endpoint and user media (2026-11-05)

- User corrected the requirement: regenerate must reuse the original endpoint and original user media; it must not create another upload/paste UI and must not use generated result images as inputs.
- Restored exact image provider identity from `params.advancedProviderId`, provider/model/source fields, with explicit precedence for Seedream 5, Qwen Image3, Z-Image, Qwen Image Edit, and Wan Image Edit.
- `restoreRecordMedia()` now merges `record.mediaAssets` with legacy record input fields and deduplicates by user asset ID, asset URI, or URL while preserving first/last-frame typing.
- Existing image-edit submit now persists `params.advancedProviderId`; no UI or upload flow was added.
- Backend regenerate body for Seedream/Qwen Image3 restores original reference asset IDs and input URLs through `/api/advanced/generate`.
- Backend regenerate body for Wan/Z-Image/Qwen Image Edit restores original input asset IDs/URLs through the existing `/api/wan27/image-edit`; it never uses `cdnImageUrls` or `imageResultUrls`.
- Locked/internal public records clear `userAssetIds`, `imageUrls`, and `sourceImageUrls`.
- Tests: target media regeneration contract passes. `test/media-inputs.test.js` has 2 known pre-existing assertion-shape failures unrelated to this change.
- Pending: commit, release snapshot, old-site deployment.

## Create button submission feedback (2026-11-05)

- User reported the Create/Generate button looked unresponsive after click.
- Root cause: submit only set `disabled`; the shared button had no disabled/busy styling, and validation failures were rendered as low-contrast note text.
- Added an immediate `aria-busy` loading state with spinner and `正在创建... / Creating...`, duplicate-submit guard, hover/active/focus/pressed feedback, and disabled/loading styles.
- Validation errors now show in a red inline panel; API submission success/failure show accessible corner notices. Busy state is preserved against pricing rerenders.
- Files: `platform.create.parts/part-03.js`, `platform.ui.parts/part-04.js`, `platform.html`, `platform.css`, `test/advanced-custom-ui.test.js`, `CODEX_TASK_STATE.md`.
- Verification: syntax and `git diff --check` pass; new submit-feedback contract passes; targeted tencent/Vega/result regressions 68/68 pass. `advanced-custom-ui` is 26 pass / 6 fail, with the same pre-existing Wan/pricing failures recorded above.
- Deployment: `old-site` `a37b95e`; `platform-release` `5b9d9fa`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. Production health is `{"ok":true}`, and the live page serves the busy state, submission notice code, and new CSS. `live-release` remained `6642e17`; Live was not deployed.

## Vega 1.0 Lite GenerateMode removal (2026-11-05)

- User requested removing `GenerateMode` for Vega 1.0 Lite only (`vega10-lite`).
- Backend and frontend capabilities now mark `generateMode: false`; the existing payload builder omits `GenerateMode`, and the existing control logic hides Generate Mode for this provider.
- Regression coverage asserts the upstream `WandVegaParameters` omit `GenerateMode` while preserving `VideoQualityMode`, and that the frontend Lite capability remains disabled.
- Verification: `tencent-vod-vega.test.js` 56/56; syntax and `git diff --check` pass.
- Files: `tencent-vod-vega.js`, `platform.config.js`, `test/tencent-vod-vega.test.js`, `CODEX_TASK_STATE.md`.
- Deployment: `old-site` `cbe709e`; `platform-release` `7bd857a`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. Production checkout is `7bd857a`, service active, and `/api/health` returns `200 {"ok":true}`. Production config contains `vega10-lite` `generateMode: false`; Live release remained `6642e17` and was not deployed.

## Generate Result six-per-page and compact controls (2026-11-05)

- User corrected the previous implementation: parameters must remain single-column, not two columns; Result must show 6 records per page. The deployed version still had `ADVANCED_RESULT_PAGE_SIZE = 4`.
- Set Result page size to 6 and updated pagination regressions for six-item first page and three-item second page out of nine records.
- Restored the custom Create parameter fields to the original three-column layout. Compression comes only from smaller gaps, labels, control heights, prompt height, advanced-option spacing, and form padding; do not reduce the column count.
- Tightened Result card spacing/media height and added a short-viewport desktop rule so a six-card page is visible without reintroducing page-level scrolling.
- Verification: targeted pagination/source tests 34 pass, 6 known pre-existing Wan/pricing failures remain in the full `advanced-custom-ui.test.js`; syntax and `git diff --check` pass.
- Files: `platform.config.js`, `platform.css`, `test/advanced-result-order.test.js`, `test/advanced-custom-ui.test.js`, `CODEX_TASK_STATE.md`.
- Deployment: `old-site` `abe51d2`; `platform-release` `d7f4aaf`, built from `abe51d2`. Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; production checkout `d7f4aaf`, service active, health `200 {"ok":true}`. Production config has `ADVANCED_RESULT_PAGE_SIZE = 6`; CSS preserves single-column create fields. Live was not deployed.

## Generate Result pagination and compact controls (2026-11-05)

- User reported the Create-page Result side grew without bound, forcing the whole page to scroll before the left submit control could be reached; new endpoint options also made the left form too tall.
- Added client-side Result pagination at 4 records per page, reusing `renderSimplePager`; page resets on result-type changes and all new task entry points select the matching result category and page 1.
- Result action handlers now resolve records from the current page rather than the global visible index, preventing page 2 previews/downloads/regeneration from targeting page 1 records.
- Desktop Result list is independently scrollable with a capped height; mobile keeps natural flow. The custom Create form is independently scrollable and uses tighter desktop spacing, controls, and advanced-option gaps so Generate stays reachable in one viewport.
- Verification: 86 focused Result/source tests pass; pagination slice regression passes; syntax and `git diff --check` pass. Six `advanced-custom-ui` Wan/pricing tests fail identically on the clean baseline and are pre-existing, not caused by this change.
- Files: `platform.html`, `platform.css`, `platform.config.js`, `platform.main.js`, `platform.explore.js`, `platform.create.parts/part-01.js`, `platform.create.parts/part-03.js`, and related source-contract tests.
- Deployment: `old-site` `a5baa70`; `platform-release` `509e840`, built from `a5baa70` and pushed with lease protection. Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; production checkout `509e840`, service active, health `200 {"ok":true}`. Live was not deployed.
- Production verification: homepage references `platform.css?v=mw37z2lw` / `platform.js?v=mw37z2lw`; deployed `platform.html` includes `advancedResultPager`, `part-01.js` includes `advancedResultPageData`, and `platform.css` caps `.advanced-result-list` at `max-height: min(62vh, 720px)` with independent scrolling.

## Vega 1.0 Lite ModerationMode removal (2026-11-05)

- User requested removing the `ModerationMode` parameter for Vega 1.0 Lite only (`vega10-lite`).
- Marked `vega10-lite` as `moderation: false` in the backend capability map and frontend model capability config.
- Backend `buildVegaExtInfo()` now omits `ModerationMode` when the selected provider does not support moderation; all other Vega models continue to send it.
- Create-page payload construction omits `moderationMode` for `vega10-lite`, and the moderation control is hidden based on capability.
- Added regression coverage for `vega10-lite` omission, preservation on Vega 1.0 Pro / 1.5 Pro / 1.5 Lite, and create-page conditional serialization.
- Verification: syntax checks and `git diff --check` pass; targeted Vega/pricing/source-split suite 77 pass, 0 fail.
- Deployment: `old-site` `00c5985`; `platform-release` `f4b3b7f`, built from `00c5985` and pushed with lease protection.
- Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; production checkout `f4b3b7f`, service active, health `200 {"ok":true}`. Live was not deployed and remains `6642e17`.
- Production script verification confirmed `platform.create.parts/part-01.js` omits `moderationMode` when capability is false, `part-02.js` hides the moderation control for `vega10-lite`, and `platform.config.js` contains `moderation: false` on `vega10-lite`.

## Vega Pro public display alias consistency (2026-11-05)

- Status: completed and deployed to `123vips.com`; Live was not deployed.
- User reported that a newly created Vega 1.5 Pro task reverted from `seedance2.5vega` to `Vega 1.5 Pro` after refresh and on the result card.
- Root cause: the frontend dropdown/config label was correct, but `publicGenerationRecord()` returned the persisted `templateTitle` and `publicProviderLabel()`, while result/history/notification renderers preferred those raw values.
- Added separate public display alias helpers in `lib-providers.js` and `platform.config.js`. They normalize both provider IDs and historical labels: Vega 1.5 Pro -> `seedance2.5vega`; Vega 1.0 Pro -> `seedance2.0（vega）`.
- `publicGenerationRecord()` now applies the Pro alias to `templateTitle` and `providerLabel`, so new creates, `/api/generation-records` refreshes, and historical records all resolve consistently. Provider IDs, model versions, payloads, pricing rows, Lite labels/behavior, and media limits are unchanged.
- Result-card titles, result previews, history previews, history detail titles, and completion notifications now use the shared frontend display-title helper.
- Pricing responses and the public price table now use the same display alias, while provider IDs, rate values, and internal labels remain unchanged.
- Files changed: `lib-providers.js`, `server.parts/part-01.js`, `server.parts/part-20.js`, `server.parts/part-43.js`, `platform.config.js`, `platform.ui.parts/part-02.js`, `platform.ui.parts/part-04.js`, `platform.create.parts/part-01.js`, `platform.create.parts/part-05.js`, `platform.explore.js`, `test/tencent-vod-vega.test.js`, `CODEX_TASK_STATE.md`.
- Verification: Vega suite 55/55; advanced-pricing + Vega-pricing + source-split 29/29; generation-record-list-refresh + undress-tool 27/27; syntax checks and `git diff --check` pass.
- Deployment: `old-site` `fa265a2`; `platform-release` `03eafbd`, built from `fa265a2` and pushed. Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; production checkout is `03eafbd`, service is running, and `/api/health` returns `200 {"ok":true}`.
- Release audit: `platform-release` differs from `24185a5` only in the four intended files (`CODEX_TASK_STATE.md`, `lib-providers.js`, `platform.ui.parts/part-04.js`, `test/tencent-vod-vega.test.js`); no Live paths. The deploy wrapper exited 27 after one transient homepage `Connection reset by peer` during its final verification, but immediate retries returned homepage `200`, health `200`, and `/live.html` `404`; production chunks `mw37h898` contain the unified result and pricing aliases.
- Authenticated production record verification still requires a valid user session/token: the target record endpoint returned `401 LOGIN_REQUIRED` anonymously. Live was not deployed.

## Admin page loading audit and fix (2026-11-05)

- User asked to check whether other admin pages also load slowly. Production measurements before the fix: dashboard `readAppDbFromTables` 1102–2734ms; generation records exact username `test01` search about 972ms; users 185.7ms; ordinary generation list 52.3ms; user assets 101.8ms; wallet/ledger/support/membership/creator pages 2–50ms.
- Root causes: `/api/admin/dashboard` loaded the entire app DB plus all generation records; exact username generation lookup used a broad payload scan for pagination/count; `/api/admin/overview` also loaded the full DB and all records; many read-only admin endpoints used default `requireAdmin`, which loads the whole app DB only to verify the session.
- Added `getAdminDashboardStatsFromDb()` as one PostgreSQL aggregate query for dashboard counters, including scene-video counts.
- Optimized exact user generation search to count and page separately, preserving all same-name accounts across tenants and using the indexed `(payload->>userId, created_at)` path.
- Converted `/api/admin/overview` to bounded paginated database readers: 100 users, 100 wallet orders, 100 assets, 30 lightweight records. Heavy record detail remains click-time only.
- Switched read-only admin config/pricing/geo/chat-live/creator/support/membership/home/scene/asset/generation detail and media handlers to lightweight auth where they do not consume `auth.db`.
- Changed files: `db.js`, `server.parts/part-01.js`, `part-05.js`, `part-07.js`, `part-09.js`, `part-33.js`, `part-38.js`, `part-39.js`, `part-40.js`, `part-41.js`, `part-42.js`, `test/admin-generation-records-list.test.js`, `CODEX_TASK_STATE.md`.
- Verification: targeted admin/generation suites 41 pass, 0 fail; `node --check db.js`, `node --check server.js`, and `git diff --check` pass.
- Deployment: `old-site` `d389969`, `platform-release` `b8d836e`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; Live was not deployed. Health returned `200 {"ok":true}`.
- Production after fix: dashboard 186.6ms; exact `test01` generation search 317.7ms; users 18.2ms; ordinary generation list 44.4ms; assets 111.4ms; wallet 13.2ms. Additional audit: support 4.6ms, user characters 6.6ms, creator data 2.5ms, creator withdrawals 2.2ms, membership codes 3.0ms, recharge ledger 226.8ms.

## Vega frontend display labels (2026-11-05)

- User requested test-stage frontend labels only: `vega10-lite` -> `h3（vega）`, `h3-vega` -> `wan（vega）`, `seedance20-vega` -> `seedance2.0（vega）`, `seedance25-vega` -> `seedance2.5vega`.
- Provider IDs, model versions, routing, pricing, and media limits are unchanged. Pro will later be routed behind a unified Seedance entry; this change only separates the test models in the UI.
- Changed files: `platform.html`, `platform.config.js`, `test/tencent-vod-vega.test.js`.
- Verification: Vega tests 50/50 pass; advanced-pricing + source-split 21/21 pass; syntax checks and `git diff --check` pass.
- `old-site`: `c2c6f5b`, pushed. `platform-release`: `3420456`, built from `c2c6f5b` and pushed with force-with-lease.
- Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; `/api/health` returns `200 {"ok":true}`. Public HTML and `platform.config.js` confirm all four new labels. Live was not deployed.

## Vega 1.5 Pro integration (2026-11-05)

- Scope is limited to Vega 1.5 Pro (`seedance25-vega`): upstream `wand-vega-video / 1.5-pro`. Vega 1.0 Lite (`vega10-lite`) and Vega 1.5 Lite (`h3-vega`) behavior is unchanged.
- Pro 1.0 and 1.5 use the Tencent VOD media-library flow before charging/generation: `PullUpload` -> poll `DescribeTaskDetail` -> require `Status=FINISH`, `ErrCode=0`, non-empty `FileId` -> send `FileInfos` as `Type=File` with `FileId` and top-level `InputRegion=Oversea`. Lite keeps `Type=Url`.
- Model limits enforced server-side and in upload UI: 1.5 Pro 30 images / 10 videos / 10 audios / 50 total; each video/audio 2-30 seconds; no video total-duration cap; audio total <=30 seconds; upload max 30MB image / 200MB video / 15MB audio. 1.0 Pro remains 9/3/3/12 with video/audio totals <=15 seconds and max 30MB/50MB/15MB.
- Output duration: 1.5 Pro 4-30 seconds or `-1`; draft requires 480P, and Draft to Final submits only `draft_task_id` plus output settings without prompt/media.
- Default sale prices (credits/second): no-reference 480P=13.98, 720P/768P=27.42, 1080P=59.685, 2K=147, 4K=161.7; with reference video input/output 480P=8.385, 720P/768P=17.07, 1080P=36.465, 2K=89.07, 4K=97.98. Reference-video input bills at least `ceil(output billing seconds * 2/3)`; `duration=-1` estimates 30 seconds; no extra reference-image fee for 1.5 Pro.
- API docs updated with all four Vega models, Pro media-library flow, Lite URL flow, and per-model count/duration/size limits.
- Changed files: `platform.config.js`, `platform.create.parts/part-04.js`, `server.parts/part-01.js`, `part-02.js`, `part-11.js`, `part-14.js`, `part-30.js`, `part-31.js`, `part-38.js`, `part-39.js`, `tencent-vod-vega.js`, `test/tencent-vod-vega.test.js`, `test/advanced-pricing.test.js`.
- Targeted verification: Vega tests 50 pass / 0 fail; pricing + source split 21 pass / 0 fail; syntax checks and `git diff --check` pass. Full suite has 22 pre-existing failures on both this change and HEAD; change has 647/669 pass (4 new tests added), baseline HEAD has 643/665 pass with the same failure set.
- `old-site`: `bf5df0c`, pushed. `platform-release`: `124de4b`, built from `bf5df0c`; pushed after refreshing the latest immutable release base.
- Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; service is active and `/api/health` is `200 {"ok":true}`. Public `platform.create.parts/part-04.js` confirms the 1.5 Pro 200MB video limit and 30-image reference limit. Live was not deployed.

## Vega regenerate media asset IDs (2026-11-05)

- User reported that Regenerate did not populate media asset IDs into the new task.
- Root cause: Vega restore/submit/pending/server flows reconstructed media from URLs and dropped `userAssetId`; list responses could also omit complete media metadata.
- Fixed restore and submit paths for first frame, last frame, reference images, reference videos, and reference audio to preserve user asset IDs.
- Regenerate buttons now refresh the authoritative task detail before restoring the form, falling back to the cached record only when detail refresh fails.
- Existing Vega records without stored IDs are backfilled from PostgreSQL `app_user_assets` by the current user and matching media URL. No JSON/flat-file fallback was added.
- Files changed: `db.js`, `platform.create.parts/part-01.js`, `part-03.js`, `part-04.js`, `part-05.js`, `server.parts/part-01.js`, `part-26.js`, `part-29.js`, `part-41.js`, and targeted tests.
- Targeted Vega/pricing/refresh tests: 86 pass, 0 fail. Syntax checks and `git diff --check` pass.
- `old-site`: `c444fb2`, pushed. `platform-release`: `edff497`, built from `c444fb2`, pushed with lease protection.
- Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; service is active and `/api/health` is `200 {"ok":true}`.
- Public `platform.create.parts/part-03.js` confirms first-frame/reference asset IDs and pending media asset IDs; `part-04.js` confirms restore logic. Live was not deployed.

## Vega Pro media-library import (2026-11-05)

- Scope is limited to Vega 1.0 Pro (`seedance20-vega`) and Vega 1.5 Pro (`seedance25-vega`). Vega 1.0 Lite (`vega10-lite`) and Vega 1.5 Lite (`h3-vega`) keep the existing URL path and are not modified.
- Tencent VOD Pro flow is now enforced before charging/generation: `PullUpload` every public media URL, poll `DescribeTaskDetail`, require `Status=FINISH`, `ErrCode=0`, and a non-empty `FileId`, then submit `FileInfos` as `Type=File` with `FileId` and top-level `InputRegion=Oversea`.
- Import failure, timeout, missing task id, or missing `FileId` fails the request before deduction, generation-record creation, or `CreateAigcVideoTask`.
- Successful and failed import metadata is stored in PostgreSQL table `app_vega_media_library`, keyed by `(user_id, source_url, sub_app_id)`; successful `FileId` entries are reused. No JSON or file fallback was added.
- Updated public API docs and API response descriptions to distinguish Pro media-library import from Lite URL submission.
- Changed files: `tencent-vod-vega.js`, `db.js`, `server.parts/part-01.js`, `server.parts/part-26.js`, `server.parts/part-30.js`, `server.parts/part-31.js`, `test/tencent-vod-vega.test.js`, `CODEX_TASK_STATE.md`.
- Verification: `test/tencent-vod-vega.test.js` 47 pass / 0 fail; `test/advanced-pricing.test.js test/source-split.test.js` 19 pass / 0 fail; `node --check server.js tencent-vod-vega.js db.js` and `git diff --check` pass.
- Contract check against Tencent Cloud VOD SDK `4.1.340`: `PullUploadRequest` accepts `MediaUrl` / `MediaName` / `SubAppId`; `PullUploadResponse` returns `TaskId`; `DescribeTaskDetailResponse.PullUploadTask` exposes `Status`, `ErrCode`, `Message`, and `FileId`; `AigcVideoTaskInputFileInfo` supports `Type=File` + `FileId`; `AigcVideoTaskInput.InputRegion` is a top-level field.
- Deployment: `old-site` `aaca5b0`, `platform-release` `9e039aa` (pushed with lease protection), deployed only with `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}` and `raising-game-demo` is active. Live was not deployed.

## Vega 1.0 Pro parameter compatibility fix (2026-11-05)

- Failed task `cgt-20261105130507-09ee17` was refunded after upstream returned `InvalidParameter: ModelVersion "1.0-pro" does not support WandAgent.Parameters.GenerateMode`.
- Root cause: `seedance20-vega` inherited permissive capability defaults, so both `GenerateMode` and `VideoQualityMode` were included in `WandVegaParameters`.
- Fix: mark Vega 1.0 Pro as not supporting generation/quality modes; `buildVegaExtInfo()` now omits both fields as a backend fail-safe. The create-page payload also omits unsupported controls, and API docs mark them unsupported for this model.
- Regression coverage includes Vega 1.0 Pro reference-video payload construction, Vega 1.5 Lite support, and Vega 1.5 Lite omission behavior.
- Targeted tests: 69 pass, 0 fail. Related notification/history/source tests: 35 pass, 0 fail. Syntax and diff checks pass.
- `old-site`: `a043425`, pushed. `platform-release`: `8c13804`, built from `a043425`, pushed with lease protection and deployed to `123vips.com` only.
- Production verification: `/api/health` returns `200 {"ok":true}`; deployed `tencent-vod-vega.js` marks Vega 1.0 Pro `generateMode: false` / `qualityMode: false`; deployed create payload omits unsupported fields. Live was not deployed.

## Generation notification transition-only fix (2026-11-05)

- User reported generation notices reappeared on every page refresh.
- Root cause: completion detection compared against the current in-memory list and reset that list whenever `setUser()` saw a transient/missing user id. Completed history was therefore treated as newly completed again.
- Fix records the last observed status per task in account-scoped localStorage and emits a notice only when that task transitions from a non-terminal status to a terminal success/failure status.
- Terminal statuses are never downgraded by stale list responses. First observation of an already-complete task is a baseline and does not notify.
- Targeted refresh/history/Vega tests: 34 pass, 0 fail. Syntax and diff checks pass.
- Merged current `origin/old-site` Vega 1.0 Pro work without conflicts. Related merged test suite: 96 pass, 0 fail.
- `old-site`: `443d2b7`, pushed. `platform-release`: `10caf89`, built from `443d2b7`, pushed and deployed to `123vips.com` only.
- Production health: `200 {"ok":true}`. Public `platform.ui.parts/part-02.js` contains the transition-only notification implementation. Live was not deployed.

## Vega Lite submit crash hotfix (2026-11-05)

- User reported Vega 1.0 Lite submit button had no response after the latest changes.
- Root cause: in the Vega submit branch, `const vegaReferenceLimits = vegaReferenceLimits(provider)` shadowed the helper of the same name. JavaScript TDZ threw before the request and left the button disabled.
- Fixed by renaming the local config to `vegaReferenceLimitConfig`; no validation behavior changed.
- Added regression coverage preventing the self-shadowing declaration from returning.
- Targeted tests: 66 pass, 0 fail. `node --check` and `git diff --check` pass.
- `old-site` commit `61d6e6e`, pushed to origin.
- Platform release `fafcafc`, built from `61d6e6e`, pushed to origin with lease protection and deployed to `123vips.com` only.
- Production verification: `/api/health` `200 {"ok":true}`; deployed `platform.create.parts/part-03.js` contains `vegaReferenceLimitConfig`; `vega10-lite` 1080P x 6s estimate is 69.21 credits.
- Live was not deployed.

# Codex Task State

## Vega regeneration input-media restoration (2026-11-05)

- User reported that all four new Vega channels lost original reference media when regenerating an existing record. The affected inputs are first frame, last frame, reference images, reference videos, and reference audio.
- `server.parts/part-29.js` now resolves `asset://asset-...` values back to public PostgreSQL-backed source URLs, keeps URI fields separate, and no longer duplicates URI-only FileInfos beside hydrated URL entries. Reference asset URI arrays are aligned to the actual media count.
- `platform.create.parts/part-04.js` prefers public URLs during form restoration, safely handles missing frame/asset values, and merges media across asset ID, asset URI, and public URL without dropping fields or creating duplicates.
- `server.parts/part-41.js` recognizes Vega media type from Usage/Role/Category/type, merges canonical and legacy arrays by position, preserves asset IDs and URIs, and excludes generated result URLs from regeneration inputs.
- Regression file `test/vega-regeneration-media.test.js` covers legacy `upstreamPayload.FileInfos`, ordered reference images/videos/audios, asset-URI-only frames, canonical-versus-legacy array hydration, result-URL exclusion, the server regenerate payload, and frontend restoration.
- Verification: `node --require ./test/source-compat.js --test test/media-inputs.test.js test/tencent-vod-vega.test.js test/advanced-pricing.test.js test/vega-pricing-label.test.js test/vega-regeneration-media.test.js` passes 114/114. `node --check tencent-vod-vega.js`, `node --check server.js`, `node --check platform.create.js`, and `git diff --check` pass.
- `old-site` commit `cd0198f`, pushed to origin. `platform-release` snapshot `410e34b` was built from it, pushed with lease protection, and deployed only to `123vips.com` using `scripts/deploy_local.sh --site old`.
- Production `/api/health` returns `200 {"ok":true}`. Public `platform.create.parts/part-04.js` contains the null-safe restore and cross-identifier media merge functions. `live-release` remains `6642e17`; Live was not deployed.

## Vega 1.0 Pro integration (2026-11-05)

- Added provider `seedance20-vega` / `wand-vega-video / 1.0-pro`, presented as `Vega 1.0 Pro` across the Advanced model selector, aliases, server constraints, API docs, and reference upload UI.
- Supported output: 480P / 720P / 768P / 1080P / 2K / 4K, duration 4-15 seconds (default 5, no `-1`), ratios 21:9 through adaptive, ReturnLastFrame enabled, and no FrameRatioFromInput.
- Reference limits: 9 images, 3 videos, 3 audios, 12 total; video and audio each capped at 15 seconds. Reference images are free for Vega 1.0 Pro.
- Pricing source: Tencent VOD international USD/second rate x 100 credits/USD x 1.5 sale markup. The USD table supplied by the user is represented exactly in PostgreSQL-backed platform pricing.
- No-reference output credits/second: 480P 9.6, 720P 18.345, 768P 18.345, 1080P 39.93, 2K 99.225, 4K 113.07.
- With reference-video input, both input and output use: 480P 6.03, 720P 11.535, 768P 11.535, 1080P 24.93, 2K 61.62, 4K 69.225 credits/second.
- Billing rounds the minimum reference-video input up to `ceil(output seconds x 2/3)` and charges input plus output separately. Example: 1080P x 6s without reference = 239.58 credits; with 1s input, the input floor is 4s and the total is 249.3 credits.
- PostgreSQL/admin pricing includes 6 no-reference output rows and 6 reference-video input/output rows. Missing rates fail closed before charging or calling upstream.
- Updated: `platform.config.js`, `platform.create.parts/part-04.js`, `platform.html`, `platform.main.js`, `platform.ui.parts/part-02.js`, `platform.ui.parts/part-03.js`, `platform.ui.parts/part-04.js`, `server.parts/part-01.js`, `server.parts/part-02.js`, `server.parts/part-11.js`, `server.parts/part-30.js`, `server.parts/part-31.js`, `server.parts/part-38.js`, `server.parts/part-39.js`, `tencent-vod-vega.js`, and three targeted test files.
- Targeted tests: 69 pass / 0 fail; result-order/refresh/history/source-split: 35 pass / 0 fail. `node --check` and `git diff --check` pass.
- `old-site` commit `53d47cd`, pushed to origin. Platform release `dc402b5` was built from that commit, pushed to `platform-release`, and deployed to `123vips.com` only.
- Production PostgreSQL `app_kv.app_config.platform.advancedPricing` now contains both Vega 1.0 Pro rate tables (6 output and 6 reference-video input rates).
- Production verification: `/api/health` returns `200 {"ok":true}`; `platform.html` exposes `seedance20-vega`; `/api/advanced/estimate` returns 239.58 credits for 1080P x 6s and 249.3 credits for 1080P x 6s with 1s reference video (4s input floor). Live release remains `6642e17` and was not deployed.

## Account-level generation completion polling (2026-11-05)

- User reported failed tasks remained `processing` until opening Result; completion notices previously depended on a History request and only recognized success.
- Added a logged-in account-level 10-second poll of `/api/generation-records?page=1&limit=20&refresh=1`, independent of the active tab.
- Poll updates History page 1 and Result cache; it does not force navigation. In-flight polling is guarded against overlap.
- Notifications now cover terminal failures as well as success, render a red failure notice with error detail, and notify each taskId at most once.
- Removed the duplicate Result pending-status loop. Result retains only bounded poster-repair retries; result entry still performs one authoritative detail refresh.
- Targeted tests: 50 pass, 0 fail across refresh/history/Vega pricing suites. Full suite baseline and patched both 633 pass / 22 fail from pre-existing fixture/text assertions; new tests pass.
- `node --check`, `git diff --check` pass.

## Vega 1.0 Lite button cost hotfix (2026-11-05)

- User reported Vega 1.5 Lite 1080P × 6s = 162 credits and Vega 1.0 Lite 1080P × 6s = 300 credits.
- Root cause: browser-side `normalizeAdvancedProvider()` did not recognize `vega10-lite` / `vega1.0lite`, so it fell through to Seedance. Seedance 1080P at 60 credits/sec × forced 5s explained the incorrect 300.
- Fixed `platform.ui.parts/part-02.js` to preserve Vega 1.0 Lite provider identity before Seedance normalization.
- Fixed `platform.main.js` resolution-choice click handler to call `updateAdvancedButtonCost()` after changing resolution.
- Backend pricing is correct: Vega 1.5 Lite (`h3-vega`) 1080P × 6s = 162 credits; Vega 1.0 Lite (`vega10-lite`) 1080P × 6s = 69.21 credits.
- Regression coverage added in `test/vega-pricing-label.test.js` and `test/advanced-pricing.test.js`.
- Targeted tests: 64 pass, 0 fail. `node --check` and `git diff --check` pass.
- `old-site` commit `4620c59`, pushed to origin.
- Platform release `1222bda`, built from `4620c59`, pushed to origin with lease protection and deployed to `123vips.com` only.
- Production verification: homepage `200`, `/api/health` `{"ok":true}`, deployed `part-02.js` contains the Vega 1.0 Lite normalization, and deployed `platform.main.js` resolution handler calls `updateAdvancedButtonCost()`.
- Production estimate: `h3-vega` 1080P × 6s = 162 credits; `vega10-lite` 1080P × 6s = 69.21 credits.
- Live was not deployed.

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

## Vega 1.5 Pro invalid draft_task_id fix (2026-11-05)

- Production task `cgt-20261105141752-25b773` failed with `InvalidInput: invalid draft_task_id`; the persisted payload contained `draftTaskId: "undefined"` along with a prompt and two reference images.
- Root cause: the shared Vega Draft resolver treated any non-empty string, including `"undefined"`, as a valid Draft-to-Final ID and routed an ordinary image-reference request into Draft mode.
- Fixed `normalizeVegaDraftTaskId()` to treat blank, `undefined`, `null`, and `NaN` as empty. Draft-to-Final now requires both a valid ID and a request with no prompt or media. Prompt/media with stale Draft state is normalized to ordinary generation; a genuine draft-only request remains Draft-to-Final and missing its ID fails with `DRAFT_TASK_ID_REQUIRED`.
- Frontend payload, submit, and record restore paths use the same dirty-ID normalization so `"undefined"` is not written back to the Draft task ID field.
- Added a regression test using the exact production prompt, 1080P/5-second settings, and two reference images; it asserts Prompt and two FileInfos are sent and `draft_task_id` is absent.
- Verification: `test/tencent-vod-vega.test.js` 52 pass, 0 fail; advanced-pricing + source-split 21 pass, 0 fail; syntax checks and `git diff --check` pass.
- No provider IDs, model versions, pricing, or media limits changed.
- Deployment: `old-site` `ef866f7`; `platform-release` `7d7ee81`, built from `ef866f7`; deployed only `123vips.com` with `scripts/deploy_local.sh --site old`. Production `/api/health` returned `200 {"ok":true}` and the public Vega module contains the new dirty-ID normalization. Live was not deployed.

## Current live verification

- Draft-to-Final bug fixed locally: stale `draftTaskId` / `draft_followup` from browser, template, or record state is normalized before pricing or upstream submission.
- Lite requests with prompt or media are always treated as ordinary generation; stale draft state is discarded and `draft_task_id` is never sent.
- Draft-only Lite intent is rejected explicitly with `DRAFT_UNSUPPORTED` before credentials, charging, or upstream submission.
- Regression suite: 54 pass, 0 fail. Syntax checks and `git diff --check` pass.

## Vega 1.5 Pro GenerateMode removal (2026-11-05)

- Production task `cgt-20261105143223-6d9f9c` failed with `InvalidParameter: ModelVersion "1.5-pro" does not support WandAgent.Parameters.GenerateMode`.
- The attached Tencent VOD document covers Lite only. A real 1.5 Pro probe (`cgt-20261105144726-23f3da`) then showed both controls are unsupported: first `GenerateMode`, then `VideoQualityMode`; the probe was refunded in full.
- The fix removes both controls for `seedance25-vega`; Lite providers, pricing, provider IDs, and media limits are unchanged.
- Backend and frontend capability tables now mark `generateMode: false` and `qualityMode: false` for `seedance25-vega`; payload tests assert both fields are absent.
- Verification: `test/tencent-vod-vega.test.js` 52 pass, 0 fail; advanced-pricing + source-split 21 pass, 0 fail; syntax checks and `git diff --check` pass.
- Deployment: `old-site` `3215b99`; `platform-release` `bc541fe`, built from `3215b99`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. Production health is `200 {"ok":true}`. Live was not deployed.
- Production probe results: `cgt-20261105144726-23f3da` failed on `GenerateMode` and was refunded; `cgt-20261105144818-651366` passed parameter validation but was blocked by reference-image person moderation and refunded; `cgt-20261105144942-1b583c` likewise failed reference-image person moderation; text-only `cgt-20261105145054-f5732b` succeeded with no `GenerateMode`/`VideoQualityMode`, final billing `298.425` settled, video `https://store.vod-qcloud.com/9ca6b0e1vodhk251000800/2185dfba5001834827022755451/aigcVideoGenFile_ag2.mp4`.
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

## Diagnosis (2026-11-05): cgt-20261105120518-1c9a87

- Created at `2026-11-05T04:05:19.036Z` (server UTC+8: 12:05:19).
- Vega 1.0 Lite, 1080P, 5s, reference-image mode; upstream Tencent VOD task `1524935253-AigcVideoTask-1057c525539a26e362668d375774be9et`.
- Upstream ran from `04:05:19Z` to `04:06:20Z` (61 seconds) and returned `FINISH`, progress 100, `ErrCode 70000`, `ErrCodeExt ContentViolated`.
- Upstream message: `task failed with status: FAIL, message: audit block prompt: label=Porn`.
- Local record was terminalized as `failed` at `04:07:17Z`; generation failure is an upstream content-policy rejection, not a submission/polling stall.
- Billing defect: 57.675 credits were deducted (`ledger-981a9c2cedf055d6a1e2e6e1`, type `advanced_generation`, delta -57.675), but the failed record remains `billingStatus: pre_deducted`, `finalCredits: 0`, with no generation refund ledger entry.
- Dry-run repair confirms the record matches refund repair, but no production mutation was applied.

## Fix and production refund (2026-11-05): cgt-20261105120518-1c9a87

- Confirmed the production detail and list APIs already returned `failed` for the task, not `processing`; the stale UI state came from cached History records merged after the authoritative detail response.
- Fixed Result record merging so a stale pending History row can no longer overwrite a terminal detail status or erase its failure metadata.
- Reduced active Result polling from 60 seconds to 10 seconds. Detail polling enqueues upstream refresh in the background, so this does not add another synchronous upstream request.
- Fixed the refund predicate: failed Vega/Seedance/APIZ records already carrying `finalCredits: 0` but `billingStatus: pre_deducted` now enter the normal idempotent refund path. Previously only `finalCredits > 0` qualified.
- Applied the production repair for `cgt-20261105120518-1c9a87`; PostgreSQL now reports `status=failed`, `billingStatus=refunded`, `finalCredits=0`.
- Targeted regression tests: 61 pass, 0 fail. `node --check` and `git diff --check` pass.
- Full suite currently has 22 pre-existing failures outside these changed paths; the relevant Vega/result/refund suites pass.

## Deployment before Vega 1.0 Lite retest (2026-11-05)

- Redeployed only `123vips.com` through `scripts/deploy_local.sh --site old`.
- `old-site`: `81cddd7`; `platform-release`: `0d59f566c6fb1e81d758c5f4baec01c8cbe01933`.
- Production checkout confirmed at `0d59f566c6fb1e81d758c5f4baec01c8cbe01933`; `raising-game-demo` is active; `/api/health` returns `{"ok":true}`.
- Verified the deployed refund fix (`pre_deducted` qualifies for refund) and 10-second Result polling are present.
- Next: user will submit a new Vega 1.0 Lite generation; inspect that task only for terminal status, upstream parameters, pricing, and automatic refund on failure.

## Admin generation username search fix (2026-11-05)

- User reported that admin generation records no longer found data when searching by username `test01`.
- Production verification found four active accounts with username `test01` across different tenants: `user-1777972853765-6da5a3f7` (main) 237 records, `user-1785989952997-cc30465c` (tool-undress-14vips) 13 records, `user-1784902608053-8303c73c` (tool-video-123tops) 11 records, and `user-1788749742388-95672d95` (tool-chat-5vips) 0 records.
- Root cause: the optimized generation-record search resolved a username with `LIMIT 1`, so it selected one tenant-specific account and missed records belonging to the others.
- Fixed `getAdminGenerationRecordsPageFromDb()` to resolve every matching non-deleted account and filter generation records with `userId = ANY(text[])`.
- Also made username matching case-insensitive while preserving the fast indexed user-ID lookup.
- Regression coverage updated in `test/admin-generation-records-list.test.js`.

## Admin generation detail reference media fix (2026-11-05)

- User reported that reference images and other reference media were missing in the admin generation-record detail dialog.
- Root cause: after the admin list performance optimization removed heavy `mediaAssets` payloads from list rows, `fetchAdminGenerationRecordDetail()` could still short-circuit when a list row happened to contain result/request fields. The dialog then rendered the lightweight list record instead of fetching the complete detail record.
- Fixed the detail flow to always request `/api/admin/generation-records/:taskId` for any row with a task ID.
- Media detail mapping now preserves stable `referenceIndex` values, signs preview/download URLs by the stable index, preserves a direct source fallback, and recognizes images, reference videos, and reference audio. Direct URL fields (`cdnUrl`, `publicUrl`, `localUrl`, `sourceUrl`, `url`) are supported even when no linked `userAssetId` exists.
- Changed files: `admin.js`, `admin.css`, `server.parts/part-21.js`, `server.parts/part-41.js`, `test/admin-generation-records-list.test.js`.
- Verification: targeted admin generation/media suites 13 pass, 0 fail; `node --check admin.js`, `node --check server.js`, `node --check server.parts/part-21.js`, `node --check server.parts/part-41.js`, and `git diff --check` pass.
- Deployment: `old-site` `85ca673`; `platform-release` `8054ce5`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. Production `/api/health` returned `200 {"ok":true}`. Public `admin.html` now references the new content-hash asset version, and the deployed `admin.js` contains the forced full-detail fetch and audio/video reference handling. Live was not deployed.


## Visual system refinement (2026-11-05)

- Goal: close the visual precision gap with `ourdream.ai` through a unified layout/control scale rather than isolated styling.
- Design audit at 1440x1000: ours had a 248px rail plus 38px content gutter and 5x10px grid gap; reference used roughly 204px rail, 40px content gutter, and 12px gaps. Cards also carried too many competing text layers.
- Desktop changes: rail is now 216px at >=1400px and 208px from 1081-1399px; content starts at rail + 24px/padding-inline 24px (20px under 1400px); grid gap is 12px; card radius is 12px; controls share 38px/44px heights and 10px radii.
- Sidebar changes: flat navigation list instead of isolated boxed buttons; quieter 38px rows, 16px icons, subtle active surface, no pink outline/inset stripe.
- Gallery changes: search/filter controls unified; gallery card media is taller, title is emphasized, stats/profile are demoted, tags are one-line and smaller, LIVE badge is smaller/neutral. Card tags now use one tag from the JS renderer.
- Cross-page polish: case library toolbar/cards and asset toolbar now share the same radius, height, spacing, and low-contrast surfaces. Mobile-only tag truncation was added; mobile layout remains two columns.
- Previewed via CDP against production with local CSS injected at 1440x1000 and 390x844. Screenshots: `/tmp/raising-perf-shots/ours-visual-refined.png`, `visual-tab-cases.png`, `visual-tab-advanced.png`, `visual-tab-history.png`, `visual-mobile-gallery.png`.
- Verification: syntax and `git diff --check` pass; targeted suite 76/82. The same 6 failures reproduce on HEAD without this change (`test/advanced-custom-ui.test.js`, pre-existing Vega/Wan pricing assertions).
- Release: `old-site` `e634055`; `platform-release` `ae53a85` built from it and pushed with lease protection. Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; Live was not deployed.
- Production verification: `/api/health` is `200 {"ok":true}`; production `platform.css` SHA-256 exactly matches `platform-release`; browser at 1440x1000 reports 216px rail, 240px content origin, 44px search, 12px grid gap, and 12px card radius. Cases/Advanced/History render without new console errors; mobile gallery remains two columns.

## Generate conversational redesign plan (2026-11-05)

- User asked to stop and plan first, show a design mock, then execute in stages. No production/business source files have been changed in this phase.
- Direction: desktop shell keeps the 216px navigation, adds a 62px header, a centered conversation stream (max 860px), a fixed bottom Composer, and a collapsible 356px right drawer. History is the default drawer tab.
- Composer: attachment chips above a contenteditable prompt, model/@assets/parameters/preset/upload icons below, Generate action at right. Prompt grows from 38px to 180px and scrolls internally beyond that. Mention spans are rendered pink.
- Conversation: newest turn at the bottom, only the most recent 5 turns inline. History mini cards use a click-time action bar so the `download2` tooltip does not cover other actions.
- Unified model system: one shell for all models; model-specific parameters are shown only when meaningful and hidden controls continue using existing server defaults.
- Interactive mock: `/Users/x042/.codex/visualizations/2026/11/05/01a1ab8c-4aa5-7a33-82cd-78be1dd6cb1f/generate-redesign.html`
- Screenshots: `generate-desktop.png`, `generate-model-modal.png`, `generate-mobile.png`, `generate-mobile-closed.png` in the same directory.
- Planned phases: (1) layout shell and responsive drawer; (2) unified model/params modals and capability mapping; (3) Composer attachments/@ mentions/autogrow; (4) conversationized history plus drawer Result/History; (5) result actions and cross-model regression; (6) release only after user approval, build `platform-release`, deploy `--site old`, verify production.
- Decision gate: wait for design approval before editing `platform.html`, `platform.css`, or Generate JS.

## Vega Lite TOS-only media flow (2026-11-06)

- User clarified that Vega Lite models must never use the Tencent VOD media library. Their uploaded files are already stored in TOS/object storage, and the public HTTP(S) URL should be sent directly in `FileInfos`.
- Only `seedance20-vega` (Vega 1.0 Pro) and `seedance25-vega` (Vega 1.5 Pro) use `asset://` via `CreateAigcMaterial` / `DescribeTaskDetail`.
- Fixed a missing `resolveVegaLiteMediaAssetSources` import in `server.parts/part-01.js`; the server had been returning `INVALID_ADVANCED_REQUEST` at runtime.
- Lite public URLs now bypass both VOD media-library lookup and database asset lookup. A stale `asset://` is only resolved through an owned user-asset public URL fallback; if unavailable it fails with `VEGA_MEDIA_ASSET_UNAVAILABLE`, never upstream.
- Lite frontend validation text now requests a public HTTP(S) TOS URL, while Pro keeps public HTTP(S) or `asset://`.
- Pro still imports media before charging/CreateAigcVideoTask; Lite still uses URL `FileInfos` and never calls the asset API.
- Verification: `test/tencent-vod-vega.test.js`, `test/vega-regeneration-media.test.js`, and `test/advanced-pricing.test.js`: 82 pass / 0 fail; syntax checks and `git diff --check` pass.

## Vega Lite TOS-only deployment (2026-11-06)

- Deployment source: `old-site` `a59b64a`.
- Release snapshot: `platform-release` `c359a95`.
- Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; Live was not deployed.
- Production checkout: `c359a950a845e3c85c310fea6843b344b96a1817`.
- Production verification: `/api/health` returned `200 {"ok":true}`; public `tencent-vod-vega.js` has `VEGA_MEDIA_LIBRARY_PROVIDERS = seedance20-vega, seedance25-vega`, exports `resolveVegaLiteMediaAssetSources`, and public `platform.create.parts/part-03.js` contains distinct Pro/Lite validation messages.
- Unrelated local asset-target auto-routing work was stashed as `asset target local work before Vega Lite TOS deploy`, excluded from this release, then restored to the working tree after deployment.

## Vega stale split-chunk cache fix (2026-11-06)

- User still saw the generic `Vega requires a public HTTP(S) URL or an existing asset:// URI.` message after the Vega Lite TOS deployment.
- Production source already contained distinct Pro/Lite validation messages; the remaining cause was a stale service-worker cache of `platform.create.parts/part-03.js` and related platform chunks.
- `platform-sw.js`: navigations are now network-first; platform split chunks are network-first with cache only as offline fallback. Other shell assets keep stale-while-revalidate.
- `platform.js`: service worker registration uses `updateViaCache: "none"` so the browser checks the SW script directly.
- `server.parts/part-42.js`: `/platform-sw.js` now also gets CDN no-store headers, preventing Cloudflare from serving a stale worker for four hours.
- Regression: `test/platform-refresh-performance.test.js` locks network-first navigation/platform chunks, no-store SW CDN headers, and `updateViaCache`.
- Verification: syntax checks, `git diff --check`, and cache + Vega targeted suites: 104 pass / 0 fail.
- Release: `old-site` `c10d1c7`, `platform-release` `d679d5f`; deployed only `123vips.com`. Production `/api/health` is OK; `/platform-sw.js` is now `cf-cache-status: BYPASS` with CDN no-store; production loader references fresh `platform.js?v=mw4gzc3o`; Pro/Lite messages remain distinct.

## Same-style navigation group (2026-11-06)

- User requested Cases, Video, Anime, and Image move under a collapsed first-level navigation named `同款`, with Cases first.
- `platform.html`: added `data-nav-group="same-style"` parent using `nav.sameStyle`; child order is Cases, Video, Anime, Image; child panel starts `hidden`.
- `platform.main.js`: toggles `aria-expanded`, `is-expanded`, and panel visibility; closes the overflow menu after a child selection.
- `platform.explore.js`: syncs only main navigation tabs, propagates active state to the parent, and treats the group as one overflow unit.
- `platform.ui.parts/part-01.js`: hides and collapses the parent when all four children are unavailable under tenant permissions.
- `platform.css`: parent/child/chevron/active-child/overflow styles; mobile submenu keeps `width: auto` to avoid clipping.
- `platform.copy.js`: Chinese `同款`; other locales use `Same style` placeholder.
- Verification: `node --require ./test/source-compat.js --test test/side-navigation-overflow.test.js test/platform-refresh-performance.test.js test/cases-membership.test.js test/platform-site-profile.test.js`: 28 pass, 0 fail. Chrome desktop/mobile visual checks passed; tenant policy currently hides Anime (expected).
- Commits: `ed9ce20` and mobile width fix `b22b5fc`, pushed `old-site`. `platform-release`: `a9df239`, built from `b22b5fc` and pushed.
- Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; production checkout `a9df239...`; service active; `/api/health` returned `200 {"ok":true}`. Live was not deployed.

## Generate assets target filtering and video Add fix (2026-11-06)

- Goal: keep the Assets Target categories, make clicking them actually filter the asset list, and stop video Add from reporting success without adding a reference.
- Asset filters now clear the old list, show loading immediately, request `/api/user-assets?type=...`, and use a monotonic request sequence so stale responses cannot overwrite a newer category selection.
- Target categories remain available, but video/audio targets are shown only when the active provider has a nonzero reference limit. Image targets remain unchanged.
- Video/audio library Add now verifies that the reference was actually stored. Unsupported modes return a clear error instead of showing `Added`.
- Changed files: `platform.config.js`, `platform.copy.js`, `platform.create.parts/part-01.js`, `platform.create.parts/part-02.js`, `platform.create.parts/part-04.js`, `platform.main.js`, `platform.ui.parts/part-01.js`, `test/tencent-vod-vega.test.js`.
- Capability correction: Seedance 2.5 `reference_video` and `omini` now allow video/audio references (10 each); `first_last_frame` allows neither; Seedance NSFW `edit`/`extend` allow one video and no audio. Video/audio Targets are hidden when the active mode has no capacity.
- Verification: `test/tencent-vod-vega.test.js` 61 pass / 0 fail; `test/seedance25.test.js` + `test/media-inputs.test.js` 34 pass / 0 fail; `node --check` on all changed JS; `git diff --check` pass. `test/advanced-custom-ui.test.js` has 6 pre-existing failures also reproduced from clean HEAD, unrelated to this change.
- Release: `old-site` `9fd8a7d`, pushed; `platform-release` `d8a6d4c`, built from it and pushed with lease protection. Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`.
- Production verification: `/api/health` is `200 {"ok":true}`; served `part-01.js` contains `seedanceModeNeedsReferenceVideo`, `advancedAssetLoadSeq`, and `filterAdvancedAssetsByType`; served `part-02.js` contains `REFERENCE_NOT_SUPPORTED`, `REFERENCE_NOT_ADDED`, and `advancedMediaReferenceAddError`. Live release `6642e17` was unchanged and was not deployed.

## Same-style navigation language flash fix (2026-11-06)

- User reported refresh first paints Chinese `同款`, then switches to English `Same style`.
- Root cause: `platform.html` shipped a Chinese static fallback while default language was English; generic i18n rewrote the label after chunks loaded.
- Fix: a tiny inline head script reads `raisingGameLanguage`, sets `html.lang` and `i18n-<lang>` before body paint. The label contains sibling `i18n-en` / `i18n-zh` spans, selected by CSS, and is excluded from generic `data-i18n` rewriting.
- Verification: 28 targeted navigation/performance/profile tests passed. Production Chrome sampling (431 English frames, 349 Chinese frames) showed exactly one visible label throughout each load: `Same style` for en and `同款` for zh.
- Commit `57469a8`; release `f28057c`; deployed only `123vips.com`; service active and `/api/health` returned `200 {"ok":true}`. Live was not deployed.


## Diagnosis (2026-11-06): cgt-20261106114344-b684c5

- Task was created at `2026-11-06T03:43:44Z` (11:43:44 CST), before the asset Target/video Add fix was deployed at 12:58 CST.
- Provider/model: `vega10-lite` / `wand-vega-video:1.0-lite`; upstream task `1524935253-AigcVideoTask-e3ca56879f78dd5388b50e5bc44b32cbt`.
- Submitted media contained one image reference and zero video references; `params.referenceVideos=[]` and `upstreamPayload.FileInfos` contained only the image.
- Tencent VOD returned `Status=FINISH`, `ErrCode=70000`, `ErrCodeExt=InternalError`, `Message=task failed with status: FAIL, message: `. This is an upstream internal failure with an empty detail message, not a local validation or content-policy error.
- Local record is `status=failed`, `billingStatus=refunded`, `finalCredits=0`; no user action is needed for the refund.
- Recent Vega 1.0 Lite tasks after the fix include successful generations; no post-deploy task with `referenceVideos` has been submitted yet.

## Follow-up audit (2026-11-06): Vega Lite upstream media

- Confirmed `cgt-20261106114344-b684c5` is `vega10-lite` and its stored upstream `FileInfos` did contain `asset://asset-20261106112111-lp645`, with `referenceImageAssetIds` containing `asset-1793894577959-6e931c2f`.
- The task was created at 11:43:44 CST. The Lite media restrictions landed later (`b8df2e6` at 12:00 CST and `a59b64a` at 12:13 CST), so this was a pre-fix submission, not current behavior.
- Other historical Lite failures with the same upstream `asset://` problem: `cgt-20261105232129-8eb829` (`vega10-lite`) and `cgt-20261106112235-26489e` (`h3-vega`). All affected records are failed and refunded.
- A production PostgreSQL audit from the fix onward found zero Lite/h3 upstream `FileInfos` containing `asset://`.
- Latest post-fix Lite task `cgt-20261106132947-4db08c` still stores `asset://` in request params, but upstream `FileInfos` contains the public `https://media.123vips.com/...` URL and the task succeeded. Current code resolves owned Lite asset ids to public URLs before submission, and `buildVegaFileInfos()` rejects `asset://` for non-media-library providers.
- Production checkout `8d8d388` contains both `resolveVegaLiteMediaAssetSources` and the `allowAssetUri = vegaProviderUsesMediaLibrary(input.provider)` guard; `/api/health` returns `{"ok":true}`. Targeted Vega tests: 61 pass / 0 fail.

## OSS overseas-only storage guard (2026-11-06)

- User requirement: Alibaba Cloud OSS/CDN must use Singapore or US only; no mainland-China nodes.
- Allowed OSS regions are strictly `oss-ap-southeast-1`, `oss-us-west-1`, and `oss-us-east-1`. All `oss-cn-*` regions are rejected at runtime and during deployment.
- Added `OSS_CDN_REGION`; it must be one of the same allowed regions and must exactly match `OSS_REGION`.
- `OSS_CDN_BASE_URL` must be HTTPS and cannot point at an `aliyuncs.com` OSS origin or an `oss-cn-*` endpoint. Use a dedicated overseas CDN CNAME such as `assets-cdn.123vips.com`; never overwrite the existing `media.123vips.com` R2 DNS record.
- `scripts/deploy_site.py` rejects mainland OSS region/endpoint/CDN settings for old, live, and new2 deployments.
- Changed this step: `oss-storage.js`, `.env.example`, `DEPLOY.md`, `scripts/deploy_site.py`, `test/oss-storage.test.js`, `CODEX_TASK_STATE.md`.
- Verification: `node --test test/oss-storage.test.js` passes 6/6; `node --check oss-storage.js`; `node --check server.parts/part-01.js`; `python3 -m py_compile scripts/deploy_site.py`; `git diff --check` all pass.
- Alibaba credentials were already verified as `403 UserDisable` for OSS and `CdnServiceNotFound` for CDN. Real overseas OSS/CDN provisioning remains blocked until the account is enabled and an overseas CDN domain is available. No production OSS cutover has been claimed or deployed.

## 11.11 top-bar campaign and checkout dialog (2026-11-06)

- User goal: integrate the designed 11.11 campaign from `/Users/x042/Desktop/双11活动位与购买弹窗_交互原型(2).html` into the platform header, with desktop/mobile entries, purchase dialog, countdown, inventory, sold-out/purchased states, Stripe checkout, payment return/cancel handling, and PostgreSQL-backed purchase state. Do not deploy unless explicitly requested.
- Campaign `eleven-eleven-2026`: default `2026-11-10T00:00:00+07:00` through `2026-11-12T00:00:00+07:00`, overridable with `ELEVEN_ELEVEN_STARTS_AT` / `ELEVEN_ELEVEN_ENDS_AT`. SKU `member`: $29.9 (original $99), capacity 1,111, lifetime membership. SKU `credits`: $66 (original $90), capacity 1,111, 9,000 credits. One purchase per user per SKU; server owns prices, credits, dates, and inventory.
- Backend: `db.js` adds `app_promotion_purchases` plus state/reservation/paid/failed/order lookup helpers and an advisory-lock reservation path. `server.parts/part-44.js` defines campaign status and checkout endpoints; `server.parts/part-13.js` marks promotions paid before the existing paid-order early return; `server.parts/part-34.js` adds promo-aware Stripe success/cancel URLs and releases reservations on failure/expiry.
- Frontend: `platform.html` adds desktop and mobile header entries and the full dialog; `platform.css` adds entry/dialog/cards/success/ended/responsive styling; `platform.ui.parts/part-07.js` adds countdown, pre-start/ended states, selection, inventory, purchased/sold-out overlays, duplicate-submit prevention, Stripe return/cancel handling, settlement polling, and close/backdrop behavior.
- Existing Creator Members are treated as already owning the `member` SKU: status returns `owned`, the card is disabled with an “已拥有” overlay, and checkout returns `MEMBERSHIP_ALREADY_ACTIVE` before reserving inventory or creating another Stripe order. Credits remain separately purchasable.
- Verification: `node --require ./test/source-compat.js --test test/eleven-eleven-promo.test.js` passes 8/8; `node --check db.js`, `node --check server.js`, `node --check platform.ui.parts/part-07.js`, and `git diff --check` pass. The full source-split test remains blocked by pre-existing oversized parts `server.parts/part-29.js`, `server.parts/part-41.js`, `platform.ui.parts/part-02.js`, `platform.create.parts/part-02.js`, and `platform.create.parts/part-04.js`.
- Unrelated existing failure observed in `test/stripe-cashier.test.js`: it expects the older exact `pay.js` provider assignment, while the current working tree includes concurrent Airwallex changes. Do not revert those wallet changes as part of the 11.11 work.
- Integration: `old-site` commit `bb06217b13b04fc91159e10540a245833df30ad8` (`Add 11.11 campaign and React Flow workflow canvas`).
- Releases: `platform-release` `a043ac20daa8e5858b785905c46b60cb3e47ad87`; `live-release` `fb188448833c998b9685e99770b82f85b556d1e4`.
- Deployment status: deployed successfully to `123vips.com` and `live.123vipeak.com` via `scripts/deploy_local.sh --site old` and `--site live`; both `/api/health` endpoints returned `200 {"ok":true}`. Production campaign status is visible but inactive until `2026-11-10 00:00 +07:00`, as designed.

### 11.11 rolling three-day countdown and production verification (2026-11-06)

- User requested that the campaign start today and that the three-day countdown restart automatically when it reaches zero.
- Server behavior: campaign starts at `2026-11-06T00:00:00+07:00`; each round is exactly 3 days. The current window is computed from the server clock, with `ELEVEN_ELEVEN_PERIOD_SECONDS=259200` overridable subject to a 3600-second minimum.
- Frontend behavior: when the displayed countdown reaches its end, the UI refreshes promotion status and shows `11.11 新一期活动已开始`; the new round's countdown is calculated from the server-provided window.
- Rollover does not reset inventory and does not reset the per-account, per-SKU purchase limit. PostgreSQL remains authoritative for inventory and owned/purchased state.
- `test01` “already owned” is real data, not a hard-coded/demo state. In the `main` tenant, production PostgreSQL has `membership.status=active`, `source=activation_code`, `activatedAt=2026-10-29T04:23:37.597Z`, and `planId=plan-main-creator`; other `test01` accounts in other tenants have no membership record. Anonymous promotion status returns `owned:false`, confirming ownership is resolved from the authenticated database record.
- Changed files: `server.parts/part-44.js`, `platform.ui.parts/part-07.js`, `test/eleven-eleven-promo.test.js`.
- Verification: targeted 11.11 tests 8/8 pass; `node --check` passes for both changed scripts; `git diff --check` passes.
- Integration: `old-site` commit `85b2e7d195f42116ceccb9bd8073bab3c7dcf61b` (`Roll 11.11 countdown every three days`).
- Releases: `platform-release` `df4ddeb162b269a2618e898ddfd529921c0d391b`; `live-release` `9e3d09ac17e3e0965e89e97c9717d2b6c588492f`.
- Deployment: deployed successfully via `scripts/deploy_local.sh --site old` and `scripts/deploy_local.sh --site live`.
- Production verification: both sites return `active:true`, `started:true`, `visible:true`, `periodSeconds:259200`, with `startsAt=2026-11-05T17:00:00.000Z` and `endsAt=2026-11-08T17:00:00.000Z`; both `/api/health` endpoints return `200 {"ok":true}`. Anonymous SKU state returns `owned:false` and `purchased:false`, while inventory reflects the real PostgreSQL count.

### 11.11 unlimited campaign display (2026-11-06)

- User clarified that the campaign is not a physical product: remove all inventory, remaining-quantity, capacity, progress-bar, and sold-out concepts. Show only a social-proof sold count, which is intentionally mock presentation data rather than real inventory.
- Display values: member `已售 896`; credits `已售 743`. Both cards show `不限量`; dialog headline is `限时特惠，不限量供应`.
- The service status no longer returns `capacity`, `remaining`, `reserved`, or `soldOut`. Checkout no longer passes a capacity limit, and the inventory-cap path/error was removed. PostgreSQL still enforces one paid or active pending purchase per user per SKU.
- Changed files: `server.parts/part-44.js`, `platform.ui.parts/part-07.js`, and the 11.11-only sections of `platform.html`; tests updated in `test/eleven-eleven-promo.test.js`. Concurrent workflow changes in `platform.css` and unrelated cache-version lines in `platform.html` were deliberately left uncommitted.
- Verification: targeted 11.11 tests 8/8 pass; syntax and diff checks pass.
- Integration: `old-site` commit `dbade60f6aafdc53862386247a9f833b43995310` (`Make 11.11 campaign unlimited with social-proof sold counts`).
- Releases: `platform-release` `61c2fd642f8b026cb61dfb4e82186d8852ef2939`; `live-release` `090454a998d2ad8f860f54f9f2f30ca9bd87d828`.
- Deployment: deployed successfully via `scripts/deploy_local.sh --site old` and `scripts/deploy_local.sh --site live`; both health endpoints return 200.
- Production verification: both sites show `active:true`, `started:true`, member `sold:896`, credits `sold:743`, `owned:false`, `purchased:false`; both responses omit `capacity`, `remaining`, and `soldOut`.

### 11.11 unlimited credits repurchase (2026-11-06)

- User clarified that the `$66` credits SKU must be purchasable repeatedly by the same account during the campaign; the `$29.9` lifetime membership SKU remains limited to one paid purchase per account.
- PostgreSQL `app_promotion_purchases` now stores one row per order with an `id BIGSERIAL` primary key. An idempotent migration detects the legacy `(campaign_id, sku, user_id)` primary key and replaces it; a partial unique index enforces only one paid member purchase per campaign/account.
- Checkout reservation uses an account+campaign+SKU advisory lock. `member` returns `purchased` after a paid row; `credits` creates a new pending row per order and ignores prior paid rows.
- Public promotion state exposes `purchased` only for `member`. The latest credits order still exposes `orderStatus=paid` so Stripe return polling can confirm the just-completed purchase without disabling future credits purchases.
- Changed files: `db.js`, `server.parts/part-44.js`, `platform.ui.parts/part-07.js`, `test/eleven-eleven-promo.test.js`.
- Verification: 11.11 tests 8/8 pass; `node --check` passes for all three changed scripts; `git diff --check` passes. Production old-site restart completed with PostgreSQL configured and no schema-migration error.
- Integration: `old-site` `88ff9fb5615a299cc9e1b766e50027c9a937bff6` (`Allow unlimited 11.11 credits purchases`), pushed to origin.
- Releases: `platform-release` `f19c4d684270f4866dbb5d4868c145b6637e80ed`; `live-release` `0596a80dd157752e781b800466a7de31012cf4ea`, both built from `88ff9fb` and pushed with lease protection.
- Deployment: both sites deployed successfully via `scripts/deploy_local.sh --site old` and `scripts/deploy_local.sh --site live`. Both site health checks return 200.
- Production verification: both public promotion responses show `active:true`, member `sold:896`, credits `sold:743`; neither SKU returns a capacity/remaining/sold-out limit. The deployed promo code returns `purchased:false` for credits while preserving its latest order status for checkout-return confirmation.

## Platform user profile audit (2026-11-06)

- User asked for platform user characteristics: terminal, behavior, region, etc. Read-only production audit only; no code or deployment changes.
- Source: production PostgreSQL `raising_game` via `/etc/raising-game-demo.env`; credentials and DATABASE_URL were not printed.
- Snapshot at 2026-11-06 21:14 Asia/Bangkok: 674 accounts, 673 active (1 soft-deleted). Main tenant 532 users, tool-undress-14vips 115, tool-chat-5vips 17, tool-video-123tops 7, admins 2.
- Growth: 138 new in 7d, 268 in 30d. Monthly new: Apr 1, May 33, Jun 45, Jul 40, Aug 135, Sep 132, Oct 166, Nov (partial) 121.
- Auth: 146 Google, 5 Telegram, 2 verified email, 673 password hashes; 520 password-only (Google/Telegram/email fields absent). Most legacy/current accounts are password-based; email login still nascent.
- Lifecycle: 306/673 ever generated; 367 never generated (54.5%). 237 activated on registration day; 145 generated in last 7d, 201 in last 30d. 30-day cohort: 268 users, day-0 generation 83 (31.0%), D1 48 (17.9%), D7 18 (6.7% of all cohort; latest cohorts cannot reach D7).
- Generation: 28,286 records; 14,006 in last 30d, 4,330 last 7d, 672 last 24h. Last-30d kinds: video 10,276 / 187 users, advanced image 2,084 / 87, asset image 1,146 / 86, text 419 / 7. Video dominates. Last-14d generating DAU 36-60, 2026-11-05 peak 60. Failure last 30d: video 10.0%, advanced image 4.8%, asset image 4.9%, text 1.0%.
- Payment: 436 paid orders, 171 payers, 25.5% of 671 normal users. Payable/received snapshot about $14,909.70 recorded, Stripe received $14,379; 165/171 payers generated, avg 102.8 lifetime generations, median 32. Top packages usd-20 (185 orders/103 users), double-topup (92), usd-30 (69), usd-50 (41).
- Terminal (last 30d, server-rendered document requests, bots/API-heavy noise filtered): 32,958 samples / 6,411 IPs; desktop 55.3%, mobile 44.3%, tablet 0.4%; Chrome 64.1%, Safari 18.0%, Other 10.2%, Edge 3.9%, Firefox 3.3%; Windows 30.8%, Android 25.5%, iOS/iPadOS 19.2%, macOS 8.9%, Linux 7.0%.
- Web Vitals hostname-specific `123vips.com` last 30d: 20,482 events, desktop 10,356 (50.6%), mobile 9,087 (44.4%), tablet 1,039 (5.1%). Overall 30d: LCP p75 6,784ms / good 29.8%, INP p75 248ms / good 70.2%, CLS p75 0.01 / good 96.3%.
- Region table (GEO) is stale: last_seen 2026-10-30 22:03; 75,817 visits / 21,288 IP hashes, UNKNOWN 11,503. Top US 19,964, UNKNOWN 11,503, CN 7,566, JP 6,062, SG 5,052, DE 4,480, HK 4,157. Treat as historical visit geography, not current registered-user geography. Crawlers were separate: FacebookExternalHit 7,466, Bingbot 4,358, Applebot 4,256, Googlebot 1,812.
- Gaps: no reliable current country per account; no per-user browser/OS column; Nginx combined logs omit Host; GEO summary stopped updating after 2026-10-30. Recommend adding host-aware access logs and account country/source attribution, but do not infer missing data.

## Media transfer status in generation UI (2026-11-06)

- User requested a distinct state between generation success and accelerated-media readiness.
- Added public `advancedDownloadStatus` to generation records without exposing `advancedDownloadError`. Generation, billing, and error state remain unchanged by media transfer.
- Result, history, and history detail now show `素材加速中…` / `素材加速失败` pills. `download2` shows `加速中` and is temporarily disabled while preparing, then changes to `可下载`; failed shows `重试`.
- Workflow result cards show `已完成 · 素材加速中…` or `已完成 · 素材加速失败，可重试 download2` until the CDN copy is ready.
- Working tree contains unrelated workflow-canvas work; this feature's workflow `statusText()` hunk is staged separately. Cache suffix is `media-transfer-status-20261106-1`.
- Verification: `node --require ./test/source-compat.js --test test/generated-assets-on-demand.test.js` passes 19/19; syntax checks and `git diff --check` pass.
- Deployment hardening: deploy now resolves `refs/remotes/origin/<branch>` explicitly and retries the health endpoint across the normal restart window. Deployment checks pass 7/7.
- Final deployment: `old-site` `a1b5b80`, `platform-release` `3008d70`; `scripts/deploy_local.sh --site old` exited 0 after all health/page/commit checks. Production `https://123vips.com` has the acceleration-status UI and `advancedDownloadStatus` workflow handling.

## Workflow canvas upload race and stale node fix (2026-11-06)

- User report: after adding nodes/edges, uploading an image made the other nodes disappear.
- Root cause 1: an in-flight workflow canvas GET could replace the newer local workflow with the older server snapshot.
- Root cause 2: React Flow node data held a stale business-node object, so post-upload rerenders could resolve the wrong/old node snapshot.
- Fix: canvas load sequence guards, local-edit revision, local-authoritative merge during an in-flight load, and save-after-merge once loading completes. React node rendering now looks up the current node by ID from `ensureWorkflowState()`.
- Changed files: `platform.config.js`, `platform.ui.parts/part-04.js`, `platform.ui.parts/part-05.js`, `platform.ui.parts/part-06.js`, `platform.workflow-canvases.js`, `platform.workflow-react.js`, `test/workflow-canvases.test.js`.
- Real Chrome/CDP race reproduction: held the older canvas response, added 4 nodes/3 edges, uploaded through the actual React file input, then released the stale response. After the response: 5 business/DOM nodes (4 local + 1 server addition), 3 business/DOM edges, uploaded URL and asset ID intact, active canvas `canvas-race`, and viewport transform unchanged. Runtime errors: none.
- Verification: `test/workflow-canvases.test.js` 18/18 pass; syntax and `git diff --check` pass. `test/advanced-custom-ui.test.js` has 6 documented unrelated failures (`isVegaProviderId` eval context), not caused by this change.
- Integration: `old-site` `04ac8df`. Releases: `platform-release` `26e1eb9`; `live-release` `149a3fc`.
- Deployment: deployed only `123vips.com` with `scripts/deploy_local.sh --site old`; service active and health returned `200 {"ok":true}`.
- Production verification: served `platform.workflow-canvases.js` contains the load-sequence/local-merge/save-after-merge fix; served `platform.workflow-react.js` contains live node lookup, upload canvas guard, and viewport APIs.

## $99 lifetime membership checkout correction (2026-11-06)

- User report: the $99 Creator Membership checkout showed 9,900 credits instead of the no-credits lifetime offer in `/Users/x042/Desktop/会员权益页_优化稿.html`.
- Root cause: `platform.explore.js` used the falsy `||` fallback for `includedCredits`. The backend plan correctly has `includedCredits: 0`, but zero fell through to `$99 x 100 = 9,900` wallet credits.
- Fix: membership billing plans now explicitly calculate zero credits, and product/plan/package credit selection uses nullish fallbacks so zero-credit products cannot fall through in future.
- Membership checkout now shows the dark/gold lifetime benefit design with `$99 终身权益`, `$99 / 终身 / 不包含积分`, Explore unlocked without credits, up to 20% future top-up bonus, case-library access, and 100 credits per paid referral. The ordinary credit expiry note is hidden.
- Changed files: `platform.config.js`, `platform.copy.js`, `platform.css`, `platform.explore.js`, `platform.html`, `test/membership-entitlements.test.js`.
- Browser verification: desktop checkout measured 720 x 694.9 with no vertical overflow; mobile 390 x 844 checkout measured 354 x 808 with no horizontal/content overflow. `9,900` is absent; screenshots are `/tmp/membership-checkout-desktop.png` and `/tmp/membership-checkout-mobile.png`.
- Tests: `node --check` for the three changed scripts, `git diff --check`, and `node --require ./test/source-compat.js --test test/membership-entitlements.test.js test/cases-membership.test.js` (12/12 pass).
- Deployment: not deployed yet; awaiting explicit deployment request.

## Download2 slow-save bubble removal (2026-11-06)

- User asked to remove the “如果下载素材慢请点击我保存” bubble above every Result/history download2 button.
- Removed the hint markup from advanced Result cards, history cards, and history detail; removed the dynamic hint inserted by `setAdvancedDownloadButtonState`; removed the now-unused bubble CSS.
- Regression: `test/generated-assets-on-demand.test.js` now asserts no hint markup remains in Create/Explore/UI or CSS. Targeted suite passes 19/19; changed scripts pass syntax checks.
- Deployment: `old-site` / `d1f8a34` (`9544cca` code commit); `platform-release` / `b8a5f05` (force-with-lease from `3053c86`). Deployed only `123vips.com` via `scripts/deploy_local.sh --site old`; `live-release` remains `bf1e01a` and Live was not deployed.
- Production verification: `/api/health` returned `200 {"ok":true}`; production `platform.ui.js` SHA-256 `ea7cf585...` matches local; deployed source contains device-aware session creation and all five auth call sites. Real production register/login probe passed: same device reused token, second device got a separate token, both remained valid after another login, and a no-device login did not revoke either. Temporary test user and sessions were cleaned up.

## Wan 3.0 upstream 502 investigation (2026-11-06)

- Production `app_generation_records`: 19 `Failed to download file: HTTP 502` failures in the last 24h, all from `advanced-wan30` (`wan3.0-video-prime`: 15 observed plus latest; `wan3.0-video` failures); no Vega 502 in the same window. Pre-deducted credits are refunded.
- MuleRouter reports `4002 Infrastructure operation failed / Failed to download file: HTTP 502`. Failure records send unsigned `https://assets-cdn.123vips.com/assets/user-uploads/...` reference image URLs.
- Direct unsigned CDN requests return `403` (`x-oss-cdn-auth: success`, `x-oss-ec: 0003-00000001`). The same object with a correctly signed OSS CDN URL returns `200` and the exact expected byte size. `media.123vips.com/<key>` returns 404 because these uploaded objects are in Singapore OSS, not the historical R2 mirror.
- Root cause: the Wan 3.0 submission path is still passing stored unsigned `assets-cdn` URLs upstream. The upstream downloader masks the origin 403 as HTTP 502. Production OSS credentials and CDN signing are valid; the bug is the media URL used in the Wan 3.0 payload, not the public site API or OSS service.
- Required fix: make the Wan 3.0 payload sign every `assets-cdn`/OSS object URL immediately before submission (or publish to a truly public URL), and add a regression test asserting the sent reference URL contains a valid signature rather than the bare CDN URL.
- Fix applied in `server.parts/part-17.js`: Wan 3.0 capabilities now sign OSS/CDN media at the final upstream boundary, and both the MuleRouter decision and Alibaba request receive that signed media array. Lite and other capabilities keep their existing media flow.
- Regression: `test/wan30-upstream-signed-media.test.js` verifies private `assets-cdn` media gains `OSSAccessKeyId`/`Signature`/`Expires`, preserves media metadata, leaves external public URLs and the input array unchanged, and confirms both upstream call sites use signed media. `node --test test/oss-storage.test.js test/wan30-upstream-signed-media.test.js` passes 11/11; syntax and targeted `git diff --check` pass.
- Deployment and live verification: production is running release snapshot `e65b337` from old-site `1014a92`, which includes the Wan 3.0 signing fix. A new production Wan 3.0 Prime task `cgt-20261106232641-2bac77` completed successfully; its persisted `upstreamPayload.reference_images[0]` contains `OSSAccessKeyId`, `Signature`, and `Expires`. The prior `cgt-20261106231628-c0dfac` failure remains unchanged and predates the fix. No Live deployment was made.

## Complete $99 membership page redesign (2026-11-06)

- User clarified that the supplied `/Users/x042/Desktop/会员权益页_优化稿.html` must be implemented across the whole membership experience, not only the card header.
- Implemented the full design: `$99` lifetime benefits header, explicit no-credits note, Explore/top-up benefit cards, `$100/$200/$500` top-up examples, referral and case-library rows, interactive payback calculator with dynamic chart marker, payback progress, comparison table, pink purchase action, activation-code redemption, fine print, and desktop/tablet/mobile layouts.
- Membership business values remain `$99`, lifetime, `0` included credits, up to `20%` future top-up bonus, break-even `$495`. Extra credits use `amount * 100 * 0.20`; net value uses `amount * 0.20 - 99`.
- Checkout opens in the correct membership state (`$99 / lifetime / no credits`) and clears any ordinary top-up package selection.
- Changed files: `platform.html`, `platform.copy.js`, `platform.config.js`, `platform.create.parts/part-06.js`, `platform.css`, `test/membership-entitlements.test.js`, `CODEX_TASK_STATE.md`.
- Verification: targeted suite passes 12/12; syntax checks and `git diff --check` pass. Chrome visual checks at 1440/768/390 showed no horizontal overflow; calculator interactions and membership checkout state were exercised. Screenshots: `/tmp/membership-final-en-1440.png`, `/tmp/membership-final-en-390.png`, `/tmp/membership-final-zh-1440.png`, `/tmp/membership-modal-stub-zh-1440.png`, `/tmp/membership-modal-stub-zh-390.png`.
- Deployment: not deployed; awaiting an explicit deployment request.

### Complete membership redesign deployment (2026-11-06)

- Integration: pushed `old-site` at `1014a92` to origin.
- Platform release: `e65b33702a0c9c125fad097ee142a98eff34859b`, built from `1014a92` and pushed with lease protection.
- Deployment: `scripts/deploy_local.sh --site old` exited 0. `https://123vips.com/api/health` returns `200 {"ok":true}`, deployed HTML contains the calculator and membership checkout markers, and served `platform.create.parts/part-06.js` contains the calculator implementation. Live was not deployed.

### Referral bottom card width alignment (2026-11-06)

- User clarified the existing referral/commission/reward content below the membership benefits card must remain, but its card width should match the redesigned membership card.
- Changed `platform.css` `.referral-card` width from `min(760px, 100%)` to `min(920px, 100%)`; bumped the page cache suffix to `membership-redesign-20261106-3`.
- Verification: targeted membership/cases suite passes 12/12; layout assertions and `git diff --check` pass.
- Deployment: pushed `old-site` `1760f68`; platform release `9c76c869e6b2cfedd258297940396c151c5e98d7`; `scripts/deploy_local.sh --site old` exited 0. Production health returns 200; served CSS resolves `.referral-card` to `width: min(920px, 100%)`. Live was not deployed.

## Image result tab play-icon fix (2026-11-06)

- User reported image cards in the Generate Result image tab still showed a video play button.
- Cause: `posterUrl` falls back to the image URL, and the renderer checked `videoUrl || posterUrl` before `imageUrl`, so completed images entered the video button branch.
- Fix: render `imageUrl` before `posterUrl`; image cards remain interactive preview buttons but contain no play icon. Video cards retain their play overlay. Cache suffix is `image-result-no-play-20261106-1`.
- Changed files: `platform.create.parts/part-01.js`, `platform.html`, `test/advanced-result-kind.test.js`, `CODEX_TASK_STATE.md`.
- Verification: advanced result suites pass 22/22; syntax and `git diff --check` pass.
- Integration and release: pushed `old-site` at `365c1fe`; built and pushed platform release `cdda822` with lease protection.
- Deployment: `scripts/deploy_local.sh --site old` exited 0. Production `/api/health` returns `200 {"ok":true}`; served `platform.create.parts/part-01.js` renders the image branch before the video/poster branch, and the image branch has no play icon. Live was not deployed.

## Production failed-task inspection (2026-11-07 09:14 +08)

- Queried production PostgreSQL `app_generation_records` directly through the old-site host; no source-text search was used.
- Last 24h: 67 failed records. Latest failure was `2026-11-07 04:50:55 +08`, before the current release restart at `2026-11-07 08:59:42 +08`.
- Strictly after that release time: 0 failed/error records created or updated.
- Last 24h error groups: 37 content-moderation/copyright/sensitive-content; 19 Wan 3.0 `Failed to download file: HTTP 502` (latest `2026-11-06 23:16:28`, all predating the signed-media deployment); 6 timeout; 3 invalid duration; remaining isolated upstream errors.
- Last 24h: 0 HTTP 403 failures, 0 post-release literal `"undefined"` prompts. No new fix made from this inspection.

## Generate composer interaction polish mock (2026-11-07)

- User rejected a large layout redesign and requested keeping the existing generation presentation while improving parameter-selection and input interaction styling.
- Added separate mock `/Users/x042/.codex/visualizations/2026/11/05/01a1ab8c-4aa5-7a33-82cd-78be1dd6cb1f/generate-composer-polish.html`; the previous `generate-redesign.html` was not changed.
- Direction: retain bottom conversation composer; expose only key parameters as compact chips (model, ratio, resolution, duration, mode); clicking ratio opens a polished popover above the composer with visual aspect-ratio cards. Attachments, prompt typography, secondary tools, and Generate button were refined without changing the page structure.
- Opened in the app browser for review. No production code or deployment changes.

## Generate composer polish design corrected to production UI (2026-11-07 09:02 +08)

- User rejected the earlier conversational composer mock because it did not match the deployed Generate page and omitted the parameter controls.
- Inspected the logged-in production page at `https://123vips.com/#advanced`; captured the actual Prompt -> reference assets -> model/mode/ratio/resolution/duration chips -> Generate area.
- Source anchors: `platform.html` prompt/toolbar at ~570-746; `platform.create.parts/part-02.js` parameter chips/popovers at ~989-1250; `platform.css` composer styles at ~5697-5775 and ~10954-11255.
- Created the corrected local interactive design mock `/Users/x042/.codex/visualizations/2026/11/05/01a1ab8c-4aa5-7a33-82cd-78be1dd6cb1f/generate-panel-polish.html`.
- Scope remains deliberately local to composer styling/interaction: keep the existing two-column Generate page and current parameter model, improve prompt/reference/chip grouping, use anchored popovers, and retain only key parameters. No production code changed or deployed.

## Seedance 2.0 Fast independent option and 1.5x pricing (2026-11-07)

- Generate now exposes an independent `Seedance 2.0 Fast` option while keeping the existing `seedance` provider and `seedanceTier: fast` request contract. It routes to `ep-20260429142538-fkm9d`; Standard routing is unchanged.
- Fast supports only `480p` and `720p`. The old nested Seedance tier selector stays hidden; history restore maps fast records back to the independent option.
- Upstream basis: BytePlus Seedance 2.0 Fast output `$5.6/M tokens`, input video `$3.3/M tokens`, `24fps`. Purchase estimates are `5.4432`/`11.53152` output credits/s and `3.2076`/`6.79536` input-video credits/s at 480p/720p.
- Sale prices are exactly 1.5x purchase cost: `8.1648`/`17.29728` output credits/s and `4.8114`/`10.19304` input-video credits/s. Legacy Fast defaults migrate automatically without overwriting custom admin prices.
- Admin/public labels use `Seedance 2.0 Fast`; Fast price fields retain six decimals. The new test is `test/seedance-fast-pricing.test.js`.
- Verification: targeted pricing/Vega/Seedance tests pass 50/50; all changed JS files pass `node --check`; `git diff --check` passes. Full `npm test` remains 750/775 with 25 pre-existing source-shape failures, so it is not claimed green.
- Unrelated existing worktree changes in workflow tests and `workflow-react/node_modules` are excluded from this commit.
- Deployment: old-site `a1a0bd8`; platform-release `162a302`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`.
- Production verification: `/api/config/public` returns Fast output `8.1648`/`17.29728` and input-video `4.8114`/`10.19304` credits/s at 480p/720p; production `platform.html` contains `Seedance 2.0 Fast` and `seedance-fast`. Live was not deployed.

## Parameter popover design detail (2026-11-07 11:51 +08)

- User asked specifically how the parameter picker popovers will look and behave.
- Exported five-state evidence sheet `/Users/x042/.codex/visualizations/2026/11/05/01a1ab8c-4aa5-7a33-82cd-78be1dd6cb1f/generate-parameter-popovers.png`.
- Design: each parameter chip is its own anchor; popover opens immediately below/above depending on viewport space; only one open at a time; clicking an option updates the chip and closes; click outside closes; keyboard focus remains native.
- Model/mode/resolution use compact option pills. Ratio uses visual frame previews. Duration uses readout + range + quick values. Panels stay narrow and anchored, not full-screen modals.
# Canvas login token fix (2026-11-07)

- User reported `Please sign in to continue` after a successful site login. Root cause was not browser cache: the React canvas requested same-origin `/api/workflow/canvases` with cookies only, while the site authentication layer uses `Authorization: Bearer <raisingGameToken>`.
- Confirmed the canvas never targets an external/source-project origin. All workflow requests are relative same-origin paths. Added `workflow-react/src/components/workflow/canvasApi.js` and routed the library, editor, and workspace requests through it; it reads `raisingGameToken`, sends Bearer auth when present, keeps `credentials: include`, preserves headers/content type, and surfaces server errors.
- Regression coverage: targeted workflow tests pass 25/25. The Chrome acceptance mock now rejects `/api/workflow/*` requests without `Authorization: Bearer canvas-full-token`; the full browser flow still passes (project list, create/save/delete, two nodes, real handle connection, proportional zoom, upload preserving graph, and reopen preserving graph).
- Source commit: `97bbe6c`. Platform release: `0ce9df4c008ec062e615c43f58a445013d62385f`. Production page cache key is `mw5y4fd1`; production `canvas.js` hash matches local exactly (`e4af47e68ee7f41bcd944a7aa3433f22c7fe675bf8fb6788cff6381d77a4ed69`, 537550 bytes) and contains the token/Bearer logic.
- Deployed only `123vips.com` through `scripts/deploy_local.sh --site old`. Health is `200 {"ok":true}`. Anonymous workflow canvas access remains `401` as required. Live was not deployed.


## Generate UI style-only restoration (2026-11-07)

- User required the established Generate/Advanced DOM, routes, state, and generation flows to stay unchanged; styling only.
- Restored JavaScript/config changes accidentally introduced during the redesign: `platform.create.parts/part-02.js`, `platform.ui.parts/part-04.js`, and `platform.config.js` now have no diff.
- Preserved the existing DOM nodes in `platform.html`; only the `platform.css` cache-busting query changed.
- Current Generate styling is scoped under `.advanced-workspace.is-create-custom` in `platform.css` and does not generate or replace UI structure.
- Existing native rendering still exposes three top-level Generate tabs (`VideoGen`, `ImageGen`, `Conversation`) and keeps the secondary mode row hidden for Generate.
- Verification: `git diff --check`; no changes in the three restored JS/config files.
- Deployment: not deployed.

## Generate preview 404 fix (2026-11-07)

- User reported `Request failed: 404` on `http://127.0.0.1:8767/platform.html#custom`.
- Root cause: port 8767 was a bare `python -m http.server`, so static HTML/JS loaded but all same-origin `/api/*` requests returned 404. A direct local `node server.js` is unavailable without `DATABASE_URL`; no JSON fallback was added.
- Replaced the static-only preview server with a temporary `/tmp/codex-preview-proxy.js` process that serves workspace files from the repository and reverse-proxies `/api/*`, `/docs/api.json`, and `/favicon.ico` to `https://123vips.com` while preserving methods, headers, bodies, cookies, and responses. This is preview-only and does not alter production deployment.
- Verified through HTTP and real Chrome/CDP: `/api/config/public`, `/api/promo/1111`, `/api/ourdream/presets`, `/api/platform/estimates`, `/api/chat-live/characters`, `/docs/api.json`, and `/favicon.ico` all return 200; the visible `Request failed: 404` toast is gone and the Generate page renders.
- Re-verified parameter pickers: opening Mode/Ratio/Duration shows the designed panels, switching chips closes the previous panel, and clicking the same chip again closes it.
- Evidence: `/tmp/preview-after-proxy.png`, `/tmp/picker-final-proxy.png`, `/tmp/debug-preview-cdp.js`, and `/tmp/check-picker-cdp.js`.
- Deployment: `123vips.com` only. `old-site` `a6af8d0`; `platform-release` `f829a69`; deployed via `scripts/deploy_local.sh --site old`; `/api/health` returned `200 {"ok":true}`. Production Chrome/CDP acceptance at `https://123vips.com/platform.html#custom` confirms the Generate chips render, Mode opens with all four reference modes, Mode closes on repeat click, and Ratio opens with ratio/resolution options. Production `/platform.css`, `/platform.js`, and `/platform.create.parts/part-02.js` hashes match the release. Live was not deployed.

## Generate parameter consolidation (2026-11-07)

- Removed the standalone Resolution chip whenever the Ratio chip is visible, because the ratio popup already includes resolution selection. The native `advancedResolution` select remains the submission source and still updates pricing/estimates when 480p/720p is chosen inside the Ratio popup.
- Changed the desktop parameter chip bar from horizontal scroll to wrapping, so additional parameters flow onto multiple rows instead of requiring side-scrolling. Cache key bumped to `generate-composer-design-20261107-6`.
- Verification: real Chrome/CDP at 1280px confirms only Model, Mode, Ratio, and Duration chips render for Seedance 2.5; adding extra chips increases the container height without horizontal overflow; selecting `720p` inside Ratio updates `advancedResolution=720p` and the estimate to 150 credits. Syntax, targeted picker test, and `git diff --check` pass.
- Deployment: not deployed.

## Canvas delete/back behavior deployment (2026-11-07 19:12 +08)

- Fixed two controlled-view bugs: node trash and Delete/Backspace now mutate the persisted business graph before resyncing React Flow; browser/system back is delegated from `platform.main.js` to the open canvas before the site shell can hide `#workflow`.
- Local checks: webpack build succeeded; syntax checks and `git diff --check` passed; `node --require ./test/source-compat.js --test test/workflow-canvases.test.js` passed 29/29.
- Release: `old-site` `3b48d06`; `platform-release` `386ba23`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`.
- Production verification: `/api/health` returned `200 {"ok":true}`; served `platform.main.js` contains `handleWorkflowCanvasHistoryBack`; served `canvas.js` contains the new back bridge and business-first deletion path. Local/production SHA-256 match: `canvas.js` `f697ac086cdd3a2e4c09f3d53fd5749a839de2fb5c944f191d62e2375cc737fc`, `platform.main.js` `0c5dbdf0059fae95d8294fabb84bda73269671735af8f5a95769831d56f9e447`.
- Live site was not deployed.
- Deployment: `old-site` `ec87f5d`; `platform-release` `7856246`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`. Production `workflow-react/dist/canvas.js` SHA-256 matches local: `cf7d65007a689e2463839c8cddea1c2fd79f3d13888d4c03207b5b5742c81c1a`. Live was not deployed.
- Deployment: `old-site` `cf89d89`; `platform-release` `6bb6e86`; deployed only `123vips.com` via `scripts/deploy_local.sh --site old`. `/api/health` returned `200 {"ok":true}`. Production `workflow-react/dist/canvas.js` SHA-256 matches local: `4dd84a3630eb5cb664511ad0717f75817ff5110f42dcc2ba06230a9f71aa2d97`. Live was not deployed.

## Wan 3.0 Prime result thumbnail fix (2026-11-07 22:55 +08)

- User reported completed task `cgt-20261107212551-c42b11` did not show a Result thumbnail.
- Root cause: the task is a normal completed `advanced-wan30` / `aliyun-wan30` video. Its JPG poster is valid, but the upstream MP4 output was also populated into `imageResultUrls` and `providerImageUrl`; the Result renderer selected image fields before the video poster and produced `<img src="...output_00.mp4">` (`naturalWidth=0`).
- Fix commit `05e397c`: server-side image-field collection and frontend image URL helpers now reject `.mp4/.webm/.mov/.m4v`, so cached records with contaminated image fields fall back to the valid JPG poster and render through the video-result branch.
- Regression coverage: `test/media-url-priority.test.js` and `test/advanced-result-kind.test.js`. Targeted suite passed 71/71; syntax and `git diff --check` passed.
- Release: `old-site` `05e397c`; `platform-release` `0e7f572`; deployed only `123vips.com` with `scripts/deploy_local.sh --site old`. Health returned `200 {"ok":true}`.
- Production verification on logged-in Chrome/CDP: task record has no video URL in image fields; Result card uses `advanced-result-media`, poster URL is `.../posters/cgt-20261107212551-c42b11.jpg?...Signature=...`, image loaded at 480x854, and no `.mp4` image source remains. Live was not deployed.

## Canvas node download deployed (2026-11-08)

- Added the node result download button immediately before the delete button in `NodeLayout.js`; the action is disabled until the node has its own image/video result.
- `downloadWorkflowNodeResult(nodeId)` downloads only the selected node's generated result through the existing signed generation-record download flow.
- Integration commit: `995a32c` (`Add canvas node result downloads`). Release snapshot: `platform-release` / `5499b53`.
- Verification: targeted workflow canvas tests `31/31`; JS syntax and `git diff --check` pass; production bundle rebuilt successfully.
- Production bundle SHA-256: `70420f28461bbefc44bd7f8904173278b96e7c3f1204b15908e07f6822976f09`.
- Deployed to `123vips.com` only via `scripts/deploy_local.sh --site old`. Health endpoint returned HTTP 200 `{"ok":true}`; served bundle hash matches local and contains `downloadWorkflowNodeResult`; download marker precedes delete markers in the built component.

## Credential timeline correction (2026-11-09)

- User clarified that the exact test01/test02 password-change time is unknown. Do not infer it from the 2026-11-08 attack/login timestamps.
- Evidence boundary: `app_users` and `app_sessions` have no `passwordChangedAt`; `updatedAt` is overwritten by unrelated account changes, email binding, reset, and admin remediation. Successful login proves a password was usable at that time, not when it was last changed.
- Quarantined backup `/var/backups/raising-game-demo/quarantine-20261108/app-db.json`: file mtime `2026-06-30 20:11:54 +08`; embedded test01/test02 `updatedAt` values are `2026-05-06`. test02 main-tenant current password hash equals this old backup hash, so it is unchanged from at least that snapshot through the observed attack. test01 main-tenant current hash differs, so it changed sometime after the snapshot; the exact date is unknowable from current DB/audit data.
- test01 main tenant: attacker at `50.7.21.105` successfully used the existing password before takeover (`/api/auth/login-or-register` at 18:49:23/18:50:07, `/api/auth/login` at 20:01:15/20:01:20), then bound email `kentkouh+spdix@gmail.com` at 20:16:37, reset password at 20:17:13, and logged in at 20:17:16. The reset time is proven; the prior password-change time is not.
- test02 main tenant: `94.177.131.198` successfully logged in at `2026-11-08 18:26:49 +08`; that login created the current session. No successful reset/change request for test02 exists in retained nginx logs.
- Old JSON exposure remains plausible for test02 because its current password hash equals the quarantined snapshot, but no successful nginx download of `/data/app-db.json` or its backups was found. Keep this as a plausible source, not a proven leak.
- Charged-token evidence (CST): midnight API burst `00:11-00:36` = 17 tasks / `4041.6205` credits (xiong 8 / `1663.2429`; test01 4 / `734.4592`; test02 5 / `1643.9184`). Earlier xiong subtoken tasks `18:18:06`, `18:25:10` = `136.4864`; earlier xiong main-token successful tasks add `220`. test03 later API task = `50`. `fhlllll` used the main API token for 10 image tasks / `100`, probable but not yet IP-attributed to the same actor.
- Control weakness to correct separately with approval: password reset deletes sessions but does not rotate the main API token; the main token has no expiry/IP binding; `/api/auth/me` exposes the full main token to browser/session callers.

## Quarantined legacy DB sensitive-content audit (2026-11-09)

- User asked what other sensitive information the old DB contains. Investigation only; no production data mutation, revocation, rotation, or deployment.
- Quarantined `/var/backups/raising-game-demo/quarantine-20261108/app-db.json` is a small 15 KB legacy snapshot, not the current PostgreSQL database. It contains 4 users with `passwordHash` (PBKDF2 format), 16 raw session `token` values, 9 wallet orders (4 with non-empty address; 1 crypto address pattern), 1 user character with prompts and local/TOS media keys, and 1 credit-ledger entry. All 16 legacy session tokens have 0 matches in current `app_sessions`; 3 of 4 user IDs still exist, one password hash is unchanged and two differ.
- `generation-records.json` in the same quarantine directory contains 19 records with user IDs, prompts/final prompts, model/scene/companion IDs, local/remote video paths and URLs. `character-assets.json` contains one character asset with a local image path and asset URI.
- The adjacent `app-config.json` backups contain wallet receiving address/QR options, home-video media paths and TOS keys, character model settings, and `platform.analytics.googleMeasurementId`; they do not contain obvious cloud access keys, private keys, bearer/JWT tokens, or credential-bearing URLs based on pattern scan.
- No values, hashes, tokens, addresses, or other secrets were printed.
- Current PostgreSQL is materially broader and contains 881 users, 26 user emails in payload, 36,898 credit-ledger rows, 29,577 generation records, 66 user-character rows, and 210 wallet orders with addresses. Do not conflate the small legacy snapshot with a full current-database export.

## Legacy sensitive backup cleanup and TOS identification (2026-11-09)

- User asked to handle the sensitive legacy data and identify TOS.
- Production cleanup completed: created `/var/backups/raising-game-demo/legacy-sensitive-backup-manifest-20261109.json` (0600 root:root) containing only filenames, sizes, and SHA-256 digests; permanently shredded the six plaintext files in `/var/backups/raising-game-demo/quarantine-20261108/` with `shred -u -z -n 3`; removed the quarantine directory.
- Post-cleanup whole-filesystem search found no remaining `app-db*.json`, `generation-records*.json`, `app-config*.json`, or `character-assets*.json` copies (excluding no paths found). Manifest SHA-256: `d459ceddac44604e24ee8db7def63ceca5151ec57a512cc0e8c2b07df45f92f8`.
- TOS identification: historical code used `TOS4-HMAC-SHA256`, `x-tos-content-sha256`, `x-tos-date`, and scope `<date>/<region>/tos/request`, which is Volcengine TOS (Volcano Engine Torch Object Storage). The old deploy guard named bucket `fal-task` and custom public domain `https://cdn-video.51sux.com`; the custom CDN domain does not change the storage platform identification.
- Current `/etc/raising-game-demo.env` has no `TOS_*` entries; active object storage is Alibaba OSS Singapore (`OSS_REGION=oss-ap-southeast-1`, bucket redacted from notes).

## 2026-11-09 session/media hardening pre-deploy

- Goal: keep `123vips.com` production healthy while hardening authentication and private media; Old site only, never deploy or modify Live.
- Existing logged-in users must not be displaced. `app_sessions.expires_at` is nullable and only newly created sessions receive a 90-day TTL (`SESSION_TTL_DAYS`, clamped 1-365). Historical rows with `expires_at IS NULL` remain valid indefinitely; no backfill, bulk expiry, or forced logout. Same-device login does not backfill an expiry onto an existing legacy row.
- Session lookup rejects only explicitly expired rows. The `createSessionInDb()` conflict path preserves an existing row's `expires_at`.
- Admin list/edit views now expose only `apiTokenPreview`; reusable primary API tokens are no longer embedded in `userView()`. The explicit `/api/access/token` flow remains unchanged.
- Private voice-preview/admin 403 responses now use `private, no-store`, with CDN no-store headers, preventing error responses from being cached at the edge.
- Focused regression suite passed 70/70: admin password reset, session semantics, auth risk, admin voice preview, media authorization, deploy targets, Nginx private media, and stalled-generation repair. JavaScript syntax, Python compilation, and `git diff --check` also passed.
- Known unrelated working-tree changes remain excluded from the release. Full `npm test` still has pre-existing frontend/payment/Wan failures outside this security slice.
- Deployment status: pending commit, snapshot, push to `platform-release`, and Old-only deployment at the time of this record.

## 2026-11-09 production security close-out (Old only)

- Scope: `123vips.com` only; `live.123vipeak.com` was not modified, pushed, or deployed. Existing logged-in users must remain valid: no session purge, no expiry backfill, no forced re-login.
- Production baseline: source `old-site` `e40e0f0`; deployed release previously recorded as `fe64951`; service `raising-game-demo` active with zero restarts; `/api/health` `200 {"ok":true}`; 879 production sessions, all 879 historical rows with `expires_at=NULL`. Only new sessions receive the 90-day TTL.
- Abuse analysis: ~880 users total; ~172 created in the prior 24h, ~154 quarantined. Strong batch pattern on 2026-11-08 18:25-19:35 +08 with same-minute groups of 8-19 accounts, generic usernames, mostly quarantined, PowerShell UAs, and empty attribution rows. This is consistent with automated registration/import abuse; no public admin mass-import endpoint was found. Direct SQL import cannot be excluded from application code alone.
- Current risk controls: registration 3/min, 8/hour, 20/day; automation 2/hour; device 5/day; password failures 5 then 15-minute account lockout. Existing users with legacy short passwords can still log in; only new passwords require 10 characters.
- Private media verified with a production object: valid unexpired signed URL `200 image/png`; missing/tampered/expired signatures all `403`; all responses carried `private, no-store`, CDN no-store, and `cf-cache-status: BYPASS`. Five private media prefixes must still be manually purged from Cloudflare because older edge objects may have been public. No purge credential is present in the repo, so purge is not claimed complete.
- Admin/private hardening: admin user list no longer returns full reusable `apiToken` (preview only); private character/panorama/upload/voice aliases are blocked anonymously. Real old-session Bearer checks passed 5/5; admin user/generation endpoints returned 200; normal user/admin focused regression passed 20/20.
- Generation incident: the upstream 403/pre-deduction path now creates a failed generation record with zero charge, `billingStatus=free`, `awaitingUpstreamTask=false`, and a returned `taskId`. Production audit found no charged record lacking an upstream task id. Last 24h: succeeded 442, completed 47, failed 28, running 2. The two running rows are recent valid work; historical stalled rows must be repaired only with dry-run then `--task-id ... --apply`.
- Telegram support persistence risk fixed: binding a support message to a Telegram user previously called `replaceAppDbTables(db)`, which could rewrite all users/sessions for one message. It now performs a targeted `app_support_messages` row update; support creation permits an initially unbound message and binds `user_id` atomically on update. No session rows are touched.
- Verification after this fix: safe regression suite 69/69; JavaScript syntax and `git diff --check` pass. Earlier broader security-focused suite 70/70 and production user/admin regression 20/20 remain valid for unchanged areas.
- Server controls verified: `/etc/raising-game-demo.env` `600 root:root`; SSH password login disabled, root login key-only, `MaxAuthTries=3`, empty passwords and forwarding disabled; authorized_keys `600 root:root`; UFW active only 22/80/443; fail2ban active toward ~154k failed SSH attempts in 14 days; PostgreSQL app role is non-superuser; backups are `700/600`. The app database is PostgreSQL-backed and fails closed without `DATABASE_URL`.
- Remaining infrastructure risks: Node still runs as root (`systemd-analyze security` 8.1 EXPOSED); four root SSH keys need owner/business confirmation before any removal; auditd is inactive; Cloudflare private-media purge is still outstanding; a dedicated service user requires upload/ffmpeg/release ownership migration and rollback testing. Do not disable root SSH/password fallback or restart under a new user until the verified deployment path is preserved.

## Final production verification and audit close-out (2026-11-09 07:03 +08)

- Old only: production release verified at `60854e1`; source `old-site` `74f48b0`; `raising-game-demo` active with `NRestarts=0`; internal `4174/api/health` `200`; public `https://123vips.com/api/health` `200`; `/`, `/platform.js`, `/admin.html` all `200`.
- Session continuity preserved: `879` sessions, all `879` historical rows still `expires_at IS NULL`; no session purge, backfill, or forced logout. User total `882`; last 24h new users `173`; quarantined `154` (18 without risk status, 1 clear).
- systemd hardening remains effective after deploy: `systemd-analyze security` exposure improved from `8.1 EXPOSED` to `5.8 MEDIUM`; UMask/private devices/home/system/kernel restrictions active. Remaining root-service migration is deferred until upload, ffmpeg, release-tree ownership, rollback, and real generation smoke can all be verified.
- Host checks: UFW active only 22/80/443; fail2ban active; env file `600 root:root`; app DB role `raising_game_app` is non-superuser/non-createrole/non-createdb. auditd remains inactive and is a monitoring gap, not an application availability blocker.
- 5xx investigation: 78 total 5xx in retained access log, all clustered in the two restart windows `06:55:18` and `06:56:23-27`; Nginx error records are `connect() failed (111: Connection refused)` during credential rotation/service restart. No 5xx after `06:56:30`; health and business traffic are normal.
- Generation state: 24h terminal flow is healthy (`succeeded 440`, `completed 47`, `failed 28`, `running 2`). Task `cgt-20261109065328-3e9214` remains legitimately running upstream (`upstreamTaskId=cgt-20261109065331-4jq2l`), billing settled, and its `updated_at` advanced through `23:02:29Z`; do not force-terminalize it. The other recent running task is `cgt-20261109065724-910abb`, also newly submitted. Historical stale rows are `cgt-20260619181025-801a09`, `cgt-20260619181126-95cc3c`, and `mychar-img-20261106152856-a086bc`; they are unchanged and require explicit targeted approval before repair.
- Clarified generation-record metric: 3,574 settled/pre-deducted records lack a separate `upstreamTaskId`, but 3,557 are Seedream5 synchronous image jobs that intentionally have no async upstream task id; recent image successes are therefore not lost/charged-without-submit. No recent charged pre-submit orphan was found.
- Verification: focused security/media/deploy/generation regression passed `49/49`; `git diff --check` and JavaScript syntax checks passed. Earlier live old-session checks (4 normal-user APIs and 3 admin APIs all `200`) and production signed-media upload/read/delete smoke remain valid.
- Credential handling lesson: never pass `DATABASE_URL` as a shell/Python argument; load environment and use disconnected stdout/stderr handling. Two prior diagnostic exposures were already rotated, old credentials rejected, new credentials verified, service healthy, and sessions preserved.
- Still open, explicitly not claimed complete: (1) Cloudflare purge for `/assets/user-uploads/`, `/assets/user-characters/`, `/assets/generated/characters/apiz/`, `/assets/generated/panoramas/`, `/assets/admin/voice-preview/` requires an external purge credential; (2) Cloudflare 1010 browser-signature policy may reject real non-browser API clients and needs an allow-rule decision; (3) Node remains root; (4) four root SSH key owners require business confirmation; (5) auditd/AppArmor/SELinux remain disabled.

## 2026-11-09 Google login `tenantid is not defined` production fix

- User-reported failure: Google login returned `Google login failed: tenantid is not defined`.
- Root cause: `handleGoogleLogin()` called `getUserByGoogleIdInDb(..., tenantId)` although the request descriptor is stored in `tenant`. The risk-control rules were not the cause.
- Fix: use `tenant.tenantId` in the existing Google-account lookup. Added a static regression test to prevent the undefined-variable form from returning.
- Verification: focused auth/session/media/deployment/generation suite passed 50/50; `node --check` for the source and regression test passed; scoped `git diff --check` passed.
- Safety constraints: no session deletion or invalidation; no JSON business-data fallback; Old only; do not touch or deploy Live.
- Deployment: source `old-site` `816aa83`; `platform-release` `e00b7d4`; deployed only to `123vips.com`. Production serves the countdown code; `/api/health` returned 200 and the email request endpoint correctly returned 400 for an invalid address. Service active with 0 restarts; no recent `tenantid is not defined`, uncaught, fatal, or email-challenge errors. Sessions were preserved.

## 2026-11-09 email login resend countdown

- User confirmed the email-code login flow must show a click/resend countdown.
- Backend already enforced a PostgreSQL-backed 60-second minimum resend interval, but the frontend only disabled the button during the HTTP request and re-enabled it immediately after success.
- Added a visible 60-second `Resend in Ns` countdown for `requestEmailLoginCodeBtn`; it survives reopening the login dialog and restores `Send code` at zero. Failed requests release the button immediately.
- Added a regression test in `test/email-auth.test.js` covering the cooldown constant, countdown rendering, start call, and failed-request release path.
- Verification: focused auth/risk tests 22/22; full security/auth/session/media/deployment/generation suite 77/77; syntax and scoped diff checks passed.
- Safety: UI-only change, no session invalidation and no business-data fallback. Old only; Live untouched.
- Deployment: pending at the time this entry was written.

## 2026-11-09 result thumbnail durability closeout

- User reported Result thumbnails disappearing/reloading, playback failing, and asked to finish production safety without logging out existing users.
- Generation media now requires verified object storage persistence instead of temporary upstream URLs; video/image metadata propagation includes `storageProvider`, `storageKey`, poster storage metadata, and per-image storage keys across refresh/admin/completion paths.
- Qwen Image 3.0 now persists every output image and retries instead of returning temporary remote URLs when upload fails.
- Undress unlock is serialized under the wallet settlement lock, re-reads the user and generation record inside the lock, uploads/verifies the protected result before charging, uses a stable ledger ID, and writes the durable storage metadata before returning success.
- Local retention cleanup now only removes stale disposable OS-temp workspaces under `raising-game-media/` and `raising-game-poster-*`; it never deletes `assets/generated`, user uploads, locked previews, or PostgreSQL-owned business media.
- Verification: focused generated-assets/result-refresh/media/OSS/video-tool/authorization/undress suite passed 131/131; syntax checks and `git diff --check` passed.
- Not yet committed, built, or deployed. Existing sessions/tokens must remain untouched. Old only; Live untouched.

## 2026-11-09 poster maintenance media race closeout (current deployment)

- Scope: Old production `123vips.com` only. Live remains untouched at `origin/live-release=bf1e01a`; no session purge, token rotation, password reset, or forced re-login.
- Source `old-site=3d56609`; release `platform-release=920cdd3`; installed server HEAD `920cdd3daf72f1348c67ab31d99bec2f1c9666b4`; `raising-game-demo` active with `NRestarts=0`.
- Root cause: concurrent completion media work ran poster-only maintenance while another path uploaded the video. Poster maintenance was incorrectly required to return video URL + storage key and could overwrite freshly written video metadata with empty values.
- Fix: poster-only maintenance validates only `cdnPosterUrl + posterStorageKey`; full-video maintenance still strictly validates `cdnVideoUrl + storageKey`; write-back preserves current video metadata when a poster-only task has none. Poster failures write only `posterMaintenance*`, not generic `cdnRetryCount/cdnError`.
- Verification: `test/generated-assets-on-demand.test.js` 26/26 passed; `node --check server.parts/part-21.js`, `part-22.js`, and scoped `git diff --check` passed.
- Production: 913 sessions preserved; `app_users=893`, `app_generation_records=30006` at last count. `/api/health` returned 200.
- Post-deploy completion `cgt-20261109180626-995900` has video/poster URLs and both storage keys, `cdnRetryCount=0`, no poster maintenance error; signed CDN HEAD checks returned 200 `video/mp4` and 200 `image/jpeg`. A broader recent sample of 8 completed video tasks also returned signed video/poster 200 with non-zero sizes.
- Auth smoke: anonymous `/api/generation-records`, `/api/user-assets`, `/api/admin/users`, `/api/admin/generation-records` all returned 401; email-code request with empty body returned 400; Google login with empty body returned 401 `GOOGLE_LOGIN_INVALID`; no `tenantid is not defined` or post-deploy auth exception observed.
- Media queue: new `advanced_download` jobs observed processing/ready; the 403/404 failures in the 17:55–18:07 window are historical 2026-11-04/06 records retried by the recovery scan, not post-deploy user tasks. No new generation had `posterMaintenanceError` after deployment at verification time.
- Concurrent publishing guard: remote refs checked before and after; `platform-release` remained `920cdd3`, `old-site=3d56609`, and `live-release=bf1e01a`. No release push was made in this closeout.

## 2026-11-09 Result thumbnail recovery for cgt-20261109003116-70f09f

- User narrowed scope to one production task. Upstream generation had succeeded, but the provider URL expired and R2 ingest failed after retries, leaving no poster/video metadata.
- Recovered `cgt-20261109003116-70f09f` in production from the correct ARK result and persisted durable media: poster `image/jpeg` 53,653 bytes; video `video/mp4` 5,525,878 bytes. Both signed URLs returned HTTP 200. Record now has `cdnVideoUrl`, `storageKey`, `cdnPosterUrl`, `posterStorageKey`, `r2DownloadReady=true`, `posterPending=false`, `advancedDownloadStatus=ready`.
- Root cause: completed records treated any provider URL as durable; once the provider URL expired, refresh stopped and no R2 copy was recovered.
- Code fix: completed records require both `cdnVideoUrl` and `storageKey`; media scanner refreshes missing/expired provider media before advanced-download persistence; cooldown/terminal markers prevent loops.
- Changed files: `server.parts/part-21.js`, `server.parts/part-23.js`, `test/generation-record-list-refresh.test.js`; integration commit `0a1d435`.
- Verification: targeted regression suite 46/46 passed; syntax and diff checks passed.
- Deployment: release `5586d19` deployed to Old only; production HEAD `5586d197368fc6b3e6c6878753d0ff5d2ce7c653`; service active, health 200, `NRestarts=0`; existing session count remained 915. Live was not pushed or deployed.
- Authenticated API verification: owner session returned the task with `ok=true`, `status=succeeded`; signed `posterUrl`/`cdnPosterUrl` returned 200 `image/jpeg`, signed `videoUrl`/`cdnVideoUrl` returned 200 `video/mp4`.
- Real browser verification: headless Chrome using the owner session opened Result, mounted the target card, loaded the poster (`naturalWidth=1280`, `naturalHeight=720`) from signed `assets-cdn.123vips.com`, and playback created a 1280x720 video at `readyState=4` with signed CDN bytes (`206`, `video/mp4`).
- Final status: completed and verified; no sessions were cleared, revoked, or logged out.

## 2026-11-09 attack-bound emails and registration cleanup (Old only)

- User reported the test01-bound email was not theirs and asked to clean the attacker-bound emails and registration accounts.
- Read-only evidence confirmed attacker email binding on `test01` (`kentkouh+spdix@gmail.com`, verified 2026-11-08 20:16 +08) and `test03` (`jhnbsomers+pvjd9@gmail.com`, verified 2026-11-09 01:06 +08), plus attacker-created account `e_kentkouh_cw9b9` (`kentkouh+cw9b9@gmail.com`).
- Cleanup scope: 154 previously quarantined registrations + the 1 attacker-created email account. All 155 were soft-deleted with passwords/API tokens cleared and email identities removed; associated sessions/subtokens were deleted/revoked, email challenges removed, and empty assets/characters soft-deleted. No credit ledger, generation record, or wallet order existed for these 155 accounts.
- Preserved normal accounts and balances. `test01` credits `3.8442`, `test02` credits `16.3834`, `test03` credits `0.2`, and `xiong` credits `6.5612` remain. Removed attacker-bound emails from test01/test03; removed the attack-created test02 legacy session and their attack sessions. Their refreshed legitimate sessions/API tokens remain untouched.
- Audit event `admin_security_cleanup` with `scope_key=attack-accounts-20261109` records target count and cleanup reason. Recoverable pre-cleanup snapshot: `/var/backups/raising-game-demo/security-cleanup-20261109-20261109-193734.sql.gz` (0600, SHA-256 `0868670a327867939d94dc1b03f43d822176ccbe6e7c9cabca09c8025127d7ea`).
- Post-cleanup verification: active users `737`; active quarantined `0`; deleted attack accounts `155`; attack-account sessions `0`; active subtokens `0`; stale attack email challenges `0`; active duplicate attack bindings `0`; `/api/health` returned `200 {"ok":true}`. No deployment was needed.

## 2026-11-09 server patrol and historical media retry loop fix

- User asked for a production patrol. Scope stayed Old only: `123vips.com` / `47.84.76.131`; Live was neither inspected for mutation nor deployed.
- Health snapshot: service active with `NRestarts=0`; `/api/health` 200; memory roughly 1GB process / 7.1GB host; disk 26GB used of 49GB; PostgreSQL 17 connections and no long transactions; nginx valid; certificate valid to 2027-01-07; UFW exposes only 22/80/443.
- Traffic snapshot: today 476 succeeded, 86 completed, 38 failed, 1 running, 1 submitted. Past-24h nginx 502/500/499 were 459/137/407; 502s aligned with application restarts and connection-refused windows, and all 500s were the already-fixed Telegram `crypto is not defined` path. After the 19:26 restart, no new 5xx was observed. SSH saw 1,281 failed root password attempts, but password auth is disabled and no unauthorized successful login was found.
- Found a real loop: historical succeeded records with permanently expired provider media URLs were re-queued by background recovery, and `enqueueMediaIngestJobInDb()` reset terminal failed jobs to `queued`. `queueGenerationRecordAdvancedDownload()` now skips `advancedDownloadStatus=failed` unless called from an explicit user download2 retry.
- Production queue cleanup marked 272 terminal failed rows as unavailable (`available_at='infinity'`). Pre-update backup: `/var/backups/raising-game-demo/media-ingest-failed-closeout-20261109-200149.sql.gz` (0600, 434K, SHA-256 `4c142aa151caea6d76b054f00040a5782fb998b50cedde364a0a1d87565dfdcb`).
- Changed files: `server.parts/part-41.js`, `test/generated-assets-on-demand.test.js`. Added a regression test and updated prior signature assertions.
- Verification: canonical test command `node --require ./test/source-compat.js --test test/generated-assets-on-demand.test.js` passes 27/27; `node --check server.parts/part-41.js`; `git diff --check`.

## 2026-11-09 production patrol follow-up: terminal media scan closeout

- Continued the Old-only patrol after the initial deployment. Production stayed `active`, health returned `200`, `NRestarts=0`, disk 26GB/49GB, and no swap use.
- Last-90m nginx `502`s were confined to restart windows: 19:01, 19:26, and 20:07. No new `502` appeared after the 20:07 deployment. The 20:07 bootstrap requests returned 502 briefly while the service restarted.
- Node CPU briefly reached ~99% under a burst of list polling: 27,611 `/api/generation-records` requests in 30 minutes, including many `refresh=1` calls from a small set of clients. A later sample returned to 0%. This is a load/amplification risk, not evidence of the media worker spinning continuously.
- Found a remaining retry path: `getGenerationRecordsNeedingMediaPersistenceFromDb()` excluded `preparing/queued/processing/ready` but not `failed`, so terminal historical provider URLs were still selected by bounded recovery. Post-deploy logs at 20:09-20:18 continued to show `advanced-download-preparation-failed` for 2026-11-02/06 records.
- Fixed `db.js` so the media-persistence scan also excludes `advancedDownloadStatus=failed`; explicit download2 retry remains available. Added a regression assertion in `test/generated-assets-on-demand.test.js`.
- Verification: `node --require ./test/source-compat.js --test test/generated-assets-on-demand.test.js` passes 27/27; `node --check db.js`; `git diff --check`.
- Production queue snapshot before this fix: generation records `failed=2347`, jobs `failed=2249`, `ready=1577`, `processing=1`; 56 failed records had been touched during the previous hour. The empty backup candidate `media-ingest-failed-closeout-20261109-200144.sql.gz` is a valid zero-byte gzip and should be removed; the 434K `...200149.sql.gz` backup remains the recoverable copy.
- Deployment: source `old-site` `ad99854`; release snapshot / `platform-release` / `origin/platform-release` = `3f75839`; deployed Old only with `scripts/deploy_local.sh --site old`. Production HEAD `3f758391d33a2faf912d74ba0dd87f62aea9cf08`; `/api/health` 200; service active with `NRestarts=0`; `db.js:6885` on production contains the `failed` exclusion.
- Post-deploy verification: health 5/5 returned 200 (`0.135s`, `0.082s`, `0.732s`, `0.353s`, `0.276s`); no new `advanced-download-preparation-failed` or app exceptions in the first observation window. The only post-deploy 502s are the 20:21:58-20:22:00 service restart requests, matching all earlier deploys.
- Backup cleanup: removed the empty 20-byte gzip `/var/backups/raising-game-demo/media-ingest-failed-closeout-20261109-200144.sql.gz` after `gzip -t` and zero-byte decode verification. Retained valid `/var/backups/raising-game-demo/media-ingest-failed-closeout-20261109-200149.sql.gz` (444,033 bytes; decoded 2,472,821 bytes).
- Live was not pushed or deployed. Local `live-release` was rebuilt by the snapshot script to `0a9d28c`; `origin/live-release` remains unchanged.

## 2026-11-09 CPU capacity assessment (Old only, read-only)

- Follow-up to the patrol: determine whether CPU warrants a server upgrade. No changes or restart.
- Host has 4 vCPU (2 physical cores x 2 threads), 7.1GB RAM, 4GB unused swap. Instantaneous CPU over three 5s `mpstat` samples averaged 38.76% user / 3.65% system / 55.60% idle. Node `pidstat` averaged 44.2% total process CPU; burst samples ranged 21.8-59.6%.
- CPU PSI is low: `some avg10=1.11`, `avg60=2.01`, `avg300=3.06`; memory and IO PSI are effectively zero. Load ~1.3-1.5 on 4 CPUs. Disk util 0.1-0.3%.
- `ps %CPU=72.8` is lifetime average since process start, not current load, and can overstate a Node process that had a heavy startup/backfill window. `sar` showed total CPU mostly 27-38% through the evening, not sustained saturation.
- Traffic remains polling-heavy: 5,467 `refresh=1` generation-record requests in hour 20 alone. The useful action is reducing/merging polling and serialization work before buying more CPU. Current capacity has headroom for present traffic.

## 2026-11-09 production patrol (Old only, read-only)

- Scope: Old production `123vips.com` / `47.84.76.131` only. No code changes, deployment, restart, firewall change, or data mutation during this patrol.
- Service: `raising-game-demo` active/running since `20:34:32 CST`, `NRestarts=0`; local health 5/5 `200` (0.10-0.32s), public health 3/3 `200` (0.36-0.64s).
- Post-start nginx log has no `5xx`; the last `502` burst was the `20:34:32` restart window with connection-refused upstream. No lock waits; PostgreSQL 716MB, 21 sessions, longest transaction 0s.
- Resources: load about 1.9 on 4 CPU; Node PID `2284019` around 72-74% CPU, RSS sampled 1.10-1.56GB, 27 threads; memory 2.3GB used, 4.8GB available; swap 4GB unused. Disk 26GB/49GB (55%), inode 7%; NTP synchronized; certificate valid through 2027-01-07.
- Traffic amplification remains the main risk: about 1,537 `/api/generation-records` requests in roughly 15 minutes after restart, totaling 45.69MB; 1,468 carried `refresh=1`. Several client IPs made about 85 requests each in that interval (~5.7/min), consistent with old 10-second tabs or multiple tabs despite the newer client throttle.
- Media queue converged: no `queued`/`processing` ingest jobs at check time. Last 24h generation: 592 succeeded, 95 completed, 52 failed, 5 running, 2 submitted. Top failures: 10 upstream submission timeouts (refunded), 8 asset-download 403s, 4 content-sensitivity rejections, 4 image-download timeouts, plus isolated parameter/copyright failures.
- Security: UFW exposes only 22/80/443; fail2ban currently bans 27 SSH sources; no post-restart application warnings/errors indicating a live outage. Existing non-critical `undress.14vips.com` static-logo/video and stale-resource 404s remain a separate follow-up.

## 2026-11-09 gross-margin decline analysis (read-only production data)

- Goal: explain why the user-reported platform gross margin fell from about 30% in Aug 2026 to 15% in Sep and Oct 2026. Natural months use `Asia/Shanghai`. No code changes or deployment.
- Monthly paid recharge / net consumption: Aug USD 150.02 / 17,000 paid credits / 462,250.19 consumed; Sep USD 1,419.00 / 132,000 / 790,778.83; Oct USD 8,804.90 / 950,500 / 1,493,060.43.
- Directly measured `app_credit_ledger` totals Aug-Oct: `wallet_topup=+1,099,500`; `admin_credit_add=+2,370,075` across 416 events. Thus admin grants supplied 2.16x the paid topup credits and 68.3% of new credit supply in the period.
- Monthly `admin_credit_add`: Aug 507,875 / 41 users; Sep 855,900 / 62; Oct 1,006,300 / 62. Almost all were ordinary users with no recharge in the same month. Operator: Aug `xin` 84 events / 38 users / 489,810 plus `admin` 5/5/18,065; Sep and Oct entirely `xin`.
- Zero-recharge users consumed 541,970.10 / 554,475.91 (97.7%) in Aug; 787,782.19 / 954,018.39 (82.6%) in Sep; 615,592.61 / 1,714,865.88 (35.9%) in Oct.
- User concentration: Sep top consumer `wswlja11` consumed 184,290 (20.0% of platform), had 0 recharge and 157,500 grants. Other examples: `13067397328` 69,323.61 / 7.5% / 0 recharge / 51,500 grants; `5158` 42,422.75 / 4.6% / 0 / 110,000. Oct top users are more dispersed; e.g. `wswlja11` 101,178.08 / 6.0% / 0 / 105,500 and `yj6266082` 99,675 / 5.9% / 96,500 recharge / 25,000 grants.
- Product mix: video is about 98% of consumption. Provider consumption share Seedance / Seedance NSFW / Wan 3.0: Aug 63.7% / 15.6% / 12.6%; Sep 44.2% / 32.9% / 20.9%; Oct 34.9% / 34.2% / 28.4%. Seedance NSFW 720p has comparatively low modeled margin (about 11% Aug, 12.7% Sep, 19.8% Oct).
- Oct promotion pricing: actual topup credits/USD was 113.32 Aug, 100.00 Sep, 114.52 Oct, but `double-topup-20261015` gave 69 orders / USD 2,070 / 312,000 credits (~150.72 credits/USD) and `usd-500` gave 130 credits/USD. This directly lowers revenue per delivered credit.
- Earlier claim of widespread generation pre-deduction/refund leakage is retracted. Comparing successful task `preDeductedCredits` and `finalCredits` found no major provider-wide refund gap; only small text-model settlement differences.
- Priority conclusion: the largest evidence-backed cause is large free `admin_credit_add` grants consumed by real users, followed by higher low-margin Seedance NSFW/Wan 3.0 mix and Oct promotional pricing. Aug's early Wan 3.0 1080p pricing anomaly was severe but does not explain Sep/Oct by itself.
- Database lacks auditable provider invoices/platform-wide COGS, so configured-price estimates cannot fully reconcile the user-reported 15% blended margin. Recommended: freeze/approve ordinary-user `admin_credit_add`, whitelist and expire grants, audit `xin` history, raise NSFW 720p pricing, review promotional effective price, and ingest supplier billing for margin accounting.

## 2026-11-09 generation polling optimization

- Goal: reduce recurring generation-list poll CPU, PostgreSQL reads, and response bandwidth without making completion detection slower for users.
- Active-task cadence remains 15 seconds; idle cadence remains 120 seconds. Polling stays account-level instead of calling per-record detail endpoints.
- New frontend polls `/api/generation-records?page=1&limit=20&refresh=1&poll=1`. The explicit `poll=1` contract returns status/result/billing fields but skips media hydration, result-asset backfill persistence, poster maintenance fan-out, prompts, params, usage, and input-media payloads.
- Plain `refresh=1` remains a full response for already-open older frontend clients. This avoids a rolling-deploy compatibility regression where cached tabs would erase in-memory params/assets.
- New frontend shallow-merges compact snapshots into existing complete records, including nested billing. It also refreshes immediately when a hidden tab becomes visible so background-tab throttling does not delay completion feedback.
- Changed: `server.parts/part-21.js`, `server.parts/part-41.js`, `server.parts/part-20.js`, `platform.ui.parts/part-02.js`, `test/generation-record-list-refresh.test.js`. History-page refresh remains authoritative and is not shallow-merged.
- Verification: source-compat focused suites 43/43; syntax and `git diff --check` pass.
- Rollback: rebuild/deploy `9721267`/release `c3ad172`; no database migration.
- Deployment: source `e49b8f7`; release snapshot / `platform-release` = `d2c5b6e`; deployed Old only. Production commit `d2c5b6e`; `/api/health` 200; service restarted normally; production `platform.ui.parts/part-02.js` contains `poll=1`, merge, and visibility refresh logic. Live was not pushed or deployed.

## 2026-11-09 complete advanced model purchase-price audit

- Goal: reconcile every Advanced model purchase price, fill missing Vega purchase prices from Tencent VOD international USD list pricing, show sale/purchase multipliers in Admin, and identify all rows below 1.5x.
- Changed: `admin.js`, `admin.css`, `server.parts/part-01.js`, `server.parts/part-02.js`, `server.parts/part-39.js`, `test/advanced-pricing.test.js`; added `scripts/audit-advanced-pricing.js`.
- Vega purchase tables now cover H3/Vega 1.5 Lite, Vega 1.0 Lite, Vega 1.0 Pro, and Vega 1.5 Pro, including separate input-video rates and Vega 1.0 Lite extra-reference-image pricing. All 41 Vega fee rows are editable, source `admin_configured`, and sale/purchase = 1.5x.
- Audit command: `node scripts/audit-advanced-pricing.js`; result `84 rows`, `OK 68 | LOW 14 | MISSING 0 | RANGE 2`.
- Real rows below 1.5x: Seedance 2.5 480p/720p (1.000000x); W3.0-Prime 480p/720p/1080p (1.482222x/1.482222x/1.408111x); Seedream 5.0 Pro 1K/2K/reference (1.000000x each); Qwen Image 3.0 Pro 1K/2K/reference (1.000000x each); Qwen Image 3.0 Standard 1K/2K/reference (1.000000x each).
- HappyHorse has no single official purchase price: 720p range USD 0.084-0.112/s at sale USD 0.168/s (1.5x-2.0x); 1080p range USD 0.108-0.192/s at sale USD 0.288/s (1.5x-2.666667x). The audit reports these as `RANGE`, not missing.
- Targeted regression: `node --require ./test/source-compat.js --test test/advanced-pricing.test.js test/vega-pricing-label.test.js test/seedance-fast-pricing.test.js` passed 38/38.
- Deployment status: pending selective commit, platform release snapshot, `platform-release` push, and Old-only deployment. Rollback release must be rechecked immediately before deployment.
- Deployment completed: `old-site` `66c88ed`; `platform-release` and remote `origin/platform-release` `7e957b8`; Old-only deploy via `scripts/deploy_local.sh --site old`. `/api/health` returned 200 `{"ok":true}`. Rollback release `d2c5b6e`. Live release was not updated or deployed.

## 2026-11-09 Vega overseas purchase-price audit (read-only production)

- User asked to verify Vega overseas-node purchase prices because admin appeared to have blanks; explicitly excluded fast/mini variants.
- Production DB `app_kv.app_config -> platform.advancedPricing` does not persist Vega purchase tables (only sale credit tables), but `normalizeAdvancedPricing()` fills them from canonical international VOD defaults.
- Read-only production `adminAdvancedPricingView()` with the live config returned all 41 integrated Vega rows (h3/Wan1.5 Lite, Vega1.0 Lite, Seedance2.0/Vega1.0 Pro, Seedance2.5/Vega1.5 Pro) with positive, editable purchase prices and exactly 1.5x sale prices. No Vega row was blank.
- Values match the supplied Tencent VOD international price sheet for output, input-video, and Vega1.0 Lite >5 reference image pricing. No code or price changes were needed; no deployment performed.

## 2026-11-09 Seedance 2.5 480p/720p sale markup 1.1x + admin pricing model filter

- Goal: set Seedance 2.5 480p and 720p sale multiplier to 1.1x without changing purchase prices; reduce the long admin pricing page with a model filter.
- Changed: `server.parts/part-01.js`, `server.parts/part-02.js`, `admin.js`, `admin.css`, `test/advanced-pricing.test.js`.
- Seedance 2.5 defaults now use `SEEDANCE25_DEFAULT_SALE_MARKUP = 1.1`. Exact legacy defaults at purchase price (8.995502/14.992504 and rounded 8.9955/14.9925) migrate to the new defaults; customized sale prices are preserved.
- Effective Seedance 2.5 defaults: 480p purchase 8.9955 credits/s, sale 9.8951 credits/s (~1.100006x); 720p purchase 14.9925, sale 16.4918 (~1.100003x). Purchase USD/s remains 0.089955 and 0.149925.
- Admin pricing now has a model filter (default all models). It hides table rows only, hides empty sections, and save still reads every row, so filtered-out prices are not dropped.
- Verification: `node --check admin.js server.parts/part-01.js server.parts/part-02.js` passed; `node --require ./test/source-compat.js --test test/advanced-pricing.test.js` passed 26/26; `git diff --check` passed.
- Deployment completed: `old-site` `a519959`; `platform-release` / `origin/platform-release` `f7c9a1d`; deployed Old only via `scripts/deploy_local.sh --site old`. `/api/health` returned 200 `{"ok":true}`; production `admin.js`/`admin.css` contain the model filter. Rollback release `f6a08d8`. Live was not deployed.

## 2026-11-09 Admin refresh follow-up: legacy simplified Seedance 2.5 values

- User reported the admin pricing page did not change after deployment.
- Production `app_kv.app_config -> platform.advancedPricing.seedance25CreditsPerSecondByResolution` contained legacy simplified values `480p: 9`, `720p: 16`; these differed from the exact purchase-price legacy defaults and were therefore preserved as custom prices.
- Added `previousSimplifiedUiDefault` (`9`/`16`) to the normalized legacy-default migration set and extended the regression test to cover both stored forms. Custom values outside these known legacy defaults remain preserved.
- Deployment completed: `old-site` `ace9d54`; `platform-release` / `origin/platform-release` `78b575e`; deployed Old only via `scripts/deploy_local.sh --site old`. `/api/health` returned 200. Re-running `adminAdvancedPricingView()` against the actual production config now returns Seedance 2.5 480p `purchase 8.9955 / sale 9.8951` and 720p `purchase 14.9925 / sale 16.4918`. Rollback release `f7c9a1d`. Live was not deployed.

## 2026-11-09 model picker + admin pricing model details (in progress)

- Goal: generate page model selection follows the supplied popover reference (icon/name/subtitle/check); admin pricing first shows a model list, each model opens detailed pricing, and a settings dialog edits display name, subtitle, and model discount.
- Decision: persist `advancedPricing.modelSettings[<modelKey>]` as `{ displayName, subtitle, discount }` in the existing PostgreSQL-backed pricing config. `discount` is a multiplier (`0.9` = 9折); `1` means no discount.
- Decision: effective user-facing sale price is configured sale price × model discount. Purchase price and base sale price remain unchanged; admin detail should show both base and effective values.
- Compatibility: preserve the native `advancedProvider` select in the DOM/backing logic and layer a custom popover over it.
- Target environment: Old only after commit/release/deploy; do not deploy Live.

## 2026-11-09 客服工单 + 系统通知（待部署）

- Goal: support becomes database-backed ticket threads; users and admins converse in one ticket, unread replies show red dots, ringing bell opens a notification center, and admins configure pinned/scheduled/expiring broadcasts.
- Data: PostgreSQL tables `app_support_tickets`, `app_support_ticket_messages`, `app_system_notifications`, `app_system_notification_reads`. No file fallback. Old `app_support_messages` and live notification APIs remain compatible.
- APIs: user ticket create/list/detail/reply; user notification list/read-one/read-all; admin ticket list/detail/update/reply; admin notification CRUD. New user code is in `server.parts/part-33.js`, routes in `server.parts/part-42.js`, DB readers/writers in `db.js`.
- User UI: `platform.html`, `platform.config.js`, `platform.explore.js`, `platform.main.js`, `platform.css`, and UI sync hook in `platform.ui.parts/part-01.js`/`part-02.js`. Bell/dropdown/detail, 25s polling, unread title and red dots, ticket list/new-thread/chat composer, header buttons.
- Admin UI: `admin.html`, `admin.js`, `admin.css`. Routes `#/support-tickets` and `#/system-notifications`; search/status/unread filtering, ticket thread replies, status/priority controls, notification create/edit/delete/toggle, publish/expiry/pin and user preview.
- Read consistency: ticket read markers now use PostgreSQL `NOW()` when no explicit timestamp is supplied, matching database-generated message timestamps and avoiding persistent false unread badges.
- Verification: syntax checks passed for all changed JS; focused support/auth/chat/admin/mobile/platform/site/email tests passed (6/6 support, 25/25 auth, 44/44 chat settlement, 78/78 selected UI/site). `git diff --check` pending final state-file cleanup.
- Pending: selective commit, build/push `platform-release`, deploy Old only via `scripts/deploy_local.sh --site old`, then verify health and production assets/API.

## 2026-11-10 cold refresh latency and pool starvation cleanup (deployed Old)

- Goal: fix 20+ second cold homepage/admin refreshes, especially the first request after an idle period, while leaving Live unchanged.
- Reproduction: homepage TTFB reached 21.13s while `/api/health` (0.39–0.49s), `/admin.html` (0.14–0.59s), and `/api/config/public` (0.09s) were healthy. Fresh Chrome cold load completed at 3.99s, but 25 critical scripts plus all deferred tools and Lucide were fetched again by Service Worker precache after load.
- Primary backend root cause: `readAppDbFromTables()` used `Promise.all()` across 8–10 tables. Each legacy full snapshot consumed almost half of `PGPOOL_MAX=20`, so two concurrent auth/admin calls could exhaust the pool. The snapshot also selected admin home items and support messages that `readDb()` immediately discarded.
- Backend fix: full legacy snapshot now borrows one PostgreSQL client and queries serially, releasing it in `finally`; unused `app_admin_home_items` and `app_support_messages` reads are removed. Admin support reply uses `requireAdmin(..., { loadDb:false })` plus `getSupportMessageByIdInDb(messageId)` instead of loading the full application.
- Frontend fix: removed Service Worker install-time shell prefetch, removed full critical+deferred+Lucide precache message, and no longer auto-loads five deferred tools during `load`. Workflow, video-tool, and chat entry points load deferred modules on demand.
- Verification: `platform-refresh-performance` + `generation-db-scope` pass 14/14; `support-notifications` + `chat-live-settlement` + `auth-risk` pass 78/78; syntax checks and `git diff --check` pass.
- Publish scope: `db.js`, `platform.js`, `platform-sw.js`, `platform.explore.js`, `server.parts/part-01.js`, `server.parts/part-33.js`, `test/generation-db-scope.test.js`, `test/platform-refresh-performance.test.js`, this state entry. Unrelated model-picker/canvas WIP must not be staged.
- Deployment: committed `ec270ae`, built platform release `0c836ed`, pushed `old-site` and `platform-release`, deployed Old only with `scripts/deploy_local.sh --site old`. Live release remains `bf1e01a`.
- Production verification: homepage TTFB 0.37s cold / 0.14–0.43s repeated; admin TTFB 0.22s cold / 0.14–0.16s repeated; `/api/health` 0.08–0.21s. Server HEAD is `0c836ed`, service active, zero restart-timeout/error matches, and no `timeout exceeded when trying to connect` entries since restart. Production `platform-sw.js` no longer contains precache shell logic, and `platform.js` exposes deferred modules without loading them on page load.
