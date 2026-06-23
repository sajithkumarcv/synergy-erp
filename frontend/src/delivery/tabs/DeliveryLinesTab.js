import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { usePermission } from '../../PermissionContext';
import { fmt, fmtDate } from '../deliveryConstants';
import AlertModal from '../../common/AlertModal';

// ── Invoice Import Modal ──────────────────────────────────────────────
const InvoiceImportModal = ({ delivery, onClose, onImported }) => {
    const currentUser = useCurrentUser();

    const [invoices,      setInvoices]      = useState([]);
    const [invLoading,    setInvLoading]    = useState(true);
    const [selectedInv,   setSelectedInv]   = useState(null);

    const [invLines,      setInvLines]      = useState([]);
    const [linesLoading,  setLinesLoading]  = useState(false);
    const [selected,      setSelected]      = useState({});
    const [qtyMap,        setQtyMap]        = useState({});

    const [importing,     setImporting]     = useState(false);
    const [error,         setError]         = useState('');

    useEffect(() => {
        setInvLoading(true);
        fetch(`${variables.API_URL}delivery/invoices/${delivery.customerId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setInvoices(Array.isArray(d) ? d : []))
            .catch(() => setError('Failed to load invoices.'))
            .finally(() => setInvLoading(false));
    }, [delivery.customerId]);

    const selectInvoice = (inv) => {
        setSelectedInv(inv);
        setInvLines([]); setSelected({}); setQtyMap({});
        setLinesLoading(true);
        fetch(`${variables.API_URL}delivery/invoicelines/${inv.invoiceId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(rows => {
                const list = Array.isArray(rows) ? rows : [];
                setInvLines(list);
                const sel = {}, qty = {};
                list.forEach(l => {
                    if (l.pendingQty > 0) {
                        sel[l.invoiceLineId] = true;
                        qty[l.invoiceLineId] = String(l.pendingQty);
                    } else {
                        sel[l.invoiceLineId] = false;
                        qty[l.invoiceLineId] = '0';
                    }
                });
                setSelected(sel); setQtyMap(qty);
            })
            .catch(() => setError('Failed to load invoice lines.'))
            .finally(() => setLinesLoading(false));
    };

    const toggle    = id => setSelected(p => ({ ...p, [id]: !p[id] }));
    const toggleAll = () => {
        const allOn = invLines.filter(l => l.pendingQty > 0).every(l => selected[l.invoiceLineId]);
        const next  = {};
        invLines.forEach(l => { next[l.invoiceLineId] = l.pendingQty > 0 ? !allOn : false; });
        setSelected(p => ({ ...p, ...next }));
    };

    const doImport = async () => {
        const toImport = invLines.filter(l => selected[l.invoiceLineId]);
        if (toImport.length === 0) { setError('No lines selected.'); return; }

        const invalid = toImport.filter(l =>
            !qtyMap[l.invoiceLineId] || isNaN(Number(qtyMap[l.invoiceLineId])) || Number(qtyMap[l.invoiceLineId]) <= 0
        );
        if (invalid.length > 0) { setError('All selected lines must have quantity > 0.'); return; }

        const overQty = toImport.filter(l => Number(qtyMap[l.invoiceLineId]) > l.pendingQty);
        if (overQty.length > 0) {
            setError(`Qty cannot exceed pending qty for: ${overQty.map(l => l.description).join(', ')}`);
            return;
        }

        setImporting(true); setError('');
        let lineNum = (delivery.lines?.length || 0) + 1;

        try {
            for (const l of toImport) {
                const body = {
                    deliveryLineId: 0,
                    deliveryId:     delivery.deliveryId,
                    invoiceLineId:  l.invoiceLineId,
                    lineNum:        lineNum++,
                    description:    l.description,
                    uomName:        l.uomName || null,
                    qty:            Number(qtyMap[l.invoiceLineId]),
                    remarks:        null,
                    createdBy:      currentUser,
                };
                const r = await fetch(`${variables.API_URL}delivery/saveline`, {
                    method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
                });
                if (!r.ok) {
                    const d = await r.json();
                    throw new Error(d.message || 'Save failed.');
                }
            }
            onImported();
        } catch (err) {
            setError(err.message || 'Import failed.');
        } finally {
            setImporting(false);
        }
    };

    const ovStyle   = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' };
    const panStyle  = { background: '#fff', borderRadius: 12, width: '92%', maxWidth: 820, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,.22)' };
    const hdrStyle  = { padding: '16px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
    const bodyStyle = { padding: '18px 22px', overflowY: 'auto', flex: 1 };
    const ftrStyle  = { padding: '12px 22px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 10 };
    const btnPri    = { padding: '8px 20px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 };
    const btnSec    = { padding: '8px 16px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 7, cursor: 'pointer', fontSize: 13 };

    return (
        <div style={ovStyle}
            onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
            onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) onClose(); }}>
            <div style={panStyle}>
                <div style={hdrStyle}>
                    <div>
                        <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
                            {selectedInv ? `Import Lines from ${selectedInv.invoiceNo}` : 'Select Invoice'}
                        </div>
                        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                            Customer: <strong>{delivery.customerName}</strong>
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#64748b' }}>✕</button>
                </div>

                <div style={bodyStyle}>
                    {error && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, marginBottom: 12, fontSize: 13 }}>⚠ {error}</div>}

                    {!selectedInv ? (
                        // Step 1: pick invoice
                        invLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading invoices…</div> :
                        invoices.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>No invoices with pending delivery found for this customer.</div> :
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    {['Invoice No','Date','Job','LPO No','Amount','Status'].map(h => (
                                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '2px solid #e2e8f0', fontSize: 12, color: '#475569', fontWeight: 600 }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.map(inv => (
                                    <tr key={inv.invoiceId}
                                        onClick={() => selectInvoice(inv)}
                                        style={{ cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                                        onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                        onMouseLeave={e => e.currentTarget.style.background = ''}>
                                        <td style={{ padding: '8px 10px', fontWeight: 600, color: '#1e40af' }}>{inv.invoiceNo}</td>
                                        <td style={{ padding: '8px 10px', color: '#475569' }}>{fmtDate(inv.invoiceDate)}</td>
                                        <td style={{ padding: '8px 10px', color: '#475569' }}>{inv.jobId || '—'}</td>
                                        <td style={{ padding: '8px 10px', color: '#475569' }}>{inv.lpoNo || '—'}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: '#1e293b' }}>{fmt(inv.totalAmount)}</td>
                                        <td style={{ padding: '8px 10px' }}>
                                            <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{inv.status}</span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        // Step 2: select lines
                        <>
                            <button onClick={() => { setSelectedInv(null); setInvLines([]); }} style={{ ...btnSec, marginBottom: 12, fontSize: 12 }}>
                                ← Back to invoices
                            </button>
                            {linesLoading ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading lines…</div> :
                            invLines.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>No pending lines found.</div> :
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        <th style={{ padding: '8px 10px', width: 36 }}>
                                            <input type="checkbox"
                                                checked={invLines.filter(l => l.pendingQty > 0).length > 0 && invLines.filter(l => l.pendingQty > 0).every(l => selected[l.invoiceLineId])}
                                                onChange={toggleAll} />
                                        </th>
                                        {['Description','UOM','Inv Qty','Delivered','Pending','Qty to Deliver'].map(h => (
                                            <th key={h} style={{ padding: '8px 10px', textAlign: h.includes('Qty') || h === 'UOM' ? 'right' : 'left', borderBottom: '2px solid #e2e8f0', fontSize: 12, color: '#475569', fontWeight: 600 }}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {invLines.map(l => (
                                        <tr key={l.invoiceLineId} style={{ borderBottom: '1px solid #f1f5f9', opacity: l.pendingQty <= 0 ? 0.5 : 1 }}>
                                            <td style={{ padding: '8px 10px' }}>
                                                <input type="checkbox" checked={!!selected[l.invoiceLineId]}
                                                    disabled={l.pendingQty <= 0}
                                                    onChange={() => toggle(l.invoiceLineId)} />
                                            </td>
                                            <td style={{ padding: '8px 10px', color: '#1e293b' }}>{l.description}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#475569' }}>{l.uomName || '—'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>{fmt(l.invoiceQty, 3)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', color: '#64748b' }}>{fmt(l.alreadyDeliveredQty, 3)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: l.pendingQty > 0 ? '#166534' : '#dc2626' }}>{fmt(l.pendingQty, 3)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right' }}>
                                                <input type="number" value={qtyMap[l.invoiceLineId] || ''}
                                                    onChange={e => setQtyMap(p => ({ ...p, [l.invoiceLineId]: e.target.value }))}
                                                    disabled={!selected[l.invoiceLineId]}
                                                    min="0.001" step="any"
                                                    style={{ width: 90, padding: '4px 8px', border: '1px solid #cbd5e1', borderRadius: 5, textAlign: 'right', fontSize: 13 }} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>}
                        </>
                    )}
                </div>

                <div style={ftrStyle}>
                    <button onClick={onClose} style={btnSec}>Cancel</button>
                    {selectedInv && (
                        <button onClick={doImport} disabled={importing} style={{ ...btnPri, opacity: importing ? 0.7 : 1 }}>
                            {importing ? 'Importing…' : `Import Selected Lines`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Manual Line Form ──────────────────────────────────────────────────
const ManualLineForm = ({ delivery, editLine, seedDescription = '', fromJob = false, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    // Editing keeps the line's own description; a new line uses the seed the
    // caller supplies (blank for a manual line, the Job Description when loading from job).
    const [form, setForm] = useState({
        description: editLine ? (editLine.description || '') : seedDescription,
        uomName:     editLine?.uomName     || '',
        qty:         editLine?.qty         != null ? String(editLine.qty) : '',
        remarks:     editLine?.remarks     || '',
    });
    const [errors,  setErrors]  = useState({});
    const [saving,  setSaving]  = useState(false);
    const [errMsg,  setErrMsg]  = useState('');

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        if (errors[name]) setErrors(p => ({ ...p, [name]: undefined }));
    };

    const validate = f => {
        const e = {};
        if (!f.description.trim()) e.description = 'Description is required.';
        if (!f.qty || isNaN(Number(f.qty)) || Number(f.qty) <= 0) e.qty = 'Qty must be > 0.';
        return e;
    };

    const save = () => {
        const e = validate(form);
        setErrors(e);
        if (Object.keys(e).length > 0) return;
        setSaving(true); setErrMsg('');
        const body = {
            deliveryLineId: editLine?.deliveryLineId || 0,
            deliveryId:     delivery.deliveryId,
            invoiceLineId:  editLine?.invoiceLineId || null,
            lineNum:        editLine?.lineNum || 0,
            description:    form.description.trim(),
            uomName:        form.uomName.trim() || null,
            qty:            Number(form.qty),
            remarks:        form.remarks.trim() || null,
            createdBy:      currentUser,
        };
        fetch(`${variables.API_URL}delivery/saveline`, {
            method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setErrMsg(d.message || 'Error saving line.'); return; }
                onSaved();
            })
            .catch(() => setErrMsg('Network error.'))
            .finally(() => setSaving(false));
    };

    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', marginBottom: 12 }}>
                {editLine ? 'Edit Line' : fromJob ? '📋 Load from Job Description' : 'Add Line Manually'}
            </div>
            {errMsg && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '7px 12px', borderRadius: 6, marginBottom: 10, fontSize: 13 }}>⚠ {errMsg}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px 1fr', gap: 10 }}>
                <div>
                    <label style={{ fontSize: 12, color: '#64748b', fontWeight: 500, display: 'block', marginBottom: 4 }}>
                        Description <span style={{ color: '#dc2626' }}>*</span>
                        {!editLine && fromJob && delivery?.jobId && <span style={{ color: '#0f766e', fontWeight: 400 }}> · from Job {delivery.jobId}</span>}
                    </label>
                    <input name="description" value={form.description} onChange={handle}
                        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${errors.description ? '#dc2626' : '#cbd5e1'}`, borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                        placeholder="Item / service description" />
                    {errors.description && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }}>⚠ {errors.description}</div>}
                </div>
                <div>
                    <label style={{ fontSize: 12, color: '#64748b', fontWeight: 500, display: 'block', marginBottom: 4 }}>UOM</label>
                    <input name="uomName" value={form.uomName} onChange={handle}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                        placeholder="Nos / Kg…" />
                </div>
                <div>
                    <label style={{ fontSize: 12, color: '#64748b', fontWeight: 500, display: 'block', marginBottom: 4 }}>Qty <span style={{ color: '#dc2626' }}>*</span></label>
                    <input name="qty" value={form.qty} onChange={handle} type="number" min="0.001" step="any"
                        style={{ width: '100%', padding: '7px 10px', border: `1px solid ${errors.qty ? '#dc2626' : '#cbd5e1'}`, borderRadius: 6, fontSize: 13, textAlign: 'right', boxSizing: 'border-box' }}
                        placeholder="0" />
                    {errors.qty && <div style={{ color: '#dc2626', fontSize: 11, marginTop: 2 }}>⚠ {errors.qty}</div>}
                </div>
                <div>
                    <label style={{ fontSize: 12, color: '#64748b', fontWeight: 500, display: 'block', marginBottom: 4 }}>Remarks</label>
                    <input name="remarks" value={form.remarks} onChange={handle}
                        style={{ width: '100%', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }}
                        placeholder="Optional remarks" />
                </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                <button onClick={onClose}
                    style={{ padding: '7px 14px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                    Cancel
                </button>
                <button onClick={save} disabled={saving}
                    style={{ padding: '7px 16px', background: saving ? '#93c5fd' : '#1e40af', color: '#fff', border: 'none', borderRadius: 6, cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600 }}>
                    {saving ? 'Saving…' : (editLine ? 'Update Line' : 'Add Line')}
                </button>
            </div>
        </div>
    );
};

// ── Main Lines Tab ────────────────────────────────────────────────────
const DeliveryLinesTab = ({ delivery, lines, onRefresh }) => {
    const { canDo } = usePermission();
    const canEdit   = canDo('/delivery', 'EDIT') && (delivery.status === 'Draft' || delivery.status === 'Approved');

    const [showImport,    setShowImport]    = useState(false);
    const [showManual,    setShowManual]    = useState(false);
    const [manualFromJob, setManualFromJob] = useState(false);
    const [editLine,      setEditLine]      = useState(null);

    const hasJobDescription = !!(delivery.jobId && (delivery.jobDescription || '').trim());
    const [deletingId,    setDeletingId]    = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);
    const [alertMsg,      setAlertMsg]      = useState(null);

    const deleteLine = async (id) => {
        setDeletingId(id);
        try {
            const res = await fetch(`${variables.API_URL}delivery/deleteline/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) { const d = await res.json(); setAlertMsg(d?.message || 'Failed to delete line.'); return; }
            onRefresh();
        } catch {
            setAlertMsg('Network error. Please try again.');
        } finally {
            setDeletingId(null); setDeleteConfirm(null);
        }
    };

    return (
        <div style={{ padding: '20px 24px' }}>
            {/* Action bar */}
            {canEdit && !showManual && !editLine && (
                <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                    <button onClick={() => { setShowImport(true); setShowManual(false); setEditLine(null); }}
                        style={{ padding: '8px 16px', background: '#1e40af', color: '#fff', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        📥 Import from Invoice
                    </button>
                    {hasJobDescription && (
                        <button onClick={() => { setShowManual(true); setManualFromJob(true); setEditLine(null); }}
                            style={{ padding: '8px 16px', background: '#f0fdfa', color: '#0f766e', border: '1px solid #99f6e4', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                            📋 Load from Job Description
                        </button>
                    )}
                    <button onClick={() => { setShowManual(true); setManualFromJob(false); setEditLine(null); }}
                        style={{ padding: '8px 16px', background: '#f8fafc', color: '#1e40af', border: '1px solid #bfdbfe', borderRadius: 7, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        + Add Line Manually
                    </button>
                </div>
            )}

            {/* Manual line form */}
            {(showManual || editLine) && canEdit && (
                <ManualLineForm
                    delivery={delivery}
                    editLine={editLine}
                    fromJob={!editLine && manualFromJob}
                    seedDescription={!editLine && manualFromJob ? (delivery.jobDescription || '') : ''}
                    onClose={() => { setShowManual(false); setManualFromJob(false); setEditLine(null); }}
                    onSaved={() => { setShowManual(false); setManualFromJob(false); setEditLine(null); onRefresh(); }}
                />
            )}

            {/* Lines table */}
            {lines.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: '#94a3b8' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📦</div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>No delivery lines yet</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Import from invoice or add lines manually</div>
                </div>
            ) : (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                            <tr style={{ background: '#f8fafc' }}>
                                {['#','Description','UOM','Qty','Invoice Line','Remarks',''].map((h, i) => (
                                    <th key={i} style={{
                                        padding: '9px 12px',
                                        textAlign: ['Qty'].includes(h) ? 'right' : 'left',
                                        borderBottom: '2px solid #e2e8f0',
                                        fontSize: 12, fontWeight: 600, color: '#475569',
                                        whiteSpace: 'nowrap',
                                    }}>{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((l, i) => (
                                <tr key={l.deliveryLineId} style={{ borderBottom: '1px solid #f1f5f9' }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                                    <td style={{ padding: '9px 12px', color: '#94a3b8', width: 36 }}>{i + 1}</td>
                                    <td style={{ padding: '9px 12px', color: '#1e293b', fontWeight: 500 }}>{l.description}</td>
                                    <td style={{ padding: '9px 12px', color: '#64748b' }}>{l.uomName || '—'}</td>
                                    <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, color: '#1e293b' }}>{fmt(l.qty, 3)}</td>
                                    <td style={{ padding: '9px 12px', color: '#64748b' }}>
                                        {l.invoiceLineId
                                            ? <span style={{ background: '#eff6ff', color: '#1d4ed8', padding: '2px 7px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>INV LINE</span>
                                            : <span style={{ color: '#94a3b8', fontSize: 11 }}>Manual</span>}
                                    </td>
                                    <td style={{ padding: '9px 12px', color: '#64748b' }}>{l.remarks || '—'}</td>
                                    <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                        {canEdit && (
                                            deleteConfirm === l.deliveryLineId ? (
                                                <span style={{ fontSize: 12 }}>
                                                    Delete?{' '}
                                                    <button onClick={() => deleteLine(l.deliveryLineId)}
                                                        disabled={deletingId === l.deliveryLineId}
                                                        style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11, marginRight: 4 }}>
                                                        {deletingId === l.deliveryLineId ? '…' : 'Yes'}
                                                    </button>
                                                    <button onClick={() => setDeleteConfirm(null)}
                                                        style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', fontSize: 11 }}>No</button>
                                                </span>
                                            ) : (
                                                <>
                                                    <button onClick={() => { setEditLine(l); setShowManual(false); }}
                                                        title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 14, marginRight: 6 }}>✏️</button>
                                                    <button onClick={() => setDeleteConfirm(l.deliveryLineId)}
                                                        title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 14 }}>🗑️</button>
                                                </>
                                            )
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                                <td colSpan={3} style={{ padding: '9px 12px', textAlign: 'right', color: '#475569', fontSize: 12 }}>Total Lines: {lines.length}</td>
                                <td style={{ padding: '9px 12px', textAlign: 'right', color: '#1e293b' }}>
                                    {fmt(lines.reduce((s, l) => s + Number(l.qty || 0), 0), 3)}
                                </td>
                                <td colSpan={3}></td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            {/* Import modal */}
            {showImport && (
                <InvoiceImportModal
                    delivery={{ ...delivery, lines }}
                    onClose={() => setShowImport(false)}
                    onImported={() => { setShowImport(false); onRefresh(); }}
                />
            )}
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
        </div>
    );
};

export default DeliveryLinesTab;
