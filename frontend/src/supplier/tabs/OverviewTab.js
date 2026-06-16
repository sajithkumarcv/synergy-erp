import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { fmt } from '../supplierConstants';
import ValidationModal from '../../common/ValidationModal';

const PAYMENT_MODES = ['Bank Transfer', 'Cheque', 'Cash', 'Letter of Credit (LC)', 'Online Transfer'];

const normalise = (s, currencies, paymentTerms, supplierCategories, countries) => ({
    ...s,
    currencyId:         s.currencyId         != null ? String(s.currencyId)         : (currencies.length         ? String(currencies[0].id)                              : ''),
    paymentTermsId:     s.paymentTermsId     != null ? String(s.paymentTermsId)     : (paymentTerms.length       ? String(paymentTerms[0].id)                            : ''),
    supplierCategoryId: s.supplierCategoryId != null ? String(s.supplierCategoryId) : (supplierCategories.length ? String(supplierCategories[0].supplierCategoryId)       : ''),
    countryId:          s.countryId          != null ? String(s.countryId)          : '',
    tradeLicenseExpiry: s.tradeLicenseExpiry ? s.tradeLicenseExpiry.slice(0, 10) : '',
    rating:             s.rating != null ? String(s.rating) : '',
    creditLimit:        s.creditLimit ?? 0,
    creditDays:         s.creditDays  ?? 0,
});

const Row = ({ label, value, mono }) => (
    <div className="ov-row">
        <span className="ov-row-label">{label}</span>
        <span className={`ov-row-value${mono ? ' tab-mono' : ''}`}>{value || '—'}</span>
    </div>
);

const OverviewTab = ({ supplier, onRefresh, canEdit = true }) => {
    const currentUser = useCurrentUser();
    const { lookups, baseCurrencyCode } = useLookup();
    const { currencies, paymentTerms } = lookups;
    const [supplierCategories, setSupplierCategories] = useState([]);
    const { countries } = lookups;

    const [editing, setEditing]         = useState(false);
    const [form, setForm]               = useState(null);
    const [saving, setSaving]           = useState(false);
    const [validErrors, setValidErrors] = useState(null);

    useEffect(() => {
        fetch(variables.API_URL + 'supplier/categories', { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setSupplierCategories(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    const startEdit = () => {
        setForm(normalise({ ...supplier }, currencies, paymentTerms, supplierCategories, countries));
        setEditing(true);
    };
    const cancel = () => { setEditing(false); setForm(null); };
    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };
    const save = async () => {
        const errs = [];
        if (!form.supplierCode?.trim()) errs.push('Supplier Code is required.');
        if (!form.supplierName?.trim()) errs.push('Supplier Name is required.');
        if (!form.currencyId)           errs.push('Currency is required.');
        if (!form.paymentTermsId)       errs.push('Payment Terms are required.');
        if (errs.length) { setValidErrors(errs); return; }
        setSaving(true);
        try {
            const res = await fetch(variables.API_URL + 'supplier/save', {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    ...form,
                    currencyId:         form.currencyId         ? parseInt(form.currencyId)         : 0,
                    paymentTermsId:     form.paymentTermsId     ? parseInt(form.paymentTermsId)     : 0,
                    supplierCategoryId: form.supplierCategoryId ? parseInt(form.supplierCategoryId) : null,
                    countryId:          form.countryId          ? parseInt(form.countryId)          : null,
                    rating:             form.rating             ? parseInt(form.rating)             : null,
                    creditLimit:        form.creditLimit != null ? parseFloat(form.creditLimit)     : 0,
                    creditDays:         form.creditDays  != null ? parseInt(form.creditDays)        : 0,
                    leadTimeDays:       form.leadTimeDays       ? parseInt(form.leadTimeDays)       : null,
                    tradeLicenseExpiry: form.tradeLicenseExpiry || null,
                    modifiedBy:         currentUser,
                })
            });
            const d = await res.json();
            if (!res.ok) { setValidErrors([d?.message || 'Failed to save supplier.']); return; }
            onRefresh(); cancel();
        } catch { setValidErrors(['Network error. Please try again.']); }
        finally { setSaving(false); }
    };

    if (!supplier) return null;

    // ── EDIT SLIDE-OVER ──────────────────────────────────────────
    if (editing && form) return (
        <div className="jf-overlay">
            <div className="jf-panel">
                <div className="jf-header">
                    <div>
                        <div className="jf-header-title">Edit Supplier</div>
                        <div className="jf-header-sub">{supplier.supplierCode} — {supplier.supplierName}</div>
                    </div>
                    <button className="jf-close" onClick={cancel}>&#10005;</button>
                </div>
                <div className="jf-body">
                    <div className="jf-section"><span className="jf-section-label">Identity</span><div className="jf-section-line" /></div>
                    <div className="jf-row">
                        <div className="jf-field" style={{ flex: '0 0 150px' }}><label>Code <span className="req">*</span></label><input name="supplierCode" className="jf-input" value={form.supplierCode || ''} onChange={handle} /></div>
                        <div className="jf-field jf-f2"><label>Supplier Name <span className="req">*</span></label><input name="supplierName" className="jf-input" value={form.supplierName || ''} onChange={handle} /></div>
                        <div className="jf-field"><label>Short Name</label><input name="supplierShortName" className="jf-input" value={form.supplierShortName || ''} onChange={handle} /></div>
                        <div className="jf-field" style={{ flex: '0 0 130px' }}><label>Reference</label><input name="supplierRef" className="jf-input" value={form.supplierRef || ''} onChange={handle} /></div>
                    </div>
                    <div className="jf-row">
                        <div className="jf-field" style={{ flex: '0 0 200px' }}>
                            <label>Active</label>
                            <label className="tab-check"><input type="checkbox" name="isActive" checked={!!form.isActive} onChange={handle} /><span>Active</span></label>
                        </div>
                    </div>

                    <div className="jf-section"><span className="jf-section-label">Classification</span><div className="jf-section-line" /></div>
                    <div className="jf-row">
                        <div className="jf-field">
                            <label>Category</label>
                            <select name="supplierCategoryId" className="jf-input" value={form.supplierCategoryId || ''} onChange={handle}>
                                <option value="">— Select —</option>
                                {supplierCategories.map(c => <option key={c.supplierCategoryId} value={String(c.supplierCategoryId)}>{c.categoryName}</option>)}
                            </select>
                        </div>
                        <div className="jf-field"><label>Supplier Type</label><input name="supplierType" className="jf-input" value={form.supplierType || ''} onChange={handle} placeholder="e.g. Manufacturer" /></div>
                        <div className="jf-field"><label>Account Manager</label><input name="accountManager" className="jf-input" value={form.accountManager || ''} onChange={handle} /></div>
                        <div className="jf-field">
                            <label>Country</label>
                            <select name="countryId" className="jf-input" value={form.countryId || ''} onChange={handle}>
                                <option value="">— Select —</option>
                                {countries.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="jf-row">
                        <div className="jf-field" style={{ flex: '0 0 130px' }}>
                            <label>Rating (1–5)</label>
                            <select name="rating" className="jf-input" value={form.rating || ''} onChange={handle}>
                                <option value="">— None —</option>
                                {[1,2,3,4,5].map(n => <option key={n} value={n}>{'★'.repeat(n)} ({n})</option>)}
                            </select>
                        </div>
                        <div className="jf-field" style={{ flex: '0 0 160px' }}>
                            <label>Approved Vendor</label>
                            <label className="tab-check"><input type="checkbox" name="isApprovedVendor" checked={!!form.isApprovedVendor} onChange={handle} /><span>AVL Approved</span></label>
                        </div>
                        <div className="jf-field" style={{ flex: '0 0 130px' }}>
                            <label>On Hold</label>
                            <label className="tab-check"><input type="checkbox" name="isOnHold" checked={!!form.isOnHold} onChange={handle} /><span>On Hold</span></label>
                        </div>
                        <div className="jf-field" style={{ flex: '0 0 130px' }}>
                            <label>Lead Time (days)</label>
                            <input name="leadTimeDays" type="number" className="jf-input" value={form.leadTimeDays || ''} onChange={handle} placeholder="e.g. 14" />
                        </div>
                    </div>

                    <div className="jf-section"><span className="jf-section-label">Compliance</span><div className="jf-section-line" /></div>
                    <div className="jf-row">
                        <div className="jf-field">
                            <label>Trade License No.</label>
                            <input name="tradeLicenseNo" className="jf-input" value={form.tradeLicenseNo || ''} onChange={handle} />
                        </div>
                        <div className="jf-field" style={{ flex: '0 0 160px' }}>
                            <label>Trade License Expiry</label>
                            <input name="tradeLicenseExpiry" type="date" className="jf-input" value={form.tradeLicenseExpiry || ''} onChange={handle} />
                        </div>
                        <div className="jf-field">
                            <label>VAT Number</label>
                            <input name="vatNumber" className="jf-input" value={form.vatNumber || ''} onChange={handle} />
                        </div>
                        <div className="jf-field">
                            <label>Tax Number</label>
                            <input name="taxNumber" className="jf-input" value={form.taxNumber || ''} onChange={handle} />
                        </div>
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
                        <div className="jf-field"><label>Currency <span className="req">*</span></label><select name="currencyId" className="jf-input" value={form.currencyId} onChange={handle}>{currencies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select></div>
                        <div className="jf-field"><label>Payment Terms <span className="req">*</span></label><select name="paymentTermsId" className="jf-input" value={form.paymentTermsId} onChange={handle}>{paymentTerms.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></div>
                        <div className="jf-field">
                            <label>Payment Mode</label>
                            <select name="paymentMode" className="jf-input" value={form.paymentMode || ''} onChange={handle}>
                                <option value="">— Select —</option>
                                {PAYMENT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="jf-row">
                        <div className="jf-field" style={{ flex: '0 0 140px' }}><label>Credit Limit {baseCurrencyCode && <span style={{ fontWeight: 400, color: '#64748b' }}>({baseCurrencyCode})</span>}</label><input name="creditLimit" type="number" className="jf-input" value={form.creditLimit ?? 0} onChange={handle} /></div>
                        <div className="jf-field" style={{ flex: '0 0 110px' }}><label>Credit Days</label><input name="creditDays" type="number" className="jf-input" value={form.creditDays ?? 0} onChange={handle} /></div>
                        <div className="jf-field jf-f2"><label>Remarks</label><input name="remarks" className="jf-input" value={form.remarks || ''} onChange={handle} /></div>
                    </div>
                </div>
                <div className="jf-footer">
                    <button className="jf-btn-sec" onClick={cancel}>Cancel</button>
                    <button className="jf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Update Supplier'}</button>
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
                    <span className="tab-section-title">Supplier Details</span>
                </div>
                {canEdit && <button className="jd-edit-btn" onClick={startEdit}>✏️ Edit Supplier</button>}
            </div>

            <div className="ov-detail-grid">
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Identity</div>
                    <div className="ov-detail-rows">
                        <Row label="Supplier Code"   value={supplier.supplierCode}      mono />
                        <Row label="Supplier Name"   value={supplier.supplierName}           />
                        <Row label="Short Name"      value={supplier.supplierShortName}      />
                        <Row label="Reference"       value={supplier.supplierRef}            />
                        <Row label="Account Manager" value={supplier.accountManager}         />
                    </div>
                </div>
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Classification</div>
                    <div className="ov-detail-rows">
                        <Row label="Category"         value={supplier.supplierCategoryName} />
                        <Row label="Type"             value={supplier.supplierType}         />
                        <Row label="Country"          value={supplier.countryName}          />
                        <Row label="Status"           value={supplier.isActive ? 'Active' : 'Inactive'} />
                        <Row label="Approved Vendor"  value={supplier.isApprovedVendor ? '✔ Yes' : 'No'} />
                        <Row label="On Hold"          value={supplier.isOnHold         ? '⚠ Yes' : 'No'} />
                        <Row label="Lead Time"        value={supplier.leadTimeDays != null ? `${supplier.leadTimeDays} days` : null} />
                        <Row label="Rating"           value={supplier.rating != null ? ('★'.repeat(supplier.rating) + '☆'.repeat(5 - supplier.rating)) : null} />
                    </div>
                </div>
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Contact</div>
                    <div className="ov-detail-rows">
                        <Row label="Email"   value={supplier.email}  />
                        <Row label="Mobile"  value={supplier.mobile} />
                        <Row label="Phone"   value={supplier.phone}  />
                        <Row label="Website" value={supplier.web}    />
                    </div>
                </div>
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Financial</div>
                    <div className="ov-detail-rows">
                        <Row label="Currency"      value={supplier.currencyName}    />
                        <Row label="Payment Terms" value={supplier.paymentTermName} />
                        <Row label="Payment Mode"  value={supplier.paymentMode}     />
                        <Row label={`Credit Limit${baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}`} value={supplier.creditLimit != null ? fmt(supplier.creditLimit) : null} />
                        <Row label="Credit Days"   value={supplier.creditDays  != null ? String(supplier.creditDays)  : null} />
                    </div>
                </div>
                <div className="ov-detail-card">
                    <div className="ov-detail-card-title">Compliance</div>
                    <div className="ov-detail-rows">
                        <Row label="VAT / TRN"          value={supplier.vatNumber}          mono />
                        <Row label="Tax Number"         value={supplier.taxNumber}          mono />
                        <Row label="Trade License No."  value={supplier.tradeLicenseNo}     mono />
                        <Row label="License Expiry"     value={supplier.tradeLicenseExpiry ? new Date(supplier.tradeLicenseExpiry).toLocaleDateString() : null} />
                    </div>
                </div>
                {supplier.remarks && (
                    <div className="ov-desc-card">
                        <div className="ov-detail-card-title">Remarks</div>
                        <p className="ov-desc-text">{supplier.remarks}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default OverviewTab;
