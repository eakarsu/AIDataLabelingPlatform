import React, { useState, useEffect, useCallback } from 'react';
import api from '../api';

function timeAgo(dateString) {
  if (!dateString) return '';
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(months / 12);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
}

function actionColor(action) {
  if (!action) return 'info';
  const a = action.toLowerCase();
  if (a.includes('create') || a.includes('add')) return 'success';
  if (a.includes('delete') || a.includes('remove')) return 'danger';
  if (a.includes('update') || a.includes('edit')) return 'warning';
  return 'info';
}

export default function ActivityFeed() {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resourceFilter, setResourceFilter] = useState('all');
  const [userSearch, setUserSearch] = useState('');

  const fetchActivities = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/activity-feed');
      setActivities(Array.isArray(res.data) ? res.data : res.data.data || []);
    } catch {
      setActivities([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  const resourceTypes = ['all', ...new Set(activities.map(a => a.resource_type).filter(Boolean))];

  const filtered = activities.filter(item => {
    if (resourceFilter !== 'all' && item.resource_type !== resourceFilter) return false;
    if (userSearch && !(item.user_name || '').toLowerCase().includes(userSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="page-header">
        <h1><span className="page-header-icon">📰</span> Activity Feed</h1>
        <button className="btn btn-secondary" onClick={fetchActivities}>🔄 Refresh</button>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input
          className="form-input"
          type="text"
          placeholder="Search by user name..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          style={{ maxWidth: 260 }}
        />
        <select
          className="form-select"
          value={resourceFilter}
          onChange={(e) => setResourceFilter(e.target.value)}
          style={{ maxWidth: 200 }}
        >
          {resourceTypes.map(type => (
            <option key={type} value={type}>
              {type === 'all' ? 'All Resources' : type.charAt(0).toUpperCase() + type.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="loading-container"><div className="spinner"></div><span>Loading activity feed...</span></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📰</div>
          <div className="empty-state-title">No activities found</div>
          <div className="empty-state-desc">
            {userSearch || resourceFilter !== 'all'
              ? 'Try adjusting your filters'
              : 'Activity will appear here as actions are performed'}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {filtered.map((item, idx) => (
            <div
              key={item.id || item._id || idx}
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', borderBottom: '1px solid var(--border)' }}
            >
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  backgroundColor: 'var(--accent)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: 14,
                  flexShrink: 0,
                }}
              >
                {(item.user_name || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{item.user_name || 'Unknown'}</strong>
                  <span className={`badge badge-${actionColor(item.action)}`}>{item.action || '-'}</span>
                  {item.resource_type && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
                      on {item.resource_type} #{item.resource_id || '-'}
                    </span>
                  )}
                </div>
                {item.details && (
                  <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 4 }}>
                    {item.details}
                  </div>
                )}
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>
                  {timeAgo(item.created_at || item.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
