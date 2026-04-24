import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { name: '', url: '', events: '', status: 'active', secret: '' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Webhooks() {
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
      const res = await api.get('/webhooks');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleSave = async () => {
    try {
      const payload = { ...formData };
      if (typeof payload.events === 'string') {
        payload.events = payload.events.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (editing) {
        await api.put(`/webhooks/${selected.id || selected._id}`, payload);
        showToast('Webhook updated');
      } else {
        await api.post('/webhooks', payload);
        showToast('Webhook created');
      }
      setShowForm(false); setEditing(false); setSelected(null); setFormData(EMPTY); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/webhooks/${item.id || item._id}`);
      showToast('Webhook deleted'); setSelected(null); setConfirmDelete(null); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({ name: item.name || '', url: item.url || '', events: Array.isArray(item.events) ? item.events.join(', ') : (item.events || ''), status: item.status || 'active', secret: item.secret || '' });
    setEditing(true); setShowForm(true);
  };

  const openCreate = () => { setFormData(EMPTY); setEditing(false); setSelected(null); setShowForm(true); };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1><span className="page-header-icon">🔗</span> Webhooks</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Webhook</button>
      </div>
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🔗</div><div className="empty-state-title">No webhooks</div><div className="empty-state-desc">Set up webhooks for event notifications</div><button className="btn btn-primary" onClick={openCreate}>+ Create Webhook</button></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Name</th><th>URL</th><th>Events</th><th>Status</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><strong>{item.name}</strong></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.url || '-'}</td>
                  <td>{Array.isArray(item.events) ? item.events.join(', ') : (item.events || '-')}</td>
                  <td><span className={`badge badge-${item.status || 'active'}`}>{item.status || 'active'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && !showForm && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Webhook Details</h2><button className="modal-close" onClick={() => setSelected(null)}>&times;</button></div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field"><div className="detail-label">Name</div><div className="detail-value">{selected.name}</div></div>
                <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${selected.status}`}>{selected.status}</span></div></div>
                <div className="detail-field full-width"><div className="detail-label">URL</div><div className="detail-value" style={{ fontFamily: 'monospace' }}>{selected.url || '-'}</div></div>
                <div className="detail-field full-width"><div className="detail-label">Events</div><div className="detail-value">{Array.isArray(selected.events) ? selected.events.join(', ') : (selected.events || 'None')}</div></div>
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
            <div className="modal-header"><h2>{editing ? 'Edit Webhook' : 'New Webhook'}</h2><button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Name</label><input className="form-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Webhook name" /></div>
              <div className="form-group"><label>URL</label><input className="form-input" value={formData.url} onChange={(e) => setFormData({ ...formData, url: e.target.value })} placeholder="https://example.com/webhook" /></div>
              <div className="form-group"><label>Events (comma separated)</label><input className="form-input" value={formData.events} onChange={(e) => setFormData({ ...formData, events: e.target.value })} placeholder="annotation.created, task.completed" /></div>
              <div className="form-group"><label>Secret (optional)</label><input className="form-input" value={formData.secret} onChange={(e) => setFormData({ ...formData, secret: e.target.value })} placeholder="Webhook secret" /></div>
              <div className="form-group"><label>Status</label>
                <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option>
                </select>
              </div>
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
            <div className="modal-body"><div className="confirm-dialog"><div className="confirm-icon">⚠️</div><h2>Delete Webhook?</h2><p className="confirm-message">Delete "{confirmDelete.name}"?</p><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete</button></div></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
