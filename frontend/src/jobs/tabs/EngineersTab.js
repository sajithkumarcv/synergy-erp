import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { canEdit, fmtDate } from '../jobConstants';
import { useFieldConfig } from '../../FieldConfigContext';
import AlertModal from '../../common/AlertModal';
import ConfirmModal from '../../common/ConfirmModal';

// Dynamic badge colour from role name
const ROLE_PALETTE = [
    { bg: '#ede9fe', color: '#5b21b6' },
    { bg: '#dbeafe', color: '#1e40af' },
    { bg: '#fef9c3', color: '#854d0e' },
    { bg: '#dcfce7', color: '#166534' },
    { bg: '#fee2e2', color: '#991b1b' },
    { bg: '#fce7f3', color: '#9d174d' },
    { bg: '#e0f2fe', color: '#0369a1' },
    { bg: '#fdf4ff', color: '#7e22ce' },
];
const roleStyle = (role) => {
    if (!role) return { bg: '#f1f5f9', color: '#475569' };
    let h = 0;
    for (let i = 0; i < role.length; i++) h = (h * 31 + role.charCodeAt(i)) & 0xff;
    return ROLE_PALETTE[h % ROLE_PALETTE.length];
};

const EngineersTab = ({ job, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { isReq } = useFieldConfig('JOB_ENGINEER');

    const [assigned,  setAssigned]  = useState([]);
    const [engineers, setEngineers] = useState([]);
    const [roles,     setRoles]     = useState([]);
    const [form,      setForm]      = useState(null);
    const [saving,    setSaving]    = useState(false);
    const [loading,   setLoading]   = useState(true);
    const [alertMsg,  setAlertMsg]  = useState(null);
    const [confirm,   setConfirm]   = useState(null);

    const editable = canEdit(job?.jobStatusId);

    const load = useCallback(() => {
        if (!job?.jobId) return;
        setLoading(true);
        fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/engineers`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setAssigned(Array.isArray(d) ? d : []))
            .catch(e => console.error('Load engineers:', e))
            .finally(() => setLoading(false));
    }, [job?.jobId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        fetch(`${variables.API_URL}job/engineers`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setEngineers(Array.isArray(d) ? d : []))
            .catch(e => console.error('Load engineer list:', e));

        fetch(`${variables.API_URL}job/roles`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setRoles(Array.isArray(d) ? d : []))
            .catch(e => console.error('Load roles:', e));
    }, []);

    const assignedIds = new Set(assigned.map(a => a.engineerId));

    const emptyForm = () => ({
        jobEngineerId: 0, jobId: job.jobId,
        engineerId: '', role: '', completed: false, assignedBy: currentUser,
    });

    const handle = (e) => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };

    const save = async () => {
        if (!form.engineerId) { setAlertMsg('Please select an engineer.'); return; }
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/engineers`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ ...form, engineerId: Number(form.engineerId) })
            });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d?.message || 'Failed to save engineer.'); return; }
            load(); setForm(null); if (onRefresh) onRefresh();
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setSaving(false); }
    };

    const del = (id) => {
        setConfirm({
            title: 'Remove Engineer',
            message: 'Remove this engineer from the job?',
            confirmLabel: 'Remove',
            onConfirm: async () => {
                setConfirm(null);
                try {
                    const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/engineers/${id}`, {
                        method: 'DELETE', headers: authHeaders()
                    });
                    if (!res.ok) { const d = await res.json(); setAlertMsg(d?.message || 'Failed to remove engineer.'); return; }
                    load(); if (onRefresh) onRefresh();
                } catch { setAlertMsg('Network error. Please try again.'); }
            },
        });
    };

    const initials = (name = '') =>
        name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

    return (
        <div className="tab-section">
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            <div className="tab-toolbar">
                <div className="tab-toolbar-left">
                    <span className="tab-section-title">Assigned Engineers</span>
                    <span className="tab-count-badge">{assigned.length}</span>
                    {!editable && <span className="tab-locked-badge">🔒 Locked</span>}
                </div>
                {editable && !form && (
                    <button className="tab-btn-pri" onClick={() => setForm(emptyForm())}>+ Assign Engineer</button>
                )}
            </div>

            {/* ── Inline form ── */}
            {form && (
                <div className={`tab-inline-form ${form.jobEngineerId > 0 ? 'tab-form-edit' : 'tab-form-new'}`}>
                    <div className="tab-form-title">{form.jobEngineerId > 0 ? '✎ Edit Assignment' : '+ Assign Engineer'}</div>
                    <div className="tab-form-row">
                        <div className="tab-form-field">
                            <label>Engineer {isReq('engineerId') && <span className="req">*</span>}</label>
                            <select name="engineerId" className="tab-input" value={form.engineerId} onChange={handle}>
                                <option value="">-- Select Engineer --</option>
                                {engineers
                                    .filter(e => form.jobEngineerId > 0 || !assignedIds.has(e.engineerId))
                                    .map(e => <option key={e.engineerId} value={e.engineerId}>{e.engineerName}</option>)}
                            </select>
                        </div>
                        <div className="tab-form-field">
                            <label>Job Role</label>
                            <select name="role" className="tab-input" value={form.role} onChange={handle}>
                                <option value="">-- Select Role --</option>
                                {roles.map(r => (
                                    <option key={r.jobRoleId} value={r.jobRoleName}>{r.jobRoleName}</option>
                                ))}
                            </select>
                        </div>
                        <div className="tab-form-field tab-fcheck">
                            <label>&nbsp;</label>
                            <label className="tab-check">
                                <input type="checkbox" name="completed" checked={!!form.completed} onChange={handle} />
                                <span>Mark as Completed</span>
                            </label>
                        </div>
                    </div>
                    <div className="tab-form-actions">
                        <button className="tab-btn-sec" onClick={() => setForm(null)}>Cancel</button>
                        <button
                            className={form.jobEngineerId > 0 ? 'tab-btn-amber' : 'tab-btn-pri'}
                            onClick={save}
                            disabled={saving}
                        >
                            {saving ? 'Saving…' : (form.jobEngineerId > 0 ? 'Update' : 'Assign')}
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="tab-loading">Loading engineers…</div>
            ) : assigned.length === 0 ? (
                <div className="eng-empty">
                    <div className="eng-empty-icon">👷</div>
                    <div className="eng-empty-text">No engineers assigned yet.</div>
                    {editable && (
                        <button className="tab-btn-pri" style={{ marginTop: 12 }} onClick={() => setForm(emptyForm())}>
                            + Assign First Engineer
                        </button>
                    )}
                </div>
            ) : (
                <div className="eng-grid">
                    {assigned.map(a => {
                        const rs = roleStyle(a.role);
                        return (
                            <div key={a.jobEngineerId} className={`eng-card ${a.completed ? 'eng-card-done' : ''}`}>
                                <div className="eng-card-avatar">{initials(a.engineerName)}</div>
                                <div className="eng-card-body">
                                    <div className="eng-card-name">{a.engineerName}</div>
                                    {a.email && <div className="eng-card-email">{a.email}</div>}
                                    <div className="eng-card-meta">
                                        {a.role && (
                                            <span className="eng-role-badge" style={{ background: rs.bg, color: rs.color }}>
                                                {a.role}
                                            </span>
                                        )}
                                        {a.completed && <span className="tab-badge-green">✓ Done</span>}
                                        {a.assignedDate && <span className="eng-assigned-date">Assigned {fmtDate(a.assignedDate)}</span>}
                                    </div>
                                </div>
                                {editable && (
                                    <div className="eng-card-actions">
                                        <button
                                            className="tab-act-btn tab-act-edit"
                                            onClick={() => setForm({ ...a, assignedBy: currentUser })}
                                        >
                                            Edit
                                        </button>
                                        <button className="tab-act-btn tab-act-del" onClick={() => del(a.jobEngineerId)}>
                                            Remove
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default EngineersTab;
