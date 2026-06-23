import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUserId, useCurrentUser } from '../AuthContext';
import ConfirmModal from '../common/ConfirmModal';
import { useFilters } from '../FilterContext';
import DocPreviewDrawer from './DocPreviewDrawer';
import '../procurement/Procurement.css';

// ── Budget-override modal — authorise approving past a budget ceiling ──────
const BudgetOverrideModal = ({ info, busy, onConfirm, onCancel }) => {
    const [password, setPassword] = useState('');
    const [reason,   setReason]   = useState('');
    const [err,      setErr]      = useState('');
    const submit = () => {
        if (!password.trim()) { setErr('Budget password is required.'); return; }
        if (!reason.trim())   { setErr('A reason is required.'); return; }
        onConfirm({ budgetPassword: password, overrideReason: reason.trim() });
    };
    return ReactDOM.createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
            onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget && !busy) onCancel(); }}>
            <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 480, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)', border: '2px solid #fcd34d' }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#92400e', marginBottom: 8 }}>⚠ Budget Exceeded — Authorise Override</div>
                <div style={{ fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '8px 12px', marginBottom: 14, lineHeight: 1.5 }}>
                    {info.message}
                </div>
                <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 14, lineHeight: 1.55 }}>
                    Approving this will exceed the budget. Enter your <strong>budget password</strong> to authorise and record the override (logged with your reason).
                </div>
                <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        Budget Password <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input type="password" value={password} autoFocus disabled={busy}
                        onChange={e => { setPassword(e.target.value); setErr(''); }}
                        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
                </div>
                <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        Reason <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <textarea rows={2} value={reason} disabled={busy}
                        onChange={e => { setReason(e.target.value); setErr(''); }}
                        placeholder="Why is the overrun being authorised?"
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                </div>
                {err && (
                    <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5, border: '1px solid #fecaca' }}>⚠ {err}</div>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onCancel} disabled={busy}
                        style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={submit} disabled={busy}
                        style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#d97706', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: busy ? .7 : 1 }}>
                        {busy ? 'Authorising…' : '⚠ Authorise & Approve'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ── Helpers ───────────────────────────────────────────────────────────────
const fmt = v => (v == null ? '—' : Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDateTime = d => d
    ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

const MODULES = [
    { code: 'PR',  label: 'Purchase Requests', icon: '🛒', color: '#1e40af', bg: '#eff6ff', route: id => `/purchase-requests/${id}` },
    { code: 'PO',  label: 'Purchase Orders',   icon: '📦', color: '#065f46', bg: '#f0fdfa', route: id => `/purchase-orders/${id}` },
    { code: 'INV', label: 'Invoices',          icon: '🧾', color: '#4c1d95', bg: '#faf5ff', route: id => `/invoices/${id}` },
    { code: 'JOB', label: 'Jobs',              icon: '🔧', color: '#7c2d12', bg: '#fff7ed', route: id => `/jobs/${id}` },
    { code: 'BOM', label: 'BOMs',              icon: '📋', color: '#0f766e', bg: '#f0fdfa', route: id => `/bom/${id}` },
    { code: 'MH',  label: 'Manhour Sheets',    icon: '⏱', color: '#9a3412', bg: '#fff7ed', route: id => `/manhour/${id}` },
    { code: 'ADJ', label: 'Stock Adjustments', icon: '⚖',  color: '#7c3aed', bg: '#f5f3ff', route: id => `/inventory-adjustment/${id}` },
    { code: 'SRV', label: 'Service Receipts',  icon: '🔧', color: '#0369a1', bg: '#f0f9ff', route: id => `/service-receipts/${id}` },
    { code: 'IRN', label: 'Issue Returns',     icon: '↩',  color: '#9d174d', bg: '#fdf2f8', route: id => `/inventory-issue-return/${id}` },
    { code: 'RV',  label: 'Receipt Vouchers', icon: '💵', color: '#166534', bg: '#f0fdf4', route: id => `/receipt-vouchers/${id}` },
    { code: 'PV',  label: 'Payment Vouchers', icon: '💳', color: '#1e40af', bg: '#eff6ff', route: id => `/payment-vouchers/${id}` },
    { code: 'CN',  label: 'Credit Notes',     icon: '➖', color: '#6d28d9', bg: '#f5f3ff', route: id => `/credit-notes/${id}` },
    { code: 'DN',  label: 'Debit Notes',      icon: '➕', color: '#b91c1c', bg: '#fef2f2', route: id => `/debit-notes/${id}` },
];

const moduleMeta = (code) => MODULES.find(m => m.code === code)
    || { code, label: code, icon: '📄', color: '#475569', bg: '#f8fafc', route: () => '#' };

const DEFAULT_FILTERS = {
    searchText:  '',
    moduleCode:  '',
    actionable:  'true',
    dateFrom:    '',
    dateTo:      '',
};

// ── Approval row ──────────────────────────────────────────────────────────
const ApprovalRow = ({ item, route, colSpan, expanded, onToggle, onOpen, onAction, acting, selected, onSelect, onPreview }) => {
    const currentUsers = (item.approverUsers     || '').split(', ').filter(Boolean);
    const nextUsers    = (item.nextApproverUsers || '').split(', ').filter(Boolean);
    const [remarks, setRemarks] = useState('');
    const busy = acting === item.transactionId;

    return (
        <>
            <tr style={{ opacity: item.canAct ? 1 : 0.6, borderBottom: expanded ? 'none' : '1px solid #f1f5f9', background: expanded ? '#f8fafc' : undefined }}>
                {/* Checkbox column */}
                <td style={{ padding: '8px 10px', width: 36, textAlign: 'center' }}>
                    {item.canAct && (
                        <input type="checkbox" checked={selected} onChange={() => onSelect(item.transactionId)}
                               style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#16a34a' }} />
                    )}
                </td>
                <td style={{ padding: '8px 12px' }}>
                    <span onClick={() => onToggle(item)}
                          style={{ fontWeight: 600, color: '#1d4ed8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontSize: 10, color: '#64748b' }}>{expanded ? '▾' : '▸'}</span>
                        {item.documentNo}
                    </span>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                    {item.documentAmount != null ? fmt(item.documentAmount) : '—'}
                </td>
                <td style={{ padding: '8px 12px' }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: '#92400e' }}>
                        L{item.currentLevelNo}/{item.totalLevels}{item.levelName ? ` · ${item.levelName}` : ''}
                    </div>
                    {currentUsers.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                            {currentUsers.map(name => (
                                <span key={name} style={{ fontSize: 10.5, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>
                                    {name}
                                </span>
                            ))}
                        </div>
                    )}
                </td>
                <td style={{ padding: '8px 12px' }}>
                    {item.nextLevelName ? (
                        <>
                            <div style={{ fontSize: 11.5, fontWeight: 600, color: '#1d4ed8' }}>
                                L{item.nextLevelNo} · {item.nextLevelName}
                            </div>
                            {nextUsers.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 3 }}>
                                    {nextUsers.map(name => (
                                        <span key={name} style={{ fontSize: 10.5, background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 10, padding: '1px 6px', fontWeight: 600 }}>
                                            {name}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </>
                    ) : (
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>Final level</span>
                    )}
                </td>
                <td style={{ padding: '8px 12px', fontSize: 12, color: '#475569' }}>{item.submittedBy}</td>
                <td style={{ padding: '8px 12px', fontSize: 11.5, color: '#64748b' }}>{fmtDateTime(item.submittedDate)}</td>
                <td style={{ padding: '8px 6px', textAlign: 'center', width: 36 }}>
                    <button
                        onClick={() => onPreview(item)}
                        title="Quick preview"
                        style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
                                 width: 28, height: 28, cursor: 'pointer', fontSize: 15,
                                 display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                 color: '#64748b', transition: 'all .12s' }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.background = '#eff6ff'; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'none'; }}>
                        👁
                    </button>
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>
                    <button className="po-act-btn po-act-open" onClick={() => onToggle(item)}>
                        {expanded ? 'Close' : 'Review'}
                    </button>
                </td>
            </tr>

            {expanded && (
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <td colSpan={colSpan} style={{ padding: '0 16px 14px 30px' }}>
                        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                                <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.8 }}>
                                    <div><strong>Document:</strong> {item.documentNo}
                                        {item.documentAmount != null && <> · <strong>Amount:</strong> {fmt(item.documentAmount)}</>}
                                    </div>
                                    <div><strong>Submitted by:</strong> {item.submittedBy} on {fmtDateTime(item.submittedDate)}</div>
                                    <div><strong>Current level:</strong> L{item.currentLevelNo} of {item.totalLevels}{item.levelName ? ` (${item.levelName})` : ''}</div>
                                </div>
                                <button className="po-act-btn po-act-open"
                                        disabled={!route}
                                        onClick={() => onOpen(item)}
                                        title={route ? 'Open the full document page' : 'No detail page available for this module'}>
                                    Open full document →
                                </button>
                            </div>

                            {item.canAct ? (
                                <div style={{ marginTop: 12, borderTop: '1px dashed #e2e8f0', paddingTop: 12 }}>
                                    <textarea
                                        value={remarks}
                                        onChange={e => setRemarks(e.target.value)}
                                        placeholder="Remarks (optional for approve, recommended for reject)…"
                                        rows={2}
                                        disabled={busy}
                                        style={{ width: '100%', boxSizing: 'border-box', fontSize: 12.5, padding: '7px 10px',
                                                 border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit' }}
                                    />
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                                        <button
                                            onClick={() => onAction(item, 'Reject', remarks)}
                                            disabled={busy}
                                            style={{ padding: '6px 16px', fontSize: 12.5, fontWeight: 600, borderRadius: 6,
                                                     border: '1px solid #fca5a5', background: '#fee2e2', color: '#991b1b',
                                                     cursor: busy ? 'not-allowed' : 'pointer' }}>
                                            {busy ? '…' : '✗ Reject'}
                                        </button>
                                        <button
                                            onClick={() => onAction(item, 'Approve', remarks)}
                                            disabled={busy}
                                            style={{ padding: '6px 16px', fontSize: 12.5, fontWeight: 600, borderRadius: 6,
                                                     border: 'none', background: '#16a34a', color: '#fff',
                                                     cursor: busy ? 'not-allowed' : 'pointer' }}>
                                            {busy ? '…' : '✓ Approve'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div style={{ marginTop: 12, borderTop: '1px dashed #e2e8f0', paddingTop: 12, fontSize: 12, color: '#b45309', background: '#fffbeb', padding: '8px 10px', borderRadius: 6 }}>
                                    ⓘ You can't act on this — it was submitted by you and this level doesn't allow self-approval.
                                </div>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
};

// ── Collapsible category section ──────────────────────────────────────────
const CategorySection = ({ moduleCode, items, onOpen, onToggle, onAction, expandedId, acting, selected, onSelect, onSelectAll, onPreview, defaultOpen = true }) => {
    const meta         = moduleMeta(moduleCode);
    const [open, setOpen] = useState(defaultOpen);

    const actionableIds = items.filter(i => i.canAct).map(i => i.transactionId);
    const allChecked    = actionableIds.length > 0 && actionableIds.every(id => selected.has(id));
    const someChecked   = actionableIds.some(id => selected.has(id));

    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderLeft: `4px solid ${meta.color}`,
            borderRadius: 8, marginBottom: 12, overflow: 'hidden',
        }}>
            <div onClick={() => setOpen(o => !o)}
                 style={{
                     padding: '12px 18px', background: meta.bg,
                     display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                     cursor: 'pointer', userSelect: 'none',
                 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Section select-all checkbox */}
                    {actionableIds.length > 0 && (
                        <input
                            type="checkbox"
                            checked={allChecked}
                            ref={el => { if (el) el.indeterminate = someChecked && !allChecked; }}
                            onChange={e => { e.stopPropagation(); onSelectAll(actionableIds, !allChecked); }}
                            onClick={e => e.stopPropagation()}
                            title={allChecked ? 'Deselect all in this section' : 'Select all actionable in this section'}
                            style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#16a34a', flexShrink: 0 }}
                        />
                    )}
                    <span style={{ fontSize: 20 }}>{meta.icon}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: meta.color }}>{meta.label}</span>
                    <span style={{ background: meta.color, color: '#fff', borderRadius: 12, padding: '2px 10px', fontSize: 11, fontWeight: 700 }}>
                        {items.length}
                    </span>
                    {someChecked && (
                        <span style={{ background: '#dcfce7', color: '#166534', borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600, border: '1px solid #86efac' }}>
                            {actionableIds.filter(id => selected.has(id)).length} selected
                        </span>
                    )}
                </div>
                <span style={{ fontSize: 14, color: meta.color, fontWeight: 700 }}>{open ? '▾' : '▸'}</span>
            </div>
            {open && (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                <th style={{ ...TH, width: 36 }}></th>
                                <th style={TH}>Document No</th>
                                <th style={{ ...TH, textAlign: 'right', width: 110 }}>Amount</th>
                                <th style={{ ...TH, minWidth: 160 }}>Current Level</th>
                                <th style={{ ...TH, minWidth: 160 }}>Next Level</th>
                                <th style={{ ...TH, minWidth: 120 }}>Submitted By</th>
                                <th style={{ ...TH, width: 140 }}>Submitted On</th>
                                <th style={{ ...TH, width: 36, textAlign: 'center' }}>👁</th>
                                <th style={{ ...TH, width: 90, textAlign: 'right' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => (
                                <ApprovalRow key={item.transactionId}
                                             item={item}
                                             route={meta.route}
                                             colSpan={9}
                                             expanded={expandedId === item.transactionId}
                                             onToggle={onToggle}
                                             onOpen={onOpen}
                                             onAction={onAction}
                                             acting={acting}
                                             selected={selected.has(item.transactionId)}
                                             onSelect={onSelect}
                                             onPreview={onPreview} />
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ── Bulk action bar ───────────────────────────────────────────────────────
const BulkBar = ({ count, allActionableCount, onSelectAll, onClearAll, onApprove, busy, progress }) => {
    const [remarks, setRemarks] = useState('');

    return (
        <div style={{
            position: 'sticky', top: 0, zIndex: 100,
            background: '#f0fdf4', border: '1px solid #86efac',
            borderRadius: 10, padding: '12px 16px', marginBottom: 14,
            display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10,
            boxShadow: '0 4px 16px rgba(22,163,74,0.15)',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 18 }}>✅</span>
                <span style={{ fontWeight: 700, fontSize: 13.5, color: '#166534' }}>
                    {count} item{count !== 1 ? 's' : ''} selected
                </span>
                <button onClick={onSelectAll} disabled={busy}
                        style={{ fontSize: 11.5, color: '#166534', background: 'none', border: '1px solid #86efac',
                                 borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}>
                    Select all {allActionableCount}
                </button>
                <button onClick={onClearAll} disabled={busy}
                        style={{ fontSize: 11.5, color: '#64748b', background: 'none', border: '1px solid #cbd5e1',
                                 borderRadius: 5, padding: '2px 8px', cursor: 'pointer' }}>
                    Clear
                </button>
            </div>

            <input
                value={remarks}
                onChange={e => setRemarks(e.target.value)}
                placeholder="Common remarks for all (optional)…"
                disabled={busy}
                style={{
                    flex: 1, minWidth: 200, fontSize: 12.5, padding: '6px 10px',
                    border: '1px solid #86efac', borderRadius: 6, background: '#fff',
                    fontFamily: 'inherit',
                }}
            />

            <button
                onClick={() => onApprove(remarks)}
                disabled={busy}
                style={{
                    padding: '8px 20px', borderRadius: 7, border: 'none',
                    background: busy ? '#86efac' : '#16a34a', color: '#fff',
                    fontWeight: 700, fontSize: 13, cursor: busy ? 'default' : 'pointer',
                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7,
                    whiteSpace: 'nowrap',
                }}>
                {busy ? (
                    <>
                        <span style={{
                            width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)',
                            borderTopColor: '#fff', borderRadius: '50%',
                            display: 'inline-block', animation: 'spin 0.7s linear infinite',
                        }} />
                        {progress ? `${progress.done}/${progress.total}…` : 'Approving…'}
                    </>
                ) : `✓ Approve ${count} selected`}
            </button>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────
const MyApprovalsPage = () => {
    const navigate    = useNavigate();
    const userId      = useCurrentUserId();
    const currentUser = useCurrentUser();
    const { registerFilters, unregisterFilters } = useFilters();

    const [items,      setItems]    = useState([]);
    const [loading,    setLoading]  = useState(false);
    const [error,      setError]    = useState('');
    const [applied,    setApplied]  = useState({ ...DEFAULT_FILTERS });
    const [expandedId, setExpanded] = useState(null);
    const [acting,     setActing]   = useState(null);
    const [toast,      setToast]    = useState('');

    // ── Bulk selection state ─────────────────────────────────────
    const [selected,     setSelected]     = useState(new Set());   // Set<transactionId>
    const [bulkActing,   setBulkActing]   = useState(false);
    const [bulkProgress, setBulkProgress] = useState(null);        // { done, total }

    // ── Preview drawer state ──────────────────────────────────────
    const [previewItem, setPreviewItem] = useState(null);          // approval item | null

    // ── Budget-override modal state ───────────────────────────────
    const [budgetOverride, setBudgetOverride] = useState(null);    // { item, remarks, message } | null

    const [confirm, setConfirm] = useState(null);

    const appliedRef = useRef(applied);
    useEffect(() => { appliedRef.current = applied; }, [applied]);

    const load = useCallback(() => {
        if (!userId) return;
        setLoading(true); setError('');
        fetch(`${variables.API_URL}approval/my/${userId}?page=1&pageSize=500`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(d => { setItems(Array.isArray(d.items) ? d.items : []); setSelected(new Set()); })
            .catch(() => setError('Failed to load approvals.'))
            .finally(() => setLoading(false));
    }, [userId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const defs = {
            searchText: { label: 'Search', type: 'text', placeholder: 'Doc no, submitter…' },
            moduleCode: {
                label: 'Category',
                type:  'multiselect',
                options: MODULES.map(m => ({ value: m.code, label: `${m.icon} ${m.label}` })),
            },
            actionable: {
                label: 'Actionable',
                type:  'radio',
                options: [
                    { value: '',      label: 'All' },
                    { value: 'true',  label: 'Can act now' },
                    { value: 'false', label: 'Waiting (cannot act)' },
                ],
            },
            dateFrom: { label: 'Submitted From', type: 'date' },
            dateTo:   { label: 'Submitted To',   type: 'date' },
        };
        const onApply = (vals) => setApplied({ ...vals });
        registerFilters('my-approvals', defs, DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('my-approvals');
    }, []); // eslint-disable-line

    const filtered = useMemo(() => {
        const s = (applied.searchText || '').trim().toLowerCase();
        const moduleCodes = (applied.moduleCode || '').split(',').filter(Boolean);
        const wantActionable = applied.actionable === 'true'
            ? true : applied.actionable === 'false' ? false : null;
        const from = applied.dateFrom ? new Date(applied.dateFrom).getTime() : null;
        const to   = applied.dateTo   ? new Date(applied.dateTo).getTime() + 24 * 3600 * 1000 - 1 : null;

        return items.filter(i => {
            if (moduleCodes.length > 0 && !moduleCodes.includes(i.moduleCode)) return false;
            if (wantActionable !== null && !!i.canAct !== wantActionable)      return false;
            if (from || to) {
                const t = i.submittedDate ? new Date(i.submittedDate).getTime() : null;
                if (t == null) return false;
                if (from && t < from) return false;
                if (to   && t > to)   return false;
            }
            if (s) {
                const hay = `${i.documentNo || ''} ${i.submittedBy || ''} ${i.levelName || ''}`.toLowerCase();
                if (!hay.includes(s)) return false;
            }
            return true;
        });
    }, [items, applied]);

    const groups = useMemo(() => {
        const map = new Map();
        for (const it of filtered) {
            if (!map.has(it.moduleCode)) map.set(it.moduleCode, []);
            map.get(it.moduleCode).push(it);
        }
        const known  = MODULES.filter(m => map.has(m.code)).map(m => [m.code, map.get(m.code)]);
        const others = [...map.entries()].filter(([code]) => !MODULES.some(m => m.code === code));
        return [...known, ...others];
    }, [filtered]);

    // All actionable items in the filtered view
    const allActionableItems = useMemo(() => filtered.filter(i => i.canAct), [filtered]);

    // ── Selection handlers ───────────────────────────────────────
    const toggleSelect = (transactionId) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(transactionId) ? next.delete(transactionId) : next.add(transactionId);
            return next;
        });
    };

    const selectAll = (ids, check) => {
        setSelected(prev => {
            const next = new Set(prev);
            ids.forEach(id => check ? next.add(id) : next.delete(id));
            return next;
        });
    };

    const selectAllActionable = () => selectAll(allActionableItems.map(i => i.transactionId), true);
    const clearAll             = () => setSelected(new Set());

    // Detect a budget-overrun rejection message from the engine
    const isBudgetBlock = (msg) => !!msg && /budget/i.test(msg) && /(exceed|over\s*by)/i.test(msg);

    // ── Single action (used by individual rows) ──────────────────
    // `override` = { budgetPassword, overrideReason } when re-trying past a budget block
    const doAction = async (item, action, remarks, override = null, skipRejectGuard = false) => {
        if (action === 'Reject' && !remarks?.trim() && !skipRejectGuard) {
            setConfirm({
                title: 'Confirm Rejection',
                message: 'Reject without remarks?',
                confirmLabel: 'Reject',
                confirmStyle: { background: '#dc2626', color: '#fff' },
                onConfirm: () => { setConfirm(null); doAction(item, action, remarks, override, true); },
            });
            return;
        }
        setActing(item.transactionId);
        try {
            const res = await fetch(`${variables.API_URL}approval/action`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    transactionId:  item.transactionId,
                    action,
                    actionBy:       userId,
                    actionByName:   currentUser,
                    remarks:        remarks?.trim() || null,
                    budgetPassword: override?.budgetPassword || null,
                    overrideReason: override?.overrideReason || null,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                const msg = d?.message || 'Action failed.';
                // First time we hit a budget block (no override yet): offer the override modal
                if (action === 'Approve' && !override && isBudgetBlock(msg)) {
                    setBudgetOverride({ item, remarks: remarks || '', message: msg });
                } else {
                    setToast(`⚠ ${msg}`);
                }
            } else {
                setToast(`✓ ${item.documentNo} ${action.toLowerCase()}d${d?.isComplete ? ' — fully approved' : ''}${override ? ' (budget override)' : ''}.`);
                setExpanded(null);
                setBudgetOverride(null);
                load();
            }
        } catch {
            setToast('⚠ Network error.');
        } finally {
            setActing(null);
            setTimeout(() => setToast(''), 4000);
        }
    };

    // ── Bulk approve ─────────────────────────────────────────────
    const doBulkApprove = async (remarks) => {
        const toApprove = allActionableItems.filter(i => selected.has(i.transactionId));
        if (toApprove.length === 0) return;

        setBulkActing(true);
        setBulkProgress({ done: 0, total: toApprove.length });

        let succeeded = 0;
        const errors  = [];

        for (const item of toApprove) {
            try {
                const res = await fetch(`${variables.API_URL}approval/action`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({
                        transactionId: item.transactionId,
                        action:        'Approve',
                        actionBy:      userId,
                        actionByName:  currentUser,
                        remarks:       remarks?.trim() || null,
                    }),
                });
                if (res.ok) { succeeded++; }
                else {
                    const d = await res.json().catch(() => ({}));
                    errors.push(`${item.documentNo}: ${d?.message || 'Failed'}`);
                }
            } catch {
                errors.push(`${item.documentNo}: Network error`);
            }
            setBulkProgress(p => ({ ...p, done: p.done + 1 }));
        }

        setBulkActing(false);
        setBulkProgress(null);

        if (errors.length === 0) {
            setToast(`✓ ${succeeded} item${succeeded !== 1 ? 's' : ''} approved successfully.`);
        } else {
            setToast(`✓ ${succeeded} approved · ⚠ ${errors.length} failed:\n${errors.join('\n')}`);
        }
        setTimeout(() => setToast(''), 6000);
        load();  // clears selection via setSelected(new Set())
    };

    const totalPending    = filtered.length;
    const totalActionable = filtered.filter(i => i.canAct).length;
    const grandTotal      = items.length;
    const selectedCount   = selected.size;

    return (
        <div className="po-page">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            <div className="po-grid-wrap">
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">My Approvals</div>
                            <div className="po-page-sub">
                                {loading
                                    ? 'Loading…'
                                    : grandTotal === 0
                                        ? "You're all caught up — nothing waiting for your action."
                                        : `${totalPending} of ${grandTotal} shown · ${totalActionable} actionable`}
                            </div>
                        </div>
                        <button className="po-btn-sec" onClick={load} disabled={loading}
                                style={{ padding: '5px 12px', fontSize: 12 }}>
                            ↻ Refresh
                        </button>
                    </div>

                    {!loading && grandTotal > 0 && (
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 14 }}>
                            {MODULES.map(m => {
                                const count = filtered.filter(i => i.moduleCode === m.code).length;
                                if (count === 0) return null;
                                return (
                                    <div key={m.code} style={{
                                        flex: '0 0 auto', minWidth: 140,
                                        background: m.bg, border: `1px solid ${m.color}30`,
                                        borderLeft: `4px solid ${m.color}`,
                                        borderRadius: 8, padding: '10px 14px',
                                    }}>
                                        <div style={{ fontSize: 10.5, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>
                                            {m.icon} {m.label}
                                        </div>
                                        <div style={{ fontSize: 22, fontWeight: 800, color: m.color, lineHeight: 1.1, marginTop: 3 }}>
                                            {count}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div style={{ padding: '16px 0', position: 'relative', minHeight: 120 }}>
                    {toast && (
                        <div style={{
                            marginBottom: 12, padding: '9px 14px', borderRadius: 8, fontSize: 13, fontWeight: 500,
                            background: toast.startsWith('✓') ? '#dcfce7' : '#fee2e2',
                            color:      toast.startsWith('✓') ? '#166534' : '#991b1b',
                            border: `1px solid ${toast.startsWith('✓') ? '#86efac' : '#fca5a5'}`,
                            whiteSpace: 'pre-line',
                        }}>
                            {toast}
                        </div>
                    )}

                    {/* ── Bulk action bar — only when items are selected ── */}
                    {selectedCount > 0 && (
                        <BulkBar
                            count={selectedCount}
                            allActionableCount={allActionableItems.length}
                            onSelectAll={selectAllActionable}
                            onClearAll={clearAll}
                            onApprove={doBulkApprove}
                            busy={bulkActing}
                            progress={bulkProgress}
                        />
                    )}

                    {loading && (
                        <div className="po-loading-overlay">
                            <div className="po-spinner">
                                <div className="po-spinner-ring" />
                                <div className="po-spinner-text">Loading…</div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div style={{ padding: '12px 16px', color: '#991b1b', background: '#fee2e2',
                                      border: '1px solid #fca5a5', borderRadius: 8, fontSize: 13 }}>
                            ⚠ {error}
                        </div>
                    )}

                    {!loading && !error && grandTotal === 0 && (
                        <div style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
                            <div style={{ fontSize: 48, marginBottom: 10 }}>✓</div>
                            <div style={{ fontSize: 16, fontWeight: 600, color: '#475569', marginBottom: 4 }}>
                                All caught up!
                            </div>
                            <div style={{ fontSize: 13 }}>No documents are waiting for your approval right now.</div>
                        </div>
                    )}

                    {!loading && !error && grandTotal > 0 && totalPending === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                            <div style={{ fontSize: 36, marginBottom: 8 }}>🔎</div>
                            <div style={{ fontSize: 14, color: '#475569' }}>No items match your filters.</div>
                            <div style={{ fontSize: 12, marginTop: 4 }}>Clear filters in the left panel to see all {grandTotal} pending items.</div>
                        </div>
                    )}

                    {!loading && !error && groups.map(([moduleCode, list]) => (
                        <CategorySection key={moduleCode}
                                         moduleCode={moduleCode}
                                         items={list}
                                         onOpen={openDocument}
                                         onToggle={toggleRow}
                                         onAction={doAction}
                                         expandedId={expandedId}
                                         acting={acting}
                                         selected={selected}
                                         onSelect={toggleSelect}
                                         onSelectAll={selectAll}
                                         onPreview={setPreviewItem} />
                    ))}
                </div>
            </div>

            <DocPreviewDrawer
                item={previewItem}
                onClose={() => setPreviewItem(null)}
                onOpenFull={openDocument}
            />

            {budgetOverride && (
                <BudgetOverrideModal
                    info={budgetOverride}
                    busy={acting === budgetOverride.item.transactionId}
                    onCancel={() => setBudgetOverride(null)}
                    onConfirm={(override) => doAction(budgetOverride.item, 'Approve', budgetOverride.remarks, override)}
                />
            )}
        </div>
    );

    function openDocument(item) {
        const meta = moduleMeta(item.moduleCode);
        if (meta.route) navigate(meta.route(item.documentId));
    }

    function toggleRow(item) {
        setExpanded(prev => (prev === item.transactionId ? null : item.transactionId));
    }
};

const TH = { padding: '8px 12px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px', color: '#475569', textAlign: 'left', whiteSpace: 'nowrap' };

export default MyApprovalsPage;
