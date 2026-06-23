import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { usePermission } from '../PermissionContext';
import { useLookup } from '../LookupContext';
import AmountInput from '../common/AmountInput';
import ApprovalHistoryTab   from '../approval/ApprovalHistoryTab';
import ApprovalStatusBanner from '../approval/ApprovalStatusBanner';
import VoucherPrintModal    from '../common/VoucherPrintModal';
import AlertModal from '../common/AlertModal';
import ConfirmModal from '../common/ConfirmModal';
import '../jobs/JobDetail.css';
import '../procurement/Procurement.css';

const fmt     = (n) => (n == null ? '0.00' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

const STATUS_CFG = {
    Draft:           { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8', label: 'Draft' },
    PendingApproval: { bg: '#fef9c3', color: '#854d0e', dot: '#eab308', label: 'Pending Approval' },
    PendingL1:       { bg: '#fef9c3', color: '#854d0e', dot: '#eab308', label: 'Pending Approval' },
    Approved:        { bg: '#dcfce7', color: '#166534', dot: '#22c55e', label: 'Approved' },
    Rejected:        { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Rejected' },
    Cancelled:       { bg: '#fee2e2', color: '#991b1b', dot: '#ef4444', label: 'Cancelled' },
};

const PV_TABS = [
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
        onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) onClose(); }}>
        <div style={{ background: '#fff', borderRadius: 10, width: 500, maxWidth: '100%',
            boxShadow: '0 12px 40px rgba(0,0,0,.22)', display: 'flex', flexDirection: 'column',
            maxHeight: '90vh', overflow: 'hidden' }}>
            <div style={{ background: headerBg, borderBottom: `1px solid ${headerBorder}`,
                padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: headerColor }}>{title}</div>
                    {subtitle && <div style={{ fontSize: 12, color: headerColor, opacity: .75, marginTop: 2 }}>{subtitle}</div>}
                </div>
                <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: headerColor, lineHeight: 1, opacity: .7 }}>✕</button>
            </div>
            <div style={{ padding: '18px 20px', overflowY: 'auto', flex: 1 }}>{children}</div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
                {footer}
            </div>
        </div>
    </div>
);

const ImpactRow = ({ icon, text, sub }) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
        <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>{icon}</span>
        <div>
            <div style={{ fontSize: 12.5, color: '#1e293b', fontWeight: 500 }}>{text}</div>
            {sub && <div style={{ fontSize: 11.5, color: '#64748b', marginTop: 2 }}>{sub}</div>}
        </div>
    </div>
);

// ── Revise Modal ──────────────────────────────────────────────────────────────
const ReviseModal = ({ pv, allocs, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);

    const hasAllocs  = allocs && allocs.length > 0;
    const allocTotal = hasAllocs ? allocs.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0) : 0;
    const cur        = pv.currencyShort || '';

    const submit = async () => {
        if (!reason.trim())   { setErr('Please enter a reason.'); return; }
        if (!password.trim()) { setErr('Password is required.');  return; }
        setBusy(true); setErr('');
        const result = await onConfirm(reason.trim(), password);
        setBusy(false);
        if (result !== true) setErr(result || 'Revision failed.');
    };

    return (
        <ModalShell headerBg="#fef3c7" headerBorder="#fcd34d" headerColor="#92400e"
            title="Revise Payment Voucher" subtitle={pv.pvNumber} onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Close</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding: '7px 22px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#f59e0b', color: '#fff' }}>
                    {busy ? 'Revising…' : '✏️ Revise'}
                </button>
            </>}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#475569', marginBottom: 8 }}>What will happen</div>
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                <ImpactRow icon="📋" text={`${pv.pvNumber} will return to Draft status`}
                    sub="The approval is cancelled and the voucher can be edited and re-submitted." />
                {hasAllocs ? (
                    <ImpactRow icon="🔗"
                        text={`${allocs.length} allocation${allocs.length > 1 ? 's' : ''} (${cur} ${fmt(allocTotal)}) will be suspended`}
                        sub="Allocations are kept but will not count against invoices until re-approved." />
                ) : (
                    <ImpactRow icon="🔗" text="No allocations — no invoice balances affected"
                        sub="This voucher has no payment allocations at this time." />
                )}
                <ImpactRow icon="✏️" text="You can then correct details and re-submit for approval"
                    sub="Amount paid cannot be set below the currently allocated total." />
            </div>
            {hasAllocs && (
                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#475569', marginBottom: 6 }}>Suspended allocations</div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden', fontSize: 12.5 }}>
                        {allocs.map((a, i) => (
                            <div key={a.allocationId} style={{ display: 'flex', justifyContent: 'space-between',
                                padding: '6px 12px', background: i % 2 === 0 ? '#fff' : '#fafafa',
                                borderBottom: i < allocs.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e3a5f' }}>{a.invoiceNo}</span>
                                <span style={{ color: '#b45309', fontWeight: 600 }}>{cur} {fmt(a.allocatedAmount)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {err && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '7px 12px', fontSize: 12.5, marginBottom: 10 }}>✕ {err}</div>}
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Reason for revision <span style={{ color: '#e53e3e' }}>*</span></label>
                <textarea rows={3} className="pf-input" style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                    placeholder="Describe why this payment voucher needs to be revised…"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Authorisation password <span style={{ color: '#e53e3e' }}>*</span></label>
                <input type="password" className="pf-input" style={{ width: '100%', fontSize: 13 }}
                    placeholder="Enter your role's revision password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Cancel Modal ──────────────────────────────────────────────────────────────
const CancelModal = ({ pv, allocs, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [busy,     setBusy]     = useState(false);
    const [err,      setErr]      = useState('');

    const hasAllocs  = allocs && allocs.length > 0;
    const allocTotal = hasAllocs ? allocs.reduce((s, a) => s + Number(a.allocatedAmount || 0), 0) : 0;
    const cur        = pv.currencyShort || '';

    const submit = async () => {
        if (!reason.trim())   { setErr('Please enter a reason.'); return; }
        if (!password.trim()) { setErr('Password is required.');  return; }
        setBusy(true); setErr('');
        const result = await onConfirm(reason.trim(), password);
        setBusy(false);
        if (result !== true) setErr(result || 'Cancellation failed.');
    };

    return (
        <ModalShell headerBg="#fee2e2" headerBorder="#fca5a5" headerColor="#991b1b"
            title="Cancel Payment Voucher" subtitle={pv.pvNumber} onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Close</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding: '7px 22px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#dc2626', color: '#fff' }}>
                    {busy ? 'Cancelling…' : '⛔ Cancel Voucher'}
                </button>
            </>}>
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 18, flexShrink: 0 }}>⛔</span>
                <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>This action is permanent and cannot be undone.</div>
                    <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 3 }}>Cancelling removes this payment voucher from all financial records.</div>
                </div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#475569', marginBottom: 8 }}>What will happen</div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                <ImpactRow icon="🚫" text={`${pv.pvNumber} will be permanently cancelled`}
                    sub={`Status changes to Cancelled. Amount paid: ${cur} ${fmt(pv.amountPaid)}`} />
                {hasAllocs ? (
                    <ImpactRow icon="↩️"
                        text={`${allocs.length} allocation${allocs.length > 1 ? 's' : ''} permanently reversed (${cur} ${fmt(allocTotal)})`}
                        sub="All invoice payments from this voucher will be removed." />
                ) : (
                    <ImpactRow icon="↩️" text="No allocations to reverse" sub="This voucher has no payment allocations." />
                )}
                <ImpactRow icon="📊" text="Invoice outstanding balances will increase"
                    sub={hasAllocs ? `${allocs.length} invoice${allocs.length > 1 ? 's' : ''} will show higher outstanding balances.` : 'No invoices affected.'} />
            </div>
            {hasAllocs && (
                <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#475569', marginBottom: 6 }}>Allocations that will be reversed</div>
                    <div style={{ border: '1px solid #fca5a5', borderRadius: 6, overflow: 'hidden', fontSize: 12.5 }}>
                        {allocs.map((a, i) => (
                            <div key={a.allocationId} style={{ display: 'flex', justifyContent: 'space-between',
                                padding: '7px 12px', background: i % 2 === 0 ? '#fff5f5' : '#fff',
                                borderBottom: i < allocs.length - 1 ? '1px solid #fecaca' : 'none' }}>
                                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#7f1d1d' }}>{a.invoiceNo}</span>
                                <span style={{ color: '#dc2626', fontWeight: 600 }}>{cur} {fmt(a.allocatedAmount)}</span>
                            </div>
                        ))}
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 12px',
                            background: '#fef2f2', borderTop: '1px solid #fca5a5', fontWeight: 700 }}>
                            <span style={{ color: '#991b1b' }}>Total reversed</span>
                            <span style={{ color: '#dc2626' }}>{cur} {fmt(allocTotal)}</span>
                        </div>
                    </div>
                </div>
            )}
            {err && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '7px 12px', fontSize: 12.5, marginBottom: 10 }}>✕ {err}</div>}
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Reason for cancellation <span style={{ color: '#e53e3e' }}>*</span></label>
                <textarea rows={3} className="pf-input" style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                    placeholder="Describe why this payment voucher is being cancelled…"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Authorisation password <span style={{ color: '#e53e3e' }}>*</span></label>
                <input type="password" className="pf-input" style={{ width: '100%', fontSize: 13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Overview Tab ──────────────────────────────────────────────────────────────
const OverviewTab = ({ pv, isDraft, canEdit, currentUser, onRefresh }) => {
    const { lookups, getVList } = useLookup();
    const currencies = lookups.currencies || [];
    const payModes   = getVList('Payment', 'PaymentMode');

    const [editing,     setEditing]     = useState(false);
    const [form,        setForm]        = useState({});
    const [saving,      setSaving]      = useState(false);
    const [err,         setErr]         = useState('');
    const [suppSearch,  setSuppSearch]  = useState('');
    const [suppResults, setSuppResults] = useState([]);

    const startEdit = () => {
        setForm({
            pvDate:        pv.pvDate        ? pv.pvDate.slice(0, 10)        : '',
            supplierId:    String(pv.supplierId  ?? ''),
            supplierLabel: pv.supplierName  || '',
            currencyId:    String(pv.currencyId  ?? ''),
            exchangeRate:  String(pv.exchangeRate ?? 1),
            amountPaid:    String(pv.amountPaid   ?? ''),
            paymentMode:   pv.paymentMode   || (payModes[0]?.value || ''),
            referenceNo:   pv.referenceNo   || '',
            referenceDate: pv.referenceDate ? pv.referenceDate.slice(0, 10) : '',
            bankName:      pv.bankName      || '',
            notes:         pv.notes         || '',
        });
        setErr(''); setEditing(true);
    };

    useEffect(() => {
        if (!suppSearch.trim()) { setSuppResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}supplier/search?searchText=${encodeURIComponent(suppSearch)}&pageSize=8`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setSuppResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [suppSearch]);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const pickCurrency = (id) => {
        const cur = currencies.find(c => String(c.id) === String(id));
        set('currencyId', id);
        if (cur) set('exchangeRate', String(cur.exchangeRate || 1));
    };

    const pickSupplier = (s) => {
        setSuppSearch(''); setSuppResults([]);
        setForm(p => ({ ...p, supplierId: String(s.supplierId), supplierLabel: s.supplierName }));
    };

    const isCheque = form.paymentMode?.toLowerCase() === 'cheque';

    const save = async () => {
        setErr('');
        if (!form.supplierId)                       { setErr('Supplier is required.');              return; }
        if (!form.currencyId)                       { setErr('Currency is required.');              return; }
        if (!form.exchangeRate || isNaN(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0)
                                                    { setErr('Exchange rate must be a number greater than 0.'); return; }
        if (!(Number(form.amountPaid) > 0))         { setErr('Amount must be greater than zero.');  return; }
        if (isCheque && !form.referenceNo?.trim())  { setErr('Cheque No is required.');             return; }
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}paymentvoucher/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    pvId:         pv.pvId,
                    pvDate:       form.pvDate        || null,
                    supplierId:   Number(form.supplierId),
                    currencyId:   Number(form.currencyId),
                    exchangeRate: Number(form.exchangeRate) || 1,
                    amountPaid:   Number(form.amountPaid),
                    paymentMode:  form.paymentMode   || null,
                    referenceNo:  form.referenceNo   || null,
                    referenceDate:form.referenceDate  || null,
                    bankName:     form.bankName       || null,
                    notes:        form.notes          || null,
                    modifiedBy:   currentUser,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setErr(d?.message || 'Save failed.'); return; }
            setEditing(false); onRefresh();
        } catch { setErr('Network error.'); }
        finally { setSaving(false); }
    };

    const inp = { width: '100%', padding: '7px 9px', fontSize: 13 };
    const lbl = { fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 };
    const dropStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
        background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 180, overflowY: 'auto' };

    const Row = ({ label, val }) => (
        <div style={{ display: 'flex', padding: '7px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ width: 160, fontSize: 12, color: '#64748b', flexShrink: 0 }}>{label}</div>
            <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{val || '—'}</div>
        </div>
    );

    // ── Read-only view ────────────────────────────────────────────────────────
    if (!editing) return (
        <div className="jd-tab-body" style={{ maxWidth: 560 }}>
            <Row label="Supplier"      val={pv.supplierName} />
            <Row label="PV Date"       val={fmtDate(pv.pvDate)} />
            <Row label="Currency"      val={pv.currencyShort} />
            <Row label="Exchange Rate" val={pv.exchangeRate !== 1 ? String(pv.exchangeRate) : null} />
            <Row label="Amount Paid"   val={`${pv.currencyShort || ''} ${fmt(pv.amountPaid)}`} />
            <Row label="Payment Mode"  val={pv.paymentMode} />
            <Row label={pv.paymentMode?.toLowerCase() === 'cheque' ? 'Cheque No' : 'Reference No'} val={pv.referenceNo} />
            <Row label="Reference Date" val={fmtDate(pv.referenceDate)} />
            <Row label="Bank"          val={pv.bankName} />
            <Row label="Notes"         val={pv.notes} />
            <Row label="Created By"    val={fmtAudit(pv.createdBy, pv.createdDate)} />
            <Row label="Modified By"   val={pv.modifiedBy ? fmtAudit(pv.modifiedBy, pv.modifiedDate) : null} />
            {isDraft && canEdit && (
                <div style={{ marginTop: 16 }}>
                    <button className="pf-btn-pri" onClick={startEdit} style={{ padding: '7px 18px' }}>✎ Edit Details</button>
                </div>
            )}
        </div>
    );

    // ── Edit form ─────────────────────────────────────────────────────────────
    return (
        <div className="jd-tab-body" style={{ maxWidth: 700 }}>
            {err && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>✕ {err}</div>}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>

                {/* Supplier search — full width */}
                <div style={{ flex: '1 1 100%', position: 'relative' }}>
                    <label style={lbl}>Supplier <span style={{ color: '#e53e3e' }}>*</span></label>
                    {form.supplierId ? (
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <span className="pf-input" style={{ ...inp, background: '#f0f9ff', color: '#1e40af', fontWeight: 500, flex: 1, display: 'flex', alignItems: 'center' }}>
                                ✓ {form.supplierLabel}
                            </span>
                            <button type="button" onClick={() => setForm(p => ({ ...p, supplierId: '', supplierLabel: '' }))}
                                style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '7px 11px', cursor: 'pointer', color: '#991b1b', fontWeight: 700, flexShrink: 0 }}>✕</button>
                        </div>
                    ) : (
                        <>
                            <input className="pf-input" style={inp} value={suppSearch}
                                onChange={e => setSuppSearch(e.target.value)}
                                placeholder="Search supplier…" autoComplete="off" />
                            {suppResults.length > 0 && (
                                <div style={dropStyle}>
                                    {suppResults.map(s => (
                                        <div key={s.supplierId}
                                            style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                                            onClick={() => pickSupplier(s)}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                            <strong>{s.supplierName}</strong>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div style={{ flex: '0 0 150px' }}>
                    <label style={lbl}>PV Date</label>
                    <input type="date" className="pf-input" style={inp} value={form.pvDate} onChange={e => set('pvDate', e.target.value)} />
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
                    <label style={lbl}>Amount Paid <span style={{ color: '#e53e3e' }}>*</span></label>
                    <AmountInput
                        className="pf-input"
                        style={inp}
                        value={form.amountPaid}
                        onChange={v => set('amountPaid', v)}
                    />
                </div>

                <div style={{ flex: '0 0 160px' }}>
                    <label style={lbl}>Payment Mode</label>
                    <select className="pf-input" style={inp} value={form.paymentMode}
                        onChange={e => { set('paymentMode', e.target.value); set('referenceNo', ''); }}>
                        {(payModes.length > 0 ? payModes : ['Cash','Cheque','Bank Transfer'].map(m => ({ value: m, label: m })))
                            .map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                </div>

                <div style={{ flex: '1 1 160px' }}>
                    <label style={lbl}>
                        {isCheque ? <>{`Cheque No`} <span style={{ color: '#e53e3e' }}>*</span></> : 'Reference No'}
                    </label>
                    <input className="pf-input" style={inp} value={form.referenceNo}
                        placeholder={isCheque ? 'Cheque number' : 'Transaction / ref number'}
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
const AllocApplyModal = ({ pv, inv, amount, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);
    const [pos,      setPos]      = useState([]);
    // Multi-select: { [poId]: { checked: bool, amount: string } }
    const [picks, setPicks] = useState({});

    const cur     = inv.currencyShort || pv.currencyShort || '';
    const isUpdate = Number(inv.thisPvAllocated) > 0;

    // Totals derived from picks
    const checkedRows = pos.filter(p => picks[p.poId]?.checked);
    const totalToApply = checkedRows.reduce((s, p) => s + (Number(picks[p.poId]?.amount) || 0), 0);
    const newOutstanding = Math.max(0, Number(inv.outstanding) - totalToApply);

    useEffect(() => {
        fetch(`${variables.API_URL}paymentvoucher/supplier-invoice-pos/${inv.supplierInvoiceId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => {
                const list = Array.isArray(d) ? d : [];
                setPos(list);
                // Start with EVERYTHING UNCHECKED. The user ticks each PO and
                // the auto-fill in togglePo flows the remaining balance in.
                const seed = {};
                list.forEach(p => { seed[p.poId] = { checked: false, amount: '' }; });
                setPicks(seed);
            })
            .catch(() => setPos([]));
    }, [inv.supplierInvoiceId]);

    // Cap for this Apply session = the smaller of the invoice's outstanding
    // balance and the PV's still-unallocated balance. The grid-row "Amount to
    // apply" field is intentionally NOT used here — the modal's checkboxes
    // are the source of truth for how much goes to each PO, and the user
    // shouldn't have to pre-enter a value to use it.
    const budgetForThisApply = Math.min(
        Number(inv.outstanding) || 0,
        Number(pv.unallocatedAmount) || 0
    );

    const togglePo = (p) => {
        setPicks(prev => {
            const cur = prev[p.poId] || { checked: false, amount: '' };
            const nextChecked = !cur.checked;

            if (!nextChecked) {
                // Unchecking — zero the amount so it doesn't lurk in the total.
                return { ...prev, [p.poId]: { checked: false, amount: '' } };
            }

            // Checking — flow the remaining balance into this PO.
            // Remaining = budget minus the sum of every other currently-checked PO.
            const otherSum = pos.reduce((s, x) => {
                if (x.poId === p.poId) return s;
                const v = prev[x.poId];
                return v?.checked ? s + (Number(v.amount) || 0) : s;
            }, 0);
            const remaining = Math.max(0, budgetForThisApply - otherSum);
            const lineShare = (p.linesValueForThisPo != null && p.linesValueForThisPo > 0)
                ? Number(p.linesValueForThisPo)
                : remaining;
            // Default = min(this PO's SI-line value, what's still available).
            const defaultAmt = Math.min(lineShare, remaining);

            return {
                ...prev,
                [p.poId]: {
                    checked: true,
                    amount: cur.amount && Number(cur.amount) > 0
                        ? cur.amount                     // preserve a user edit
                        : (defaultAmt > 0 ? String(defaultAmt) : ''),
                },
            };
        });
    };

    const updateAmt = (poId, val) => {
        setPicks(prev => ({ ...prev, [poId]: { ...(prev[poId] || { checked: true }), amount: val } }));
    };

    const submit = async () => {
        // Build list of allocations to perform
        const allocations = pos
            .filter(p => picks[p.poId]?.checked)
            .map(p => ({ poId: Number(p.poId), amount: Number(picks[p.poId].amount) || 0 }))
            .filter(x => x.amount > 0);

        if (pos.length > 0 && allocations.length === 0) {
            setErr('Tick at least one PO and enter an amount.');
            return;
        }
        const total = allocations.reduce((s, a) => s + a.amount, 0);
        if (total > Number(inv.outstanding) + 0.001) {
            setErr(`Total (${cur} ${fmt(total)}) exceeds invoice outstanding (${cur} ${fmt(inv.outstanding)}).`);
            return;
        }
        if (!reason.trim())   { setErr('Please enter a reason.');   return; }
        if (!password.trim()) { setErr('Password is required.');    return; }

        setBusy(true); setErr('');
        // onConfirm now expects (reason, password, allocations[])
        const result = await onConfirm(reason.trim(), password, allocations);
        setBusy(false);
        if (result !== true) setErr(result || 'Failed.');
    };

    return (
        <ModalShell headerBg="#eff6ff" headerBorder="#bfdbfe" headerColor="#1e40af"
            title={isUpdate ? 'Update Payment Allocation' : 'Apply Payment Allocation'}
            subtitle={`${pv.pvNumber} → ${inv.invoiceNo}`} onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Cancel</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding: '7px 22px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#2563eb', color: '#fff' }}>
                    {busy ? 'Saving…' : '✔ Confirm'}
                </button>
            </>}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#475569', marginBottom: 8 }}>What will happen</div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                <ImpactRow icon="🧾"
                    text={`Invoice ${inv.invoiceNo}${inv.supplierInvRef ? ` (Ref: ${inv.supplierInvRef})` : ''}`}
                    sub={`${cur} ${fmt(totalToApply)} will be applied (across ${checkedRows.length} PO${checkedRows.length !== 1 ? 's' : ''}). Outstanding: ${fmt(inv.outstanding)} → ${fmt(newOutstanding)}`} />
                <ImpactRow icon="💳" text={`${pv.pvNumber} unallocated balance will decrease`}
                    sub={`Current unallocated: ${pv.currencyShort} ${fmt(pv.unallocatedAmount)}`} />
            </div>
            {err && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '7px 12px', fontSize: 12.5, marginBottom: 10 }}>✕ {err}</div>}

            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 6 }}>
                    Apply to POs <span style={{ color: '#e53e3e' }}>*</span>
                    <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 500, color: '#64748b' }}>
                        — tick each PO; the remaining balance flows into each row as you check
                    </span>
                </label>
                <div style={{ marginBottom: 6, fontSize: 11, color: '#475569', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 8px', background: '#f1f5f9', borderRadius: 4 }}>
                    <span>Available for this allocation</span>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#0f172a' }}>
                        {cur} {fmt(budgetForThisApply)}
                    </span>
                </div>
                {pos.length === 0 ? (
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        This invoice has no PO-linked lines. Save will be allowed without a PO.
                    </div>
                ) : (
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    <th style={{ width: 40, padding: '6px 10px', borderBottom: '1px solid #e2e8f0' }}></th>
                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>PO</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Job</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>SI Lines</th>
                                    <th style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pos.map(p => {
                                    const pick = picks[p.poId] || { checked: false, amount: '' };
                                    return (
                                        <tr key={p.poId} style={{ borderBottom: '1px solid #f1f5f9', background: pick.checked ? '#fafafa' : '#fff' }}>
                                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                                                <input type="checkbox" checked={pick.checked} onChange={() => togglePo(p)} />
                                            </td>
                                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>{p.poNumber}</td>
                                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{p.jobId || '—'}</td>
                                            <td style={{ padding: '6px 10px', textAlign: 'right', color: '#64748b', fontFamily: 'monospace' }}>
                                                {p.linesValueForThisPo != null ? fmt(p.linesValueForThisPo) : (p.source || '—')}
                                            </td>
                                            <td style={{ padding: '6px 10px', textAlign: 'right' }}>
                                                <AmountInput
                                                    disabled={!pick.checked}
                                                    value={pick.amount}
                                                    onChange={v => updateAmt(p.poId, v)}
                                                    style={{ width: 110, padding: '4px 6px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 4, fontFamily: 'monospace', background: pick.checked ? '#fff' : '#f1f5f9' }} />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot>
                                <tr style={{ background: '#f8fafc' }}>
                                    <td colSpan={4} style={{ padding: '6px 10px', textAlign: 'right', fontSize: 11, fontWeight: 600, color: '#475569', borderTop: '2px solid #e2e8f0' }}>
                                        Total to apply
                                    </td>
                                    <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'monospace', fontWeight: 700, color: '#1e293b', borderTop: '2px solid #e2e8f0' }}>
                                        {fmt(totalToApply)}
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </div>
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Reason <span style={{ color: '#e53e3e' }}>*</span></label>
                <textarea rows={2} className="pf-input" style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                    placeholder="Why is this allocation being applied?"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Authorisation password <span style={{ color: '#e53e3e' }}>*</span></label>
                <input type="password" className="pf-input" style={{ width: '100%', fontSize: 13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── Allocation Remove Modal ───────────────────────────────────────────────────
const AllocRemoveModal = ({ pv, alloc, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);

    const cur = pv.currencyShort || '';

    const submit = async () => {
        if (!reason.trim())   { setErr('Please enter a reason.'); return; }
        if (!password.trim()) { setErr('Password is required.');  return; }
        setBusy(true); setErr('');
        const result = await onConfirm(reason.trim(), password);
        setBusy(false);
        if (result !== true) setErr(result || 'Failed.');
    };

    return (
        <ModalShell headerBg="#fff7ed" headerBorder="#fed7aa" headerColor="#9a3412"
            title="Remove Allocation" subtitle={`${pv.pvNumber} → ${alloc.invoiceNo}`} onClose={onClose}
            footer={<>
                <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Cancel</button>
                <button onClick={submit} disabled={busy}
                    style={{ padding: '7px 22px', borderRadius: 6, border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13, background: '#ea580c', color: '#fff' }}>
                    {busy ? 'Removing…' : '✕ Remove Allocation'}
                </button>
            </>}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#475569', marginBottom: 8 }}>What will happen</div>
            <div style={{ border: '1px solid #fed7aa', borderRadius: 8, overflow: 'hidden', marginBottom: 16 }}>
                <ImpactRow icon="↩️"
                    text={`${cur} ${fmt(alloc.allocatedAmount)} removed from invoice ${alloc.invoiceNo}`}
                    sub="This payment will no longer be counted against this invoice." />
                <ImpactRow icon="📊" text="Invoice outstanding balance will increase"
                    sub={`Invoice ${alloc.invoiceNo} will show ${cur} ${fmt(alloc.allocatedAmount)} more as outstanding.`} />
                <ImpactRow icon="💳" text={`${pv.pvNumber} unallocated balance will increase`}
                    sub={`Current unallocated: ${pv.currencyShort} ${fmt(pv.unallocatedAmount)}`} />
            </div>
            {err && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '7px 12px', fontSize: 12.5, marginBottom: 10 }}>✕ {err}</div>}
            <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Reason <span style={{ color: '#e53e3e' }}>*</span></label>
                <textarea rows={2} className="pf-input" style={{ width: '100%', resize: 'vertical', fontSize: 13 }}
                    placeholder="Why is this allocation being removed?"
                    value={reason} onChange={e => setReason(e.target.value)} />
            </div>
            <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>Authorisation password <span style={{ color: '#e53e3e' }}>*</span></label>
                <input type="password" className="pf-input" style={{ width: '100%', fontSize: 13 }}
                    placeholder="Enter your role's authorisation password"
                    value={password} onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()} />
            </div>
        </ModalShell>
    );
};

// ── fmtAudit helper ───────────────────────────────────────────────────────────
const fmtAudit = (by, dt) => {
    if (!by) return '—';
    const d = dt ? new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    return d ? `${by} · ${d}` : by;
};

// ── AllocTable (read-only, with invoice-no click → PV history modal) ──────────
const AllocTable = ({ allocs, title }) => {
    const [historyInv,     setHistoryInv]     = useState(null);
    const [historyRows,    setHistoryRows]    = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const openHistory = (alloc) => {
        setHistoryInv(alloc);
        setHistoryRows([]);
        setHistoryLoading(true);
        fetch(`${variables.API_URL}paymentvoucher/invoice-allocation-history?supplierInvoiceId=${alloc.supplierInvoiceId}`,
            { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setHistoryRows(Array.isArray(d) ? d : []))
            .catch(() => setHistoryRows([]))
            .finally(() => setHistoryLoading(false));
    };

    return (
        <div style={{ marginTop: 8 }}>
            {title && <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#374151', marginBottom: 8 }}>{title}</div>}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                        <th style={TH_L}>Invoice</th>
                        <th style={TH_L}>Date</th>
                        <th style={TH_L}>Ref</th>
                        <th style={TH_L}>PO</th>
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
                                <button onClick={() => openHistory(a)}
                                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                                        fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                                        color: '#1d4ed8', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
                                    {a.invoiceNo}
                                </button>
                            </td>
                            <td style={TD}>{fmtDate(a.invoiceDate)}</td>
                            <td style={{ ...TD, fontSize: 11, color: '#475569' }}>{a.supplierInvRef || '—'}</td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: 12, color: '#334155' }}>
                                {a.poNumber
                                    ? a.poNumber
                                    : (a.siCoversPoNumbers
                                        ? <span title={a.siCoversPoNumbers} style={{ color: '#94a3b8', fontStyle: 'italic' }}>auto · {a.siCoversPoNumbers}</span>
                                        : '—')}
                            </td>
                            <td style={{ ...TD, fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>{a.jobId || '—'}</td>
                            <td style={{ ...TD_R, fontWeight: 700 }}>
                                {a.invoiceCurrencyShort} {fmt(a.allocatedAmount)}
                                {a.pvCurrencyShort && a.pvCurrencyShort !== a.invoiceCurrencyShort && (
                                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginTop: 1 }}>
                                        {a.pvCurrencyShort} {fmt(a.allocatedAmountPvCcy)}
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

            {/* PV History modal */}
            {historyInv && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                    onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
                    onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) setHistoryInv(null); }}>
                    <div style={{ background: '#fff', borderRadius: 10, width: 720, maxWidth: '100%',
                        boxShadow: '0 12px 40px rgba(0,0,0,.22)', display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflow: 'hidden' }}>
                        <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe', padding: '14px 20px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15, color: '#1e40af' }}>Payment Allocation History</div>
                                <div style={{ fontSize: 12, color: '#1e40af', opacity: .75, marginTop: 2 }}>{historyInv.invoiceNo}</div>
                            </div>
                            <button onClick={() => setHistoryInv(null)}
                                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#1e40af', opacity: .7 }}>✕</button>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
                            {historyLoading ? (
                                <div style={{ color: '#64748b', fontSize: 13, padding: '20px 0' }}>Loading…</div>
                            ) : historyRows.length === 0 ? (
                                <div style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>No allocation history found.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={TH_L}>Payment Voucher</th>
                                            <th style={TH_L}>PV Date</th>
                                            <th style={TH_L}>Status</th>
                                            <th style={TH_R}>Amount</th>
                                            <th style={TH_L}>Reason</th>
                                            <th style={TH_L}>By / Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyRows.map((h, i) => {
                                            const removed = !h.isActive;
                                            return (
                                                <tr key={h.allocationId}
                                                    style={{ borderBottom: '1px solid #f1f5f9', opacity: removed ? .7 : 1,
                                                        background: removed ? (i%2===0 ? '#fff5f5':'#fff0f0') : (i%2===0 ? '#fff':'#fafafa') }}>
                                                    <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, color: '#1e3a5f' }}>
                                                        {h.pvNumber}
                                                        {removed && <span style={{ marginLeft: 6, fontSize: 10, color: '#dc2626', background: '#fee2e2', borderRadius: 4, padding: '1px 5px', fontFamily: 'sans-serif' }}>removed</span>}
                                                    </td>
                                                    <td style={TD}>{fmtDate(h.pvDate)}</td>
                                                    <td style={TD}>
                                                        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 7px',
                                                            background: h.pvStatus === 'Approved' ? '#dcfce7' : h.pvStatus === 'Cancelled' ? '#fee2e2' : '#f1f5f9',
                                                            color:      h.pvStatus === 'Approved' ? '#166534' : h.pvStatus === 'Cancelled' ? '#991b1b' : '#475569' }}>
                                                            {h.pvStatus}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...TD_R, fontWeight: 700, color: removed ? '#dc2626' : '#1e293b', textDecoration: removed ? 'line-through' : 'none' }}>
                                                        {fmt(h.allocatedAmount)}
                                                    </td>
                                                    <td style={{ ...TD, fontSize: 11, color: '#475569', fontStyle: h.reason ? 'normal' : 'italic' }}>{h.reason || '—'}</td>
                                                    <td style={{ ...TD, fontSize: 11, color: '#64748b' }}>{fmtAudit(h.modifiedBy || h.createdBy, h.modifiedDate || h.createdDate)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                            <button className="pf-btn-sec" onClick={() => setHistoryInv(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Allocations Tab ───────────────────────────────────────────────────────────
const AllocationsTab = ({ pv, allocs, isApproved, currentUser, onRefresh }) => {
    const { baseCurrencyCode } = useLookup();
    const [openInvoices,   setOpenInvoices]   = useState([]);
    const [inputs,         setInputs]         = useState({});
    const [loadingInv,     setLoadingInv]     = useState(false);
    const [err,            setErr]            = useState('');
    const [pendingApply,   setPendingApply]   = useState(null);
    const [pendingRemove,  setPendingRemove]  = useState(null);
    const [loadErr,        setLoadErr]        = useState('');
    const [historyInv,     setHistoryInv]     = useState(null);
    const [historyRows,    setHistoryRows]    = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    const loadOpen = useCallback(() => {
        if (!isApproved) return;
        setLoadingInv(true); setLoadErr('');
        const qs = new URLSearchParams({ supplierId: String(pv.supplierId), pvId: String(pv.pvId) });
        fetch(`${variables.API_URL}paymentvoucher/supplier-open-invoices?${qs}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`Server error (${r.status})`); return r.json(); })
            .then(d => {
                const list = Array.isArray(d) ? d : [];
                setOpenInvoices(list);
                const m = {};
                list.forEach(inv => { if (inv.thisPvAllocated > 0) m[inv.supplierInvoiceId] = String(inv.thisPvAllocated); });
                setInputs(m);
            })
            .catch(e => setLoadErr(e.message || 'Failed to load open invoices.'))
            .finally(() => setLoadingInv(false));
    }, [pv, isApproved]);

    useEffect(() => { loadOpen(); }, [loadOpen]);

    const openApplyModal = (inv) => {
        setErr('');
        // Grid-row amount is optional — the modal itself controls the budget.
        // If they typed something, pass it through (the modal will ignore it
        // for the budget but the value is still available for legacy callers).
        const amt = Number(inputs[inv.supplierInvoiceId]) || 0;
        setPendingApply({ inv, amount: amt });
    };

    const doApply = async (reason, password, allocations) => {
        const { inv, amount } = pendingApply;
        // Fallback: if the modal didn't return any picked-PO rows (e.g. SI has
        // no PO-linked lines at all), fall through with one rowless allocation
        // using the original grid-row amount.
        const list = (Array.isArray(allocations) && allocations.length > 0)
            ? allocations
            : [{ poId: null, amount: amount }];

        try {
            // Save each allocation sequentially so we can surface a specific
            // error from whichever row the SP rejects.
            for (const row of list) {
                const res = await fetch(`${variables.API_URL}paymentvoucher/allocation/save`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({
                        pvId: pv.pvId, supplierInvoiceId: inv.supplierInvoiceId,
                        allocatedAmount: row.amount, poId: row.poId,
                        createdBy: currentUser, modifiedBy: currentUser,
                        reason, password,
                    }),
                });
                const d = await res.json().catch(() => ({}));
                if (!res.ok) return d?.message || 'Allocation failed.';
            }
            setPendingApply(null);
            onRefresh(); loadOpen();
            return true;
        } catch { return 'Network error.'; }
    };

    const doRemove = async (reason, password) => {
        try {
            const res = await fetch(
                `${variables.API_URL}paymentvoucher/allocation/${pendingRemove.allocationId}`,
                { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ modifiedBy: currentUser, reason, password }) }
            );
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Remove failed.';
            setPendingRemove(null);
            onRefresh(); loadOpen();
            return true;
        } catch { return 'Network error.'; }
    };

    const openHistory = (inv) => {
        setHistoryInv(inv);
        setHistoryRows([]);
        setHistoryLoading(true);
        fetch(`${variables.API_URL}paymentvoucher/invoice-allocation-history?supplierInvoiceId=${inv.supplierInvoiceId}`,
            { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setHistoryRows(Array.isArray(d) ? d : []))
            .catch(() => setHistoryRows([]))
            .finally(() => setHistoryLoading(false));
    };

    const allocById = (supplierInvoiceId) => allocs.find(a => a.supplierInvoiceId === supplierInvoiceId);

    if (!isApproved) {
        return (
            <div className="jd-tab-body">
                <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8,
                    padding: '12px 16px', maxWidth: 560, fontSize: 13, color: '#78350f', marginBottom: 16 }}>
                    🔒 The payment voucher must be <strong>Approved</strong> before invoices can be allocated against it.
                    Submit it for approval using the <strong>Approval</strong> tab.
                </div>
                {allocs.length > 0 && <AllocTable allocs={allocs} title="Registered allocations" />}
            </div>
        );
    }

    return (
        <div className="jd-tab-body">
            {err     && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>✕ {err}</div>}
            {loadErr && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 12 }}>⚠ {loadErr}</div>}

            {/* Balance strip */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 14,
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px', fontSize: 13 }}>
                {[
                    { label: 'Paid',        val: pv.amountPaid,        color: '#1e293b' },
                    { label: 'Allocated',   val: pv.allocatedAmount,   color: '#1e293b' },
                    { label: 'Unallocated', val: pv.unallocatedAmount, color: pv.unallocatedAmount > 0 ? '#b45309' : '#166534' },
                ].map((k, i) => (
                    <div key={k.label} style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        {i > 0 && <span style={{ color: '#cbd5e1', marginRight: 8 }}>|</span>}
                        <span style={{ color: '#64748b' }}>{k.label}:</span>
                        <strong style={{ fontFamily: 'monospace', color: k.color }}>{fmt(k.val)}</strong>
                        <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>{pv.currencyShort}</span>
                    </div>
                ))}
                {pv.exchangeRate && pv.exchangeRate !== 1 && (
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
                        Rate: 1 {pv.currencyShort} = {Number(pv.exchangeRate).toFixed(4)} {baseCurrencyCode}
                    </span>
                )}
            </div>

            {/* Open supplier invoices */}
            {loadingInv ? (
                <div style={{ padding: '20px 0', color: '#64748b', fontSize: 13 }}>Loading open invoices…</div>
            ) : openInvoices.length === 0 ? (
                <div className="jd-empty-card">No open supplier invoices found for {pv.supplierName}.</div>
            ) : (
                <div style={{ overflowX: 'auto', marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: '#374151', marginBottom: 4 }}>
                        Open Supplier Invoices — Apply Payment
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginBottom: 8 }}>
                        The <strong>Total Allocated</strong> field sets the <em>total</em> amount allocated from this PV against each invoice — entering a new value <em>replaces</em> the existing allocation. To increase from 200 → 500, enter 500 (not 300).
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <th style={TH_L}>Invoice No</th>
                                <th style={TH_L}>Date</th>
                                <th style={TH_L}>Supplier Ref</th>
                                <th style={TH_L}>PO No</th>
                                <th style={TH_L}>Job No</th>
                                <th style={TH_R}>Currency</th>
                                <th style={TH_R}>Total</th>
                                <th style={TH_R}>Current Outstanding</th>
                                <th style={TH_R}>Outstanding (before PV)</th>
                                <th style={{ ...TH_R, width: 160 }}>Total Allocated (this PV)</th>
                                <th style={{ ...TH_L, width: 110 }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {openInvoices.map((inv, i) => {
                                const existing = allocById(inv.supplierInvoiceId);
                                return (
                                    <tr key={inv.supplierInvoiceId}
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
                                        <td style={{ ...TD, fontSize: 11, color: '#475569' }}>{inv.supplierInvRef || '—'}</td>
                                        <td style={{ ...TD, fontSize: 11, color: '#1e3a5f', fontFamily: 'monospace', fontWeight: 600 }}>{inv.poNumbers || '—'}</td>
                                        <td style={{ ...TD, fontSize: 11, color: '#166534', fontWeight: 600 }}>{inv.jobIds || '—'}</td>
                                        <td style={{ ...TD_R, fontSize: 11, fontWeight: 700, color: '#475569' }}>{inv.currencyShort || '—'}</td>
                                        <td style={TD_R}>{fmt(inv.totalAmount)}</td>
                                        <td style={{ ...TD_R, fontWeight: 600, color: Math.max(0, Number(inv.outstanding) - Number(inv.thisPvAllocated || 0)) > 0 ? '#b45309' : '#166534' }}>
                                            {fmt(Math.max(0, Number(inv.outstanding) - Number(inv.thisPvAllocated || 0)))}
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
                                            </div>
                                            {/* When PV currency ≠ invoice currency, show PV-currency equivalent of the existing allocation */}
                                            {inv.thisPvAllocated > 0 && pv.currencyShort && inv.currencyShort !== pv.currencyShort && (
                                                <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right', marginTop: 2 }}>
                                                    ≈ {pv.currencyShort} {fmt(inv.thisPvAllocated * (inv.invoiceExchangeRate || 1) / (pv.exchangeRate || 1))}
                                                    {' '}(already applied)
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ ...TD, display: 'flex', gap: 4, alignItems: 'center' }}>
                                            <button className="pf-btn-pri" style={{ padding: '4px 12px', fontSize: 11 }}
                                                onClick={() => openApplyModal(inv)}>Apply</button>
                                            {existing && (
                                                <button className="pf-btn-sec"
                                                    style={{ padding: '4px 8px', fontSize: 11, color: '#991b1b', borderColor: '#fca5a5' }}
                                                    onClick={() => setPendingRemove(existing)}>✕</button>
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
                <AllocApplyModal pv={pv} inv={pendingApply.inv} amount={pendingApply.amount}
                    onClose={() => setPendingApply(null)} onConfirm={doApply} />
            )}
            {pendingRemove && (
                <AllocRemoveModal pv={pv} alloc={pendingRemove}
                    onClose={() => setPendingRemove(null)} onConfirm={doRemove} />
            )}

            {/* Invoice history modal (from open invoices table) */}
            {historyInv && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1200,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
                    onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
                    onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) setHistoryInv(null); }}>
                    <div style={{ background: '#fff', borderRadius: 10, width: 720, maxWidth: '100%',
                        boxShadow: '0 12px 40px rgba(0,0,0,.22)', display: 'flex', flexDirection: 'column', maxHeight: '80vh', overflow: 'hidden' }}>
                        <div style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe', padding: '14px 20px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: 15, color: '#1e40af' }}>Payment Allocation History</div>
                                <div style={{ fontSize: 12, color: '#1e40af', opacity: .75, marginTop: 2 }}>{historyInv.invoiceNo}</div>
                            </div>
                            <button onClick={() => setHistoryInv(null)}
                                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#1e40af', opacity: .7 }}>✕</button>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 20px' }}>
                            {historyLoading ? (
                                <div style={{ color: '#64748b', fontSize: 13, padding: '20px 0' }}>Loading…</div>
                            ) : historyRows.length === 0 ? (
                                <div style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>No allocation history found.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <th style={TH_L}>Payment Voucher</th><th style={TH_L}>PV Date</th>
                                            <th style={TH_L}>Status</th><th style={TH_R}>Amount</th>
                                            <th style={TH_L}>Reason</th><th style={TH_L}>By / Date</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyRows.map((h, i) => {
                                            const removed = !h.isActive;
                                            return (
                                                <tr key={h.allocationId}
                                                    style={{ borderBottom: '1px solid #f1f5f9', opacity: removed ? .7 : 1,
                                                        background: removed ? (i%2===0?'#fff5f5':'#fff0f0') : (i%2===0?'#fff':'#fafafa') }}>
                                                    <td style={{ ...TD, fontFamily: 'monospace', fontWeight: 700, color: '#1e3a5f' }}>
                                                        {h.pvNumber}
                                                        {removed && <span style={{ marginLeft: 6, fontSize: 10, color: '#dc2626', background: '#fee2e2', borderRadius: 4, padding: '1px 5px', fontFamily: 'sans-serif' }}>removed</span>}
                                                    </td>
                                                    <td style={TD}>{fmtDate(h.pvDate)}</td>
                                                    <td style={TD}>
                                                        <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 4, padding: '2px 7px',
                                                            background: h.pvStatus==='Approved'?'#dcfce7':h.pvStatus==='Cancelled'?'#fee2e2':'#f1f5f9',
                                                            color:      h.pvStatus==='Approved'?'#166534':h.pvStatus==='Cancelled'?'#991b1b':'#475569' }}>
                                                            {h.pvStatus}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...TD_R, fontWeight: 700, color: removed?'#dc2626':'#1e293b', textDecoration: removed?'line-through':'none' }}>
                                                        {fmt(h.allocatedAmount)}
                                                    </td>
                                                    <td style={{ ...TD, fontSize: 11, color: '#475569', fontStyle: h.reason?'normal':'italic' }}>{h.reason||'—'}</td>
                                                    <td style={{ ...TD, fontSize: 11, color: '#64748b' }}>{fmtAudit(h.modifiedBy||h.createdBy, h.modifiedDate||h.createdDate)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                            <button className="pf-btn-sec" onClick={() => setHistoryInv(null)}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const PaymentVoucherDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const currentUser = useCurrentUser();
    const { canDo } = usePermission();
    const canEdit   = canDo('/payment-vouchers', 'EDIT');
    const canRevise = canDo('/payment-vouchers', 'REVISE');

    const [pv,          setPv]          = useState(null);
    const [allocs,      setAllocs]      = useState([]);
    const [loading,     setLoading]     = useState(true);
    const [error,       setError]       = useState('');
    const [activeTab,   setActiveTab]   = useState('overview');
    const [approvalTx,  setApprovalTx]  = useState(null);
    const [showRevise,  setShowRevise]  = useState(false);
    const [showCancel,  setShowCancel]  = useState(false);
    const [showPrint,   setShowPrint]   = useState(false);
    const [busy,        setBusy]        = useState(false);
    const [alertMsg,    setAlertMsg]    = useState(null);
    const [confirm,     setConfirm]     = useState(null);

    const load = useCallback(() => {
        setLoading(true); setError('');
        fetch(`${variables.API_URL}paymentvoucher/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setPv(d.paymentVoucher); setAllocs(d.allocations || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    const deletePv = () => {
        setConfirm({
            title: 'Delete Payment Voucher',
            message: 'Delete this payment voucher? This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setBusy(true);
                try {
                    const res = await fetch(
                        `${variables.API_URL}paymentvoucher/${id}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setAlertMsg(d?.message || 'Delete failed.'); return; }
                    navigate('/payment-vouchers');
                } catch { setAlertMsg('Network error.'); }
                finally { setBusy(false); }
            },
        });
    };

    const handleRevise = async (reason, password) => {
        try {
            const res = await fetch(`${variables.API_URL}paymentvoucher/${id}/revise`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ reason, password, revisedBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Revision failed.';
            setShowRevise(false); load();
            return true;
        } catch { return 'Network error.'; }
    };

    const handleCancel = async (reason, password) => {
        try {
            const res = await fetch(`${variables.API_URL}paymentvoucher/${id}/cancel`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ reason, password, cancelledBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Cancellation failed.';
            setShowCancel(false); load();
            return true;
        } catch { return 'Network error.'; }
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-spinner" /><span className="jd-spinner-text">Loading payment voucher…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/payment-vouchers')}>← Back to Payment Vouchers</button>
        </div>
    );
    if (!pv) return null;

    const cfg        = STATUS_CFG[pv.status] || STATUS_CFG.Draft;
    const isDraft    = pv.status === 'Draft';
    const isApproved = pv.status === 'Approved';

    const allocBadge = allocs.length > 0
        ? <span className="jd-tab-badge">{allocs.length}</span>
        : null;

    const renderTab = () => {
        switch (activeTab) {
            case 'overview':
                return <OverviewTab pv={pv} isDraft={isDraft} canEdit={canEdit} currentUser={currentUser} onRefresh={load} />;
            case 'allocations':
                return <AllocationsTab pv={pv} allocs={allocs} isApproved={isApproved} currentUser={currentUser} onRefresh={load} />;
            case 'approval':
                return (
                    <ApprovalHistoryTab
                        moduleCode="PV"
                        documentId={pv.pvId}
                        documentNo={pv.pvNumber}
                        documentAmount={pv.amountPaid}
                        currencyId={pv.currencyId}
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
                    <button className="jd-back-btn" onClick={() => navigate('/payment-vouchers')}>← Payment Vouchers</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{pv.pvNumber}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">{pv.supplierName}</span>
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: cfg.bg, color: cfg.color }}>
                        <span className="cd-flag-dot" style={{ background: cfg.dot }} />{cfg.label}
                    </span>
                    <button className="jd-stage-btn" onClick={() => setShowPrint(true)} disabled={busy}
                        style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}>
                        🖨 Print
                    </button>
                    {isApproved && canRevise && (
                        <button className="jd-stage-btn" onClick={() => setShowRevise(true)} disabled={busy}
                            style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
                            ✏️ Revise
                        </button>
                    )}
                    {isApproved && canEdit && (
                        <button className="jd-stage-btn" onClick={() => setShowCancel(true)} disabled={busy}
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            ⛔ Cancel Voucher
                        </button>
                    )}
                    {isDraft && canEdit && (
                        <button className="jd-stage-btn" onClick={deletePv} disabled={busy}
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            {busy ? 'Deleting…' : '🗑 Delete'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'PV Date',     val: fmtDate(pv.pvDate) },
                    { label: 'Supplier',    val: pv.supplierName },
                    { label: 'Currency',    val: pv.currencyShort || '—' },
                    { label: 'Mode',        val: pv.paymentMode || '—' },
                    { label: 'Reference',   val: pv.referenceNo || '—' },
                    { label: 'Paid',        val: fmt(pv.amountPaid),        cls: 'jd-kpi-blue' },
                    { label: 'Allocated',   val: fmt(pv.allocatedAmount) },
                    { label: 'Unallocated', val: fmt(pv.unallocatedAmount), cls: pv.unallocatedAmount > 0 ? 'jd-kpi-amber' : '' },
                ].map((k, i) => (
                    <React.Fragment key={k.label}>
                        {i > 0 && <div className="jd-kpi-div" />}
                        <div className="jd-kpi">
                            <div className="jd-kpi-label">{k.label}</div>
                            <div className={`jd-kpi-val${k.cls ? ` ${k.cls}` : ''}`}>{k.val}</div>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* ── APPROVAL BANNER ── */}
            <ApprovalStatusBanner moduleCode="PV" documentId={pv.pvId} approvalTx={approvalTx} />

            {/* ── TABS ── */}
            <div className="jd-tabs-bar">
                {PV_TABS.map(t => (
                    <button key={t.key} className={`jd-tab-btn${activeTab === t.key ? ' jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(t.key)}>
                        <span className="jd-tab-icon">{t.icon}</span>
                        {t.label}
                        {t.badge && allocBadge}
                    </button>
                ))}
            </div>

            <div className="jd-tab-content">{renderTab()}</div>

            {showRevise && (
                <ReviseModal pv={pv} allocs={allocs} onClose={() => setShowRevise(false)} onConfirm={handleRevise} />
            )}
            {showCancel && (
                <CancelModal pv={pv} allocs={allocs} onClose={() => setShowCancel(false)} onConfirm={handleCancel} />
            )}
            {showPrint && (
                <VoucherPrintModal kind="PV" voucher={pv} allocs={allocs} onClose={() => setShowPrint(false)} />
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default PaymentVoucherDetail;
