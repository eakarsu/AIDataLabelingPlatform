import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { name: '', color: '#3B82F6' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Tags() {
  const [items, setItems] = useState([]);
  const [resourceTags, setResourceTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [assignData, setAssignData] = useState({ resource_type: 'project', resource_id: '' });

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [tagsRes, rtRes] = await Promise.all([
        api.get('/tags'),
        api.get('/resource-tags'),
      ]);
      setItems(Array.isArray(tagsRes.data) ? tagsRes.data : tagsRes.data.data || []);
      setResourceTags(Array.isArray(rtRes.data) ? rtRes.data : rtRes.data.data || []);
    } catch {
      setItems([]);
      setResourceTags([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const getAssignmentCount = (tagId) => resourceTags.filter((rt) => rt.tag_id === tagId).length;

  const getAssignedResources = (tagId) => resourceTags.filter((rt) => rt.tag_id === tagId);

  const handleCreate = async () => {
    try {
      await api.post('/tags', formData);
      showToast('Tag created successfully');
      setShowForm(false);
      setFormData(EMPTY);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to create', 'error'); }
  };

  const handleUpdate = async () => {
    try {
      await api.put(`/tags/${selected.id || selected._id}`, formData);
      showToast('Tag updated successfully');
      setShowForm(false);
      setSelected(null);
      setEditing(false);
      setFormData(EMPTY);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to update', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/tags/${item.id || item._id}`);
      showToast('Tag deleted');
      setSelected(null);
      setConfirmDelete(null);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to delete', 'error'); }
  };

  const handleAssign = async () => {
    try {
      await api.post(`/tags/${selected.id || selected._id}/assign`, {
        resource_type: assignData.resource_type,
        resource_id: Number(assignData.resource_id),
      });
      showToast('Tag assigned successfully');
      setAssignData({ resource_type: 'project', resource_id: '' });
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to assign tag', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({ name: item.name || '', color: item.color || '#3B82F6' });
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
        <h1><span className="page-header-icon">🏷️</span> Tags</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Tag</button>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading tags...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏷️</div>
          <div className="empty-state-title">No tags yet</div>
          <div className="empty-state-desc">Create your first tag to get started</div>
          <button className="btn btn-primary" onClick={openCreate}>+ Create Tag</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Color</th>
                <th>Assignments</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td>
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', backgroundColor: item.color, marginRight: 8 }}></span>
                    <strong>{item.name}</strong>
                  </td>
                  <td>{item.color || '-'}</td>
                  <td>{getAssignmentCount(item.id || item._id)}</td>
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
              <h2>Tag Details</h2>
              <button className="modal-close" onClick={() => setSelected(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field">
                  <div className="detail-label">Name</div>
                  <div className="detail-value">
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', backgroundColor: selected.color, marginRight: 8 }}></span>
                    {selected.name}
                  </div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Color</div>
                  <div className="detail-value">
                    <span style={{ display: 'inline-block', width: 12, height: 12, borderRadius: '50%', backgroundColor: selected.color, marginRight: 8 }}></span>
                    {selected.color}
                  </div>
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

              {/* Assigned Resources */}
              <div style={{ marginTop: 20 }}>
                <h3>Assigned Resources ({getAssignedResources(selected.id || selected._id).length})</h3>
                {getAssignedResources(selected.id || selected._id).length === 0 ? (
                  <p style={{ color: '#888' }}>No resources assigned to this tag.</p>
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Resource Type</th>
                          <th>Resource ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {getAssignedResources(selected.id || selected._id).map((rt, idx) => (
                          <tr key={idx}>
                            <td>{rt.resource_type}</td>
                            <td>{rt.resource_id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Assign Tag Section */}
              <div style={{ marginTop: 20, padding: 16, background: '#f9fafb', borderRadius: 8 }}>
                <h3>Assign Tag</h3>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ margin: 0, flex: 1 }}>
                    <label>Resource Type</label>
                    <select className="form-select" value={assignData.resource_type} onChange={(e) => setAssignData({ ...assignData, resource_type: e.target.value })}>
                      <option value="project">Project</option>
                      <option value="task">Task</option>
                      <option value="dataset">Dataset</option>
                      <option value="annotation">Annotation</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: 1 }}>
                    <label>Resource ID</label>
                    <input className="form-input" type="number" value={assignData.resource_id} onChange={(e) => setAssignData({ ...assignData, resource_id: e.target.value })} placeholder="Resource ID" />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleAssign}>Assign</button>
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
              <h2>{editing ? 'Edit Tag' : 'New Tag'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name</label>
                <input className="form-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Tag name" />
              </div>
              <div className="form-group">
                <label>Color</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input type="color" value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} />
                  <span>{formData.color}</span>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={editing ? handleUpdate : handleCreate}>{editing ? 'Save Changes' : 'Create Tag'}</button>
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
                <h2>Delete Tag?</h2>
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
