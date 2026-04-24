import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { name: '', type: 'summary', project_id: '', status: 'processing', file_url: '', file_size: '' };

const REPORT_TYPES = ['summary', 'progress', 'performance', 'quality', 'agreement', 'accuracy', 'metrics', 'productivity', 'coverage', 'distribution', 'cost', 'compliance', 'export_history', 'errors', 'executive'];

const TYPE_COLORS = {
  summary: '#6366f1', progress: '#3b82f6', performance: '#8b5cf6', quality: '#10b981',
  agreement: '#f59e0b', accuracy: '#ef4444', metrics: '#06b6d4', productivity: '#84cc16',
  coverage: '#ec4899', distribution: '#f97316', cost: '#14b8a6', compliance: '#64748b',
  export_history: '#a855f7', errors: '#dc2626', executive: '#0ea5e9',
};

const STATUS_CLASSES = { completed: 'success', processing: 'info', failed: 'danger' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Reports() {
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
      const res = await api.get('/reports');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleCreate = async () => {
    try {
      const payload = { ...formData, project_id: formData.project_id ? Number(formData.project_id) : null, file_size: formData.file_size ? Number(formData.file_size) : null };
      await api.post('/reports', payload);
      showToast('Report created successfully');
      setShowForm(false);
      setFormData(EMPTY);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to create', 'error'); }
  };

  const handleUpdate = async () => {
    try {
      const payload = { ...formData, project_id: formData.project_id ? Number(formData.project_id) : null, file_size: formData.file_size ? Number(formData.file_size) : null };
      await api.put(`/reports/${selected.id || selected._id}`, payload);
      showToast('Report updated successfully');
      setShowForm(false);
      setSelected(null);
      setEditing(false);
      setFormData(EMPTY);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to update', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/reports/${item.id || item._id}`);
      showToast('Report deleted');
      setSelected(null);
      setConfirmDelete(null);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to delete', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({ name: item.name || '', type: item.type || 'summary', project_id: item.project_id || '', status: item.status || 'processing', file_url: item.file_url || '', file_size: item.file_size || '' });
    setEditing(true);
    setShowForm(true);
  };

  const openCreate = () => {
    setFormData(EMPTY);
    setEditing(false);
    setSelected(null);
    setShowForm(true);
  };

  const parseFilters = (item) => {
    if (!item.filters) return null;
    try {
      return typeof item.filters === 'string' ? JSON.parse(item.filters) : item.filters;
    } catch { return null; }
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '-';
    const num = Number(bytes);
    if (isNaN(num)) return bytes;
    if (num < 1024) return `${num} B`;
    if (num < 1048576) return `${(num / 1024).toFixed(1)} KB`;
    return `${(num / 1048576).toFixed(1)} MB`;
  };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <div className="page-header">
        <h1><span className="page-header-icon">📊</span> Reports</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Report</button>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading reports...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">No reports yet</div>
          <div className="empty-state-desc">Create your first report to get started</div>
          <button className="btn btn-primary" onClick={openCreate}>+ Create Report</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Project ID</th>
                <th>Status</th>
                <th>File Size</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><strong>{item.name}</strong></td>
                  <td><span className="badge" style={{ backgroundColor: TYPE_COLORS[item.type] || '#6b7280', color: '#fff' }}>{item.type || '-'}</span></td>
                  <td>{item.project_id || '-'}</td>
                  <td><span className={`badge badge-${STATUS_CLASSES[item.status] || 'info'}`}>{item.status || 'processing'}</span></td>
                  <td>{formatFileSize(item.file_size)}</td>
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
              <h2>Report Details</h2>
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
                  <div className="detail-value"><span className="badge" style={{ backgroundColor: TYPE_COLORS[selected.type] || '#6b7280', color: '#fff' }}>{selected.type || '-'}</span></div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Project ID</div>
                  <div className="detail-value">{selected.project_id || '-'}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Status</div>
                  <div className="detail-value"><span className={`badge badge-${STATUS_CLASSES[selected.status] || 'info'}`}>{selected.status || 'processing'}</span></div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">File Size</div>
                  <div className="detail-value">{formatFileSize(selected.file_size)}</div>
                </div>
                <div className="detail-field full-width">
                  <div className="detail-label">File URL</div>
                  <div className="detail-value">{selected.file_url ? <a href={selected.file_url} target="_blank" rel="noopener noreferrer">{selected.file_url}</a> : 'No file'}</div>
                </div>
                {parseFilters(selected) && (
                  <div className="detail-field full-width">
                    <div className="detail-label">Filters</div>
                    <div className="detail-value"><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.85em' }}>{JSON.stringify(parseFilters(selected), null, 2)}</pre></div>
                  </div>
                )}
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
              <h2>{editing ? 'Edit Report' : 'New Report'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name</label>
                <input className="form-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Report name" />
              </div>
              <div className="form-group">
                <label>Type</label>
                <select className="form-select" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                  {REPORT_TYPES.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Project ID</label>
                <input className="form-input" type="number" value={formData.project_id} onChange={(e) => setFormData({ ...formData, project_id: e.target.value })} placeholder="Project ID" />
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <option value="processing">Processing</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div className="form-group">
                <label>File URL</label>
                <input className="form-input" value={formData.file_url} onChange={(e) => setFormData({ ...formData, file_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="form-group">
                <label>File Size (bytes)</label>
                <input className="form-input" type="number" value={formData.file_size} onChange={(e) => setFormData({ ...formData, file_size: e.target.value })} placeholder="File size in bytes" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={editing ? handleUpdate : handleCreate}>{editing ? 'Save Changes' : 'Create Report'}</button>
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
                <h2>Delete Report?</h2>
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
