import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders, getCurrentUser } from '../Variable';
import { useFilters } from '../FilterContext';
import FollowupModal from './FollowupModal';
import '../receivables/Receivables.css';
import '../procurement/Procurement.css';

const fmt     = (n) => (n == null ? '0.00' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const PAGE_SIZES = [50, 100, 200, 500, 1000];

// Derived follow-up state → badge styling + label
export const STATE_CFG = {
    PromiseBroken:  { bg: '#fef2f2', color: '#991b1b', dot: '#dc2626', label: 'Promise Overdue' },
    PromiseDue:     { bg: '#fff7ed', color: '#c2410c', dot: '#f97316', label: 'Promise Due' },
    NeverContacted: { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: 'Never Contacted' },
    FollowupDue:    { bg: '#eff6ff', color: '#1d4ed8', dot: '#3b82f6', label: 'Follow-up Due' },
    Scheduled:      { bg: '#f0fdf4', color: '#166534', dot: '#22c55e', label: 'Scheduled' },
    NoActionDue:    { bg: '#f8fafc', color: '#64748b', dot: '#cbd5e1', label: 'No Action Due' },
};

const StateBadge = ({ s }) => {
    const c = STATE_CFG[s] || STATE_CFG.NoActionDue;
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

const STATE_FILTER_OPTIONS = [
    { value: 'PromiseBroken',  label: 'Promise Overdue' },
    { value: 'PromiseDue',     label: 'Promise Due' },
    { value: 'NeverContacted', label: 'Never Contacted' },
    { value: 'FollowupDue',    label: 'Follow-up Due' },
    { value: 'Scheduled',      label: 'Scheduled' },
];

const DEFAULT_FILTERS = { state: '', showAll: '' };

const PaymentFollowup = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters } = useFilters();

    const [summary,    setSummary]  = useState(null);
    const [rows,       setRows]     = useState([]);
    const [loading,    setLoading]  = useState(false);
    const [totalRows,  setTotal]    = useState(0);
    const [totalPages, setPages]    = useState(1);
    const [page,       setPage]     = useState(1);
    const [pageSize,   setPageSize] = useState(200);
    const [sortCol,    setSortCol]  = useState('Priority');
    const [sortDir,    setSortDir]  = useState('ASC');
    const [applied,    setApplied]  = useState({ ...DEFAULT_FILTERS });
    const [error,      setError]    = useState('');
    const [modalCust,  setModalCust]= useState(null);   // {customerId, customerName} or null

    const gridRef = useRef({ pageSize: 200, sortCol: 'Priority', sortDir: 'ASC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    const loadSummary = useCallback(() => {
        fetch(`${variables.API_URL}paymentfollowup/worklist-summary`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => setSummary(d))
            .catch(() => {});
    }, []);

    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true); setError('');
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.state)   q.set('state',   af.state);
        if (af.showAll) q.set('showAll', 'true');
        fetch(`${variables.API_URL}paymentfollowup/worklist?${q}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`Server error (${r.status})`); return r.json(); })
            .then(res => { setRows(res.data || []); setTotal(res.totalRows || 0); setPages(res.totalPages || 1); })
            .catch(e => setError(e.message || 'Failed to load worklist.'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, 20, 'Priority', 'ASC', DEFAULT_FILTERS); loadSummary(); }, [load, loadSummary]);

    useEffect(() => {
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals }); setPage(1); load(1, ps, sc, sd, vals);
        };
        const defs = {
            state:   { label: 'State', type: 'select', placeholder: 'Action due', options: STATE_FILTER_OPTIONS },
            showAll: { label: 'Show all outstanding', type: 'select', placeholder: 'No',
                       options: [{ value: 'true', label: 'Yes — all outstanding customers' }] },
        };
        registerFilters('followup-worklist', defs, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('followup-worklist');
    }, []); // eslint-disable-line

    const refresh = () => { load(page, pageSize, sortCol, sortDir, applied); loadSummary(); };

    const handleSort = (col) => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1); load(1, pageSize, col, dir, applied);
    };
    const goPage         = (p)  => { const pg = Math.max(1, Math.min(p, totalPages)); setPage(pg); load(pg, pageSize, sortCol, sortDir, applied); };
    const changePageSize = (ps) => { setPageSize(ps); setPage(1); load(1, ps, sortCol, sortDir, applied); };

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

    const KpiCard = ({ label, value, sub, danger }) => (
        <div className="recv-kpi-card">
            <div className="recv-kpi-label">{label}</div>
            <div className={`recv-kpi-value${danger ? ' danger' : ''}`}>{value}</div>
            <div className="recv-kpi-sub">{sub}</div>
        </div>
    );

    return (
        <div className="recv-page">
            <div className="recv-detail-header" style={{ border: 'none' }}>
                <div>
                    <span className="recv-customer-name">Payment Follow-up</span>
                    <span className="recv-customer-code">Collections worklist</span>
                </div>
            </div>

            {/* KPI strip */}
            <div className="recv-kpi-row" style={{ marginBottom: 18 }}>
                <KpiCard label="Action Due Today"   value={summary ? summary.actionDueCount      : '—'} sub="Customers to chase" />
                <KpiCard label="Promises Overdue"   value={summary ? summary.brokenPromiseCount  : '—'} sub="Past the promised date" danger={summary?.brokenPromiseCount > 0} />
                <KpiCard label="Promises Due Today" value={summary ? summary.promiseDueCount     : '—'} sub="Promised to pay today" />
                <KpiCard label="Total Overdue"      value={summary ? fmt(summary.totalOverdueBase) : '—'} sub="Base currency" danger={summary?.totalOverdueBase > 0} />
            </div>

            <div className="recv-grid-wrap">
                <div className="recv-grid-header">
                    <div>
                        <div className="recv-grid-title">Worklist</div>
                        <div className="recv-grid-sub">{totalRows} customer{totalRows !== 1 ? 's' : ''}</div>
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
                            <col />                          {/* Customer */}
                            <col style={{ width: 150 }} />   {/* Contact */}
                            <col style={{ width: 130 }} />   {/* State */}
                            <col style={{ width: 90 }}  />   {/* Days overdue */}
                            <col style={{ width: 120 }} />   {/* Outstanding */}
                            <col style={{ width: 120 }} />   {/* Overdue */}
                            <col style={{ width: 150 }} />   {/* Promise */}
                            <col style={{ width: 120 }} />   {/* Next follow-up */}
                            <col style={{ width: 150 }} />   {/* Last contact */}
                            <col style={{ width: 90 }}  />   {/* Action */}
                        </colgroup>
                        <thead>
                            <tr>
                                <Th col="CustomerName">Customer</Th>
                                <th style={{ whiteSpace: 'nowrap' }}>Contact</th>
                                <th style={{ whiteSpace: 'nowrap' }}>State</th>
                                <Th col="MaxDaysOverdue" right>Overdue&nbsp;d</Th>
                                <Th col="TotalPendingBase" right>Outstanding</Th>
                                <Th col="OverdueAmountBase" right>Overdue</Th>
                                <Th col="PromiseDate">Promise</Th>
                                <Th col="NextFollowupDate">Next Follow-up</Th>
                                <th style={{ whiteSpace: 'nowrap' }}>Last Contact</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr><td colSpan={10} className="recv-empty">No customers need follow-up right now. 🎉</td></tr>
                            ) : rows.map(r => (
                                <tr key={r.customerId}>
                                    <td>
                                        <span className="recv-num-link" onClick={() => navigate(`/receivables/customer/${r.customerId}`)}>
                                            {r.customerName}
                                        </span>
                                        {r.customerCode && <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.customerCode}</div>}
                                    </td>
                                    <td style={{ fontSize: 11.5, color: '#475569', lineHeight: 1.5 }}>
                                        {r.mobile || r.phone
                                            ? <a href={`tel:${r.mobile || r.phone}`} style={{ color: '#0369a1', textDecoration: 'none' }}>{r.mobile || r.phone}</a>
                                            : '—'}
                                        {r.salesPerson && <div style={{ fontSize: 10.5, color: '#94a3b8' }}>Rep: {r.salesPerson}</div>}
                                    </td>
                                    <td><StateBadge s={r.followupState} /></td>
                                    <td className="num-cell" style={{ color: r.maxDaysOverdue > 0 ? '#dc2626' : '#94a3b8', fontWeight: r.maxDaysOverdue > 0 ? 600 : 400 }}>
                                        {r.maxDaysOverdue > 0 ? r.maxDaysOverdue : '—'}
                                    </td>
                                    <td className="num-cell" style={{ fontWeight: 600 }}>{fmt(r.totalPendingBase)}</td>
                                    <td className="num-cell" style={{ color: r.overdueAmountBase > 0 ? '#dc2626' : '#94a3b8' }}>
                                        {r.overdueAmountBase > 0 ? fmt(r.overdueAmountBase) : '—'}
                                    </td>
                                    <td style={{ fontSize: 11.5 }}>
                                        {r.promiseDate
                                            ? <>
                                                <div style={{ color: r.followupState === 'PromiseBroken' ? '#dc2626' : '#1e293b', fontWeight: 600 }}>{fmtDate(r.promiseDate)}</div>
                                                {r.promiseAmount > 0 && <div style={{ color: '#0f766e' }}>{fmt(r.promiseAmount)}</div>}
                                              </>
                                            : <span style={{ color: '#cbd5e1' }}>—</span>}
                                    </td>
                                    <td style={{ fontSize: 11.5, color: '#475569' }}>{fmtDate(r.nextFollowupDate)}</td>
                                    <td style={{ fontSize: 11.5, color: '#64748b' }}>
                                        {r.lastContactDate
                                            ? <>
                                                <div>{fmtDate(r.lastContactDate)}</div>
                                                <div style={{ fontSize: 10.5, color: '#94a3b8' }}>{r.lastOutcome}</div>
                                              </>
                                            : <span style={{ color: '#cbd5e1' }}>Not yet</span>}
                                    </td>
                                    <td>
                                        <button className="recv-btn-view" onClick={() => setModalCust({ customerId: r.customerId, customerName: r.customerName })}>
                                            Log
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
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

            {modalCust && (
                <FollowupModal
                    customerId={modalCust.customerId}
                    customerName={modalCust.customerName}
                    currentUser={getCurrentUser()}
                    onClose={() => setModalCust(null)}
                    onSaved={refresh}
                />
            )}
        </div>
    );
};

export default PaymentFollowup;
