import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

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

function ResultBlock({ data }) {
  if (!data) return null;
  return (
    <pre style={{ background: '#0f172a', color: '#cbd5e1', padding: 16, borderRadius: 8, overflow: 'auto', maxHeight: 360 }}>
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export default function AIFeatures() {
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState('active');

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [toast, setToast] = useState(null);

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
    api.get('/projects').then((r) => setProjects(Array.isArray(r.data) ? r.data : r.data.data || [])).catch(() => setProjects([]));
  }, []);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const runActiveLearning = async () => {
    if (!projectId) return showToast('Pick a project first', 'error');
    setRunning(true); setResult(null);
    try {
      const r = await api.post(`/ai-features/active-learning/${projectId}`);
      setResult(r.data); showToast('Active learning prioritization complete');
    } catch (e) { showToast(e.response?.data?.error || 'Failed', 'error'); }
    setRunning(false);
  };

  const runConflictResolver = async () => {
    if (!projectId || !dataItem) return showToast('Project + data item required', 'error');
    let annotations;
    try { annotations = JSON.parse(annotationsJson); } catch { return showToast('Annotations must be valid JSON array', 'error'); }
    setRunning(true); setResult(null);
    try {
      const r = await api.post('/ai-features/conflict-resolver', { project_id: projectId, data_item: dataItem, annotations });
      setResult(r.data); showToast('Conflict resolved');
    } catch (e) { showToast(e.response?.data?.error || 'Failed', 'error'); }
    setRunning(false);
  };

  const runBiasScan = async () => {
    if (!projectId) return showToast('Pick a project first', 'error');
    setRunning(true); setResult(null);
    try {
      const r = await api.post(`/ai-features/bias-scan/${projectId}`);
      setResult(r.data); showToast('Bias scan complete');
    } catch (e) { showToast(e.response?.data?.error || 'Failed', 'error'); }
    setRunning(false);
  };

  const runQASample = async () => {
    if (!projectId) return showToast('Pick a project first', 'error');
    setRunning(true); setResult(null);
    try {
      const r = await api.post(`/ai-features/qa-sample/${projectId}`, { sample_size: sampleSize });
      setResult(r.data); showToast('QA sample graded');
    } catch (e) { showToast(e.response?.data?.error || 'Failed', 'error'); }
    setRunning(false);
  };

  const runRecommendStrategy = async () => {
    if (!projectId && !datasetSummary) return showToast('Pick a project or describe the dataset', 'error');
    setRunning(true); setResult(null);
    try {
      const body = {
        project_id: projectId || undefined,
        dataset_summary: datasetSummary || undefined,
        label_count: labelCount ? parseInt(labelCount) : undefined,
        sample_size: strategySampleSize ? parseInt(strategySampleSize) : undefined,
        modality,
      };
      const r = await api.post('/ai-features/recommend-label-strategy', body);
      setResult(r.data); showToast('Strategy recommendation ready');
    } catch (e) {
      const code = e.response?.status;
      const msg = e.response?.data?.error || 'Failed';
      showToast(code === 503 ? `AI not configured: ${msg}` : msg, 'error');
    }
    setRunning(false);
  };

  const runLabelerQuality = async () => {
    if (!labeler) return showToast('Labeler name required', 'error');
    setRunning(true); setResult(null);
    try {
      const body = { project_id: projectId || undefined, labeler };
      const r = await api.post('/ai-features/labeler-quality-score', body);
      setResult(r.data); showToast('Labeler quality scored');
    } catch (e) {
      const code = e.response?.status;
      const msg = e.response?.data?.error || 'Failed';
      showToast(code === 503 ? `AI not configured: ${msg}` : msg, 'error');
    }
    setRunning(false);
  };

  const runIdentifyAmbiguous = async () => {
    if (!projectId) return showToast('Pick a project first', 'error');
    let items = [];
    if (ambigItemsJson.trim()) {
      try { items = JSON.parse(ambigItemsJson); }
      catch { return showToast('Items must be valid JSON array', 'error'); }
    }
    setRunning(true); setResult(null);
    try {
      const r = await api.post(`/ai-features/identify-ambiguous-items/${projectId}`, { items });
      setResult(r.data); showToast('Ambiguity scan complete');
    } catch (e) {
      const code = e.response?.status;
      const msg = e.response?.data?.error || 'Failed';
      showToast(code === 503 ? `AI not configured: ${msg}` : msg, 'error');
    }
    setRunning(false);
  };

  const loadHistory = useCallback(async (p = 1) => {
    try {
      const params = new URLSearchParams({ page: String(p), limit: '20' });
      if (historyFeature) params.append('feature', historyFeature);
      if (projectId) params.append('project_id', projectId);
      const r = await api.get(`/ai-features/results?${params.toString()}`);
      setHistory(r.data.data || []);
      setPage(r.data.pagination?.page || 1);
      setTotalPages(r.data.pagination?.totalPages || 1);
    } catch (e) {
      setHistory([]);
    }
  }, [historyFeature, projectId]);

  useEffect(() => { if (tab === 'history') loadHistory(1); }, [tab, loadHistory]);

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
          <button className="btn btn-primary" onClick={runActiveLearning} disabled={running}>
            {running ? <><span className="spinner spinner-sm"></span> Running...</> : '🚀 Run'}
          </button>
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
          <button className="btn btn-primary" onClick={runConflictResolver} disabled={running}>
            {running ? <><span className="spinner spinner-sm"></span> Resolving...</> : '🚀 Resolve'}
          </button>
        </div>
      )}

      {tab === 'bias' && (
        <div className="ai-section">
          <div className="ai-section-title">🧯 Bias Scanner</div>
          <div className="ai-section-subtitle">Surface annotators or classes that skew the dataset.</div>
          <button className="btn btn-primary" onClick={runBiasScan} disabled={running}>
            {running ? <><span className="spinner spinner-sm"></span> Scanning...</> : '🚀 Scan'}
          </button>
        </div>
      )}

      {tab === 'qa' && (
        <div className="ai-section">
          <div className="ai-section-title">🔬 QA Sampler</div>
          <div className="form-group"><label>Sample size (3-20)</label>
            <input className="form-input" type="number" min="3" max="20" value={sampleSize} onChange={(e) => setSampleSize(parseInt(e.target.value) || 10)} />
          </div>
          <button className="btn btn-primary" onClick={runQASample} disabled={running}>
            {running ? <><span className="spinner spinner-sm"></span> Grading...</> : '🚀 Sample & Grade'}
          </button>
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
          <button className="btn btn-primary" onClick={runRecommendStrategy} disabled={running}>
            {running ? <><span className="spinner spinner-sm"></span> Thinking...</> : '🚀 Recommend Strategy'}
          </button>
        </div>
      )}

      {tab === 'quality' && (
        <div className="ai-section">
          <div className="ai-section-title">📊 Labeler Quality Score</div>
          <div className="ai-section-subtitle">Score a labeler on accuracy proxy, throughput, consistency, and guideline adherence.</div>
          <div className="form-group"><label>Labeler name (must match annotator field)</label>
            <input className="form-input" value={labeler} onChange={(e) => setLabeler(e.target.value)} placeholder="alice" />
          </div>
          <button className="btn btn-primary" onClick={runLabelerQuality} disabled={running}>
            {running ? <><span className="spinner spinner-sm"></span> Scoring...</> : '🚀 Score Labeler'}
          </button>
        </div>
      )}

      {tab === 'ambig' && (
        <div className="ai-section">
          <div className="ai-section-title">❓ Ambiguous-Item Identifier</div>
          <div className="ai-section-subtitle">List items where reasonable annotators would disagree (vs. just low-confidence).</div>
          <div className="form-group"><label>Optional items to scan (JSON array)</label>
            <textarea className="form-textarea" rows={6} value={ambigItemsJson} onChange={(e) => setAmbigItemsJson(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={runIdentifyAmbiguous} disabled={running}>
            {running ? <><span className="spinner spinner-sm"></span> Scanning...</> : '🚀 Identify Ambiguous'}
          </button>
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
                  <tr key={h.id} onClick={() => setResult(h.output)}>
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

      {result && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ color: '#e2e8f0' }}>Result</h3>
          <ResultBlock data={result} />
        </div>
      )}
    </div>
  );
}
