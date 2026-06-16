import React, { useState } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmt, fmtDate, fmtDateTime } from '../../inventoryConstants';
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

// ── IssueReturnOverviewTab ────────────────────────────────────
const IssueReturnOverviewTab = ({ issueReturn, onRefresh }) => {
    const currentUser         = useCurrentUser();
    const { getStatusConfig } = useLookup();
    const { isReq } = useFieldConfig('STOCK_ISSUE_RETURN');

    const [editing, setEditing] = useState(false);
    const [form,    setForm]    = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    const { canDo } = usePermission();
    const canEdit = (getStatusConfig('IRN', issueReturn.status)?.canEdit ?? (issueReturn.status === 'Draft')) && canDo('/inventory-issue-return', 'EDIT');

    const costingLabel = issueReturn.costingType === 'INC_COSTING' ? 'Including Costing' : 'Excluding Costing';

    const startEdit = () => {
        setForm({
            returnDate: issueReturn.returnDate ? issueReturn.returnDate.slice(0, 10) : '',
            returnedBy: issueReturn.returnedBy || '',
            notes:      issueReturn.notes      || '',
        });
        setEditing(true);
        setError('');
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
    };

    const save = () => {
        if (!form.returnDate) { setError('Return Date is required.'); return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}stockissuereturn/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                returnId:   issueReturn.returnId,
                issueId:    issueReturn.issueId,
                returnDate: form.returnDate,
                returnedBy: form.returnedBy.trim() || null,
                notes:      form.notes.trim()      || null,
                modifiedBy: currentUser,
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

                {/* Locked: Issue Note + Job */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>Issue Note <span style={{ fontWeight: 400, textTransform: 'none', color: '#64748b', marginLeft: 4 }}>(set at creation — locked)</span></label>
                        <LockedChip value={issueReturn.issueNo} bg="#f0f9ff" color="#1e40af" />
                    </div>
                    {issueReturn.jobId && (
                        <div style={field}>
                            <label style={lbl}>Job</label>
                            <LockedChip value={issueReturn.jobId} bg="#f0fdf4" color="#166534" />
                        </div>
                    )}
                </div>

                {/* Costing Type */}
                <div style={row}>
                    <div style={{ ...field, flex: 2 }}>
                        <label style={lbl}>Costing Type</label>
                        <LockedChip value={costingLabel} bg="#f8fafc" color="#374151" />
                    </div>
                    {issueReturn.issuedTo && (
                        <div style={{ ...field, flex: 2 }}>
                            <label style={lbl}>Issued To</label>
                            <LockedChip value={issueReturn.issuedTo} bg="#f8fafc" color="#374151" />
                        </div>
                    )}
                </div>

                {/* Return Date + Returned By */}
                <div style={row}>
                    <div style={field}>
                        <label style={lbl}>Return Date {isReq('returnDate') && <span className="req">*</span>}</label>
                        <input className="pf-input" type="date" name="returnDate" value={form.returnDate} onChange={handle} />
                    </div>
                    <div style={{ ...field, flex: 2 }}>
                        <label style={lbl}>Returned By</label>
                        <input className="pf-input" type="text" name="returnedBy" value={form.returnedBy} onChange={handle}
                            placeholder="Name of person returning items…" />
                    </div>
                </div>

                {/* Notes */}
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
                <Field label="Return No"    mono>{issueReturn.returnNo}</Field>
                <Field label="Return Date"      >{fmtDate(issueReturn.returnDate)}</Field>
                <Field label="Issue Note"   mono>{issueReturn.issueNo}</Field>
                {issueReturn.jobId      && <Field label="Job"         mono>{issueReturn.jobId}</Field>}
                <Field label="Costing Type"     >{costingLabel}</Field>
                {issueReturn.issuedTo   && <Field label="Issued To"       >{issueReturn.issuedTo}</Field>}
                {issueReturn.returnedBy && <Field label="Returned By"     >{issueReturn.returnedBy}</Field>}
                <Field label="Status"           >{issueReturn.status}</Field>
                <div className="prd-ov-card" style={{ borderColor: '#dbeafe', background: '#f0f7ff' }}>
                    <div className="prd-ov-label">Total Value</div>
                    <div className="prd-ov-val" style={{ color: '#1e40af', fontWeight: 600, fontSize: 15 }}>
                        {fmt(issueReturn.totalCost)}
                    </div>
                </div>
                <Field label="Created By">{issueReturn.createdBy}</Field>
                {issueReturn.modifiedBy && <Field label="Last Modified By">{issueReturn.modifiedBy}</Field>}
            </div>

            {issueReturn.notes && (
                <div className="prd-ov-notes">
                    <div className="prd-ov-notes-label">Notes</div>
                    <div className="prd-ov-notes-text">{issueReturn.notes}</div>
                </div>
            )}

            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 16, lineHeight: 2 }}>
                <div>Created by <strong>{issueReturn.createdBy}</strong> on {fmtDateTime(issueReturn.createdDate)}</div>
                {issueReturn.modifiedBy && (
                    <div>Modified by <strong>{issueReturn.modifiedBy}</strong> on {fmtDateTime(issueReturn.modifiedDate)}</div>
                )}
            </div>
        </div>
    );
};

export default IssueReturnOverviewTab;
