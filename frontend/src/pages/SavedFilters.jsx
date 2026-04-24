import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { name: '', page: 'projects', filters: '{}' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function SavedFilters() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY);
  const [toast, setToast] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/saved-filters');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleCreate = async () => {
    try {
      let parsedFilters;
      try {
        parsedFilters = JSON.parse(formData.filters);
      } catch {
        showToast('Filters must be valid JSON', 'error');
        return;
      }
      await api.post('/saved-filters', { name: formData.name, page: formData.page, filters: parsedFilters });
      showToast('Saved filter created successfully');
      setShowForm(false);
      setFormData(EMPTY);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to create', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/saved-filters/${item.id || item._id}`);
      showToast('Saved filter deleted');
      setSelected(null);
      setConfirmDelete(null);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to delete', 'error'); }
  };

  const openCreate = () => {
    setFormData(EMPTY);
    setSelected(null);
    setShowForm(true);
  };

  const truncateFilters = (filters) => {
    const str = typeof filters === 'string' ? filters : JSON.stringify(filters);
    return str.length > 50 ? str.substring(0, 50) + '...' : str;
  };

  const prettifyFilters = (filters) => {
    try {
      const obj = typeof filters === 'string' ? JSON.parse(filters) : filters;
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(filters);
    }
  };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}

      <div className="page-header">
        <h1><span className="page-header-icon">🔖</span> Saved Filters</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Saved Filter</button>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading saved filters...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔖</div>
          <div className="empty-state-title">No saved filters yet</div>
          <div className="empty-state-desc">Create your first saved filter to get started</div>
          <button className="btn btn-primary" onClick={openCreate}>+ Create Saved Filter</button>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Page</th>
                <th>Filters</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><strong>{item.name}</strong></td>
                  <td><span className="badge badge-active">{item.page}</span></td>
                  <td><code>{truncateFilters(item.filters)}</code></td>
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
              <h2>Saved Filter Details</h2>
              <button className="modal-close" onClick={() => setSelected(null)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field">
                  <div className="detail-label">Name</div>
                  <div className="detail-value">{selected.name}</div>
                </div>
                <div className="detail-field">
                  <div className="detail-label">Page</div>
                  <div className="detail-value"><span className="badge badge-active">{selected.page}</span></div>
                </div>
                <div className="detail-field full-width">
                  <div className="detail-label">Filters</div>
                  <div className="detail-value"><pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#f5f5f5', padding: '12px', borderRadius: '6px', fontSize: '13px' }}>{prettifyFilters(selected.filters)}</pre></div>
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
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>New Saved Filter</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Name</label>
                <input className="form-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Filter name" />
              </div>
              <div className="form-group">
                <label>Page</label>
                <select className="form-select" value={formData.page} onChange={(e) => setFormData({ ...formData, page: e.target.value })}>
                  <option value="projects">Projects</option>
                  <option value="datasets">Datasets</option>
                  <option value="tasks">Tasks</option>
                  <option value="annotations">Annotations</option>
                  <option value="reviews">Reviews</option>
                  <option value="team">Team</option>
                  <option value="exports">Exports</option>
                </select>
              </div>
              <div className="form-group">
                <label>Filters (JSON)</label>
                <textarea className="form-textarea" value={formData.filters} onChange={(e) => setFormData({ ...formData, filters: e.target.value })} placeholder='{"status": "active"}' rows={6} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Create Saved Filter</button>
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
                <h2>Delete Saved Filter?</h2>
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
