import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import './Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const PAGE_SIZES = [10, 20, 50, 100];

const DEFAULT_FILTERS = {
    dateFrom:    firstOfMonth(),
    dateTo:      today(),
    supplierId:  '',
    jobId:       '',
    cancelledBy: '',
    createdBy:   '',
};

// ── CSV export ──────────────────────────────────────────────────────────
const exportCsv = (rows) => {
    const headers = ['#', 'GRN Number', 'GRN Date', 'Vendor', 'Job', 'PO Number', 'DO No', 'Invoice No', 'Currency', 'Amount', 'Cancelled By', 'Cancelled Date', 'Cancel Reason', 'Created By'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.grnNumber, r.grnDate ? fmtDate(r.grnDate) : '',
            r.supplierName, r.jobId, r.poNumber, r.doNo, r.invoiceNo,
            r.currencyShort, r.totalAmount,
            r.cancelledBy, r.cancelledDate ? fmtDate(r.cancelledDate) : '',
            r.cancelReason, r.createdBy,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `GRN_Unregistration_Report_${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
};

const SortIcon = ({ col, sc, sd }) => (
    <span className={`rpt-sort ${sc === col ? 'on' : ''}`}>
        {sc !== col ? '⇅' : sd === 'asc' ? '↑' : '↓'}
    </span>
);

const Pagination = ({ page, totalPages, pageSize, totalRows, onPage, onPageSize }) => {
    const pages = [];
    const delta = 2;
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta))
            pages.push(i);
        else if (pages[pages.length - 1] !== '…')
            pages.push('…');
    }
    const from = (page - 1) * pageSize + 1;
    const to   = Math.min(page * pageSize, totalRows);
    return (
        <div className="rpt-pagination">
            <div className="rpt-pag-info">
                Showing <strong>{from}–{to}</strong> of <strong>{totalRows}</strong> records
            </div>
            <div className="rpt-pag-controls">
                <button className="rpt-pag-btn" onClick={() => onPage(1)}        disabled={page === 1}>«</button>
                <button className="rpt-pag-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>‹</button>
                {pages.map((p, i) =>
                    p === '…'
                        ? <span key={`e${i}`} className="rpt-pag-ellipsis">…</span>
                        : <button key={p} className={`rpt-pag-btn ${page === p ? 'active' : ''}`} onClick={() => onPage(p)}>{p}</button>
                )}
                <button className="rpt-pag-btn" onClick={() => onPage(page + 1)} disabled={page === totalPages}>›</button>
                <button className="rpt-pag-btn" onClick={() => onPage(totalPages)} disabled={page === totalPages}>»</button>
            </div>
            <div className="rpt-pag-size">
                Rows:
                <select value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
                    {PAGE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════
const GrnUnregReport = () => {
    const navigate = useNavigate();

    const [filters,   setFilters]  = useState({ ...DEFAULT_FILTERS });
    const [rows,      setRows]     = useState(null);
    const [loading,   setLoading]  = useState(false);
    const [error,     setError]    = useState('');
    const [sortCol,   setSortCol]  = useState('cancelledDate');
    const [sortDir,   setSortDir]  = useState('desc');
    const [page,      setPage]     = useState(1);
    const [pageSize,  setPageSize] = useState(20);

    const [suppliers, setSuppliers] = useState([]);
    const [jobs,      setJobs]      = useState([]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        const h = authHeaders();
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setSuppliers((d.data || []).sort((a, b) => a.supplierName.localeCompare(b.supplierName))))
            .catch(() => {});
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&approvalStatus=Approved`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setJobs(d.data || []))
            .catch(() => {});
    }, []);

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)    p.set('dateFrom',    filters.dateFrom);
        if (filters.dateTo)      p.set('dateTo',      filters.dateTo);
        if (filters.supplierId)  p.set('supplierId',  filters.supplierId);
        if (filters.jobId)       p.set('jobId',       filters.jobId);
        if (filters.cancelledBy) p.set('cancelledBy', filters.cancelledBy);
        if (filters.createdBy)   p.set('createdBy',   filters.createdBy);
        try {
            const res  = await fetch(`${variables.API_URL}reports/grn-unreg?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); return; }
            setRows(data);
        } catch { setError('Network error.'); setRows([]); }
        finally { setLoading(false); }
    }, [filters]);

    const handleSort = (col) => {
        setPage(1);
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };

    const sorted = useMemo(() => {
        if (!rows) return [];
        return [...rows].sort((a, b) => {
            let av = a[sortCol] ?? '', bv = b[sortCol] ?? '';
            if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
            return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
    }, [rows, sortCol, sortDir]);

    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const paged      = sorted.slice((page - 1) * pageSize, page * pageSize);
    const rowOffset  = (page - 1) * pageSize;

    const totals = useMemo(() => {
        if (!rows || rows.length === 0) return null;
        return {
            count:       rows.length,
            totalAmount: rows.reduce((s, r) => s + (r.totalAmount || 0), 0),
        };
    }, [rows]);

    const Th = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleSort(col)}>
            {label}<SortIcon col={col} sc={sortCol} sd={sortDir} />
        </th>
    );

    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setRows(null); setPage(1); };

    return (
        <div className="rpt-page">

            {/* ── Header ── */}
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#fee2e2,#fecaca)' }}>🚫</div>
                <div>
                    <div className="rpt-header-title">GRN Unregistration Report</div>
                    <div className="rpt-header-sub">
                        {rows == null
                            ? 'Set filters and click Run Report'
                            : `${rows.length} cancelled GRN${rows.length !== 1 ? 's' : ''} found`}
                    </div>
                </div>
                <div className="rpt-header-actions">
                    {rows && rows.length > 0 && (
                        <button className="rpt-btn-export" onClick={() => exportCsv(sorted)}>
                            ⬇ Export CSV
                        </button>
                    )}
                </div>
            </div>

            {/* ── Filters ── */}
            <div className="rpt-filter-card">
                <div className="rpt-filter-row">

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Cancelled From</span>
                        <input className="rpt-filter-input" type="date"
                            value={filters.dateFrom}
                            onChange={e => setF('dateFrom', e.target.value)} />
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Cancelled To</span>
                        <input className="rpt-filter-input" type="date"
                            value={filters.dateTo}
                            onChange={e => setF('dateTo', e.target.value)} />
                    </div>

                    <div className="rpt-filter-group w200">
                        <span className="rpt-filter-label">Supplier</span>
                        <select className="rpt-filter-select"
                            value={filters.supplierId}
                            onChange={e => setF('supplierId', e.target.value)}>
                            <option value="">All Suppliers</option>
                            {suppliers.map(s => (
                                <option key={s.supplierId} value={s.supplierId}>{s.supplierName}</option>
                            ))}
                        </select>
                    </div>

                    <div className="rpt-filter-group w200">
                        <span className="rpt-filter-label">Job No</span>
                        <select className="rpt-filter-select"
                            value={filters.jobId}
                            onChange={e => setF('jobId', e.target.value)}>
                            <option value="">All Jobs</option>
                            {jobs.map(j => (
                                <option key={j.jobId} value={j.jobId}>
                                    {j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="rpt-filter-group wflex">
                        <span className="rpt-filter-label">Cancelled By</span>
                        <input className="rpt-filter-input" type="text" placeholder="Username…"
                            value={filters.cancelledBy}
                            onChange={e => setF('cancelledBy', e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && runReport()} />
                    </div>

                    <div className="rpt-filter-group wflex">
                        <span className="rpt-filter-label">Created By</span>
                        <input className="rpt-filter-input" type="text" placeholder="Username…"
                            value={filters.createdBy}
                            onChange={e => setF('createdBy', e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && runReport()} />
                    </div>

                    <div className="rpt-filter-group" style={{ justifyContent: 'flex-end' }}>
                        <span className="rpt-filter-label">&nbsp;</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            <button className="rpt-btn-clear" onClick={clearAll}>Clear</button>
                            <button className="rpt-btn-run" onClick={runReport} disabled={loading}>
                                {loading ? '⏳ Running…' : '▶ Run Report'}
                            </button>
                        </div>
                    </div>

                </div>
            </div>

            {/* ── Error ── */}
            {error && <div className="rpt-error">⚠ {error}</div>}

            {/* ── Summary strip ── */}
            {totals && (
                <div className="rpt-summary">
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Cancelled GRNs</div>
                        <div className="rpt-summary-val" style={{ color: '#dc2626' }}>{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Amount</div>
                        <div className="rpt-summary-val blue">{fmt(totals.totalAmount)}</div>
                    </div>
                </div>
            )}

            {/* ── Content ── */}
            <div className="rpt-content">

                {loading && (
                    <div className="rpt-state">
                        <div className="rpt-spinner" />
                        <span>Running report…</span>
                    </div>
                )}

                {!loading && rows === null && !error && (
                    <div className="rpt-state">
                        <div className="rpt-state-icon">📊</div>
                        <span>Set your filters above and click <strong>Run Report</strong></span>
                    </div>
                )}

                {!loading && rows !== null && rows.length === 0 && (
                    <div className="rpt-state">
                        <div className="rpt-state-icon">🔍</div>
                        <span>No cancelled GRNs match the selected filters.</span>
                    </div>
                )}

                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="grnNumber"     label="GRN Number"      />
                                        <Th col="grnDate"       label="GRN Date"         />
                                        <Th col="supplierName"  label="Vendor"           />
                                        <Th col="jobId"         label="Job"              />
                                        <Th col="poNumber"      label="PO Number"        />
                                        <Th col="doNo"          label="DO No"            />
                                        <Th col="currencyShort" label="CCY"              />
                                        <Th col="totalAmount"   label="Amount"        cls="r" />
                                        <Th col="cancelledBy"   label="Cancelled By"     />
                                        <Th col="cancelledDate" label="Cancelled Date"   />
                                        <Th col="cancelReason"  label="Reason"           />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => (
                                        <tr key={r.grnId} onClick={() => navigate(`/grn/${r.grnId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                                                {rowOffset + i + 1}
                                            </td>
                                            <td>
                                                <span style={{
                                                    fontFamily: 'Courier New', fontWeight: 700,
                                                    color: '#dc2626', fontSize: 11.5,
                                                    background: '#fee2e2', padding: '2px 8px', borderRadius: 4,
                                                }}>{r.grnNumber}</span>
                                            </td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.grnDate)}</td>
                                            <td style={{ maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {r.supplierName || <span className="muted">—</span>}
                                            </td>
                                            <td>
                                                {r.jobId
                                                    ? <span style={{
                                                        fontFamily: 'Courier New', fontSize: 11,
                                                        color: '#0f766e', background: '#ccfbf1',
                                                        padding: '2px 6px', borderRadius: 4
                                                    }}>{r.jobId}</span>
                                                    : <span className="muted">—</span>}
                                            </td>
                                            <td style={{ fontFamily: 'Courier New', fontSize: 11.5, color: '#475569' }}>
                                                {r.poNumber || <span className="muted">—</span>}
                                            </td>
                                            <td style={{ fontSize: 11.5, color: '#64748b' }}>
                                                {r.doNo || <span className="muted">—</span>}
                                            </td>
                                            <td style={{ fontSize: 12, color: '#475569' }}>
                                                {r.currencyShort || <span className="muted">—</span>}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', fontSize: 12.5 }}>
                                                {fmt(r.totalAmount)}
                                            </td>
                                            <td style={{ fontSize: 11.5, color: '#dc2626', fontWeight: 600 }}>
                                                {r.cancelledBy || <span className="muted">—</span>}
                                            </td>
                                            <td style={{ fontSize: 11.5, color: '#475569' }}>
                                                {fmtDate(r.cancelledDate)}
                                            </td>
                                            <td style={{ fontSize: 11.5, color: '#64748b', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {r.cancelReason || <span className="muted">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <Pagination
                            page={page}
                            totalPages={totalPages}
                            pageSize={pageSize}
                            totalRows={sorted.length}
                            onPage={p => setPage(p)}
                            onPageSize={s => { setPageSize(s); setPage(1); }}
                        />
                    </>
                )}
            </div>
        </div>
    );
};

export default GrnUnregReport;
