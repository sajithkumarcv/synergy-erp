import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import { fmtDate, fmtDateTime, today, FormSection } from '../invoiceConstants';
import LookupSelect from '../../common/LookupSelect';
import '../../procurement/Procurement.css';

const LOOKUP_PAGE_SIZE = 25;

// ── Read-mode field ──────────────────────────────────────────────────
const Field = ({ label, children, mono }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className={`prd-ov-val${mono ? ' prd-ov-val-mono' : ''}`}>
            {children || <span className="prd-ov-val-muted">—</span>}
        </div>
    </div>
);

const InvoiceOverviewTab = ({ invoice, onRefresh }) => {
    const currentUser             = useCurrentUser();
    const { lookups, getStatusConfig } = useLookup();
    const currencies              = lookups?.currencies || [];

    const [editing,   setEditing]   = useState(false);
    const [form,      setForm]      = useState({});
    const [saving,    setSaving]    = useState(false);
    const [error,     setError]     = useState('');
    const [contacts,  setContacts]  = useState([]);
    const [addresses, setAddresses] = useState([]);

    // Customer is editable only while Draft
    const isDraft = invoice?.status === 'Draft';

    // Populate edit form when invoice changes
    useEffect(() => {
        if (!invoice) return;
        setForm({
            customerId:     invoice.customerId || '',
            customerName:   invoice.customerName || '',
            invoiceDate:    invoice.invoiceDate?.slice(0, 10) || today(),
            billingAddress: invoice.billingAddress || '',
            currencyId:     String(invoice.currencyId || ''),
            exchangeRate:   String(invoice.exchangeRate ?? '1'),
            dueDate:        invoice.dueDate?.slice(0, 10) || '',
            jobId:          invoice.jobId || '',
            jobLabel:       invoice.jobId
                ? `${invoice.jobId}${invoice.jobTitle ? ' — ' + invoice.jobTitle : ''}`
                : '',
            lpoNo:          invoice.lpoNo || '',
            lpoDate:        invoice.lpoDate?.slice(0, 10) || '',
            contactId:      String(invoice.contactId || ''),
            notes:          invoice.notes || '',
        });
    }, [invoice]);

    const selectJob = (j) => {
        setForm(p => ({ ...p, jobId: j.jobId, jobLabel: `${j.jobId}${j.projectName ? ' — ' + j.projectName : ''}` }));
    };

    const selectCustomer = (c) => {
        setForm(p => ({ ...p, customerId: c.customerId, customerName: c.customerName, contactId: '' }));
        // reload contacts / addresses for the newly chosen customer
        fetch(`${variables.API_URL}invoice/customer/${c.customerId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                setContacts(d.contacts || []);
                setAddresses(d.addresses || []);
                const defAddr = (d.addresses || []).find(a => a.isDefault) || (d.addresses || [])[0];
                setForm(p => ({ ...p, billingAddress: defAddr?.fullAddress || p.billingAddress }));
            })
            .catch(console.error);
    };

    const startEdit = () => {
        // Load customer contacts/addresses for dropdowns
        fetch(`${variables.API_URL}invoice/customer/${invoice.customerId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => { setContacts(d.contacts || []); setAddresses(d.addresses || []); })
            .catch(console.error);
        setEditing(true);
        setError('');
    };

    const onCurrencyChange = (id) => {
        const cur = currencies.find(c => String(c.id) === String(id));
        setForm(p => ({
            ...p,
            currencyId:   id,
            exchangeRate: cur?.isBaseCurrency ? '1' : String(cur?.exchangeRate ?? p.exchangeRate),
        }));
    };

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleSave = () => {
        if (!form.invoiceDate)        { setError('Invoice date is required.'); return; }
        if (!form.currencyId)         { setError('Currency is required.');     return; }
        if (!form.exchangeRate || isNaN(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0)
                                      { setError('Exchange rate must be a number greater than 0.'); return; }
        if (form.dueDate && form.invoiceDate && form.dueDate < form.invoiceDate)
                                      { setError('Due date must be on or after the invoice date.'); return; }
        if (!form.jobId || !form.jobId.trim()) { setError('Job is required.'); return; }
        if (!form.customerId) { setError('Customer is required.'); return; }
        if (!form.contactId)  { setError('Contact person is required.'); return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}invoice/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                invoiceId:      invoice.invoiceId,
                invoiceDate:    form.invoiceDate,
                customerId:     form.customerId || invoice.customerId,
                billingAddress: form.billingAddress || null,
                currencyId:     Number(form.currencyId),
                exchangeRate:   Number(form.exchangeRate) || 1,
                dueDate:        form.dueDate    || null,
                jobId:          form.jobId      || null,
                lpoNo:          form.lpoNo      || null,
                lpoDate:        form.lpoDate    || null,
                contactId:      form.contactId ? Number(form.contactId) : null,
                notes:          form.notes      || null,
                modifiedBy:     currentUser,
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

    const { canDo } = usePermission();
    const canEdit = (getStatusConfig('INV', invoice?.status)?.canEdit ?? (invoice?.status === 'Draft')) && canDo('/invoices', 'EDIT');

    // ── EDIT MODE ──────────────────────────────────────────────────
    if (editing) {
        const editingCurrency = currencies.find(c => String(c.id) === String(form.currencyId));
        const isBase          = editingCurrency?.isBaseCurrency === true;

        return (
            <div style={{ padding: '24px 0', maxWidth: 680 }}>
                {error && <div className="pf-err" style={{ marginBottom: 14 }}>{error}</div>}

                <FormSection label="Customer" />
                <div className="pf-row">
                    <div className="pf-field pf-f2" style={{ position: 'relative' }}>
                        <label>Customer <span className="req">*</span></label>
                        {isDraft ? (
                            <LookupSelect
                                value={form.customerId}
                                label={form.customerName}
                                tone="blue"
                                placeholder="Select or search customer…"
                                buildUrl={t => `${variables.API_URL}customer/search?searchText=${encodeURIComponent(t)}&pageSize=${LOOKUP_PAGE_SIZE}`}
                                itemKey={c => c.customerId}
                                renderItem={c => (
                                    <>
                                        <span style={{ fontWeight: 600 }}>{c.customerName}</span>
                                        {c.customerCode && <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>({c.customerCode})</span>}
                                    </>
                                )}
                                onSelect={selectCustomer}
                                onClear={() => setForm(p => ({ ...p, customerId: '', customerName: '' }))}
                            />
                        ) : (
                            <input className="pf-input" value={form.customerName || ''} readOnly
                                style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                title="Customer can only be changed while the invoice is in Draft" />
                        )}
                    </div>
                </div>

                <FormSection label="Dates" />
                <div className="pf-row">
                    <div className="pf-field">
                        <label>Invoice Date <span className="req">*</span></label>
                        <input type="date" className="pf-input" value={form.invoiceDate}
                            onChange={e => set('invoiceDate', e.target.value)} />
                    </div>
                    <div className="pf-field">
                        <label>Due Date</label>
                        <input type="date" className="pf-input" value={form.dueDate}
                            min={form.invoiceDate || undefined}
                            onChange={e => set('dueDate', e.target.value)} />
                    </div>
                </div>

                <FormSection label="Currency" />
                <div className="pf-row">
                    <div className="pf-field">
                        <label>Currency <span className="req">*</span></label>
                        <select className="pf-input" value={form.currencyId}
                            onChange={e => onCurrencyChange(e.target.value)}>
                            <option value="">— Select —</option>
                            {currencies.map(c => (
                                <option key={c.id} value={c.id}>
                                    {c.shortName}{c.name ? ` — ${c.name}` : ''}{c.isBaseCurrency ? ' (Base)' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="pf-field" style={{ flex: '0 0 150px' }}>
                        <label>
                            Exch. Rate
                            {isBase && (
                                <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: '#16a34a', background: '#dcfce7', padding: '1px 6px', borderRadius: 10 }}>
                                    Base
                                </span>
                            )}
                        </label>
                        <input type="number" min="0.000001" step="any" className="pf-input"
                            value={form.exchangeRate}
                            onChange={e => set('exchangeRate', e.target.value)}
                            disabled={isBase}
                            style={isBase ? { background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' } : undefined} />
                        {isBase && <span style={{ fontSize: 10, color: '#64748b', marginTop: 2, display: 'block' }}>Always 1 for base currency</span>}
                    </div>
                </div>

                <FormSection label="Reference" />
                <div className="pf-row">
                    <div className="pf-field">
                        <label>LPO / PO No</label>
                        <input className="pf-input" value={form.lpoNo}
                            onChange={e => set('lpoNo', e.target.value)} />
                    </div>
                    <div className="pf-field">
                        <label>LPO Date</label>
                        <input type="date" className="pf-input" value={form.lpoDate}
                            onChange={e => set('lpoDate', e.target.value)} />
                    </div>
                    <div className="pf-field" style={{ position: 'relative' }}>
                        <label>Job <span className="req">*</span></label>
                        <LookupSelect
                            value={form.jobId}
                            label={form.jobLabel}
                            tone="green"
                            placeholder="Select or search job…"
                            buildUrl={t => `${variables.API_URL}job/search?searchText=${encodeURIComponent(t)}&pageSize=${LOOKUP_PAGE_SIZE}&approvalStatus=Approved`}
                            itemKey={j => j.jobId}
                            renderItem={j => (
                                <>
                                    <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{j.jobId}</span>
                                    {j.projectName && <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>— {j.projectName}</span>}
                                </>
                            )}
                            onSelect={selectJob}
                            onClear={() => setForm(p => ({ ...p, jobId: '', jobLabel: '' }))}
                        />
                    </div>
                </div>

                <FormSection label="Contact & Address" />
                <div className="pf-row">
                    <div className="pf-field">
                        <label>Contact Person <span className="req">*</span></label>
                        <select className="pf-input" value={form.contactId}
                            onChange={e => set('contactId', e.target.value)}
                            disabled={contacts.length === 0}>
                            <option value="">— Select —</option>
                            {contacts.map(c => (
                                <option key={c.customerContactId} value={c.customerContactId}>
                                    {c.contactName}{c.designation ? ` (${c.designation})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="pf-field">
                        <label>Billing Address</label>
                        {addresses.length > 1 && (
                            <select className="pf-input" style={{ marginBottom: 6 }}
                                value={addresses.findIndex(a => a.fullAddress === form.billingAddress)}
                                onChange={e => set('billingAddress', addresses[Number(e.target.value)]?.fullAddress || '')}>
                                <option value={-1}>— Fill from saved address —</option>
                                {addresses.map((a, i) => (
                                    <option key={a.customerAddressId} value={i}>
                                        {a.addressType || `Address ${i + 1}`}{a.isDefault ? ' (Default)' : ''}
                                    </option>
                                ))}
                            </select>
                        )}
                        <textarea className="pf-input pf-textarea" rows={4}
                            value={form.billingAddress}
                            onChange={e => set('billingAddress', e.target.value)}
                            placeholder="Billing address for this invoice…" />
                    </div>
                </div>

                <FormSection label="Notes" />
                <div className="pf-row">
                    <div className="pf-field pf-f3">
                        <label>Notes / Remarks</label>
                        <textarea className="pf-input pf-textarea" rows={3}
                            value={form.notes}
                            onChange={e => set('notes', e.target.value)}
                            placeholder="Internal notes or additional terms…" />
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
    }

    // ── READ MODE ──────────────────────────────────────────────────
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

            <div className="prd-ov-grid">
                <Field label="Customer"        >{invoice.customerName}</Field>
                <Field label="Customer VAT No"  mono>{invoice.customerVatNo}</Field>
                <Field label="Invoice Date"    >{fmtDate(invoice.invoiceDate)}</Field>
                <Field label="Due Date"        >{fmtDate(invoice.dueDate)}</Field>
                <Field label="Currency">
                    <span style={{
                        fontFamily: 'Courier New, monospace', fontSize: 13, fontWeight: 700,
                        background: '#dbeafe', color: '#1e40af',
                        padding: '3px 10px', borderRadius: 4, letterSpacing: '.05em',
                    }}>
                        {invoice.currencyShort || ''}
                    </span>
                    {invoice.currencySymbol && (
                        <span style={{ marginLeft: 6, fontSize: 12, color: '#64748b' }}>({invoice.currencySymbol})</span>
                    )}
                    {invoice.isBaseCurrency && (
                        <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, color: '#166534',
                            background: '#dcfce7', padding: '2px 7px', borderRadius: 10 }}>
                            Base
                        </span>
                    )}
                </Field>
                <Field label="Exchange Rate" mono>
                    {invoice.isBaseCurrency ? 'Base Currency (1.00)' : String(invoice.exchangeRate)}
                </Field>
                <Field label="Job"          mono>{invoice.jobId}</Field>
                <Field label="Job Title"        >{invoice.jobTitle}</Field>
                <Field label="LPO / PO No"  mono>{invoice.lpoNo}</Field>
                <Field label="LPO Date"         >{fmtDate(invoice.lpoDate)}</Field>
                <Field label="Contact Person"   >{invoice.contactName}</Field>
                <Field label="Contact Email"    >{invoice.contactEmail}</Field>
            </div>

            {invoice.billingAddress && (
                <div style={{ marginTop: 16 }}>
                    <div className="prd-ov-label" style={{ marginBottom: 6 }}>Billing Address</div>
                    <div className="prd-ov-notes" style={{ whiteSpace: 'pre-line' }}>
                        {invoice.billingAddress}
                    </div>
                </div>
            )}

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
                        {`${invoice.createdBy}  ·  ${fmtDateTime(invoice.createdDate)}`}
                    </Field>
                    {invoice.modifiedBy && (
                        <Field label="Last Modified">
                            {`${invoice.modifiedBy}  ·  ${fmtDateTime(invoice.modifiedDate)}`}
                        </Field>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InvoiceOverviewTab;
