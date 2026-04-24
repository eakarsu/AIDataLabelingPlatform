import React, { useState, useEffect } from 'react';
import api from '../api';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAnalytics = async () => {
      setLoading(true);
      try {
        const res = await api.get('/analytics');
        setData(res.data.data || res.data);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load analytics');
        // Generate fallback data
        setData({
          totalProjects: 0,
          totalDatasets: 0,
          totalAnnotations: 0,
          totalTasks: 0,
          totalTeamMembers: 0,
          completionRate: 0,
          qualityScore: 0,
          annotationsPerDay: [],
        });
      }
      setLoading(false);
    };
    fetchAnalytics();
  }, []);

  if (loading) {
    return <div className="loading-container"><div className="spinner"></div><span>Loading analytics...</span></div>;
  }

  // Extract stats from data
  const stats = [];
  if (data) {
    const keyLabels = {
      totalProjects: 'Total Projects',
      totalDatasets: 'Total Datasets',
      totalAnnotations: 'Total Annotations',
      totalTasks: 'Total Tasks',
      totalTeamMembers: 'Team Members',
      totalLabels: 'Total Labels',
      totalReviews: 'Total Reviews',
      totalExports: 'Total Exports',
      completionRate: 'Completion Rate',
      qualityScore: 'Quality Score',
      activeProjects: 'Active Projects',
      pendingTasks: 'Pending Tasks',
      pendingReviews: 'Pending Reviews',
    };
    for (const [key, label] of Object.entries(keyLabels)) {
      if (data[key] !== undefined) {
        const isPercent = key.includes('Rate') || key.includes('Score');
        stats.push({
          label,
          value: isPercent ? `${(data[key] * 100).toFixed(1)}%` : data[key],
        });
      }
    }
    // If no known keys, show all numeric values
    if (stats.length === 0) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'number') {
          stats.push({ label: key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()), value });
        }
      }
    }
  }

  // Find any array data for charts
  let chartData = [];
  if (data) {
    for (const [key, value] of Object.entries(data)) {
      if (Array.isArray(value) && value.length > 0) {
        chartData = value.map(item => {
          if (typeof item === 'number') return { label: '', value: item };
          if (typeof item === 'object') {
            const label = item.date || item.name || item.label || item.day || '';
            const val = item.count || item.value || item.total || 0;
            return { label, value: val };
          }
          return { label: String(item), value: 0 };
        });
        break;
      }
    }
  }

  const maxChartValue = Math.max(...chartData.map(d => d.value), 1);

  return (
    <div>
      <div className="page-header">
        <h1><span className="page-header-icon">📉</span> Analytics</h1>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {stats.length > 0 && (
        <div className="stats-grid">
          {stats.map((s, i) => (
            <div key={i} className="stat-card">
              <div className="stat-card-label">{s.label}</div>
              <div className="stat-card-value">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {chartData.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 16 }}>Activity Over Time</h3>
          <div className="bar-chart">
            {chartData.slice(-12).map((d, i) => (
              <div key={i} className="bar-chart-item">
                <div className="bar-chart-value">{d.value}</div>
                <div className="bar-chart-bar" style={{ height: `${(d.value / maxChartValue) * 100}%` }}></div>
                <div className="bar-chart-label">{d.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.length === 0 && chartData.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon">📉</div>
          <div className="empty-state-title">No analytics data available</div>
          <div className="empty-state-desc">Start using the platform to generate analytics</div>
        </div>
      )}
    </div>
  );
}
