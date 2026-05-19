/**
 * autoLabeling.js - AI-powered auto-labeling endpoints
 * Provides the missing auto-labeling functionality that was only a schema stub in the monolith.
 */

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const { aiRateLimiter } = require('../middleware/rateLimiter');
const { parseAIJson } = require('../middleware/parseAIJson');

const JWT_SECRET = process.env.JWT_SECRET || 'ai-labeling-platform-secret-key-2024';
const MODEL = process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ai_labeling_platform',
  user: process.env.DB_USER || 'erolakarsu',
  password: process.env.DB_PASSWORD || '',
});

// Auth middleware
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

// ─── Helper: call OpenRouter ─────────────────────────────────────────────────
async function callOpenRouter(systemPrompt, userContent) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ai-labeling-platform.local',
      'X-Title': 'AI Data Labeling Platform'
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      response_format: { type: 'json_object' }
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'OpenRouter API error');
  const text = data.choices?.[0]?.message?.content || '{}';
  const parsed = parseAIJson(text);
  if (!parsed.ok) throw new Error(`AI response not parseable: ${parsed.error}`);
  return parsed.data;
}

// ─── Helper: fetch project label definitions ─────────────────────────────────
async function getProjectLabels(projectId) {
  const result = await pool.query(
    'SELECT name, description, type, options FROM labels WHERE project_id = $1',
    [projectId]
  );
  return result.rows;
}

// ─── POST /api/auto-label/run ────────────────────────────────────────────────
// Batch auto-label multiple items for a project
router.post('/run', aiRateLimiter, async (req, res) => {
  const { project_id, dataset_id, items } = req.body;

  if (!project_id || !items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'project_id and a non-empty items array are required' });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: 'Maximum 50 items per batch request' });
  }

  try {
    const labels = await getProjectLabels(project_id);
    if (labels.length === 0) {
      return res.status(400).json({ error: 'No label definitions found for this project. Add labels first.' });
    }

    const labelNames = labels.map(l => l.name);
    const systemPrompt = `You are a precise data annotation AI. Classify each input text according to the defined label set.
Available labels: ${JSON.stringify(labelNames)}
Label definitions: ${JSON.stringify(labels)}

For each item you receive, return a JSON object with:
- results: array of objects, one per item, each containing:
  - id: the item id from input
  - predicted_label: one label name from the available labels list
  - confidence: number 0-100 (your confidence in this classification)
  - reasoning: brief explanation (1-2 sentences)

Return ONLY valid JSON with no markdown.`;

    const userContent = `Classify these items:\n${JSON.stringify(items.map(i => ({ id: i.id, text: i.text })))}`;

    const aiResult = await callOpenRouter(systemPrompt, userContent);
    const results = aiResult.results || [];

    // Store each result in auto_labels
    const insertedIds = [];
    for (const item of results) {
      const sourceItem = items.find(i => i.id === item.id);
      const { rows } = await pool.query(
        `INSERT INTO auto_labels
           (name, project_id, model, input_text, predicted_label, confidence, status, ai_response)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
         RETURNING id`,
        [
          `Auto-label for item ${item.id}`,
          project_id,
          MODEL,
          sourceItem?.text || '',
          item.predicted_label,
          item.confidence,
          JSON.stringify({ reasoning: item.reasoning, dataset_id })
        ]
      );
      insertedIds.push(rows[0].id);
    }

    res.json({
      success: true,
      summary: {
        total_items: items.length,
        labeled: results.length,
        pending_review: results.length,
        model: MODEL
      },
      results: results.map((r, idx) => ({ ...r, auto_label_id: insertedIds[idx] }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/auto-label/single ─────────────────────────────────────────────
// Auto-label a single item
router.post('/single', aiRateLimiter, async (req, res) => {
  const { project_id, item_id, input_text } = req.body;

  if (!project_id || !input_text) {
    return res.status(400).json({ error: 'project_id and input_text are required' });
  }

  try {
    const labels = await getProjectLabels(project_id);
    if (labels.length === 0) {
      return res.status(400).json({ error: 'No label definitions found for this project.' });
    }

    const labelNames = labels.map(l => l.name);
    const systemPrompt = `You are a precise data annotation AI. Classify the input text according to the defined label set.
Available labels: ${JSON.stringify(labelNames)}
Label definitions: ${JSON.stringify(labels)}

Return a JSON object with:
- predicted_label: one label name from the available labels list
- confidence: number 0-100
- reasoning: brief explanation (1-2 sentences)
- alternative_labels: array of up to 2 other possible labels with their confidence scores

Return ONLY valid JSON with no markdown.`;

    const aiResult = await callOpenRouter(systemPrompt, `Classify this text: ${input_text}`);

    const { rows } = await pool.query(
      `INSERT INTO auto_labels
         (name, project_id, model, input_text, predicted_label, confidence, status, ai_response)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
       RETURNING *`,
      [
        `Auto-label for item ${item_id || 'unknown'}`,
        project_id,
        MODEL,
        input_text,
        aiResult.predicted_label,
        aiResult.confidence,
        JSON.stringify({ reasoning: aiResult.reasoning, alternative_labels: aiResult.alternative_labels, item_id })
      ]
    );

    res.json({ success: true, auto_label: rows[0], ai_details: aiResult });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/auto-label/results/:project_id ─────────────────────────────────
// List auto-label results for a project with pagination
router.get('/results/:project_id', async (req, res) => {
  const { project_id } = req.params;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const { status } = req.query;

  const conditions = ['project_id = $1'];
  const params = [project_id];

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    params.push(status);
    conditions.push(`status = $${params.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  try {
    params.push(limit, offset);
    const [dataResult, countResult] = await Promise.all([
      pool.query(
        `SELECT * FROM auto_labels ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      pool.query(`SELECT COUNT(*) FROM auto_labels ${where}`, params.slice(0, -2))
    ]);

    const total = parseInt(countResult.rows[0].count);
    res.json({
      data: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/auto-label/:id/review ──────────────────────────────────────────
// Accept or reject an auto-label
router.put('/:id/review', async (req, res) => {
  const { id } = req.params;
  const { status, correction } = req.body;

  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'status must be "approved" or "rejected"' });
  }

  if (status === 'rejected' && !correction) {
    return res.status(400).json({ error: 'correction is required when rejecting an auto-label' });
  }

  try {
    const existing = await pool.query('SELECT * FROM auto_labels WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Auto-label not found' });
    }

    const currentResponse = existing.rows[0].ai_response || {};
    const updatedResponse = {
      ...currentResponse,
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString(),
      correction: status === 'rejected' ? correction : null
    };

    const { rows } = await pool.query(
      `UPDATE auto_labels
       SET status = $1,
           predicted_label = CASE WHEN $1 = 'rejected' AND $3::text IS NOT NULL THEN $3::varchar ELSE predicted_label END,
           ai_response = $2
       WHERE id = $4
       RETURNING *`,
      [status, JSON.stringify(updatedResponse), correction || null, id]
    );

    res.json({ success: true, auto_label: rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
