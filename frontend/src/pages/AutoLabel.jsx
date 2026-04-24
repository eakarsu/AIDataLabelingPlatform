import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { name: '', input_text: '', project_id: '', description: '' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

function AIResultDisplay({ result }) {
  if (!result) return null;
  let obj = result;
  if (typeof result === 'string') {
    try { obj = JSON.parse(result); } catch { obj = null; }
  }

  if (obj && typeof obj === 'object') {
    return (
      <div className="ai-result-card">
        <div className="ai-result-header">AI Prediction Result</div>
        {obj.label && (
          <div className="sentiment-display" style={{ marginBottom: 16 }}>
            <div className="sentiment-badge sentiment-positive" style={{ fontSize: '1.2rem', padding: '12px 24px' }}>
              {obj.label}
            </div>
          </div>
        )}
        {obj.confidence != null && (
          <div className="classification-item" style={{ marginBottom: 16 }}>
            <span className="classification-label">Confidence</span>
            <div className="classification-bar-bg">
              <div className="classification-bar-fill" style={{ width: `${(obj.confidence * 100)}%`, background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)' }}>
                {(obj.confidence * 100).toFixed(0)}%
              </div>
            </div>
          </div>
        )}
        {obj.reasoning && (
          <div className="summary-card" style={{ marginTop: 12 }}>
            <strong>Reasoning:</strong> {obj.reasoning}
          </div>
        )}
      </div>
    );
  }

  // Fallback plain text
  return (
    <div className="ai-result-card">
      <div className="ai-result-header">AI Prediction Result</div>
      <div className="summary-card">{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</div>
    </div>
  );
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
  const [running, setRunning] = useState(false);
  const [runText, setRunText] = useState('');
  const [showRunPanel, setShowRunPanel] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/auto-labels');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
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

  const handleRunAI = async () => {
    if (!runText.trim()) return;
    setRunning(true);
    setRunResult(null);
    try {
      const res = await api.post('/auto-labels/run', { input_text: runText, name: 'Quick AI Label' });
      setRunResult(res.data);
      fetchItems();
    } catch (err) {
      showToast(err.response?.data?.error || 'AI labeling failed', 'error');
    }
    setRunning(false);
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
          <textarea className="form-textarea" rows={4} value={runText} onChange={(e) => setRunText(e.target.value)} placeholder="Enter text to auto-label..." />
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={handleRunAI} disabled={running || !runText.trim()}>
              {running ? <><span className="spinner spinner-sm"></span> Processing...</> : '🚀 Run Auto-Label'}
            </button>
          </div>
          {runResult && (
            <div style={{ marginTop: 16 }}>
              <AIResultDisplay result={runResult.ai_response} />
              {runResult.predicted_label && (
                <div style={{ marginTop: 12, padding: '12px 16px', background: '#1e293b', borderRadius: 8, border: '1px solid #334155' }}>
                  <strong>Predicted Label:</strong> <span className="badge badge-active">{runResult.predicted_label}</span>
                  {runResult.confidence && <span style={{ marginLeft: 12 }}>Confidence: <strong>{(runResult.confidence * 100).toFixed(0)}%</strong></span>}
                </div>
              )}
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
              {selected.ai_response && <AIResultDisplay result={selected.ai_response} />}
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(selected)}>Delete</button>
              <button className="btn btn-primary btn-sm" onClick={() => openEdit(selected)}>Edit</button>
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
