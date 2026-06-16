import React, { useState } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { usePermission } from '../../PermissionContext';
import { fmtDate, fmtDateTime, today, FormSection, getDeliveryStatusConfig } from '../deliveryConstants';
import '../../procurement/Procurement.css';

// ── Read-mode field ───────────────────────────────────────────────────
const Field = ({ label, children, mono }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className={`prd-ov-val${mono ? ' prd-ov-val-mono' : ''}`}>
            {children || <span className="prd-ov-val-muted">—</span>}
        </div>
    </div>
);

const SectionTitle = ({ label }) => (
    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.07em', color: '#3a5070', marginTop: 20, marginBottom: 10 }}>
        {label}
    </div>
);

const DeliveryOverviewTab = ({ delivery, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { canDo }   = usePermission();

    const statusCfg = getDeliveryStatusConfig(delivery?.status);
    const canEdit   = statusCfg.canEdit && canDo('/delivery', 'EDIT');

    const [editing,   setEditing]   = useState(false);
    const [form,      setForm]      = useState({});
    const [contacts,  setContacts]  = useState([]);
    const [saving,    setSaving]    = useState(false);
    const [error,     setError]     = useState('');

    const startEdit = () => {
        // Load contacts for this customer
        fetch(`${variables.API_URL}invoice/customer/${delivery.customerId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setContacts(d.contacts || []))
            .catch(console.error);

        setForm({
            deliveryDate:     delivery.deliveryDate?.slice(0, 10)      || today(),
            jobId:            delivery.jobId             || '',
            deliveryAddress:  delivery.deliveryAddress   || '',
            contactId:        delivery.contactId ? String(delivery.contactId) : '',
            consignee:        delivery.consignee         || '',
            consigneeAddress: delivery.consigneeAddress  || '',
            consigneeLpoNo:   delivery.consigneeLpoNo    || '',
            consigneeLpoDate: delivery.consigneeLpoDate?.slice(0, 10)  || '',
            consigneeTrn:     delivery.consigneeTrn      || '',
            vehicleNo:        delivery.vehicleNo         || '',
            deliveredBy:      delivery.deliveredBy       || '',
            deliveredByDate:  delivery.deliveredByDate?.slice(0, 10)   || '',
            buyerTrnNo:       delivery.buyerTrnNo        || '',
            buyerLpoNo:       delivery.buyerLpoNo        || '',
            buyerLpoDate:     delivery.buyerLpoDate?.slice(0, 10)      || '',
            notes:            delivery.notes             || '',
        });
        setError(''); setEditing(true);
    };

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = () => {
        if (!form.deliveryDate) { setError('Delivery date is required.'); return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}delivery/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                deliveryId:       delivery.deliveryId,
                deliveryNo:       delivery.deliveryNo,
                deliveryDate:     form.deliveryDate,
                invoiceId:        delivery.invoiceId    || null,
                customerId:       delivery.customerId,
                jobId:            form.jobId.trim()              || null,
                deliveryAddress:  form.deliveryAddress.trim()    || null,
                contactId:        form.contactId ? Number(form.contactId) : null,
                consignee:        form.consignee.trim()          || null,
                consigneeAddress: form.consigneeAddress.trim()   || null,
                consigneeLpoNo:   form.consigneeLpoNo.trim()     || null,
                consigneeLpoDate: form.consigneeLpoDate          || null,
                consigneeTrn:     form.consigneeTrn.trim()       || null,
                vehicleNo:        form.vehicleNo.trim()          || null,
                deliveredBy:      form.deliveredBy.trim()        || null,
                deliveredByDate:  form.deliveredByDate           || null,
                buyerTrnNo:       form.buyerTrnNo.trim()         || null,
                buyerLpoNo:       form.buyerLpoNo.trim()         || null,
                buyerLpoDate:     form.buyerLpoDate              || null,
                notes:            form.notes.trim()              || null,
                createdBy:        delivery.createdBy,
                modifiedBy:       currentUser,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d?.message || 'Save failed.'); return; }
                setEditing(false);
                onRefresh();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    // ── EDIT MODE ─────────────────────────────────────────────────────
    if (editing) return (
        <div className="jd-tab-body" style={{ maxWidth: 720 }}>
            {error && <div className="pf-err" style={{ marginBottom: 14 }}>{error}</div>}

            <FormSection label="Delivery Details" />
            <div className="pf-row">
                <div className="pf-field">
                    <label>Delivery Date <span className="req">*</span></label>
                    <input type="date" className="pf-input" value={form.deliveryDate}
                        onChange={e => set('deliveryDate', e.target.value)} />
                </div>
                <div className="pf-field pf-f2">
                    <label>Job / Reference</label>
                    <input className="pf-input" value={form.jobId}
                        onChange={e => set('jobId', e.target.value)}
                        placeholder="Job ID or reference" />
                </div>
            </div>
            <div className="pf-row">
                <div className="pf-field pf-f2">
                    <label>Contact Person</label>
                    <select className="pf-input" value={form.contactId}
                        onChange={e => set('contactId', e.target.value)}
                        disabled={contacts.length === 0}>
                        <option value="">— None —</option>
                        {contacts.map(c => (
                            <option key={c.customerContactId} value={c.customerContactId}>
                                {c.contactName}{c.designation ? ` (${c.designation})` : ''}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="pf-row">
                <div className="pf-field pf-f3">
                    <label>Delivery Address</label>
                    <textarea className="pf-input pf-textarea" rows={2} value={form.deliveryAddress}
                        onChange={e => set('deliveryAddress', e.target.value)} />
                </div>
            </div>

            <FormSection label="Consignee / Receiver" />
            <div className="pf-row">
                <div className="pf-field pf-f2">
                    <label>Consignee Name</label>
                    <input className="pf-input" value={form.consignee}
                        onChange={e => set('consignee', e.target.value)} />
                </div>
                <div className="pf-field">
                    <label>Consignee TRN</label>
                    <input className="pf-input" value={form.consigneeTrn}
                        onChange={e => set('consigneeTrn', e.target.value)} />
                </div>
            </div>
            <div className="pf-row">
                <div className="pf-field pf-f3">
                    <label>Consignee Address</label>
                    <textarea className="pf-input pf-textarea" rows={2} value={form.consigneeAddress}
                        onChange={e => set('consigneeAddress', e.target.value)} />
                </div>
            </div>
            <div className="pf-row">
                <div className="pf-field pf-f2">
                    <label>Consignee LPO No</label>
                    <input className="pf-input" value={form.consigneeLpoNo}
                        onChange={e => set('consigneeLpoNo', e.target.value)} />
                </div>
                <div className="pf-field">
                    <label>Consignee LPO Date</label>
                    <input type="date" className="pf-input" value={form.consigneeLpoDate}
                        onChange={e => set('consigneeLpoDate', e.target.value)} />
                </div>
            </div>

            <FormSection label="Dispatch" />
            <div className="pf-row">
                <div className="pf-field pf-f2">
                    <label>Vehicle No</label>
                    <input className="pf-input" value={form.vehicleNo}
                        onChange={e => set('vehicleNo', e.target.value)} />
                </div>
                <div className="pf-field pf-f2">
                    <label>Delivered By</label>
                    <input className="pf-input" value={form.deliveredBy}
                        onChange={e => set('deliveredBy', e.target.value)} />
                </div>
                <div className="pf-field">
                    <label>Delivered Date</label>
                    <input type="date" className="pf-input" value={form.deliveredByDate}
                        onChange={e => set('deliveredByDate', e.target.value)} />
                </div>
            </div>

            <FormSection label="Buyer Info" />
            <div className="pf-row">
                <div className="pf-field">
                    <label>Buyer TRN</label>
                    <input className="pf-input" value={form.buyerTrnNo}
                        onChange={e => set('buyerTrnNo', e.target.value)} />
                </div>
                <div className="pf-field pf-f2">
                    <label>Buyer LPO No</label>
                    <input className="pf-input" value={form.buyerLpoNo}
                        onChange={e => set('buyerLpoNo', e.target.value)} />
                </div>
                <div className="pf-field">
                    <label>Buyer LPO Date</label>
                    <input type="date" className="pf-input" value={form.buyerLpoDate}
                        onChange={e => set('buyerLpoDate', e.target.value)} />
                </div>
            </div>

            <FormSection label="Notes" />
            <div className="pf-row">
                <div className="pf-field pf-f3">
                    <textarea className="pf-input pf-textarea" rows={3} value={form.notes}
                        onChange={e => set('notes', e.target.value)}
                        placeholder="Internal notes or remarks…" />
                </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button className="pf-btn-sec" onClick={() => { setEditing(false); setError(''); }}>Cancel</button>
                <button className="pf-btn-pri" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Changes'}
                </button>
            </div>
        </div>
    );

    // ── READ MODE ─────────────────────────────────────────────────────
    return (
        <div className="jd-tab-body">
            {canEdit && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                    <button className="jd-stage-btn"
                        style={{ background: '#eff6ff', color: '#1d4ed8', borderColor: '#bfdbfe' }}
                        onClick={startEdit}>
                        ✏ Edit Header
                    </button>
                </div>
            )}

            {/* ── Delivery Details ── */}
            <SectionTitle label="Delivery Details" />
            <div className="prd-ov-grid">
                <Field label="Customer"         >{delivery.customerName}</Field>
                <Field label="Delivery No"  mono>{delivery.deliveryNo}</Field>
                <Field label="Delivery Date"    >{fmtDate(delivery.deliveryDate)}</Field>
                <Field label="Linked Invoice" mono>{delivery.invoiceNo}</Field>
                <Field label="Job / Reference" mono>{delivery.jobId}</Field>
                <Field label="Status"           >{delivery.status}</Field>
            </div>
            {delivery.deliveryAddress && (
                <div style={{ marginTop: 10 }}>
                    <div className="prd-ov-label" style={{ marginBottom: 6 }}>Delivery Address</div>
                    <div className="prd-ov-notes" style={{ whiteSpace: 'pre-line' }}>{delivery.deliveryAddress}</div>
                </div>
            )}

            {/* ── Contact Person ── */}
            <SectionTitle label="Contact Person" />
            <div className="prd-ov-grid">
                <Field label="Name"        >{delivery.contactName}</Field>
                <Field label="Designation" >{delivery.contactDesignation}</Field>
                <Field label="Phone"   mono>{delivery.contactPhone}</Field>
                <Field label="Mobile"  mono>{delivery.contactMobile}</Field>
                <Field label="Email"       >{delivery.contactEmail}</Field>
            </div>

            {/* ── Consignee / Receiver ── */}
            <SectionTitle label="Consignee / Receiver" />
            <div className="prd-ov-grid">
                <Field label="Consignee"           >{delivery.consignee}</Field>
                <Field label="Consignee TRN"   mono>{delivery.consigneeTrn}</Field>
                <Field label="Consignee LPO No" mono>{delivery.consigneeLpoNo}</Field>
                <Field label="Consignee LPO Date"  >{fmtDate(delivery.consigneeLpoDate)}</Field>
            </div>
            {delivery.consigneeAddress && (
                <div style={{ marginTop: 10 }}>
                    <div className="prd-ov-label" style={{ marginBottom: 6 }}>Consignee Address</div>
                    <div className="prd-ov-notes" style={{ whiteSpace: 'pre-line' }}>{delivery.consigneeAddress}</div>
                </div>
            )}

            {/* ── Dispatch ── */}
            <SectionTitle label="Dispatch" />
            <div className="prd-ov-grid">
                <Field label="Vehicle No"    mono>{delivery.vehicleNo}</Field>
                <Field label="Delivered By"      >{delivery.deliveredBy}</Field>
                <Field label="Delivered Date"    >{fmtDate(delivery.deliveredByDate)}</Field>
            </div>

            {/* ── Buyer Info ── */}
            <SectionTitle label="Buyer Info" />
            <div className="prd-ov-grid">
                <Field label="Buyer TRN"      mono>{delivery.buyerTrnNo}</Field>
                <Field label="Buyer LPO No"   mono>{delivery.buyerLpoNo}</Field>
                <Field label="Buyer LPO Date"     >{fmtDate(delivery.buyerLpoDate)}</Field>
            </div>

            {/* ── Notes ── */}
            {delivery.notes && (
                <div style={{ marginTop: 16 }}>
                    <div className="prd-ov-label" style={{ marginBottom: 6 }}>Notes</div>
                    <div className="prd-ov-notes" style={{ borderLeft: '3px solid #f59e0b', background: '#fffbeb' }}>
                        {delivery.notes}
                    </div>
                </div>
            )}

            {/* ── Audit ── */}
            <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #f1f5f9' }}>
                <div className="prd-ov-grid">
                    <Field label="Created By">
                        {`${delivery.createdBy || ''}  ·  ${fmtDateTime(delivery.createdDate)}`}
                    </Field>
                    {delivery.modifiedBy && (
                        <Field label="Last Modified">
                            {`${delivery.modifiedBy}  ·  ${fmtDateTime(delivery.modifiedDate)}`}
                        </Field>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DeliveryOverviewTab;
