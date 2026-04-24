import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

function Toast({ message, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div className={`toast toast-${type}`}>{type === 'success' ? '✓' : '✕'} {message}</div>;
}

const TYPE_ICONS = {
  task: '📝',
  review: '🔍',
  export: '📦',
  alert: '🚨',
  warning: '⚠️',
  system: '⚙️',
  info: '💬',
};

const TYPE_OPTIONS = ['all', 'task', 'review', 'export', 'alert', 'warning', 'system', 'info'];

function timeAgo(dateStr) {
  if (!dateStr) return '-';
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function typeBadgeColor(type) {
  if (!type) return 'info';
  const t = type.toLowerCase();
  if (t === 'alert' || t === 'warning') return 'warning';
  if (t === 'task') return 'primary';
  if (t === 'review') return 'info';
  if (t === 'export') return 'success';
  if (t === 'system') return 'secondary';
  return 'info';
}

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all' or 'unread'
  const [typeFilter, setTypeFilter] = useState('all');
  const [confirmDelete, setConfirmDelete] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/notifications');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  const showToast = (message, type = 'success') => setToast({ message, type });

  const unreadCount = items.filter((n) => !n.read && !n.is_read).length;

  const filtered = items.filter((n) => {
    if (filter === 'unread' && (n.read || n.is_read)) return false;
    if (typeFilter !== 'all' && (n.type || '').toLowerCase() !== typeFilter) return false;
    return true;
  });

  const markAsRead = async (item) => {
    try {
      await api.put(`/notifications/${item.id || item._id}/read`);
      showToast('Marked as read');
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to mark as read', 'error'); }
  };

  const markAllAsRead = async () => {
    try {
      await api.put('/notifications/read-all');
      showToast('All notifications marked as read');
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to mark all as read', 'error'); }
  };

  const handleDelete = async (item) => {
    try {
      await api.delete(`/notifications/${item.id || item._id}`);
      showToast('Notification deleted');
      setConfirmDelete(null);
      fetchItems();
    } catch (err) { showToast(err.response?.data?.error || 'Failed to delete', 'error'); }
  };

  return (
    <div>
      {toast && <div className="toast-container"><Toast {...toast} onClose={() => setToast(null)} /></div>}
      <div className="page-header">
        <h1>
          <span className="page-header-icon">🔔</span> Notifications
          {unreadCount > 0 && <span className="badge badge-danger" style={{ marginLeft: 8, fontSize: 14, verticalAlign: 'middle' }}>{unreadCount} unread</span>}
        </h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="form-select" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ minWidth: 110 }}>
            <option value="all">All</option>
            <option value="unread">Unread</option>
          </select>
          <select className="form-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={{ minWidth: 120 }}>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>{t === 'all' ? 'All Types' : t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          {unreadCount > 0 && <button className="btn btn-secondary" onClick={markAllAsRead}>✓ Mark All Read</button>}
          <button className="btn btn-secondary" onClick={fetchItems}>🔄 Refresh</button>
        </div>
      </div>
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading notifications...</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🔔</div>
          <div className="empty-state-title">No notifications</div>
          <div className="empty-state-desc">{filter === 'unread' ? 'No unread notifications' : 'You have no notifications yet'}</div>
        </div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 10 }}></th>
                <th style={{ width: 40 }}></th>
                <th>Title</th>
                <th>Message</th>
                <th>Type</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const isRead = item.read || item.is_read;
                const icon = TYPE_ICONS[(item.type || '').toLowerCase()] || '💬';
                return (
                  <tr key={item.id || item._id} style={{ opacity: isRead ? 0.7 : 1 }}>
                    <td>
                      {!isRead && (
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} title="Unread"></span>
                      )}
                    </td>
                    <td style={{ fontSize: 20, textAlign: 'center' }}>{icon}</td>
                    <td><strong>{item.title || '-'}</strong></td>
                    <td>{(item.message || item.body || '').substring(0, 80) || '-'}</td>
                    <td><span className={`badge badge-${typeBadgeColor(item.type)}`}>{item.type || 'info'}</span></td>
                    <td style={{ whiteSpace: 'nowrap' }}>{timeAgo(item.created_at || item.timestamp)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {!isRead && (
                        <button className="btn btn-secondary btn-sm" onClick={() => markAsRead(item)} style={{ marginRight: 4 }}>✓ Read</button>
                      )}
                      <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete(item)}>🗑</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div className="modal-body">
              <div className="confirm-dialog">
                <div className="confirm-icon">⚠️</div>
                <h2>Delete Notification?</h2>
                <p className="confirm-message">This cannot be undone.</p>
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
