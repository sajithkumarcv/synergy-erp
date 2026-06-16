import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { initials, avatarColor } from '../customerConstants';
import { useFieldConfig } from '../../FieldConfigContext';
import AlertModal from '../../common/AlertModal';

const makeEmpty = (customerId, userTitles) => ({
    customerContactId: 0, customerId,
    contactTitle: userTitles.length ? userTitles[0].value : '',
    contactName: '', designation: '', phone: '', mobile: '', email: '',
    isPrimary: false, isActive: true,
});

const normalise = (r, userTitles) => ({
    ...r,
    contactTitle: r.contactTitle || (userTitles.length ? userTitles[0].value : ''),
});

// ─── Inline contact form ─────────────────────────────────────────
const ContactForm = ({ customerId, record, onSaved, onCancel }) => {
    const currentUser = useCurrentUser();
    const { getVList } = useLookup();
    const { isReq } = useFieldConfig('CUSTOMER_CONTACT');
    const userTitles = getVList('General', 'UserTitle');
    const isEdit = record.customerContactId > 0;
    const [form, setForm]     = useState(() => normalise(record, userTitles));
    const [saving, setSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState(null);

    useEffect(() => {
        if (userTitles.length && !form.contactTitle)
            setForm(f => normalise(f, userTitles));
    }, [userTitles]); // eslint-disable-line

    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };
    const save = () => {
        if (!form.contactName.trim()) { setAlertMsg('Contact Name is required.'); return; }
        setSaving(true);
        const payload = { ...form, customerId, createdBy: isEdit ? form.createdBy : currentUser, modifiedBy: isEdit ? currentUser : null };
        fetch(variables.API_URL + 'customer/contacts/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) })
            .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.message); }); return r.json(); })
            .then(() => onSaved())
            .catch(e => setAlertMsg(e.message || 'Failed to save.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className={`tab-inline-form ${isEdit ? 'tab-form-edit' : 'tab-form-new'}`}>
            <div className="tab-form-title">{isEdit ? '✎ Edit Contact' : '+ New Contact'}</div>
            <div className="tab-form-row">
                <div className="tab-form-field" style={{ flex: '0 0 110px' }}>
                    <label>Title</label>
                    <select name="contactTitle" className="tab-input" value={form.contactTitle} onChange={handle}>
                        {userTitles.map(t => <option key={t.id} value={t.value}>{t.label}</option>)}
                    </select>
                </div>
                <div className="tab-form-field tab-f2">
                    <label>Full Name {isReq('contactName') && <span className="req">*</span>}</label>
                    <input name="contactName" className="tab-input" value={form.contactName} onChange={handle} placeholder="e.g. Ahmed Al Rashid" />
                </div>
                <div className="tab-form-field">
                    <label>Designation</label>
                    <input name="designation" className="tab-input" value={form.designation} onChange={handle} placeholder="Manager / Engineer" />
                </div>
            </div>
            <div className="tab-form-row">
                <div className="tab-form-field"><label>Phone</label><input name="phone" className="tab-input" value={form.phone} onChange={handle} /></div>
                <div className="tab-form-field"><label>Mobile</label><input name="mobile" className="tab-input" value={form.mobile} onChange={handle} /></div>
                <div className="tab-form-field tab-f2"><label>Email</label><input name="email" type="email" className="tab-input" value={form.email} onChange={handle} /></div>
                <div className="tab-form-field tab-fcheck">
                    <label>&nbsp;</label>
                    <label className="tab-check"><input type="checkbox" name="isPrimary" checked={!!form.isPrimary} onChange={handle} /><span>Primary</span></label>
                </div>
            </div>
            <div className="tab-form-actions">
                <button className="tab-btn-sec" onClick={onCancel}>Cancel</button>
                <button className={isEdit ? 'tab-btn-amber' : 'tab-btn-pri'} onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : (isEdit ? 'Update Contact' : 'Save Contact')}
                </button>
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

// ─── CONTACTS TAB ────────────────────────────────────────────────
const ContactsTab = ({ customer, onRefresh, canEdit = true }) => {
    const { getVList } = useLookup();
    const userTitles = getVList('General', 'UserTitle');

    const [contacts, setContacts] = useState([]);
    const [formRecord, setForm]   = useState(null);
    const [search, setSearch]     = useState('');

    const load = useCallback(() => {
        fetch(variables.API_URL + 'customer/contacts/' + customer.customerId, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setContacts(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, [customer.customerId]);

    useEffect(() => { load(); }, [load]);

    const filtered = contacts.filter(c => !search || (c.contactName || '').toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="tab-section">
            <div className="tab-toolbar">
                <div className="tab-toolbar-left">
                    <span className="tab-section-title">Contact Persons</span>
                    <span className="tab-count-badge">{contacts.length}</span>
                    <input
                        type="text" placeholder="Search…" value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ padding: '4px 9px', border: '1px solid #d4dce9', borderRadius: 5, fontSize: 12, outline: 'none', width: 160 }}
                    />
                </div>
                {!formRecord && canEdit && (
                    <button className="tab-btn-pri" onClick={() => setForm(makeEmpty(customer.customerId, userTitles))}>
                        + Add Contact
                    </button>
                )}
            </div>

            {formRecord && (
                <ContactForm
                    customerId={customer.customerId}
                    record={formRecord}
                    onSaved={() => { load(); setForm(null); }}
                    onCancel={() => setForm(null)}
                />
            )}

            <div className="tab-table-wrap">
                <table className="tab-table">
                    <thead>
                        <tr>
                            <th style={{ width: '28%' }}>Name &amp; Designation</th>
                            <th>Phone</th><th>Mobile</th><th>Email</th>
                            <th>Primary</th><th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0
                            ? <tr><td colSpan="6" className="tab-empty">No contacts yet. Click Add Contact to get started.</td></tr>
                            : filtered.map(c => {
                                const av = avatarColor(c.contactName || '');
                                return (
                                    <tr key={c.customerContactId} className={formRecord?.customerContactId === c.customerContactId ? 'tab-row-editing' : ''}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                                                <div style={{ width: 30, height: 30, borderRadius: '50%', background: av.bg, color: av.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                                                    {initials(c.contactName)}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 500, color: '#1e3a5f', fontSize: 12.5 }}>{c.contactTitle ? c.contactTitle + ' ' : ''}{c.contactName}</div>
                                                    <div style={{ fontSize: 11, color: '#64748b' }}>{c.designation}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{c.phone  || '—'}</td>
                                        <td>{c.mobile || '—'}</td>
                                        <td>{c.email  || '—'}</td>
                                        <td>
                                            {c.isPrimary
                                                ? <span className="tab-badge-green">Primary</span>
                                                : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                                        </td>
                                        <td className="tab-actions-cell">
                                            {canEdit && <button className="tab-act-btn tab-act-edit" onClick={() => setForm(normalise({ ...c }, userTitles))}>Edit</button>}
                                        </td>
                                    </tr>
                                );
                            })
                        }
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default ContactsTab;
