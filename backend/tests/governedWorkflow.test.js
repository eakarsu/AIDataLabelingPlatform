const test = require('node:test');
const assert = require('node:assert/strict');
const { POLICY, validateCreate, authorizeTransition, validateIntegration, redactSensitive } = require('../domain/governedWorkflow');

const valid = {
  "idempotencyKey": "request-0001",
  "datasetKey": "datasetKey-value",
  "datasetVersion": "datasetVersion-value",
  "ontologyVersion": "ontologyVersion-value",
  "sourceChecksum": "sourceChecksum-value"
};

test('create contract rejects tenant and model-controlled decisions', () => {
  assert.equal(validateCreate(valid).ok, true);
  assert.equal(validateCreate({ ...valid, tenantId: 'other', aiDecision: 'approve' }).ok, false);
});

test('state machine blocks skipped states and safety holds', () => {
  const record = { state: POLICY.initial };
  const actor = { id: 'actor-1', role: POLICY.roles[0] };
  assert.equal(authorizeTransition({ record, to: 'closed', actor }).ok, false);
  const result = authorizeTransition({
    record,
    to: 'versioned',
    actor,
    evidence: [{"kind":"dataset_manifest"}],
    flags: [POLICY.stopFlags[0]],
    approval: undefined,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /safety hold/);
});

test('integration contract accepts vault references and rejects raw secrets', () => {
  const base = { connector: POLICY.connectors[0], operation: 'verify', credentialRef: 'vault://team/credential', idempotencyKey: 'sync-00001' };
  assert.equal(validateIntegration(base).ok, true);
  assert.equal(validateIntegration({ ...base, token: 'plaintext' }).ok, false);
});

test('audit redaction removes identity and credential material', () => {
  assert.deepEqual(redactSensitive({ token: 'x', nested: { patientName: 'x', safe: 2 } }), {
    token: '[REDACTED]', nested: { patientName: '[REDACTED]', safe: 2 },
  });
});

