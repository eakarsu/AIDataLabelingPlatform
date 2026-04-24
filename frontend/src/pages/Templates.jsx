import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { name: '', type: 'project', description: '', config: '{}', status: 'active' };

const TYPE_COLORS = {
  project: 'blue',
  label_set: 'green',
  workflow: 'purple',
  import: 'orange',
  export: 'cyan',
  checklist: 'yellow',
};

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Templates() {
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
      const res = await api.get('/templates');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleCreate = async () => {
    try {
      const payload = { ...formData, config: JSON.parse(formData.config) };
      await api.post('/templates', payload);
      showToast('Template created successfully');
      setShowForm(false);
      setFormData(EMPTY);
      fetchItems();
    } catch (err) {
      if (err instanceof SyntaxError) { showToast('Invalid JSON in config', 'error'); return; }
      showToast(err.response?.data?.error || 'Failed to create', 'error');
    }
  };

  const handleUpdate = async () => {
    try {
      const payload = { ...formData, config: JSON.parse(formData.config) };
      await api.put(`/templates/${selected.id || selected._id}`, payload);
      showToast('Template updated successfully');
      setShowForm(false);
      setSelected(null);
      setEditing(false);
      setFormData(EMPTY);
      fetchItems();
    } catch (err) {
      if (err instanceof SyntaxError) { showToast('Invalid JSON in config', 'error'); return; }
      showToast(err.response?.data?.error || 'Failed to update', 'error');
    }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/templates/${item.id || item._id}`);
      showToast('Template deleted');
      setSelected(null);
      setConfirmDelete(null);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to delete', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({
      name: item.name || '',
      type: item.type || 'project',
      description: item.description || '',
      config: typeof item.config === 'object' ? JSON.stringify(item.config, null, 2) : (item.config || '{}'),
      status: item.status || 'active',
    });
    setEditing(true);
    setShowForm(true);
  };

  const openCreate = () => {
    setFormData(EMPTY);
    setEditing(false);
    setSelected(null);
    setShowForm(true);
  };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <div className="page-header">
        <h1><span className="page-header-icon">📋</span> Templates</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Template</button>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading templates...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No templates yet</div>
          <div className="empty-state-desc">Create your first template to get started</div>
          <button className="btn btn-primary" onClick={openCreate}>+ Create Template</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Description</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><strong>{item.name}</strong></td>
                  <td><span className={`badge badge-${TYPE_COLORS[item.type] || 'blue'}`}>{item.type || '-'}</span></td>
                  <td>{item.description || '-'}</td>
                  <td><span className={`badge badge-${item.status === 'active' ? 'success' : 'muted'}`}>{item.status || 'active'}</span></td>
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
              <h2>Template Details</h2>
              <button className="modal-close" onClick={() => setSelected(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field">
                  <div className="detail-label">Name</div>
                  <div className="detail-value">{selected.name}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Type</div>
                  <div className="detail-value"><span className={`badge badge-${TYPE_COLORS[selected.type] || 'blue'}`}>{selected.type || '-'}</span></div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Status</div>
                  <div className="detail-value"><span className={`badge badge-${selected.status === 'active' ? 'success' : 'muted'}`}>{selected.status || 'active'}</span></div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Created</div>
                  <div className="detail-value">{selected.created_at ? new Date(selected.created_at).toLocaleString() : '-'}</div>
                </div>
                <div className="detail-field full-width">
                  <div className="detail-label">Description</div>
                  <div className="detail-value">{selected.description || 'No description'}</div>
                </div>
                <div className="detail-field full-width">
                  <div className="detail-label">Config</div>
                  <div className="detail-value">
                    <pre style={{ background: '#f5f5f5', padding: '12px', borderRadius: '6px', overflow: 'auto', maxHeight: '300px', fontSize: '13px' }}>
                      {typeof selected.config === 'object' ? JSON.stringify(selected.config, null, 2) : (selected.config || '{}')}
                    </pre>
                  </div>
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
              <h2>{editing ? 'Edit Template' : 'New Template'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name</label>
                <input className="form-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Template name" />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select className="form-select" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                  <option value="project">Project</option>
                  <option value="label_set">Label Set</option>
                  <option value="workflow">Workflow</option>
                  <option value="import">Import</option>
                  <option value="export">Export</option>
                  <option value="checklist">Checklist</option>
                </select>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea className="form-textarea" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Template description" />
              </div>
              <div className="form-group">
                <label>Config (JSON)</label>
                <textarea className="form-textarea" value={formData.config} onChange={(e) => setFormData({ ...formData, config: e.target.value })} placeholder='{"key": "value"}' style={{ fontFamily: 'monospace', minHeight: '120px' }} />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={editing ? handleUpdate : handleCreate}>{editing ? 'Save Changes' : 'Create Template'}</button>
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
                <h2>Delete Template?</h2>
                <p className="confirm-message">Are you sure you want to delete "{confirmDelete.name}"? This action cannot be undone.</p>
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
