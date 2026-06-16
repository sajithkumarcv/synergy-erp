import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import AlertModal from '../../common/AlertModal';

const makeEmpty = (supplierId, currencies) => ({
    supplierBankId: 0, supplierId,
    bankName: '', accountName: '', accountNumber: '',
    iban: '', swiftCode: '', branchName: '',
    currencyId: currencies.length ? String(currencies[0].id) : '',
    isDefault: false, isActive: true,
});

const normalise = (r, currencies) => ({
    ...r,
    currencyId: r.currencyId != null ? String(r.currencyId) : (currencies.length ? String(currencies[0].id) : ''),
});

// ─── Inline bank form ────────────────────────────────────────────
const BankForm = ({ supplierId, record, onSaved, onCancel }) => {
    const currentUser = useCurrentUser();
    const { lookups } = useLookup();
    const { currencies } = lookups;
    const isEdit = record.supplierBankId > 0;
    const [form, setForm]     = useState(() => normalise(record, currencies));
    const [saving, setSaving] = useState(false);
    const [alertMsg, setAlertMsg] = useState(null);

    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };

    const save = () => {
        if (!form.bankName.trim())     { setAlertMsg('Bank Name is required.');     return; }
        if (!form.accountNumber.trim()){ setAlertMsg('Account Number is required.'); return; }
        setSaving(true);
        const payload = {
            ...form,
            supplierId,
            currencyId: form.currencyId ? parseInt(form.currencyId) : null,
            createdBy:  isEdit ? form.createdBy : currentUser,
            modifiedBy: isEdit ? currentUser    : null,
        };
        fetch(variables.API_URL + 'supplier/banks/save', {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
        })
            .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.message); }); return r.json(); })
            .then(() => onSaved())
            .catch(e => setAlertMsg(e.message || 'Failed to save.'))
            .finally(() => setSaving(false));
    };

    return (
        <div className={`tab-inline-form ${isEdit ? 'tab-form-edit' : 'tab-form-new'}`}>
            <div className="tab-form-title">{isEdit ? '✎ Edit Bank Account' : '+ New Bank Account'}</div>
            <div className="tab-form-row">
                <div className="tab-form-field tab-f2">
                    <label>Bank Name <span className="req">*</span></label>
                    <input name="bankName" className="tab-input" value={form.bankName} onChange={handle} placeholder="e.g. Emirates NBD" />
                </div>
                <div className="tab-form-field tab-f2">
                    <label>Account Name</label>
                    <input name="accountName" className="tab-input" value={form.accountName} onChange={handle} placeholder="Name on account" />
                </div>
                <div className="tab-form-field">
                    <label>Currency</label>
                    <select name="currencyId" className="tab-input" value={form.currencyId} onChange={handle}>
                        <option value="">— Select —</option>
                        {currencies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                    </select>
                </div>
            </div>
            <div className="tab-form-row">
                <div className="tab-form-field tab-f2">
                    <label>Account Number <span className="req">*</span></label>
                    <input name="accountNumber" className="tab-input" value={form.accountNumber} onChange={handle} />
                </div>
                <div className="tab-form-field tab-f2">
                    <label>IBAN</label>
                    <input name="iban" className="tab-input" value={form.iban} onChange={handle} placeholder="AE00 0000 0000 0000 0000 000" style={{ fontFamily: 'monospace' }} />
                </div>
            </div>
            <div className="tab-form-row">
                <div className="tab-form-field">
                    <label>SWIFT / BIC</label>
                    <input name="swiftCode" className="tab-input" value={form.swiftCode} onChange={handle} placeholder="EBILAEAD" style={{ fontFamily: 'monospace' }} />
                </div>
                <div className="tab-form-field tab-f2">
                    <label>Branch Name</label>
                    <input name="branchName" className="tab-input" value={form.branchName} onChange={handle} />
                </div>
                <div className="tab-form-field tab-fcheck">
                    <label>&nbsp;</label>
                    <label className="tab-check">
                        <input type="checkbox" name="isDefault" checked={!!form.isDefault} onChange={handle} />
                        <span>Default</span>
                    </label>
                </div>
            </div>
            <div className="tab-form-actions">
                <button className="tab-btn-sec" onClick={onCancel}>Cancel</button>
                <button className={isEdit ? 'tab-btn-amber' : 'tab-btn-pri'} style={!isEdit ? { background: '#0f766e' } : {}} onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : (isEdit ? 'Update Account' : 'Save Account')}
                </button>
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

// ─── BANK TAB ────────────────────────────────────────────────────
const BankTab = ({ supplier, canEdit = true }) => {
    const { lookups } = useLookup();
    const { currencies } = lookups;

    const [banks, setbanks]      = useState([]);
    const [formRecord, setForm]  = useState(null);
    const [alertMsg, setAlertMsg] = useState(null);

    const load = useCallback(() => {
        fetch(variables.API_URL + 'supplier/banks/' + supplier.supplierId, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setbanks(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, [supplier.supplierId]);

    useEffect(() => { load(); }, [load]);

    const deleteBank = async (id) => {
        if (!window.confirm('Delete this bank account?')) return;
        try {
            const res = await fetch(variables.API_URL + 'supplier/banks/' + id, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) { const d = await res.json(); setAlertMsg(d?.message || 'Failed to delete bank account.'); return; }
            load();
        } catch { setAlertMsg('Network error. Please try again.'); }
    };

    return (
        <div className="tab-section">
            <div className="tab-toolbar">
                <div className="tab-toolbar-left">
                    <span className="tab-section-title">Bank Accounts</span>
                    <span className="tab-count-badge">{banks.length}</span>
                </div>
                {!formRecord && canEdit && (
                    <button className="tab-btn-pri" style={{ background: '#0f766e' }}
                        onClick={() => setForm(makeEmpty(supplier.supplierId, currencies))}>
                        + Add Bank Account
                    </button>
                )}
            </div>

            {formRecord && (
                <BankForm
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
                            <th>Bank Name</th>
                            <th>Account Name</th>
                            <th>Account Number</th>
                            <th>IBAN</th>
                            <th>SWIFT</th>
                            <th>Branch</th>
                            <th>Currency</th>
                            <th>Default</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {banks.length === 0
                            ? <tr><td colSpan="9" className="tab-empty">No bank accounts yet. Click Add Bank Account to get started.</td></tr>
                            : banks.map(b => (
                                <tr key={b.supplierBankId} className={formRecord?.supplierBankId === b.supplierBankId ? 'tab-row-editing' : ''}>
                                    <td style={{ fontWeight: 500 }}>{b.bankName}</td>
                                    <td>{b.accountName || '—'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{b.accountNumber}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{b.iban || '—'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{b.swiftCode || '—'}</td>
                                    <td>{b.branchName || '—'}</td>
                                    <td>{b.currencyShortName || b.currencyName || '—'}</td>
                                    <td>
                                        {b.isDefault
                                            ? <span className="tab-badge-green">Default</span>
                                            : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                                    </td>
                                    <td className="tab-actions-cell">
                                        {canEdit && <button className="tab-act-btn tab-act-edit"
                                            onClick={() => setForm(normalise({ ...b }, currencies))}>Edit</button>}
                                        {canEdit && <button className="tab-act-btn tab-act-del" onClick={() => deleteBank(b.supplierBankId)}>Delete</button>}
                                    </td>
                                </tr>
                            ))
                        }
                    </tbody>
                </table>
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default BankTab;
