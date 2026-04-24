import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { name: '', permissions: 'read', expires_at: '' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function ApiKeys() {
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
      const res = await api.get('/api-keys');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleSave = async () => {
    try {
      if (editing) {
        await api.put(`/api-keys/${selected.id || selected._id}`, formData);
        showToast('API key updated');
      } else {
        await api.post('/api-keys', formData);
        showToast('API key created');
      }
      setShowForm(false); setEditing(false); setSelected(null); setFormData(EMPTY); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/api-keys/${item.id || item._id}`);
      showToast('API key revoked'); setSelected(null); setConfirmDelete(null); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({ name: item.name || '', permissions: item.permissions || 'read', expires_at: item.expires_at ? item.expires_at.substring(0, 10) : '' });
    setEditing(true); setShowForm(true);
  };

  const openCreate = () => { setFormData(EMPTY); setEditing(false); setSelected(null); setShowForm(true); };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1><span className="page-header-icon">🔑</span> API Keys</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New API Key</button>
      </div>
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🔑</div><div className="empty-state-title">No API keys</div><div className="empty-state-desc">Create API keys for programmatic access</div><button className="btn btn-primary" onClick={openCreate}>+ Create API Key</button></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Name</th><th>Key</th><th>Permissions</th><th>Status</th><th>Expires</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><strong>{item.name}</strong></td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.key ? `${item.key.substring(0, 12)}...` : '-'}</td>
                  <td><span className="badge badge-info">{item.permissions || 'read'}</span></td>
                  <td><span className={`badge badge-${item.status || 'active'}`}>{item.status || 'active'}</span></td>
                  <td>{item.expires_at ? new Date(item.expires_at).toLocaleDateString() : 'Never'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && !showForm && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>API Key Details</h2><button className="modal-close" onClick={() => setSelected(null)}>&times;</button></div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field"><div className="detail-label">Name</div><div className="detail-value">{selected.name}</div></div>
                <div className="detail-field"><div className="detail-label">Permissions</div><div className="detail-value"><span className="badge badge-info">{selected.permissions}</span></div></div>
                <div className="detail-field full-width"><div className="detail-label">Key</div><div className="detail-value" style={{ fontFamily: 'monospace', fontSize: 13 }}>{selected.key || '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${selected.status || 'active'}`}>{selected.status || 'active'}</span></div></div>
                <div className="detail-field"><div className="detail-label">Expires</div><div className="detail-value">{selected.expires_at ? new Date(selected.expires_at).toLocaleString() : 'Never'}</div></div>
                <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{selected.created_at ? new Date(selected.created_at).toLocaleString() : '-'}</div></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(selected)}>Revoke</button>
              <button className="btn btn-primary btn-sm" onClick={() => openEdit(selected)}>Edit</button>
            </div>
          </div>
        </div>
      )}
      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setEditing(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>{editing ? 'Edit API Key' : 'New API Key'}</h2><button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Name</label><input className="form-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="API key name" /></div>
              <div className="form-group"><label>Permissions</label>
                <select className="form-select" value={formData.permissions} onChange={(e) => setFormData({ ...formData, permissions: e.target.value })}>
                  <option value="read">Read</option><option value="write">Write</option><option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group"><label>Expires At (optional)</label><input className="form-input" type="date" value={formData.expires_at} onChange={(e) => setFormData({ ...formData, expires_at: e.target.value })} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save' : 'Create Key'}</button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body"><div className="confirm-dialog"><div className="confirm-icon">⚠️</div><h2>Revoke API Key?</h2><p className="confirm-message">Revoke "{confirmDelete.name}"? This cannot be undone.</p><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Revoke</button></div></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
