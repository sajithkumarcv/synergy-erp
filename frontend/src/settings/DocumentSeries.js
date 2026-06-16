import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser } from '../AuthContext';
import { usePermission } from '../PermissionContext';
import './Settings.css';

const YEAR_DIGITS_OPTIONS = [
    { value: 2, label: '2-digit  (e.g. 26)' },
    { value: 4, label: '4-digit  (e.g. 2026)' },
];

const PAD_OPTIONS = [2, 3, 4, 5, 6].map(n => ({ value: n, label: `${n} digits  (${'0'.repeat(n - 1)}1)` }));

const EMPTY_FORM = {
    docTypeId:      '',
    docTypeName:    '',
    prefix:         '',
    suffix:         '',
    separator:      '-',
    includeYear:    true,
    yearDigits:     4,
    resetYearly:    true,
    padLength:      4,
    startingSeries: 1,
    sortOrder:      0,
    isActive:       true,
};

const previewNumber = (f) => {
    const year = String(new Date().getFullYear());
    const yr   = f.yearDigits === 4 ? year : year.slice(-2);
    const num  = String(f.startingSeries).padStart(f.padLength, '0');
    const sep  = f.separator || '-';
    return (f.prefix || '') +
           (f.includeYear ? sep + yr : '') +
           (f.suffix || '') +
           sep + num;
};

// ── Slide-over form ──────────────────────────────────────────────────────────
const SeriesForm = ({ editing, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const [form,    setForm]    = useState(editing
        ? { ...editing, docTypeId: editing.docTypeId, docTypeName: editing.docTypeName,
            prefix: editing.prefix, suffix: editing.suffix || '', separator: editing.separator || '-',
            includeYear: editing.includeYear, yearDigits: editing.yearDigits,
            resetYearly: editing.resetYearly, padLength: editing.padLength,
            startingSeries: editing.startingSeries, sortOrder: editing.sortOrder, isActive: editing.isActive }
        : { ...EMPTY_FORM });
    const [errors,  setErrors]  = useState({});
    const [saving,  setSaving]  = useState(false);

    const handle = e => {
        const { name, value, type, checked } = e.target;
        setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
    };

    const validate = () => {
        const e = {};
        if (!form.docTypeId.trim())   e.docTypeId   = 'Required';
        if (!form.docTypeName.trim()) e.docTypeName = 'Required';
        if (!form.prefix.trim())      e.prefix      = 'Required';
        if (!form.separator.trim())   e.separator   = 'Required';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const save = () => {
        if (!validate()) return;
        setSaving(true);
        fetch(`${variables.API_URL}documentseries/save`, {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                docTypeId:      form.docTypeId.trim().toUpperCase(),
                docTypeName:    form.docTypeName.trim(),
                prefix:         form.prefix.trim().toUpperCase(),
                suffix:         form.suffix.trim() || null,
                separator:      form.separator || '-',
                includeYear:    form.includeYear,
                yearDigits:     Number(form.yearDigits),
                resetYearly:    form.resetYearly,
                padLength:      Number(form.padLength),
                startingSeries: Number(form.startingSeries) || 1,
                sortOrder:      Number(form.sortOrder) || 0,
                isActive:       form.isActive,
                createdBy:      currentUser,
                modifiedBy:     currentUser,
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
                        <div className="ds-panel-title">{isNew ? 'New Document Series' : `Edit — ${editing.docTypeId}`}</div>
                        <div className="ds-panel-sub">Configure the numbering format</div>
                    </div>
                    <button className="ds-close" onClick={onClose}>✕</button>
                </div>

                <div className="ds-panel-body">
                    {errors._global && <div className="ds-err">{errors._global}</div>}

                    {/* Live preview */}
                    <div className="ds-preview-box">
                        <span className="ds-preview-label">Preview</span>
                        <span className="ds-preview-num">{previewNumber(form)}</span>
                    </div>

                    <div className="ds-section-label">Identity</div>
                    <div className="ds-row">
                        <div className="ds-field">
                            <label>Type ID <span className="ds-req">*</span></label>
                            <input className={`ds-input${errors.docTypeId ? ' ds-input-err' : ''}`}
                                name="docTypeId" value={form.docTypeId} onChange={handle}
                                disabled={!isNew} placeholder="e.g. PO, PR, ISN" maxLength={20}
                                style={!isNew ? { background: '#f8fafc', color: '#64748b' } : {}} />
                            {errors.docTypeId && <span className="ds-field-err">{errors.docTypeId}</span>}
                        </div>
                        <div className="ds-field ds-f2">
                            <label>Display Name <span className="ds-req">*</span></label>
                            <input className={`ds-input${errors.docTypeName ? ' ds-input-err' : ''}`}
                                name="docTypeName" value={form.docTypeName} onChange={handle}
                                placeholder="e.g. Purchase Order" maxLength={100} />
                            {errors.docTypeName && <span className="ds-field-err">{errors.docTypeName}</span>}
                        </div>
                        <div className="ds-field ds-f05">
                            <label>Sort</label>
                            <input className="ds-input" type="number" name="sortOrder" value={form.sortOrder} onChange={handle} min={0} />
                        </div>
                    </div>

                    <div className="ds-section-label">Number Format</div>
                    <div className="ds-row">
                        <div className="ds-field">
                            <label>Prefix <span className="ds-req">*</span></label>
                            <input className={`ds-input${errors.prefix ? ' ds-input-err' : ''}`}
                                name="prefix" value={form.prefix} onChange={handle}
                                placeholder="e.g. PO" maxLength={20} />
                            {errors.prefix && <span className="ds-field-err">{errors.prefix}</span>}
                        </div>
                        <div className="ds-field">
                            <label>Suffix <span className="ds-opt">(optional)</span></label>
                            <input className="ds-input" name="suffix" value={form.suffix} onChange={handle}
                                placeholder="e.g. /A" maxLength={20} />
                        </div>
                        <div className="ds-field ds-f05">
                            <label>Separator <span className="ds-req">*</span></label>
                            <input className={`ds-input${errors.separator ? ' ds-input-err' : ''}`}
                                name="separator" value={form.separator} onChange={handle}
                                maxLength={1} style={{ textAlign: 'center', fontFamily: 'monospace', fontSize: 16 }} />
                        </div>
                        <div className="ds-field">
                            <label>Pad Length</label>
                            <select className="ds-input" name="padLength" value={form.padLength} onChange={handle}>
                                {PAD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="ds-section-label">Year Settings</div>
                    <div className="ds-row ds-row-align">
                        <label className="ds-toggle">
                            <input type="checkbox" name="includeYear" checked={form.includeYear} onChange={handle} />
                            <span>Include year in number</span>
                        </label>
                        {form.includeYear && (
                            <>
                                <div className="ds-field">
                                    <label>Year Format</label>
                                    <select className="ds-input" name="yearDigits" value={form.yearDigits} onChange={handle}>
                                        {YEAR_DIGITS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <label className="ds-toggle">
                                    <input type="checkbox" name="resetYearly" checked={form.resetYearly} onChange={handle} />
                                    <span>Reset counter each year</span>
                                </label>
                            </>
                        )}
                    </div>

                    <div className="ds-section-label">Series Control</div>
                    <div className="ds-row">
                        <div className="ds-field">
                            <label>Starting Number</label>
                            <input className="ds-input" type="number" name="startingSeries"
                                value={form.startingSeries} onChange={handle} min={1} />
                            <span className="ds-hint">First number used when series is new or reset</span>
                        </div>
                        <label className="ds-toggle" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
                            <input type="checkbox" name="isActive" checked={form.isActive} onChange={handle} />
                            <span>Active</span>
                        </label>
                    </div>
                </div>

                <div className="ds-panel-footer">
                    <button className="ds-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="ds-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Series'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Main page ────────────────────────────────────────────────────────────────
const DocumentSeries = () => {
    const { canDo } = usePermission();
    const canAdd    = canDo('/settings/document-series', 'ADD');
    const canEdit   = canDo('/settings/document-series', 'EDIT');
    const [rows,      setRows]    = useState([]);
    const [loading,   setLoading] = useState(false);
    const [editing,   setEditing] = useState(null);   // null = closed, false = new, obj = edit
    const [previews,  setPreviews] = useState({});     // { docTypeId: previewNumber }

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}documentseries`, { headers: authHeaders() })
            .then(r => r.json())
            .then(data => {
                setRows(data || []);
                // Build live preview for each row
                const p = {};
                (data || []).forEach(s => {
                    const year = String(new Date().getFullYear());
                    const yr   = s.yearDigits === 4 ? year : year.slice(-2);
                    const next = (s.resetYearly && (s.currentYear == null || s.currentYear !== new Date().getFullYear()))
                        ? s.startingSeries
                        : s.currentSeries + 1;
                    const num  = String(next).padStart(s.padLength, '0');
                    const sep  = s.separator || '-';
                    p[s.docTypeId] = (s.prefix || '') +
                                     (s.includeYear ? sep + yr : '') +
                                     (s.suffix || '') +
                                     sep + num;
                });
                setPreviews(p);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div className="ds-page">
            {editing !== null && (
                <SeriesForm
                    editing={editing === false ? null : editing}
                    onClose={() => setEditing(null)}
                    onSaved={() => { setEditing(null); load(); }}
                />
            )}

            <div className="ds-header">
                <div>
                    <div className="ds-page-title">Document Number Series</div>
                    <div className="ds-page-sub">Configure auto-numbering for POs, PRs, Issue Notes, GRNs and more</div>
                </div>
                {canAdd && <button className="ds-btn-pri" onClick={() => setEditing(false)}>+ New Series</button>}
            </div>

            {loading ? (
                <div className="ds-loading">Loading…</div>
            ) : (
                <div className="ds-card-grid">
                    {rows.map(s => (
                        <div key={s.docTypeId} className={`ds-card${s.isActive ? '' : ' ds-card-inactive'}`}>
                            <div className="ds-card-top">
                                <div className="ds-card-badge">{s.docTypeId}</div>
                                {!s.isActive && <span className="ds-card-inactive-chip">Inactive</span>}
                            </div>
                            <div className="ds-card-name">{s.docTypeName}</div>
                            <div className="ds-card-next">
                                <span className="ds-card-next-label">Next number</span>
                                <span className="ds-card-next-num">{previews[s.docTypeId] || '—'}</span>
                            </div>
                            <div className="ds-card-meta">
                                <span>Prefix: <strong>{s.prefix}{s.suffix || ''}</strong></span>
                                <span>{s.includeYear ? `${s.yearDigits}yr` : 'no year'}</span>
                                <span>{s.padLength}-digit pad</span>
                                <span>{s.resetYearly ? 'yearly reset' : 'continuous'}</span>
                            </div>
                            <div className="ds-card-footer">
                                <span className="ds-card-series">
                                    Series: <strong>{s.currentSeries}</strong>
                                    {s.currentYear ? ` / ${s.currentYear}` : ''}
                                </span>
                                {canEdit && <button className="ds-edit-btn" onClick={() => setEditing(s)}>Edit</button>}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DocumentSeries;
