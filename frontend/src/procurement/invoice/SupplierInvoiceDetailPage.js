import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import ConfirmModal from '../../common/ConfirmModal';
import { fmtDate, fmt, FormSection } from '../procurementConstants';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import InvoiceLinesTab from './tabs/InvoiceLinesTab';
import '../../jobs/JobDetail.css';
import '../Procurement.css';
import AlertModal from '../../common/AlertModal';
import LoginPasswordModal from '../../common/LoginPasswordModal';

const SINV_TABS = [
    { key: 'overview', label: 'Overview', icon: '📋' },
    { key: 'lines',    label: 'Lines',    icon: '📦', badge: true },
];

// ── Status badge helper (fallback when LookupContext has no SINV config) ──
const SINV_STATUS_STYLE = {
    Draft:     { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
    Submitted: { bg: '#fef9c3', color: '#854d0e', dot: '#ca8a04' },
    Approved:  { bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
    Posted:    { bg: '#dbeafe', color: '#1e40af', dot: '#3b82f6' },
};
const sinvStatusCfg = (status) =>
    SINV_STATUS_STYLE[status] || { bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };

// ── Revise Modal ──────────────────────────────────────────────────────
const ReviseModal = ({ invoiceNo, onClose, onConfirm }) => {
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [busy,     setBusy]     = useState(false);
    const [err,      setErr]      = useState('');

    const submit = async () => {
        if (!reason.trim())   { setErr('Please enter a reason for the revision.'); return; }
        if (!password.trim()) { setErr('Please enter the authorisation password.'); return; }
        setBusy(true); setErr('');
        const result = await onConfirm(reason.trim(), password);
        if (result !== true) {
            setErr(typeof result === 'string' ? result : 'Operation failed — wrong password or not authorised.');
            setBusy(false);
        }
        // on success the parent closes the modal via onClose
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 10, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ background: '#b45309', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>✎ Revise Approved Invoice</div>
                        <div style={{ color: '#fde68a', fontSize: 12, marginTop: 2 }}>{invoiceNo}</div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ padding: '18px 20px' }}>
                    <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, padding: '8px 12px', marginBottom: 16, fontSize: 12.5, color: '#92400e' }}>
                        ⚠ This will revert the invoice back to <strong>Draft</strong> status and allow editing. A reason and authorisation password are required.
                    </div>

                    {err && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '7px 12px', fontSize: 12.5, marginBottom: 12 }}>
                            {err}
                        </div>
                    )}

                    <div style={{ marginBottom: 14 }}>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                            Reason for Revision <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <textarea
                            className="pf-input pf-textarea"
                            rows={3}
                            placeholder="e.g. Invoice amount corrected, wrong GRN linked…"
                            value={reason}
                            onChange={e => { setReason(e.target.value); setErr(''); }}
                            style={{ resize: 'vertical' }}
                        />
                    </div>

                    <div>
                        <label style={{ fontSize: 11.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 5 }}>
                            Authorisation Password <span style={{ color: '#dc2626' }}>*</span>
                        </label>
                        <input
                            type="password"
                            autoComplete="new-password"
                            className="pf-input"
                            placeholder="Enter invoice revision password"
                            value={password}
                            onChange={e => { setPassword(e.target.value); setErr(''); }}
                            onKeyDown={e => e.key === 'Enter' && !busy && submit()}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button className="pf-btn-sec" onClick={onClose} disabled={busy}>Cancel</button>
                    <button
                        onClick={submit}
                        disabled={busy}
                        style={{ padding: '7px 20px', fontSize: 13, fontWeight: 600, background: busy ? '#d97706' : '#b45309', color: '#fff', border: 'none', borderRadius: 6, cursor: busy ? 'not-allowed' : 'pointer' }}>
                        {busy ? 'Verifying…' : 'Revise Invoice'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Read-mode field card (matches the Customer Invoice Overview) ──────
const Field = ({ label, children, mono }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className={`prd-ov-val${mono ? ' prd-ov-val-mono' : ''}`}>
            {children || <span className="prd-ov-val-muted">—</span>}
        </div>
    </div>
);

// ── Overview Tab ──────────────────────────────────────────────────────
const OverviewTab = ({ invoice, linesCount = 0, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { lookups } = useLookup();
    const { currencies, paymentTerms } = lookups;
    const { canDo } = usePermission();
    const isDraft = invoice.status === 'Draft';
    const canEdit = canDo('/supplier-invoice', 'EDIT') && isDraft;

    const [editing,     setEditing]     = useState(false);
    const [form,        setForm]        = useState({});
    const [errors,      setErrors]      = useState({});
    const [saving,      setSaving]      = useState(false);
    const [serverError, setServerError] = useState('');

    // Supplier live-search — editable only in Draft, and only when no lines
    // exist yet (changing supplier would orphan GRN-linked lines).
    const [supResults,  setSupResults]  = useState([]);
    const [supLoading,  setSupLoading]  = useState(false);
    const [showSupDrop, setShowSupDrop] = useState(false);
    const supTimerRef = useRef(null);
    const supplierLocked = linesCount > 0;

    const startEdit = () => {
        setForm({
            supplierId:     invoice.supplierId || '',
            supplierName:   invoice.supplierName || '',
            supplierInvRef: invoice.supplierInvRef || '',
            invoiceDate:    invoice.invoiceDate?.slice(0, 10) || '',
            currencyId:     String(invoice.currencyId || 2),
            exchangeRate:   String(invoice.exchangeRate || 1),
            paymentTermsId: String(invoice.paymentTermsId || ''),
            dueDate:        invoice.dueDate?.slice(0, 10) || '',
            notes:          invoice.notes || '',
        });
        setErrors({}); setServerError(''); setEditing(true);
    };

    const onSupInput = (val) => {
        setForm(p => ({ ...p, supplierName: val, supplierId: '' }));
        clearTimeout(supTimerRef.current);
        if (!val.trim()) { setSupResults([]); setShowSupDrop(false); return; }
        supTimerRef.current = setTimeout(() => {
            setSupLoading(true);
            fetch(`${variables.API_URL}supplier/search?searchText=${encodeURIComponent(val)}&pageSize=8`, { headers: authHeaders() })
                .then(r => r.json())
                .then(d => { setSupResults(d.data || []); setShowSupDrop(true); })
                .catch(console.error)
                .finally(() => setSupLoading(false));
        }, 280);
    };
    const selectSupplier = (s) => {
        setForm(p => ({ ...p, supplierId: s.supplierId, supplierName: s.supplierName }));
        setShowSupDrop(false);
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const handleCurrency = e => {
        const id  = e.target.value;
        const cur = currencies.find(c => String(c.id) === id);
        setForm(p => ({ ...p, currencyId: id, exchangeRate: cur ? String(cur.exchangeRate ?? 1) : '1' }));
    };

    const validate = f => {
        const e = {};
        if (!f.supplierId)  e.supplier    = 'Supplier is required.';
        if (!f.invoiceDate) e.invoiceDate = 'Invoice date is required.';
        if (!f.exchangeRate || Number(f.exchangeRate) <= 0) e.exchangeRate = 'Exchange rate must be > 0.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length > 0) return;
        setSaving(true); setServerError('');
        fetch(`${variables.API_URL}supplierinvoice/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                supplierInvoiceId: invoice.supplierInvoiceId,
                invoiceNo:         invoice.invoiceNo,
                supplierInvRef:    form.supplierInvRef.trim() || null,
                invoiceDate:       form.invoiceDate,
                supplierId:        form.supplierId || invoice.supplierId,
                currencyId:        Number(form.currencyId),
                exchangeRate:      Number(form.exchangeRate),
                paymentTermsId:    form.paymentTermsId ? Number(form.paymentTermsId) : null,
                dueDate:           form.dueDate || null,
                subTotal:          invoice.subTotal,
                taxAmount:         invoice.taxAmount,
                totalAmount:       invoice.totalAmount,
                notes:             form.notes.trim() || null,
                createdBy:         invoice.createdBy,
                modifiedBy:        currentUser,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setServerError(d.message || 'Error saving.'); return; }
                setEditing(false);
                onRefresh();
            })
            .catch(() => setServerError('Network error.'))
            .finally(() => setSaving(false));
    };

    const FieldErr = ({ msg }) => msg
        ? <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>⚠ {msg}</div>
        : null;

    const curObj = currencies.find(c => c.id === invoice.currencyId);

    // ── EDIT MODE ──────────────────────────────────────────────────
    if (editing) {
        return (
            <div style={{ padding: '24px', maxWidth: 720 }}>
                {serverError && <div className="pf-err" style={{ marginBottom: 12 }}>{serverError}</div>}

                <FormSection label="Supplier" />
                <div className="pf-row">
                    <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                        <label>Supplier <span className="req">*</span></label>
                        {(isDraft && !supplierLocked) ? (
                            <>
                                <input className={`pf-input${errors.supplier ? ' pf-input-err' : ''}`} value={form.supplierName || ''}
                                    placeholder="Search supplier…" autoComplete="off"
                                    onChange={e => onSupInput(e.target.value)}
                                    onFocus={() => supResults.length > 0 && setShowSupDrop(true)}
                                    onBlur={() => setTimeout(() => setShowSupDrop(false), 150)} />
                                {form.supplierId && (
                                    <button type="button" title="Clear supplier"
                                        onClick={() => setForm(p => ({ ...p, supplierId: '', supplierName: '' }))}
                                        style={{ position: 'absolute', right: 8, top: 30, background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontWeight: 700 }}>✕</button>
                                )}
                                {supLoading && <div style={{ position: 'absolute', right: 28, top: 32, fontSize: 11, color: '#94a3b8' }}>…</div>}
                                {showSupDrop && supResults.length > 0 && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6,
                                        boxShadow: '0 4px 12px rgba(0,0,0,.1)', maxHeight: 220, overflowY: 'auto', marginTop: 2 }}>
                                        {supResults.map(s => (
                                            <div key={s.supplierId} onMouseDown={() => selectSupplier(s)}
                                                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                <span style={{ fontWeight: 600 }}>{s.supplierName}</span>
                                                {s.supplierCode && <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>({s.supplierCode})</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <FieldErr msg={errors.supplier} />
                            </>
                        ) : (
                            <>
                                <input className="pf-input" value={form.supplierName || ''} readOnly
                                    style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                    title={supplierLocked ? 'Remove the invoice lines before changing the supplier' : 'Supplier can only be changed while the invoice is in Draft'} />
                                {supplierLocked && <div style={{ fontSize: 10.5, color: '#b45309', marginTop: 3 }}>Remove lines to change the supplier.</div>}
                            </>
                        )}
                    </div>
                </div>

                <FormSection label="Invoice Details" />
                <div className="pf-row">
                    <div className="pf-field">
                        <label>Invoice Date <span className="req">*</span></label>
                        <input className={`pf-input${errors.invoiceDate ? ' pf-input-err' : ''}`}
                            type="date" name="invoiceDate" value={form.invoiceDate} onChange={handle} />
                        <FieldErr msg={errors.invoiceDate} />
                    </div>
                    <div className="pf-field pf-f2">
                        <label>Supplier Invoice Ref</label>
                        <input className="pf-input" type="text" name="supplierInvRef"
                            value={form.supplierInvRef} onChange={handle} placeholder="Supplier's invoice number" />
                    </div>
                </div>

                <FormSection label="Currency & Payment" />
                <div className="pf-row">
                    <div className="pf-field">
                        <label>Currency</label>
                        <select className="pf-input" name="currencyId" value={form.currencyId} onChange={handleCurrency}>
                            {currencies.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                        </select>
                    </div>
                    <div className="pf-field" style={{ flex: '0 0 130px' }}>
                        <label>Exchange Rate <span className="req">*</span></label>
                        <input className={`pf-input${errors.exchangeRate ? ' pf-input-err' : ''}`}
                            type="number" name="exchangeRate" value={form.exchangeRate}
                            onChange={handle} step="0.000001" min="0.000001" />
                        <FieldErr msg={errors.exchangeRate} />
                    </div>
                    <div className="pf-field">
                        <label>Payment Terms</label>
                        <select className="pf-input" name="paymentTermsId" value={form.paymentTermsId} onChange={handle}>
                            <option value="">— None —</option>
                            {paymentTerms.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                        </select>
                    </div>
                    <div className="pf-field">
                        <label>Due Date</label>
                        <input className="pf-input" type="date" name="dueDate" value={form.dueDate} onChange={handle} />
                    </div>
                </div>

                <FormSection label="Notes" />
                <div className="pf-row">
                    <div className="pf-field pf-f3">
                        <textarea className="pf-input pf-textarea" rows={2} name="notes"
                            value={form.notes} onChange={handle} placeholder="Optional notes…" />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                    <button className="pf-btn-sec" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>
            </div>
        );
    }

    // ── READ MODE (card grid — same structure as the Customer Invoice) ──
    return (
        <div style={{ padding: '20px 24px' }}>
            {canEdit && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <button className="jd-stage-btn"
                            style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}
                            onClick={startEdit}>
                        ✏ Edit Header
                    </button>
                </div>
            )}

            <div className="prd-ov-grid">
                <Field label="Supplier"        >{invoice.supplierName}</Field>
                <Field label="Supplier Inv Ref" mono>{invoice.supplierInvRef}</Field>
                <Field label="Invoice Date"    >{fmtDate(invoice.invoiceDate)}</Field>
                <Field label="Due Date"        >{invoice.dueDate ? fmtDate(invoice.dueDate) : ''}</Field>
                <Field label="Currency">
                    <span style={{
                        fontFamily: 'Courier New, monospace', fontSize: 13, fontWeight: 700,
                        background: '#dbeafe', color: '#1e40af',
                        padding: '3px 10px', borderRadius: 4, letterSpacing: '.05em',
                    }}>
                        {curObj?.shortName || ''}
                    </span>
                    {curObj?.isBaseCurrency && (
                        <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: '#166534',
                            background: '#dcfce7', padding: '2px 7px', borderRadius: 10 }}>
                            Base
                        </span>
                    )}
                </Field>
                <Field label="Exchange Rate" mono>
                    {curObj?.isBaseCurrency ? 'Base Currency (1.00)' : String(invoice.exchangeRate)}
                </Field>
                <Field label="Payment Terms"   >{invoice.paymentTermsName}</Field>
            </div>

            {invoice.notes && (
                <div style={{ marginTop: 16 }}>
                    <div className="prd-ov-label" style={{ marginBottom: 6 }}>Notes</div>
                    <div className="prd-ov-notes" style={{ borderLeft: '3px solid #f59e0b', background: '#fffbeb' }}>
                        {invoice.notes}
                    </div>
                </div>
            )}

            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                <div className="prd-ov-grid">
                    <Field label="Created By">
                        {`${invoice.createdBy}  ·  ${fmtDate(invoice.createdDate)}`}
                    </Field>
                    {invoice.modifiedBy && (
                        <Field label="Last Modified">
                            {`${invoice.modifiedBy}  ·  ${fmtDate(invoice.modifiedDate)}`}
                        </Field>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Main Detail Page ──────────────────────────────────────────────────
const SupplierInvoiceDetailPage = () => {
    const { invoiceId }       = useParams();
    const navigate            = useNavigate();
    const currentUser         = useCurrentUser();
    const { canDo }           = usePermission();

    const [invoice,        setInvoice]    = useState(null);
    const [lines,          setLines]      = useState([]);
    const [loading,        setLoading]    = useState(true);
    const [error,          setError]      = useState(null);
    const [activeTab,      setActiveTab]  = useState('overview');
    const [showStatusMenu, setStatusMenu]    = useState(false);
    const [statusBusy,     setStatusBusy]    = useState(false);
    const [showRevise,     setShowRevise]    = useState(false);
    const [alertMsg,       setAlertMsg]      = useState(null);
    const [confirm,        setConfirm]       = useState(null);
    const [showLoginPw,    setShowLoginPw]   = useState(false);
    const [pendingStatus,  setPendingStatus] = useState(null); // status awaiting password
    const statusRef = useRef(null);

    const load = useCallback(() => {
        setLoading(true); setError(null);
        fetch(`${variables.API_URL}supplierinvoice/${invoiceId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setInvoice(d.header); setLines(d.lines || []); })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [invoiceId]);

    useEffect(() => { load(); }, [load]);

    // Close status dropdown on outside click
    useEffect(() => {
        if (!showStatusMenu) return;
        const h = e => { if (statusRef.current && !statusRef.current.contains(e.target)) setStatusMenu(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [showStatusMenu]);

    const STATUS_TRANSITIONS = {
        Draft:     ['Submitted'],
        Submitted: ['Approved', 'Draft'],
        Approved:  ['Posted'],
        Posted:    [],
    };

    const PASSWORD_REQUIRED = new Set(['Approved', 'Posted']);

    const doChangeStatus = async (newStatus, loginPassword = null) => {
        setStatusBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}supplierinvoice/changestatus`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ supplierInvoiceId: Number(invoiceId), newStatus, loginPassword, changedBy: currentUser })
            });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d.message || 'Status change failed.'); return; }
            load();
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setStatusBusy(false); }
    };

    const changeStatus = (newStatus) => {
        setStatusMenu(false);
        if (PASSWORD_REQUIRED.has(newStatus)) {
            setPendingStatus(newStatus);
            setShowLoginPw(true);
            return;
        }
        doChangeStatus(newStatus);
    };

    const deleteInvoice = () => {
        setConfirm({
            title: 'Delete Invoice',
            message: 'Delete this draft invoice? This cannot be undone.',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                try {
                    const res = await fetch(`${variables.API_URL}supplierinvoice/${invoiceId}`, { method: 'DELETE', headers: authHeaders() });
                    const d = await res.json();
                    if (!res.ok) { setAlertMsg(d.message || 'Delete failed.'); return; }
                    navigate('/supplier-invoice');
                } catch { setAlertMsg('Network error. Please try again.'); }
            },
        });
    };

    // Returns true on success, or an error-message string on failure
    const revise = async (reason, password) => {
        try {
            const res = await fetch(`${variables.API_URL}supplierinvoice/revise`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ supplierInvoiceId: Number(invoiceId), reason, password, revisedBy: currentUser }),
            });
            const d = await res.json();
            if (!res.ok) return d?.message || 'Revision failed.';
            setShowRevise(false);
            load();
            return true;
        } catch { return 'Network error. Please try again.'; }
    };

    if (loading) return (
        <div className="jd-page-loading">
            <div className="jd-page-spinner" />
            <span>Loading invoice…</span>
        </div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/supplier-invoice')}>← Back</button>
        </div>
    );
    if (!invoice) return null;

    const cfg         = sinvStatusCfg(invoice.status);
    const transitions = STATUS_TRANSITIONS[invoice.status] || [];
    const canEdit     = canDo('/supplier-invoice', 'EDIT');
    const canDelete   = canEdit && invoice.status === 'Draft';
    const canRevise   = canEdit && invoice.status === 'Approved';

    return (
        <div className="jd-page">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/supplier-invoice')}>← Invoices</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{invoice.invoiceNo || `Invoice #${invoiceId}`}</div>
                    <div className="jd-header-info">
                        <span className="jd-header-customer">{invoice.supplierName}</span>
                        {invoice.supplierInvRef && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project" style={{ fontFamily: 'Courier New', fontSize: 12 }}>Ref: {invoice.supplierInvRef}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: cfg.bg, color: cfg.color }}>
                        <span className="cd-flag-dot" style={{ background: cfg.dot }} />
                        {invoice.status}
                    </span>

                    {canDelete && (
                        <button className="jd-stage-btn" onClick={deleteInvoice}
                            style={{ background: '#fee2e2', color: '#991b1b', borderColor: '#fca5a5' }}>
                            Delete
                        </button>
                    )}

                    {canRevise && (
                        <button className="jd-stage-btn" onClick={() => setShowRevise(true)}
                            style={{ background: '#fff7ed', color: '#b45309', borderColor: '#fed7aa' }}>
                            ✎ Revise
                        </button>
                    )}

                    {transitions.length > 0 && canEdit && (
                        <div className="prd-status-wrap" ref={statusRef}>
                            <button className="jd-stage-btn" onClick={() => setStatusMenu(o => !o)} disabled={statusBusy}>
                                Change Status ▾
                            </button>
                            {showStatusMenu && (
                                <div className="prd-status-menu">
                                    {transitions.map(t => (
                                        <div key={t} className="prd-status-item" onClick={() => changeStatus(t)}>→ {t}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Invoice Date', val: fmtDate(invoice.invoiceDate) },
                    invoice.dueDate && { label: 'Due Date', val: fmtDate(invoice.dueDate) },
                    invoice.supplierInvRef && { label: 'Supplier Ref', val: invoice.supplierInvRef, mono: true },
                    { label: 'Lines',        val: lines.length },
                    { label: 'Sub Total',    val: fmt(invoice.subTotal),       blue: true },
                    { label: 'Tax',          val: fmt(invoice.taxAmount),      blue: true },
                    { label: 'Total',        val: fmt(invoice.totalAmount),    blue: true },
                    invoice.paidAmount > 0       && { label: 'Paid',          val: fmt(invoice.paidAmount),      cls: 'jd-kpi-green' },
                    invoice.debitNoteAmount > 0  && { label: 'Debit Notes',   val: fmt(invoice.debitNoteAmount), cls: 'jd-kpi-amber' },
                    (invoice.paidAmount > 0 || invoice.debitNoteAmount > 0) && { label: 'Outstanding', val: fmt(invoice.balanceAmount), cls: invoice.balanceAmount > 0 ? 'jd-kpi-red' : 'jd-kpi-green' },
                ].filter(Boolean).map((k, i) => (
                    <React.Fragment key={k.label}>
                        {i > 0 && <div className="jd-kpi-div" />}
                        <div className="jd-kpi">
                            <div className="jd-kpi-label">{k.label}</div>
                            <div className={`jd-kpi-val${k.blue ? ' jd-kpi-blue' : ''}${k.mono ? ' jd-kpi-mono' : ''}${k.cls ? ' ' + k.cls : ''}`}>{k.val}</div>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* ── TAB BAR ── */}
            <div className="jd-tabs-bar">
                {SINV_TABS.map(tab => (
                    <button key={tab.key}
                        className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}>
                        <span className="jd-tab-icon">{tab.icon}</span>
                        {tab.label}
                        {tab.key === 'lines' && lines.length > 0 && (
                            <span className="jd-tab-badge">{lines.length}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                {activeTab === 'overview' && (
                    <OverviewTab invoice={invoice} linesCount={lines.length} onRefresh={load} />
                )}
                {activeTab === 'lines' && (
                    <InvoiceLinesTab
                        invoice={invoice}
                        lines={lines}
                        onRefresh={load}
                    />
                )}
            </div>

            {/* ── REVISE MODAL ── */}
            {showRevise && (
                <ReviseModal
                    invoiceNo={invoice.invoiceNo}
                    onClose={() => setShowRevise(false)}
                    onConfirm={revise}
                />
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            {showLoginPw && (
                <LoginPasswordModal
                    title={`Confirm — ${pendingStatus}`}
                    message={`Enter your login password to mark this supplier invoice as ${pendingStatus}.`}
                    loading={statusBusy}
                    onConfirm={(pw) => { setShowLoginPw(false); doChangeStatus(pendingStatus, pw); }}
                    onClose={() => { setShowLoginPw(false); setPendingStatus(null); }}
                />
            )}
        </div>
    );
};

export default SupplierInvoiceDetailPage;
