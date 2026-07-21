const express = require('express');
const crypto = require('crypto');
const auth = require('../middleware/auth');
const { POLICY, validateCreate, authorizeTransition, validateIntegration, redactSensitive } = require('../domain/governedWorkflow');

module.exports = function createGovernedWorkflowRouter(pool) {
  const router = express.Router();
router.use(auth);

function identity(req, res) {
  const user = req.user && req.user.user ? req.user.user : req.user;
  if (!user || !user.id || !user.role || !user.tenant_id) {
    res.status(403).json({ error: 'tenant-scoped identity and role required; re-authenticate after migration' });
    return null;
  }
  return { id: String(user.id), role: String(user.role), tenantId: String(user.tenant_id) };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function hash(value) {
  return crypto.createHash('sha256').update(stable(value)).digest('hex');
}
function fail(res, status, error, details) {
  return res.status(status).json({ error, details });
}

router.get('/policy', (req, res) => res.json(POLICY));

router.get('/cases', async (req, res, next) => {
  const actor = identity(req, res); if (!actor) return;
  try {
    const values = [actor.tenantId];
    let where = 'tenant_id = $1';
    if (req.query.state) { values.push(req.query.state); where += ` AND state = $${values.length}`; }
    const result = await pool.query(
      `SELECT id, business_key, state, payload, safety_flags, version, created_by, created_at, updated_at
       FROM governed_cases WHERE ${where} ORDER BY updated_at DESC LIMIT 200`, values);
    res.json(result.rows.map((row) => ({ ...row, payload: redactSensitive(row.payload) })));
  } catch (error) { next(error); }
});

router.post('/cases', async (req, res, next) => {
  const actor = identity(req, res); if (!actor) return;
  const validation = validateCreate(req.body);
  if (!validation.ok) return fail(res, 422, 'invalid workflow case', validation.errors);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prior = await client.query(
      'SELECT detail FROM governed_events WHERE tenant_id = $1 AND idempotency_key = $2',
      [actor.tenantId, req.body.idempotencyKey]);
    if (prior.rows.length) {
      await client.query('ROLLBACK');
      return res.status(200).json({ idempotentReplay: true, ...prior.rows[0].detail });
    }
    const payload = { ...req.body };
    delete payload.idempotencyKey;
    const businessKey = req.body.businessKey || POLICY.required.map((key) => req.body[key]).join(':');
    const created = await client.query(
      `INSERT INTO governed_cases
       (tenant_id, case_kind, business_key, state, payload, safety_flags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [actor.tenantId, POLICY.caseKind, businessKey, POLICY.initial,
       JSON.stringify(payload), JSON.stringify(req.body.safetyFlags || []), actor.id]);
    await client.query(
      `INSERT INTO governed_events
       (tenant_id, case_id, idempotency_key, event_type, to_state, actor_id, actor_role, request_hash, detail)
       VALUES ($1,$2,$3,'case_created',$4,$5,$6,$7,$8)`,
      [actor.tenantId, created.rows[0].id, req.body.idempotencyKey, POLICY.initial,
       actor.id, actor.role, hash(req.body), JSON.stringify({ caseId: created.rows[0].id })]);
    await client.query('COMMIT');
    res.status(201).json(created.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') return fail(res, 409, 'business key or idempotency key already exists');
    next(error);
  } finally { client.release(); }
});

router.post('/cases/:id/evidence', async (req, res, next) => {
  const actor = identity(req, res); if (!actor) return;
  const { kind, sha256, storageRef, schemaVersion, metadata = {} } = req.body;
  if (!kind || !/^[a-f0-9]{64}$/i.test(sha256 || '') || !storageRef) {
    return fail(res, 422, 'kind, sha256, and storageRef are required');
  }
  if (/^[a-z]+:\/\/[^/]*:[^/@]*@/i.test(storageRef)) return fail(res, 422, 'storageRef must not contain credentials');
  try {
    const found = await pool.query('SELECT id FROM governed_cases WHERE id = $1 AND tenant_id = $2', [req.params.id, actor.tenantId]);
    if (!found.rows.length) return fail(res, 404, 'case not found');
    const result = await pool.query(
      `INSERT INTO governed_evidence
       (tenant_id, case_id, kind, sha256, storage_ref, detector_or_schema_version, metadata, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (tenant_id, case_id, kind, sha256) DO UPDATE SET metadata = governed_evidence.metadata
       RETURNING *`,
      [actor.tenantId, req.params.id, kind, sha256, storageRef, schemaVersion || null,
       JSON.stringify(redactSensitive(metadata)), actor.id]);
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

router.post('/cases/:id/approvals', async (req, res, next) => {
  const actor = identity(req, res); if (!actor) return;
  if (!POLICY.roles.includes(actor.role) || !req.body.targetState || !['approved','rejected'].includes(req.body.decision)) {
    return fail(res, 422, 'valid targetState and decision are required');
  }
  if (typeof req.body.reason !== 'string' || req.body.reason.trim().length < 8) return fail(res, 422, 'a substantive reason is required');
  try {
    const result = await pool.query(
      `INSERT INTO governed_approvals
       (tenant_id, case_id, target_state, approver_id, approver_role, reason, decision)
       SELECT $1, id, $3, $4, $5, $6, $7 FROM governed_cases WHERE id = $2 AND tenant_id = $1
       ON CONFLICT (tenant_id, case_id, target_state, approver_id)
       DO UPDATE SET reason = EXCLUDED.reason, decision = EXCLUDED.decision, decided_at = NOW()
       RETURNING *`,
      [actor.tenantId, req.params.id, req.body.targetState, actor.id, actor.role, req.body.reason.trim(), req.body.decision]);
    if (!result.rows.length) return fail(res, 404, 'case not found');
    res.status(201).json(result.rows[0]);
  } catch (error) { next(error); }
});

router.post('/cases/:id/transitions', async (req, res, next) => {
  const actor = identity(req, res); if (!actor) return;
  if (!req.body.idempotencyKey || !Number.isInteger(req.body.expectedVersion)) {
    return fail(res, 422, 'idempotencyKey and integer expectedVersion are required');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const replay = await client.query('SELECT detail FROM governed_events WHERE tenant_id=$1 AND idempotency_key=$2',
      [actor.tenantId, req.body.idempotencyKey]);
    if (replay.rows.length) { await client.query('ROLLBACK'); return res.json({ idempotentReplay: true, ...replay.rows[0].detail }); }
    const current = await client.query('SELECT * FROM governed_cases WHERE id=$1 AND tenant_id=$2 FOR UPDATE',
      [req.params.id, actor.tenantId]);
    if (!current.rows.length) { await client.query('ROLLBACK'); return fail(res, 404, 'case not found'); }
    const record = current.rows[0];
    if (record.version !== req.body.expectedVersion) { await client.query('ROLLBACK'); return fail(res, 409, 'version conflict'); }
    const evidence = await client.query('SELECT kind, sha256 FROM governed_evidence WHERE case_id=$1 AND tenant_id=$2',
      [req.params.id, actor.tenantId]);
    const approval = await client.query(
      `SELECT approver_id AS "actorId", approver_role AS role, reason FROM governed_approvals
       WHERE case_id=$1 AND tenant_id=$2 AND target_state=$3 AND decision='approved'
       ORDER BY decided_at DESC LIMIT 1`, [req.params.id, actor.tenantId, req.body.to]);
    const decision = authorizeTransition({
      record, to: req.body.to, actor, evidence: evidence.rows,
      approval: approval.rows[0], flags: record.safety_flags || [],
    });
    if (!decision.ok) { await client.query('ROLLBACK'); return fail(res, 422, 'transition blocked', decision.errors); }
    const updated = await client.query(
      'UPDATE governed_cases SET state=$1, version=version+1, updated_at=NOW() WHERE id=$2 AND tenant_id=$3 RETURNING *',
      [req.body.to, req.params.id, actor.tenantId]);
    await client.query(
      `INSERT INTO governed_events
       (tenant_id,case_id,idempotency_key,event_type,from_state,to_state,actor_id,actor_role,request_hash,detail)
       VALUES ($1,$2,$3,'state_transition',$4,$5,$6,$7,$8,$9)`,
      [actor.tenantId, req.params.id, req.body.idempotencyKey, record.state, req.body.to,
       actor.id, actor.role, hash(req.body), JSON.stringify({ caseId: record.id, version: updated.rows[0].version })]);
    await client.query('COMMIT');
    res.json(updated.rows[0]);
  } catch (error) { await client.query('ROLLBACK'); next(error); } finally { client.release(); }
});

router.post('/integrations/runs', async (req, res, next) => {
  const actor = identity(req, res); if (!actor) return;
  const validation = validateIntegration(req.body);
  if (!validation.ok) return fail(res, 422, 'invalid integration request', validation.errors);
  try {
    const status = process.env.ENABLE_EXTERNAL_WORKERS === 'true' ? 'queued' : 'quarantined';
    const result = await pool.query(
      `INSERT INTO governed_integration_runs
       (tenant_id,connector,operation,idempotency_key,credential_ref,status,started_by,failure_code,failure_detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (tenant_id,connector,idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key
       RETURNING *`,
      [actor.tenantId, req.body.connector, req.body.operation, req.body.idempotencyKey,
       req.body.credentialRef, status, actor.id,
       status === 'quarantined' ? 'WORKER_DISABLED' : null,
       status === 'quarantined' ? 'Enable an authenticated external worker explicitly; the API never performs provider side effects.' : null]);
    res.status(202).json(result.rows[0]);
  } catch (error) { next(error); }
});

router.get('/audit', async (req, res, next) => {
  const actor = identity(req, res); if (!actor) return;
  if (!['admin','auditor','manager','director','compliance','dba','evidence_custodian','quality_lead'].includes(actor.role)) {
    return fail(res, 403, 'audit access requires an oversight role');
  }
  try {
    const result = await pool.query(
      `SELECT id,case_id,idempotency_key,event_type,from_state,to_state,actor_id,actor_role,detail,created_at
       FROM governed_events WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 500`, [actor.tenantId]);
    res.json(result.rows.map(redactSensitive));
  } catch (error) { next(error); }
});

  return router;
};
