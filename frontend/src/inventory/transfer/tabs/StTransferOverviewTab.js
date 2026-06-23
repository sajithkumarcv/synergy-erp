import React, { useState } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { fmtDate, fmtDateTime, today } from '../../inventoryConstants';
import AlertModal from '../../../common/AlertModal';

const StTransferOverviewTab = ({ transfer, jobs, onRefresh }) => {
    const currentUser = useCurrentUser();
    const isDraft     = transfer.status === 'Draft';

    const [editing, setEditing] = useState(false);
    const [form,    setForm]    = useState({
        fromJobId:      transfer.fromJobId      || '',
        toJobId:        transfer.toJobId        || '',
        transferDate:   transfer.transferDate   ? transfer.transferDate.slice(0, 10) : today(),
        transferReason: transfer.transferReason || '',
        notes:          transfer.notes          || '',
    });
    const [saving, setSaving] = useState(false);
    const [err,    setErr]    = useState('');
    const [alert,  setAlert]  = useState(null);

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const save = async () => {
        if (!form.fromJobId)               return setErr('From Job is required.');
        if (!form.toJobId)                 return setErr('To Job is required.');
        if (form.fromJobId===form.toJobId) return setErr('From and To jobs must be different.');
        if (!form.transferReason.trim())   return setErr('Transfer Reason is required.');

        setErr(''); setSaving(true);
        try {
            const r = await fetch(`${variables.API_URL}stocktransfer/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    transferId:     transfer.transferId,
                    fromJobId:      form.fromJobId,
                    toJobId:        form.toJobId,
                    transferDate:   form.transferDate,
                    transferReason: form.transferReason,
                    notes:          form.notes || null,
                    modifiedBy:     currentUser,
                }),
            });
            const d = await r.json();
            if (!r.ok) { setErr(d?.message || 'Save failed.'); return; }
            setEditing(false);
            onRefresh();
        } catch (e) {
            setErr(e.message || 'Network error.');
        } finally { setSaving(false); }
    };

    const cancelEdit = () => {
        setForm({
            fromJobId:      transfer.fromJobId      || '',
            toJobId:        transfer.toJobId        || '',
            transferDate:   transfer.transferDate   ? transfer.transferDate.slice(0, 10) : today(),
            transferReason: transfer.transferReason || '',
            notes:          transfer.notes          || '',
        });
        setErr('');
        setEditing(false);
    };

    const label  = (text, required) => (
        <label style={{ display:'block', fontSize:11, fontWeight:600, color:'#64748b', textTransform:'uppercase', marginBottom:4 }}>
            {text}{required && <span style={{ color:'#dc2626' }}> *</span>}
        </label>
    );

    const ro = (val, mono) => (
        <div style={{ fontSize:13, color: mono ? '#065f46' : '#1e293b', fontFamily: mono ? 'Courier New' : undefined,
            background: mono ? '#d1fae5' : undefined, display: mono ? 'inline-block' : undefined,
            padding: mono ? '2px 8px' : undefined, borderRadius: mono ? 4 : undefined }}>
            {val || '—'}
        </div>
    );

    if (editing) {
        return (
            <div className="jd-tab-section">
                {alert && <AlertModal message={alert} onClose={() => setAlert(null)} />}
                <div className="pf-section-title">Edit Transfer Header</div>
                <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                        <div>
                            {label('From Job', true)}
                            <select className="pf-input" style={{ margin: 0 }} value={form.fromJobId} onChange={e => set('fromJobId', e.target.value)}>
                                <option value="">-- Select --</option>
                                {jobs.map(j => <option key={j.jobId} value={j.jobId}>{j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}</option>)}
                            </select>
                        </div>
                        <div>
                            {label('To Job', true)}
                            <select className="pf-input" style={{ margin: 0 }} value={form.toJobId} onChange={e => set('toJobId', e.target.value)}>
                                <option value="">-- Select --</option>
                                {jobs.filter(j => j.jobId !== form.fromJobId).map(j => <option key={j.jobId} value={j.jobId}>{j.jobId}{j.projectName ? ` — ${j.projectName}` : ''}</option>)}
                            </select>
                        </div>
                    </div>
                    <div style={{ maxWidth: 260 }}>
                        {label('Transfer Date')}
                        <input type="date" className="pf-input" style={{ margin: 0 }} value={form.transferDate} onChange={e => set('transferDate', e.target.value)} />
                    </div>
                    <div>
                        {label('Transfer Reason', true)}
                        <textarea className="pf-input pf-textarea" rows={3} style={{ margin: 0 }}
                            placeholder="Reason for this stock transfer…"
                            value={form.transferReason} onChange={e => set('transferReason', e.target.value)} />
                    </div>
                    <div>
                        {label('Remarks')}
                        <input type="text" className="pf-input" style={{ margin: 0 }}
                            placeholder="Optional remarks"
                            value={form.notes} onChange={e => set('notes', e.target.value)} />
                    </div>

                    {err && (
                        <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, padding:'8px 12px', fontSize:12, color:'#dc2626' }}>
                            ⚠ {err}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="pf-btn-sec" onClick={cancelEdit} disabled={saving}>Cancel</button>
                        <button className="pf-btn-pri" onClick={save} disabled={saving}>
                            {saving ? 'Saving…' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="jd-tab-section">
            {alert && <AlertModal message={alert} onClose={() => setAlert(null)} />}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <div className="pf-section-title" style={{ margin: 0 }}>Transfer Details</div>
                {isDraft && (
                    <button className="po-act-btn po-act-open" onClick={() => setEditing(true)}>Edit</button>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20, maxWidth: 800 }}>
                <div>
                    {label('Transfer #')}
                    {ro(transfer.transferNo, true)}
                </div>
                <div>
                    {label('Transfer Date')}
                    {ro(fmtDate(transfer.transferDate))}
                </div>
                <div>
                    {label('From Job')}
                    <div style={{ fontSize:13 }}>
                        <span style={{ fontFamily:'Courier New', fontSize:11, color:'#065f46', background:'#d1fae5', padding:'2px 8px', borderRadius:4, marginRight:6 }}>
                            {transfer.fromJobId}
                        </span>
                        {transfer.fromJobName && <span style={{ color:'#64748b', fontSize:12 }}>{transfer.fromJobName}</span>}
                    </div>
                </div>
                <div>
                    {label('To Job')}
                    <div style={{ fontSize:13 }}>
                        <span style={{ fontFamily:'Courier New', fontSize:11, color:'#1e40af', background:'#dbeafe', padding:'2px 8px', borderRadius:4, marginRight:6 }}>
                            {transfer.toJobId}
                        </span>
                        {transfer.toJobName && <span style={{ color:'#64748b', fontSize:12 }}>{transfer.toJobName}</span>}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: 20, maxWidth: 640 }}>
                {label('Transfer Reason')}
                <div style={{ fontSize:13, color:'#1e293b', background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:6, padding:'10px 14px', lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                    {transfer.transferReason || '—'}
                </div>
            </div>

            {transfer.notes && (
                <div style={{ marginTop: 16, maxWidth: 640 }}>
                    {label('Remarks')}
                    <div style={{ fontSize:13, color:'#475569', fontStyle:'italic' }}>{transfer.notes}</div>
                </div>
            )}

            <div style={{ marginTop: 28, borderTop: '1px solid #f1f5f9', paddingTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 12, maxWidth: 640 }}>
                <div>
                    {label('Created By')}
                    {ro(transfer.createdBy)}
                </div>
                <div>
                    {label('Created Date')}
                    {ro(fmtDateTime(transfer.createdDate))}
                </div>
                {transfer.modifiedBy && <>
                    <div>
                        {label('Modified By')}
                        {ro(transfer.modifiedBy)}
                    </div>
                    <div>
                        {label('Modified Date')}
                        {ro(fmtDateTime(transfer.modifiedDate))}
                    </div>
                </>}
            </div>
        </div>
    );
};

export default StTransferOverviewTab;
