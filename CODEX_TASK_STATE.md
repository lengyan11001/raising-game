# Codex Task State

This file is the durable handoff for this task. After any context compaction or continuation, read this file first. Do not re-read large source files or repeat discovery already recorded here.

## User's active request

- Fix **123vips.com** Generate tab for the three Tencent VOD Vega models.
- Selecting a Vega model and adding an asset from the library must work, including legacy assets that only have a local URL.
- Audit all Vega multimodal controls: first frame, last frame, reference images, reference video, reference audio, local upload, preview, Add, submit, and regeneration.
- Vega parameters must follow the Tencent VOD contract, not copied legacy Seedance/ByteDance parameters.

| Provider ID | UI label | ModelName | ModelVersion |
|---|---|---|---|
| `seedance20-vega` | `Seedance 2.0（Vega）` | `wand-vega-video` | `1.0-pro` |
| `seedance25-vega` | `Seedance 2.5（Vega）` | `wand-vega-video` | `1.5-pro` |
| `h3-vega` | `H3（Vega）` | `wand-vega-video` | `1.5-lite` |

## Root cause and decisions

- Add failed for older library assets because they could have `localUrl` but no public HTTP(S) URL. Vega only accepts public HTTP(S) media URLs.
- Frontend now resolves Vega asset IDs through `/api/user-assets/resolve` before Add and again before submit.
- Backend now forces the public mirror for Vega uploads and Vega asset resolution. Object-storage failure returns HTTP 502 `VEGA_ASSET_PUBLIC_URL_UNAVAILABLE`; there is no local-relative-URL fallback.
- New Vega uploads return the backend `publicUrl`/`cdnUrl` immediately.
- First-frame and last-frame state are refreshed from resolved assets before the final payload is built.
- Local upload handlers capture the selected target before upload so an async refresh cannot redirect the asset into another target.
- Vega Add never overrides the user's explicitly selected target.
- `applyAdvancedCreateMode({ syncForm: false })` prevents model-control refreshes from resetting the selected Vega provider.
- New `platform.vega-media.js` is the single source of truth for target/media-kind/public-URL rules.

## Vega contract

- Payload fields: `ModelName`, `ModelVersion`, `Prompt`, `FileInfos[]`, `OutputConfig`, optional `Seed`, `EnhancePromptMode: "disable"`.
- `FileInfos[].Usage`: `FirstFrame` / `LastFrame` / `Reference`.
- `FileInfos[].Category`: `Image` / `Video` / `Audio`.
- Duration: 1-15 seconds.
- Resolution: `768P` / `1080P` / `2K` / `4K`.
- Aspect ratio: `21:9` / `16:9` / `4:3` / `1:1` / `3:4` / `9:16`.
- Never send legacy `ReferenceType`.
- Vega pricing is not supplied. Fail closed with HTTP 422 `MODEL_PRICING_UNAVAILABLE`; no upstream call and no deduction.

## Non-negotiable rules

- Preserve exact Vega provider IDs end to end: records, params, estimate/submit, polling, regeneration, public responses.
- Never reuse existing Seedance/H3 pricing.
- Vega `FileInfos` must use `Usage` and must never send legacy `ReferenceType`.
- Create task ID is `Response.TaskId`; query payload is `Response.AigcVideoTask`.
- Success status is `FINISH`; outputs are `AigcVideoTask.Output.FileInfos[]`.
- Choose the output with empty/absent `UsageType`, never `last_frame_url`.
- Preserve raw create/query responses in generation records.
- Tencent credentials must stay out of Git.
- Business/runtime data must use PostgreSQL via `DATABASE_URL`; no JSON/static fallbacks.
- Deploy `123vips.com` only, via `scripts/deploy_local.sh --site old`, from a committed `old-site` release snapshot. Never deploy `old-site` directly. Do not deploy `live-release`.

## Env vars

- `TENCENTCLOUD_SECRET_ID`
- `TENCENTCLOUD_SECRET_KEY`
- `TENCENT_VOD_SUB_APP_ID`

## Changed files

```text
platform.config.js
platform.create.js
platform.js
platform.main.js
platform.ui.js
server.js
platform.vega-media.js
test/tencent-vod-vega.test.js
CODEX_TASK_STATE.md
```

## Verification

- Focused Vega + advanced custom UI: **62 pass, 0 fail**
  - `node --test test/tencent-vod-vega.test.js test/advanced-custom-ui.test.js`
- Full suite: **605 pass, 15 fail**
  - `npm test`
  - All 15 failures are pre-existing branch/baseline failures; none are Vega-specific.
  - Log: `/tmp/raising-game-test.log`
- Syntax checks passed for `server.js`, `platform.main.js`, `test/tencent-vod-vega.test.js`, and `test/advanced-custom-ui.test.js`.
- `git diff --check` passed.
- Browser automation is unavailable in this repository, so coverage is source-level regression plus the existing helper tests. Do not ask the user to manually test each control.

## Critical code locations

- `server.js:32385` `handleAdvancedVegaGenerate`
- `server.js:24537` `ensureVegaPublicUrlForUserAsset`
- `server.js:26780` `refreshVegaGenerationRecord`
- `server.js:36906` `advancedRegenerateBody`
- `server.js:37689` Vega API docs
- `platform.create.js:159` Vega asset resolution helpers
- `platform.create.js:2442` Vega submission branch
- `platform.create.js:3548` Vega local uploads
- `platform.vega-media.js` target/media validation helper
- `tencent-vod-vega.js` TC3/client/payload helpers

## Deployment status

- Previous poster-fix deployment: `old-site` `8ef1977`, `platform-release` `8ef7a19`, deployed to `123vips.com`.
- Current Vega asset/control fix is **not committed, not released, and not deployed**.

## Next steps

1. Run focused tests, syntax checks, and `git diff --check` after any final adjustment.
2. Commit the Vega media/control fix on `old-site`.
3. Build from the committed `old-site` with `python3 scripts/build_release_snapshot.py --source old-site`.
4. Push `old-site` and `platform-release` only.
5. Deploy only `123vips.com` with `scripts/deploy_local.sh --site old`.
6. Smoke test health, loader/helper availability, and three Vega options. Do not deploy Live.
