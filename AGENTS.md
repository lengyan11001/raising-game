## Data Storage Rule

- Runtime/business data must be stored in PostgreSQL through `DATABASE_URL`.
- Do not add JSON-file, flat-file, or `data/*.json` fallbacks for users, sessions, balances, generation records, characters, templates, pricing, wallet orders, or analytics.
- Static media files such as images, videos, icons, and generated assets may exist as files, but their metadata and ownership records must be in the database.
- If a database is unavailable, the service should fail clearly instead of silently reading or writing local data files.

## Production Deployment Rule

- Use only the repository deployment entrypoint: `scripts/deploy_local.sh --site old` for `123vips.com`, or `scripts/deploy_local.sh --site live` for `live.123vipeak.com`.
- The wrapper automatically loads local SSH credentials from the gitignored `LOCAL_CREDENTIALS.md` in the repository root. Never commit or print that file.
- Build release snapshots from a committed `old-site` integration commit with `python3 scripts/build_release_snapshot.py --source old-site`, push `platform-release` and/or `live-release`, then deploy the corresponding site.
- Never deploy `old-site` directly. Never mix platform files into `live-release` or Live files into `platform-release`.
- If `LOCAL_CREDENTIALS.md` is missing, recreate it locally with `OLD_SITE_SSH_PASSWORD=...` and `LIVE_SITE_SSH_PASSWORD=...`; do not search historical sessions for deploy commands or invent alternate SSH paths.
