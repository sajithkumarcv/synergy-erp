import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import { useLookup } from '../LookupContext';
import './Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); };

const PAGE_SIZES = [50, 100, 200, 500, 1000];

const DEFAULT_FILTERS = {
    dateFrom:  firstOfMonth(),
    dateTo:    today(),
    jobId:     '',
    jobTypeId: '',
    bomStatus: '',
    createdBy: '',
};

const STATUS_CFG = {
    Draft:     { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
    Approved:  { bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
    Rejected:  { bg: '#fee2e2', color: '#991b1b', dot: '#dc2626' },
    Cancelled: { bg: '#fce7f3', color: '#9d174d', dot: '#db2777' },
};
const StatusBadge = ({ status }) => {
    const cfg = STATUS_CFG[status] || STATUS_CFG.Draft;
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: cfg.bg, color: cfg.color,
            padding: '2px 9px', borderRadius: 20,
            fontSize: 10.5, fontWeight: 700, letterSpacing: '.02em',
        }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {status || '—'}
        </span>
    );
};

const exportCsv = (rows) => {
    const headers = ['#', 'Job ID', 'BOM Date', 'Version', 'Status', 'Customer', 'Project',
        'Job Type', 'Currency', 'Total BOM Value', 'Lines', 'Approved By', 'Created By'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.jobId, r.bomDate ? fmtDate(r.bomDate) : '', r.bomVersion, r.bomStatus,
            r.customerName, r.projectName, r.jobTypeName, r.currencySymbol,
            r.totalBomValue, r.lineCount, r.bomApprovedBy, r.createdBy,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `BOM_Report_${today()}.csv`; a.click();
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
        if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) pages.push(i);
        else if (pages[pages.length - 1] !== '…') pages.push('…');
    }
    const from = (page - 1) * pageSize + 1;
    const to   = Math.min(page * pageSize, totalRows);
    return (
        <div className="rpt-pagination">
            <div className="rpt-pag-info">Showing <strong>{from}–{to}</strong> of <strong>{totalRows}</strong> records</div>
            <div className="rpt-pag-controls">
                <button className="rpt-pag-btn" onClick={() => onPage(1)}        disabled={page === 1}>«</button>
                <button className="rpt-pag-btn" onClick={() => onPage(page - 1)} disabled={page === 1}>‹</button>
                {pages.map((p, i) =>
                    p === '…' ? <span key={`e${i}`} className="rpt-pag-ellipsis">…</span>
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
const BomReport = () => {
    const navigate = useNavigate();
    const { getVList } = useLookup();

    const [filters,  setFilters]  = useState({ ...DEFAULT_FILTERS });
    const [rows,     setRows]     = useState(null);
    const [loading,  setLoading]  = useState(false);
    const [error,    setError]    = useState('');
    const [sortCol,  setSortCol]  = useState('bomDate');
    const [sortDir,  setSortDir]  = useState('desc');
    const [page,     setPage]     = useState(1);
    const [pageSize, setPageSize] = useState(200);
    const [jobTypes, setJobTypes] = useState([]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        fetch(`${variables.API_URL}job/types`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setJobTypes(Array.isArray(d) ? d : []))
            .catch(() => {});
    }, []);

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)  p.set('dateFrom',  filters.dateFrom);
        if (filters.dateTo)    p.set('dateTo',    filters.dateTo);
        if (filters.jobId)     p.set('jobId',     filters.jobId);
        if (filters.jobTypeId) p.set('jobTypeId', filters.jobTypeId);
        if (filters.bomStatus) p.set('bomStatus', filters.bomStatus);
        if (filters.createdBy) p.set('createdBy', filters.createdBy);
        try {
            const res  = await fetch(`${variables.API_URL}reports/bom?${p}`, { headers: authHeaders() });
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
            approved:    rows.filter(r => r.bomStatus === 'Approved').length,
            totalValue:  rows.reduce((s, r) => s + (r.totalBomValue || 0), 0),
            totalLines:  rows.reduce((s, r) => s + (r.lineCount || 0), 0),
        };
    }, [rows]);

    const currencySummary = useMemo(() => {
        if (!rows || rows.length === 0) return [];
        const map = {};
        rows.forEach(r => {
            const key = `${r.currencySymbol}|${r.jobExcRate}`;
            if (!map[key]) map[key] = {
                currency: r.currencySymbol || '—',
                rate: r.jobExcRate,
                isBase: !r.jobExcRate || r.jobExcRate === 1,
                count: 0, totalValue: 0,
            };
            map[key].count++;
            map[key].totalValue += r.totalBomValue || 0;
        });
        return Object.values(map).sort((a, b) => a.currency.localeCompare(b.currency));
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
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#d1fae5,#a7f3d0)' }}>📋</div>
                <div>
                    <div className="rpt-header-title">BOM Report</div>
                    <div className="rpt-header-sub">
                        {rows == null ? 'Set filters and click Run Report'
                            : `${rows.length} BOM${rows.length !== 1 ? 's' : ''} found`}
                    </div>
                </div>
                <div className="rpt-header-actions">
                    {rows && rows.length > 0 && (
                        <button className="rpt-btn-export" onClick={() => exportCsv(sorted)}>⬇ Export CSV</button>
                    )}
                </div>
            </div>

            {/* ── Filters ── */}
            <div className="rpt-filter-card">
                <div className="rpt-filter-row">

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Date From</span>
                        <input className="rpt-filter-input" type="date" value={filters.dateFrom}
                            onChange={e => setF('dateFrom', e.target.value)} />
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Date To</span>
                        <input className="rpt-filter-input" type="date" value={filters.dateTo}
                            onChange={e => setF('dateTo', e.target.value)} />
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Job No</span>
                        <input className="rpt-filter-input" type="text" placeholder="Job ID…"
                            value={filters.jobId}
                            onChange={e => setF('jobId', e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && runReport()} />
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Job Type</span>
                        <select className="rpt-filter-select" value={filters.jobTypeId}
                            onChange={e => setF('jobTypeId', e.target.value)}>
                            <option value="">All Types</option>
                            {jobTypes.map(t => <option key={t.jobTypeId} value={t.jobTypeId}>{t.jobTypeName}</option>)}
                        </select>
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">BOM Status</span>
                        <select className="rpt-filter-select" value={filters.bomStatus}
                            onChange={e => setF('bomStatus', e.target.value)}>
                            <option value="">All Statuses</option>
                            {getVList('Procurement', 'BOMHeaderStatus').map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
                        <div className="rpt-summary-label">Total BOMs</div>
                        <div className="rpt-summary-val">{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Approved</div>
                        <div className="rpt-summary-val green">{totals.approved}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Lines</div>
                        <div className="rpt-summary-val">{totals.totalLines}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total BOM Value</div>
                        <div className="rpt-summary-val blue">{fmt(totals.totalValue)}</div>
                    </div>
                </div>
            )}

            {/* ── Currency Breakdown ── */}
            {currencySummary.length > 0 && (
                <div className="rpt-ccy-section">
                    <div className="rpt-ccy-title">Currency Breakdown</div>
                    <table className="rpt-ccy-table">
                        <thead>
                            <tr>
                                <th>Currency</th>
                                <th className="r">Rate</th>
                                <th className="r">Count</th>
                                <th className="r">Total BOM Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currencySummary.map(g => (
                                <tr key={`${g.currency}|${g.rate}`}>
                                    <td><span className="rpt-ccy-badge">{g.currency}</span></td>
                                    <td className="r" style={{ color: '#64748b', fontSize: 11 }}>{g.isBase ? '—' : Number(g.rate).toFixed(4)}</td>
                                    <td className="r" style={{ color: '#64748b' }}>{g.count}</td>
                                    <td className="r mono" style={{ color: '#1e40af', fontWeight: 700 }}>{fmt(g.totalValue)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* ── Content ── */}
            <div className="rpt-content">

                {loading && (
                    <div className="rpt-state"><div className="rpt-spinner" /><span>Running report…</span></div>
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
                        <span>No BOMs match the selected filters.</span>
                    </div>
                )}

                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 36 }}>#</th>
                                        <Th col="jobId"        label="Job ID"          />
                                        <Th col="bomDate"      label="BOM Date"         />
                                        <Th col="bomVersion"   label="Ver"          cls="r" />
                                        <Th col="customerName" label="Customer"         />
                                        <Th col="projectName"  label="Project"          />
                                        <Th col="jobTypeName"  label="Job Type"         />
                                        <Th col="currencySymbol" label="Curr"       cls="r" />
                                        <Th col="lineCount"    label="Lines"        cls="r" />
                                        <Th col="totalBomValue" label="BOM Value"   cls="r" />
                                        <Th col="bomStatus"    label="Status"           />
                                        <Th col="bomApprovedBy" label="Approved By"     />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => (
                                        <tr key={r.bomHeaderId} onClick={() => navigate(`/jobs/${encodeURIComponent(r.jobId)}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>{rowOffset + i + 1}</td>
                                            <td>
                                                <span style={{
                                                    fontFamily: 'Courier New', fontWeight: 700,
                                                    color: '#0f766e', fontSize: 11.5,
                                                    background: '#ccfbf1', padding: '2px 8px', borderRadius: 4,
                                                }}>{r.jobId}</span>
                                            </td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.bomDate)}</td>
                                            <td className="r" style={{ color: '#64748b', fontWeight: 600 }}>v{r.bomVersion}</td>
                                            <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {r.customerName || <span className="muted">—</span>}
                                            </td>
                                            <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', color: '#475569' }}>
                                                {r.projectName || <span className="muted">—</span>}
                                            </td>
                                            <td>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: '#1e40af', background: '#dbeafe', padding: '1px 7px', borderRadius: 10 }}>
                                                    {r.jobTypeName || '—'}
                                                </span>
                                            </td>
                                            <td className="r" style={{ fontSize: 11.5, fontWeight: 700, color: r.jobExcRate && r.jobExcRate !== 1 ? '#7c3aed' : '#64748b' }}>
                                                {r.currencySymbol || '—'}
                                            </td>
                                            <td className="r" style={{ color: '#475569', fontWeight: 600 }}>{r.lineCount}</td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', fontSize: 12.5 }}>
                                                {fmt(r.totalBomValue)}
                                            </td>
                                            <td><StatusBadge status={r.bomStatus} /></td>
                                            <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.bomApprovedBy || <span className="muted">—</span>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={8} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>
                                                Totals — {totals.count} BOM{totals.count !== 1 ? 's' : ''}
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', color: '#475569' }}>{totals.totalLines}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 700 }}>{fmt(totals.totalValue)}</td>
                                            <td colSpan={2} />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        <Pagination
                            page={page} totalPages={totalPages} pageSize={pageSize}
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

export default BomReport;
