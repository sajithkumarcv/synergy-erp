import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { STATUS, canEdit, fmt, fmtDate } from '../jobConstants';
import { useFieldConfig } from '../../FieldConfigContext';
import { usePermission } from '../../PermissionContext';
import AlertModal from '../../common/AlertModal';
import FinancialGuardModal from '../../common/FinancialGuardModal';

const ExpensesTab = ({ job, onRefresh }) => {
    const currentUser     = useCurrentUser();
    const { isReq }       = useFieldConfig('JOB_EXPENSE');
    const { lookups }     = useLookup();
    const { currencies }  = lookups;
    const { canDo }       = usePermission();

    const [expenses,   setExpenses]   = useState([]);
    const [categories, setCategories] = useState([]);
    const [form,       setForm]       = useState(null);
    const [loading,    setLoading]    = useState(true);
    const [alertMsg,   setAlertMsg]   = useState(null);

    // ── Approval modal state ──────────────────────────────────────
    const [approveTarget, setApproveTarget] = useState(null);  // expense object | null
    const [approving,     setApproving]     = useState(false);
    const [approveError,  setApproveError]  = useState('');

    // ── Delete modal state ────────────────────────────────────────
    const [deleteTarget, setDeleteTarget] = useState(null);  // expense object | null
    const [deleting,     setDeleting]     = useState(false);
    const [deleteError,  setDeleteError]  = useState('');

    // ── Financial-edit guard (save) ───────────────────────────────
    const [saveGuard,    setSaveGuard]    = useState(false);
    const [saveBusy,     setSaveBusy]     = useState(false);
    const [saveGuardErr, setSaveGuardErr] = useState('');

    const editable      = canEdit(job?.jobStatusId);
    const canApprove    = canDo('/jobs', 'APPROVE_EXPENSE');
    const canDelete     = canDo('/jobs', 'DELETE_EXPENSE');
    const canReverse    = canDo('/jobs', 'REVERSE_EXPENSE');

    const load = useCallback(() => {
        if (!job?.jobId) return;
        setLoading(true);
        fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/expenses`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setExpenses(Array.isArray(d) ? d : []))
            .catch(e => console.error('Load expenses:', e))
            .finally(() => setLoading(false));
    }, [job?.jobId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        fetch(`${variables.API_URL}job/expense-categories`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : []))
            .catch(e => console.error('Load categories:', e));
    }, []);

    const emptyForm = () => {
        const baseCur    = currencies.find(c => c.isBaseCurrency);
        const initCurrId = baseCur ? String(baseCur.id) : (currencies[0] ? String(currencies[0].id) : '');
        const initCur    = currencies.find(c => String(c.id) === initCurrId);
        return {
            expenseId: 0, jobId: job.jobId,
            expenseCategoryId: categories[0]?.expenseCategoryId || '',
            expenseDescription: '',
            expenseAmount: '',
            expenseDate: new Date().toISOString().slice(0, 10),
            currencyId:   initCurrId,
            exchangeRate: initCur ? initCur.exchangeRate : (job.jobExcRate || 1),
            referenceNo: '', remarks: '',
            createdBy: currentUser, modifiedBy: null,
        };
    };

    const handle = (e) => {
        const { name, value } = e.target;
        if (name === 'currencyId') {
            const cur = currencies.find(c => String(c.id) === String(value));
            setForm(p => ({
                ...p,
                currencyId:   value,
                exchangeRate: cur ? cur.exchangeRate : p.exchangeRate,
            }));
        } else {
            setForm(p => ({ ...p, [name]: value }));
        }
    };

    // Editing/adding an expense changes job financials → gated by password + reason.
    const save = () => {
        if (!form.expenseCategoryId) { setAlertMsg('Category is required.'); return; }
        if (!form.expenseAmount || Number(form.expenseAmount) === 0) { setAlertMsg('Amount cannot be zero.'); return; }
        if (!form.exchangeRate || isNaN(Number(form.exchangeRate)) || Number(form.exchangeRate) <= 0)
            { setAlertMsg('Exchange rate must be a number greater than 0.'); return; }
        setSaveGuardErr(''); setSaveGuard(true);
    };

    const runSave = async (password, reason) => {
        setSaveBusy(true); setSaveGuardErr('');
        const isEdit = form.expenseId > 0;
        try {
            const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/expenses`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    ...form,
                    expenseCategoryId: Number(form.expenseCategoryId),
                    expenseAmount:     Number(form.expenseAmount),
                    currencyId:        form.currencyId ? Number(form.currencyId) : null,
                    exchangeRate:      Number(form.exchangeRate),
                    modifiedBy:        isEdit ? currentUser : null,
                    createdBy:         currentUser,
                    password, reason,
                })
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setSaveGuardErr(d?.message || 'Failed to save expense.'); return; }
            setSaveGuard(false); load(); setForm(null); if (onRefresh) onRefresh();
        } catch { setSaveGuardErr('Network error. Please try again.'); }
        finally { setSaveBusy(false); }
    };

    const confirmApprove = async () => {
        if (!approveTarget) return;
        setApproving(true);
        setApproveError('');
        try {
            const res = await fetch(
                `${variables.API_URL}job/${encodeURIComponent(job.jobId)}/expenses/${approveTarget.expenseId}/approve`,
                { method: 'POST', headers: authHeaders(), body: JSON.stringify({ approvedBy: currentUser }) }
            );
            if (!res.ok) {
                const d = await res.json();
                setApproveError(d?.message || 'Failed to approve expense.');
                return;
            }
            setApproveTarget(null);
            load();
            if (onRefresh) onRefresh();
        } catch {
            setApproveError('Network error. Please try again.');
        } finally { setApproving(false); }
    };

    const confirmDelete = async (password, reason) => {
        if (!deleteTarget) return;
        setDeleting(true);
        setDeleteError('');
        try {
            const qs = `modifiedBy=${encodeURIComponent(currentUser)}&password=${encodeURIComponent(password)}&reason=${encodeURIComponent(reason)}`;
            const res = await fetch(
                `${variables.API_URL}job/${encodeURIComponent(job.jobId)}/expenses/${deleteTarget.expenseId}?${qs}`,
                { method: 'DELETE', headers: authHeaders() }
            );
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setDeleteError(d?.message || 'Failed to delete expense.');
                return;
            }
            setDeleteTarget(null);
            load();
            if (onRefresh) onRefresh();
        } catch {
            setDeleteError('Network error. Please try again.');
        } finally { setDeleting(false); }
    };

    const totalAmt      = expenses.reduce((s, e) => s + Number(e.expenseAmount   || 0), 0);
    const totalApproved = expenses.filter(e => e.isApproved).reduce((s, e) => s + Number(e.expenseAmount || 0), 0);
    const totalPending  = totalAmt - totalApproved;

    return (
        <div className="tab-section">

            {/* ── Summary strip ── */}
            <div className="exp-summary">
                <div className="exp-sum-card">
                    <div className="exp-sum-label">Total Expenses</div>
                    <div className="exp-sum-value">{fmt(totalAmt)}</div>
                </div>
                <div className="exp-sum-card exp-sum-green">
                    <div className="exp-sum-label">Approved</div>
                    <div className="exp-sum-value">{fmt(totalApproved)}</div>
                </div>
                <div className="exp-sum-card exp-sum-amber">
                    <div className="exp-sum-label">Pending Approval</div>
                    <div className="exp-sum-value">{fmt(totalPending)}</div>
                </div>
                <div className="exp-sum-card exp-sum-count">
                    <div className="exp-sum-label">Entries</div>
                    <div className="exp-sum-value">{expenses.length}</div>
                </div>
            </div>

            {/* ── Toolbar ── */}
            <div className="tab-toolbar">
                <div className="tab-toolbar-left">
                    <span className="tab-section-title">Expense Entries</span>
                    {!editable && (
                        <span className="tab-locked-badge">
                            🔒 Locked — job is {STATUS[job?.jobStatusId]?.label?.toLowerCase() || 'closed'}
                        </span>
                    )}
                </div>
                {editable && !form && (
                    <button className="tab-btn-pri" onClick={() => setForm(emptyForm())}>+ Add Expense</button>
                )}
            </div>

            {/* ── Inline form ── */}
            {form && (
                <div className={`tab-inline-form ${form.expenseId > 0 ? 'tab-form-edit' : 'tab-form-new'}`}>
                    <div className="tab-form-title">{form.expenseId > 0 ? '✎ Edit Expense' : '+ New Expense'}</div>
                    <div className="tab-form-row">
                        <div className="tab-form-field">
                            <label>Category {isReq('expenseCategoryId') && <span className="req">*</span>}</label>
                            <select name="expenseCategoryId" className="tab-input" value={form.expenseCategoryId} onChange={handle}>
                                {categories.map(c => <option key={c.expenseCategoryId} value={c.expenseCategoryId}>{c.categoryName}</option>)}
                            </select>
                        </div>
                        <div className="tab-form-field tab-f-date">
                            <label>Date {isReq('expenseDate') && <span className="req">*</span>}</label>
                            <input type="date" name="expenseDate" className="tab-input" value={form.expenseDate} onChange={handle} />
                        </div>
                        <div className="tab-form-field tab-f-amt">
                            <label>Amount {isReq('expenseAmount') && <span className="req">*</span>}</label>
                            <input
                                type="text" inputMode="decimal" name="expenseAmount"
                                className="tab-input" placeholder="0.00"
                                style={{ textAlign: 'right' }}
                                value={form.expenseAmount}
                                onChange={e => setForm(p => ({ ...p, expenseAmount: e.target.value.replace(/[^0-9.-]/g, '') }))}
                                onBlur={e => {
                                    const n = parseFloat(e.target.value);
                                    if (!isNaN(n)) setForm(p => ({ ...p, expenseAmount: n.toFixed(2) }));
                                }}
                                onFocus={e => {
                                    if (parseFloat(e.target.value) === 0) setForm(p => ({ ...p, expenseAmount: '' }));
                                }}
                            />
                        </div>
                        <div className="tab-form-field">
                            <label>Currency</label>
                            <select name="currencyId" className="tab-input" value={form.currencyId} onChange={handle}>
                                {currencies.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                            </select>
                        </div>
                        <div className="tab-form-field tab-f-rate">
                            <label>Exc. Rate</label>
                            <input type="number" name="exchangeRate" className="tab-input" value={form.exchangeRate} onChange={handle} step="0.000001" />
                        </div>
                    </div>
                    <div className="tab-form-row">
                        <div className="tab-form-field tab-f-ref">
                            <label>Reference No.</label>
                            <input name="referenceNo" className="tab-input" value={form.referenceNo} onChange={handle} placeholder="Invoice / receipt no." />
                        </div>
                        <div className="tab-form-field tab-f2">
                            <label>Description</label>
                            <input name="expenseDescription" className="tab-input" value={form.expenseDescription} onChange={handle} placeholder="Describe the expense…" />
                        </div>
                        <div className="tab-form-field tab-f2">
                            <label>Remarks</label>
                            <input name="remarks" className="tab-input" value={form.remarks} onChange={handle} />
                        </div>
                    </div>
                    <div className="tab-form-actions">
                        <button className="tab-btn-sec" onClick={() => setForm(null)}>Cancel</button>
                        <button className={form.expenseId > 0 ? 'tab-btn-amber' : 'tab-btn-pri'} onClick={save} disabled={saveBusy}>
                            {form.expenseId > 0 ? 'Update Expense' : 'Save Expense'}
                        </button>
                    </div>
                </div>
            )}

            {/* ── Table ── */}
            {loading ? (
                <div className="tab-loading">Loading expenses…</div>
            ) : (
                <div className="tab-table-wrap">
                    <table className="tab-table">
                        <thead><tr>
                            <th>Date</th><th>Category</th><th>Description</th>
                            <th>Ref No.</th><th style={{ textAlign:'right' }}>Amount</th>
                            <th>Currency</th><th>Status</th><th>Actions</th>
                        </tr></thead>
                        <tbody>
                            {expenses.length === 0
                                ? <tr><td colSpan="8" className="tab-empty">No expenses recorded. Click + Add Expense to begin.</td></tr>
                                : expenses.map(e => (
                                    <tr key={e.expenseId} className={form?.expenseId === e.expenseId ? 'tab-row-editing' : ''}>
                                        <td className="tab-nowrap">{fmtDate(e.expenseDate)}</td>
                                        <td><span className="exp-cat-badge">{e.categoryName}</span></td>
                                        <td className="tab-desc">{e.expenseDescription || '—'}</td>
                                        <td className="tab-mono">{e.referenceNo || '—'}</td>
                                        <td style={{ textAlign:'right', fontWeight:600 }}>{fmt(e.expenseAmount)}</td>
                                        <td>{e.currencyName || '—'}</td>
                                        <td>
                                            {e.isApproved
                                                ? <span className="tab-badge-green" title={`Approved by ${e.approvedBy}`}>✓ Approved</span>
                                                : <span className="tab-badge-amber">⏳ Pending</span>}
                                        </td>
                                        <td className="tab-actions-cell">
                                            {!e.isApproved && canApprove && (
                                                <button className="tab-act-btn tab-act-approve"
                                                    onClick={() => { setApproveError(''); setApproveTarget(e); }}>
                                                    Approve
                                                </button>
                                            )}
                                            {editable && !e.isApproved && (
                                                <button className="tab-act-btn tab-act-edit" onClick={() => setForm({
                                                    ...e,
                                                    expenseDate: e.expenseDate ? e.expenseDate.slice(0, 10) : '',
                                                    currencyId:  e.currencyId != null ? String(e.currencyId) : '',
                                                    modifiedBy:  currentUser,
                                                })}>Edit</button>
                                            )}
                                            {!e.isApproved && canDelete && (
                                                <button className="tab-act-btn tab-act-del"
                                                    onClick={() => { setDeleteError(''); setDeleteTarget(e); }}>
                                                    Delete
                                                </button>
                                            )}
                                            {e.isApproved && canReverse && (
                                                <button className="tab-act-btn tab-act-del"
                                                    title="Post a reversal entry to cancel this approved expense"
                                                    onClick={() => setForm({
                                                        expenseId:          0,
                                                        jobId:              job.jobId,
                                                        expenseCategoryId:  String(e.expenseCategoryId),
                                                        expenseDescription: `Reversal: ${e.expenseDescription || e.categoryName}`,
                                                        expenseAmount:      -Math.abs(Number(e.expenseAmount)),
                                                        expenseDate:        new Date().toISOString().slice(0, 10),
                                                        currencyId:         e.currencyId != null ? String(e.currencyId) : '',
                                                        exchangeRate:       e.exchangeRate ?? 1,
                                                        referenceNo:        `REV-${e.referenceNo || e.expenseId}`,
                                                        remarks:            `Reversal of expense #${e.expenseId}`,
                                                        createdBy:          currentUser,
                                                        modifiedBy:         null,
                                                    })}>
                                                    Reverse
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            }
                        </tbody>
                        {expenses.length > 0 && (
                            <tfoot>
                                <tr>
                                    <td colSpan="4" className="tab-tfoot-label">TOTAL</td>
                                    <td style={{ textAlign:'right', fontWeight:700 }}>{fmt(totalAmt)}</td>
                                    <td colSpan="3" />
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            )}

        {/* ── Approve confirmation modal ── */}
        {approveTarget && ReactDOM.createPortal(
            <div style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(15,23,42,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
                onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
                onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget && !approving) setApproveTarget(null); }}>
                <div style={{
                    background: '#fff', borderRadius: 12, padding: '28px 32px',
                    minWidth: 380, maxWidth: 480, width: '90%',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                    display: 'flex', flexDirection: 'column', gap: 16,
                }}>
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 22 }}>✅</span>
                        <span style={{ fontWeight: 700, fontSize: 16, color: '#0f172a' }}>Approve Expense?</span>
                    </div>

                    {/* Expense details */}
                    <div style={{
                        background: '#f8fafc', borderRadius: 8,
                        border: '1px solid #e2e8f0', padding: '14px 16px',
                        display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13,
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>Date</span>
                            <span style={{ fontWeight: 600 }}>{fmtDate(approveTarget.expenseDate)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: '#64748b' }}>Category</span>
                            <span style={{ fontWeight: 600 }}>{approveTarget.categoryName}</span>
                        </div>
                        {approveTarget.expenseDescription && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                                <span style={{ color: '#64748b', flexShrink: 0 }}>Description</span>
                                <span style={{ textAlign: 'right' }}>{approveTarget.expenseDescription}</span>
                            </div>
                        )}
                        {approveTarget.referenceNo && (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#64748b' }}>Reference</span>
                                <span style={{ fontFamily: 'monospace' }}>{approveTarget.referenceNo}</span>
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #e2e8f0', marginTop: 2 }}>
                            <span style={{ color: '#64748b' }}>Amount</span>
                            <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
                                {fmt(approveTarget.expenseAmount)} {approveTarget.currencyName || ''}
                            </span>
                        </div>
                    </div>

                    <p style={{ margin: 0, fontSize: 13, color: '#475569' }}>
                        This action cannot be undone. The expense will be marked as approved.
                    </p>

                    {/* Error */}
                    {approveError && (
                        <div style={{
                            background: '#fef2f2', border: '1px solid #fca5a5',
                            borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#b91c1c',
                        }}>
                            {approveError}
                        </div>
                    )}

                    {/* Buttons */}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
                        <button
                            onClick={() => { setApproveTarget(null); setApproveError(''); }}
                            disabled={approving}
                            style={{
                                padding: '8px 20px', borderRadius: 7, border: '1px solid #cbd5e1',
                                background: '#fff', color: '#374151', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                            }}>
                            Cancel
                        </button>
                        <button
                            onClick={confirmApprove}
                            disabled={approving}
                            style={{
                                padding: '8px 22px', borderRadius: 7, border: 'none',
                                background: approving ? '#6ee7b7' : '#10b981',
                                color: '#fff', cursor: approving ? 'default' : 'pointer',
                                fontSize: 13, fontWeight: 600,
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                            {approving ? (
                                <>
                                    <span style={{
                                        width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)',
                                        borderTopColor: '#fff', borderRadius: '50%',
                                        display: 'inline-block', animation: 'spin 0.7s linear infinite',
                                    }} />
                                    Approving…
                                </>
                            ) : '✓ Confirm Approve'}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )}

        {/* ── Delete confirmation modal ── */}
        {deleteTarget && (
            <FinancialGuardModal
                title="Delete expense"
                message={`Removing ${fmt(deleteTarget.expenseAmount)} ${deleteTarget.currencyName || ''} — ${deleteTarget.categoryName}${deleteTarget.expenseDescription ? ` (${deleteTarget.expenseDescription})` : ''} changes the job financials. Enter the budget password and a reason — both are recorded in the job audit.`}
                busy={deleting}
                error={deleteError}
                onCancel={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(''); } }}
                onConfirm={confirmDelete}
            />
        )}
        {saveGuard && (
            <FinancialGuardModal
                title={form?.expenseId > 0 ? 'Confirm expense change' : 'Confirm new expense'}
                message="This changes the job financials. Enter the budget password and a reason — both are recorded in the job audit."
                busy={saveBusy}
                error={saveGuardErr}
                onCancel={() => { if (!saveBusy) { setSaveGuard(false); setSaveGuardErr(''); } }}
                onConfirm={runSave}
            />
        )}
        {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default ExpensesTab;
