import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { variables, authHeaders, getCurrentUser } from './Variable.js';
import { useLookup } from './LookupContext';
import { useCurrentUser } from './AuthContext';
import { useFilters } from './FilterContext';
import { useFieldConfig } from './FieldConfigContext';
import './Customer.css';

const initials = (name = '') =>
    name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??';

const AVATAR_COLORS = [
    { bg: '#dbeafe', color: '#1e40af' }, { bg: '#d1fae5', color: '#065f46' },
    { bg: '#ede9fe', color: '#5b21b6' }, { bg: '#fef3c7', color: '#92400e' },
    { bg: '#fce7f3', color: '#9d174d' },
];
const avatarColor = (name = '') => AVATAR_COLORS[(name.charCodeAt(0) || 0) % AVATAR_COLORS.length];

const FLAG_CONFIG = {
    GREEN:  { bg: '#dcfce7', color: '#166534', dot: '#16a34a', label: 'Good Standing' },
    YELLOW: { bg: '#fef9c3', color: '#854d0e', dot: '#ca8a04', label: 'Warning'       },
    RED:    { bg: '#fee2e2', color: '#991b1b', dot: '#dc2626', label: 'Overdue'        },
    BLACK:  { bg: '#1c1c1c', color: '#ffffff', dot: '#111111', label: 'Credit Hold'   },
};
const getFlag = (flag) => FLAG_CONFIG[flag] || FLAG_CONFIG.GREEN;
const fmt = (n) => (n != null ? Number(n).toLocaleString() : '—');

// ✅ Added 5 to the list so smaller per-page is available
const PAGE_SIZES = [5, 10, 20, 50, 100];

const DEFAULT_FILTERS = {
    searchText: '', categoryId: '', customerType: '', currencyId: '',
    paymentTermsId: '', creditHold: '', isActive: '', creditFlag: '',
};

const CreditFlagBadge = ({ flag, label }) => {
    const cfg = getFlag(flag);
    return (
        <span className="credit-flag-badge" style={{ background: cfg.bg, color: cfg.color }} title={label || cfg.label}>
            <span className="credit-flag-dot" style={{ background: cfg.dot }} />
            {label || cfg.label}
        </span>
    );
};

const SortIcon = ({ col, sortCol, sortDir }) => {
    if (sortCol !== col) return <span className="sort-icon sort-none">⇅</span>;
    return <span className="sort-icon sort-active">{sortDir === 'ASC' ? '↑' : '↓'}</span>;
};

const CreditHoldModal = ({ customer, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const isOnHold = customer.creditHold;
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const submit = async () => {
        setSaving(true);
        try {
            const res = await fetch(variables.API_URL + 'customer/credithold', {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ customerId: customer.customerId, creditHold: !isOnHold, creditHoldBy: currentUser, creditHoldNote: note.trim() || null })
            });
            const d = await res.json();
            if (!res.ok) { alert(d?.message || 'Failed to update credit hold.'); return; }
            onSaved(); onClose();
        } catch { alert('Network error. Please try again.'); }
        finally { setSaving(false); }
    };
    return (
        <div className="modal-backdrop">
            <div className="modal-box">
                <div className={`modal-header ${isOnHold ? 'modal-header-green' : 'modal-header-black'}`}>
                    <span>{isOnHold ? 'Release Credit Hold' : 'Place on Credit Hold'}</span>
                    <button className="cf-close" onClick={onClose}>&#10005;</button>
                </div>
                <div className="modal-body">
                    <div className="modal-customer-name">{customer.customerName}</div>
                    <div className="modal-customer-code">{customer.customerCode}</div>
                    {isOnHold && customer.creditHoldNote && <div className="modal-current-note"><span className="modal-note-label">Current reason: </span><span>{customer.creditHoldNote}</span></div>}
                    {!isOnHold && (<><label className="modal-field-label">Reason for hold <span className="req">*</span></label><textarea className="cf-input modal-textarea" rows="3" placeholder="e.g. Overdue invoices…" value={note} onChange={e => setNote(e.target.value)} /></>)}
                    {isOnHold && <p className="modal-release-msg">This will release the credit hold and allow transactions for this customer.</p>}
                </div>
                <div className="modal-footer">
                    <button className="btn-sec" onClick={onClose}>Cancel</button>
                    <button className={isOnHold ? 'btn-teal' : 'btn-black'} onClick={submit} disabled={saving || (!isOnHold && !note.trim())}>
                        {saving ? 'Saving…' : (isOnHold ? 'Release Hold' : 'Confirm Hold')}
                    </button>
                </div>
            </div>
        </div>
    );
};

const makeEmptyContact = (cid, userTitles) => ({
    customerContactId: 0, customerId: cid,
    contactTitle: userTitles.length ? userTitles[0].value : '',
    contactName: '', designation: '', phone: '', mobile: '', email: '',
    isPrimary: false, isActive: true,
    createdBy: getCurrentUser(), modifiedBy: null,
});

const makeEmptyAddress = (cid, addressTypes, countries) => ({
    customerAddressId: 0, customerId: cid,
    addressType: addressTypes.length ? addressTypes[0].value : '',
    addressLine1: '', addressLine2: '', city: '', state: '',
    countryId: countries.length ? String(countries[0].id) : '',
    postalCode: '', pOBox: '', isDefault: false, isActive: true,
    createdBy: getCurrentUser(), modifiedBy: null,
});

const FormSection = ({ label }) => (
    <div className="cf-section"><span className="cf-section-label">{label}</span><div className="cf-section-line" /></div>
);

const normaliseCustomer = (c, currencies, paymentTerms, customerCategories, customerTypes) => {
    const firstCurrency    = currencies.length         ? String(currencies[0].id)         : '';
    const firstTerms       = paymentTerms.length       ? String(paymentTerms[0].id)       : '';
    const firstCategory    = customerCategories.length ? String(customerCategories[0].id) : '';
    const firstType        = customerTypes.length      ? customerTypes[0].value           : '';
    return {
        ...c,
        currencyId:         c.currencyId         != null ? String(c.currencyId)         : firstCurrency,
        paymentTermsId:     c.paymentTermsId     != null ? String(c.paymentTermsId)     : firstTerms,
        customerCategoryId: c.customerCategoryId != null ? String(c.customerCategoryId) : firstCategory,
        customerType:       c.customerType       ||        firstType,
    };
};

const normaliseContact = (r, userTitles) => ({
    ...r,
    contactTitle: r.contactTitle || (userTitles.length ? userTitles[0].value : ''),
});

const normaliseAddress = (r, addressTypes, countries) => ({
    ...r,
    addressType: r.addressType || (addressTypes.length ? addressTypes[0].value : ''),
    countryId:   r.countryId != null && r.countryId !== ''
                    ? String(r.countryId)
                    : (countries.length ? String(countries[0].id) : ''),
});

const CustomerForm = ({ title, cust, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const { lookups, getVList, baseCurrencyCode } = useLookup();
    const { isReq: isReqCust }  = useFieldConfig('CUSTOMER');
    const { currencies, paymentTerms, customerCategories } = lookups;
    const customerTypes = getVList('Customer', 'CustomerType');
    const [form, setForm] = useState(() => normaliseCustomer(cust, currencies, paymentTerms, customerCategories, customerTypes));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (currencies.length && !form.currencyId) {
            setForm(f => normaliseCustomer(f, currencies, paymentTerms, customerCategories, customerTypes));
        }
    }, [currencies, paymentTerms, customerCategories, customerTypes]); // eslint-disable-line

    const handle = (e) => { const { name, value, type, checked } = e.target; setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value })); };

    const save = () => {
        if (!form.customerCode || !form.customerName) { alert('Customer Code and Name are required.'); return; }
        if (!form.currencyId)     { alert('Currency is required.');       return; }
        if (!form.paymentTermsId) { alert('Payment Terms are required.'); return; }
        if (!form.customerType)   { alert('Customer Type is required.');  return; }
        setSaving(true);
        const isNew = form.customerId === 0;
        const payload = { ...form, createdBy: isNew ? currentUser : form.createdBy, modifiedBy: isNew ? null : currentUser };
        fetch(variables.API_URL + 'customer/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
            .then(r => r.json()).then(() => { onSaved(); onClose(); }).catch(console.error).finally(() => setSaving(false));
    };

    return (
        <div className="cf-panel">
            <div className="cf-header"><span className="cf-title">{title}</span><button className="cf-close" onClick={onClose}>&#10005;</button></div>
            <div className="cf-body">
                <FormSection label="Identity" />
                <div className="cf-row">
                    <div className="cf-field" style={{ flex: '0 0 150px' }}><label>Customer Code {isReqCust('customerCode') && <span className="req">*</span>}</label><input name="customerCode" className="cf-input" value={form.customerCode || ''} onChange={handle} placeholder="CUST-0001" /></div>
                    <div className="cf-field cf-f2"><label>Customer Name {isReqCust('customerName') && <span className="req">*</span>}</label><input name="customerName" className="cf-input" value={form.customerName || ''} onChange={handle} placeholder="Full legal company name" /></div>
                    <div className="cf-field"><label>Short Name</label><input name="customerShortName" className="cf-input" value={form.customerShortName || ''} onChange={handle} placeholder="Display / short name" /></div>
                    <div className="cf-field" style={{ flex: '0 0 130px' }}><label>Reference</label><input name="customerRef" className="cf-input" value={form.customerRef || ''} onChange={handle} placeholder="External ref" /></div>
                    <div className="cf-field cf-fcheck"><label>&nbsp;</label><label className="cf-check"><input type="checkbox" name="isActive" checked={!!form.isActive} onChange={handle} /><span>Active</span></label></div>
                </div>
                <FormSection label="Classification" />
                <div className="cf-row">
                    <div className="cf-field"><label>Category {isReqCust('customerCategoryId') && <span className="req">*</span>}</label><select name="customerCategoryId" className="cf-input" value={form.customerCategoryId} onChange={handle}>{customerCategories.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select></div>
                    <div className="cf-field"><label>Customer Type {isReqCust('customerType') && <span className="req">*</span>}</label><select name="customerType" className="cf-input" value={form.customerType} onChange={handle}>{customerTypes.map(t => <option key={t.id} value={t.value}>{t.label}</option>)}</select></div>
                    <div className="cf-field"><label>Sales Person</label><input name="salesPerson" className="cf-input" value={form.salesPerson || ''} onChange={handle} placeholder="Assigned sales person" /></div>
                </div>
                <FormSection label="Contact" />
                <div className="cf-row">
                    <div className="cf-field"><label>Email</label><input name="email" type="email" className="cf-input" value={form.email || ''} onChange={handle} placeholder="info@company.com" /></div>
                    <div className="cf-field"><label>Mobile</label><input name="mobile" className="cf-input" value={form.mobile || ''} onChange={handle} placeholder="+971 50 000 0000" /></div>
                    <div className="cf-field"><label>Phone</label><input name="phone" className="cf-input" value={form.phone || ''} onChange={handle} placeholder="+971 4 000 0000" /></div>
                    <div className="cf-field"><label>Website</label><input name="web" className="cf-input" value={form.web || ''} onChange={handle} placeholder="www.company.com" /></div>
                </div>
                <FormSection label="Financial" />
                <div className="cf-row">
                    <div className="cf-field"><label>Currency {isReqCust('currencyId') && <span className="req">*</span>}</label><select name="currencyId" className="cf-input" value={form.currencyId} onChange={handle}>{currencies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select></div>
                    <div className="cf-field"><label>Payment Terms {isReqCust('paymentTermsId') && <span className="req">*</span>}</label><select name="paymentTermsId" className="cf-input" value={form.paymentTermsId} onChange={handle}>{paymentTerms.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select></div>
                    <div className="cf-field" style={{ flex: '0 0 140px' }}><label>Credit Limit{baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}</label><input name="creditLimit" type="number" className="cf-input" value={form.creditLimit || ''} onChange={handle} placeholder="0.00" /></div>
                    <div className="cf-field" style={{ flex: '0 0 110px' }}><label>Credit Days</label><input name="creditDays" type="number" className="cf-input" value={form.creditDays || ''} onChange={handle} placeholder="0" /></div>
                </div>
                <FormSection label="Tax & Other" />
                <div className="cf-row">
                    <div className="cf-field"><label>VAT Number</label><input name="vatNumber" className="cf-input" value={form.vatNumber || ''} onChange={handle} placeholder="VAT / TRN number" /></div>
                    <div className="cf-field"><label>Tax Number</label><input name="taxNumber" className="cf-input" value={form.taxNumber || ''} onChange={handle} placeholder="Tax registration no." /></div>
                    <div className="cf-field cf-f2"><label>Remarks</label><input name="remarks" className="cf-input" value={form.remarks || ''} onChange={handle} placeholder="Internal notes" /></div>
                </div>
            </div>
            <div className="cf-footer">
                <button className="btn-sec" onClick={onClose}>Cancel</button>
                <button className="btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : (form.customerId === 0 ? 'Save Customer' : 'Update Customer')}</button>
            </div>
        </div>
    );
};

const ContactForm = ({ customerId, record, onSaved, onCancel }) => {
    const currentUser = useCurrentUser();
    const { getVList } = useLookup();
    const userTitles = getVList('General', 'UserTitle');
    const isEdit = record.customerContactId > 0;
    const [form, setForm] = useState(() => normaliseContact(record, userTitles));
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (userTitles.length && !form.contactTitle) setForm(f => normaliseContact(f, userTitles)); }, [userTitles]); // eslint-disable-line
    const handle = (e) => { const { name, value, type, checked } = e.target; setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value })); };
    const save = () => {
        if (!form.contactName.trim()) { alert('Contact Name is required.'); return; }
        setSaving(true);
        const payload = { ...form, customerId, createdBy: isEdit ? form.createdBy : currentUser, modifiedBy: isEdit ? currentUser : null };
        fetch(variables.API_URL + 'customer/contacts/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
            .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.message); }); return r.json(); })
            .then(() => onSaved()).catch(e => alert(e.message || 'Failed to save contact.')).finally(() => setSaving(false));
    };
    return (
        <div className={`sub-form-card ${isEdit ? 'sub-form-edit' : 'sub-form-blue'}`}>
            <div className="sub-form-card-title" style={{ color: isEdit ? '#854d0e' : '#2e5fa3' }}>{isEdit ? '✎ Edit Contact' : '+ New Contact Person'}</div>
            <div className="cf-row">
                <div className="cf-field" style={{ flex: '0 0 110px' }}><label>Title {isReqCon('contactTitle') && <span className="req">*</span>}</label><select name="contactTitle" className="cf-input" value={form.contactTitle} onChange={handle}>{userTitles.map(t => <option key={t.id} value={t.value}>{t.label}</option>)}</select></div>
                <div className="cf-field cf-f2"><label>Full Name {isReqCon('contactName') && <span className="req">*</span>}</label><input name="contactName" className="cf-input" value={form.contactName} onChange={handle} placeholder="e.g. Ahmed Al Rashid" /></div>
                <div className="cf-field"><label>Designation</label><input name="designation" className="cf-input" value={form.designation} onChange={handle} placeholder="Manager / Engineer" /></div>
            </div>
            <div className="cf-row">
                <div className="cf-field"><label>Phone</label><input name="phone" className="cf-input" value={form.phone} onChange={handle} /></div>
                <div className="cf-field"><label>Mobile</label><input name="mobile" className="cf-input" value={form.mobile} onChange={handle} /></div>
                <div className="cf-field cf-f2"><label>Email</label><input name="email" type="email" className="cf-input" value={form.email} onChange={handle} /></div>
                <div className="cf-field cf-fcheck"><label>&nbsp;</label><label className="cf-check"><input type="checkbox" name="isPrimary" checked={!!form.isPrimary} onChange={handle} /><span>Primary</span></label></div>
            </div>
            <div className="sub-form-actions">
                <button className="btn-sec" onClick={onCancel}>Cancel</button>
                <button className={isEdit ? 'btn-amber' : 'btn-pri'} onClick={save} disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Update Contact' : 'Save Contact')}</button>
            </div>
        </div>
    );
};

const AddressForm = ({ customerId, record, onSaved, onCancel }) => {
    const currentUser = useCurrentUser();
    const { lookups, getVList } = useLookup();
    const { countries } = lookups;
    const addressTypes = getVList('Customer', 'AddressType');
    const isEdit = record.customerAddressId > 0;
    const [form, setForm] = useState(() => normaliseAddress(record, addressTypes, countries));
    const [saving, setSaving] = useState(false);
    useEffect(() => { if (addressTypes.length && !form.addressType) setForm(f => normaliseAddress(f, addressTypes, countries)); }, [addressTypes, countries]); // eslint-disable-line
    const handle = (e) => { const { name, value, type, checked } = e.target; setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value })); };
    const save = () => {
        if (!form.addressLine1.trim()) { alert('Address Line 1 is required.'); return; }
        if (!form.addressType)         { alert('Address Type is required.');   return; }
        if (!form.countryId)           { alert('Country is required.');        return; }
        setSaving(true);
        const payload = { ...form, customerId, createdBy: isEdit ? form.createdBy : currentUser, modifiedBy: isEdit ? currentUser : null };
        fetch(variables.API_URL + 'customer/address/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
            .then(r => r.json()).then(() => onSaved()).catch(console.error).finally(() => setSaving(false));
    };
    return (
        <div className={`sub-form-card ${isEdit ? 'sub-form-edit' : 'sub-form-teal'}`}>
            <div className="sub-form-card-title" style={{ color: isEdit ? '#854d0e' : '#0f766e' }}>{isEdit ? '✎ Edit Address' : '+ New Address'}</div>
            <div className="cf-row">
                <div className="cf-field" style={{ flex: '0 0 150px' }}><label>Type {isReqAddr('addressType') && <span className="req">*</span>}</label><select name="addressType" className="cf-input" value={form.addressType} onChange={handle}>{addressTypes.map(t => <option key={t.id} value={t.value}>{t.label}</option>)}</select></div>
                <div className="cf-field cf-f2"><label>Address Line 1 {isReqAddr('addressLine1') && <span className="req">*</span>}</label><input name="addressLine1" className="cf-input" value={form.addressLine1} onChange={handle} /></div>
                <div className="cf-field"><label>Address Line 2</label><input name="addressLine2" className="cf-input" value={form.addressLine2} onChange={handle} /></div>
            </div>
            <div className="cf-row">
                <div className="cf-field"><label>City</label><input name="city" className="cf-input" value={form.city} onChange={handle} /></div>
                <div className="cf-field"><label>State / Emirate</label><input name="state" className="cf-input" value={form.state} onChange={handle} /></div>
                <div className="cf-field"><label>Country {isReqAddr('countryId') && <span className="req">*</span>}</label><select name="countryId" className="cf-input" value={form.countryId} onChange={handle}>{countries.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select></div>
                <div className="cf-field" style={{ flex: '0 0 110px' }}><label>Postal Code</label><input name="postalCode" className="cf-input" value={form.postalCode} onChange={handle} /></div>
                <div className="cf-field" style={{ flex: '0 0 100px' }}><label>PO Box</label><input name="pOBox" className="cf-input" value={form.pOBox} onChange={handle} /></div>
                <div className="cf-field cf-fcheck"><label>&nbsp;</label><label className="cf-check"><input type="checkbox" name="isDefault" checked={!!form.isDefault} onChange={handle} /><span>Default</span></label></div>
            </div>
            <div className="sub-form-actions">
                <button className="btn-sec" onClick={onCancel}>Cancel</button>
                <button className={isEdit ? 'btn-amber' : 'btn-teal'} onClick={save} disabled={saving}>{saving ? 'Saving…' : (isEdit ? 'Update Address' : 'Save Address')}</button>
            </div>
        </div>
    );
};

const SubDrawer = ({ customer, startTab, onClose }) => {
    const { lookups, getVList } = useLookup();
    const { countries } = lookups;
    const userTitles   = getVList('General',  'UserTitle');
    const addressTypes = getVList('Customer', 'AddressType');
    const [tab, setTab] = useState(startTab || 'contacts');
    const [contacts, setContacts] = useState([]);
    const [addresses, setAddresses] = useState([]);
    const [cFormRecord, setCFormRecord] = useState(null);
    const [aFormRecord, setAFormRecord] = useState(null);
    const [cSearch, setCSearch] = useState('');
    const [aSearch, setASearch] = useState('');

    const loadContacts  = useCallback(() => fetch(variables.API_URL + 'customer/contacts/'  + customer.customerId, { headers: authHeaders() }).then(r => r.json()).then(d => setContacts(Array.isArray(d) ? d : [])).catch(console.error), [customer.customerId]);
    const loadAddresses = useCallback(() => fetch(variables.API_URL + 'customer/addresses/' + customer.customerId, { headers: authHeaders() }).then(r => r.json()).then(d => setAddresses(Array.isArray(d) ? d : [])).catch(console.error), [customer.customerId]);
    useEffect(() => { loadContacts(); loadAddresses(); }, [loadContacts, loadAddresses]);
    useEffect(() => { setTab(startTab || 'contacts'); }, [startTab]);

    const filteredC = contacts.filter(c => !cSearch || (c.contactName || '').toLowerCase().includes(cSearch.toLowerCase()));
    const filteredA = addresses.filter(a => !aSearch || (a.addressLine1 || '').toLowerCase().includes(aSearch.toLowerCase()));

    return (
        <div className="drawer">
            <div className="drawer-ctx">
                <div className="drawer-ctx-left">
                    <div className="drawer-avatar" style={{ background: avatarColor(customer.customerName).bg, color: avatarColor(customer.customerName).color }}>{initials(customer.customerName)}</div>
                    <div><div className="drawer-cust-name">{customer.customerName}</div><div className="drawer-cust-meta">{customer.customerCode} &middot; {customer.isActive ? 'Active' : 'Inactive'}</div></div>
                </div>
                <div className="drawer-ctx-right">
                    <div className="drawer-stat"><span className="drawer-stat-n">{contacts.length}</span><span className="drawer-stat-l">Contacts</span></div>
                    <div className="drawer-stat"><span className="drawer-stat-n">{addresses.length}</span><span className="drawer-stat-l">Addresses</span></div>
                    <button className="cf-close" onClick={onClose}>&#10005;</button>
                </div>
            </div>
            <div className="drawer-tabs">
                <button className={`drawer-tab ${tab === 'contacts' ? 'active' : ''}`} onClick={() => { setTab('contacts'); setCFormRecord(null); }}>Contact Persons <span className="tab-badge">{contacts.length}</span></button>
                <button className={`drawer-tab tab-teal ${tab === 'addresses' ? 'active-teal' : ''}`} onClick={() => { setTab('addresses'); setAFormRecord(null); }}>Addresses <span className="tab-badge">{addresses.length}</span></button>
            </div>
            {tab === 'contacts' && (
                <div className="drawer-body">
                    <div className="sub-bar">
                        <div className="sub-bar-left"><input className="sub-search" type="text" placeholder="Search contacts…" value={cSearch} onChange={e => setCSearch(e.target.value)} /><span className="sub-count">{filteredC.length} record{filteredC.length !== 1 ? 's' : ''}</span></div>
                        {!cFormRecord && <button className="btn-pri btn-sm" onClick={() => setCFormRecord(makeEmptyContact(customer.customerId, userTitles))}>+ Add Contact</button>}
                    </div>
                    {cFormRecord && <ContactForm customerId={customer.customerId} record={cFormRecord} onSaved={() => { loadContacts(); setCFormRecord(null); }} onCancel={() => setCFormRecord(null)} />}
                    <div className="sub-grid-wrap">
                        <table className="sub-table">
                            <thead><tr><th style={{ width: '30%' }}>Name &amp; Designation</th><th>Phone</th><th>Mobile</th><th>Email</th><th>Primary</th><th>Actions</th></tr></thead>
                            <tbody>
                                {filteredC.length === 0 ? <tr><td colSpan="6" className="sub-empty">No contacts yet.</td></tr>
                                    : filteredC.map(c => { const av = avatarColor(c.contactName || ''); return (
                                        <tr key={c.customerContactId} className={cFormRecord?.customerContactId === c.customerContactId ? 'row-editing' : ''}>
                                            <td><div className="contact-cell"><div className="contact-av" style={{ background: av.bg, color: av.color }}>{initials(c.contactName)}</div><div><div className="contact-name">{c.contactTitle ? c.contactTitle + ' ' : ''}{c.contactName}</div><div className="contact-desig">{c.designation}</div></div></div></td>
                                            <td>{c.phone || '—'}</td><td>{c.mobile || '—'}</td><td className="td-email">{c.email || '—'}</td>
                                            <td>{c.isPrimary ? <span className="pill pill-blue">Primary</span> : <span className="pill pill-gray">—</span>}</td>
                                            <td className="td-actions"><button className="act-btn act-edit" onClick={() => setCFormRecord(normaliseContact({ ...c }, userTitles))}>Edit</button></td>
                                        </tr>
                                    ); })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
            {tab === 'addresses' && (
                <div className="drawer-body">
                    <div className="sub-bar">
                        <div className="sub-bar-left"><input className="sub-search" type="text" placeholder="Search addresses…" value={aSearch} onChange={e => setASearch(e.target.value)} /><span className="sub-count">{filteredA.length} record{filteredA.length !== 1 ? 's' : ''}</span></div>
                        {!aFormRecord && <button className="btn-teal btn-sm" onClick={() => setAFormRecord(makeEmptyAddress(customer.customerId, addressTypes, countries))}>+ Add Address</button>}
                    </div>
                    {aFormRecord && <AddressForm customerId={customer.customerId} record={aFormRecord} onSaved={() => { loadAddresses(); setAFormRecord(null); }} onCancel={() => setAFormRecord(null)} />}
                    <div className="sub-grid-wrap sub-grid-teal">
                        <table className="sub-table">
                            <thead><tr><th>Type</th><th>Address Line 1</th><th>Line 2</th><th>City</th><th>State</th><th>Country</th><th>Postal</th><th>PO Box</th><th>Default</th><th>Actions</th></tr></thead>
                            <tbody>
                                {filteredA.length === 0 ? <tr><td colSpan="10" className="sub-empty">No addresses yet.</td></tr>
                                    : filteredA.map(a => (
                                        <tr key={a.customerAddressId} className={aFormRecord?.customerAddressId === a.customerAddressId ? 'row-editing' : ''}>
                                            <td><span className={`pill pill-type-${(a.addressType || 'other').toLowerCase().replace(/\s+/g, '-')}`}>{a.addressType}</span></td>
                                            <td>{a.addressLine1}</td><td>{a.addressLine2 || '—'}</td><td>{a.city}</td><td>{a.state || '—'}</td>
                                            <td>{a.countryName || (countries.find(c => String(c.id) === String(a.countryId))?.name) || '—'}</td>
                                            <td>{a.postalCode || '—'}</td><td>{a.pOBox || '—'}</td>
                                            <td>{a.isDefault ? <span className="pill pill-green">Yes</span> : <span className="pill pill-gray">—</span>}</td>
                                            <td className="td-actions">
                                                <button className="act-btn act-edit" onClick={() => setAFormRecord(normaliseAddress({ ...a }, addressTypes, countries))}>Edit</button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// MAIN CUSTOMER PAGE
// ─────────────────────────────────────────────────────────────
export const Customer = () => {
    const { lookups, getVList } = useLookup();
    const { currencies, paymentTerms, customerCategories } = lookups;
    // useMemo gives a stable reference — getVList uses `|| []` which would
    // otherwise create a new array on every render before data loads, causing
    // the updateFilterDefs effect below to loop infinitely.
    const customerTypes = useMemo(() => getVList('Customer', 'CustomerType'), [getVList]);
    const { registerFilters, unregisterFilters, updateFilterDefs } = useFilters();

    const [rows, setRows]             = useState([]);
    const [totalRows, setTotalRows]   = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage]             = useState(1);
    const [pageSize, setPageSize]     = useState(20);
    const [sortCol, setSortCol]       = useState('CustomerName');
    const [sortDir, setSortDir]       = useState('ASC');
    const [loading, setLoading]       = useState(false);
    const [applied, setApplied]       = useState({ ...DEFAULT_FILTERS });
    const [formView, setFormView]     = useState(null);
    const [selectedCust, setSelected] = useState(null);
    const [drawerCust, setDrawerCust] = useState(null);
    const [holdCust, setHoldCust]     = useState(null);

    // ── gridRef: always holds latest values so filter onApply
    // never suffers from stale closure over pageSize/sortCol/sortDir
    const gridRef = useRef({ pageSize: 20, sortCol: 'CustomerName', sortDir: 'ASC', applied: DEFAULT_FILTERS });
    useEffect(() => { gridRef.current = { pageSize, sortCol, sortDir, applied }; }, [pageSize, sortCol, sortDir, applied]);

    // ── Core fetch — receives all params explicitly, no closure deps ──
    const load = useCallback((pg, ps, sc, sd, af) => {
        setLoading(true);
        const q = new URLSearchParams({ page: pg, pageSize: ps, sortCol: sc, sortDir: sd });
        if (af.searchText)        q.set('searchText',    af.searchText);
        if (af.categoryId)        q.set('categoryId',    af.categoryId);
        if (af.customerType)      q.set('customerType',  af.customerType);
        if (af.currencyId)        q.set('currencyId',    af.currencyId);
        if (af.paymentTermsId)    q.set('paymentTermsId',af.paymentTermsId);
        if (af.isActive   !== '') q.set('isActive',      af.isActive);
        if (af.creditHold !== '') q.set('creditHold',    af.creditHold);
        if (af.creditFlag)        q.set('creditFlag',    af.creditFlag);
        fetch(`${variables.API_URL}customer/search?${q}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(res => { setRows(res.data || []); setTotalRows(res.totalRows || 0); setTotalPages(res.totalPages || 1); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    // ── Initial load — reads pageSize from state (not hardcoded) ──
    useEffect(() => {
        load(1, pageSize, sortCol, sortDir, DEFAULT_FILTERS);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]); // [load] is stable; runs exactly once on mount

    // ── Register left-panel filters (mount only — no lookup deps to avoid infinite loop) ──
    useEffect(() => {
        const buildDefs = (cats, types, currs, terms) => ({
            searchText:    { label: 'Search',        type: 'text',   placeholder: 'Name, code, mobile, VAT…' },
            isActive:      { label: 'Status',        type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
            creditFlag:    { label: 'Credit Flag',   type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'GREEN', label: '🟢 Good Standing' }, { value: 'YELLOW', label: '🟡 Warning' }, { value: 'RED', label: '🔴 Overdue' }, { value: 'BLACK', label: '⚫ Credit Hold' }] },
            creditHold:    { label: 'Hold Status',   type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'true', label: 'On Hold' }, { value: 'false', label: 'Not on Hold' }] },
            categoryId:    { label: 'Category',      type: 'select', placeholder: 'All Categories', options: cats.map(c => ({ value: String(c.id), label: c.name })) },
            customerType:  { label: 'Customer Type', type: 'select', placeholder: 'All Types',      options: types.map(t => ({ value: t.value, label: t.label })) },
            currencyId:    { label: 'Currency',      type: 'select', placeholder: 'All Currencies', options: currs.map(c => ({ value: String(c.id), label: c.name })) },
            paymentTermsId:{ label: 'Payment Terms', type: 'select', placeholder: 'All Terms',      options: terms.map(p => ({ value: String(p.id), label: p.name })) },
        });
        // ✅ onApply reads from gridRef — no stale closure
        const onApply = (vals) => {
            const { pageSize: ps, sortCol: sc, sortDir: sd } = gridRef.current;
            setApplied({ ...vals });
            setPage(1);
            load(1, ps, sc, sd, vals);
        };
        registerFilters('customer', buildDefs([], [], [], []), DEFAULT_FILTERS, onApply);
        return () => unregisterFilters('customer');
    }, []); // eslint-disable-line

    // ── Patch dropdown options once lookups are ready (never re-registers) ──
    useEffect(() => {
        updateFilterDefs('customer', {
            searchText:    { label: 'Search',        type: 'text',   placeholder: 'Name, code, mobile, VAT…' },
            isActive:      { label: 'Status',        type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] },
            creditFlag:    { label: 'Credit Flag',   type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'GREEN', label: '🟢 Good Standing' }, { value: 'YELLOW', label: '🟡 Warning' }, { value: 'RED', label: '🔴 Overdue' }, { value: 'BLACK', label: '⚫ Credit Hold' }] },
            creditHold:    { label: 'Hold Status',   type: 'radio',  options: [{ value: '', label: 'All' }, { value: 'true', label: 'On Hold' }, { value: 'false', label: 'Not on Hold' }] },
            categoryId:    { label: 'Category',      type: 'select', placeholder: 'All Categories', options: customerCategories.map(c => ({ value: String(c.id), label: c.name })) },
            customerType:  { label: 'Customer Type', type: 'select', placeholder: 'All Types',      options: customerTypes.map(t => ({ value: t.value, label: t.label })) },
            currencyId:    { label: 'Currency',      type: 'select', placeholder: 'All Currencies', options: currencies.map(c => ({ value: String(c.id), label: c.name })) },
            paymentTermsId:{ label: 'Payment Terms', type: 'select', placeholder: 'All Terms',      options: paymentTerms.map(p => ({ value: String(p.id), label: p.name })) },
        });
    }, [customerCategories, customerTypes, currencies, paymentTerms]); // eslint-disable-line

    const handleSort = (col) => {
        const dir = sortCol === col && sortDir === 'ASC' ? 'DESC' : 'ASC';
        setSortCol(col); setSortDir(dir); setPage(1);
        load(1, pageSize, col, dir, applied);
    };

    const goPage = (p) => {
        const pg = Math.max(1, Math.min(p, totalPages));
        setPage(pg);
        load(pg, pageSize, sortCol, sortDir, applied);
    };

    // ✅ changePageSize immediately fires load with the new ps value
    const changePageSize = (ps) => {
        setPageSize(ps);
        setPage(1);
        load(1, ps, sortCol, sortDir, applied);
    };

    const addClick   = () => { setSelected({ customerId: 0, customerCode: '', customerName: '', isActive: true }); setDrawerCust(null); setFormView('add'); };
    const editClick  = (c) => { setSelected(c); setDrawerCust(null); setFormView('edit'); };
    const openDrawer = (c, tab) => { setFormView(null); if (drawerCust?.customerId === c.customerId && drawerCust?.startTab === tab) setDrawerCust(null); else setDrawerCust({ ...c, startTab: tab }); };
    const onSaved = () => { setFormView(null); load(page, pageSize, sortCol, sortDir, applied); };

    const Th = ({ col, children, style }) => (
        <th className="th-sortable" style={style} onClick={() => handleSort(col)}>
            <span className="th-inner">{children} <SortIcon col={col} sortCol={sortCol} sortDir={sortDir} /></span>
        </th>
    );

    const pageNums = () => {
        const total = totalPages, cur = page, range = 5;
        let start = Math.max(1, cur - Math.floor(range / 2));
        let end   = Math.min(total, start + range - 1);
        if (end - start < range - 1) start = Math.max(1, end - range + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    };

    return (
        <div className="cust-page">
            {holdCust && <CreditHoldModal customer={holdCust} onClose={() => setHoldCust(null)} onSaved={() => { load(page, pageSize, sortCol, sortDir, applied); setHoldCust(null); }} />}
            {formView && <CustomerForm title={formView === 'add' ? 'Add Customer' : 'Edit Customer'} cust={selectedCust} onClose={() => setFormView(null)} onSaved={onSaved} />}

            <div className="cust-grid-wrap">
                <div className="cust-grid-header">
                    <div className="cust-title-row">
                        <h2 className="cust-page-title">Customer Management</h2>
                        <div className="cust-toolbar">
                            <span className="filter-info">{totalRows} record{totalRows !== 1 ? 's' : ''}</span>
                            <select className="filter-select" style={{ width: 110 }} value={pageSize} onChange={e => changePageSize(Number(e.target.value))}>
                                {PAGE_SIZES.map(n => <option key={n} value={n}>{n} / page</option>)}
                            </select>
                            <button className="btn-pri" onClick={addClick}>+ Add Customer</button>
                        </div>
                    </div>
                </div>

                <div className="cust-table-wrap">
                    {loading && (
                        <div className="grid-loading-overlay">
                            <div className="grid-spinner">
                                <div className="spinner-ring" />
                                <span className="spinner-text">Loading…</span>
                            </div>
                        </div>
                    )}
                    <table className={`cust-table${loading ? ' tbl-loading' : ''}`}>
                        <thead><tr>
                            <Th col="CustomerCode">Code</Th>
                            <Th col="CustomerName">Customer Name</Th>
                            <Th col="CustomerShortName">Short Name</Th>
                            <Th col="CustomerType">Type</Th>
                            <Th col="CustomerCategoryName">Category</Th>
                            <Th col="Mobile">Mobile</Th>
                            <Th col="Email">Email</Th>
                            <Th col="CreditLimit" style={{ textAlign: 'right' }}>Credit Limit</Th>
                            <Th col="SalesPerson">Sales Person</Th>
                            <Th col="StatusLabel">Status</Th>
                            <Th col="CreditFlag">Credit Flag</Th>
                            <th>Actions</th>
                        </tr></thead>
                        <tbody>
                            {rows.length === 0 && !loading
                                ? <tr><td colSpan="12" className="sub-empty">No customers found. Use the filters on the left to search.</td></tr>
                                : rows.map(cust => {
                                    const drawerOpen = drawerCust?.customerId === cust.customerId;
                                    const activeTab  = drawerCust?.startTab;
                                    const flag       = cust.creditFlag || 'GREEN';
                                    return (
                                        <React.Fragment key={cust.customerId}>
                                            <tr className={`${drawerOpen ? 'row-selected' : ''} ${flag === 'BLACK' ? 'row-on-hold' : ''}`}>
                                                <td className="td-code">{cust.customerCode}</td>
                                                <td className="td-name">{cust.customerName}{cust.creditHold && <span className="hold-tag" title={cust.creditHoldNote}>⚑</span>}</td>
                                                <td>{cust.customerShortName || '—'}</td>
                                                <td>{cust.customerType      || '—'}</td>
                                                <td>{cust.customerCategoryName || '—'}</td>
                                                <td>{cust.mobile || '—'}</td>
                                                <td className="td-email">{cust.email || '—'}</td>
                                                <td className="td-num">{cust.creditLimit != null ? fmt(cust.creditLimit) : '—'}</td>
                                                <td>{cust.salesPerson || '—'}</td>
                                                <td><span className={`pill ${cust.isActive ? 'pill-green' : 'pill-red'}`}>{cust.statusLabel || (cust.isActive ? 'Active' : 'Inactive')}</span></td>
                                                <td><CreditFlagBadge flag={flag} label={cust.creditFlagLabel} /></td>
                                                <td className="td-actions">
                                                    <button className="act-btn act-edit" onClick={() => editClick(cust)}>Edit</button>
                                                    <span className="act-btn-group">
                                                        <button className={`act-grp-l ${drawerOpen && activeTab === 'contacts' ? 'act-grp-active-blue' : ''}`} onClick={() => openDrawer(cust, 'contacts')} title="Contacts">
                                                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6" strokeLinecap="round"/></svg>Contacts
                                                        </button>
                                                        <button className={`act-grp-r ${drawerOpen && activeTab === 'addresses' ? 'act-grp-active-teal' : ''}`} onClick={() => openDrawer(cust, 'addresses')} title="Addresses">
                                                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8 1a5 5 0 0 1 5 5c0 3.5-5 9-5 9S3 9.5 3 6a5 5 0 0 1 5-5z"/><circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none"/></svg>Addresses
                                                        </button>
                                                    </span>
                                                    <button className={`act-btn ${cust.creditHold ? 'act-release' : 'act-hold'}`} onClick={() => setHoldCust(cust)}>{cust.creditHold ? '🔓' : '🔒'}</button>
                                                </td>
                                            </tr>
                                            {drawerOpen && <tr className="drawer-row"><td colSpan="12" style={{ padding: 0 }}><SubDrawer customer={cust} startTab={activeTab} onClose={() => setDrawerCust(null)} /></td></tr>}
                                        </React.Fragment>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>

                <div className="pagination-bar">
                    <div className="page-info">Page <strong>{page}</strong> of <strong>{totalPages}</strong> &nbsp;·&nbsp;{totalRows} total record{totalRows !== 1 ? 's' : ''}</div>
                    <div className="page-controls">
                        <button className="page-btn" onClick={() => goPage(1)}        disabled={page === 1}>«</button>
                        <button className="page-btn" onClick={() => goPage(page - 1)} disabled={page === 1}>‹</button>
                        {pageNums().map(n => <button key={n} className={`page-btn ${n === page ? 'page-btn-active' : ''}`} onClick={() => goPage(n)}>{n}</button>)}
                        <button className="page-btn" onClick={() => goPage(page + 1)} disabled={page >= totalPages}>›</button>
                        <button className="page-btn" onClick={() => goPage(totalPages)} disabled={page >= totalPages}>»</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Customer;
