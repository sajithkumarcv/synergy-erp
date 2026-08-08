import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import { useLookup } from '../LookupContext';
import './Reports.css';

const today       = () => new Date().toISOString().slice(0, 10);
const firstOfYear = () => `${new Date().getFullYear()}-01-01`;
const PAGE_SIZES = [50, 100, 200, 500, 1000];

const DEFAULT_FILTERS = { dateFrom: firstOfYear(), dateTo: today(), supplierId: '', jobId: '', overdueOnly: false };

const BUCKETS = [
    { key: 'Not Due',     label: 'Not Due',    color: '#166534', bg: '#dcfce7' },
    { key: '0_30',        label: '1–30d',      color: '#854d0e', bg: '#fef9c3' },
    { key: '31_60',       label: '31–60d',     color: '#b45309', bg: '#fed7aa' },
    { key: '61_90',       label: '61–90d',     color: '#c2410c', bg: '#fdba74' },
    { key: '90Plus',      label: '90d+',       color: '#b91c1c', bg: '#fecaca' },
    { key: 'No Due Date', label: 'No Due Date', color: '#64748b', bg: '#f1f5f9' },
];
const bucketCfg = (k) => BUCKETS.find(b => b.key === k) || { label: k, color: '#64748b', bg: '#f1f5f9' };

const exportCsv = (rows, baseCurrencyCode) => {
    const headers = ['#','PO No','PO Date','Expected','Supplier','Job','Item Code','Item','Ordered','Received','Open Qty','Unit Price','CCY','Open Value',`Open Value (${baseCurrencyCode})`,'Last GRN','Days Overdue','Aging'];
    const esc = v => { if (v == null) return ''; const s = String(v); return s.includes(',')||s.includes('"')||s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s; };
    const lines = [headers.join(','), ...rows.map((r,i) => [
        i+1, r.poNumber, r.poDate?fmtDate(r.poDate):'', r.deliveryDate?fmtDate(r.deliveryDate):'', r.vendorName, r.jobId,
        r.itemCode, r.itemDesc, r.orderedQty, r.receivedQty, r.openQty, r.unitPrice, r.currencyShort,
        r.openValue, r.openValueBase, r.lastGrnDate?fmtDate(r.lastGrnDate):'', r.daysOverdue, r.agingBucket,
    ].map(esc).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `Open_PO_Report_${today()}.csv`; a.click(); URL.revokeObjectURL(url);
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

const OpenPoReport = () => {
    const navigate = useNavigate();
    const { baseCurrencyCode } = useLookup();
    const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
    const [rows, setRows]       = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');
    const [sortCol, setSortCol] = useState('daysOverdue');
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
        if (filters.dateFrom)    p.set('dateFrom', filters.dateFrom);
        if (filters.dateTo)      p.set('dateTo', filters.dateTo);
        if (filters.supplierId)  p.set('supplierId', filters.supplierId);
        if (filters.jobId)       p.set('jobId', filters.jobId);
        if (filters.overdueOnly) p.set('overdueOnly', 'true');
        try {
            const res = await fetch(`${variables.API_URL}reports/open-po?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); return; }
            setRows(data);
        } catch { setError('Network error.'); setRows([]); } finally { setLoading(false); }
    }, [filters]);

    const handleSort = (col) => { setPage(1); if (sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc'); else { setSortCol(col); setSortDir('asc'); } };
    const sorted = useMemo(() => { if (!rows) return []; return [...rows].sort((a,b)=>{ let av=a[sortCol]??'',bv=b[sortCol]??''; if(typeof av==='number')return sortDir==='asc'?av-bv:bv-av; return sortDir==='asc'?String(av).localeCompare(String(bv)):String(bv).localeCompare(String(av)); }); }, [rows, sortCol, sortDir]);
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const paged = sorted.slice((page-1)*pageSize, page*pageSize);
    const rowOffset = (page-1)*pageSize;

    const totals = useMemo(() => {
        if (!rows || rows.length===0) return null;
        const byBucket = {};
        rows.forEach(r => { const b=byBucket[r.agingBucket]=byBucket[r.agingBucket]||{count:0,val:0}; b.count++; b.val += r.openValueBase||0; });
        return {
            count: rows.length,
            openValue: rows.reduce((s,r)=>s+(r.openValueBase||0),0),
            overdueCount: rows.filter(r=>(r.daysOverdue||0)>0).length,
            overdueValue: rows.filter(r=>(r.daysOverdue||0)>0).reduce((s,r)=>s+(r.openValueBase||0),0),
            byBucket,
        };
    }, [rows]);

    const Th = ({ col, label, cls }) => <th className={cls} onClick={()=>handleSort(col)}>{label}<SortIcon col={col} sc={sortCol} sd={sortDir} /></th>;
    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setRows(null); setPage(1); };

    return (
        <div className="rpt-page">
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#dbeafe,#bfdbfe)' }}>📦</div>
                <div>
                    <div className="rpt-header-title">Open PO / Pending-GRN Report</div>
                    <div className="rpt-header-sub">{rows==null?'Set filters and click Run Report':`${rows.length} open line${rows.length!==1?'s':''} · ${totals?.overdueCount||0} overdue`}</div>
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
                    <div className="rpt-filter-group w160"><span className="rpt-filter-label">Job No</span><input className="rpt-filter-input" type="text" placeholder="Job…" value={filters.jobId} onChange={e=>setF('jobId',e.target.value)} onKeyDown={e=>e.key==='Enter'&&runReport()} /></div>
                    <div className="rpt-filter-group w160" style={{ justifyContent:'flex-end' }}><span className="rpt-filter-label">&nbsp;</span>
                        <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12.5, fontWeight:600, color:'#b45309', cursor:'pointer', height:34 }}>
                            <input type="checkbox" checked={filters.overdueOnly} onChange={e=>setF('overdueOnly',e.target.checked)} /> Overdue only
                        </label>
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
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Open Lines</div><div className="rpt-summary-val">{totals.count}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Open Commitment ({baseCurrencyCode})</div><div className="rpt-summary-val blue">{fmt(totals.openValue)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Overdue Lines</div><div className="rpt-summary-val" style={{ color:'#b91c1c' }}>{totals.overdueCount}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Overdue Value ({baseCurrencyCode})</div><div className="rpt-summary-val" style={{ color:'#b91c1c' }}>{fmt(totals.overdueValue)}</div></div>
                </div>
            )}

            {totals && (
                <div className="rpt-ccy-section">
                    <div className="rpt-ccy-title">Aging by Expected Delivery</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap', padding:'4px 2px' }}>
                        {BUCKETS.map(b => { const v = totals.byBucket[b.key]; if (!v) return null; return (
                            <div key={b.key} style={{ background:b.bg, color:b.color, borderRadius:8, padding:'8px 14px', minWidth:120 }}>
                                <div style={{ fontSize:10.5, fontWeight:700, textTransform:'uppercase', letterSpacing:'.03em' }}>{b.label}</div>
                                <div style={{ fontSize:15, fontWeight:800 }}>{fmt(v.val)}</div>
                                <div style={{ fontSize:10.5, opacity:.8 }}>{v.count} line{v.count!==1?'s':''}</div>
                            </div>
                        ); })}
                    </div>
                </div>
            )}

            <div className="rpt-content">
                {loading && <div className="rpt-state"><div className="rpt-spinner" /><span>Running report…</span></div>}
                {!loading && rows===null && !error && <div className="rpt-state"><div className="rpt-state-icon">📊</div><span>Set your filters above and click <strong>Run Report</strong></span></div>}
                {!loading && rows!==null && rows.length===0 && <div className="rpt-state"><div className="rpt-state-icon">✅</div><span>No open PO lines match the filters.</span></div>}
                {!loading && paged.length>0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead><tr>
                                    <th className="c" style={{ width:42 }}>#</th>
                                    <Th col="poNumber" label="PO No" />
                                    <Th col="poDate" label="PO Date" />
                                    <Th col="deliveryDate" label="Expected" />
                                    <Th col="vendorName" label="Supplier" />
                                    <Th col="jobId" label="Job" />
                                    <Th col="itemCode" label="Item" />
                                    <Th col="orderedQty" label="Ord" cls="r" />
                                    <Th col="receivedQty" label="Recd" cls="r" />
                                    <Th col="openQty" label="Open" cls="r" />
                                    <Th col="currencyShort" label="Curr" cls="r" />
                                    <Th col="openValue" label="Open Val" cls="r" />
                                    <Th col="openValueBase" label={`Open Val (${baseCurrencyCode})`} cls="r" />
                                    <Th col="lastGrnDate" label="Last GRN" />
                                    <Th col="daysOverdue" label="Overdue" cls="r" />
                                    <Th col="agingBucket" label="Aging" cls="c" />
                                </tr></thead>
                                <tbody>
                                    {paged.map((r,i)=>{ const bc=bucketCfg(r.agingBucket); const od=(r.daysOverdue||0)>0; return (
                                        <tr key={r.poLineId} style={{ background: od?'#fffaf5':undefined }}>
                                            <td className="c" style={{ color:'#94a3b8', fontSize:11, fontWeight:600 }}>{rowOffset+i+1}</td>
                                            <td><span onClick={()=>navigate(`/purchase-orders/${r.poId}`)} style={{ fontFamily:'Courier New', fontWeight:700, color:'#1d4ed8', cursor:'pointer', fontSize:11.5 }}>{r.poNumber}</span></td>
                                            <td style={{ color:'#475569', fontSize:12 }}>{fmtDate(r.poDate)}</td>
                                            <td style={{ fontSize:12, color: od?'#b91c1c':'#475569', fontWeight: od?700:400 }}>{r.deliveryDate?fmtDate(r.deliveryDate):<span className="muted">—</span>}</td>
                                            <td style={{ fontSize:12, maxWidth:170, overflow:'hidden', textOverflow:'ellipsis' }}>{r.vendorName||<span className="muted">—</span>}</td>
                                            <td style={{ fontSize:11, color:'#166534', fontWeight:600 }}>{r.jobId||<span className="muted">—</span>}</td>
                                            <td style={{ fontSize:11, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis' }}><span style={{ fontFamily:'monospace', color:'#475569' }}>{r.itemCode}</span> {r.itemDesc}</td>
                                            <td className="r" style={{ fontFamily:'monospace' }}>{fmt(r.orderedQty)}</td>
                                            <td className="r" style={{ fontFamily:'monospace', color:'#166534' }}>{fmt(r.receivedQty)}</td>
                                            <td className="r" style={{ fontFamily:'monospace', fontWeight:700, color:'#b45309' }}>{fmt(r.openQty)}</td>
                                            <td className="r" style={{ fontSize:11.5, fontWeight:700, color: r.exchangeRate&&r.exchangeRate!==1?'#7c3aed':'#64748b' }}>{r.currencyShort||'—'}</td>
                                            <td className="r" style={{ fontFamily:'monospace', color: r.exchangeRate&&r.exchangeRate!==1?'#7c3aed':'#475569' }}>{fmt(r.openValue)}</td>
                                            <td className="r" style={{ fontFamily:'monospace', fontWeight:700, color:'#1e40af' }}>{fmt(r.openValueBase)}</td>
                                            <td style={{ fontSize:11.5, color:'#64748b' }}>{r.lastGrnDate?fmtDate(r.lastGrnDate):<span className="muted">—</span>}</td>
                                            <td className="r" style={{ fontWeight:700, color: od?'#b91c1c':'#94a3b8' }}>{od?`${r.daysOverdue}d`:'—'}</td>
                                            <td className="c"><span style={{ background:bc.bg, color:bc.color, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:700, whiteSpace:'nowrap' }}>{bc.label}</span></td>
                                        </tr>
                                    ); })}
                                </tbody>
                                {totals && (
                                    <tfoot><tr style={{ background:'#f1f5f9', borderTop:'2px solid #cbd5e1', fontWeight:700 }}>
                                        <td colSpan={12} style={{ textAlign:'right', padding:'8px 10px', color:'#334155', fontSize:12 }}>Total Open Commitment ({baseCurrencyCode}) — {totals.count} line{totals.count!==1?'s':''}</td>
                                        <td style={{ textAlign:'right', padding:'8px 6px', fontFamily:'monospace', color:'#1e40af' }}>{fmt(totals.openValue)}</td>
                                        <td colSpan={3}></td>
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

export default OpenPoReport;
