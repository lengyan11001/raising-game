## Data Storage Rule

- Runtime/business data must be stored in PostgreSQL through `DATABASE_URL`.
- Do not add JSON-file, flat-file, or `data/*.json` fallbacks for users, sessions, balances, generation records, characters, templates, pricing, wallet orders, or analytics.
- Static media files such as images, videos, icons, and generated assets may exist as files, but their metadata and ownership records must be in the database.
- If a database is unavailable, the service should fail clearly instead of silently reading or writing local data files.
