import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useFilters } from '../FilterContext';
import { useLookup } from '../LookupContext';
import '../receivables/Receivables.css';
import '../procurement/Procurement.css';

const fmt = (n) => (n == null ? '0.00' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

const PAGE_SIZES = [10, 20, 50];

const AGING_COLORS = {
    current: '#22c55e',
    d0_30:   '#f59e0b',
    d31_60:  '#f97316',
    d61_90:  '#ef4444',
    d90plus: '#7f1d1d',
};

const SortIcon = ({ col, sortCol, sortDir }) =>
    sortCol !== col
        ? <span className="recv-sort-none">⇅</span>
        : <span className="recv-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;

// ── SVG Bar Chart: Monthly Invoice vs Payment ─────────────────────────────
const MonthlyChart = ({ data }) => {
    if (!data || data.length === 0) return <div className="recv-empty">No data</div>;

    const W = 560, H = 180, PL = 60, PR = 10, PT = 10, PB = 40;
    const chartW = W - PL - PR;
    const chartH = H - PT - PB;
    const maxVal = Math.max(...data.flatMap(d => [d.invoiceAmount, d.paymentAmount]), 1);
    const barW   = Math.floor(chartW / data.length * 0.35);
    const gap    = chartW / data.length;

    const yLabels = [0, 0.25, 0.5, 0.75, 1].map(pct => ({
        val: maxVal * pct,
        y:   PT + chartH * (1 - pct),
    }));

    return (
        <svg className="recv-svg-chart" viewBox={`0 0 ${W} ${H}`}>
            {yLabels.map(({ val, y }, i) => (
                <g key={i}>
                    <line x1={PL} y1={y} x2={W - PR} y2={y}
                          stroke="#f1f5f9" strokeWidth={i === 0 ? 1.5 : 1} />
                    <text x={PL - 5} y={y + 3.5} textAnchor="end" fontSize={9} fill="#94a3b8">
                        {val >= 1000000 ? `${(val / 1000000).toFixed(1)}M`
                            : val >= 1000 ? `${(val / 1000).toFixed(0)}K`
                            : val.toFixed(0)}
                    </text>
                </g>
            ))}

            {data.map((d, i) => {
                const cx = PL + gap * i + gap / 2;
                const iH = Math.max((d.invoiceAmount  / maxVal) * chartH, 1);
                const pH = Math.max((d.paymentAmount  / maxVal) * chartH, 1);
                return (
                    <g key={i}>
                        <rect x={cx - barW - 1} y={PT + chartH - iH} width={barW} height={iH}
                              fill="#f97316" rx={2} opacity={0.85} />
                        <rect x={cx + 1} y={PT + chartH - pH} width={barW} height={pH}
                              fill="#14b8a6" rx={2} opacity={0.85} />
                        <text x={cx} y={H - PT + 6} textAnchor="middle" fontSize={9} fill="#94a3b8">
                            {d.monthLabel}
                        </text>
                    </g>
                );
            })}

            <line x1={PL} y1={PT} x2={PL} y2={PT + chartH} stroke="#e2e8f0" strokeWidth={1} />
            <line x1={PL} y1={PT + chartH} x2={W - PR} y2={PT + chartH} stroke="#e2e8f0" strokeWidth={1} />
        </svg>
    );
};

// ── SVG Bar Chart: Top Overdue Suppliers ─────────────────────────────────
const OverdueSupplierChart = ({ data }) => {
    if (!data || data.length === 0) return <div className="recv-empty">No overdue suppliers</div>;

    const items = data.slice(0, 8);
    const W = 540, rowH = 26, PL = 140, PR = 80, PY = 8;
    const H = rowH * items.length + PY * 2;
    const maxVal = Math.max(...items.map(d => d.overdueAmountBase), 1);
    const barAreaW = W - PL - PR;

    return (
        <svg className="recv-svg-chart" viewBox={`0 0 ${W} ${H}`}>
            {items.map((d, i) => {
                const y  = PY + rowH * i;
                const bW = Math.max((d.overdueAmountBase / maxVal) * barAreaW, 2);
                return (
                    <g key={i}>
                        <text x={PL - 6} y={y + rowH / 2 + 4} textAnchor="end" fontSize={10.5} fill="#475569">
                            {d.supplierName.length > 18 ? d.supplierName.slice(0, 17) + '…' : d.supplierName}
                        </text>
                        <rect x={PL} y={y + 4} width={barAreaW} height={rowH - 8} fill="#f1f5f9" rx={3} />
                        <rect x={PL} y={y + 4} width={bW} height={rowH - 8} fill="#ef4444" rx={3} opacity={0.85} />
                        <text x={PL + bW + 5} y={y + rowH / 2 + 4} fontSize={10} fill="#475569">
                            {d.overdueAmountBase >= 1000000
                                ? `${(d.overdueAmountBase / 1000000).toFixed(2)}M`
                                : d.overdueAmountBase >= 1000
                                ? `${(d.overdueAmountBase / 1000).toFixed(1)}K`
                                : fmt(d.overdueAmountBase)}
                        </text>
                    </g>
                );
            })}
        </svg>
    );
};

// ── Aging Stacked Bar ─────────────────────────────────────────────────────
const AgingStackedBar = ({ aging }) => {
    if (!aging) return null;

    const total = aging.currentAmount + aging.amount0_30 + aging.amount31_60 +
                  aging.amount61_90 + aging.amount90Plus;
    if (total <= 0) return <div className="recv-empty">No outstanding payables</div>;

    const pct = (val) => `${((val / total) * 100).toFixed(1)}%`;
    const segments = [
        { key: 'current', color: AGING_COLORS.current, label: 'Current',    val: aging.currentAmount },
        { key: 'd0_30',   color: AGING_COLORS.d0_30,   label: '0–30 Days',  val: aging.amount0_30 },
        { key: 'd31_60',  color: AGING_COLORS.d31_60,  label: '31–60 Days', val: aging.amount31_60 },
        { key: 'd61_90',  color: AGING_COLORS.d61_90,  label: '61–90 Days', val: aging.amount61_90 },
        { key: 'd90plus', color: AGING_COLORS.d90plus, label: '90+ Days',   val: aging.amount90Plus },
    ].filter(s => s.val > 0);

    return (
        <div className="recv-aging-bar-wrap">
            <div className="recv-aging-bar" title={`Total: ${fmt(total)}`}>
                {segments.map(s => (
                    <div key={s.key} className="recv-aging-seg"
                         style={{ flex: s.val, background: s.color }}
                         title={`${s.label}: ${fmt(s.val)}`}>
                        {(s.val / total) > 0.08 ? pct(s.val) : ''}
                    </div>
                ))}
            </div>
            <div className="recv-aging-legend">
                {segments.map(s => (
                    <div key={s.key} className="recv-aging-legend-item">
                        <div className="recv-aging-dot" style={{ background: s.color }} />
                        <span>{s.label}: <strong>{fmt(s.val)}</strong></span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ── Outstanding Trend Chart ───────────────────────────────────────────────
const OutstandingTrendChart = ({ data }) => {
    if (!data || data.length === 0) return <div className="recv-empty">No data</div>;

    let running = 0;
    const trendData = data.map(d => {
        running += d.invoiceAmount - d.paymentAmount;
        return { ...d, outstanding: Math.max(running, 0) };
    });

    const W = 560, H = 160, PL = 60, PR = 10, PT = 10, PB = 36;
    const chartW = W - PL - PR;
    const chartH = H - PT - PB;
    const maxVal = Math.max(...trendData.map(d => d.outstanding), 1);
    const n = trendData.length;

    const xPos = (i) => PL + (i / (n - 1 || 1)) * chartW;
    const yPos = (v) => PT + chartH - (v / maxVal) * chartH;

    const pathD = trendData.map((d, i) =>
        `${i === 0 ? 'M' : 'L'} ${xPos(i)} ${yPos(d.outstanding)}`
    ).join(' ');
    const areaD = `${pathD} L ${xPos(n - 1)} ${PT + chartH} L ${xPos(0)} ${PT + chartH} Z`;

    return (
        <svg className="recv-svg-chart" viewBox={`0 0 ${W} ${H}`}>
            <defs>
                <linearGradient id="payab-trend-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor="#f97316" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0.03" />
                </linearGradient>
            </defs>

            {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const y   = PT + chartH * (1 - pct);
                const val = maxVal * pct;
                return (
                    <g key={i}>
                        <line x1={PL} y1={y} x2={W - PR} y2={y}
                              stroke="#f1f5f9" strokeWidth={i === 0 ? 1.5 : 1} />
                        <text x={PL - 5} y={y + 3.5} textAnchor="end" fontSize={9} fill="#94a3b8">
                            {val >= 1000000 ? `${(val / 1000000).toFixed(1)}M`
                                : val >= 1000 ? `${(val / 1000).toFixed(0)}K`
                                : val.toFixed(0)}
                        </text>
                    </g>
                );
            })}

            <path d={areaD} fill="url(#payab-trend-grad)" />
            <path d={pathD} fill="none" stroke="#f97316" strokeWidth={2} strokeLinejoin="round" />
            {trendData.map((d, i) => (
                <circle key={i} cx={xPos(i)} cy={yPos(d.outstanding)} r={3}
                        fill="#f97316" stroke="#fff" strokeWidth={1.5} />
            ))}
            {trendData.map((d, i) => (
                <text key={i} x={xPos(i)} y={H - PT + 4} textAnchor="middle" fontSize={9} fill="#94a3b8">
                    {d.monthLabel}
                </text>
            ))}

            <line x1={PL} y1={PT} x2={PL} y2={PT + chartH} stroke="#e2e8f0" />
            <line x1={PL} y1={PT + chartH} x2={W - PR} y2={PT + chartH} stroke="#e2e8f0" />
        </svg>
    );
};

// ── Dashboard Tab ─────────────────────────────────────────────────────────
const DashboardTab = ({ filters }) => {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(false);
    const [error,   setError]   = useState('');

    const load = useCallback(() => {
        setLoading(true); setError('');
        const q = new URLSearchParams();
        if (filters.supplierId) q.set('supplierId', filters.supplierId);
        if (filters.currencyId) q.set('currencyId', filters.currencyId);
        if (filters.dateFrom)   q.set('dateFrom',   filters.dateFrom);
        if (filters.dateTo)     q.set('dateTo',     filters.dateTo);
        fetch(`${variables.API_URL}payables/dashboard?${q}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d => setData(d))
            .catch(() => setError('Failed to load dashboard.'))
            .finally(() => setLoading(false));
    }, [filters]);

    useEffect(() => { load(); }, [load]);

    if (loading) return <div className="recv-spinner"><div className="recv-spinner-ring" /><span>Loading…</span></div>;
    if (error)   return <div className="recv-error">⚠ {error}</div>;
    if (!data)   return null;

    const { kpi, aging, monthly, topOverdue } = data;

    return (
        <>
            {/* KPI Cards */}
            <div className="recv-kpi-row">
                <div className="recv-kpi-card">
                    <div className="recv-kpi-label">Total Payables</div>
                    <div className="recv-kpi-value">{fmt(kpi.totalPayablesBase)}</div>
                    <div className="recv-kpi-sub">Base Currency</div>
                </div>
                <div className="recv-kpi-card">
                    <div className="recv-kpi-label">Overdue Amount</div>
                    <div className={`recv-kpi-value ${kpi.overdueAmount > 0 ? 'danger' : ''}`}>
                        {fmt(kpi.overdueAmount)}
                    </div>
                    <div className="recv-kpi-sub">Past due date</div>
                </div>
                <div className="recv-kpi-card">
                    <div className="recv-kpi-label">Suppliers with Outstanding</div>
                    <div className="recv-kpi-value">{kpi.totalSuppliers}</div>
                    <div className="recv-kpi-sub">Active suppliers</div>
                </div>
                <div className="recv-kpi-card">
                    <div className="recv-kpi-label">Invoices Outstanding</div>
                    <div className="recv-kpi-value">{kpi.totalInvoices}</div>
                    <div className="recv-kpi-sub">Unpaid + partially paid</div>
                </div>
            </div>

            {/* Aging bar */}
            <div className="recv-charts-grid">
                <div className="recv-chart-card full">
                    <div className="recv-chart-title">
                        Payables Aging
                        <span className="recv-chart-sub">Outstanding amounts by age bucket · Base Currency</span>
                    </div>
                    <AgingStackedBar aging={aging} />
                </div>
            </div>

            {/* Monthly + trend */}
            <div className="recv-charts-grid">
                <div className="recv-chart-card">
                    <div className="recv-chart-title">
                        Monthly Invoice vs Payment
                        <span className="recv-chart-sub">Last 12 months</span>
                    </div>
                    <MonthlyChart data={monthly} />
                    <div className="recv-legend">
                        <div className="recv-legend-item"><div className="recv-legend-dot" style={{ background: '#f97316' }} /><span>Invoice Amount</span></div>
                        <div className="recv-legend-item"><div className="recv-legend-dot" style={{ background: '#14b8a6' }} /><span>Payment Amount</span></div>
                    </div>
                </div>
                <div className="recv-chart-card">
                    <div className="recv-chart-title">
                        Supplier Outstanding Trend
                        <span className="recv-chart-sub">Running balance · Last 12 months</span>
                    </div>
                    <OutstandingTrendChart data={monthly} />
                    <div className="recv-legend">
                        <div className="recv-legend-item"><div className="recv-legend-dot" style={{ background: '#f97316' }} /><span>Outstanding Balance</span></div>
                    </div>
                </div>
            </div>

            {/* Top overdue */}
            <div className="recv-charts-grid">
                <div className="recv-chart-card full">
                    <div className="recv-chart-title">
                        Overdue Payables by Supplier
                        <span className="recv-chart-sub">Top 8 overdue · Base Currency</span>
                    </div>
                    <OverdueSupplierChart data={topOverdue} />
                </div>
            </div>
        </>
    );
};

// ── Supplier Summary Tab ──────────────────────────────────────────────────
const DEFAULT_FILTERS = { searchText: '', status: '', currencyId: '', dateFrom: '', dateTo: '' };

const SuppliersTab = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters } = useFilters();
    const { lookups } = useLookup();
    const currencies = lookups.currencies || [];

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(20);
    const [sortCol,    setSortCol]   = useState('TotalPendingBase');
    const [sortDir,    setSortDir]   = useState('DESC');
    const [applied,    setApplied]   = useState({ ...DEFAULT_FILTERS });
    const [listError,  setListError] = useState('');

    const gridRef = useRef({ pageSize: 20, sortCol: 'TotalPendingBase', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true); setListError('');
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText) q.set('searchText', af.searchText);
        if (af.status)     q.set('status',     af.status);
        if (af.currencyId) q.set('currencyId', af.currencyId);
        if (af.dateFrom)   q.set('dateFrom',   af.dateFrom);
        if (af.dateTo)     q.set('dateTo',     af.dateTo);
        fetch(`${variables.API_URL}payables/suppliers?${q}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`Server error (${r.status})`); return r.json(); })
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(e => setListError(e.message || 'Failed to load.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, 20, 'TotalPendingBase', 'DESC', DEFAULT_FILTERS); }, [load]);

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1); load(1, ps, sc, sd, vals);
        };
        const defs = {
            searchText: { label: 'Supplier',     type: 'text',   placeholder: 'Supplier name or code…' },
            status:     { label: 'Status',        type: 'select', placeholder: 'All',
                          options: [{ value: 'Unpaid', label: 'Unpaid' }, { value: 'PartiallyPaid', label: 'Partially Paid' }] },
            currencyId: { label: 'Currency',      type: 'select', placeholder: 'All Currencies',
                          options: currencies.map(c => ({ value: String(c.id), label: c.shortName })) },
            dateFrom:   { label: 'Invoice From',  type: 'date' },
            dateTo:     { label: 'Invoice To',    type: 'date' },
        };
        registerFilters('payables-suppliers', defs, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('payables-suppliers');
    }, [currencies]); // eslint-disable-line

    const handleSort = (col) => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1); load(1, pageSize, col, dir, applied);
    };
    const goPage         = (p)  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = (ps) => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

    const Th = ({ col, children, right, width }) => (
        <th className="sortable"
            onClick={() => handleSort(col)}
            style={{ textAlign: right ? 'right' : 'left', width: width || undefined, whiteSpace: 'nowrap' }}>
            <div className="po-th-inner" style={right ? { justifyContent: 'flex-end' } : undefined}>
                {children}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
            </div>
        </th>
    );

    const pageNums = () => {
        const range = 5;
        let start = Math.max(1, page - Math.floor(range / 2));
        let end   = Math.min(totalPages, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    return (
        <div className="recv-grid-wrap">
            <div className="recv-grid-header">
                <div>
                    <div className="recv-grid-title">Supplier Payables</div>
                    <div className="recv-grid-sub">{totalRows} supplier{totalRows !== 1 ? 's' : ''} with outstanding balance</div>
                </div>
                <div className="recv-toolbar">
                    <select className="recv-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                </div>
            </div>

            {listError && <div className="recv-error" style={{ margin: '0 16px 10px' }}>⚠ {listError}</div>}

            <div className="recv-table-wrap">
                {loading && <div className="recv-loading-overlay"><div className="recv-spinner"><div className="recv-spinner-ring" /></div></div>}
                <table className={`recv-table${loading ? ' tbl-loading' : ''}`}>
                    <colgroup>
                        <col />
                        <col style={{ width: 76 }} />
                        <col style={{ width: 68 }} />
                        <col style={{ width: 68 }} />
                        <col style={{ width: 155 }} />
                        <col style={{ width: 155 }} />
                        <col style={{ width: 140 }} />
                        <col style={{ width: 140 }} />
                        <col style={{ width: 70 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <Th col="SupplierName">Supplier</Th>
                            <Th col="TotalInvoiceCount"      right>Invoices</Th>
                            <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Unpaid</th>
                            <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Partial</th>
                            <Th col="TotalInvoiceAmountBase" right>Invoice Amt</Th>
                            <Th col="TotalPaidAmountBase"    right>Paid Amt</Th>
                            <Th col="TotalPendingBase"       right>Pending (Base)</Th>
                            <Th col="OverdueAmountBase"      right>Overdue (Base)</Th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && !loading ? (
                            <tr><td colSpan={9} className="recv-empty">No suppliers with outstanding balance found.</td></tr>
                        ) : rows.map(r => (
                            <tr key={r.supplierId}>
                                <td>
                                    <span className="recv-num-link" onClick={() => navigate(`/payables/supplier/${r.supplierId}`)}>
                                        {r.supplierName}
                                    </span>
                                    {r.supplierCode && <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 5 }}>{r.supplierCode}</span>}
                                </td>
                                <td className="num-cell">{r.totalInvoiceCount}</td>
                                <td className="num-cell" style={{ color: r.unpaidCount > 0 ? '#dc2626' : '#94a3b8' }}>
                                    {r.unpaidCount > 0 ? r.unpaidCount : '—'}
                                </td>
                                <td className="num-cell" style={{ color: r.partiallyPaidCount > 0 ? '#d97706' : '#94a3b8' }}>
                                    {r.partiallyPaidCount > 0 ? r.partiallyPaidCount : '—'}
                                </td>
                                <td style={{ textAlign: 'right', lineHeight: 1.5 }}>
                                    {r.invoiceCurrencyShort && r.invoiceCurrencyShort !== 'Multi' ? (
                                        <div style={{ fontWeight: 500, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>
                                            {fmt(r.totalInvoiceAmount)}
                                            <span style={{ fontSize: 10.5, color: '#64748b', marginLeft: 4 }}>{r.invoiceCurrencyShort}</span>
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: 10.5, color: '#94a3b8', fontStyle: 'italic' }}>Multi-currency</div>
                                    )}
                                    <div style={{ fontSize: 11, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                                        {fmt(r.totalInvoiceAmountBase)}
                                    </div>
                                </td>
                                <td style={{ textAlign: 'right', lineHeight: 1.5 }}>
                                    {r.totalPaidAmountBase > 0 ? (
                                        <>
                                            {r.invoiceCurrencyShort && r.invoiceCurrencyShort !== 'Multi' ? (
                                                <div style={{ fontWeight: 500, color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>
                                                    {fmt(r.totalPaidAmount)}
                                                    <span style={{ fontSize: 10.5, color: '#64748b', marginLeft: 4 }}>{r.invoiceCurrencyShort}</span>
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: 10.5, color: '#94a3b8', fontStyle: 'italic' }}>Multi-currency</div>
                                            )}
                                            <div style={{ fontSize: 11, color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                                                {fmt(r.totalPaidAmountBase)}
                                            </div>
                                        </>
                                    ) : <span style={{ color: '#94a3b8' }}>—</span>}
                                </td>
                                <td className="num-cell" style={{ fontWeight: 600, color: '#1e293b' }}>{fmt(r.totalPendingBase)}</td>
                                <td className="num-cell" style={{ color: r.overdueAmountBase > 0 ? '#dc2626' : '#94a3b8', fontWeight: r.overdueAmountBase > 0 ? 600 : 400 }}>
                                    {r.overdueAmountBase > 0 ? fmt(r.overdueAmountBase) : '—'}
                                </td>
                                <td>
                                    <button className="recv-btn-view" onClick={() => navigate(`/payables/supplier/${r.supplierId}`)}>
                                        View
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {rows.length > 0 && (() => {
                        const groupByCcy = (amtKey, ccyKey) => {
                            const g = {};
                            rows.forEach(r => {
                                const ccy = r[ccyKey];
                                if (!ccy || ccy === 'Multi') return;
                                g[ccy] = (g[ccy] || 0) + (Number(r[amtKey]) || 0);
                            });
                            return Object.entries(g);
                        };
                        const invByCcy   = groupByCcy('totalInvoiceAmount', 'invoiceCurrencyShort');
                        const paidByCcy  = groupByCcy('totalPaidAmount',    'invoiceCurrencyShort');
                        const totInvBase  = rows.reduce((s, r) => s + (r.totalInvoiceAmountBase || 0), 0);
                        const totPaidBase = rows.reduce((s, r) => s + (r.totalPaidAmountBase    || 0), 0);
                        const totPending  = rows.reduce((s, r) => s + (r.totalPendingBase       || 0), 0);
                        const totOverdue  = rows.reduce((s, r) => s + (r.overdueAmountBase      || 0), 0);
                        const totInvoices = rows.reduce((s, r) => s + (r.totalInvoiceCount      || 0), 0);
                        const totUnpaid   = rows.reduce((s, r) => s + (r.unpaidCount            || 0), 0);
                        const totPartial  = rows.reduce((s, r) => s + (r.partiallyPaidCount     || 0), 0);

                        const CcyCell = ({ entries, baseTotal, color = '#1e293b' }) => (
                            <td style={{ textAlign: 'right', padding: '9px 12px', lineHeight: 1.6 }}>
                                {entries.length === 0 ? (
                                    // All rows are multi-currency — base total is the only meaningful sum
                                    <div style={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{fmt(baseTotal)}</div>
                                ) : (
                                    <>
                                        {entries.map(([ccy, amt]) => (
                                            <div key={ccy} style={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                                                {fmt(amt)}<span style={{ fontSize: 10.5, color: '#64748b', marginLeft: 4 }}>{ccy}</span>
                                            </div>
                                        ))}
                                        {/* Always show base total — avoids silent cross-currency summing */}
                                        <div style={{ fontSize: 11, color: '#94a3b8', borderTop: '1px dashed #e2e8f0', paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                                            {fmt(baseTotal)} <span style={{ fontSize: 10 }}>base</span>
                                        </div>
                                    </>
                                )}
                            </td>
                        );

                        return (
                            <tfoot>
                                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                                    <td style={{ padding: '9px 12px', fontWeight: 700, fontSize: 12, color: '#374151' }}>
                                        Page Total
                                        <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>
                                            ({rows.length} of {totalRows} suppliers)
                                        </span>
                                    </td>
                                    <td className="num-cell" style={{ fontWeight: 700 }}>{totInvoices}</td>
                                    <td className="num-cell" style={{ fontWeight: 700, color: totUnpaid  > 0 ? '#dc2626' : '#94a3b8' }}>{totUnpaid  > 0 ? totUnpaid  : '—'}</td>
                                    <td className="num-cell" style={{ fontWeight: 700, color: totPartial > 0 ? '#d97706' : '#94a3b8' }}>{totPartial > 0 ? totPartial : '—'}</td>
                                    <CcyCell entries={invByCcy}  baseTotal={totInvBase} />
                                    <CcyCell entries={paidByCcy} baseTotal={totPaidBase} color="#0f766e" />
                                    <td className="num-cell" style={{ fontWeight: 700, color: '#1e293b' }}>{fmt(totPending)}</td>
                                    <td className="num-cell" style={{ fontWeight: 700, color: totOverdue > 0 ? '#dc2626' : '#94a3b8' }}>
                                        {totOverdue > 0 ? fmt(totOverdue) : '—'}
                                    </td>
                                    <td />
                                </tr>
                            </tfoot>
                        );
                    })()}
                </table>
            </div>

            <div className="recv-pagination">
                <div>Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows} total</div>
                <div className="recv-page-controls">
                    <button className="recv-page-btn" onClick={() => goPage(1)} disabled={page === 1}>«</button>
                    <button className="recv-page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
                    {pageNums().map(n => (
                        <button key={n} className={`recv-page-btn${n === page ? ' active' : ''}`} onClick={() => goPage(n)}>{n}</button>
                    ))}
                    <button className="recv-page-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
                    <button className="recv-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                </div>
            </div>
        </div>
    );
};

// ── Aging Analysis Tab ────────────────────────────────────────────────────
const AgingTab = () => {
    const navigate  = useNavigate();
    const [rows,       setRows]     = useState([]);
    const [loading,    setLoading]  = useState(false);
    const [totalRows,  setTotal]    = useState(0);
    const [totalPages, setPages]    = useState(1);
    const [page,       setPage]     = useState(1);
    const [pageSize,   setPageSize] = useState(20);
    const [sortCol,    setSortCol]  = useState('Total');
    const [sortDir,    setSortDir]  = useState('DESC');
    const [search,     setSearch]   = useState('');
    const [error,      setError]    = useState('');

    const load = useCallback((pg, ps, sc, sd, q) => {
        setLoading(true); setError('');
        const params = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (q) params.set('searchText', q);
        fetch(`${variables.API_URL}payables/aging?${params}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(() => setError('Failed to load aging data.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, 20, 'Total', 'DESC', ''); }, [load]);

    const handleSort = (col) => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1); load(1, pageSize, col, dir, search);
    };
    const goPage         = (p)  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, search); };
    const changePageSize = (ps) => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, search); };
    const applySearch    = ()   => { setPage(1); load(1, pageSize, sortCol, sortDir, search); };

    const pageNums = () => {
        const range = 5;
        let start = Math.max(1, page - Math.floor(range / 2));
        let end   = Math.min(totalPages, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    const Th = ({ col, children, right }) => (
        <th className="sortable"
            style={{ textAlign: right ? 'right' : 'left', whiteSpace: 'nowrap' }}
            onClick={() => handleSort(col)}>
            <div className="po-th-inner" style={right ? { justifyContent: 'flex-end' } : undefined}>
                {children}<SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
            </div>
        </th>
    );

    const agingColor = (val, tier) => {
        if (!val || val <= 0) return '#94a3b8';
        return ['#22c55e', '#f59e0b', '#f97316', '#ef4444', '#7f1d1d'][tier] || '#1e293b';
    };

    return (
        <div className="recv-grid-wrap">
            <div className="recv-grid-header">
                <div>
                    <div className="recv-grid-title">Aging Analysis</div>
                    <div className="recv-grid-sub">{totalRows} supplier{totalRows !== 1 ? 's' : ''} · Base Currency</div>
                </div>
                <div className="recv-toolbar">
                    <input
                        style={{ padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 12.5, width: 200 }}
                        placeholder="Search supplier…"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && applySearch()}
                    />
                    <button className="recv-btn-view" onClick={applySearch}>Search</button>
                    <select className="recv-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                </div>
            </div>

            {error && <div className="recv-error" style={{ margin: '0 16px 10px' }}>⚠ {error}</div>}

            <div className="recv-table-wrap">
                {loading && <div className="recv-loading-overlay"><div className="recv-spinner"><div className="recv-spinner-ring" /></div></div>}
                <table className={`recv-table${loading ? ' tbl-loading' : ''}`}>
                    <colgroup>
                        <col />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 130 }} />
                        <col style={{ width: 70 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <Th col="SupplierName">Supplier</Th>
                            <Th col="Current"    right><span style={{ color: AGING_COLORS.current }}>Current</span></Th>
                            <Th col="Days0_30"   right><span style={{ color: AGING_COLORS.d0_30 }}>0–30 Days</span></Th>
                            <Th col="Days31_60"  right><span style={{ color: AGING_COLORS.d31_60 }}>31–60 Days</span></Th>
                            <Th col="Days61_90"  right><span style={{ color: AGING_COLORS.d61_90 }}>61–90 Days</span></Th>
                            <Th col="Days90Plus" right><span style={{ color: AGING_COLORS.d90plus }}>90+ Days</span></Th>
                            <Th col="Total"      right>Total</Th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && !loading ? (
                            <tr><td colSpan={8} className="recv-empty">No aging data found.</td></tr>
                        ) : rows.map(r => (
                            <tr key={r.supplierId}>
                                <td>
                                    <span className="recv-num-link" onClick={() => navigate(`/payables/supplier/${r.supplierId}`)}>
                                        {r.supplierName}
                                    </span>
                                </td>
                                <td className="num-cell" style={{ color: agingColor(r.current, 0) }}>{r.current > 0 ? fmt(r.current) : '—'}</td>
                                <td className="num-cell" style={{ color: agingColor(r.days0_30, 1) }}>{r.days0_30 > 0 ? fmt(r.days0_30) : '—'}</td>
                                <td className="num-cell" style={{ color: agingColor(r.days31_60, 2) }}>{r.days31_60 > 0 ? fmt(r.days31_60) : '—'}</td>
                                <td className="num-cell" style={{ color: agingColor(r.days61_90, 3) }}>{r.days61_90 > 0 ? fmt(r.days61_90) : '—'}</td>
                                <td className="num-cell" style={{ color: agingColor(r.days90Plus, 4), fontWeight: r.days90Plus > 0 ? 700 : 400 }}>
                                    {r.days90Plus > 0 ? fmt(r.days90Plus) : '—'}
                                </td>
                                <td className="num-cell" style={{ fontWeight: 600, color: '#1e293b' }}>{fmt(r.total)}</td>
                                <td>
                                    <button className="recv-btn-view" onClick={() => navigate(`/payables/supplier/${r.supplierId}`)}>View</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {rows.length > 0 && (() => {
                        const totCurrent = rows.reduce((s, r) => s + (r.current    || 0), 0);
                        const tot0_30    = rows.reduce((s, r) => s + (r.days0_30   || 0), 0);
                        const tot31_60   = rows.reduce((s, r) => s + (r.days31_60  || 0), 0);
                        const tot61_90   = rows.reduce((s, r) => s + (r.days61_90  || 0), 0);
                        const tot90Plus  = rows.reduce((s, r) => s + (r.days90Plus || 0), 0);
                        const totTotal   = rows.reduce((s, r) => s + (r.total      || 0), 0);
                        return (
                            <tfoot>
                                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                                    <td style={{ padding: '9px 12px', fontWeight: 700, fontSize: 12, color: '#374151' }}>
                                        Page Total
                                        <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>
                                            ({rows.length} of {totalRows} suppliers)
                                        </span>
                                    </td>
                                    <td className="num-cell" style={{ fontWeight: 700, color: AGING_COLORS.current }}>{fmt(totCurrent)}</td>
                                    <td className="num-cell" style={{ fontWeight: 700, color: tot0_30  > 0 ? AGING_COLORS.d0_30   : '#94a3b8' }}>{tot0_30  > 0 ? fmt(tot0_30)  : '—'}</td>
                                    <td className="num-cell" style={{ fontWeight: 700, color: tot31_60 > 0 ? AGING_COLORS.d31_60  : '#94a3b8' }}>{tot31_60 > 0 ? fmt(tot31_60) : '—'}</td>
                                    <td className="num-cell" style={{ fontWeight: 700, color: tot61_90 > 0 ? AGING_COLORS.d61_90  : '#94a3b8' }}>{tot61_90 > 0 ? fmt(tot61_90) : '—'}</td>
                                    <td className="num-cell" style={{ fontWeight: 700, color: tot90Plus > 0 ? AGING_COLORS.d90plus : '#94a3b8' }}>{tot90Plus > 0 ? fmt(tot90Plus) : '—'}</td>
                                    <td className="num-cell" style={{ fontWeight: 700, color: '#1e293b' }}>{fmt(totTotal)}</td>
                                    <td />
                                </tr>
                            </tfoot>
                        );
                    })()}
                </table>
            </div>

            <div className="recv-pagination">
                <div>Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows} total</div>
                <div className="recv-page-controls">
                    <button className="recv-page-btn" onClick={() => goPage(1)} disabled={page === 1}>«</button>
                    <button className="recv-page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
                    {pageNums().map(n => (
                        <button key={n} className={`recv-page-btn${n === page ? ' active' : ''}`} onClick={() => goPage(n)}>{n}</button>
                    ))}
                    <button className="recv-page-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
                    <button className="recv-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                </div>
            </div>
        </div>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────
const TABS = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'suppliers', label: 'Supplier Summary' },
    { key: 'aging',     label: 'Aging Analysis' },
];

const Payables = () => {
    const [tab, setTab] = useState('dashboard');

    return (
        <div className="recv-page">
            <div className="recv-tabs">
                {TABS.map(t => (
                    <button key={t.key}
                            className={`recv-tab${tab === t.key ? ' active' : ''}`}
                            onClick={() => setTab(t.key)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'dashboard' && <DashboardTab filters={{}} />}
            {tab === 'suppliers' && <SuppliersTab />}
            {tab === 'aging'     && <AgingTab />}
        </div>
    );
};

export default Payables;
