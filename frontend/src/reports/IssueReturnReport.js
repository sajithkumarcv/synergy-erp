import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useLookup } from '../LookupContext';
import { fmtDate, fmt, statusBadgeCfg } from '../procurement/procurementConstants';
import './Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const PAGE_SIZES = [50, 100, 200, 500, 1000];

const DEFAULT_FILTERS = {
    dateFrom:  firstOfMonth(),
    dateTo:    today(),
    jobId:     '',
    status:    '',
    createdBy: '',
};

// ── CSV export ──────────────────────────────────────────────────────────
const exportCsv = (rows) => {
    const headers = ['#', 'Return No', 'Date', 'Issue No', 'Job', 'Status', 'Returned By', 'Lines', 'Total Value', 'Created By'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.returnNo, r.returnDate ? fmtDate(r.returnDate) : '',
            r.issueNo, r.jobId, r.status, r.returnedBy,
            r.lineCount, r.totalValue, r.createdBy,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `IssueReturn_Report_${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
};

// ── Status badge ────────────────────────────────────────────────────────
const StatusBadge = ({ status, getStatusConfig }) => {
    const cfg = statusBadgeCfg(getStatusConfig('IRN', status));
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: cfg.bg, color: cfg.color,
            padding: '2px 9px', borderRadius: 20,
            fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em',
        }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {cfg.label}
        </span>
    );
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

// ── Quick-view modal ─────────────────────────────────────────────────────
const ReturnQuickView = ({ returnId, onClose }) => {
    const [data, setData]       = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        setLoading(true);
        fetch(`${variables.API_URL}stockissuereturn/${returnId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => { setError('Failed to load.'); setLoading(false); });
    }, [returnId]);

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

    const fmtDt = (v) => {
        if (!v) return '—';
        const d = new Date(v);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            + '  ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

    const hdr = data?.issueReturn;

    return (
        <div onClick={handleBackdrop} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)',
            zIndex: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        }}>
            <div style={{
                background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760,
                maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,.25)',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 20px', borderBottom: '1px solid #e2e8f0',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 16 }}>↩️</span>
                        {hdr && (
                            <span style={{
                                fontSize: 11, fontWeight: 700, color: '#9d174d',
                                background: '#fce7f3', padding: '2px 8px', borderRadius: 4,
                                fontFamily: 'Courier New',
                            }}>{hdr.returnNo}</span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => navigate(`/inventory-issue-return/${returnId}`)}
                            style={{
                                fontSize: 12, fontWeight: 600, color: '#1d4ed8',
                                background: '#dbeafe', border: 'none', borderRadius: 6,
                                padding: '5px 12px', cursor: 'pointer',
                            }}>Open Full →</button>
                        <button onClick={onClose} style={{
                            background: 'none', border: 'none', fontSize: 18,
                            color: '#94a3b8', cursor: 'pointer', lineHeight: 1, padding: '2px 6px',
                        }}>✕</button>
                    </div>
                </div>

                {loading && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                        <div className="rpt-spinner" />
                    </div>
                )}
                {error && <div style={{ padding: 24, color: '#dc2626', textAlign: 'center' }}>{error}</div>}

                {data && hdr && (
                    <>
                        {/* Meta band */}
                        <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: 0,
                            borderBottom: '1px solid #f1f5f9', background: '#f8fafc',
                        }}>
                            {[
                                { label: 'Posted Date & Time', val: hdr.postedDate ? fmtDt(hdr.postedDate) : '— (not posted)' },
                                { label: 'Issue No',           val: hdr.issueNo || '—' },
                                { label: 'Job',                val: hdr.jobId || '—' },
                                { label: 'Returned By',        val: hdr.returnedBy || '—' },
                                { label: 'Status',             val: hdr.status },
                                { label: 'Costing',            val: hdr.costingType === 'INC_COSTING' ? 'Include' : 'Exclude' },
                            ].map(m => (
                                <div key={m.label} style={{
                                    padding: '8px 16px', borderRight: '1px solid #e2e8f0', minWidth: 120,
                                }}>
                                    <div style={{ fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 2 }}>
                                        {m.label}
                                    </div>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{m.val}</div>
                                </div>
                            ))}
                        </div>

                        {/* Lines table */}
                        <div style={{ flex: 1, overflowY: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                <thead>
                                    <tr style={{ background: '#0f172a', position: 'sticky', top: 0 }}>
                                        {['#', 'Item Code', 'Description', 'UOM', 'Return Qty', 'Unit Cost', 'Total'].map(h => (
                                            <th key={h} style={{
                                                padding: '8px 12px',
                                                textAlign: ['Return Qty', 'Unit Cost', 'Total'].includes(h) ? 'right' : 'left',
                                                fontSize: 9.5, fontWeight: 700, color: '#64748b',
                                                textTransform: 'uppercase', letterSpacing: '.08em', whiteSpace: 'nowrap',
                                            }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.lines.length === 0 ? (
                                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: '#94a3b8', fontStyle: 'italic' }}>No items</td></tr>
                                    ) : data.lines.map((l, i) => (
                                        <tr key={l.returnLineId} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#f8fafc' : '#fff' }}>
                                            <td style={{ padding: '7px 12px', color: '#94a3b8', fontSize: 11 }}>{l.lineNum}</td>
                                            <td style={{ padding: '7px 12px', fontFamily: 'Courier New', fontSize: 11, color: '#2563eb' }}>{l.itemCode}</td>
                                            <td style={{ padding: '7px 12px', color: '#1e293b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {l.itemName || l.itemDesc}
                                            </td>
                                            <td style={{ padding: '7px 12px', color: '#64748b', textAlign: 'center' }}>{l.uomName || '—'}</td>
                                            <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                                                {Number(l.returnQty).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                            </td>
                                            <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#475569' }}>{fmt(l.unitCost)}</td>
                                            <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#9d174d' }}>{fmt(l.totalCost)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                        <td colSpan={4} style={{ padding: '7px 12px', textAlign: 'right', fontSize: 11, color: '#334155' }}>
                                            {data.lines.length} item{data.lines.length !== 1 ? 's' : ''}
                                        </td>
                                        <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                                            {data.lines.reduce((s, l) => s + l.returnQty, 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                        </td>
                                        <td />
                                        <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#9d174d' }}>
                                            {fmt(data.lines.reduce((s, l) => s + l.totalCost, 0))}
                                        </td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

// ═══════════════════════════════════════════════════════════════════════
const IssueReturnReport = () => {
    const navigate            = useNavigate();
    const { getStatusConfig, getModuleStatuses } = useLookup();

    const [filters,   setFilters]  = useState({ ...DEFAULT_FILTERS });
    const [rows,      setRows]     = useState(null);
    const [loading,   setLoading]  = useState(false);
    const [error,     setError]    = useState('');
    const [sortCol,   setSortCol]  = useState('returnDate');
    const [sortDir,   setSortDir]  = useState('desc');
    const [page,        setPage]       = useState(1);
    const [pageSize,    setPageSize]   = useState(200);
    const [quickViewId, setQuickViewId] = useState(null);

    const [jobs, setJobs] = useState([]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&approvalStatus=Approved`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setJobs(d.data || []))
            .catch(() => {});
    }, []);

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)  p.set('dateFrom',  filters.dateFrom);
        if (filters.dateTo)    p.set('dateTo',    filters.dateTo);
        if (filters.jobId)     p.set('jobId',     filters.jobId);
        if (filters.status)    p.set('status',    filters.status);
        if (filters.createdBy) p.set('createdBy', filters.createdBy);
        try {
            const res  = await fetch(`${variables.API_URL}reports/issue-return?${p}`, { headers: authHeaders() });
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
            count:      rows.length,
            totalLines: rows.reduce((s, r) => s + (r.lineCount || 0), 0),
            totalValue: rows.reduce((s, r) => s + (r.totalValue || 0), 0),
        };
    }, [rows]);

    const Th = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleSort(col)}>
            {label}<SortIcon col={col} sc={sortCol} sd={sortDir} />
        </th>
    );

    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setRows(null); setPage(1); };

    return (
        <>
        <div className="rpt-page">

            {/* ── Header ── */}
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#fce7f3,#fbcfe8)' }}>↩️</div>
                <div>
                    <div className="rpt-header-title">Issue Return Report</div>
                    <div className="rpt-header-sub">
                        {rows == null
                            ? 'Set filters and click Run Report'
                            : `${rows.length} issue return${rows.length !== 1 ? 's' : ''} found`}
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
                        <span className="rpt-filter-label">Date From</span>
                        <input className="rpt-filter-input" type="date"
                            value={filters.dateFrom}
                            onChange={e => setF('dateFrom', e.target.value)} />
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Date To</span>
                        <input className="rpt-filter-input" type="date"
                            value={filters.dateTo}
                            onChange={e => setF('dateTo', e.target.value)} />
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

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Status</span>
                        <select className="rpt-filter-select"
                            value={filters.status}
                            onChange={e => setF('status', e.target.value)}>
                            <option value="">All Statuses</option>
                            {getModuleStatuses('IRN').map(s =>
                                <option key={s.statusCode} value={s.statusCode}>{s.statusLabel}</option>
                            )}
                        </select>
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
                        <div className="rpt-summary-label">Total Returns</div>
                        <div className="rpt-summary-val">{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Lines</div>
                        <div className="rpt-summary-val blue">{totals.totalLines}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Value</div>
                        <div className="rpt-summary-val blue">{fmt(totals.totalValue)}</div>
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
                        <span>No issue returns match the selected filters.</span>
                    </div>
                )}

                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="returnNo"   label="Return No"     />
                                        <Th col="returnDate" label="Date"           />
                                        <Th col="issueNo"    label="Issue No"       />
                                        <Th col="jobId"      label="Job"            />
                                        <Th col="status"     label="Status"         />
                                        <Th col="returnedBy" label="Returned By"    />
                                        <Th col="lineCount"  label="Lines"       cls="r" />
                                        <Th col="totalValue" label="Total Value" cls="r" />
                                        <Th col="createdBy"  label="Created By"     />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => (
                                        <tr key={r.returnId} onClick={() => navigate(`/inventory-issue-return/${r.returnId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                                                {rowOffset + i + 1}
                                            </td>
                                            <td>
                                                <span onClick={e => { e.stopPropagation(); setQuickViewId(r.returnId); }}
                                                    style={{
                                                        fontFamily: 'Courier New', fontWeight: 700,
                                                        color: '#9d174d', fontSize: 11.5,
                                                        background: '#fce7f3', padding: '2px 8px', borderRadius: 4,
                                                        cursor: 'pointer',
                                                    }}>{r.returnNo}</span>
                                            </td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.returnDate)}</td>
                                            <td style={{ fontFamily: 'Courier New', fontSize: 11.5, color: '#475569' }}>
                                                {r.issueNo || <span className="muted">—</span>}
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
                                            <td>
                                                <StatusBadge status={r.status} getStatusConfig={getStatusConfig} />
                                            </td>
                                            <td style={{ fontSize: 12, color: '#1e293b' }}>
                                                {r.returnedBy || <span className="muted">—</span>}
                                            </td>
                                            <td className="r" style={{ color: '#475569', fontWeight: 600 }}>
                                                {r.lineCount}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', fontSize: 12.5 }}>
                                                {fmt(r.totalValue)}
                                            </td>
                                            <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.createdBy}</td>
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

        {quickViewId && (
            <ReturnQuickView returnId={quickViewId} onClose={() => setQuickViewId(null)} />
        )}
        </>
    );
};

export default IssueReturnReport;
