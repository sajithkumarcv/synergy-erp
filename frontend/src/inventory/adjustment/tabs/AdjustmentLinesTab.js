import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { fmt } from '../../inventoryConstants';
import { useFieldConfig } from '../../../FieldConfigContext';
import AmountInput from '../../../common/AmountInput';
import AdjustmentImportModal from '../AdjustmentImportModal';

const LBL = { fontSize: 10, fontWeight: 600, color: '#64748b', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '.04em' };

// ── Searchable item picker (server-side search on api/item/search) ─────────
// Results render in a portal with position:fixed so they are never clipped by
// the lines-table's overflow:hidden / table-row stacking contexts.
const ItemSearchSelect = ({ value, onSelect }) => {
    const [q,      setQ]      = useState('');
    const [res,    setRes]    = useState([]);
    const [coords, setCoords] = useState(null);
    const timer    = useRef(null);
    const inputRef = useRef(null);

    const positionMenu = () => {
        const el = inputRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        setCoords({ top: r.bottom + 2, left: r.left, width: r.width });
    };

    // Keep the menu glued to the input while open (scroll / resize)
    useEffect(() => {
        if (res.length === 0) return;
        const handler = () => positionMenu();
        window.addEventListener('scroll', handler, true);
        window.addEventListener('resize', handler);
        return () => {
            window.removeEventListener('scroll', handler, true);
            window.removeEventListener('resize', handler);
        };
    }, [res.length]);

    const search = (text) => {
        setQ(text);
        clearTimeout(timer.current);
        if (!text.trim()) { setRes([]); return; }
        timer.current = setTimeout(() => {
            fetch(`${variables.API_URL}item/search?searchText=${encodeURIComponent(text)}&pageSize=20`, { headers: authHeaders() })
                .then(r => r.json())
                .then(d => { setRes(Array.isArray(d) ? d : (d.data || [])); positionMenu(); })
                .catch(() => {});
        }, 280);
    };

    if (value) return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="pf-input" style={{
                flex: 1, background: '#f0f9ff', color: '#1e40af', fontWeight: 500,
                fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
            }}>
                ✓ <strong>{value.itemCode}</strong> — {value.itemName}
            </span>
            <button type="button" onClick={() => { onSelect(null); setQ(''); }}
                style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
        </div>
    );

    return (
        <div style={{ position: 'relative' }}>
            <input ref={inputRef} className="pf-input" placeholder="Search by item code or name…"
                value={q}
                onChange={e => search(e.target.value)}
                onFocus={positionMenu}
                onBlur={() => setTimeout(() => setRes([]), 200)} />
            {res.length > 0 && coords && createPortal(
                <div style={{
                    position: 'fixed', top: coords.top, left: coords.left, width: coords.width,
                    zIndex: 99999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6,
                    boxShadow: '0 4px 16px rgba(0,0,0,.18)', maxHeight: 260, overflowY: 'auto',
                }}>
                    {res.map(it => (
                        <div key={it.itemId}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9' }}
                            onMouseDown={() => { setRes([]); onSelect(it); }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            <strong style={{ color: '#1e40af' }}>{it.itemCode}</strong>
                            <span style={{ color: '#374151', marginLeft: 8 }}>{it.itemName}</span>
                        </div>
                    ))}
                </div>,
                document.body
            )}
        </div>
    );
};

// ── Inline line editor row ────────────────────────────────────────────────
const LineEditor = ({ uoms, reasons, onSave, onCancel, initial }) => {
    const [selItem,  setSelItem]  = useState(
        initial?.itemId
            ? { itemId: initial.itemId, itemCode: initial.itemCode, itemName: initial.itemDesc }
            : null
    );
    const [qty,      setQty]      = useState(initial ? String(Math.abs(initial.adjustQty)) : '');
    const [dir,      setDir]      = useState(initial && initial.adjustQty < 0 ? 'OUT' : 'IN');
    const [unitCost, setUnitCost] = useState(initial?.unitCost != null ? String(initial.unitCost) : '');
    const [uomId,    setUomId]    = useState(initial?.uomId ? String(initial.uomId) : '');
    const [reason,   setReason]   = useState(initial?.reason || '');
    const [notes,    setNotes]    = useState(initial?.notes  || '');
    const [err,      setErr]      = useState('');
    const [busy,     setBusy]     = useState(false);
    const { isReq } = useFieldConfig('STOCK_ADJUSTMENT_LINE');

    // On item pick, default the UOM to the item's base UOM (if none chosen yet)
    const handleItemSelect = (it) => {
        setSelItem(it);
        if (it && it.baseUomId && !uomId) setUomId(String(it.baseUomId));
    };

    const submit = async () => {
        const q = parseFloat(qty);
        if (!selItem)     { setErr('Select an item.'); return; }
        if (!q || q <= 0) { setErr('Enter a quantity greater than zero.'); return; }
        if (!reason)      { setErr('Select a reason.'); return; }
        setBusy(true); setErr('');
        const signedQty = dir === 'OUT' ? -Math.abs(q) : Math.abs(q);
        const ok = await onSave({
            adjustmentLineId: initial?.adjustmentLineId || 0,
            itemId:    Number(selItem.itemId),
            adjustQty: signedQty,
            uomId:     uomId ? Number(uomId) : null,
            unitCost:  parseFloat(unitCost) || 0,
            reason,
            notes: notes.trim() || null,
        });
        setBusy(false);
        if (ok !== true) setErr(typeof ok === 'string' ? ok : 'Save failed.');
    };

    return (
        <tr style={{ background: '#faf5ff' }}>
            <td colSpan={7} style={{ padding: 12 }}>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    <div style={{ flex: '1 1 260px', minWidth: 240 }}>
                        <div style={LBL}>Item</div>
                        <ItemSearchSelect value={selItem} onSelect={handleItemSelect} />
                    </div>
                    <div style={{ flex: '0 0 90px' }}>
                        <div style={LBL}>Direction</div>
                        <select className="pf-input" value={dir} onChange={e => setDir(e.target.value)}>
                            <option value="IN">+ In</option>
                            <option value="OUT">− Out</option>
                        </select>
                    </div>
                    <div style={{ flex: '0 0 90px' }}>
                        <div style={LBL}>Qty</div>
                        <input type="number" min="0" step="any" className="pf-input" value={qty} onChange={e => setQty(e.target.value)} />
                    </div>
                    <div style={{ flex: '0 0 90px' }}>
                        <div style={LBL}>UOM</div>
                        <select className="pf-input" value={uomId} onChange={e => setUomId(e.target.value)}>
                            <option value="">—</option>
                            {uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: '0 0 100px' }}>
                        <div style={LBL}>Unit Cost</div>
                        <AmountInput className="pf-input" value={unitCost} onChange={v => setUnitCost(v)} />
                    </div>
                    <div style={{ flex: '0 0 160px' }}>
                        <div style={LBL}>Reason {isReq('reason') && <span className="req">*</span>}</div>
                        <select className="pf-input" value={reason} onChange={e => setReason(e.target.value)}>
                            <option value="">— Select —</option>
                            {reasons.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: '1 1 160px' }}>
                        <div style={LBL}>Notes</div>
                        <input className="pf-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional" />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                        <button className="pf-btn-pri" style={{ padding: '6px 12px' }} onClick={submit} disabled={busy}>
                            {busy ? '…' : '✓ Save'}
                        </button>
                        <button className="pf-btn-sec" style={{ padding: '6px 10px' }} onClick={onCancel}>✕</button>
                    </div>
                </div>
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                    ℹ️ <strong style={{ color: '#16a34a' }}>+ In</strong> adds to stock (opening balance, found / excess).
                    To <strong>reduce</strong> stock (damage, loss, correction) choose <strong style={{ color: '#dc2626' }}>− Out</strong>.
                </div>
                {err && <div style={{ color: '#dc2626', fontSize: 11.5, marginTop: 6 }}>⚠ {err}</div>}
            </td>
        </tr>
    );
};

// ── AdjustmentLinesTab ───────────────────────────────────────────────────
const AdjustmentLinesTab = ({ header, lines, editable, adjustmentId, autoImport, onRefresh }) => {
    const currentUser      = useCurrentUser();
    const { lookups, getVList } = useLookup();
    const uoms    = lookups.uoms  || [];
    const reasons = getVList('Inventory', 'AdjustmentReason');

    const [adding,  setAdding]  = useState(false);
    const [editId,  setEditId]  = useState(null);
    const [err,     setErr]     = useState('');
    const [importing, setImporting] = useState(false);

    // One-click "Opening Stock" deep-link: auto-open the importer once when landing
    // on an editable adjustment.
    useEffect(() => {
        if (autoImport && editable) setImporting(true);
    }, [autoImport, editable]);

    const saveLine = async (line) => {
        try {
            const res = await fetch(`${variables.API_URL}stockadjustment/line/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    ...line,
                    adjustmentId: Number(adjustmentId),
                    createdBy:  currentUser,
                    modifiedBy: currentUser,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Save failed.';
            setAdding(false); setEditId(null); onRefresh();
            return true;
        } catch { return 'Network error.'; }
    };

    const deleteLine = async (lineId) => {
        if (!window.confirm('Remove this line?')) return;
        const res = await fetch(`${variables.API_URL}stockadjustment/line/${lineId}`, {
            method: 'DELETE', headers: authHeaders(),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) { setErr(d?.message || 'Delete failed.'); return; }
        onRefresh();
    };

    const totalValue = lines.reduce((s, l) => s + (l.lineValue || 0), 0);

    return (
        <div className="jd-tab-body">
            {err && (
                <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6, padding: '8px 14px', fontSize: 12.5, marginBottom: 12 }}>
                    ⚠ {err}
                    <button onClick={() => setErr('')} style={{ marginLeft: 10, fontSize: 11, background: 'none', border: 'none', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
                </div>
            )}

            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                <table className="po-table" style={{ margin: 0 }}>
                    <thead>
                        <tr>
                            <th>Item</th>
                            <th style={{ textAlign: 'center' }}>Dir</th>
                            <th style={{ textAlign: 'right' }}>Qty</th>
                            <th style={{ textAlign: 'right' }}>Unit Cost</th>
                            <th style={{ textAlign: 'right' }}>Value</th>
                            <th>Reason</th>
                            <th style={{ width: 100 }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.length === 0 && !adding && (
                            <tr>
                                <td colSpan={7} className="po-empty">
                                    No lines yet.{editable && ' Click "+ Add Line" to begin.'}
                                </td>
                            </tr>
                        )}
                        {lines.map(l => (
                            editId === l.adjustmentLineId ? (
                                <LineEditor
                                    key={l.adjustmentLineId}
                                    uoms={uoms} reasons={reasons}
                                    initial={l}
                                    onSave={saveLine}
                                    onCancel={() => setEditId(null)}
                                />
                            ) : (
                                <tr key={l.adjustmentLineId}>
                                    <td>{l.itemCode ? `${l.itemCode} — ${l.itemDesc}` : l.itemDesc}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{ fontWeight: 700, color: l.direction === 'IN' ? '#16a34a' : '#dc2626' }}>
                                            {l.direction === 'IN' ? '+ In' : '− Out'}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                        {fmt(Math.abs(l.adjustQty))} {l.uomName || ''}
                                    </td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(l.unitCost)}</td>
                                    <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600 }}>{fmt(l.lineValue)}</td>
                                    <td style={{ fontSize: 12 }}>
                                        {l.reasonLabel || l.reason || <span style={{ color: '#94a3b8' }}>—</span>}
                                        {l.notes && <div style={{ fontSize: 10.5, color: '#94a3b8', marginTop: 2 }}>{l.notes}</div>}
                                    </td>
                                    <td>
                                        {editable && (
                                            <>
                                                <button className="po-act-btn po-act-open"
                                                    onClick={() => { setEditId(l.adjustmentLineId); setAdding(false); }}>
                                                    Edit
                                                </button>
                                                <button className="po-act-btn" style={{ color: '#dc2626' }}
                                                    onClick={() => deleteLine(l.adjustmentLineId)}>
                                                    ✕
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            )
                        ))}
                        {adding && (
                            <LineEditor
                                uoms={uoms} reasons={reasons}
                                onSave={saveLine}
                                onCancel={() => setAdding(false)}
                            />
                        )}
                    </tbody>
                    {lines.length > 0 && (
                        <tfoot>
                            <tr>
                                <td colSpan={4} />
                                <td style={{ textAlign: 'right', fontWeight: 700, fontFamily: 'monospace', borderTop: '2px solid #e2e8f0', padding: '8px 12px' }}>
                                    {fmt(totalValue)}
                                </td>
                                <td colSpan={2} style={{ borderTop: '2px solid #e2e8f0' }} />
                            </tr>
                        </tfoot>
                    )}
                </table>

                {editable && !adding && editId === null && (
                    <div style={{ padding: 12, display: 'flex', gap: 10 }}>
                        <button
                            className="po-btn-pri"
                            style={{ background: '#0f766e', borderColor: '#0f766e' }}
                            onClick={() => setAdding(true)}
                        >
                            + Add Line
                        </button>
                        <button
                            className="po-btn-pri"
                            style={{ background: '#1e40af', borderColor: '#1e40af' }}
                            onClick={() => setImporting(true)}
                            title="Bulk import lines from Excel (opening stock / initial load)"
                        >
                            ⬆ Import Excel
                        </button>
                    </div>
                )}
            </div>

            {importing && (
                <AdjustmentImportModal
                    adjustmentId={adjustmentId}
                    reasons={reasons}
                    onClose={() => setImporting(false)}
                    onImported={onRefresh}
                />
            )}
        </div>
    );
};

export default AdjustmentLinesTab;
