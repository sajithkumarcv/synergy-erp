import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { usePermission } from '../../../PermissionContext';
import { fmtDate } from '../../procurementConstants';

const Field = ({ label, children, mono, span2 }) => (
    <div className="prd-ov-card" style={span2 ? { gridColumn: 'span 2' } : {}}>
        <div className="prd-ov-label">{label}</div>
        <div className={`prd-ov-val${mono ? ' prd-ov-val-mono' : ''}`}>
            {children || <span className="prd-ov-val-muted">—</span>}
        </div>
    </div>
);

const ScOverviewTab = ({ sc, editable, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { canDo }   = usePermission();

    const [editing,   setEditing]   = useState(false);
    const [form,      setForm]      = useState({});
    const [saving,    setSaving]    = useState(false);
    const [error,     setError]     = useState('');

    // PO search state (edit mode only)
    const [poSearch,  setPoSearch]  = useState('');
    const [poResults, setPoResults] = useState([]);

    const canEdit = editable && canDo('/subcontracts', 'EDIT');

    const startEdit = () => {
        setForm({
            poId:               sc.poId   || null,
            poLabel:            sc.poNumber || '',
            outputQty:          sc.outputQty != null ? String(sc.outputQty) : '',
            expectedDate:       sc.expectedDate ? sc.expectedDate.slice(0, 10) : '',
            serviceDescription: sc.serviceDescription || '',
            remarks:            sc.remarks || '',
        });
        setPoSearch(''); setPoResults([]);
        setEditing(true); setError('');
    };

    // PO live search
    useEffect(() => {
        if (!poSearch.trim()) { setPoResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}purchaseorder/search?search=${encodeURIComponent(poSearch)}&pageSize=10&isSubcontractOnly=true&status=Approved`, { headers: authHeaders() })
                .then(r => r.json())
                .then(d => setPoResults(Array.isArray(d?.data) ? d.data : []))
                .catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [poSearch]);

    const handle = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

    const selectPo = po => {
        setForm(p => ({ ...p, poId: po.poId, poLabel: po.poNumber }));
        setPoSearch(''); setPoResults([]);
    };

    const clearPo = () => setForm(p => ({ ...p, poId: null, poLabel: '' }));

    const save = async () => {
        if (!form.outputQty || Number(form.outputQty) <= 0)
            return setError('Output quantity must be > 0.');
        setSaving(true); setError('');
        try {
            const r = await fetch(`${variables.API_URL}subcontract/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    subcontractId:      sc.subcontractId,
                    subcontractType:    sc.subcontractType,
                    vendorId:           sc.vendorId,
                    jobId:              sc.jobId || null,
                    budgetHeaderId:     sc.budgetHeaderId || null,
                    outputItemId:       sc.outputItemId,
                    outputQty:          Number(form.outputQty),
                    outputUomId:        sc.outputUomId || null,
                    serviceDescription: form.serviceDescription || null,
                    expectedDate:       form.expectedDate || null,
                    remarks:            form.remarks || null,
                    poId:               form.poId || null,
                    actionBy:           currentUser,
                }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.message || 'Save failed.');
            setEditing(false);
            if (onRefresh) onRefresh();
        } catch (e) { setError(e.message); }
        finally { setSaving(false); }
    };

    if (!sc) return null;

    const isMaterialOut = sc.subcontractType === 'MATERIAL_OUT';

    // ── Edit form ─────────────────────────────────────────────────────────────
    if (editing) {
        const lbl   = { fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4, display: 'block' };
        const field = { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 130 };
        const row   = { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 };

        return (
            <div>
                {error && <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>}

                {/* Read-only info strip */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18, padding: '12px 14px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                    {[
                        { label: 'SC No',       val: sc.subcontractNo, mono: true },
                        { label: 'Type',        val: isMaterialOut ? 'Material Out' : 'Service Only' },
                        { label: 'Status',      val: sc.status },
                        { label: 'Vendor',      val: sc.vendorName || '—' },
                        { label: 'Output Item', val: sc.outputItemCode ? `${sc.outputItemCode} — ${sc.outputItemName}` : '—' },
                        { label: 'Job Ref',     val: sc.jobId || '—', mono: true },
                    ].map(f => (
                        <div key={f.label}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 2 }}>{f.label}</div>
                            <div style={{ fontSize: 13, fontWeight: 500, color: '#1e293b', fontFamily: f.mono ? 'Courier New, monospace' : undefined }}>{f.val}</div>
                        </div>
                    ))}
                </div>

                {/* PO link */}
                <div style={row}>
                    <div style={{ ...field, flex: 2 }}>
                        <label style={lbl}>Linked PO *</label>
                        {form.poId
                            ? <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ flex: 1, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '7px 12px', fontFamily: 'Courier New, monospace', fontSize: 13, fontWeight: 700, color: '#1e40af' }}>
                                    {form.poLabel}
                                </span>
                                <button type="button" onClick={clearPo}
                                    style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '7px 12px', cursor: 'pointer', color: '#991b1b', fontWeight: 700, fontSize: 12 }}>
                                    ✕ Clear
                                </button>
                            </div>
                            : <div style={{ position: 'relative' }}>
                                <input className="pf-input" placeholder="Search PO number…" value={poSearch}
                                    onChange={e => setPoSearch(e.target.value)} autoComplete="off" />
                                {poResults.length > 0 && (
                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.10)', maxHeight: 200, overflowY: 'auto', marginTop: 2 }}>
                                        {poResults.map(po => (
                                            <div key={po.poId} onClick={() => selectPo(po)}
                                                onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                                style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}>
                                                <span style={{ fontFamily: 'Courier New', fontWeight: 700, color: '#1e40af', marginRight: 10 }}>{po.poNumber}</span>
                                                <span style={{ color: '#64748b', fontSize: 12 }}>{po.supplierName || po.vendorName}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        }
                    </div>
                </div>

                {/* Output Qty + Expected Date */}
                <div style={row}>
                    <div style={{ ...field, flex: '0 0 180px' }}>
                        <label style={lbl}>Output Qty *</label>
                        <input className="pf-input" type="number" min="0" step="any"
                            name="outputQty" value={form.outputQty} onChange={handle} />
                    </div>
                    <div style={field}>
                        <label style={lbl}>Expected Date</label>
                        <input className="pf-input" type="date"
                            name="expectedDate" value={form.expectedDate} onChange={handle} />
                    </div>
                </div>

                {/* Description */}
                <div style={row}>
                    <div style={{ ...field, flex: 3 }}>
                        <label style={lbl}>Description / Work Scope</label>
                        <textarea className="pf-input pf-textarea" rows={3}
                            name="serviceDescription" value={form.serviceDescription} onChange={handle}
                            placeholder="Describe the work to be done by vendor…" />
                    </div>
                </div>

                {/* Remarks */}
                <div style={row}>
                    <div style={{ ...field, flex: 3 }}>
                        <label style={lbl}>Internal Remarks</label>
                        <textarea className="pf-input pf-textarea" rows={2}
                            name="remarks" value={form.remarks} onChange={handle}
                            placeholder="Internal notes…" />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button className="pf-btn-sec" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Changes'}
                    </button>
                </div>
            </div>
        );
    }

    // ── Read-only view ────────────────────────────────────────────────────────
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                {canEdit && <button className="jd-stage-btn" onClick={startEdit}>✏ Edit</button>}
            </div>

            <div className="prd-ov-grid">
                <Field label="SC No" mono>{sc.subcontractNo}</Field>
                <Field label="Type">
                    <span style={{
                        fontSize: 11, fontWeight: 600,
                        color:      isMaterialOut ? '#1e40af' : '#6d28d9',
                        background: isMaterialOut ? '#dbeafe'  : '#ede9fe',
                        padding: '2px 8px', borderRadius: 4,
                    }}>
                        {isMaterialOut ? 'Material Out' : 'Service Only'}
                    </span>
                </Field>
                <Field label="Status">{sc.status}</Field>
                <Field label="Vendor">{sc.vendorName}</Field>
                <Field label="Output Item">
                    {sc.outputItemCode && (
                        <>
                            <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '1px 5px', borderRadius: 3, marginRight: 6 }}>{sc.outputItemCode}</span>
                            {sc.outputItemName}
                        </>
                    )}
                </Field>
                <Field label="Job Ref" mono>{sc.jobId}</Field>

                {/* Always show Linked PO — highlighted when set, muted when missing */}
                <div className="prd-ov-card" style={sc.poNumber ? { borderColor: '#bae6fd', background: '#f0f9ff' } : {}}>
                    <div className="prd-ov-label">Linked PO</div>
                    <div className="prd-ov-val prd-ov-val-mono">
                        {sc.poNumber
                            ? <span style={{ color: '#0369a1', fontWeight: 700 }}>{sc.poNumber}</span>
                            : <span className="prd-ov-val-muted">{canEdit ? 'Not linked — click Edit to set' : '—'}</span>
                        }
                    </div>
                </div>

                <Field label="Output Qty" mono>
                    {Number(sc.outputQty).toLocaleString()}{sc.outputUomName ? ` ${sc.outputUomName}` : ''}
                </Field>
                <Field label="Expected Date">{fmtDate(sc.expectedDate)}</Field>
                <Field label="Total Received" mono>
                    <span style={{ color: Number(sc.totalReceivedQty) >= Number(sc.outputQty) ? '#16a34a' : '#1e293b', fontWeight: 600 }}>
                        {Number(sc.totalReceivedQty || 0).toLocaleString()}
                    </span>
                    {' '}/ {Number(sc.outputQty).toLocaleString()}
                </Field>
                <Field label="Created By">
                    {sc.createdBy}
                    {sc.createdDate && <span style={{ color: '#64748b', marginLeft: 8, fontSize: 11 }}>· {fmtDate(sc.createdDate)}</span>}
                </Field>
                {sc.modifiedBy && (
                    <Field label="Last Modified">
                        {sc.modifiedBy}
                        {sc.modifiedDate && <span style={{ color: '#64748b', marginLeft: 8, fontSize: 11 }}>· {fmtDate(sc.modifiedDate)}</span>}
                    </Field>
                )}
            </div>

            {sc.serviceDescription && (
                <div className="prd-ov-notes" style={{ marginTop: 16 }}>
                    <div className="prd-ov-notes-label">Description / Work Scope</div>
                    <div className="prd-ov-notes-text">{sc.serviceDescription}</div>
                </div>
            )}

            {sc.remarks && (
                <div className="prd-ov-notes" style={{ marginTop: 10 }}>
                    <div className="prd-ov-notes-label">Internal Remarks</div>
                    <div className="prd-ov-notes-text">{sc.remarks}</div>
                </div>
            )}
        </div>
    );
};

export default ScOverviewTab;
