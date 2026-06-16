import React, { useState } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { fmtDate, fmtDateTime, today } from '../../inventoryConstants';
import { useFieldConfig } from '../../../FieldConfigContext';

const LBL = { fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' };

const Field = ({ label, children }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className="prd-ov-val">{children || <span className="prd-ov-val-muted">—</span>}</div>
    </div>
);

const AdjustmentOverviewTab = ({ header, reasons, editable, adjustmentId, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { isReq } = useFieldConfig('STOCK_ADJUSTMENT');

    const [editing, setEditing] = useState(false);
    const [form,    setForm]    = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    const reasonLabel = reasons.find(r => r.value === header.reason)?.label || header.reason;

    const startEdit = () => {
        setForm({
            adjustmentDate: header.adjustmentDate ? header.adjustmentDate.slice(0, 10) : today(),
            reason:         header.reason  || '',
            notes:          header.notes   || '',
        });
        setEditing(true);
        setError('');
    };

    const cancelEdit = () => { setEditing(false); setError(''); };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
    };

    const save = async () => {
        if (!form.adjustmentDate) { setError('Adjustment Date is required.'); return; }
        setSaving(true); setError('');
        try {
            const res = await fetch(`${variables.API_URL}stockadjustment/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    adjustmentId:   Number(adjustmentId),
                    adjustmentDate: form.adjustmentDate,
                    reason:         form.reason  || null,
                    notes:          form.notes.trim() || null,
                    modifiedBy:     currentUser,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setError(d.message || 'Save failed.'); return; }
            setEditing(false);
            onRefresh();
        } catch { setError('Network error.'); }
        finally { setSaving(false); }
    };

    return (
        <div className="jd-tab-body">
            {error && (
                <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 14px', fontSize: 12.5, marginBottom: 12 }}>
                    ⚠ {error}
                </div>
            )}

            {/* Section header + edit button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Adjustment Details
                </div>
                {editable && !editing && (
                    <button className="jd-stage-btn" onClick={startEdit}>✏ Edit</button>
                )}
                {editing && (
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button className="po-btn-pri" style={{ fontSize: 12, padding: '5px 14px' }} onClick={save} disabled={saving}>
                            {saving ? 'Saving…' : '✓ Save'}
                        </button>
                        <button className="pf-btn-sec" style={{ fontSize: 12, padding: '5px 10px' }} onClick={cancelEdit}>
                            Cancel
                        </button>
                    </div>
                )}
            </div>

            {/* ── Read-only view ── */}
            {!editing && (
                <div className="prd-ov-grid">
                    <Field label="Adjustment No">{header.adjustmentNo}</Field>
                    <Field label="Date">{fmtDate(header.adjustmentDate)}</Field>
                    <Field label="Reason">{reasonLabel}</Field>
                    <Field label="Status">{header.status}</Field>
                    <Field label="Notes">{header.notes}</Field>
                    <Field label="Created By">{header.createdBy}</Field>
                    <Field label="Created Date">{fmtDateTime(header.createdDate)}</Field>
                    {header.modifiedBy   && <Field label="Modified By">{header.modifiedBy}</Field>}
                    {header.modifiedDate && <Field label="Modified Date">{fmtDateTime(header.modifiedDate)}</Field>}
                    {header.postedBy     && <Field label="Posted By">{header.postedBy}</Field>}
                    {header.postedDate   && <Field label="Posted Date">{fmtDateTime(header.postedDate)}</Field>}
                </div>
            )}

            {/* ── Edit form ── */}
            {editing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
                    <div>
                        <div style={LBL}>Adjustment Date {isReq('adjustmentDate') && <span className="req">*</span>}</div>
                        <input
                            type="date"
                            name="adjustmentDate"
                            className="pf-input"
                            value={form.adjustmentDate}
                            onChange={handle}
                        />
                    </div>
                    <div>
                        <div style={LBL}>Reason</div>
                        <select name="reason" className="pf-input" value={form.reason} onChange={handle}>
                            <option value="">— Select Reason —</option>
                            {reasons.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <div style={LBL}>Notes</div>
                        <textarea
                            name="notes"
                            className="pf-input"
                            rows={3}
                            value={form.notes}
                            onChange={handle}
                            placeholder="Optional notes…"
                            style={{ resize: 'vertical' }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdjustmentOverviewTab;
