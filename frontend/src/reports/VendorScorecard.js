import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { variables, authHeaders } from '../Variable';
import { fmt } from '../procurement/procurementConstants';
import { useLookup } from '../LookupContext';
import './Reports.css';

const today       = () => new Date().toISOString().slice(0, 10);
const firstOfYear = () => `${new Date().getFullYear()}-01-01`;
const PAGE_SIZES = [50, 100, 200, 500, 1000];

const DEFAULT_FILTERS = { dateFrom: firstOfYear(), dateTo: today(), supplierId: '' };

const pct = (v) => v == null ? '—' : `${Number(v).toFixed(1)}%`;
// Green ≥95, amber 80–95, red <80 (higher = better). Null = grey.
const goodColor = (v, hi = 95, lo = 80) => v == null ? '#94a3b8' : v >= hi ? '#166534' : v >= lo ? '#b45309' : '#b91c1c';
// For reject %, lower is better
const badColor  = (v, lo = 2, hi = 5) => v == null ? '#94a3b8' : v <= lo ? '#166534' : v <= hi ? '#b45309' : '#b91c1c';

const exportCsv = (rows, baseCurrencyCode) => {
    const headers = ['#','Supplier','Code','POs',`PO Value (${baseCurrencyCode})`,'Lines','Received','Fill Rate %','OTIF %','Avg Lead (d)','Reject %',`Open Commitment (${baseCurrencyCode})`,'Late Open Lines'];
    const esc = v => { if (v == null) return ''; const s = String(v); return s.includes(',')||s.includes('"')||s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s; };
    const lines = [headers.join(','), ...rows.map((r,i)=>[
        i+1, r.supplierName, r.supplierCode, r.poCount, r.poValueBase, r.totalLines, r.receivedLines,
        r.fillRatePct, r.otifPct, r.avgLeadDays, r.rejectPct, r.openCommitmentBase, r.lateOpenLines,
    ].map(esc).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `Vendor_Scorecard_${today()}.csv`; a.click(); URL.revokeObjectURL(url);
};

const SortIcon = ({ col, sc, sd }) => <span className={`rpt-sort ${sc===col?'on':''}`}>{sc!==col?'⇅':sd==='asc'?'↑':'↓'}</span>;

const Pagination = ({ page, totalPages, pageSize, totalRows, onPage, onPageSize }) => {
    const pages = []; const delta = 2;
    for (let i=1;i<=totalPages;i++){ if(i===1||i===totalPages||(i>=page-delta&&i<=page+delta))pages.push(i); else if(pages[pages.length-1]!=='…')pages.push('…'); }
    const from=(page-1)*pageSize+1, to=Math.min(page*pageSize,totalRows);
    return (
        <div className="rpt-pagination">
            <div className="rpt-pag-info">Showing <strong>{from}–{to}</strong> of <strong>{totalRows}</strong> records</div>
            <div className="rpt-pag-controls">
                <button className="rpt-pag-btn" onClick={()=>onPage(1)} disabled={page===1}>«</button>
                <button className="rpt-pag-btn" onClick={()=>onPage(page-1)} disabled={page===1}>‹</button>
                {pages.map((p,i)=>p==='…'?<span key={`e${i}`} className="rpt-pag-ellipsis">…</span>:<button key={p} className={`rpt-pag-btn ${page===p?'active':''}`} onClick={()=>onPage(p)}>{p}</button>)}
                <button className="rpt-pag-btn" onClick={()=>onPage(page+1)} disabled={page===totalPages}>›</button>
                <button className="rpt-pag-btn" onClick={()=>onPage(totalPages)} disabled={page===totalPages}>»</button>
            </div>
            <div className="rpt-pag-size">Rows:<select value={pageSize} onChange={e=>onPageSize(Number(e.target.value))}>{PAGE_SIZES.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
        </div>
    );
};

const VendorScorecard = () => {
    const { getSetting, baseCurrencyCode } = useLookup();
    // Colour thresholds are admin-configurable via Biz.Vendor.* app settings.
    const otifGreen = Number(getSetting('Biz.Vendor.OtifGreenPct', 95));
    const otifAmber = Number(getSetting('Biz.Vendor.OtifAmberPct', 80));
    const rejGreen  = Number(getSetting('Biz.Vendor.RejectGreenPct', 2));
    const rejAmber  = Number(getSetting('Biz.Vendor.RejectAmberPct', 5));
    const gc = (v) => goodColor(v, otifGreen, otifAmber);
    const bc = (v) => badColor(v, rejGreen, rejAmber);

    const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
    const [rows, setRows]       = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');
    const [sortCol, setSortCol] = useState('openCommitmentBase');
    const [sortDir, setSortDir] = useState('desc');
    const [page, setPage]       = useState(1);
    const [pageSize, setPageSize] = useState(200);
    const [suppliers, setSuppliers] = useState([]);
    const setF = (k,v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setSuppliers((d.data || []).sort((a,b)=>a.supplierName.localeCompare(b.supplierName)))).catch(()=>{});
    }, []);

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)   p.set('dateFrom', filters.dateFrom);
        if (filters.dateTo)     p.set('dateTo', filters.dateTo);
        if (filters.supplierId) p.set('supplierId', filters.supplierId);
        try {
            const res = await fetch(`${variables.API_URL}reports/vendor-scorecard?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); return; }
            setRows(data);
        } catch { setError('Network error.'); setRows([]); } finally { setLoading(false); }
    }, [filters]);

    const handleSort = (col) => { setPage(1); if (sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortCol(col); setSortDir('asc'); } };
    const sorted = useMemo(() => { if (!rows) return []; return [...rows].sort((a,b)=>{ let av=a[sortCol]??-1,bv=b[sortCol]??-1; if(typeof av==='number')return sortDir==='asc'?av-bv:bv-av; return sortDir==='asc'?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av)); }); }, [rows, sortCol, sortDir]);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const paged = sorted.slice((page-1)*pageSize, page*pageSize);
    const rowOffset = (page-1)*pageSize;

    const totals = useMemo(() => {
        if (!rows || rows.length===0) return null;
        const otifVals = rows.map(r=>r.otifPct).filter(v=>v!=null);
        return {
            count: rows.length,
            poValue: rows.reduce((s,r)=>s+(r.poValueBase||0),0),
            openCommit: rows.reduce((s,r)=>s+(r.openCommitmentBase||0),0),
            avgOtif: otifVals.length ? otifVals.reduce((s,v)=>s+v,0)/otifVals.length : null,
            lateLines: rows.reduce((s,r)=>s+(r.lateOpenLines||0),0),
        };
    }, [rows]);

    const Th = ({ col, label, cls }) => <th className={cls} onClick={()=>handleSort(col)}>{label}<SortIcon col={col} sc={sortCol} sd={sortDir} /></th>;
    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setRows(null); setPage(1); };

    return (
        <div className="rpt-page">
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#dcfce7,#bbf7d0)' }}>🏅</div>
                <div>
                    <div className="rpt-header-title">Vendor Scorecard</div>
                    <div className="rpt-header-sub">{rows==null?'Set filters and click Run Report':`${rows.length} supplier${rows.length!==1?'s':''} evaluated`}</div>
                </div>
                <div className="rpt-header-actions">{rows && rows.length>0 && <button className="rpt-btn-export" onClick={()=>exportCsv(sorted, baseCurrencyCode)}>⬇ Export CSV</button>}</div>
            </div>

            <div className="rpt-filter-card">
                <div className="rpt-filter-row">
                    <div className="rpt-filter-group w160"><span className="rpt-filter-label">PO Date From</span><input className="rpt-filter-input" type="date" value={filters.dateFrom} onChange={e=>setF('dateFrom',e.target.value)} /></div>
                    <div className="rpt-filter-group w160"><span className="rpt-filter-label">PO Date To</span><input className="rpt-filter-input" type="date" value={filters.dateTo} onChange={e=>setF('dateTo',e.target.value)} /></div>
                    <div className="rpt-filter-group w200"><span className="rpt-filter-label">Supplier</span>
                        <select className="rpt-filter-select" value={filters.supplierId} onChange={e=>setF('supplierId',e.target.value)}>
                            <option value="">All Suppliers</option>
                            {suppliers.map(s=><option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group" style={{ justifyContent:'flex-end' }}><span className="rpt-filter-label">&nbsp;</span>
                        <div style={{ display:'flex', gap:6 }}>
                            <button className="rpt-btn-clear" onClick={clearAll}>Clear</button>
                            <button className="rpt-btn-run" onClick={runReport} disabled={loading}>{loading?'⏳ Running…':'▶ Run Report'}</button>
                        </div>
                    </div>
                </div>
            </div>

            {error && <div className="rpt-error">⚠ {error}</div>}

            {totals && (
                <div className="rpt-summary">
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Suppliers</div><div className="rpt-summary-val">{totals.count}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">PO Value ({baseCurrencyCode})</div><div className="rpt-summary-val blue">{fmt(totals.poValue)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Open Commitment ({baseCurrencyCode})</div><div className="rpt-summary-val" style={{ color:'#b45309' }}>{fmt(totals.openCommit)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Avg OTIF</div><div className="rpt-summary-val" style={{ color: gc(totals.avgOtif) }}>{pct(totals.avgOtif)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Late Open Lines</div><div className="rpt-summary-val" style={{ color: totals.lateLines>0?'#b91c1c':'#166534' }}>{totals.lateLines}</div></div>
                </div>
            )}

            {rows && rows.length>0 && totals?.avgOtif == null && (
                <div style={{ background:'#fffbeb', border:'1px solid #fde68a', color:'#854d0e', borderRadius:8, padding:'8px 14px', fontSize:12.5, margin:'0 0 10px' }}>
                    ⓘ OTIF / on-time metrics show “—” because POs have no <strong>expected delivery date</strong> set. Enter delivery dates on POs to activate on-time tracking.
                </div>
            )}

            <div className="rpt-content">
                {loading && <div className="rpt-state"><div className="rpt-spinner" /><span>Running report…</span></div>}
                {!loading && rows===null && !error && <div className="rpt-state"><div className="rpt-state-icon">📊</div><span>Set your filters above and click <strong>Run Report</strong></span></div>}
                {!loading && rows!==null && rows.length===0 && <div className="rpt-state"><div className="rpt-state-icon">🔍</div><span>No supplier activity matches the filters.</span></div>}
                {!loading && paged.length>0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead><tr>
                                    <th className="c" style={{ width:42 }}>#</th>
                                    <Th col="supplierName" label="Supplier" />
                                    <Th col="poCount" label="POs" cls="r" />
                                    <Th col="poValueBase" label={`PO Value (${baseCurrencyCode})`} cls="r" />
                                    <Th col="totalLines" label="Lines" cls="r" />
                                    <Th col="receivedLines" label="Recd" cls="r" />
                                    <Th col="fillRatePct" label="Fill Rate" cls="r" />
                                    <Th col="otifPct" label="OTIF" cls="r" />
                                    <Th col="avgLeadDays" label="Avg Lead" cls="r" />
                                    <Th col="rejectPct" label="Reject %" cls="r" />
                                    <Th col="openCommitmentBase" label={`Open Commit (${baseCurrencyCode})`} cls="r" />
                                    <Th col="lateOpenLines" label="Late Open" cls="r" />
                                </tr></thead>
                                <tbody>
                                    {paged.map((r,i)=>(
                                        <tr key={r.supplierId}>
                                            <td className="c" style={{ color:'#94a3b8', fontSize:11, fontWeight:600 }}>{rowOffset+i+1}</td>
                                            <td><div style={{ fontWeight:600, fontSize:12.5 }}>{r.supplierName}</div><div style={{ fontSize:10.5, color:'#94a3b8', fontFamily:'monospace' }}>{r.supplierCode}</div></td>
                                            <td className="r" style={{ fontFamily:'monospace', color:'#475569' }}>{r.poCount}</td>
                                            <td className="r" style={{ fontFamily:'monospace', fontWeight:700, color:'#1e40af' }}>{fmt(r.poValueBase)}</td>
                                            <td className="r" style={{ fontFamily:'monospace', color:'#475569' }}>{r.totalLines}</td>
                                            <td className="r" style={{ fontFamily:'monospace', color:'#166534' }}>{r.receivedLines}</td>
                                            <td className="r" style={{ fontWeight:700, color: gc(r.fillRatePct) }}>{pct(r.fillRatePct)}</td>
                                            <td className="r" style={{ fontWeight:800, color: gc(r.otifPct) }}>{pct(r.otifPct)}</td>
                                            <td className="r" style={{ fontFamily:'monospace', color:'#475569' }}>{r.avgLeadDays==null?'—':`${Number(r.avgLeadDays).toFixed(0)}d`}</td>
                                            <td className="r" style={{ fontWeight:700, color: bc(r.rejectPct) }}>{pct(r.rejectPct)}</td>
                                            <td className="r" style={{ fontFamily:'monospace', fontWeight:700, color:'#b45309' }}>{fmt(r.openCommitmentBase)}</td>
                                            <td className="r" style={{ fontWeight:700, color: r.lateOpenLines>0?'#b91c1c':'#94a3b8' }}>{r.lateOpenLines||'—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                {totals && (
                                    <tfoot><tr style={{ background:'#f1f5f9', borderTop:'2px solid #cbd5e1', fontWeight:700 }}>
                                        <td colSpan={3} style={{ textAlign:'right', padding:'8px 10px', color:'#334155', fontSize:12 }}>Totals — {totals.count} supplier{totals.count!==1?'s':''}</td>
                                        <td style={{ textAlign:'right', padding:'8px 6px', fontFamily:'monospace', color:'#1e40af' }}>{fmt(totals.poValue)}</td>
                                        <td colSpan={6}></td>
                                        <td style={{ textAlign:'right', padding:'8px 6px', fontFamily:'monospace', color:'#b45309' }}>{fmt(totals.openCommit)}</td>
                                        <td style={{ textAlign:'right', padding:'8px 6px', color: totals.lateLines>0?'#b91c1c':'#475569' }}>{totals.lateLines}</td>
                                    </tr></tfoot>
                                )}
                            </table>
                        </div>
                        <Pagination page={page} totalPages={totalPages} pageSize={pageSize} totalRows={sorted.length} onPage={p=>setPage(p)} onPageSize={s=>{setPageSize(s);setPage(1);}} />
                    </>
                )}
            </div>
        </div>
    );
};

export default VendorScorecard;
