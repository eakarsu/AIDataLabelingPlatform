/**
 * analytics.js - Annotation analytics and AI label suggestion endpoints
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

// ─── GET /api/analytics/project/:id ──────────────────────────────────────────
// Project statistics including inter-annotator agreement estimate
router.get('/project/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const [
      projectResult,
      datasetResult,
      annotationResult,
      autoLabelResult,
      labelDistResult,
      annotatorResult
    ] = await Promise.all([
      pool.query('SELECT * FROM projects WHERE id = $1', [id]),
      pool.query(
        'SELECT COUNT(*) as total, COALESCE(SUM(item_count),0) as total_items, COALESCE(SUM(labeled_count),0) as labeled_items FROM datasets WHERE project_id = $1',
        [id]
      ),
      pool.query(
        `SELECT
           COUNT(*) as total,
           COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
           COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
           COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
           COALESCE(AVG(confidence), 0) as avg_confidence
         FROM annotations WHERE dataset_id IN (SELECT id FROM datasets WHERE project_id = $1)`,
        [id]
      ),
      pool.query(
        `SELECT COUNT(*) as total,
           COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
           COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
           COALESCE(AVG(confidence), 0) as avg_confidence
         FROM auto_labels WHERE project_id = $1`,
        [id]
      ),
      // Label distribution for inter-annotator agreement estimate
      pool.query(
        `SELECT label, COUNT(*) as count
         FROM annotations
         WHERE dataset_id IN (SELECT id FROM datasets WHERE project_id = $1)
           AND label IS NOT NULL
         GROUP BY label`,
        [id]
      ),
      // Annotator breakdown
      pool.query(
        `SELECT annotator, COUNT(*) as count,
           COALESCE(AVG(confidence), 0) as avg_confidence,
           COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved
         FROM annotations
         WHERE dataset_id IN (SELECT id FROM datasets WHERE project_id = $1)
           AND annotator IS NOT NULL
         GROUP BY annotator`,
        [id]
      )
    ]);

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];
    const datasets = datasetResult.rows[0];
    const annotations = annotationResult.rows[0];
    const autoLabels = autoLabelResult.rows[0];

    // Inter-annotator agreement estimate (simplified Cohen's Kappa approximation)
    // Based on label distribution entropy: higher agreement = lower entropy
    const labelCounts = labelDistResult.rows.map(r => parseInt(r.count));
    const totalAnnotations = labelCounts.reduce((a, b) => a + b, 0);
    let iaaEstimate = 0;
    if (totalAnnotations > 0 && labelCounts.length > 1) {
      const expectedAgreement = labelCounts.reduce((sum, count) => {
        const p = count / totalAnnotations;
        return sum + p * p;
      }, 0);
      // Simplified: use expected agreement as IAA proxy (1 = perfect uniformity across labels)
      iaaEstimate = Math.round((1 - expectedAgreement) * 100) / 100;
    }

    const totalItems = parseInt(datasets.total_items);
    const labeledItems = parseInt(datasets.labeled_items);
    const labeledPct = totalItems > 0 ? Math.round((labeledItems / totalItems) * 100) : 0;

    res.json({
      project: {
        id: project.id,
        name: project.name,
        type: project.type,
        status: project.status
      },
      stats: {
        datasets: parseInt(datasets.total),
        total_items: totalItems,
        labeled_items: labeledItems,
        labeled_pct: labeledPct,
        total_annotations: parseInt(annotations.total),
        approved_annotations: parseInt(annotations.approved),
        rejected_annotations: parseInt(annotations.rejected),
        pending_annotations: parseInt(annotations.pending),
        avg_confidence: Math.round(parseFloat(annotations.avg_confidence) * 100) / 100,
        auto_labels_total: parseInt(autoLabels.total),
        auto_labels_approved: parseInt(autoLabels.approved),
        auto_labels_rejected: parseInt(autoLabels.rejected),
        auto_label_avg_confidence: Math.round(parseFloat(autoLabels.avg_confidence) * 100) / 100,
        inter_annotator_agreement: iaaEstimate,
        label_distribution: labelDistResult.rows,
        annotators: annotatorResult.rows
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/analytics/annotator/:user_id ───────────────────────────────────
// Annotator productivity and accuracy stats
router.get('/annotator/:user_id', async (req, res) => {
  const { user_id } = req.params;
  const { days = 30 } = req.query;

  try {
    // Look up the annotator name from user id or treat user_id as annotator name
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [user_id]);
    const annotatorName = userResult.rows[0]?.name || user_id;

    const [overallResult, recentResult, labelBreakdownResult, dailyResult] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*) as total_annotations,
           COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
           COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected,
           COALESCE(AVG(confidence), 0) as avg_confidence,
           MIN(created_at) as first_annotation,
           MAX(created_at) as last_annotation
         FROM annotations WHERE annotator = $1`,
        [annotatorName]
      ),
      pool.query(
        `SELECT
           COUNT(*) as total_annotations,
           COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
           COALESCE(AVG(confidence), 0) as avg_confidence
         FROM annotations
         WHERE annotator = $1 AND created_at > NOW() - INTERVAL '${parseInt(days)} days'`,
        [annotatorName]
      ),
      pool.query(
        `SELECT label, COUNT(*) as count,
           COALESCE(AVG(confidence), 0) as avg_confidence
         FROM annotations WHERE annotator = $1 AND label IS NOT NULL
         GROUP BY label ORDER BY count DESC`,
        [annotatorName]
      ),
      pool.query(
        `SELECT DATE(created_at) as date, COUNT(*) as annotations
         FROM annotations
         WHERE annotator = $1 AND created_at > NOW() - INTERVAL '${parseInt(days)} days'
         GROUP BY DATE(created_at)
         ORDER BY date DESC`,
        [annotatorName]
      )
    ]);

    const overall = overallResult.rows[0];
    const recent = recentResult.rows[0];
    const totalAnnotations = parseInt(overall.total_annotations);
    const approvedAnnotations = parseInt(overall.approved);
    const accuracyPct = totalAnnotations > 0
      ? Math.round((approvedAnnotations / totalAnnotations) * 100)
      : 0;

    const recentTotal = parseInt(recent.total_annotations);
    const dailyRows = dailyResult.rows;
    const avgPerDay = dailyRows.length > 0
      ? Math.round(recentTotal / Math.min(dailyRows.length, parseInt(days)))
      : 0;

    res.json({
      annotator: annotatorName,
      user_id,
      overall: {
        total_annotations: totalAnnotations,
        approved: approvedAnnotations,
        rejected: parseInt(overall.rejected),
        accuracy_pct: accuracyPct,
        avg_confidence: Math.round(parseFloat(overall.avg_confidence) * 100) / 100,
        first_annotation: overall.first_annotation,
        last_annotation: overall.last_annotation
      },
      recent: {
        period_days: parseInt(days),
        total_annotations: recentTotal,
        approved: parseInt(recent.approved),
        avg_confidence: Math.round(parseFloat(recent.avg_confidence) * 100) / 100,
        avg_per_day: avgPerDay
      },
      label_breakdown: labelBreakdownResult.rows,
      daily_activity: dailyRows
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/analytics/label-suggestions ───────────────────────────────────
// Ask AI to suggest appropriate label for ambiguous text
router.post('/label-suggestions', aiRateLimiter, async (req, res) => {
  const { project_id, ambiguous_text } = req.body;

  if (!project_id || !ambiguous_text) {
    return res.status(400).json({ error: 'project_id and ambiguous_text are required' });
  }

  try {
    const labelsResult = await pool.query(
      'SELECT name, description, type, options FROM labels WHERE project_id = $1',
      [project_id]
    );

    if (labelsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No labels defined for this project' });
    }

    const labels = labelsResult.rows;

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
          {
            role: 'system',
            content: `You are an expert data annotation assistant helping resolve ambiguous classification cases.
Available labels: ${JSON.stringify(labels.map(l => l.name))}
Label definitions: ${JSON.stringify(labels)}

Return a JSON object with:
- primary_suggestion: object { label, confidence (0-100), reasoning (2-3 sentences explaining why) }
- alternative_suggestions: array of up to 2 objects { label, confidence, reasoning }
- ambiguity_analysis: explanation of what makes this text ambiguous
- annotation_tips: practical tips for how to handle similar cases consistently

Return ONLY valid JSON, no markdown.`
          },
          {
            role: 'user',
            content: `Please suggest the appropriate label for this ambiguous text:\n\n"${ambiguous_text}"`
          }
        ],
        response_format: { type: 'json_object' }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message || 'OpenRouter API error');

    const rawContent = data.choices?.[0]?.message?.content || '{}';
    const parsed = parseAIJson(rawContent);
    if (!parsed.ok) {
      return res.status(422).json({ error: 'AI returned non-parseable response', raw: rawContent });
    }
    const result = parsed.data;

    res.json({
      success: true,
      project_id,
      input_text: ambiguous_text,
      suggestions: result,
      model: MODEL
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
