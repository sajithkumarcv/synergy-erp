import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { useLookup } from '../LookupContext';
import { usePermission } from '../PermissionContext';
import './Settings.css';

// ── Constants ────────────────────────────────────────────────────────────────
const MODULES = ['PR', 'PO'];

const EMPTY_FORM = {
    statusId:           0,
    moduleName:         'PR',
    statusCode:         '',
    statusLabel:        '',
    badgeBg:            '#f1f5f9',
    badgeColor:         '#475569',
    badgeDot:           '#94a3b8',
    sortOrder:          0,
    canEdit:            false,
    canDelete:          false,
    canUploadDocs:      false,
    isInitial:          false,
    isTerminal:         false,
    allowedTransitions: '',
    isActive:           true,
};

// ── Badge preview ─────────────────────────────────────────────────────────────
const BadgePreview = ({ form }) => (
    <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        background: form.badgeBg, color: form.badgeColor,
        padding: '3px 10px', borderRadius: 20,
        fontSize: 12, fontWeight: 600, border: `1px solid ${form.badgeDot}22`,
    }}>
        <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: form.badgeDot, flexShrink: 0,
        }} />
        {form.statusLabel || 'Label'}
    </span>
);

// ── Color field ───────────────────────────────────────────────────────────────
const ColorField = ({ label, name, value, onChange }) => (
    <div className="ds-field">
        <label>{label}</label>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="color" value={value} name={name} onChange={onChange}
                style={{ width: 36, height: 32, border: '1px solid #e2e8f0', borderRadius: 6, cursor: 'pointer', padding: 2 }} />
            <input className="ds-input" value={value} name={name} onChange={onChange}
                maxLength={7} style={{ fontFamily: 'monospace', width: 90, flex: 'none' }} />
        </div>
    </div>
);

// ── Flag toggle ───────────────────────────────────────────────────────────────
const FlagToggle = ({ name, label, checked, onChange }) => (
    <label className="ds-toggle">
        <input type="checkbox" name={name} checked={checked} onChange={onChange} />
        <span>{label}</span>
    </label>
);

// ── Slide-over form ──────────────────────────────────────────────────────────
const StatusForm = ({ editing, defaultModule, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const [form,   setForm]   = useState(editing
        ? { ...editing, allowedTransitions: editing.allowedTransitions || '' }
        : { ...EMPTY_FORM, moduleName: defaultModule || 'PR' });
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const handle = e => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };

    const validate = () => {
        const e = {};
        if (!form.statusCode.trim())  e.statusCode  = 'Required';
        if (!form.statusLabel.trim()) e.statusLabel = 'Required';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const save = () => {
        if (!validate()) return;
        setSaving(true);
        fetch(`${variables.API_URL}documentstatus/save`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                statusId:           form.statusId || 0,
                moduleName:         form.moduleName,
                statusCode:         form.statusCode.trim(),
                statusLabel:        form.statusLabel.trim(),
                badgeBg:            form.badgeBg,
                badgeColor:         form.badgeColor,
                badgeDot:           form.badgeDot,
                sortOrder:          Number(form.sortOrder) || 0,
                canEdit:            form.canEdit,
                canDelete:          form.canDelete,
                canUploadDocs:      form.canUploadDocs,
                isInitial:          form.isInitial,
                isTerminal:         form.isTerminal,
                allowedTransitions: form.allowedTransitions.trim() || null,
                isActive:           form.isActive,
                createdBy:          currentUser,
                modifiedBy:         currentUser,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setErrors({ _global: d.message || 'Save failed.' }); return; }
                onSaved();
            })
            .catch(() => setErrors({ _global: 'Network error.' }))
            .finally(() => setSaving(false));
    };

    const isNew = !editing;

    return (
        <div className="ds-overlay">
            <div className="ds-panel">
                <div className="ds-panel-header">
                    <div>
                        <div className="ds-panel-title">
                            {isNew ? 'New Document Status' : `Edit — ${editing.moduleName} · ${editing.statusCode}`}
                        </div>
                        <div className="ds-panel-sub">
                            Configure status label, badge colours, and business-rule flags
                        </div>
                    </div>
                    <button className="ds-close" onClick={onClose}>✕</button>
                </div>

                <div className="ds-panel-body">
                    {errors._global && <div className="ds-err">{errors._global}</div>}

                    {/* Live badge preview */}
                    <div className="ds-preview-box" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span className="ds-preview-label">Preview</span>
                        <BadgePreview form={form} />
                    </div>

                    <div className="ds-section-label">Identity</div>
                    <div className="ds-row">
                        <div className="ds-field ds-f05">
                            <label>Module</label>
                            <select className="ds-input" name="moduleName" value={form.moduleName} onChange={handle}
                                disabled={!isNew} style={!isNew ? { background: '#f8fafc', color: '#64748b' } : {}}>
                                {MODULES.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div className="ds-field">
                            <label>Status Code <span className="ds-req">*</span></label>
                            <input className={`ds-input${errors.statusCode ? ' ds-input-err' : ''}`}
                                name="statusCode" value={form.statusCode} onChange={handle}
                                disabled={!isNew} style={!isNew ? { background: '#f8fafc', color: '#64748b' } : {}}
                                placeholder="e.g. Draft" maxLength={50} />
                            {errors.statusCode && <span className="ds-field-err">{errors.statusCode}</span>}
                        </div>
                        <div className="ds-field ds-f2">
                            <label>Label <span className="ds-req">*</span></label>
                            <input className={`ds-input${errors.statusLabel ? ' ds-input-err' : ''}`}
                                name="statusLabel" value={form.statusLabel} onChange={handle}
                                placeholder="e.g. Draft" maxLength={100} />
                            {errors.statusLabel && <span className="ds-field-err">{errors.statusLabel}</span>}
                        </div>
                        <div className="ds-field ds-f05">
                            <label>Sort</label>
                            <input className="ds-input" type="number" name="sortOrder"
                                value={form.sortOrder} onChange={handle} min={0} />
                        </div>
                    </div>

                    <div className="ds-section-label">Badge Colours</div>
                    <div className="ds-row">
                        <ColorField label="Background" name="badgeBg"    value={form.badgeBg}    onChange={handle} />
                        <ColorField label="Text"       name="badgeColor" value={form.badgeColor} onChange={handle} />
                        <ColorField label="Dot"        name="badgeDot"   value={form.badgeDot}   onChange={handle} />
                    </div>

                    <div className="ds-section-label">Business Rules</div>
                    <div className="ds-row" style={{ flexWrap: 'wrap', gap: 14 }}>
                        <FlagToggle name="canEdit"       label="Can Edit"         checked={form.canEdit}       onChange={handle} />
                        <FlagToggle name="canDelete"     label="Can Delete"       checked={form.canDelete}     onChange={handle} />
                        <FlagToggle name="canUploadDocs" label="Can Upload Docs"  checked={form.canUploadDocs} onChange={handle} />
                        <FlagToggle name="isInitial"     label="Initial Status"   checked={form.isInitial}     onChange={handle} />
                        <FlagToggle name="isTerminal"    label="Terminal Status"  checked={form.isTerminal}    onChange={handle} />
                    </div>

                    <div className="ds-section-label">Workflow Transitions</div>
                    <div className="ds-row">
                        <div className="ds-field" style={{ flex: 1 }}>
                            <label>Allowed Transitions <span className="ds-opt">(comma-separated status codes)</span></label>
                            <input className="ds-input" name="allowedTransitions"
                                value={form.allowedTransitions} onChange={handle}
                                placeholder="e.g. Submitted,Cancelled" maxLength={500} />
                            <span className="ds-hint">Leave empty if no transitions allowed from this status</span>
                        </div>
                    </div>

                    <div className="ds-section-label">State</div>
                    <div className="ds-row">
                        <FlagToggle name="isActive" label="Active" checked={form.isActive} onChange={handle} />
                    </div>
                </div>

                <div className="ds-panel-footer">
                    <button className="ds-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="ds-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Status'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Status card ───────────────────────────────────────────────────────────────
const StatusCard = ({ s, onEdit }) => (
    <div className={`ds-card${s.isActive ? '' : ' ds-card-inactive'}`}>
        <div className="ds-card-top">
            <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: s.badgeBg, color: s.badgeColor,
                padding: '3px 10px', borderRadius: 20,
                fontSize: 12, fontWeight: 600,
            }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.badgeDot, flexShrink: 0 }} />
                {s.statusLabel}
            </span>
            {!s.isActive && <span className="ds-card-inactive-chip">Inactive</span>}
        </div>
        <div className="ds-card-name" style={{ fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>
            {s.moduleName} · {s.statusCode}
        </div>
        <div className="ds-card-meta">
            {s.canEdit       && <span style={{ background: '#dbeafe', color: '#1e40af' }}>✏ Edit</span>}
            {s.canDelete     && <span style={{ background: '#fee2e2', color: '#991b1b' }}>🗑 Delete</span>}
            {s.canUploadDocs && <span style={{ background: '#dcfce7', color: '#166534' }}>📎 Upload</span>}
            {s.isInitial     && <span style={{ background: '#fef9c3', color: '#854d0e' }}>▶ Initial</span>}
            {s.isTerminal    && <span style={{ background: '#f1f5f9', color: '#475569' }}>⏹ Terminal</span>}
        </div>
        {s.allowedTransitions && (
            <div style={{ fontSize: 11, color: '#64748b' }}>
                <span style={{ fontWeight: 600 }}>→ </span>{s.allowedTransitions}
            </div>
        )}
        <div className="ds-card-footer">
            <span className="ds-card-series">Sort: <strong>{s.sortOrder}</strong></span>
            {onEdit && <button className="ds-edit-btn" onClick={() => onEdit(s)}>Edit</button>}
        </div>
    </div>
);

// ── Main page ────────────────────────────────────────────────────────────────
const DocumentStatus = () => {
    const { refresh: refreshLookup } = useLookup();
    const { canDo } = usePermission();
    const canAdd    = canDo('/settings/document-status', 'ADD');
    const canEdit   = canDo('/settings/document-status', 'EDIT');
    const [rows,      setRows]    = useState([]);
    const [loading,   setLoading] = useState(false);
    const [activeModule, setActiveModule] = useState('PR');
    const [editing,   setEditing] = useState(null);   // null = closed, false = new, obj = edit

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}documentstatus`, { headers: authHeaders() })
            .then(r => r.json())
            .then(data => setRows(Array.isArray(data) ? data : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const filtered = rows
        .filter(r => r.moduleName === activeModule)
        .sort((a, b) => a.sortOrder - b.sortOrder);

    const handleSaved = () => {
        setEditing(null);
        load();
        refreshLookup(); // keep LookupContext in sync
    };

    return (
        <div className="ds-page">
            {editing !== null && (
                <StatusForm
                    editing={editing === false ? null : editing}
                    defaultModule={activeModule}
                    onClose={() => setEditing(null)}
                    onSaved={handleSaved}
                />
            )}

            <div className="ds-header">
                <div>
                    <div className="ds-page-title">Document Statuses</div>
                    <div className="ds-page-sub">
                        Configure status labels, badge colours, and business-rule flags for each module
                    </div>
                </div>
                {canAdd && <button className="ds-btn-pri" onClick={() => setEditing(false)}>+ New Status</button>}
            </div>

            {/* Module tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: '2px solid #e2e8f0' }}>
                {MODULES.map(m => (
                    <button
                        key={m}
                        onClick={() => setActiveModule(m)}
                        style={{
                            padding: '7px 20px', border: 'none', background: 'none', cursor: 'pointer',
                            fontSize: 13, fontWeight: 600, color: activeModule === m ? '#1e40af' : '#64748b',
                            borderBottom: activeModule === m ? '2px solid #1e40af' : '2px solid transparent',
                            marginBottom: -2, transition: 'all .15s',
                        }}
                    >{m}</button>
                ))}
            </div>

            {loading ? (
                <div className="ds-loading">Loading…</div>
            ) : filtered.length === 0 ? (
                <div className="ds-loading" style={{ color: '#94a3b8' }}>
                    No statuses configured for {activeModule}.
                    <br />
                    {canAdd && <button className="ds-btn-pri" style={{ marginTop: 12 }} onClick={() => setEditing(false)}>
                        + Add First Status
                    </button>}
                </div>
            ) : (
                <div className="ds-card-grid">
                    {filtered.map(s => (
                        <StatusCard key={s.statusId} s={s} onEdit={canEdit ? setEditing : null} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default DocumentStatus;
