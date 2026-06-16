import React, { useState } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { fmtDate, fmt, today } from '../../procurementConstants';
import { useFieldConfig } from '../../../FieldConfigContext';

const Field = ({ label, children }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className="prd-ov-val">{children || <span className="prd-ov-val-muted">—</span>}</div>
    </div>
);

const SrvOverviewTab = ({ srv, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { isReq } = useFieldConfig('SRV');
    const [editing, setEditing] = useState(false);
    const [form,    setForm]    = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    const canEdit = srv.status === 'Draft';

    const startEdit = () => {
        setForm({
            srvDate:      srv.srvDate ? srv.srvDate.slice(0, 10) : today(),
            supplierName: srv.supplierName || '',
            notes:        srv.notes        || '',
        });
        setError('');
        setEditing(true);
    };

    const save = async () => {
        setSaving(true); setError('');
        try {
            const res = await fetch(`${variables.API_URL}servicereceipt/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    srvId:        srv.srvId,
                    srvDate:      form.srvDate,
                    poId:         srv.poId    || null,
                    jobId:        srv.jobId   || null,
                    supplierName: form.supplierName.trim() || null,
                    notes:        form.notes.trim()        || null,
                    modifiedBy:   currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setError(d.message || 'Error.'); return; }
            setEditing(false);
            onRefresh();
        } catch { setError('Network error.'); }
        finally { setSaving(false); }
    };

    if (editing) {
        const lbl   = { fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4, display: 'block' };
        const field = { display: 'flex', flexDirection: 'column', flex: 1 };
        const row   = { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 };

        return (
            <div className="jd-tab-body">
                {error && <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>}
                <div style={row}>
                    <div style={{ ...field, flex: '0 0 160px' }}>
                        <label style={lbl}>SRV Date {isReq('srvDate') && <span className="req">*</span>}</label>
                        <input className="pf-input" type="date" value={form.srvDate}
                            onChange={e => setForm(f => ({ ...f, srvDate: e.target.value }))} />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Supplier / Vendor {isReq('supplierName') && <span className="req">*</span>}</label>
                        <input className="pf-input" type="text" value={form.supplierName}
                            onChange={e => setForm(f => ({ ...f, supplierName: e.target.value }))}
                            placeholder="Supplier name…" />
                    </div>
                </div>
                <div style={row}>
                    <div style={{ ...field, flex: 3 }}>
                        <label style={lbl}>Notes</label>
                        <textarea className="pf-input pf-textarea" rows={3} value={form.notes}
                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button className="pf-btn-sec" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                </div>
            </div>
        );
    }

    return (
        <div className="jd-tab-body">
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                {canEdit && <button className="jd-stage-btn" onClick={startEdit}>✏ Edit</button>}
            </div>

            <div className="prd-ov-grid">
                <Field label="SRV Number"><span style={{ fontFamily: 'Courier New', fontWeight: 700 }}>{srv.srvNo}</span></Field>
                <Field label="Date">{fmtDate(srv.srvDate)}</Field>
                <Field label="Purchase Order">
                    {srv.poNumber
                        ? <span style={{ fontFamily: 'Courier New', color: '#1e40af' }}>{srv.poNumber}</span>
                        : null}
                </Field>
                <Field label="Job">
                    {srv.jobId
                        ? <span style={{ fontFamily: 'Courier New', color: '#0f766e' }}>{srv.jobId}</span>
                        : null}
                </Field>
                <Field label="Supplier / Vendor">{srv.supplierName}</Field>
                <div className="prd-ov-card" style={{ borderColor: '#dbeafe', background: '#f0f7ff' }}>
                    <div className="prd-ov-label">Total Cost</div>
                    <div className="prd-ov-val" style={{ color: '#1e40af', fontWeight: 600, fontSize: 15 }}>{fmt(srv.totalCost)}</div>
                </div>
                <Field label="Created By">{srv.createdBy}</Field>
                {srv.modifiedBy && <Field label="Last Modified">{srv.modifiedBy}</Field>}
            </div>

            {srv.notes && (
                <div className="prd-ov-notes" style={{ marginTop: 14 }}>
                    <div className="prd-ov-notes-label">Notes</div>
                    <div className="prd-ov-notes-text">{srv.notes}</div>
                </div>
            )}
        </div>
    );
};

export default SrvOverviewTab;
