import React, { useState } from 'react';
import api from '../api';

/* ── helpers to parse AI text responses into structured display ── */

function parseSentiment(text) {
  if (!text) return null;
  const str = typeof text === 'object' ? JSON.stringify(text) : String(text);
  const lower = str.toLowerCase();

  let sentiment = null;
  let confidence = null;

  // Try JSON-like structures
  const sentimentMatch = lower.match(/["']?sentiment["']?\s*[:=]\s*["']?(positive|negative|neutral|mixed)["']?/i);
  if (sentimentMatch) sentiment = sentimentMatch[1].toLowerCase();
  if (!sentiment) {
    if (lower.includes('positive')) sentiment = 'positive';
    else if (lower.includes('negative')) sentiment = 'negative';
    else if (lower.includes('neutral')) sentiment = 'neutral';
    else if (lower.includes('mixed')) sentiment = 'mixed';
  }

  const confMatch = str.match(/(?:confidence|score|probability)\s*[:=]\s*([\d.]+)%?/i);
  if (confMatch) {
    confidence = parseFloat(confMatch[1]);
    if (confidence > 1) confidence /= 100;
  }

  return sentiment ? { sentiment, confidence } : null;
}

function parseClassification(text) {
  if (!text) return null;
  const str = typeof text === 'object' ? JSON.stringify(text) : String(text);
  const categories = [];

  // Pattern: "Category: 0.85" or "Category (85%)"
  const pattern1 = /[•\-*]?\s*([A-Za-z][\w\s/&]+?)[:]\s*([\d.]+)%?/g;
  let match;
  while ((match = pattern1.exec(str)) !== null) {
    const label = match[1].trim();
    let conf = parseFloat(match[2]);
    if (conf > 1) conf /= 100;
    if (conf >= 0 && conf <= 1 && label.length < 40) {
      categories.push({ label, confidence: conf });
    }
  }

  // Pattern: "Category (85%)"
  if (categories.length === 0) {
    const pattern2 = /([A-Za-z][\w\s/&]+?)\s*\((\d+(?:\.\d+)?)%?\)/g;
    while ((match = pattern2.exec(str)) !== null) {
      const label = match[1].trim();
      let conf = parseFloat(match[2]);
      if (conf > 1) conf /= 100;
      if (conf >= 0 && conf <= 1 && label.length < 40) {
        categories.push({ label, confidence: conf });
      }
    }
  }

  // Try JSON array
  if (categories.length === 0) {
    try {
      const parsed = typeof text === 'object' ? text : JSON.parse(str);
      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          if (item.label && item.confidence != null) {
            categories.push({ label: item.label, confidence: item.confidence > 1 ? item.confidence / 100 : item.confidence });
          } else if (item.category && item.score != null) {
            categories.push({ label: item.category, confidence: item.score > 1 ? item.score / 100 : item.score });
          }
        });
      } else if (parsed.categories || parsed.classifications || parsed.results) {
        const arr = parsed.categories || parsed.classifications || parsed.results;
        if (Array.isArray(arr)) {
          arr.forEach(item => {
            const label = item.label || item.category || item.name || '';
            const conf = item.confidence || item.score || item.probability || 0;
            categories.push({ label, confidence: conf > 1 ? conf / 100 : conf });
          });
        }
      }
    } catch {}
  }

  return categories.length > 0 ? categories.sort((a, b) => b.confidence - a.confidence) : null;
}

function parseNER(text) {
  if (!text) return null;
  const str = typeof text === 'object' ? JSON.stringify(text) : String(text);
  const entities = [];

  // Try JSON parsing
  try {
    const parsed = typeof text === 'object' ? text : JSON.parse(str);
    const arr = Array.isArray(parsed) ? parsed : (parsed.entities || parsed.results || []);
    if (Array.isArray(arr)) {
      arr.forEach(item => {
        if (item.entity || item.text || item.word) {
          entities.push({
            text: item.text || item.word || item.entity || '',
            type: (item.type || item.label || item.entity_type || item.category || 'MISC').toUpperCase(),
          });
        }
      });
    }
  } catch {}

  // Pattern: "Entity (TYPE)" or "Entity [TYPE]"
  if (entities.length === 0) {
    const pattern = /[•\-*]\s*(.+?)\s*[\[(](PERSON|ORG|ORGANIZATION|LOCATION|LOC|GPE|DATE|TIME|MONEY|PERCENT|PRODUCT|EVENT|MISC|OTHER)[\])]/gi;
    let match;
    while ((match = pattern.exec(str)) !== null) {
      entities.push({ text: match[1].trim(), type: match[2].toUpperCase() });
    }
  }

  // Pattern: "TYPE: Entity"
  if (entities.length === 0) {
    const pattern = /(PERSON|ORG|ORGANIZATION|LOCATION|LOC|GPE|DATE|TIME|MONEY|PERCENT|PRODUCT|EVENT)\s*[:]\s*(.+?)(?:\n|$|,)/gi;
    let match;
    while ((match = pattern.exec(str)) !== null) {
      match[2].split(',').forEach(e => {
        const trimmed = e.trim().replace(/^["']|["']$/g, '');
        if (trimmed) entities.push({ text: trimmed, type: match[1].toUpperCase() });
      });
    }
  }

  return entities.length > 0 ? entities : null;
}

/* ── Sub-components for displaying results ── */

function SentimentResult({ data, rawText }) {
  const colors = {
    positive: { cls: 'sentiment-positive', bg: '#22c55e' },
    negative: { cls: 'sentiment-negative', bg: '#ef4444' },
    neutral: { cls: 'sentiment-neutral', bg: '#eab308' },
    mixed: { cls: 'sentiment-mixed', bg: '#3b82f6' },
  };
  const c = colors[data.sentiment] || colors.neutral;

  return (
    <div className="ai-result-card">
      <div className="ai-result-header">Sentiment Analysis Result</div>
      <div className="sentiment-display">
        <div className={`sentiment-badge ${c.cls}`}>{data.sentiment}</div>
        {data.confidence != null && (
          <div className="confidence-meter">
            <div className="confidence-label">Confidence: {(data.confidence * 100).toFixed(1)}%</div>
            <div className="confidence-bar-bg">
              <div className="confidence-bar-fill" style={{ width: `${data.confidence * 100}%`, background: c.bg }}></div>
            </div>
          </div>
        )}
      </div>
      {rawText && <div className="ai-raw-result" style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>{rawText}</div>}
    </div>
  );
}

function ClassificationResult({ categories, rawText }) {
  const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#22c55e', '#eab308', '#ef4444', '#ec4899', '#f97316'];
  return (
    <div className="ai-result-card">
      <div className="ai-result-header">Classification Result</div>
      <div className="classification-list">
        {categories.map((c, i) => (
          <div key={i} className="classification-item">
            <span className="classification-label">{c.label}</span>
            <div className="classification-bar-bg">
              <div
                className="classification-bar-fill"
                style={{
                  width: `${Math.max(c.confidence * 100, 8)}%`,
                  background: `linear-gradient(90deg, ${colors[i % colors.length]}, ${colors[(i + 1) % colors.length]})`,
                }}
              >
                {(c.confidence * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        ))}
      </div>
      {rawText && <div className="ai-raw-result" style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>{rawText}</div>}
    </div>
  );
}

function NERResult({ entities, rawText }) {
  const typeColors = {
    PERSON: 'ner-person', ORG: 'ner-org', ORGANIZATION: 'ner-org',
    LOCATION: 'ner-location', LOC: 'ner-location', GPE: 'ner-gpe',
    DATE: 'ner-date', TIME: 'ner-time', MONEY: 'ner-money',
    PERCENT: 'ner-percent', PRODUCT: 'ner-product', EVENT: 'ner-event',
    MISC: 'ner-misc', OTHER: 'ner-other',
  };

  const uniqueTypes = [...new Set(entities.map(e => e.type))];
  const dotColors = {
    PERSON: '#60a5fa', ORG: '#c084fc', ORGANIZATION: '#c084fc',
    LOCATION: '#4ade80', LOC: '#4ade80', GPE: '#4ade80',
    DATE: '#fbbf24', TIME: '#fbbf24', MONEY: '#22d3ee',
    PERCENT: '#22d3ee', PRODUCT: '#fb7185', EVENT: '#fb7185',
    MISC: '#94a3b8', OTHER: '#94a3b8',
  };

  return (
    <div className="ai-result-card">
      <div className="ai-result-header">Named Entity Recognition Result</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        {entities.map((e, i) => (
          <span key={i} className={`ner-entity ${typeColors[e.type] || 'ner-misc'}`}>
            {e.text}
            <span className="ner-entity-label">{e.type}</span>
          </span>
        ))}
      </div>
      <div className="ner-legend">
        {uniqueTypes.map(t => (
          <div key={t} className="ner-legend-item">
            <span className="ner-legend-dot" style={{ background: dotColors[t] || '#94a3b8' }}></span>
            {t}
          </div>
        ))}
      </div>
      {rawText && <div className="ai-raw-result" style={{ marginTop: 16, fontSize: 13, color: 'var(--text-secondary)' }}>{rawText}</div>}
    </div>
  );
}

function SummaryResult({ text }) {
  return (
    <div className="ai-result-card">
      <div className="ai-result-header">Summary Result</div>
      <div className="summary-card">
        {text}
        <div className="summary-meta">Generated by AI</div>
      </div>
    </div>
  );
}

function SmartResultDisplay({ result, type }) {
  if (!result) return null;
  const rawText = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

  // Try type-specific parsing first
  if (type === 'sentiment') {
    const parsed = parseSentiment(result);
    if (parsed) return <SentimentResult data={parsed} rawText={rawText} />;
  }

  if (type === 'classify') {
    const parsed = parseClassification(result);
    if (parsed) return <ClassificationResult categories={parsed} rawText={rawText} />;
  }

  if (type === 'ner') {
    const parsed = parseNER(result);
    if (parsed) return <NERResult entities={parsed} rawText={rawText} />;
  }

  if (type === 'summarize') {
    return <SummaryResult text={rawText} />;
  }

  // Auto-detect from content
  const sentiment = parseSentiment(result);
  if (sentiment) return <SentimentResult data={sentiment} rawText={rawText} />;

  const ner = parseNER(result);
  if (ner) return <NERResult entities={ner} rawText={rawText} />;

  const classification = parseClassification(result);
  if (classification) return <ClassificationResult categories={classification} rawText={rawText} />;

  // Fallback
  return (
    <div className="ai-result-card">
      <div className="ai-result-header">AI Result</div>
      <div className="summary-card">{rawText}</div>
    </div>
  );
}

/* ── AI Service Section Component ── */

function AIServiceSection({ icon, title, subtitle, type, endpoint, placeholder }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRun = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await api.post(endpoint, { text });
      setResult(res.data.result || res.data.data || res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'AI service request failed');
    }
    setLoading(false);
  };

  return (
    <div className="ai-section">
      <div className="ai-section-title">{icon} {title}</div>
      <div className="ai-section-subtitle">{subtitle}</div>

      <textarea
        className="form-textarea"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
      />

      <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={handleRun} disabled={loading || !text.trim()}>
          {loading ? (
            <>
              <span className="spinner spinner-sm"></span>
              Processing...
            </>
          ) : (
            `Run ${title}`
          )}
        </button>
        {result && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setResult(null); setError(''); }}>
            Clear Result
          </button>
        )}
      </div>

      {error && <div className="error-banner" style={{ marginTop: 16 }}>{error}</div>}
      {result && <SmartResultDisplay result={result} type={type} />}
    </div>
  );
}

/* ── Main AI Services Page ── */

export default function AIServices() {
  return (
    <div>
      <div className="page-header">
        <h1><span className="page-header-icon">🧠</span> AI Services</h1>
      </div>

      <AIServiceSection
        icon="🏷️"
        title="Text Classification"
        subtitle="Classify text into predefined categories with confidence scores"
        type="classify"
        endpoint="/ai/classify"
        placeholder="Enter text to classify... e.g., 'The new iPhone features an improved camera system with 48MP sensor and computational photography.'"
      />

      <AIServiceSection
        icon="💭"
        title="Sentiment Analysis"
        subtitle="Detect the emotional tone and sentiment of text"
        type="sentiment"
        endpoint="/ai/sentiment"
        placeholder="Enter text to analyze sentiment... e.g., 'I absolutely love this product! The quality exceeded my expectations.'"
      />

      <AIServiceSection
        icon="🔍"
        title="Named Entity Recognition"
        subtitle="Extract and identify named entities like people, organizations, and locations"
        type="ner"
        endpoint="/ai/ner"
        placeholder="Enter text for entity extraction... e.g., 'Apple CEO Tim Cook announced a new partnership with Microsoft at the CES conference in Las Vegas on January 15, 2025.'"
      />

      <AIServiceSection
        icon="📄"
        title="Text Summarization"
        subtitle="Generate concise summaries of longer text"
        type="summarize"
        endpoint="/ai/summarize"
        placeholder="Enter a longer text to summarize... Paste an article, document, or any text you want condensed into key points."
      />
    </div>
  );
}
