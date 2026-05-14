require('dotenv').config({ path: '../.env' });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.BACKEND_PORT || 4001;
const JWT_SECRET = process.env.JWT_SECRET || 'ai-labeling-platform-secret-key-2024';

// ─── Security Middleware ─────────────────────────────────────────────────────
// Helmet sets sane HTTP security headers (disable CSP because the SPA handles its own).
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS — allow specific origins from CORS_ORIGINS env (comma-separated). Falls back to '*' in dev.
const corsOrigins = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: corsOrigins.includes('*') ? true : corsOrigins,
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));

// Database
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'ai_labeling_platform',
  user: process.env.DB_USER || 'erolakarsu',
  password: process.env.DB_PASSWORD || '',
});

// ─── JWT Auth Middleware ─────────────────────────────────────────────────────

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Apply auth to all /api routes except /api/auth/* and /api/seed
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth') || req.path === '/seed' || req.path === '/health') {
    return next();
  }
  authMiddleware(req, res, next);
});

// ─── Database Initialization ─────────────────────────────────────────────────

async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'annotator',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        type VARCHAR(100) DEFAULT 'text_classification',
        status VARCHAR(50) DEFAULT 'active',
        label_count INTEGER DEFAULT 0,
        accuracy DECIMAL(5,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS datasets (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        source VARCHAR(100) DEFAULT 'upload',
        item_count INTEGER DEFAULT 0,
        labeled_count INTEGER DEFAULT 0,
        format VARCHAR(50) DEFAULT 'text',
        size_mb DECIMAL(10,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'ready',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS labels (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        type VARCHAR(100) DEFAULT 'classification',
        color VARCHAR(20) DEFAULT '#3B82F6',
        options JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        dataset_id INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
        assignee VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        priority VARCHAR(50) DEFAULT 'medium',
        due_date TIMESTAMP,
        completed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS annotations (
        id SERIAL PRIMARY KEY,
        task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
        dataset_id INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
        data_item TEXT NOT NULL,
        label VARCHAR(255),
        confidence DECIMAL(5,2),
        annotator VARCHAR(255),
        method VARCHAR(50) DEFAULT 'manual',
        status VARCHAR(50) DEFAULT 'pending',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS auto_labels (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        model VARCHAR(255) DEFAULT 'anthropic/claude-haiku-4.5',
        input_text TEXT,
        predicted_label VARCHAR(255),
        confidence DECIMAL(5,2),
        status VARCHAR(50) DEFAULT 'pending',
        ai_response JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        annotation_id INTEGER REFERENCES annotations(id) ON DELETE SET NULL,
        reviewer VARCHAR(255),
        original_label VARCHAR(255),
        corrected_label VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        feedback TEXT,
        reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS team_members (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        role VARCHAR(100) DEFAULT 'annotator',
        department VARCHAR(100),
        tasks_completed INTEGER DEFAULT 0,
        accuracy DECIMAL(5,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'active',
        joined_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS quality_metrics (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        metric_name VARCHAR(255) NOT NULL,
        value DECIMAL(10,2),
        threshold DECIMAL(10,2),
        status VARCHAR(50) DEFAULT 'pass',
        measured_at TIMESTAMP DEFAULT NOW(),
        notes TEXT
      );

      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        key VARCHAR(255) NOT NULL,
        permissions VARCHAR(255) DEFAULT 'read',
        status VARCHAR(50) DEFAULT 'active',
        last_used TIMESTAMP,
        requests_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS exports (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        format VARCHAR(50) DEFAULT 'json',
        record_count INTEGER DEFAULT 0,
        file_size VARCHAR(50),
        status VARCHAR(50) DEFAULT 'completed',
        download_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS webhooks (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        url VARCHAR(500) NOT NULL,
        events VARCHAR(255) DEFAULT 'all',
        status VARCHAR(50) DEFAULT 'active',
        secret VARCHAR(255),
        last_triggered TIMESTAMP,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS audit_logs (
        id SERIAL PRIMARY KEY,
        user_name VARCHAR(255),
        action VARCHAR(255) NOT NULL,
        resource VARCHAR(255),
        resource_id INTEGER,
        details TEXT,
        ip_address VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT,
        type VARCHAR(50) DEFAULT 'info',
        read BOOLEAN DEFAULT false,
        resource VARCHAR(255),
        resource_id INTEGER,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS comments (
        id SERIAL PRIMARY KEY,
        user_name VARCHAR(255) NOT NULL,
        resource_type VARCHAR(100) NOT NULL,
        resource_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS guidelines (
        id SERIAL PRIMARY KEY,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        version VARCHAR(50) DEFAULT '1.0',
        status VARCHAR(50) DEFAULT 'draft',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS data_imports (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        dataset_id INTEGER REFERENCES datasets(id) ON DELETE SET NULL,
        source VARCHAR(100) DEFAULT 'file',
        format VARCHAR(50) DEFAULT 'csv',
        status VARCHAR(50) DEFAULT 'pending',
        total_items INTEGER DEFAULT 0,
        imported_items INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        error_log TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS reports (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) DEFAULT 'summary',
        project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
        filters JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'completed',
        file_url VARCHAR(500),
        file_size VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tags (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) UNIQUE NOT NULL,
        color VARCHAR(20) DEFAULT '#3B82F6',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS resource_tags (
        id SERIAL PRIMARY KEY,
        tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE,
        resource_type VARCHAR(100) NOT NULL,
        resource_id INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS activity_feed (
        id SERIAL PRIMARY KEY,
        user_name VARCHAR(255),
        action VARCHAR(255) NOT NULL,
        resource_type VARCHAR(100),
        resource_id INTEGER,
        details TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS saved_filters (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        name VARCHAR(255) NOT NULL,
        page VARCHAR(100) NOT NULL,
        filters JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS templates (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) DEFAULT 'project',
        description TEXT,
        config JSONB DEFAULT '{}',
        status VARCHAR(50) DEFAULT 'active',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('Database tables initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err.message);
  } finally {
    client.release();
  }
}

// ─── Helper: Audit Log ──────────────────────────────────────────────────────

async function logAudit(userName, action, resource, resourceId, details, ipAddress) {
  try {
    await pool.query(
      'INSERT INTO audit_logs (user_name, action, resource, resource_id, details, ip_address) VALUES ($1,$2,$3,$4,$5,$6)',
      [userName, action, resource, resourceId, details, ipAddress]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// ─── Helper: OpenRouter AI Call ──────────────────────────────────────────────

async function callOpenRouter(prompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || 'OpenRouter API error');
  return data.choices?.[0]?.message?.content || '';
}

// ─── CRUD Helper ─────────────────────────────────────────────────────────────

function buildCrudRoutes(router, tableName, resourceName, columns) {
  // GET all
  router.get('/', async (req, res) => {
    try {
      const result = await pool.query(`SELECT * FROM ${tableName} ORDER BY id DESC`);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET by id
  router.get('/:id', async (req, res) => {
    try {
      const result = await pool.query(`SELECT * FROM ${tableName} WHERE id = $1`, [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: `${resourceName} not found` });
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST create
  router.post('/', async (req, res) => {
    try {
      const keys = columns.filter(c => req.body[c] !== undefined);
      if (keys.length === 0) return res.status(400).json({ error: 'No valid fields provided' });
      const vals = keys.map(k => req.body[k]);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const colNames = keys.join(', ');
      const result = await pool.query(
        `INSERT INTO ${tableName} (${colNames}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      await logAudit(req.user?.name || 'system', 'create', resourceName, result.rows[0].id, `Created ${resourceName}`, req.ip);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT update
  router.put('/:id', async (req, res) => {
    try {
      const keys = columns.filter(c => req.body[c] !== undefined);
      if (keys.length === 0) return res.status(400).json({ error: 'No valid fields provided' });
      const vals = keys.map(k => req.body[k]);
      const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
      vals.push(req.params.id);
      const result = await pool.query(
        `UPDATE ${tableName} SET ${setClause} WHERE id = $${vals.length} RETURNING *`,
        vals
      );
      if (result.rows.length === 0) return res.status(404).json({ error: `${resourceName} not found` });
      await logAudit(req.user?.name || 'system', 'update', resourceName, parseInt(req.params.id), `Updated ${resourceName}`, req.ip);
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE
  router.delete('/:id', async (req, res) => {
    try {
      const result = await pool.query(`DELETE FROM ${tableName} WHERE id = $1 RETURNING *`, [req.params.id]);
      if (result.rows.length === 0) return res.status(404).json({ error: `${resourceName} not found` });
      await logAudit(req.user?.name || 'system', 'delete', resourceName, parseInt(req.params.id), `Deleted ${resourceName}`, req.ip);
      res.json({ message: `${resourceName} deleted successfully` });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Auth ────────────────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, password, and name are required' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (email, password, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at',
      [email, hashedPassword, name, role || 'annotator']
    );
    const user = result.rows[0];
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ user, token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role, created_at: user.created_at },
      token,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Projects ────────────────────────────────────────────────────────────────

const projectsRouter = express.Router();
buildCrudRoutes(projectsRouter, 'projects', 'Project', [
  'name', 'description', 'type', 'status', 'label_count', 'accuracy', 'updated_at'
]);
app.use('/api/projects', projectsRouter);

// ─── Datasets ────────────────────────────────────────────────────────────────

const datasetsRouter = express.Router();
buildCrudRoutes(datasetsRouter, 'datasets', 'Dataset', [
  'name', 'description', 'project_id', 'source', 'item_count', 'labeled_count', 'format', 'size_mb', 'status'
]);
app.use('/api/datasets', datasetsRouter);

// ─── Labels ──────────────────────────────────────────────────────────────────

const labelsRouter = express.Router();
buildCrudRoutes(labelsRouter, 'labels', 'Label', [
  'name', 'description', 'project_id', 'type', 'color', 'options'
]);
app.use('/api/labels', labelsRouter);

// ─── Tasks ───────────────────────────────────────────────────────────────────

const tasksRouter = express.Router();
buildCrudRoutes(tasksRouter, 'tasks', 'Task', [
  'title', 'description', 'project_id', 'dataset_id', 'assignee', 'status', 'priority', 'due_date', 'completed_at'
]);
app.use('/api/tasks', tasksRouter);

// ─── Annotations ─────────────────────────────────────────────────────────────

const annotationsRouter = express.Router();
buildCrudRoutes(annotationsRouter, 'annotations', 'Annotation', [
  'task_id', 'dataset_id', 'data_item', 'label', 'confidence', 'annotator', 'method', 'status', 'metadata'
]);
app.use('/api/annotations', annotationsRouter);

// ─── Auto Labels ─────────────────────────────────────────────────────────────

const autoLabelsRouter = express.Router();
buildCrudRoutes(autoLabelsRouter, 'auto_labels', 'AutoLabel', [
  'name', 'description', 'project_id', 'model', 'input_text', 'predicted_label', 'confidence', 'status', 'ai_response'
]);

// POST /api/auto-labels/run - Run AI auto-labeling
autoLabelsRouter.post('/run', async (req, res) => {
  try {
    const { input_text, project_id, name, labels } = req.body;
    if (!input_text) return res.status(400).json({ error: 'input_text is required' });

    const labelOptions = labels ? labels.join(', ') : 'positive, negative, neutral';
    const prompt = `You are a data labeling assistant. Classify the following text into one of these categories: ${labelOptions}.

Text: "${input_text}"

Respond with ONLY a JSON object in this exact format (no markdown, no extra text):
{"label": "category_name", "confidence": 0.95, "reasoning": "brief explanation"}`;

    const aiContent = await callOpenRouter(prompt);
    let parsed;
    try {
      parsed = JSON.parse(aiContent.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      parsed = { label: 'unknown', confidence: 0, reasoning: aiContent };
    }

    const result = await pool.query(
      `INSERT INTO auto_labels (name, project_id, model, input_text, predicted_label, confidence, status, ai_response)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', $7) RETURNING *`,
      [
        name || 'Auto-label run',
        project_id || null,
        process.env.OPENROUTER_MODEL || 'anthropic/claude-3-5-sonnet-20241022',
        input_text,
        parsed.label,
        parsed.confidence || 0,
        JSON.stringify(parsed),
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use('/api/auto-labels', autoLabelsRouter);

// ─── Reviews ─────────────────────────────────────────────────────────────────

const reviewsRouter = express.Router();
buildCrudRoutes(reviewsRouter, 'reviews', 'Review', [
  'annotation_id', 'reviewer', 'original_label', 'corrected_label', 'status', 'feedback', 'reviewed_at'
]);
app.use('/api/reviews', reviewsRouter);

// ─── Team ────────────────────────────────────────────────────────────────────

const teamRouter = express.Router();
buildCrudRoutes(teamRouter, 'team_members', 'TeamMember', [
  'name', 'email', 'role', 'department', 'tasks_completed', 'accuracy', 'status'
]);
app.use('/api/team', teamRouter);

// ─── Quality ─────────────────────────────────────────────────────────────────

const qualityRouter = express.Router();
buildCrudRoutes(qualityRouter, 'quality_metrics', 'QualityMetric', [
  'project_id', 'metric_name', 'value', 'threshold', 'status', 'notes'
]);
app.use('/api/quality', qualityRouter);

// ─── API Keys ────────────────────────────────────────────────────────────────

const apiKeysRouter = express.Router();
buildCrudRoutes(apiKeysRouter, 'api_keys', 'APIKey', [
  'name', 'key', 'permissions', 'status', 'last_used', 'requests_count'
]);
app.use('/api/api-keys', apiKeysRouter);

// ─── Exports ─────────────────────────────────────────────────────────────────

const exportsRouter = express.Router();
buildCrudRoutes(exportsRouter, 'exports', 'Export', [
  'name', 'project_id', 'format', 'record_count', 'file_size', 'status', 'download_url'
]);
app.use('/api/exports', exportsRouter);

// ─── Webhooks ────────────────────────────────────────────────────────────────

const webhooksRouter = express.Router();
buildCrudRoutes(webhooksRouter, 'webhooks', 'Webhook', [
  'name', 'url', 'events', 'status', 'secret', 'last_triggered', 'success_count', 'failure_count'
]);
app.use('/api/webhooks', webhooksRouter);

// ─── Audit Logs (read-only) ─────────────────────────────────────────────────

app.get('/api/audit-logs', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM audit_logs ORDER BY id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/audit-logs/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Audit log not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Analytics ───────────────────────────────────────────────────────────────

app.get('/api/analytics', async (req, res) => {
  try {
    const [projects, datasets, tasks, annotations, autoLabels, reviews, team, quality] = await Promise.all([
      pool.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status = \'active\') as active FROM projects'),
      pool.query('SELECT COUNT(*) as total, COALESCE(SUM(item_count),0) as total_items, COALESCE(SUM(labeled_count),0) as total_labeled FROM datasets'),
      pool.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status = 'completed') as completed FROM tasks`),
      pool.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE method = 'manual') as manual,
        COUNT(*) FILTER (WHERE method = 'auto') as auto,
        COALESCE(AVG(confidence),0) as avg_confidence FROM annotations`),
      pool.query('SELECT COUNT(*) as total, COALESCE(AVG(confidence),0) as avg_confidence FROM auto_labels'),
      pool.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE status = 'pending') as pending FROM reviews`),
      pool.query('SELECT COUNT(*) as total, COALESCE(AVG(accuracy),0) as avg_accuracy, COALESCE(SUM(tasks_completed),0) as total_tasks_completed FROM team_members'),
      pool.query(`SELECT COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pass') as passing,
        COUNT(*) FILTER (WHERE status = 'fail') as failing FROM quality_metrics`),
    ]);

    res.json({
      projects: projects.rows[0],
      datasets: datasets.rows[0],
      tasks: tasks.rows[0],
      annotations: annotations.rows[0],
      auto_labels: autoLabels.rows[0],
      reviews: reviews.rows[0],
      team: team.rows[0],
      quality: quality.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── AI Services ─────────────────────────────────────────────────────────────

app.post('/api/ai/classify', async (req, res) => {
  try {
    const { text, categories } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const cats = categories ? categories.join(', ') : 'positive, negative, neutral, mixed';
    const prompt = `Classify the following text into one of these categories: ${cats}.

Text: "${text}"

Respond with ONLY a JSON object (no markdown, no extra text):
{"category": "chosen_category", "confidence": 0.95, "reasoning": "brief explanation"}`;

    const content = await callOpenRouter(prompt);
    let parsed;
    try {
      parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      parsed = { category: 'unknown', confidence: 0, raw: content };
    }
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/sentiment', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const prompt = `Analyze the sentiment of the following text.

Text: "${text}"

Respond with ONLY a JSON object (no markdown, no extra text):
{"sentiment": "positive|negative|neutral|mixed", "score": 0.85, "emotions": ["joy","satisfaction"], "reasoning": "brief explanation"}`;

    const content = await callOpenRouter(prompt);
    let parsed;
    try {
      parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      parsed = { sentiment: 'unknown', score: 0, raw: content };
    }
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/ner', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const prompt = `Extract all named entities from the following text.

Text: "${text}"

Respond with ONLY a JSON object (no markdown, no extra text):
{"entities": [{"text": "entity_text", "type": "PERSON|ORGANIZATION|LOCATION|DATE|MONEY|PRODUCT|EVENT", "start": 0, "end": 10}]}`;

    const content = await callOpenRouter(prompt);
    let parsed;
    try {
      parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      parsed = { entities: [], raw: content };
    }
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/summarize', async (req, res) => {
  try {
    const { text, max_length } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const lengthInstruction = max_length ? `Keep the summary under ${max_length} words.` : 'Keep the summary concise (2-3 sentences).';
    const prompt = `Summarize the following text. ${lengthInstruction}

Text: "${text}"

Respond with ONLY a JSON object (no markdown, no extra text):
{"summary": "the summary text", "word_count": 25, "key_points": ["point1", "point2"]}`;

    const content = await callOpenRouter(prompt);
    let parsed;
    try {
      parsed = JSON.parse(content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
    } catch {
      parsed = { summary: content, word_count: 0, raw: content };
    }
    res.json(parsed);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Seed Data ───────────────────────────────────────────────────────────────

app.post('/api/seed', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing data in reverse dependency order
    await client.query('DELETE FROM templates');
    await client.query('DELETE FROM saved_filters');
    await client.query('DELETE FROM activity_feed');
    await client.query('DELETE FROM resource_tags');
    await client.query('DELETE FROM tags');
    await client.query('DELETE FROM reports');
    await client.query('DELETE FROM data_imports');
    await client.query('DELETE FROM guidelines');
    await client.query('DELETE FROM comments');
    await client.query('DELETE FROM notifications');
    await client.query('DELETE FROM audit_logs');
    await client.query('DELETE FROM webhooks');
    await client.query('DELETE FROM exports');
    await client.query('DELETE FROM api_keys');
    await client.query('DELETE FROM quality_metrics');
    await client.query('DELETE FROM reviews');
    await client.query('DELETE FROM auto_labels');
    await client.query('DELETE FROM annotations');
    await client.query('DELETE FROM tasks');
    await client.query('DELETE FROM labels');
    await client.query('DELETE FROM datasets');
    await client.query('DELETE FROM projects');
    await client.query('DELETE FROM team_members');
    await client.query('DELETE FROM users');

    // Reset sequences
    const tables = ['users','projects','datasets','labels','tasks','annotations','auto_labels','reviews','team_members','quality_metrics','api_keys','exports','webhooks','audit_logs','notifications','comments','guidelines','data_imports','reports','tags','resource_tags','activity_feed','saved_filters','templates'];
    for (const t of tables) {
      await client.query(`ALTER SEQUENCE ${t}_id_seq RESTART WITH 1`);
    }

    // ── Users (15+) ─────────────────────────────────────────────────────────
    const adminPassword = await bcrypt.hash('password123', 10);
    const userPassword = await bcrypt.hash('password123', 10);

    await client.query(`
      INSERT INTO users (email, password, name, role) VALUES
      ('admin@labelai.com', $1, 'Admin User', 'admin'),
      ('sarah.chen@labelai.com', $2, 'Sarah Chen', 'manager'),
      ('james.wilson@labelai.com', $2, 'James Wilson', 'annotator'),
      ('maria.garcia@labelai.com', $2, 'Maria Garcia', 'annotator'),
      ('david.kim@labelai.com', $2, 'David Kim', 'reviewer'),
      ('emma.johnson@labelai.com', $2, 'Emma Johnson', 'annotator'),
      ('alex.thompson@labelai.com', $2, 'Alex Thompson', 'manager'),
      ('priya.patel@labelai.com', $2, 'Priya Patel', 'annotator'),
      ('lucas.brown@labelai.com', $2, 'Lucas Brown', 'reviewer'),
      ('sofia.martinez@labelai.com', $2, 'Sofia Martinez', 'annotator'),
      ('ryan.lee@labelai.com', $2, 'Ryan Lee', 'annotator'),
      ('olivia.davis@labelai.com', $2, 'Olivia Davis', 'manager'),
      ('ethan.wang@labelai.com', $2, 'Ethan Wang', 'annotator'),
      ('ava.taylor@labelai.com', $2, 'Ava Taylor', 'reviewer'),
      ('noah.anderson@labelai.com', $2, 'Noah Anderson', 'annotator')
    `, [adminPassword, userPassword]);

    // ── Projects (15) ───────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO projects (name, description, type, status, label_count, accuracy) VALUES
      ('Customer Sentiment Analysis', 'Classify customer feedback by sentiment for product improvement', 'text_classification', 'active', 3, 94.50),
      ('Medical Image Annotation', 'Label X-ray and MRI images for disease detection models', 'image_classification', 'active', 12, 97.20),
      ('Named Entity Recognition - Legal', 'Extract entities from legal contracts and documents', 'ner', 'active', 8, 91.80),
      ('Product Review Categorization', 'Categorize e-commerce reviews by topic and aspect', 'text_classification', 'active', 7, 88.30),
      ('Autonomous Driving - Object Detection', 'Label road objects in dashcam footage for self-driving AI', 'object_detection', 'active', 15, 96.10),
      ('Social Media Toxicity Detection', 'Identify toxic and harmful content in social media posts', 'text_classification', 'active', 4, 92.70),
      ('Document Classification - Finance', 'Classify financial documents by type and priority', 'text_classification', 'completed', 6, 95.40),
      ('Speech Emotion Recognition', 'Label audio segments with emotional states', 'audio_classification', 'active', 7, 89.60),
      ('Retail Product Image Tagging', 'Tag product images with attributes for catalog search', 'image_tagging', 'active', 20, 93.80),
      ('News Article Summarization QA', 'Quality assurance for AI-generated article summaries', 'summarization', 'active', 3, 87.50),
      ('Chatbot Intent Classification', 'Label user messages with intent categories for chatbot training', 'text_classification', 'active', 25, 91.20),
      ('Wildlife Species Identification', 'Classify wildlife camera trap images by species', 'image_classification', 'paused', 45, 94.90),
      ('Resume Parsing and Extraction', 'Extract structured data from resume documents', 'ner', 'active', 10, 90.30),
      ('Satellite Image Segmentation', 'Segment satellite imagery for land use classification', 'image_segmentation', 'active', 8, 96.50),
      ('Email Spam Detection', 'Classify emails as spam, promotional, or legitimate', 'text_classification', 'completed', 3, 98.10)
    `);

    // ── Datasets (15) ───────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO datasets (name, description, project_id, source, item_count, labeled_count, format, size_mb, status) VALUES
      ('Customer Reviews Q1 2025', 'Customer feedback collected from support tickets', 1, 'upload', 5000, 4200, 'text', 12.50, 'ready'),
      ('Chest X-Ray Dataset', 'Frontal chest X-ray images from partner hospitals', 2, 'api', 15000, 12800, 'image', 4500.00, 'ready'),
      ('Legal Contracts Corpus', 'Collection of NDA and service agreements', 3, 'upload', 2500, 1800, 'text', 85.30, 'ready'),
      ('Amazon Product Reviews', 'Electronics category reviews from 2024', 4, 'api', 25000, 18500, 'text', 45.20, 'ready'),
      ('Urban Driving Footage', 'Dashcam video frames from city driving', 5, 'upload', 100000, 78000, 'image', 25000.00, 'ready'),
      ('Twitter Moderation Set', 'Flagged tweets for content moderation review', 6, 'api', 50000, 42000, 'text', 28.70, 'ready'),
      ('SEC Filings Collection', 'Quarterly and annual SEC filings from Fortune 500', 7, 'upload', 3200, 3200, 'text', 120.00, 'completed'),
      ('Call Center Audio Clips', 'Customer service call recordings segmented by utterance', 8, 'upload', 8000, 5600, 'audio', 3200.00, 'ready'),
      ('E-Commerce Product Photos', 'Product catalog images from retail partners', 9, 'api', 75000, 61000, 'image', 18000.00, 'ready'),
      ('News Articles Batch 1', 'Recent news articles from major outlets', 10, 'api', 10000, 7500, 'text', 35.40, 'ready'),
      ('Support Chat Logs', 'Customer support chat transcripts', 11, 'upload', 30000, 24000, 'text', 52.80, 'ready'),
      ('Wildlife Camera Trap Photos', 'Motion-triggered wildlife camera images', 12, 'upload', 45000, 38000, 'image', 12000.00, 'ready'),
      ('Resume PDF Collection', 'Tech industry resumes in PDF format', 13, 'upload', 5000, 3800, 'text', 250.00, 'ready'),
      ('Sentinel-2 Satellite Tiles', 'Satellite imagery tiles at 10m resolution', 14, 'api', 20000, 16500, 'image', 35000.00, 'ready'),
      ('Email Corpus 2024', 'Anonymized email dataset for spam detection', 15, 'upload', 100000, 100000, 'text', 180.00, 'completed')
    `);

    // ── Labels (15) ─────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO labels (name, description, project_id, type, color, options) VALUES
      ('Positive', 'Positive sentiment expression', 1, 'classification', '#22C55E', '["very positive", "positive"]'),
      ('Negative', 'Negative sentiment expression', 1, 'classification', '#EF4444', '["very negative", "negative"]'),
      ('Neutral', 'Neutral or factual statement', 1, 'classification', '#6B7280', '["neutral", "informational"]'),
      ('Pneumonia', 'Signs of pneumonia detected in X-ray', 2, 'classification', '#F59E0B', '["bacterial", "viral", "unclear"]'),
      ('Normal', 'No abnormalities detected', 2, 'classification', '#22C55E', '[]'),
      ('Person Name', 'Full legal name of a person', 3, 'ner', '#3B82F6', '[]'),
      ('Organization', 'Company or organization name', 3, 'ner', '#8B5CF6', '[]'),
      ('Date', 'Date or date range reference', 3, 'ner', '#F97316', '[]'),
      ('Vehicle', 'Cars, trucks, buses, motorcycles', 5, 'object_detection', '#EF4444', '["car", "truck", "bus", "motorcycle", "bicycle"]'),
      ('Pedestrian', 'People walking or standing', 5, 'object_detection', '#3B82F6', '["adult", "child", "group"]'),
      ('Toxic', 'Harmful or abusive content', 6, 'classification', '#EF4444', '["hate speech", "harassment", "threat"]'),
      ('Safe', 'Content that is appropriate', 6, 'classification', '#22C55E', '[]'),
      ('Spam', 'Unsolicited or promotional email', 15, 'classification', '#EF4444', '["phishing", "promotional", "scam"]'),
      ('Legitimate', 'Valid non-spam email', 15, 'classification', '#22C55E', '["personal", "business", "transactional"]'),
      ('Feature Request', 'Customer requesting a new feature', 1, 'classification', '#8B5CF6', '["ui", "functionality", "integration"]')
    `);

    // ── Tasks (15) ──────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO tasks (title, description, project_id, dataset_id, assignee, status, priority, due_date) VALUES
      ('Label Q1 Customer Reviews Batch 1', 'Label first 500 customer reviews from Q1', 1, 1, 'James Wilson', 'in_progress', 'high', '2025-04-15'),
      ('Annotate Chest X-Rays Set A', 'Annotate 200 chest X-ray images for pneumonia detection', 2, 2, 'Maria Garcia', 'in_progress', 'critical', '2025-04-10'),
      ('Extract Entities from NDAs', 'Identify all named entities in NDA contracts', 3, 3, 'Priya Patel', 'pending', 'medium', '2025-04-20'),
      ('Review Product Reviews Categories', 'Verify categorization of electronics reviews', 4, 4, 'David Kim', 'in_progress', 'medium', '2025-04-18'),
      ('Label Urban Objects Frame Set 1', 'Label vehicles and pedestrians in 1000 frames', 5, 5, 'Emma Johnson', 'pending', 'high', '2025-04-25'),
      ('Moderate Twitter Posts Batch 3', 'Review flagged tweets for toxicity', 6, 6, 'Sofia Martinez', 'completed', 'high', '2025-03-30'),
      ('Classify SEC Filings by Type', 'Categorize remaining SEC documents', 7, 7, 'Alex Thompson', 'completed', 'low', '2025-03-20'),
      ('Label Audio Emotions Set B', 'Identify emotions in call center audio clips', 8, 8, 'Ryan Lee', 'in_progress', 'medium', '2025-04-22'),
      ('Tag Product Images Batch 5', 'Add attribute tags to product catalog images', 9, 9, 'Ethan Wang', 'pending', 'medium', '2025-05-01'),
      ('QA News Summaries Round 2', 'Review AI-generated summaries for accuracy', 10, 10, 'Lucas Brown', 'in_progress', 'high', '2025-04-12'),
      ('Classify Support Chat Intents', 'Label customer support messages with intent', 11, 11, 'Olivia Davis', 'pending', 'medium', '2025-04-28'),
      ('Identify Wildlife Species Batch 4', 'Classify animals in camera trap images', 12, 12, 'Noah Anderson', 'paused', 'low', '2025-05-15'),
      ('Parse Tech Resumes Set 2', 'Extract structured data from developer resumes', 13, 13, 'James Wilson', 'in_progress', 'medium', '2025-04-20'),
      ('Segment Satellite Tiles Region B', 'Label land use in satellite imagery tiles', 14, 14, 'Maria Garcia', 'pending', 'high', '2025-05-05'),
      ('Final Spam Detection Validation', 'Validate spam classifier on remaining samples', 15, 15, 'Ava Taylor', 'completed', 'low', '2025-03-15')
    `);

    // ── Annotations (15) ────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO annotations (task_id, dataset_id, data_item, label, confidence, annotator, method, status, metadata) VALUES
      (1, 1, 'The product quality exceeded my expectations. Absolutely love it!', 'Positive', 98.50, 'James Wilson', 'manual', 'approved', '{"source": "support_ticket", "ticket_id": "T-1042"}'),
      (1, 1, 'Terrible experience. The item broke after two days of use.', 'Negative', 97.20, 'James Wilson', 'manual', 'approved', '{"source": "support_ticket", "ticket_id": "T-1043"}'),
      (1, 1, 'Item arrived on time. Standard packaging.', 'Neutral', 85.30, 'James Wilson', 'manual', 'pending', '{"source": "support_ticket", "ticket_id": "T-1044"}'),
      (2, 2, 'xray_chest_0042.dcm', 'Pneumonia', 92.10, 'Maria Garcia', 'manual', 'approved', '{"dicom_id": "0042", "view": "frontal"}'),
      (2, 2, 'xray_chest_0043.dcm', 'Normal', 96.80, 'Maria Garcia', 'manual', 'approved', '{"dicom_id": "0043", "view": "frontal"}'),
      (3, 3, 'Acme Corporation agrees to the terms set forth by GlobalTech Inc. on January 15, 2025.', 'Organization', 94.50, 'Priya Patel', 'manual', 'pending', '{"entity_count": 2}'),
      (4, 4, 'The battery life on this laptop is incredible. Easily lasts 12 hours.', 'Positive', 91.00, 'David Kim', 'auto', 'approved', '{"category": "electronics", "subcategory": "laptops"}'),
      (5, 5, 'frame_00234.jpg - Region [120,340,280,510]', 'Vehicle', 88.70, 'Emma Johnson', 'manual', 'pending', '{"frame_id": 234, "bbox": [120,340,280,510]}'),
      (6, 6, 'You are the worst and nobody should listen to your terrible opinions', 'Toxic', 96.30, 'Sofia Martinez', 'manual', 'approved', '{"platform": "twitter", "flagged_reason": "user_report"}'),
      (6, 6, 'Had a great day at the park with friends! Beautiful weather.', 'Safe', 99.10, 'Sofia Martinez', 'manual', 'approved', '{"platform": "twitter", "flagged_reason": "automated"}'),
      (8, 8, 'audio_segment_0891.wav', 'Frustrated', 82.40, 'Ryan Lee', 'manual', 'pending', '{"duration_sec": 4.2, "speaker": "customer"}'),
      (10, 10, 'The article discusses the impact of rising interest rates on the housing market in Q1 2025.', 'Accurate', 90.50, 'Lucas Brown', 'manual', 'approved', '{"article_id": "NEWS-2891"}'),
      (13, 13, 'Senior Software Engineer with 8 years of experience in Python and cloud architecture.', 'Skills', 87.30, 'James Wilson', 'auto', 'pending', '{"resume_id": "R-4521", "section": "summary"}'),
      (15, 15, 'Congratulations! You have won a $1000 gift card. Click here to claim now!', 'Spam', 99.50, 'Ava Taylor', 'auto', 'approved', '{"email_id": "E-89012", "flags": ["urgency", "prize"]}'),
      (15, 15, 'Hi team, please find the quarterly report attached for your review.', 'Legitimate', 97.80, 'Ava Taylor', 'manual', 'approved', '{"email_id": "E-89013", "flags": []}')
    `);

    // ── Auto Labels (15) ────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO auto_labels (name, description, project_id, model, input_text, predicted_label, confidence, status, ai_response) VALUES
      ('Sentiment Batch 1 Item 1', 'Auto-classify customer review', 1, 'anthropic/claude-haiku-4.5', 'Amazing product, will definitely buy again!', 'Positive', 96.80, 'completed', '{"label": "Positive", "confidence": 0.968, "reasoning": "Strong positive language"}'),
      ('Sentiment Batch 1 Item 2', 'Auto-classify customer review', 1, 'anthropic/claude-haiku-4.5', 'Not worth the price. Very disappointed.', 'Negative', 94.50, 'completed', '{"label": "Negative", "confidence": 0.945, "reasoning": "Negative sentiment about value"}'),
      ('Sentiment Batch 1 Item 3', 'Auto-classify customer review', 1, 'anthropic/claude-haiku-4.5', 'It works as described in the listing.', 'Neutral', 88.20, 'completed', '{"label": "Neutral", "confidence": 0.882, "reasoning": "Factual statement without sentiment"}'),
      ('Toxicity Check 1', 'Auto-detect toxic content', 6, 'anthropic/claude-haiku-4.5', 'You should be ashamed of yourself for saying that', 'Toxic', 78.90, 'completed', '{"label": "Toxic", "confidence": 0.789, "reasoning": "Shaming language detected"}'),
      ('Toxicity Check 2', 'Auto-detect toxic content', 6, 'anthropic/claude-haiku-4.5', 'I respectfully disagree with your point of view', 'Safe', 95.30, 'completed', '{"label": "Safe", "confidence": 0.953, "reasoning": "Respectful disagreement"}'),
      ('Spam Detection 1', 'Auto-classify email', 15, 'anthropic/claude-haiku-4.5', 'LIMITED TIME OFFER: Buy now and save 90%!!!', 'Spam', 97.60, 'completed', '{"label": "Spam", "confidence": 0.976, "reasoning": "Promotional urgency markers"}'),
      ('Spam Detection 2', 'Auto-classify email', 15, 'anthropic/claude-haiku-4.5', 'Meeting rescheduled to 3 PM tomorrow. Please confirm.', 'Legitimate', 98.10, 'completed', '{"label": "Legitimate", "confidence": 0.981, "reasoning": "Business communication"}'),
      ('Review Category 1', 'Auto-categorize product review', 4, 'anthropic/claude-haiku-4.5', 'The screen resolution is stunning but the speakers are mediocre', 'Mixed', 82.40, 'completed', '{"label": "Mixed", "confidence": 0.824, "reasoning": "Positive display, negative audio"}'),
      ('Intent Class 1', 'Auto-classify support intent', 11, 'anthropic/claude-haiku-4.5', 'How do I reset my password?', 'Account Support', 93.70, 'completed', '{"label": "Account Support", "confidence": 0.937, "reasoning": "Password reset request"}'),
      ('Intent Class 2', 'Auto-classify support intent', 11, 'anthropic/claude-haiku-4.5', 'I want to cancel my subscription', 'Cancellation', 96.20, 'completed', '{"label": "Cancellation", "confidence": 0.962, "reasoning": "Subscription cancellation request"}'),
      ('NER Legal 1', 'Auto-extract legal entities', 3, 'anthropic/claude-haiku-4.5', 'John Smith signed the agreement with Microsoft on March 1st, 2025', 'Person,Organization,Date', 91.50, 'completed', '{"entities": ["John Smith:Person", "Microsoft:Organization", "March 1st, 2025:Date"]}'),
      ('Sentiment Batch 2 Item 1', 'Auto-classify review', 1, 'anthropic/claude-haiku-4.5', 'Fast shipping and great customer service!', 'Positive', 95.40, 'completed', '{"label": "Positive", "confidence": 0.954, "reasoning": "Positive about shipping and service"}'),
      ('Auto Label Pending 1', 'Queued for processing', 4, 'anthropic/claude-haiku-4.5', 'The camera quality is decent for the price range', null, null, 'pending', '{}'),
      ('Auto Label Pending 2', 'Queued for processing', 1, 'anthropic/claude-haiku-4.5', 'Could be better but not terrible overall', null, null, 'pending', '{}'),
      ('Auto Label Failed 1', 'Processing failed due to API timeout', 6, 'anthropic/claude-haiku-4.5', 'This is a test message for toxicity detection', null, null, 'failed', '{"error": "API timeout after 30s"}')
    `);

    // ── Reviews (15) ────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO reviews (annotation_id, reviewer, original_label, corrected_label, status, feedback, reviewed_at) VALUES
      (1, 'David Kim', 'Positive', null, 'approved', 'Correctly labeled. Clear positive sentiment.', '2025-03-28 10:30:00'),
      (2, 'David Kim', 'Negative', null, 'approved', 'Accurate negative classification.', '2025-03-28 10:35:00'),
      (3, 'David Kim', 'Neutral', 'Positive', 'corrected', 'Slight positive tone detected in "standard" context.', '2025-03-28 10:40:00'),
      (4, 'Lucas Brown', 'Pneumonia', null, 'approved', 'Confirmed opacity in right lower lobe.', '2025-03-27 14:00:00'),
      (5, 'Lucas Brown', 'Normal', null, 'approved', 'Clear lung fields, no abnormalities.', '2025-03-27 14:15:00'),
      (6, 'Ava Taylor', 'Organization', null, 'approved', 'Both organizations correctly identified.', '2025-03-29 09:00:00'),
      (7, 'Ava Taylor', 'Positive', null, 'approved', 'Auto-label verified as accurate.', '2025-03-29 09:10:00'),
      (9, 'David Kim', 'Toxic', null, 'approved', 'Clear hostile language pattern.', '2025-03-26 16:00:00'),
      (10, 'David Kim', 'Safe', null, 'approved', 'Appropriate content, false positive flag.', '2025-03-26 16:05:00'),
      (12, 'Lucas Brown', 'Accurate', null, 'approved', 'Summary faithfully represents source.', '2025-03-28 11:00:00'),
      (14, 'Ava Taylor', 'Spam', null, 'approved', 'Classic spam indicators present.', '2025-03-25 13:00:00'),
      (15, 'Ava Taylor', 'Legitimate', null, 'approved', 'Standard business email communication.', '2025-03-25 13:10:00'),
      (8, 'David Kim', 'Vehicle', 'Pedestrian', 'corrected', 'Bounding box contains a pedestrian, not a vehicle.', '2025-03-29 15:00:00'),
      (11, 'Lucas Brown', 'Frustrated', null, 'pending', null, null),
      (13, 'Ava Taylor', 'Skills', null, 'pending', null, null)
    `);

    // ── Team Members (15) ───────────────────────────────────────────────────
    await client.query(`
      INSERT INTO team_members (name, email, role, department, tasks_completed, accuracy, status) VALUES
      ('Sarah Chen', 'sarah.chen@labelai.com', 'Project Manager', 'Management', 0, 0, 'active'),
      ('James Wilson', 'james.wilson@labelai.com', 'Senior Annotator', 'Annotation', 342, 96.50, 'active'),
      ('Maria Garcia', 'maria.garcia@labelai.com', 'Medical Annotator', 'Annotation', 289, 97.80, 'active'),
      ('David Kim', 'david.kim@labelai.com', 'Lead Reviewer', 'Quality Assurance', 198, 98.20, 'active'),
      ('Emma Johnson', 'emma.johnson@labelai.com', 'Computer Vision Annotator', 'Annotation', 456, 94.30, 'active'),
      ('Alex Thompson', 'alex.thompson@labelai.com', 'Team Lead', 'Management', 127, 95.10, 'active'),
      ('Priya Patel', 'priya.patel@labelai.com', 'NLP Annotator', 'Annotation', 378, 93.70, 'active'),
      ('Lucas Brown', 'lucas.brown@labelai.com', 'Senior Reviewer', 'Quality Assurance', 215, 97.40, 'active'),
      ('Sofia Martinez', 'sofia.martinez@labelai.com', 'Content Moderator', 'Annotation', 512, 95.80, 'active'),
      ('Ryan Lee', 'ryan.lee@labelai.com', 'Audio Annotator', 'Annotation', 167, 91.20, 'active'),
      ('Olivia Davis', 'olivia.davis@labelai.com', 'Operations Manager', 'Management', 85, 94.60, 'active'),
      ('Ethan Wang', 'ethan.wang@labelai.com', 'Image Annotator', 'Annotation', 423, 93.10, 'active'),
      ('Ava Taylor', 'ava.taylor@labelai.com', 'Quality Analyst', 'Quality Assurance', 256, 98.50, 'active'),
      ('Noah Anderson', 'noah.anderson@labelai.com', 'Junior Annotator', 'Annotation', 89, 88.40, 'active'),
      ('Isabella Thomas', 'isabella.thomas@labelai.com', 'Data Engineer', 'Engineering', 45, 96.00, 'inactive')
    `);

    // ── Quality Metrics (15) ────────────────────────────────────────────────
    await client.query(`
      INSERT INTO quality_metrics (project_id, metric_name, value, threshold, status, notes) VALUES
      (1, 'Inter-Annotator Agreement', 92.30, 85.00, 'pass', 'Cohen kappa across 3 annotators'),
      (1, 'Label Accuracy', 94.50, 90.00, 'pass', 'Compared against gold standard'),
      (2, 'Diagnostic Sensitivity', 97.20, 95.00, 'pass', 'True positive rate for pneumonia detection'),
      (2, 'Diagnostic Specificity', 96.80, 95.00, 'pass', 'True negative rate for normal cases'),
      (3, 'Entity F1 Score', 91.80, 88.00, 'pass', 'F1 score for entity extraction'),
      (5, 'Bounding Box IoU', 87.50, 85.00, 'pass', 'Intersection over Union for object detection'),
      (5, 'Object Detection mAP', 82.30, 85.00, 'fail', 'Mean Average Precision below threshold'),
      (6, 'Precision - Toxic Class', 92.70, 90.00, 'pass', 'Precision for toxic content detection'),
      (6, 'Recall - Toxic Class', 88.40, 90.00, 'fail', 'Recall below threshold, some toxic content missed'),
      (9, 'Tag Completeness', 93.80, 90.00, 'pass', 'Percentage of required tags applied'),
      (11, 'Intent Classification Accuracy', 91.20, 88.00, 'pass', 'Accuracy across 25 intent categories'),
      (12, 'Species Identification Accuracy', 94.90, 92.00, 'pass', 'Accuracy for top 45 species'),
      (14, 'Segmentation Dice Score', 96.50, 93.00, 'pass', 'Dice coefficient for land use segmentation'),
      (15, 'Spam Detection F1', 98.10, 95.00, 'pass', 'F1 score for spam classification'),
      (4, 'Review Categorization Kappa', 85.20, 82.00, 'pass', 'Inter-rater reliability for review categories')
    `);

    // ── API Keys (15) ───────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO api_keys (name, key, permissions, status, last_used, requests_count) VALUES
      ('Production API', 'pk_prod_a1b2c3d4e5f6g7h8i9j0', 'read,write', 'active', '2025-03-28 15:30:00', 15420),
      ('Staging API', 'pk_stag_k1l2m3n4o5p6q7r8s9t0', 'read,write', 'active', '2025-03-28 12:00:00', 8930),
      ('Analytics Dashboard', 'pk_dash_u1v2w3x4y5z6a7b8c9d0', 'read', 'active', '2025-03-28 16:00:00', 42150),
      ('Mobile App Integration', 'pk_mobi_e1f2g3h4i5j6k7l8m9n0', 'read,write', 'active', '2025-03-27 20:00:00', 6780),
      ('CI/CD Pipeline', 'pk_cicd_o1p2q3r4s5t6u7v8w9x0', 'read', 'active', '2025-03-28 08:00:00', 2340),
      ('Partner Integration - Acme', 'pk_part_y1z2a3b4c5d6e7f8g9h0', 'read', 'active', '2025-03-26 10:00:00', 1250),
      ('Data Export Service', 'pk_expt_i1j2k3l4m5n6o7p8q9r0', 'read,write', 'active', '2025-03-28 14:00:00', 890),
      ('Webhook Handler', 'pk_whk_s1t2u3v4w5x6y7z8a9b0', 'read,write', 'active', '2025-03-28 16:30:00', 5670),
      ('ML Training Pipeline', 'pk_mltr_c1d2e3f4g5h6i7j8k9l0', 'read', 'active', '2025-03-25 22:00:00', 3210),
      ('Quality Dashboard', 'pk_qual_m1n2o3p4q5r6s7t8u9v0', 'read', 'active', '2025-03-28 11:00:00', 1890),
      ('Admin Console', 'pk_admn_w1x2y3z4a5b6c7d8e9f0', 'read,write,admin', 'active', '2025-03-28 16:45:00', 920),
      ('Legacy System Bridge', 'pk_lgcy_g1h2i3j4k5l6m7n8o9p0', 'read', 'inactive', '2025-02-15 09:00:00', 45230),
      ('Test Environment', 'pk_test_q1r2s3t4u5v6w7x8y9z0', 'read,write', 'active', '2025-03-28 17:00:00', 78500),
      ('Monitoring Service', 'pk_mntr_a2b3c4d5e6f7g8h9i0j1', 'read', 'active', '2025-03-28 16:55:00', 125000),
      ('Deprecated V1 Key', 'pk_depv_k2l3m4n5o6p7q8r9s0t1', 'read', 'revoked', '2025-01-10 12:00:00', 89200)
    `);

    // ── Exports (15) ────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO exports (name, project_id, format, record_count, file_size, status, download_url) VALUES
      ('Sentiment Analysis Full Export', 1, 'json', 4200, '8.5 MB', 'completed', '/exports/sentiment_full_2025q1.json'),
      ('Medical Images Labels CSV', 2, 'csv', 12800, '2.1 MB', 'completed', '/exports/medical_labels_v3.csv'),
      ('Legal NER Annotations', 3, 'json', 1800, '4.2 MB', 'completed', '/exports/legal_ner_export.json'),
      ('Product Reviews JSONL', 4, 'jsonl', 18500, '15.3 MB', 'completed', '/exports/product_reviews_labeled.jsonl'),
      ('Driving Objects COCO Format', 5, 'coco_json', 78000, '125.0 MB', 'completed', '/exports/driving_coco_v2.json'),
      ('Toxicity Labels Export', 6, 'csv', 42000, '6.8 MB', 'completed', '/exports/toxicity_labels.csv'),
      ('SEC Filings Classification', 7, 'json', 3200, '1.9 MB', 'completed', '/exports/sec_classification.json'),
      ('Audio Emotions Dataset', 8, 'csv', 5600, '980 KB', 'completed', '/exports/audio_emotions.csv'),
      ('Product Tags Export', 9, 'json', 61000, '45.2 MB', 'completed', '/exports/product_tags_full.json'),
      ('News Summaries QA Report', 10, 'csv', 7500, '3.4 MB', 'completed', '/exports/news_qa_report.csv'),
      ('Chatbot Training Data', 11, 'jsonl', 24000, '12.7 MB', 'completed', '/exports/chatbot_intents.jsonl'),
      ('Wildlife Species Labels', 12, 'csv', 38000, '5.6 MB', 'completed', '/exports/wildlife_species.csv'),
      ('Resume Parsed Data', 13, 'json', 3800, '8.9 MB', 'processing', '/exports/resumes_parsed.json'),
      ('Satellite Segmentation Masks', 14, 'coco_json', 16500, '210.0 MB', 'processing', '/exports/satellite_masks.json'),
      ('Spam Detection Training Set', 15, 'csv', 100000, '18.5 MB', 'completed', '/exports/spam_training.csv')
    `);

    // ── Webhooks (15) ───────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO webhooks (name, url, events, status, secret, last_triggered, success_count, failure_count) VALUES
      ('Slack Notifications', 'https://hooks.slack.com/services/T01/B02/abc123', 'task.completed,review.approved', 'active', 'whsec_slack_001', '2025-03-28 16:30:00', 1245, 3),
      ('ML Pipeline Trigger', 'https://ml.internal.labelai.com/webhooks/train', 'export.completed', 'active', 'whsec_ml_002', '2025-03-28 14:00:00', 89, 2),
      ('Quality Alert System', 'https://alerts.labelai.com/quality', 'quality.threshold_breach', 'active', 'whsec_qa_003', '2025-03-27 09:15:00', 34, 0),
      ('Analytics Sync', 'https://analytics.labelai.com/ingest', 'annotation.created,annotation.updated', 'active', 'whsec_ana_004', '2025-03-28 16:45:00', 45230, 12),
      ('Partner API - Acme Corp', 'https://api.acmecorp.com/labelai/webhook', 'export.completed', 'active', 'whsec_acme_005', '2025-03-26 10:00:00', 156, 5),
      ('Email Digest Generator', 'https://internal.labelai.com/email-digest', 'task.completed,project.milestone', 'active', 'whsec_email_006', '2025-03-28 08:00:00', 890, 1),
      ('Jira Integration', 'https://labelai.atlassian.net/webhooks/inbound', 'task.created,task.status_changed', 'active', 'whsec_jira_007', '2025-03-28 15:00:00', 2340, 8),
      ('Backup Service', 'https://backup.labelai.com/trigger', 'export.completed', 'active', 'whsec_bkup_008', '2025-03-28 02:00:00', 720, 0),
      ('Monitoring - Datadog', 'https://http-intake.logs.datadoghq.com/v1', 'all', 'active', 'whsec_dd_009', '2025-03-28 16:55:00', 125000, 45),
      ('PagerDuty Alerts', 'https://events.pagerduty.com/integration/abc/enqueue', 'quality.threshold_breach,system.error', 'active', 'whsec_pd_010', '2025-03-20 03:00:00', 12, 0),
      ('Customer Portal Sync', 'https://portal.labelai.com/api/webhooks', 'project.updated,export.completed', 'active', 'whsec_portal_011', '2025-03-28 12:00:00', 567, 3),
      ('Auto-Labeling Complete', 'https://internal.labelai.com/auto-label/complete', 'auto_label.completed', 'active', 'whsec_auto_012', '2025-03-28 11:30:00', 3450, 15),
      ('Deprecated Discord Hook', 'https://discord.com/api/webhooks/old-channel', 'all', 'inactive', 'whsec_disc_013', '2025-01-15 10:00:00', 8900, 234),
      ('Team Standup Bot', 'https://bots.labelai.com/standup', 'task.completed,annotation.created', 'active', 'whsec_bot_014', '2025-03-28 09:00:00', 450, 2),
      ('Compliance Audit Trail', 'https://compliance.labelai.com/audit', 'all', 'active', 'whsec_comp_015', '2025-03-28 16:58:00', 89000, 7)
    `);

    // ── Audit Logs (15) ─────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO audit_logs (user_name, action, resource, resource_id, details, ip_address, created_at) VALUES
      ('Admin User', 'create', 'Project', 1, 'Created project: Customer Sentiment Analysis', '192.168.1.10', '2025-03-01 09:00:00'),
      ('Sarah Chen', 'create', 'Dataset', 1, 'Uploaded dataset: Customer Reviews Q1 2025', '192.168.1.15', '2025-03-02 10:30:00'),
      ('Admin User', 'create', 'Project', 2, 'Created project: Medical Image Annotation', '192.168.1.10', '2025-03-03 08:00:00'),
      ('James Wilson', 'create', 'Annotation', 1, 'Labeled item as Positive', '192.168.1.20', '2025-03-15 14:30:00'),
      ('James Wilson', 'create', 'Annotation', 2, 'Labeled item as Negative', '192.168.1.20', '2025-03-15 14:35:00'),
      ('David Kim', 'update', 'Review', 1, 'Approved annotation #1', '192.168.1.25', '2025-03-28 10:30:00'),
      ('David Kim', 'update', 'Review', 3, 'Corrected label from Neutral to Positive', '192.168.1.25', '2025-03-28 10:40:00'),
      ('Alex Thompson', 'create', 'Task', 5, 'Assigned object detection task to Emma Johnson', '192.168.1.30', '2025-03-10 11:00:00'),
      ('Admin User', 'create', 'APIKey', 1, 'Generated production API key', '192.168.1.10', '2025-03-01 08:00:00'),
      ('Olivia Davis', 'create', 'Export', 1, 'Exported sentiment analysis results', '192.168.1.35', '2025-03-20 16:00:00'),
      ('Admin User', 'update', 'Webhook', 13, 'Deactivated deprecated Discord webhook', '192.168.1.10', '2025-02-01 09:00:00'),
      ('Sarah Chen', 'update', 'Project', 12, 'Paused Wildlife Species Identification project', '192.168.1.15', '2025-03-25 11:00:00'),
      ('System', 'create', 'AutoLabel', 1, 'Auto-labeled item via Claude Haiku', '127.0.0.1', '2025-03-26 14:00:00'),
      ('Ava Taylor', 'update', 'QualityMetric', 7, 'Flagged Object Detection mAP as failing', '192.168.1.40', '2025-03-27 10:00:00'),
      ('Admin User', 'delete', 'APIKey', 15, 'Revoked deprecated V1 API key', '192.168.1.10', '2025-03-01 08:30:00')
    `);

    // ── Notifications (15) ──────────────────────────────────────────────────
    await client.query(`
      INSERT INTO notifications (user_id, title, message, type, read, resource, resource_id) VALUES
      (1, 'Task Assigned', 'You have been assigned to "Label Q1 Customer Reviews Batch 1"', 'task', false, 'Task', 1),
      (1, 'Review Completed', 'David Kim approved annotation #1', 'review', true, 'Review', 1),
      (1, 'Export Ready', 'Sentiment Analysis Full Export is ready for download', 'export', false, 'Export', 1),
      (1, 'Quality Alert', 'Object Detection mAP has dropped below threshold', 'alert', false, 'QualityMetric', 7),
      (1, 'New Team Member', 'Isabella Thomas has joined the Engineering team', 'team', true, 'TeamMember', 15),
      (1, 'Project Milestone', 'Medical Image Annotation reached 85% completion', 'milestone', false, 'Project', 2),
      (1, 'Webhook Failed', 'Deprecated Discord Hook failed 234 times', 'warning', true, 'Webhook', 13),
      (1, 'Dataset Uploaded', 'Customer Reviews Q1 2025 has been uploaded successfully', 'dataset', true, 'Dataset', 1),
      (1, 'Auto-Label Complete', 'Batch of 10 items auto-labeled for Sentiment Analysis', 'auto_label', false, 'AutoLabel', 1),
      (1, 'Review Required', '3 annotations are pending your review', 'review', false, 'Review', 14),
      (1, 'API Key Expiring', 'Legacy System Bridge key expires in 7 days', 'warning', false, 'APIKey', 12),
      (1, 'System Update', 'Platform has been updated to version 2.1.0', 'system', true, 'System', null),
      (1, 'Task Overdue', 'Classify SEC Filings by Type is past due date', 'alert', false, 'Task', 7),
      (1, 'Backup Complete', 'Daily database backup completed successfully', 'system', true, 'System', null),
      (1, 'New Comment', 'Sarah Chen commented on Customer Sentiment Analysis', 'comment', false, 'Project', 1)
    `);

    // ── Comments (15) ────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO comments (user_name, resource_type, resource_id, content, created_at) VALUES
      ('Sarah Chen', 'project', 1, 'We should prioritize the remaining 800 unlabeled reviews before Q2.', '2025-03-25 09:00:00'),
      ('James Wilson', 'task', 1, 'I''ve completed 350 out of 500 reviews so far. On track for deadline.', '2025-03-26 14:30:00'),
      ('David Kim', 'annotation', 3, 'I think this should be classified as slightly positive rather than neutral.', '2025-03-28 10:45:00'),
      ('Maria Garcia', 'project', 2, 'The new X-ray batch from Hospital B has arrived. Ready for annotation.', '2025-03-27 08:00:00'),
      ('Alex Thompson', 'task', 5, 'Emma, please focus on vehicle detection first - that''s the priority.', '2025-03-26 11:30:00'),
      ('Priya Patel', 'project', 3, 'Found some ambiguous entity boundaries in the NDA contracts. Need guidelines.', '2025-03-28 15:00:00'),
      ('Lucas Brown', 'task', 10, 'Summary quality is generally good but some miss key financial figures.', '2025-03-28 11:15:00'),
      ('Sofia Martinez', 'project', 6, 'The toxicity detection rules need updating for new slang terms.', '2025-03-27 16:00:00'),
      ('Admin User', 'project', 5, 'Great progress on the autonomous driving dataset. Keep it up!', '2025-03-28 09:00:00'),
      ('Olivia Davis', 'task', 9, 'Product image tagging guidelines have been updated. Please review.', '2025-03-27 13:00:00'),
      ('Ryan Lee', 'project', 8, 'Audio quality varies significantly. Some clips need re-recording.', '2025-03-26 10:00:00'),
      ('Ethan Wang', 'task', 12, 'Wildlife species identification is tricky for nocturnal shots. Need more training.', '2025-03-25 15:30:00'),
      ('Ava Taylor', 'annotation', 13, 'The skills extraction model is missing soft skills consistently.', '2025-03-29 09:20:00'),
      ('Noah Anderson', 'project', 11, 'Chatbot intent categories need to be expanded. Current 25 is not enough.', '2025-03-28 14:00:00'),
      ('James Wilson', 'project', 1, 'Updated: 420 reviews done! Should finish by tomorrow.', '2025-03-29 16:00:00')
    `);

    // ── Guidelines (15) ──────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO guidelines (project_id, title, content, version, status) VALUES
      (1, 'Sentiment Labeling Guide', 'Classify each review as Positive, Negative, or Neutral based on overall tone. Mixed reviews with both positive and negative aspects should be classified by the dominant sentiment. Sarcasm should be labeled by intended meaning.', '2.1', 'published'),
      (2, 'Medical Image Annotation Standards', 'All X-ray images must be reviewed by certified annotators. Mark affected regions with bounding boxes. Use the pneumonia label only when opacity is clearly visible. Document uncertainty in metadata.', '3.0', 'published'),
      (3, 'NER Annotation Rules', 'Tag all person names, organizations, dates, monetary amounts, and locations. Use the longest possible span for entity text. Nested entities should use the outermost type.', '1.5', 'published'),
      (5, 'Object Detection Labeling Protocol', 'Draw tight bounding boxes around each object. Partially visible objects should still be labeled. Minimum box size is 20x20 pixels. Label occluded objects as "occluded" in metadata.', '2.0', 'published'),
      (6, 'Toxicity Detection Guidelines', 'Content is toxic if it contains hate speech, harassment, threats, or severe insults. Mild disagreements are NOT toxic. Consider cultural context. When in doubt, mark as "borderline" for review.', '1.8', 'published'),
      (4, 'Product Review Categorization', 'Assign the most specific category possible. Reviews mentioning multiple aspects should be tagged with the primary complaint or praise topic.', '1.2', 'published'),
      (8, 'Audio Emotion Labeling Guide', 'Listen to the full clip before labeling. Primary emotions: happy, sad, angry, frustrated, neutral, surprised. If multiple emotions, choose the strongest.', '1.0', 'published'),
      (9, 'Product Image Tagging Standards', 'Tag all visible attributes: color, material, size category, style. Use standardized values from the approved taxonomy. Minimum 3 tags per image.', '2.3', 'published'),
      (11, 'Intent Classification Rulebook', 'Classify user messages into the most specific intent category. Multi-intent messages use the primary action intent. Questions about features = "inquiry", requests to change = "modification".', '1.4', 'published'),
      (12, 'Wildlife Species ID Guide', 'Identify species to the most specific level possible. If species is uncertain, use genus level. Night/IR images should note visibility conditions. Groups of animals need individual labels.', '1.1', 'draft'),
      (13, 'Resume Parsing Instructions', 'Extract: name, email, phone, education, experience entries, skills. Each experience entry needs: company, title, dates, description. Skills should be normalized to standard terms.', '1.3', 'published'),
      (14, 'Satellite Segmentation Guide', 'Segment into: urban, agricultural, forest, water, barren, wetland. Use polygon tool for precise boundaries. Minimum segment area: 100 sq meters. Cloud-covered areas labeled as "cloud".', '2.0', 'published'),
      (15, 'Spam Detection Criteria', 'Spam: unsolicited promotions, phishing attempts, scams. Legitimate: personal emails, business correspondence, transactional emails. Newsletters the user subscribed to are NOT spam.', '1.6', 'published'),
      (10, 'Summary QA Checklist', 'Check for: factual accuracy, key point coverage, appropriate length, no hallucinations, neutral tone. Rate each aspect 1-5. Overall score below 3 = rejected.', '1.0', 'published'),
      (1, 'Edge Cases for Sentiment', 'Backhanded compliments = Negative. Objective product descriptions = Neutral. Feature requests without sentiment = Neutral. Price complaints with product praise = Mixed -> use dominant sentiment.', '1.0', 'draft')
    `);

    // ── Data Imports (15) ────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO data_imports (name, project_id, dataset_id, source, format, status, total_items, imported_items, errors, error_log) VALUES
      ('Customer Reviews CSV Import', 1, 1, 'file', 'csv', 'completed', 5000, 5000, 0, null),
      ('X-Ray Images Batch Upload', 2, 2, 'file', 'dicom', 'completed', 15000, 15000, 0, null),
      ('Legal Docs Import', 3, 3, 'file', 'pdf', 'completed', 2500, 2500, 0, null),
      ('Amazon API Sync', 4, 4, 'api', 'json', 'completed', 25000, 25000, 0, null),
      ('Dashcam Footage Extract', 5, 5, 'file', 'jpg', 'completed', 100000, 100000, 0, null),
      ('Twitter API Pull', 6, 6, 'api', 'json', 'completed', 50000, 50000, 0, null),
      ('SEC EDGAR Scrape', 7, 7, 'api', 'html', 'completed', 3200, 3200, 0, null),
      ('Audio Upload Batch 1', 8, 8, 'file', 'wav', 'completed', 5000, 5000, 0, null),
      ('Audio Upload Batch 2', 8, 8, 'file', 'wav', 'failed', 3000, 2100, 900, 'Format error: 900 files had incorrect sample rate'),
      ('E-Commerce API Sync', 9, 9, 'api', 'json', 'completed', 75000, 75000, 0, null),
      ('News RSS Import', 10, 10, 'api', 'xml', 'completed', 10000, 10000, 0, null),
      ('Chat Export Import', 11, 11, 'file', 'csv', 'completed', 30000, 30000, 0, null),
      ('Camera Trap SD Cards', 12, 12, 'file', 'jpg', 'in_progress', 45000, 38000, 0, null),
      ('Resume PDF Batch', 13, 13, 'file', 'pdf', 'completed', 5000, 5000, 0, null),
      ('Sentinel API Download', 14, 14, 'api', 'tiff', 'in_progress', 20000, 16500, 0, null)
    `);

    // ── Reports (15) ─────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO reports (name, type, project_id, filters, status, file_url, file_size) VALUES
      ('Q1 2025 Labeling Summary', 'summary', null, '{"quarter": "Q1", "year": 2025}', 'completed', '/reports/q1_2025_summary.pdf', '2.4 MB'),
      ('Sentiment Project Progress', 'progress', 1, '{"date_range": "2025-01-01 to 2025-03-31"}', 'completed', '/reports/sentiment_progress.pdf', '1.8 MB'),
      ('Annotator Performance Report', 'performance', null, '{"period": "March 2025"}', 'completed', '/reports/annotator_performance_mar.pdf', '3.1 MB'),
      ('Medical Annotation Quality Audit', 'quality', 2, '{"audit_type": "quarterly"}', 'completed', '/reports/medical_quality_audit.pdf', '4.5 MB'),
      ('Inter-Annotator Agreement Analysis', 'agreement', 1, '{"annotators": ["James Wilson", "Priya Patel"]}', 'completed', '/reports/iaa_analysis.pdf', '1.2 MB'),
      ('Object Detection Accuracy Report', 'accuracy', 5, '{"metric": "mAP"}', 'completed', '/reports/od_accuracy.pdf', '2.8 MB'),
      ('Toxicity Detection Metrics', 'metrics', 6, '{"metrics": ["precision", "recall", "f1"]}', 'completed', '/reports/toxicity_metrics.pdf', '1.5 MB'),
      ('Team Productivity Weekly', 'productivity', null, '{"week": "2025-W13"}', 'completed', '/reports/team_weekly_w13.pdf', '980 KB'),
      ('Dataset Coverage Report', 'coverage', null, '{"threshold": 80}', 'completed', '/reports/dataset_coverage.pdf', '2.1 MB'),
      ('Label Distribution Analysis', 'distribution', 1, '{"labels": ["Positive", "Negative", "Neutral"]}', 'completed', '/reports/label_distribution.pdf', '1.3 MB'),
      ('Cost Analysis Report', 'cost', null, '{"period": "Q1 2025"}', 'completed', '/reports/cost_analysis_q1.pdf', '1.7 MB'),
      ('Compliance Audit Trail', 'compliance', null, '{"standard": "SOC2"}', 'completed', '/reports/compliance_audit.pdf', '5.2 MB'),
      ('Export History Summary', 'export_history', null, '{}', 'completed', '/reports/export_history.pdf', '890 KB'),
      ('Error Rate Analysis', 'errors', null, '{"period": "2025-03"}', 'processing', null, null),
      ('Monthly Executive Summary', 'executive', null, '{"month": "March 2025"}', 'processing', null, null)
    `);

    // ── Tags (15) ────────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO tags (name, color) VALUES
      ('urgent', '#EF4444'),
      ('high-priority', '#F97316'),
      ('low-priority', '#6B7280'),
      ('medical', '#8B5CF6'),
      ('nlp', '#3B82F6'),
      ('computer-vision', '#06B6D4'),
      ('production', '#22C55E'),
      ('staging', '#EAB308'),
      ('needs-review', '#F59E0B'),
      ('approved', '#22C55E'),
      ('deprecated', '#6B7280'),
      ('compliance', '#EC4899'),
      ('customer-facing', '#8B5CF6'),
      ('internal', '#64748B'),
      ('experimental', '#A855F7')
    `);

    // ── Resource Tags (15) ───────────────────────────────────────────────────
    await client.query(`
      INSERT INTO resource_tags (tag_id, resource_type, resource_id) VALUES
      (1, 'task', 2),
      (4, 'project', 2),
      (5, 'project', 1),
      (5, 'project', 3),
      (6, 'project', 5),
      (6, 'project', 9),
      (6, 'project', 12),
      (6, 'project', 14),
      (7, 'dataset', 1),
      (7, 'dataset', 7),
      (8, 'dataset', 4),
      (9, 'task', 3),
      (10, 'annotation', 1),
      (12, 'project', 7),
      (13, 'project', 11)
    `);

    // ── Activity Feed (15) ───────────────────────────────────────────────────
    await client.query(`
      INSERT INTO activity_feed (user_name, action, resource_type, resource_id, details, created_at) VALUES
      ('Admin User', 'created project', 'project', 1, 'Created Customer Sentiment Analysis project', '2025-03-01 09:00:00'),
      ('Sarah Chen', 'uploaded dataset', 'dataset', 1, 'Uploaded Customer Reviews Q1 2025 (5000 items)', '2025-03-02 10:30:00'),
      ('James Wilson', 'started labeling', 'task', 1, 'Began labeling Q1 Customer Reviews Batch 1', '2025-03-15 14:00:00'),
      ('James Wilson', 'created annotation', 'annotation', 1, 'Labeled review as Positive with 98.5% confidence', '2025-03-15 14:30:00'),
      ('David Kim', 'approved review', 'review', 1, 'Approved annotation #1 - Correctly labeled', '2025-03-28 10:30:00'),
      ('Maria Garcia', 'completed task', 'task', 6, 'Finished moderating Twitter Posts Batch 3', '2025-03-30 17:00:00'),
      ('Admin User', 'generated export', 'export', 1, 'Exported Sentiment Analysis Full Export (4200 records)', '2025-03-20 16:00:00'),
      ('Ava Taylor', 'flagged quality', 'quality_metric', 7, 'Object Detection mAP below threshold (82.3 < 85.0)', '2025-03-27 10:00:00'),
      ('Alex Thompson', 'assigned task', 'task', 5, 'Assigned Object Detection task to Emma Johnson', '2025-03-10 11:00:00'),
      ('Priya Patel', 'added comment', 'project', 3, 'Noted ambiguous entity boundaries in NDA contracts', '2025-03-28 15:00:00'),
      ('System', 'auto-labeled batch', 'auto_label', 1, 'Auto-labeled 10 items for Sentiment Analysis', '2025-03-26 14:00:00'),
      ('Olivia Davis', 'updated guidelines', 'guideline', 8, 'Updated Product Image Tagging Standards to v2.3', '2025-03-27 13:00:00'),
      ('Noah Anderson', 'imported data', 'data_import', 13, 'Started importing Camera Trap SD Cards (45000 items)', '2025-03-20 09:00:00'),
      ('Admin User', 'generated report', 'report', 1, 'Generated Q1 2025 Labeling Summary', '2025-03-31 08:00:00'),
      ('Sarah Chen', 'paused project', 'project', 12, 'Paused Wildlife Species Identification project', '2025-03-25 11:00:00')
    `);

    // ── Templates (15) ───────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO templates (name, type, description, config, status) VALUES
      ('Text Classification Starter', 'project', 'Basic text classification project with positive/negative/neutral labels', '{"type": "text_classification", "labels": ["Positive", "Negative", "Neutral"], "review_required": true}', 'active'),
      ('Image Classification Starter', 'project', 'Image classification project with customizable categories', '{"type": "image_classification", "labels": [], "review_required": true, "min_annotations": 2}', 'active'),
      ('NER Project Template', 'project', 'Named entity recognition with common entity types', '{"type": "ner", "labels": ["Person", "Organization", "Location", "Date", "Money"], "review_required": true}', 'active'),
      ('Object Detection Template', 'project', 'Object detection with bounding box annotations', '{"type": "object_detection", "labels": [], "annotation_type": "bbox", "min_iou": 0.5}', 'active'),
      ('Sentiment Analysis Labels', 'label_set', 'Standard sentiment analysis label set', '{"labels": [{"name": "Positive", "color": "#22C55E"}, {"name": "Negative", "color": "#EF4444"}, {"name": "Neutral", "color": "#6B7280"}]}', 'active'),
      ('Content Moderation Labels', 'label_set', 'Labels for content moderation tasks', '{"labels": [{"name": "Safe", "color": "#22C55E"}, {"name": "Toxic", "color": "#EF4444"}, {"name": "Borderline", "color": "#EAB308"}]}', 'active'),
      ('Medical Imaging Labels', 'label_set', 'Medical imaging classification labels', '{"labels": [{"name": "Normal", "color": "#22C55E"}, {"name": "Abnormal", "color": "#EF4444"}, {"name": "Needs Review", "color": "#F59E0B"}]}', 'active'),
      ('Standard QA Workflow', 'workflow', 'Standard quality assurance workflow with review step', '{"steps": ["annotate", "review", "approve"], "min_reviewers": 1, "auto_assign": true}', 'active'),
      ('Double-Blind Review', 'workflow', 'Two independent annotators with adjudication', '{"steps": ["annotate_1", "annotate_2", "adjudicate"], "min_agreement": 0.8}', 'active'),
      ('Quick Label Workflow', 'workflow', 'Fast labeling without review for low-risk tasks', '{"steps": ["annotate"], "review_required": false, "auto_approve": true}', 'active'),
      ('CSV Import Config', 'import', 'Standard CSV import configuration', '{"format": "csv", "delimiter": ",", "has_header": true, "text_column": "text", "label_column": "label"}', 'active'),
      ('JSONL Import Config', 'import', 'JSONL import for structured data', '{"format": "jsonl", "text_field": "text", "label_field": "label", "metadata_fields": ["id", "source"]}', 'active'),
      ('COCO Export Config', 'export', 'COCO format export for object detection', '{"format": "coco_json", "include_images": false, "split_ratio": "80/10/10"}', 'active'),
      ('Annotator Onboarding', 'checklist', 'Checklist for new annotator onboarding', '{"steps": ["Read guidelines", "Complete tutorial", "Pass qualification test", "Start with easy tasks"]}', 'active'),
      ('Deprecated V1 Template', 'project', 'Old template format - do not use', '{"type": "generic", "labels": ["Yes", "No"]}', 'inactive')
    `);

    // Reset sequences for new tables
    const newTables = ['notifications','comments','guidelines','data_imports','reports','tags','resource_tags','activity_feed','saved_filters','templates'];
    for (const t of newTables) {
      try {
        await client.query(`SELECT setval('${t}_id_seq', (SELECT COALESCE(MAX(id),0) FROM ${t}))`);
      } catch(e) { /* ignore if seq doesn't exist */ }
    }

    await client.query('COMMIT');
    res.json({ message: 'Database seeded successfully with sample data for all tables' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─── Profile ────────────────────────────────────────────────────────────────

app.get('/api/profile', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, email, name, role, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/profile', async (req, res) => {
  try {
    const { name, email } = req.body;
    const result = await pool.query(
      'UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email) WHERE id = $3 RETURNING id, email, name, role, created_at',
      [name, email, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/profile/password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both passwords required' });
    const user = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (user.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const valid = await bcrypt.compare(current_password, user.rows[0].password);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hashed, req.user.id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Notifications ──────────────────────────────────────────────────────────

const notificationsRouter = express.Router();
notificationsRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM notifications WHERE user_id = $1 OR user_id IS NULL ORDER BY id DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
notificationsRouter.put('/:id/read', async (req, res) => {
  try {
    const result = await pool.query('UPDATE notifications SET read = true WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
notificationsRouter.put('/read-all', async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET read = true WHERE user_id = $1 OR user_id IS NULL', [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
notificationsRouter.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM notifications WHERE id = $1', [req.params.id]);
    res.json({ message: 'Notification deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.use('/api/notifications', notificationsRouter);

// ─── Comments ───────────────────────────────────────────────────────────────

const commentsRouter = express.Router();
commentsRouter.get('/', async (req, res) => {
  try {
    const { resource_type, resource_id } = req.query;
    let query = 'SELECT * FROM comments';
    const params = [];
    if (resource_type && resource_id) {
      query += ' WHERE resource_type = $1 AND resource_id = $2';
      params.push(resource_type, resource_id);
    }
    query += ' ORDER BY id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
commentsRouter.post('/', async (req, res) => {
  try {
    const { resource_type, resource_id, content } = req.body;
    if (!resource_type || !resource_id || !content) return res.status(400).json({ error: 'resource_type, resource_id, and content are required' });
    const result = await pool.query(
      'INSERT INTO comments (user_name, resource_type, resource_id, content) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.name || 'Unknown', resource_type, resource_id, content]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
commentsRouter.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM comments WHERE id = $1', [req.params.id]);
    res.json({ message: 'Comment deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.use('/api/comments', commentsRouter);

// ─── Guidelines ─────────────────────────────────────────────────────────────

const guidelinesRouter = express.Router();
buildCrudRoutes(guidelinesRouter, 'guidelines', 'Guideline', [
  'project_id', 'title', 'content', 'version', 'status', 'updated_at'
]);
app.use('/api/guidelines', guidelinesRouter);

// ─── Data Imports ───────────────────────────────────────────────────────────

const dataImportsRouter = express.Router();
buildCrudRoutes(dataImportsRouter, 'data_imports', 'DataImport', [
  'name', 'project_id', 'dataset_id', 'source', 'format', 'status', 'total_items', 'imported_items', 'errors', 'error_log'
]);
app.use('/api/data-imports', dataImportsRouter);

// ─── Reports ────────────────────────────────────────────────────────────────

const reportsRouter = express.Router();
buildCrudRoutes(reportsRouter, 'reports', 'Report', [
  'name', 'type', 'project_id', 'filters', 'status', 'file_url', 'file_size'
]);
app.use('/api/reports', reportsRouter);

// ─── Tags ───────────────────────────────────────────────────────────────────

const tagsRouter = express.Router();
buildCrudRoutes(tagsRouter, 'tags', 'Tag', ['name', 'color']);

tagsRouter.post('/:id/assign', async (req, res) => {
  try {
    const { resource_type, resource_id } = req.body;
    if (!resource_type || !resource_id) return res.status(400).json({ error: 'resource_type and resource_id required' });
    const result = await pool.query(
      'INSERT INTO resource_tags (tag_id, resource_type, resource_id) VALUES ($1, $2, $3) RETURNING *',
      [req.params.id, resource_type, resource_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

tagsRouter.delete('/:id/unassign', async (req, res) => {
  try {
    const { resource_type, resource_id } = req.body;
    await pool.query(
      'DELETE FROM resource_tags WHERE tag_id = $1 AND resource_type = $2 AND resource_id = $3',
      [req.params.id, resource_type, resource_id]
    );
    res.json({ message: 'Tag unassigned' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/resource-tags', async (req, res) => {
  try {
    const { resource_type, resource_id } = req.query;
    let query = 'SELECT rt.*, t.name as tag_name, t.color as tag_color FROM resource_tags rt JOIN tags t ON rt.tag_id = t.id';
    const params = [];
    if (resource_type && resource_id) {
      query += ' WHERE rt.resource_type = $1 AND rt.resource_id = $2';
      params.push(resource_type, resource_id);
    }
    query += ' ORDER BY rt.id DESC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.use('/api/tags', tagsRouter);

// ─── Activity Feed ──────────────────────────────────────────────────────────

app.get('/api/activity-feed', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const result = await pool.query('SELECT * FROM activity_feed ORDER BY id DESC LIMIT $1', [limit]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Saved Filters ──────────────────────────────────────────────────────────

const savedFiltersRouter = express.Router();
savedFiltersRouter.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM saved_filters WHERE user_id = $1 ORDER BY id DESC', [req.user.id]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
savedFiltersRouter.post('/', async (req, res) => {
  try {
    const { name, page, filters } = req.body;
    if (!name || !page) return res.status(400).json({ error: 'name and page are required' });
    const result = await pool.query(
      'INSERT INTO saved_filters (user_id, name, page, filters) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, name, page, JSON.stringify(filters || {})]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});
savedFiltersRouter.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM saved_filters WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Saved filter deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.use('/api/saved-filters', savedFiltersRouter);

// ─── Templates ──────────────────────────────────────────────────────────────

const templatesRouter = express.Router();
buildCrudRoutes(templatesRouter, 'templates', 'Template', [
  'name', 'type', 'description', 'config', 'status'
]);
app.use('/api/templates', templatesRouter);

// ─── New Feature Routes ───────────────────────────────────────────────────────

app.use('/api/auto-label', require('./routes/autoLabeling'));
app.use('/api/analytics', require('./routes/analytics'));
// Also expose /api/ai/label-suggestions alongside existing /api/ai/* inline routes
app.use('/api/ai', require('./routes/analytics'));

app.use('/api/ai', require('./routes/activeLearning'));

app.use('/api/ai', require('./routes/crowdConsensus'));

app.use('/api/ai', require('./routes/labelQuality'));

app.use('/api/ai', require('./routes/similarityCluster'));

app.use('/api/ai', require('./routes/labelerScoring'));
app.use('/api/export', require('./routes/export'));
app.use('/api/ai-features', require('./routes/aiFeatures'));

// ─── Health Check ────────────────────────────────────────────────────────────

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start Server ────────────────────────────────────────────────────────────

async function start() {
  await initDatabase();
// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-missing-auto-label-suggest-labels-detect-disagreement-identi', require('./routes/gap_missing_auto_label_suggest_labels_detect_disagreement_identi'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-no-dataset-management-or-versioning-surface', require('./routes/gap_no_dataset_management_or_versioning_surface'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-no-user-labeler-management-and-quality-control-workflows', require('./routes/gap_no_user_labeler_management_and_quality_control_workflows'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-no-label-schema-definition-and-validation-engine', require('./routes/gap_no_label_schema_definition_and_validation_engine'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-no-integration-with-ml-training-pipelines', require('./routes/gap_no_integration_with_ml_training_pipelines'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-no-payment-billing-module', require('./routes/gap_no_payment_billing_module'));

// // === Batch 02 Gaps & Frontend Mounts ===
app.use('/api/gap-no-calendar-integration', require('./routes/gap_no_calendar_integration'));

  app.listen(PORT, () => {
    console.log(`AI Data Labeling Platform backend running on port ${PORT}`);
  });
}

start();
