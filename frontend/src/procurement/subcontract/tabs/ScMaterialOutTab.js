import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { fmtDate, today } from '../../procurementConstants';

// ── Confirm Modal ─────────────────────────────────────────────────────────────
const ConfirmModal = ({ title, message, confirmLabel, confirmStyle, onConfirm, onClose, busy, error }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: 10, padding: 28, width: 420, maxWidth: '95vw', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b', marginBottom: 8 }}>{title}</div>
            <div style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{message}</div>
            {error && <div style={{ color: '#dc2626', fontSize: 12, marginBottom: 12, padding: '6px 10px', background: '#fef2f2', borderRadius: 5, border: '1px solid #fecaca' }}>⚠ {error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={onClose} disabled={busy} style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                <button onClick={onConfirm} disabled={busy} style={{ padding: '7px 18px', borderRadius: 6, border: 'none', fontSize: 13, fontWeight: 500, cursor: busy ? 'default' : 'pointer', opacity: busy ? .7 : 1, ...confirmStyle }}>
                    {busy ? 'Processing…' : confirmLabel}
                </button>
            </div>
        </div>
    </div>
);

// ── Print helper ──────────────────────────────────────────────────────────────
const printMto = async (mtoId, sc) => {
    let detail = null;
    try {
        const r = await fetch(`${variables.API_URL}subcontract/material-out/${mtoId}`, { headers: authHeaders() });
        detail = await r.json();
    } catch { return; }

    const h = detail.header || {};
    const lines = detail.lines || [];

    const html = `<!DOCTYPE html><html><head><title>Material Out — ${h.materialOutNo}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 0; padding: 20px 32px; }
  h1 { font-size: 18px; font-weight: 700; margin: 0 0 2px; letter-spacing: 1px; }
  .subtitle { font-size: 12px; color: #64748b; margin-bottom: 16px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 20px; margin-bottom: 20px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
  .info-item { }
  .info-label { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .5px; }
  .info-val { font-size: 12px; font-weight: 600; color: #1e293b; }
  .info-val.mono { font-family: 'Courier New', monospace; color: #1e40af; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11.5px; }
  th { background: #f1f5f9; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #475569; padding: 7px 10px; border: 1px solid #e2e8f0; text-align: left; }
  td { padding: 7px 10px; border: 1px solid #e2e8f0; vertical-align: middle; }
  td.right { text-align: right; }
  .warn { background: #fff7ed; color: #92400e; }
  .sign-row { display: flex; gap: 40px; margin-top: 40px; }
  .sign-box { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10px; color: #64748b; text-align: center; }
  @media print { body { padding: 10px 20px; } }
</style></head><body>
<h1>MATERIAL OUT</h1>
<div class="subtitle">Subcontract Material Outward Document</div>
<div class="info-grid">
  <div class="info-item"><div class="info-label">MTO No</div><div class="info-val mono">${h.materialOutNo || ''}</div></div>
  <div class="info-item"><div class="info-label">Date</div><div class="info-val">${h.outDate ? new Date(h.outDate).toLocaleDateString('en-GB') : ''}</div></div>
  <div class="info-item"><div class="info-label">Status</div><div class="info-val">${h.status || ''}</div></div>
  <div class="info-item"><div class="info-label">Subcontract No</div><div class="info-val mono">${sc.subcontractNo || ''}</div></div>
  <div class="info-item"><div class="info-label">PO No</div><div class="info-val mono">${sc.poNumber || ''}</div></div>
  <div class="info-item"><div class="info-label">Job No</div><div class="info-val mono">${sc.jobId || ''}</div></div>
  <div class="info-item" style="grid-column:span 2"><div class="info-label">Vendor</div><div class="info-val">${sc.vendorName || ''}</div></div>
  ${h.notes ? `<div class="info-item"><div class="info-label">Notes</div><div class="info-val">${h.notes}</div></div>` : ''}
</div>
<table>
  <thead><tr><th style="width:40px">#</th><th style="width:90px">Item Code</th><th>Description</th><th class="right" style="width:90px">Required</th><th class="right" style="width:90px">Issued</th><th class="right" style="width:90px">Qty to Issue</th></tr></thead>
  <tbody>
    ${lines.map((l, i) => `<tr>
      <td>${i + 1}</td><td style="font-family:'Courier New',monospace;font-size:11px">${l.itemCode || ''}</td>
      <td>${l.itemName || ''}</td>
      <td class="right">${Number(l.requiredQty || 0).toLocaleString()}</td>
      <td class="right">${Number(l.issuedQty || 0).toLocaleString()}</td>
      <td class="right" style="font-weight:700">${Number(l.qty || 0).toLocaleString()}</td>
    </tr>`).join('')}
  </tbody>
</table>
<div class="sign-row">
  <div class="sign-box">Prepared By</div>
  <div class="sign-box">Approved By</div>
  <div class="sign-box">Received By (Vendor)</div>
</div>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
};

// ── Main Tab ──────────────────────────────────────────────────────────────────
const ScMaterialOutTab = ({ sc, components = [], editable, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { getStatusConfig } = useLookup();
    const [outs,     setOuts]     = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [editId,   setEditId]   = useState(null);
    const [error]                 = useState('');

    const [postTarget, setPostTarget] = useState(null);
    const [postBusy,   setPostBusy]   = useState(false);
    const [postError,  setPostError]  = useState('');

    // Mandatory guard
    const missingFields = [];
    if (!sc?.poId)  missingFields.push('PO No');
    if (!sc?.jobId) missingFields.push('Job No');
    const isMissing = missingFields.length > 0;

    const loadOuts = useCallback(() => {
        if (!sc?.subcontractId) return;
        setLoading(true);
        fetch(`${variables.API_URL}subcontract/${sc.subcontractId}/material-outs`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setOuts(Array.isArray(d) ? d : []))
            .catch(console.error).finally(() => setLoading(false));
    }, [sc?.subcontractId]);

    useEffect(() => { loadOuts(); }, [loadOuts]);

    const confirmPost = async () => {
        if (!postTarget) return;
        setPostBusy(true); setPostError('');
        try {
            const r = await fetch(`${variables.API_URL}subcontract/material-out/${postTarget.materialOutId}/post`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ actionBy: currentUser }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.message || 'Post failed.');
            setPostTarget(null);
            loadOuts(); if (onRefresh) onRefresh();
        } catch (e) { setPostError(e.message); }
        finally { setPostBusy(false); }
    };

    if (sc?.subcontractType === 'SERVICE_ONLY') {
        return (
            <div className="tab-section">
                <div style={{ padding: '32px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    No material outward for Service Only orders.
                </div>
            </div>
        );
    }

    return (
        <div className="tab-section">
            {postTarget && (
                <ConfirmModal
                    title="Post Material Out"
                    message={<>Post <strong>{postTarget.materialOutNo}</strong>? Stock will be deducted and this cannot be reversed.</>}
                    confirmLabel="Post Material Out"
                    confirmStyle={{ background: '#0f766e', color: '#fff' }}
                    onConfirm={confirmPost}
                    onClose={() => { setPostTarget(null); setPostError(''); }}
                    busy={postBusy} error={postError}
                />
            )}

            <div className="tab-toolbar">
                <span className="tab-section-title">Material Out Documents</span>
                {editable && (
                    <button className="tab-btn-pri"
                        disabled={isMissing}
                        title={isMissing ? `${missingFields.join(' and ')} must be set on the subcontract before creating a Material Out.` : ''}
                        onClick={() => { if (!isMissing) { setEditId(null); setShowForm(true); } }}>
                        + New Material Out
                    </button>
                )}
            </div>

            {isMissing && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
                    ⚠ <strong>{missingFields.join(' and ')}</strong> {missingFields.length > 1 ? 'are' : 'is'} required before Material Out documents can be created.
                    Update the subcontract header to set {missingFields.length > 1 ? 'these fields' : 'this field'}.
                </div>
            )}

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>{error}</div>}

            {loading ? <div style={{ padding: 20, color: '#94a3b8' }}>Loading…</div> : (
                <table className="po-table">
                    <thead>
                        <tr>
                            <th>MTO No</th>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Notes</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {outs.length === 0 && (
                            <tr><td colSpan={5} className="po-td-empty">No Material Out documents yet.</td></tr>
                        )}
                        {outs.map(o => (
                            <tr key={o.materialOutId}>
                                <td><span className="po-doc-no">{o.materialOutNo}</span></td>
                                <td>{fmtDate(o.outDate)}</td>
                                <td>
                                    {(() => {
                                        const cfg = getStatusConfig('MTO', o.status) || { badgeBg: '#f1f5f9', badgeColor: '#475569', badgeDot: '#94a3b8' };
                                        return (
                                            <span className="po-status-badge" style={{ background: cfg.badgeBg, color: cfg.badgeColor }}>
                                                <span className="po-status-dot" style={{ background: cfg.badgeDot }} />
                                                {o.status}
                                            </span>
                                        );
                                    })()}
                                </td>
                                <td style={{ fontSize: 12, color: '#64748b' }}>{o.notes || '—'}</td>
                                <td>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {o.status === 'Draft' && editable && <>
                                            <button className="tab-btn-sec" style={{ fontSize: 11, padding: '3px 10px' }}
                                                onClick={() => { setEditId(o.materialOutId); setShowForm(true); }}>
                                                Edit
                                            </button>
                                            <button className="tab-btn-pri" style={{ fontSize: 11, padding: '3px 10px', background: '#0f766e' }}
                                                onClick={() => { setPostError(''); setPostTarget(o); }}>
                                                Post
                                            </button>
                                        </>}
                                        <button className="tab-btn-sec" style={{ fontSize: 11, padding: '3px 10px' }}
                                            onClick={() => printMto(o.materialOutId, sc)}>
                                            🖨 Print
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {showForm && (
                <MaterialOutForm
                    sc={sc} components={components} materialOutId={editId} currentUser={currentUser}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); loadOuts(); if (onRefresh) onRefresh(); }}
                />
            )}
        </div>
    );
};

// ── Material Out Form Modal ───────────────────────────────────────────────────
const MaterialOutForm = ({ sc, components, materialOutId, currentUser, onClose, onSaved }) => {
    const [outDate, setOutDate] = useState(today());
    const [notes,   setNotes]   = useState('');
    const [lines,   setLines]   = useState([]);
    const [saving,  setSaving]  = useState(false);
    const [error,   setError]   = useState('');

    useEffect(() => {
        if (materialOutId) {
            fetch(`${variables.API_URL}subcontract/material-out/${materialOutId}`, { headers: authHeaders() })
                .then(r => r.json()).then(d => {
                    if (d.header) { setOutDate(d.header.outDate?.slice(0, 10) || today()); setNotes(d.header.notes || ''); }
                    setLines((d.lines || []).map(l => ({
                        componentId: l.componentId, itemId: l.itemId,
                        itemLabel:   `${l.itemCode} — ${l.itemName}`,
                        qty: String(l.qty), uomId: l.uomId || '',
                        qtyOnHand: l.qtyOnHand, requiredQty: l.requiredQty, issuedQty: l.issuedQty,
                    })));
                }).catch(console.error);
        } else {
            setLines(components.map(c => ({
                componentId: c.componentId, itemId: c.itemId,
                itemLabel:   `${c.itemCode} — ${c.itemName}`,
                qty: String(Math.max(0, c.requiredQty - c.issuedQty)),
                uomId: c.uomId || '', qtyOnHand: c.qtyOnHand,
                requiredQty: c.requiredQty, issuedQty: c.issuedQty,
            })));
        }
    }, [materialOutId, components]);

    const save = async () => {
        const validLines = lines.filter(l => Number(l.qty) > 0);
        if (validLines.length === 0) return setError('Enter qty > 0 for at least one component.');
        setSaving(true); setError('');
        try {
            const linesJson = JSON.stringify(validLines.map(l => ({
                componentId: l.componentId, itemId: l.itemId,
                qty: Number(l.qty), uomId: l.uomId || null,
            })));
            const r = await fetch(`${variables.API_URL}subcontract/material-out/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    materialOutId: materialOutId || null,
                    subcontractId: sc.subcontractId,
                    outDate, notes: notes || null, linesJson,
                    actionBy: currentUser,
                }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.message || 'Save failed.');
            onSaved();
        } catch (e) { setError(e.message); }
        finally { setSaving(false); }
    };

    return (
        <div className="po-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="po-modal" style={{ width: 660 }}>
                <div className="po-modal-header">
                    <span>{materialOutId ? 'Edit Material Out' : 'New Material Out'}</span>
                    <button className="po-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="po-modal-body">
                    {error && <div style={{ marginBottom: 10, padding: '7px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>{error}</div>}

                    {/* SC reference strip */}
                    <div style={{ display: 'flex', gap: 20, marginBottom: 14, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12 }}>
                        <span><span style={{ color: '#64748b' }}>SC: </span><strong style={{ fontFamily: 'Courier New' }}>{sc.subcontractNo}</strong></span>
                        <span><span style={{ color: '#64748b' }}>PO: </span><strong style={{ fontFamily: 'Courier New', color: '#0369a1' }}>{sc.poNumber}</strong></span>
                        <span><span style={{ color: '#64748b' }}>Job: </span><strong style={{ fontFamily: 'Courier New', color: '#1e40af' }}>{sc.jobId}</strong></span>
                        <span><span style={{ color: '#64748b' }}>Vendor: </span><strong>{sc.vendorName}</strong></span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                        <div>
                            <label className="pf-label">Out Date</label>
                            <input className="pf-input" type="date" value={outDate} onChange={e => setOutDate(e.target.value)} />
                        </div>
                        <div>
                            <label className="pf-label">Notes</label>
                            <input className="pf-input" value={notes} placeholder="Optional notes…" onChange={e => setNotes(e.target.value)} />
                        </div>
                    </div>

                    <table className="po-table">
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th style={{ textAlign: 'right', width: 90 }}>Required</th>
                                <th style={{ textAlign: 'right', width: 90 }}>Issued</th>
                                <th style={{ textAlign: 'right', width: 100 }}>Qty to Issue</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((l, idx) => (
                                <tr key={idx}>
                                    <td style={{ fontSize: 12 }}>{l.itemLabel}</td>
                                    <td style={{ textAlign: 'right', color: '#64748b', fontSize: 12 }}>{Number(l.requiredQty).toLocaleString()}</td>
                                    <td style={{ textAlign: 'right', color: '#64748b', fontSize: 12 }}>{Number(l.issuedQty).toLocaleString()}</td>
                                    <td>
                                        <input className="pf-input" type="number" min="0" step="any"
                                            style={{ margin: 0, textAlign: 'right', width: 85 }}
                                            value={l.qty}
                                            onChange={e => { const u = [...lines]; u[idx] = { ...u[idx], qty: e.target.value }; setLines(u); }} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                </div>
                <div className="po-modal-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Material Out'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScMaterialOutTab;
