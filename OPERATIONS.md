# Governed operations

Ordinary startup is deliberately non-destructive: it does not install packages, create or migrate a database, seed demo records, start PostgreSQL, or kill processes. Use `scripts/bootstrap.sh`, then apply the existing baseline schema as documented by the project, and run `scripts/migrate.sh`. Demo data is opt-in through `CONFIRM_DEMO_SEED=yes scripts/seed-demo.sh` and is forbidden in production.

The `/api/governed-workflows` boundary is the authoritative path for high-impact work. It requires tenant-bearing JWTs, allowlisted roles, idempotency keys, optimistic versions, hashed evidence, independent approvals, append-only audit events, safety holds, and vault references instead of raw provider credentials. External jobs remain quarantined unless `ENABLE_EXTERNAL_WORKERS=true`; a separately authenticated worker must implement provider-specific contracts and record failures.

Model responses and generated gap routes are not authoritative. AI output may be attached as versioned evidence, but cannot transition a case, approve an action, contact a person, operate equipment, accuse a subject, or execute a database change.

Local verification covers policy contracts, syntax, frontend builds, and migration presence. Production readiness still requires configured providers, representative datasets, disaster/recovery exercises, accessibility and security review, and the applicable licensed/professional validation.

