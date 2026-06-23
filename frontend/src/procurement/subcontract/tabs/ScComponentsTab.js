import React, { useState, useEffect } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';

// ── Add Item Modal ────────────────────────────────────────────────────────────
const AddItemModal = ({ onAdd, onClose }) => {
    const [search,  setSearch]  = useState('');
    const [results, setResults] = useState([]);
    const [selected, setSelected] = useState(null);
    const [qty, setQty] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!search.trim()) { setResults([]); return; }
        const t = setTimeout(() => {
            fetch(`${variables.API_URL}item/search?searchText=${encodeURIComponent(search)}&pageSize=20`, { headers: authHeaders() })
                .then(r => r.json())
                .then(d => setResults(Array.isArray(d) ? d : (d.data || [])))
                .catch(console.error);
        }, 280);
        return () => clearTimeout(t);
    }, [search]);

    const confirm = () => {
        if (!selected) return setError('Select an item.');
        if (!qty || Number(qty) <= 0) return setError('Enter a quantity greater than 0.');
        onAdd({ ...selected, requiredQty: Number(qty) });
    };

    return (
        <div className="po-modal-overlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="po-modal" style={{ width: 560 }}>
                <div className="po-modal-header">
                    <span>Add Component</span>
                    <button className="po-modal-close" onClick={onClose}>✕</button>
                </div>
                <div className="po-modal-body">
                    {error && <div style={{ marginBottom: 12, padding: '7px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>{error}</div>}

                    {/* Item search */}
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', display: 'block', marginBottom: 4 }}>Item *</label>
                    {selected
                        ? <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                            <span style={{ flex: 1, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '7px 12px', fontSize: 13, fontWeight: 500, color: '#1e40af' }}>
                                <span style={{ fontFamily: 'Courier New', fontSize: 11, background: '#dbeafe', padding: '1px 5px', borderRadius: 3, marginRight: 8 }}>{selected.itemCode}</span>
                                {selected.itemName}
                            </span>
                            <button type="button" onClick={() => { setSelected(null); setSearch(''); }}
                                style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '7px 12px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕ Clear</button>
                        </div>
                        : <div style={{ marginBottom: 16 }}>
                            <input className="pf-input" placeholder="Type item code or name…"
                                value={search} onChange={e => { setSearch(e.target.value); setError(''); }}
                                autoFocus autoComplete="off" />
                            {results.length > 0 && (
                                <div style={{ marginTop: 4, border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.10)', maxHeight: 240, overflowY: 'auto', background: '#fff' }}>
                                    {results.map(i => (
                                        <div key={i.itemId}
                                            onClick={() => { setSelected(i); setSearch(''); setResults([]); setError(''); }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
                                            style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 10, alignItems: 'center' }}>
                                            <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '1px 6px', borderRadius: 3, flexShrink: 0 }}>{i.itemCode}</span>
                                            <span style={{ color: '#1e293b' }}>{i.itemName}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                          </div>
                    }

                    {/* Qty */}
                    <label style={{ fontSize: 10, fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', letterSpacing: '.45px', display: 'block', marginBottom: 4 }}>Required Qty *</label>
                    <input className="pf-input" type="number" min="0" step="any"
                        placeholder="0.00" value={qty}
                        onChange={e => { setQty(e.target.value); setError(''); }}
                        style={{ width: 160 }} />
                </div>
                <div className="po-modal-footer">
                    <button className="pf-btn-sec" onClick={onClose}>Cancel</button>
                    <button className="pf-btn-pri" onClick={confirm}>Add Component</button>
                </div>
            </div>
        </div>
    );
};

// ── Main Tab ──────────────────────────────────────────────────────────────────
const ScComponentsTab = ({ sc, components = [], editable, onRefresh }) => {
    const currentUser = useCurrentUser();
    const [lines,    setLines]    = useState([]);
    const [saving,   setSaving]   = useState(false);
    const [error,    setError]    = useState('');
    const [saved,    setSaved]    = useState(false);
    const [dirty,    setDirty]    = useState(false);
    const [showAdd,  setShowAdd]  = useState(false);

    useEffect(() => {
        setLines(components.map(c => ({
            itemId:      String(c.itemId),
            itemCode:    c.itemCode,
            itemName:    c.itemName,
            uomId:       c.uomId ? String(c.uomId) : '',
            uomLabel:    c.uomName || '',
            requiredQty: String(c.requiredQty),
            issuedQty:   c.issuedQty,
            qtyOnHand:   c.qtyOnHand,
            componentId: c.componentId,
        })));
        setDirty(false);
    }, [components]);

    const handleAdd = (item) => {
        // Prevent duplicate items
        if (lines.some(l => l.itemId === String(item.itemId))) {
            setShowAdd(false);
            return;
        }
        setLines(p => [...p, {
            itemId:      String(item.itemId),
            itemCode:    item.itemCode,
            itemName:    item.itemName,
            uomId:       item.baseUomId ? String(item.baseUomId) : '',
            uomLabel:    '',
            requiredQty: String(item.requiredQty),
            issuedQty:   0,
            qtyOnHand:   0,
        }]);
        setDirty(true); setSaved(false);
        setShowAdd(false);
    };

    const handleQty = (idx, val) => {
        const u = [...lines];
        u[idx] = { ...u[idx], requiredQty: val };
        setLines(u); setDirty(true); setSaved(false);
    };

    const removeLine = (idx) => {
        setLines(lines.filter((_, i) => i !== idx));
        setDirty(true); setSaved(false);
    };

    const save = async () => {
        const valid = lines.filter(l => l.itemId && Number(l.requiredQty) > 0);
        if (valid.length === 0) return setError('Add at least one component with qty > 0.');
        setSaving(true); setError('');
        try {
            const componentsJson = JSON.stringify(valid.map(l => ({
                itemId:      Number(l.itemId),
                uomId:       l.uomId ? Number(l.uomId) : null,
                requiredQty: Number(l.requiredQty),
            })));
            const r = await fetch(`${variables.API_URL}subcontract/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    subcontractId:   sc.subcontractId,
                    subcontractType: sc.subcontractType,
                    vendorId:        sc.vendorId,
                    jobId:           sc.jobId || null,
                    outputItemId:    sc.outputItemId,
                    outputQty:       sc.outputQty,
                    outputUomId:     sc.outputUomId || null,
                    poId:            sc.poId || null,
                    componentsJson,
                    actionBy:        currentUser,
                }),
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(d.message || 'Save failed.');
            setSaved(true); setDirty(false);
            if (onRefresh) onRefresh();
        } catch (e) { setError(e.message); }
        finally { setSaving(false); }
    };

    if (sc?.subcontractType === 'SERVICE_ONLY') {
        return (
            <div className="tab-section">
                <div style={{ padding: '32px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    This is a Service Only order — no materials are sent to the vendor.
                </div>
            </div>
        );
    }

    return (
        <div className="tab-section">
            {showAdd && <AddItemModal onAdd={handleAdd} onClose={() => setShowAdd(false)} />}

            <div className="tab-toolbar">
                <span className="tab-section-title">Components to Send to Vendor</span>
                {editable && (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        {saved && <span className="tab-saved-badge">✓ Saved</span>}
                        <button className="tab-btn-sec" onClick={() => setShowAdd(true)}>+ Add Item</button>
                        <button className="tab-btn-pri" onClick={save} disabled={saving || !dirty}>
                            {saving ? 'Saving…' : 'Save Components'}
                        </button>
                    </div>
                )}
            </div>

            {error && <div style={{ margin: '0 0 12px', padding: '8px 12px', background: '#fee2e2', color: '#991b1b', borderRadius: 6, fontSize: 13 }}>{error}</div>}

            <table className="po-table">
                <thead>
                    <tr>
                        <th style={{ width: 32 }}>#</th>
                        <th>Item</th>
                        <th style={{ width: 120, textAlign: 'right' }}>Required Qty</th>
                        <th style={{ width: 100, textAlign: 'right' }}>Issued Qty</th>
                        <th style={{ width: 100, textAlign: 'right' }}>Stock Avail.</th>
                        {editable && <th style={{ width: 40 }}></th>}
                    </tr>
                </thead>
                <tbody>
                    {lines.length === 0 && (
                        <tr><td colSpan={editable ? 6 : 5} className="po-td-empty">
                            {editable ? 'Click "+ Add Item" to add materials to send to vendor.' : 'No components defined.'}
                        </td></tr>
                    )}
                    {lines.map((l, idx) => (
                        <tr key={idx}>
                            <td style={{ color: '#94a3b8', fontSize: 11 }}>{idx + 1}</td>
                            <td>
                                <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '1px 5px', borderRadius: 3, marginRight: 8 }}>{l.itemCode}</span>
                                <span style={{ fontSize: 13, color: '#1e293b' }}>{l.itemName}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                                {editable
                                    ? <input className="pf-input" type="number" min="0" step="any"
                                        style={{ margin: 0, textAlign: 'right', width: 90 }}
                                        value={l.requiredQty}
                                        onChange={e => handleQty(idx, e.target.value)} />
                                    : <span style={{ fontWeight: 600 }}>{Number(l.requiredQty).toLocaleString()}</span>
                                }
                            </td>
                            <td style={{ textAlign: 'right', color: '#475569' }}>
                                {l.issuedQty != null ? Number(l.issuedQty).toLocaleString() : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: Number(l.qtyOnHand) > 0 ? '#065f46' : '#dc2626' }}>
                                {l.qtyOnHand != null ? Number(l.qtyOnHand).toLocaleString() : '—'}
                            </td>
                            {editable && (
                                <td style={{ textAlign: 'center' }}>
                                    <button type="button"
                                        onClick={() => removeLine(idx)}
                                        style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>✕</button>
                                </td>
                            )}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default ScComponentsTab;
