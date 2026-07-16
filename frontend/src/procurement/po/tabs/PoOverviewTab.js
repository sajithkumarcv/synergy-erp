import React, { useState, useEffect, useRef } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmt, fmtDate, today, PRIORITY_CONFIG } from '../../procurementConstants';
import { useFieldConfig } from '../../../FieldConfigContext';
import AmountInput from '../../../common/AmountInput';

const Field = ({ label, children, mono }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className={`prd-ov-val ${mono ? 'prd-ov-val-mono' : ''}`}>{children || <span className="prd-ov-val-muted">—</span>}</div>
    </div>
);

const PoOverviewTab = ({ po, onRefresh }) => {
    const currentUser  = useCurrentUser();
    const { lookups, vlist, getStatusConfig } = useLookup();
    const { isReq } = useFieldConfig('PO');
    const { currencies, paymentTerms, deliveryTerms, budgetCategories } = lookups;
    const priorities = vlist?.['PR.Priority'] || [];

    const [editing,  setEditing]  = useState(false);
    const [form,     setForm]     = useState({});
    const [saving,   setSaving]   = useState(false);
    const [error,    setError]    = useState('');


    // Supplier live-search
    const [supplierSearch,  setSupplierSearch]  = useState('');
    const [supplierResults, setSupplierResults] = useState([]);
    const [contacts,        setContacts]        = useState([]);

    useEffect(() => {
        if (!supplierSearch.trim()) { setSupplierResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}supplier/search?searchText=${encodeURIComponent(supplierSearch)}&pageSize=10&page=1`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setSupplierResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [supplierSearch]);

    // Contacts — fetch whenever the selected supplierId changes while editing
    useEffect(() => {
        if (!form.supplierId) { setContacts([]); return; }
        fetch(`${variables.API_URL}supplier/contacts/${form.supplierId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setContacts(Array.isArray(d) ? d.filter(c => c.isActive !== false) : []))
            .catch(console.error);
    }, [form.supplierId]);

    // Job live-search (Draft only)
    const [jobSearch,   setJobSearch]   = useState('');
    const [jobResults,  setJobResults]  = useState([]);
    const jobDropRef = useRef(null);

    useEffect(() => {
        if (!jobSearch.trim()) { setJobResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(jobSearch)}&pageSize=10&page=1&excludeClosedStatus=true`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setJobResults(d.data || [])).catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [jobSearch]);

    const startEdit = () => {
        setForm({
            poDate:              po.poDate         ? po.poDate.slice(0, 10)         : today(),
            jobId:               po.jobId          || '',
            jobLabel:            po.jobId
                                     ? po.jobId + (po.jobTitle ? ` — ${po.jobTitle}` : '')
                                     : '',
            supplierId:          po.supplierId     ? String(po.supplierId)           : '',
            supplierLabel:       po.supplierId
                                     ? (po.supplierCode ? `${po.supplierCode} — ` : '') + (po.supplierNameResolved || po.vendorName || '')
                                     : '',
            supplierContactId:   po.supplierContactId ? String(po.supplierContactId) : '',
            vendorName:          po.vendorName     || '',
            vendorRef:           po.vendorRef      || '',
            currencyId:     po.currencyId     ? String(po.currencyId)           : '',
            exchangeRate:   po.exchangeRate   != null ? String(po.exchangeRate) : '1',
            paymentTermsId: po.paymentTermsId ? String(po.paymentTermsId)       : '',
            paymentTermsOther: po.paymentTermsOther || '',
            deliveryDate:   po.deliveryDate   ? po.deliveryDate.slice(0, 10)    : '',
            deliveryAddr:   po.deliveryAddr   || '',
            deliveryTerms:  po.deliveryTerms  || '',
            discount:          po.discount          != null ? String(po.discount)          : '',
            taxAmount:         po.taxAmount         != null ? String(po.taxAmount)         : '',
            priority:          po.priority          || '',
            notes:             po.notes             || '',
            expenseCategoryId: po.expenseCategoryId ? String(po.expenseCategoryId) : '',
        });
        setSupplierSearch('');
        setSupplierResults([]);
        setJobSearch('');
        setJobResults([]);
        setEditing(true);
        setError('');
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
    };

    const handleCurrency = e => {
        const id  = e.target.value;
        const cur = currencies.find(c => String(c.id) === id);
        setForm(p => ({ ...p, currencyId: id, exchangeRate: cur ? String(cur.exchangeRate ?? 1) : '1' }));
    };

    const isOtherPaymentTerm = paymentTerms.find(pt => String(pt.id) === String(form.paymentTermsId))?.code === 'OTHER';

    const save = () => {
        if (!form.poDate)                                         { setError('PO Date is required.');              return; }
        if (!form.jobId)                                          { setError('Job is required.');                  return; }
        if (!form.supplierId)                                     { setError('Supplier is required.');             return; }
        if (!form.currencyId)                                     { setError('Currency is required.');             return; }
        if (!form.exchangeRate || Number(form.exchangeRate) <= 0) { setError('Exchange rate must be greater than 0.'); return; }
        if (!form.paymentTermsId)                                 { setError('Payment Terms is required.');        return; }
        if (isOtherPaymentTerm && !form.paymentTermsOther.trim()) { setError('Please specify the payment terms.'); return; }
        if (!form.deliveryTerms)                                  { setError('Delivery Terms is required.');       return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}purchaseorder/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                poId:              po.poId,
                poDate:            form.poDate,
                supplierId:        form.supplierId        ? Number(form.supplierId)        : null,
                supplierContactId: form.supplierContactId ? Number(form.supplierContactId) : null,
                jobId:             form.jobId             || null,
                vendorName:        form.vendorName?.trim() || null,
                vendorRef:         form.vendorRef.trim()   || null,
                currencyId:    form.currencyId   ? Number(form.currencyId)    : null,
                exchangeRate:  form.exchangeRate ? Number(form.exchangeRate)  : 1,
                paymentTermsId:form.paymentTermsId ? Number(form.paymentTermsId) : null,
                paymentTermsOther: isOtherPaymentTerm ? form.paymentTermsOther.trim() : null,
                deliveryDate:  form.deliveryDate || null,
                deliveryAddr:  form.deliveryAddr.trim()  || null,
                deliveryTerms: form.deliveryTerms        || null,
                discount:      form.discount     ? Number(form.discount)      : null,
                taxAmount:     form.taxAmount    ? Number(form.taxAmount)     : null,
                priority:          form.priority          || null,
                notes:             form.notes.trim()      || null,
                expenseCategoryId: form.expenseCategoryId ? Number(form.expenseCategoryId) : null,
                status:            po.status,
                isActive:      po.isActive,
                createdBy:     po.createdBy,
                modifiedBy:    currentUser,
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
    const canEdit = (getStatusConfig('PO', po.status)?.canEdit ?? (po.status === 'Draft')) && canDo('/purchase-orders', 'EDIT');
    const priCfg  = PRIORITY_CONFIG[po.priority] || {};

    // ── Edit form ────────────────────────────────────────────────────────────
    if (editing) {
        const lbl   = { fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4, display: 'block' };
        const field = { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 130 };
        const row   = { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 };
        const dropStyle = { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto' };

        return (
            <div>
                {error && <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>}

                {/* Row 1: Date + Job + Priority */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>PO Date {isReq('poDate') && <span className="req">*</span>}</label>
                        <input className="pf-input" type="date" name="poDate" value={form.poDate} onChange={handle} />
                    </div>
                    <div style={{ ...field, flex: 2, position: 'relative' }} ref={jobDropRef}>
                        <label style={lbl}>Job ID {isReq('jobId') && <span className="req">*</span>}</label>
                        {po.status === 'Draft' ? (
                            form.jobId ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span className="pf-input" style={{ background: '#f0f9ff', color: '#1e40af', fontWeight: 500, flex: 1 }}>
                                        ✓ {form.jobLabel}
                                    </span>
                                    <button type="button"
                                        onClick={() => { setForm(p => ({ ...p, jobId: '', jobLabel: '' })); setJobSearch(''); }}
                                        style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700, whiteSpace: 'nowrap' }}>✕ Clear</button>
                                </div>
                            ) : (
                                <>
                                    <input className="pf-input" value={jobSearch}
                                        onChange={e => setJobSearch(e.target.value)}
                                        placeholder="Type job ID or description…" autoComplete="off" />
                                    {jobResults.length > 0 && (
                                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto' }}>
                                            {jobResults.map(j => (
                                                <div key={j.jobId}
                                                    style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                                                    onClick={() => { setForm(p => ({ ...p, jobId: j.jobId, jobLabel: j.jobId + (j.projectName ? ` — ${j.projectName}` : '') })); setJobSearch(''); setJobResults([]); }}
                                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                    <strong>{j.jobId}</strong>
                                                    {j.projectName  && <span style={{ marginLeft: 6 }}>{j.projectName}</span>}
                                                    {j.customerName && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>({j.customerName})</span>}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </>
                            )
                        ) : (
                            <input className="pf-input" style={{ background: '#f8fafc', color: '#64748b', cursor: 'default' }}
                                value={po.jobId || '—'} readOnly />
                        )}
                    </div>
                    <div style={{ ...field, flex: '0 0 130px' }}>
                        <label style={lbl}>Priority</label>
                        <select className="pf-input" name="priority" value={form.priority} onChange={handle}>
                            <option value="">— None —</option>
                            {priorities.length > 0
                                ? priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)
                                : ['Low', 'Normal', 'High', 'Urgent'].map(p => <option key={p} value={p}>{p}</option>)
                            }
                        </select>
                    </div>
                </div>

                {/* Row 1b: Budget Category */}
                <div style={row}>
                    <div style={{ ...field, flex: 2 }}>
                        <label style={lbl}>Budget Category</label>
                        <select className="pf-input" name="expenseCategoryId" value={form.expenseCategoryId} onChange={handle}>
                            <option value="">— Select category —</option>
                            {budgetCategories.map(c => (
                                <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Row 2: Supplier live-search */}
                <div style={row}>
                    <div style={{ ...field, flex: 3, position: 'relative' }}>
                        <label style={lbl}>Supplier {isReq('supplierId') && <span className="req">*</span>}</label>
                        {form.supplierId ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="pf-input" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 500, flex: 1, display: 'flex', alignItems: 'center' }}>
                                    ✓ {form.supplierLabel}
                                </span>
                                <button type="button"
                                    onClick={() => { setForm(p => ({ ...p, supplierId: '', supplierLabel: '', vendorName: '', supplierContactId: '' })); setSupplierSearch(''); setContacts([]); }}
                                    style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700, whiteSpace: 'nowrap' }}>✕ Clear</button>
                            </div>
                        ) : (
                            <>
                                <input className="pf-input" value={supplierSearch}
                                    onChange={e => setSupplierSearch(e.target.value)}
                                    placeholder="Type to search supplier…" autoComplete="off" />
                                {supplierResults.length > 0 && (
                                    <div style={dropStyle}>
                                        {supplierResults.map(s => (
                                            <div key={s.supplierId}
                                                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                                                onClick={() => { setForm(p => ({ ...p, supplierId: String(s.supplierId), supplierLabel: `${s.supplierCode} — ${s.supplierName}`, vendorName: s.supplierName })); setSupplierSearch(''); setSupplierResults([]); }}
                                                onMouseEnter={e => e.currentTarget.style.background='#f0f9ff'}
                                                onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                                                <strong>{s.supplierCode}</strong> — {s.supplierName}
                                                {s.supplierCategoryName && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>{s.supplierCategoryName}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div style={field}>
                        <label style={lbl}>Contact Person</label>
                        <select className="pf-input" name="supplierContactId" value={form.supplierContactId} onChange={handle} disabled={!form.supplierId}>
                            <option value="">— None —</option>
                            {contacts.map(c => (
                                <option key={c.supplierContactId} value={c.supplierContactId}>
                                    {c.contactName}{c.designation ? ` (${c.designation})` : ''}{c.mobile ? ` · ${c.mobile}` : c.phone ? ` · ${c.phone}` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div style={field}>
                        <label style={lbl}>Vendor / Quote Ref</label>
                        <input className="pf-input" type="text" name="vendorRef" value={form.vendorRef} onChange={handle} placeholder="Quotation or ref #" />
                    </div>
                </div>

                {/* Row 3: Currency + Exch. Rate + Payment Terms + Discount */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>Currency {isReq('currencyId') && <span className="req">*</span>}</label>
                        <select className="pf-input" name="currencyId" value={form.currencyId} onChange={handleCurrency}>
                            <option value="">— Select —</option>
                            {currencies.map(c => <option key={c.id} value={c.id}>{c.shortName || c.name}</option>)}
                        </select>
                    </div>
                    <div style={{ ...field, flex: '0 0 110px' }}>
                        <label style={lbl}>Exch. Rate {isReq('exchangeRate') && <span className="req">*</span>}</label>
                        <input className="pf-input" type="number" name="exchangeRate" value={form.exchangeRate} onChange={handle} step="0.000001" min="0" />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Payment Terms {isReq('paymentTermsId') && <span className="req">*</span>}</label>
                        <select className="pf-input" name="paymentTermsId" value={form.paymentTermsId} onChange={handle}>
                            <option value="">— Select —</option>
                            {paymentTerms.map(pt => <option key={pt.id} value={pt.id}>{pt.name}</option>)}
                        </select>
                    </div>
                    {isOtherPaymentTerm && (
                        <div style={field}>
                            <label style={lbl}>Specify Payment Terms <span className="req">*</span></label>
                            <input className="pf-input" type="text" name="paymentTermsOther" value={form.paymentTermsOther} onChange={handle}
                                placeholder="e.g. Net 45 days via LC" />
                        </div>
                    )}
                    <div style={{ ...field, flex: '0 0 110px' }}>
                        <label style={lbl}>Discount %</label>
                        <input className="pf-input" type="number" name="discount" value={form.discount} onChange={handle} placeholder="0.00" min="0" max="100" step="0.01" />
                    </div>
                    <div style={{ ...field, flex: '0 0 110px' }}>
                        <label style={lbl}>Tax Amount</label>
                        <AmountInput className="pf-input" value={form.taxAmount} onChange={v => handle({ target: { name: 'taxAmount', value: v } })} />
                    </div>
                </div>

                {/* Row 4: Delivery Date + Delivery Terms + Delivery Address */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>Expected Delivery</label>
                        <input className="pf-input" type="date" name="deliveryDate" value={form.deliveryDate} onChange={handle} />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Delivery Terms {isReq('deliveryTerms') && <span className="req">*</span>}</label>
                        <select className="pf-input" name="deliveryTerms" value={form.deliveryTerms} onChange={handle}>
                            <option value="">— Select —</option>
                            {deliveryTerms.map(dt => (
                                <option key={dt.id} value={dt.code}>{dt.code} — {dt.name}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ ...field, flex: 2 }}>
                        <label style={lbl}>Delivery Address</label>
                        <input className="pf-input" type="text" name="deliveryAddr" value={form.deliveryAddr} onChange={handle} placeholder="Delivery location or address" />
                    </div>
                </div>

                {/* Row 5: Notes */}
                <div style={row}>
                    <div style={{ ...field, flex: 3 }}>
                        <label style={lbl}>Notes / Terms</label>
                        <textarea className="pf-input pf-textarea" rows={3} name="notes" value={form.notes} onChange={handle} />
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
                <Field label="PO Number" mono>{po.poNumber}</Field>
                <Field label="Date">{fmtDate(po.poDate)}</Field>
                <Field label="Job" mono>{po.jobId}{po.jobTitle ? ` — ${po.jobTitle}` : ''}</Field>
                {po.linkedPRs && <Field label="Linked PRs" mono>{po.linkedPRs}</Field>}
                <Field label="Priority">
                    {po.priority
                        ? <span style={{ background: priCfg.bg, color: priCfg.color, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{po.priority}</span>
                        : null}
                </Field>
                {po.expenseCategoryId && (
                    <Field label="Budget Category" mono>
                        {po.expenseCategoryCode} — {po.expenseCategoryName}
                    </Field>
                )}
                <Field label="Supplier">{po.supplierNameResolved || po.vendorName}</Field>
                {po.contactName && (
                    <Field label="Contact Person">
                        {po.contactName}
                        {po.contactDesignation && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>({po.contactDesignation})</span>}
                        {(po.contactMobile || po.contactPhone) && (
                            <span style={{ color: '#475569', marginLeft: 8, fontSize: 12 }}>
                                📞 {po.contactMobile || po.contactPhone}
                            </span>
                        )}
                        {po.contactEmail && (
                            <span style={{ color: '#2563eb', marginLeft: 8, fontSize: 12 }}>
                                ✉ {po.contactEmail}
                            </span>
                        )}
                    </Field>
                )}
                <Field label="Vendor Reference" mono>{po.vendorRef}</Field>
                <Field label="Currency">
                    <span style={{
                        fontFamily: 'Courier New, monospace', fontSize: 13, fontWeight: 700,
                        background: '#dbeafe', color: '#1e40af',
                        padding: '3px 10px', borderRadius: 4, letterSpacing: '.05em',
                    }}>
                        {po.currencyShort || po.currencyName}
                    </span>
                    {po.exchangeRate && Number(po.exchangeRate) !== 1 && (
                        <span style={{ marginLeft: 8, fontSize: 11.5, color: '#64748b', fontFamily: 'Courier New' }}>
                            Rate: {po.exchangeRate}
                        </span>
                    )}
                </Field>
                <Field label="Payment Terms">
                    {po.paymentTermCode === 'OTHER' && po.paymentTermsOther
                        ? `${po.paymentTermName} — ${po.paymentTermsOther}`
                        : po.paymentTermName}
                </Field>
                <Field label="Expected Delivery">{fmtDate(po.deliveryDate)}</Field>
                <Field label="Delivery Terms" mono>{po.deliveryTerms}</Field>
                <Field label="Delivery Address">{po.deliveryAddr}</Field>
                {po.discount > 0 && <Field label="Discount">{po.discount}%</Field>}
                {po.taxAmount > 0 && <Field label="Tax Amount">{fmt(po.taxAmount)}</Field>}
                <div className="prd-ov-card" style={{ borderColor: '#dbeafe', background: '#f0f7ff' }}>
                    <div className="prd-ov-label">Total Amount</div>
                    <div className="prd-ov-val" style={{ color: '#1e40af', fontWeight: 600, fontSize: 15 }}>{fmt(po.totalAmount)}</div>
                </div>
                <div className="prd-ov-card" style={{ borderColor: '#d1fae5', background: '#f0fdf4' }}>
                    <div className="prd-ov-label">Total with Tax</div>
                    <div className="prd-ov-val" style={{ color: '#065f46', fontWeight: 600, fontSize: 15 }}>{fmt(po.linesTotalWithTax)}</div>
                </div>
                <Field label="Created By">{po.createdBy}</Field>
                {po.modifiedBy && <Field label="Last Modified By">{po.modifiedBy}</Field>}
                {po.poSentDate && (
                    <div className="prd-ov-card" style={{ borderColor: '#bae6fd', background: '#f0f9ff' }}>
                        <div className="prd-ov-label">Sent to Supplier</div>
                        <div className="prd-ov-val" style={{ color: '#0369a1', fontWeight: 600 }}>{fmtDate(po.poSentDate)}</div>
                    </div>
                )}
                {po.holdBy && (
                    <div className="prd-ov-card" style={{ borderColor: '#fdba74', background: '#fff7ed', gridColumn: 'span 2' }}>
                        <div className="prd-ov-label" style={{ color: '#9a3412' }}>🔴 Hold Information</div>
                        <div className="prd-ov-val" style={{ color: '#c2410c', fontWeight: 600, fontSize: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            {po.holdBy   && <span>By: <strong>{po.holdBy}</strong></span>}
                            {po.holdDate && <span>On: {fmtDate(po.holdDate)}</span>}
                            {po.holdReason && <span style={{ fontStyle: 'italic', fontWeight: 400, color: '#92400e' }}>"{po.holdReason}"</span>}
                        </div>
                    </div>
                )}
            </div>

            {po.notes && (
                <div className="prd-ov-notes">
                    <div className="prd-ov-notes-label">Notes / Terms</div>
                    <div className="prd-ov-notes-text">{po.notes}</div>
                </div>
            )}

        </div>
    );
};

export default PoOverviewTab;
