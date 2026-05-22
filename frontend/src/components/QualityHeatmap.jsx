import React, { useEffect, useState } from 'react';
import api from '../api';

// VIZ — annotator x label-class agreement %. CSS-grid heatmap.
export default function QualityHeatmap() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    api.get('/custom-views/quality-heatmap')
      .then(r => { if (alive) setData(r.data); })
      .catch(e => { if (alive) setErr(e.response?.data?.error || 'Failed to load heatmap'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  if (loading) return <div className="card" style={{padding:16}}>Loading quality heatmap…</div>;
  if (err) return <div className="card" style={{padding:16, color:'#c33'}}>Error: {err}</div>;
  if (!data) return null;

  const colorFor = v => {
    if (v >= 90) return '#16a34a';
    if (v >= 75) return '#84cc16';
    if (v >= 60) return '#f59e0b';
    return '#dc2626';
  };

  const { annotators, labelClasses, matrix } = data;

  return (
    <div className="card" style={{padding:16, marginBottom:16}}>
      <h3 style={{marginTop:0}}>Quality Heatmap — Annotator × Label Class (agreement %)</h3>
      <div style={{overflowX:'auto'}}>
        <table style={{borderCollapse:'collapse', fontSize:12}}>
          <thead>
            <tr>
              <th style={{padding:6, background:'#f3f4f6', border:'1px solid #e5e7eb'}}>Annotator \ Class</th>
              {labelClasses.map(lc => (
                <th key={lc} style={{padding:6, background:'#f3f4f6', border:'1px solid #e5e7eb'}}>{lc}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {annotators.map((a, ai) => (
              <tr key={ai}>
                <td style={{padding:6, fontWeight:600, border:'1px solid #e5e7eb', background:'#fafafa'}}>{a}</td>
                {labelClasses.map((lc, li) => {
                  const v = matrix[ai][li];
                  return (
                    <td key={li} title={`${a} · ${lc}: ${v}%`}
                        style={{padding:8, textAlign:'center', minWidth:60, color:'#fff',
                                background:colorFor(v), border:'1px solid #fff'}}>
                      {v}%
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{display:'flex', gap:14, marginTop:10, fontSize:12, flexWrap:'wrap'}}>
        {(data.legend || []).map((l, i) => (
          <div key={i} style={{display:'flex', alignItems:'center', gap:6}}>
            <span style={{display:'inline-block', width:14, height:14, background:colorFor(l.min+1), borderRadius:3}} />
            {l.label} (≥{l.min}%)
          </div>
        ))}
      </div>
    </div>
  );
}
