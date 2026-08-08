import React, { useState } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { fmt } from '../customerConstants';
import { useFieldConfig } from '../../FieldConfigContext';
import ValidationModal from '../../common/ValidationModal';
import AmountInput from '../../common/AmountInput';

const normalise = (c, currencies, paymentTerms, customerCategories, customerTypes) => ({
    ...c,
    currencyId:         c.currencyId         != null ? String(c.currencyId)         : (currencies.length         ? String(currencies[0].id)         : ''),
    paymentTermsId:     c.paymentTermsId     != null ? String(c.paymentTermsId)     : (paymentTerms.length       ? String(paymentTerms[0].id)       : ''),
    customerCategoryId: c.customerCategoryId != null ? String(c.customerCategoryId) : (customerCategories.length ? String(customerCategories[0].id) : ''),
    customerType:       c.customerType       || (customerTypes.length ? customerTypes[0].value : ''),
    creditLimit:        c.creditLimit ?? 0,
    creditDays:         c.creditDays  ?? 0,
});

const Row = ({ label, value, mono }) => (
    <div className="ov-row">
        <span className="ov-row-label">{label}</span>
        <span className={`ov-row-value${mono ? ' tab-mono' : ''}`}>{value || '—'}</span>
    </div>
);

const OverviewTab = ({ customer, onRefresh, canEdit = true }) => {
    const currentUser = useCurrentUser();
    const { lookups, getVList, baseCurrencyCode } = useLookup();
    const { isReq } = useFieldConfig('CUSTOMER');
    const { currencies, paymentTerms, customerCategories } = lookups;
    const customerTypes = getVList('Customer', 'CustomerType');

    const [editing, setEditing]         = useState(false);
    const [form, setForm]               = useState(null);
    const [saving, setSaving]           = useState(false);
    const [validErrors, setValidErrors] = useState(null);

    const startEdit = () => {
        setForm(normalise({ ...customer }, currencies, paymentTerms, customerCategories, customerTypes));
        setEditing(true);
    };
    const cancel = () => { setEditing(false); setForm(null); };
    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };
    const save = async () => {
        const errs = [];
        if (!form.customerName?.trim()) errs.push('Customer Name is required.');
        if (!form.currencyId)           errs.push('Currency is required.');
        if (!form.paymentTermsId)       errs.push('Payment Terms are required.');
        if (errs.length) { setValidErrors(errs); return; }
        setSaving(true);
        try {
            const res = await fetch(variables.API_URL + 'customer/save', {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ ...form, modifiedBy: currentUser })
            });
            const d = await res.json();
            if (!res.ok) { setValidErrors([d?.message || 'Failed to save customer.']); return; }
            onRefresh(); cancel();
        } catch { setValidErrors(['Network error. Please try again.']); }
        finally { setSaving(false); }
    };

    if (!customer) return null;

    // ── EDIT SLIDE-OVER ──────────────────────────────────────────
    if (editing && form) return (
        <div className="jf-overlay">
            <div className="jf-panel">
                <div className="jf-header">
                    <div>
                        <div className="jf-header-title">Edit Customer</div>
                        <div className="jf-header-sub">{customer.customerCode} — {customer.customerName}</div>
                    </div>
                    <button className="jf-close" onClick={cancel}>&#10005;</button>
                </div>
                <div className="jf-body">
                    <div className="jf-section"><span className="jf-section-label">Identity</span><div className="jf-section-line" /></div>
                    <div className="jf-row">
                        <div className="jf-field" style={{ flex: '0 0 150px' }}><label>Code</label><input name="customerCode" className="jf-input" value={form.customerCode || ''} disabled title="System-generated, cannot be changed" /></div>
                        <div className="jf-field jf-f2"><label>Customer Name {isReq('customerName') && <span className="req">*</span>}</label><input name="customerName" className="jf-input" value={form.customerName || ''} onChange={handle} /></div>
                        <div className="jf-field"><label>Short Name</label><input name="customerShortName" className="jf-input" value={form.customerShortName || ''} onChange={handle} /></div>
                        <div className="jf-field" style={{ flex: '0 0 130px' }}><label>Reference</label><input name="customerRef" className="jf-input" value={form.customerRef || ''} onChange={handle} /></div>
                    </div>
                    <div className="jf-row">
                        <div className="jf-field" style={{ flex: '0 0 200px' }}>
                            <label>Active</label>
                            <label className="tab-check"><input type="checkbox" name="isActive" checked={!!form.isActive} onChange={handle} /><span>Active</span></label>
                        </div>
                    </div>

                    <div className="jf-section"><span className="jf-section-label">Classification</span><div className="jf-section-line" /></div>
                    <div className="jf-row">
                        <div className="jf-field"><label>Category</label><select name="customerCategoryId" className="jf-input" value={form.customerCategoryId} onChange={handle}>{customerCategories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select></div>
                        <div className="jf-field"><label>Type {isReq('customerType') && <span className="req">*</span>}</label><select name="customerType" className="jf-input" value={form.customerType} onChange={handle}>{customerTypes.map(t => <option key={t.id} value={t.value}>{t.label}</option>)}</select></div>
                        <div className="jf-field"><label>Sales Person</label><input name="salesPerson" className="jf-input" value={form.salesPerson || ''} onChange={handle} /></div>
                    </div>

                    <div className="jf-section"><span className="jf-section-label">Contact</span><div className="jf-section-line" /></div>
                    <div className="jf-row">
                        <div className="jf-field"><label>Email</label><input name="email" type="email" className="jf-input" value={form.email || ''} onChange={handle} /></div>
                        <div className="jf-field"><label>Mobile</label><input name="mobile" className="jf-input" value={form.mobile || ''} onChange={handle} /></div>
                        <div className="jf-field"><label>Phone</label><input name="phone" className="jf-input" value={form.phone || ''} onChange={handle} /></div>
                        <div className="jf-field"><label>Website</label><input name="web" className="jf-input" value={form.web || ''} onChange={handle} /></div>
                    </div>

                    <div className="jf-section"><span className="jf-section-label">Financial</span><div className="jf-section-line" /></div>
                    <div className="jf-row">
                        <div className="jf-field"><label>Currency {isReq('currencyId') && <span className="req">*</span>}</label><select name="currencyId" className="jf-input" value={form.currencyId} onChange={handle}>{currencies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select></div>
                        <div className="jf-field"><label>Payment Terms {isReq('paymentTermsId') && <span className="req">*</span>}</label><select name="paymentTermsId" className="jf-input" value={form.paymentTermsId} onChange={handle}>{paymentTerms.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></div>
                        <div className="jf-field" style={{ flex: '0 0 140px' }}><label>Credit Limit {baseCurrencyCode && <span style={{ fontWeight: 400, color: '#64748b' }}>({baseCurrencyCode})</span>}</label><AmountInput name="creditLimit" className="jf-input" value={form.creditLimit ?? 0} onChange={v => handle({ target: { name: 'creditLimit', value: v } })} /></div>
                        <div className="jf-field" style={{ flex: '0 0 110px' }}><label>Credit Days</label><input name="creditDays" type="number" className="jf-input" value={form.creditDays ?? 0} onChange={handle} /></div>
                    </div>

                    <div className="jf-section"><span className="jf-section-label">Tax</span><div className="jf-section-line" /></div>
                    <div className="jf-row">
                        <div className="jf-field"><label>VAT Number</label><input name="vatNumber" className="jf-input" value={form.vatNumber || ''} onChange={handle} /></div>
                        <div className="jf-field"><label>Tax Number</label><input name="taxNumber" className="jf-input" value={form.taxNumber || ''} onChange={handle} /></div>
                        <div className="jf-field jf-f2"><label>Remarks</label><input name="remarks" className="jf-input" value={form.remarks || ''} onChange={handle} /></div>
                    </div>
                </div>
                <div className="jf-footer">
                    <button className="jf-btn-sec" onClick={cancel}>Cancel</button>
                    <button className="jf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Update Customer'}</button>
                </div>
            </div>
            {validErrors && <ValidationModal errors={validErrors} onClose={() => setValidErrors(null)} />}
        </div>
    );

    // ── READ VIEW ────────────────────────────────────────────────
    return (
        <div className="ov-wrap">
            <div className="tab-toolbar">
                <div className="tab-toolbar-left">
                    <span className="tab-section-title">Customer Details</span>
                </div>
                {canEdit && <button className="jd-edit-btn" onClick={startEdit}>✏️ Edit Customer</button>}
            </div>

            <div className="ov-detail-grid">
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Identity</div>
                    <div className="ov-detail-rows">
                        <Row label="Customer Code"  value={customer.customerCode}      mono />
                        <Row label="Customer Name"  value={customer.customerName}           />
                        <Row label="Short Name"     value={customer.customerShortName}      />
                        <Row label="Reference"      value={customer.customerRef}            />
                        <Row label="Sales Person"   value={customer.salesPerson}            />
                    </div>
                </div>
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Classification</div>
                    <div className="ov-detail-rows">
                        <Row label="Category"     value={customer.customerCategoryName} />
                        <Row label="Type"         value={customer.customerType}         />
                        <Row label="Status"       value={customer.isActive ? 'Active' : 'Inactive'} />
                    </div>
                </div>
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Contact</div>
                    <div className="ov-detail-rows">
                        <Row label="Email"   value={customer.email}  />
                        <Row label="Mobile"  value={customer.mobile} />
                        <Row label="Phone"   value={customer.phone}  />
                        <Row label="Website" value={customer.web}    />
                    </div>
                </div>
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Financial</div>
                    <div className="ov-detail-rows">
                        <Row label="Currency"      value={customer.currencyName}    />
                        <Row label="Payment Terms" value={customer.paymentTermName} />
                        <Row label={`Credit Limit${baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}`} value={customer.creditLimit != null ? fmt(customer.creditLimit) : null} />
                        <Row label="Credit Days"   value={customer.creditDays  != null ? String(customer.creditDays)  : null} />
                    </div>
                </div>
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Tax</div>
                    <div className="ov-detail-rows">
                        <Row label="VAT Number" value={customer.vatNumber} mono />
                        <Row label="Tax Number" value={customer.taxNumber} mono />
                    </div>
                </div>
                {customer.remarks && (
                    <div className="ov-desc-card">
                        <div className="ov-detail-card-title">Remarks</div>
                        <p className="ov-desc-text">{customer.remarks}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OverviewTab;
