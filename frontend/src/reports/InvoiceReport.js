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
    dateFrom:   firstOfMonth(),
    dateTo:     today(),
    customerId: '',
    jobId:      '',
    status:     '',
};

// ── CSV export ──────────────────────────────────────────────────────────
const exportCsv = (rows, baseCcy) => {
    const base = baseCcy || 'Base';
    const headers = ['#','Invoice No','Date','Due Date','Customer','Job','Curr','Rate',
        `Sub Total`,`Tax`,`Total`,
        `Sub Total (${base})`,`Tax (${base})`,`Total (${base})`,
        `Receipt (${base})`,`Balance (${base})`,
        'Status','LPO No'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.invoiceNo, r.invoiceDate ? fmtDate(r.invoiceDate) : '',
            r.dueDate ? fmtDate(r.dueDate) : '',
            r.customerName, r.jobId, r.currencyShort, r.exchangeRate,
            r.subTotal, r.taxAmount, r.totalAmount,
            r.subTotalBase, r.taxAmountBase, r.totalAmountBase,
            r.paidBase, r.balanceBase,
            r.status, r.lpoNo,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Invoice_Report_${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
};

// ── Status badge ────────────────────────────────────────────────────────
const StatusBadge = ({ status, getStatusConfig }) => {
    const cfg = statusBadgeCfg(getStatusConfig('INV', status));
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
const InvoiceReport = () => {
    const navigate            = useNavigate();
    const { getStatusConfig, getModuleStatuses } = useLookup();

    const [filters,   setFilters]  = useState({ ...DEFAULT_FILTERS });
    const [rows,      setRows]     = useState(null);
    const [loading,   setLoading]  = useState(false);
    const [error,     setError]    = useState('');
    const [sortCol,   setSortCol]  = useState('invoiceDate');
    const [sortDir,   setSortDir]  = useState('desc');
    const [page,      setPage]     = useState(1);
    const [pageSize,  setPageSize] = useState(20);

    const [customers, setCustomers] = useState([]);
    const [jobs,      setJobs]      = useState([]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    useEffect(() => {
        const h = authHeaders();
        fetch(`${variables.API_URL}customer/search?pageSize=500&page=1`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setCustomers((d.data || []).sort((a, b) => a.customerName.localeCompare(b.customerName))))
            .catch(() => {});
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&approvalStatus=Approved`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setJobs(d.data || []))
            .catch(() => {});
    }, []);

    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)   p.set('dateFrom',   filters.dateFrom);
        if (filters.dateTo)     p.set('dateTo',     filters.dateTo);
        if (filters.customerId) p.set('customerId', filters.customerId);
        if (filters.jobId)      p.set('jobId',      filters.jobId);
        if (filters.status)     p.set('status',     filters.status);
        try {
            const res  = await fetch(`${variables.API_URL}reports/invoice?${p}`, { headers: authHeaders() });
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

    const baseCcy = rows?.[0]?.baseCurrency || '';

    const totals = useMemo(() => {
        if (!rows || rows.length === 0) return null;
        return {
            count:          rows.length,
            subTotalBase:   rows.reduce((s, r) => s + (r.subTotalBase    || 0), 0),
            taxAmountBase:  rows.reduce((s, r) => s + (r.taxAmountBase   || 0), 0),
            totalAmountBase:rows.reduce((s, r) => s + (r.totalAmountBase || 0), 0),
            paidBase:       rows.reduce((s, r) => s + (r.paidBase        || 0), 0),
            balanceBase:    rows.reduce((s, r) => s + (r.balanceBase     || 0), 0),
        };
    }, [rows]);

    const currencySummary = useMemo(() => {
        if (!rows || rows.length === 0) return [];
        const map = {};
        rows.forEach(r => {
            const key = `${r.currencyShort}|${r.exchangeRate}`;
            if (!map[key]) map[key] = {
                currency: r.currencyShort || '',
                rate: r.exchangeRate,
                isBase: !r.exchangeRate || r.exchangeRate === 1,
                count: 0, total: 0, totalBase: 0, paidBase: 0, balanceBase: 0,
            };
            map[key].count++;
            map[key].total       += r.totalAmount     || 0;
            map[key].totalBase   += r.totalAmountBase || 0;
            map[key].paidBase    += r.paidBase        || 0;
            map[key].balanceBase += r.balanceBase     || 0;
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
                <div className="rpt-header-icon" style={{ background: 'linear-gradient(135deg,#dbeafe,#bfdbfe)' }}>🧾</div>
                <div>
                    <div className="rpt-header-title">Customer Invoice Report</div>
                    <div className="rpt-header-sub">
                        {rows == null
                            ? 'Set filters and click Run Report'
                            : `${rows.length} Invoice${rows.length !== 1 ? 's' : ''} found`}
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
                            {getModuleStatuses('INV').map(s =>
                                <option key={s.statusCode} value={s.statusCode}>{s.statusLabel}</option>
                            )}
                        </select>
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
                        <div className="rpt-summary-label">Total Invoices</div>
                        <div className="rpt-summary-val">{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total ({baseCcy})</div>
                        <div className="rpt-summary-val blue">{fmt(totals.totalAmountBase)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Receipt ({baseCcy})</div>
                        <div className="rpt-summary-val green">{fmt(totals.paidBase)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Balance ({baseCcy})</div>
                        <div className={`rpt-summary-val ${totals.balanceBase > 0 ? 'amber' : ''}`}>{fmt(totals.balanceBase)}</div>
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
                                <th className="r">Inv Total</th>
                                <th className="r">Inv Total ({baseCcy})</th>
                                <th className="r">Receipt ({baseCcy})</th>
                                <th className="r">Balance ({baseCcy})</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currencySummary.map(g => (
                                <tr key={`${g.currency}|${g.rate}`}>
                                    <td><span className="rpt-ccy-badge">{g.currency}</span></td>
                                    <td className="r" style={{ color: '#64748b', fontSize: 11 }}>{g.isBase ? '—' : Number(g.rate).toFixed(4)}</td>
                                    <td className="r" style={{ color: '#64748b' }}>{g.count}</td>
                                    <td className="r mono" style={{ color: g.isBase ? '#475569' : '#7c3aed' }}>{fmt(g.total)}</td>
                                    <td className="r mono" style={{ color: '#1d4ed8', fontWeight: 700 }}>{fmt(g.totalBase)}</td>
                                    <td className="r mono" style={{ color: '#16a34a', fontWeight: 600 }}>{fmt(g.paidBase)}</td>
                                    <td className="r mono" style={{ color: g.balanceBase > 0 ? '#b45309' : '#475569', fontWeight: 700 }}>{fmt(g.balanceBase)}</td>
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
                        <span>No invoices match the selected filters.</span>
                    </div>
                )}

                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 36 }}>#</th>
                                        <Th col="invoiceNo"       label="Invoice No"         />
                                        <Th col="invoiceDate"     label="Date"               />
                                        <Th col="dueDate"         label="Due Date"           />
                                        <Th col="customerName"    label="Customer"           />
                                        <Th col="jobId"           label="Job"                />
                                        <Th col="currencyShort"   label="Curr"           cls="r" />
                                        <Th col="exchangeRate"    label="Rate"           cls="r" />
                                        <Th col="totalAmount"     label="Inv Amt"        cls="r" />
                                        <Th col="totalAmountBase" label={`Inv Amt (${baseCcy})`} cls="r" />
                                        <Th col="paidBase"        label={`Receipt (${baseCcy})`} cls="r" />
                                        <Th col="balanceBase"     label={`Balance (${baseCcy})`} cls="r" />
                                        <Th col="status"          label="Status"             />
                                        <Th col="lpoNo"           label="LPO No"             />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => {
                                        const isForeign = r.exchangeRate && r.exchangeRate !== 1;
                                        return (
                                        <tr key={r.invoiceId} onClick={() => navigate(`/invoices/${r.invoiceId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                                                {rowOffset + i + 1}
                                            </td>
                                            <td>
                                                <span style={{
                                                    fontFamily: 'Courier New', fontWeight: 700,
                                                    color: '#1d4ed8', fontSize: 11.5,
                                                    background: '#dbeafe', padding: '2px 8px', borderRadius: 4,
                                                }}>{r.invoiceNo}</span>
                                            </td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.invoiceDate)}</td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{r.dueDate ? fmtDate(r.dueDate) : <span className="muted">—</span>}</td>
                                            <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {r.customerName || <span className="muted">—</span>}
                                            </td>
                                            <td>
                                                {r.jobId
                                                    ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#0f766e', background: '#ccfbf1', padding: '2px 6px', borderRadius: 4 }}>{r.jobId}</span>
                                                    : <span className="muted">—</span>}
                                            </td>
                                            <td className="r" style={{ fontSize: 11.5, fontWeight: 700, color: isForeign ? '#7c3aed' : '#64748b' }}>{r.currencyShort}</td>
                                            <td className="r" style={{ fontSize: 11, color: '#94a3b8' }}>
                                                {isForeign ? Number(r.exchangeRate).toFixed(4) : <span className="muted">—</span>}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: isForeign ? '#7c3aed' : '#475569', fontSize: 12 }}>
                                                {fmt(r.totalAmount)}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1d4ed8', fontSize: 12.5 }}>
                                                {fmt(r.totalAmountBase)}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: '#16a34a', fontWeight: 600, fontSize: 12 }}>
                                                {fmt(r.paidBase)}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: (r.balanceBase || 0) > 0 ? '#b45309' : '#475569', fontSize: 12.5 }}>
                                                {fmt(r.balanceBase)}
                                            </td>
                                            <td><StatusBadge status={r.status} getStatusConfig={getStatusConfig} /></td>
                                            <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.lpoNo || <span className="muted">—</span>}</td>
                                        </tr>
                                        );
                                    })}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={8} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>
                                                Page totals ({baseCcy}) — {totals.count} record{totals.count !== 1 ? 's' : ''}
                                            </td>
                                            <td />
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1d4ed8' }}>{fmt(totals.totalAmountBase)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#16a34a' }}>{fmt(totals.paidBase)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#b45309' }}>{fmt(totals.balanceBase)}</td>
                                            <td colSpan={2} />
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

export default InvoiceReport;
