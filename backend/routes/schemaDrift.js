const express = require('express');
const router = express.Router();

router.post('/scan', (req, res) => {
  const labels = Array.isArray(req.body?.labels) ? req.body.labels : [
    { name: 'billing_issue', baseline: 0.24, current: 0.41 },
    { name: 'cancel_request', baseline: 0.18, current: 0.09 },
    { name: 'feature_request', baseline: 0.12, current: 0.15 },
  ];
  const rows = labels.map((label) => {
    const drift = Math.abs(Number(label.current || 0) - Number(label.baseline || 0));
    return {
      name: label.name,
      drift: Number(drift.toFixed(3)),
      severity: drift >= 0.18 ? 'high' : drift >= 0.08 ? 'medium' : 'low',
      action: drift >= 0.08 ? 'Review guidelines, examples, and annotator calibration for this label.' : 'No schema action needed.',
    };
  }).sort((a, b) => b.drift - a.drift);
  res.json({
    maxDrift: rows[0]?.drift || 0,
    reviewCount: rows.filter((row) => row.severity !== 'low').length,
    labels: rows,
  });
});

module.exports = router;
