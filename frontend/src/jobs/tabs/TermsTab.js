import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { canEdit } from '../jobConstants';
import AlertModal from '../../common/AlertModal';

const TermsTab = ({ job, onRefresh }) => {
    const currentUser = useCurrentUser();
    const [terms,   setTerms]   = useState({ jobPaymentTerms: '', warrantyTerms: '', jobDeliveryTerms: '' });
    const [saving,  setSaving]  = useState(false);
    const [saved,   setSaved]   = useState(false);
    const [loading, setLoading] = useState(true);
    const [dirty,   setDirty]   = useState(false);
    const [alertMsg, setAlertMsg] = useState(null);

    const editable = canEdit(job?.jobStatusId);

    useEffect(() => {
        if (!job?.jobId) return;
        setLoading(true);
        fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/terms`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { if (d) setTerms(d); })
            .catch(e => console.error('Load terms:', e))
            .finally(() => setLoading(false));
    }, [job?.jobId]);

    const handle = (e) => {
        const { name, value } = e.target;
        setTerms(p => ({ ...p, [name]: value }));
        setSaved(false); setDirty(true);
    };

    const save = async () => {
        setSaving(true);
        const isNew = !terms.createdBy;
        try {
            const res = await fetch(`${variables.API_URL}job/${encodeURIComponent(job.jobId)}/terms`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    ...terms, jobId: job.jobId,
                    createdBy:  isNew ? currentUser : terms.createdBy,
                    modifiedBy: isNew ? null : currentUser,
                })
            });
            const d = await res.json();
            if (!res.ok) { setAlertMsg(d?.message || 'Failed to save terms.'); return; }
            setSaved(true); setDirty(false); if (onRefresh) onRefresh();
        } catch { setAlertMsg('Network error. Please try again.'); }
        finally { setSaving(false); }
    };

    if (loading) return <div className="tab-loading">Loading terms…</div>;

    return (
        <div className="tab-section">
            <div className="tab-toolbar">
                <div className="tab-toolbar-left">
                    <span className="tab-section-title">Contract Terms</span>
                    {!editable && <span className="tab-locked-badge">🔒 Locked</span>}
                    {dirty && editable && <span className="tab-unsaved-badge">● Unsaved changes</span>}
                </div>
                {editable && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {saved && <span className="tab-saved-badge">✓ Saved</span>}
                        <button className="tab-btn-pri" onClick={save} disabled={saving || !dirty}>
                            {saving ? 'Saving…' : 'Save Terms'}
                        </button>
                    </div>
                )}
            </div>

            <div className="terms-grid">
                <div className="terms-card">
                    <div className="terms-card-header">
                        <span className="terms-icon">💳</span>
                        <span className="terms-card-title">Payment Terms</span>
                    </div>
                    <textarea className="terms-textarea" name="jobPaymentTerms"
                        value={terms.jobPaymentTerms || ''}
                        onChange={handle} disabled={!editable} rows={6}
                        placeholder="e.g. 30% advance on order, 70% on completion and handover…" />
                </div>
                <div className="terms-card">
                    <div className="terms-card-header">
                        <span className="terms-icon">🛡️</span>
                        <span className="terms-card-title">Warranty Terms</span>
                    </div>
                    <textarea className="terms-textarea" name="warrantyTerms"
                        value={terms.warrantyTerms || ''}
                        onChange={handle} disabled={!editable} rows={6}
                        placeholder="e.g. 12 months warranty from the date of handover…" />
                </div>
                <div className="terms-card">
                    <div className="terms-card-header">
                        <span className="terms-icon">🚚</span>
                        <span className="terms-card-title">Delivery Terms</span>
                    </div>
                    <textarea className="terms-textarea" name="jobDeliveryTerms"
                        value={terms.jobDeliveryTerms || ''}
                        onChange={handle} disabled={!editable} rows={6}
                        placeholder="e.g. Ex-works, delivery within 4 weeks from LPO date…" />
                </div>
            </div>

            {!editable && (
                <div className="terms-locked-notice">
                    <span>🔒</span>
                    <span>Terms are read-only — this job is {job?.jobStatusId === 3 ? 'completed' : 'cancelled'}.</span>
                </div>
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default TermsTab;
