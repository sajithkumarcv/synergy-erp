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
const exportCsv = (rows, baseCcy) => {
    const base = baseCcy || 'Base';
    const headers = ['#', 'SRV No', 'Date', 'Supplier', 'PO Number', 'Job',
        'Status', 'Currency', 'Rate', 'Lines', 'Total Cost', `Total Cost (${base})`, 'Created By'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.srvNo, r.srvDate ? fmtDate(r.srvDate) : '',
            r.supplierName, r.poNumber, r.jobId,
            r.status, r.currencyShort, r.exchangeRate,
            r.lineCount, r.totalCost, r.totalCostBase, r.createdBy,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `SRV_Report_${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
};

// ── Status badge ────────────────────────────────────────────────────────
const StatusBadge = ({ status, getStatusConfig }) => {
    const cfg = statusBadgeCfg(getStatusConfig('SRV', status));
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

// ═══════════════════════════════════════════════════════════════════════
const SrvReport = () => {
    const navigate            = useNavigate();
    const { getStatusConfig, getModuleStatuses, baseCurrencyCode } = useLookup();

    const [filters,   setFilters]  = useState({ ...DEFAULT_FILTERS });
    const [rows,      setRows]     = useState(null);
    const [loading,   setLoading]  = useState(false);
    const [error,     setError]    = useState('');
    const [sortCol,   setSortCol]  = useState('srvDate');
    const [sortDir,   setSortDir]  = useState('desc');
    const [page,      setPage]     = useState(1);
    const [pageSize,  setPageSize] = useState(200);

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
            const res  = await fetch(`${variables.API_URL}reports/srv?${p}`, { headers: authHeaders() });
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
            count:         rows.length,
            totalCostBase: rows.reduce((s, r) => s + (r.totalCostBase || 0), 0),
        };
    }, [rows]);

    const currencySummary = useMemo(() => {
        if (!rows || rows.length === 0) return [];
        const map = {};
        rows.forEach(r => {
            const key = `${r.currencyShort}|${r.exchangeRate}`;
            if (!map[key]) map[key] = {
                currency: r.currencyShort || '—',
                rate: r.exchangeRate,
                isBase: !r.exchangeRate || r.exchangeRate === 1,
                count: 0, totalCost: 0, totalCostBase: 0,
            };
            map[key].count++;
            map[key].totalCost     += r.totalCost     || 0;
            map[key].totalCostBase += r.totalCostBase || 0;
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
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#ede9fe,#ddd6fe)' }}>🔧</div>
                <div>
                    <div className="rpt-header-title">Service Receipt Report</div>
                    <div className="rpt-header-sub">
                        {rows == null
                            ? 'Set filters and click Run Report'
                            : `${rows.length} service receipt${rows.length !== 1 ? 's' : ''} found`}
                    </div>
                </div>
                <div className="rpt-header-actions">
                    {rows && rows.length > 0 && (
                        <button className="rpt-btn-export" onClick={() => exportCsv(sorted, rows?.[0]?.baseCurrency)}>
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
                            {getModuleStatuses('SRV').map(s =>
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
                        <div className="rpt-summary-label">Total SRVs</div>
                        <div className="rpt-summary-val">{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Cost ({baseCurrencyCode})</div>
                        <div className="rpt-summary-val blue">{fmt(totals.totalCostBase)}</div>
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
                                <th className="r">Total Cost</th>
                                <th className="r">Total Cost ({baseCurrencyCode})</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currencySummary.map(g => (
                                <tr key={`${g.currency}|${g.rate}`}>
                                    <td><span className="rpt-ccy-badge">{g.currency}</span></td>
                                    <td className="r" style={{ color: '#64748b', fontSize: 11 }}>{g.isBase ? '—' : Number(g.rate).toFixed(4)}</td>
                                    <td className="r" style={{ color: '#64748b' }}>{g.count}</td>
                                    <td className="r mono" style={{ color: g.isBase ? '#475569' : '#7c3aed' }}>{fmt(g.totalCost)}</td>
                                    <td className="r mono" style={{ color: '#5b21b6', fontWeight: 700 }}>{fmt(g.totalCostBase)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
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
                        <span>No service receipts match the selected filters.</span>
                    </div>
                )}

                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="srvNo"       label="SRV No"       />
                                        <Th col="srvDate"     label="Date"          />
                                        <Th col="supplierName" label="Supplier"     />
                                        <Th col="poNumber"    label="PO Number"     />
                                        <Th col="jobId"       label="Job"           />
                                        <Th col="status"      label="Status"        />
                                        <Th col="currencyShort" label="Curr"              cls="r" />
                                        <Th col="exchangeRate"  label="Rate"              cls="r" />
                                        <Th col="lineCount"     label="Lines"             cls="r" />
                                        <Th col="totalCost"     label="Total Cost"        cls="r" />
                                        <Th col="totalCostBase" label={`Total Cost (${baseCurrencyCode})`}  cls="r" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => (
                                        <tr key={r.srvId} onClick={() => navigate(`/service-receipts/${r.srvId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                                                {rowOffset + i + 1}
                                            </td>
                                            <td>
                                                <span style={{
                                                    fontFamily: 'Courier New', fontWeight: 700,
                                                    color: '#5b21b6', fontSize: 11.5,
                                                    background: '#ede9fe', padding: '2px 8px', borderRadius: 4,
                                                }}>{r.srvNo}</span>
                                            </td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.srvDate)}</td>
                                            <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {r.supplierName || <span className="muted">—</span>}
                                            </td>
                                            <td style={{ fontFamily: 'Courier New', fontSize: 11.5, color: '#475569' }}>
                                                {r.poNumber || <span className="muted">—</span>}
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
                                            <td className="r" style={{ fontSize: 11.5, fontWeight: 700, color: r.exchangeRate && r.exchangeRate !== 1 ? '#7c3aed' : '#64748b' }}>
                                                {r.currencyShort || '—'}
                                            </td>
                                            <td className="r" style={{ fontSize: 11, color: '#94a3b8' }}>
                                                {r.exchangeRate && r.exchangeRate !== 1 ? Number(r.exchangeRate).toFixed(4) : <span className="muted">—</span>}
                                            </td>
                                            <td className="r" style={{ color: '#475569', fontWeight: 600 }}>
                                                {r.lineCount}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: r.exchangeRate && r.exchangeRate !== 1 ? '#7c3aed' : '#5b21b6', fontSize: 12 }}>
                                                {fmt(r.totalCost)}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#5b21b6', fontSize: 12.5 }}>
                                                {fmt(r.totalCostBase)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={9} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>
                                                Totals — {totals.count} SRV{totals.count !== 1 ? 's' : ''}
                                            </td>
                                            <td />
                                            <td />
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#5b21b6', fontWeight: 700 }}>{fmt(totals.totalCostBase)}</td>
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
            </div>
        </div>
    );
};

export default SrvReport;
