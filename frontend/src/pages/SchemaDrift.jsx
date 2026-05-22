import React, { useState } from 'react';
import api from '../api';

const starter = JSON.stringify({ labels: [
  { name: 'billing_issue', baseline: 0.24, current: 0.41 },
  { name: 'cancel_request', baseline: 0.18, current: 0.09 },
  { name: 'feature_request', baseline: 0.12, current: 0.15 }
] }, null, 2);

export default function SchemaDrift() {
  const [payload, setPayload] = useState(starter);
  const [result, setResult] = useState(null);
  const run = async () => setResult((await api.post('/schema-drift/scan', JSON.parse(payload))).data);
  return (
    <div className="page">
      <h1>Label Schema Drift</h1>
      <p>Compare baseline and current label distributions to find guideline drift.</p>
      <textarea className="form-control" rows={14} value={payload} onChange={(event) => setPayload(event.target.value)} />
      <button className="btn btn-primary" onClick={run}>Scan Drift</button>
      {result && <div className="card"><h2>Max drift {result.maxDrift}</h2>{result.labels.map((label) => <p key={label.name}>{label.name}: {label.severity} · {label.action}</p>)}</div>}
    </div>
  );
}
