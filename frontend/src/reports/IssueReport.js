import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useLookup } from '../LookupContext';
import { fmtDate, fmt, statusBadgeCfg } from '../procurement/procurementConstants';
import './Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const PAGE_SIZES = [10, 20, 50, 100];

const DEFAULT_FILTERS = {
    dateFrom:    firstOfMonth(),
    dateTo:      today(),
    jobId:       '',
    sourceJobId: '',
    status:      '',
    createdBy:   '',
    costingType: '',
};

// ── CSV exports ─────────────────────────────────────────────────────────
const exportDetailCsv = (rows) => {
    const headers = ['#', 'Issue No', 'Date', 'Source Job', 'Issued To Job', 'Item Code', 'Item Name', 'Category', 'Qty', 'UOM', 'Unit Cost', 'Line Total', 'Status', 'Costing Type'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.issueNo, r.issueDate ? fmtDate(r.issueDate) : '',
            r.sourceJobId, r.jobId, r.itemCode, r.itemDesc, r.categoryName,
            r.qty, r.uomName, r.unitCost, r.lineTotal, r.status, r.costingType,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `IssueNote_Lines_${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
};

const exportCsv = (rows) => {
    const headers = ['#', 'Issue No', 'Date', 'Source Job', 'Issued To Job', 'Status', 'Issued To', 'Costing Type', 'Lines', 'Total Value', 'Created By'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.issueNo, r.issueDate ? fmtDate(r.issueDate) : '',
            r.sourceJobId, r.jobId, r.status, r.issuedTo, r.costingType,
            r.lineCount, r.totalValue, r.createdBy,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `IssueNote_Report_${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
};

// ── Status badge ────────────────────────────────────────────────────────
const StatusBadge = ({ status, getStatusConfig }) => {
    const cfg = statusBadgeCfg(getStatusConfig('ISN', status));
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
const IssueQuickView = ({ issueId, onClose }) => {
    const [data, setData]     = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError]   = useState('');
    const navigate = useNavigate();

    useEffect(() => {
        setLoading(true);
        fetch(`${variables.API_URL}stockissue/${issueId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : Promise.reject())
            .then(d => { setData(d); setLoading(false); })
            .catch(() => { setError('Failed to load.'); setLoading(false); });
    }, [issueId]);

    const handleBackdrop = (e) => { if (e.target === e.currentTarget) onClose(); };

    const fmtDt = (v) => {
        if (!v) return '—';
        const d = new Date(v);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            + '  ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    };

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
                        <span style={{ fontSize: 16 }}>📤</span>
                        <span style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                            {data?.issue?.issueNo || 'Issue Note'}
                        </span>
                        {data?.issue && (
                            <span style={{
                                fontSize: 11, fontWeight: 700, color: '#92400e',
                                background: '#fef3c7', padding: '2px 8px', borderRadius: 4,
                                fontFamily: 'Courier New',
                            }}>{data.issue.issueNo}</span>
                        )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <button onClick={() => navigate(`/inventory-issue/${issueId}`)}
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
                {error && (
                    <div style={{ padding: 24, color: '#dc2626', textAlign: 'center' }}>{error}</div>
                )}

                {data && (
                    <>
                        {/* Meta band */}
                        <div style={{
                            display: 'flex', flexWrap: 'wrap', gap: 0,
                            borderBottom: '1px solid #f1f5f9', background: '#f8fafc',
                        }}>
                            {[
                                { label: 'Posted Date & Time', val: data.issue.postedDate ? fmtDt(data.issue.postedDate) : '— (not posted)' },
                                { label: 'Job',         val: data.issue.jobId || '—' },
                                { label: 'Issued To',   val: data.issue.issuedTo || '—' },
                                { label: 'Status',      val: data.issue.status },
                                { label: 'Costing',     val: data.issue.costingType === 'INC_COSTING' ? 'Include' : 'Exclude' },
                                { label: 'Created By',  val: data.issue.createdBy },
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
                                        {['#', 'Item Code', 'Description', 'UOM', 'Qty', 'Unit Cost', 'Total'].map(h => (
                                            <th key={h} style={{
                                                padding: '8px 12px', textAlign: ['Qty','Unit Cost','Total'].includes(h) ? 'right' : 'left',
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
                                        <tr key={l.issueLineId} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 ? '#f8fafc' : '#fff' }}>
                                            <td style={{ padding: '7px 12px', color: '#94a3b8', fontSize: 11 }}>{l.lineNum}</td>
                                            <td style={{ padding: '7px 12px', fontFamily: 'Courier New', fontSize: 11, color: '#2563eb' }}>{l.itemCode}</td>
                                            <td style={{ padding: '7px 12px', color: '#1e293b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {l.itemName || l.itemDesc}
                                            </td>
                                            <td style={{ padding: '7px 12px', color: '#64748b', textAlign: 'center' }}>{l.uomName || '—'}</td>
                                            <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>
                                                {Number(l.qty).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                            </td>
                                            <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#475569' }}>{fmt(l.unitCost)}</td>
                                            <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1e40af' }}>{fmt(l.totalCost)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                        <td colSpan={4} style={{ padding: '7px 12px', textAlign: 'right', fontSize: 11, color: '#334155' }}>
                                            {data.lines.length} item{data.lines.length !== 1 ? 's' : ''}
                                        </td>
                                        <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                                            {data.lines.reduce((s, l) => s + l.qty, 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}
                                        </td>
                                        <td />
                                        <td style={{ padding: '7px 12px', textAlign: 'right', fontFamily: 'monospace', color: '#1e40af' }}>
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
const IssueReport = () => {
    const navigate            = useNavigate();
    const { getStatusConfig, getModuleStatuses } = useLookup();

    const [filters,   setFilters]  = useState({ ...DEFAULT_FILTERS });
    const [rows,      setRows]     = useState(null);
    const [loading,   setLoading]  = useState(false);
    const [error,     setError]    = useState('');
    const [sortCol,   setSortCol]  = useState('issueDate');
    const [sortDir,   setSortDir]  = useState('desc');
    const [page,      setPage]     = useState(1);
    const [pageSize,  setPageSize] = useState(20);
    const [quickViewId, setQuickViewId] = useState(null);

    const [activeTab,     setActiveTab]     = useState('summary');
    const [detailRows,    setDetailRows]    = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [dSortCol,  setDSortCol]  = useState('issueDate');
    const [dSortDir,  setDSortDir]  = useState('desc');
    const [dPage,     setDPage]     = useState(1);
    const [dPageSize, setDPageSize] = useState(50);

    const [jobs, setJobs] = useState([]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&approvalStatus=Approved`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setJobs(d.data || []))
            .catch(() => {});
    }, []);

    const runReport = useCallback(async () => {
        setLoading(true); setDetailLoading(true); setError(''); setPage(1); setDPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)    p.set('dateFrom',    filters.dateFrom);
        if (filters.dateTo)      p.set('dateTo',      filters.dateTo);
        if (filters.jobId)       p.set('jobId',       filters.jobId);
        if (filters.sourceJobId) p.set('sourceJobId', filters.sourceJobId);
        if (filters.status)      p.set('status',      filters.status);
        if (filters.createdBy)   p.set('createdBy',   filters.createdBy);
        if (filters.costingType) p.set('costingType', filters.costingType);
        try {
            const [summRes, detRes] = await Promise.all([
                fetch(`${variables.API_URL}reports/issue?${p}`,         { headers: authHeaders() }),
                fetch(`${variables.API_URL}reports/issue-details?${p}`, { headers: authHeaders() }),
            ]);
            const [summData, detData] = await Promise.all([summRes.json(), detRes.json()]);
            if (!summRes.ok) { setError(summData?.message || 'Error loading report.'); setRows([]); }
            else setRows(summData);
            setDetailRows(detRes.ok ? detData : []);
        } catch { setError('Network error.'); setRows([]); setDetailRows([]); }
        finally { setLoading(false); setDetailLoading(false); }
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
        const inc = rows.filter(r => r.costingType === 'INC_COSTING');
        const exc = rows.filter(r => r.costingType === 'EXC_COSTING');
        return {
            count:          rows.length,
            totalLines:     rows.reduce((s, r) => s + (r.lineCount  || 0), 0),
            totalValue:     rows.reduce((s, r) => s + (r.totalValue || 0), 0),
            incCount:       inc.length,
            incValue:       inc.reduce((s, r) => s + (r.totalValue || 0), 0),
            excCount:       exc.length,
            excValue:       exc.reduce((s, r) => s + (r.totalValue || 0), 0),
        };
    }, [rows]);

    const Th = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleSort(col)}>
            {label}<SortIcon col={col} sc={sortCol} sd={sortDir} />
        </th>
    );

    const dSorted = useMemo(() => {
        if (!detailRows) return [];
        return [...detailRows].sort((a, b) => {
            let av = a[dSortCol] ?? '', bv = b[dSortCol] ?? '';
            if (typeof av === 'number') return dSortDir === 'asc' ? av - bv : bv - av;
            return dSortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
        });
    }, [detailRows, dSortCol, dSortDir]);

    const dTotalPages = Math.max(1, Math.ceil(dSorted.length / dPageSize));
    const dPaged      = dSorted.slice((dPage - 1) * dPageSize, dPage * dPageSize);
    const dRowOffset  = (dPage - 1) * dPageSize;

    const handleDSort = (col) => {
        setDPage(1);
        if (dSortCol === col) setDSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setDSortCol(col); setDSortDir('asc'); }
    };

    const DTh = ({ col, label, cls }) => (
        <th className={cls} onClick={() => handleDSort(col)}>
            {label}<SortIcon col={col} sc={dSortCol} sd={dSortDir} />
        </th>
    );

    const detailTotals = useMemo(() => {
        if (!detailRows || detailRows.length === 0) return null;
        return {
            lines: detailRows.length,
            qty:   detailRows.reduce((s, r) => s + (r.qty       || 0), 0),
            value: detailRows.reduce((s, r) => s + (r.lineTotal || 0), 0),
        };
    }, [detailRows]);

    const clearAll = () => { setFilters({ ...DEFAULT_FILTERS }); setRows(null); setDetailRows(null); setPage(1); setDPage(1); };

    return (
        <>
        <div className="rpt-page">

            {/* ── Header ── */}
            <div className="rpt-header">
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#fef9c3,#fde68a)' }}>📤</div>
                <div>
                    <div className="rpt-header-title">Issue Note Report</div>
                    <div className="rpt-header-sub">
                        {rows == null
                            ? 'Set filters and click Run Report'
                            : `${rows.length} issue note${rows.length !== 1 ? 's' : ''}  ·  ${detailRows?.length ?? 0} line${(detailRows?.length ?? 0) !== 1 ? 's' : ''}`}
                    </div>
                </div>
                <div className="rpt-header-actions">
                    {activeTab === 'summary' && rows && rows.length > 0 && (
                        <button className="rpt-btn-export" onClick={() => exportCsv(sorted)}>⬇ Export CSV</button>
                    )}
                    {activeTab === 'lines' && detailRows && detailRows.length > 0 && (
                        <button className="rpt-btn-export" onClick={() => exportDetailCsv(dSorted)}>⬇ Export CSV</button>
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
                        <span className="rpt-filter-label">Source Job (IH)</span>
                        <select className="rpt-filter-select"
                            value={filters.sourceJobId}
                            onChange={e => setF('sourceJobId', e.target.value)}>
                            <option value="">All</option>
                            {jobs.filter(j => j.jobId && j.jobId.startsWith('IH')).map(j => (
                                <option key={j.jobId} value={j.jobId}>
                                    {j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="rpt-filter-group w200">
                        <span className="rpt-filter-label">Issued To Job</span>
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
                            {getModuleStatuses('ISN').map(s =>
                                <option key={s.statusCode} value={s.statusCode}>{s.statusLabel}</option>
                            )}
                        </select>
                    </div>

                    <div className="rpt-filter-group">
                        <span className="rpt-filter-label">Costing</span>
                        <div className="rpt-toggle">
                            <button className={`rpt-toggle-btn ${filters.costingType === '' ? 'active' : ''}`}
                                onClick={() => setF('costingType', '')}>All</button>
                            <button className={`rpt-toggle-btn ${filters.costingType === 'INC_COSTING' ? 'active' : ''}`}
                                onClick={() => setF('costingType', 'INC_COSTING')}>Inc. Costing</button>
                            <button className={`rpt-toggle-btn ${filters.costingType === 'EXC_COSTING' ? 'active' : ''}`}
                                onClick={() => setF('costingType', 'EXC_COSTING')}>Exc. Costing</button>
                        </div>
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
                        <div className="rpt-summary-label">Total Issues</div>
                        <div className="rpt-summary-val">{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Lines</div>
                        <div className="rpt-summary-val">{totals.totalLines}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Value</div>
                        <div className="rpt-summary-val blue">{fmt(totals.totalValue)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Inc. Costing ({totals.incCount})</div>
                        <div className="rpt-summary-val green">{fmt(totals.incValue)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Exc. Costing ({totals.excCount})</div>
                        <div className="rpt-summary-val amber">{fmt(totals.excValue)}</div>
                    </div>
                </div>
            )}

            {/* ── Tabs ── */}
            {(rows !== null || detailRows !== null) && (
                <div style={{ display: 'flex', gap: 2, padding: '0 0 0 4px', borderBottom: '2px solid #e2e8f0', marginBottom: 0 }}>
                    {[
                        { key: 'summary', label: `By Issue${rows ? ` (${rows.length})` : ''}` },
                        { key: 'lines',   label: `By Item${detailRows ? ` (${detailRows.length})` : ''}` },
                    ].map(t => (
                        <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                            padding: '8px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                            borderBottom: activeTab === t.key ? '3px solid #2563eb' : '3px solid transparent',
                            color: activeTab === t.key ? '#2563eb' : '#64748b',
                            background: 'transparent',
                        }}>{t.label}</button>
                    ))}
                </div>
            )}

            {/* ── Content ── */}
            <div className="rpt-content">

                {(loading || detailLoading) && (
                    <div className="rpt-state">
                        <div className="rpt-spinner" />
                        <span>Running report…</span>
                    </div>
                )}

                {!loading && !detailLoading && rows === null && !error && (
                    <div className="rpt-state">
                        <div className="rpt-state-icon">📊</div>
                        <span>Set your filters above and click <strong>Run Report</strong></span>
                    </div>
                )}

                {/* ── By Issue tab ── */}
                {!loading && !detailLoading && activeTab === 'summary' && rows !== null && rows.length === 0 && (
                    <div className="rpt-state">
                        <div className="rpt-state-icon">🔍</div>
                        <span>No issue notes match the selected filters.</span>
                    </div>
                )}

                {!loading && activeTab === 'summary' && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="issueNo"     label="Issue No"      />
                                        <Th col="issueDate"   label="Date"           />
                                        <Th col="sourceJobId" label="Source Job"     />
                                        <Th col="jobId"       label="Issued To Job"  />
                                        <Th col="status"      label="Status"         />
                                        <Th col="issuedTo"    label="Issued To"      />
                                        <Th col="costingType" label="Costing Type"   />
                                        <Th col="lineCount"   label="Lines"       cls="r" />
                                        <Th col="totalValue"  label="Total Value" cls="r" />
                                        <Th col="createdBy"   label="Created By"     />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => (
                                        <tr key={r.issueId} onClick={() => navigate(`/inventory-issue/${r.issueId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                                                {rowOffset + i + 1}
                                            </td>
                                            <td>
                                                <span onClick={e => { e.stopPropagation(); setQuickViewId(r.issueId); }}
                                                    style={{
                                                        fontFamily: 'Courier New', fontWeight: 700,
                                                        color: '#92400e', fontSize: 11.5,
                                                        background: '#fef3c7', padding: '2px 8px', borderRadius: 4,
                                                        cursor: 'pointer',
                                                    }}>{r.issueNo}</span>
                                            </td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.issueDate)}</td>
                                            <td>
                                                {r.sourceJobId
                                                    ? <span style={{
                                                        fontFamily: 'Courier New', fontSize: 11,
                                                        color: '#7c3aed', background: '#ede9fe',
                                                        padding: '2px 6px', borderRadius: 4
                                                    }}>{r.sourceJobId}</span>
                                                    : <span className="muted">—</span>}
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
                                                {r.issuedTo || <span className="muted">—</span>}
                                            </td>
                                            <td style={{ fontSize: 11.5, color: '#475569' }}>
                                                {r.costingType || <span className="muted">—</span>}
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
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={7} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>
                                                Totals — {totals.count} issue{totals.count !== 1 ? 's' : ''}
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', color: '#475569' }}>{totals.totalLines}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 700 }}>{fmt(totals.totalValue)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                )}
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

                {/* ── By Item tab ── */}
                {!detailLoading && activeTab === 'lines' && detailRows !== null && detailRows.length === 0 && (
                    <div className="rpt-state">
                        <div className="rpt-state-icon">🔍</div>
                        <span>No issue lines match the selected filters.</span>
                    </div>
                )}

                {!detailLoading && activeTab === 'lines' && dPaged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <DTh col="issueNo"      label="Issue No"       />
                                        <DTh col="issueDate"    label="Date"           />
                                        <DTh col="sourceJobId"  label="Source Job"     />
                                        <DTh col="jobId"        label="Issued To Job"  />
                                        <DTh col="itemCode"     label="Item Code"      />
                                        <DTh col="itemDesc"     label="Description"    />
                                        <DTh col="categoryName" label="Category"       />
                                        <DTh col="qty"          label="Qty"         cls="r" />
                                        <DTh col="uomName"      label="UOM"            />
                                        <DTh col="unitCost"     label="Unit Cost"   cls="r" />
                                        <DTh col="lineTotal"    label="Line Total"  cls="r" />
                                        <DTh col="status"       label="Status"         />
                                    </tr>
                                </thead>
                                <tbody>
                                    {dPaged.map((r, i) => (
                                        <tr key={r.issueLineId} onClick={() => navigate(`/inventory-issue/${r.issueId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                                                {dRowOffset + i + 1}
                                            </td>
                                            <td>
                                                <span onClick={e => { e.stopPropagation(); setQuickViewId(r.issueId); }}
                                                    style={{
                                                        fontFamily: 'Courier New', fontWeight: 700,
                                                        color: '#92400e', fontSize: 11.5,
                                                        background: '#fef3c7', padding: '2px 8px', borderRadius: 4,
                                                        cursor: 'pointer',
                                                    }}>{r.issueNo}</span>
                                            </td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.issueDate)}</td>
                                            <td>
                                                {r.sourceJobId
                                                    ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#7c3aed', background: '#ede9fe', padding: '2px 6px', borderRadius: 4 }}>{r.sourceJobId}</span>
                                                    : <span className="muted">—</span>}
                                            </td>
                                            <td>
                                                {r.jobId
                                                    ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#0f766e', background: '#ccfbf1', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                                    : <span className="muted">—</span>}
                                            </td>
                                            <td style={{ fontFamily: 'Courier New', fontSize: 11.5, color: '#2563eb', fontWeight: 600 }}>{r.itemCode}</td>
                                            <td style={{ fontSize: 12, color: '#1e293b', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.itemDesc}</td>
                                            <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.categoryName || <span className="muted">—</span>}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.qty}</td>
                                            <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.uomName}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: '#475569' }}>{fmt(r.unitCost)}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', fontSize: 12.5 }}>{fmt(r.lineTotal)}</td>
                                            <td>
                                                <StatusBadge status={r.status} getStatusConfig={getStatusConfig} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {detailTotals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={8} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>
                                                Totals — {detailTotals.lines} line{detailTotals.lines !== 1 ? 's' : ''}
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#334155' }}>{detailTotals.qty}</td>
                                            <td colSpan={2} />
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 700 }}>{fmt(detailTotals.value)}</td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        <Pagination
                            page={dPage}
                            totalPages={dTotalPages}
                            pageSize={dPageSize}
                            totalRows={dSorted.length}
                            onPage={p => setDPage(p)}
                            onPageSize={s => { setDPageSize(s); setDPage(1); }}
                        />
                    </>
                )}
            </div>
        </div>

        {quickViewId && (
            <IssueQuickView issueId={quickViewId} onClose={() => setQuickViewId(null)} />
        )}
        </>
    );
};

export default IssueReport;
