import React, { useState, useEffect, useCallback, useRef } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import ConfirmModal from '../../../common/ConfirmModal';
import { useLookup } from '../../../LookupContext';
import { fmt } from '../../procurementConstants';
import { useFieldConfig } from '../../../FieldConfigContext';
import AmountInput from '../../../common/AmountInput';

// ── GRN Import Modal ──────────────────────────────────────────────────────────
const GrnImportModal = ({ rtv, onClose, onImported }) => {
    const currentUser  = useCurrentUser();
    const [grnLines,   setGrnLines]   = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [selected,   setSelected]   = useState({});
    const [qtyMap,     setQtyMap]     = useState({});
    const [importing,  setImporting]  = useState(false);
    const [error,      setError]      = useState('');
    const [confirm,    setConfirm]    = useState(null);

    useEffect(() => {
        if (!rtv.grnId) { setLoading(false); return; }
        fetch(`${variables.API_URL}rtv/grn-lines/${rtv.grnId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(rows => {
                const list = Array.isArray(rows) ? rows : [];
                setGrnLines(list);
                const sel = {}, qty = {};
                list.forEach(l => { sel[l.grnDetailId] = true; qty[l.grnDetailId] = String(l.acceptedQty); });
                setSelected(sel); setQtyMap(qty);
            })
            .catch(() => setError('Failed to load GRN lines.'))
            .finally(() => setLoading(false));
    }, [rtv.grnId]);

    const toggle    = id => setSelected(p => ({ ...p, [id]: !p[id] }));
    const toggleAll = () => {
        const allOn = grnLines.every(l => selected[l.grnDetailId]);
        const next  = {};
        grnLines.forEach(l => { next[l.grnDetailId] = !allOn; });
        setSelected(p => ({ ...p, ...next }));
    };

    const doImportLines = async (toImport) => {
        setImporting(true); setError('');
        const failedLines = [];
        try {
            for (const l of toImport) {
                const res = await fetch(`${variables.API_URL}rtv/lines/save`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({
                        rtvLineId: 0, rtvId: rtv.rtvId,
                        grnDetailId: l.grnDetailId, poLineId: l.poLineId || null, prLineId: l.prLineId || null,
                        itemId: l.itemId || null, itemCode: l.itemCode || null, itemDesc: l.itemDesc || '',
                        returnQty: Number(qtyMap[l.grnDetailId]),
                        uomId: l.uomId || null, uomName: l.uomName || null,
                        unitCost: l.unitCost || 0,
                        returnReason: null, createdBy: currentUser
                    })
                });
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    failedLines.push(`${l.itemCode || l.itemDesc}: ${d.message || 'Error'}`);
                }
            }
            // FE-5: Non-atomic — if any lines failed, keep modal open and report them
            if (failedLines.length) {
                setError(`${failedLines.length} line(s) failed:\n${failedLines.join('\n')}`);
                onImported(); // still refresh parent to show successfully imported lines
            } else {
                onImported();
            }
        } catch { setError('Error importing lines.'); }
        finally { setImporting(false); }
    };

    const doImport = async () => {
        const toImport = grnLines.filter(l => selected[l.grnDetailId]);
        if (!toImport.length) { setError('No lines selected.'); return; }
        const invalid = toImport.filter(l => !qtyMap[l.grnDetailId] || isNaN(Number(qtyMap[l.grnDetailId])) || Number(qtyMap[l.grnDetailId]) <= 0);
        if (invalid.length) { setError('All selected lines must have a valid return qty > 0.'); return; }
        const over = toImport.filter(l => Number(qtyMap[l.grnDetailId]) > l.acceptedQty);
        if (over.length) { setError('Return qty cannot exceed accepted qty from GRN.'); return; }

        // FE-6: Warn if any item has insufficient current stock — posting will fail later
        const lowStock = toImport.filter(l => l.itemId && Number(qtyMap[l.grnDetailId]) > l.currentStock);
        if (lowStock.length) {
            const names = lowStock.map(l => l.itemCode || l.itemDesc).join(', ');
            setConfirm({
                title: 'Low Stock Warning',
                message: `Warning: ${lowStock.length} item(s) have current stock lower than the return qty (${names}).\n\nPosting this RTV will fail with "stock would go negative".\n\nImport anyway?`,
                confirmLabel: 'Import Anyway',
                confirmStyle: { background: '#b45309', color: '#fff' },
                onConfirm: async () => { setConfirm(null); await doImportLines(toImport); },
            });
            return;
        }

        await doImportLines(toImport);
    };

    const allChecked = grnLines.length > 0 && grnLines.every(l => selected[l.grnDetailId]);
    const selCount   = Object.values(selected).filter(Boolean).length;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            <div style={{ background: '#fff', borderRadius: 10, width: 880, maxWidth: '96vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
                {/* Header */}
                <div style={{ background: '#0f766e', padding: '14px 20px', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 600 }}>Import from GRN Lines</div>
                        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11.5, marginTop: 2 }}>
                            {rtv.grnNumber} — select lines and enter return qty
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 6, cursor: 'pointer' }}>✕</button>
                </div>

                <div style={{ flex: 1, overflow: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading…</div>
                    ) : grnLines.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No accepted lines found in the linked GRN.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead>
                                <tr style={{ background: '#eef2f8' }}>
                                    <th style={{ padding: '8px 10px', width: 36, textAlign: 'center', borderBottom: '1px solid #d4dce9' }}>
                                        <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ accentColor: '#0f766e' }} />
                                    </th>
                                    {['#','Item Code','Description','Accepted','Current Stock','UOM','Unit Cost','Return Qty ✎'].map(h => (
                                        <th key={h} style={{ padding: '8px 10px', textAlign: h.includes('Qty') || h.includes('Stock') || h.includes('Cost') || h.includes('Accepted') ? 'right' : 'left', fontWeight: 600, color: '#3a5070', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.4px', borderBottom: '1px solid #d4dce9' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {grnLines.map(l => {
                                    const isChecked = !!selected[l.grnDetailId];
                                    return (
                                        <tr key={l.grnDetailId} style={{ background: isChecked ? '#f0fff4' : '#fff', cursor: 'pointer' }}
                                            onClick={() => toggle(l.grnDetailId)}>
                                            <td style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #f0f4f8' }}>
                                                <input type="checkbox" checked={isChecked} onChange={() => toggle(l.grnDetailId)}
                                                    onClick={e => e.stopPropagation()} style={{ accentColor: '#0f766e' }} />
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8', color: '#64748b', fontSize: 11 }}>{l.lineNum}</td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8' }}>
                                                {l.itemCode ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{l.itemCode}</span> : '—'}
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8' }}>{l.itemDesc}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmt(l.acceptedQty)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', color: l.currentStock < l.acceptedQty ? '#dc2626' : '#16a34a', fontWeight: 500 }}>{fmt(l.currentStock)}</td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8', color: '#475569' }}>{l.uomName || '—'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', color: '#64748b' }}>{fmt(l.unitCost)}</td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8' }} onClick={e => e.stopPropagation()}>
                                                <input type="number" value={qtyMap[l.grnDetailId] || ''}
                                                    onChange={e => setQtyMap(p => ({ ...p, [l.grnDetailId]: e.target.value }))}
                                                    disabled={!isChecked}
                                                    style={{ width: 80, padding: '4px 6px', border: `1px solid ${isChecked ? '#0f766e' : '#d1d5db'}`, borderRadius: 4, fontSize: 12, textAlign: 'right', background: isChecked ? '#fff' : '#f8fafc' }}
                                                    min="0.01" max={l.acceptedQty} step="0.01" />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                <div style={{ padding: '12px 20px', background: '#f4f7fb', borderTop: '1px solid #d4dce9', borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, color: '#64748b' }}>{selCount} of {grnLines.length} lines selected</div>
                    {error && <div style={{ color: '#dc2626', fontSize: 12, fontWeight: 500 }}>{error}</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={onClose} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '7px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        <button onClick={doImport} disabled={importing || !selCount}
                            style={{ background: '#0f766e', color: '#fff', border: 'none', padding: '7px 20px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: (importing || !selCount) ? .6 : 1 }}>
                            {importing ? 'Importing…' : `Import ${selCount || ''} Lines`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── RTV Lines Tab ─────────────────────────────────────────────────────────────
const RtvLinesTab = ({ rtv, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { lookups } = useLookup();
    const { isReq } = useFieldConfig('RTV_LINE');
    const { uoms } = lookups;

    const [lines,        setLines]        = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [showForm,     setShowForm]     = useState(false);
    const [showImport,   setShowImport]   = useState(false);
    const [editLine,     setEditLine]     = useState(null);
    const [form,         setForm]         = useState({});
    const [saving,       setSaving]       = useState(false);
    const [deleting,     setDeleting]     = useState(null);
    const [error,        setError]        = useState('');
    const [confirm,      setConfirm]      = useState(null);

    // Item typeahead
    const [itemSearch,   setItemSearch]   = useState('');
    const [itemResults,  setItemResults]  = useState([]);
    const itemTimer = useRef(null);

    useEffect(() => {
        clearTimeout(itemTimer.current);
        if (!itemSearch.trim()) { setItemResults([]); return; }
        itemTimer.current = setTimeout(() => {
            fetch(`${variables.API_URL}item/search?searchText=${encodeURIComponent(itemSearch)}&pageSize=15`, { headers: authHeaders() })
                .then(r => r.json())
                .then(d => setItemResults(d.data || []))
                .catch(() => {});
        }, 280);
    }, [itemSearch]);

    const isDraft = rtv.status === 'Draft';
    const hasGrn  = !!rtv.grnId;

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}rtv/${rtv.rtvId}/lines`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setLines(Array.isArray(d) ? d : []))
            .catch(console.error).finally(() => setLoading(false));
    }, [rtv.rtvId]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => {
        setEditLine(null);
        setForm({ rtvLineId: 0, itemId: '', itemCode: '', itemDesc: '', returnQty: '', uomId: '', uomName: '', unitCost: '', returnReason: '' });
        setItemSearch(''); setItemResults([]);
        setError(''); setShowForm(true);
    };

    const openEdit = line => {
        setEditLine(line);
        setForm({
            rtvLineId:    line.rtvLineId,
            itemId:       line.itemId    ? String(line.itemId)  : '',
            itemCode:     line.itemCode  || '',
            itemDesc:     line.itemDesc  || '',
            returnQty:    String(line.returnQty),
            uomId:        line.uomId     ? String(line.uomId)   : '',
            uomName:      line.uomName   || '',
            unitCost:     String(line.unitCost),
            returnReason: line.returnReason || '',
        });
        setError(''); setShowForm(true);
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        if (name === 'uomId') {
            const u = (uoms || []).find(u => String(u.id) === value);
            if (u) setForm(p => ({ ...p, uomId: value, uomName: u.name }));
        }
    };

    const save = () => {
        if (!form.itemId)                                        { setError('Item is required.'); return; }
        if (!form.itemDesc?.trim())                              { setError('Description is required.'); return; }
        if (!form.returnQty || Number(form.returnQty) <= 0)     { setError('Return qty must be > 0.'); return; }
        if (form.unitCost === '' || isNaN(Number(form.unitCost))) { setError('Unit cost is required.'); return; }
        if (Number(form.unitCost) < 0)                          { setError('Unit cost cannot be negative.'); return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}rtv/lines/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                rtvLineId:    Number(form.rtvLineId) || 0,
                rtvId:        rtv.rtvId,
                grnDetailId:  editLine?.grnDetailId || null,
                poLineId:     editLine?.poLineId    || null,
                prLineId:     editLine?.prLineId    || null,
                itemId:       form.itemId ? Number(form.itemId) : null,
                itemCode:     form.itemCode || null,
                itemDesc:     form.itemDesc.trim(),
                returnQty:    Number(form.returnQty),
                uomId:        form.uomId ? Number(form.uomId) : null,
                uomName:      form.uomName || null,
                unitCost:     Number(form.unitCost),
                returnReason: form.returnReason.trim() || null,
                createdBy:    currentUser,
                modifiedBy:   form.rtvLineId > 0 ? currentUser : null,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error.'); return; }
                setShowForm(false); load(); onRefresh();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    const deleteLine = id => {
        setConfirm({
            title: 'Delete Return Line',
            message: 'Delete this return line?',
            confirmLabel: 'Delete',
            onConfirm: () => {
                setConfirm(null);
                setDeleting(id);
                fetch(`${variables.API_URL}rtv/lines/${id}`, { method: 'DELETE', headers: authHeaders() })
                    .then(async res => {
                        if (!res.ok) {
                            const d = await res.json().catch(() => ({}));
                            setError(d.message || 'Error deleting line.');
                            return;
                        }
                        load(); onRefresh();
                    })
                    .catch(() => setError('Network error deleting line.'))
                    .finally(() => setDeleting(null));
            },
        });
    };

    const grandTotal = lines.reduce((s, l) => s + (l.lineTotal || 0), 0);

    return (
        <div>
            {confirm   && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            {showImport && <GrnImportModal rtv={rtv} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); load(); onRefresh(); }} />}

            <div className="prd-lines-wrap">
                <div className="prd-lines-header">
                    <span className="prd-lines-title">Return Lines ({lines.length})</span>
                    {isDraft && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            {hasGrn && (
                                <button className="prd-add-btn" style={{ background: '#0f766e' }} onClick={() => setShowImport(true)}
                                    title="Import lines from the linked GRN">
                                    📋 Import from GRN
                                </button>
                            )}
                            <button className="prd-add-btn" onClick={openNew}>+ Add Line</button>
                        </div>
                    )}
                </div>

                {isDraft && !hasGrn && (
                    <div style={{ padding: '10px 14px', background: '#f0f9ff', borderBottom: '1px solid #bfdbfe', fontSize: 12, color: '#1e40af' }}>
                        💡 To use <strong>📋 Import from GRN</strong>, first link a source GRN: go to the <strong>Overview</strong> tab → click <strong>✏ Edit</strong> → search and select a GRN.
                    </div>
                )}

                {isDraft && hasGrn && lines.length === 0 && (
                    <div style={{ padding: '10px 14px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', fontSize: 12, color: '#166534' }}>
                        💡 Click <strong>📋 Import from GRN</strong> to pre-fill lines from the source GRN.
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>Loading…</div>
                ) : (
                    <>
                        <div style={{ overflowX: 'auto' }}>
                            <table className="prd-lines-table">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Item Code</th>
                                        <th>Description</th>
                                        <th style={{ textAlign: 'right' }}>Return Qty</th>
                                        <th>UOM</th>
                                        <th style={{ textAlign: 'right' }}>Unit Cost</th>
                                        <th style={{ textAlign: 'right' }}>Line Total</th>
                                        <th>Return Reason</th>
                                        {isDraft && <th>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.length === 0 ? (
                                        <tr><td colSpan={isDraft ? 9 : 8} className="prd-lines-empty">No return lines yet.</td></tr>
                                    ) : lines.map(l => (
                                        <tr key={l.rtvLineId}>
                                            <td><span className="prd-line-num">{l.lineNum}</span></td>
                                            <td>
                                                {l.itemCode
                                                    ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{l.itemCode}</span>
                                                    : <span style={{ color: '#94a3b8' }}>—</span>}
                                            </td>
                                            <td>{l.itemDesc}</td>
                                            <td className="prd-num-cell" style={{ color: '#dc2626', fontWeight: 600 }}>-{fmt(l.returnQty)}</td>
                                            <td>{l.uomName || '—'}</td>
                                            <td className="prd-num-cell">{fmt(l.unitCost)}</td>
                                            <td className="prd-num-cell" style={{ fontWeight: 600 }}>{fmt(l.lineTotal)}</td>
                                            <td style={{ fontSize: 11, color: '#64748b' }}>{l.returnReason || '—'}</td>
                                            {isDraft && (
                                                <td>
                                                    <button className="prd-line-act" onClick={() => openEdit(l)}>Edit</button>
                                                    <button className="prd-line-act prd-line-del" onClick={() => deleteLine(l.rtvLineId)} disabled={deleting === l.rtvLineId}>Del</button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                                {lines.length > 0 && (
                                    <tfoot>
                                        <tr style={{ background: '#f4f7fb', fontWeight: 600 }}>
                                            <td colSpan={6} style={{ textAlign: 'right', fontSize: 11, color: '#3a5070', padding: '8px 10px', textTransform: 'uppercase' }}>Total Return Value</td>
                                            <td className="prd-num-cell" style={{ fontWeight: 700, color: '#dc2626' }}>{fmt(grandTotal)}</td>
                                            <td />{isDraft && <td />}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        {showForm && isDraft && (
                            <div className="prd-line-form">
                                <div className="prd-line-form-title">{form.rtvLineId > 0 ? 'Edit Return Line' : 'Add Return Line'}</div>
                                {error && <div className="pf-err" style={{ marginBottom: 8 }}>{error}</div>}

                                {/* Row 1: Item select + Description */}
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field" style={{ position: 'relative' }}>
                                        <label>Item {isReq('itemId') && <span className="req">*</span>}</label>
                                        {form.rtvLineId > 0 ? (
                                            <input className="prd-lf-input"
                                                value={form.itemCode ? `[${form.itemCode}] ${form.itemDesc}` : form.itemDesc}
                                                readOnly
                                                style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                                title="Item cannot be changed on an existing line" />
                                        ) : form.itemId ? (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span className="prd-lf-input" style={{ background: '#eff6ff', color: '#1e40af', fontWeight: 500, flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{ fontFamily: 'Courier New', fontSize: 11 }}>{form.itemCode}</span>
                                                    <span style={{ color: '#374151', fontSize: 12 }}>{form.itemDesc}</span>
                                                </span>
                                                <button type="button"
                                                    onClick={() => { setForm(p => ({ ...p, itemId: '', itemCode: '', itemDesc: '', uomId: '', uomName: '', unitCost: '' })); setItemSearch(''); setItemResults([]); }}
                                                    style={{ background: '#fee2e2', border: 'none', borderRadius: 4, padding: '5px 9px', cursor: 'pointer', color: '#991b1b', fontWeight: 700, fontSize: 13 }}>✕</button>
                                            </div>
                                        ) : (
                                            <>
                                                <input className="prd-lf-input"
                                                    value={itemSearch}
                                                    onChange={e => setItemSearch(e.target.value)}
                                                    placeholder="Type item code or name to search…"
                                                    autoComplete="off" />
                                                {itemResults.length > 0 && (
                                                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 200, overflowY: 'auto' }}>
                                                        {itemResults.map(it => (
                                                            <div key={it.itemId}
                                                                style={{ padding: '7px 12px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, alignItems: 'center' }}
                                                                onMouseDown={() => {
                                                                    setForm(p => ({ ...p, itemId: String(it.itemId), itemCode: it.itemCode || '', itemDesc: it.itemName || '' }));
                                                                    setItemSearch(''); setItemResults([]);
                                                                }}
                                                                onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                                onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                                <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>{it.itemCode}</span>
                                                                <span style={{ color: '#1e293b' }}>{it.itemName}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                    <div className="prd-lf-field prd-lf-f2">
                                        <label>Description {isReq('itemDesc') && <span className="req">*</span>}</label>
                                        {form.rtvLineId > 0 ? (
                                            <input className="prd-lf-input"
                                                value={form.itemDesc}
                                                readOnly
                                                style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                                title="Item cannot be changed on an existing line" />
                                        ) : (
                                            <input className="prd-lf-input" type="text" name="itemDesc" value={form.itemDesc} onChange={handle} placeholder="Auto-filled from item, or type manually" />
                                        )}
                                    </div>
                                </div>

                                {/* Row 2: Qty, UOM, Unit Cost, Return Reason */}
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field">
                                        <label>Return Qty {isReq('returnQty') && <span className="req">*</span>}</label>
                                        <input className="prd-lf-input" type="number" name="returnQty" value={form.returnQty} onChange={handle} min="0.01" step="0.01" />
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>UOM</label>
                                        {(editLine && (editLine.grnDetailId || editLine.poLineId || editLine.prLineId)) ? (
                                            <input className="prd-lf-input"
                                                value={(uoms || []).find(u => String(u.id) === String(form.uomId))?.name || form.uomName || '—'}
                                                readOnly
                                                style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                                title="UOM follows the GRN/PO line and cannot be changed. To return part of a unit, enter a fraction (e.g. 0.5). Stock is converted to the item's base UOM at posting." />
                                        ) : (
                                            <select className="prd-lf-input" name="uomId" value={form.uomId} onChange={handle}>
                                                <option value="">— UOM —</option>
                                                {(uoms || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                            </select>
                                        )}
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>Unit Cost {isReq('unitCost') && <span className="req">*</span>}</label>
                                        <AmountInput className="prd-lf-input" value={form.unitCost} onChange={v => handle({ target: { name: 'unitCost', value: v } })} />
                                    </div>
                                    <div className="prd-lf-field prd-lf-f2">
                                        <label>Return Reason</label>
                                        <input className="prd-lf-input" type="text" name="returnReason" value={form.returnReason} onChange={handle} placeholder="Defective, wrong item, over-delivery…" />
                                    </div>
                                </div>

                                <div className="prd-lf-actions">
                                    <button className="prd-lf-cancel" onClick={() => { setShowForm(false); setError(''); }}>Cancel</button>
                                    <button className="prd-lf-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : form.rtvLineId > 0 ? 'Update Line' : 'Add Line'}</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default RtvLinesTab;
