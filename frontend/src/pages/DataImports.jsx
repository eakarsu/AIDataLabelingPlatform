import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { name: '', project_id: '', dataset_id: '', source: 'file', format: 'csv', status: 'pending', total_items: 0, imported_items: 0, errors: 0, error_log: '' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function DataImports() {
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
      const res = await api.get('/data-imports');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleCreate = async () => {
    try {
      await api.post('/data-imports', formData);
      showToast('Data import created successfully');
      setShowForm(false);
      setFormData(EMPTY);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to create', 'error'); }
  };

  const handleUpdate = async () => {
    try {
      await api.put(`/data-imports/${selected.id || selected._id}`, formData);
      showToast('Data import updated successfully');
      setShowForm(false);
      setSelected(null);
      setEditing(false);
      setFormData(EMPTY);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to update', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/data-imports/${item.id || item._id}`);
      showToast('Data import deleted');
      setSelected(null);
      setConfirmDelete(null);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to delete', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({ name: item.name || '', project_id: item.project_id || '', dataset_id: item.dataset_id || '', source: item.source || 'file', format: item.format || 'csv', status: item.status || 'pending', total_items: item.total_items || 0, imported_items: item.imported_items || 0, errors: item.errors || 0, error_log: item.error_log || '' });
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
    const map = { completed: 'success', in_progress: 'info', failed: 'danger', pending: 'warning' };
    return map[status] || 'info';
  };

  const progressText = (item) => {
    const total = item.total_items || 0;
    const imported = item.imported_items || 0;
    const pct = total > 0 ? Math.round((imported / total) * 100) : 0;
    return `${imported} / ${total} (${pct}%)`;
  };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <div className="page-header">
        <h1><span className="page-header-icon">📥</span> Data Imports</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Import</button>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading data imports...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📥</div>
          <div className="empty-state-title">No data imports yet</div>
          <div className="empty-state-desc">Create your first data import to get started</div>
          <button className="btn btn-primary" onClick={openCreate}>+ Create Import</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Project</th>
                <th>Source</th>
                <th>Format</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Errors</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><strong>{item.name}</strong></td>
                  <td>{item.project_id || '-'}</td>
                  <td>{item.source || '-'}</td>
                  <td>{item.format || '-'}</td>
                  <td><span className={`badge badge-${statusBadge(item.status)}`}>{item.status || 'pending'}</span></td>
                  <td>{progressText(item)}</td>
                  <td>{item.errors || 0}</td>
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
              <h2>Data Import Details</h2>
              <button className="modal-close" onClick={() => setSelected(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field">
                  <div className="detail-label">Name</div>
                  <div className="detail-value">{selected.name}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Status</div>
                  <div className="detail-value"><span className={`badge badge-${statusBadge(selected.status)}`}>{selected.status || 'pending'}</span></div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Project ID</div>
                  <div className="detail-value">{selected.project_id || '-'}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Dataset ID</div>
                  <div className="detail-value">{selected.dataset_id || '-'}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Source</div>
                  <div className="detail-value">{selected.source || '-'}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Format</div>
                  <div className="detail-value">{selected.format || '-'}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Progress</div>
                  <div className="detail-value">{progressText(selected)}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Errors</div>
                  <div className="detail-value">{selected.errors || 0}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Created</div>
                  <div className="detail-value">{selected.created_at ? new Date(selected.created_at).toLocaleString() : '-'}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Updated</div>
                  <div className="detail-value">{selected.updated_at ? new Date(selected.updated_at).toLocaleString() : '-'}</div>
                </div>
                {selected.error_log && (
                  <div className="detail-field full-width">
                    <div className="detail-label">Error Log</div>
                    <div className="detail-value"><pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{selected.error_log}</pre></div>
                  </div>
                )}
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
              <h2>{editing ? 'Edit Data Import' : 'New Data Import'}</h2>
              <button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name</label>
                <input className="form-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Import name" />
              </div>
              <div className="form-group">
                <label>Project ID</label>
                <input className="form-input" type="number" value={formData.project_id} onChange={(e) => setFormData({ ...formData, project_id: e.target.value })} placeholder="Project ID" />
              </div>
              <div className="form-group">
                <label>Dataset ID</label>
                <input className="form-input" type="number" value={formData.dataset_id} onChange={(e) => setFormData({ ...formData, dataset_id: e.target.value })} placeholder="Dataset ID" />
              </div>
              <div className="form-group">
                <label>Source</label>
                <select className="form-select" value={formData.source} onChange={(e) => setFormData({ ...formData, source: e.target.value })}>
                  <option value="file">File</option>
                  <option value="api">API</option>
                  <option value="s3">S3</option>
                  <option value="url">URL</option>
                </select>
              </div>
              <div className="form-group">
                <label>Format</label>
                <select className="form-select" value={formData.format} onChange={(e) => setFormData({ ...formData, format: e.target.value })}>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                  <option value="jsonl">JSONL</option>
                  <option value="xml">XML</option>
                  <option value="pdf">PDF</option>
                  <option value="jpg">JPG</option>
                  <option value="dicom">DICOM</option>
                  <option value="wav">WAV</option>
                  <option value="tiff">TIFF</option>
                  <option value="html">HTML</option>
                </select>
              </div>
              <div className="form-group">
                <label>Status</label>
                <select className="form-select" value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
              <div className="form-group">
                <label>Total Items</label>
                <input className="form-input" type="number" value={formData.total_items} onChange={(e) => setFormData({ ...formData, total_items: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label>Imported Items</label>
                <input className="form-input" type="number" value={formData.imported_items} onChange={(e) => setFormData({ ...formData, imported_items: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label>Errors</label>
                <input className="form-input" type="number" value={formData.errors} onChange={(e) => setFormData({ ...formData, errors: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label>Error Log</label>
                <textarea className="form-textarea" value={formData.error_log} onChange={(e) => setFormData({ ...formData, error_log: e.target.value })} placeholder="Error log details" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={editing ? handleUpdate : handleCreate}>{editing ? 'Save Changes' : 'Create Import'}</button>
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
                <h2>Delete Data Import?</h2>
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
