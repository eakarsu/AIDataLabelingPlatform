import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { name: '', email: '', role: 'annotator', status: 'active' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Team() {
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
      const res = await api.get('/team');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleSave = async () => {
    try {
      if (editing) {
        await api.put(`/team/${selected.id || selected._id}`, formData);
        showToast('Member updated');
      } else {
        await api.post('/team', formData);
        showToast('Member added');
      }
      setShowForm(false); setEditing(false); setSelected(null); setFormData(EMPTY); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/team/${item.id || item._id}`);
      showToast('Member removed'); setSelected(null); setConfirmDelete(null); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({ name: item.name || '', email: item.email || '', role: item.role || 'annotator', status: item.status || 'active' });
    setEditing(true); setShowForm(true);
  };

  const openCreate = () => { setFormData(EMPTY); setEditing(false); setSelected(null); setShowForm(true); };

  const roleColor = (r) => {
    if (r === 'admin') return 'danger';
    if (r === 'reviewer' || r === 'manager') return 'warning';
    return 'info';
  };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1><span className="page-header-icon">👥</span> Team</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ Add Member</button>
      </div>
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading team...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">👥</div><div className="empty-state-title">No team members</div><div className="empty-state-desc">Add team members to collaborate</div><button className="btn btn-primary" onClick={openCreate}>+ Add Member</button></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.email || '-'}</td>
                  <td><span className={`badge badge-${roleColor(item.role)}`}>{item.role || 'annotator'}</span></td>
                  <td><span className={`badge badge-${item.status || 'active'}`}>{item.status || 'active'}</span></td>
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
            <div className="modal-header"><h2>Team Member</h2><button className="modal-close" onClick={() => setSelected(null)}>&times;</button></div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field"><div className="detail-label">Name</div><div className="detail-value">{selected.name}</div></div>
                <div className="detail-field"><div className="detail-label">Email</div><div className="detail-value">{selected.email || '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Role</div><div className="detail-value"><span className={`badge badge-${roleColor(selected.role)}`}>{selected.role}</span></div></div>
                <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${selected.status}`}>{selected.status}</span></div></div>
                <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{selected.created_at ? new Date(selected.created_at).toLocaleString() : '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Updated</div><div className="detail-value">{selected.updated_at ? new Date(selected.updated_at).toLocaleString() : '-'}</div></div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(selected)}>Remove</button>
              <button className="btn btn-primary btn-sm" onClick={() => openEdit(selected)}>Edit</button>
            </div>
          </div>
        </div>
      )}
      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setEditing(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>{editing ? 'Edit Member' : 'Add Member'}</h2><button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Name</label><input className="form-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Full name" /></div>
              <div className="form-group"><label>Email</label><input className="form-input" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="Email address" /></div>
              <div className="form-group"><label>Role</label>
                <select className="form-select" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                  <option value="annotator">Annotator</option><option value="reviewer">Reviewer</option><option value="manager">Manager</option><option value="admin">Admin</option>
                </select>
              </div>
              <div className="form-group"><label>Status</label>
                <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <option value="active">Active</option><option value="pending">Pending</option><option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save' : 'Add Member'}</button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body"><div className="confirm-dialog"><div className="confirm-icon">⚠️</div><h2>Remove Member?</h2><p className="confirm-message">Remove "{confirmDelete.name}" from the team?</p><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Remove</button></div></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
