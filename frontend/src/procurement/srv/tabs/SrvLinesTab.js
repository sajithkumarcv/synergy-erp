import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { fmt } from '../../procurementConstants';
import { useFieldConfig } from '../../../FieldConfigContext';

const TYPE_COLORS = {
    SUBCON: { bg: '#f3e8ff', color: '#7e22ce' },
    SVC:    { bg: '#dbeafe', color: '#1e40af' },
    LABOUR: { bg: '#fef9c3', color: '#854d0e' },
    HIRE:   { bg: '#ccfbf1', color: '#0f766e' },
    OVHD:   { bg: '#f1f5f9', color: '#475569' },
};

// ── PO Lines Import Modal ─────────────────────────────────────────────────────
const PoImportModal = ({ srv, onClose, onImported }) => {
    const currentUser = useCurrentUser();
    const [lines,     setLines]     = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [selected,  setSelected]  = useState({});
    const [qtys,      setQtys]      = useState({});   // poLineId → qty string
    const [importing, setImporting] = useState(false);
    const [error,     setError]     = useState('');

    useEffect(() => {
        setLoading(true);
        fetch(`${variables.API_URL}servicereceipt/polines/${srv.poId}?srvId=${srv.srvId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const rows = Array.isArray(d) ? d : [];
                setLines(rows);
                const sel = {}, qMap = {};
                rows.forEach(l => {
                    if (!l.alreadyConfirmed && l.remainingQty > 0) {
                        sel[l.poLineId]  = true;
                        qMap[l.poLineId] = String(l.remainingQty);
                    }
                });
                setSelected(sel); setQtys(qMap);
            })
            .catch(() => setError('Failed to load PO lines.'))
            .finally(() => setLoading(false));
    }, [srv.poId, srv.srvId]);

    const toggle    = id => setSelected(p => ({ ...p, [id]: !p[id] }));
    const toggleAll = () => {
        const eligible = lines.filter(l => !l.alreadyConfirmed && l.remainingQty > 0);
        const allOn    = eligible.every(l => selected[l.poLineId]);
        const next     = {};
        eligible.forEach(l => { next[l.poLineId] = !allOn; });
        setSelected(p => ({ ...p, ...next }));
    };
    const setQty = (id, val) => setQtys(p => ({ ...p, [id]: val }));

    const doImport = async () => {
        const toImport = lines.filter(l => selected[l.poLineId] && !l.alreadyConfirmed);
        if (!toImport.length) { setError('No lines selected.'); return; }

        for (const l of toImport) {
            const q = Number(qtys[l.poLineId]);
            const max = l.remainingQty > 0 ? l.remainingQty : l.orderedQty;
            if (!q || q <= 0) { setError(`Enter a valid quantity for "${l.itemDesc}".`); return; }
            if (q > max)      { setError(`Quantity for "${l.itemDesc}" (${q}) exceeds remaining (${max}).`); return; }
        }

        setImporting(true); setError('');
        const errors = [];
        let succeeded = 0;
        try {
            for (const l of toImport) {
                const r = await fetch(`${variables.API_URL}servicereceipt/lines/save`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({
                        srvLineId:    0,
                        srvId:        srv.srvId,
                        poLineId:     l.poLineId,
                        itemId:       l.itemId   || null,
                        itemCode:     l.itemCode || null,
                        itemDesc:     l.itemDesc || 'Service',
                        completedQty: Number(qtys[l.poLineId]),
                        uomId:        l.uomId    || null,
                        uomName:      l.uomName  || null,
                        unitCost:     l.unitPrice || 0,
                        createdBy:    currentUser,
                    }),
                });
                if (r.ok) {
                    succeeded++;
                } else {
                    const d = await r.json().catch(() => ({}));
                    errors.push(`${l.itemCode || l.itemDesc}: ${d?.message || 'Save failed.'}`);
                }
            }
            if (errors.length > 0) {
                const note = succeeded > 0 ? ` (${succeeded} line(s) imported successfully)` : '';
                setError(errors.join('\n') + note);
                if (succeeded > 0) onImported();
            } else {
                onImported();
            }
        } catch { setError('Error importing some lines.'); }
        finally { setImporting(false); }
    };

    const eligible   = lines.filter(l => !l.alreadyConfirmed && l.remainingQty > 0);
    const allChecked = eligible.length > 0 && eligible.every(l => selected[l.poLineId]);
    const selCount   = Object.values(selected).filter(Boolean).length;

    const TH = ({ children, align = 'left', hl }) => (
        <th style={{ padding: '8px 10px', textAlign: align, fontWeight: 600,
            color: hl ? '#1e40af' : '#3a5070', textTransform: 'uppercase',
            fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9',
            background: hl ? '#eff6ff' : undefined }}>
            {children}
        </th>
    );

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{ background: '#fff', borderRadius: 10, width: 920, maxWidth: '96vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.2)' }}>
                {/* Header */}
                <div style={{ background: '#7e22ce', padding: '16px 20px', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Import from PO — Service Lines</div>
                        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11.5, marginTop: 2 }}>
                            Showing only non-stockable lines (Subcontract, Service, Labour, Hire)
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {loading ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading PO lines…</div>
                    ) : lines.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                            No service/subcontract lines found on this PO.
                        </div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead>
                                <tr style={{ background: '#eef2f8' }}>
                                    <th style={{ padding: '8px 10px', width: 36, textAlign: 'center', borderBottom: '1px solid #d4dce9' }}>
                                        <input type="checkbox" checked={allChecked} onChange={toggleAll} style={{ cursor: 'pointer', accentColor: '#7e22ce' }} />
                                    </th>
                                    <TH>#</TH>
                                    <TH>Item / Service</TH>
                                    <TH>Type</TH>
                                    <TH align="right">PO Qty</TH>
                                    <TH align="right">Received</TH>
                                    <TH align="right">Remaining</TH>
                                    <TH align="right" hl>SRV Qty ✎</TH>
                                    <TH>UOM</TH>
                                    <TH align="right">Unit Cost</TH>
                                    <TH>Status</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map(l => {
                                    const done      = l.alreadyConfirmed || l.remainingQty <= 0;
                                    const isChecked = !!selected[l.poLineId];
                                    const tc        = TYPE_COLORS[l.itemTypeCode] || { bg: '#f1f5f9', color: '#475569' };
                                    return (
                                        <tr key={l.poLineId}
                                            style={{ background: done ? '#f8fffe' : (isChecked ? '#faf5ff' : '#fff'), cursor: done ? 'default' : 'pointer', opacity: done ? 0.65 : 1 }}
                                            onClick={() => !done && toggle(l.poLineId)}>
                                            <td style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #f0f4f8' }}>
                                                {done ? <span style={{ color: '#16a34a', fontSize: 14 }}>✓</span>
                                                      : <input type="checkbox" checked={isChecked} onChange={() => toggle(l.poLineId)} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer', accentColor: '#7e22ce' }} />}
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8', color: '#64748b', fontSize: 11, fontFamily: 'Courier New' }}>{l.lineNum}</td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8' }}>
                                                {l.itemCode && <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#7e22ce', background: '#f3e8ff', padding: '2px 6px', borderRadius: 4, marginRight: 6 }}>{l.itemCode}</span>}
                                                <span style={{ color: '#1e293b' }}>{l.itemDesc}</span>
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8' }}>
                                                <span style={{ background: tc.bg, color: tc.color, padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>
                                                    {l.itemTypeName || l.itemTypeCode || '—'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', fontVariantNumeric: 'tabular-nums' }}>{fmt(l.orderedQty)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>{fmt(l.receivedQty)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                                                color: l.remainingQty <= 0 ? '#16a34a' : '#1e40af' }}>
                                                {l.remainingQty <= 0 ? '✓ Done' : fmt(l.remainingQty)}
                                            </td>
                                            {/* Editable SRV Qty */}
                                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f4f8', background: done ? 'transparent' : (isChecked ? '#faf5ff' : '#f8fafc') }}
                                                onClick={e => e.stopPropagation()}>
                                                {done ? <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span> : (
                                                    <input type="number" min="0.0001" max={l.remainingQty} step="any"
                                                        value={qtys[l.poLineId] ?? ''}
                                                        disabled={!isChecked}
                                                        onChange={e => setQty(l.poLineId, e.target.value)}
                                                        style={{ width: 80, padding: '4px 6px', border: `1px solid ${isChecked ? '#c4b5fd' : '#e2e8f0'}`, borderRadius: 5, fontSize: 12, textAlign: 'right', background: isChecked ? '#fff' : '#f1f5f9', color: isChecked ? '#1e293b' : '#94a3b8', outline: 'none' }} />
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8', color: '#475569' }}>{l.uomName || '—'}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>{l.unitPrice ? fmt(l.unitPrice) : '—'}</td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8' }}>
                                                {done
                                                    ? <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>Received</span>
                                                    : <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 8, fontSize: 10 }}>Pending</span>}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', background: '#f4f7fb', borderTop: '1px solid #d4dce9', borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        {eligible.length > 0 ? `${selCount} of ${eligible.length} lines selected` : 'All lines fully received'}
                    </div>
                    {error && (
                        <div style={{ color: '#dc2626', fontSize: 12, fontWeight: 500, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px' }}>
                            {error.split('\n').map((line, i) => <div key={i}>{line}</div>)}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={onClose} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '7px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        <button onClick={doImport} disabled={importing || eligible.length === 0}
                            style={{ background: '#7e22ce', color: '#fff', border: 'none', padding: '7px 20px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: (importing || eligible.length === 0) ? .6 : 1 }}>
                            {importing ? 'Adding…' : `Add ${selCount || ''} Lines`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── SRV Lines Tab ─────────────────────────────────────────────────────────────
const SrvLinesTab = ({ srv, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { lookups } = useLookup();
    const { isReq } = useFieldConfig('SRV_LINE');
    const { uoms } = lookups;

    const [lines,      setLines]      = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [showImport, setShowImport] = useState(false);
    const [showForm,   setShowForm]   = useState(false);
    const [, setEditLine]   = useState(null);
    const [form,       setForm]       = useState({});
    const [saving,     setSaving]     = useState(false);
    const [deleting,   setDeleting]   = useState(null);
    const [error,      setError]      = useState('');

    const canEdit = srv.status === 'Draft';

    const loadLines = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}servicereceipt/${srv.srvId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setLines(d.lines || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [srv.srvId]);

    useEffect(() => { loadLines(); }, [loadLines]);

    const openEdit = (line) => {
        setEditLine(line);
        setForm({
            srvLineId:    line.srvLineId,
            itemDesc:     line.itemDesc     || '',
            completedQty: line.completedQty != null ? String(line.completedQty) : '',
            uomId:        line.uomId        ? String(line.uomId) : '',
            uomName:      line.uomName      || '',
            unitCost:     line.unitCost     != null ? String(line.unitCost) : '',
            notes:        line.notes        || '',
        });
        setError('');
        setShowForm(true);
    };

    const save = async () => {
        if (!form.itemDesc.trim())  { setError('Description is required.'); return; }
        if (!form.completedQty || isNaN(Number(form.completedQty)) || Number(form.completedQty) <= 0)
            { setError('Quantity must be a positive number.'); return; }
        setError(''); setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}servicereceipt/lines/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    srvLineId:    form.srvLineId || 0,
                    srvId:        srv.srvId,
                    itemDesc:     form.itemDesc.trim(),
                    completedQty: Number(form.completedQty),
                    uomId:        form.uomId   ? Number(form.uomId) : null,
                    uomName:      form.uomName || null,
                    unitCost:     Number(form.unitCost) || 0,
                    notes:        form.notes.trim() || null,
                    createdBy:    currentUser,
                    modifiedBy:   form.srvLineId ? currentUser : null,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setError(d.message || 'Error.'); return; }
            setShowForm(false);
            loadLines();
            onRefresh();
        } catch { setError('Network error.'); }
        finally { setSaving(false); }
    };

    const deleteLine = async (id) => {
        if (!window.confirm('Delete this line?')) return;
        setDeleting(id);
        try {
            const res = await fetch(`${variables.API_URL}servicereceipt/lines/${id}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) { const d = await res.json(); setError(d?.message || 'Failed to delete line.'); return; }
            loadLines(); onRefresh();
        } catch { setError('Network error. Please try again.'); }
        finally { setDeleting(null); }
    };

    const handleImported = () => { setShowImport(false); loadLines(); onRefresh(); };

    const grandTotal = lines.reduce((s, l) => s + (l.totalCost || 0), 0);

    return (
        <div>
            {showImport && srv.poId && <PoImportModal srv={srv} onClose={() => setShowImport(false)} onImported={handleImported} />}

            <div className="prd-lines-wrap">
                <div className="prd-lines-header">
                    <span className="prd-lines-title">Lines ({lines.length})</span>
                    {canEdit && srv.poId && (
                        <button className="prd-add-btn" style={{ background: '#7e22ce' }}
                            onClick={() => setShowImport(true)} title="Import service lines from PO">
                            📋 Import from PO
                        </button>
                    )}
                </div>

                {loading ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>Loading…</div>
                ) : (
                    <>
                        <table className="prd-lines-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Description</th>
                                    <th style={{ textAlign: 'right' }}>Qty</th>
                                    <th>UOM</th>
                                    <th style={{ textAlign: 'right' }}>Unit Cost</th>
                                    <th style={{ textAlign: 'right' }}>Total</th>
                                    <th>Notes</th>
                                    {canEdit && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {lines.length === 0 ? (
                                    <tr><td colSpan={canEdit ? 8 : 7} className="prd-lines-empty">
                                        {srv.poId
                                            ? 'No lines yet. Click "📋 Import from PO" to add service lines.'
                                            : 'No lines yet.'}
                                    </td></tr>
                                ) : lines.map(l => (
                                    <tr key={l.srvLineId}>
                                        <td><span className="prd-line-num">{l.lineNum}</span></td>
                                        <td>
                                            {l.itemCode && <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#7e22ce', background: '#f3e8ff', padding: '2px 6px', borderRadius: 4, marginRight: 6 }}>{l.itemCode}</span>}
                                            {l.itemDesc}
                                        </td>
                                        <td className="prd-num-cell">{fmt(l.completedQty)}</td>
                                        <td>{l.uomName || '—'}</td>
                                        <td className="prd-num-cell">{fmt(l.unitCost)}</td>
                                        <td className="prd-num-cell" style={{ fontWeight: 600, color: '#1e40af' }}>{fmt(l.totalCost)}</td>
                                        <td style={{ color: '#64748b', fontSize: 11 }}>{l.notes || '—'}</td>
                                        {canEdit && (
                                            <td>
                                                <button className="prd-line-act" onClick={() => openEdit(l)}>Edit</button>
                                                <button className="prd-line-act prd-line-del" onClick={() => deleteLine(l.srvLineId)} disabled={deleting === l.srvLineId}>Del</button>
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                            {lines.length > 0 && (
                                <tfoot>
                                    <tr style={{ background: '#f4f7fb', fontWeight: 600 }}>
                                        <td colSpan={canEdit ? 5 : 5} style={{ textAlign: 'right', fontSize: 11, color: '#3a5070', padding: '8px 10px', textTransform: 'uppercase', letterSpacing: '.3px' }}>Total</td>
                                        <td className="prd-num-cell" style={{ fontWeight: 700, color: '#1e40af' }}>{fmt(grandTotal)}</td>
                                        <td />{canEdit && <td />}
                                    </tr>
                                </tfoot>
                            )}
                        </table>

                        {showForm && (
                            <div className="prd-line-form">
                                <div className="prd-line-form-title">Edit Service Line</div>
                                {error && <div className="pf-err" style={{ marginBottom: 8 }}>{error}</div>}
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field prd-lf-f2">
                                        <label>Description {isReq('itemDesc') && <span className="req">*</span>}</label>
                                        <input className="prd-lf-input" type="text" value={form.itemDesc}
                                            onChange={e => setForm(f => ({ ...f, itemDesc: e.target.value }))} placeholder="Service description" />
                                    </div>
                                </div>
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field">
                                        <label>Completed Qty {isReq('completedQty') && <span className="req">*</span>}</label>
                                        <input className="prd-lf-input" type="number" value={form.completedQty}
                                            onChange={e => setForm(f => ({ ...f, completedQty: e.target.value }))} min="0" step="0.01" />
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>UOM</label>
                                        <select className="prd-lf-input" value={form.uomId}
                                            onChange={e => {
                                                const found = (uoms||[]).find(u => String(u.id) === e.target.value);
                                                setForm(f => ({ ...f, uomId: e.target.value, uomName: found?.name || '' }));
                                            }}>
                                            <option value="">— UOM —</option>
                                            {(uoms||[]).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>Unit Cost</label>
                                        <input className="prd-lf-input" type="number" value={form.unitCost}
                                            onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} min="0" step="0.01" />
                                    </div>
                                </div>
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field prd-lf-f3">
                                        <label>Notes</label>
                                        <input className="prd-lf-input" type="text" value={form.notes}
                                            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional…" />
                                    </div>
                                </div>
                                <div className="prd-lf-actions">
                                    <button className="prd-lf-cancel" onClick={() => { setShowForm(false); setError(''); }}>Cancel</button>
                                    <button className="prd-lf-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Update Line'}</button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export default SrvLinesTab;
