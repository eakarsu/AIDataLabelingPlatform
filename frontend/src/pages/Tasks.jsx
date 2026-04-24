import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { title: '', description: '', status: 'pending', priority: 'medium', assignee: '', project_id: '' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Tasks() {
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
      const res = await api.get('/tasks');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleSave = async () => {
    try {
      if (editing) {
        await api.put(`/tasks/${selected.id || selected._id}`, formData);
        showToast('Task updated');
      } else {
        await api.post('/tasks', formData);
        showToast('Task created');
      }
      setShowForm(false); setEditing(false); setSelected(null); setFormData(EMPTY); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/tasks/${item.id || item._id}`);
      showToast('Task deleted'); setSelected(null); setConfirmDelete(null); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({ title: item.title || '', description: item.description || '', status: item.status || 'pending', priority: item.priority || 'medium', assignee: item.assignee || '', project_id: item.project_id || '' });
    setEditing(true); setShowForm(true);
  };

  const openCreate = () => { setFormData(EMPTY); setEditing(false); setSelected(null); setShowForm(true); };

  const priorityColor = (p) => {
    if (p === 'high' || p === 'urgent') return 'danger';
    if (p === 'medium') return 'warning';
    return 'info';
  };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1><span className="page-header-icon">✅</span> Tasks</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Task</button>
      </div>
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading tasks...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-title">No tasks yet</div><div className="empty-state-desc">Create labeling tasks for your team</div><button className="btn btn-primary" onClick={openCreate}>+ Create Task</button></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Title</th><th>Status</th><th>Priority</th><th>Description</th><th>Created</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><strong>{item.title}</strong></td>
                  <td><span className={`badge badge-${item.status || 'pending'}`}>{item.status || 'pending'}</span></td>
                  <td><span className={`badge badge-${priorityColor(item.priority)}`}>{item.priority || 'medium'}</span></td>
                  <td>{item.description || '-'}</td>
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
            <div className="modal-header"><h2>Task Details</h2><button className="modal-close" onClick={() => setSelected(null)}>&times;</button></div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field full-width"><div className="detail-label">Title</div><div className="detail-value">{selected.title}</div></div>
                <div className="detail-field"><div className="detail-label">Status</div><div className="detail-value"><span className={`badge badge-${selected.status}`}>{selected.status}</span></div></div>
                <div className="detail-field"><div className="detail-label">Priority</div><div className="detail-value"><span className={`badge badge-${priorityColor(selected.priority)}`}>{selected.priority}</span></div></div>
                <div className="detail-field full-width"><div className="detail-label">Description</div><div className="detail-value">{selected.description || 'No description'}</div></div>
                {selected.assignee && <div className="detail-field"><div className="detail-label">Assignee ID</div><div className="detail-value">{selected.assignee}</div></div>}
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
            <div className="modal-header"><h2>{editing ? 'Edit Task' : 'New Task'}</h2><button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Title</label><input className="form-input" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Task title" /></div>
              <div className="form-group"><label>Description</label><textarea className="form-textarea" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Task description" /></div>
              <div className="form-group"><label>Status</label>
                <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option>
                </select>
              </div>
              <div className="form-group"><label>Priority</label>
                <select className="form-select" value={formData.priority} onChange={(e) => setFormData({ ...formData, priority: e.target.value })}>
                  <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save Changes' : 'Create Task'}</button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body"><div className="confirm-dialog"><div className="confirm-icon">⚠️</div><h2>Delete Task?</h2><p className="confirm-message">Delete "{confirmDelete.title}"?</p><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete</button></div></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
