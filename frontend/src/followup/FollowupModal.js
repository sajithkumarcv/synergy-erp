import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import AmountInput from '../common/AmountInput';

const fmt     = (n) => (n == null ? '0.00' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const todayISO = () => new Date().toISOString().slice(0, 10);

const CONTACT_MODES = ['Phone', 'Email', 'Visit', 'WhatsApp'];
const OUTCOMES = [
    { value: 'Promised',          label: 'Promised to pay' },
    { value: 'PartialPayment',    label: 'Partial payment agreed' },
    { value: 'CallbackRequested', label: 'Asked to call back' },
    { value: 'NoResponse',        label: 'No response' },
    { value: 'LeftMessage',       label: 'Left message' },
    { value: 'Disputed',          label: 'Disputed invoice' },
    { value: 'Refused',           label: 'Refused to pay' },
];
const PROMISE_OUTCOMES = ['Promised', 'PartialPayment'];

const EMPTY_FORM = {
    followupId: 0, contactDate: todayISO(), contactMode: 'Phone', contactPerson: '',
    outcome: 'Promised', promiseAmount: '', promiseDate: '', nextFollowupDate: '', notes: '',
};

const PROMISE_BADGE = {
    Open:   { bg: '#fff7ed', color: '#c2410c', label: 'Promise open' },
    Kept:   { bg: '#dcfce7', color: '#166534', label: 'Promise kept' },
    Broken: { bg: '#fef2f2', color: '#991b1b', label: 'Promise broken' },
};

const FollowupModal = ({ customerId, customerName, currentUser, onClose, onSaved }) => {
    const [data,    setData]    = useState(null);
    const [loading, setLoading] = useState(true);
    const [error,   setError]   = useState('');
    const [form,    setForm]    = useState({ ...EMPTY_FORM });
    const [saving,  setSaving]  = useState(false);
    const [saveErr, setSaveErr] = useState('');

    // Customer contacts (reused from the Customer module)
    const [contacts,      setContacts]      = useState([]);
    const [addingContact, setAddingContact] = useState(false);
    const [newContact,    setNewContact]    = useState({ name: '', designation: '', mobile: '' });
    const [contactErr,    setContactErr]    = useState('');
    const [savingContact, setSavingContact] = useState(false);

    const loadContacts = useCallback(() => {
        fetch(`${variables.API_URL}Customer/contacts/${customerId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setContacts(Array.isArray(d) ? d : []))
            .catch(() => {});
    }, [customerId]);

    const saveContact = () => {
        if (!newContact.name.trim()) { setContactErr('Name is required.'); return; }
        setSavingContact(true); setContactErr('');
        fetch(`${variables.API_URL}Customer/contacts/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                customerContactId: 0, customerId,
                contactTitle: null, contactName: newContact.name.trim(),
                designation: newContact.designation || null,
                phone: null, mobile: newContact.mobile || null, email: null,
                isPrimary: false, createdBy: currentUser, modifiedBy: null, isActive: true,
            }),
        })
            .then(r => r.json().then(j => ({ ok: r.ok, j })))
            .then(({ ok, j }) => {
                if (!ok) throw new Error(j.message || 'Failed to add contact.');
                setField('contactPerson', newContact.name.trim());
                setNewContact({ name: '', designation: '', mobile: '' });
                setAddingContact(false);
                loadContacts();
            })
            .catch(e => setContactErr(e.message || 'Failed to add contact.'))
            .finally(() => setSavingContact(false));
    };

    const reload = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}paymentfollowup/customer-history/${customerId}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(); return r.json(); })
            .then(d => setData(d))
            .catch(() => setError('Failed to load follow-up history.'))
            .finally(() => setLoading(false));
    }, [customerId]);

    useEffect(() => { reload(); loadContacts(); }, [reload, loadContacts]);

    const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const editEntry = (h) => {
        setForm({
            followupId:       h.followupId,
            contactDate:      h.contactDate ? h.contactDate.slice(0, 10) : todayISO(),
            contactMode:      h.contactMode || 'Phone',
            contactPerson:    h.contactPerson || '',
            outcome:          h.outcome || 'Promised',
            promiseAmount:    h.promiseAmount ?? '',
            promiseDate:      h.promiseDate ? h.promiseDate.slice(0, 10) : '',
            nextFollowupDate: h.nextFollowupDate ? h.nextFollowupDate.slice(0, 10) : '',
            notes:            h.notes || '',
        });
        setSaveErr('');
    };

    const resetForm = () => { setForm({ ...EMPTY_FORM }); setSaveErr(''); };

    const save = () => {
        if (!form.outcome) { setSaveErr('Please choose an outcome.'); return; }
        const isPromise = PROMISE_OUTCOMES.includes(form.outcome);
        if (isPromise && !form.promiseDate) { setSaveErr('A promise needs a promised date.'); return; }
        const today = todayISO();
        if (isPromise && form.promiseDate && form.promiseDate < today) { setSaveErr('Promised date must be today or later.'); return; }
        if (form.nextFollowupDate && form.nextFollowupDate < today) { setSaveErr('Next follow-up date must be today or later.'); return; }
        setSaving(true); setSaveErr('');
        const body = {
            followupId:          form.followupId,
            customerId,
            contactDate:         form.contactDate,
            contactPerson:       form.contactPerson || null,
            contactMode:         form.contactMode || null,
            outcome:             form.outcome,
            notes:               form.notes || null,
            promiseAmount:       isPromise && form.promiseAmount !== '' ? Number(form.promiseAmount) : null,
            promiseDate:         isPromise && form.promiseDate ? form.promiseDate : null,
            nextFollowupDate:    form.nextFollowupDate || null,
            outstandingSnapshot: data?.summary?.totalPendingBase ?? null,
            actionBy:            currentUser,
        };
        fetch(`${variables.API_URL}paymentfollowup/save`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
        })
            .then(r => r.json().then(j => ({ ok: r.ok, j })))
            .then(({ ok, j }) => {
                if (!ok) throw new Error(j.message || 'Save failed.');
                resetForm(); reload(); onSaved && onSaved();
            })
            .catch(e => setSaveErr(e.message || 'Save failed.'))
            .finally(() => setSaving(false));
    };

    const markPromise = (followupId, status) => {
        fetch(`${variables.API_URL}paymentfollowup/promise-status`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ followupId, status, actionBy: currentUser }),
        })
            .then(r => { if (!r.ok) throw new Error(); reload(); onSaved && onSaved(); })
            .catch(() => {});
    };

    const s = data?.summary;
    const history = data?.history || [];
    const isPromise = PROMISE_OUTCOMES.includes(form.outcome);

    const lbl = { display: 'block', fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 3 };
    const inp = { width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1000,
                      display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '40px 16px', overflowY: 'auto' }}
             onClick={onClose}>
            <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 760, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}
                 onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                              padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                    <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{customerName}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>Payment follow-up</div>
                    </div>
                    <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b', lineHeight: 1 }}>×</button>
                </div>

                {loading ? (
                    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
                ) : error ? (
                    <div className="recv-error" style={{ margin: 20 }}>⚠ {error}</div>
                ) : (
                    <div style={{ padding: 20 }}>
                        {/* Summary chips */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
                            <Chip label="Outstanding" value={fmt(s?.totalPendingBase)} />
                            <Chip label="Overdue"     value={fmt(s?.overdueAmountBase)} color={s?.overdueAmountBase > 0 ? '#dc2626' : undefined} />
                            <Chip label="Days Overdue" value={s?.maxDaysOverdue > 0 ? `${s.maxDaysOverdue}d` : '—'} color={s?.maxDaysOverdue > 0 ? '#dc2626' : undefined} />
                            <Chip label="Credit Days" value={s?.creditDays ?? '—'} />
                            <Chip label="Phone" value={s?.mobile || s?.phone || '—'} />
                        </div>

                        {/* Log-call form */}
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 12 }}>
                                {form.followupId === 0 ? 'Log a call / contact' : `Editing entry #${form.followupId}`}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                <div>
                                    <label style={lbl}>Contact date</label>
                                    <input type="date" style={inp} value={form.contactDate} onChange={e => setField('contactDate', e.target.value)} />
                                </div>
                                <div>
                                    <label style={lbl}>Mode</label>
                                    <select style={inp} value={form.contactMode} onChange={e => setField('contactMode', e.target.value)}>
                                        {CONTACT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={lbl}>Contact person</label>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <select style={{ ...inp, flex: 1 }} value={form.contactPerson} onChange={e => setField('contactPerson', e.target.value)}>
                                            <option value="">— Select —</option>
                                            {contacts.map(c => (
                                                <option key={c.customerContactId} value={c.contactName}>
                                                    {c.contactName}{c.designation ? ` (${c.designation})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                        <button type="button" title="Add a new contact"
                                                onClick={() => { setAddingContact(a => !a); setContactErr(''); }}
                                                style={{ border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, width: 34, cursor: 'pointer', fontSize: 18, color: '#0369a1', lineHeight: 1 }}>
                                            +
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label style={lbl}>Outcome</label>
                                    <select style={inp} value={form.outcome} onChange={e => setField('outcome', e.target.value)}>
                                        {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label style={lbl}>Promise amount {isPromise && <span style={{ color: '#dc2626' }}>•</span>}</label>
                                    <AmountInput style={{ ...inp, background: isPromise ? '#fff' : '#f1f5f9' }} disabled={!isPromise}
                                                 value={form.promiseAmount} onChange={v => setField('promiseAmount', v)} />
                                </div>
                                <div>
                                    <label style={lbl}>Promised by {isPromise && <span style={{ color: '#dc2626' }}>•</span>}</label>
                                    <input type="date" min={todayISO()} style={{ ...inp, background: isPromise ? '#fff' : '#f1f5f9' }} disabled={!isPromise}
                                           value={form.promiseDate} onChange={e => setField('promiseDate', e.target.value)} />
                                </div>
                                <div style={{ gridColumn: '1 / 2' }}>
                                    <label style={lbl}>Next follow-up</label>
                                    <input type="date" min={todayISO()} style={inp} value={form.nextFollowupDate} onChange={e => setField('nextFollowupDate', e.target.value)} />
                                </div>
                                <div style={{ gridColumn: '2 / 4' }}>
                                    <label style={lbl}>Notes</label>
                                    <input type="text" style={inp} placeholder="What was discussed…" value={form.notes} onChange={e => setField('notes', e.target.value)} />
                                </div>
                            </div>

                            {addingContact && (
                                <div style={{ marginTop: 12, padding: 12, background: '#fff', border: '1px dashed #94a3b8', borderRadius: 8 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8 }}>New contact</div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                                        <input style={inp} placeholder="Name *"      value={newContact.name}        onChange={e => setNewContact(n => ({ ...n, name: e.target.value }))} />
                                        <input style={inp} placeholder="Designation" value={newContact.designation} onChange={e => setNewContact(n => ({ ...n, designation: e.target.value }))} />
                                        <input style={inp} placeholder="Mobile"      value={newContact.mobile}      onChange={e => setNewContact(n => ({ ...n, mobile: e.target.value }))} />
                                    </div>
                                    {contactErr && <div style={{ color: '#991b1b', fontSize: 12, marginTop: 8 }}>⚠ {contactErr}</div>}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                                        <button onClick={() => { setAddingContact(false); setContactErr(''); }} disabled={savingContact}
                                                style={{ padding: '5px 12px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#475569' }}>
                                            Cancel
                                        </button>
                                        <button onClick={saveContact} disabled={savingContact}
                                                style={{ padding: '5px 14px', border: 'none', background: '#0369a1', color: '#fff', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: savingContact ? 0.6 : 1 }}>
                                            {savingContact ? 'Adding…' : 'Add contact'}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {saveErr && <div style={{ color: '#991b1b', fontSize: 12, marginTop: 10 }}>⚠ {saveErr}</div>}

                            <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                                {form.followupId !== 0 && (
                                    <button onClick={resetForm} disabled={saving}
                                            style={{ padding: '7px 14px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 7, fontSize: 13, cursor: 'pointer', color: '#475569' }}>
                                        Cancel edit
                                    </button>
                                )}
                                <button onClick={save} disabled={saving}
                                        style={{ padding: '7px 18px', border: 'none', background: '#0369a1', color: '#fff', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                                    {saving ? 'Saving…' : form.followupId === 0 ? 'Save follow-up' : 'Update'}
                                </button>
                            </div>
                        </div>

                        {/* Timeline */}
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#334155', marginBottom: 10 }}>
                            History <span style={{ fontWeight: 400, color: '#94a3b8' }}>({history.length})</span>
                        </div>
                        {history.length === 0 ? (
                            <div style={{ color: '#94a3b8', fontSize: 13, padding: '10px 0' }}>No contact logged yet.</div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {history.map(h => {
                                    const pb = PROMISE_BADGE[h.promiseStatus];
                                    return (
                                        <div key={h.followupId} style={{ border: '1px solid #e2e8f0', borderRadius: 9, padding: '10px 14px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{fmtDate(h.contactDate)}</span>
                                                    <span style={{ fontSize: 11, color: '#64748b', background: '#f1f5f9', borderRadius: 4, padding: '1px 7px' }}>{h.contactMode || '—'}</span>
                                                    <span style={{ fontSize: 12, color: '#334155' }}>{(OUTCOMES.find(o => o.value === h.outcome) || {}).label || h.outcome}</span>
                                                    {pb && <span style={{ fontSize: 10.5, background: pb.bg, color: pb.color, borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>{pb.label}</span>}
                                                </div>
                                                <button onClick={() => editEntry(h)} style={{ border: 'none', background: 'none', color: '#0369a1', fontSize: 12, cursor: 'pointer' }}>Edit</button>
                                            </div>
                                            {(h.promiseAmount || h.promiseDate) && (
                                                <div style={{ fontSize: 12, color: '#475569', marginTop: 5 }}>
                                                    Promised {h.promiseAmount ? <strong>{fmt(h.promiseAmount)}</strong> : ''} by <strong>{fmtDate(h.promiseDate)}</strong>
                                                    {h.promiseStatus === 'Open' && (
                                                        <span style={{ marginLeft: 10 }}>
                                                            <button onClick={() => markPromise(h.followupId, 'Kept')}   style={pillBtn('#166534')}>Mark kept</button>
                                                            <button onClick={() => markPromise(h.followupId, 'Broken')} style={pillBtn('#991b1b')}>Mark broken</button>
                                                        </span>
                                                    )}
                                                </div>
                                            )}
                                            {h.nextFollowupDate && <div style={{ fontSize: 12, color: '#1d4ed8', marginTop: 4 }}>Next follow-up: {fmtDate(h.nextFollowupDate)}</div>}
                                            {h.notes && <div style={{ fontSize: 12, color: '#64748b', marginTop: 5, fontStyle: 'italic' }}>“{h.notes}”</div>}
                                            {(h.contactPerson || h.createdBy) && (
                                                <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 6 }}>
                                                    {h.contactPerson ? `Spoke to ${h.contactPerson} · ` : ''}logged by {h.createdBy}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

const Chip = ({ label, value, color }) => (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 9, padding: '8px 14px', minWidth: 100 }}>
        <div style={{ fontSize: 10.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: color || '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
);

const pillBtn = (color) => ({
    border: `1px solid ${color}33`, background: `${color}11`, color, borderRadius: 5,
    padding: '1px 8px', fontSize: 11, cursor: 'pointer', marginRight: 6,
});

export default FollowupModal;
