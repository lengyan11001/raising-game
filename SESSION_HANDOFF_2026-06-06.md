# Old-Site Session Handoff

## Scope

- Workspace: `D:\raising-game-price-old`
- Branch in local workspace: `old-site`
- Production site: `https://123vips.com`
- Production server: `101.47.76.188`
- Remote root: `/opt/raising-game-demo`
- Service: `raising-game-demo`

## Current Production Status

- The old site is running direct Ark upstream mode for Seedance and DashScope for Wan2.7.
- The following recent fixes have already been synced directly to production:
  - Volcengine-compatible Seedance API is live.
  - Seedance Fast/Standard support is live in UI and API docs.
  - History and assets preview click behavior is fixed.
  - History playback now prefers local stored video URLs before expired upstream URLs.
  - Support inbox system has been restored on the old site.
  - API docs no longer expose price or discount numbers.
  - API docs list model values and parameter ranges.

## Important Production Model IDs

- Seedance Standard endpoint: `ep-20260429142513-zg667`
- Seedance Fast endpoint: `ep-20260429142538-fkm9d`
- Wan2.7 video model: `wan2.7-i2v-2026-04-25`
- Wan2.7 image model: `wan2.7-image-pro`

## Seedance API Behavior

### Preferred direct API

- Endpoint: `POST /api/v3/contents/generations/tasks`
- Standard model value: `dreamina-seedance-2-0-260128`
- Fast model value: `dreamina-seedance-2-0-fast-260128`
- Old-site endpoint IDs are also accepted.

### Legacy advanced API

- Endpoint: `POST /api/advanced/generate`
- For Seedance, callers can use:
  - `provider: "seedance"`
  - `seedanceTier: "standard"` or `"fast"`
- Fast is accepted in API behavior, but pricing details were intentionally removed from public docs.
- Fast does not support `1080p`.

## API Docs State

- `API Access` page and `/docs/models.md` now document:
  - supported model values
  - parameter names
  - parameter ranges
  - mode restrictions
- Price and discount wording was removed from docs by request.
- `Copy token + docs` now includes:
  - token
  - docs URL
  - models JSON URL
  - records API URL
  - supported endpoint list

## Support Inbox

### Frontend

- Homepage now has a floating `Support` button.
- Logged-in users can submit:
  - email
  - subject
  - message

### Backend

- User submit endpoint: `POST /api/support-messages`
- Admin list endpoint: `GET /api/admin/support-messages`
- Admin reply endpoint: `POST /api/admin/support-messages/:id/reply`

### Admin

- Admin sidebar includes route: `#/support`
- Admin can read and reply to support messages.

### Storage

- `db.js` now includes `app_support_messages`
- `DEFAULT_DB` and merge logic include `supportMessages`

## Preview Fixes

- History:
  - video poster click opens preview modal
  - image result click opens preview modal
  - hover still loads inline preview for videos
- Assets:
  - image click opens preview modal
  - video click opens preview modal
- Create page advanced asset grid:
  - image click opens preview modal
  - video click opens preview modal

## Recent Local Commits

These commits exist locally in the workspace history:

- `c9ad147` Restore onsite support inbox
- `078a16e` Remove pricing from API docs
- `93e366b` Expand API parameter documentation
- `13374b5` Document Seedance fast token access
- `1366606` Add Seedance fast tier pricing
- `6b1dca0` Restore click preview in history and assets
- `e1cc21d` Enable preview in create asset grid and history images

## Git Push Caveat

- Local GitHub SSH push is currently broken on this machine.
- `git push origin old-site` times out or fails because GitHub public key auth is not working from this environment.
- Because of that, production changes were synced by directly uploading changed files to the server and restarting the service.

## Deployment Pattern Used In This Session

### Normal deploy command

When git push is working:

```powershell
$src = Get-Content 'D:\raising-game\scripts\fyshark_tail_log.py' -Raw
$null = $src -match '(?m)^PASSWORD\s*=\s*"([^"]+)"'
$env:FYSHARK_SSH_PASSWORD = $matches[1]
python .\scripts\deploy_pull.py --branch old-site --remote-root /opt/raising-game-demo --service raising-game-demo --health-url https://123vips.com/api/health
```

### Fallback used here

- Upload changed files directly with Paramiko
- Restart `raising-game-demo`
- Verify by grepping deployed files and checking `https://123vips.com/api/health`

## Known Follow-up Items

1. Fix local GitHub SSH credentials so deploys can go back to normal branch-based flow.
2. Verify support inbox end-to-end in browser:
   - homepage button visible after login
   - submit succeeds
   - admin support tab shows record
   - reply persists
3. If needed, add user-facing reply display later.
4. If needed, localize `Support`, `Email`, `Subject`, `Message`, `Send`, and status strings in the support dialog.

## Good Starting Checks For Next Session

1. Open `https://123vips.com`
2. Log in with an existing user
3. Check homepage lower-right support button
4. Open admin and verify `#/support`
5. If deploys are needed again, remember production has already been directly patched even if GitHub branch is behind those commits remotely
