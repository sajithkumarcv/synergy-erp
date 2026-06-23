import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { fmtDate, fmt, today } from '../../procurementConstants';

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
const printReceipt = (receipt, sc) => {
    const total = (Number(receipt.receivedQty) * Number(receipt.unitCost)).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const html = `<!DOCTYPE html><html><head><title>Receipt — ${receipt.receiptNo}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 0; padding: 20px 32px; }
  h1 { font-size: 18px; font-weight: 700; margin: 0 0 2px; letter-spacing: 1px; }
  .subtitle { font-size: 12px; color: #64748b; margin-bottom: 16px; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 20px; margin-bottom: 20px; padding: 12px 14px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 4px; }
  .info-label { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .5px; }
  .info-val { font-size: 12px; font-weight: 600; color: #1e293b; }
  .info-val.mono { font-family: 'Courier New', monospace; color: #1e40af; }
  .section-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .5px; color: #475569; margin: 16px 0 6px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 11.5px; }
  th { background: #f1f5f9; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #475569; padding: 7px 10px; border: 1px solid #e2e8f0; }
  td { padding: 8px 10px; border: 1px solid #e2e8f0; }
  td.right { text-align: right; }
  .total-row td { font-weight: 700; background: #f0f9ff; color: #0369a1; }
  .sign-row { display: flex; gap: 40px; margin-top: 40px; }
  .sign-box { flex: 1; border-top: 1px solid #94a3b8; padding-top: 6px; font-size: 10px; color: #64748b; text-align: center; }
  @media print { body { padding: 10px 20px; } }
</style></head><body>
<h1>SUBCONTRACT RECEIPT</h1>
<div class="subtitle">Finished Goods Receipt from Vendor</div>
<div class="info-grid">
  <div><div class="info-label">Receipt No</div><div class="info-val mono">${receipt.receiptNo}</div></div>
  <div><div class="info-label">Date</div><div class="info-val">${receipt.receiptDate ? new Date(receipt.receiptDate).toLocaleDateString('en-GB') : ''}</div></div>
  <div><div class="info-label">Status</div><div class="info-val">${receipt.status}</div></div>
  <div><div class="info-label">Subcontract No</div><div class="info-val mono">${sc.subcontractNo}</div></div>
  <div><div class="info-label">PO No</div><div class="info-val mono">${sc.poNumber || ''}</div></div>
  <div><div class="info-label">Job No</div><div class="info-val mono">${sc.jobId || ''}</div></div>
  <div style="grid-column:span 2"><div class="info-label">Vendor</div><div class="info-val">${sc.vendorName || ''}</div></div>
  ${receipt.vendorRef ? `<div><div class="info-label">Vendor DC / Ref</div><div class="info-val">${receipt.vendorRef}</div></div>` : ''}
</div>
<div class="section-title">Item Received</div>
<table>
  <thead><tr>
    <th>Item Code</th><th>Description</th>
    <th class="right" style="width:90px">Received Qty</th>
    <th class="right" style="width:90px">UOM</th>
    <th class="right" style="width:100px">Unit Cost</th>
    <th class="right" style="width:110px">Total Value</th>
  </tr></thead>
  <tbody>
    <tr>
      <td style="font-family:'Courier New',monospace;font-size:11px">${sc.outputItemCode || ''}</td>
      <td>${sc.outputItemName || ''}</td>
      <td class="right" style="font-weight:700">${Number(receipt.receivedQty).toLocaleString()}</td>
      <td class="right">${sc.outputUomName || ''}</td>
      <td class="right">${Number(receipt.unitCost || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
      <td class="right">${total}</td>
    </tr>
  </tbody>
  <tfoot>
    <tr class="total-row">
      <td colspan="5" style="text-align:right">Total Value</td>
      <td class="right">${total}</td>
    </tr>
  </tfoot>
</table>
${receipt.notes ? `<div style="margin-top:14px;padding:8px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:4px;font-size:12px"><strong>Notes:</strong> ${receipt.notes}</div>` : ''}
<div class="sign-row">
  <div class="sign-box">Prepared By</div>
  <div class="sign-box">Checked By</div>
  <div class="sign-box">Received / Stores</div>
</div>
</body></html>`;

    const w = window.open('', '_blank', 'width=900,height=700');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
};

// ── Main Tab ──────────────────────────────────────────────────────────────────
const ScReceiptTab = ({ sc, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { getStatusConfig } = useLookup();
    const [receipts,    setReceipts]    = useState([]);
    const [loading,     setLoading]     = useState(false);
    const [showForm,    setShowForm]    = useState(false);
    const [editReceipt, setEditReceipt] = useState(null);
    const [error]                       = useState('');

    const [postTarget, setPostTarget] = useState(null);
    const [postBusy,   setPostBusy]   = useState(false);
    const [postError,  setPostError]  = useState('');

    // Mandatory guard
    const missingFields = [];
    if (!sc?.poId)  missingFields.push('PO No');
    if (!sc?.jobId) missingFields.push('Job No');
    const isMissing = missingFields.length > 0;

    const load = useCallback(() => {
        if (!sc?.subcontractId) return;
        setLoading(true);
        fetch(`${variables.API_URL}subcontract/${sc.subcontractId}/receipts`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setReceipts(Array.isArray(d) ? d : []))
            .catch(console.error).finally(() => setLoading(false));
    }, [sc?.subcontractId]);

    useEffect(() => { load(); }, [load]);

    const confirmPost = async () => {
        if (!postTarget) return;
        setPostBusy(true); setPostError('');
        try {
            const r = await fetch(`${variables.API_URL}subcontract/receipt/${postTarget.subcontractReceiptId}/post`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ actionBy: currentUser }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.message || 'Post failed.');
            setPostTarget(null);
            load(); if (onRefresh) onRefresh();
        } catch (e) { setPostError(e.message); }
        finally { setPostBusy(false); }
    };

    const totalReceived = receipts.filter(r => r.status === 'Posted').reduce((s, r) => s + Number(r.receivedQty), 0);

    return (
        <div className="tab-section">
            {postTarget && (
                <ConfirmModal
                    title="Post Receipt"
                    message={<>Post receipt <strong>{postTarget.receiptNo}</strong>? Finished goods will be added to stock and this cannot be reversed.</>}
                    confirmLabel="Post Receipt"
                    confirmStyle={{ background: '#0f766e', color: '#fff' }}
                    onConfirm={confirmPost}
                    onClose={() => { setPostTarget(null); setPostError(''); }}
                    busy={postBusy} error={postError}
                />
            )}

            <div className="tab-toolbar">
                <div>
                    <span className="tab-section-title">Finished Goods Receipts</span>
                    {sc && (
                        <span style={{ marginLeft: 12, fontSize: 12, color: '#64748b' }}>
                            Received: <strong>{totalReceived.toLocaleString()}</strong> / {Number(sc.outputQty).toLocaleString()} {sc.outputUomName || ''}
                        </span>
                    )}
                </div>
                {sc && ['Approved', 'InProgress'].includes(sc.status) && (
                    <button className="tab-btn-pri"
                        disabled={isMissing}
                        title={isMissing ? `${missingFields.join(' and ')} must be set before creating a Receipt.` : ''}
                        onClick={() => { if (!isMissing) { setEditReceipt(null); setShowForm(true); } }}>
                        + New Receipt
                    </button>
                )}
            </div>

            {isMissing && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: 6, fontSize: 13, color: '#92400e' }}>
                    ⚠ <strong>{missingFields.join(' and ')}</strong> {missingFields.length > 1 ? 'are' : 'is'} required before Receipts can be created.
                    Update the subcontract header to set {missingFields.length > 1 ? 'these fields' : 'this field'}.
                </div>
            )}

            {error && <div style={{ marginBottom: 12, padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>{error}</div>}

            {/* Progress bar */}
            {sc && sc.outputQty > 0 && (
                <div style={{ marginBottom: 16, background: '#f1f5f9', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', borderRadius: 8,
                        background: totalReceived >= Number(sc.outputQty) ? '#10b981' : '#3b82f6',
                        width: `${Math.min(100, (totalReceived / Number(sc.outputQty)) * 100)}%`,
                        transition: 'width .3s',
                    }} />
                </div>
            )}

            {loading ? <div style={{ padding: 20, color: '#94a3b8' }}>Loading…</div> : (
                <table className="po-table">
                    <thead>
                        <tr>
                            <th>Receipt No</th>
                            <th>Date</th>
                            <th>Vendor Ref</th>
                            <th style={{ textAlign: 'right' }}>Received Qty</th>
                            <th style={{ textAlign: 'right' }}>Unit Cost</th>
                            <th>Status</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
                        {receipts.length === 0 && (
                            <tr><td colSpan={7} className="po-td-empty">No receipts yet.</td></tr>
                        )}
                        {receipts.map(r => (
                            <tr key={r.subcontractReceiptId}>
                                <td><span className="po-doc-no">{r.receiptNo}</span></td>
                                <td>{fmtDate(r.receiptDate)}</td>
                                <td style={{ fontSize: 12, color: '#64748b' }}>{r.vendorRef || '—'}</td>
                                <td style={{ textAlign: 'right', fontWeight: 600 }}>{Number(r.receivedQty).toLocaleString()}</td>
                                <td style={{ textAlign: 'right', color: '#64748b', fontSize: 12 }}>{fmt(r.unitCost)}</td>
                                <td>
                                    {(() => {
                                        const cfg = getStatusConfig('SCR', r.status) || { badgeBg: '#f1f5f9', badgeColor: '#475569', badgeDot: '#94a3b8' };
                                        return (
                                            <span className="po-status-badge" style={{ background: cfg.badgeBg, color: cfg.badgeColor }}>
                                                <span className="po-status-dot" style={{ background: cfg.badgeDot }} />
                                                {r.status}
                                            </span>
                                        );
                                    })()}
                                </td>
                                <td>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        {r.status === 'Draft' && <>
                                            <button className="tab-btn-sec" style={{ fontSize: 11, padding: '3px 10px' }}
                                                onClick={() => { setEditReceipt(r); setShowForm(true); }}>
                                                Edit
                                            </button>
                                            <button className="tab-btn-pri" style={{ fontSize: 11, padding: '3px 10px', background: '#0f766e' }}
                                                onClick={() => { setPostError(''); setPostTarget(r); }}>
                                                Post
                                            </button>
                                        </>}
                                        <button className="tab-btn-sec" style={{ fontSize: 11, padding: '3px 10px' }}
                                            onClick={() => printReceipt(r, sc)}>
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
                <ReceiptForm
                    sc={sc} receipt={editReceipt} currentUser={currentUser}
                    onClose={() => setShowForm(false)}
                    onSaved={() => { setShowForm(false); load(); if (onRefresh) onRefresh(); }}
                />
            )}
        </div>
    );
};

// ── Receipt Form Modal ────────────────────────────────────────────────────────
const ReceiptForm = ({ sc, receipt, currentUser, onClose, onSaved }) => {
    const [form, setForm] = useState({ receiptDate: today(), receivedQty: '', unitCost: '0', vendorRef: '', notes: '' });
    const [saving, setSaving] = useState(false);
    const [error,  setError]  = useState('');

    useEffect(() => {
        if (receipt) {
            setForm({
                receiptDate: receipt.receiptDate?.slice(0, 10) || today(),
                receivedQty: String(receipt.receivedQty),
                unitCost:    String(receipt.unitCost || 0),
                vendorRef:   receipt.vendorRef || '',
                notes:       receipt.notes || '',
            });
        } else {
            const remaining = Math.max(0, Number(sc.outputQty) - Number(sc.totalReceivedQty || 0));
            setForm(f => ({ ...f, receivedQty: remaining > 0 ? String(remaining) : '' }));
        }
    }, [receipt, sc]);

    const handle = e => setForm(f => ({ ...f, [e.target.name]: e.target.value }));

    const save = async () => {
        if (!form.receivedQty || Number(form.receivedQty) <= 0) return setError('Received qty must be > 0.');
        setSaving(true); setError('');
        try {
            const r = await fetch(`${variables.API_URL}subcontract/receipt/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    subcontractReceiptId: receipt?.subcontractReceiptId || null,
                    subcontractId:  sc.subcontractId,
                    receiptDate:    form.receiptDate,
                    receivedQty:    Number(form.receivedQty),
                    unitCost:       Number(form.unitCost) || 0,
                    vendorRef:      form.vendorRef || null,
                    notes:          form.notes || null,
                    actionBy:       currentUser,
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
            <div className="po-modal" style={{ width: 500 }}>
                <div className="po-modal-header">
                    <span>{receipt ? 'Edit Receipt' : 'New Subcontract Receipt'}</span>
                    <button className="po-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="po-modal-body">
                    {error && <div style={{ marginBottom: 10, padding: '7px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>{error}</div>}

                    {/* SC reference strip */}
                    <div style={{ display: 'flex', gap: 20, marginBottom: 14, padding: '8px 12px', background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: 12, flexWrap: 'wrap' }}>
                        <span><span style={{ color: '#64748b' }}>SC: </span><strong style={{ fontFamily: 'Courier New' }}>{sc.subcontractNo}</strong></span>
                        <span><span style={{ color: '#64748b' }}>PO: </span><strong style={{ fontFamily: 'Courier New', color: '#0369a1' }}>{sc.poNumber}</strong></span>
                        <span><span style={{ color: '#64748b' }}>Job: </span><strong style={{ fontFamily: 'Courier New', color: '#1e40af' }}>{sc.jobId}</strong></span>
                    </div>

                    <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, padding: '8px 12px', marginBottom: 14, fontSize: 12, color: '#0369a1' }}>
                        <strong>Output Item:</strong> {sc.outputItemCode} — {sc.outputItemName} &nbsp;|&nbsp;
                        <strong>Order Qty:</strong> {Number(sc.outputQty).toLocaleString()} {sc.outputUomName} &nbsp;|&nbsp;
                        <strong>Total Received:</strong> {Number(sc.totalReceivedQty || 0).toLocaleString()}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                            <label className="pf-label">Receipt Date</label>
                            <input className="pf-input" type="date" name="receiptDate" value={form.receiptDate} onChange={handle} />
                        </div>
                        <div>
                            <label className="pf-label">Received Qty *</label>
                            <input className="pf-input" type="number" min="0" step="any" name="receivedQty" value={form.receivedQty} onChange={handle} />
                        </div>
                        <div>
                            <label className="pf-label">Unit Cost</label>
                            <input className="pf-input" type="number" min="0" step="any" name="unitCost" value={form.unitCost} onChange={handle} />
                        </div>
                        <div>
                            <label className="pf-label">Vendor DC / Ref No</label>
                            <input className="pf-input" name="vendorRef" value={form.vendorRef} onChange={handle} placeholder="Delivery challan no…" />
                        </div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                        <label className="pf-label">Notes</label>
                        <textarea className="pf-textarea" rows={3} name="notes" value={form.notes} onChange={handle} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
                    </div>
                </div>
                <div className="po-modal-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={save} disabled={saving}>
                        {saving ? 'Saving…' : 'Save Receipt'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScReceiptTab;
