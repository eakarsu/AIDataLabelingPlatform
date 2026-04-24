import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { metric_name: '', value: '', project_id: '', threshold: '', status: 'pass', notes: '' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Quality() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/quality');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleSave = async () => {
    try {
      const payload = { ...formData };
      if (payload.value) payload.value = parseFloat(payload.value);
      if (payload.threshold) payload.threshold = parseFloat(payload.threshold);
      if (editing) {
        await api.put(`/quality/${selected.id || selected._id}`, payload);
        showToast('Quality metric updated');
      } else {
        await api.post('/quality', payload);
        showToast('Quality metric created');
      }
      setShowForm(false); setEditing(false); setSelected(null); setFormData(EMPTY); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/quality/${item.id || item._id}`);
      showToast('Deleted'); setSelected(null); setConfirmDelete(null); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({ metric_name: item.metric_name || '', value: item.value?.toString() || '', project_id: item.project_id || '', threshold: item.threshold?.toString() || '', status: item.status || 'pass', notes: item.notes || '' });
    setEditing(true); setShowForm(true);
  };

  const openCreate = () => { setFormData(EMPTY); setEditing(false); setSelected(null); setShowForm(true); };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1><span className="page-header-icon">📈</span> Quality</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Metric</button>
      </div>
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📈</div><div className="empty-state-title">No quality metrics</div><div className="empty-state-desc">Track quality of your labeling work</div><button className="btn btn-primary" onClick={openCreate}>+ Add Metric</button></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Metric Name</th><th>Value</th><th>Threshold</th><th>Status</th><th>Notes</th></tr></thead>
            <tbody>
              {items.map((item) => {
                const passing = item.value != null && item.threshold != null ? item.value >= item.threshold : null;
                return (
                  <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                    <td><strong>{item.metric_name}</strong></td>
                    <td>{item.value != null ? `${(item.value * 100).toFixed(1)}%` : '-'}</td>
                    <td>{item.threshold != null ? `${(item.threshold * 100).toFixed(1)}%` : '-'}</td>
                    <td>{passing !== null && <span className={`badge ${passing ? 'badge-success' : 'badge-danger'}`}>{passing ? 'Passing' : 'Below Threshold'}</span>}</td>
                    <td>{item.notes?.substring(0, 30) || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selected && !showForm && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Quality Details</h2><button className="modal-close" onClick={() => setSelected(null)}>&times;</button></div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field"><div className="detail-label">Name</div><div className="detail-value">{selected.name}</div></div>
                <div className="detail-field"><div className="detail-label">Metric</div><div className="detail-value"><span className="badge badge-info">{selected.metric}</span></div></div>
                <div className="detail-field"><div className="detail-label">Value</div><div className="detail-value">{selected.value != null ? `${(selected.value * 100).toFixed(1)}%` : '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Threshold</div><div className="detail-value">{selected.threshold != null ? `${(selected.threshold * 100).toFixed(1)}%` : '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{selected.created_at ? new Date(selected.created_at).toLocaleString() : '-'}</div></div>
              </div>
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
            <div className="modal-header"><h2>{editing ? 'Edit Metric' : 'New Metric'}</h2><button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Metric Name</label>
                <select className="form-select" value={formData.metric_name} onChange={(e) => setFormData({ ...formData, metric_name: e.target.value })}>
                  <option value="accuracy">Accuracy</option><option value="precision">Precision</option><option value="recall">Recall</option><option value="f1">F1 Score</option><option value="agreement">Inter-Annotator Agreement</option>
                </select>
              </div>
              <div className="form-group"><label>Value (0-1)</label><input className="form-input" type="number" step="0.01" min="0" max="1" value={formData.value} onChange={(e) => setFormData({ ...formData, value: e.target.value })} placeholder="0.95" /></div>
              <div className="form-group"><label>Threshold (0-1)</label><input className="form-input" type="number" step="0.01" min="0" max="1" value={formData.threshold} onChange={(e) => setFormData({ ...formData, threshold: e.target.value })} placeholder="0.90" /></div>
              <div className="form-group"><label>Status</label>
                <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <option value="pass">Pass</option><option value="fail">Fail</option><option value="warning">Warning</option>
                </select>
              </div>
              <div className="form-group"><label>Notes</label><textarea className="form-textarea" value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Additional notes" /></div>
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
            <div className="modal-body"><div className="confirm-dialog"><div className="confirm-icon">⚠️</div><h2>Delete Metric?</h2><p className="confirm-message">Delete "{confirmDelete.name}"?</p><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete</button></div></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
