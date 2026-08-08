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
    dateFrom:   firstOfMonth(),
    dateTo:     today(),
    supplierId: '',
    status:     '',
    jobId:       '',
    createdBy:   '',
    approvedBy:  '',
    submittedBy: '',
    priority:    '',
    grnFilter:   '',   // '' = all | 'NONE' = no GRN | 'ONLY' = has GRN
};

// ── CSV export ──────────────────────────────────────────────────────────
const exportCsv = (rows, baseCcy) => {
    const base = baseCcy || 'Base';
    const headers = ['#', 'PO Number', 'Date', 'Vendor', 'Job', 'Status', 'Priority',
        'Currency', 'Rate', `Amount`, `Amount (${base})`, `Received (${base})`, 'Created By', 'Submitted By', 'Approved By'];
    const esc = v => {
        if (v == null) return '';
        const s = String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [
        headers.join(','),
        ...rows.map((r, i) => [
            i + 1, r.poNumber, r.poDate ? fmtDate(r.poDate) : '',
            r.vendorName, r.jobId, r.status, r.priority,
            r.currencyShort, r.exchangeRate, r.totalAmount, r.totalAmountBase, r.receivedAmountBase,
            r.createdBy, r.submittedBy, r.approvedBy,
        ].map(esc).join(','))
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `PO_Report_${today()}.csv`; a.click();
    URL.revokeObjectURL(url);
};

// ── Status badge ────────────────────────────────────────────────────────
const StatusBadge = ({ status, getStatusConfig }) => {
    const cfg = statusBadgeCfg(getStatusConfig('PO', status));
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
const PoReport = () => {
    const navigate            = useNavigate();
    const { getStatusConfig, getModuleStatuses, getVList, baseCurrencyCode } = useLookup();

    const [filters,   setFilters]  = useState({ ...DEFAULT_FILTERS });
    const [rows,      setRows]     = useState(null);
    const [loading,   setLoading]  = useState(false);
    const [error,     setError]    = useState('');
    const [sortCol,   setSortCol]  = useState('poDate');
    const [sortDir,   setSortDir]  = useState('desc');
    const [page,      setPage]     = useState(1);
    const [pageSize,  setPageSize] = useState(200);

    // dropdown data
    const [suppliers, setSuppliers] = useState([]);
    const [jobs,      setJobs]      = useState([]);

    const setF = (k, v) => setFilters(f => ({ ...f, [k]: v }));

    // ── Load dropdown data on mount ──────────────────────────────────────
    useEffect(() => {
        const h = authHeaders();
        // suppliers
        fetch(`${variables.API_URL}supplier/search?pageSize=500&page=1`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setSuppliers((d.data || []).sort((a, b) => a.supplierName.localeCompare(b.supplierName))))
            .catch(() => {});
        // jobs
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1&sortCol=JobId&sortDir=ASC&approvalStatus=Approved`, { headers: h })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => setJobs(d.data || []))
            .catch(() => {});
    }, []);

    // ── Run report ───────────────────────────────────────────────────────
    const runReport = useCallback(async () => {
        setLoading(true); setError(''); setPage(1);
        const p = new URLSearchParams();
        if (filters.dateFrom)   p.set('dateFrom',   filters.dateFrom);
        if (filters.dateTo)     p.set('dateTo',     filters.dateTo);
        if (filters.supplierId) p.set('supplierId', filters.supplierId);
        if (filters.status)     p.set('status',     filters.status);
        if (filters.jobId)      p.set('jobId',      filters.jobId);
        if (filters.createdBy)   p.set('createdBy',   filters.createdBy);
        if (filters.approvedBy)  p.set('approvedBy',  filters.approvedBy);
        if (filters.submittedBy) p.set('submittedBy', filters.submittedBy);
        if (filters.priority)    p.set('priority',    filters.priority);
        if (filters.grnFilter)   p.set('grnFilter',   filters.grnFilter);
        try {
            const res  = await fetch(`${variables.API_URL}reports/po?${p}`, { headers: authHeaders() });
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
            totalAmountBase:    rows.reduce((s, r) => s + (r.totalAmountBase    || 0), 0),
            receivedAmountBase: rows.reduce((s, r) => s + (r.receivedAmountBase || 0), 0),
            noGrn:              rows.filter(r => r.grnCount === 0).length,
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
                count: 0, totalAmount: 0, totalAmountBase: 0, receivedAmountBase: 0,
            };
            map[key].count++;
            map[key].totalAmount        += r.totalAmount        || 0;
            map[key].totalAmountBase    += r.totalAmountBase    || 0;
            map[key].receivedAmountBase += r.receivedAmountBase || 0;
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
                <div className="rpt-header-icon">📄</div>
                <div>
                    <div className="rpt-header-title">Purchase Order Report</div>
                    <div className="rpt-header-sub">
                        {rows == null
                            ? 'Set filters and click Run Report'
                            : `${rows.length} purchase order${rows.length !== 1 ? 's' : ''} found`}
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

                    <div className="rpt-filter-group w160">
                        <span className="rpt-filter-label">Status</span>
                        <select className="rpt-filter-select"
                            value={filters.status}
                            onChange={e => setF('status', e.target.value)}>
                            <option value="">All Statuses</option>
                            {getModuleStatuses('PO').map(s =>
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

                    <div className="rpt-filter-group wflex">
                        <span className="rpt-filter-label">Approved By</span>
                        <input className="rpt-filter-input" type="text" placeholder="Username…"
                            value={filters.approvedBy}
                            onChange={e => setF('approvedBy', e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && runReport()} />
                    </div>

                    <div className="rpt-filter-group wflex">
                        <span className="rpt-filter-label">Submitted By</span>
                        <input className="rpt-filter-input" type="text" placeholder="Username…"
                            value={filters.submittedBy}
                            onChange={e => setF('submittedBy', e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && runReport()} />
                    </div>

                    <div className="rpt-filter-group">
                        <span className="rpt-filter-label">GRN</span>
                        <div className="rpt-toggle">
                            <button className={`rpt-toggle-btn ${filters.grnFilter === '' ? 'active' : ''}`}
                                onClick={() => setF('grnFilter', '')}>All POs</button>
                            <button className={`rpt-toggle-btn ${filters.grnFilter === 'NONE' ? 'active' : ''}`}
                                onClick={() => setF('grnFilter', 'NONE')}>No GRN</button>
                            <button className={`rpt-toggle-btn ${filters.grnFilter === 'ONLY' ? 'active' : ''}`}
                                onClick={() => setF('grnFilter', 'ONLY')}>Only GRN</button>
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
                        <div className="rpt-summary-label">Total POs</div>
                        <div className="rpt-summary-val">{totals.count}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Total Amount ({baseCurrencyCode})</div>
                        <div className="rpt-summary-val blue">{fmt(totals.totalAmountBase)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Received ({baseCurrencyCode})</div>
                        <div className="rpt-summary-val green">{fmt(totals.receivedAmountBase)}</div>
                    </div>
                    <div className="rpt-summary-item">
                        <div className="rpt-summary-label">Pending GRN</div>
                        <div className={`rpt-summary-val ${totals.noGrn > 0 ? 'amber' : ''}`}>{totals.noGrn}</div>
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
                                <th className="r">Amount</th>
                                <th className="r">Amount ({baseCurrencyCode})</th>
                                <th className="r">Received ({baseCurrencyCode})</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currencySummary.map(g => (
                                <tr key={`${g.currency}|${g.rate}`}>
                                    <td><span className="rpt-ccy-badge">{g.currency}</span></td>
                                    <td className="r" style={{ color: '#64748b', fontSize: 11 }}>{g.isBase ? '—' : Number(g.rate).toFixed(4)}</td>
                                    <td className="r" style={{ color: '#64748b' }}>{g.count}</td>
                                    <td className="r mono" style={{ color: g.isBase ? '#475569' : '#7c3aed' }}>{fmt(g.totalAmount)}</td>
                                    <td className="r mono" style={{ color: '#1e40af', fontWeight: 700 }}>{fmt(g.totalAmountBase)}</td>
                                    <td className="r mono" style={{ color: '#166534', fontWeight: 600 }}>{fmt(g.receivedAmountBase)}</td>
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
                        <span>No purchase orders match the selected filters.</span>
                    </div>
                )}

                {!loading && paged.length > 0 && (
                    <>
                        <div className="rpt-body">
                            <table className="rpt-table">
                                <thead>
                                    <tr>
                                        <th className="c" style={{ width: 46 }}>#</th>
                                        <Th col="poNumber"      label="PO Number"  />
                                        <Th col="poDate"        label="Date"        />
                                        <Th col="vendorName"    label="Vendor"      />
                                        <Th col="jobId"         label="Job"         />
                                        <Th col="status"        label="Status"      />
                                        <Th col="priority"      label="Priority"    />
                                        <Th col="currencyShort"      label="Curr"            cls="r" />
                                        <Th col="exchangeRate"       label="Rate"            cls="r" />
                                        <Th col="totalAmount"        label="Amount"          cls="r" />
                                        <Th col="totalAmountBase"    label={`Amount (${baseCurrencyCode})`}    cls="r" />
                                        <Th col="receivedAmountBase" label={`Received (${baseCurrencyCode})`}  cls="r" />
                                        <Th col="createdBy"          label="Created By"  />
                                        <Th col="approvedBy"         label="Approved By" />
                                    </tr>
                                </thead>
                                <tbody>
                                    {paged.map((r, i) => (
                                        <tr key={r.poId} onClick={() => navigate(`/purchase-orders/${r.poId}`)}>
                                            <td className="c" style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600 }}>
                                                {rowOffset + i + 1}
                                            </td>
                                            <td>
                                                <span style={{
                                                    fontFamily: 'Courier New', fontWeight: 700,
                                                    color: '#1e40af', fontSize: 11.5,
                                                    background: '#dbeafe', padding: '2px 8px', borderRadius: 4,
                                                }}>{r.poNumber}</span>
                                            </td>
                                            <td style={{ color: '#475569', fontSize: 12 }}>{fmtDate(r.poDate)}</td>
                                            <td style={{ maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {r.vendorName || <span className="muted">—</span>}
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
                                            <td className="r" style={{ fontSize: 11.5, fontWeight: 700, color: r.exchangeRate && r.exchangeRate !== 1 ? '#7c3aed' : '#64748b' }}>
                                                {r.currencyShort || '—'}
                                            </td>
                                            <td className="r" style={{ fontSize: 11, color: '#94a3b8' }}>
                                                {r.exchangeRate && r.exchangeRate !== 1 ? Number(r.exchangeRate).toFixed(4) : <span className="muted">—</span>}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: r.exchangeRate && r.exchangeRate !== 1 ? '#7c3aed' : '#475569', fontSize: 12 }}>
                                                {fmt(r.totalAmount)}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', fontSize: 12.5 }}>
                                                {fmt(r.totalAmountBase)}
                                            </td>
                                            <td className="r" style={{ fontFamily: 'monospace', color: '#166534', fontSize: 12 }}>
                                                {fmt(r.receivedAmountBase)}
                                            </td>
                                            <td style={{ fontSize: 11.5, color: '#64748b' }}>
                                                {r.createdBy || <span className="muted">—</span>}
                                            </td>
                                            <td style={{ fontSize: 11.5, color: '#166534', fontWeight: 600 }}>
                                                {r.approvedBy || <span className="muted">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                {totals && (
                                    <tfoot>
                                        <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1', fontWeight: 700 }}>
                                            <td colSpan={9} style={{ textAlign: 'right', padding: '8px 10px', color: '#334155', fontSize: 12 }}>
                                                Totals — {totals.count} PO{totals.count !== 1 ? 's' : ''}
                                            </td>
                                            <td />
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#1e40af', fontWeight: 700 }}>{fmt(totals.totalAmountBase)}</td>
                                            <td style={{ textAlign: 'right', padding: '8px 6px', fontFamily: 'monospace', color: '#166534' }}>{fmt(totals.receivedAmountBase)}</td>
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

export default PoReport;
