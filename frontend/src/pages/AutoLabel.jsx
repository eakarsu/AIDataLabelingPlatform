import { recordRows } from '../recordRows';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api';
import AIReport from '../components/AIReport';
import { PresetButtons } from '../components/FullFieldPresets';

const EMPTY = { name: '', input_text: '', project_id: '', description: '' };
const AUTO_LABEL_PRESETS = [
  { label: 'Support sentiment', values: { runText: 'The replacement arrived today and works well, but support took five days to answer my original request.' } },
  { label: 'Urgent billing issue', values: { runText: 'I was charged twice for invoice INV-2048 and need the duplicate payment refunded before the account closes on Friday.' } },
  { label: 'Neutral product note', values: { runText: 'The annotation export contains 1,250 records in JSONL format and was created on October 8, 2026.' } },
];

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

function AIResultDisplay({ result }) {
  return <AIReport response={result} title="AI prediction result" />;
}

export default function AutoLabel() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState('');
  const [running, setRunning] = useState(false);
  const [runText, setRunText] = useState('');
  const [showRunPanel, setShowRunPanel] = useState(false);
  const runRequest = useRef(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/auto-labels');
      setItems(recordRows(res.data));
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleSave = async () => {
    try {
      if (editing) {
        await api.put(`/auto-labels/${selected.id}`, formData);
        showToast('Auto-label updated');
      } else {
        await api.post('/auto-labels', formData);
        showToast('Auto-label created');
      }
      setShowForm(false); setEditing(false); setSelected(null); setFormData(EMPTY); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/auto-labels/${item.id}`);
      showToast('Deleted'); setSelected(null); setConfirmDelete(null); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const cancelRun = () => {
    runRequest.current?.abort();
    runRequest.current = null;
    setRunning(false);
    setRunError('');
  };

  const handleRunAI = async () => {
    if (!runText.trim() || runRequest.current) return;
    const controller = new AbortController();
    runRequest.current = controller;
    setRunning(true);
    setRunResult(null);
    setRunError('');
    try {
      const res = await api.post('/auto-labels/run', { input_text: runText, name: 'Quick AI Label' }, { signal: controller.signal });
      if (runRequest.current !== controller) return;
      setRunResult(res.data);
      fetchItems();
    } catch (err) {
      if (runRequest.current === controller && err.code !== 'ERR_CANCELED') {
        const message = err.response?.data?.error || 'AI labeling failed';
        setRunError(message);
        showToast(message, 'error');
      }
    } finally {
      if (runRequest.current === controller) {
        runRequest.current = null;
        setRunning(false);
      }
    }
  };

  const openEdit = (item) => {
    setFormData({ name: item.name || '', input_text: item.input_text || '', project_id: item.project_id || '', description: item.description || '' });
    setEditing(true); setShowForm(true);
  };

  const openCreate = () => { setFormData(EMPTY); setEditing(false); setSelected(null); setShowForm(true); };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1><span className="page-header-icon">🤖</span> Auto Label</h1>
        <div className="btn-group">
          <button className="btn btn-success" onClick={() => setShowRunPanel(!showRunPanel)}>🧠 Run AI Label</button>
          <button className="btn btn-primary" onClick={openCreate}>+ New Auto-Label</button>
        </div>
      </div>

      {showRunPanel && (
        <div className="ai-section" style={{ marginBottom: 24 }}>
          <div className="ai-section-title">🤖 AI Auto-Labeling</div>
          <div className="ai-section-subtitle">Enter text to get AI-generated labels</div>
          <PresetButtons
            presets={AUTO_LABEL_PRESETS}
            disabled={running}
            title="Complete prompt examples"
            description="Each example fills the complete auto-label input with valid text."
            onApply={({ runText: example }) => { setRunText(example); setRunResult(null); setRunError(''); }}
          />
          <textarea className="form-textarea" rows={4} value={runText} onChange={(e) => setRunText(e.target.value)} placeholder="Enter text to auto-label..." />
          <div style={{ marginTop: 12, display: 'flex', gap: 12 }}>
            <button className="btn btn-primary" onClick={handleRunAI} disabled={running || !runText.trim()}>
              {running ? 'Generating…' : 'Generate auto-label with OpenRouter'}
            </button>
            {running && <button type="button" className="btn btn-secondary" onClick={cancelRun}>Cancel</button>}
          </div>
          <AIReport response={runResult?.ai_response ?? runResult} title="AI prediction result" loading={running} error={runError} onRetry={handleRunAI} />
          {runResult?.predicted_label && (
            <div style={{ marginTop: 12, padding: '12px 16px', background: '#1e293b', borderRadius: 8, border: '1px solid #334155' }}>
              <strong>Predicted Label:</strong> <span className="badge badge-active">{runResult.predicted_label}</span>
              {runResult.confidence != null && <span style={{ marginLeft: 12 }}>Confidence: <strong>{(runResult.confidence * 100).toFixed(0)}%</strong></span>}
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading...</span></div>
      ) : items.length === 0 && !showRunPanel ? (
        <div className="empty-state"><div className="empty-state-icon">🤖</div><div className="empty-state-title">No auto-labels yet</div><div className="empty-state-desc">Use AI to automatically label your data</div><button className="btn btn-primary" onClick={openCreate}>+ Create Auto-Label</button></div>
      ) : items.length > 0 && (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Name</th><th>Input Text</th><th>Predicted Label</th><th>Confidence</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} onClick={() => setSelected(item)}>
                  <td><strong>{item.name || '-'}</strong></td>
                  <td>{(item.input_text || '').substring(0, 40)}{(item.input_text || '').length > 40 ? '...' : ''}</td>
                  <td><span className="badge badge-info">{item.predicted_label || '-'}</span></td>
                  <td>{item.confidence != null ? `${(item.confidence * 100).toFixed(0)}%` : '-'}</td>
                  <td><span className={`badge badge-${item.status}`}>{item.status || 'pending'}</span></td>
                  <td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && !showForm && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Auto-Label Details</h2><button className="modal-close" onClick={() => setSelected(null)}>&times;</button></div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field"><div className="detail-label">Name</div><div className="detail-value">{selected.name || '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${selected.status}`}>{selected.status}</span></div></div>
                <div className="detail-field full-width"><div className="detail-label">Input Text</div><div className="detail-value">{selected.input_text || '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Predicted Label</div><div className="detail-value"><span className="badge badge-info">{selected.predicted_label || '-'}</span></div></div>
                <div className="detail-field"><div className="detail-label">Confidence</div><div className="detail-value">{selected.confidence != null ? `${(selected.confidence * 100).toFixed(1)}%` : '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Model</div><div className="detail-value">{selected.model || '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{selected.created_at ? new Date(selected.created_at).toLocaleString() : '-'}</div></div>
              </div>
              {selected.ai_response !== null && selected.ai_response !== undefined && <AIResultDisplay result={selected.ai_response} />}
            </div>
            <div className="modal-footer modal-footer-centered">
              <button className="btn btn-secondary btn-sm" onClick={() => setSelected(null)}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={() => openEdit(selected)}>Edit</button>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(selected)}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setEditing(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>{editing ? 'Edit' : 'New'} Auto-Label</h2><button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Name</label><input className="form-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Label name" /></div>
              <div className="form-group"><label>Input Text</label><textarea className="form-textarea" value={formData.input_text} onChange={(e) => setFormData({ ...formData, input_text: e.target.value })} placeholder="Text content to label" /></div>
              <div className="form-group"><label>Description</label><textarea className="form-textarea" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Description" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save' : 'Create'}</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body"><div className="confirm-dialog"><div className="confirm-icon">⚠️</div><h2>Delete?</h2><p className="confirm-message">Delete this auto-label?</p><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete</button></div></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
