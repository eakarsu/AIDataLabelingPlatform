import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { data_item: '', label: '', annotator: '', method: 'manual', task_id: '', dataset_id: '', confidence: '', status: 'pending' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Annotations() {
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
      const res = await api.get('/annotations');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleSave = async () => {
    try {
      const payload = { ...formData };
      if (payload.confidence) payload.confidence = parseFloat(payload.confidence);
      if (editing) {
        await api.put(`/annotations/${selected.id || selected._id}`, payload);
        showToast('Annotation updated');
      } else {
        await api.post('/annotations', payload);
        showToast('Annotation created');
      }
      setShowForm(false); setEditing(false); setSelected(null); setFormData(EMPTY); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/annotations/${item.id || item._id}`);
      showToast('Annotation deleted'); setSelected(null); setConfirmDelete(null); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({ data_item: item.data_item || '', label: item.label || '', annotator: item.annotator || '', method: item.method || 'manual', task_id: item.task_id || '', dataset_id: item.dataset_id || '', confidence: item.confidence?.toString() || '', status: item.status || 'pending' });
    setEditing(true); setShowForm(true);
  };

  const openCreate = () => { setFormData(EMPTY); setEditing(false); setSelected(null); setShowForm(true); };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1><span className="page-header-icon">📝</span> Annotations</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Annotation</button>
      </div>
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading annotations...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📝</div><div className="empty-state-title">No annotations yet</div><div className="empty-state-desc">Create annotations for your data</div><button className="btn btn-primary" onClick={openCreate}>+ Create Annotation</button></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Data Item</th><th>Label</th><th>Annotator</th><th>Method</th><th>Confidence</th><th>Status</th><th>Created</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><strong>{item.data_item?.substring(0, 50) || '-'}{item.data_item?.length > 50 ? '...' : ''}</strong></td>
                  <td><span className="badge badge-info">{item.label || '-'}</span></td>
                  <td>{item.annotator || '-'}</td>
                  <td><span className="badge badge-active">{item.method || 'manual'}</span></td>
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
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Annotation Details</h2><button className="modal-close" onClick={() => setSelected(null)}>&times;</button></div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field full-width"><div className="detail-label">Data Item</div><div className="detail-value">{selected.data_item || '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Label</div><div className="detail-value"><span className="badge badge-info">{selected.label || '-'}</span></div></div>
                <div className="detail-field"><div className="detail-label">Annotator</div><div className="detail-value">{selected.annotator || '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Method</div><div className="detail-value"><span className="badge badge-active">{selected.method || 'manual'}</span></div></div>
                <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${selected.status}`}>{selected.status || 'pending'}</span></div></div>
                <div className="detail-field"><div className="detail-label">Confidence</div><div className="detail-value">{selected.confidence != null ? `${(selected.confidence * 100).toFixed(1)}%` : '-'}</div></div>
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
            <div className="modal-header"><h2>{editing ? 'Edit Annotation' : 'New Annotation'}</h2><button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Data Item</label><textarea className="form-textarea" value={formData.data_item} onChange={(e) => setFormData({ ...formData, data_item: e.target.value })} placeholder="Text content to annotate" /></div>
              <div className="form-group"><label>Label</label><input className="form-input" value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} placeholder="Label name" /></div>
              <div className="form-group"><label>Annotator</label><input className="form-input" value={formData.annotator} onChange={(e) => setFormData({ ...formData, annotator: e.target.value })} placeholder="Annotator name" /></div>
              <div className="form-group"><label>Method</label><select className="form-select" value={formData.method} onChange={(e) => setFormData({ ...formData, method: e.target.value })}><option value="manual">Manual</option><option value="auto">Auto</option><option value="hybrid">Hybrid</option></select></div>
              <div className="form-group"><label>Status</label><select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}><option value="pending">Pending</option><option value="completed">Completed</option><option value="rejected">Rejected</option></select></div>
              <div className="form-group"><label>Confidence (0-1)</label><input className="form-input" type="number" step="0.01" min="0" max="1" value={formData.confidence} onChange={(e) => setFormData({ ...formData, confidence: e.target.value })} placeholder="0.95" /></div>
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
            <div className="modal-body"><div className="confirm-dialog"><div className="confirm-icon">⚠️</div><h2>Delete Annotation?</h2><p className="confirm-message">This action cannot be undone.</p><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete</button></div></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
