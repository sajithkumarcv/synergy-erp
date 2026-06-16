import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { fmt, fmtDate, today } from '../../procurementConstants';
import { useFieldConfig } from '../../../FieldConfigContext';

const Field = ({ label, children, mono }) => (
    <div className="prd-ov-card">
        <div className="prd-ov-label">{label}</div>
        <div className={`prd-ov-val ${mono ? 'prd-ov-val-mono' : ''}`}>
            {children || <span className="prd-ov-val-muted">—</span>}
        </div>
    </div>
);

const RtvOverviewTab = ({ rtv, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { isReq } = useFieldConfig('RTV');

    const [editing, setEditing] = useState(false);
    const [form,    setForm]    = useState({});
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    // GRN live-search (only when no GRN is linked yet)
    const [grnSearch,   setGrnSearch]   = useState('');
    const [grnResults,  setGrnResults]  = useState([]);

    // Supplier live-search (only when no GRN and no supplier selected)
    const [supplierSearch,  setSupplierSearch]  = useState('');
    const [supplierResults, setSupplierResults] = useState([]);

    useEffect(() => {
        if (!grnSearch.trim()) { setGrnResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}grn/search?searchText=${encodeURIComponent(grnSearch)}&pageSize=10&page=1&status=Received`,
                { headers: authHeaders() })
                .then(r => r.json())
                .then(d => setGrnResults(d.data || []))
                .catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [grnSearch]);

    useEffect(() => {
        if (!supplierSearch.trim()) { setSupplierResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}supplier/search?searchText=${encodeURIComponent(supplierSearch)}&pageSize=10&page=1`,
                { headers: authHeaders() })
                .then(r => r.json())
                .then(d => setSupplierResults(d.data || []))
                .catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [supplierSearch]);

    // PO live-search (used when no GRN is linked)
    const [poSearch,   setPoSearch]   = useState('');
    const [poResults,  setPoResults]  = useState([]);

    useEffect(() => {
        if (!poSearch.trim()) { setPoResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}purchaseorder/search?searchText=${encodeURIComponent(poSearch)}&pageSize=8&page=1`, { headers: authHeaders() })
                .then(r => r.json()).then(d => setPoResults(d.data || [])).catch(() => {});
        }, 280);
        return () => clearTimeout(t);
    }, [poSearch]);

    const startEdit = () => {
        setForm({
            rtvDate:       rtv.rtvDate      ? rtv.rtvDate.slice(0, 10) : today(),
            grnId:         rtv.grnId        ? String(rtv.grnId)        : '',
            grnLabel:      rtv.grnNumber    || '',
            poId:          rtv.poId         ? String(rtv.poId)         : '',
            poLabel:       rtv.poNumber     || '',
            supplierId:    rtv.supplierId   ? String(rtv.supplierId)   : '',
            supplierLabel: rtv.supplierId
                               ? (rtv.supplierCode ? `${rtv.supplierCode} — ` : '') + (rtv.supplierName || '')
                               : '',
            returnReason:  rtv.returnReason || '',
            remarks:       rtv.remarks      || '',
        });
        setGrnSearch(''); setGrnResults([]);
        setPoSearch('');  setPoResults([]);
        setSupplierSearch(''); setSupplierResults([]);
        setEditing(true);
        setError('');
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
    };

    const save = () => {
        if (!form.rtvDate) { setError('RTV Date is required.'); return; }
        // Supplier required when no GRN linked (GRN auto-sets supplier)
        if (!form.grnId && !form.supplierId) { setError('Supplier is required (or link a GRN to auto-fill).'); return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}rtv/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                rtvId:        rtv.rtvId,
                rtvDate:      form.rtvDate,
                grnId:        form.grnId      ? Number(form.grnId)      : null,
                supplierId:   form.supplierId ? Number(form.supplierId) : null,
                poId:         form.poId       ? Number(form.poId)       : null,
                jobId:        rtv.jobId      || null,
                returnReason: form.returnReason.trim() || null,
                remarks:      form.remarks.trim()      || null,
                createdBy:    rtv.createdBy,
                modifiedBy:   currentUser,
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

    const canEdit   = rtv.status === 'Draft';
    const grnLinked = !!rtv.grnId;  // already saved GRN link (from DB)

    const dropStyle = {
        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999,
        background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6,
        boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto',
    };

    // ── Edit form ────────────────────────────────────────────────────────────
    if (editing) {
        const lbl   = { fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', marginBottom: 4, display: 'block' };
        const field = { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 130 };
        const row   = { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 };

        const effectiveGrnLinked = !!form.grnId;

        return (
            <div>
                {error && <div className="pf-err" style={{ marginBottom: 12 }}>{error}</div>}

                {/* Row 1: RTV Date + GRN link */}
                <div style={row}>
                    <div style={{ ...field, flex: '0 0 180px' }}>
                        <label style={lbl}>RTV Date {isReq('rtvDate') && <span className="req">*</span>}</label>
                        <input className="pf-input" type="date" name="rtvDate" value={form.rtvDate} onChange={handle} />
                    </div>

                    {/* GRN: clearable/searchable in Draft */}
                    <div style={{ ...field, flex: 2, position: 'relative' }}>
                        <label style={lbl}>Source GRN <span style={{ fontWeight: 400, textTransform: 'none', color: '#94a3b8' }}>(optional)</span></label>
                        {form.grnId ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="pf-input" style={{ background: '#f0f9ff', color: '#1e40af', fontWeight: 500, flex: 1 }}>
                                    {form.grnLabel}
                                </span>
                                <button type="button"
                                    onClick={() => setForm(p => ({ ...p, grnId: '', grnLabel: '', poId: '', poLabel: '', supplierId: '', supplierLabel: '' }))}
                                    style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                            </div>
                        ) : (
                            <>
                                <input className="pf-input" value={grnSearch}
                                    onChange={e => setGrnSearch(e.target.value)}
                                    placeholder="Search GRN# or supplier…" autoComplete="off" />
                                {grnResults.length > 0 && (
                                    <div style={dropStyle}>
                                        {grnResults.map(g => (
                                            <div key={g.grnId}
                                                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                                                onClick={() => {
                                                    setForm(p => ({
                                                        ...p,
                                                        grnId:         String(g.grnId),
                                                        grnLabel:      g.grnNumber,
                                                        poId:          g.poId    ? String(g.poId)    : p.poId,
                                                        poLabel:       g.poNumber || p.poLabel,
                                                        supplierId:    g.supplierId ? String(g.supplierId) : p.supplierId,
                                                        supplierLabel: g.supplierId
                                                            ? (g.supplierCode ? `${g.supplierCode} — ` : '') + (g.supplierName || '')
                                                            : p.supplierLabel,
                                                    }));
                                                    setGrnSearch(''); setGrnResults([]);
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                <strong style={{ fontFamily: 'Courier New', fontSize: 12 }}>{g.grnNumber}</strong>
                                                {g.supplierName && <span style={{ color: '#475569' }}> — {g.supplierName}</span>}
                                                <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6 }}>{g.grnDate ? new Date(g.grnDate).toLocaleDateString('en-GB') : ''}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* PO: auto-filled from GRN, or searchable when no GRN */}
                    <div style={{ ...field, position: 'relative' }}>
                        <label style={lbl}>Purchase Order <span style={{ fontWeight: 400, textTransform: 'none', color: '#94a3b8' }}>(optional)</span></label>
                        {form.grnId ? (
                            /* Derived from GRN — show read-only */
                            <div className="pf-input" style={{ background: '#f0f9ff', color: '#1e40af', fontWeight: 500 }}>
                                {form.poLabel || '(from GRN)'}
                            </div>
                        ) : form.poId ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="pf-input" style={{ background: '#f0f9ff', color: '#1e40af', fontWeight: 500, flex: 1 }}>{form.poLabel}</span>
                                <button type="button"
                                    onClick={() => { setForm(p => ({ ...p, poId: '', poLabel: '' })); setPoSearch(''); }}
                                    style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                            </div>
                        ) : (
                            <>
                                <input className="pf-input" value={poSearch}
                                    onChange={e => setPoSearch(e.target.value)}
                                    placeholder="Search PO number…" autoComplete="off" />
                                {poResults.length > 0 && (
                                    <div style={dropStyle}>
                                        {poResults.map(p => (
                                            <div key={p.poId}
                                                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                                                onClick={() => {
                                                    setForm(f => ({ ...f, poId: String(p.poId), poLabel: p.poNumber,
                                                        supplierId:    p.vendorId   ? String(p.vendorId)   : f.supplierId,
                                                        supplierLabel: p.vendorName ? p.vendorName          : f.supplierLabel,
                                                    }));
                                                    setPoSearch(''); setPoResults([]);
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                <strong style={{ fontFamily: 'Courier New', fontSize: 12 }}>{p.poNumber}</strong>
                                                {p.vendorName && <span style={{ color: '#475569' }}> — {p.vendorName}</span>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Row 2: Supplier (locked when GRN selected; searchable otherwise) */}
                <div style={row}>
                    <div style={{ ...field, flex: 2, position: 'relative' }}>
                        <label style={lbl}>
                            Supplier {isReq('supplierId') && <span className="req">*</span>}
                            {effectiveGrnLinked && <span style={{ fontWeight: 400, textTransform: 'none', color: '#64748b', marginLeft: 4 }}>(from GRN — locked)</span>}
                        </label>
                        {effectiveGrnLinked ? (
                            <div className="pf-input" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ opacity: .55, fontSize: 10 }}>🔒</span>
                                {form.supplierId ? form.supplierLabel : (rtv.supplierName || '—')}
                            </div>
                        ) : form.supplierId ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span className="pf-input" style={{ background: '#f0fdf4', color: '#166534', fontWeight: 500, flex: 1 }}>✓ {form.supplierLabel}</span>
                                <button type="button"
                                    onClick={() => { setForm(p => ({ ...p, supplierId: '', supplierLabel: '' })); setSupplierSearch(''); }}
                                    style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                            </div>
                        ) : (
                            <>
                                <input className="pf-input" value={supplierSearch}
                                    onChange={e => setSupplierSearch(e.target.value)}
                                    placeholder="Type to search supplier…" autoComplete="off" />
                                {supplierResults.length > 0 && (
                                    <div style={dropStyle}>
                                        {supplierResults.map(s => (
                                            <div key={s.supplierId}
                                                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                                                onClick={() => { setForm(p => ({ ...p, supplierId: String(s.supplierId), supplierLabel: `${s.supplierCode} — ${s.supplierName}` })); setSupplierSearch(''); setSupplierResults([]); }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                <strong>{s.supplierCode}</strong> — {s.supplierName}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Row 3: Return Reason */}
                <div style={row}>
                    <div style={{ ...field, flex: 3 }}>
                        <label style={lbl}>Return Reason</label>
                        <input className="pf-input" type="text" name="returnReason" value={form.returnReason} onChange={handle}
                            placeholder="Defective goods, wrong item, over-delivery, quality failure…" />
                    </div>
                </div>

                {/* Row 4: Remarks */}
                <div style={row}>
                    <div style={{ ...field, flex: 3 }}>
                        <label style={lbl}>Remarks</label>
                        <textarea className="pf-input pf-textarea" rows={3} name="remarks" value={form.remarks} onChange={handle} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                    <button className="pf-btn-sec" onClick={() => setEditing(false)}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button>
                </div>
            </div>
        );
    }

    // ── Read-only view ───────────────────────────────────────────────────────
    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                {canEdit && <button className="jd-stage-btn" onClick={startEdit}>✏ Edit</button>}
            </div>

            {/* Hint when no GRN linked yet */}
            {canEdit && !grnLinked && (
                <div style={{ padding: '9px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, fontSize: 12, color: '#92400e', marginBottom: 12 }}>
                    💡 No GRN linked. Click <strong>✏ Edit</strong> to link a source GRN — this enables <strong>Import from GRN</strong> on the Lines tab.
                </div>
            )}

            <div className="prd-ov-grid">
                <Field label="RTV Number" mono>{rtv.rtvNumber}</Field>
                <Field label="RTV Date">{fmtDate(rtv.rtvDate)}</Field>
                <Field label="Status">
                    <span style={{
                        background: rtv.status === 'Posted' ? '#dcfce7' : rtv.status === 'Cancelled' ? '#fee2e2' : '#e0f2fe',
                        color:      rtv.status === 'Posted' ? '#166534' : rtv.status === 'Cancelled' ? '#991b1b' : '#0369a1',
                        padding: '2px 9px', borderRadius: 10, fontSize: 11, fontWeight: 700,
                    }}>{rtv.status}</span>
                </Field>
                <Field label="Supplier">{rtv.supplierName}</Field>
                {rtv.grnNumber && <Field label="Source GRN" mono>{rtv.grnNumber}</Field>}
                {rtv.poNumber  && <Field label="Purchase Order" mono>{rtv.poNumber}</Field>}
                {rtv.jobId     && <Field label="Job" mono>{rtv.jobId}</Field>}
                <Field label="Return Reason">{rtv.returnReason}</Field>
                <div className="prd-ov-card" style={{ borderColor: '#fca5a5', background: '#fff5f5' }}>
                    <div className="prd-ov-label">Total Return Value</div>
                    <div className="prd-ov-val" style={{ color: '#dc2626', fontWeight: 600, fontSize: 15 }}>{fmt(rtv.totalAmount)}</div>
                </div>
                <Field label="Created By">{rtv.createdBy}</Field>
                <Field label="Created Date">{fmtDate(rtv.createdDate)}</Field>
                {rtv.modifiedBy && <Field label="Last Modified By">{rtv.modifiedBy}</Field>}
            </div>

            {rtv.remarks && (
                <div className="prd-ov-notes">
                    <div className="prd-ov-notes-label">Remarks</div>
                    <div className="prd-ov-notes-text">{rtv.remarks}</div>
                </div>
            )}
        </div>
    );
};

export default RtvOverviewTab;
