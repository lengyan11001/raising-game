# Redis usage matrix for the Old resilience roadmap

This is a decision matrix, not a deployment instruction. Redis remains disabled until a measured
need and the gates in `ops/REDIS-PLAN.md` and `ops/RESILIENCE-DECISION-2026-11.md` are satisfied.
The authoritative sequence remains: observe, Nginx failover drill, capacity review, optional
multi-process, optional Redis, then off-host recovery.

| Workload | Keep in PostgreSQL? | Redis role | Why |
| --- | --- | --- | --- |
| Users, sessions, balances, ledger, orders | Yes, authoritative | None | Financial and identity facts must survive Redis loss. |
| Generation records, submission jobs, charges, refunds | Yes, authoritative | Optional fast lease only after result fencing | Reconciliation and billing require durable state. |
| Request idempotency results | Yes, authoritative | Optional short lease to reduce contention | A Redis miss must fall back to PostgreSQL. |
| Webhook claims | Yes, authoritative | No | Duplicate delivery and audit must be durable. |
| Public config / templates / platform HTML | PostgreSQL or release files remain source | Cache-aside with TTL | Losing Redis only causes a miss. |
| Public pricing / APIZ metadata | PostgreSQL/provider rules remain authoritative | Short TTL cache | Never charge from a cached stale price. |
| Compact generation polling list | PostgreSQL remains source | Short TTL after mutation-version invalidation | Requires cross-process invalidation evidence. |
| Rate limiting / login abuse buckets | Durable security facts stay in PostgreSQL | Short-window counters optional | Shadow compare before primary use. |
| One-time embed tickets | Durable redemption record in PostgreSQL | NX claim / short lease only | Redis-only redemption is unsafe. |
| Chat-live WebSocket presence | Durable session data remains PostgreSQL | Pub/Sub only if multi-process realtime is measured | Same-host Redis does not solve host loss. |
| Media bytes | No | No | Use R2/object storage and CDN. |

## Key and failure contract

- Namespace: `rg:<environment>:<domain>:<version>:<key>`.
- Hard TTL on every key; bounded value size; no secrets, PII, tokens, or raw database snapshots.
- Cache-aside with explicit invalidation after successful PostgreSQL mutation.
- Redis timeout/restart/eviction must degrade to PostgreSQL or a cache miss, never allow-all or 5xx.
- Separate cache eviction from security coordination if both are eventually used.
- Do not use Redis advisory locks for scheduler ownership while PostgreSQL session advisory locks
  already provide automatic owner-death release.

## Promotion evidence

- Cache: measured PostgreSQL read/CPU improvement and zero stale billing/authorization observations.
- Rate limit: shadow mode with zero security-relevant decision mismatches.
- Idempotency: concurrent duplicate and process-kill tests proving one charge and one provider submit.
- Realtime: actual multi-process connection evidence before introducing shared Pub/Sub.
