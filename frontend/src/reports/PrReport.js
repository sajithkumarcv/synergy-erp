import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useLookup } from '../LookupContext';
import { fmtDate, statusBadgeCfg } from '../procurement/procurementConstants';
import './Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const PAGE_SIZES       = [10, 20, 50, 100];

const DEFAULT_FILTERS = {
    dateFrom:  firstOfMonth(),
    dateTo:    today(),
    status:    '',
    priority:  '',
    jobId:     '',
    createdBy: '',
    noPOOnly:  false,
};

// ── CSV export ──────────────────────────────────────────────────────────
const exportCsv = (rows) => {
    const headers = ['#', 'PR Number', 'Date', 'Requested By', 'Job', 'Job Title', 'Status', 'Priority', 'Lines', 'POs Raised', 'Created By'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.prNumber, r.prDate ? fmtDate(r.prDate) : '',
            r.requestedBy, r.jobId, r.jobTitle,
            r.status, r.priority, r.lineCount, r.poCount, r.createdBy,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `PR_Report_${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
};

// ── Status badge ────────────────────────────────────────────────────────
const StatusBadge = ({ status, getStatusConfig }) => {
    const cfg = statusBadgeCfg(getStatusConfig('PR', status));
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

// ── Sort icon ───────────────────────────────────────────────────────────
const SortIcon = ({ col, sc, sd }) => (
    <span className={`rpt-sort ${sc === col ? 'on' : ''}`}>
        {sc !== col ? '⇅' : sd === 'asc' ? '↑' : '↓'}
    </span>
);

// ── Pagination ──────────────────────────────────────────────────────────
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
const PrReport = () => {
    const navigate            = useNavigate();
    const { getStatusConfig, getModuleStatuses, getVList } = useLookup();

    const [filters,  setFilters]  = useState({ ...DEFAULT_FILTERS });
    const [rows,     setRows]     = useState(null);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [sortCol,  setSortCol]  = useState('prDate');
    const [sortDir,  setSortDir]  = useState('desc');
    const [page,     setPage]     = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const [jobs, setJobs] = useState([]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    // ── Load jobs dropdown ───────────────────────────────────────────────
    useEffect(() => {
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&approvalStatus=Approved`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setJobs(d.data || []))
            .catch(() => {});
    }, []);

    // ── Run report ───────────────────────────────────────────────────────
    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)  p.set('dateFrom',  filters.dateFrom);
        if (filters.dateTo)    p.set('dateTo',    filters.dateTo);
        if (filters.status)    p.set('status',    filters.status);
        if (filters.priority)  p.set('priority',  filters.priority);
        if (filters.jobId)     p.set('jobId',     filters.jobId);
        if (filters.createdBy) p.set('createdBy', filters.createdBy);
        if (filters.noPOOnly)  p.set('noPOOnly',  'true');
        try {
            const res  = await fetch(`${variables.API_URL}reports/pr?${p}`, { headers: authHeaders() });
            const data = await res.json();
            if (!res.ok) { setError(data?.message || 'Error loading report.'); setRows([]); return; }
            setRows(data);
        } catch { setError('Network error.'); setRows([]); }
        finally { setLoading(false); }
    }, [filters]);

    // ── Sort ─────────────────────────────────────────────────────────────
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

    // ── Paging ───────────────────────────────────────────────────────────
    const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
    const paged      = sorted.slice((page - 1) * pageSize, page * pageSize);
    const rowOffset  = (page - 1) * pageSize;

    // ── Totals ───────────────────────────────────────────────────────────
    const totals = useMemo(() => {
        if (!rows || rows.length === 0) return null;
        return {
            count:    rows.length,
            lines:    rows.reduce((s, r) => s + (r.lineCount || 0), 0),
            noPO:     rows.filter(r => r.poCount === 0).length,
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
                <div className="rpt-header-icon">📋</div>
                <div>
                    <div className="rpt-header-title">Purchase Request Report</div>
                    <div className="rpt-header-sub">
                        {rows == null
                            ? 'Set filters and click Run Report'
                            : `${rows.length} purchase request${rows.length !== 1 ? 's' : ''} found`}
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
                            {getModuleStatuses('PR').map(s =>
                                <option key={s.statusCode} value={s.statusCode}>{s.statusLabel}</option>
                            )}
                        </select>
                    </div>

                    <div className="rpt-filter-group w140">
                        <span className="rpt-filter-label">Priority</span>
                        <select className="rpt-filter-select"
                            value={filters.priority}
                            onChange={e => setF('priority', e.target.value)}>
                            <option value="">All</option>
                            {getVList('Procurement', 'Priority').map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                        </select>
                    </div>

                    <div className="rpt-filter-group wflex">
                        <span className="rpt-filter-label">Created By</span>
                        <input className="rpt-filter-input" type="text" placeholder="Username…"
                            value={filters.createdBy}
                            onChange={e => setF('createdBy', e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && runReport()} />
                    </div>

                    <div className="rpt-filter-group">
                        <span className="rpt-filter-label">PO Status</span>
                        <div className="rpt-toggle">
                            <button className={`rpt-toggle-btn ${!filters.noPOOnly ? 'active' : ''}`}
                                onClick={() => setF('noPOOnly', false)}>All PRs</button>
                            <button className={`rpt-toggle-btn ${filters.noPOOnly ? 'active' : ''}`}
                                onClick={() => setF('noPOOnly', true)}>No PO</button>
                        </div>
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
                        <div className="rpt-summary-label">Total PRs</div>
                        <div className="rpt-summary-val">{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Lines</div>
                        <div className="rpt-summary-val blue">{totals.lines}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Pending PO</div>
                        <div className={`rpt-summary-val ${totals.noPO > 0 ? 'amber' : ''}`}>{totals.noPO}</div>
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
                        <span>No purchase requests match the selected filters.</span>
                    </div>
                )}

                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="prNumber"    label="PR Number"    />
                                        <Th col="prDate"      label="Date"          />
                                        <Th col="requestedBy" label="Requested By"  />
                                        <Th col="jobId"       label="Job"           />
                                        <Th col="status"      label="Status"        />
                                        <Th col="priority"    label="Priority"      />
                                        <Th col="lineCount"   label="Lines"      cls="r" />
                                        <Th col="poCount"     label="POs Raised" cls="r" />
                                        <Th col="createdBy"   label="Created By"    />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => (
                                        <tr key={r.prId} onClick={() => navigate(`/purchase-requests/${r.prId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                                                {rowOffset + i + 1}
                                            </td>
                                            <td>
                                                <span style={{
                                                    fontFamily: 'Courier New', fontWeight: 700,
                                                    color: '#7c3aed', fontSize: 11.5,
                                                    background: '#ede9fe', padding: '2px 8px', borderRadius: 4,
                                                }}>{r.prNumber}</span>
                                            </td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.prDate)}</td>
                                            <td style={{ fontSize: 12.5, color: '#1e293b' }}>
                                                {r.requestedBy || <span className="muted">—</span>}
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
                                            <td style={{ fontSize: 11.5, color: '#475569' }}>
                                                {r.priority || <span className="muted">—</span>}
                                            </td>
                                            <td className="r" style={{ color: '#475569', fontWeight: 600 }}>
                                                {r.lineCount}
                                            </td>
                                            <td className="r">
                                                <span style={{
                                                    fontWeight: 700,
                                                    color: r.poCount === 0 ? '#b45309' : '#166534',
                                                }}>{r.poCount}</span>
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
    );
};

export default PrReport;
