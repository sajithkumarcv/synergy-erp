import React, { useState, useEffect, useRef } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { today, addDays } from './invoiceConstants';
import '../procurement/Procurement.css';

const INIT = {
    invoiceDate:    today(),
    customerId:     '',
    customerLabel:  '',
    billingAddress: '',
    currencyId:     '',
    exchangeRate:   '1',
    dueDate:        '',
    jobId:          '',
    jobLabel:       '',
    lpoNo:          '',
    lpoDate:        '',
    contactId:      '',
    notes:          '',
};

const InvoiceForm = ({ onClose, onSaved }) => {
    const currentUser = useCurrentUser();

    const [form,        setForm]       = useState(INIT);
    const [errors,      setErrors]     = useState({});
    const [saving,      setSaving]     = useState(false);
    const [apiErr,      setApiErr]     = useState('');

    // Lookups
    const [currencies,   setCurrencies]  = useState([]);
    const [custResults,  setCustResults] = useState([]);
    const [custLoading,  setCustLoading] = useState(false);
    const [showCustDrop, setShowCustDrop]= useState(false);
    const [jobResults,   setJobResults]  = useState([]);
    const [jobLoading,   setJobLoading]  = useState(false);
    const [showJobDrop,  setShowJobDrop] = useState(false);
    const [contacts,      setContacts]     = useState([]);
    const [addresses,     setAddresses]    = useState([]);
    const [creditStatus,  setCreditStatus] = useState(null);  // credit check result

    const custTimerRef = useRef(null);
    const jobTimerRef  = useRef(null);

    // Load currencies on mount; auto-select base currency
    useEffect(() => {
        fetch(`${variables.API_URL}invoice/currencies`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const list = Array.isArray(d) ? d : [];
                setCurrencies(list);
                // Pre-select base currency (AED) and lock its rate to 1
                const base = list.find(c => c.isBaseCurrency);
                if (base) {
                    setForm(p => ({ ...p, currencyId: String(base.currencyId), exchangeRate: '1' }));
                }
            })
            .catch(console.error);
    }, []);

    // ── When currency changes → update exchange rate ──────────────────
    const onCurrencyChange = (id) => {
        const cur = currencies.find(c => String(c.currencyId) === String(id));
        setForm(p => ({
            ...p,
            currencyId:   id,
            exchangeRate: cur?.isBaseCurrency ? '1' : String(cur?.exchangeRate ?? '1'),
        }));
        setErrors(p => ({ ...p, currencyId: undefined }));
    };

    // ── Customer search (debounced) ───────────────────────────────────
    const onCustInput = (val) => {
        setForm(p => ({ ...p, customerLabel: val, customerId: '' }));
        setContacts([]); setAddresses([]);
        clearTimeout(custTimerRef.current);
        if (!val.trim()) { setCustResults([]); setShowCustDrop(false); return; }
        custTimerRef.current = setTimeout(() => {
            setCustLoading(true);
            fetch(`${variables.API_URL}customer/search?searchText=${encodeURIComponent(val)}&pageSize=8`,
                { headers: authHeaders() })
                .then(r => r.json())
                .then(d => { setCustResults(d.data || []); setShowCustDrop(true); })
                .catch(console.error)
                .finally(() => setCustLoading(false));
        }, 280);
    };

    const selectCustomer = (c) => {
        setForm(p => ({ ...p, customerId: c.customerId, customerLabel: c.customerName, contactId: '' }));
        setShowCustDrop(false);
        setCreditStatus(null);
        // Credit status check
        fetch(`${variables.API_URL}customer/creditstatus/${c.customerId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setCreditStatus(d))
            .catch(console.error);
        // Load customer data: addresses, contacts, default currency, credit days
        fetch(`${variables.API_URL}invoice/customer/${c.customerId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const cust = d.customer;
                const defaultAddr = (d.addresses || []).find(a => a.isDefault) || (d.addresses || [])[0];
                setContacts(d.contacts || []);
                setAddresses(d.addresses || []);
                if (cust?.currencyId) {
                    const cur = currencies.find(x => x.currencyId === cust.currencyId);
                    setForm(p => ({
                        ...p,
                        currencyId:     String(cust.currencyId),
                        exchangeRate:   cur?.isBaseCurrency ? '1' : String(cur?.exchangeRate ?? p.exchangeRate),
                        billingAddress: defaultAddr?.fullAddress || '',
                        dueDate:        cust.creditDays ? addDays(p.invoiceDate, cust.creditDays) : '',
                        contactId:      (d.contacts || []).find(ct => ct.isPrimary)?.customerContactId || '',
                    }));
                } else {
                    setForm(p => ({
                        ...p,
                        billingAddress: defaultAddr?.fullAddress || '',
                        dueDate:        cust?.creditDays ? addDays(p.invoiceDate, cust.creditDays) : '',
                        contactId:      (d.contacts || []).find(ct => ct.isPrimary)?.customerContactId || '',
                    }));
                }
            })
            .catch(console.error);
    };

    // ── Job search (debounced) ────────────────────────────────────────
    const onJobInput = (val) => {
        setForm(p => ({ ...p, jobLabel: val, jobId: '' }));
        clearTimeout(jobTimerRef.current);
        if (!val.trim()) { setJobResults([]); setShowJobDrop(false); return; }
        jobTimerRef.current = setTimeout(() => {
            setJobLoading(true);
            fetch(`${variables.API_URL}job/search?searchText=${encodeURIComponent(val)}&pageSize=8&approvalStatus=Approved`,
                { headers: authHeaders() })
                .then(r => r.json())
                .then(d => { setJobResults(d.data || d || []); setShowJobDrop(true); })
                .catch(console.error)
                .finally(() => setJobLoading(false));
        }, 280);
    };

    const selectJob = (j) => {
        // Auto-fill LPO No / LPO Date from the selected job, but ONLY if the
        // user hasn't typed anything there yet — never clobber manual input.
        const lpoFromJob     = j.lpoRef  || j.LpoRef  || '';
        const lpoDateFromJob = (j.lpoDate || j.LpoDate || '');
        const lpoDateOnly    = lpoDateFromJob ? String(lpoDateFromJob).slice(0, 10) : '';
        setForm(p => ({
            ...p,
            jobId:    j.jobId,
            jobLabel: `${j.jobId}${j.projectName ? ' — ' + j.projectName : ''}`,
            lpoNo:    p.lpoNo   ? p.lpoNo   : lpoFromJob,
            lpoDate:  p.lpoDate ? p.lpoDate : lpoDateOnly,
        }));
        setErrors(prev => ({ ...prev, jobId: undefined }));
        setShowJobDrop(false);
    };

    // ── Validate ──────────────────────────────────────────────────────
    const validate = () => {
        const e = {};
        if (!form.customerId)  e.customer    = 'Customer is required.';
        if (!form.invoiceDate) e.invoiceDate = 'Invoice date is required.';
        if (form.dueDate && form.invoiceDate && form.dueDate < form.invoiceDate)
            e.dueDate = 'Due date must be on or after the invoice date.';
        if (!form.currencyId)  e.currencyId  = 'Currency is required.';
        if (!form.exchangeRate || isNaN(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0)
            e.exchangeRate = 'Exchange rate must be a number greater than 0.';
        if (!form.jobId)       e.jobId       = 'Job is required.';
        if (!form.contactId)   e.contactId   = 'Contact person is required.';
        return e;
    };

    // ── Save ──────────────────────────────────────────────────────────
    const handleSave = async () => {
        const e = validate();
        if (Object.keys(e).length) { setErrors(e); return; }
        setSaving(true); setApiErr('');
        try {
            const res = await fetch(`${variables.API_URL}invoice/save`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    invoiceId:      0,
                    invoiceDate:    form.invoiceDate,
                    customerId:     form.customerId,
                    billingAddress: form.billingAddress || null,
                    currencyId:     Number(form.currencyId),
                    exchangeRate:   Number(form.exchangeRate) || 1,
                    dueDate:        form.dueDate   || null,
                    jobId:          form.jobId     || null,
                    lpoNo:          form.lpoNo     || null,
                    lpoDate:        form.lpoDate   || null,
                    contactId:      form.contactId ? Number(form.contactId) : null,
                    notes:          form.notes     || null,
                    createdBy:      currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setApiErr(d?.message || 'Save failed.'); return; }
            onSaved(d.invoiceId);
        } catch { setApiErr('Network error.'); }
        finally { setSaving(false); }
    };

    const set = (k, v) => { setForm(p => ({ ...p, [k]: v })); setErrors(p => ({ ...p, [k]: undefined })); };

    const selectedCurrency = currencies.find(c => String(c.currencyId) === String(form.currencyId));
    const isBase = selectedCurrency?.isBaseCurrency === true;

    return (
        <div className="po-modal-overlay">
            <div className="po-modal" style={{ maxWidth: 620 }}>
                {/* Header */}
                <div className="po-modal-header">
                    <div className="po-modal-title">New Invoice</div>
                    <button className="po-modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="po-modal-body">
                    {apiErr && <div className="po-form-error-banner">{apiErr}</div>}

                    {/* Customer */}
                    <div className="po-form-row" style={{ position: 'relative' }}>
                        <label className="po-form-label">Customer <span style={{ color: '#dc2626' }}>*</span></label>
                        <input
                            className={`po-form-input ${errors.customer ? 'po-input-error' : ''}`}
                            placeholder="Search customer…"
                            value={form.customerLabel}
                            onChange={e => onCustInput(e.target.value)}
                            autoComplete="off"
                        />
                        {custLoading && (
                            <span style={{ position: 'absolute', right: 10, top: 34, fontSize: 11, color: '#94a3b8' }}>
                                Searching…
                            </span>
                        )}
                        {showCustDrop && custResults.length > 0 && (
                            <div className="po-dropdown-list">
                                {custResults.map(c => (
                                    <div key={c.customerId} className="po-dropdown-item"
                                         onMouseDown={() => selectCustomer(c)}>
                                        <span style={{ fontWeight: 600 }}>{c.customerName}</span>
                                        {c.customerCode && <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>{c.customerCode}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                        {errors.customer && <div className="po-field-error">{errors.customer}</div>}
                    </div>

                    {/* ── Credit Status Banner ── */}
                    {creditStatus && creditStatus.creditHold && (
                        <div style={{
                            background: '#fee2e2', border: '1px solid #fca5a5',
                            borderLeft: '4px solid #dc2626',
                            borderRadius: 6, padding: '10px 14px', fontSize: 12.5,
                        }}>
                            <div style={{ fontWeight: 700, color: '#991b1b', marginBottom: 3 }}>
                                🚫 Customer on Credit Hold
                            </div>
                            <div style={{ color: '#7f1d1d' }}>
                                {creditStatus.creditHoldNote || 'This customer is on credit hold. Invoicing is blocked.'}
                            </div>
                        </div>
                    )}
                    {creditStatus && !creditStatus.creditHold && (creditStatus.limitBreached || creditStatus.daysBreached) && (
                        <div style={{
                            background: '#fffbeb', border: '1px solid #fde68a',
                            borderLeft: '4px solid #f59e0b',
                            borderRadius: 6, padding: '10px 14px', fontSize: 12.5,
                        }}>
                            <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 3 }}>
                                ⚠ Credit Warning
                            </div>
                            {creditStatus.limitBreached && (
                                <div style={{ color: '#78350f' }}>
                                    Outstanding balance <strong>{creditStatus.outstandingBalance?.toLocaleString()}</strong> exceeds credit limit of <strong>{creditStatus.creditLimit?.toLocaleString()}</strong>.
                                </div>
                            )}
                            {creditStatus.daysBreached && (
                                <div style={{ color: '#78350f', marginTop: 2 }}>
                                    Invoice overdue by <strong>{creditStatus.maxOverdueDays} days</strong> (allowed: {creditStatus.creditDays} days).
                                </div>
                            )}
                        </div>
                    )}

                    {/* Invoice Date + Due Date */}
                    <div className="po-form-2col">
                        <div className="po-form-row">
                            <label className="po-form-label">Invoice Date <span style={{ color: '#dc2626' }}>*</span></label>
                            <input type="date" className={`po-form-input ${errors.invoiceDate ? 'po-input-error' : ''}`}
                                   value={form.invoiceDate}
                                   onChange={e => set('invoiceDate', e.target.value)} />
                            {errors.invoiceDate && <div className="po-field-error">{errors.invoiceDate}</div>}
                        </div>
                        <div className="po-form-row">
                            <label className="po-form-label">Due Date</label>
                            <input type="date" className={`po-form-input ${errors.dueDate ? 'po-input-error' : ''}`}
                                   value={form.dueDate}
                                   min={form.invoiceDate || undefined}
                                   onChange={e => set('dueDate', e.target.value)} />
                            {errors.dueDate && <div className="po-field-error">{errors.dueDate}</div>}
                        </div>
                    </div>

                    {/* Currency + Exchange Rate */}
                    <div className="po-form-2col">
                        <div className="po-form-row">
                            <label className="po-form-label">Currency <span style={{ color: '#dc2626' }}>*</span></label>
                            <select className={`po-form-input ${errors.currencyId ? 'po-input-error' : ''}`}
                                    value={form.currencyId}
                                    onChange={e => onCurrencyChange(e.target.value)}>
                                <option value="">— Select —</option>
                                {currencies.map(c => (
                                    <option key={c.currencyId} value={c.currencyId}>
                                        {c.shortName} — {c.currencyName}
                                        {c.isBaseCurrency ? ' (Base)' : ''}
                                    </option>
                                ))}
                            </select>
                            {errors.currencyId && <div className="po-field-error">{errors.currencyId}</div>}
                        </div>
                        <div className="po-form-row">
                            <label className="po-form-label">
                                Exchange Rate
                                {isBase && (
                                    <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600,
                                                   color: '#16a34a', background: '#dcfce7',
                                                   padding: '1px 6px', borderRadius: 10 }}>
                                        Base
                                    </span>
                                )}
                            </label>
                            <input
                                type="number" min="0.000001" step="any"
                                className={`po-form-input ${errors.exchangeRate ? 'po-input-error' : ''}`}
                                value={form.exchangeRate}
                                onChange={e => set('exchangeRate', e.target.value)}
                                disabled={isBase}
                                style={isBase ? { background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' } : undefined}
                            />
                            {errors.exchangeRate && <div className="po-field-error">{errors.exchangeRate}</div>}
                            {isBase && (
                                <div style={{ fontSize: 10, color: '#64748b', marginTop: 3 }}>
                                    Base currency rate is always 1
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Contact Person */}
                    <div className="po-form-row">
                        <label className="po-form-label">Contact Person <span style={{ color: '#dc2626' }}>*</span></label>
                        <select className={`po-form-input ${errors.contactId ? 'po-input-error' : ''}`}
                                value={form.contactId}
                                onChange={e => set('contactId', e.target.value)}
                                disabled={contacts.length === 0}>
                            <option value="">— Select —</option>
                            {contacts.map(c => (
                                <option key={c.customerContactId} value={c.customerContactId}>
                                    {c.contactName}{c.designation ? ` (${c.designation})` : ''}
                                </option>
                            ))}
                        </select>
                        {errors.contactId && <div className="po-field-error">{errors.contactId}</div>}
                    </div>

                    {/* Job — select FIRST so LPO No / LPO Date below can auto-fill from it */}
                    <div className="po-form-row" style={{ position: 'relative' }}>
                        <label className="po-form-label">Job <span style={{ color: '#dc2626' }}>*</span></label>
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                className={`po-form-input${errors.jobId ? ' po-input-error' : ''}`}
                                placeholder="Search job…"
                                value={form.jobLabel}
                                onChange={e => onJobInput(e.target.value)}
                                style={{ flex: 1 }}
                                autoComplete="off"
                            />
                            {form.jobId && (
                                <button className="po-clear-btn"
                                        onClick={() => setForm(p => ({ ...p, jobId: '', jobLabel: '' }))}>
                                    ✕
                                </button>
                            )}
                        </div>
                        {jobLoading && (
                            <span style={{ position: 'absolute', right: 10, top: 34, fontSize: 11, color: '#94a3b8' }}>
                                Searching…
                            </span>
                        )}
                        {showJobDrop && jobResults.length > 0 && (
                            <div className="po-dropdown-list">
                                {jobResults.map(j => (
                                    <div key={j.jobId} className="po-dropdown-item"
                                         onMouseDown={() => selectJob(j)}>
                                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{j.jobId}</span>
                                        {j.customerName && <span style={{ color: '#64748b', marginLeft: 6, fontSize: 11 }}>{j.customerName}</span>}
                                        {j.projectName && <span style={{ color: '#94a3b8', marginLeft: 6, fontSize: 11 }}>— {j.projectName}</span>}
                                    </div>
                                ))}
                            </div>
                        )}
                        {errors.jobId && <div className="po-field-error">{errors.jobId}</div>}
                    </div>

                    {/* LPO No + LPO Date — auto-filled from the selected Job, fully editable */}
                    <div className="po-form-2col">
                        <div className="po-form-row">
                            <label className="po-form-label">LPO / PO No
                                {form.jobId && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: '#64748b' }}>(from job — editable)</span>}
                            </label>
                            <input className="po-form-input" placeholder="e.g. LPO-2024-001"
                                   value={form.lpoNo} onChange={e => set('lpoNo', e.target.value)} />
                        </div>
                        <div className="po-form-row">
                            <label className="po-form-label">LPO Date
                                {form.jobId && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 400, color: '#64748b' }}>(from job — editable)</span>}
                            </label>
                            <input type="date" className="po-form-input"
                                   value={form.lpoDate} onChange={e => set('lpoDate', e.target.value)} />
                        </div>
                    </div>

                    {/* Billing Address */}
                    {addresses.length > 1 && (
                        <div className="po-form-row">
                            <label className="po-form-label">Billing Address</label>
                            <select className="po-form-input"
                                    value={addresses.findIndex(a => a.fullAddress === form.billingAddress)}
                                    onChange={e => set('billingAddress', addresses[e.target.value]?.fullAddress || '')}>
                                {addresses.map((a, i) => (
                                    <option key={a.customerAddressId} value={i}>
                                        {a.addressType || `Address ${i + 1}`}{a.isDefault ? ' (Default)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Notes */}
                    <div className="po-form-row">
                        <label className="po-form-label">Notes</label>
                        <textarea className="po-form-input" rows={2} style={{ resize: 'vertical' }}
                                  placeholder="Internal notes or remarks…"
                                  value={form.notes} onChange={e => set('notes', e.target.value)} />
                    </div>
                </div>

                {/* Footer */}
                <div className="po-modal-footer">
                    <button className="po-btn-cancel" onClick={onClose}>Cancel</button>
                    <button className="po-btn-save" onClick={handleSave} disabled={saving}>
                        {saving ? 'Creating…' : 'Create Invoice'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InvoiceForm;
