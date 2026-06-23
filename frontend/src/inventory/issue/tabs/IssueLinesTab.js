import React, { useState, useEffect, useRef } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import ConfirmModal from '../../../common/ConfirmModal';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmt } from '../../inventoryConstants';
import { useFieldConfig } from '../../../FieldConfigContext';
import AmountInput from '../../../common/AmountInput';

// ── Smart item search ─────────────────────────────────────────
// EXC_COSTING → job-specific items only (api/stockissue/jobitems/{jobId})
// INC_COSTING → all items             (api/item/search)
const IssueItemSearch = ({ value, onSelect, costingType, jobId }) => {
    const [q,   setQ]   = useState('');
    const [res, setRes] = useState([]);
    const timer         = useRef(null);

    // Reset text when item is cleared
    useEffect(() => { if (!value) setQ(''); }, [value]);

    const isJobMode = costingType === 'EXC_COSTING';

    const search = (text) => {
        setQ(text);
        clearTimeout(timer.current);
        if (!text.trim()) { setRes([]); return; }
        timer.current = setTimeout(() => {
            const url = isJobMode
                ? `${variables.API_URL}stockissue/jobitems/${encodeURIComponent(jobId)}?searchText=${encodeURIComponent(text)}&pageSize=20`
                : `${variables.API_URL}item/search?searchText=${encodeURIComponent(text)}&pageSize=20`;
            fetch(url, { headers: authHeaders() })
                .then(r => r.json())
                .then(d => {
                    // jobitems returns array directly; item/search returns { data: [...] }
                    setRes(Array.isArray(d) ? d : (d.data || []));
                })
                .catch(() => {});
        }, 280);
    };

    if (value) return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span className="prd-lf-input" style={{
                flex: 1, background: '#f0f9ff', color: '#1e40af', fontWeight: 500,
                fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
            }}>
                ✓ <strong>{value.itemCode}</strong> — {value.itemName}
                {isJobMode && value.availableQty != null && (
                    <span style={{ marginLeft: 8, color: value.availableQty > 0 ? '#166534' : '#dc2626', fontSize: 10.5, fontWeight: 600 }}>
                        ({fmt(value.availableQty, 4)} avail.)
                    </span>
                )}
            </span>
            <button type="button" onClick={() => { onSelect(null); setQ(''); }}
                style={{ background: '#fee2e2', border: 'none', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', color: '#991b1b', fontWeight: 700 }}>✕</button>
        </div>
    );

    return (
        <div style={{ position: 'relative' }}>
            <input className="prd-lf-input"
                placeholder={isJobMode
                    ? `Search items purchased for this job…`
                    : `Search by item code or name…`}
                value={q}
                onChange={e => search(e.target.value)}
                onBlur={() => setTimeout(() => setRes([]), 200)} />
            {res.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,.12)', maxHeight: 240, overflowY: 'auto' }}>
                    {res.map(it => (
                        <div key={it.itemId}
                            style={{ padding: '8px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                            onMouseDown={() => { setRes([]); onSelect(it); }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            <span>
                                <strong style={{ color: '#1e40af' }}>{it.itemCode}</strong>
                                <span style={{ color: '#374151', marginLeft: 8 }}>{it.itemName}</span>
                            </span>
                            {/* Show available qty for job mode */}
                            {isJobMode && it.availableQty != null && (
                                <span style={{ fontSize: 10.5, fontWeight: 600, color: it.availableQty > 0 ? '#166534' : '#dc2626', background: it.availableQty > 0 ? '#dcfce7' : '#fee2e2', borderRadius: 4, padding: '1px 6px', marginLeft: 10, whiteSpace: 'nowrap' }}>
                                    {fmt(it.availableQty, 4)} avail.
                                </span>
                            )}
                        </div>
                    ))}
                    {res.length === 0 && isJobMode && (
                        <div style={{ padding: '10px 12px', color: '#94a3b8', fontSize: 12.5, fontStyle: 'italic' }}>
                            No items purchased for this job matching your search.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ── IssueLinesTab ─────────────────────────────────────────────
const IssueLinesTab = ({ issue, lines, onRefresh }) => {
    const currentUser              = useCurrentUser();
    const { lookups, getStatusConfig } = useLookup();
    const { uoms }                 = lookups;
    const { isReq }                = useFieldConfig('ISSUE_LINE');

    const { canDo }  = usePermission();
    const canEdit    = (getStatusConfig('ISN', issue.status)?.canEdit ?? (issue.status === 'Draft')) && canDo('/inventory-issue', 'EDIT');
    const isJobMode  = issue.costingType === 'EXC_COSTING';

    const EMPTY_FORM = { item: null, itemDesc: '', qty: '', uomId: '', unitCost: '', notes: '' };
    const [showForm,    setShowForm]    = useState(false);
    const [editLine,    setEditLine]    = useState(null);
    const [form,        setForm]        = useState(EMPTY_FORM);
    const [saving,      setSaving]      = useState(false);
    const [deleting,    setDeleting]    = useState(null);
    const [error,       setError]       = useState('');
    const [costLoading, setCostLoading] = useState(false);
    const [confirm,     setConfirm]     = useState(null);
    // Cost is fetched per BASE uom. The line cost must be expressed in the chosen
    // issue UOM: cost/ROLL = cost/MTR × (MTR per ROLL). So unitCost = baseCost ×
    // conversion factor for the selected UOM (factor 1 when issuing in base UOM).
    const [baseCost,    setBaseCost]    = useState(null);
    const [conversions, setConversions] = useState([]);
    const factorFor = (uomId, convs = conversions) => {
        if (!uomId) return 1;
        const c = (convs || []).find(x => x.fromUomId === Number(uomId) && x.isActive !== false);
        return c ? (Number(c.conversionFactor) || 1) : 1;
    };

    // ── Stock availability state ──────────────────────────────
    const [stockAvail,   setStockAvail]   = useState(null);   // { availableQty }
    const [stockLoading, setStockLoading] = useState(false);
    const stockTimer = useRef(null);

    // Fetch available qty whenever item or qty changes
    useEffect(() => {
        if (!form.item) { setStockAvail(null); return; }
        clearTimeout(stockTimer.current);
        stockTimer.current = setTimeout(async () => {
            setStockLoading(true);
            try {
                const url = `${variables.API_URL}stockissue/stockavail/${form.item.itemId}`
                    + `?jobId=${encodeURIComponent(issue.jobId)}`
                    + `&costingType=${encodeURIComponent(issue.costingType)}`;
                const r = await fetch(url, { headers: authHeaders() });
                const d = await r.json();
                setStockAvail(r.ok ? d : null);
            } catch { setStockAvail(null); }
            finally  { setStockLoading(false); }
        }, 300);
        return () => clearTimeout(stockTimer.current);
    }, [form.item, issue.jobId, issue.costingType]); // eslint-disable-line

    // Is the requested qty more than what's available?
    const qtyNum      = Number(form.qty) || 0;
    const availQty    = stockAvail?.availableQty ?? null;
    const stockShort  = availQty !== null && qtyNum > 0 && qtyNum > availQty;

    // ── Item selected handler ─────────────────────────────────
    const handleItemSelect = async (item) => {
        if (!item) { setForm(f => ({ ...f, item: null, itemDesc: '', unitCost: '' })); setStockAvail(null); setBaseCost(null); setConversions([]); return; }
        setForm(f => ({ ...f, item, unitCost: '' }));
        setCostLoading(true);
        try {
            // UOM conversions for this item (to express the cost in the issue UOM)
            const convsP = fetch(`${variables.API_URL}item/${item.itemId}/uom-conversions`, { headers: authHeaders() })
                .then(r => (r.ok ? r.json() : [])).catch(() => []);
            // Cost per BASE uom — job last cost (EXC) or FIFO (INC)
            let base;
            if (isJobMode) {
                base = Number(item.lastCost ?? 0);
            } else {
                const r = await fetch(`${variables.API_URL}stockissue/fifocost/${item.itemId}`, { headers: authHeaders() });
                const d = await r.json();
                base = r.ok ? Number(d.fifoCost ?? 0) : Number(item.lastCost ?? 0);
            }
            const convRows = (await convsP) || [];
            setBaseCost(base);
            setConversions(Array.isArray(convRows) ? convRows : []);
            setForm(f => ({ ...f, unitCost: String(base * factorFor(f.uomId, convRows)) }));
        } catch {
            setBaseCost(null);
        } finally {
            setCostLoading(false);
        }
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => {
            const next = { ...p, [name]: value };
            // Re-express the cost in the newly-chosen UOM
            if (name === 'uomId' && baseCost != null) {
                next.unitCost = String(baseCost * factorFor(value));
            }
            return next;
        });
    };

    const openAdd = () => {
        setEditLine(null);
        setForm(EMPTY_FORM);
        setStockAvail(null);
        setBaseCost(null);
        setConversions([]);
        setError('');
        setShowForm(true);
    };

    const openEdit = (l) => {
        setEditLine(l);
        setForm({
            item:     { itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName },
            itemDesc: l.itemDesc != null ? l.itemDesc : '',
            qty:      l.qty      != null ? String(l.qty)      : '',
            uomId:    l.uomId    ? String(l.uomId) : '',
            unitCost: l.unitCost != null ? String(l.unitCost) : '',
            notes:    l.notes    || '',
        });
        setStockAvail(null);
        setError('');
        setShowForm(true);
        // Load conversions and recover the per-base cost from the stored line, so
        // changing the UOM here re-expresses the cost correctly.
        fetch(`${variables.API_URL}item/${l.itemId}/uom-conversions`, { headers: authHeaders() })
            .then(r => (r.ok ? r.json() : []))
            .then(rows => {
                const convRows = Array.isArray(rows) ? rows : [];
                setConversions(convRows);
                const f = factorFor(l.uomId, convRows) || 1;
                setBaseCost(l.unitCost != null ? Number(l.unitCost) / f : null);
            })
            .catch(() => { setConversions([]); setBaseCost(null); });
    };

    const lineTotal = () => (Number(form.qty) || 0) * (Number(form.unitCost) || 0);

    const save = () => {
        if (!form.item)                                                                         { setError('Select an item.'); return; }
        if (!form.qty || isNaN(Number(form.qty)) || Number(form.qty) <= 0)                     { setError('Valid quantity required.'); return; }
        if (form.unitCost === '' || isNaN(Number(form.unitCost)) || Number(form.unitCost) < 0)  { setError('Valid unit cost required.'); return; }
        if (stockShort) {
            setError(`Insufficient stock. Requested: ${fmt(qtyNum, 4)}, Available: ${fmt(availQty, 4)}.`);
            return;
        }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}stockissue/line/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                issueLineId: editLine?.issueLineId || 0,
                issueId:     issue.issueId,
                lineNum:     editLine?.lineNum || 0,
                itemId:      form.item.itemId,
                itemDesc:    form.itemDesc.trim() || null,
                qty:         Number(form.qty),
                uomId:       form.uomId ? Number(form.uomId) : null,
                unitCost:    Number(form.unitCost),
                notes:       form.notes.trim() || null,
                createdBy:   currentUser,
                modifiedBy:  editLine ? currentUser : null,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error.'); return; }
                setShowForm(false);
                onRefresh();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    const deleteLine = (lineId) => {
        setConfirm({
            title: 'Delete Line',
            message: 'Delete this line?',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setDeleting(lineId);
                try {
                    const res = await fetch(
                        `${variables.API_URL}stockissue/line/${lineId}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    if (!res.ok) { const d = await res.json(); setError(d?.message || 'Failed to delete line.'); return; }
                    onRefresh();
                } catch { setError('Network error. Please try again.'); }
                finally { setDeleting(null); }
            },
        });
    };

    const grandTotal = lines.reduce((s, l) => s + (l.qty || 0) * (l.unitCost || 0), 0);

    // Costing mode banner
    const modeBanner = isJobMode
        ? { bg: '#f3e8ff', border: '#d8b4fe', color: '#6d28d9', icon: '🔒', text: 'Excluding Costing — only items purchased for this job are available for issue.' }
        : { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: '✓',  text: 'Including Costing — issued from store stock only (job stock stays reserved for its own job). Issue cost is charged to the job.' };

    return (
        <div>
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            {/* Costing mode information banner */}
            <div style={{ margin: '0 0 0 0', padding: '8px 14px', background: modeBanner.bg, borderBottom: `1px solid ${modeBanner.border}`, fontSize: 12, color: modeBanner.color, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{modeBanner.icon}</span> <strong>{issue.costingType === 'EXC_COSTING' ? 'Not Include in Costing' : 'Include in Costing'}:</strong> {modeBanner.text}
            </div>

            <div className="prd-lines-wrap">

                {/* Toolbar */}
                <div className="prd-lines-header">
                    <span className="prd-lines-title">Lines ({lines.length})</span>
                    {canEdit && (
                        <button className="prd-add-btn" onClick={openAdd}>+ Add Line</button>
                    )}
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                    <table className="prd-lines-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Item Code</th>
                                <th>Description</th>
                                <th style={{ textAlign: 'right' }}>Qty</th>
                                <th>UOM</th>
                                <th style={{ textAlign: 'right' }}>Unit Cost</th>
                                <th style={{ textAlign: 'right' }}>Total Cost</th>
                                <th>Notes</th>
                                {canEdit && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {lines.length === 0 ? (
                                <tr>
                                    <td colSpan={canEdit ? 9 : 8} className="prd-lines-empty">
                                        No lines yet. {canEdit && 'Click "+ Add Line" to begin.'}
                                    </td>
                                </tr>
                            ) : lines.map(l => (
                                <tr key={l.issueLineId}>
                                    <td><span className="prd-line-num">{l.lineNum}</span></td>
                                    <td>
                                        <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>
                                            {l.itemCode || '—'}
                                        </span>
                                    </td>
                                    <td style={{ color: '#1e293b' }}>{l.itemDesc || l.itemName || '—'}</td>
                                    <td className="prd-num-cell" style={{ color: '#1e40af', fontWeight: 500 }}>{fmt(l.qty, 4)}</td>
                                    <td style={{ color: '#475569' }}>{l.uomName || '—'}</td>
                                    <td className="prd-num-cell">{fmt(l.unitCost)}</td>
                                    <td className="prd-num-cell" style={{ fontWeight: 600 }}>{fmt((l.qty || 0) * (l.unitCost || 0))}</td>
                                    <td style={{ fontSize: 11, color: '#64748b' }}>{l.notes || '—'}</td>
                                    {canEdit && (
                                        <td>
                                            <button className="prd-line-act" onClick={() => openEdit(l)}>Edit</button>
                                            <button className="prd-line-act prd-line-del"
                                                onClick={() => deleteLine(l.issueLineId)}
                                                disabled={deleting === l.issueLineId}>
                                                {deleting === l.issueLineId ? '…' : 'Del'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                        {lines.length > 0 && (
                            <tfoot>
                                <tr style={{ background: '#f4f7fb', fontWeight: 600 }}>
                                    <td colSpan={6} style={{ textAlign: 'right', fontSize: 11, color: '#3a5070', padding: '8px 10px', textTransform: 'uppercase', letterSpacing: '.3px' }}>
                                        Total Issue Cost
                                    </td>
                                    <td className="prd-num-cell" style={{ fontWeight: 700, color: '#1e3a5f' }}>{fmt(grandTotal)}</td>
                                    <td />{canEdit && <td />}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* ── Add / Edit inline form ── */}
                {showForm && (
                    <div className="prd-line-form">
                        <div className="prd-line-form-title">{editLine ? 'Edit Line' : 'Add Line'}</div>
                        {error && <div className="pf-err" style={{ marginBottom: 8 }}>{error}</div>}

                        {/* Row 1: Item search + Description override */}
                        <div className="prd-lf-row">
                            <div className="prd-lf-field prd-lf-f2">
                                <label>
                                    Item {isReq('item') && <span className="req">*</span>}
                                    {isJobMode && (
                                        <span style={{ marginLeft: 6, fontSize: 10, color: '#7c3aed', fontWeight: 400 }}>
                                            (job-purchased items only)
                                        </span>
                                    )}
                                </label>
                                <IssueItemSearch
                                    value={form.item}
                                    onSelect={handleItemSelect}
                                    costingType={issue.costingType}
                                    jobId={issue.jobId}
                                />
                            </div>
                            <div className="prd-lf-field prd-lf-f2">
                                <label>Description Override</label>
                                <input className="prd-lf-input" type="text" name="itemDesc" value={form.itemDesc}
                                    onChange={handle} placeholder="Leave blank to use item name" />
                            </div>
                        </div>

                        {/* Row 2: Qty / UOM / Unit Cost / Line Total */}
                        <div className="prd-lf-row">
                            <div className="prd-lf-field">
                                <label>Qty {isReq('qty') && <span className="req">*</span>}</label>
                                <input className={`prd-lf-input${stockShort ? ' pf-input-err' : ''}`}
                                    type="number" name="qty" value={form.qty}
                                    onChange={handle} min="0" step="0.0001" />
                                {/* Stock availability indicator */}
                                {form.item && (
                                    <div style={{ fontSize: 10.5, marginTop: 3 }}>
                                        {stockLoading ? (
                                            <span style={{ color: '#64748b' }}>⏳ checking stock…</span>
                                        ) : availQty !== null ? (
                                            <span style={{ color: stockShort ? '#dc2626' : '#166534', fontWeight: 500 }}>
                                                {stockShort ? '⚠ ' : '✓ '}
                                                Available ({isJobMode ? 'job stock' : 'store stock'}): <strong>{fmt(availQty, 4)}</strong>
                                                {stockShort && ` — need ${fmt(qtyNum - availQty, 4)} more`}
                                                {stockAvail && (
                                                    <span style={{ color: '#64748b', marginLeft: 8, fontWeight: 400 }}>
                                                        — breakdown · Job: <strong>{fmt(stockAvail.jobStock, 4)}</strong> · Store: <strong>{fmt(stockAvail.storeStock, 4)}</strong>
                                                    </span>
                                                )}
                                            </span>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                            <div className="prd-lf-field">
                                <label>UOM</label>
                                <select className="prd-lf-input" name="uomId" value={form.uomId} onChange={handle}>
                                    <option value="">— UOM —</option>
                                    {(uoms || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
                            <div className="prd-lf-field">
                                <label>
                                    Unit Cost {isReq('unitCost') && <span className="req">*</span>}
                                    {costLoading && (
                                        <span style={{ marginLeft: 6, color: '#64748b', fontSize: 10, fontWeight: 400 }}>⏳ FIFO…</span>
                                    )}
                                    {!costLoading && form.item && form.unitCost !== '' && (
                                        <span style={{ marginLeft: 6, color: '#16a34a', fontSize: 10, fontWeight: 400 }}>
                                            {isJobMode ? '↑ job cost' : '↑ FIFO price'}
                                        </span>
                                    )}
                                </label>
                                <AmountInput className="prd-lf-input"
                                    value={form.unitCost} onChange={v => handle({ target: { name: 'unitCost', value: v } })}
                                    disabled={costLoading} />
                            </div>
                            <div className="prd-lf-field">
                                <label>Line Total</label>
                                <div style={{ padding: '7px 0' }}>
                                    <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>
                                        {fmt(lineTotal())}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Row 3: Notes */}
                        <div className="prd-lf-row">
                            <div className="prd-lf-field prd-lf-f2">
                                <label>Notes</label>
                                <input className="prd-lf-input" type="text" name="notes" value={form.notes}
                                    onChange={handle} placeholder="Optional line note…" />
                            </div>
                        </div>

                        <div className="prd-lf-actions">
                            <button className="prd-lf-cancel" onClick={() => { setShowForm(false); setError(''); }}>Cancel</button>
                            <button className="prd-lf-save" onClick={save}
                                disabled={saving || costLoading || stockShort}
                                title={stockShort ? `Insufficient stock — available: ${fmt(availQty, 4)}` : ''}>
                                {saving ? 'Saving…' : editLine ? 'Update Line' : 'Add Line'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default IssueLinesTab;
