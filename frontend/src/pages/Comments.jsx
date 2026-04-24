import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

const EMPTY = { resource_type: 'project', resource_id: '', content: '' };

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

export default function Comments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(EMPTY);
  const [toast, setToast] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/comments');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const handleCreate = async () => {
    if (!formData.content.trim()) { showToast('Content is required', 'error'); return; }
    if (!formData.resource_id) { showToast('Resource ID is required', 'error'); return; }
    try {
      await api.post('/comments', formData);
      showToast('Comment posted');
      setShowForm(false); setFormData(EMPTY); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to post comment', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/comments/${item.id || item._id}`);
      showToast('Comment deleted'); setConfirmDelete(null); fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to delete', 'error'); }
  };

  const openCreate = () => { setFormData(EMPTY); setShowForm(true); };

  const filtered = filter === 'all' ? items : items.filter((c) => c.resource_type === filter);

  const formatTime = (ts) => {
    if (!ts) return '-';
    const d = new Date(ts);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  };

  const getInitial = (name) => (name || 'U').charAt(0).toUpperCase();

  const resourceColor = (type) => {
    if (type === 'project') return '#4f46e5';
    if (type === 'task') return '#0891b2';
    if (type === 'annotation') return '#059669';
    return '#6b7280';
  };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1><span className="page-header-icon">💬</span> Comments</h1>
        <button className="btn btn-primary" onClick={openCreate}>+ New Comment</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {['all', 'project', 'task', 'annotation'].map((t) => (
          <button
            key={t}
            className={`btn ${filter === t ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setFilter(t)}
            style={{ textTransform: 'capitalize' }}
          >
            {t === 'all' ? 'All' : t}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading comments...</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">💬</div>
          <div className="empty-state-title">No comments yet</div>
          <div className="empty-state-desc">{filter !== 'all' ? `No comments on ${filter}s` : 'Start the discussion by posting a comment'}</div>
          <button className="btn btn-primary" onClick={openCreate}>+ Post Comment</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map((item) => (
            <div key={item.id || item._id} style={{
              background: '#fff', borderRadius: 8, padding: 16, border: '1px solid #e5e7eb',
              display: 'flex', gap: 12, alignItems: 'flex-start'
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: resourceColor(item.resource_type),
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 600, fontSize: 16, flexShrink: 0
              }}>
                {getInitial(item.user_name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 14 }}>{item.user_name || 'Unknown User'}</strong>
                  <span style={{
                    fontSize: 12, color: '#6b7280'
                  }}>
                    on <span style={{ color: resourceColor(item.resource_type), fontWeight: 500 }}>{item.resource_type}</span> #{item.resource_id}
                  </span>
                  <span style={{ fontSize: 12, color: '#9ca3af', marginLeft: 'auto' }}>{formatTime(item.created_at)}</span>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 14, color: '#374151', lineHeight: 1.5, wordBreak: 'break-word' }}>
                  {item.content}
                </p>
              </div>
              <button
                className="btn btn-danger"
                style={{ fontSize: 12, padding: '4px 10px', flexShrink: 0 }}
                onClick={() => setConfirmDelete(item)}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>New Comment</h2><button className="modal-close" onClick={() => setShowForm(false)}>&times;</button></div>
            <div className="modal-body">
              <div className="form-group"><label>Resource Type</label>
                <select className="form-select" value={formData.resource_type} onChange={(e) => setFormData({ ...formData, resource_type: e.target.value })}>
                  <option value="project">Project</option>
                  <option value="task">Task</option>
                  <option value="annotation">Annotation</option>
                </select>
              </div>
              <div className="form-group"><label>Resource ID</label>
                <input className="form-input" type="number" value={formData.resource_id} onChange={(e) => setFormData({ ...formData, resource_id: e.target.value })} placeholder="Enter resource ID" />
              </div>
              <div className="form-group"><label>Comment</label>
                <textarea className="form-textarea" rows={4} value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} placeholder="Write your comment..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate}>Post Comment</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body">
              <div className="confirm-dialog">
                <div className="confirm-icon">⚠️</div>
                <h2>Delete Comment?</h2>
                <p className="confirm-message">This comment will be permanently removed.</p>
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
