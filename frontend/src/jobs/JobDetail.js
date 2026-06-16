import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useLookup } from '../LookupContext';
import { useFieldConfig } from '../FieldConfigContext';
import AlertModal from '../common/AlertModal';
import './JobDetail.css';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmt     = (n) => n != null ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

// ─────────────────────────────────────────────────────────────
// TERMS TAB
// ─────────────────────────────────────────────────────────────
const TermsTab = ({ jobId }) => {
    const currentUser = useCurrentUser();
    const [terms, setTerms]   = useState({ jobPaymentTerms: '', warrantyTerms: '', jobDeliveryTerms: '' });
    const [saved,     setSaved]    = useState(false);
    const [saving,    setSaving]   = useState(false);
    const [alertMsg,  setAlertMsg] = useState(null);

    useEffect(() => {
        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/terms`, { headers: authHeaders() })
            .then(r => r.json()).then(d => { if (d) setTerms(d); }).catch(console.error);
    }, [jobId]);

    const handle = (e) => { const { name, value } = e.target; setTerms(p => ({ ...p, [name]: value })); setSaved(false); };

    const save = async () => {
        setSaving(true);
        const isNew = !terms.createdBy;
        try {
            const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/terms`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ ...terms, jobId, createdBy: isNew ? currentUser : terms.createdBy, modifiedBy: isNew ? null : currentUser })
            });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d?.message || 'Failed to save terms.'); return; }
            setSaved(true);
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setSaving(false); }
    };

    return (
        <div className="jd-tab-body">
            <div className="jd-terms-grid">
                <div className="jd-terms-field">
                    <label className="jd-label">Payment Terms</label>
                    <textarea className="jd-textarea" name="jobPaymentTerms" rows={4}
                        value={terms.jobPaymentTerms || ''} onChange={handle}
                        placeholder="e.g. 30% advance, 70% on completion…" />
                </div>
                <div className="jd-terms-field">
                    <label className="jd-label">Warranty Terms</label>
                    <textarea className="jd-textarea" name="warrantyTerms" rows={4}
                        value={terms.warrantyTerms || ''} onChange={handle}
                        placeholder="e.g. 12 months from delivery date…" />
                </div>
                <div className="jd-terms-field">
                    <label className="jd-label">Delivery Terms</label>
                    <textarea className="jd-textarea" name="jobDeliveryTerms" rows={4}
                        value={terms.jobDeliveryTerms || ''} onChange={handle}
                        placeholder="e.g. Ex-works, FOB, DDP…" />
                </div>
            </div>
            <div className="jd-terms-footer">
                {saved && <span className="jd-saved-badge">✓ Saved</span>}
                <button className="jd-btn-pri" onClick={save} disabled={saving}>
                    {saving ? 'Saving…' : 'Save Terms'}
                </button>
            </div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// EXPENSES TAB
// ─────────────────────────────────────────────────────────────
const ExpensesTab = ({ jobId }) => {
    const currentUser = useCurrentUser();
    const { lookups } = useLookup();
    const { isReq }   = useFieldConfig('JOB_EXPENSE');
    const { currencies } = lookups;

    const [expenses,   setExpenses]   = useState([]);
    const [categories, setCategories] = useState([]);
    const [form,       setForm]       = useState(null);   // null = hidden
    const [saving,     setSaving]     = useState(false);
    const [alertMsg,   setAlertMsg]   = useState(null);

    const load = useCallback(() => {
        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/expenses`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setExpenses(Array.isArray(d) ? d : [])).catch(console.error);
    }, [jobId]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        fetch(`${variables.API_URL}job/expense-categories`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : [])).catch(console.error);
    }, []);

    const emptyForm = () => ({
        expenseId: 0, jobId,
        expenseCategoryId: categories[0]?.expenseCategoryId || '',
        expenseDescription: '', expenseAmount: '',
        expenseDate: new Date().toISOString().slice(0, 10),
        currencyId: currencies[0] ? String(currencies[0].id) : '',
        exchangeRate: 1, referenceNo: '', remarks: '',
        createdBy: currentUser, modifiedBy: null,
    });

    const handle = (e) => { const { name, value } = e.target; setForm(p => ({ ...p, [name]: value })); };

    const save = async () => {
        if (!form.expenseCategoryId) { setAlertMsg('Category is required.'); return; }
        if (!form.expenseAmount)     { setAlertMsg('Amount is required.');   return; }
        if (!form.exchangeRate || isNaN(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0)
            { setAlertMsg('Exchange rate must be a number greater than 0.'); return; }
        setSaving(true);
        const isEdit = form.expenseId > 0;
        const payload = { ...form,
            expenseCategoryId: Number(form.expenseCategoryId),
            expenseAmount:     Number(form.expenseAmount),
            currencyId:        form.currencyId ? Number(form.currencyId) : null,
            exchangeRate:      Number(form.exchangeRate),
            modifiedBy:        isEdit ? currentUser : null,
        };
        try {
            const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/expenses`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify(payload)
            });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d?.message || 'Failed to save expense.'); return; }
            load(); setForm(null);
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setSaving(false); }
    };

    const totalAmt = expenses.reduce((s, e) => s + Number(e.expenseAmount || 0), 0);

    return (
        <div className="jd-tab-body">
            <div className="jd-tab-toolbar">
                <span className="jd-tab-count">{expenses.length} expense{expenses.length !== 1 ? 's' : ''} · Total: {fmt(totalAmt)}</span>
                {!form && (
                    <button className="jd-btn-pri jd-btn-sm" onClick={() => setForm(emptyForm())}>+ Add Expense</button>
                )}
            </div>

            {form && (
                <div className={`jd-inline-form ${form.expenseId > 0 ? 'jd-form-edit' : 'jd-form-new'}`}>
                    <div className="jd-form-title">{form.expenseId > 0 ? '✎ Edit Expense' : '+ New Expense'}</div>
                    <div className="jd-form-row">
                        <div className="jd-form-field">
                            <label>Category {isReq('expenseCategoryId') && <span className="req">*</span>}</label>
                            <select name="expenseCategoryId" className="jd-input" value={form.expenseCategoryId} onChange={handle}>
                                {categories.map(c => <option key={c.expenseCategoryId} value={c.expenseCategoryId}>{c.categoryName}</option>)}
                            </select>
                        </div>
                        <div className="jd-form-field" style={{ flex: '0 0 140px' }}>
                            <label>Date {isReq('expenseDate') && <span className="req">*</span>}</label>
                            <input type="date" name="expenseDate" className="jd-input" value={form.expenseDate} onChange={handle} />
                        </div>
                        <div className="jd-form-field" style={{ flex: '0 0 130px' }}>
                            <label>Amount {isReq('expenseAmount') && <span className="req">*</span>}</label>
                            <input type="number" name="expenseAmount" className="jd-input" value={form.expenseAmount} onChange={handle} placeholder="0.00" />
                        </div>
                        <div className="jd-form-field">
                            <label>Currency</label>
                            <select name="currencyId" className="jd-input" value={form.currencyId} onChange={handle}>
                                {currencies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="jd-form-field" style={{ flex: '0 0 100px' }}>
                            <label>Exc. Rate</label>
                            <input type="number" name="exchangeRate" className="jd-input" value={form.exchangeRate} onChange={handle} step="0.000001" />
                        </div>
                    </div>
                    <div className="jd-form-row">
                        <div className="jd-form-field">
                            <label>Reference No.</label>
                            <input name="referenceNo" className="jd-input" value={form.referenceNo} onChange={handle} placeholder="Invoice / receipt no." />
                        </div>
                        <div className="jd-form-field jd-f2">
                            <label>Description</label>
                            <input name="expenseDescription" className="jd-input" value={form.expenseDescription} onChange={handle} placeholder="Details…" />
                        </div>
                        <div className="jd-form-field jd-f2">
                            <label>Remarks</label>
                            <input name="remarks" className="jd-input" value={form.remarks} onChange={handle} />
                        </div>
                    </div>
                    <div className="jd-form-actions">
                        <button className="jd-btn-sec" onClick={() => setForm(null)}>Cancel</button>
                        <button className={form.expenseId > 0 ? 'jd-btn-amber' : 'jd-btn-pri'} onClick={save} disabled={saving}>
                            {saving ? 'Saving…' : (form.expenseId > 0 ? 'Update' : 'Add Expense')}
                        </button>
                    </div>
                </div>
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}

            <div className="jd-table-wrap">
                <table className="jd-table">
                    <thead><tr>
                        <th>Date</th><th>Category</th><th>Description</th>
                        <th>Ref No.</th><th style={{ textAlign: 'right' }}>Amount</th>
                        <th>Currency</th><th>Approved</th><th>Actions</th>
                    </tr></thead>
                    <tbody>
                        {expenses.length === 0
                            ? <tr><td colSpan="8" className="jd-empty">No expenses yet.</td></tr>
                            : expenses.map(e => (
                                <tr key={e.expenseId} className={form?.expenseId === e.expenseId ? 'jd-row-editing' : ''}>
                                    <td>{fmtDate(e.expenseDate)}</td>
                                    <td><span className="jd-cat-badge">{e.categoryName}</span></td>
                                    <td className="jd-desc-cell">{e.expenseDescription || '—'}</td>
                                    <td>{e.referenceNo || '—'}</td>
                                    <td style={{ textAlign: 'right' }}><strong>{fmt(e.expenseAmount)}</strong></td>
                                    <td>{e.currencyName || '—'}</td>
                                    <td>{e.isApproved
                                        ? <span className="jd-badge-green">✓ Approved</span>
                                        : <span className="jd-badge-gray">Pending</span>}
                                    </td>
                                    <td className="jd-actions-cell">
                                        <button className="jd-act-btn jd-act-edit"
                                            onClick={() => setForm({
                                                ...e,
                                                expenseDate: e.expenseDate ? e.expenseDate.slice(0, 10) : '',
                                                currencyId:  e.currencyId != null ? String(e.currencyId) : '',
                                                modifiedBy:  currentUser,
                                            })}>Edit</button>
                                    </td>
                                </tr>
                            ))}
                    </tbody>
                    {expenses.length > 0 && (
                        <tfoot>
                            <tr>
                                <td colSpan="4" style={{ textAlign: 'right', fontWeight: 600, paddingRight: 12, fontSize: 11 }}>TOTAL</td>
                                <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(totalAmt)}</td>
                                <td colSpan="3" />
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// ENGINEERS TAB
// ─────────────────────────────────────────────────────────────
const EngineersTab = ({ jobId }) => {
    const currentUser  = useCurrentUser();
    const { isReq: isReqEng } = useFieldConfig('JOB_ENGINEER');
    const [assigned,   setAssigned]  = useState([]);
    const [engineers,  setEngineers] = useState([]);
    const [form,       setForm]      = useState(null);
    const [saving,     setSaving]    = useState(false);
    const [alertMsg,   setAlertMsg]  = useState(null);

    const load = useCallback(() => {
        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/engineers`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setAssigned(Array.isArray(d) ? d : [])).catch(console.error);
    }, [jobId]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        fetch(`${variables.API_URL}job/engineers`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setEngineers(Array.isArray(d) ? d : [])).catch(console.error);
    }, []);

    const emptyForm = () => ({
        jobEngineerId: 0, jobId,
        engineerId: engineers[0]?.engineerId || '',
        role: '', completed: false,
        assignedBy: currentUser,
    });

    const handle = (e) => { const { name, value, type, checked } = e.target; setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value })); };

    const save = async () => {
        if (!form.engineerId) { setAlertMsg('Select an engineer.'); return; }
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/engineers`, {
                method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...form, engineerId: Number(form.engineerId) })
            });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d?.message || 'Failed to save engineer.'); return; }
            load(); setForm(null);
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setSaving(false); }
    };

    const del = async (id) => {
        if (!window.confirm('Remove this engineer from the job?')) return;
        try {
            const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/engineers/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) { const d = await res.json(); setAlertMsg(d?.message || 'Failed to remove engineer.'); return; }
            load();
        } catch { setAlertMsg('Network error. Please try again.'); }
    };

    const assignedIds = new Set(assigned.map(a => a.engineerId));

    return (
        <div className="jd-tab-body">
            <div className="jd-tab-toolbar">
                <span className="jd-tab-count">{assigned.length} engineer{assigned.length !== 1 ? 's' : ''} assigned</span>
                {!form && <button className="jd-btn-pri jd-btn-sm" onClick={() => setForm(emptyForm())}>+ Assign Engineer</button>}
            </div>

            {form && (
                <div className={`jd-inline-form ${form.jobEngineerId > 0 ? 'jd-form-edit' : 'jd-form-new'}`}>
                    <div className="jd-form-title">{form.jobEngineerId > 0 ? '✎ Edit Assignment' : '+ Assign Engineer'}</div>
                    <div className="jd-form-row">
                        <div className="jd-form-field">
                            <label>Engineer {isReqEng('engineerId') && <span className="req">*</span>}</label>
                            <select name="engineerId" className="jd-input" value={form.engineerId} onChange={handle}>
                                <option value="">-- Select --</option>
                                {engineers
                                    .filter(e => form.jobEngineerId > 0 || !assignedIds.has(e.engineerId))
                                    .map(e => <option key={e.engineerId} value={e.engineerId}>{e.engineerName}</option>)}
                            </select>
                        </div>
                        <div className="jd-form-field">
                            <label>Role</label>
                            <input name="role" className="jd-input" value={form.role} onChange={handle} placeholder="e.g. Lead, Support…" />
                        </div>
                        <div className="jd-form-field jd-fcheck">
                            <label>&nbsp;</label>
                            <label className="jd-check"><input type="checkbox" name="completed" checked={!!form.completed} onChange={handle} /><span>Completed</span></label>
                        </div>
                    </div>
                    <div className="jd-form-actions">
                        <button className="jd-btn-sec" onClick={() => setForm(null)}>Cancel</button>
                        <button className={form.jobEngineerId > 0 ? 'jd-btn-amber' : 'jd-btn-pri'} onClick={save} disabled={saving}>
                            {saving ? 'Saving…' : (form.jobEngineerId > 0 ? 'Update' : 'Assign')}
                        </button>
                    </div>
                </div>
            )}

            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            <div className="jd-engineer-grid">
                {assigned.length === 0 && !form
                    ? <div className="jd-empty-card">No engineers assigned to this job yet.</div>
                    : assigned.map(a => (
                        <div key={a.jobEngineerId} className={`jd-engineer-card ${a.completed ? 'jd-eng-done' : ''}`}>
                            <div className="jd-eng-avatar">{(a.engineerName || '?')[0].toUpperCase()}</div>
                            <div className="jd-eng-info">
                                <div className="jd-eng-name">{a.engineerName}</div>
                                {a.email && <div className="jd-eng-email">{a.email}</div>}
                                <div className="jd-eng-meta">
                                    {a.role && <span className="jd-role-badge">{a.role}</span>}
                                    {a.completed && <span className="jd-badge-green">✓ Done</span>}
                                </div>
                            </div>
                            <div className="jd-eng-actions">
                                <button className="jd-act-btn jd-act-edit"
                                    onClick={() => setForm({ ...a, engineerId: a.engineerId, assignedBy: currentUser })}>Edit</button>
                                <button className="jd-act-btn jd-act-del" onClick={() => del(a.jobEngineerId)}>Remove</button>
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
// JOB DETAIL DRAWER  (tabbed — Terms | Expenses | Engineers)
// ─────────────────────────────────────────────────────────────
const TABS = [
    { key: 'terms',     label: 'Terms' },
    { key: 'expenses',  label: 'Expenses' },
    { key: 'engineers', label: 'Engineers' },
];

const JobDetail = ({ job, startTab = 'expenses', onClose }) => {
    const [tab, setTab] = useState(startTab);

    return (
        <div className="jd-drawer">
            {/* Context bar */}
            <div className="jd-ctx">
                <div className="jd-ctx-left">
                    <div className="jd-ctx-jobid">{job.jobId}</div>
                    <div className="jd-ctx-info">
                        <span>{job.customerName}</span>
                        {job.projectName && <span className="jd-ctx-sep">·</span>}
                        {job.projectName && <span>{job.projectName}</span>}
                    </div>
                </div>
                <button className="jd-ctx-close" onClick={onClose}>✕</button>
            </div>

            {/* Tabs */}
            <div className="jd-tabs">
                {TABS.map(t => (
                    <button key={t.key}
                        className={`jd-tab ${tab === t.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setTab(t.key)}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {tab === 'terms'     && <TermsTab     jobId={job.jobId} />}
            {tab === 'expenses'  && <ExpensesTab  jobId={job.jobId} />}
            {tab === 'engineers' && <EngineersTab jobId={job.jobId} />}
        </div>
    );
};

export default JobDetail;
