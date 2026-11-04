# Codex Task State

This file is the durable handoff for this task. After compaction, read this file first.

## Active request

- Investigate task `cgt-20261104232822-2811e0`: slow download and `Failed to fetch` when saving.
- Fix the download path on `123vips.com` only. Do not deploy Live.

## Root cause and decisions

- R2/CDN was healthy. The reported video is 13,740,819 bytes on `media.123vips.com`; full GET returned 200, Range returned 206, CORS is present, and cache responded with `cf-cache-status: HIT`.
- The advanced-download UI buffered the entire video through `fetch().blob()`, so a transient request failure surfaced as the generic `Failed to fetch`.
- First-time R2 preparation of this record took about 33 seconds. That backend transfer is still expected when no R2 copy exists yet.
- Advanced downloads now navigate directly to the signed R2 URL instead of buffering a blob.
- Browser-facing standard downloads now prefer the durable CDN URL over expiring provider URLs.
- External API response behavior remains provider-first and must not be changed for this fix.

## Changed files

```text
platform.ui.parts/part-02.js
server.parts/part-20.js
test/generated-assets-on-demand.test.js
test/generation-record-list-refresh.test.js
test/undress-tool.test.js
CODEX_TASK_STATE.md
```

## Verification

- `node --require ./test/source-compat.js --test test/generated-assets-on-demand.test.js test/undress-tool.test.js test/generation-record-list-refresh.test.js test/source-split.test.js`: 39 pass, 0 fail.
- `node --check server.parts/part-20.js`, `node --check platform.ui.parts/part-02.js`, and `git diff --check`: passed.
- Production `https://123vips.com/api/health`: 200 `{"ok":true}`.
- Deployed `platform.ui.parts/part-02.js` contains CDN-first selection and direct `triggerBrowserDownload`, and no `saveDownloadFromFetch`/`response.blob()`.
- CDN probe for the reported record: 200 GET, 206 Range, `content-length: 13740819`.

## Deployment

- `old-site`: `64ccf45` (`Fix generated media downloads to stream from CDN`).
- `platform-release`: `553bc96`, built from `64ccf45`.
- Deployed only `123vips.com` with `scripts/deploy_local.sh --site old`.
- Release boundary/audit passed and service restarted successfully.
- Live release was not deployed.
- Never deploy integration branches directly; continue using the release snapshot workflow.
- Business/runtime data remains PostgreSQL-only.

## Next steps

- None for this fix. Monitor the user's retry; first preparation can still take up to tens of seconds, but the browser no longer buffers the whole file in frontend JavaScript.
