import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { canEdit } from '../jobConstants';

// ─────────────────────────────────────────────────────────────
// MetaTab  — Bay / Category / Quality / Total Units
// Single-record upsert against TBL_JOB_META
// ─────────────────────────────────────────────────────────────
const EMPTY = { bayId: '', jobCategoryId: '', qualityLevelId: '', totalUnits: '' };

const MetaTab = ({ job, onRefresh }) => {
    const currentUser = useCurrentUser();
    const editable    = canEdit(job?.jobStatusId);

    const [form,    setForm]    = useState(EMPTY);
    const [isNew,   setIsNew]   = useState(true);   // no row in TBL_JOB_META yet
    const [bays,    setBays]    = useState([]);
    const [cats,    setCats]    = useState([]);
    const [quals,   setQuals]   = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving,  setSaving]  = useState(false);
    const [saved,   setSaved]   = useState(false);
    const [dirty,   setDirty]   = useState(false);
    const [error,   setError]   = useState('');

    // ── load lookups once (no jobId dependency) ──────────────
    useEffect(() => {
        fetch(`${variables.API_URL}job/bays`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setBays(Array.isArray(d) ? d : []))
            .catch(console.error);

        fetch(`${variables.API_URL}job/categories`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setCats(Array.isArray(d) ? d : []))
            .catch(console.error);

        fetch(`${variables.API_URL}job/quality-levels`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setQuals(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, []);

    // ── load existing meta for this job ───────────────────────
    useEffect(() => {
        if (!job?.jobId) return;
        setLoading(true);
        fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/meta`, { headers: authHeaders() })
            .then(r => {
                if (r.status === 404 || r.status === 204) return null;
                return r.json().catch(() => null);
            })
            .then(meta => {
                if (meta && meta.jobId) {
                    setIsNew(false);
                    setForm({
                        bayId:          String(meta.bayId          || ''),
                        jobCategoryId:  String(meta.jobCategoryId  || ''),
                        qualityLevelId: String(meta.qualityLevelId || ''),
                        totalUnits:     meta.totalUnits != null ? String(meta.totalUnits) : '',
                    });
                } else {
                    setIsNew(true);
                    setForm(EMPTY);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [job?.jobId]);

    const handle = (e) => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        setSaved(false);
        setDirty(true);
        setError('');
    };

    const save = () => {
        // Basic validation
        if (!form.bayId)          return setError('Please select a bay.');
        if (!form.jobCategoryId)  return setError('Please select a category.');
        if (!form.qualityLevelId) return setError('Please select a quality level.');
        const units = parseFloat(form.totalUnits);
        if (isNaN(units) || units < 0) return setError('Total units must be a non-negative number.');

        setSaving(true);
        setError('');
        fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/meta`, {
            method:  'POST',
            headers: authHeaders(),
            body:    JSON.stringify({
                bayId:          Number(form.bayId),
                jobCategoryId:  Number(form.jobCategoryId),
                qualityLevelId: Number(form.qualityLevelId),
                totalUnits:     units,
                modifiedBy:     currentUser,
            }),
        })
        .then(r => { if (!r.ok) throw new Error('Save failed'); return r.json(); })
        .then(() => { setSaved(true); setDirty(false); setIsNew(false); if (onRefresh) onRefresh(); })
        .catch(err => setError(err.message || 'Save failed.'))
        .finally(() => setSaving(false));
    };

    if (loading) return <div className="tab-loading">Loading meta…</div>;

    // Resolve display name for quality description hint
    const selectedQual = quals.find(q => String(q.qualityLevelId) === form.qualityLevelId);

    return (
        <div className="tab-section">

            {/* ── Toolbar ── */}
            <div className="tab-toolbar">
                <div className="tab-toolbar-left">
                    <span className="tab-section-title">Job Classification</span>
                    {!editable && <span className="tab-locked-badge">🔒 Locked</span>}
                    {isNew    && editable && <span className="tab-unsaved-badge">● Not saved yet</span>}
                    {!isNew   && dirty && editable && <span className="tab-unsaved-badge">● Unsaved changes</span>}
                </div>
                {editable && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {saved && <span className="tab-saved-badge">✓ Saved</span>}
                        <button className="tab-btn-pri" onClick={save} disabled={saving || !dirty}>
                            {saving ? 'Saving…' : 'Save Meta'}
                        </button>
                    </div>
                )}
            </div>

            {/* ── Error ── */}
            {error && (
                <div style={{ margin: '0 0 12px', padding: '8px 12px', background: '#fee2e2',
                    color: '#991b1b', borderRadius: 6, fontSize: 13 }}>
                    {error}
                </div>
            )}

            {/* ── Form grid ── */}
            <div className="meta-grid">

                {/* Bay */}
                <div className="meta-card">
                    <div className="meta-card-header">
                        <span className="meta-icon">🏗️</span>
                        <span className="meta-card-title">Bay</span>
                    </div>
                    <div className="meta-field">
                        <label className="meta-label">Assigned Bay</label>
                        <select
                            className="meta-select"
                            name="bayId"
                            value={form.bayId}
                            onChange={handle}
                            disabled={!editable}
                        >
                            <option value="">— Select Bay —</option>
                            {bays.map(b => (
                                <option key={b.bayId} value={b.bayId}>{b.bayName}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Category */}
                <div className="meta-card">
                    <div className="meta-card-header">
                        <span className="meta-icon">🗂️</span>
                        <span className="meta-card-title">Category</span>
                    </div>
                    <div className="meta-field">
                        <label className="meta-label">Job Category</label>
                        <select
                            className="meta-select"
                            name="jobCategoryId"
                            value={form.jobCategoryId}
                            onChange={handle}
                            disabled={!editable}
                        >
                            <option value="">— Select Category —</option>
                            {cats.map(c => (
                                <option key={c.jobCategoryId} value={c.jobCategoryId}>{c.jobCategoryName}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Quality Level */}
                <div className="meta-card">
                    <div className="meta-card-header">
                        <span className="meta-icon">⭐</span>
                        <span className="meta-card-title">Quality Level</span>
                    </div>
                    <div className="meta-field">
                        <label className="meta-label">Quality Standard</label>
                        <select
                            className="meta-select"
                            name="qualityLevelId"
                            value={form.qualityLevelId}
                            onChange={handle}
                            disabled={!editable}
                        >
                            <option value="">— Select Quality Level —</option>
                            {quals.map(q => (
                                <option key={q.qualityLevelId} value={q.qualityLevelId}>{q.qualityLevelName}</option>
                            ))}
                        </select>
                        {selectedQual?.description && (
                            <span className="meta-hint">{selectedQual.description}</span>
                        )}
                    </div>
                </div>

                {/* Total Units */}
                <div className="meta-card">
                    <div className="meta-card-header">
                        <span className="meta-icon">🔢</span>
                        <span className="meta-card-title">Units</span>
                    </div>
                    <div className="meta-field">
                        <label className="meta-label">Total Units</label>
                        <input
                            className="meta-input"
                            type="number"
                            min="0"
                            step="1"
                            name="totalUnits"
                            value={form.totalUnits}
                            onChange={handle}
                            onFocus={e => e.target.select()}
                            disabled={!editable}
                            placeholder="0"
                        />
                    </div>
                </div>

            </div>

            {/* ── Locked notice ── */}
            {!editable && (
                <div className="terms-locked-notice">
                    <span>🔒</span>
                    <span>Meta is read-only — this job is {job?.jobStatusId === 3 ? 'completed' : 'cancelled'}.</span>
                </div>
            )}
        </div>
    );
};

export default MetaTab;
