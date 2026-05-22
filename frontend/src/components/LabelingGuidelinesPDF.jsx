import React, { useEffect, useState } from 'react';
import api from '../api';

// NON-VIZ — dataset spec / labeling guidelines "PDF" (text payload + download).
export default function LabelingGuidelinesPDF() {
  const [data, setData] = useState(null);
  const [dataset, setDataset] = useState('default');
  const [pending, setPending] = useState('default');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  const load = (name) => {
    setLoading(true); setErr('');
    api.get(`/custom-views/labeling-guidelines-pdf?dataset=${encodeURIComponent(name)}`)
      .then(r => setData(r.data))
      .catch(e => setErr(e.response?.data?.error || 'Failed to load guidelines'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load('default'); }, []);

  const download = () => {
    if (!data?.body) return;
    const blob = new Blob([data.body], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = data.filename || `guidelines-${dataset}.pdf.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card" style={{padding:16, marginBottom:16}}>
      <h3 style={{marginTop:0}}>Dataset Spec / Labeling Guidelines (PDF)</h3>
      <form onSubmit={(e)=>{e.preventDefault(); setDataset(pending); load(pending);}}
            style={{display:'flex', gap:8, marginBottom:10}}>
        <input value={pending} onChange={e=>setPending(e.target.value)}
               placeholder="dataset name" className="form-input" style={{maxWidth:240}} />
        <button type="submit" className="btn btn-primary">Generate</button>
        <button type="button" className="btn btn-secondary" onClick={download} disabled={!data?.body}>Download</button>
      </form>
      {loading && <div>Generating…</div>}
      {err && <div style={{color:'#c33'}}>Error: {err}</div>}
      {data && (
        <>
          <div style={{fontSize:12, color:'#666', marginBottom:6}}>
            Dataset: <b>{data.dataset}</b> · Pages: {data.pages} · Size: {data.size_bytes} bytes · {new Date(data.generated_at).toLocaleString()}
          </div>
          <pre style={{background:'#0b1021', color:'#d1e3ff', padding:14, borderRadius:6,
                       maxHeight:360, overflow:'auto', whiteSpace:'pre-wrap',
                       fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize:12}}>
{data.body}
          </pre>
        </>
      )}
    </div>
  );
}
