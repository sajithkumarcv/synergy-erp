import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmtDate, fmtDateTime } from '../../inventoryConstants';
import { useFieldConfig } from '../../../FieldConfigContext';

// ── Read-only locked chip ─────────────────────────────────────
const LockedChip = ({ value, bg = '#f0f9ff', color = '#1e40af' }) => (
    <div className="pf-input" style={{ background: bg, color, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none' }}>
        <span style={{ opacity: .55, fontSize: 10 }}>🔒</span> {value || '—'}
    </div>
);

// ── Read-only card ────────────────────────────────────────────
const Field = ({ label, children, mono }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className={`prd-ov-val${mono ? ' prd-ov-val-mono' : ''}`}>
            {children || <span className="prd-ov-val-muted">—</span>}
        </div>
    </div>
);

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

// ── IssueRequestOverviewTab ───────────────────────────────────
const IssueRequestOverviewTab = ({ issueRequest, onRefresh }) => {
    const currentUser         = useCurrentUser();
    const { getStatusConfig } = useLookup();
    const { isReq }           = useFieldConfig('STOCK_ISSUE_REQUEST');
    const { canDo }           = usePermission();

    const [editing,    setEditing]    = useState(false);
    const [form,       setForm]       = useState({});
    const [saving,     setSaving]     = useState(false);
    const [error,      setError]      = useState('');
    const [issueTypes, setIssueTypes] = useState([]);

    // CanEdit comes from TBL_DOCUMENT_STATUS; the Draft fallback keeps the page
    // usable if the ISR status rows are ever missing.
    const canEdit = (getStatusConfig('ISR', issueRequest.status)?.canEdit ?? (issueRequest.status === 'Draft'))
                    && canDo('/inventory-issue-request', 'EDIT');

    useEffect(() => {
        fetch(`${variables.API_URL}stockissue/types`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setIssueTypes(Array.isArray(d) ? d : []))
            .catch(() => setIssueTypes([]));
    }, []);

    const startEdit = () => {
        setForm({
            requestDate:  issueRequest.requestDate  ? issueRequest.requestDate.slice(0, 10)  : '',
            requiredDate: issueRequest.requiredDate ? issueRequest.requiredDate.slice(0, 10) : '',
            issueTypeId:  String(issueRequest.issueTypeId || ''),
            requestedBy:  issueRequest.requestedBy  || '',
            department:   issueRequest.department   || '',
            requestedFor: issueRequest.requestedFor || '',
            priority:     issueRequest.priority     || '',
            notes:        issueRequest.notes        || '',
        });
        setEditing(true);
        setError('');
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
    };

    const save = () => {
        if (!form.requestDate)        { setError('Request Date is required.'); return; }
        if (!form.requestedBy.trim()) { setError('Requested By is required.'); return; }
        if (!form.issueTypeId)        { setError('Issue Type is required.'); return; }

        setError(''); setSaving(true);
        fetch(`${variables.API_URL}issuerequest/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                requestId:    issueRequest.requestId,
                jobId:        issueRequest.jobId,          // set at creation, locked
                issueTypeId:  Number(form.issueTypeId),
                requestDate:  form.requestDate,
                requiredDate: form.requiredDate || null,
                requestedBy:  form.requestedBy.trim(),
                department:   form.department.trim()   || null,
                requestedFor: form.requestedFor.trim() || null,
                priority:     form.priority            || null,
                notes:        form.notes.trim()        || null,
                createdBy:    issueRequest.createdBy,
                modifiedBy:   currentUser,
            }),
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

    // ── Edit form ─────────────────────────────────────────────
    if (editing) {
        const lbl   = { fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4, display: 'block' };
        const field = { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 130 };
        const row   = { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 };

        return (
            <div>
                {error && <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>}

                {/* Locked: the job is the cost target and is fixed at creation */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>Job <span style={{ fontWeight: 400, textTransform: 'none', color: '#64748b', marginLeft: 4 }}>(set at creation — locked)</span></label>
                        <LockedChip value={issueRequest.jobId} bg="#f0fdf4" color="#166534" />
                    </div>
                    <div style={{ ...field, flex: 2 }}>
                        <label style={lbl}>Customer</label>
                        <LockedChip value={issueRequest.customerName} bg="#f8fafc" color="#374151" />
                    </div>
                </div>

                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>Request Date {isReq('requestDate') && <span className="req">*</span>}</label>
                        <input className="pf-input" type="date" name="requestDate" value={form.requestDate} onChange={handle} />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Required Date</label>
                        <input className="pf-input" type="date" name="requiredDate" value={form.requiredDate} onChange={handle} />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Issue Type {isReq('issueTypeId') && <span className="req">*</span>}</label>
                        <select className="pf-input" name="issueTypeId" value={form.issueTypeId} onChange={handle}>
                            <option value="">— Select —</option>
                            {issueTypes.map(t => (
                                <option key={t.issueTypeId} value={t.issueTypeId}>{t.issueTypeName}</option>
                            ))}
                        </select>
                    </div>
                    <div style={field}>
                        <label style={lbl}>Priority</label>
                        <select className="pf-input" name="priority" value={form.priority} onChange={handle}>
                            <option value="">— None —</option>
                            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                </div>

                <div style={row}>
                    <div style={{ ...field, flex: 2 }}>
                        <label style={lbl}>Requested By {isReq('requestedBy') && <span className="req">*</span>}</label>
                        <input className="pf-input" type="text" name="requestedBy" value={form.requestedBy} onChange={handle}
                            placeholder="Name of the person asking for the material…" />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Department</label>
                        <input className="pf-input" type="text" name="department" value={form.department} onChange={handle} />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Requested For</label>
                        <input className="pf-input" type="text" name="requestedFor" value={form.requestedFor} onChange={handle} />
                    </div>
                </div>

                <div style={row}>
                    <div style={{ ...field, flex: 3 }}>
                        <label style={lbl}>Notes</label>
                        <textarea className="pf-input pf-textarea" rows={3} name="notes" value={form.notes} onChange={handle}
                            placeholder="Optional notes…" />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button className="pf-btn-sec" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                </div>
            </div>
        );
    }

    // ── Read-only view ────────────────────────────────────────
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                {canEdit && <button className="jd-stage-btn" onClick={startEdit}>✏ Edit</button>}
            </div>

            <div className="prd-ov-grid">
                <Field label="Request No"   mono>{issueRequest.requestNo}</Field>
                <Field label="Request Date"     >{fmtDate(issueRequest.requestDate)}</Field>
                <Field label="Required Date"    >{issueRequest.requiredDate ? fmtDate(issueRequest.requiredDate) : null}</Field>
                <Field label="Job"          mono>{issueRequest.jobId}</Field>
                <Field label="Customer"         >{issueRequest.customerName}</Field>
                <Field label="Issue Type"       >{issueRequest.issueTypeName}</Field>
                <Field label="Requested By"     >{issueRequest.requestedBy}</Field>
                {issueRequest.department   && <Field label="Department">{issueRequest.department}</Field>}
                {issueRequest.requestedFor && <Field label="Requested For">{issueRequest.requestedFor}</Field>}
                {issueRequest.priority     && <Field label="Priority">{issueRequest.priority}</Field>}
                <Field label="Status"           >{issueRequest.status}</Field>
                {issueRequest.reservationExpiryDate && (
                    <Field label="Reservation Expires">{fmtDate(issueRequest.reservationExpiryDate)}</Field>
                )}
                <Field label="Created By">{issueRequest.createdBy}</Field>
                {issueRequest.modifiedBy && <Field label="Last Modified By">{issueRequest.modifiedBy}</Field>}
            </div>

            {issueRequest.notes && (
                <div className="prd-ov-notes">
                    <div className="prd-ov-notes-label">Notes</div>
                    <div className="prd-ov-notes-text">{issueRequest.notes}</div>
                </div>
            )}

            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 16, lineHeight: 2 }}>
                <div>Created by <strong>{issueRequest.createdBy}</strong> on {fmtDateTime(issueRequest.createdDate)}</div>
                {issueRequest.modifiedBy && (
                    <div>Modified by <strong>{issueRequest.modifiedBy}</strong> on {fmtDateTime(issueRequest.modifiedDate)}</div>
                )}
            </div>
        </div>
    );
};

export default IssueRequestOverviewTab;
