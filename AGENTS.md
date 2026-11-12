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

## Context Continuity

- After any context compaction or continuation, read `CODEX_TASK_STATE.md` first.
- Maintain `CODEX_TASK_STATE.md` with the goal, decisions, changed files, tests, and deployment status after each major step.
- Do not repeatedly re-read large source files or repeat discovery already recorded there. Inspect only targeted line ranges when the state file lacks a required fact.
- Do not ask the user to restate requirements recorded in the state file.


## Context Efficiency

- Treat context as a scarce resource. Use `rg -n` to locate a symbol first, then read only the smallest line range needed.
- Never read a whole large file. Prefer `sed -n 'START,ENDp'` ranges under 160 lines and cap tool output with `max_output_tokens <= 5000`.
- Do not repeat a file/range read after a fact is already recorded in `CODEX_TASK_STATE.md`. If a read is repeated, update the state file with the missing fact and stop broad rediscovery.
- Never re-run broad repository searches merely to confirm known facts. Use recorded paths, line anchors, and test commands from the state file.
- Pipe noisy test/build output through a targeted filter or save it to a temporary file and print only failures and the final summary.
- After compaction, resume from `CODEX_TASK_STATE.md`; do not replay the prior discovery pass.
