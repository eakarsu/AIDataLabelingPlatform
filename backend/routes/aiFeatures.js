/**
 * aiFeatures.js — Custom non-CRUD AI features for the data labeling platform.
 *
 * Endpoints added (audit "Proposed New Features"):
 *   POST /api/ai-features/active-learning/:project_id  — rank unlabeled items by predicted uncertainty
 *   POST /api/ai-features/conflict-resolver            — detect annotator disagreements, propose resolution
 *   POST /api/ai-features/bias-scan/:project_id        — analyze annotations for systematic bias
 *   POST /api/ai-features/qa-sample/:project_id        — pull random sample of completed annotations,
 *                                                         AI grades them, flags issues for rework
 *
 * All AI-driven endpoints:
 *   - Use the shared aiRateLimiter (20/hr per user).
 *   - Use parseAIJson 3-strategy parser.
 *   - Persist results into ai_results JSONB table for audit/replay.
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

// Ensure ai_results table exists for AI output persistence.
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ai_results (
        id SERIAL PRIMARY KEY,
        feature VARCHAR(100) NOT NULL,
        project_id INTEGER,
        user_id INTEGER,
        input JSONB DEFAULT '{}',
        output JSONB DEFAULT '{}',
        model VARCHAR(255),
        success BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS ai_results_feature_idx ON ai_results(feature);
      CREATE INDEX IF NOT EXISTS ai_results_project_idx ON ai_results(project_id);
    `);
  } catch (err) {
    console.error('ai_results table init error:', err.message);
  }
})();

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

router.use(authMiddleware);

async function callAI(systemPrompt, userMessage) {
  if (!process.env.OPENROUTER_API_KEY) {
    const e = new Error('AI service not configured (OPENROUTER_API_KEY missing)');
    e.statusCode = 503;
    throw e;
  }
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ai-labeling-platform.local',
      'X-Title': 'AI Data Labeling Platform',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'OpenRouter API error');
  return data.choices?.[0]?.message?.content || '{}';
}

async function persistAIResult(feature, projectId, userId, input, output, success = true) {
  try {
    await pool.query(
      `INSERT INTO ai_results (feature, project_id, user_id, input, output, model, success)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [feature, projectId || null, userId || null, JSON.stringify(input), JSON.stringify(output), MODEL, success]
    );
  } catch (err) {
    console.error('persistAIResult error:', err.message);
  }
}

// ─── POST /api/ai-features/active-learning/:project_id ───────────────────────
// Identify items most worth labeling next based on past low-confidence predictions.
router.post('/active-learning/:project_id', aiRateLimiter, async (req, res) => {
  const { project_id } = req.params;

  try {
    // Pull recent low-confidence auto labels (uncertainty proxy)
    const lowConf = await pool.query(
      `SELECT id, input_text, predicted_label, confidence
         FROM auto_labels
        WHERE project_id = $1 AND confidence IS NOT NULL
        ORDER BY confidence ASC, created_at DESC LIMIT 20`,
      [project_id]
    );

    const labels = await pool.query(
      'SELECT name, description FROM labels WHERE project_id = $1',
      [project_id]
    );

    if (lowConf.rows.length === 0) {
      return res.json({ project_id, message: 'No low-confidence items to prioritize', items: [] });
    }

    const systemPrompt = `You are an active-learning advisor for a data labeling team. Your job is to rank the
provided items by how much human labeling effort would improve the model. Consider prediction confidence,
text ambiguity, and class balance. Respond with ONLY valid JSON in the form:
{
  "ranked_items": [
    { "id": <id>, "priority_score": <0-100>, "reason": "<short>" }
  ],
  "summary": "<2 sentence overview>",
  "recommended_batch_size": <int>
}`;
    const userMessage = `Project labels: ${JSON.stringify(labels.rows)}\n\nLow-confidence items:\n${JSON.stringify(lowConf.rows)}`;

    const raw = await callAI(systemPrompt, userMessage);
    const parsed = parseAIJson(raw);

    if (!parsed.ok) {
      await persistAIResult('active_learning', project_id, req.user.id, { project_id }, { raw }, false);
      return res.status(422).json({ error: 'AI returned non-parseable response', raw });
    }

    await persistAIResult('active_learning', project_id, req.user.id, { project_id }, parsed.data);
    res.json({ success: true, project_id, ...parsed.data, model: MODEL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/ai-features/conflict-resolver ─────────────────────────────────
// Body: { project_id, data_item, annotations: [{annotator, label, confidence}] }
router.post('/conflict-resolver', aiRateLimiter, async (req, res) => {
  const { project_id, data_item, annotations } = req.body;
  if (!project_id || !data_item || !Array.isArray(annotations) || annotations.length < 2) {
    return res.status(400).json({ error: 'project_id, data_item, and >= 2 annotations are required' });
  }

  try {
    const labels = await pool.query(
      'SELECT name, description FROM labels WHERE project_id = $1',
      [project_id]
    );

    const systemPrompt = `You are a senior data annotation reviewer. Multiple annotators disagree on the same
item. Decide the best label, give a 1-2 sentence rationale, and propose a clarification to add to the
annotation guidelines so future annotators agree. Respond with ONLY valid JSON:
{
  "recommended_label": "<label>",
  "confidence": <0-100>,
  "rationale": "<text>",
  "guideline_clarification": "<text>",
  "annotator_votes": [{ "annotator": "<name>", "vote": "<label>", "agreement_with_recommendation": <bool> }]
}`;
    const userMessage = `Available labels: ${JSON.stringify(labels.rows.map((l) => l.name))}
Item: ${data_item}
Annotations: ${JSON.stringify(annotations)}`;

    const raw = await callAI(systemPrompt, userMessage);
    const parsed = parseAIJson(raw);

    if (!parsed.ok) {
      await persistAIResult('conflict_resolver', project_id, req.user.id, req.body, { raw }, false);
      return res.status(422).json({ error: 'AI returned non-parseable response', raw });
    }

    await persistAIResult('conflict_resolver', project_id, req.user.id, req.body, parsed.data);
    res.json({ success: true, ...parsed.data, model: MODEL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/ai-features/bias-scan/:project_id ─────────────────────────────
// Surface systematic bias across annotators or label categories.
router.post('/bias-scan/:project_id', aiRateLimiter, async (req, res) => {
  const { project_id } = req.params;

  try {
    const annotatorStats = await pool.query(
      `SELECT annotator, label, COUNT(*) AS n
         FROM annotations
        WHERE dataset_id IN (SELECT id FROM datasets WHERE project_id = $1)
        GROUP BY annotator, label
        ORDER BY annotator, label`,
      [project_id]
    );

    if (annotatorStats.rows.length === 0) {
      return res.json({ project_id, message: 'Not enough annotation data for bias scan', findings: [] });
    }

    const systemPrompt = `You are a fairness/bias auditor for ML training data. Look at per-annotator label
distributions; flag any annotator that systematically over- or under-labels a category vs the team baseline,
and any class imbalance that may bias the trained model. Respond with ONLY valid JSON:
{
  "findings": [
    { "type": "<annotator|class>", "severity": "<low|medium|high>", "description": "<text>", "recommendation": "<text>" }
  ],
  "summary": "<2-3 sentences>",
  "overall_bias_score": <0-100>
}`;
    const userMessage = `Per-annotator label counts: ${JSON.stringify(annotatorStats.rows)}`;

    const raw = await callAI(systemPrompt, userMessage);
    const parsed = parseAIJson(raw);

    if (!parsed.ok) {
      await persistAIResult('bias_scan', project_id, req.user.id, { project_id }, { raw }, false);
      return res.status(422).json({ error: 'AI returned non-parseable response', raw });
    }

    await persistAIResult('bias_scan', project_id, req.user.id, { project_id }, parsed.data);
    res.json({ success: true, project_id, ...parsed.data, model: MODEL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/ai-features/qa-sample/:project_id ─────────────────────────────
// Pull a random sample of approved annotations and have AI grade them.
router.post('/qa-sample/:project_id', aiRateLimiter, async (req, res) => {
  const { project_id } = req.params;
  const sampleSize = Math.min(20, Math.max(3, parseInt(req.body.sample_size || 10)));

  try {
    const sample = await pool.query(
      `SELECT id, data_item, label, annotator, confidence
         FROM annotations
        WHERE dataset_id IN (SELECT id FROM datasets WHERE project_id = $1) AND status = 'approved'
        ORDER BY random()
        LIMIT $2`,
      [project_id, sampleSize]
    );

    if (sample.rows.length === 0) {
      return res.json({ project_id, message: 'No approved annotations to sample', items: [] });
    }

    const labels = await pool.query(
      'SELECT name, description FROM labels WHERE project_id = $1',
      [project_id]
    );

    const systemPrompt = `You are a senior QA reviewer. Re-evaluate each labeled item; mark "agree" or
"disagree" with the existing label and explain. Respond with ONLY valid JSON:
{
  "items": [
    { "id": <id>, "agree": <bool>, "suggested_label": "<label>", "reason": "<text>" }
  ],
  "agreement_rate": <0-100>,
  "rework_recommended": <bool>,
  "summary": "<2-3 sentences>"
}`;
    const userMessage = `Available labels: ${JSON.stringify(labels.rows.map((l) => l.name))}
Sample: ${JSON.stringify(sample.rows)}`;

    const raw = await callAI(systemPrompt, userMessage);
    const parsed = parseAIJson(raw);

    if (!parsed.ok) {
      await persistAIResult('qa_sample', project_id, req.user.id, { project_id, sampleSize }, { raw }, false);
      return res.status(422).json({ error: 'AI returned non-parseable response', raw });
    }

    await persistAIResult('qa_sample', project_id, req.user.id, { project_id, sampleSize }, parsed.data);
    res.json({ success: true, project_id, sample_size: sample.rows.length, ...parsed.data, model: MODEL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ai-features/results ────────────────────────────────────────────
// Paginated list of past AI runs (for audit/replay).
router.get('/results', async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];
  if (req.query.feature) {
    params.push(req.query.feature);
    conditions.push(`feature = $${params.length}`);
  }
  if (req.query.project_id) {
    params.push(req.query.project_id);
    conditions.push(`project_id = $${params.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  try {
    params.push(limit, offset);
    const [data, count] = await Promise.all([
      pool.query(
        `SELECT id, feature, project_id, user_id, success, model, created_at, output
           FROM ai_results ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      ),
      pool.query(`SELECT COUNT(*) FROM ai_results ${where}`, params.slice(0, -2)),
    ]);

    const total = parseInt(count.rows[0].count);
    res.json({
      data: data.rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/ai-features/recommend-label-strategy ───────────────────────────
// Given a dataset summary, recommend a labeling strategy.
router.post('/recommend-label-strategy', aiRateLimiter, async (req, res) => {
  const { project_id, dataset_summary, label_count, sample_size, modality } = req.body || {};
  if (!dataset_summary && !project_id) {
    return res.status(400).json({ error: 'project_id or dataset_summary is required' });
  }

  let labels = { rows: [] };
  let pidNumeric = null;
  if (project_id) {
    pidNumeric = parseInt(project_id, 10) || null;
    try {
      labels = await pool.query(
        'SELECT name, description FROM labels WHERE project_id = $1',
        [pidNumeric]
      );
    } catch (_) { /* fallback to body summary */ }
  }

  const systemPrompt = `You are a senior labeling-strategy advisor. Recommend a concrete labeling strategy
(annotator selection, batch size, review/QA cadence, gold-set ratio, ambiguity escalation policy) tailored
to the dataset and label space described. Respond with ONLY valid JSON:
{
  "strategy_summary": "<2-3 sentences>",
  "annotator_pool_recommendation": "<text>",
  "batch_size": <int>,
  "review_ratio_pct": <0-100>,
  "gold_set_ratio_pct": <0-100>,
  "qa_cadence_days": <int>,
  "ambiguity_escalation": "<text>",
  "tooling_recommendations": ["<text>"],
  "estimated_throughput_per_day": <int>
}`;
  const userMessage = `Dataset summary: ${dataset_summary || 'n/a'}
Project labels (from DB): ${JSON.stringify(labels.rows)}
Declared label count: ${label_count ?? 'unknown'}
Sample size to label: ${sample_size ?? 'unknown'}
Modality: ${modality || 'unknown (text/image/audio/video)'}`;

  try {
    const raw = await callAI(systemPrompt, userMessage);
    const parsed = parseAIJson(raw);

    if (!parsed.ok) {
      await persistAIResult('recommend_label_strategy', pidNumeric, req.user.id, req.body, { raw }, false);
      return res.status(422).json({ error: 'AI returned non-parseable response', raw });
    }

    await persistAIResult('recommend_label_strategy', pidNumeric, req.user.id, req.body, parsed.data);
    res.json({ success: true, project_id: pidNumeric, ...parsed.data, model: MODEL });
  } catch (err) {
    if (err.statusCode === 503) {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/ai-features/labeler-quality-score ──────────────────────────────
// Given a labeler's history, output a quality score.
router.post('/labeler-quality-score', aiRateLimiter, async (req, res) => {
  const { project_id, labeler, history } = req.body || {};
  if (!labeler) {
    return res.status(400).json({ error: 'labeler is required' });
  }

  let stats = { rows: [] };
  let qa = { rows: [] };
  let pidNumeric = null;
  if (project_id) {
    pidNumeric = parseInt(project_id, 10) || null;
    try {
      stats = await pool.query(
        `SELECT label, COUNT(*) AS n
           FROM annotations
          WHERE annotator = $1 AND dataset_id IN (SELECT id FROM datasets WHERE project_id = $2)
          GROUP BY label`,
        [labeler, pidNumeric]
      );
      qa = await pool.query(
        `SELECT id, data_item, label, status, confidence
           FROM annotations
          WHERE annotator = $1 AND dataset_id IN (SELECT id FROM datasets WHERE project_id = $2)
          ORDER BY id DESC LIMIT 25`,
        [labeler, pidNumeric]
      );
    } catch (_) { /* allow body-only history */ }
  }

  const systemPrompt = `You are a labeler-quality auditor. Output a calibrated quality score (0-100) and
break it down by accuracy proxy, throughput, consistency, and adherence to guidelines. Respond with ONLY
valid JSON:
{
  "labeler": "<name>",
  "quality_score": <0-100>,
  "subscores": {
    "accuracy_proxy": <0-100>,
    "throughput": <0-100>,
    "consistency": <0-100>,
    "guideline_adherence": <0-100>
  },
  "strengths": ["<text>"],
  "weaknesses": ["<text>"],
  "training_recommendations": ["<text>"],
  "summary": "<2 sentences>"
}`;
  const userMessage = `Labeler: ${labeler}
Per-label counts: ${JSON.stringify(stats.rows)}
Recent items: ${JSON.stringify(qa.rows.slice(0, 25))}
Caller-provided history: ${JSON.stringify(history || null)}`;

  try {
    const raw = await callAI(systemPrompt, userMessage);
    const parsed = parseAIJson(raw);

    if (!parsed.ok) {
      await persistAIResult('labeler_quality_score', pidNumeric, req.user.id, req.body, { raw }, false);
      return res.status(422).json({ error: 'AI returned non-parseable response', raw });
    }

    await persistAIResult('labeler_quality_score', pidNumeric, req.user.id, req.body, parsed.data);
    res.json({ success: true, project_id: pidNumeric, labeler, ...parsed.data, model: MODEL });
  } catch (err) {
    if (err.statusCode === 503) {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/ai-features/identify-ambiguous-items/:project_id ──────────────
// Explicit endpoint that enumerates ambiguous items (separate from active-learning).
router.post('/identify-ambiguous-items/:project_id', aiRateLimiter, async (req, res) => {
  const { project_id } = req.params;
  const pidNumeric = parseInt(project_id, 10);
  if (!pidNumeric) {
    return res.status(400).json({ error: 'project_id is required' });
  }

  let candidates = { rows: [] };
  let labels = { rows: [] };
  try {
    candidates = await pool.query(
      `SELECT id, input_text, predicted_label, confidence
         FROM auto_labels
        WHERE project_id = $1 AND confidence IS NOT NULL
        ORDER BY confidence ASC, created_at DESC LIMIT 25`,
      [pidNumeric]
    );
    labels = await pool.query(
      'SELECT name, description FROM labels WHERE project_id = $1',
      [pidNumeric]
    );
  } catch (_) { /* schemas may be partial in dev */ }

  const seedItems = (req.body && Array.isArray(req.body.items)) ? req.body.items : [];

  const systemPrompt = `You are an annotation reviewer. Identify which of the supplied items are AMBIGUOUS
(annotators would reasonably disagree) — NOT just "uncertain by model". Explain why each is ambiguous and
suggest a guideline clarification. Respond with ONLY valid JSON:
{
  "ambiguous_items": [
    { "id": <id|null>, "text": "<text>", "reason": "<text>", "candidate_labels": ["<label>"], "guideline_suggestion": "<text>" }
  ],
  "ambiguity_rate_pct": <0-100>,
  "guidelines_to_add": ["<text>"],
  "summary": "<2 sentences>"
}`;
  const userMessage = `Project labels: ${JSON.stringify(labels.rows.map(l => l.name))}
DB candidates (low-confidence rows): ${JSON.stringify(candidates.rows)}
Caller-supplied items: ${JSON.stringify(seedItems)}`;

  try {
    const raw = await callAI(systemPrompt, userMessage);
    const parsed = parseAIJson(raw);

    if (!parsed.ok) {
      await persistAIResult('identify_ambiguous_items', pidNumeric, req.user.id, { project_id: pidNumeric }, { raw }, false);
      return res.status(422).json({ error: 'AI returned non-parseable response', raw });
    }

    await persistAIResult('identify_ambiguous_items', pidNumeric, req.user.id, { project_id: pidNumeric }, parsed.data);
    res.json({ success: true, project_id: pidNumeric, ...parsed.data, model: MODEL });
  } catch (err) {
    if (err.statusCode === 503) {
      return res.status(503).json({ error: err.message });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
