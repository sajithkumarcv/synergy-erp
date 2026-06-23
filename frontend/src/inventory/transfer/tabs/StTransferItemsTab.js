import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { fmt } from '../../inventoryConstants';
import AlertModal from '../../../common/AlertModal';
import ConfirmModal from '../../../common/ConfirmModal';

// ── Job Stock Picker Modal ────────────────────────────────────
const StockPickerModal = ({ fromJobId, existingItemIds, onAdd, onClose }) => {
    const [items,     setItems]     = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [search,    setSearch]    = useState('');
    const [selected,  setSelected]  = useState({});  // { itemId: qty }
    const [saving,    setSaving]    = useState(false);
    const [err,       setErr]       = useState('');

    useEffect(() => {
        fetch(`${variables.API_URL}stocktransfer/job/${encodeURIComponent(fromJobId)}/stock-items`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setItems(d || []))
            .catch(() => setErr('Could not load job stock.'))
            .finally(() => setLoading(false));
    }, [fromJobId]);

    const filtered = items.filter(it => {
        if (existingItemIds.includes(it.itemId)) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (it.itemCode || '').toLowerCase().includes(q) || (it.itemName || '').toLowerCase().includes(q);
    });

    const toggle = (it) => {
        setSelected(prev => {
            const next = { ...prev };
            if (next[it.itemId]) delete next[it.itemId];
            else next[it.itemId] = { ...it, qty: '' };
            return next;
        });
    };

    const setQty = (itemId, val) => {
        setSelected(prev => ({ ...prev, [itemId]: { ...prev[itemId], qty: val } }));
    };

    const addSelected = async () => {
        setErr('');
        const lines = Object.values(selected);
        if (!lines.length) { setErr('Select at least one item.'); return; }

        for (const l of lines) {
            if (!l.qty || Number(l.qty) <= 0)  { setErr(`Enter a quantity for ${l.itemCode || l.itemName}.`); return; }
            if (Number(l.qty) > l.availableQty) { setErr(`Qty for ${l.itemCode || l.itemName} exceeds available (${fmt(l.availableQty)}).`); return; }
        }

        setSaving(true);
        try { await onAdd(lines); }
        finally { setSaving(false); }
    };

    const selCount = Object.keys(selected).length;

    return ReactDOM.createPortal(
        <div style={{ position:'fixed', inset:0, background:'rgba(15,23,42,.55)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:10000 }}>
            <div style={{ background:'#fff', borderRadius:10, width:680, maxWidth:'95vw', maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 12px 40px rgba(0,0,0,.25)' }}>
                <div style={{ padding:'14px 20px', borderBottom:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                        <div style={{ fontWeight:700, fontSize:14, color:'#0f172a' }}>Select Items from Job Stock</div>
                        <div style={{ fontSize:11, color:'#64748b', marginTop:2 }}>
                            Job: <strong>{fromJobId}</strong> · Only items with available stock shown
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#94a3b8', lineHeight:1 }}>✕</button>
                </div>

                <div style={{ padding:'12px 20px', borderBottom:'1px solid #f1f5f9' }}>
                    <input type="text" placeholder="Search by code or name…"
                        value={search} onChange={e => setSearch(e.target.value)}
                        style={{ width:'100%', padding:'7px 12px', border:'1px solid #e2e8f0', borderRadius:6, fontSize:13, outline:'none', boxSizing:'border-box' }} />
                </div>

                <div style={{ flex:1, overflowY:'auto' }}>
                    {loading ? (
                        <div style={{ padding:40, textAlign:'center', color:'#94a3b8', fontSize:13 }}>Loading job stock…</div>
                    ) : filtered.length === 0 ? (
                        <div style={{ padding:40, textAlign:'center', color:'#94a3b8', fontSize:13 }}>
                            {items.length === 0 ? 'No stock available in this job.' : 'No items match your search.'}
                        </div>
                    ) : (
                        <table style={{ width:'100%', borderCollapse:'collapse' }}>
                            <thead>
                                <tr style={{ background:'#f8fafc', position:'sticky', top:0 }}>
                                    <th style={{ width:36, padding:'8px 12px', textAlign:'center', borderBottom:'1px solid #e2e8f0' }} />
                                    <th style={{ padding:'8px 12px', textAlign:'left', fontSize:11, color:'#64748b', fontWeight:600, textTransform:'uppercase', borderBottom:'1px solid #e2e8f0' }}>Item</th>
                                    <th style={{ padding:'8px 12px', textAlign:'right', fontSize:11, color:'#64748b', fontWeight:600, textTransform:'uppercase', borderBottom:'1px solid #e2e8f0', width:110 }}>Available</th>
                                    <th style={{ padding:'8px 12px', textAlign:'right', fontSize:11, color:'#64748b', fontWeight:600, textTransform:'uppercase', borderBottom:'1px solid #e2e8f0', width:120 }}>Transfer Qty</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(it => {
                                    const isSel = !!selected[it.itemId];
                                    return (
                                        <tr key={it.itemId}
                                            style={{ background: isSel ? '#eff6ff' : undefined, cursor:'pointer' }}
                                            onClick={() => !isSel && toggle(it)}>
                                            <td style={{ padding:'8px 12px', textAlign:'center', borderBottom:'1px solid #f8fafc' }}>
                                                <input type="checkbox" checked={isSel}
                                                    onClick={e => e.stopPropagation()}
                                                    onChange={() => toggle(it)}
                                                    style={{ cursor:'pointer' }} />
                                            </td>
                                            <td style={{ padding:'8px 12px', borderBottom:'1px solid #f8fafc' }}>
                                                <div style={{ fontSize:13, fontWeight:500, color:'#1e293b' }}>
                                                    {it.itemCode && <span style={{ fontFamily:'Courier New', fontSize:11, marginRight:6, color:'#475569' }}>[{it.itemCode}]</span>}
                                                    {it.itemName}
                                                </div>
                                                {it.uomCode && <div style={{ fontSize:11, color:'#94a3b8' }}>{it.uomCode}</div>}
                                            </td>
                                            <td style={{ padding:'8px 12px', textAlign:'right', fontSize:13, color:'#059669', fontWeight:600, borderBottom:'1px solid #f8fafc' }}>
                                                {fmt(it.availableQty, 4)}
                                            </td>
                                            <td style={{ padding:'8px 12px', textAlign:'right', borderBottom:'1px solid #f8fafc' }} onClick={e => e.stopPropagation()}>
                                                {isSel && (
                                                    <input type="number" min="0.0001" step="any"
                                                        max={it.availableQty}
                                                        placeholder="0"
                                                        value={selected[it.itemId]?.qty || ''}
                                                        onChange={e => setQty(it.itemId, e.target.value)}
                                                        autoFocus
                                                        style={{ width:90, padding:'4px 8px', border:'1px solid #6366f1', borderRadius:4, textAlign:'right', fontSize:13, outline:'none' }} />
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {err && (
                    <div style={{ margin:'0 20px', padding:'7px 12px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:6, fontSize:12, color:'#dc2626' }}>
                        ⚠ {err}
                    </div>
                )}

                <div style={{ padding:'12px 20px', borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontSize:12, color:'#64748b' }}>
                        {selCount > 0 ? <><strong>{selCount}</strong> item{selCount !== 1 ? 's' : ''} selected</> : 'No items selected'}
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                        <button onClick={onClose} disabled={saving}
                            style={{ padding:'7px 16px', borderRadius:6, border:'1px solid #cbd5e1', background:'#f8fafc', fontSize:13, cursor:'pointer' }}>
                            Cancel
                        </button>
                        <button onClick={addSelected} disabled={saving || selCount === 0}
                            style={{ padding:'7px 16px', borderRadius:6, border:'none', background: selCount===0?'#e2e8f0':'#3730a3', color: selCount===0?'#94a3b8':'#fff', fontSize:13, fontWeight:600, cursor: selCount===0?'default':'pointer', opacity:saving?.7:1 }}>
                            {saving ? 'Adding…' : `Add ${selCount > 0 ? selCount : ''} Item${selCount !== 1 ? 's' : ''}`}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

// ── Items Tab ─────────────────────────────────────────────────
const StTransferItemsTab = ({ transfer, lines: initialLines, onRefresh }) => {
    const currentUser = useCurrentUser();
    const isDraft     = transfer.status === 'Draft';

    const [lines,       setLines]       = useState(initialLines || []);
    const [showPicker,  setShowPicker]  = useState(false);
    const [alertMsg,    setAlertMsg]    = useState(null);
    const [confirm,     setConfirm]     = useState(null);
    const [editingQty,  setEditingQty]  = useState(null);  // { lineId, val }
    const [savingQty,   setSavingQty]   = useState(null);

    useEffect(() => { setLines(initialLines || []); }, [initialLines]);

    const existingItemIds = lines.map(l => l.itemId);

    const addItems = async (pickerLines) => {
        const errors = [];
        for (const l of pickerLines) {
            try {
                const r = await fetch(`${variables.API_URL}stocktransfer/line/save`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({
                        transferLineId: 0, transferId: transfer.transferId,
                        itemId: l.itemId, qty: Number(l.qty),
                        uomId: l.uomId || null,
                        unitCost: l.avgUnitCost || 0,
                        createdBy: currentUser,
                    }),
                });
                if (!r.ok) {
                    const d = await r.json().catch(() => ({}));
                    errors.push(`${l.itemCode || l.itemName}: ${d?.message || 'Save failed'}`);
                }
            } catch (e) {
                errors.push(`${l.itemCode || l.itemName}: Network error`);
            }
        }
        setShowPicker(false);
        if (errors.length) setAlertMsg(errors.join('\n'));
        onRefresh();
    };

    const updateQty = async (line) => {
        const val = Number(editingQty?.val);
        if (!val || val <= 0) { setAlertMsg('Quantity must be greater than zero.'); return; }
        if (val > line.availableQty) { setAlertMsg(`Quantity cannot exceed available stock (${fmt(line.availableQty, 4)}).`); return; }

        setSavingQty(line.transferLineId);
        try {
            const r = await fetch(`${variables.API_URL}stocktransfer/line/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    transferLineId: line.transferLineId, transferId: transfer.transferId,
                    itemId: line.itemId, qty: val,
                    uomId: line.uomId || null,
                    unitCost: line.unitCost || 0,
                    modifiedBy: currentUser,
                }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { setAlertMsg(d?.message || 'Update failed.'); return; }
            setEditingQty(null);
            onRefresh();
        } finally { setSavingQty(null); }
    };

    const deleteLine = (line) => {
        setConfirm({
            title: 'Remove Line',
            message: `Remove ${line.itemName} from this transfer?`,
            confirmLabel: 'Remove',
            onConfirm: async () => {
                setConfirm(null);
                const r = await fetch(`${variables.API_URL}stocktransfer/line/${line.transferLineId}`, { method: 'DELETE', headers: authHeaders() });
                if (!r.ok) { const d = await r.json().catch(() => ({})); setAlertMsg(d?.message || 'Delete failed.'); return; }
                onRefresh();
            },
        });
    };

    const totalQty   = lines.reduce((s, l) => s + Number(l.qty), 0);
    const totalValue = lines.reduce((s, l) => s + Number(l.lineValue || 0), 0);

    const th = { padding:'8px 12px', fontSize:11, color:'#64748b', textTransform:'uppercase', fontWeight:600, textAlign:'left', borderBottom:'1px solid #e2e8f0' };
    const td = { padding:'9px 12px', fontSize:13, color:'#1e293b', borderBottom:'1px solid #f8fafc', verticalAlign:'middle' };

    return (
        <div className="jd-tab-section">
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            {confirm  && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

            {showPicker && (
                <StockPickerModal
                    fromJobId={transfer.fromJobId}
                    existingItemIds={existingItemIds}
                    onAdd={addItems}
                    onClose={() => setShowPicker(false)}
                />
            )}

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                <div>
                    <div className="pf-section-title" style={{ margin:0 }}>Transfer Items</div>
                    <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
                        Source: <strong>{transfer.fromJobId}</strong> → Destination: <strong>{transfer.toJobId}</strong>
                    </div>
                </div>
                {isDraft && (
                    <button className="po-btn-pri" onClick={() => setShowPicker(true)}>
                        + Select from Job Stock
                    </button>
                )}
            </div>

            {!isDraft && (
                <div style={{ background:'#eff6ff', border:'1px solid #bfdbfe', borderRadius:6, padding:'8px 14px', fontSize:13, color:'#1e40af', marginBottom:16 }}>
                    This transfer is <strong>{transfer.status}</strong>. Items are read-only.
                </div>
            )}

            <div style={{ border:'1px solid #e2e8f0', borderRadius:8, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                        <tr style={{ background:'#f8fafc' }}>
                            <th style={th}>#</th>
                            <th style={th}>Item</th>
                            <th style={{ ...th, textAlign:'right' }}>Available Qty</th>
                            <th style={{ ...th, textAlign:'right' }}>Transfer Qty</th>
                            <th style={{ ...th, textAlign:'right' }}>Unit Cost</th>
                            <th style={{ ...th, textAlign:'right' }}>Value</th>
                            {isDraft && <th style={{ ...th, width:60 }} />}
                        </tr>
                    </thead>
                    <tbody>
                        {lines.length === 0 ? (
                            <tr>
                                <td colSpan={isDraft ? 7 : 6}
                                    style={{ padding:40, textAlign:'center', color:'#94a3b8', fontSize:13, fontStyle:'italic' }}>
                                    No items added yet.{isDraft && ' Click "Select from Job Stock" to add items.'}
                                </td>
                            </tr>
                        ) : lines.map((l, i) => {
                            const isEditingThis = editingQty?.lineId === l.transferLineId;
                            const pct = l.availableQty > 0 ? Math.min(100, (l.qty / l.availableQty) * 100) : 100;
                            return (
                                <tr key={l.transferLineId}>
                                    <td style={{ ...td, color:'#94a3b8', width:36 }}>{i + 1}</td>
                                    <td style={td}>
                                        <div style={{ fontWeight:500 }}>
                                            {l.itemCode && <span style={{ fontFamily:'Courier New', fontSize:11, color:'#475569', marginRight:6 }}>[{l.itemCode}]</span>}
                                            {l.itemName}
                                        </div>
                                        {l.uomCode && <div style={{ fontSize:11, color:'#94a3b8' }}>{l.uomCode}</div>}
                                    </td>
                                    <td style={{ ...td, textAlign:'right', color:'#059669', fontFamily:'tabular-nums' }}>
                                        {fmt(l.availableQty, 4)}
                                    </td>
                                    <td style={{ ...td, textAlign:'right', fontFamily:'tabular-nums' }}>
                                        {isDraft && isEditingThis ? (
                                            <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                                                <input type="number" min="0.0001" step="any"
                                                    value={editingQty.val}
                                                    onChange={e => setEditingQty(p => ({ ...p, val: e.target.value }))}
                                                    onKeyDown={e => { if (e.key === 'Enter') updateQty(l); if (e.key === 'Escape') setEditingQty(null); }}
                                                    autoFocus
                                                    style={{ width:80, padding:'3px 6px', border:'1px solid #6366f1', borderRadius:4, fontSize:12, textAlign:'right', outline:'none' }} />
                                                <button onClick={() => updateQty(l)} disabled={!!savingQty}
                                                    style={{ background:'#3730a3', color:'#fff', border:'none', borderRadius:4, padding:'3px 7px', fontSize:11, cursor:'pointer' }}>
                                                    {savingQty === l.transferLineId ? '…' : '✓'}
                                                </button>
                                                <button onClick={() => setEditingQty(null)}
                                                    style={{ background:'none', border:'1px solid #e2e8f0', borderRadius:4, padding:'3px 7px', fontSize:11, cursor:'pointer', color:'#64748b' }}>
                                                    ✕
                                                </button>
                                            </div>
                                        ) : (
                                            <div>
                                                <span
                                                    title={isDraft ? 'Click to edit' : undefined}
                                                    onClick={() => isDraft && setEditingQty({ lineId: l.transferLineId, val: String(l.qty) })}
                                                    style={{ cursor: isDraft ? 'pointer' : 'default', fontWeight:600, borderBottom: isDraft ? '1px dashed #94a3b8' : undefined }}>
                                                    {fmt(l.qty, 4)}
                                                </span>
                                                {/* mini usage bar */}
                                                <div style={{ height:3, background:'#e2e8f0', borderRadius:2, marginTop:3, width:60, marginLeft:'auto' }}>
                                                    <div style={{ height:'100%', background: pct > 90 ? '#ef4444' : '#6366f1', borderRadius:2, width:`${pct}%` }} />
                                                </div>
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ ...td, textAlign:'right', color:'#64748b', fontFamily:'tabular-nums' }}>
                                        {fmt(l.unitCost)}
                                    </td>
                                    <td style={{ ...td, textAlign:'right', fontFamily:'tabular-nums', fontWeight:500 }}>
                                        {fmt(l.lineValue)}
                                    </td>
                                    {isDraft && (
                                        <td style={{ ...td, textAlign:'center' }}>
                                            <button onClick={() => deleteLine(l)}
                                                style={{ background:'none', border:'none', color:'#dc2626', cursor:'pointer', fontSize:15, padding:'0 4px' }}>
                                                ✕
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                    {lines.length > 0 && (
                        <tfoot>
                            <tr style={{ background:'#f8fafc' }}>
                                <td colSpan={3} style={{ padding:'9px 12px', fontSize:12, color:'#64748b', borderTop:'2px solid #e2e8f0' }}>
                                    {lines.length} line{lines.length !== 1 ? 's' : ''}
                                </td>
                                <td style={{ padding:'9px 12px', textAlign:'right', fontSize:13, fontWeight:700, borderTop:'2px solid #e2e8f0', fontFamily:'tabular-nums' }}>
                                    {fmt(totalQty, 4)}
                                </td>
                                <td style={{ padding:'9px 12px', borderTop:'2px solid #e2e8f0' }} />
                                <td style={{ padding:'9px 12px', textAlign:'right', fontSize:13, fontWeight:700, borderTop:'2px solid #e2e8f0', fontFamily:'tabular-nums' }}>
                                    {fmt(totalValue)}
                                </td>
                                {isDraft && <td style={{ borderTop:'2px solid #e2e8f0' }} />}
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>

            {isDraft && lines.length > 0 && (
                <div style={{ marginTop:14, padding:'10px 14px', background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:6, fontSize:12, color:'#166534' }}>
                    ✓ {lines.length} item{lines.length !== 1 ? 's' : ''} ready. Go to the <strong>Approval</strong> tab to submit for approval.
                </div>
            )}
        </div>
    );
};

export default StTransferItemsTab;
