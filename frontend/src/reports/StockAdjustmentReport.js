import React, { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import './Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const PAGE_SIZES = [50, 100, 200, 500, 1000];

const DEFAULT_FILTERS = { dateFrom: firstOfMonth(), dateTo: today(), status: '', reason: '', createdBy: '' };

const exportCsv = (rows) => {
    const headers = ['#', 'Adj No', 'Date', 'Reason', 'Status', 'Posted By', 'Posted Date', 'Lines', 'Total Value', 'Created By'];
    const esc = v => { if (v == null) return ''; const s = String(v); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [headers.join(','), ...rows.map((r, i) => [i + 1, r.adjustmentNo, r.adjustmentDate ? fmtDate(r.adjustmentDate) : '', r.reason, r.status, r.postedBy, r.postedDate ? fmtDate(r.postedDate) : '', r.lineCount, r.totalValue, r.createdBy].map(esc).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `StockAdjustment_Report_${today()}.csv`; a.click();
};

const SortIcon = ({ col, sc, sd }) => <span className={`rpt-sort ${sc === col ? 'on' : ''}`}>{sc !== col ? '⇅' : sd === 'asc' ? '↑' : '↓'}</span>;

const Pagination = ({ page, totalPages, pageSize, totalRows, onPage, onPageSize }) => {
    const pages = []; const delta = 2;
    for (let i = 1; i <= totalPages; i++) { if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) pages.push(i); else if (pages[pages.length - 1] !== '…') pages.push('…'); }
    return (
        <div className="rpt-pagination">
            <div className="rpt-pag-info">Showing <strong>{(page-1)*pageSize+1}–{Math.min(page*pageSize,totalRows)}</strong> of <strong>{totalRows}</strong></div>
            <div className="rpt-pag-controls">
                <button className="rpt-pag-btn" onClick={() => onPage(1)} disabled={page===1}>«</button>
                <button className="rpt-pag-btn" onClick={() => onPage(page-1)} disabled={page===1}>‹</button>
                {pages.map((p,i) => p==='…' ? <span key={`e${i}`} className="rpt-pag-ellipsis">…</span> : <button key={p} className={`rpt-pag-btn ${page===p?'active':''}`} onClick={() => onPage(p)}>{p}</button>)}
                <button className="rpt-pag-btn" onClick={() => onPage(page+1)} disabled={page===totalPages}>›</button>
                <button className="rpt-pag-btn" onClick={() => onPage(totalPages)} disabled={page===totalPages}>»</button>
            </div>
            <div className="rpt-pag-size">Rows: <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>{PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        </div>
    );
};

const StockAdjustmentReport = () => {
    const navigate = useNavigate();
    const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
    const [rows, setRows]       = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');
    const [sortCol, setSortCol] = useState('adjustmentDate');
    const [sortDir, setSortDir] = useState('desc');
    const [page, setPage]       = useState(1);
    const [pageSize, setPageSize] = useState(200);
    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)  p.set('dateFrom',  filters.dateFrom);
        if (filters.dateTo)    p.set('dateTo',    filters.dateTo);
        if (filters.status)    p.set('status',    filters.status);
        if (filters.reason)    p.set('reason',    filters.reason);
        if (filters.createdBy) p.set('createdBy', filters.createdBy);
        try {
            const res = await fetch(`${variables.API_URL}reports/stock-adjustment?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); return; }
            setRows(data);
        } catch { setError('Network error.'); setRows([]); }
        finally { setLoading(false); }
    }, [filters]);

    const handleSort = (col) => { setPage(1); if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc'); else { setSortCol(col); setSortDir('asc'); } };

    const sorted = useMemo(() => {
        if (!rows) return [];
        return [...rows].sort((a, b) => { let av = a[sortCol] ?? '', bv = b[sortCol] ?? ''; if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av; return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av)); });
    }, [rows, sortCol, sortDir]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const paged      = sorted.slice((page - 1) * pageSize, page * pageSize);
    const rowOffset  = (page - 1) * pageSize;

    const totals = useMemo(() => {
        if (!rows || rows.length === 0) return null;
        return { count: rows.length, totalValue: rows.reduce((s, r) => s + (r.totalValue || 0), 0) };
    }, [rows]);

    const Th = ({ col, label, cls }) => <th className={cls} onClick={() => handleSort(col)}>{label}<SortIcon col={col} sc={sortCol} sd={sortDir} /></th>;
    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setRows(null); setPage(1); };

    const statusStyle = s => s === 'Posted' ? { bg: '#dcfce7', color: '#166534' } : s === 'Cancelled' ? { bg: '#fee2e2', color: '#991b1b' } : { bg: '#f1f5f9', color: '#475569' };

    return (
        <div className="rpt-page">
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#fef9c3,#fde68a)' }}>⚖️</div>
                <div>
                    <div className="rpt-header-title">Stock Adjustment Report</div>
                    <div className="rpt-header-sub">{rows == null ? 'Set filters and click Run Report' : `${rows.length} adjustment${rows.length !== 1 ? 's' : ''} found`}</div>
                </div>
                <div className="rpt-header-actions">
                    {rows && rows.length > 0 && <button className="rpt-btn-export" onClick={() => exportCsv(sorted)}>⬇ Export CSV</button>}
                </div>
            </div>

            <div className="rpt-filter-card">
                <div className="rpt-filter-row">
                    <div className="rpt-filter-group w160"><span className="rpt-filter-label">Date From</span><input className="rpt-filter-input" type="date" value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)} /></div>
                    <div className="rpt-filter-group w160"><span className="rpt-filter-label">Date To</span><input className="rpt-filter-input" type="date" value={filters.dateTo} onChange={e => setF('dateTo', e.target.value)} /></div>
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Status</span>
                        <select className="rpt-filter-select" value={filters.status} onChange={e => setF('status', e.target.value)}>
                            <option value="">All Statuses</option>
                            {['Draft', 'Posted', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group wflex"><span className="rpt-filter-label">Reason</span><input className="rpt-filter-input" type="text" placeholder="Reason…" value={filters.reason} onChange={e => setF('reason', e.target.value)} onKeyDown={e => e.key === 'Enter' && runReport()} /></div>
                    <div className="rpt-filter-group wflex"><span className="rpt-filter-label">Created By</span><input className="rpt-filter-input" type="text" placeholder="Username…" value={filters.createdBy} onChange={e => setF('createdBy', e.target.value)} onKeyDown={e => e.key === 'Enter' && runReport()} /></div>
                    <div className="rpt-filter-group" style={{ justifyContent: 'flex-end' }}><span className="rpt-filter-label">&nbsp;</span><div style={{ display: 'flex', gap: 6 }}><button className="rpt-btn-clear" onClick={clearAll}>Clear</button><button className="rpt-btn-run" onClick={runReport} disabled={loading}>{loading ? '⏳ Running…' : '▶ Run Report'}</button></div></div>
                </div>
            </div>

            {error && <div className="rpt-error">⚠ {error}</div>}

            {totals && (
                <div className="rpt-summary">
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Total Adjustments</div><div className="rpt-summary-val">{totals.count}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Total Value</div><div className="rpt-summary-val blue">{fmt(totals.totalValue)}</div></div>
                </div>
            )}

            <div className="rpt-content">
                {loading && <div className="rpt-state"><div className="rpt-spinner" /><span>Running report…</span></div>}
                {!loading && rows === null && !error && <div className="rpt-state"><div className="rpt-state-icon">📊</div><span>Set your filters above and click <strong>Run Report</strong></span></div>}
                {!loading && rows !== null && rows.length === 0 && <div className="rpt-state"><div className="rpt-state-icon">🔍</div><span>No adjustments match the selected filters.</span></div>}
                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="adjustmentNo"   label="Adj No"      />
                                        <Th col="adjustmentDate" label="Date"         />
                                        <Th col="reason"         label="Reason"       />
                                        <Th col="status"         label="Status"       />
                                        <Th col="postedBy"       label="Posted By"    />
                                        <Th col="postedDate"     label="Posted Date"  />
                                        <Th col="lineCount"      label="Lines"     cls="r" />
                                        <Th col="totalValue"     label="Total Value" cls="r" />
                                        <Th col="createdBy"      label="Created By"   />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => {
                                        const ss = statusStyle(r.status);
                                        return (
                                            <tr key={r.adjustmentId} onClick={() => navigate(`/inventory-adjustment/${r.adjustmentId}`)}>
                                                <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>{rowOffset + i + 1}</td>
                                                <td><span style={{ fontFamily: 'Courier New', fontWeight: 700, color: '#92400e', fontSize: 11.5, background: '#fef3c7', padding: '2px 8px', borderRadius: 4 }}>{r.adjustmentNo}</span></td>
                                                <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.adjustmentDate)}</td>
                                                <td style={{ fontSize: 12, color: '#1e293b' }}>{r.reason || <span className="muted">—</span>}</td>
                                                <td><span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, background: ss.bg, color: ss.color }}>{r.status}</span></td>
                                                <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.postedBy || <span className="muted">—</span>}</td>
                                                <td style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>{r.postedDate ? fmtDate(r.postedDate) : <span className="muted">—</span>}</td>
                                                <td className="r" style={{ color: '#475569', fontWeight: 600 }}>{r.lineCount}</td>
                                                <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', fontSize: 12.5 }}>{fmt(r.totalValue)}</td>
                                                <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.createdBy}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={8} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>Totals — {totals.count} adjustment{totals.count !== 1 ? 's' : ''}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 700 }}>{fmt(totals.totalValue)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                        <Pagination page={page} totalPages={totalPages} pageSize={pageSize} totalRows={sorted.length} onPage={p => setPage(p)} onPageSize={s => { setPageSize(s); setPage(1); }} />
                    </>
                )}
            </div>
        </div>
    );
};

export default StockAdjustmentReport;
