import React, { useEffect, useState } from 'react';
import api from '../api';

// NON-VIZ — CRUD label schema + validation editor.
const EMPTY = { label_class: '', rule_type: 'min_confidence', constraint_value: '', required: false, description: '' };

export default function AnnotationRulesEditor() {
  const [rules, setRules] = useState([]);
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [err, setErr] = useState('');
  const [details, setDetails] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get('/custom-views/annotation-rules')
      .then(r => { setRules(r.data.rules || []); setTypes(r.data.valid_rule_types || []); })
      .catch(e => setErr(e.response?.data?.error || 'Failed to load rules'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setDetails([]);
    try {
      if (editingId) {
        await api.put(`/custom-views/annotation-rules/${editingId}`, form);
      } else {
        await api.post('/custom-views/annotation-rules', form);
      }
      setForm(EMPTY); setEditingId(null); load();
    } catch (e) {
      setErr(e.response?.data?.error || 'Save failed');
      setDetails(e.response?.data?.details || []);
    }
  };

  const edit = (r) => {
    setEditingId(r.id);
    setForm({
      label_class: r.label_class || '',
      rule_type: r.rule_type || 'min_confidence',
      constraint_value: r.constraint_value || '',
      required: !!r.required,
      description: r.description || '',
    });
  };

  const del = async (id) => {
    if (!confirm('Delete this rule?')) return;
    try { await api.delete(`/custom-views/annotation-rules/${id}`); load(); }
    catch (e) { setErr(e.response?.data?.error || 'Delete failed'); }
  };

  return (
    <div className="card" style={{padding:16, marginBottom:16}}>
      <h3 style={{marginTop:0}}>Annotation Rules Editor (Label Schema + Validation)</h3>

      <form onSubmit={submit} style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:8, marginBottom:14, alignItems:'end'}}>
        <div style={{gridColumn:'span 2'}}>
          <label style={{fontSize:11, color:'#555'}}>Label class</label>
          <input className="form-input" value={form.label_class}
                 onChange={e=>setForm({...form, label_class:e.target.value})} placeholder="e.g. Positive" />
        </div>
        <div>
          <label style={{fontSize:11, color:'#555'}}>Rule type</label>
          <select className="form-input" value={form.rule_type} onChange={e=>setForm({...form, rule_type:e.target.value})}>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label style={{fontSize:11, color:'#555'}}>Constraint value</label>
          <input className="form-input" value={form.constraint_value}
                 onChange={e=>setForm({...form, constraint_value:e.target.value})} placeholder="e.g. 0.75 or 2,80" />
        </div>
        <div>
          <label style={{fontSize:11, color:'#555'}}>Required</label>
          <div><input type="checkbox" checked={form.required}
               onChange={e=>setForm({...form, required:e.target.checked})} /> required</div>
        </div>
        <div>
          <button type="submit" className="btn btn-primary">{editingId ? 'Update' : 'Add'}</button>
          {editingId && <button type="button" className="btn btn-secondary" style={{marginLeft:6}}
                                onClick={()=>{setEditingId(null); setForm(EMPTY);}}>Cancel</button>}
        </div>
        <div style={{gridColumn:'span 6'}}>
          <label style={{fontSize:11, color:'#555'}}>Description</label>
          <input className="form-input" value={form.description}
                 onChange={e=>setForm({...form, description:e.target.value})} placeholder="why this rule" />
        </div>
      </form>

      {err && (
        <div style={{color:'#c33', marginBottom:8}}>
          {err}
          {details.length > 0 && <ul style={{margin:'4px 0 0 18px'}}>{details.map((d,i)=><li key={i}>{d}</li>)}</ul>}
        </div>
      )}

      {loading ? <div>Loading rules…</div> : (
        <table style={{width:'100%', fontSize:13, borderCollapse:'collapse'}}>
          <thead><tr style={{textAlign:'left', background:'#f3f4f6'}}>
            <th style={{padding:6}}>Label class</th><th style={{padding:6}}>Type</th>
            <th style={{padding:6}}>Value</th><th style={{padding:6}}>Req</th>
            <th style={{padding:6}}>Description</th><th style={{padding:6}}>Actions</th>
          </tr></thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id} style={{borderTop:'1px solid #eee'}}>
                <td style={{padding:6, fontWeight:600}}>{r.label_class}</td>
                <td style={{padding:6}}>{r.rule_type}</td>
                <td style={{padding:6, fontFamily:'monospace'}}>{r.constraint_value}</td>
                <td style={{padding:6}}>{r.required ? 'yes' : 'no'}</td>
                <td style={{padding:6, color:'#555'}}>{r.description}</td>
                <td style={{padding:6}}>
                  <button className="btn btn-secondary" onClick={()=>edit(r)} style={{marginRight:4}}>Edit</button>
                  <button className="btn btn-danger" onClick={()=>del(r.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan="6" style={{padding:10, color:'#888'}}>No rules yet.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}
