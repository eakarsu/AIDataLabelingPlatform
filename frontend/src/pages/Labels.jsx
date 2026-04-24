import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { name: '', type: 'classification', options: '', color: '#3b82f6', project_id: '' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Labels() {
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
      const res = await api.get('/labels');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleSave = async () => {
    try {
      const payload = { ...formData };
      if (typeof payload.options === 'string') {
        payload.options = payload.options.split(',').map(s => s.trim()).filter(Boolean);
      }
      if (editing) {
        await api.put(`/labels/${selected.id || selected._id}`, payload);
        showToast('Label updated');
      } else {
        await api.post('/labels', payload);
        showToast('Label created');
      }
      setShowForm(false); setEditing(false); setSelected(null); setFormData(EMPTY); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/labels/${item.id || item._id}`);
      showToast('Label deleted'); setSelected(null); setConfirmDelete(null); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed', 'error'); }
  };

  const openEdit = (item) => {
    setFormData({
      name: item.name || '', type: item.type || 'classification',
      options: Array.isArray(item.options) ? item.options.join(', ') : (item.options || ''),
      color: item.color || '#3b82f6', project_id: item.project_id || ''
    });
    setEditing(true); setShowForm(true);
  };

  const openCreate = () => { setFormData(EMPTY); setEditing(false); setSelected(null); setShowForm(true); };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1><span className="page-header-icon">🏷️</span> Labels</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Label</button>
      </div>
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading labels...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">🏷️</div><div className="empty-state-title">No labels yet</div><div className="empty-state-desc">Create label templates for your projects</div><button className="btn btn-primary" onClick={openCreate}>+ Create Label</button></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Color</th><th>Name</th><th>Type</th><th>Options</th><th>Created</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id || item._id} onClick={() => setSelected(item)}>
                  <td><span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 4, background: item.color || '#3b82f6' }}></span></td>
                  <td><strong>{item.name}</strong></td>
                  <td><span className="badge badge-info">{item.type || 'classification'}</span></td>
                  <td>{Array.isArray(item.options) ? item.options.join(', ') : (item.options || '-')}</td>
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
            <div className="modal-header"><h2>Label Details</h2><button className="modal-close" onClick={() => setSelected(null)}>&times;</button></div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field"><div className="detail-label">Name</div><div className="detail-value">{selected.name}</div></div>
                <div className="detail-field"><div className="detail-label">Type</div><div className="detail-value"><span className="badge badge-info">{selected.type}</span></div></div>
                <div className="detail-field"><div className="detail-label">Color</div><div className="detail-value"><span style={{ display: 'inline-block', width: 24, height: 24, borderRadius: 4, background: selected.color || '#3b82f6', verticalAlign: 'middle', marginRight: 8 }}></span>{selected.color}</div></div>
                <div className="detail-field full-width"><div className="detail-label">Options</div><div className="detail-value">{Array.isArray(selected.options) ? selected.options.join(', ') : (selected.options || 'None')}</div></div>
                <div className="detail-field"><div className="detail-label">Created</div><div className="detail-value">{selected.created_at ? new Date(selected.created_at).toLocaleString() : '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Updated</div><div className="detail-value">{selected.updated_at ? new Date(selected.updated_at).toLocaleString() : '-'}</div></div>
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
            <div className="modal-header"><h2>{editing ? 'Edit Label' : 'New Label'}</h2><button className="modal-close" onClick={() => { setShowForm(false); setEditing(false); }}>&times;</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Name</label><input className="form-input" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Label name" /></div>
              <div className="form-group"><label>Type</label>
                <select className="form-select" value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}>
                  <option value="classification">Classification</option><option value="ner">NER</option><option value="sentiment">Sentiment</option><option value="bounding_box">Bounding Box</option>
                </select>
              </div>
              <div className="form-group"><label>Options (comma separated)</label><input className="form-input" value={formData.options} onChange={(e) => setFormData({ ...formData, options: e.target.value })} placeholder="option1, option2, option3" /></div>
              <div className="form-group"><label>Color</label><input type="color" className="form-input" style={{ height: 44, padding: 4 }} value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(false); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>{editing ? 'Save Changes' : 'Create Label'}</button>
            </div>
          </div>
        </div>
      )}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body"><div className="confirm-dialog"><div className="confirm-icon">⚠️</div><h2>Delete Label?</h2><p className="confirm-message">Delete "{confirmDelete.name}"?</p><div className="confirm-actions"><button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>Cancel</button><button className="btn btn-danger" onClick={() => handleDelete(confirmDelete)}>Delete</button></div></div></div>
          </div>
        </div>
      )}
    </div>
  );
}
