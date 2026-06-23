import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import AmountInput from '../common/AmountInput';
import { useCurrentUser } from '../AuthContext';
import { usePermission } from '../PermissionContext';
import { useLookup } from '../LookupContext';
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
const fmtAudit = (by, dt) => {
    if (!by) return '—';
    const d = dt ? new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    return d ? `${by} · ${d}` : by;
};


const STATUS_CFG = {
    Draft:           { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: 'Draft' },
    PendingApproval: { bg: '#fef9c3', color: '#854d0e', dot: '#eab308', label: 'Pending Approval' },
    PendingL1:       { bg: '#fef9c3', color: '#854d0e', dot: '#eab308', label: 'Pending Approval' },
    Approved:        { bg: '#dcfce7', color: '#166534', dot: '#22c55e', label: 'Approved' },
    Rejected:        { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Rejected' },
    Cancelled:       { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Cancelled' },
};

const CN_TABS = [
    { key: 'overview',    label: 'Overview',    icon: '📋' },
    { key: 'allocations', label: 'Allocations', icon: '💳', badge: true },
    { key: 'approval',    label: 'Approval',    icon: '✔' },
];

// ── Table styles ──────────────────────────────────────────────────────────────
const TH_L = { padding: '9px 10px', textAlign: 'left',  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em', color: '#475569', whiteSpace: 'nowrap' };
const TH_R = { ...TH_L, textAlign: 'right' };
const TD   = { padding: '8px 10px', verticalAlign: 'middle' };
const TD_R = { ...TD, textAlign: 'right', fontFamily: 'Courier New, monospace', fontSize: 12 };

// ── Shared modal shell ────────────────────────────────────────────────────────
const ModalShell = ({ headerBg, headerBorder, headerColor, title, subtitle, onClose, children, footer }) => (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.5)', zIndex:1200,
        display:'flex', alignItems:'center', justifyContent:'center', padding:'16px' }}
        onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
        onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) onClose(); }}>
        <div style={{ background:'#fff', borderRadius:10, width:500, maxWidth:'100%',
            boxShadow:'0 12px 40px rgba(0,0,0,.22)', display:'flex', flexDirection:'column',
            maxHeight:'90vh', overflow:'hidden' }}>
            <div style={{ background: headerBg, borderBottom:`1px solid ${headerBorder}`,
                padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
                <div>
                    <div style={{ fontWeight:700, fontSize:15, color: headerColor }}>{title}</div>
                    {subtitle && <div style={{ fontSize:12, color: headerColor, opacity:.75, marginTop:2 }}>{subtitle}</div>}
                </div>
                <button onClick={onClose} style={{ background:'none', border:'none', fontSize:18,
                    cursor:'pointer', color: headerColor, lineHeight:1, opacity:.7 }}>✕</button>
            </div>
            <div style={{ padding:'18px 20px', overflowY:'auto', flex:1 }}>{children}</div>
            <div style={{ padding:'12px 20px', borderTop:'1px solid #f1f5f9',
                display:'flex', gap:8, justifyContent:'flex-end', flexShrink:0 }}>
                {footer}
            </div>
        </div>
    </div>
);

// ── Impact row helper ────────────────────────────────────────────────────────
const ImpactRow = ({ icon, text, sub }) => (
    <div style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'6px 0', borderBottom:'1px solid #f1f5f9' }}>
        <span style={{ fontSize:15, flexShrink:0, marginTop:1 }}>{icon}</span>
        <div>
            <div style={{ fontSize:12.5, color:'#1e293b', fontWeight:500 }}>{text}</div>
            {sub && <div style={{ fontSize:11.5, color:'#64748b', marginTop:2 }}>{sub}</div>}
        </div>
    </div>
);

// ── Revise Modal ─────────────────────────────────────────────────────────────
const ReviseModal = ({ cn, allocs, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);

    const hasAllocs  = allocs && allocs.length > 0;
    const allocTotal = hasAllocs ? allocs.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0) : 0;
    const cur        = cn.currencyShort || '';

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
            title="Revise Credit Note" subtitle={cn.cnNumber} onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Close</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding:'7px 22px', borderRadius:6, border:'none', cursor:'pointer',
                        fontWeight:600, fontSize:13, background:'#f59e0b', color:'#fff' }}>
                    {busy ? 'Revising…' : 'Revise'}
                </button>
            </>}
        >
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#475569', marginBottom:8 }}>What will happen</div>
            <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
                <ImpactRow icon="📋" text={`${cn.cnNumber} will return to Draft status`} sub="The approval is cancelled and the credit note can be edited and re-submitted." />
                {hasAllocs ? (
                    <ImpactRow icon="🔗"
                        text={`${allocs.length} allocation${allocs.length > 1 ? 's' : ''} (${cur} ${fmt(allocTotal)}) will be suspended`}
                        sub="Allocations are removed. Invoice outstanding balances will temporarily increase." />
                ) : (
                    <ImpactRow icon="🔗" text="No allocations — no invoice balances affected" sub="This credit note has no allocations at this time." />
                )}
                <ImpactRow icon="✏️" text="You can then correct details and re-submit for approval" sub="Credit amount cannot be set below any re-applied allocation total." />
            </div>

            {hasAllocs && (
                <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#475569', marginBottom:6 }}>Suspended allocations</div>
                    <div style={{ border:'1px solid #e2e8f0', borderRadius:6, overflow:'hidden', fontSize:12.5 }}>
                        {allocs.map((a, i) => (
                            <div key={a.allocationId} style={{ display:'flex', justifyContent:'space-between', padding:'6px 12px',
                                background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: i < allocs.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                <span style={{ fontFamily:'monospace', fontWeight:600, color:'#1e3a5f' }}>{a.invoiceNo}</span>
                                <span style={{ color:'#b45309', fontWeight:600 }}>{cur} {fmt(a.allocatedAmount)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {err && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:6, padding:'7px 12px', fontSize:12.5, marginBottom:10 }}>✕ {err}</div>}
            <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Reason for revision <span style={{ color:'#e53e3e' }}>*</span></label>
                <textarea rows={3} className="pf-input" style={{ width:'100%', resize:'vertical', fontSize:13 }}
                    placeholder="Describe why this credit note needs to be revised…"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Authorisation password <span style={{ color:'#e53e3e' }}>*</span></label>
                <input type="password" className="pf-input" style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's revision password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Cancel Modal ─────────────────────────────────────────────────────────────
const CancelModal = ({ cn, allocs, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [busy,     setBusy]     = useState(false);
    const [err,      setErr]      = useState('');

    const hasAllocs  = allocs && allocs.length > 0;
    const allocTotal = hasAllocs ? allocs.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0) : 0;
    const cur        = cn.currencyShort || '';

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
            title="Cancel Credit Note" subtitle={cn.cnNumber} onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Close</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding:'7px 22px', borderRadius:6, border:'none', cursor:'pointer',
                        fontWeight:600, fontSize:13, background:'#dc2626', color:'#fff' }}>
                    {busy ? 'Cancelling…' : 'Cancel Credit Note'}
                </button>
            </>}
        >
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8,
                padding:'10px 14px', marginBottom:16, display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:18, flexShrink:0 }}>⛔</span>
                <div>
                    <div style={{ fontWeight:700, fontSize:13, color:'#991b1b' }}>This action is permanent and cannot be undone.</div>
                    <div style={{ fontSize:12, color:'#b91c1c', marginTop:3 }}>Cancelling removes this credit note from all financial records.</div>
                </div>
            </div>

            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#475569', marginBottom:8 }}>What will happen</div>
            <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
                <ImpactRow icon="🚫" text={`${cn.cnNumber} will be permanently cancelled`}
                    sub={`Status changes to Cancelled. Credit amount: ${cur} ${fmt(cn.creditAmount)}`} />
                {hasAllocs ? (
                    <ImpactRow icon="↩️"
                        text={`${allocs.length} allocation${allocs.length > 1 ? 's' : ''} permanently reversed (${cur} ${fmt(allocTotal)})`}
                        sub="All invoice credits from this note will be removed. Invoice outstanding balances will be restored." />
                ) : (
                    <ImpactRow icon="↩️" text="No allocations to reverse" sub="This credit note has no allocations." />
                )}
                <ImpactRow icon="📊" text="Invoice outstanding balances will increase"
                    sub={hasAllocs ? `${allocs.length} invoice${allocs.length > 1 ? 's' : ''} will show higher outstanding balances.` : 'No invoices affected.'} />
            </div>

            {hasAllocs && (
                <div style={{ marginBottom:16 }}>
                    <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#475569', marginBottom:6 }}>Allocations that will be reversed</div>
                    <div style={{ border:'1px solid #fca5a5', borderRadius:6, overflow:'hidden', fontSize:12.5 }}>
                        {allocs.map((a, i) => (
                            <div key={a.allocationId} style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px',
                                background: i % 2 === 0 ? '#fff5f5' : '#fff', borderBottom: i < allocs.length - 1 ? '1px solid #fecaca' : 'none' }}>
                                <div>
                                    <span style={{ fontFamily:'monospace', fontWeight:600, color:'#7f1d1d' }}>{a.invoiceNo}</span>
                                    {a.jobId && <span style={{ fontSize:11, color:'#64748b', marginLeft:8 }}>Job: {a.jobId}</span>}
                                </div>
                                <span style={{ color:'#dc2626', fontWeight:600 }}>{cur} {fmt(a.allocatedAmount)}</span>
                            </div>
                        ))}
                        <div style={{ display:'flex', justifyContent:'space-between', padding:'7px 12px', background:'#fee2e2', fontWeight:700, fontSize:12.5 }}>
                            <span style={{ color:'#991b1b' }}>Total reversed</span>
                            <span style={{ color:'#dc2626' }}>{cur} {fmt(allocTotal)}</span>
                        </div>
                    </div>
                </div>
            )}

            {err && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:6, padding:'7px 12px', fontSize:12.5, marginBottom:10 }}>✕ {err}</div>}
            <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Reason for cancellation <span style={{ color:'#e53e3e' }}>*</span></label>
                <textarea rows={3} className="pf-input" style={{ width:'100%', resize:'vertical', fontSize:13 }}
                    placeholder="Describe why this credit note is being cancelled…"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Authorisation password <span style={{ color:'#e53e3e' }}>*</span></label>
                <input type="password" className="pf-input" style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Alloc Apply Modal ─────────────────────────────────────────────────────────
const AllocApplyModal = ({ cn, inv, amount, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);

    const cur            = inv.currencyShort || cn.currencyShort || '';
    const newOutstanding = Math.max(0, Number(inv.outstanding) - amount);
    const isUpdate       = Number(inv.thisCnAllocated) > 0;

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
            title={isUpdate ? 'Update Credit Allocation' : 'Apply Credit Allocation'}
            subtitle={`${cn.cnNumber} → ${inv.invoiceNo}`}
            onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Cancel</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding:'7px 22px', borderRadius:6, border:'none', cursor:'pointer',
                        fontWeight:600, fontSize:13, background:'#2563eb', color:'#fff' }}>
                    {busy ? 'Saving…' : 'Confirm'}
                </button>
            </>}
        >
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#475569', marginBottom:8 }}>What will happen</div>
            <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
                <ImpactRow icon="🧾"
                    text={`Invoice ${inv.invoiceNo}${inv.jobId ? ` (Job: ${inv.jobId})` : ''}`}
                    sub={`${cur} ${fmt(amount)} credit applied. Outstanding: ${fmt(inv.outstanding)} → ${fmt(newOutstanding)}`} />
                <ImpactRow icon="💳"
                    text={`${cn.cnNumber} unallocated balance will decrease`}
                    sub={`Current unallocated: ${cn.currencyShort} ${fmt(cn.unallocatedAmount)}`} />
            </div>

            {err && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:6, padding:'7px 12px', fontSize:12.5, marginBottom:10 }}>✕ {err}</div>}
            <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Reason <span style={{ color:'#e53e3e' }}>*</span></label>
                <textarea rows={2} className="pf-input" style={{ width:'100%', resize:'vertical', fontSize:13 }}
                    placeholder="Why is this credit being applied?"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Authorisation password <span style={{ color:'#e53e3e' }}>*</span></label>
                <input type="password" className="pf-input" style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Alloc Remove Modal ────────────────────────────────────────────────────────
const AllocRemoveModal = ({ cn, alloc, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);

    const cur = cn.currencyShort || '';

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
            title="Remove Allocation" subtitle={`${cn.cnNumber} → ${alloc.invoiceNo}`}
            onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Cancel</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding:'7px 22px', borderRadius:6, border:'none', cursor:'pointer',
                        fontWeight:600, fontSize:13, background:'#ea580c', color:'#fff' }}>
                    {busy ? 'Removing…' : 'Remove Allocation'}
                </button>
            </>}
        >
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#475569', marginBottom:8 }}>What will happen</div>
            <div style={{ border:'1px solid #fed7aa', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
                <ImpactRow icon="↩️"
                    text={`${cur} ${fmt(alloc.allocatedAmount)} credit removed from invoice ${alloc.invoiceNo}`}
                    sub="This credit will no longer reduce this invoice's outstanding balance." />
                <ImpactRow icon="📊" text="Invoice outstanding balance will increase"
                    sub={`Invoice ${alloc.invoiceNo} will show ${cur} ${fmt(alloc.allocatedAmount)} more as outstanding.`} />
                <ImpactRow icon="💳" text={`${cn.cnNumber} unallocated balance will increase`}
                    sub={`Current unallocated: ${cn.currencyShort} ${fmt(cn.unallocatedAmount)}`} />
            </div>

            {err && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:6, padding:'7px 12px', fontSize:12.5, marginBottom:10 }}>✕ {err}</div>}
            <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Reason <span style={{ color:'#e53e3e' }}>*</span></label>
                <textarea rows={2} className="pf-input" style={{ width:'100%', resize:'vertical', fontSize:13 }}
                    placeholder="Why is this allocation being removed?"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Authorisation password <span style={{ color:'#e53e3e' }}>*</span></label>
                <input type="password" className="pf-input" style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const CreditNoteDetail = () => {
    const { id }      = useParams();
    const navigate    = useNavigate();
    const currentUser = useCurrentUser();
    const { canDo }   = usePermission();
    const canEdit     = canDo('/credit-notes', 'EDIT');
    const canRevise   = canDo('/credit-notes', 'REVISE');

    const [cn, setCn]           = useState(null);
    const [allocs, setAllocs]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [busy, setBusy]       = useState(false);
    const [banner, setBanner]   = useState('');
    const [approvalTx, setApprovalTx] = useState(null);
    const [showRevise, setShowRevise] = useState(false);
    const [showCancel, setShowCancel] = useState(false);
    const [showPrint,  setShowPrint]  = useState(false);
    const [confirm,    setConfirm]    = useState(null);

    const load = useCallback(() => {
        setLoading(true); setError(null);
        fetch(`${variables.API_URL}creditnote/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setCn(d.creditNote); setAllocs(d.allocations || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const deleteCn = () => {
        setConfirm({
            title: 'Delete Credit Note',
            message: 'Delete this Draft credit note? This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setBusy(true);
                try {
                    const res = await fetch(
                        `${variables.API_URL}creditnote/${id}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setBanner(`✕ ${d?.message || 'Delete failed.'}`); return; }
                    navigate('/credit-notes');
                } catch { setBanner('✕ Network error.'); }
                finally { setBusy(false); }
            },
        });
    };

    const handleRevise = async (reason, password) => {
        setBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}creditnote/${id}/revise`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ reason, password, revisedBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Revision failed.';
            setShowRevise(false);
            setBanner(`✓ ${d.message || 'Credit note revised.'}`);
            load(); return true;
        } catch { return 'Network error. Please try again.'; }
        finally { setBusy(false); }
    };

    const handleCancel = async (reason, password) => {
        setBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}creditnote/${id}/cancel`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ reason, password, cancelledBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Cancellation failed.';
            setShowCancel(false);
            setBanner(`✓ ${d.message || 'Credit note cancelled.'}`);
            load(); return true;
        } catch { return 'Network error. Please try again.'; }
        finally { setBusy(false); }
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading credit note…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/credit-notes')}>
                ← Back to Credit Notes
            </button>
        </div>
    );
    if (!cn) return null;

    const cfg        = STATUS_CFG[cn.status] || STATUS_CFG.Draft;
    const isDraft    = cn.status === 'Draft';
    const isApproved = cn.status === 'Approved';

    const renderTab = () => {
        switch (activeTab) {
            case 'overview':
                return <OverviewTab cn={cn} isDraft={isDraft} canEdit={canEdit} currentUser={currentUser} onRefresh={load} />;
            case 'allocations':
                return <AllocationsTab cn={cn} allocs={allocs} isApproved={isApproved} currentUser={currentUser} onRefresh={load} />;
            case 'approval':
                return (
                    <ApprovalHistoryTab
                        moduleCode="CN"
                        documentId={cn.cnId}
                        documentNo={cn.cnNumber}
                        documentAmount={cn.creditAmount}
                        currencyId={cn.currencyId}
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

            {/* HEADER */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/credit-notes')}>← Credit Notes</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{cn.cnNumber}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">{cn.customerName}</span>
                        {cn.creditType && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-type">{cn.creditType}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: cfg.bg, color: cfg.color }}>
                        <span className="cd-flag-dot" style={{ background: cfg.dot }} />{cfg.label}
                    </span>
                    <button className="jd-stage-btn" onClick={() => setShowPrint(true)}
                        style={{ background: '#eef2ff', color: '#3730a3', borderColor: '#c7d2fe' }}>
                        🖨 Print
                    </button>
                    {isApproved && canRevise && (
                        <button className="jd-stage-btn" onClick={() => setShowRevise(true)} disabled={busy}
                            style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
                            Revise
                        </button>
                    )}
                    {isApproved && canEdit && (
                        <button className="jd-stage-btn" onClick={() => setShowCancel(true)} disabled={busy}
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            Cancel CN
                        </button>
                    )}
                    {isDraft && canEdit && (
                        <button className="jd-stage-btn" onClick={deleteCn} disabled={busy}
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            {busy ? 'Deleting…' : 'Delete'}
                        </button>
                    )}
                </div>
            </div>

            {/* KPI STRIP */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'CN Date',      val: fmtDate(cn.cnDate) },
                    { label: 'Customer',     val: cn.customerName },
                    { label: 'Currency',     val: cn.currencyShort || '—' },
                    { label: 'Type',         val: cn.creditType || '—' },
                    { label: 'Credit',       val: fmt(cn.creditAmount),      cls: 'jd-kpi-blue' },
                    { label: 'Allocated',    val: fmt(cn.allocatedAmount) },
                    { label: 'Unallocated',  val: fmt(cn.unallocatedAmount), cls: cn.unallocatedAmount > 0 ? 'jd-kpi-amber' : '' },
                ].map((k, i) => (
                    <React.Fragment key={k.label}>
                        {i > 0 && <div className="jd-kpi-div" />}
                        <div className="jd-kpi">
                            <div className="jd-kpi-label">{k.label}</div>
                            <div className={`jd-kpi-val ${k.cls || ''}`}>{k.val}</div>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* ACTION BANNER */}
            {banner && (
                <div style={{ margin: '10px 24px', padding: '8px 14px', borderRadius: 6, fontSize: 12.5,
                    background: banner.startsWith('✓') ? '#dcfce7' : '#fee2e2',
                    color: banner.startsWith('✓') ? '#166534' : '#991b1b' }}>
                    {banner}
                </div>
            )}

            {/* TAB BAR */}
            <div className="jd-tabs-bar">
                {CN_TABS.map(tab => {
                    const badge = tab.badge && tab.key === 'allocations' && allocs.length > 0 ? allocs.length : null;
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

            {/* TAB CONTENT */}
            <div className="jd-tab-content">
                {activeTab !== 'approval' && <ApprovalStatusBanner transaction={approvalTx} />}
                {renderTab()}
            </div>

            {showRevise && <ReviseModal cn={cn} allocs={allocs} onClose={() => setShowRevise(false)} onConfirm={handleRevise} />}
            {showCancel && <CancelModal cn={cn} allocs={allocs} onClose={() => setShowCancel(false)} onConfirm={handleCancel} />}
            {showPrint  && <VoucherPrintModal kind="CN" voucher={cn} allocs={allocs} onClose={() => setShowPrint(false)} />}
        </div>
    );
};

// ── Overview tab ──────────────────────────────────────────────────────────────
const OverviewTab = ({ cn, isDraft, canEdit, currentUser, onRefresh }) => {
    const { lookups, getVList } = useLookup();
    const currencies = lookups.currencies || [];
    const creditTypes = getVList('CreditNote', 'CreditType');

    const [editing, setEditing] = useState(false);
    const [form, setForm]   = useState({});
    const [err, setErr]     = useState('');
    const [saving, setSaving] = useState(false);

    const startEdit = () => {
        setForm({
            cnDate:       cn.cnDate       ? cn.cnDate.slice(0, 10)       : '',
            currencyId:   String(cn.currencyId  ?? ''),
            exchangeRate: String(cn.exchangeRate ?? 1),
            creditAmount: String(cn.creditAmount ?? ''),
            creditType:   cn.creditType   || '',
            reason:       cn.reason       || '',
            notes:        cn.notes        || '',
        });
        setErr(''); setEditing(true);
    };
    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const pickCurrency = (id) => {
        const cur = currencies.find(c => String(c.id) === String(id));
        set('currencyId', id);
        if (cur) set('exchangeRate', String(cur.exchangeRate || 1));
    };

    const save = async () => {
        setErr('');
        if (!form.currencyId)                     { setErr('Currency is required.');              return; }
        if (!form.exchangeRate || isNaN(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0)
                                                  { setErr('Exchange rate must be a number greater than 0.'); return; }
        if (!(Number(form.creditAmount) > 0))      { setErr('Amount must be greater than zero.'); return; }
        if (!form.creditType)                      { setErr('Credit type is required.');          return; }
        if (!form.reason?.trim())                  { setErr('Reason is required.');               return; }
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}creditnote/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    cnId:         cn.cnId,
                    cnDate:       form.cnDate,
                    customerId:   cn.customerId,
                    currencyId:   Number(form.currencyId),
                    exchangeRate: Number(form.exchangeRate) || 1,
                    creditAmount: Number(form.creditAmount),
                    creditType:   form.creditType || null,
                    reason:       form.reason || null,
                    notes:        form.notes  || null,
                    modifiedBy:   currentUser,
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

    if (!editing) {
        return (
            <div className="jd-tab-body" style={{ maxWidth: 560 }}>
                <Row label="Customer"      val={cn.customerName} />
                <Row label="CN Date"       val={fmtDate(cn.cnDate)} />
                <Row label="Currency"      val={cn.currencyShort} />
                <Row label="Credit Amount" val={fmt(cn.creditAmount)} />
                <Row label="Credit Type"   val={cn.creditType} />
                <Row label="Reason"        val={cn.reason} />
                <Row label="Notes"         val={cn.notes} />
                {cn.reviseReason && <Row label="Revise Reason" val={cn.reviseReason} />}
                {cn.cancelReason  && <Row label="Cancel Reason" val={cn.cancelReason} />}
                {isDraft && canEdit && (
                    <div style={{ marginTop: 16 }}>
                        <button className="pf-btn-pri" onClick={startEdit} style={{ padding: '7px 18px' }}>Edit Details</button>
                    </div>
                )}
            </div>
        );
    }

    const inp = { width: '100%', padding: '7px 9px', fontSize: 13 };
    const lbl = { fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 };
    return (
        <div className="jd-tab-body" style={{ maxWidth: 700 }}>
            {err && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>✕ {err}</div>}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

                <div style={{ flex: '0 0 150px' }}>
                    <label style={lbl}>CN Date</label>
                    <input type="date" className="pf-input" style={inp} value={form.cnDate} onChange={e => set('cnDate', e.target.value)} />
                </div>

                <div style={{ flex: '0 0 200px' }}>
                    <label style={lbl}>Currency <span style={{ color: '#e53e3e' }}>*</span></label>
                    <select className="pf-input" style={inp} value={form.currencyId} onChange={e => pickCurrency(e.target.value)}>
                        <option value="">— select —</option>
                        {currencies.map(c => <option key={c.id} value={c.id}>{c.shortName} — {c.name}</option>)}
                    </select>
                </div>

                <div style={{ flex: '0 0 130px' }}>
                    <label style={lbl}>Exchange Rate</label>
                    <input type="number" min="0" step="0.000001" className="pf-input" style={inp}
                        value={form.exchangeRate} onChange={e => set('exchangeRate', e.target.value)} />
                </div>

                <div style={{ flex: '0 0 170px' }}>
                    <label style={lbl}>Credit Amount <span style={{ color: '#e53e3e' }}>*</span></label>
                    <AmountInput className="pf-input" style={inp} value={form.creditAmount} onChange={v => set('creditAmount', v)} />
                </div>

                <div style={{ flex: '0 0 160px' }}>
                    <label style={lbl}>Credit Type <span style={{ color: '#e53e3e' }}>*</span></label>
                    <select className="pf-input" style={inp} value={form.creditType} onChange={e => set('creditType', e.target.value)}>
                        <option value="">— select —</option>
                        {creditTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                </div>

                <div style={{ flex: '1 1 100%' }}>
                    <label style={lbl}>Reason <span style={{ color: '#e53e3e' }}>*</span></label>
                    <textarea className="pf-input pf-textarea" rows={2} style={inp}
                        value={form.reason} onChange={e => set('reason', e.target.value)} />
                </div>

                <div style={{ flex: '1 1 100%' }}>
                    <label style={lbl}>Notes</label>
                    <textarea className="pf-input pf-textarea" rows={2} style={inp}
                        value={form.notes} onChange={e => set('notes', e.target.value)} />
                </div>
            </div>
            <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="pf-btn-sec" onClick={() => setEditing(false)} disabled={saving}>Cancel</button>
                <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
            </div>
        </div>
    );
};

// ── Allocations tab ───────────────────────────────────────────────────────────
const AllocationsTab = ({ cn, allocs, isApproved, currentUser, onRefresh }) => {
    const { baseCurrencyCode } = useLookup();
    const [openInvoices, setOpenInvoices] = useState([]);
    const [inputs,       setInputs]       = useState({});
    const [loadingInv,   setLoadingInv]   = useState(false);
    const [err,          setErr]          = useState('');
    const [pendingApply,  setPendingApply]  = useState(null);
    const [pendingRemove, setPendingRemove] = useState(null);

    const loadOpen = useCallback(() => {
        if (!isApproved) return;
        setLoadingInv(true);
        const qs = new URLSearchParams({ customerId: String(cn.customerId), cnId: String(cn.cnId) });
        fetch(`${variables.API_URL}creditnote/customer-open-invoices?${qs}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const list = Array.isArray(d) ? d : [];
                setOpenInvoices(list);
                const m = {};
                list.forEach(inv => { if (inv.thisCnAllocated > 0) m[inv.invoiceId] = String(inv.thisCnAllocated); });
                setInputs(m);
            })
            .catch(console.error)
            .finally(() => setLoadingInv(false));
    }, [cn, isApproved]);

    useEffect(() => { loadOpen(); }, [loadOpen]);

    const openApplyModal = (inv) => {
        setErr('');
        const amt = Number(inputs[inv.invoiceId]);
        if (!(amt > 0)) { setErr('Enter an amount greater than zero (use remove to delete an allocation).'); return; }

        const EPS  = 0.005;
        const rate = Number(cn.exchangeRate) || 1;
        const thisAlloc = Number(inv.thisCnAllocated || 0);

        // 1) Cannot exceed the invoice outstanding (already excludes this CN's own allocation)
        if (amt > Number(inv.outstanding) + EPS) {
            setErr(`Allocation (${fmt(amt)}) exceeds invoice ${inv.invoiceNo} outstanding balance (${fmt(inv.outstanding)}).`);
            return;
        }

        // 2) Cannot exceed the credit note's remaining available balance (base currency).
        //    For an update on this invoice, the existing allocation is replaced, so add it back.
        const cnAvailableForThis = Number(cn.unallocatedAmount) * rate + thisAlloc;
        if (amt > cnAvailableForThis + EPS) {
            setErr(`Allocation (${fmt(amt)}) exceeds the credit note's available balance (${fmt(cnAvailableForThis)}).`);
            return;
        }

        setPendingApply({ inv, amount: amt });
    };

    const doApply = async (reason, password) => {
        const { inv, amount } = pendingApply;
        try {
            const res = await fetch(`${variables.API_URL}creditnote/allocation/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    cnId: cn.cnId, invoiceId: inv.invoiceId, allocatedAmount: amount,
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

    const doRemove = async (reason, password) => {
        try {
            const res = await fetch(
                `${variables.API_URL}creditnote/allocation/${pendingRemove.allocationId}`,
                { method: 'DELETE', headers: authHeaders(),
                  body: JSON.stringify({ modifiedBy: currentUser, reason, password }) }
            );
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Remove failed.';
            setPendingRemove(null);
            onRefresh(); loadOpen();
            return true;
        } catch { return 'Network error.'; }
    };

    const allocById = (invoiceId) => allocs.find(a => a.invoiceId === invoiceId);

    if (!isApproved) {
        return (
            <div className="jd-tab-body">
                <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8,
                    padding: '12px 16px', maxWidth: 560, fontSize: 13, color: '#78350f', marginBottom: 16 }}>
                    The credit note must be <strong>Approved</strong> before it can be allocated against invoices.
                    Submit it for approval using the <strong>Approval</strong> tab.
                </div>
                {allocs.length > 0 && <AllocTable allocs={allocs} title="Registered allocations" />}
            </div>
        );
    }

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
                    { label: 'Credit',      val: cn.creditAmount,      color: '#1e293b' },
                    { label: 'Allocated',   val: cn.allocatedAmount,   color: '#1e293b' },
                    { label: 'Unallocated', val: cn.unallocatedAmount, color: cn.unallocatedAmount > 0 ? '#b45309' : '#166534' },
                ].map((k, i) => (
                    <div key={k.label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        {i > 0 && <span style={{ color: '#cbd5e1', marginRight: 8 }}>|</span>}
                        <span style={{ color: '#64748b' }}>{k.label}:</span>
                        <strong style={{ fontFamily: 'monospace', color: k.color }}>{fmt(k.val)}</strong>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{cn.currencyShort}</span>
                    </div>
                ))}
                {cn.exchangeRate && cn.exchangeRate !== 1 && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ color: '#cbd5e1', marginRight: 8 }}>|</span>
                            <span style={{ color: '#64748b' }}>Avail. to apply:</span>
                            <strong style={{ fontFamily: 'monospace', color: '#0369a1' }}>
                                {fmt(Math.floor(Number(cn.unallocatedAmount) * Number(cn.exchangeRate) * 100) / 100)}
                            </strong>
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{baseCurrencyCode}</span>
                        </div>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
                            Rate: 1 {cn.currencyShort} = {Number(cn.exchangeRate).toFixed(4)} {baseCurrencyCode}
                        </span>
                    </>
                )}
            </div>

            {loadingInv ? (
                <div style={{ padding: '20px 0', color: '#64748b', fontSize: 13 }}>Loading open invoices…</div>
            ) : openInvoices.length === 0 ? (
                <div className="jd-empty-card">No open invoices found for {cn.customerName}.</div>
            ) : (
                <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
                        color: '#374151', marginBottom: 4 }}>Open Invoices — Apply Credit</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                        The <strong>Amount to Apply</strong> field sets the <em>total</em> credit allocated from this CN against each invoice — entering a new value <em>replaces</em> the existing allocation.
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
                                <th style={TH_R}>Outstanding (before CN)</th>
                                <th style={{ ...TH_R, width: 160 }}>Total Allocated (this CN)</th>
                                <th style={{ ...TH_L, width: 100 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {openInvoices.map((inv, i) => {
                                const existing = allocById(inv.invoiceId);
                                const rate      = Number(cn.exchangeRate) || 1;
                                const isForeign = rate !== 1;
                                const thisAlloc = Number(inv.thisCnAllocated || 0);
                                // Max applicable to this invoice (invoice/base currency):
                                // limited by the invoice outstanding AND the CN's remaining credit converted to base.
                                const cnRemainingBase = Number(cn.unallocatedAmount) * rate + thisAlloc;
                                // Floor to cents so the value never rounds ABOVE the SP's exact limit
                                // (e.g. 183.625 must become 183.62, not 183.63 — the SP rejects > limit).
                                const maxApply = Math.floor(Math.max(0, Math.min(Number(inv.outstanding), cnRemainingBase)) * 100) / 100;
                                const enteredVal = Number(inputs[inv.invoiceId]) || 0;
                                return (
                                    <tr key={inv.invoiceId}
                                        style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600, color: '#1e3a5f' }}>{inv.invoiceNo}</td>
                                        <td style={TD}>{fmtDate(inv.invoiceDate)}</td>
                                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{inv.jobId || '—'}</td>
                                        <td style={{ ...TD_R, fontSize: 11, fontWeight: 700, color: '#475569' }}>{inv.currencyShort || '—'}</td>
                                        <td style={TD_R}>{fmt(inv.totalAmount)}</td>
                                        <td style={{ ...TD_R, fontWeight: 600, color: Math.max(0, Number(inv.outstanding) - thisAlloc) > 0 ? '#b45309' : '#166534' }}>
                                            {fmt(Math.max(0, Number(inv.outstanding) - thisAlloc))}
                                        </td>
                                        <td style={{ ...TD_R, color: '#64748b', fontWeight: 500 }}>{fmt(inv.outstanding)}</td>
                                        <td style={TD_R}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{inv.currencyShort}</span>
                                                <AmountInput
                                                    className="pf-input"
                                                    value={inputs[inv.invoiceId] ?? ''}
                                                    onChange={v => setInputs(p => ({ ...p, [inv.invoiceId]: v }))}
                                                    style={{ width: 110, padding: '5px 8px', fontSize: 13 }} />
                                                <button type="button" className="pf-btn-sec"
                                                    title={`Apply maximum (${fmt(maxApply)} ${inv.currencyShort})`}
                                                    style={{ padding: '4px 7px', fontSize: 10, fontWeight: 700 }}
                                                    onClick={() => setInputs(p => ({ ...p, [inv.invoiceId]: maxApply.toFixed(2) }))}>
                                                    Max
                                                </button>
                                            </div>
                                            {isForeign && enteredVal > 0 && (
                                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, textAlign: 'right' }}>
                                                    ≈ {fmt(enteredVal / rate)} {cn.currencyShort} of credit used
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
                                                    onClick={() => setPendingRemove(existing)}>
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

            {allocs.length > 0 && <AllocTable allocs={allocs} title="Registered allocations" />}

            {pendingApply && (
                <AllocApplyModal cn={cn} inv={pendingApply.inv} amount={pendingApply.amount}
                    onClose={() => setPendingApply(null)} onConfirm={doApply} />
            )}
            {pendingRemove && (
                <AllocRemoveModal cn={cn} alloc={pendingRemove}
                    onClose={() => setPendingRemove(null)} onConfirm={doRemove} />
            )}
        </div>
    );
};

// ── Read-only allocations table ───────────────────────────────────────────────
const AllocTable = ({ allocs, title }) => {
    const [printData, setPrintData] = useState(null);
    const [loadingId, setLoadingId] = useState(null);
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
                                <button onClick={() => openPrint(a.invoiceId)} disabled={loadingId === a.invoiceId}
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
                                {a.currencyShort && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginRight: 3 }}>{a.currencyShort}</span>}
                                {fmt(a.allocatedAmount)}
                            </td>
                            <td style={{ ...TD, fontSize: 11, color: '#475569', fontStyle: a.reason ? 'normal' : 'italic' }}>{a.reason || '—'}</td>
                            <td style={{ ...TD, fontSize: 11, color: '#64748b' }}>{fmtAudit(a.createdBy, a.createdDate)}</td>
                            <td style={{ ...TD, fontSize: 11, color: '#64748b' }}>{fmtAudit(a.modifiedBy, a.modifiedDate)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {printData && (
                <InvoicePrintModal2 invoice={printData.invoice} lines={printData.lines} onClose={() => setPrintData(null)} />
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default CreditNoteDetail;
