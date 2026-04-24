import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { annotation_id: '', status: 'pending', feedback: '', reviewer_id: '' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Reviews() {
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
      const res = await api.get('/reviews');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleSave = async () => {
    try {
      if (editing) {
        await api.put(`/reviews/${selected.id || selected._id}`, formData);
        showToast('Review updated');
      } else {
        await api.post('/reviews', formData);
        showToast('Review created');
      }
      setShowForm(false); setEditing(false); setSelected(null); setFormData(EMPTY); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/reviews/${item.id || item._id}`);
      showToast('Review deleted'); setSelected(null); setConfirmDelete(null); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({ annotation_id: item.annotation_id || '', status: item.status || 'pending', feedback: item.feedback || '', reviewer_id: item.reviewer_id || '' });
    setEditing(true); setShowForm(true);
  };

  const openCreate = () => { setFormData(EMPTY); setEditing(false); setSelected(null); setShowForm(true); };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1><span className="page-header-icon">🔍</span> Reviews</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Review</button>
      </div>
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading reviews...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🔍</div><div className="empty-state-title">No reviews yet</div><div className="empty-state-desc">Review queue is empty</div><button className="btn btn-primary" onClick={openCreate}>+ Create Review</button></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Annotation ID</th><th>Status</th><th>Feedback</th><th>Reviewer</th><th>Created</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><strong>{item.annotation_id || '-'}</strong></td>
                  <td><span className={`badge badge-${item.status || 'pending'}`}>{item.status || 'pending'}</span></td>
                  <td>{(item.feedback || '').substring(0, 40) || '-'}</td>
                  <td>{item.reviewer_id || '-'}</td>
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
            <div className="modal-header"><h2>Review Details</h2><button className="modal-close" onClick={() => setSelected(null)}>&times;</button></div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field"><div className="detail-label">Annotation ID</div><div className="detail-value">{selected.annotation_id || '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${selected.status}`}>{selected.status}</span></div></div>
                <div className="detail-field"><div className="detail-label">Reviewer</div><div className="detail-value">{selected.reviewer_id || '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{selected.created_at ? new Date(selected.created_at).toLocaleString() : '-'}</div></div>
                <div className="detail-field full-width"><div className="detail-label">Feedback</div><div className="detail-value">{selected.feedback || 'No feedback'}</div></div>
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
            <div className="modal-header"><h2>{editing ? 'Edit Review' : 'New Review'}</h2><button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Annotation ID</label><input className="form-input" value={formData.annotation_id} onChange={(e) => setFormData({ ...formData, annotation_id: e.target.value })} placeholder="Annotation ID" /></div>
              <div className="form-group"><label>Status</label>
                <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option>
                </select>
              </div>
              <div className="form-group"><label>Feedback</label><textarea className="form-textarea" value={formData.feedback} onChange={(e) => setFormData({ ...formData, feedback: e.target.value })} placeholder="Review feedback" /></div>
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
            <div className="modal-body"><div className="confirm-dialog"><div className="confirm-icon">⚠️</div><h2>Delete Review?</h2><p className="confirm-message">This cannot be undone.</p><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete</button></div></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
