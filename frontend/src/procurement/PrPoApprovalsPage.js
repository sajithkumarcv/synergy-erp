import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useFilters } from '../FilterContext';
import ApprovalHistoryTab from '../approval/ApprovalHistoryTab';
import './Procurement.css';

// Scoped variant of ApprovalsAdminPage.js — same data source (approval/all),
// same visual pieces, but locked to PR + PO only and placed under
// Procurement so buyers don't have to go through the all-modules admin
// view (or open each PR/PO one at a time) just to see who's holding up
// which document at which approval level.

// ── Constants ─────────────────────────────────────────────────────────────────
const PAGE_SIZES = [50, 100, 200, 500, 1000];
const MODULE_CODES = 'PR,PO';   // fallback if the checkbox filter is somehow cleared to nothing

const STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

// Document's own lifecycle status per module (from TBL_DOCUMENT_STATUS,
// ModuleName='PR'/'PO') — distinct from the approval-transaction STATUSES
// above. PO has stages (Sent/Partial/Received/Hold) PR doesn't, and PR has
// its own (Submitted/Ordered) PO doesn't; shared codes (Draft, Approved,
// PendingApproval, Rejected, Cancelled, Closed, PendingL1-4) only listed
// once. Colors come from the API response (documentStatusBg/Color), this
// list is only used to populate the filter checkboxes.
const DOCUMENT_STATUSES = [
    { value: 'Draft',           label: 'Draft' },
    { value: 'Submitted',       label: 'Submitted (PR)' },
    { value: 'PendingApproval', label: 'Pending Approval' },
    { value: 'PendingL1',       label: 'Pending Level 1' },
    { value: 'PendingL2',       label: 'Pending Level 2' },
    { value: 'PendingL3',       label: 'Pending Level 3' },
    { value: 'PendingL4',       label: 'Pending Level 4' },
    { value: 'Approved',        label: 'Approved' },
    { value: 'Sent',            label: 'Sent (PO)' },
    { value: 'Partial',         label: 'Partial' },
    { value: 'Received',        label: 'Received (PO)' },
    { value: 'Hold',            label: 'Hold (PO)' },
    { value: 'Ordered',         label: 'Ordered (PR)' },
    { value: 'Closed',          label: 'Closed' },
    { value: 'Rejected',        label: 'Rejected' },
    { value: 'Cancelled',       label: 'Cancelled' },
];

const STATUS_CFG = {
    Pending:   { bg: '#fef3c7', color: '#92400e', dot: '#f59e0b', label: 'Pending'   },
    Approved:  { bg: '#dcfce7', color: '#166534', dot: '#16a34a', label: 'Approved'  },
    Rejected:  { bg: '#fee2e2', color: '#991b1b', dot: '#dc2626', label: 'Rejected'  },
    Cancelled: { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: 'Cancelled' },
};

const MODULES = {
    PR: { label: 'Purchase Request', icon: '🛒', color: '#1e40af' },
    PO: { label: 'Purchase Order',   icon: '📦', color: '#065f46' },
};

const MODULE_ROUTES = {
    PR: id => `/purchase-requests/${id}`,
    PO: id => `/purchase-orders/${id}`,
};

const DEFAULT_FILTERS = {
    searchText:     '',
    moduleCode:     MODULE_CODES,   // both PR and PO checked by default
    status:         'Pending',   // only pending-approval PR/PO shown by default
    documentStatus: '',   // comma-joined multiselect (PO stage / PR status)
    submittedBy:    '',
    finalActionBy:  '',
    dateFrom:       '',
    dateTo:         '',
};

// ── Formatters ────────────────────────────────────────────────────────────────
const fmt = v => v == null ? '—'
    : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = d => d
    ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

const fmtDateTime = d => d
    ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

// ── Sub-components ────────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
    const cfg = STATUS_CFG[status] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: status };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
            background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
        }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
            {cfg.label}
        </span>
    );
};

const ModuleBadge = ({ code }) => {
    const m = MODULES[code] || { label: code, icon: '📄', color: '#475569' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 4, fontSize: 10.5, fontWeight: 700,
            background: m.color + '18', color: m.color, whiteSpace: 'nowrap',
        }}>
            {m.icon} {code}
        </span>
    );
};

const LevelPips = ({ current, total }) => {
    if (!total) return <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            {Array.from({ length: total }, (_, i) => (
                <span key={i} style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: i < current ? '#16a34a' : i === current - 1 ? '#f59e0b' : '#e2e8f0',
                    border: i === current - 1 ? '1.5px solid #d97706' : 'none',
                }} />
            ))}
            <span style={{ fontSize: 10.5, color: '#64748b', marginLeft: 4 }}>
                {current}/{total}
            </span>
        </div>
    );
};

const SortIcon = ({ col, sortCol, sortDir }) =>
    sortCol !== col
        ? <span style={{ color: '#cbd5e1', fontSize: 10, marginLeft: 3 }}>⇅</span>
        : <span style={{ color: '#1e40af', fontSize: 10, marginLeft: 3 }}>{sortDir === 'ASC' ? '↑' : '↓'}</span>;

// ── History drawer ─────────────────────────────────────────────────────────────
const HistoryDrawer = ({ row, onClose, onNavigate }) => (
    <>
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.35)', zIndex: 1000 }} />
        <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, maxWidth: '95vw',
            background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,.18)',
            zIndex: 1001, display: 'flex', flexDirection: 'column',
        }}>
            <div style={{
                padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
                display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexShrink: 0,
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <ModuleBadge code={row.moduleCode} />
                        <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', fontFamily: 'monospace' }}>
                            {row.documentNo}
                        </span>
                        <StatusBadge status={row.currentStatus} />
                    </div>
                    {row.documentAmount != null && (
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                            Amount: <strong>{fmt(row.documentAmount)}</strong>
                            &nbsp;·&nbsp;Submitted by <strong>{row.submittedBy}</strong>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    {MODULE_ROUTES[row.moduleCode] && (
                        <button onClick={onNavigate} style={{
                            fontSize: 12, padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
                            border: '1px solid #cbd5e1', background: '#f8fafc', color: '#1e40af', fontWeight: 600,
                        }}>
                            Open doc →
                        </button>
                    )}
                    <button onClick={onClose} style={{
                        width: 30, height: 30, borderRadius: '50%', border: '1px solid #e2e8f0',
                        background: '#f8fafc', fontSize: 18, lineHeight: '28px', cursor: 'pointer',
                        color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>×</button>
                </div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                <ApprovalHistoryTab
                    moduleCode={row.moduleCode}
                    documentId={row.documentId}
                    documentNo={row.documentNo}
                    documentAmount={row.documentAmount}
                />
            </div>
        </div>
    </>
);

// ── Main page ─────────────────────────────────────────────────────────────────
const PrPoApprovalsPage = () => {
    const navigate = useNavigate();
    const { registerFilters, unregisterFilters } = useFilters();

    const [rows,        setRows]       = useState([]);
    const [loading,     setLoading]    = useState(false);
    const [totalRows,   setTotalRows]  = useState(0);
    const [totalPages,  setTotalPages] = useState(1);
    const [page,        setPage]       = useState(1);
    const [pageSize,    setPageSize]   = useState(200);
    const [sortCol,     setSortCol]    = useState('SubmittedDate');
    const [sortDir,     setSortDir]    = useState('DESC');
    const [applied,     setApplied]    = useState({ ...DEFAULT_FILTERS });
    const [selectedRow, setSelectedRow]= useState(null);

    useEffect(() => {
        const handler = e => { if (e.key === 'Escape') setSelectedRow(null); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    const gridRef = useRef({ page: 1, pageSize: 200, sortCol: 'SubmittedDate', sortDir: 'DESC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { page, pageSize, sortCol, sortDir, applied }; }, [page, pageSize, sortCol, sortDir, applied]);

    // ── Fetch — moduleCode is checkbox-driven, but always falls back to
    // both PR+PO if somehow cleared to nothing (this page has no reason to
    // ever show zero modules) ──
    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd, moduleCode: af.moduleCode || MODULE_CODES });
        if (af.searchText)     q.set('searchText',     af.searchText);
        if (af.status)         q.set('status',         af.status);
        if (af.documentStatus) q.set('documentStatus', af.documentStatus);
        if (af.submittedBy)    q.set('submittedBy',    af.submittedBy);
        if (af.finalActionBy)  q.set('finalActionBy',  af.finalActionBy);
        if (af.dateFrom)       q.set('dateFrom',       af.dateFrom);
        if (af.dateTo)         q.set('dateTo',         af.dateTo);
        fetch(`${variables.API_URL}approval/all?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                setRows(d.data || []);
                setTotalRows(d.totalRows || 0);
                setTotalPages(d.totalPages || 1);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(1, 200, 'SubmittedDate', 'DESC', DEFAULT_FILTERS); }, [load]);

    // ── Filter panel registration ──────────────────────────────────────────
    useEffect(() => {
        const defs = {
            searchText:     { label: 'Search',          type: 'text', placeholder: 'PR/PO no…' },
            moduleCode:     { label: 'Document Type',   type: 'multiselect',
                              options: [{ value: 'PR', label: '🛒 Purchase Requests' }, { value: 'PO', label: '📦 Purchase Orders' }] },
            status:         { label: 'Approval Status', type: 'multiselect', options: STATUSES.map(s => ({ value: s, label: s })) },
            documentStatus: { label: 'Document Stage',  type: 'multiselect', options: DOCUMENT_STATUSES },
            submittedBy:    { label: 'Submitted By',    type: 'text', placeholder: 'Username…' },
            finalActionBy:  { label: 'Approved By',     type: 'text', placeholder: 'Username…' },
            dateFrom:       { label: 'Submitted From',  type: 'date' },
            dateTo:         { label: 'Submitted To',    type: 'date' },
        };
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals });
            setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('pr-po-approvals', defs, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('pr-po-approvals');
    }, []); // eslint-disable-line

    const handleSort = (col) => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };

    const goPage = (pg) => {
        const p = Math.max(1, Math.min(pg, totalPages));
        setPage(p);
        load(p, pageSize, sortCol, sortDir, applied);
    };
    const changePageSize = (ps) => {
        setPageSize(ps); setPage(1);
        load(1, ps, sortCol, sortDir, applied);
    };

    const pageNums = () => {
        const range = 5;
        let start = Math.max(1, page - Math.floor(range / 2));
        let end   = Math.min(totalPages, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    const statusCounts = rows.reduce((acc, r) => {
        acc[r.currentStatus] = (acc[r.currentStatus] || 0) + 1;
        return acc;
    }, {});
    const prCount = rows.filter(r => r.moduleCode === 'PR').length;
    const poCount = rows.filter(r => r.moduleCode === 'PO').length;

    const Th = ({ col, children, right }) => (
        <th className="po-th-sortable" onClick={() => handleSort(col)}
            style={{ textAlign: right ? 'right' : 'left' }}>
            <div className="po-th-inner" style={{ justifyContent: right ? 'flex-end' : 'flex-start' }}>
                {children}
                <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} />
            </div>
        </th>
    );

    return (
        <>
        <div className="po-page">
            <div className="po-grid-wrap">

                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">PR &amp; PO Approvals</div>
                            <div className="po-page-sub">
                                {loading ? 'Loading…' : `${totalRows.toLocaleString()} record${totalRows !== 1 ? 's' : ''} — ${prCount} PR, ${poCount} PO on this page`}
                            </div>
                        </div>
                        <div className="po-toolbar">
                            <select className="po-select" value={pageSize}
                                onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                        </div>
                    </div>

                    {!loading && totalRows > 0 && (
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                            {STATUSES.map(s => {
                                const cfg = STATUS_CFG[s];
                                const cnt = statusCounts[s] || 0;
                                if (!cnt) return null;
                                return (
                                    <div key={s} style={{
                                        background: cfg.bg, border: `1.5px solid ${cfg.dot}40`,
                                        borderLeft: `4px solid ${cfg.dot}`,
                                        borderRadius: 8, padding: '10px 16px', minWidth: 120,
                                        display: 'flex', flexDirection: 'column', gap: 2,
                                    }}>
                                        <div style={{ fontSize: 10.5, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                                            {s}
                                        </div>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: cfg.color, lineHeight: 1.1 }}>
                                            {cnt}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#94a3b8' }}>on this page</div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="po-table-wrap">
                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner">
                                <div className="po-spinner-ring" />
                                <span className="po-spinner-text">Loading…</span>
                            </div>
                        </div>
                    )}

                    <table className={`po-table${loading ? ' po-tbl-loading' : ''}`}>
                        <thead>
                            <tr>
                                <Th col="DocumentNo">Document</Th>
                                <th>Module</th>
                                <Th col="CurrentStatus">Approval Status</Th>
                                <th>Stage</th>
                                <th>Level</th>
                                <th>Waiting On</th>
                                <Th col="DocumentAmount" right>Amount</Th>
                                <th>Submitted By</th>
                                <Th col="SubmittedDate">Submitted</Th>
                                <Th col="DaysElapsed" right>Days</Th>
                                <th>Final Action</th>
                                <th>Completed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && !loading ? (
                                <tr>
                                    <td colSpan={12} className="po-empty">
                                        No PR/PO approval transactions match the current filters.
                                    </td>
                                </tr>
                            ) : rows.map((r, i) => {
                                const isPending = r.currentStatus === 'Pending';
                                const isSelected = selectedRow?.transactionId === r.transactionId;
                                return (
                                    <tr key={r.transactionId}
                                        onClick={() => setSelectedRow(r)}
                                        style={{
                                            background: isSelected ? '#eff6ff' : i % 2 === 0 ? '#fff' : '#f8fafc',
                                            cursor: 'pointer',
                                            outline: isSelected ? '2px solid #3b82f6' : 'none',
                                            outlineOffset: -2,
                                        }}>
                                        <td style={{ padding: '9px 12px' }}>
                                            <span style={{ fontWeight: 700, color: '#1e40af', fontSize: 13, fontFamily: 'monospace' }}>
                                                {r.documentNo}
                                            </span>
                                        </td>
                                        <td style={{ padding: '9px 12px' }}>
                                            <ModuleBadge code={r.moduleCode} />
                                        </td>
                                        <td style={{ padding: '9px 12px' }}>
                                            <StatusBadge status={r.currentStatus} />
                                        </td>
                                        <td style={{ padding: '9px 12px' }}>
                                            {r.documentStatusLabel
                                                ? <span style={{
                                                    display: 'inline-block', padding: '3px 9px', borderRadius: 20,
                                                    fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                                                    background: r.documentStatusBg || '#f1f5f9',
                                                    color: r.documentStatusColor || '#475569',
                                                  }}>{r.documentStatusLabel}</span>
                                                : <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>}
                                        </td>
                                        <td style={{ padding: '9px 12px' }}>
                                            <LevelPips current={r.currentLevelNo} total={r.totalLevels} />
                                        </td>
                                        {/* Procurement.css sets `white-space: nowrap` on every .po-table td, so
                                            the chip cannot wrap; maxWidth on the <td> alone does not clip it
                                            (no overflow:hidden), and a long resolved approver list
                                            ("Dhanish, Pandurang D Chaudhary, Ujwal Ramdas Chaudhari, …")
                                            measured 447px inside a 194px cell and overlapped Amount /
                                            Submitted By. Fixed-width inner div + overflow:hidden + ellipsis
                                            clips it instead; full list stays available via the title tooltip. */}
                                        <td style={{ padding: '9px 12px', fontSize: 11.5, color: isPending ? '#92400e' : '#94a3b8' }}>
                                            {isPending && r.currentApprover
                                                ? <div title={r.currentApprover} style={{
                                                    width: 170, maxWidth: 170, boxSizing: 'border-box',
                                                    background: '#fef3c7',
                                                    border: '1px solid #fde68a', borderRadius: 10,
                                                    padding: '2px 8px', fontWeight: 600,
                                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                  }}>{r.currentApprover}</div>
                                                : <span style={{ color: '#94a3b8' }}>—</span>
                                            }
                                        </td>
                                        <td className="po-num-cell" style={{ padding: '9px 12px', fontWeight: 600 }}>
                                            {r.documentAmount != null ? fmt(r.documentAmount) : '—'}
                                        </td>
                                        <td style={{ padding: '9px 12px', fontSize: 12, color: '#475569' }}>
                                            {r.submittedBy || '—'}
                                        </td>
                                        <td style={{ padding: '9px 12px', fontSize: 11.5, color: '#64748b', whiteSpace: 'nowrap' }}>
                                            {fmtDateTime(r.submittedDate)}
                                        </td>
                                        <td style={{ padding: '9px 12px', textAlign: 'right' }}>
                                            {r.daysElapsed != null
                                                ? <span style={{
                                                    fontWeight: 700, fontSize: 12,
                                                    color: isPending
                                                        ? r.daysElapsed > 5 ? '#dc2626' : r.daysElapsed > 2 ? '#d97706' : '#16a34a'
                                                        : '#94a3b8',
                                                  }}>{r.daysElapsed}d</span>
                                                : '—'}
                                        </td>
                                        <td style={{ padding: '9px 12px', fontSize: 11.5 }}>
                                            {r.finalAction ? (
                                                <div>
                                                    <span style={{
                                                        fontWeight: 700,
                                                        color: r.finalAction === 'Approved' ? '#166534' : '#991b1b',
                                                    }}>
                                                        {r.finalAction}
                                                    </span>
                                                    {r.finalActionBy && (
                                                        <div style={{ fontSize: 10.5, color: '#64748b', marginTop: 2 }}>
                                                            by {r.finalActionBy}
                                                        </div>
                                                    )}
                                                    {r.finalRemarks && (
                                                        <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 1, fontStyle: 'italic', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                                                            title={r.finalRemarks}>
                                                            "{r.finalRemarks}"
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span style={{ color: '#94a3b8' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '9px 12px', fontSize: 11.5, color: '#64748b', whiteSpace: 'nowrap' }}>
                                            {fmtDate(r.completedDate)}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {totalPages > 1 && (
                    <div className="po-pagination">
                        <div className="po-page-info">
                            Page <strong>{page}</strong> of <strong>{totalPages}</strong> · {totalRows.toLocaleString()} total
                        </div>
                        <div className="po-page-controls">
                            <button className="po-page-btn" onClick={() => goPage(1)}          disabled={page === 1}>«</button>
                            <button className="po-page-btn" onClick={() => goPage(page - 1)}   disabled={page === 1}>‹</button>
                            {pageNums().map(n => (
                                <button key={n}
                                    className={`po-page-btn${n === page ? ' po-page-btn-active' : ''}`}
                                    onClick={() => goPage(n)}>{n}</button>
                            ))}
                            <button className="po-page-btn" onClick={() => goPage(page + 1)}   disabled={page >= totalPages}>›</button>
                            <button className="po-page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                        </div>
                    </div>
                )}

            </div>
        </div>

        {selectedRow && (
            <HistoryDrawer
                row={selectedRow}
                onClose={() => setSelectedRow(null)}
                onNavigate={() => {
                    const route = MODULE_ROUTES[selectedRow.moduleCode];
                    if (route) navigate(route(selectedRow.documentId));
                }}
            />
        )}
        </>
    );
};

export default PrPoApprovalsPage;
