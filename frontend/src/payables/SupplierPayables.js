import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useFilters } from '../FilterContext';
import { useLookup } from '../LookupContext';
import '../receivables/Receivables.css';
import '../procurement/Procurement.css';

const fmt     = (n) => (n == null ? '0.00' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const PAGE_SIZES = [50, 100, 200, 500, 1000];

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

// ── PV Allocation rows (inline expanded under invoice) ────────────────────
const AllocationRows = ({ invoiceId }) => {
    const [rows,    setRows]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        fetch(`${variables.API_URL}payables/invoice-allocations/${invoiceId}`, { headers: authHeaders() })
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
            No payment allocations for this invoice.
        </td></tr>
    );

    return (
        <>
            <tr className="recv-alloc-header">
                <td colSpan={12}><span style={{ paddingLeft: 24 }}>Payment / DN Allocation History</span></td>
            </tr>
            {rows.map(a => (
                <tr key={a.allocationId} className="recv-alloc-row">
                    <td colSpan={2} style={{ paddingLeft: 36 }}>
                        <span style={{ fontWeight: 600, color: '#0369a1' }}>{a.pvNumber}</span>
                        {a.sourceType === 'DN' && (
                            <span style={{ marginLeft: 6, fontSize: 10, background: '#fef3c7', color: '#92400e', borderRadius: 3, padding: '1px 5px' }}>Debit Note</span>
                        )}
                        {a.sourceType === 'PV' && a.paymentMode && (
                            <span style={{ marginLeft: 6, fontSize: 10, background: '#ede9fe', color: '#6d28d9', borderRadius: 3, padding: '1px 5px' }}>{a.paymentMode}</span>
                        )}
                    </td>
                    <td>{fmtDate(a.pvDate)}</td>
                    <td />{/* Supplier Ref — skip */}
                    <td />{/* Due Date — skip */}
                    <td>{a.pvCurrencyShort || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(a.pvExchangeRate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600, marginRight: 3 }}>{a.invoiceCurrencyShort}</span>
                        {fmt(a.allocatedAmount)}
                    </td>
                    <td style={{ textAlign: 'right', color: '#0f766e' }}>{fmt(a.allocatedAmountBase)}</td>
                    <td colSpan={2}>{a.createdBy || '—'}</td>
                    <td colSpan={1} style={{ color: '#94a3b8' }}>{fmtDate(a.createdDate)}</td>
                </tr>
            ))}
        </>
    );
};

// ── Invoices Tab ──────────────────────────────────────────────────────────
const DEFAULT_INV_FILTERS = { invoiceNo: '', status: '', currencyId: '', dateFrom: '', dateTo: '', dueDateFrom: '', dueDateTo: '' };

const InvoicesTab = ({ supplierId, currencies }) => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters } = useFilters();

    const [rows,       setRows]      = useState([]);
    const [loading,    setLoading]   = useState(false);
    const [totalRows,  setTotal]     = useState(0);
    const [totalPages, setPages]     = useState(1);
    const [page,       setPage]      = useState(1);
    const [pageSize,   setPageSize]  = useState(200);
    const [sortCol,    setSortCol]   = useState('InvoiceDate');
    const [sortDir,    setSortDir]   = useState('DESC');
    const [applied,    setApplied]   = useState({ ...DEFAULT_INV_FILTERS });
    const [expanded,   setExpanded]  = useState({});
    const [error,      setError]     = useState('');

    const gridRef = useRef({ pageSize: 200, sortCol: 'InvoiceDate', sortDir: 'DESC', applied: DEFAULT_INV_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true); setError('');
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.invoiceNo)   q.set('invoiceNo',   af.invoiceNo);
        if (af.status)      q.set('status',      af.status);
        if (af.currencyId)  q.set('currencyId',  af.currencyId);
        if (af.dateFrom)    q.set('dateFrom',    af.dateFrom);
        if (af.dateTo)      q.set('dateTo',      af.dateTo);
        if (af.dueDateFrom) q.set('dueDateFrom', af.dueDateFrom);
        if (af.dueDateTo)   q.set('dueDateTo',   af.dueDateTo);
        fetch(`${variables.API_URL}payables/supplier-invoices/${supplierId}?${q}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`Server error (${r.status})`); return r.json(); })
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(e => setError(e.message || 'Failed to load invoices.'))
            .finally(() => setLoading(false));
    }, [supplierId]);

    useEffect(() => { load(1, 20, 'InvoiceDate', 'DESC', DEFAULT_INV_FILTERS); }, [load]);

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1); load(1, ps, sc, sd, vals);
        };
        const defs = {
            invoiceNo:  { label: 'Invoice No',    type: 'text',   placeholder: 'SI-…' },
            status:     { label: 'Status',         type: 'select', placeholder: 'All',
                          options: [{ value: 'Unpaid', label: 'Unpaid' }, { value: 'PartiallyPaid', label: 'Partially Paid' }] },
            currencyId: { label: 'Currency',       type: 'select', placeholder: 'All',
                          options: currencies.map(c => ({ value: String(c.id), label: c.shortName })) },
            dateFrom:   { label: 'Invoice From',   type: 'date' },
            dateTo:     { label: 'Invoice To',     type: 'date' },
            dueDateFrom:{ label: 'Due Date From',  type: 'date' },
            dueDateTo:  { label: 'Due Date To',    type: 'date' },
        };
        registerFilters(`payab-inv-${supplierId}`, defs, DEFAULT_INV_FILTERS, onApply);
        return () => unregisterFilters(`payab-inv-${supplierId}`);
    }, [currencies, supplierId]); // eslint-disable-line

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
                <div className="recv-grid-sub">{totalRows} invoice{totalRows !== 1 ? 's' : ''} outstanding</div>
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
                        <col style={{ width: 32 }} />
                        <col style={{ width: 130 }} />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 60 }} />
                        <col style={{ width: 75 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 110 }} />
                        <col style={{ width: 120 }} />
                        <col style={{ width: 110 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th />
                            <Th col="InvoiceNo">Invoice No</Th>
                            <th style={{ whiteSpace: 'nowrap' }}>Supplier Ref</th>
                            <Th col="InvoiceDate">Invoice Date</Th>
                            <Th col="DueDate">Due Date</Th>
                            <th style={{ whiteSpace: 'nowrap' }}>CCY</th>
                            <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>FX Rate</th>
                            <Th col="PendingAmount"     right>Invoice Amt</Th>
                            <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Invoice (Base)</th>
                            <th style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>Paid</th>
                            <Th col="PendingAmountBase" right>Pending (Base)</Th>
                            <th style={{ whiteSpace: 'nowrap' }}>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && !loading ? (
                            <tr><td colSpan={12} className="recv-empty">No outstanding invoices found.</td></tr>
                        ) : rows.flatMap(r => {
                            const isOpen    = expanded[r.supplierInvoiceId];
                            const isOverdue = r.daysOverdue > 0;
                            return [
                                <tr key={r.supplierInvoiceId} className={`recv-inv-row${isOpen ? ' expanded' : ''}`}>
                                    <td>
                                        <button className="recv-expand-btn" onClick={() => toggleExpand(r.supplierInvoiceId)}
                                                title="Show PV allocations">
                                            {isOpen ? '▾' : '▸'}
                                        </button>
                                    </td>
                                    <td>
                                        <span className="recv-num-link" onClick={() => navigate(`/supplier-invoice/${r.supplierInvoiceId}`)}>
                                            {r.invoiceNo}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 11.5, color: '#64748b' }}>{r.supplierInvRef || '—'}</td>
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
                                    <td className="num-cell" style={{ color: r.paidAmount > 0 ? '#0f766e' : '#94a3b8' }}>
                                        {r.paidAmount > 0 ? fmt(r.paidAmount) : '—'}
                                    </td>
                                    <td className="num-cell" style={{ fontWeight: 600, color: isOverdue ? '#dc2626' : '#1e293b' }}>
                                        {fmt(r.pendingAmountBase)}
                                    </td>
                                    <td><StatusBadge s={r.paymentStatus} /></td>
                                </tr>,
                                isOpen && <AllocationRows key={`alloc-${r.supplierInvoiceId}`} invoiceId={r.supplierInvoiceId} />,
                            ].filter(Boolean);
                        })}
                    </tbody>
                    {rows.length > 0 && (() => {
                        const groupByCcy = (amtKey) => {
                            const g = {};
                            rows.forEach(r => {
                                const ccy = r.currencyShort;
                                if (!ccy) return;
                                g[ccy] = (g[ccy] || 0) + (Number(r[amtKey]) || 0);
                            });
                            return Object.entries(g);
                        };
                        const invByCcy   = groupByCcy('invoiceAmount');
                        const paidByCcy  = groupByCcy('paidAmount');
                        const totInvBase  = rows.reduce((s, r) => s + (r.invoiceAmountBase  || 0), 0);
                        const totPending  = rows.reduce((s, r) => s + (r.pendingAmountBase  || 0), 0);

                        // Invoice Amt col (col 8) — original currency only; base is the dedicated col 9
                        const InvAmtCell = ({ entries }) => (
                            <td style={{ textAlign: 'right', padding: '9px 12px', lineHeight: 1.6 }}>
                                {entries.length === 0
                                    ? <span style={{ color: '#94a3b8' }}>—</span>
                                    : entries.map(([ccy, amt]) => (
                                        <div key={ccy} style={{ fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>
                                            {fmt(amt)}<span style={{ fontSize: 10.5, color: '#64748b', marginLeft: 4 }}>{ccy}</span>
                                        </div>
                                    ))
                                }
                            </td>
                        );

                        // Paid col (col 10) — original currency + always show base below
                        const totPaidBase = rows.reduce((s, r) => s + (r.paidAmount || 0) * (r.exchangeRate || 1), 0);
                        const PaidAmtCell = ({ entries }) => {
                            const anyPaid = entries.some(([, amt]) => amt > 0);
                            return (
                                <td style={{ textAlign: 'right', padding: '9px 12px', lineHeight: 1.6 }}>
                                    {!anyPaid
                                        ? <span style={{ color: '#94a3b8' }}>—</span>
                                        : <>
                                            {entries.map(([ccy, amt]) => amt > 0 && (
                                                <div key={ccy} style={{ fontWeight: 700, color: '#0f766e', fontVariantNumeric: 'tabular-nums' }}>
                                                    {fmt(amt)}<span style={{ fontSize: 10.5, color: '#64748b', marginLeft: 4 }}>{ccy}</span>
                                                </div>
                                            ))}
                                            <div style={{ fontSize: 11, color: '#94a3b8', borderTop: '1px dashed #e2e8f0', paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                                                {fmt(totPaidBase)} <span style={{ fontSize: 10 }}>base</span>
                                            </div>
                                        </>
                                    }
                                </td>
                            );
                        };

                        return (
                            <tfoot>
                                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                                    <td />
                                    <td style={{ padding: '9px 12px', fontWeight: 700, fontSize: 12, color: '#374151' }} colSpan={2}>
                                        Page Total
                                        <span style={{ fontWeight: 400, color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>
                                            ({rows.length} of {totalRows})
                                        </span>
                                    </td>
                                    <td colSpan={4} />
                                    <InvAmtCell entries={invByCcy} />
                                    <td className="num-cell" style={{ fontWeight: 700, color: '#1e293b', fontVariantNumeric: 'tabular-nums' }}>{fmt(totInvBase)}</td>
                                    <PaidAmtCell entries={paidByCcy} />
                                    <td className="num-cell" style={{ fontWeight: 700, color: '#1e293b' }}>{fmt(totPending)}</td>
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

// ── Payment History Tab ───────────────────────────────────────────────────
const PaymentHistoryTab = ({ supplierId }) => {
    const navigate = useNavigate();
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');

    useEffect(() => {
        fetch(`${variables.API_URL}payables/supplier-payment-history/${supplierId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d => setData(d))
            .catch(() => setError('Failed to load payment history.'))
            .finally(() => setLoading(false));
    }, [supplierId]);

    if (loading) return <div className="recv-spinner"><div className="recv-spinner-ring" /><span>Loading…</span></div>;
    if (error)   return <div className="recv-error">⚠ {error}</div>;
    if (!data)   return null;

    const { summary, history } = data;

    return (
        <div>
            {/* Summary strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
                {[
                    { label: 'Invoices Raised',    value: summary.invoicesRaised,     color: '#1e293b' },
                    { label: 'Payments Made',       value: summary.paymentsMade,       color: '#0f766e' },
                    { label: 'Outstanding Balance', value: summary.outstandingBalance, color: '#d97706' },
                    { label: 'Overdue Amount',      value: summary.overdueAmount,      color: summary.overdueAmount > 0 ? '#dc2626' : '#94a3b8' },
                ].map(s => (
                    <div key={s.label} className="recv-kpi-card">
                        <div className="recv-kpi-label">{s.label}</div>
                        <div className="recv-kpi-value" style={{ fontSize: 18, color: s.color }}>{fmt(s.value)}</div>
                        <div className="recv-kpi-sub">Base Currency</div>
                    </div>
                ))}
            </div>

            {/* PV history table */}
            <div className="recv-grid-wrap">
                <div className="recv-grid-header">
                    <div className="recv-grid-title">Payment Voucher History</div>
                    <div className="recv-grid-sub">{history.length} payment{history.length !== 1 ? 's' : ''}</div>
                </div>
                <div className="recv-table-wrap">
                    <table className="recv-table">
                        <thead>
                            <tr>
                                <th>PV Number</th>
                                <th>Date</th>
                                <th>Currency</th>
                                <th style={{ textAlign: 'right' }}>FX Rate</th>
                                <th style={{ textAlign: 'right' }}>Amount Paid</th>
                                <th style={{ textAlign: 'right' }}>Amount (Base)</th>
                                <th style={{ textAlign: 'right' }}>Allocated</th>
                                <th style={{ textAlign: 'right' }}>Alloc (Base)</th>
                                <th>Mode</th>
                                <th>Status</th>
                                <th>Created By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length === 0 ? (
                                <tr><td colSpan={11} className="recv-empty">No payment vouchers found.</td></tr>
                            ) : history.map((h, i) => (
                                <tr key={i}>
                                    <td>
                                        <span className="recv-num-link" onClick={() => navigate(`/payment-vouchers`)}>
                                            {h.pvNumber}
                                        </span>
                                    </td>
                                    <td>{fmtDate(h.pvDate)}</td>
                                    <td style={{ fontSize: 11, color: '#475569' }}>{h.currencyShort || '—'}</td>
                                    <td className="num-cell" style={{ color: '#64748b', fontSize: 11.5 }}>{fmt(h.exchangeRate)}</td>
                                    <td className="num-cell" style={{ fontWeight: 500 }}>{fmt(h.amountPaid)}</td>
                                    <td className="num-cell" style={{ color: '#64748b' }}>{fmt(h.amountBase)}</td>
                                    <td className="num-cell" style={{ color: '#0f766e' }}>{fmt(h.allocatedAmount)}</td>
                                    <td className="num-cell" style={{ color: '#0f766e' }}>{fmt(h.allocatedBase)}</td>
                                    <td style={{ fontSize: 11.5 }}>{h.paymentMode || '—'}</td>
                                    <td>
                                        <span className="recv-badge" style={{
                                            background: h.status === 'Posted' ? '#dcfce7' : h.status === 'Cancelled' ? '#fee2e2' : '#f1f5f9',
                                            color:      h.status === 'Posted' ? '#166534' : h.status === 'Cancelled' ? '#991b1b' : '#475569',
                                        }}>
                                            {h.status}
                                        </span>
                                    </td>
                                    <td style={{ fontSize: 11.5, color: '#64748b' }}>{h.createdBy || '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ── Main Detail Page ──────────────────────────────────────────────────────
const DETAIL_TABS = [
    { key: 'invoices', label: 'Outstanding Invoices' },
    { key: 'history',  label: 'Payment History' },
];

const SupplierPayables = () => {
    const { supplierId } = useParams();
    const navigate       = useNavigate();
    const { lookups }    = useLookup();
    const currencies     = lookups.currencies || [];

    const [supplier, setSupplier] = useState(null);
    const [tab,      setTab]      = useState('invoices');
    const [loading,  setLoading]  = useState(true);
    const [error,    setError]    = useState('');

    // Load supplier name for header
    useEffect(() => {
        setLoading(true);
        fetch(`${variables.API_URL}supplier/${supplierId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d => setSupplier(d))
            .catch(() => setError('Failed to load supplier details.'))
            .finally(() => setLoading(false));
    }, [supplierId]);

    return (
        <div className="recv-page">
            {/* Header */}
            <div className="recv-detail-header">
                <button className="recv-back-btn" onClick={() => navigate('/payables')}>
                    ← Back to Payables
                </button>
                {loading ? (
                    <span style={{ color: '#94a3b8', fontSize: 13 }}>Loading…</span>
                ) : error ? (
                    <span style={{ color: '#dc2626', fontSize: 13 }}>⚠ {error}</span>
                ) : supplier ? (
                    <>
                        <span className="recv-customer-name">{supplier.supplierName}</span>
                        {supplier.supplierCode && (
                            <span className="recv-customer-code">{supplier.supplierCode}</span>
                        )}
                        <button className="recv-btn-view" style={{ marginLeft: 'auto' }}
                                onClick={() => navigate(`/suppliers/${supplierId}`)}>
                            Open Supplier Profile
                        </button>
                    </>
                ) : null}
            </div>

            {/* Tab bar */}
            <div className="recv-tabs">
                {DETAIL_TABS.map(t => (
                    <button key={t.key}
                            className={`recv-tab${tab === t.key ? ' active' : ''}`}
                            onClick={() => setTab(t.key)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === 'invoices' && <InvoicesTab supplierId={Number(supplierId)} currencies={currencies} />}
            {tab === 'history'  && <PaymentHistoryTab supplierId={Number(supplierId)} />}
        </div>
    );
};

export default SupplierPayables;
