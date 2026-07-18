import React, { useState } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmt, fmtDate, today } from '../../procurementConstants';
import { useFieldConfig } from '../../../FieldConfigContext';
import LookupSelect from '../../../common/LookupSelect';

const LOOKUP_PAGE_SIZE = 25;

// Read-only chip shown for PO-locked fields
const LockedChip = ({ value, bg = '#f0f9ff', color = '#1e40af' }) => (
    <div className="pf-input" style={{ background: bg, color, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
        <span style={{ opacity: .55, fontSize: 10 }}>🔒</span> {value || '—'}
    </div>
);

const Field = ({ label, children, mono }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className={`prd-ov-val ${mono ? 'prd-ov-val-mono' : ''}`}>{children || <span className="prd-ov-val-muted">—</span>}</div>
    </div>
);

const GrnOverviewTab = ({ grn, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { lookups, getStatusConfig } = useLookup();
    const { isReq } = useFieldConfig('GRN');
    const { currencies } = lookups;

    const [editing, setEditing] = useState(false);
    const [form,    setForm]    = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    // Supplier live-search

    const startEdit = () => {
        setForm({
            grnDate:          grn.grnDate         ? grn.grnDate.slice(0, 10)         : today(),
            receivedDate:     grn.receivedDate    ? grn.receivedDate.slice(0, 10)    : '',
            supplierId:       grn.supplierId      ? String(grn.supplierId)           : '',
            supplierLabel:    grn.supplierId
                                  ? (grn.supplierCode ? `${grn.supplierCode} — ` : '') + (grn.supplierName || '')
                                  : '',
            jobId:            grn.jobId           || '',
            doNo:             grn.doNo            || '',
            receivedBy:       grn.receivedBy      || '',
            receivedFrom:     grn.receivedFrom    || '',
            shipmentBy:       grn.shipmentBy      || '',
            deliveryTerms:    grn.deliveryTerms   || '',
            deliveryLocation: grn.deliveryLocation|| '',
            shipmentDetails:  grn.shipmentDetails || '',
            invoiceNo:        grn.invoiceNo       || '',
            invoiceDate:      grn.invoiceDate     ? grn.invoiceDate.slice(0, 10)     : '',
            currencyId:       grn.currencyId      ? String(grn.currencyId)           : '',
            exchangeRate:     grn.exchangeRate    != null ? String(grn.exchangeRate) : '1',
            boeNo:            grn.boeNo           || '',
            boeDate:          grn.boeDate         ? grn.boeDate.slice(0, 10)         : '',
            isRegistered:     grn.isRegistered    ? '1' : '0',
            remarks:          grn.remarks         || '',
        });
        setEditing(true);
        setError('');
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
    };

    const handleCurrency = e => {
        if (poLinked) return;   // currency locked when PO is linked
        const id  = e.target.value;
        const cur = currencies.find(c => String(c.id) === id);
        setForm(p => ({ ...p, currencyId: id, exchangeRate: cur ? String(cur.exchangeRate ?? 1) : '1' }));
    };

    const save = () => {
        if (!form.grnDate)                                      { setError('GRN Date is required.');             return; }
        if (!poLinked && !form.supplierId)                      { setError('Supplier is required.');             return; }
        if (!poLinked && !form.currencyId)                      { setError('Currency is required.');             return; }
        if (!poLinked && (!form.exchangeRate || Number(form.exchangeRate) <= 0))
                                                                { setError('Exchange rate must be greater than 0.'); return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}grn/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                grnId:            grn.grnId,
                poId:             grn.poId     || null,
                // supplier/job/currency locked from PO when poLinked; otherwise take form values
                supplierId:       poLinked ? (grn.supplierId || null) : (form.supplierId ? Number(form.supplierId) : null),
                jobId:            poLinked ? (grn.jobId    || null)   : (form.jobId.trim() || null),
                grnDate:          form.grnDate,
                receivedDate:     form.receivedDate     || null,
                doNo:             form.doNo.trim()      || null,
                receivedBy:       form.receivedBy.trim()       || null,
                receivedFrom:     form.receivedFrom.trim()     || null,
                shipmentBy:       form.shipmentBy.trim()       || null,
                deliveryTerms:    form.deliveryTerms           || null,
                deliveryLocation: form.deliveryLocation.trim() || null,
                shipmentDetails:  form.shipmentDetails.trim()  || null,
                invoiceNo:        form.invoiceNo.trim()        || null,
                invoiceDate:      form.invoiceDate             || null,
                currencyId:       poLinked ? (grn.currencyId || null) : (form.currencyId ? Number(form.currencyId) : null),
                exchangeRate:     poLinked ? (grn.exchangeRate ?? 1)  : (form.exchangeRate ? Number(form.exchangeRate) : 1),
                boeNo:            form.boeNo.trim()     || null,
                boeDate:          form.boeDate          || null,
                isRegistered:     form.isRegistered === '1',
                registeredBy:     grn.registeredBy     || null,
                registeredDate:   grn.registeredDate   || null,
                totalAmount:      grn.totalAmount       || null,
                remarks:          form.remarks.trim()   || null,
                createdBy:        grn.createdBy,
                modifiedBy:       currentUser,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error saving.'); return; }
                setEditing(false);
                onRefresh();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    const { canDo } = usePermission();
    const canEdit  = (getStatusConfig('GRN', grn.status)?.canEdit ?? (grn.status === 'Draft')) && canDo('/grn', 'EDIT');
    const poLinked = !!grn.poId;   // when true, supplier/job/currency/exch rate are non-editable


    // ── Edit form ────────────────────────────────────────────────────────────
    if (editing) {
        const lbl   = { fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4, display: 'block' };
        const field = { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 130 };
        const row   = { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 };

        return (
            <div>
                {error && <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>}

                {/* Row 1: GRN Date + Received Date + D.O. No */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>GRN Date {isReq('grnDate') && <span className="req">*</span>}</label>
                        <input className="pf-input" type="date" name="grnDate" value={form.grnDate} onChange={handle} />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Received Date</label>
                        <input className="pf-input" type="date" name="receivedDate" value={form.receivedDate} onChange={handle} />
                    </div>
                    <div style={field}>
                        <label style={lbl}>D.O. No</label>
                        <input className="pf-input" type="text" name="doNo" value={form.doNo} onChange={handle} placeholder="Delivery order #" />
                    </div>
                </div>

                {/* Row 2: Received By + Received From + Shipment By */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>Received By</label>
                        <input className="pf-input" type="text" name="receivedBy" value={form.receivedBy} onChange={handle} placeholder="Name of receiver" />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Received From</label>
                        <input className="pf-input" type="text" name="receivedFrom" value={form.receivedFrom} onChange={handle} placeholder="Person who delivered" />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Shipment By</label>
                        <input className="pf-input" type="text" name="shipmentBy" value={form.shipmentBy} onChange={handle} placeholder="Carrier / courier" />
                    </div>
                </div>

                {/* Row 3: Delivery Terms + Delivery Location */}
                <div style={row}>
                    <div style={{ ...field, flex: '0 0 150px' }}>
                        <label style={lbl}>Delivery Terms</label>
                        <input className="pf-input" type="text" name="deliveryTerms" value={form.deliveryTerms} onChange={handle} placeholder="e.g. FOB, CIF" />
                    </div>
                    <div style={{ ...field, flex: 2 }}>
                        <label style={lbl}>Delivery Location</label>
                        <input className="pf-input" type="text" name="deliveryLocation" value={form.deliveryLocation} onChange={handle} placeholder="Warehouse / site" />
                    </div>
                </div>

                {/* Row 4: Shipment Details */}
                <div style={row}>
                    <div style={{ ...field, flex: 3 }}>
                        <label style={lbl}>Shipment Details</label>
                        <input className="pf-input" type="text" name="shipmentDetails" value={form.shipmentDetails} onChange={handle} placeholder="Container #, tracking, etc." />
                    </div>
                </div>

                {/* Row 5: Supplier & Job */}
                <div style={row}>
                    <div style={{ ...field, flex: 2, position: 'relative' }}>
                        <label style={lbl}>
                            Supplier {isReq('supplierId') && <span className="req">*</span>}
                            {poLinked && <span style={{ fontWeight: 400, textTransform: 'none', color: '#64748b', marginLeft: 4 }}>(from PO — locked)</span>}
                        </label>
                        {poLinked ? (
                            <LockedChip value={form.supplierLabel || grn.supplierName || '—'} bg="#f0fdf4" color="#166534" />
                        ) : (
                            <LookupSelect
                                value={form.supplierId}
                                label={form.supplierLabel}
                                tone="green"
                                placeholder="Select or type to search supplier…"
                                buildUrl={t => `${variables.API_URL}supplier/search?searchText=${encodeURIComponent(t)}&pageSize=${LOOKUP_PAGE_SIZE}&page=1`}
                                itemKey={s => s.supplierId}
                                renderItem={s => <><strong>{s.supplierCode}</strong> — {s.supplierName}</>}
                                onSelect={s => setForm(p => ({ ...p, supplierId: String(s.supplierId), supplierLabel: `${s.supplierCode} — ${s.supplierName}` }))}
                                onClear={() => setForm(p => ({ ...p, supplierId: '', supplierLabel: '' }))}
                            />
                        )}
                    </div>
                    <div style={{ ...field, flex: 2 }}>
                        <label style={lbl}>
                            Job ID
                            {poLinked && <span style={{ fontWeight: 400, textTransform: 'none', color: '#64748b', marginLeft: 4 }}>(from PO — locked)</span>}
                        </label>
                        {poLinked ? (
                            <LockedChip value={grn.jobId ? `${grn.jobId}${grn.jobTitle ? ' — ' + grn.jobTitle : ''}` : '—'} bg="#f0f9ff" color="#1e40af" />
                        ) : (
                            <input className="pf-input" type="text" name="jobId" value={form.jobId} onChange={handle} placeholder="JOB-XXXX" />
                        )}
                    </div>
                </div>

                {/* Row 6: Invoice No + Invoice Date */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>Invoice No</label>
                        <input className="pf-input" type="text" name="invoiceNo" value={form.invoiceNo} onChange={handle} placeholder="Supplier invoice #" />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Invoice Date</label>
                        <input className="pf-input" type="date" name="invoiceDate" value={form.invoiceDate} onChange={handle} />
                    </div>
                </div>

                {/* Row 7: Currency + Exchange Rate (locked if PO linked) */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>
                            Currency {isReq('currencyId') && <span className="req">*</span>}
                            {poLinked && <span style={{ fontWeight: 400, textTransform: 'none', color: '#64748b', marginLeft: 4 }}>(from PO — locked)</span>}
                        </label>
                        {poLinked ? (
                            <LockedChip
                                value={currencies.find(c => String(c.id) === form.currencyId)?.shortName || grn.currencyShort || grn.currencyName || '—'}
                                bg="#fefce8" color="#854d0e"
                            />
                        ) : (
                            <select className="pf-input" name="currencyId" value={form.currencyId} onChange={handleCurrency}>
                                <option value="">— Select —</option>
                                {currencies.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                            </select>
                        )}
                    </div>
                    <div style={{ ...field, flex: '0 0 130px' }}>
                        <label style={lbl}>
                            Exch. Rate {isReq('exchangeRate') && <span className="req">*</span>}
                            {poLinked && <span style={{ fontWeight: 400, textTransform: 'none', color: '#64748b', marginLeft: 4 }}>🔒</span>}
                        </label>
                        {poLinked ? (
                            <LockedChip value={form.exchangeRate} bg="#fefce8" color="#854d0e" />
                        ) : (
                            <input className="pf-input" type="number" name="exchangeRate" value={form.exchangeRate} onChange={handle} step="0.000001" min="0" />
                        )}
                    </div>
                </div>

                {/* Row 8: BOE No + BOE Date */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>BOE No</label>
                        <input className="pf-input" type="text" name="boeNo" value={form.boeNo} onChange={handle} placeholder="Bill of entry #" />
                    </div>
                    <div style={field}>
                        <label style={lbl}>BOE Date</label>
                        <input className="pf-input" type="date" name="boeDate" value={form.boeDate} onChange={handle} />
                    </div>
                    <div style={{ ...field, flex: '0 0 150px' }}>
                        <label style={lbl}>Registered?</label>
                        <select className="pf-input" name="isRegistered" value={form.isRegistered} onChange={handle}>
                            <option value="0">No</option>
                            <option value="1">Yes</option>
                        </select>
                    </div>
                </div>

                {/* Row 9: Remarks */}
                <div style={row}>
                    <div style={{ ...field, flex: 3 }}>
                        <label style={lbl}>Remarks</label>
                        <textarea className="pf-input pf-textarea" rows={3} name="remarks" value={form.remarks} onChange={handle} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button className="pf-btn-sec" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                </div>
            </div>
        );
    }

    // ── Read-only view ───────────────────────────────────────────────────────
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                {canEdit && <button className="jd-stage-btn" onClick={startEdit}>✏ Edit</button>}
            </div>

            <div className="prd-ov-grid">
                <Field label="GRN Number" mono>{grn.grnNumber}</Field>
                <Field label="GRN Date">{fmtDate(grn.grnDate)}</Field>
                <Field label="Received Date">{fmtDate(grn.receivedDate)}</Field>
                <Field label="D.O. No" mono>{grn.doNo}</Field>
                <Field label="Supplier">{grn.supplierName}</Field>
                {grn.poNumber && <Field label="Purchase Order" mono>{grn.poNumber}</Field>}
                {grn.jobId && <Field label="Job" mono>{grn.jobId}{grn.jobTitle ? ` — ${grn.jobTitle}` : ''}</Field>}
                <Field label="Received By">{grn.receivedBy}</Field>
                <Field label="Received From">{grn.receivedFrom}</Field>
                <Field label="Shipment By">{grn.shipmentBy}</Field>
                <Field label="Delivery Terms" mono>{grn.deliveryTerms}</Field>
                <Field label="Delivery Location">{grn.deliveryLocation}</Field>
                {grn.shipmentDetails && <Field label="Shipment Details">{grn.shipmentDetails}</Field>}
                <Field label="Invoice No" mono>{grn.invoiceNo}</Field>
                <Field label="Invoice Date">{fmtDate(grn.invoiceDate)}</Field>
                <Field label="Currency">{grn.currencyShort || grn.currencyName}{grn.exchangeRate && grn.exchangeRate !== 1 ? ` (Rate: ${grn.exchangeRate})` : ''}</Field>
                {grn.boeNo && <Field label="BOE No" mono>{grn.boeNo}</Field>}
                {grn.boeDate && <Field label="BOE Date">{fmtDate(grn.boeDate)}</Field>}
                <Field label="Registered">{grn.isRegistered ? `Yes${grn.registeredBy ? ` — ${grn.registeredBy}` : ''}` : 'No'}</Field>
                <div className="prd-ov-card" style={{ borderColor: '#dbeafe', background: '#f0f7ff' }}>
                    <div className="prd-ov-label">Lines Sub-Total</div>
                    <div className="prd-ov-val" style={{ color: '#1e40af', fontWeight: 600, fontSize: 15 }}>{fmt(grn.linesSubTotal)}</div>
                </div>
                <div className="prd-ov-card" style={{ borderColor: '#d1fae5', background: '#f0fdf4' }}>
                    <div className="prd-ov-label">Total with Tax</div>
                    <div className="prd-ov-val" style={{ color: '#065f46', fontWeight: 600, fontSize: 15 }}>{fmt(grn.linesTotalWithTax)}</div>
                </div>
                <Field label="Created By">{grn.createdBy}</Field>
                {grn.modifiedBy && <Field label="Last Modified By">{grn.modifiedBy}</Field>}
            </div>

            {grn.remarks && (
                <div className="prd-ov-notes">
                    <div className="prd-ov-notes-label">Remarks</div>
                    <div className="prd-ov-notes-text">{grn.remarks}</div>
                </div>
            )}
        </div>
    );
};

export default GrnOverviewTab;
