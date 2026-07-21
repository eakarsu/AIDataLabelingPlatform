-- Additive migration: tenant-scoped, approval-gated labeling workflow.
-- Apply explicitly with scripts/migrate.sh; ordinary startup never mutates schema.
BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id VARCHAR(128);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(64);
UPDATE users SET tenant_id = 'legacy-single-tenant' WHERE tenant_id IS NULL;
UPDATE users SET role = 'observer' WHERE role IS NULL;
ALTER TABLE users ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE users ALTER COLUMN role SET NOT NULL;
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);

CREATE TABLE IF NOT EXISTS governed_cases (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(128) NOT NULL,
  case_kind VARCHAR(64) NOT NULL CHECK (case_kind = 'labeling'),
  business_key VARCHAR(160) NOT NULL,
  state VARCHAR(64) NOT NULL CHECK (state IN ('draft', 'versioned', 'assigned', 'annotated', 'consensus_pending', 'review_pending', 'adjudicated', 'export_ready', 'exported')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  safety_flags JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(safety_flags) = 'array'),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, business_key)
);
CREATE INDEX IF NOT EXISTS governed_cases_queue_idx ON governed_cases (tenant_id, state, updated_at);

CREATE TABLE IF NOT EXISTS governed_evidence (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(128) NOT NULL,
  case_id BIGINT NOT NULL REFERENCES governed_cases(id) ON DELETE RESTRICT,
  kind VARCHAR(80) NOT NULL,
  sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[0-9a-fA-F]{64}$'),
  storage_ref TEXT NOT NULL CHECK (storage_ref !~* '^(https?://)?[^/]*:[^/@]*@'),
  detector_or_schema_version VARCHAR(160),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_by VARCHAR(128) NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, case_id, kind, sha256)
);

CREATE TABLE IF NOT EXISTS governed_approvals (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(128) NOT NULL,
  case_id BIGINT NOT NULL REFERENCES governed_cases(id) ON DELETE RESTRICT,
  target_state VARCHAR(64) NOT NULL,
  approver_id VARCHAR(128) NOT NULL,
  approver_role VARCHAR(64) NOT NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 8),
  decision VARCHAR(16) NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, case_id, target_state, approver_id)
);

CREATE TABLE IF NOT EXISTS governed_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(128) NOT NULL,
  case_id BIGINT REFERENCES governed_cases(id) ON DELETE RESTRICT,
  idempotency_key VARCHAR(128) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  from_state VARCHAR(64),
  to_state VARCHAR(64),
  actor_id VARCHAR(128) NOT NULL,
  actor_role VARCHAR(64) NOT NULL,
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[0-9a-fA-F]{64}$'),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS governed_events_case_idx ON governed_events (tenant_id, case_id, created_at);

CREATE TABLE IF NOT EXISTS governed_integration_runs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(128) NOT NULL,
  connector VARCHAR(64) NOT NULL CHECK (connector IN ('object_storage', 'workforce_identity', 'labeling_tool', 'model_queue', 'dataset_registry')),
  operation VARCHAR(16) NOT NULL CHECK (operation IN ('pull', 'push', 'verify')),
  idempotency_key VARCHAR(128) NOT NULL,
  credential_ref TEXT NOT NULL CHECK (credential_ref LIKE 'vault://%'),
  status VARCHAR(24) NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'quarantined')),
  external_cursor TEXT,
  records_seen INTEGER NOT NULL DEFAULT 0 CHECK (records_seen >= 0),
  records_applied INTEGER NOT NULL DEFAULT 0 CHECK (records_applied >= 0),
  failure_code VARCHAR(80),
  failure_detail TEXT,
  started_by VARCHAR(128) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (tenant_id, connector, idempotency_key)
);

CREATE TABLE IF NOT EXISTS governed_quality_observations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id VARCHAR(128) NOT NULL,
  case_id BIGINT REFERENCES governed_cases(id) ON DELETE RESTRICT,
  metric_name VARCHAR(80) NOT NULL CHECK (metric_name IN ('inter_annotator_agreement', 'gold_set_accuracy', 'drift', 'throughput', 'leakage', 'export_reproducibility')),
  metric_value NUMERIC NOT NULL,
  sample_size INTEGER NOT NULL CHECK (sample_size > 0),
  cohort JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluator_version VARCHAR(160) NOT NULL,
  evidence_sha256 CHAR(64) NOT NULL CHECK (evidence_sha256 ~ '^[0-9a-fA-F]{64}$'),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS governed_quality_trend_idx ON governed_quality_observations (tenant_id, metric_name, observed_at);

CREATE OR REPLACE FUNCTION reject_governed_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'governed_events is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS governed_events_append_only ON governed_events;
CREATE TRIGGER governed_events_append_only
BEFORE UPDATE OR DELETE ON governed_events
FOR EACH ROW EXECUTE FUNCTION reject_governed_event_mutation();

COMMIT;
