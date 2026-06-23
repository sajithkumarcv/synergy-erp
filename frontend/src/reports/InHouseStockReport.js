import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';

// In-house stock reporting:
//  • "On hand"   — purchased / issued / on-hand per in-house job
//  • "Issued to job" — items issued from in-house jobs to a chosen fab job
const InHouseStockReport = () => {
  const [mode, setMode] = useState('onhand');     // 'onhand' | 'tojob'
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState('');         // filter (onhand) / destination (tojob)
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC`, { headers: authHeaders() })
      .then(r => r.json()).then(d => setJobs(d.data || [])).catch(console.error);
  }, []);

  const load = useCallback(() => {
    if (mode === 'tojob' && !jobId) { setRows([]); return; }
    setLoading(true);
    const url = mode === 'onhand'
      ? `${variables.API_URL}reports/inhouse-stock${jobId ? `?jobId=${encodeURIComponent(jobId)}` : ''}`
      : `${variables.API_URL}reports/issued-from-inhouse?jobId=${encodeURIComponent(jobId)}`;
    fetch(url, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [mode, jobId]);

  useEffect(() => { load(); }, [load]);

  const num = (n) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const th = { textAlign: 'left', padding: '8px 10px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
  const tdr = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
  const td = { padding: '8px 10px', fontSize: 13, borderBottom: '1px solid #f1f5f9' };
  const tab = (active) => ({ padding: '7px 14px', border: 0, borderRadius: 6, cursor: 'pointer', fontWeight: 600, background: active ? '#0f766e' : '#e2e8f0', color: active ? '#fff' : '#334155' });

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>In-House Stock</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button style={tab(mode === 'onhand')} onClick={() => { setMode('onhand'); setJobId(''); }}>On Hand (purchased / issued)</button>
        <button style={tab(mode === 'tojob')} onClick={() => { setMode('tojob'); setJobId(''); }}>Issued to a Job</button>

        <div style={{ marginLeft: 'auto' }}>
          <label style={{ fontSize: 12, color: '#64748b', marginRight: 6 }}>
            {mode === 'onhand' ? 'In-house job (optional):' : 'Destination job:'}
          </label>
          <select value={jobId} onChange={e => setJobId(e.target.value)} style={{ padding: 7, border: '1px solid #cbd5e1', borderRadius: 6, minWidth: 260 }}>
            <option value="">{mode === 'onhand' ? 'All in-house jobs' : '-- Select destination job --'}</option>
            {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId} — {j.projectName || ''}</option>)}
          </select>
        </div>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff' }}>
          {mode === 'onhand' ? (
            <>
              <thead><tr>
                <th style={th}>In-House Job</th><th style={th}>Budget Header</th><th style={th}>Item</th>
                <th style={{ ...th, textAlign: 'right' }}>Purchased</th>
                <th style={{ ...th, textAlign: 'right' }}>Issued</th>
                <th style={{ ...th, textAlign: 'right' }}>On Hand</th>
                <th style={{ ...th, textAlign: 'right' }}>On-Hand Value</th>
              </tr></thead>
              <tbody>
                {loading ? <tr><td style={td} colSpan={7}>Loading…</td></tr>
                : rows.length === 0 ? <tr><td style={td} colSpan={7}>No data.</td></tr>
                : rows.map((r, i) => (
                  <tr key={i}>
                    <td style={td}>{r.inHouseJobId}<div style={{ fontSize: 11, color: '#94a3b8' }}>{r.projectName}</div></td>
                    <td style={td}>{r.budgetHeader || '—'}</td>
                    <td style={td}>{r.itemCode ? `[${r.itemCode}] ` : ''}{r.itemName}</td>
                    <td style={tdr}>{num(r.purchased)}</td>
                    <td style={tdr}>{num(r.issued)}</td>
                    <td style={{ ...tdr, fontWeight: 600 }}>{num(r.onHand)}</td>
                    <td style={tdr}>{num(r.onHandValue)}</td>
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <>
              <thead><tr>
                <th style={th}>From In-House Job</th><th style={th}>Budget Header</th><th style={th}>Item</th>
                <th style={{ ...th, textAlign: 'right' }}>Qty Issued</th>
                <th style={{ ...th, textAlign: 'right' }}>Value Issued</th>
              </tr></thead>
              <tbody>
                {loading ? <tr><td style={td} colSpan={5}>Loading…</td></tr>
                : !jobId ? <tr><td style={td} colSpan={5}>Select a destination job.</td></tr>
                : rows.length === 0 ? <tr><td style={td} colSpan={5}>No items issued from in-house jobs to this job.</td></tr>
                : rows.map((r, i) => (
                  <tr key={i}>
                    <td style={td}>{r.inHouseJobId}<div style={{ fontSize: 11, color: '#94a3b8' }}>{r.inHouseJobName}</div></td>
                    <td style={td}>{r.budgetHeader || '—'}</td>
                    <td style={td}>{r.itemCode ? `[${r.itemCode}] ` : ''}{r.itemName}</td>
                    <td style={{ ...tdr, fontWeight: 600 }}>{num(r.qtyIssued)}</td>
                    <td style={tdr}>{num(r.valueIssued)}</td>
                  </tr>
                ))}
              </tbody>
            </>
          )}
        </table>
      </div>
    </div>
  );
};

export default InHouseStockReport;
