import { recordRows } from '../recordRows';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import AIReport from '../components/AIReport';
import { PresetButtons } from '../components/FullFieldPresets';

const FEATURE_PRESETS = [
  {
    label: 'Support sentiment', projectOffset: 0, values: {
      dataItem: 'The replacement works well, but support took five days to answer.',
      annotationsJson: '[\n  {"annotator":"Sarah Chen","label":"mixed","confidence":0.88},\n  {"annotator":"James Wilson","label":"negative","confidence":0.74},\n  {"annotator":"Maria Garcia","label":"mixed","confidence":0.91}\n]',
      sampleSize: 10,
      datasetSummary: 'Customer-support messages in English, labeled as positive, negative, neutral, or mixed. The dataset contains 5,000 records with a long tail of billing and delivery complaints.',
      labelCount: '4', strategySampleSize: '500', modality: 'text', labeler: 'Sarah Chen',
      ambigItemsJson: '[\n  {"id":"SUP-104","text":"The replacement works, finally."},\n  {"id":"SUP-219","text":"Not bad once someone answered."},\n  {"id":"SUP-307","text":"It is fine for the price."}\n]',
    },
  },
  {
    label: 'Legal entities', projectOffset: 2, values: {
      dataItem: 'Harbor Legal sent the Acme Services Agreement to Priya Patel in New York on September 30, 2026.',
      annotationsJson: '[\n  {"annotator":"David Kim","label":"organization","confidence":0.93},\n  {"annotator":"Lucas Brown","label":"document_title","confidence":0.86},\n  {"annotator":"Ava Taylor","label":"organization","confidence":0.89}\n]',
      sampleSize: 12,
      datasetSummary: 'English commercial contracts requiring person, organization, location, date, and agreement-title entities. Documents include OCR noise and nested legal names.',
      labelCount: '5', strategySampleSize: '300', modality: 'text', labeler: 'David Kim',
      ambigItemsJson: '[\n  {"id":"CTR-018","text":"Acme may assign this Agreement to Harbor."},\n  {"id":"CTR-044","text":"The New York office approved the amendment."},\n  {"id":"CTR-071","text":"Effective as of the Closing Date."}\n]',
    },
  },
  {
    label: 'Retail images', projectOffset: 8, values: {
      dataItem: 'Studio image of a navy running shoe with a white sole; brand mark is partly occluded.',
      annotationsJson: '[\n  {"annotator":"Priya Patel","label":"running_shoe","confidence":0.92},\n  {"annotator":"Ethan Wang","label":"sneaker","confidence":0.84},\n  {"annotator":"Emma Johnson","label":"running_shoe","confidence":0.90}\n]',
      sampleSize: 15,
      datasetSummary: 'Retail catalog photos labeled by product type, primary color, material, and visible brand. Images include multiple angles, partial occlusion, and supplier background variation.',
      labelCount: '28', strategySampleSize: '750', modality: 'image', labeler: 'Priya Patel',
      ambigItemsJson: '[\n  {"id":"IMG-3801","text":"Navy low-top shoe with partly hidden logo."},\n  {"id":"IMG-4022","text":"Black leather footwear; ankle height is unclear."},\n  {"id":"IMG-4170","text":"Two-piece outfit photographed as one product."}\n]',
    },
  },
];

/**
 * AIFeatures.jsx — UI for the new custom AI endpoints from /api/ai-features/*
 *  • Active Learning prioritizer
 *  • Annotator Conflict Resolver
 *  • Bias Scanner
 *  • QA Sampler
 *  • Past Results audit log (paginated)
 */

function Toast({ message, type, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

function ResultBlock({ data, title, loading, error, onRetry }) {
  return <AIReport response={data} title={title} loading={loading} error={error} onRetry={onRetry} />;
}

function AIRunActions({ running, onRun, onCancel, label }) {
  return <div className="ai-run-actions"><button className="btn btn-primary" onClick={onRun} disabled={running}>{running ? 'Generating…' : `Generate ${label} with OpenRouter`}</button>{running && <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>}</div>;
}

export default function AIFeatures() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState('active');

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);
  const request = useRef(null);

  // Conflict resolver inputs
  const [dataItem, setDataItem] = useState('');
  const [annotationsJson, setAnnotationsJson] = useState('[\n  {"annotator":"alice","label":"positive","confidence":0.8},\n  {"annotator":"bob","label":"negative","confidence":0.7}\n]');

  // QA sampler inputs
  const [sampleSize, setSampleSize] = useState(10);

  // Recommend label strategy inputs
  const [datasetSummary, setDatasetSummary] = useState('');
  const [labelCount, setLabelCount] = useState('');
  const [strategySampleSize, setStrategySampleSize] = useState('');
  const [modality, setModality] = useState('text');

  // Labeler quality score inputs
  const [labeler, setLabeler] = useState('');

  // Identify ambiguous items inputs
  const [ambigItemsJson, setAmbigItemsJson] = useState('[\n  {"id": 1, "text": "It was fine."},\n  {"id": 2, "text": "Not bad, not great."}\n]');

  // Results audit
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [historyFeature, setHistoryFeature] = useState('');

  useEffect(() => {
    api.get('/projects').then((r) => setProjects(recordRows(r.data))).catch(() => setProjects([]));
  }, []);

  const showToast = (message, type = 'success') => setToast({ message, type });
  const failValidation = (message) => { setError(message); showToast(message, 'error'); };
  const cancelRun = () => {
    request.current?.abort();
    request.current = null;
    setRunning(false);
    setError('');
  };
  const execute = async (makeRequest, successMessage) => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRunning(true); setResult(null); setError('');
    try {
      const response = await makeRequest(controller.signal);
      if (request.current !== controller) return;
      setResult(response.data);
      showToast(successMessage);
    } catch (failure) {
      if (request.current === controller && failure.code !== 'ERR_CANCELED') {
        const message = failure.response?.data?.error || 'AI feature request failed';
        const readable = failure.response?.status === 503 ? `AI not configured: ${message}` : message;
        setError(readable);
        showToast(readable, 'error');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setRunning(false);
      }
    }
  };
  const applyPreset = ({ projectOffset, values }) => {
    const project = projects.find((item) => String(item.id) === projectId) || projects[projectOffset % projects.length];
    if (!project) return;
    setProjectId(String(project.id));
    setDataItem(values.dataItem);
    setAnnotationsJson(values.annotationsJson);
    setSampleSize(values.sampleSize);
    setDatasetSummary(values.datasetSummary);
    setLabelCount(values.labelCount);
    setStrategySampleSize(values.strategySampleSize);
    setModality(values.modality);
    setLabeler(values.labeler);
    setAmbigItemsJson(values.ambigItemsJson);
    setResult(null);
    setError('');
  };

  const runActiveLearning = () => {
    if (!projectId) return failValidation('Pick a project first');
    return execute((signal) => api.post(`/ai-features/active-learning/${projectId}`, undefined, { signal }), 'Active learning prioritization complete');
  };

  const runConflictResolver = () => {
    if (!projectId || !dataItem) return failValidation('Project + data item required');
    let annotations;
    try { annotations = JSON.parse(annotationsJson); } catch { return failValidation('Annotations must be valid JSON array'); }
    return execute((signal) => api.post('/ai-features/conflict-resolver', { project_id: projectId, data_item: dataItem, annotations }, { signal }), 'Conflict resolved');
  };

  const runBiasScan = () => {
    if (!projectId) return failValidation('Pick a project first');
    return execute((signal) => api.post(`/ai-features/bias-scan/${projectId}`, undefined, { signal }), 'Bias scan complete');
  };

  const runQASample = () => {
    if (!projectId) return failValidation('Pick a project first');
    return execute((signal) => api.post(`/ai-features/qa-sample/${projectId}`, { sample_size: sampleSize }, { signal }), 'QA sample graded');
  };

  const runRecommendStrategy = () => {
    if (!projectId && !datasetSummary) return failValidation('Pick a project or describe the dataset');
    const body = {
      project_id: projectId || undefined,
      dataset_summary: datasetSummary || undefined,
      label_count: labelCount ? parseInt(labelCount) : undefined,
      sample_size: strategySampleSize ? parseInt(strategySampleSize) : undefined,
      modality,
    };
    return execute((signal) => api.post('/ai-features/recommend-label-strategy', body, { signal }), 'Strategy recommendation ready');
  };

  const runLabelerQuality = () => {
    if (!labeler) return failValidation('Labeler name required');
    return execute((signal) => api.post('/ai-features/labeler-quality-score', { project_id: projectId || undefined, labeler }, { signal }), 'Labeler quality scored');
  };

  const runIdentifyAmbiguous = () => {
    if (!projectId) return failValidation('Pick a project first');
    let items = [];
    if (ambigItemsJson.trim()) {
      try { items = JSON.parse(ambigItemsJson); }
      catch { return failValidation('Items must be valid JSON array'); }
    }
    return execute((signal) => api.post(`/ai-features/identify-ambiguous-items/${projectId}`, { items }, { signal }), 'Ambiguity scan complete');
  };

  const loadHistory = useCallback(async (p = 1) => {
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (historyFeature) params.append('feature', historyFeature);
      if (projectId) params.append('project_id', projectId);
      const r = await api.get(`/ai-features/results?${params.toString()}`);
      setHistory(recordRows(r.data));
      setPage(r.data.pagination?.page || 1);
      setTotalPages(r.data.pagination?.totalPages || 1);
    } catch (e) {
      setHistory([]);
    }
  }, [historyFeature, projectId]);

  useEffect(() => { if (tab === 'history') loadHistory(1); }, [tab, loadHistory]);
  const currentRunner = {
    active: runActiveLearning,
    conflict: runConflictResolver,
    bias: runBiasScan,
    qa: runQASample,
    strategy: runRecommendStrategy,
    quality: runLabelerQuality,
    ambig: runIdentifyAmbiguous,
  }[tab];

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <div className="page-header">
        <h1><span className="page-header-icon">🧪</span> AI Features</h1>
      </div>

      <div className="form-group" style={{ marginBottom: 16 }}>
        <label>Project</label>
        <select className="form-input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">— select —</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <PresetButtons
        presets={FEATURE_PRESETS.map((preset) => ({ label: preset.label, values: preset }))}
        disabled={running || projects.length === 0}
        title="Complete AI workflow examples"
        description="Each example fills every editable AI field on every tab, including optional fields and valid JSON."
        onApply={applyPreset}
      />
      {projects.length === 0 && <p role="status">Create or load a project before using these AI workflow examples.</p>}

      <div className="btn-group" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
        {['active', 'conflict', 'bias', 'qa', 'strategy', 'quality', 'ambig', 'history'].map((t) => (
          <button key={t} className={`btn ${tab === t ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(t)}>
            {t === 'active' ? 'Active Learning' :
             t === 'conflict' ? 'Conflict Resolver' :
             t === 'bias' ? 'Bias Scan' :
             t === 'qa' ? 'QA Sample' :
             t === 'strategy' ? 'Strategy Advisor' :
             t === 'quality' ? 'Labeler Quality' :
             t === 'ambig' ? 'Ambiguous Items' : 'History'}
          </button>
        ))}
      </div>

      {tab === 'active' && (
        <div className="ai-section">
          <div className="ai-section-title">🎯 Active Learning Prioritizer</div>
          <div className="ai-section-subtitle">Rank uncertain items so labelers tackle the highest-impact ones first.</div>
          <AIRunActions running={running} onRun={runActiveLearning} onCancel={cancelRun} label="prioritization" />
        </div>
      )}

      {tab === 'conflict' && (
        <div className="ai-section">
          <div className="ai-section-title">⚖️ Annotator Conflict Resolver</div>
          <div className="form-group"><label>Data item (the text under dispute)</label>
            <textarea className="form-textarea" value={dataItem} rows={3} onChange={(e) => setDataItem(e.target.value)} />
          </div>
          <div className="form-group"><label>Annotations (JSON array of {`{annotator,label,confidence}`})</label>
            <textarea className="form-textarea" value={annotationsJson} rows={6} onChange={(e) => setAnnotationsJson(e.target.value)} />
          </div>
          <AIRunActions running={running} onRun={runConflictResolver} onCancel={cancelRun} label="conflict resolution" />
        </div>
      )}

      {tab === 'bias' && (
        <div className="ai-section">
          <div className="ai-section-title">🧯 Bias Scanner</div>
          <div className="ai-section-subtitle">Surface annotators or classes that skew the dataset.</div>
          <AIRunActions running={running} onRun={runBiasScan} onCancel={cancelRun} label="bias scan" />
        </div>
      )}

      {tab === 'qa' && (
        <div className="ai-section">
          <div className="ai-section-title">🔬 QA Sampler</div>
          <div className="form-group"><label>Sample size (3-20)</label>
            <input className="form-input" type="number" min="3" max="20" value={sampleSize} onChange={(e) => setSampleSize(parseInt(e.target.value) || 10)} />
          </div>
          <AIRunActions running={running} onRun={runQASample} onCancel={cancelRun} label="QA sample" />
        </div>
      )}

      {tab === 'strategy' && (
        <div className="ai-section">
          <div className="ai-section-title">🧭 Labeling Strategy Advisor</div>
          <div className="ai-section-subtitle">Recommend annotator pool, batch size, QA cadence, and gold-set ratio for the dataset.</div>
          <div className="form-group"><label>Dataset summary</label>
            <textarea className="form-textarea" rows={3} value={datasetSummary} onChange={(e) => setDatasetSummary(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="form-group" style={{ flex: 1 }}><label>Label count</label>
              <input className="form-input" type="number" value={labelCount} onChange={(e) => setLabelCount(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}><label>Sample size</label>
              <input className="form-input" type="number" value={strategySampleSize} onChange={(e) => setStrategySampleSize(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}><label>Modality</label>
              <select className="form-input" value={modality} onChange={(e) => setModality(e.target.value)}>
                <option value="text">text</option>
                <option value="image">image</option>
                <option value="audio">audio</option>
                <option value="video">video</option>
              </select>
            </div>
          </div>
          <AIRunActions running={running} onRun={runRecommendStrategy} onCancel={cancelRun} label="strategy recommendation" />
        </div>
      )}

      {tab === 'quality' && (
        <div className="ai-section">
          <div className="ai-section-title">📊 Labeler Quality Score</div>
          <div className="ai-section-subtitle">Score a labeler on accuracy proxy, throughput, consistency, and guideline adherence.</div>
          <div className="form-group"><label>Labeler name (must match annotator field)</label>
            <input className="form-input" value={labeler} onChange={(e) => setLabeler(e.target.value)} placeholder="alice" />
          </div>
          <AIRunActions running={running} onRun={runLabelerQuality} onCancel={cancelRun} label="labeler score" />
        </div>
      )}

      {tab === 'ambig' && (
        <div className="ai-section">
          <div className="ai-section-title">❓ Ambiguous-Item Identifier</div>
          <div className="ai-section-subtitle">List items where reasonable annotators would disagree (vs. just low-confidence).</div>
          <div className="form-group"><label>Optional items to scan (JSON array)</label>
            <textarea className="form-textarea" rows={6} value={ambigItemsJson} onChange={(e) => setAmbigItemsJson(e.target.value)} />
          </div>
          <AIRunActions running={running} onRun={runIdentifyAmbiguous} onCancel={cancelRun} label="ambiguity report" />
        </div>
      )}

      {tab === 'history' && (
        <div className="ai-section">
          <div className="ai-section-title">🗂️ AI Run History</div>
          <div className="form-group" style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label>Filter by feature</label>
              <select className="form-input" value={historyFeature} onChange={(e) => setHistoryFeature(e.target.value)}>
                <option value="">all</option>
                <option value="active_learning">active_learning</option>
                <option value="conflict_resolver">conflict_resolver</option>
                <option value="bias_scan">bias_scan</option>
                <option value="qa_sample">qa_sample</option>
                <option value="recommend_label_strategy">recommend_label_strategy</option>
                <option value="labeler_quality_score">labeler_quality_score</option>
                <option value="identify_ambiguous_items">identify_ambiguous_items</option>
              </select>
            </div>
            <button className="btn btn-secondary" onClick={() => loadHistory(1)}>Reload</button>
          </div>
          <div className="table-container" style={{ marginTop: 12 }}>
            <table className="table">
              <thead><tr><th>ID</th><th>Feature</th><th>Project</th><th>Success</th><th>Created</th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} onClick={() => { setResult(h.output); setError(''); }}>
                    <td>{h.id}</td>
                    <td>{h.feature}</td>
                    <td>{h.project_id || '-'}</td>
                    <td>{h.success ? '✓' : '✕'}</td>
                    <td>{new Date(h.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {history.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center', padding: 24, color: '#94a3b8' }}>No runs yet</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => loadHistory(page - 1)}>← Prev</button>
            <span style={{ alignSelf: 'center' }}>Page {page} / {totalPages}</span>
            <button className="btn btn-secondary btn-sm" disabled={page >= totalPages} onClick={() => loadHistory(page + 1)}>Next →</button>
          </div>
        </div>
      )}

      {(result !== null || running || error) && (
        <div style={{ marginTop: 24 }}>
          <ResultBlock data={result} title={tab === 'history' ? 'Saved AI result' : 'AI feature result'} loading={running} error={error} onRetry={currentRunner} />
        </div>
      )}
    </div>
  );
}
