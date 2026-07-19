import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import AmountInput from '../common/AmountInput';
import { useCurrentUser } from '../AuthContext';
import { usePermission } from '../PermissionContext';
import { useLookup } from '../LookupContext';
import { resolvePrintFormat } from '../print/printFormats';
import ApprovalHistoryTab   from '../approval/ApprovalHistoryTab';
import ApprovalStatusBanner from '../approval/ApprovalStatusBanner';
import InvoicePrintModal2   from '../invoice/InvoicePrintModal2';
import VoucherPrintModal    from '../common/VoucherPrintModal';
import AlertModal from '../common/AlertModal';
import ConfirmModal from '../common/ConfirmModal';
import '../jobs/JobDetail.css';
import '../procurement/Procurement.css';

const fmt = (n) => (n == null ? '0.00' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const STATUS_CFG = {
    Draft:           { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: 'Draft' },
    PendingApproval: { bg: '#fef9c3', color: '#854d0e', dot: '#eab308', label: 'Pending Approval' },
    PendingL1:       { bg: '#fef9c3', color: '#854d0e', dot: '#eab308', label: 'Pending Approval' },
    Approved:        { bg: '#dcfce7', color: '#166534', dot: '#22c55e', label: 'Approved' },
    Rejected:        { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Rejected' },
    Cancelled:       { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Cancelled' },
};

const RV_TABS = [
    { key: 'overview',    label: 'Overview',    icon: '📋' },
    { key: 'allocations', label: 'Allocations', icon: '💰', badge: true },
    { key: 'approval',    label: 'Approval',    icon: '✔' },
];

// ── Shared modal shell ────────────────────────────────────────────────────────
const ModalShell = ({ headerBg, headerBorder, headerColor, title, subtitle, onClose, children, footer }) => (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1200,
        display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}
        onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
        onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) onClose(); }}>
        <div style={{ background:'#fff', borderRadius:10, width:500, maxWidth:'100%',
            boxShadow:'0 12px 40px rgba(0,0,0,.22)', display:'flex', flexDirection:'column',
            maxHeight:'90vh', overflow:'hidden' }}>
            {/* header */}
            <div style={{ background: headerBg, borderBottom:`1px solid ${headerBorder}`,
                padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center',
                flexShrink:0 }}>
                <div>
                    <div style={{ fontWeight:700, fontSize:15, color: headerColor }}>{title}</div>
                    {subtitle && <div style={{ fontSize:12, color: headerColor, opacity:.75, marginTop:2 }}>{subtitle}</div>}
                </div>
                <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18,
                    cursor:'pointer', color: headerColor, lineHeight:1, opacity:.7 }}>✕</button>
            </div>
            {/* scrollable body */}
            <div style={{ padding:'18px 20px', overflowY:'auto', flex:1 }}>{children}</div>
            {/* footer */}
            <div style={{ padding:'12px 20px', borderTop:'1px solid #f1f5f9',
                display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>
                {footer}
            </div>
        </div>
    </div>
);

// ── Impact row helper ─────────────────────────────────────────────────────────
const ImpactRow = ({ icon, text, sub }) => (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'6px 0',
        borderBottom:'1px solid #f1f5f9' }}>
        <span style={{ fontSize:15, flexShrink:0, marginTop:1 }}>{icon}</span>
        <div>
            <div style={{ fontSize:12.5, color:'#1e293b', fontWeight:500 }}>{text}</div>
            {sub && <div style={{ fontSize:11.5, color:'#64748b', marginTop:2 }}>{sub}</div>}
        </div>
    </div>
);

// ── Revise Modal ─────────────────────────────────────────────────────────────
const ReviseModal = ({ rv, allocs, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);

    const hasAllocs    = allocs && allocs.length > 0;
    const allocTotal   = hasAllocs ? allocs.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0) : 0;
    const cur          = rv.currencyShort || '';

    const submit = async () => {
        if (!reason.trim())   { setErr('Please enter a reason.'); return; }
        if (!password.trim()) { setErr('Password is required.');  return; }
        setBusy(true); setErr('');
        const result = await onConfirm(reason.trim(), password);
        setBusy(false);
        if (result !== true) setErr(result || 'Revision failed.');
    };

    return (
        <ModalShell
            headerBg="#fef3c7" headerBorder="#fcd34d" headerColor="#92400e"
            title="Revise Receipt Voucher"
            subtitle={rv.rvNumber}
            onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Close</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding:'7px 22px', borderRadius:6, border:'none', cursor:'pointer',
                        fontWeight:600, fontSize:13, background:'#f59e0b', color:'#fff' }}>
                    {busy ? 'Revising…' : '✏️ Revise'}
                </button>
            </>}
        >
            {/* ── What will happen ── */}
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em',
                color:'#475569', marginBottom:8 }}>What will happen</div>

            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8,
                padding:'10px 14px', marginBottom:16 }}>
                <ImpactRow icon="📋"
                    text={`${rv.rvNumber} will return to Draft status`}
                    sub="The approval is cancelled and the voucher can be edited and re-submitted." />

                {hasAllocs ? (
                    <ImpactRow icon="🔗"
                        text={`${allocs.length} allocation${allocs.length > 1 ? 's' : ''} (${cur} ${fmt(allocTotal)}) will be suspended`}
                        sub="Allocations are kept on the voucher but will not count against invoices until re-approved. Invoice outstanding balances will temporarily increase." />
                ) : (
                    <ImpactRow icon="🔗"
                        text="No allocations — no invoice balances affected"
                        sub="This voucher has no payment allocations at this time." />
                )}

                <ImpactRow icon="💼"
                    text="Job payment records will be recalculated"
                    sub="Any jobs linked through allocated invoices will show reduced payments received until re-approval." />

                <ImpactRow icon="✏️"
                    text="You can then correct details and re-submit for approval"
                    sub="Amount received cannot be set below the currently allocated total." />
            </div>

            {hasAllocs && (
                <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase',
                        letterSpacing:'.05em', color:'#475569', marginBottom:6 }}>Suspended allocations</div>
                    <div style={{ border:'1px solid #e2e8f0', borderRadius:6, overflow:'hidden', fontSize:12.5 }}>
                        {allocs.map((a, i) => (
                            <div key={a.allocationId} style={{ display:'flex', justifyContent:'space-between',
                                padding:'6px 12px', background: i % 2 === 0 ? '#fff' : '#fafafa',
                                borderBottom: i < allocs.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                <span style={{ fontFamily:'monospace', fontWeight:600, color:'#1e3a5f' }}>{a.invoiceNo}</span>
                                <span style={{ color:'#b45309', fontWeight:600 }}>{cur} {fmt(a.allocatedAmount)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {err && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:6,
                padding:'7px 12px', fontSize:12.5, marginBottom:10 }}>✕ {err}</div>}

            <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>
                    Reason for revision <span style={{ color:'#e53e3e' }}>*</span>
                </label>
                <textarea rows={3} className="pf-input"
                    style={{ width:'100%', resize:'vertical', fontSize:13 }}
                    placeholder="Describe why this receipt voucher needs to be revised…"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>

            <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>
                    Authorisation password <span style={{ color:'#e53e3e' }}>*</span>
                </label>
                <input type="password" autoComplete="new-password" className="pf-input"
                    style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's revision password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Cancel Modal ──────────────────────────────────────────────────────────────
const CancelModal = ({ rv, allocs, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [busy,     setBusy]     = useState(false);
    const [err,      setErr]      = useState('');

    const hasAllocs  = allocs && allocs.length > 0;
    const allocTotal = hasAllocs ? allocs.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0) : 0;
    const cur        = rv.currencyShort || '';

    const submit = async () => {
        if (!reason.trim())   { setErr('Please enter a reason.'); return; }
        if (!password.trim()) { setErr('Password is required.');  return; }
        setBusy(true); setErr('');
        const result = await onConfirm(reason.trim(), password);
        setBusy(false);
        if (result !== true) setErr(result || 'Cancellation failed.');
    };

    return (
        <ModalShell
            headerBg="#fee2e2" headerBorder="#fca5a5" headerColor="#991b1b"
            title="Cancel Receipt Voucher"
            subtitle={rv.rvNumber}
            onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Close</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding:'7px 22px', borderRadius:6, border:'none', cursor:'pointer',
                        fontWeight:600, fontSize:13, background:'#dc2626', color:'#fff' }}>
                    {busy ? 'Cancelling…' : '⛔ Cancel Voucher'}
                </button>
            </>}
        >
            {/* ── Permanent warning banner ── */}
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8,
                padding:'10px 14px', marginBottom:16, display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:18, flexShrink:0 }}>⛔</span>
                <div>
                    <div style={{ fontWeight:700, fontSize:13, color:'#991b1b' }}>
                        This action is permanent and cannot be undone.
                    </div>
                    <div style={{ fontSize:12, color:'#b91c1c', marginTop:3 }}>
                        Cancelling removes this receipt voucher from all financial records.
                        The RV number will no longer be reusable.
                    </div>
                </div>
            </div>

            {/* ── What will happen ── */}
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em',
                color:'#475569', marginBottom:8 }}>What will happen</div>

            <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
                <ImpactRow icon="🚫"
                    text={`${rv.rvNumber} will be permanently cancelled`}
                    sub={`Status changes to Cancelled. Amount received: ${cur} ${fmt(rv.amountReceived)}`} />

                {hasAllocs ? (
                    <ImpactRow icon="↩️"
                        text={`${allocs.length} allocation${allocs.length > 1 ? 's' : ''} permanently reversed (${cur} ${fmt(allocTotal)})`}
                        sub="All invoice payments from this voucher will be removed. Invoice outstanding balances will be restored." />
                ) : (
                    <ImpactRow icon="↩️"
                        text="No allocations to reverse"
                        sub="This voucher has no payment allocations." />
                )}

                <ImpactRow icon="📊"
                    text="Invoice outstanding balances will increase"
                    sub={hasAllocs
                        ? `${allocs.length} invoice${allocs.length > 1 ? 's' : ''} will show higher outstanding balances.`
                        : 'No invoices affected.'} />

                <ImpactRow icon="💼"
                    text="Job payment records will be reduced"
                    sub="Jobs linked through the affected invoices will show lower payments received." />
            </div>

            {/* ── Affected invoices list ── */}
            {hasAllocs && (
                <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase',
                        letterSpacing:'.05em', color:'#475569', marginBottom:6 }}>
                        Allocations that will be reversed
                    </div>
                    <div style={{ border:'1px solid #fca5a5', borderRadius:6, overflow:'hidden', fontSize:12.5 }}>
                        {allocs.map((a, i) => (
                            <div key={a.allocationId} style={{ display:'flex', justifyContent:'space-between',
                                padding:'7px 12px', background: i % 2 === 0 ? '#fff5f5' : '#fff',
                                borderBottom: i < allocs.length - 1 ? '1px solid #fecaca' : 'none' }}>
                                <div>
                                    <span style={{ fontFamily:'monospace', fontWeight:600, color:'#7f1d1d' }}>{a.invoiceNo}</span>
                                    {a.jobId && <span style={{ fontSize:11, color:'#64748b', marginLeft:8 }}>Job: {a.jobId}</span>}
                                </div>
                                <span style={{ color:'#dc2626', fontWeight:600 }}>{cur} {fmt(a.allocatedAmount)}</span>
                            </div>
                        ))}
                        <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px',
                            background:'#fee2e2', fontWeight:700, fontSize:12.5 }}>
                            <span style={{ color:'#991b1b' }}>Total reversed</span>
                            <span style={{ color:'#dc2626' }}>{cur} {fmt(allocTotal)}</span>
                        </div>
                    </div>
                </div>
            )}

            {err && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:6,
                padding:'7px 12px', fontSize:12.5, marginBottom:10 }}>✕ {err}</div>}

            {/* ── Reason + Password ── */}
            <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>
                    Reason for cancellation <span style={{ color:'#e53e3e' }}>*</span>
                </label>
                <textarea rows={3} className="pf-input"
                    style={{ width:'100%', resize:'vertical', fontSize:13 }}
                    placeholder="Describe why this receipt voucher is being cancelled…"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>

            <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>
                    Authorisation password <span style={{ color:'#e53e3e' }}>*</span>
                </label>
                <input type="password" autoComplete="new-password" className="pf-input"
                    style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Main page ────────────────────────────────────────────────────────────────
const ReceiptVoucherDetail = () => {
    const { id }      = useParams();
    const navigate    = useNavigate();
    const currentUser = useCurrentUser();
    const { canDo }   = usePermission();
    const { baseCurrencyCode, getSetting } = useLookup();
    const canEdit     = canDo('/receipt-vouchers', 'EDIT');
    const canRevise   = canDo('/receipt-vouchers', 'REVISE');

    const [rv, setRv]         = useState(null);
    const [allocs, setAllocs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]   = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [busy, setBusy]     = useState(false);
    const [banner, setBanner] = useState('');
    const [approvalTx, setApprovalTx] = useState(null);
    const [showRevise, setShowRevise] = useState(false);
    const [showCancel, setShowCancel] = useState(false);
    const [showPrint,  setShowPrint]  = useState(false);
    const [confirm,    setConfirm]    = useState(null);

    const load = useCallback(() => {
        setLoading(true); setError(null);
        fetch(`${variables.API_URL}receiptvoucher/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setRv(d.receiptVoucher); setAllocs(d.allocations || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const deleteRv = () => {
        setConfirm({
            title: 'Delete Receipt Voucher',
            message: 'Delete this Draft receipt voucher? This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setBusy(true);
                try {
                    const res = await fetch(
                        `${variables.API_URL}receiptvoucher/${id}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setBanner(`✕ ${d?.message || 'Delete failed.'}`); return; }
                    navigate('/receipt-vouchers');
                } catch { setBanner('✕ Network error.'); }
                finally { setBusy(false); }
            },
        });
    };

    const handleRevise = async (reason, password) => {
        setBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}receiptvoucher/${id}/revise`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ reason, password, revisedBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Revision failed.';
            setShowRevise(false);
            setBanner(`✓ ${d.message || 'Receipt voucher revised.'}`);
            load();
            return true;
        } catch { return 'Network error. Please try again.'; }
        finally { setBusy(false); }
    };

    const handleCancel = async (reason, password) => {
        setBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}receiptvoucher/${id}/cancel`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ reason, password, cancelledBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Cancellation failed.';
            setShowCancel(false);
            setBanner(`✓ ${d.message || 'Receipt voucher cancelled.'}`);
            load();
            return true;
        } catch { return 'Network error. Please try again.'; }
        finally { setBusy(false); }
    };

    // ── Loading / Error ──────────────────────────────────────────────────────
    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading receipt voucher…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/receipt-vouchers')}>
                ← Back to Receipt Vouchers
            </button>
        </div>
    );
    if (!rv) return null;

    const cfg        = STATUS_CFG[rv.status] || STATUS_CFG.Draft;
    const isDraft    = rv.status === 'Draft';
    const isApproved = rv.status === 'Approved';

    const renderTab = () => {
        switch (activeTab) {
            case 'overview':
                return <OverviewTab rv={rv} isDraft={isDraft} canEdit={canEdit} currentUser={currentUser} onRefresh={load} />;
            case 'allocations':
                return <AllocationsTab rv={rv} allocs={allocs} isApproved={isApproved} currentUser={currentUser} onRefresh={load} />;
            case 'approval':
                return (
                    <ApprovalHistoryTab
                        moduleCode="RV"
                        documentId={rv.rvId}
                        documentNo={rv.rvNumber}
                        documentAmount={rv.amountReceived}
                        currencyId={rv.currencyId}
                        onStatusChange={load}
                        onTransactionLoad={setApprovalTx}
                    />
                );
            default: return null;
        }
    };

    return (
        <div className="jd-page">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/receipt-vouchers')}>← Receipt Vouchers</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{rv.rvNumber}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">{rv.customerName}</span>
                        {rv.revision > 0 && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-type">Rev {rv.revision}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: cfg.bg, color: cfg.color }}>
                        <span className="cd-flag-dot" style={{ background: cfg.dot }} />{cfg.label}
                    </span>
                    <button className="jd-stage-btn" onClick={() => setShowPrint(resolvePrintFormat('RV', getSetting))} disabled={busy}
                        style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
                        🖨 Print
                    </button>
                    {isApproved && canRevise && (
                        <button className="jd-stage-btn"
                            onClick={() => setShowRevise(true)}
                            disabled={busy}
                            style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
                            ✏️ Revise
                        </button>
                    )}
                    {isApproved && canEdit && (
                        <button className="jd-stage-btn"
                            onClick={() => setShowCancel(true)}
                            disabled={busy}
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            ⛔ Cancel Voucher
                        </button>
                    )}
                    {isDraft && canEdit && (
                        <button className="jd-stage-btn" onClick={deleteRv} disabled={busy}
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            {busy ? 'Deleting…' : '🗑 Delete'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            {(() => {
            const rate     = Number(rv.exchangeRate) || 1;
            const showBase = rate !== 1 && !!baseCurrencyCode;
            return (
            <div className="jd-kpi-strip">
                {[
                    { label: 'RV Date',     val: fmtDate(rv.rvDate) },
                    { label: 'Customer',    val: rv.customerName },
                    { label: 'Currency',    val: rv.currencyShort || '—' },
                    { label: 'Mode',        val: rv.paymentMode || '—' },
                    { label: 'Reference',   val: rv.referenceNo || '—' },
                    { label: 'Received',    val: fmt(rv.amountReceived),    cls: 'jd-kpi-blue', baseVal: rv.amountReceived },
                    { label: 'Allocated',   val: fmt(rv.allocatedAmount),                       baseVal: rv.allocatedAmount },
                    { label: 'Unallocated', val: fmt(rv.unallocatedAmount), cls: rv.unallocatedAmount > 0 ? 'jd-kpi-amber' : '', baseVal: rv.unallocatedAmount },
                ].map((k, i) => (
                    <React.Fragment key={k.label}>
                        {i > 0 && <div className="jd-kpi-div" />}
                        <div className="jd-kpi">
                            <div className="jd-kpi-label">{k.label}</div>
                            <div className={`jd-kpi-val ${k.cls || ''}`}>{k.val}</div>
                            {showBase && k.baseVal !== undefined && (
                                <div style={{ fontSize: 10.5, color: '#94a3b8', fontWeight: 600, marginTop: 2 }}>
                                    ≈ {fmt((Number(k.baseVal) || 0) * rate)} {baseCurrencyCode}
                                </div>
                            )}
                        </div>
                    </React.Fragment>
                ))}
            </div>
            );
            })()}

            {/* ── ACTION BANNER ── */}
            {banner && (
                <div style={{ margin: '10px 24px', padding: '8px 14px', borderRadius: 6, fontSize: 12.5,
                    background: banner.startsWith('✓') ? '#dcfce7' : '#fee2e2',
                    color: banner.startsWith('✓') ? '#166534' : '#991b1b' }}>
                    {banner}
                </div>
            )}

            {/* ── TAB BAR ── */}
            <div className="jd-tabs-bar">
                {RV_TABS.map(tab => {
                    const badge = tab.badge && tab.key === 'allocations' && allocs.length > 0
                        ? allocs.length : null;
                    return (
                        <button key={tab.key}
                            className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}>
                            <span className="jd-tab-icon">{tab.icon}</span>
                            {tab.label}
                            {badge != null && <span className="jd-tab-badge">{badge}</span>}
                        </button>
                    );
                })}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                {activeTab !== 'approval' && <ApprovalStatusBanner transaction={approvalTx} />}
                {renderTab()}
            </div>

            {showRevise && (
                <ReviseModal
                    rv={rv}
                    allocs={allocs}
                    onClose={() => setShowRevise(false)}
                    onConfirm={handleRevise}
                />
            )}
            {showPrint && (
                <VoucherPrintModal
                    kind="RV"
                    voucher={rv}
                    allocs={allocs}
                    onClose={() => setShowPrint(false)} />
            )}
            {showCancel && (
                <CancelModal
                    rv={rv}
                    allocs={allocs}
                    onClose={() => { setShowCancel(false); }}
                    onConfirm={(reason, password) => handleCancel(reason, password)}
                />
            )}
        </div>
    );
};

// ── Overview tab (editable in Draft) ────────────────────────────────────────
const OverviewTab = ({ rv, isDraft, canEdit, currentUser, onRefresh }) => {
    const { lookups, getVList } = useLookup();
    const currencies = lookups.currencies || [];
    const payModes   = getVList('Receipt', 'PaymentMode');

    const [editing, setEditing] = useState(false);
    const [form, setForm]   = useState({});
    const [err, setErr]     = useState('');
    const [saving, setSaving] = useState(false);

    const startEdit = () => {
        setForm({
            rvDate:        rv.rvDate        ? rv.rvDate.slice(0, 10)        : '',
            currencyId:    String(rv.currencyId  ?? ''),
            exchangeRate:  String(rv.exchangeRate ?? 1),
            amountReceived: String(rv.amountReceived ?? ''),
            paymentMode:   rv.paymentMode   || (payModes[0]?.value || ''),
            referenceNo:   rv.referenceNo   || '',
            referenceDate: rv.referenceDate ? rv.referenceDate.slice(0, 10) : '',
            bankName:      rv.bankName      || '',
            notes:         rv.notes         || '',
        });
        setErr(''); setEditing(true);
    };
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const pickCurrency = (id) => {
        const cur = currencies.find(c => String(c.id) === String(id));
        set('currencyId', id);
        if (cur) set('exchangeRate', String(cur.exchangeRate || 1));
    };

    const ischeque = form.paymentMode?.toLowerCase() === 'cheque';

    const save = async () => {
        setErr('');
        if (!form.currencyId)                         { setErr('Currency is required.');              return; }
        if (!form.exchangeRate || isNaN(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0)
                                                      { setErr('Exchange rate must be a number greater than 0.'); return; }
        if (!(Number(form.amountReceived) > 0))       { setErr('Amount must be greater than zero.'); return; }
        if (ischeque && !form.referenceNo?.trim())    { setErr('Cheque No is required.');             return; }
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}receiptvoucher/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    rvId:           rv.rvId,
                    rvDate:         form.rvDate,
                    customerId:     rv.customerId,
                    currencyId:     Number(form.currencyId),
                    exchangeRate:   Number(form.exchangeRate) || 1,
                    amountReceived: Number(form.amountReceived),
                    paymentMode:    form.paymentMode || null,
                    referenceNo:    form.referenceNo  || null,
                    referenceDate:  form.referenceDate || null,
                    bankName:       form.bankName  || null,
                    notes:          form.notes     || null,
                    modifiedBy:     currentUser,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setErr(d?.message || 'Save failed.'); return; }
            setEditing(false); onRefresh();
        } catch { setErr('Network error.'); }
        finally { setSaving(false); }
    };

    const Row = ({ label, val }) => (
        <div style={{ display: 'flex', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ width: 160, fontSize: 12, color: '#64748b', flexShrink: 0 }}>{label}</div>
            <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{val || '—'}</div>
        </div>
    );

    // ── Read-only view ───────────────────────────────────────────────────────
    if (!editing) {
        return (
            <div className="jd-tab-body" style={{ maxWidth: 560 }}>
                <Row label="Customer"        val={rv.customerName} />
                <Row label="RV Date"         val={fmtDate(rv.rvDate)} />
                <Row label="Currency"        val={rv.currencyShort} />
                <Row label="Amount Received" val={fmt(rv.amountReceived)} />
                <Row label="Payment Mode"    val={rv.paymentMode} />
                <Row label={rv.paymentMode?.toLowerCase() === 'cheque' ? 'Cheque No' : 'Reference No'} val={rv.referenceNo} />
                <Row label="Reference Date"  val={fmtDate(rv.referenceDate)} />
                <Row label="Bank"            val={rv.bankName} />
                <Row label="Notes"           val={rv.notes} />
                {isDraft && canEdit && (
                    <div style={{ marginTop: 16 }}>
                        <button className="pf-btn-pri" onClick={startEdit} style={{ padding: '7px 18px' }}>✎ Edit Details</button>
                    </div>
                )}
            </div>
        );
    }

    // ── Edit form ────────────────────────────────────────────────────────────
    const inp = { width: '100%', padding: '7px 9px', fontSize: 13 };
    const lbl = { fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 };
    return (
        <div className="jd-tab-body" style={{ maxWidth: 700 }}>
            {err && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>✕ {err}</div>}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

                <div style={{ flex: '0 0 150px' }}>
                    <label style={lbl}>RV Date</label>
                    <input type="date" className="pf-input" style={inp} value={form.rvDate} onChange={e => set('rvDate', e.target.value)} />
                </div>

                <div style={{ flex: '0 0 200px' }}>
                    <label style={lbl}>Currency <span style={{ color: '#e53e3e' }}>*</span></label>
                    <select className="pf-input" style={inp} value={form.currencyId} onChange={e => pickCurrency(e.target.value)}>
                        <option value="">— select —</option>
                        {currencies.map(c => (
                            <option key={c.id} value={c.id}>{c.shortName} — {c.name}</option>
                        ))}
                    </select>
                </div>

                <div style={{ flex: '0 0 130px' }}>
                    <label style={lbl}>Exchange Rate</label>
                    <input type="number" min="0" step="0.000001" className="pf-input" style={inp}
                        value={form.exchangeRate} onChange={e => set('exchangeRate', e.target.value)} />
                </div>

                <div style={{ flex: '0 0 170px' }}>
                    <label style={lbl}>Amount Received <span style={{ color: '#e53e3e' }}>*</span></label>
                    <AmountInput
                        className="pf-input"
                        style={inp}
                        value={form.amountReceived}
                        onChange={v => set('amountReceived', v)}
                    />
                </div>

                <div style={{ flex: '0 0 160px' }}>
                    <label style={lbl}>Payment Mode</label>
                    <select className="pf-input" style={inp} value={form.paymentMode}
                        onChange={e => { set('paymentMode', e.target.value); set('referenceNo', ''); }}>
                        {payModes.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>

                <div style={{ flex: '1 1 160px' }}>
                    <label style={lbl}>
                        {ischeque ? <>{`Cheque No`} <span style={{ color: '#e53e3e' }}>*</span></> : 'Reference No'}
                    </label>
                    <input className="pf-input" style={inp} value={form.referenceNo}
                        placeholder={ischeque ? 'Cheque number' : 'Transaction / ref number'}
                        onChange={e => set('referenceNo', e.target.value)} />
                </div>

                <div style={{ flex: '0 0 150px' }}>
                    <label style={lbl}>Reference Date</label>
                    <input type="date" className="pf-input" style={inp} value={form.referenceDate} onChange={e => set('referenceDate', e.target.value)} />
                </div>

                <div style={{ flex: '1 1 180px' }}>
                    <label style={lbl}>Bank</label>
                    <input className="pf-input" style={inp} value={form.bankName} onChange={e => set('bankName', e.target.value)} />
                </div>

                <div style={{ flex: '1 1 100%' }}>
                    <label style={lbl}>Notes</label>
                    <textarea className="pf-input pf-textarea" rows={2} style={inp} value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="pf-btn-sec" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
        </div>
    );
};

// ── Allocation Apply Modal ────────────────────────────────────────────────────
const AllocApplyModal = ({ rv, inv, amount, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);

    const cur           = inv.currencyShort || rv.currencyShort || '';
    const newOutstanding = Math.max(0, Number(inv.outstanding) - amount);
    const isUpdate       = Number(inv.thisRvAllocated) > 0;

    const submit = async () => {
        if (!reason.trim())   { setErr('Please enter a reason.'); return; }
        if (!password.trim()) { setErr('Password is required.');  return; }
        setBusy(true); setErr('');
        const result = await onConfirm(reason.trim(), password);
        setBusy(false);
        if (result !== true) setErr(result || 'Failed.');
    };

    return (
        <ModalShell
            headerBg="#eff6ff" headerBorder="#bfdbfe" headerColor="#1e40af"
            title={isUpdate ? 'Update Payment Allocation' : 'Apply Payment Allocation'}
            subtitle={`${rv.rvNumber} → ${inv.invoiceNo}`}
            onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Cancel</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding:'7px 22px', borderRadius:6, border:'none', cursor:'pointer',
                        fontWeight:600, fontSize:13, background:'#2563eb', color:'#fff' }}>
                    {busy ? 'Saving…' : '✔ Confirm'}
                </button>
            </>}
        >
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase',
                letterSpacing:'.05em', color:'#475569', marginBottom:8 }}>What will happen</div>

            <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
                <ImpactRow icon="🧾"
                    text={`Invoice ${inv.invoiceNo}${inv.jobId ? ` (Job: ${inv.jobId})` : ''}`}
                    sub={`${cur} ${fmt(amount)} will be applied. Outstanding: ${fmt(inv.outstanding)} → ${fmt(newOutstanding)}`} />
                <ImpactRow icon="💳"
                    text={`${rv.rvNumber} unallocated balance will decrease`}
                    sub={`Current unallocated: ${rv.currencyShort} ${fmt(rv.unallocatedAmount)}`} />
                <ImpactRow icon="💼"
                    text="Job payment records will be updated"
                    sub={inv.jobId ? `Job ${inv.jobId} will show higher payments received.` : 'No job linked to this invoice.'} />
            </div>

            {err && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:6,
                padding:'7px 12px', fontSize:12.5, marginBottom:10 }}>✕ {err}</div>}

            <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>
                    Reason <span style={{ color:'#e53e3e' }}>*</span>
                </label>
                <textarea rows={2} className="pf-input"
                    style={{ width:'100%', resize:'vertical', fontSize:13 }}
                    placeholder="Why is this allocation being applied?"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>
                    Authorisation password <span style={{ color:'#e53e3e' }}>*</span>
                </label>
                <input type="password" autoComplete="new-password" className="pf-input" style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Allocation Remove Modal ───────────────────────────────────────────────────
const AllocRemoveModal = ({ rv, alloc, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);

    const cur = rv.currencyShort || '';

    const submit = async () => {
        if (!reason.trim())   { setErr('Please enter a reason.'); return; }
        if (!password.trim()) { setErr('Password is required.');  return; }
        setBusy(true); setErr('');
        const result = await onConfirm(reason.trim(), password);
        setBusy(false);
        if (result !== true) setErr(result || 'Failed.');
    };

    return (
        <ModalShell
            headerBg="#fff7ed" headerBorder="#fed7aa" headerColor="#9a3412"
            title="Remove Allocation"
            subtitle={`${rv.rvNumber} → ${alloc.invoiceNo}`}
            onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Cancel</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding:'7px 22px', borderRadius:6, border:'none', cursor:'pointer',
                        fontWeight:600, fontSize:13, background:'#ea580c', color:'#fff' }}>
                    {busy ? 'Removing…' : '✕ Remove Allocation'}
                </button>
            </>}
        >
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase',
                letterSpacing:'.05em', color:'#475569', marginBottom:8 }}>What will happen</div>

            <div style={{ border:'1px solid #fed7aa', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
                <ImpactRow icon="↩️"
                    text={`${cur} ${fmt(alloc.allocatedAmount)} removed from invoice ${alloc.invoiceNo}`}
                    sub="This payment will no longer be counted against this invoice." />
                <ImpactRow icon="📊"
                    text="Invoice outstanding balance will increase"
                    sub={`Invoice ${alloc.invoiceNo} will show ${cur} ${fmt(alloc.allocatedAmount)} more as outstanding.`} />
                <ImpactRow icon="💳"
                    text={`${rv.rvNumber} unallocated balance will increase`}
                    sub={`Current unallocated: ${rv.currencyShort} ${fmt(rv.unallocatedAmount)}`} />
                <ImpactRow icon="💼"
                    text="Job payment records will be reduced"
                    sub={alloc.jobId ? `Job ${alloc.jobId} will show lower payments received.` : 'No job linked to this invoice.'} />
            </div>

            {err && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:6,
                padding:'7px 12px', fontSize:12.5, marginBottom:10 }}>✕ {err}</div>}

            <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>
                    Reason <span style={{ color:'#e53e3e' }}>*</span>
                </label>
                <textarea rows={2} className="pf-input"
                    style={{ width:'100%', resize:'vertical', fontSize:13 }}
                    placeholder="Why is this allocation being removed?"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>
                    Authorisation password <span style={{ color:'#e53e3e' }}>*</span>
                </label>
                <input type="password" autoComplete="new-password" className="pf-input" style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Allocations tab ──────────────────────────────────────────────────────────
const AllocationsTab = ({ rv, allocs, isApproved, currentUser, onRefresh }) => {
    const { baseCurrencyCode } = useLookup();
    const rate     = Number(rv.exchangeRate) || 1;
    const showBase = rate !== 1 && !!baseCurrencyCode;
    const [openInvoices, setOpenInvoices] = useState([]);
    const [inputs,       setInputs]       = useState({});
    const [loadingInv,   setLoadingInv]   = useState(false);
    const [err,          setErr]          = useState('');
    const [pendingApply,  setPendingApply]  = useState(null);  // { inv, amount }
    const [pendingRemove, setPendingRemove] = useState(null);  // alloc object
    const [historyInv,    setHistoryInv]   = useState(null);  // { invoiceId, invoiceNo } for history modal
    const [historyRows,   setHistoryRows]  = useState([]);
    const [historyLoading,setHistoryLoading] = useState(false);

    const loadOpen = useCallback(() => {
        if (!isApproved) return;
        setLoadingInv(true);
        const qs = new URLSearchParams({ customerId: String(rv.customerId), rvId: String(rv.rvId) });
        fetch(`${variables.API_URL}receiptvoucher/customer-open-invoices?${qs}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const list = Array.isArray(d) ? d : [];
                setOpenInvoices(list);
                const m = {};
                list.forEach(inv => { if (inv.thisRvAllocated > 0) m[inv.invoiceId] = String(inv.thisRvAllocated); });
                setInputs(m);
            })
            .catch(console.error)
            .finally(() => setLoadingInv(false));
    }, [rv, isApproved]);

    useEffect(() => { loadOpen(); }, [loadOpen]);

    // Open apply modal after validating the amount input
    const openApplyModal = (inv) => {
        setErr('');
        const amt = Number(inputs[inv.invoiceId]);
        if (!(amt > 0)) { setErr('Enter an amount greater than zero (use ✕ to remove an allocation).'); return; }
        setPendingApply({ inv, amount: amt });
    };

    // Called by AllocApplyModal on confirm
    const doApply = async (reason, password) => {
        const { inv, amount } = pendingApply;
        try {
            const res = await fetch(`${variables.API_URL}receiptvoucher/allocation/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    rvId: rv.rvId, invoiceId: inv.invoiceId, allocatedAmount: amount,
                    createdBy: currentUser, modifiedBy: currentUser,
                    reason, password,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Allocation failed.';
            setPendingApply(null);
            onRefresh(); loadOpen();
            return true;
        } catch { return 'Network error.'; }
    };

    // Open remove modal
    const openRemoveModal = (alloc) => {
        setErr('');
        setPendingRemove(alloc);
    };

    // Open allocation history modal for an invoice
    const openHistory = (inv) => {
        setHistoryInv(inv);
        setHistoryRows([]);
        setHistoryLoading(true);
        fetch(`${variables.API_URL}receiptvoucher/invoice-allocation-history?invoiceId=${inv.invoiceId}`,
            { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setHistoryRows(Array.isArray(d) ? d : []))
            .catch(() => setHistoryRows([]))
            .finally(() => setHistoryLoading(false));
    };

    // Called by AllocRemoveModal on confirm
    const doRemove = async (reason, password) => {
        try {
            const res = await fetch(
                `${variables.API_URL}receiptvoucher/allocation/${pendingRemove.allocationId}`,
                {
                    method: 'DELETE', headers: authHeaders(),
                    body: JSON.stringify({ modifiedBy: currentUser, reason, password }),
                }
            );
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Remove failed.';
            setPendingRemove(null);
            onRefresh(); loadOpen();
            return true;
        } catch { return 'Network error.'; }
    };

    const allocById = (invoiceId) => allocs.find(a => a.invoiceId === invoiceId);

    // ── Not yet approved ─────────────────────────────────────────────────────
    if (!isApproved) {
        return (
            <div className="jd-tab-body">
                <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8,
                    padding: '12px 16px', maxWidth: 560, fontSize: 13, color: '#78350f', marginBottom: 16 }}>
                    🔒 The receipt voucher must be <strong>Approved</strong> before invoices can be registered against it.
                    Submit it for approval using the <strong>Approval</strong> tab.
                </div>
                {allocs.length > 0 && <AllocTable allocs={allocs} title="Registered allocations" />}
            </div>
        );
    }

    // ── Approved — show open invoices for allocation ─────────────────────────
    return (
        <div className="jd-tab-body">
            {err && (
                <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6,
                    padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>✕ {err}</div>
            )}

            {/* Balance strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 14,
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px', fontSize: 13 }}>
                {[
                    { label: 'Received',    val: rv.amountReceived,    color: '#1e293b' },
                    { label: 'Allocated',   val: rv.allocatedAmount,   color: '#1e293b' },
                    { label: 'Unallocated', val: rv.unallocatedAmount, color: rv.unallocatedAmount > 0 ? '#b45309' : '#166534' },
                ].map((k, i) => (
                    <div key={k.label} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            {i > 0 && <span style={{ color: '#cbd5e1', marginRight: 8 }}>|</span>}
                            <span style={{ color: '#64748b' }}>{k.label}:</span>
                            <strong style={{ fontFamily: 'monospace', color: k.color }}>{fmt(k.val)}</strong>
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{rv.currencyShort}</span>
                        </div>
                        {showBase && (
                            <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, fontFamily: 'monospace',
                                paddingLeft: i > 0 ? 20 : 0 }}>
                                ≈ {fmt((Number(k.val) || 0) * rate)} {baseCurrencyCode}
                            </div>
                        )}
                    </div>
                ))}
                {rv.exchangeRate && rv.exchangeRate !== 1 && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
                        Rate: 1 {rv.currencyShort} = {Number(rv.exchangeRate).toFixed(4)} {baseCurrencyCode}
                    </span>
                )}
            </div>

            {/* Open invoices table */}
            {loadingInv ? (
                <div style={{ padding: '20px 0', color: '#64748b', fontSize: 13 }}>Loading open invoices…</div>
            ) : openInvoices.length === 0 ? (
                <div className="jd-empty-card">No open invoices found for {rv.customerName}.</div>
            ) : (
                <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
                        color: '#374151', marginBottom: 4 }}>Open Invoices — Apply Payment</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                        The <strong>Total Allocated</strong> field sets the <em>total</em> amount allocated from this RV against each invoice — entering a new value <em>replaces</em> the existing allocation. To increase from 200 → 500, enter 500 (not 300).
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <th style={TH_L}>Invoice</th>
                                <th style={TH_L}>Date</th>
                                <th style={TH_L}>Job</th>
                                <th style={TH_R}>Currency</th>
                                <th style={TH_R}>Total</th>
                                <th style={TH_R}>Current Outstanding</th>
                                <th style={TH_R}>Outstanding (before RV)</th>
                                <th style={{ ...TH_R, width: 160 }}>Total Allocated (this RV)</th>
                                <th style={{ ...TH_L, width: 100 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {openInvoices.map((inv, i) => {
                                const existing = allocById(inv.invoiceId);
                                return (
                                    <tr key={inv.invoiceId}
                                        style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600 }}>
                                            <button onClick={() => openHistory(inv)}
                                                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                                    fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                                                    color: '#1d4ed8', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                                                {inv.invoiceNo}
                                            </button>
                                        </td>
                                        <td style={TD}>{fmtDate(inv.invoiceDate)}</td>
                                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{inv.jobId || '—'}</td>
                                        <td style={{ ...TD_R, fontSize: 11, fontWeight: 700, color: '#475569' }}>{inv.currencyShort || '—'}</td>
                                        <td style={TD_R}>{fmt(inv.totalAmount)}</td>
                                        <td style={{ ...TD_R, fontWeight: 600, color: Math.max(0, Number(inv.outstanding) - Number(inv.thisRvAllocated || 0)) > 0 ? '#b45309' : '#166534' }}>
                                            {fmt(Math.max(0, Number(inv.outstanding) - Number(inv.thisRvAllocated || 0)))}
                                        </td>
                                        <td style={{ ...TD_R, color: '#64748b', fontWeight: 500 }}>
                                            {fmt(Number(inv.outstanding) + Number(inv.cnPaid || 0))}
                                        </td>
                                        <td style={TD_R}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{inv.currencyShort}</span>
                                                <AmountInput
                                                    className="pf-input"
                                                    value={inputs[inv.invoiceId] ?? ''}
                                                    onChange={v => setInputs(p => ({ ...p, [inv.invoiceId]: v }))}
                                                    style={{ width: 110, padding: '5px 8px', fontSize: 13 }} />
                                            </div>
                                            {inv.thisRvAllocated > 0 && rv.currencyShort && inv.currencyShort !== rv.currencyShort && (
                                                <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 2 }}>
                                                    ≈ {rv.currencyShort} {fmt(inv.thisRvAllocated * (inv.invoiceExchangeRate || 1) / (rv.exchangeRate || 1))}
                                                    {' '}(already applied)
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ ...TD, display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <button className="pf-btn-pri" style={{ padding: '4px 12px', fontSize: 11 }}
                                                onClick={() => openApplyModal(inv)}>
                                                Apply
                                            </button>
                                            {existing && (
                                                <button className="pf-btn-sec"
                                                    style={{ padding: '4px 8px', fontSize: 11, color: '#991b1b', borderColor: '#fca5a5' }}
                                                    onClick={() => openRemoveModal(existing)}>
                                                    ✕
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Registered allocations summary */}
            {allocs.length > 0 && <AllocTable allocs={allocs} title="Registered allocations" />}

            {/* Modals */}
            {pendingApply && (
                <AllocApplyModal
                    rv={rv}
                    inv={pendingApply.inv}
                    amount={pendingApply.amount}
                    onClose={() => setPendingApply(null)}
                    onConfirm={doApply}
                />
            )}
            {pendingRemove && (
                <AllocRemoveModal
                    rv={rv}
                    alloc={pendingRemove}
                    onClose={() => setPendingRemove(null)}
                    onConfirm={doRemove}
                />
            )}

            {/* Allocation history modal */}
            {historyInv && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                    onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
                    onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) setHistoryInv(null); }}>
                    <div style={{ background: '#fff', borderRadius: 10, width: 720, maxWidth: '100%',
                        boxShadow: '0 12px 40px rgba(0,0,0,.22)', display: 'flex', flexDirection: 'column',
                        maxHeight: '80vh', overflow: 'hidden' }}>

                        {/* header */}
                        <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe',
                            padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15, color: '#1e40af' }}>
                                    Allocation History
                                </div>
                                <div style={{ fontSize: 12, color: '#1e40af', opacity: .75, marginTop: 2 }}>
                                    {historyInv.invoiceNo}
                                </div>
                            </div>
                            <button onClick={() => setHistoryInv(null)}
                                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#1e40af', opacity: .7 }}>✕</button>
                        </div>

                        {/* body */}
                        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
                            {historyLoading ? (
                                <div style={{ color: '#64748b', fontSize: 13, padding: '20px 0' }}>Loading…</div>
                            ) : historyRows.length === 0 ? (
                                <div style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>
                                    No allocation history found for this invoice.
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={TH_L}>Receipt Voucher</th>
                                            <th style={TH_L}>RV Date</th>
                                            <th style={TH_L}>Status</th>
                                            <th style={TH_R}>Amount</th>
                                            <th style={TH_L}>Reason</th>
                                            <th style={TH_L}>By / Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyRows.map((h, i) => {
                                            const removed = !h.isActive;
                                            const rowBg   = removed
                                                ? (i % 2 === 0 ? '#fff5f5' : '#fff0f0')
                                                : (i % 2 === 0 ? '#fff'    : '#fafafa');
                                            return (
                                                <tr key={h.allocationId}
                                                    style={{ borderBottom: '1px solid #f1f5f9', background: rowBg,
                                                        opacity: removed ? .7 : 1 }}>
                                                    <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, color: '#1e3a5f' }}>
                                                        {h.rvNumber}
                                                        {removed && <span style={{ marginLeft: 6, fontSize: 10, color: '#dc2626',
                                                            background: '#fee2e2', borderRadius: 4, padding: '1px 5px', fontFamily: 'sans-serif' }}>removed</span>}
                                                    </td>
                                                    <td style={TD}>{fmtDate(h.rvDate)}</td>
                                                    <td style={TD}>
                                                        <span style={{
                                                            fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 7px',
                                                            background: h.rvStatus === 'Approved' ? '#dcfce7' : h.rvStatus === 'Cancelled' ? '#fee2e2' : '#f1f5f9',
                                                            color:      h.rvStatus === 'Approved' ? '#166534' : h.rvStatus === 'Cancelled' ? '#991b1b' : '#475569',
                                                        }}>{h.rvStatus}</span>
                                                    </td>
                                                    <td style={{ ...TD_R, fontWeight: 700,
                                                        color: removed ? '#dc2626' : '#1e293b',
                                                        textDecoration: removed ? 'line-through' : 'none' }}>
                                                        {fmt(h.allocatedAmount)}
                                                    </td>
                                                    <td style={{ ...TD, fontSize: 11, color: '#475569', fontStyle: h.reason ? 'normal' : 'italic' }}>
                                                        {h.reason || '—'}
                                                    </td>
                                                    <td style={{ ...TD, fontSize: 11, color: '#64748b' }}>
                                                        {fmtAudit(h.modifiedBy || h.createdBy, h.modifiedDate || h.createdDate)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        {/* footer */}
                        <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9',
                            display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                            <button className="pf-btn-sec" onClick={() => setHistoryInv(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Read-only allocations table (with full audit trail) ─────────────────────
const fmtAudit = (by, dt) => {
    if (!by) return '—';
    const d = dt ? new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    return d ? `${by} · ${d}` : by;
};

const AllocTable = ({ allocs, title }) => {
    const [printData, setPrintData] = useState(null);   // { invoice, lines }
    const [loadingId, setLoadingId] = useState(null);   // invoiceId being fetched
    const [alertMsg, setAlertMsg] = useState(null);

    const openPrint = async (invoiceId) => {
        setLoadingId(invoiceId);
        try {
            const res = await fetch(`${variables.API_URL}invoice/${invoiceId}`, { headers: authHeaders() });
            if (!res.ok) { setAlertMsg('Could not load invoice.'); return; }
            const d = await res.json();
            setPrintData({ invoice: d.invoice, lines: d.lines || [] });
        } catch { setAlertMsg('Network error loading invoice.'); }
        finally { setLoadingId(null); }
    };

    return (
        <div style={{ marginTop: 8 }}>
            {title && (
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                    letterSpacing: '.05em', color: '#374151', marginBottom: 8 }}>{title}</div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={TH_L}>Invoice</th>
                        <th style={TH_L}>Date</th>
                        <th style={TH_L}>Job</th>
                        <th style={TH_R}>Allocated</th>
                        <th style={TH_L}>Reason</th>
                        <th style={TH_L}>Created By</th>
                        <th style={TH_L}>Modified By</th>
                    </tr>
                </thead>
                <tbody>
                    {allocs.map((a, i) => (
                        <tr key={a.allocationId} style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                            <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600 }}>
                                <button
                                    onClick={() => openPrint(a.invoiceId)}
                                    disabled={loadingId === a.invoiceId}
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                        fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                                        color: loadingId === a.invoiceId ? '#94a3b8' : '#1d4ed8',
                                        textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                                    {loadingId === a.invoiceId ? '…' : a.invoiceNo}
                                </button>
                            </td>
                            <td style={TD}>{fmtDate(a.invoiceDate)}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{a.jobId || '—'}</td>
                            <td style={{ ...TD_R, fontWeight: 700 }}>
                                {a.invoiceCurrencyShort} {fmt(a.allocatedAmount)}
                                {a.rvCurrencyShort && a.rvCurrencyShort !== a.invoiceCurrencyShort && (
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginTop: 1 }}>
                                        {a.rvCurrencyShort} {fmt(a.allocatedAmountRvCcy)}
                                    </div>
                                )}
                            </td>
                            <td style={{ ...TD, fontSize: 11, color: '#475569', fontStyle: a.reason ? 'normal' : 'italic' }}>
                                {a.reason || '—'}
                            </td>
                            <td style={{ ...TD, fontSize: 11, color: '#64748b' }}>{fmtAudit(a.createdBy, a.createdDate)}</td>
                            <td style={{ ...TD, fontSize: 11, color: '#64748b' }}>{fmtAudit(a.modifiedBy, a.modifiedDate)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {printData && (
                <InvoicePrintModal2
                    invoice={printData.invoice}
                    lines={printData.lines}
                    onClose={() => setPrintData(null)}
                />
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

// ── Table styles ─────────────────────────────────────────────────────────────
const TH_L  = { padding: '9px 10px', textAlign: 'left',  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#475569', whiteSpace: 'nowrap' };
const TH_R  = { ...TH_L, textAlign: 'right' };
const TD    = { padding: '8px 10px', verticalAlign: 'middle' };
const TD_R  = { ...TD, textAlign: 'right', fontFamily: 'Courier New, monospace', fontSize: 12 };

export default ReceiptVoucherDetail;
