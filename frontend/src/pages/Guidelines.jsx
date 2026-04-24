import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { title: '', project_id: '', content: '', version: '1.0', status: 'draft' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Guidelines() {
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
      const res = await api.get('/guidelines');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleCreate = async () => {
    try {
      await api.post('/guidelines', formData);
      showToast('Guideline created successfully');
      setShowForm(false);
      setFormData(EMPTY);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to create', 'error'); }
  };

  const handleUpdate = async () => {
    try {
      await api.put(`/guidelines/${selected.id || selected._id}`, formData);
      showToast('Guideline updated successfully');
      setShowForm(false);
      setSelected(null);
      setEditing(false);
      setFormData(EMPTY);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to update', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/guidelines/${item.id || item._id}`);
      showToast('Guideline deleted');
      setSelected(null);
      setConfirmDelete(null);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to delete', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({ title: item.title || '', project_id: item.project_id || '', content: item.content || '', version: item.version || '1.0', status: item.status || 'draft' });
    setEditing(true);
    setShowForm(true);
  };

  const openCreate = () => {
    setFormData(EMPTY);
    setEditing(false);
    setSelected(null);
    setShowForm(true);
  };

  const statusBadge = (status) => {
    const colorMap = { draft: 'warning', published: 'success', archived: 'archived' };
    return <span className={`badge badge-${colorMap[status] || 'draft'}`}>{status || 'draft'}</span>;
  };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <div className="page-header">
        <h1><span className="page-header-icon">📋</span> Annotation Guidelines</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Guideline</button>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading guidelines...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No guidelines yet</div>
          <div className="empty-state-desc">Create your first annotation guideline to get started</div>
          <button className="btn btn-primary" onClick={openCreate}>+ Create Guideline</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Project ID</th>
                <th>Version</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><strong>{item.title}</strong></td>
                  <td>{item.project_id || '-'}</td>
                  <td>{item.version || '-'}</td>
                  <td>{statusBadge(item.status)}</td>
                  <td>{item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      {selected && !showForm && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Guideline Details</h2>
              <button className="modal-close" onClick={() => setSelected(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field">
                  <div className="detail-label">Title</div>
                  <div className="detail-value">{selected.title}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Status</div>
                  <div className="detail-value">{statusBadge(selected.status)}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Project ID</div>
                  <div className="detail-value">{selected.project_id || '-'}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Version</div>
                  <div className="detail-value">{selected.version || '-'}</div>
                </div>
                <div className="detail-field full-width">
                  <div className="detail-label">Content</div>
                  <div className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{selected.content || 'No content'}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Created</div>
                  <div className="detail-value">{selected.created_at ? new Date(selected.created_at).toLocaleString() : '-'}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Updated</div>
                  <div className="detail-value">{selected.updated_at ? new Date(selected.updated_at).toLocaleString() : '-'}</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(selected)}>Delete</button>
              <button className="btn btn-primary btn-sm" onClick={() => openEdit(selected)}>Edit</button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => { setShowForm(false); setEditing(false); }}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editing ? 'Edit Guideline' : 'New Guideline'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Title</label>
                <input className="form-input" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Guideline title" />
              </div>
              <div className="form-group">
                <label>Project ID</label>
                <input className="form-input" type="number" value={formData.project_id} onChange={(e) => setFormData({ ...formData, project_id: e.target.value })} placeholder="Associated project ID" />
              </div>
              <div className="form-group">
                <label>Content</label>
                <textarea className="form-textarea" rows={8} value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} placeholder="Annotation guidelines content..." />
              </div>
              <div className="form-group">
                <label>Version</label>
                <input className="form-input" value={formData.version} onChange={(e) => setFormData({ ...formData, version: e.target.value })} placeholder="e.g. 1.0" />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={editing ? handleUpdate : handleCreate}>{editing ? 'Save Changes' : 'Create Guideline'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body">
              <div className="confirm-dialog">
                <div className="confirm-icon">⚠️</div>
                <h2>Delete Guideline?</h2>
                <p className="confirm-message">Are you sure you want to delete "{confirmDelete.title}"? This action cannot be undone.</p>
                <div className="confirm-actions">
                  <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button>
                  <button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
