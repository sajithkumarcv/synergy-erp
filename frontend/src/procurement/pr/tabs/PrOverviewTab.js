import React, { useState } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmtDate, today, PRIORITY_CONFIG } from '../../procurementConstants';
import { useFieldConfig } from '../../../FieldConfigContext';

const Field = ({ label, children, mono }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className={`prd-ov-val ${mono ? 'prd-ov-val-mono' : ''}`}>{children || <span className="prd-ov-val-muted">—</span>}</div>
    </div>
);

const PrOverviewTab = ({ pr, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { vlist, getStatusConfig } = useLookup();
    const { isReq } = useFieldConfig('PR');
    const priorities  = vlist?.['PR.Priority'] || [];

    const [editing, setEditing] = useState(false);
    const [form,    setForm]    = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');
    const [jobs,    setJobs]    = useState([]);

    const startEdit = () => {
        setForm({
            prDate:      pr.prDate ? pr.prDate.slice(0, 10) : today(),
            requestedBy: pr.requestedBy || '',
            jobId:       pr.jobId || '',
            priority:    pr.priority || 'Normal',
            notes:       pr.notes || '',
        });
        setEditing(true);
        setError('');
        // load jobs for dropdown
        fetch(`${variables.API_URL}job/search?pageSize=200&page=1&sortCol=JobNumber&sortDir=DESC`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setJobs(d.data || [])).catch(console.error);
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
    };

    const save = () => {
        if (!form.requestedBy.trim()) { setError('Requested By is required.'); return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}purchaserequest/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                prId:        pr.prId,
                prDate:      form.prDate,
                requestedBy: form.requestedBy.trim(),
                jobId:       form.jobId || null,
                priority:    form.priority || null,
                status:      pr.status,
                notes:       form.notes.trim() || null,
                isActive:    pr.isActive,
                createdBy:   pr.createdBy,
                modifiedBy:  currentUser,
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

    const priCfg  = PRIORITY_CONFIG[pr.priority] || {};
    const { canDo } = usePermission();
    const canEdit = (getStatusConfig('PR', pr.status)?.canEdit ?? (pr.status === 'Draft')) && canDo('/purchase-requests', 'EDIT');

    if (editing) {
        return (
            <div>
                {error && <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 130 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4 }}>PR Date</label>
                        <input className="pf-input" type="date" name="prDate" value={form.prDate} onChange={handle} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 130 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4 }}>Requested By {isReq('requestedBy') && <span className="req">*</span>}</label>
                        <input className="pf-input" type="text" name="requestedBy" value={form.requestedBy} onChange={handle} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 130 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4 }}>Priority</label>
                        <select className="pf-input" name="priority" value={form.priority} onChange={handle}>
                            {priorities.length > 0
                                ? priorities.map(p => <option key={p.value} value={p.value}>{p.label}</option>)
                                : ['Low','Normal','High','Urgent'].map(p => <option key={p} value={p}>{p}</option>)
                            }
                        </select>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 2, minWidth: 200 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4 }}>Linked Job</label>
                        <select className="pf-input" name="jobId" value={form.jobId} onChange={handle}>
                            <option value="">— No Job —</option>
                            {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 200 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4 }}>Notes</label>
                        <textarea className="pf-input pf-textarea" rows={3} name="notes" value={form.notes} onChange={handle} />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                    <button className="pf-btn-sec" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                {canEdit && (
                    <button className="jd-stage-btn" onClick={startEdit}>✏ Edit</button>
                )}
            </div>

            <div className="prd-ov-grid">
                <Field label="PR Number" mono>{pr.prNumber}</Field>
                <Field label="Date">{fmtDate(pr.prDate)}</Field>
                <Field label="Requested By">{pr.requestedBy}</Field>
                <Field label="Priority">
                    {pr.priority
                        ? <span style={{ background: priCfg.bg, color: priCfg.color, padding: '2px 8px', borderRadius: 8, fontSize: 11, fontWeight: 600 }}>{pr.priority}</span>
                        : null
                    }
                </Field>
                <Field label="Linked Job">{pr.jobId ? `${pr.jobId}${pr.jobTitle ? ' — ' + pr.jobTitle : ''}` : null}</Field>
                <Field label="Lines">{pr.lineCount || 0}</Field>
                <Field label="POs Raised">{pr.poCount || 0}</Field>
                <Field label="Created By">{pr.createdBy}</Field>
                {pr.modifiedBy && <Field label="Last Modified By">{pr.modifiedBy}</Field>}
            </div>

            {pr.notes && (
                <div className="prd-ov-notes">
                    <div className="prd-ov-notes-label">Notes / Justification</div>
                    <div className="prd-ov-notes-text">{pr.notes}</div>
                </div>
            )}
        </div>
    );
};

export default PrOverviewTab;
