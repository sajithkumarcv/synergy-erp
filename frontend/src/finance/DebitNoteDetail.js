import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import AmountInput from '../common/AmountInput';
import { useCurrentUser } from '../AuthContext';
import { usePermission } from '../PermissionContext';
import { useLookup } from '../LookupContext';
import { usePrintFormat } from '../print/printFormats';
import ApprovalHistoryTab   from '../approval/ApprovalHistoryTab';
import ApprovalStatusBanner from '../approval/ApprovalStatusBanner';
import VoucherPrintModal    from '../common/VoucherPrintModal';
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

const DN_TABS = [
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
const ReviseModal = ({ dn, allocs, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);

    const hasAllocs  = allocs && allocs.length > 0;
    const allocTotal = hasAllocs ? allocs.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0) : 0;
    const cur        = dn.currencyShort || '';

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
            title="Revise Debit Note" subtitle={dn.dnNumber} onClose={onClose}
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
                <ImpactRow icon="📋" text={`${dn.dnNumber} will return to Draft status`} sub="The approval is cancelled and the debit note can be edited and re-submitted." />
                {hasAllocs ? (
                    <ImpactRow icon="🔗"
                        text={`${allocs.length} allocation${allocs.length > 1 ? 's' : ''} (${cur} ${fmt(allocTotal)}) will be suspended`}
                        sub="Allocations are removed. Supplier invoice outstanding balances will temporarily increase." />
                ) : (
                    <ImpactRow icon="🔗" text="No allocations — no invoice balances affected" sub="This debit note has no allocations at this time." />
                )}
                <ImpactRow icon="✏️" text="You can then correct details and re-submit for approval" sub="Debit amount cannot be set below any re-applied allocation total." />
            </div>

            {hasAllocs && (
                <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#475569', marginBottom:6 }}>Suspended allocations</div>
                    <div style={{ border:'1px solid #e2e8f0', borderRadius:6, overflow:'hidden', fontSize:12.5 }}>
                        {allocs.map((a, i) => (
                            <div key={a.allocationId} style={{ display:'flex', justifyContent:'space-between', padding:'6px 12px',
                                background: i % 2 === 0 ? '#fff' : '#fafafa', borderBottom: i < allocs.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                <span style={{ fontFamily:'monospace', fontWeight:600, color:'#1e3a5f' }}>{a.invoiceNo || a.supplierInvRef}</span>
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
                    placeholder="Describe why this debit note needs to be revised…"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Authorisation password <span style={{ color:'#e53e3e' }}>*</span></label>
                <input type="password" autoComplete="new-password" className="pf-input" style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's revision password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Cancel Modal ─────────────────────────────────────────────────────────────
const CancelModal = ({ dn, allocs, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [busy,     setBusy]     = useState(false);
    const [err,      setErr]      = useState('');

    const hasAllocs  = allocs && allocs.length > 0;
    const allocTotal = hasAllocs ? allocs.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0) : 0;
    const cur        = dn.currencyShort || '';

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
            title="Cancel Debit Note" subtitle={dn.dnNumber} onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Close</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding:'7px 22px', borderRadius:6, border:'none', cursor:'pointer',
                        fontWeight:600, fontSize:13, background:'#dc2626', color:'#fff' }}>
                    {busy ? 'Cancelling…' : 'Cancel Debit Note'}
                </button>
            </>}
        >
            <div style={{ background:'#fee2e2', border:'1px solid #fca5a5', borderRadius:8,
                padding:'10px 14px', marginBottom:16, display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:18, flexShrink:0 }}>⛔</span>
                <div>
                    <div style={{ fontWeight:700, fontSize:13, color:'#991b1b' }}>This action is permanent and cannot be undone.</div>
                    <div style={{ fontSize:12, color:'#b91c1c', marginTop:3 }}>Cancelling removes this debit note from all financial records.</div>
                </div>
            </div>

            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', color:'#475569', marginBottom:8 }}>What will happen</div>
            <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden', marginBottom:16 }}>
                <ImpactRow icon="🚫" text={`${dn.dnNumber} will be permanently cancelled`}
                    sub={`Status changes to Cancelled. Debit amount: ${cur} ${fmt(dn.debitAmount)}`} />
                {hasAllocs ? (
                    <ImpactRow icon="↩️"
                        text={`${allocs.length} allocation${allocs.length > 1 ? 's' : ''} permanently reversed (${cur} ${fmt(allocTotal)})`}
                        sub="All invoice debits from this note will be removed. Supplier invoice outstanding balances will be restored." />
                ) : (
                    <ImpactRow icon="↩️" text="No allocations to reverse" sub="This debit note has no allocations." />
                )}
                <ImpactRow icon="📊" text="Supplier invoice outstanding balances will increase"
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
                                    <span style={{ fontFamily:'monospace', fontWeight:600, color:'#7f1d1d' }}>{a.invoiceNo || a.supplierInvRef}</span>
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
                    placeholder="Describe why this debit note is being cancelled…"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Authorisation password <span style={{ color:'#e53e3e' }}>*</span></label>
                <input type="password" autoComplete="new-password" className="pf-input" style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Alloc Apply Modal ─────────────────────────────────────────────────────────
const AllocApplyModal = ({ dn, inv, amount, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);

    const cur            = inv.currencyShort || dn.currencyShort || '';
    const newOutstanding = Math.max(0, Number(inv.outstanding) - amount);
    const isUpdate       = Number(inv.thisDnAllocated) > 0;

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
            title={isUpdate ? 'Update Debit Allocation' : 'Apply Debit Allocation'}
            subtitle={`${dn.dnNumber} → ${inv.invoiceNo || inv.supplierInvRef}`}
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
                    text={`Supplier invoice ${inv.invoiceNo || inv.supplierInvRef}${inv.jobIds ? ` (Job: ${inv.jobIds})` : ''}`}
                    sub={`${cur} ${fmt(amount)} debit applied. Outstanding: ${fmt(inv.outstanding)} → ${fmt(newOutstanding)}`} />
                <ImpactRow icon="💳"
                    text={`${dn.dnNumber} unallocated balance will decrease`}
                    sub={`Current unallocated: ${dn.currencyShort} ${fmt(dn.unallocatedAmount)}`} />
            </div>

            {err && <div style={{ background:'#fee2e2', color:'#991b1b', borderRadius:6, padding:'7px 12px', fontSize:12.5, marginBottom:10 }}>✕ {err}</div>}
            <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Reason <span style={{ color:'#e53e3e' }}>*</span></label>
                <textarea rows={2} className="pf-input" style={{ width:'100%', resize:'vertical', fontSize:13 }}
                    placeholder="Why is this debit being applied?"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize:11, fontWeight:600, color:'#475569', display:'block', marginBottom:4 }}>Authorisation password <span style={{ color:'#e53e3e' }}>*</span></label>
                <input type="password" autoComplete="new-password" className="pf-input" style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Alloc Remove Modal ────────────────────────────────────────────────────────
const AllocRemoveModal = ({ dn, alloc, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);

    const cur = dn.currencyShort || '';

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
            title="Remove Allocation" subtitle={`${dn.dnNumber} → ${alloc.invoiceNo || alloc.supplierInvRef}`}
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
                    text={`${cur} ${fmt(alloc.allocatedAmount)} debit removed from invoice ${alloc.invoiceNo || alloc.supplierInvRef}`}
                    sub="This debit will no longer reduce this invoice's outstanding balance." />
                <ImpactRow icon="📊" text="Supplier invoice outstanding balance will increase"
                    sub={`Invoice ${alloc.invoiceNo || alloc.supplierInvRef} will show ${cur} ${fmt(alloc.allocatedAmount)} more as outstanding.`} />
                <ImpactRow icon="💳" text={`${dn.dnNumber} unallocated balance will increase`}
                    sub={`Current unallocated: ${dn.currencyShort} ${fmt(dn.unallocatedAmount)}`} />
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
                <input type="password" autoComplete="new-password" className="pf-input" style={{ width:'100%', fontSize:13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const DebitNoteDetail = () => {
    const { id }      = useParams();
    const navigate    = useNavigate();
    const currentUser = useCurrentUser();
    const { canDo }   = usePermission();
    const canEdit     = canDo('/debit-notes', 'EDIT');
    const canRevise   = canDo('/debit-notes', 'REVISE');

    const [dn, setDn]           = useState(null);
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
    const printFmt = usePrintFormat('DN');   // configured layout (Company Settings → Print Formats)
    const [confirm,    setConfirm]    = useState(null);

    const load = useCallback(() => {
        setLoading(true); setError(null);
        fetch(`${variables.API_URL}debitnote/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setDn(d.debitNote); setAllocs(d.allocations || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const deleteDn = () => {
        setConfirm({
            title: 'Delete Debit Note',
            message: 'Delete this Draft debit note? This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setBusy(true);
                try {
                    const res = await fetch(
                        `${variables.API_URL}debitnote/${id}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setBanner(`✕ ${d?.message || 'Delete failed.'}`); return; }
                    navigate('/debit-notes');
                } catch { setBanner('✕ Network error.'); }
                finally { setBusy(false); }
            },
        });
    };

    const handleRevise = async (reason, password) => {
        setBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}debitnote/${id}/revise`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ reason, password, revisedBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Revision failed.';
            setShowRevise(false);
            setBanner(`✓ ${d.message || 'Debit note revised.'}`);
            load(); return true;
        } catch { return 'Network error. Please try again.'; }
        finally { setBusy(false); }
    };

    const handleCancel = async (reason, password) => {
        setBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}debitnote/${id}/cancel`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ reason, password, cancelledBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Cancellation failed.';
            setShowCancel(false);
            setBanner(`✓ ${d.message || 'Debit note cancelled.'}`);
            load(); return true;
        } catch { return 'Network error. Please try again.'; }
        finally { setBusy(false); }
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading debit note…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/debit-notes')}>
                ← Back to Debit Notes
            </button>
        </div>
    );
    if (!dn) return null;

    const cfg        = STATUS_CFG[dn.status] || STATUS_CFG.Draft;
    const isDraft    = dn.status === 'Draft';
    const isApproved = dn.status === 'Approved';

    const renderTab = () => {
        switch (activeTab) {
            case 'overview':
                return <OverviewTab dn={dn} isDraft={isDraft} canEdit={canEdit} currentUser={currentUser} onRefresh={load} />;
            case 'allocations':
                return <AllocationsTab dn={dn} allocs={allocs} isApproved={isApproved} currentUser={currentUser} onRefresh={load} />;
            case 'approval':
                return (
                    <ApprovalHistoryTab
                        moduleCode="DN"
                        documentId={dn.dnId}
                        documentNo={dn.dnNumber}
                        documentAmount={dn.debitAmount}
                        currencyId={dn.currencyId}
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
                    <button className="jd-back-btn" onClick={() => navigate('/debit-notes')}>← Debit Notes</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{dn.dnNumber}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">{dn.supplierName}</span>
                        {dn.debitType && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-type">{dn.debitType}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: cfg.bg, color: cfg.color }}>
                        <span className="cd-flag-dot" style={{ background: cfg.dot }} />{cfg.label}
                    </span>
                    <button className="jd-stage-btn" onClick={() => setShowPrint(printFmt)}
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
                            Cancel DN
                        </button>
                    )}
                    {isDraft && canEdit && (
                        <button className="jd-stage-btn" onClick={deleteDn} disabled={busy}
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            {busy ? 'Deleting…' : 'Delete'}
                        </button>
                    )}
                </div>
            </div>

            {/* KPI STRIP */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'DN Date',      val: fmtDate(dn.dnDate) },
                    { label: 'Supplier',     val: dn.supplierName },
                    { label: 'Currency',     val: dn.currencyShort || '—' },
                    { label: 'Type',         val: dn.debitType || '—' },
                    { label: 'Debit',        val: fmt(dn.debitAmount),      cls: 'jd-kpi-blue' },
                    { label: 'Allocated',    val: fmt(dn.allocatedAmount) },
                    { label: 'Unallocated',  val: fmt(dn.unallocatedAmount), cls: dn.unallocatedAmount > 0 ? 'jd-kpi-amber' : '' },
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
                {DN_TABS.map(tab => {
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

            {showRevise && <ReviseModal dn={dn} allocs={allocs} onClose={() => setShowRevise(false)} onConfirm={handleRevise} />}
            {showCancel && <CancelModal dn={dn} allocs={allocs} onClose={() => setShowCancel(false)} onConfirm={handleCancel} />}
            {showPrint  && <VoucherPrintModal kind="DN" voucher={dn} allocs={allocs} onClose={() => setShowPrint(false)} />}
        </div>
    );
};

// ── Overview tab ──────────────────────────────────────────────────────────────
const OverviewTab = ({ dn, isDraft, canEdit, currentUser, onRefresh }) => {
    const { lookups, getVList } = useLookup();
    const currencies = lookups.currencies || [];
    const debitTypes = getVList('DebitNote', 'DebitType');

    const [editing, setEditing] = useState(false);
    const [form, setForm]   = useState({});
    const [err, setErr]     = useState('');
    const [saving, setSaving] = useState(false);

    const startEdit = () => {
        setForm({
            dnDate:       dn.dnDate       ? dn.dnDate.slice(0, 10)       : '',
            currencyId:   String(dn.currencyId  ?? ''),
            exchangeRate: String(dn.exchangeRate ?? 1),
            debitAmount:  String(dn.debitAmount ?? ''),
            debitType:    dn.debitType    || '',
            reason:       dn.reason       || '',
            notes:        dn.notes        || '',
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
        if (!(Number(form.debitAmount) > 0))       { setErr('Amount must be greater than zero.'); return; }
        if (!form.debitType)                       { setErr('Debit type is required.');           return; }
        if (!form.reason?.trim())                  { setErr('Reason is required.');               return; }
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}debitnote/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    dnId:         dn.dnId,
                    dnDate:       form.dnDate,
                    supplierId:   dn.supplierId,
                    currencyId:   Number(form.currencyId),
                    exchangeRate: Number(form.exchangeRate) || 1,
                    debitAmount:  Number(form.debitAmount),
                    debitType:    form.debitType || null,
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
                <Row label="Supplier"      val={dn.supplierName} />
                <Row label="DN Date"       val={fmtDate(dn.dnDate)} />
                <Row label="Currency"      val={dn.currencyShort} />
                <Row label="Debit Amount"  val={fmt(dn.debitAmount)} />
                <Row label="Debit Type"    val={dn.debitType} />
                <Row label="Reason"        val={dn.reason} />
                <Row label="Notes"         val={dn.notes} />
                {dn.reviseReason && <Row label="Revise Reason" val={dn.reviseReason} />}
                {dn.cancelReason  && <Row label="Cancel Reason" val={dn.cancelReason} />}
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
                    <label style={lbl}>DN Date</label>
                    <input type="date" className="pf-input" style={inp} value={form.dnDate} onChange={e => set('dnDate', e.target.value)} />
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
                    <label style={lbl}>Debit Amount <span style={{ color: '#e53e3e' }}>*</span></label>
                    <AmountInput className="pf-input" style={inp} value={form.debitAmount} onChange={v => set('debitAmount', v)} />
                </div>

                <div style={{ flex: '0 0 160px' }}>
                    <label style={lbl}>Debit Type <span style={{ color: '#e53e3e' }}>*</span></label>
                    <select className="pf-input" style={inp} value={form.debitType} onChange={e => set('debitType', e.target.value)}>
                        <option value="">— select —</option>
                        {debitTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
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
const AllocationsTab = ({ dn, allocs, isApproved, currentUser, onRefresh }) => {
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
        const qs = new URLSearchParams({ supplierId: String(dn.supplierId), dnId: String(dn.dnId) });
        fetch(`${variables.API_URL}debitnote/supplier-open-invoices?${qs}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const list = Array.isArray(d) ? d : [];
                setOpenInvoices(list);
                const m = {};
                list.forEach(inv => { if (inv.thisDnAllocated > 0) m[inv.supplierInvoiceId] = String(inv.thisDnAllocated); });
                setInputs(m);
            })
            .catch(console.error)
            .finally(() => setLoadingInv(false));
    }, [dn, isApproved]);

    useEffect(() => { loadOpen(); }, [loadOpen]);

    const openApplyModal = (inv) => {
        setErr('');
        const amt = Number(inputs[inv.supplierInvoiceId]);
        if (!(amt > 0)) { setErr('Enter an amount greater than zero (use remove to delete an allocation).'); return; }

        const EPS  = 0.005;
        const rate = Number(dn.exchangeRate) || 1;
        const thisAlloc = Number(inv.thisDnAllocated || 0);
        const invNo = inv.invoiceNo || inv.supplierInvRef || '';

        // 1) Cannot exceed the supplier invoice outstanding (already excludes this DN's own allocation)
        if (amt > Number(inv.outstanding) + EPS) {
            setErr(`Allocation (${fmt(amt)}) exceeds supplier invoice ${invNo} outstanding balance (${fmt(inv.outstanding)}).`);
            return;
        }

        // 2) Cannot exceed the debit note's remaining available balance (base currency).
        //    For an update on this invoice, the existing allocation is replaced, so add it back.
        const dnAvailableForThis = Number(dn.unallocatedAmount) * rate + thisAlloc;
        if (amt > dnAvailableForThis + EPS) {
            setErr(`Allocation (${fmt(amt)}) exceeds the debit note's available balance (${fmt(dnAvailableForThis)}).`);
            return;
        }

        setPendingApply({ inv, amount: amt });
    };

    const doApply = async (reason, password) => {
        const { inv, amount } = pendingApply;
        try {
            const res = await fetch(`${variables.API_URL}debitnote/allocation/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    dnId: dn.dnId, supplierInvoiceId: inv.supplierInvoiceId, allocatedAmount: amount,
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
                `${variables.API_URL}debitnote/allocation/${pendingRemove.allocationId}`,
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

    const allocById = (supplierInvoiceId) => allocs.find(a => a.supplierInvoiceId === supplierInvoiceId);

    if (!isApproved) {
        return (
            <div className="jd-tab-body">
                <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8,
                    padding: '12px 16px', maxWidth: 560, fontSize: 13, color: '#78350f', marginBottom: 16 }}>
                    The debit note must be <strong>Approved</strong> before it can be allocated against supplier invoices.
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
                    { label: 'Debit',       val: dn.debitAmount,       color: '#1e293b' },
                    { label: 'Allocated',   val: dn.allocatedAmount,   color: '#1e293b' },
                    { label: 'Unallocated', val: dn.unallocatedAmount, color: dn.unallocatedAmount > 0 ? '#b45309' : '#166534' },
                ].map((k, i) => (
                    <div key={k.label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        {i > 0 && <span style={{ color: '#cbd5e1', marginRight: 8 }}>|</span>}
                        <span style={{ color: '#64748b' }}>{k.label}:</span>
                        <strong style={{ fontFamily: 'monospace', color: k.color }}>{fmt(k.val)}</strong>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{dn.currencyShort}</span>
                    </div>
                ))}
                {dn.exchangeRate && dn.exchangeRate !== 1 && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={{ color: '#cbd5e1', marginRight: 8 }}>|</span>
                            <span style={{ color: '#64748b' }}>Avail. to apply:</span>
                            <strong style={{ fontFamily: 'monospace', color: '#0369a1' }}>
                                {fmt(Math.floor(Number(dn.unallocatedAmount) * Number(dn.exchangeRate) * 100) / 100)}
                            </strong>
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{baseCurrencyCode}</span>
                        </div>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
                            Rate: 1 {dn.currencyShort} = {Number(dn.exchangeRate).toFixed(4)} {baseCurrencyCode}
                        </span>
                    </>
                )}
            </div>

            {loadingInv ? (
                <div style={{ padding: '20px 0', color: '#64748b', fontSize: 13 }}>Loading open invoices…</div>
            ) : openInvoices.length === 0 ? (
                <div className="jd-empty-card">No open supplier invoices found for {dn.supplierName}.</div>
            ) : (
                <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em',
                        color: '#374151', marginBottom: 8 }}>Open Supplier Invoices — Apply Debit</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <th style={TH_L}>Invoice</th>
                                <th style={TH_L}>Date</th>
                                <th style={TH_L}>PO / Job</th>
                                <th style={TH_R}>Currency</th>
                                <th style={TH_R}>Total</th>
                                <th style={TH_R}>Current Outstanding</th>
                                <th style={TH_R}>Outstanding (before DN)</th>
                                <th style={{ ...TH_R, width: 160 }}>Total Allocated (this DN)</th>
                                <th style={{ ...TH_L, width: 100 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {openInvoices.map((inv, i) => {
                                const existing = allocById(inv.supplierInvoiceId);
                                const rate      = Number(dn.exchangeRate) || 1;
                                const isForeign = rate !== 1;
                                const thisAlloc = Number(inv.thisDnAllocated || 0);
                                const dnRemainingBase = Number(dn.unallocatedAmount) * rate + thisAlloc;
                                // Floor to cents so the value never rounds ABOVE the SP's exact limit.
                                const maxApply = Math.floor(Math.max(0, Math.min(Number(inv.outstanding), dnRemainingBase)) * 100) / 100;
                                const enteredVal = Number(inputs[inv.supplierInvoiceId]) || 0;
                                return (
                                    <tr key={inv.supplierInvoiceId}
                                        style={{ borderBottom: '1px solid #f1f5f9', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                                        <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 600, color: '#1e3a5f' }}>{inv.invoiceNo || inv.supplierInvRef || `#${inv.supplierInvoiceId}`}</td>
                                        <td style={TD}>{fmtDate(inv.invoiceDate)}</td>
                                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{inv.poNumbers || inv.jobIds || '—'}</td>
                                        <td style={{ ...TD_R, fontSize: 11, fontWeight: 700, color: '#475569' }}>{inv.currencyShort || '—'}</td>
                                        <td style={TD_R}>{fmt(inv.totalAmount)}</td>
                                        <td style={{ ...TD_R, fontWeight: 600, color: Math.max(0, Number(inv.outstanding) - thisAlloc) > 0 ? '#b45309' : '#166534' }}>
                                            {fmt(Math.max(0, Number(inv.outstanding) - thisAlloc))}
                                        </td>
                                        <td style={{ ...TD_R, color: '#64748b', fontWeight: 500 }}>
                                            {fmt(inv.outstanding)}
                                        </td>
                                        <td style={TD_R}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                                                <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{inv.currencyShort}</span>
                                                <AmountInput
                                                    className="pf-input"
                                                    value={inputs[inv.supplierInvoiceId] ?? ''}
                                                    onChange={v => setInputs(p => ({ ...p, [inv.supplierInvoiceId]: v }))}
                                                    style={{ width: 110, padding: '5px 8px', fontSize: 13 }} />
                                                <button type="button" className="pf-btn-sec"
                                                    title={`Apply maximum (${fmt(maxApply)} ${inv.currencyShort})`}
                                                    style={{ padding: '4px 7px', fontSize: 10, fontWeight: 700 }}
                                                    onClick={() => setInputs(p => ({ ...p, [inv.supplierInvoiceId]: maxApply.toFixed(2) }))}>
                                                    Max
                                                </button>
                                            </div>
                                            {isForeign && enteredVal > 0 && (
                                                <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2, textAlign: 'right' }}>
                                                    ≈ {fmt(enteredVal / rate)} {dn.currencyShort} of debit used
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
                <AllocApplyModal dn={dn} inv={pendingApply.inv} amount={pendingApply.amount}
                    onClose={() => setPendingApply(null)} onConfirm={doApply} />
            )}
            {pendingRemove && (
                <AllocRemoveModal dn={dn} alloc={pendingRemove}
                    onClose={() => setPendingRemove(null)} onConfirm={doRemove} />
            )}
        </div>
    );
};

// ── Read-only allocations table ───────────────────────────────────────────────
const AllocTable = ({ allocs, title }) => (
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
                        <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, color: '#1e3a5f' }}>{a.invoiceNo || a.supplierInvRef || `#${a.supplierInvoiceId}`}</td>
                        <td style={TD}>{fmtDate(a.invoiceDate)}</td>
                        <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{a.jobId || '—'}</td>
                        <td style={{ ...TD_R, fontWeight: 700 }}>
                            {a.invoiceCurrencyShort && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, marginRight: 3 }}>{a.invoiceCurrencyShort}</span>}
                            {fmt(a.allocatedAmount)}
                            {a.dnCurrencyShort && a.dnCurrencyShort !== a.invoiceCurrencyShort && (
                                <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginTop: 1 }}>
                                    {a.dnCurrencyShort} {fmt(a.allocatedAmountDnCcy)}
                                </div>
                            )}
                        </td>
                        <td style={{ ...TD, fontSize: 11, color: '#475569', fontStyle: a.reason ? 'normal' : 'italic' }}>{a.reason || '—'}</td>
                        <td style={{ ...TD, fontSize: 11, color: '#64748b' }}>{fmtAudit(a.createdBy, a.createdDate)}</td>
                        <td style={{ ...TD, fontSize: 11, color: '#64748b' }}>{fmtAudit(a.modifiedBy, a.modifiedDate)}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
);

export default DebitNoteDetail;
