import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import AlertModal from '../../common/AlertModal';
import ConfirmModal from '../../common/ConfirmModal';

const makeEmpty = (supplierId, addressTypes, countries) => ({
    supplierAddressId: 0, supplierId,
    addressType:  addressTypes.length ? addressTypes[0].value : '',
    addressLine1: '', addressLine2: '', city: '', state: '',
    countryId:    countries.length ? String(countries[0].id) : '',
    postalCode: '', pOBox: '', isDefault: false, isActive: true,
});

const normalise = (r, addressTypes, countries) => ({
    ...r,
    addressType: r.addressType || (addressTypes.length ? addressTypes[0].value : ''),
    countryId:   r.countryId != null && r.countryId !== ''
                    ? String(r.countryId)
                    : (countries.length ? String(countries[0].id) : ''),
});

// ─── Inline address form ─────────────────────────────────────────
const AddressForm = ({ supplierId, record, onSaved, onCancel }) => {
    const currentUser = useCurrentUser();
    const { lookups, getVList } = useLookup();
    const { countries } = lookups;
    const addressTypes = getVList('Customer', 'AddressType');
    const isEdit = record.supplierAddressId > 0;
    const [form, setForm]     = useState(() => normalise(record, addressTypes, countries));
    const [saving, setSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState(null);

    useEffect(() => {
        if (addressTypes.length && !form.addressType)
            setForm(f => normalise(f, addressTypes, countries));
    }, [addressTypes, countries]); // eslint-disable-line

    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };
    const save = async () => {
        if (!form.addressLine1.trim()) { setAlertMsg('Address Line 1 is required.'); return; }
        if (!form.addressType)         { setAlertMsg('Address Type is required.');   return; }
        if (!form.countryId)           { setAlertMsg('Country is required.');        return; }
        setSaving(true);
        try {
            const payload = { ...form, supplierId, createdBy: isEdit ? form.createdBy : currentUser, modifiedBy: isEdit ? currentUser : null };
            const res = await fetch(variables.API_URL + 'supplier/address/save', { method: 'POST', headers: authHeaders(), body: JSON.stringify(payload) });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d?.message || 'Failed to save address.'); return; }
            onSaved();
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setSaving(false); }
    };

    return (
        <div className={`tab-inline-form ${isEdit ? 'tab-form-edit' : 'tab-form-new'}`}>
            <div className="tab-form-title" style={{ color: isEdit ? '#b45309' : '#2e5fa3' }}>
                {isEdit ? '✎ Edit Address' : '+ New Address'}
            </div>
            <div className="tab-form-row">
                <div className="tab-form-field" style={{ flex: '0 0 150px' }}>
                    <label>Type <span className="req">*</span></label>
                    <select name="addressType" className="tab-input" value={form.addressType} onChange={handle}>
                        {addressTypes.map(t => <option key={t.id} value={t.value}>{t.label}</option>)}
                    </select>
                </div>
                <div className="tab-form-field tab-f2"><label>Address Line 1 <span className="req">*</span></label><input name="addressLine1" className="tab-input" value={form.addressLine1} onChange={handle} /></div>
                <div className="tab-form-field"><label>Address Line 2</label><input name="addressLine2" className="tab-input" value={form.addressLine2} onChange={handle} /></div>
            </div>
            <div className="tab-form-row">
                <div className="tab-form-field"><label>City</label><input name="city" className="tab-input" value={form.city} onChange={handle} /></div>
                <div className="tab-form-field"><label>State / Emirate</label><input name="state" className="tab-input" value={form.state} onChange={handle} /></div>
                <div className="tab-form-field">
                    <label>Country <span className="req">*</span></label>
                    <select name="countryId" className="tab-input" value={form.countryId} onChange={handle}>
                        {countries.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                    </select>
                </div>
                <div className="tab-form-field" style={{ flex: '0 0 110px' }}><label>Postal Code</label><input name="postalCode" className="tab-input" value={form.postalCode} onChange={handle} /></div>
                <div className="tab-form-field" style={{ flex: '0 0 100px' }}><label>PO Box</label><input name="pOBox" className="tab-input" value={form.pOBox} onChange={handle} /></div>
                <div className="tab-form-field tab-fcheck">
                    <label>&nbsp;</label>
                    <label className="tab-check"><input type="checkbox" name="isDefault" checked={!!form.isDefault} onChange={handle} /><span>Default</span></label>
                </div>
            </div>
            <div className="tab-form-actions">
                <button className="tab-btn-sec" onClick={onCancel}>Cancel</button>
                <button className={isEdit ? 'tab-btn-amber' : 'tab-btn-pri'} style={!isEdit ? { background: '#0f766e' } : {}} onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : (isEdit ? 'Update Address' : 'Save Address')}
                </button>
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

// ─── ADDRESSES TAB ───────────────────────────────────────────────
const AddressesTab = ({ supplier, onRefresh, canEdit = true }) => {
    const { lookups, getVList } = useLookup();
    const { countries } = lookups;
    const addressTypes = getVList('Customer', 'AddressType');

    const [addresses, setAddresses] = useState([]);
    const [formRecord, setForm]     = useState(null);
    const [search, setSearch]       = useState('');
    const [alertMsg, setAlertMsg]   = useState(null);
    const [confirm, setConfirm]     = useState(null);

    const load = useCallback(() => {
        fetch(variables.API_URL + 'supplier/addresses/' + supplier.supplierId, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setAddresses(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, [supplier.supplierId]);

    useEffect(() => { load(); }, [load]);

    const deleteAddress = (id) => {
        setConfirm({
            title: 'Delete Address',
            message: 'Delete this address?',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                try {
                    const res = await fetch(variables.API_URL + 'supplier/address/' + id, { method: 'DELETE', headers: authHeaders() });
                    if (!res.ok) { const d = await res.json(); setAlertMsg(d?.message || 'Failed to delete address.'); return; }
                    load();
                } catch { setAlertMsg('Network error. Please try again.'); }
            },
        });
    };

    const filtered = addresses.filter(a => !search || (a.addressLine1 || '').toLowerCase().includes(search.toLowerCase()));

    const typePill = (type) => {
        const map = {
            billing: { bg: '#dbeafe', color: '#1e40af' },
            shipping: { bg: '#fef3c7', color: '#92400e' },
            office: { bg: '#ede9fe', color: '#5b21b6' },
            warehouse: { bg: '#fce7f3', color: '#9d174d' },
            'head office': { bg: '#dcfce7', color: '#166534' },
            branch: { bg: '#fff7ed', color: '#9a3412' },
        };
        const s = map[(type || '').toLowerCase()] || { bg: '#f1f5f9', color: '#475569' };
        return <span style={{ display: 'inline-block', padding: '2px 9px', borderRadius: 8, background: s.bg, color: s.color, fontSize: 10.5, fontWeight: 600 }}>{type}</span>;
    };

    return (
        <div className="tab-section">
            <div className="tab-toolbar">
                <div className="tab-toolbar-left">
                    <span className="tab-section-title">Addresses</span>
                    <span className="tab-count-badge">{addresses.length}</span>
                    <input
                        type="text" placeholder="Search…" value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ padding: '4px 9px', border: '1px solid #d4dce9', borderRadius: 5, fontSize: 12, outline: 'none', width: 160 }}
                    />
                </div>
                {!formRecord && canEdit && (
                    <button className="tab-btn-pri" style={{ background: '#0f766e' }} onClick={() => setForm(makeEmpty(supplier.supplierId, addressTypes, countries))}>
                        + Add Address
                    </button>
                )}
            </div>

            {formRecord && (
                <AddressForm
                    supplierId={supplier.supplierId}
                    record={formRecord}
                    onSaved={() => { load(); setForm(null); }}
                    onCancel={() => setForm(null)}
                />
            )}

            <div className="tab-table-wrap">
                <table className="tab-table">
                    <thead>
                        <tr>
                            <th>Type</th><th>Address Line 1</th><th>Line 2</th>
                            <th>City</th><th>State</th><th>Country</th>
                            <th>Postal</th><th>PO Box</th><th>Default</th><th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.length === 0
                            ? <tr><td colSpan="10" className="tab-empty">No addresses yet. Click Add Address to get started.</td></tr>
                            : filtered.map(a => (
                                <tr key={a.supplierAddressId} className={formRecord?.supplierAddressId === a.supplierAddressId ? 'tab-row-editing' : ''}>
                                    <td>{typePill(a.addressType)}</td>
                                    <td>{a.addressLine1}</td>
                                    <td>{a.addressLine2 || '—'}</td>
                                    <td>{a.city || '—'}</td>
                                    <td>{a.state || '—'}</td>
                                    <td>{a.countryName || (countries.find(c => String(c.id) === String(a.countryId))?.name) || '—'}</td>
                                    <td>{a.postalCode || '—'}</td>
                                    <td>{a.pOBox || '—'}</td>
                                    <td>
                                        {a.isDefault
                                            ? <span className="tab-badge-green">Yes</span>
                                            : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                                    </td>
                                    <td className="tab-actions-cell">
                                        {canEdit && <button className="tab-act-btn tab-act-edit" onClick={() => setForm(normalise({ ...a }, addressTypes, countries))}>Edit</button>}
                                        {canEdit && <button className="tab-act-btn tab-act-del" onClick={() => deleteAddress(a.supplierAddressId)}>Delete</button>}
                                    </td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            {confirm  && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
        </div>
    );
};

export default AddressesTab;
