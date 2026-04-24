import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

export default function AuditLog() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/audit-logs');
      setItems(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch { setItems([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const actionColor = (action) => {
    if (!action) return 'info';
    const a = action.toLowerCase();
    if (a.includes('create') || a.includes('add')) return 'success';
    if (a.includes('delete') || a.includes('remove')) return 'danger';
    if (a.includes('update') || a.includes('edit')) return 'warning';
    return 'info';
  };

  return (
    <div>
      <div className="page-header">
        <h1><span className="page-header-icon">📋</span> Audit Log</h1>
        <button className="btn btn-secondary" onClick={fetchItems}>🔄 Refresh</button>
      </div>
      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading audit logs...</span></div>
      ) : items.length === 0 ? (
        <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-title">No audit logs</div><div className="empty-state-desc">Activity will appear here as actions are performed</div></div>
      ) : (
        <div className="table-container">
          <table className="table">
            <thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Resource</th><th>Details</th></tr></thead>
            <tbody>
              {items.map((item, idx) => (
                <tr key={item.id || item._id || idx} onClick={() => setSelected(item)}>
                  <td>{item.created_at ? new Date(item.created_at).toLocaleString() : (item.timestamp ? new Date(item.timestamp).toLocaleString() : '-')}</td>
                  <td><strong>{item.user || item.userId || item.user_name || '-'}</strong></td>
                  <td><span className={`badge badge-${actionColor(item.action)}`}>{item.action || '-'}</span></td>
                  <td>{item.resource || item.resourceType || '-'}</td>
                  <td>{item.details || item.description || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <div className="modal-overlay" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header"><h2>Audit Log Entry</h2><button className="modal-close" onClick={() => setSelected(null)}>&times;</button></div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-field"><div className="detail-label">Timestamp</div><div className="detail-value">{selected.created_at ? new Date(selected.created_at).toLocaleString() : (selected.timestamp ? new Date(selected.timestamp).toLocaleString() : '-')}</div></div>
                <div className="detail-field"><div className="detail-label">User</div><div className="detail-value">{selected.user || selected.userId || selected.user_name || '-'}</div></div>
                <div className="detail-field"><div className="detail-label">Action</div><div className="detail-value"><span className={`badge badge-${actionColor(selected.action)}`}>{selected.action}</span></div></div>
                <div className="detail-field"><div className="detail-label">Resource</div><div className="detail-value">{selected.resource || selected.resourceType || '-'}</div></div>
                {selected.resource_id && <div className="detail-field"><div className="detail-label">Resource ID</div><div className="detail-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{selected.resource_id}</div></div>}
                <div className="detail-field full-width"><div className="detail-label">Details</div><div className="detail-value">{selected.details || selected.description || 'No additional details'}</div></div>
                {selected.metadata && (
                  <div className="detail-field full-width"><div className="detail-label">Metadata</div><div className="detail-value"><pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{typeof selected.metadata === 'string' ? selected.metadata : JSON.stringify(selected.metadata, null, 2)}</pre></div></div>
                )}
                {selected.ip_address && <div className="detail-field"><div className="detail-label">IP Address</div><div className="detail-value" style={{ fontFamily: 'monospace' }}>{selected.ip_address}</div></div>}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
