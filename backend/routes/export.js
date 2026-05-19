/**
 * export.js - Project annotation export endpoint (JSON and CSV)
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ai-labeling-platform-secret-key-2024';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ai_labeling_platform',
  user: process.env.DB_USER || 'erolakarsu',
  password: process.env.DB_PASSWORD || '',
});

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

router.use(authMiddleware);

// ─── Helper: convert array of objects to CSV ─────────────────────────────────
function toCSV(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const csvRows = [
    headers.join(','),
    ...rows.map(row =>
      headers.map(h => {
        const val = row[h];
        if (val === null || val === undefined) return '';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        if (str.includes(',') || str.includes('\n') || str.includes('"')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    )
  ];
  return csvRows.join('\n');
}

// ─── GET /api/export/project/:id ─────────────────────────────────────────────
// Export all annotations for a project as JSON or CSV
router.get('/project/:id', async (req, res) => {
  const { id } = req.params;
  const format = (req.query.format || 'json').toLowerCase();
  const includeAutoLabels = req.query.include_auto_labels !== 'false';
  const statusFilter = req.query.status; // optional filter: pending, approved, rejected

  if (!['json', 'csv'].includes(format)) {
    return res.status(400).json({ error: 'format must be "json" or "csv"' });
  }

  try {
    // Verify project exists
    const projectResult = await pool.query('SELECT * FROM projects WHERE id = $1', [id]);
    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const project = projectResult.rows[0];

    // Build annotation query
    const annotationConditions = [
      'a.dataset_id IN (SELECT id FROM datasets WHERE project_id = $1)'
    ];
    const params = [id];

    if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
      params.push(statusFilter);
      annotationConditions.push(`a.status = $${params.length}`);
    }

    const annotationsResult = await pool.query(
      `SELECT
         a.id,
         a.data_item as text,
         a.label,
         a.confidence,
         a.annotator,
         a.method,
         a.status,
         a.metadata,
         a.created_at,
         d.name as dataset_name
       FROM annotations a
       LEFT JOIN datasets d ON d.id = a.dataset_id
       WHERE ${annotationConditions.join(' AND ')}
       ORDER BY a.created_at`,
      params
    );

    let autoLabelsRows = [];
    if (includeAutoLabels) {
      const alConditions = ['project_id = $1'];
      const alParams = [id];

      if (statusFilter && ['pending', 'approved', 'rejected'].includes(statusFilter)) {
        alParams.push(statusFilter);
        alConditions.push(`status = $${alParams.length}`);
      }

      const autoLabelsResult = await pool.query(
        `SELECT
           id,
           input_text as text,
           predicted_label as label,
           confidence,
           'AI' as annotator,
           'auto' as method,
           status,
           ai_response as metadata,
           created_at,
           'auto_label' as source
         FROM auto_labels
         WHERE ${alConditions.join(' AND ')}
         ORDER BY created_at`,
        alParams
      );
      autoLabelsRows = autoLabelsResult.rows;
    }

    const annotations = annotationsResult.rows.map(r => ({ ...r, source: 'manual' }));
    const allData = [...annotations, ...autoLabelsRows];

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${project.name.replace(/\s+/g, '_')}_export_${timestamp}`;

    if (format === 'csv') {
      const csv = toCSV(allData);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csv);
    }

    // JSON format
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
    res.json({
      export_metadata: {
        project_id: parseInt(id),
        project_name: project.name,
        project_type: project.type,
        exported_at: new Date().toISOString(),
        total_annotations: annotations.length,
        total_auto_labels: autoLabelsRows.length,
        format: 'json',
        filters: { status: statusFilter || 'all', include_auto_labels: includeAutoLabels }
      },
      annotations,
      auto_labels: includeAutoLabels ? autoLabelsRows : []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
