import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { fmtDate, fmt } from '../procurement/procurementConstants';
import { useLookup } from '../LookupContext';
import './Reports.css';

const today        = () => new Date().toISOString().slice(0, 10);
const firstOfYear  = () => `${new Date().getFullYear()}-01-01`;

const PAGE_SIZES = [50, 100, 200, 500, 1000];


const DEFAULT_FILTERS = {
    dateFrom:       firstOfYear(),
    dateTo:         today(),
    customerId:     '',
    jobTypeId:      '',
    jobStageId:     '',
    jobStatusId:    '',
    approvalStatus: '',
    createdBy:      '',
};

// ── Status pill ──────────────────────────────────────────────────────────
const STATUS_CFG = {
    Active:    { bg: '#dcfce7', color: '#166534' },
    'Waiting': { bg: '#fffbeb', color: '#b45309' },
    Freezed:   { bg: '#f1f5f9', color: '#475569' },
    Completed: { bg: '#dbeafe', color: '#1e40af' },
    Cancelled: { bg: '#fee2e2', color: '#dc2626' },
};
const StatusPill = ({ status }) => {
    const cfg = STATUS_CFG[status] || { bg: '#f1f5f9', color: '#64748b' };
    return (
        <span style={{
            background: cfg.bg, color: cfg.color,
            padding: '2px 9px', borderRadius: 20,
            fontSize: 10.5, fontWeight: 700,
        }}>{status}</span>
    );
};

// ── CSV export ──────────────────────────────────────────────────────────
const exportCsv = (rows) => {
    const headers = ['#', 'Job ID', 'Project Name', 'Job Date', 'Type', 'Stage', 'Customer', 'LPO Ref', 'Contract Ref', 'Status', 'Approval', 'CCY', 'Order Value', 'Actual Cost', 'BOM Value', 'Invoiced', 'Created By'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.jobId, r.projectName, r.jobDate ? fmtDate(r.jobDate) : '',
            r.jobTypeName, r.jobStageName, r.customerName,
            r.lpoRef, r.contractRef, r.jobStatusName, r.approvalStatus,
            r.currencySymbol, r.orderValue, r.totalActual, r.totalBomValue,
            r.totalInvoicing, r.jobCreatedBy,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Job_Report_${today()}.csv`; a.click();
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
const JobReport = () => {
    const navigate = useNavigate();
    const { lookups, getModuleStatuses, baseCurrencyCode } = useLookup();

    const [filters,   setFilters]  = useState({ ...DEFAULT_FILTERS });
    const [rows,      setRows]     = useState(null);
    const [loading,   setLoading]  = useState(false);
    const [error,     setError]    = useState('');
    const [sortCol,   setSortCol]  = useState('jobDate');
    const [sortDir,   setSortDir]  = useState('desc');
    const [page,      setPage]     = useState(1);
    const [pageSize,  setPageSize] = useState(200);

    const [customers, setCustomers] = useState([]);
    const [jobTypes,  setJobTypes]  = useState([]);
    const [jobStages, setJobStages] = useState([]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    // ── Load dropdowns on mount ──────────────────────────────────────────
    useEffect(() => {
        const h = authHeaders();
        fetch(`${variables.API_URL}customer/search?pageSize=500&page=1&sortCol=CustomerName&sortDir=ASC`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setCustomers(d.data || []))
            .catch(() => {});
        fetch(`${variables.API_URL}job/types`, { headers: h })
            .then(r => r.ok ? r.json() : [])
            .then(d => setJobTypes(Array.isArray(d) ? d : []))
            .catch(() => {});
        fetch(`${variables.API_URL}job/stages`, { headers: h })
            .then(r => r.ok ? r.json() : [])
            .then(d => setJobStages(Array.isArray(d) ? d : []))
            .catch(() => {});
    }, []);

    // ── Run report ───────────────────────────────────────────────────────
    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)       p.set('dateFrom',       filters.dateFrom);
        if (filters.dateTo)         p.set('dateTo',         filters.dateTo);
        if (filters.customerId)     p.set('customerId',     filters.customerId);
        if (filters.jobTypeId)      p.set('jobTypeId',      filters.jobTypeId);
        if (filters.jobStageId)     p.set('jobStageId',     filters.jobStageId);
        if (filters.jobStatusId)    p.set('jobStatusId',    filters.jobStatusId);
        if (filters.approvalStatus) p.set('approvalStatus', filters.approvalStatus);
        if (filters.createdBy)      p.set('createdBy',      filters.createdBy);
        try {
            const res  = await fetch(`${variables.API_URL}reports/job?${p}`, { headers: authHeaders() });
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
            count:              rows.length,
            active:             rows.filter(r => r.jobStatusName === 'Active').length,
            totalOrder:         rows.reduce((s, r) => s + (r.orderValue        || 0), 0),
            totalOrderBase:        rows.reduce((s, r) => s + (r.orderValueBase     || 0), 0),
            totalActual:           rows.reduce((s, r) => s + (r.totalActual        || 0), 0),
            totalInvoiced:         rows.reduce((s, r) => s + (r.totalInvoicingBase || 0), 0),
            totalPayments:         rows.reduce((s, r) => s + (r.totalPaymentsBase  || 0), 0),
            totalCredit:           rows.reduce((s, r) => s + (r.totalCreditBase    || 0), 0),
            get balanceToInvoice() { return this.totalOrderBase - this.totalInvoiced; },
            get balanceReceipts()  { return this.totalInvoiced  - (this.totalPayments + this.totalCredit); },
        };
    }, [rows]);

    const currencySummary = useMemo(() => {
        if (!rows || rows.length === 0) return [];
        const map = {};
        rows.forEach(r => {
            const ccy  = r.currencySymbol || r.currencyShort || '—';
            const rate = r.exchangeRate;
            const key  = `${ccy}|${rate}`;
            if (!map[key]) map[key] = {
                currency: ccy,
                rate,
                isBase: !rate || rate === 1,
                count: 0, orderValue: 0, orderValueBase: 0, totalActual: 0,
                totalPayments: 0, totalInvoiced: 0, totalCredit: 0,
            };
            map[key].count++;
            map[key].orderValue    += r.orderValue         || 0;
            map[key].orderValueBase+= r.orderValueBase     || 0;
            map[key].totalActual   += r.totalActual        || 0;
            map[key].totalInvoiced += r.totalInvoicingBase || 0;
            map[key].totalPayments += r.totalPaymentsBase  || 0;
            map[key].totalCredit   += r.totalCreditBase    || 0;
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
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#e0e7ff,#c7d2fe)' }}>🏗</div>
                <div>
                    <div className="rpt-header-title">Job Report</div>
                    <div className="rpt-header-sub">
                        {rows == null
                            ? 'Set filters and click Run Report'
                            : `${rows.length} job${rows.length !== 1 ? 's' : ''} found`}
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
                        <span className="rpt-filter-label">Customer</span>
                        <select className="rpt-filter-select"
                            value={filters.customerId}
                            onChange={e => setF('customerId', e.target.value)}>
                            <option value="">All Customers</option>
                            {customers.map(c => (
                                <option key={c.customerId} value={c.customerId}>{c.customerName}</option>
                            ))}
                        </select>
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Job Type</span>
                        <select className="rpt-filter-select"
                            value={filters.jobTypeId}
                            onChange={e => setF('jobTypeId', e.target.value)}>
                            <option value="">All Types</option>
                            {jobTypes.map(t => (
                                <option key={t.jobTypeId} value={t.jobTypeId}>{t.jobTypeName}</option>
                            ))}
                        </select>
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Stage</span>
                        <select className="rpt-filter-select"
                            value={filters.jobStageId}
                            onChange={e => setF('jobStageId', e.target.value)}>
                            <option value="">All Stages</option>
                            {jobStages.map(s => (
                                <option key={s.jobStageId} value={s.jobStageId}>{s.jobStageName}</option>
                            ))}
                        </select>
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Job Status</span>
                        <select className="rpt-filter-select"
                            value={filters.jobStatusId}
                            onChange={e => setF('jobStatusId', e.target.value)}>
                            <option value="">All Statuses</option>
                            {(lookups.jobStatuses || []).map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Approval</span>
                        <select className="rpt-filter-select"
                            value={filters.approvalStatus}
                            onChange={e => setF('approvalStatus', e.target.value)}>
                            <option value="">All</option>
                            {getModuleStatuses('JOB').map(s => (
                                <option key={s.statusCode} value={s.statusCode}>{s.statusLabel}</option>
                            ))}
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
                        <div className="rpt-summary-label">Total Jobs</div>
                        <div className="rpt-summary-val">{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Active</div>
                        <div className="rpt-summary-val" style={{ color: '#166534' }}>{totals.active}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Order Value</div>
                        <div className="rpt-summary-val blue">{fmt(totals.totalOrder)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Actual Cost</div>
                        <div className={`rpt-summary-val ${totals.totalActual > totals.totalOrder ? 'amber' : 'blue'}`}>
                            {fmt(totals.totalActual)}
                        </div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Invoiced</div>
                        <div className="rpt-summary-val blue">{fmt(totals.totalInvoiced)}</div>
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
                                <th className="r">Order Value</th>
                                <th className="r">Order Value ({baseCurrencyCode})</th>
                                <th className="r">Invoiced ({baseCurrencyCode})</th>
                                <th className="r">Payments ({baseCurrencyCode})</th>
                                <th className="r">Credits ({baseCurrencyCode})</th>
                                <th className="r">Bal. to Invoice</th>
                                <th className="r">Bal. Receipts</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currencySummary.map(g => {
                                const balInv = g.orderValueBase - g.totalInvoiced;
                                const balRec = g.totalInvoiced  - (g.totalPayments + g.totalCredit);
                                return (
                                <tr key={`${g.currency}|${g.rate}`}>
                                    <td><span className="rpt-ccy-badge">{g.currency}</span></td>
                                    <td className="r" style={{ color: '#64748b', fontSize: 11 }}>{g.isBase ? '—' : Number(g.rate).toFixed(4)}</td>
                                    <td className="r" style={{ color: '#64748b' }}>{g.count}</td>
                                    <td className="r mono" style={{ color: g.isBase ? '#475569' : '#7c3aed' }}>{fmt(g.orderValue)}</td>
                                    <td className="r mono" style={{ color: '#1e40af', fontWeight: 700 }}>{fmt(g.orderValueBase)}</td>
                                    <td className="r mono" style={{ color: '#1d4ed8', fontWeight: 700 }}>{fmt(g.totalInvoiced)}</td>
                                    <td className="r mono" style={{ color: '#166534', fontWeight: 600 }}>{fmt(g.totalPayments)}</td>
                                    <td className="r mono" style={{ color: '#6d28d9' }}>{fmt(g.totalCredit)}</td>
                                    <td className="r mono" style={{ color: balInv > 0 ? '#b45309' : '#475569', fontWeight: 600 }}>{fmt(balInv)}</td>
                                    <td className="r mono" style={{ color: balRec > 0 ? '#b45309' : '#475569', fontWeight: 600 }}>{fmt(balRec)}</td>
                                </tr>
                                );
                            })}
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
                        <span>No jobs match the selected filters.</span>
                    </div>
                )}

                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="jobId"        label="Job ID"         />
                                        <Th col="projectName"  label="Project Name"   />
                                        <Th col="jobDate"      label="Job Date"        />
                                        <Th col="jobTypeName"  label="Type"            />
                                        <Th col="jobStageName" label="Stage"           />
                                        <Th col="customerName" label="Customer"        />
                                        <Th col="lpoRef"       label="LPO Ref"         />
                                        <Th col="jobStatusName"  label="Status"        />
                                        <Th col="currencySymbol" label="Curr"       cls="r" />
                                        <Th col="exchangeRate"   label="Rate"       cls="r" />
                                        <Th col="orderValue"         label="Order Value"       cls="r" />
                                        <Th col="orderValueBase"     label={`Order Val (${baseCurrencyCode})`}   cls="r" />
                                        <Th col="totalInvoicingBase" label={`Invoiced (${baseCurrencyCode})`}    cls="r" />
                                        <Th col="totalPaymentsBase"  label={`Payments (${baseCurrencyCode})`}    cls="r" />
                                        <Th col="totalCreditBase"    label={`Credits (${baseCurrencyCode})`}     cls="r" />
                                        <Th col="balanceToInvoice"   label="Bal. to Invoice"   cls="r" />
                                        <Th col="balanceReceipts"    label="Bal. Receipts"     cls="r" />
                                        <Th col="totalActual"        label="Actual Cost"       cls="r" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => {
                                        const overrun        = (r.totalActual || 0) > (r.orderValue || 0) && (r.orderValue || 0) > 0;
                                        const balToInvoice   = (r.orderValueBase || 0) - (r.totalInvoicingBase || 0);
                                        const balReceipts    = (r.totalInvoicingBase || 0) - ((r.totalPaymentsBase || 0) + (r.totalCreditBase || 0));
                                        return (
                                            <tr key={r.jobNumId} onClick={() => navigate(`/jobs/${r.jobId}`)}>
                                                <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                                                    {rowOffset + i + 1}
                                                </td>
                                                <td>
                                                    <span style={{
                                                        fontFamily: 'Courier New', fontWeight: 700,
                                                        color: '#4338ca', fontSize: 11.5,
                                                        background: '#e0e7ff', padding: '2px 8px', borderRadius: 4,
                                                    }}>{r.jobId}</span>
                                                    {r.parentJobId && (
                                                        <span style={{ marginLeft: 5, fontSize: 10, color: '#94a3b8' }}>
                                                            ↳ {r.parentJobId}
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 500 }}>
                                                    {r.projectName || <span className="muted">—</span>}
                                                </td>
                                                <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.jobDate)}</td>
                                                <td>
                                                    <span style={{
                                                        fontSize: 11, fontWeight: 600,
                                                        color: '#1e40af', background: '#dbeafe',
                                                        padding: '1px 7px', borderRadius: 10,
                                                    }}>{r.jobTypeName || '—'}</span>
                                                </td>
                                                <td style={{ fontSize: 11.5, color: '#475569' }}>
                                                    {r.jobStageName || <span className="muted">—</span>}
                                                </td>
                                                <td style={{ fontSize: 12, maxWidth: 170, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {r.customerName || <span className="muted">—</span>}
                                                </td>
                                                <td style={{ fontSize: 11.5, color: '#64748b', fontFamily: 'Courier New' }}>
                                                    {r.lpoRef || <span className="muted" style={{ fontFamily: 'inherit' }}>—</span>}
                                                </td>
                                                <td>
                                                    <StatusPill status={r.jobStatusName} />
                                                </td>
                                                <td className="r" style={{ fontSize: 11.5, fontWeight: 700, color: r.exchangeRate && r.exchangeRate !== 1 ? '#7c3aed' : '#64748b' }}>
                                                    {r.currencySymbol || r.currencyShort || '—'}
                                                </td>
                                                <td className="r" style={{ fontSize: 11, color: '#94a3b8' }}>
                                                    {r.exchangeRate && r.exchangeRate !== 1 ? Number(r.exchangeRate).toFixed(4) : <span className="muted">—</span>}
                                                </td>
                                                <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: r.exchangeRate && r.exchangeRate !== 1 ? '#7c3aed' : '#1e40af', fontSize: 12.5 }}>
                                                    {fmt(r.orderValue)}
                                                </td>
                                                <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', fontSize: 12.5 }}>
                                                    {fmt(r.orderValueBase)}
                                                </td>
                                                <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8', fontSize: 12.5 }}>
                                                    {fmt(r.totalInvoicingBase)}
                                                </td>
                                                <td className="r" style={{ fontFamily: 'monospace', color: '#166534', fontSize: 12 }}>
                                                    {fmt(r.totalPaymentsBase)}
                                                </td>
                                                <td className="r" style={{ fontFamily: 'monospace', color: '#6d28d9', fontSize: 12 }}>
                                                    {fmt(r.totalCreditBase)}
                                                </td>
                                                <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: balToInvoice > 0 ? '#b45309' : '#475569', fontSize: 12 }}>
                                                    {fmt(balToInvoice)}
                                                </td>
                                                <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: balReceipts > 0 ? '#b45309' : '#475569', fontSize: 12 }}>
                                                    {fmt(balReceipts)}
                                                </td>
                                                <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: overrun ? '#b45309' : '#475569', fontSize: 12.5 }}>
                                                    {fmt(r.totalActual)}
                                                    {overrun && <span style={{ marginLeft: 4, fontSize: 9, verticalAlign: 'middle' }}>⚠</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={11} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>
                                                Totals — {totals.count} job{totals.count !== 1 ? 's' : ''}
                                            </td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#475569' }}>{fmt(totals.totalOrder)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 700 }}>{fmt(totals.totalOrderBase)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1d4ed8', fontWeight: 700 }}>{fmt(totals.totalInvoiced)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#166534' }}>{fmt(totals.totalPayments)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#6d28d9' }}>{fmt(totals.totalCredit)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: totals.balanceToInvoice > 0 ? '#b45309' : '#475569', fontWeight: 700 }}>{fmt(totals.balanceToInvoice)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: totals.balanceReceipts > 0 ? '#b45309' : '#475569', fontWeight: 700 }}>{fmt(totals.balanceReceipts)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: totals.totalActual > totals.totalOrder ? '#b45309' : '#475569' }}>{fmt(totals.totalActual)}</td>
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

export default JobReport;
