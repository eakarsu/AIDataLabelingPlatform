import React, { useEffect, useState } from 'react';
import api from '../api';

// VIZ — labels/hour per annotator. Renders an inline SVG multi-line chart (no chart lib).
export default function ThroughputChart() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/custom-views/throughput-chart')
      .then(r => { if (alive) setData(r.data); })
      .catch(e => { if (alive) setErr(e.response?.data?.error || 'Failed to load throughput'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="card" style={{padding:16}}>Loading throughput chart…</div>;
  if (err) return <div className="card" style={{padding:16, color:'#c33'}}>Error: {err}</div>;
  if (!data) return null;

  const W = 720, H = 260, P = 36;
  const series = data.series || [];
  const allPoints = series.flatMap(s => s.points.map(p => p.labels));
  const maxY = Math.max(10, ...allPoints);
  const ticks = series[0]?.points?.length || 1;
  const colors = ['#2563eb', '#16a34a', '#dc2626', '#9333ea', '#f59e0b', '#0891b2'];

  const x = i => P + (i * (W - 2 * P)) / Math.max(1, ticks - 1);
  const y = v => H - P - (v / maxY) * (H - 2 * P);

  return (
    <div className="card" style={{padding:16, marginBottom:16}}>
      <h3 style={{marginTop:0}}>Throughput — Labels per Hour by Annotator</h3>
      <div style={{fontSize:12, color:'#666', marginBottom:8}}>Window: {data.window} · Generated {new Date(data.generated_at).toLocaleString()}</div>
      <svg width={W} height={H} style={{background:'#fafafa', border:'1px solid #eee', borderRadius:6}}>
        {/* axes */}
        <line x1={P} y1={H-P} x2={W-P} y2={H-P} stroke="#999" />
        <line x1={P} y1={P} x2={P} y2={H-P} stroke="#999" />
        {/* y-axis labels */}
        {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
          <g key={i}>
            <line x1={P-3} x2={P} y1={y(maxY*f)} y2={y(maxY*f)} stroke="#999" />
            <text x={P-6} y={y(maxY*f)+4} fontSize="10" textAnchor="end" fill="#555">{Math.round(maxY*f)}</text>
          </g>
        ))}
        {/* series */}
        {series.map((s, si) => {
          const path = s.points.map((p, i) => `${i===0?'M':'L'} ${x(i)} ${y(p.labels)}`).join(' ');
          return (
            <g key={si}>
              <path d={path} fill="none" stroke={colors[si % colors.length]} strokeWidth="2" />
              {s.points.map((p, i) => (
                <circle key={i} cx={x(i)} cy={y(p.labels)} r="3" fill={colors[si % colors.length]} />
              ))}
            </g>
          );
        })}
      </svg>
      <div style={{marginTop:10, display:'flex', flexWrap:'wrap', gap:12}}>
        {series.map((s, si) => (
          <div key={si} style={{display:'flex', alignItems:'center', gap:6, fontSize:12}}>
            <span style={{display:'inline-block', width:12, height:12, background:colors[si % colors.length], borderRadius:2}} />
            {s.annotator}
          </div>
        ))}
      </div>
      <div style={{marginTop:12}}>
        <table style={{width:'100%', fontSize:13, borderCollapse:'collapse'}}>
          <thead><tr style={{textAlign:'left', background:'#f3f4f6'}}>
            <th style={{padding:6}}>Annotator</th><th style={{padding:6}}>Total (24h)</th><th style={{padding:6}}>Avg / hr</th>
          </tr></thead>
          <tbody>
            {(data.totals || []).map((t, i) => (
              <tr key={i} style={{borderTop:'1px solid #eee'}}>
                <td style={{padding:6}}>{t.annotator}</td>
                <td style={{padding:6}}>{t.total}</td>
                <td style={{padding:6}}>{t.avgPerHour}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
