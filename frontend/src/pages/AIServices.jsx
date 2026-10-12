import React, { useRef, useState } from 'react';
import api from '../api';
import AIReport from '../components/AIReport';
import { PresetButtons } from '../components/FullFieldPresets';

const SERVICE_PRESETS = {
  classify: [
    { label: 'Support ticket', values: { text: 'The customer reports a duplicate charge on invoice INV-2048 and asks billing support to issue a refund before Friday.' } },
    { label: 'Product feedback', values: { text: 'The new annotation keyboard shortcuts save time, but image zoom becomes unresponsive after reviewing about fifty records.' } },
    { label: 'Policy question', values: { text: 'A reviewer asks whether a medical-image label may be approved when the consent field is missing from the source record.' } },
  ],
  sentiment: [
    { label: 'Positive review', values: { text: 'The labeling team delivered ahead of schedule, documented every decision, and resolved our questions quickly.' } },
    { label: 'Mixed feedback', values: { text: 'The model suggestions are useful and accurate, although the export workflow is slow and the status messages are unclear.' } },
    { label: 'Escalation', values: { text: 'I am frustrated that the same rejected labels returned after the dataset refresh and need a clear resolution today.' } },
  ],
  ner: [
    { label: 'Partnership news', values: { text: 'LabelAI CEO Maya Chen met Northstar Health in Boston on March 12, 2026 to plan a $2 million annotation program.' } },
    { label: 'Legal review', values: { text: 'Jordan Ellis of Harbor Legal sent the Acme Services Agreement to Priya Patel in New York on September 30, 2026.' } },
    { label: 'Product launch', values: { text: 'Orion Labs will launch Atlas Vision at Data Summit Europe in Berlin on November 6, 2026.' } },
  ],
  summarize: [
    { label: 'Quality review', values: { text: 'The weekly quality review covered 1,200 labeled support messages. Agreement rose from 91% to 94% after guideline examples were clarified. Twenty-seven records remain blocked because source language is ambiguous. Reviewers recommend a focused adjudication session, a new gold-set batch, and a follow-up measurement next Friday before expanding the project.' } },
    { label: 'Dataset update', values: { text: 'Version 3 of the retail image dataset adds 8,400 product photos from two approved suppliers. Automated checks found 146 duplicate files, 38 missing category values, and 12 unsupported formats. The data team quarantined those records and retained the previous version for rollback. Publishing is pending owner approval and completion of the supplier-license review.' } },
    { label: 'Operations brief', values: { text: 'The annotation operation completed four of five planned batches this week. Throughput met target, but the legal-document queue missed its service level because two reviewers were reassigned. No customer data was exported. The manager proposes moving one trained reviewer back to the queue, prioritizing overdue contracts, and reporting recovery progress at Monday’s stand-up.' } },
  ],
};

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
  const request = useRef(null);

  const cancel = () => {
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setError('');
  };

  const handleRun = async () => {
    if (!text.trim() || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const res = await api.post(endpoint, { text }, { signal: controller.signal });
      if (request.current === controller) setResult(res.data.result || res.data.data || res.data);
    } catch (err) {
      if (request.current === controller && err.code !== 'ERR_CANCELED') setError(err.response?.data?.error || 'AI service request failed');
    } finally {
      if (request.current === controller) {
        request.current = null;
        setLoading(false);
      }
    }
  };

  return (
    <div className="ai-section">
      <div className="ai-section-title">{icon} {title}</div>
      <div className="ai-section-subtitle">{subtitle}</div>

      <PresetButtons
        presets={SERVICE_PRESETS[type]}
        disabled={loading}
        title="Complete prompt examples"
        description="Choose an example to fill the AI input with valid, reviewable content."
        onApply={({ text: example }) => { setText(example); setResult(null); setError(''); }}
      />
      <textarea
        className="form-textarea"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
      />

      <div style={{ marginTop: 12, display: 'flex', gap: 12, alignItems: 'center' }}>
        <button className="btn btn-primary" onClick={handleRun} disabled={loading || !text.trim()}>
          {loading ? 'Generating…' : `Generate ${title} with OpenRouter`}
        </button>
        {loading && <button type="button" className="btn btn-secondary" onClick={cancel}>Cancel</button>}
        {result && !loading && (
          <button className="btn btn-ghost btn-sm" onClick={() => { setResult(null); setError(''); }}>
            Clear Result
          </button>
        )}
      </div>

      <AIReport response={result} title={`${title} result`} loading={loading} error={error} onRetry={handleRun} />
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
