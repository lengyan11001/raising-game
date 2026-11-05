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
