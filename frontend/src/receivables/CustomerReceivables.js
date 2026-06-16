import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useFilters } from '../FilterContext';
import { useLookup } from '../LookupContext';
import './Receivables.css';
import '../procurement/Procurement.css';

const fmt     = (n) => (n == null ? '0.00' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const PAGE_SIZES = [20, 50, 100];

const PAYMENT_STATUS_CFG = {
    Unpaid:       { bg: '#fff7ed', color: '#c2410c', dot: '#f97316', label: 'Unpaid' },
    PartiallyPaid:{ bg: '#fef9c3', color: '#854d0e', dot: '#eab308', label: 'Partially Paid' },
};

const StatusBadge = ({ s }) => {
    const c = PAYMENT_STATUS_CFG[s] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: s };
    return (
        <span className="recv-badge" style={{ background: c.bg, color: c.color }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, display: 'inline-block', marginRight: 1 }} />
            {c.label}
        </span>
    );
};

const SortIcon = ({ col, sortCol, sortDir }) =>
    sortCol !== col
        ? <span className="recv-sort-none">⇅</span>
        : <span className="recv-sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;

// ── Allocation rows (inline expanded under invoice) ───────────────────────
const AllocationRows = ({ invoiceId }) => {
    const [rows,    setRows]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        fetch(`${variables.API_URL}receivables/invoice-allocations/${invoiceId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d  => setRows(d))
            .catch(() => setError('Failed to load allocations.'))
            .finally(() => setLoading(false));
    }, [invoiceId]);

    if (loading) return (
        <tr><td colSpan={12} style={{ padding: '8px 36px', background: '#f0f9ff', fontSize: 12, color: '#64748b' }}>
            Loading allocations…
        </td></tr>
    );

    if (error) return (
        <tr><td colSpan={12} style={{ padding: '8px 36px', background: '#fff1f2', color: '#991b1b', fontSize: 12 }}>
            ⚠ {error}
        </td></tr>
    );

    if (!rows || rows.length === 0) return (
        <tr><td colSpan={12} style={{ padding: '8px 36px', background: '#f0f9ff', fontSize: 12, color: '#94a3b8' }}>
            No receipt allocations for this invoice.
        </td></tr>
    );

    return (
        <>
            <tr className="recv-alloc-header">
                <td colSpan={12}>
                    <span style={{ paddingLeft: 24 }}>Receipt / CN Allocation History</span>
                </td>
            </tr>
            {rows.map(a => (
                <tr key={a.allocationId} className="recv-alloc-row">
                    <td colSpan={2} style={{ paddingLeft: 36 }}>
                        <span style={{ fontWeight: 600, color: '#0369a1' }}>{a.rvNumber}</span>
                        {a.sourceType === 'CN' && (
                            <span style={{ marginLeft: 6, fontSize: 10, background: '#ede9fe', color: '#6d28d9', borderRadius: 3, padding: '1px 5px' }}>Credit Note</span>
                        )}
                    </td>
                    <td>{fmtDate(a.rvDate)}</td>
                    <td />
                    <td>{a.rvCurrencyShort || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(a.rvExchangeRate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginRight: 3 }}>{a.invoiceCurrencyShort}</span>
                        {fmt(a.allocatedAmount)}
                    </td>
                    <td style={{ textAlign: 'right', color: '#0f766e' }}>{fmt(a.allocatedAmountBase)}</td>
                    <td colSpan={2}>{a.createdBy || '—'}</td>
                    <td colSpan={2} style={{ color: '#94a3b8' }}>{fmtDate(a.createdDate)}</td>
                </tr>
            ))}
        </>
    );
};

// ── Invoice Tab ───────────────────────────────────────────────────────────
const DEFAULT_INV_FILTERS = { invoiceNo: '', jobId: '', status: '', dateFrom: '', dateTo: '', dueDateFrom: '', dueDateTo: '' };

const InvoicesTab = ({ customerId, currencies }) => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters } = useFilters();

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(20);
    const [sortCol,    setSortCol]   = useState('InvoiceDate');
    const [sortDir,    setSortDir]   = useState('DESC');
    const [applied,    setApplied]   = useState({ ...DEFAULT_INV_FILTERS });
    const [expanded,   setExpanded]  = useState({}); // invoiceId → bool
    const [error,      setError]     = useState('');

    const gridRef = useRef({ pageSize: 20, sortCol: 'InvoiceDate', sortDir: 'DESC', applied: DEFAULT_INV_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true); setError('');
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.invoiceNo)   q.set('invoiceNo',   af.invoiceNo);
        if (af.jobId)       q.set('jobId',       af.jobId);
        if (af.status)      q.set('status',      af.status);
        if (af.currencyId)  q.set('currencyId',  af.currencyId);
        if (af.dateFrom)    q.set('dateFrom',    af.dateFrom);
        if (af.dateTo)      q.set('dateTo',      af.dateTo);
        if (af.dueDateFrom) q.set('dueDateFrom', af.dueDateFrom);
        if (af.dueDateTo)   q.set('dueDateTo',   af.dueDateTo);
        fetch(`${variables.API_URL}receivables/customer-invoices/${customerId}?${q}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`Server error (${r.status})`); return r.json(); })
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(e => setError(e.message || 'Failed to load invoices.'))
            .finally(() => setLoading(false));
    }, [customerId]);

    useEffect(() => { load(1, 20, 'InvoiceDate', 'DESC', DEFAULT_INV_FILTERS); }, [load]);

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1); load(1, ps, sc, sd, vals);
        };
        const defs = {
            invoiceNo:  { label: 'Invoice No',  type: 'text',   placeholder: 'INV-…' },
            jobId:      { label: 'Job No',       type: 'text',   placeholder: 'Job number…' },
            status:     { label: 'Status',        type: 'select', placeholder: 'All',
                          options: [{ value: 'Unpaid', label: 'Unpaid' }, { value: 'PartiallyPaid', label: 'Partially Paid' }] },
            currencyId: { label: 'Currency',      type: 'select', placeholder: 'All',
                          options: currencies.map(c => ({ value: String(c.id), label: c.shortName })) },
            dateFrom:   { label: 'Invoice From',  type: 'date' },
            dateTo:     { label: 'Invoice To',    type: 'date' },
            dueDateFrom:{ label: 'Due Date From', type: 'date' },
            dueDateTo:  { label: 'Due Date To',   type: 'date' },
        };
        registerFilters(`recv-inv-${customerId}`, defs, DEFAULT_INV_FILTERS, onApply);
        return () => unregisterFilters(`recv-inv-${customerId}`);
    }, [currencies, customerId]); // eslint-disable-line

    const handleSort = (col) => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1); load(1, pageSize, col, dir, applied);
    };
    const goPage         = (p)  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = (ps) => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };
    const toggleExpand   = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

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

    return (
        <div className="recv-grid-wrap" style={{ border: 'none', boxShadow: 'none' }}>
            <div className="recv-grid-header" style={{ padding: '10px 0', border: 'none' }}>
                <div>
                    <div className="recv-grid-sub">{totalRows} invoice{totalRows !== 1 ? 's' : ''} outstanding</div>
                </div>
                <div className="recv-toolbar">
                    <select className="recv-select" value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                        {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                    </select>
                </div>
            </div>

            {error && <div className="recv-error">⚠ {error}</div>}

            <div className="recv-table-wrap">
                {loading && <div className="recv-loading-overlay"><div className="recv-spinner"><div className="recv-spinner-ring" /></div></div>}
                <table className={`recv-table${loading ? ' tbl-loading' : ''}`}>
                    <colgroup>
                        <col style={{ width: 32 }} />    {/* Expand */}
                        <col style={{ width: 120 }} />   {/* Invoice No */}
                        <col style={{ width: 110 }} />   {/* Invoice Date */}
                        <col style={{ width: 110 }} />   {/* Due Date */}
                        <col style={{ width: 70 }} />    {/* Currency */}
                        <col style={{ width: 80 }} />    {/* FX Rate */}
                        <col style={{ width: 110 }} />   {/* Invoice Amt */}
                        <col style={{ width: 110 }} />   {/* Invoice (Base) */}
                        <col style={{ width: 110 }} />   {/* Received */}
                        <col style={{ width: 120 }} />   {/* Pending (Base) */}
                        <col style={{ width: 110 }} />   {/* Status */}
                        <col />                          {/* Job — flexible */}
                    </colgroup>
                    <thead>
                        <tr>
                            <th />
                            <Th col="InvoiceNo">Invoice No</Th>
                            <Th col="InvoiceDate">Invoice Date</Th>
                            <Th col="DueDate">Due Date</Th>
                            <th style={{ whiteSpace: 'nowrap' }}>Currency</th>
                            <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>FX Rate</th>
                            <Th col="PendingAmount"     right>Invoice Amt</Th>
                            <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Invoice (Base)</th>
                            <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Received</th>
                            <Th col="PendingAmountBase" right>Pending (Base)</Th>
                            <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                            <th>Job</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && !loading ? (
                            <tr><td colSpan={12} className="recv-empty">No outstanding invoices found.</td></tr>
                        ) : rows.flatMap(r => {
                            const isOpen = expanded[r.invoiceId];
                            const isOverdue = r.daysOverdue > 0;
                            return [
                                <tr key={r.invoiceId} className={`recv-inv-row${isOpen ? ' expanded' : ''}`}>
                                    <td>
                                        <button className="recv-expand-btn" onClick={() => toggleExpand(r.invoiceId)}
                                                title="Show receipt allocations">
                                            {isOpen ? '▾' : '▸'}
                                        </button>
                                    </td>
                                    <td>
                                        <span className="recv-num-link" onClick={() => navigate(`/invoices/${r.invoiceId}`)}>
                                            {r.invoiceNo}
                                        </span>
                                    </td>
                                    <td>{fmtDate(r.invoiceDate)}</td>
                                    <td>
                                        {fmtDate(r.dueDate)}
                                        {isOverdue && (
                                            <span className="recv-overdue-chip">{r.daysOverdue}d</span>
                                        )}
                                    </td>
                                    <td style={{ fontSize: 11, color: '#475569' }}>{r.currencyShort || '—'}</td>
                                    <td className="num-cell" style={{ color: '#64748b', fontSize: 11.5 }}>{fmt(r.exchangeRate)}</td>
                                    <td className="num-cell">{fmt(r.invoiceAmount)}</td>
                                    <td className="num-cell" style={{ color: '#64748b' }}>{fmt(r.invoiceAmountBase)}</td>
                                    <td className="num-cell" style={{ color: r.receivedAmount > 0 ? '#0f766e' : '#94a3b8' }}>
                                        {r.receivedAmount > 0 ? fmt(r.receivedAmount) : '—'}
                                    </td>
                                    <td className="num-cell" style={{ fontWeight: 600, color: isOverdue ? '#dc2626' : '#1e293b' }}>
                                        {fmt(r.pendingAmountBase)}
                                    </td>
                                    <td><StatusBadge s={r.paymentStatus} /></td>
                                    <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.jobId || '—'}</td>
                                </tr>,
                                isOpen && <AllocationRows key={`alloc-${r.invoiceId}`} invoiceId={r.invoiceId} />,
                            ].filter(Boolean);
                        })}
                    </tbody>
                    {/* ── Invoice footer totals ── */}
                    {rows.length > 0 && (() => {
                        // Group original amounts by currency.
                        // Only include rows with a known single currency — skip null/unknown.
                        const groupByCcy = (amtKey) => {
                            const g = {};
                            rows.forEach(r => {
                                const ccy = r.currencyShort;
                                if (!ccy) return;   // ← never sum unknowns
                                g[ccy] = (g[ccy] || 0) + (Number(r[amtKey]) || 0);
                            });
                            return Object.entries(g);
                        };
                        const invByCcy   = groupByCcy('invoiceAmount');
                        const recvByCcy  = groupByCcy('receivedAmount');
                        const totInvBase  = rows.reduce((s, r) => s + (r.invoiceAmountBase || 0), 0);
                        const totPending  = rows.reduce((s, r) => s + (r.pendingAmountBase || 0), 0);
                        const multiCcy    = invByCcy.length > 1;

                        const CcyCell = ({ entries, baseTotal, color = '#1e293b', hideIfZero = false }) => (
                            <td style={{ textAlign: 'right', padding: '9px 12px', lineHeight: 1.6 }}>
                                {entries.map(([ccy, amt]) =>
                                    hideIfZero && amt === 0 ? null : (
                                        <div key={ccy} style={{ fontWeight: 700, color: amt > 0 ? color : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                                            {amt > 0 ? fmt(amt) : '—'}
                                            {amt > 0 && <span style={{ fontSize: 10.5, color: '#64748b', marginLeft: 4 }}>{ccy}</span>}
                                        </div>
                                    )
                                )}
                                {multiCcy && baseTotal != null && (
                                    <div style={{ fontSize: 11, color: '#94a3b8', borderTop: '1px dashed #e2e8f0', paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                                        {fmt(baseTotal)} <span style={{ fontSize: 10 }}>base</span>
                                    </div>
                                )}
                            </td>
                        );

                        return (
                            <tfoot>
                                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                                    <td colSpan={2} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 12, color: '#374151' }}>
                                        Page Total
                                        <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>
                                            ({rows.length} of {totalRows} invoice{totalRows !== 1 ? 's' : ''})
                                        </span>
                                    </td>
                                    <td colSpan={4} />
                                    {/* Invoice Amt — per currency */}
                                    <CcyCell entries={invByCcy} baseTotal={multiCcy ? totInvBase : null} />
                                    {/* Invoice Base total */}
                                    <td className="num-cell" style={{ fontWeight: 700, color: '#64748b' }}>{fmt(totInvBase)}</td>
                                    {/* Received — per currency */}
                                    <CcyCell entries={recvByCcy} baseTotal={null} color="#0f766e" hideIfZero />
                                    {/* Pending Base */}
                                    <td className="num-cell" style={{ fontWeight: 700, color: '#1e293b' }}>{fmt(totPending)}</td>
                                    <td colSpan={2} />
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

// ── Payment History Tab ───────────────────────────────────────────────────
const PaymentHistoryTab = ({ customerId }) => {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        fetch(`${variables.API_URL}receivables/customer-payment-history/${customerId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d  => setData(d))
            .catch(() => setError('Failed to load payment history.'))
            .finally(() => setLoading(false));
    }, [customerId]);

    if (loading) return <div className="recv-spinner"><div className="recv-spinner-ring" /><span>Loading…</span></div>;
    if (error)   return <div className="recv-error">⚠ {error}</div>;
    if (!data)   return null;

    const { summary, history } = data;

    return (
        <>
            {/* KPI Strip */}
            <div className="recv-kpi-row" style={{ marginBottom: 20 }}>
                <div className="recv-kpi-card">
                    <div className="recv-kpi-label">Invoices Raised</div>
                    <div className="recv-kpi-value">{fmt(summary.invoicesRaised)}</div>
                    <div className="recv-kpi-sub">Total · Base Currency</div>
                </div>
                <div className="recv-kpi-card">
                    <div className="recv-kpi-label">Receipts Received</div>
                    <div className="recv-kpi-value" style={{ color: '#0f766e' }}>{fmt(summary.receiptsReceived)}</div>
                    <div className="recv-kpi-sub">Total · Base Currency</div>
                </div>
                <div className="recv-kpi-card">
                    <div className="recv-kpi-label">Outstanding Balance</div>
                    <div className="recv-kpi-value">{fmt(summary.outstandingBalance)}</div>
                    <div className="recv-kpi-sub">Base Currency</div>
                </div>
                <div className="recv-kpi-card">
                    <div className="recv-kpi-label">Overdue Amount</div>
                    <div className={`recv-kpi-value ${summary.overdueAmount > 0 ? 'danger' : ''}`}>
                        {fmt(summary.overdueAmount)}
                    </div>
                    <div className="recv-kpi-sub">Past due date</div>
                </div>
            </div>

            {/* Receipt History Table */}
            <div className="recv-grid-wrap">
                <div className="recv-grid-header">
                    <div>
                        <div className="recv-grid-title">Receipt History</div>
                        <div className="recv-grid-sub">{history.length} receipt{history.length !== 1 ? 's' : ''}</div>
                    </div>
                </div>
                <div className="recv-table-wrap">
                    <table className="recv-table">
                        <colgroup>
                            <col style={{ width: 130 }} />  {/* Receipt No */}
                            <col style={{ width: 110 }} />  {/* Date */}
                            <col style={{ width: 80 }} />   {/* Currency */}
                            <col style={{ width: 80 }} />   {/* FX Rate */}
                            <col style={{ width: 130 }} />  {/* Amount Received */}
                            <col style={{ width: 120 }} />  {/* Base Amount */}
                            <col style={{ width: 110 }} />  {/* Allocated */}
                            <col style={{ width: 120 }} />  {/* Allocated Base */}
                            <col style={{ width: 80 }} />   {/* Mode */}
                            <col style={{ width: 90 }} />   {/* Status */}
                            <col />                         {/* Created By — flexible */}
                        </colgroup>
                        <thead>
                            <tr>
                                <th style={{ whiteSpace: 'nowrap' }}>Receipt No</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Receipt Date</th>
                                <th>Currency</th>
                                <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>FX Rate</th>
                                <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Amt Received</th>
                                <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Base Amount</th>
                                <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Allocated</th>
                                <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Alloc (Base)</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Mode</th>
                                <th>Status</th>
                                <th style={{ whiteSpace: 'nowrap' }}>Created By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length === 0 ? (
                                <tr><td colSpan={11} className="recv-empty">No receipt history.</td></tr>
                            ) : history.map((r, i) => (
                                <tr key={i}>
                                    <td><span style={{ fontWeight: 600, color: '#0369a1' }}>{r.rvNumber}</span></td>
                                    <td>{fmtDate(r.rvDate)}</td>
                                    <td style={{ fontSize: 11.5, color: '#475569' }}>{r.currencyShort || '—'}</td>
                                    <td className="num-cell" style={{ color: '#64748b', fontSize: 11.5 }}>{fmt(r.exchangeRate)}</td>
                                    <td className="num-cell" style={{ fontWeight: 600 }}>{fmt(r.amountReceived)}</td>
                                    <td className="num-cell" style={{ color: '#0f766e' }}>{fmt(r.amountBase)}</td>
                                    <td className="num-cell">{fmt(r.allocatedAmount)}</td>
                                    <td className="num-cell" style={{ color: '#0369a1' }}>{fmt(r.allocatedBase)}</td>
                                    <td style={{ fontSize: 11.5, color: '#475569' }}>{r.paymentMode || '—'}</td>
                                    <td>
                                        <span className="recv-badge" style={{ background: '#dcfce7', color: '#166534', fontSize: 10.5 }}>
                                            {r.status}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.createdBy || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                        {/* ── Receipt history footer totals ── */}
                        {history.length > 0 && (() => {
                            // Group by receipt currency — skip null/unknown, never mix.
                            const groupByCcy = (amtKey) => {
                                const g = {};
                                history.forEach(r => {
                                    const ccy = r.currencyShort;
                                    if (!ccy) return;   // ← never sum unknowns
                                    g[ccy] = (g[ccy] || 0) + (Number(r[amtKey]) || 0);
                                });
                                return Object.entries(g);
                            };
                            const amtByCcy   = groupByCcy('amountReceived');
                            const allocByCcy = groupByCcy('allocatedAmount');
                            const totAmtBase   = history.reduce((s, r) => s + (r.amountBase    || 0), 0);
                            const totAllocBase = history.reduce((s, r) => s + (r.allocatedBase || 0), 0);
                            const multiCcy     = amtByCcy.length > 1;

                            const CcyCell = ({ entries, baseTotal, color = '#1e293b' }) => (
                                <td style={{ textAlign: 'right', padding: '9px 12px', lineHeight: 1.6 }}>
                                    {entries.map(([ccy, amt]) => (
                                        <div key={ccy} style={{ fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                                            {fmt(amt)}
                                            <span style={{ fontSize: 10.5, color: '#64748b', marginLeft: 4 }}>{ccy}</span>
                                        </div>
                                    ))}
                                    {multiCcy && (
                                        <div style={{ fontSize: 11, color: '#94a3b8', borderTop: '1px dashed #e2e8f0', paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                                            {fmt(baseTotal)} <span style={{ fontSize: 10 }}>base</span>
                                        </div>
                                    )}
                                </td>
                            );

                            return (
                                <tfoot>
                                    <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                                        <td colSpan={3} style={{ padding: '9px 12px', fontWeight: 700, fontSize: 12, color: '#374151' }}>
                                            Total
                                            <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>
                                                ({history.length} receipt{history.length !== 1 ? 's' : ''})
                                            </span>
                                        </td>
                                        <td />
                                        <CcyCell entries={amtByCcy}   baseTotal={totAmtBase}   />
                                        <td className="num-cell" style={{ fontWeight: 700, color: '#0f766e' }}>{fmt(totAmtBase)}</td>
                                        <CcyCell entries={allocByCcy} baseTotal={totAllocBase} color="#0369a1" />
                                        <td className="num-cell" style={{ fontWeight: 700, color: '#0369a1' }}>{fmt(totAllocBase)}</td>
                                        <td colSpan={3} />
                                    </tr>
                                </tfoot>
                            );
                        })()}
                    </table>
                </div>
            </div>
        </>
    );
};

// ── Customer Aging Summary ────────────────────────────────────────────────
const AgingTab = ({ customerId }) => {
    const [aging,   setAging]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        fetch(`${variables.API_URL}receivables/aging?customerId=${customerId}&pageSize=1`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d  => setAging(d.data?.[0] || null))
            .catch(() => setError('Failed to load aging.'))
            .finally(() => setLoading(false));
    }, [customerId]);

    if (loading) return <div className="recv-spinner"><div className="recv-spinner-ring" /><span>Loading…</span></div>;
    if (error)   return <div className="recv-error">⚠ {error}</div>;

    if (!aging) return <div style={{ padding: '20px 0', color: '#94a3b8', textAlign: 'center', fontSize: 13 }}>No aging data for this customer.</div>;

    const buckets = [
        { label: 'Current (Not Overdue)',     val: aging.current,   color: '#22c55e', bg: '#f0fdf4' },
        { label: '0–30 Days Overdue',         val: aging.days0_30,  color: '#f59e0b', bg: '#fffbeb' },
        { label: '31–60 Days Overdue',        val: aging.days31_60, color: '#f97316', bg: '#fff7ed' },
        { label: '61–90 Days Overdue',        val: aging.days61_90, color: '#ef4444', bg: '#fff1f2' },
        { label: '90+ Days Overdue',          val: aging.days90Plus,color: '#7f1d1d', bg: '#fef2f2' },
    ];

    return (
        <div style={{ maxWidth: 600 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {buckets.map((b, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                          background: b.val > 0 ? b.bg : '#f8fafc',
                                          border: `1px solid ${b.val > 0 ? b.color + '33' : '#e2e8f0'}`,
                                          borderRadius: 8, padding: '12px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 10, height: 10, borderRadius: '50%',
                                          background: b.val > 0 ? b.color : '#cbd5e1' }} />
                            <span style={{ fontSize: 13, color: b.val > 0 ? '#1e293b' : '#94a3b8', fontWeight: b.val > 0 ? 500 : 400 }}>
                                {b.label}
                            </span>
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 700, color: b.val > 0 ? b.color : '#94a3b8',
                                        fontVariantNumeric: 'tabular-nums' }}>
                            {b.val > 0 ? fmt(b.val) : '—'}
                        </span>
                    </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: 8,
                              padding: '12px 18px', marginTop: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>Total Outstanding</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>
                        {fmt(aging.total)}
                    </span>
                </div>
            </div>
        </div>
    );
};

// ── Main Customer Page ────────────────────────────────────────────────────
const TABS = [
    { key: 'invoices', label: 'Invoice Details' },
    { key: 'payments', label: 'Payment History' },
    { key: 'aging',    label: 'Aging' },
];

const CustomerReceivables = () => {
    const { customerId } = useParams();
    const navigate       = useNavigate();
    const { lookups }    = useLookup();
    const currencies     = lookups.currencies || [];

    const [activeTab,     setActiveTab]     = useState('invoices');
    const [customerName,  setCustomerName]  = useState('');
    const [customerCode,  setCustomerCode]  = useState('');
    const [loadingName,   setLoadingName]   = useState(true);

    // Load just enough info to show the customer name in the header
    useEffect(() => {
        fetch(`${variables.API_URL}receivables/customers?customerId=${customerId}&pageSize=1`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const c = d.data?.[0];
                if (c) { setCustomerName(c.customerName); setCustomerCode(c.customerCode || ''); }
            })
            .catch(() => {})
            .finally(() => setLoadingName(false));
    }, [customerId]);

    const id = parseInt(customerId, 10);

    return (
        <div className="recv-page">
            {/* Header */}
            <div className="recv-detail-header">
                <button className="recv-back-btn" onClick={() => navigate('/receivables')}>
                    ← Receivables
                </button>
                {!loadingName && (
                    <div>
                        <span className="recv-customer-name">{customerName || `Customer #${id}`}</span>
                        {customerCode && <span className="recv-customer-code">({customerCode})</span>}
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="recv-tabs">
                {TABS.map(t => (
                    <button key={t.key}
                            className={`recv-tab${activeTab === t.key ? ' active' : ''}`}
                            onClick={() => setActiveTab(t.key)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {activeTab === 'invoices' && <InvoicesTab customerId={id} currencies={currencies} />}
            {activeTab === 'payments' && <PaymentHistoryTab customerId={id} />}
            {activeTab === 'aging'    && <AgingTab customerId={id} />}
        </div>
    );
};

export default CustomerReceivables;
