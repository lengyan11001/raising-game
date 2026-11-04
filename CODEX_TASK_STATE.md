# Codex Task State

This file is the durable handoff for this task. After any context compaction or continuation, read this file first. Do not re-read large source files or repeat discovery already recorded here.

## User's active request

- Fix missing video thumbnails in both the **Generate → Result** tab and the Seedance **Result** history surface on `123vips.com`.
- Successful video records with `GENERATED_ASSETS_ON_DEMAND=true` must be able to repair a missing poster without turning on general full-video storage.

| Provider ID | UI label | ModelName | ModelVersion |
|---|---|---|---|
| `seedance20-vega` | `Seedance 2.0（Vega）` | `wand-vega-video` | `1.0-pro` |
| `seedance25-vega` | `Seedance 2.5（Vega）` | `wand-vega-video` | `1.5-pro` |
| `h3-vega` | `H3（Vega）` | `wand-vega-video` | `1.5-lite` |

## Root cause and decisions

- On-demand storage intentionally skipped normal generated-video download, R2 mirroring, and poster creation. Successful records could therefore contain only an upstream video URL and no thumbnail.
- Generate Result required a video URL before rendering a poster, and history/Seedance records without media were excluded from the fallback list.
- Backend now has a narrowly scoped poster-repair path: succeeded, non-API video output, provider video present, and both `cdnPosterUrl` and `localPosterUrl` missing.
- On-demand mode blocks ordinary video downloads. Only the targeted poster-maintenance path may force a transient local copy and generate a poster.
- `handleListGenerationRecords()` and `handleGetGenerationRecord()` queue poster repair for matching records, covering both Result surfaces.
- Public generation records now expose `cdnPosterUrl`, `localPosterUrl`, and `posterPending`.
- Generate Result renders media when either a video URL or a poster exists, retries missing posters at a bounded frequency, and stops after the retry limit or success.

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

- Business/runtime data must use PostgreSQL via `DATABASE_URL`; no JSON/static fallbacks.
- Deploy `123vips.com` only, via `scripts/deploy_local.sh --site old`, from a committed `old-site` release snapshot. Never deploy `old-site` directly. Do not deploy `live-release`.
- Do not broaden poster repair into general on-demand video/R2 storage.

## Changed files

```text
platform.create.js
server.js
test/advanced-result-order.test.js
test/advanced-result-refresh.test.js
test/generated-assets-on-demand.test.js
```

## Verification

- Focused regression: **27 pass, 0 fail**
  - `node --test test/advanced-result-order.test.js test/advanced-result-refresh.test.js test/generated-assets-on-demand.test.js test/media-url-priority.test.js`
- `node --check server.js` passed.
- `node --check platform.create.js` passed.
- `git diff --check` passed.
- Production target record `cgt-20261104211413-a659e7` now has `localVideoUrl` and `localPosterUrl`; poster endpoint returns HTTP 200 `image/jpeg`, video endpoint supports HTTP 206.
- Production `platform.create.js` contains poster retry/render logic; `platform.ui.js` resolves local posters.

## Critical code locations

- `server.js:26569` `generationRecordNeedsPosterMaintenance`
- `server.js:26609` `queueGenerationRecordMediaMaintenance`
- `server.js:27592` `downloadGeneratedVideo`
- `server.js:51641` `handleListGenerationRecords`
- `server.js:51687` `handleGetGenerationRecord`
- `platform.create.js:613` history fallback records
- `platform.create.js:689` advanced result rendering
- `platform.create.js:803` bounded poster retry

## Deployment status

- Thumbnail fix committed as `old-site` `75c7e8b` (`080b630` in the isolated worktree).
- Platform release snapshot: `platform-release` `af46b2d`, built from `75c7e8b`.
- Deployed only to `123vips.com` via `scripts/deploy_local.sh --site old`.
- Live was not modified: `live-release` remains `6642e17`.
- Production deployment and release-boundary checks passed; health check returned `{"ok":true}`.

## Next steps

- None for this fix. If a provider URL has already expired and no local/R2 video exists, a poster cannot be recovered after the fact; future successful records are repaired while the provider URL is valid.
