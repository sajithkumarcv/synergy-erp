import React, { useState } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmt, fmtDate, fmtDateTime, today } from '../../inventoryConstants';
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

// ── IssueOverviewTab ──────────────────────────────────────────
const IssueOverviewTab = ({ issue, onRefresh }) => {
    const currentUser         = useCurrentUser();
    const { getStatusConfig } = useLookup();
    const { isReq }           = useFieldConfig('ISSUE');

    const [editing, setEditing] = useState(false);
    const [form,    setForm]    = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    const { canDo } = usePermission();
    const canEdit = (getStatusConfig('ISN', issue.status)?.canEdit ?? (issue.status === 'Draft')) && canDo('/inventory-issue', 'EDIT');
    const costingLabel = issue.costingType === 'INC_COSTING' ? 'Including Costing' : 'Excluding Costing';

    const startEdit = () => {
        setForm({
            issueDate:   issue.issueDate   ? issue.issueDate.slice(0, 10)   : today(),
            costingType: issue.costingType || 'INC_COSTING',
            issuedTo:    issue.issuedTo    || '',
            notes:       issue.notes       || '',
        });
        setEditing(true);
        setError('');
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
    };

    const save = () => {
        if (!form.issueDate)            { setError('Issue Date is required.'); return; }
        if (!form.costingType)          { setError('Issue Type is required.'); return; }
        if (!form.issuedTo?.trim())     { setError('Issued To is required.');  return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}stockissue/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                issueId:     issue.issueId,
                issueDate:   form.issueDate,
                jobId:       issue.jobId,
                costingType: form.costingType,
                issuedTo:    form.issuedTo.trim(),
                notes:       form.notes.trim()    || null,
                modifiedBy:  currentUser,
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

    // ── Edit form ────────────────────────────────────────────────
    if (editing) {
        const lbl   = { fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4, display: 'block' };
        const field = { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 130 };
        const row   = { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 };

        return (
            <div>
                {error && <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>}

                {/* Row 1: Issue Date + Job (locked) */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>Issue Date {isReq('issueDate') && <span className="req">*</span>}</label>
                        <input className="pf-input" type="date" name="issueDate" value={form.issueDate} onChange={handle} />
                    </div>
                    <div style={{ ...field, flex: 2 }}>
                        <label style={lbl}>
                            Job <span style={{ fontWeight: 400, textTransform: 'none', color: '#64748b', marginLeft: 4 }}>(set at creation — locked)</span>
                        </label>
                        <LockedChip
                            value={`${issue.jobId}${issue.projectName ? ' — ' + issue.projectName : ''}`}
                            bg="#f0fdf4" color="#166534"
                        />
                    </div>
                </div>

                {/* Customer / Project — read-only display */}
                {(issue.customerName || issue.projectName) && (
                    <div style={row}>
                        {issue.customerName && (
                            <div style={{ ...field, flex: 2 }}>
                                <label style={lbl}>Customer</label>
                                <LockedChip value={issue.customerName} bg="#f8fafc" color="#374151" />
                            </div>
                        )}
                        {issue.projectName && (
                            <div style={{ ...field, flex: 2 }}>
                                <label style={lbl}>Project</label>
                                <LockedChip value={issue.projectName} bg="#f8fafc" color="#374151" />
                            </div>
                        )}
                    </div>
                )}

                {/* Row 2: Issue Type + Issued To */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>Issue Type <span className="req">*</span></label>
                        <select className="pf-input" name="costingType" value={form.costingType} onChange={handle}>
                            <option value="">-- Select --</option>
                            <option value="INC_COSTING">Including Costing</option>
                            <option value="EXC_COSTING">Excluding Costing</option>
                        </select>
                    </div>
                    <div style={{ ...field, flex: 2 }}>
                        <label style={lbl}>Issued To <span className="req">*</span></label>
                        <input className="pf-input" type="text" name="issuedTo" value={form.issuedTo} onChange={handle}
                            placeholder="Person or department receiving the items…" />
                    </div>
                </div>

                {/* Row 3: Notes */}
                <div style={row}>
                    <div style={{ ...field, flex: 3 }}>
                        <label style={lbl}>Notes</label>
                        <textarea className="pf-input pf-textarea" rows={3} name="notes" value={form.notes} onChange={handle} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button className="pf-btn-sec" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                </div>
            </div>
        );
    }

    // ── Read-only view ───────────────────────────────────────────
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                {canEdit && <button className="jd-stage-btn" onClick={startEdit}>✏ Edit</button>}
            </div>

            <div className="prd-ov-grid">
                <Field label="Issue No"   mono>{issue.issueNo}</Field>
                <Field label="Issue Date"      >{fmtDate(issue.issueDate)}</Field>
                <Field label="Job"        mono>{issue.jobId}</Field>
                {issue.customerName && <Field label="Customer">{issue.customerName}</Field>}
                {issue.projectName  && <Field label="Project" >{issue.projectName}</Field>}
                <Field label="Issue Type"      >{costingLabel}</Field>
                {issue.issuedTo     && <Field label="Issued To">{issue.issuedTo}</Field>}
                <Field label="Status"          >{issue.status}</Field>
                <div className="prd-ov-card" style={{ borderColor: '#dbeafe', background: '#f0f7ff' }}>
                    <div className="prd-ov-label">Total Cost</div>
                    <div className="prd-ov-val" style={{ color: '#1e40af', fontWeight: 600, fontSize: 15 }}>
                        {fmt(issue.totalCost)}
                    </div>
                </div>
                <Field label="Created By">{issue.createdBy}</Field>
                {issue.modifiedBy && <Field label="Last Modified By">{issue.modifiedBy}</Field>}
            </div>

            {issue.notes && (
                <div className="prd-ov-notes">
                    <div className="prd-ov-notes-label">Notes</div>
                    <div className="prd-ov-notes-text">{issue.notes}</div>
                </div>
            )}

            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 16, lineHeight: 2 }}>
                <div>Created by <strong>{issue.createdBy}</strong> on {fmtDateTime(issue.createdDate)}</div>
                {issue.modifiedBy && (
                    <div>Modified by <strong>{issue.modifiedBy}</strong> on {fmtDateTime(issue.modifiedDate)}</div>
                )}
            </div>
        </div>
    );
};

export default IssueOverviewTab;
