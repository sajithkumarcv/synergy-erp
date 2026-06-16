import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import './Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };
const PAGE_SIZES   = [10, 20, 50, 100];

const DEFAULT_FILTERS = { dateFrom: firstOfMonth(), dateTo: today(), supplierId: '', status: '', createdBy: '' };

const exportCsv = (rows) => {
    const headers = ['#', 'Invoice No', 'Supplier Ref', 'Date', 'Supplier', 'Currency', 'Due Date', 'Sub Total', 'Tax', 'Total', 'Paid', 'Balance', 'Status', 'Created By'];
    const esc = v => { if (v == null) return ''; const s = String(v); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    const lines = [headers.join(','), ...rows.map((r, i) => [i + 1, r.invoiceNo, r.supplierInvRef, r.invoiceDate ? fmtDate(r.invoiceDate) : '', r.supplierName, r.currencyShort, r.dueDate ? fmtDate(r.dueDate) : '', r.subTotal, r.taxAmount, r.totalAmount, r.paidAmount, r.balanceAmount, r.status, r.createdBy].map(esc).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `SupplierInvoice_Report_${today()}.csv`; a.click();
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

const SupplierInvoiceReport = () => {
    const navigate = useNavigate();
    const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
    const [rows, setRows]       = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState('');
    const [sortCol, setSortCol] = useState('invoiceDate');
    const [sortDir, setSortDir] = useState('desc');
    const [page, setPage]       = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [suppliers, setSuppliers] = useState([]);
    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] }).then(d => setSuppliers((d.data || []).sort((a, b) => a.supplierName.localeCompare(b.supplierName)))).catch(() => {});
    }, []);

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)   p.set('dateFrom',   filters.dateFrom);
        if (filters.dateTo)     p.set('dateTo',     filters.dateTo);
        if (filters.supplierId) p.set('supplierId', filters.supplierId);
        if (filters.status)     p.set('status',     filters.status);
        if (filters.createdBy)  p.set('createdBy',  filters.createdBy);
        try {
            const res = await fetch(`${variables.API_URL}reports/supplier-invoice?${p}`, { headers: authHeaders() });
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
        return { count: rows.length, totalAmount: rows.reduce((s, r) => s + (r.totalAmount || 0), 0), paidAmount: rows.reduce((s, r) => s + (r.paidAmount || 0), 0), balanceAmount: rows.reduce((s, r) => s + (r.balanceAmount || 0), 0) };
    }, [rows]);

    const Th = ({ col, label, cls }) => <th className={cls} onClick={() => handleSort(col)}>{label}<SortIcon col={col} sc={sortCol} sd={sortDir} /></th>;
    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setRows(null); setPage(1); };

    return (
        <div className="rpt-page">
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#fce7f3,#fbcfe8)' }}>🧾</div>
                <div>
                    <div className="rpt-header-title">Supplier Invoice Report</div>
                    <div className="rpt-header-sub">{rows == null ? 'Set filters and click Run Report' : `${rows.length} invoice${rows.length !== 1 ? 's' : ''} found`}</div>
                </div>
                <div className="rpt-header-actions">
                    {rows && rows.length > 0 && <button className="rpt-btn-export" onClick={() => exportCsv(sorted)}>⬇ Export CSV</button>}
                </div>
            </div>

            <div className="rpt-filter-card">
                <div className="rpt-filter-row">
                    <div className="rpt-filter-group w160"><span className="rpt-filter-label">Date From</span><input className="rpt-filter-input" type="date" value={filters.dateFrom} onChange={e => setF('dateFrom', e.target.value)} /></div>
                    <div className="rpt-filter-group w160"><span className="rpt-filter-label">Date To</span><input className="rpt-filter-input" type="date" value={filters.dateTo} onChange={e => setF('dateTo', e.target.value)} /></div>
                    <div className="rpt-filter-group w200">
                        <span className="rpt-filter-label">Supplier</span>
                        <select className="rpt-filter-select" value={filters.supplierId} onChange={e => setF('supplierId', e.target.value)}>
                            <option value="">All Suppliers</option>
                            {suppliers.map(s => <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Status</span>
                        <select className="rpt-filter-select" value={filters.status} onChange={e => setF('status', e.target.value)}>
                            <option value="">All Statuses</option>
                            {['Draft', 'Confirmed', 'Paid', 'Cancelled'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="rpt-filter-group wflex"><span className="rpt-filter-label">Created By</span><input className="rpt-filter-input" type="text" placeholder="Username…" value={filters.createdBy} onChange={e => setF('createdBy', e.target.value)} onKeyDown={e => e.key === 'Enter' && runReport()} /></div>
                    <div className="rpt-filter-group" style={{ justifyContent: 'flex-end' }}><span className="rpt-filter-label">&nbsp;</span><div style={{ display: 'flex', gap: 6 }}><button className="rpt-btn-clear" onClick={clearAll}>Clear</button><button className="rpt-btn-run" onClick={runReport} disabled={loading}>{loading ? '⏳ Running…' : '▶ Run Report'}</button></div></div>
                </div>
            </div>

            {error && <div className="rpt-error">⚠ {error}</div>}

            {totals && (
                <div className="rpt-summary">
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Total Invoices</div><div className="rpt-summary-val">{totals.count}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Total Amount</div><div className="rpt-summary-val blue">{fmt(totals.totalAmount)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Paid</div><div className="rpt-summary-val green">{fmt(totals.paidAmount)}</div></div>
                    <div className="rpt-summary-item"><div className="rpt-summary-label">Outstanding</div><div className="rpt-summary-val amber">{fmt(totals.balanceAmount)}</div></div>
                </div>
            )}

            <div className="rpt-content">
                {loading && <div className="rpt-state"><div className="rpt-spinner" /><span>Running report…</span></div>}
                {!loading && rows === null && !error && <div className="rpt-state"><div className="rpt-state-icon">📊</div><span>Set your filters above and click <strong>Run Report</strong></span></div>}
                {!loading && rows !== null && rows.length === 0 && <div className="rpt-state"><div className="rpt-state-icon">🔍</div><span>No invoices match the selected filters.</span></div>}
                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="invoiceNo"      label="Invoice No"    />
                                        <Th col="supplierInvRef" label="Supplier Ref"  />
                                        <Th col="invoiceDate"    label="Date"          />
                                        <Th col="supplierName"   label="Supplier"      />
                                        <Th col="currencyShort"  label="Curr"          />
                                        <Th col="dueDate"        label="Due Date"      />
                                        <Th col="totalAmount"    label="Total"      cls="r" />
                                        <Th col="paidAmount"     label="Paid"       cls="r" />
                                        <Th col="balanceAmount"  label="Balance"    cls="r" />
                                        <Th col="status"         label="Status"        />
                                        <Th col="createdBy"      label="Created By"    />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => (
                                        <tr key={r.supplierInvoiceId} onClick={() => navigate(`/supplier-invoice/${r.supplierInvoiceId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>{rowOffset + i + 1}</td>
                                            <td><span style={{ fontFamily: 'Courier New', fontWeight: 700, color: '#9d174d', fontSize: 11.5, background: '#fce7f3', padding: '2px 8px', borderRadius: 4 }}>{r.invoiceNo}</span></td>
                                            <td style={{ fontSize: 11.5, color: '#64748b', fontFamily: 'Courier New' }}>{r.supplierInvRef || <span className="muted">—</span>}</td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.invoiceDate)}</td>
                                            <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.supplierName}</td>
                                            <td style={{ fontSize: 11.5, color: '#475569' }}>{r.currencyShort || <span className="muted">—</span>}</td>
                                            <td style={{ fontSize: 11, color: r.dueDate && new Date(r.dueDate) < new Date() && r.balanceAmount > 0 ? '#dc2626' : '#94a3b8', whiteSpace: 'nowrap' }}>{r.dueDate ? fmtDate(r.dueDate) : <span className="muted">—</span>}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af' }}>{fmt(r.totalAmount)}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: '#166534' }}>{fmt(r.paidAmount)}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: r.balanceAmount > 0 ? '#dc2626' : '#166534' }}>{fmt(r.balanceAmount)}</td>
                                            <td><span style={{ padding: '2px 9px', borderRadius: 20, fontSize: 10.5, fontWeight: 700, background: r.status === 'Paid' ? '#dcfce7' : r.status === 'Cancelled' ? '#fee2e2' : r.status === 'Confirmed' ? '#dbeafe' : '#f1f5f9', color: r.status === 'Paid' ? '#166534' : r.status === 'Cancelled' ? '#991b1b' : r.status === 'Confirmed' ? '#1e40af' : '#475569' }}>{r.status}</span></td>
                                            <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.createdBy}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={7} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>Totals — {totals.count} invoice{totals.count !== 1 ? 's' : ''}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 700 }}>{fmt(totals.totalAmount)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#166534' }}>{fmt(totals.paidAmount)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#dc2626', fontWeight: 700 }}>{fmt(totals.balanceAmount)}</td>
                                            <td colSpan={2} />
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

export default SupplierInvoiceReport;
