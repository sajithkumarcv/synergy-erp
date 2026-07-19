import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { usePermission } from '../../PermissionContext';
import { usePrintFormat } from '../../print/printFormats';
import { fmtDate, FormSection } from '../procurementConstants';
import ConfirmModal from '../../common/ConfirmModal';
import { InlineError } from '../../common/InlineError';
import FreeIssueGrnDocumentsTab from './FreeIssueGrnDocumentsTab';
import FreeIssueGrnPrintModal from './FreeIssueGrnPrintModal';
import FreeIssueGrnLineImportModal from './FreeIssueGrnLineImportModal';
import '../../jobs/JobDetail.css';
import '../Procurement.css';

const FI_TABS = [
    { key: 'overview',  label: 'Overview',  icon: '📋' },
    { key: 'lines',     label: 'Lines',     icon: '📦', badge: true },
    { key: 'documents', label: 'Documents', icon: '📎', badge: true },
    { key: 'history',   label: 'History',   icon: '🕓', badge: true },
];

const STATUS_CFG = {
    Draft:     { label: 'Draft',     bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' },
    Confirmed: { label: 'Confirmed', bg: '#dcfce7', color: '#166534', dot: '#16a34a' },
    Cancelled: { label: 'Cancelled', bg: '#fce7f3', color: '#9d174d', dot: '#db2777' },
};
const statusOf = s => STATUS_CFG[s] || { label: s || '—', bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };
const TRANSITIONS = {
    Draft:     ['Confirmed', 'Cancelled'],
    Confirmed: ['Cancelled'],
    Cancelled: [],
};

const FieldErr = ({ msg }) => msg
    ? <div style={{ color: '#dc2626', fontSize: 11, marginTop: 3 }}>⚠ {msg}</div>
    : null;

// ── Overview tab (view + inline edit while Draft) ─────────────────────────────
const OverviewTab = ({ grn, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { canDo } = usePermission();
    const canEdit = canDo('/free-issue-grn', 'EDIT') && grn.status === 'Draft';

    const [editing, setEditing] = useState(false);
    const [jobs,    setJobs]    = useState([]);
    const [form,    setForm]    = useState({});
    const [errors,  setErrors]  = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    useEffect(() => {
        if (!editing) return;
        fetch(`${variables.API_URL}job/search?pageSize=500&page=1`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setJobs((d.data || []).map(j => ({ value: j.jobId, label: j.jobId + (j.projectName ? ' — ' + j.projectName : ''), customer: j.customerName || '' }))))
            .catch(console.error);
    }, [editing]);

    const selectedCustomer = (jobs.find(j => j.value === form.jobId)?.customer) || grn.customerName || '';

    const startEdit = () => {
        setForm({
            jobId: grn.jobId || '',
            receiptDate: grn.receiptDate ? grn.receiptDate.slice(0, 10) : '',
            receivedBy: grn.receivedBy || '',
            briefDescription: grn.briefDescription || '',
            detailedDescription: grn.detailedDescription || '',
            deliveredBy: grn.deliveredBy || '',
            remarks: grn.remarks || '',
            boeNo: grn.boeNo || '',
            boeDate: grn.boeDate ? grn.boeDate.slice(0, 10) : '',
            deliveryNoteFilePath: grn.deliveryNoteFilePath || '',
        });
        setErrors({}); setError(''); setEditing(true);
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const validate = (f) => {
        const e = {};
        if (!f.jobId)                      e.jobId               = 'Job Ref is required.';
        if (!f.receiptDate)                e.receiptDate         = 'Date of Receipt is required.';
        if (!f.receivedBy.trim())          e.receivedBy          = 'Received By is required.';
        if (!f.briefDescription.trim())    e.briefDescription    = 'Brief Description is required.';
        if (!f.detailedDescription.trim()) e.detailedDescription = 'Detailed Description is required.';
        if (!f.deliveredBy.trim())         e.deliveredBy         = 'Delivered By is required.';
        if (f.boeDate && f.receiptDate && f.boeDate < f.receiptDate)
                                           e.boeDate             = 'BOE Date cannot be before Date of Receipt.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length > 0) return;
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}freeissuegrn/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                freeIssueGrnId:       grn.freeIssueGrnId,
                jobId:                form.jobId,
                receiptDate:          form.receiptDate,
                receivedBy:           form.receivedBy.trim(),
                briefDescription:     form.briefDescription.trim(),
                detailedDescription:  form.detailedDescription.trim(),
                deliveredBy:          form.deliveredBy.trim(),
                remarks:              form.remarks.trim() || null,
                boeNo:                form.boeNo.trim() || null,
                boeDate:              form.boeDate || null,
                deliveryNoteFilePath: form.deliveryNoteFilePath.trim() || null,
                createdBy:            currentUser,
                modifiedBy:           currentUser,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error saving.'); return; }
                setEditing(false);
                onRefresh();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    if (editing) {
        return (
            <div className="pf-panel" style={{ maxWidth: 760, margin: '0 auto', boxShadow: 'none', border: '1px solid #e2e8f0' }}>
                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}
                    <FormSection label="Job & Receipt" />
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Job Ref <span className="req">*</span></label>
                            <select className={`pf-input${errors.jobId ? ' pf-input-err' : ''}`} name="jobId" value={form.jobId} onChange={handle}>
                                <option value="">— Job No —</option>
                                {jobs.map(j => <option key={j.value} value={j.value}>{j.label}</option>)}
                            </select>
                            <FieldErr msg={errors.jobId} />
                        </div>
                        <div className="pf-field">
                            <label>Customer</label>
                            <input className="pf-input" value={selectedCustomer || '—'} readOnly style={{ background: '#f8fafc', color: '#475569' }} />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Date of Receipt <span className="req">*</span></label>
                            <input className={`pf-input${errors.receiptDate ? ' pf-input-err' : ''}`} type="date" name="receiptDate" value={form.receiptDate} onChange={handle} />
                            <FieldErr msg={errors.receiptDate} />
                        </div>
                        <div className="pf-field">
                            <label>Received By <span className="req">*</span></label>
                            <input className={`pf-input${errors.receivedBy ? ' pf-input-err' : ''}`} type="text" name="receivedBy" value={form.receivedBy} onChange={handle} />
                            <FieldErr msg={errors.receivedBy} />
                        </div>
                    </div>

                    <FormSection label="Description" />
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Brief Description <span className="req">*</span></label>
                            <input className={`pf-input${errors.briefDescription ? ' pf-input-err' : ''}`} type="text" name="briefDescription" value={form.briefDescription} onChange={handle} />
                            <FieldErr msg={errors.briefDescription} />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field pf-f3">
                            <label>Detailed Description <span className="req">*</span></label>
                            <textarea className={`pf-input pf-textarea${errors.detailedDescription ? ' pf-input-err' : ''}`} rows={4} name="detailedDescription" value={form.detailedDescription} onChange={handle} />
                            <FieldErr msg={errors.detailedDescription} />
                        </div>
                    </div>

                    <FormSection label="Delivery" />
                    <div className="pf-row">
                        <div className="pf-field pf-f2">
                            <label>Delivered By <span className="req">*</span></label>
                            <input className={`pf-input${errors.deliveredBy ? ' pf-input-err' : ''}`} type="text" name="deliveredBy" value={form.deliveredBy} onChange={handle} />
                            <FieldErr msg={errors.deliveredBy} />
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Delivery Note (file name / ref)</label>
                            <input className="pf-input" type="text" name="deliveryNoteFilePath" value={form.deliveryNoteFilePath} onChange={handle} />
                        </div>
                    </div>
                    <div className="pf-row">
                        <div className="pf-field">
                            <label>Bill of Entry No</label>
                            <input className="pf-input" type="text" name="boeNo" value={form.boeNo} onChange={handle} />
                        </div>
                        <div className="pf-field">
                            <label>Bill of Entry Date</label>
                            <input className={`pf-input${errors.boeDate ? ' pf-input-err' : ''}`} type="date" name="boeDate" value={form.boeDate} onChange={handle} />
                            <FieldErr msg={errors.boeDate} />
                        </div>
                        <div className="pf-field pf-f2">
                            <label>Remarks</label>
                            <input className="pf-input" type="text" name="remarks" value={form.remarks} onChange={handle} />
                        </div>
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                </div>
            </div>
        );
    }

    const Row = ({ label, value, mono }) => (
        <div style={{ display: 'flex', padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
            <div style={{ width: 190, flexShrink: 0, fontSize: 12, color: '#64748b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.3px' }}>{label}</div>
            <div style={{ fontSize: 13.5, color: '#1e293b', fontFamily: mono ? 'Courier New' : undefined, whiteSpace: 'pre-wrap' }}>{value || <span style={{ color: '#cbd5e1' }}>—</span>}</div>
        </div>
    );

    return (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '4px 20px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 0 2px' }}>
                {canEdit && <button className="jd-stage-btn" onClick={startEdit}>✎ Edit</button>}
            </div>
            <Row label="Job Ref"             value={grn.jobId + (grn.jobTitle ? ` — ${grn.jobTitle}` : '')} />
            <Row label="Customer"            value={grn.customerName} />
            <Row label="Date of Receipt"     value={fmtDate(grn.receiptDate)} />
            <Row label="Received By"         value={grn.receivedBy} />
            <Row label="Brief Description"   value={grn.briefDescription} />
            <Row label="Detailed Description" value={grn.detailedDescription} />
            <Row label="Delivered By"        value={grn.deliveredBy} />
            <Row label="Delivery Note"       value={grn.deliveryNoteFilePath} mono />
            <Row label="Bill of Entry No"    value={grn.boeNo} mono />
            <Row label="Bill of Entry Date"  value={grn.boeDate ? fmtDate(grn.boeDate) : ''} />
            <Row label="Remarks"             value={grn.remarks} />
            <Row label="Created By"          value={`${grn.createdBy}${grn.createdDate ? ' · ' + fmtDate(grn.createdDate) : ''}`} />
            {grn.status === 'Cancelled' && (
                <Row label="Cancelled" value={`${grn.cancelledBy || ''}${grn.cancelReason ? ' — ' + grn.cancelReason : ''}`} />
            )}
        </div>
    );
};

// ── Lines tab (optional free-text material lines) ─────────────────────────────
const LinesTab = ({ grn, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { canDo } = usePermission();
    const canEdit = canDo('/free-issue-grn', 'EDIT') && grn.status === 'Draft';

    const [lines,   setLines]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [form,    setForm]    = useState(null);   // {id?, description, qty, uomName, remarks}
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');
    const [confirm, setConfirm] = useState(null);
    const [showImport, setShowImport] = useState(false);

    const loadLines = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}freeissuegrn/lines/${grn.freeIssueGrnId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [grn.freeIssueGrnId]);

    useEffect(() => { loadLines(); }, [loadLines]);

    const openNew  = () => { setForm({ description: '', qty: '', uomName: '', remarks: '' }); setError(''); };
    const openEdit = (l) => { setForm({ id: l.freeIssueGrnDetailId, description: l.description || '', qty: l.qty != null ? String(l.qty) : '', uomName: l.uomName || '', remarks: l.remarks || '' }); setError(''); };

    const save = () => {
        if (!form.description.trim()) { setError('Description is required.'); return; }
        setSaving(true); setError('');
        fetch(`${variables.API_URL}freeissuegrn/lines/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                freeIssueGrnDetailId: form.id || 0,
                freeIssueGrnId: grn.freeIssueGrnId,
                description: form.description.trim(),
                qty: form.qty ? Number(form.qty) : null,
                uomName: form.uomName.trim() || null,
                remarks: form.remarks.trim() || null,
                createdBy: currentUser,
                modifiedBy: form.id ? currentUser : null,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error saving line.'); return; }
                setForm(null); loadLines(); onRefresh();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    const deleteLine = (lineId) => {
        setConfirm({
            title: 'Delete Line', message: 'Delete this material line?', confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                await fetch(`${variables.API_URL}freeissuegrn/lines/${lineId}`, { method: 'DELETE', headers: authHeaders() });
                loadLines(); onRefresh();
            },
        });
    };

    return (
        <div>
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            {showImport && (
                <FreeIssueGrnLineImportModal
                    grn={grn}
                    onClose={() => setShowImport(false)}
                    onImported={() => { loadLines(); onRefresh(); }}
                />
            )}
            <div className="prd-lines-wrap">
                <div className="prd-lines-header">
                    <span className="prd-lines-title">Material Lines ({lines.length}) <span style={{ fontWeight: 400, color: '#94a3b8', fontSize: 11 }}>· optional</span></span>
                    {canEdit && !form && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <button className="prd-add-btn" style={{ background: '#0f766e' }} onClick={() => setShowImport(true)} title="Import material lines from an Excel file">📊 Import from Excel</button>
                            <button className="prd-add-btn" onClick={openNew}>+ Add Line</button>
                        </div>
                    )}
                </div>

                {loading ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>Loading…</div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table className="prd-lines-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Description</th>
                                    <th style={{ textAlign: 'right' }}>Qty</th>
                                    <th>UOM</th>
                                    <th>Remarks</th>
                                    {canEdit && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {lines.length === 0 ? (
                                    <tr><td colSpan={canEdit ? 6 : 5} className="prd-lines-empty">No material lines. This is optional — the header description is enough for documentation.</td></tr>
                                ) : lines.map((l, i) => (
                                    <tr key={l.freeIssueGrnDetailId}>
                                        <td><span className="prd-line-num">{i + 1}</span></td>
                                        <td>{l.description}</td>
                                        <td className="prd-num-cell">{l.qty != null ? l.qty : '—'}</td>
                                        <td>{l.uomName || '—'}</td>
                                        <td style={{ color: '#64748b', fontSize: 12 }}>{l.remarks || '—'}</td>
                                        {canEdit && (
                                            <td>
                                                <button className="prd-line-act" onClick={() => openEdit(l)}>Edit</button>
                                                <button className="prd-line-act prd-line-del" onClick={() => deleteLine(l.freeIssueGrnDetailId)}>Del</button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {form && (
                    <div className="prd-line-form">
                        <div className="prd-line-form-title">{form.id ? 'Edit Line' : 'Add Line'}</div>
                        {error && <div className="pf-err" style={{ marginBottom: 8 }}>{error}</div>}
                        <div className="prd-lf-row">
                            <div className="prd-lf-field prd-lf-f2">
                                <label>Description <span className="req">*</span></label>
                                <input className="prd-lf-input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Material description" />
                            </div>
                            <div className="prd-lf-field">
                                <label>Qty</label>
                                <input className="prd-lf-input" type="number" value={form.qty} onChange={e => setForm(p => ({ ...p, qty: e.target.value }))} step="0.01" />
                            </div>
                            <div className="prd-lf-field">
                                <label>UOM</label>
                                <input className="prd-lf-input" value={form.uomName} onChange={e => setForm(p => ({ ...p, uomName: e.target.value }))} placeholder="Nos, Kg…" />
                            </div>
                        </div>
                        <div className="prd-lf-row">
                            <div className="prd-lf-field prd-lf-f2">
                                <label>Remarks</label>
                                <input className="prd-lf-input" value={form.remarks} onChange={e => setForm(p => ({ ...p, remarks: e.target.value }))} placeholder="Optional…" />
                            </div>
                        </div>
                        <div className="prd-lf-actions">
                            <button className="prd-lf-cancel" onClick={() => setForm(null)}>Cancel</button>
                            <button className="prd-lf-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : (form.id ? 'Update Line' : 'Add Line')}</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Cancel modal ──────────────────────────────────────────────────────────────
const CancelModal = ({ grn, currentUser, onCancelled, onClose }) => {
    const [reason, setReason] = useState('');
    const [busy,   setBusy]   = useState(false);
    const [error,  setError]  = useState('');
    const submit = () => {
        if (reason.trim().length < 5) { setError('Please enter a cancellation reason (min 5 characters).'); return; }
        setBusy(true); setError('');
        fetch(`${variables.API_URL}freeissuegrn/${grn.freeIssueGrnId}/cancel`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ cancelledBy: currentUser, reason: reason.trim() })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => { if (!ok) { setError(d.message || 'Error.'); return; } onCancelled(); })
            .catch(() => setError('Network error.'))
            .finally(() => setBusy(false));
    };
    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 460 }}>
                <div className="pf-header"><div className="pf-header-title">Cancel Free Issue GRN</div><button className="pf-close" onClick={onClose}>✕</button></div>
                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}
                    <div className="pf-field pf-f3">
                        <label>Reason <span className="req">*</span></label>
                        <textarea className="pf-input pf-textarea" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being cancelled?" />
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Back</button>
                    <button className="pf-btn-pri" style={{ background: '#b91c1c' }} onClick={submit} disabled={busy}>{busy ? 'Cancelling…' : 'Confirm Cancel'}</button>
                </div>
            </div>
        </div>
    );
};

// ── Revise modal (reason required) ────────────────────────────────────────────
const ReviseModal = ({ grn, currentUser, onRevised, onClose }) => {
    const [reason, setReason] = useState('');
    const [busy,   setBusy]   = useState(false);
    const [error,  setError]  = useState('');
    const submit = () => {
        if (reason.trim().length < 3) { setError('Please enter a revision reason (min 3 characters).'); return; }
        setBusy(true); setError('');
        fetch(`${variables.API_URL}freeissuegrn/${grn.freeIssueGrnId}/revise`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ revisedBy: currentUser, reason: reason.trim() })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => { if (!ok) { setError(d.message || 'Error.'); return; } onRevised(); })
            .catch(() => setError('Network error.'))
            .finally(() => setBusy(false));
    };
    return (
        <div className="pf-overlay">
            <div className="pf-panel" style={{ maxWidth: 460 }}>
                <div className="pf-header"><div className="pf-header-title">Revise Free Issue GRN</div><button className="pf-close" onClick={onClose}>✕</button></div>
                <div className="pf-body">
                    {error && <div className="pf-err">{error}</div>}
                    <div style={{ fontSize: 12.5, color: '#64748b', marginBottom: 10 }}>
                        This moves the GRN back to <strong>Draft</strong> for editing and logs a revision entry. Re-confirm it when done.
                    </div>
                    <div className="pf-field pf-f3">
                        <label>Revision Reason <span className="req">*</span></label>
                        <textarea className="pf-input pf-textarea" rows={3} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why is this being revised?" />
                    </div>
                </div>
                <div className="pf-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={submit} disabled={busy}>{busy ? 'Revising…' : 'Revise'}</button>
                </div>
            </div>
        </div>
    );
};

// ── History tab (revision log) ────────────────────────────────────────────────
const HistoryTab = ({ grn }) => {
    const [revs,    setRevs]    = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`${variables.API_URL}freeissuegrn/${grn.freeIssueGrnId}/revisions`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setRevs(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [grn.freeIssueGrnId]);

    const fmtDateTime = (d) => d
        ? new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

    return (
        <div className="prd-lines-wrap">
            <div className="prd-lines-header">
                <span className="prd-lines-title">Revision History ({revs.length})</span>
            </div>
            {loading ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>Loading…</div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table className="prd-lines-table">
                        <thead>
                            <tr><th style={{ width: 60 }}>Rev #</th><th>Reason</th><th style={{ width: 150 }}>Revised By</th><th style={{ width: 180 }}>Revised On</th></tr>
                        </thead>
                        <tbody>
                            {revs.length === 0 ? (
                                <tr><td colSpan={4} className="prd-lines-empty">No revisions yet. Revising a Confirmed GRN records an entry here.</td></tr>
                            ) : revs.map(r => (
                                <tr key={r.revisionId}>
                                    <td><span className="prd-line-num">{r.revisionNo}</span></td>
                                    <td style={{ whiteSpace: 'pre-wrap' }}>{r.reason}</td>
                                    <td>{r.revisedBy}</td>
                                    <td style={{ color: '#64748b', fontSize: 12 }}>{fmtDateTime(r.revisedDate)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ── Detail page ───────────────────────────────────────────────────────────────
const FreeIssueGrnDetailPage = () => {
    const { id }        = useParams();
    const navigate      = useNavigate();
    const currentUser   = useCurrentUser();
    const { canDo }     = usePermission();

    const [grn,       setGrn]       = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState(null);
    const [activeTab, setActiveTab] = useState('overview');
    const [showStatusMenu, setStatusMenu] = useState(false);
    const [actionError, setActionError] = useState('');
    const [showCancel, setShowCancel] = useState(false);
    const [showPrint,  setShowPrint]  = useState(false);
    const printFmt = usePrintFormat('FGRN');   // configured layout (Company Settings → Print Formats)
    const [showRevise, setShowRevise] = useState(false);
    const statusRef = useRef(null);

    const load = useCallback(() => {
        setLoading(true); setError(null);
        fetch(`${variables.API_URL}freeissuegrn/${id}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setGrn(d))
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (!showStatusMenu) return;
        const handler = (e) => { if (statusRef.current && !statusRef.current.contains(e.target)) setStatusMenu(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [showStatusMenu]);

    const doChangeStatus = (newStatus) => {
        setActionError('');
        fetch(`${variables.API_URL}freeissuegrn/changestatus`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({ id: Number(id), status: newStatus, changedBy: currentUser })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => { if (!ok) { setActionError(d?.message || 'Status change failed.'); return; } load(); })
            .catch(() => setActionError('Network error.'));
    };

    const changeStatus = (newStatus) => {
        setStatusMenu(false);
        if (newStatus === 'Cancelled') { setShowCancel(true); return; }
        doChangeStatus(newStatus);
    };

    if (loading) return (
        <div className="jd-page-loading"><div className="jd-page-spinner" /><span>Loading free issue GRN…</span></div>
    );
    if (error) return (
        <div className="jd-page-loading">
            <div style={{ color: '#dc2626', fontSize: 14, fontWeight: 600 }}>⚠ {error}</div>
            <button className="jd-back-btn" style={{ marginTop: 12 }} onClick={() => navigate('/free-issue-grn')}>← Back</button>
        </div>
    );
    if (!grn) return null;

    const sc = statusOf(grn.status);
    const transitions = TRANSITIONS[grn.status] || [];
    const canEdit = canDo('/free-issue-grn', 'EDIT');

    return (
        <div className="jd-page">
            {showCancel && (
                <CancelModal grn={grn} currentUser={currentUser}
                    onCancelled={() => { setShowCancel(false); load(); }}
                    onClose={() => setShowCancel(false)} />
            )}
            {showPrint && <FreeIssueGrnPrintModal grn={grn} onClose={() => setShowPrint(false)} />}
            {showRevise && (
                <ReviseModal grn={grn} currentUser={currentUser}
                    onRevised={() => { setShowRevise(false); load(); }}
                    onClose={() => setShowRevise(false)} />
            )}

            {/* ── HEADER ── */}
            <div className="jd-header">
                <div className="jd-header-left">
                    <button className="jd-back-btn" onClick={() => navigate('/free-issue-grn')}>← Free Issue GRN</button>
                    <div className="jd-header-sep" />
                    <div className="jd-header-id">{grn.freeIssueGrnNumber}</div>
                    <div className="jd-header-info">
                        {grn.customerName && (
                            <span className="jd-header-customer">{grn.customerName}</span>
                        )}
                        {grn.jobId && (
                            <><span className="jd-header-dot">·</span>
                            <span className="jd-header-project">{grn.jobId}{grn.jobTitle ? ` — ${grn.jobTitle}` : ''}</span></>
                        )}
                    </div>
                </div>
                <div className="jd-header-right">
                    <span className="cd-flag-badge" style={{ background: sc.bg, color: sc.color }}>
                        <span className="cd-flag-dot" style={{ background: sc.dot }} />{sc.label}
                    </span>
                    <button className="jd-stage-btn" onClick={() => setShowPrint(printFmt)} title="Print / Save as PDF"
                        style={{ display: 'flex', alignItems: 'center', gap: 5 }}>🖨 Print</button>
                    {grn.status === 'Confirmed' && canEdit && (
                        <button className="jd-stage-btn" onClick={() => setShowRevise(true)}
                            title="Reopen this GRN for editing"
                            style={{ display: 'flex', alignItems: 'center', gap: 5 }}>✎ Revise</button>
                    )}
                    {transitions.length > 0 && canEdit && (
                        <div className="prd-status-wrap" ref={statusRef}>
                            <button className="jd-stage-btn" onClick={() => setStatusMenu(o => !o)}>Change Status ▾</button>
                            {showStatusMenu && (
                                <div className="prd-status-menu">
                                    {transitions.map(t => (
                                        <div key={t} className="prd-status-item" onClick={() => changeStatus(t)}>→ {t}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── KPI STRIP ── */}
            <div className="jd-kpi-strip">
                {[
                    { label: 'Date of Receipt', val: fmtDate(grn.receiptDate), cls: '' },
                    { label: 'Customer',        val: grn.customerName || '—',  cls: '' },
                    { label: 'Received By',     val: grn.receivedBy || '—',    cls: '' },
                    { label: 'Delivered By',    val: grn.deliveredBy || '—',   cls: '' },
                    grn.boeNo && { label: 'BOE No', val: grn.boeNo, cls: 'jd-kpi-mono' },
                    { label: 'Job',   val: grn.jobId || '—',   cls: 'jd-kpi-mono' },
                    { label: 'Lines', val: grn.lineCount ?? 0, cls: 'jd-kpi-blue' },
                ].filter(Boolean).map((k, i) => (
                    <React.Fragment key={k.label}>
                        {i > 0 && <div className="jd-kpi-div" />}
                        <div className="jd-kpi">
                            <div className="jd-kpi-label">{k.label}</div>
                            <div className={`jd-kpi-val ${k.cls}`}>{k.val}</div>
                        </div>
                    </React.Fragment>
                ))}
            </div>

            {/* ── TAB BAR ── */}
            <div className="jd-tabs-bar">
                {FI_TABS.map(tab => (
                    <button key={tab.key}
                        className={`jd-tab-btn ${activeTab === tab.key ? 'jd-tab-active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}>
                        <span className="jd-tab-icon">{tab.icon}</span>
                        {tab.label}
                        {tab.key === 'lines'     && grn.lineCount     > 0 && <span className="jd-tab-badge">{grn.lineCount}</span>}
                        {tab.key === 'documents' && grn.documentCount > 0 && <span className="jd-tab-badge">{grn.documentCount}</span>}
                        {tab.key === 'history'   && grn.revisionCount > 0 && <span className="jd-tab-badge">{grn.revisionCount}</span>}
                    </button>
                ))}
            </div>

            {/* ── TAB CONTENT ── */}
            <div className="jd-tab-content">
                <InlineError error={actionError} onDismiss={() => setActionError('')} />
                {activeTab === 'overview'  && <OverviewTab grn={grn} onRefresh={load} />}
                {activeTab === 'lines'     && <LinesTab    grn={grn} onRefresh={load} />}
                {activeTab === 'documents' && <FreeIssueGrnDocumentsTab grn={grn} onRefresh={load} />}
                {activeTab === 'history'   && <HistoryTab grn={grn} />}
            </div>
        </div>
    );
};

export default FreeIssueGrnDetailPage;
