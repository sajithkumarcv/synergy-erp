import React, { useState, useEffect, useCallback } from 'react';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmt, fmtDate } from '../../procurementConstants';
import { useFieldConfig } from '../../../FieldConfigContext';
import AmountInput from '../../../common/AmountInput';

const QC_STATUSES = ['Pending', 'Passed', 'Failed', 'Partial'];

// ── PO Lines Import Modal ─────────────────────────────────────────
const PoImportModal = ({ grn, onClose, onImported }) => {
    const currentUser    = useCurrentUser();
    const [poLines,      setPoLines]      = useState([]);
    const [linesLoading, setLinesLoading] = useState(true);
    const [selected,     setSelected]     = useState({});
    const [qtyMap,       setQtyMap]       = useState({});
    const [importing,    setImporting]    = useState(false);
    const [error,        setError]        = useState('');
    const [search,       setSearch]       = useState('');
    const [sortKey,      setSortKey]      = useState('');
    const [sortDir,      setSortDir]      = useState('asc');
    const [expanded,     setExpanded]     = useState({});   // key → bool (merged item groups)

    // Load PO lines
    useEffect(() => {
        if (!grn.poId) { setLinesLoading(false); return; }
        setLinesLoading(true);
        fetch(`${variables.API_URL}purchaseorder/lines/${grn.poId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(rows => {
                // Filter out Closed and Cancelled lines — no further GRNs allowed
                const list = (Array.isArray(rows) ? rows : []).filter(l => !['Closed','Cancelled'].includes(l.lineStatus));
                setPoLines(list);
                // Pre-select all lines, defaulting qty to (orderedQty - receivedQty)
                const sel = {};
                const qty = {};
                list.forEach(l => {
                    const remaining = Math.max(0, (l.orderedQty || 0) - (l.receivedQty || 0));
                    sel[l.poLineId] = remaining > 0;
                    qty[l.poLineId] = remaining > 0 ? String(remaining) : String(l.orderedQty || '');
                });
                setSelected(sel);
                setQtyMap(qty);
            })
            .catch(() => setError('Failed to load PO lines.'))
            .finally(() => setLinesLoading(false));
    }, [grn.poId]);

    const cycleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };
    const displayLines = React.useMemo(() => {
        let rows = poLines;
        if (search.trim()) {
            const q = search.toLowerCase();
            rows = rows.filter(l =>
                (l.itemCode || '').toLowerCase().includes(q) ||
                (l.itemDesc || '').toLowerCase().includes(q)
            );
        }
        if (sortKey) {
            rows = [...rows].sort((a, b) => {
                const va = (sortKey === 'code' ? a.itemCode : a.itemDesc) || '';
                const vb = (sortKey === 'code' ? b.itemCode : b.itemDesc) || '';
                return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            });
        }
        return rows;
    }, [poLines, search, sortKey, sortDir]);
    const sortIcon = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

    // Group lines by item code — same item code on the PO is clubbed into one
    // merged row that expands to the individual PO lines (kept for per-line import).
    const groupedLines = React.useMemo(() => {
        const groups = {};
        const order  = [];
        displayLines.forEach(l => {
            const key = l.itemCode ? `c:${l.itemCode}` : `l:${l.poLineId}`;
            if (!groups[key]) { groups[key] = []; order.push(key); }
            groups[key].push(l);
        });
        return order.map(key => ({ key, lines: groups[key] }));
    }, [displayLines]);
    const toggleGroup = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }));

    const toggle    = (id) => setSelected(p => ({ ...p, [id]: !p[id] }));
    const toggleAll = () => {
        const allOn = displayLines.every(l => selected[l.poLineId]);
        const next  = {};
        displayLines.forEach(l => { next[l.poLineId] = !allOn; });
        setSelected(p => ({ ...p, ...next }));
    };
    const setQty = (id, val) => setQtyMap(p => ({ ...p, [id]: val }));

    const doImport = async () => {
        const toImport = poLines.filter(l => selected[l.poLineId]);
        if (toImport.length === 0) { setError('No lines selected.'); return; }
        const invalid = toImport.filter(l => !qtyMap[l.poLineId] || isNaN(Number(qtyMap[l.poLineId])) || Number(qtyMap[l.poLineId]) <= 0);
        if (invalid.length > 0) { setError('All selected lines must have a valid received quantity > 0.'); return; }
        const overReceive = toImport.filter(l => {
            const remaining = Math.max(0, (l.orderedQty || 0) - (l.receivedQty || 0));
            return Number(qtyMap[l.poLineId]) > remaining;
        });
        if (overReceive.length > 0) { setError('One or more lines have a receive qty that exceeds the remaining ordered qty.'); return; }
        setImporting(true); setError('');
        const errors = [];
        let succeeded = 0;
        try {
            for (const l of toImport) {
                const r = await fetch(`${variables.API_URL}grn/lines/save`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({
                        grnDetailId:  0,
                        grnId:        grn.grnId,
                        poLineId:     l.poLineId,
                        prLineId:     l.prLineId || null,
                        itemId:       l.itemId   || null,
                        itemCode:     l.itemCode || null,
                        itemDesc:     l.itemDesc || 'Item',
                        orderedQty:   l.orderedQty || 0,
                        receivedQty:  Number(qtyMap[l.poLineId]) || 0,
                        rejectedQty:  0,
                        uomId:        l.uomId    || null,
                        uomName:      l.uomName  || null,
                        unitPrice:    l.unitPrice || 0,
                        taxPct:       l.taxPct    || 0,
                        qcStatus:     'Pending',
                        createdBy:    currentUser,
                        modifiedBy:   null,
                    })
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
        } catch {
            setError('Error importing some lines. Please try again.');
        } finally {
            setImporting(false);
        }
    };

    const allChecked = displayLines.length > 0 && displayLines.every(l => selected[l.poLineId]);
    const selCount   = Object.values(selected).filter(Boolean).length;

    // Aggregate one group of same-item PO lines
    const groupAgg = (rows) => ({
        ordered:   rows.reduce((s, l) => s + (l.orderedQty || 0), 0),
        prev:      rows.reduce((s, l) => s + (l.receivedQty || 0), 0),
        remaining: rows.reduce((s, l) => s + Math.max(0, (l.orderedQty || 0) - (l.receivedQty || 0)), 0),
        selQty:    rows.reduce((s, l) => s + (selected[l.poLineId] ? (Number(qtyMap[l.poLineId]) || 0) : 0), 0),
        allSel:    rows.every(l => selected[l.poLineId]),
        someSel:   rows.some(l => selected[l.poLineId]),
        priceSame: rows.every(l => l.unitPrice === rows[0].unitPrice),
    });
    const toggleGroupSelect = (rows) => {
        const allSel = rows.every(l => selected[l.poLineId]);
        setSelected(p => { const n = { ...p }; rows.forEach(l => { n[l.poLineId] = !allSel; }); return n; });
    };

    const TD = { padding: '8px 10px', borderBottom: '1px solid #f0f4f8' };

    // A single PO line row (used standalone and as a sub-row of a merged group)
    const renderLineRow = (l, isSub = false) => {
        const remaining = Math.max(0, (l.orderedQty || 0) - (l.receivedQty || 0));
        const isChecked = !!selected[l.poLineId];
        return (
            <tr key={l.poLineId}
                style={{ background: isChecked ? '#f0fff4' : (isSub ? '#fafdff' : '#fff'), cursor: 'pointer' }}
                onClick={() => toggle(l.poLineId)}>
                <td style={{ ...TD, textAlign: 'center' }}>
                    <input type="checkbox" checked={isChecked}
                        onChange={() => toggle(l.poLineId)}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: 'pointer', accentColor: '#0f766e' }} />
                </td>
                <td style={{ ...TD, color: '#64748b', fontFamily: 'Courier New', fontSize: 11, paddingLeft: isSub ? 28 : 10 }}>
                    {isSub && <span style={{ color: '#cbd5e1', marginRight: 4 }}>↳</span>}{l.lineNum}
                </td>
                <td style={TD}>
                    {l.itemCode
                        ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{l.itemCode}</span>
                        : <span style={{ color: '#94a3b8' }}>—</span>}
                </td>
                <td style={{ ...TD, color: '#1e3a5f' }}>{l.itemDesc}</td>
                <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(l.orderedQty)}</td>
                <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: l.receivedQty > 0 ? '#b45309' : '#94a3b8' }}>
                    {l.receivedQty > 0 ? fmt(l.receivedQty) : '—'}
                </td>
                <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                    color: remaining <= 0 ? '#16a34a' : (remaining < l.orderedQty ? '#b45309' : '#1e3a5f') }}>
                    {remaining <= 0 ? <span title="Fully received">✓ Done</span> : fmt(remaining)}
                </td>
                <td style={{ ...TD, color: '#475569' }}>{l.uomName || '—'}</td>
                <td style={{ ...TD, textAlign: 'right', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{l.unitPrice != null ? fmt(l.unitPrice) : '—'}</td>
                <td style={TD} onClick={e => e.stopPropagation()}>
                    <input
                        type="number"
                        value={qtyMap[l.poLineId] || ''}
                        onChange={e => setQty(l.poLineId, e.target.value)}
                        disabled={!isChecked}
                        style={{ width: 80, padding: '4px 6px', border: `1px solid ${isChecked ? '#0f766e' : '#d1d5db'}`, borderRadius: 4, fontSize: 12, textAlign: 'right', background: isChecked ? '#fff' : '#f8fafc', color: isChecked ? '#1e293b' : '#94a3b8' }}
                        min="0.01" step="0.01"
                    />
                </td>
            </tr>
        );
    };

    // A merged row for an item code that appears on multiple PO lines
    const renderMergedRow = (g) => {
        const a = groupAgg(g.lines);
        const f = g.lines[0];
        const isOpen = !!expanded[g.key];
        return (
            <React.Fragment key={g.key}>
                <tr style={{ background: a.allSel ? '#f0fff4' : (a.someSel ? '#f5fffb' : '#fff'), cursor: 'pointer' }}
                    onClick={() => toggleGroup(g.key)}>
                    <td style={{ ...TD, textAlign: 'center' }}>
                        <input type="checkbox" checked={a.allSel}
                            ref={el => { if (el) el.indeterminate = !a.allSel && a.someSel; }}
                            onChange={() => toggleGroupSelect(g.lines)}
                            onClick={e => e.stopPropagation()}
                            style={{ cursor: 'pointer', accentColor: '#0f766e' }} />
                    </td>
                    <td style={{ ...TD }} onClick={e => { e.stopPropagation(); toggleGroup(g.key); }}>
                        <button style={{ background: '#eef2f8', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 10.5, color: '#0f766e', fontWeight: 700, cursor: 'pointer', padding: '1px 6px' }}>
                            {isOpen ? '▲' : '▼'} {g.lines.length}
                        </button>
                    </td>
                    <td style={TD}>
                        <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{f.itemCode}</span>
                        <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#9a3412', background: '#ffedd5', padding: '1px 6px', borderRadius: 8 }}>×{g.lines.length}</span>
                    </td>
                    <td style={{ ...TD, color: '#1e3a5f' }}>{f.itemDesc}</td>
                    <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{fmt(a.ordered)}</td>
                    <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: a.prev > 0 ? '#b45309' : '#94a3b8' }}>{a.prev > 0 ? fmt(a.prev) : '—'}</td>
                    <td style={{ ...TD, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700,
                        color: a.remaining <= 0 ? '#16a34a' : '#1e3a5f' }}>{a.remaining <= 0 ? <span title="Fully received">✓ Done</span> : fmt(a.remaining)}</td>
                    <td style={{ ...TD, color: '#475569' }}>{f.uomName || '—'}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{a.priceSame ? (f.unitPrice != null ? fmt(f.unitPrice) : '—') : <span style={{ fontSize: 10, fontStyle: 'italic', color: '#94a3b8' }}>mixed</span>}</td>
                    <td style={{ ...TD, textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                        <span style={{ fontWeight: 600 }}>{fmt(a.selQty)}</span>
                        <span style={{ fontSize: 9.5, color: '#94a3b8', marginLeft: 3 }}>total</span>
                    </td>
                </tr>
                {isOpen && g.lines.map(l => renderLineRow(l, true))}
            </React.Fragment>
        );
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
            zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
            onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
            onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget) onClose(); }}>
            <div style={{
                background: '#fff', borderRadius: 10, width: 900, maxWidth: '96vw',
                maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,.2)'
            }}>
                {/* Header */}
                <div style={{ background: '#0f766e', padding: '16px 20px', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Import from PO Lines</div>
                        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11.5, marginTop: 2 }}>
                            {grn.poNumber ? `PO: ${grn.poNumber}` : ''} — Select lines and enter received quantities
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {linesLoading ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading PO lines…</div>
                    ) : !grn.poId ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                            This GRN is not linked to a Purchase Order. Cannot import lines.
                        </div>
                    ) : poLines.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                            No lines found in the linked PO.
                        </div>
                    ) : (
                        <>
                        <div style={{ padding: '8px 12px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <input
                                type="text"
                                placeholder="Search item code or description…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                style={{ flex: 1, padding: '5px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 12, outline: 'none' }}
                                autoFocus
                            />
                            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>✕</button>}
                            {search && <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{displayLines.length} of {poLines.length}</span>}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead>
                                <tr style={{ background: '#eef2f8' }}>
                                    <th style={{ padding: '8px 10px', width: 36, textAlign: 'center', borderBottom: '1px solid #d4dce9' }}>
                                        <input type="checkbox" checked={allChecked} onChange={toggleAll}
                                            style={{ cursor: 'pointer', accentColor: '#0f766e' }} />
                                    </th>
                                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9' }}>#</th>
                                    <th onClick={() => cycleSort('code')} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: sortKey === 'code' ? '#0f766e' : '#3a5070', background: sortKey === 'code' ? '#ecfdf5' : undefined }}>Item Code{sortIcon('code')}</th>
                                    <th onClick={() => cycleSort('name')} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', color: sortKey === 'name' ? '#0f766e' : '#3a5070', background: sortKey === 'name' ? '#ecfdf5' : undefined }}>Description{sortIcon('name')}</th>
                                    {['Ordered','Prev. Rcvd','Remaining'].map(h => (
                                        <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9' }}>{h}</th>
                                    ))}
                                    {['UOM'].map(h => (
                                        <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9' }}>{h}</th>
                                    ))}
                                    {['Unit Price','Rcv. Qty ✎'].map(h => (
                                        <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9' }}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {displayLines.length === 0 ? (
                                    <tr><td colSpan={10} style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No items match your search.</td></tr>
                                ) : groupedLines.map(g => (
                                    g.lines.length === 1 ? renderLineRow(g.lines[0]) : renderMergedRow(g)
                                ))}
                            </tbody>
                        </table>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', background: '#f4f7fb', borderTop: '1px solid #d4dce9', borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        {selCount} of {poLines.length} lines selected
                    </div>
                    {error && (
                        <div style={{ color: '#dc2626', fontSize: 12, fontWeight: 500, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, padding: '8px 12px' }}>
                            {error.split('\n').map((line, i) => <div key={i}>{line}</div>)}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={onClose} style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', padding: '7px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer' }}>
                            Cancel
                        </button>
                        <button onClick={doImport} disabled={importing || selCount === 0}
                            style={{ background: '#0f766e', color: '#fff', border: 'none', padding: '7px 20px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: (importing || selCount === 0) ? .6 : 1 }}>
                            {importing ? 'Importing…' : `Import ${selCount || ''} Lines`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── GRN Lines Tab ─────────────────────────────────────────────────
const GrnLinesTab = ({ grn, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { lookups, getStatusConfig, getVList } = useLookup();
    const { isReq } = useFieldConfig('GRN_LINE');
    const { items: itemLookup, uoms } = lookups;

    const [lines,      setLines]      = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [showForm,   setShowForm]   = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [editLine,   setEditLine]   = useState(null);
    const [form,       setForm]       = useState({});
    const [saving,     setSaving]     = useState(false);
    const [deleting,   setDeleting]   = useState(null);
    const [error,      setError]      = useState('');
    const [lineSortKey, setLineSortKey] = useState('');
    const [lineSortDir, setLineSortDir] = useState('asc');

    const { canDo } = usePermission();
    const canEdit = (getStatusConfig('GRN', grn.status)?.canEdit ?? (grn.status === 'Draft')) && canDo('/grn', 'EDIT');
    const hasLinkedPO = !!grn.poId;

    const loadLines = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}grn/lines/${grn.grnId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [grn.grnId]);

    useEffect(() => { loadLines(); }, [loadLines]);

    const openEdit = (line) => {
        setEditLine(line);
        setForm({
            grnDetailId:     line.grnDetailId,
            poLineId:        line.poLineId   ? String(line.poLineId)  : '',
            prLineId:        line.prLineId   ? String(line.prLineId)  : '',
            itemId:          line.itemId     ? String(line.itemId)    : '',
            itemCode:        line.itemCode   || '',
            itemDesc:        line.itemDesc   || '',
            receivedQty:     line.receivedQty  != null ? String(line.receivedQty)  : '',
            rejectedQty:     line.rejectedQty  != null ? String(line.rejectedQty)  : '0',
            uomId:           line.uomId      ? String(line.uomId)    : '',
            uomName:         line.uomName    || '',
            unitPrice:       line.unitPrice  != null ? String(line.unitPrice)  : '',
            taxPct:          line.taxPct     != null ? String(line.taxPct)     : '0',
            batchNo:         line.batchNo    || '',
            serialNo:        line.serialNo   || '',
            expiryDate:      line.expiryDate ? line.expiryDate.slice(0, 10) : '',
            storageLocation: line.storageLocation || '',
            binLocation:     line.binLocation     || '',
            qcStatus:        line.qcStatus        || '',
            qcRemarks:       line.qcRemarks       || '',
            remarks:         line.remarks         || '',
        });
        setError('');
        setShowForm(true);
    };

    const handle = e => {
        const { name, value } = e.target;
        setForm(p => ({ ...p, [name]: value }));
        if (name === 'itemId' && value) {
            const found = (itemLookup || []).find(i => String(i.id) === value);
            if (found) setForm(p => ({ ...p, itemId: value, itemCode: found.code || '', itemDesc: found.name || '' }));
        }
        if (name === 'uomId' && value) {
            const found = (uoms || []).find(u => String(u.id) === value);
            if (found) setForm(p => ({ ...p, uomId: value, uomName: found.name || '' }));
        }
    };

    const acceptedQty      = () => Math.max(0, (Number(form.receivedQty) || 0) - (Number(form.rejectedQty) || 0));
    const lineTotal        = () => acceptedQty() * (Number(form.unitPrice) || 0);
    const lineTotalWithTax = () => lineTotal() * (1 + (Number(form.taxPct) || 0) / 100);

    const save = () => {
        if (!form.itemDesc.trim())                                      { setError('Item description is required.'); return; }
        if (!form.receivedQty || isNaN(Number(form.receivedQty)))       { setError('Received quantity must be a number.'); return; }
        if (Number(form.receivedQty) <= 0)                              { setError('Received quantity must be greater than 0.'); return; }
        if (editLine?.orderedQty > 0 && Number(form.receivedQty) > editLine.orderedQty) {
            setError(`Received qty (${Number(form.receivedQty)}) cannot exceed ordered qty (${editLine.orderedQty}).`);
            return;
        }
        if (Number(form.rejectedQty) > Number(form.receivedQty))        { setError('Rejected qty cannot exceed received qty.'); return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}grn/lines/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                grnDetailId:     form.grnDetailId || 0,
                grnId:           grn.grnId,
                poLineId:        form.poLineId     ? Number(form.poLineId)  : null,
                prLineId:        form.prLineId     ? Number(form.prLineId)  : null,
                itemId:          form.itemId       ? Number(form.itemId)    : null,
                itemCode:        form.itemCode     || null,
                itemDesc:        form.itemDesc.trim(),
                orderedQty:      editLine?.orderedQty || 0,
                receivedQty:     Number(form.receivedQty) || 0,
                rejectedQty:     Number(form.rejectedQty) || 0,
                uomId:           form.uomId        ? Number(form.uomId)    : null,
                uomName:         form.uomName      || null,
                unitPrice:       Number(form.unitPrice) || 0,
                taxPct:          Number(form.taxPct)    || 0,
                batchNo:         form.batchNo.trim()         || null,
                serialNo:        form.serialNo.trim()        || null,
                expiryDate:      form.expiryDate             || null,
                storageLocation: form.storageLocation.trim() || null,
                binLocation:     form.binLocation.trim()     || null,
                qcStatus:        form.qcStatus               || null,
                qcRemarks:       form.qcRemarks.trim()       || null,
                remarks:         form.remarks.trim()         || null,
                createdBy:       currentUser,
                modifiedBy:      form.grnDetailId ? currentUser : null,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error.'); return; }
                setShowForm(false);
                loadLines();
                onRefresh();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    const deleteLine = async (lineId) => {
        if (!window.confirm('Delete this line? This will reverse the received quantity on the PO.')) return;
        setDeleting(lineId);
        try {
            const res = await fetch(`${variables.API_URL}grn/lines/${lineId}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) { const d = await res.json(); setError(d?.message || 'Failed to delete line.'); return; }
            loadLines(); onRefresh();
        } catch { setError('Network error. Please try again.'); }
        finally { setDeleting(null); }
    };

    const handleImported = () => { setShowImport(false); loadLines(); onRefresh(); };

    const grandTotal        = lines.reduce((s, l) => s + (l.lineTotal || 0), 0);
    const grandTotalWithTax = lines.reduce((s, l) => s + (l.lineTotalWithTax || 0), 0);

    // Lines whose UOM differs from the item's base UOM but have no conversion
    // defined — these will block the GRN from being received until fixed.
    const missingConvLines = lines.filter(l => l.conversionMissing);

    const cycleLineSort = (key) => {
        if (lineSortKey === key) setLineSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setLineSortKey(key); setLineSortDir('asc'); }
    };
    const sortedLines = React.useMemo(() => {
        if (!lineSortKey) return lines;
        return [...lines].sort((a, b) => {
            const va = (lineSortKey === 'code' ? a.itemCode : a.itemDesc) || '';
            const vb = (lineSortKey === 'code' ? b.itemCode : b.itemDesc) || '';
            return lineSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        });
    }, [lines, lineSortKey, lineSortDir]);
    const lineSortIcon = (key) => lineSortKey === key ? (lineSortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

    const qcColor = (s) => {
        if (!s) return { bg: '#f1f5f9', color: '#475569' };
        if (s === 'Passed')  return { bg: '#dcfce7', color: '#166534' };
        if (s === 'Failed')  return { bg: '#fee2e2', color: '#991b1b' };
        if (s === 'Partial') return { bg: '#fef3c7', color: '#92400e' };
        return { bg: '#f1f5f9', color: '#475569' };
    };

    return (
        <div>
            {showImport && (
                <PoImportModal grn={grn} onClose={() => setShowImport(false)} onImported={handleImported} />
            )}

            <div className="prd-lines-wrap">
                <div className="prd-lines-header">
                    <span className="prd-lines-title">Lines ({lines.length})</span>
                    {canEdit && hasLinkedPO && (
                        <button className="prd-add-btn" style={{ background: '#0f766e' }}
                            onClick={() => setShowImport(true)}
                            title="Import lines from the linked Purchase Order">
                            📋 Import from PO
                        </button>
                    )}
                </div>

                {canEdit && hasLinkedPO && lines.length === 0 && (
                    <div style={{ padding: '10px 14px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', fontSize: 12, color: '#166534' }}>
                        💡 Click <strong>📋 Import from PO</strong> to auto-populate lines from the purchase order.
                    </div>
                )}

                {missingConvLines.length > 0 && (
                    <div style={{ padding: '10px 14px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontSize: 12, color: '#991b1b' }}>
                        ⚠️ <strong>{missingConvLines.length} line(s) cannot be received yet.</strong> The purchase UOM differs from the item's stock (base) UOM, but no conversion is defined.
                        Set it up in <strong>Item master &gt; UOM Conversions</strong> for: {missingConvLines.map(l => l.itemCode || l.itemDesc).join(', ')}.
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
                                        <th onClick={() => cycleLineSort('code')} style={{ cursor: 'pointer', userSelect: 'none', color: lineSortKey === 'code' ? '#0f766e' : undefined, background: lineSortKey === 'code' ? '#ecfdf5' : undefined, whiteSpace: 'nowrap' }}>Item Code{lineSortIcon('code')}</th>
                                        <th onClick={() => cycleLineSort('name')} style={{ cursor: 'pointer', userSelect: 'none', color: lineSortKey === 'name' ? '#0f766e' : undefined, background: lineSortKey === 'name' ? '#ecfdf5' : undefined, whiteSpace: 'nowrap' }}>Description{lineSortIcon('name')}</th>
                                        <th style={{ textAlign: 'right' }}>Ordered</th>
                                        <th style={{ textAlign: 'right' }}>Received</th>
                                        <th style={{ textAlign: 'right' }}>Rejected</th>
                                        <th style={{ textAlign: 'right' }}>Accepted</th>
                                        <th>UOM</th>
                                        <th style={{ textAlign: 'right' }}>Unit Price</th>
                                        <th style={{ textAlign: 'right' }}>Tax %</th>
                                        <th style={{ textAlign: 'right' }}>Line Total</th>
                                        <th style={{ textAlign: 'right' }}>w/ Tax</th>
                                        <th>QC</th>
                                        <th>Batch / Serial</th>
                                        {canEdit && <th>Actions</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.length === 0 ? (
                                        <tr><td colSpan={canEdit ? 15 : 14} className="prd-lines-empty">
                                            {hasLinkedPO ? 'No lines yet. Click "📋 Import from PO" to populate lines from the purchase order.' : 'No lines yet. Link this GRN to a PO (Overview tab) to enable line import.'}
                                        </td></tr>
                                    ) : sortedLines.map(l => {
                                        const qc = qcColor(l.qcStatus);
                                        return (
                                            <tr key={l.grnDetailId}>
                                                <td><span className="prd-line-num">{l.lineNum}</span></td>
                                                <td>
                                                    <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>
                                                        {l.itemCode || '—'}
                                                    </span>
                                                </td>
                                                <td>{l.itemDesc}</td>
                                                <td className="prd-num-cell" style={{ color: '#64748b' }}>{fmt(l.orderedQty)}</td>
                                                <td className="prd-num-cell" style={{ color: '#1e40af', fontWeight: 500 }}>{fmt(l.receivedQty)}</td>
                                                <td className="prd-num-cell" style={{ color: l.rejectedQty > 0 ? '#dc2626' : '#94a3b8' }}>{fmt(l.rejectedQty)}</td>
                                                <td className="prd-num-cell" style={{ color: '#065f46', fontWeight: 600 }}>
                                                    {fmt(l.acceptedQty)}
                                                    {l.conversionFactor > 1 && (
                                                        <div style={{ fontSize: 10, color: '#64748b', fontWeight: 400, marginTop: 2, whiteSpace: 'nowrap' }}>
                                                            = {fmt(l.stockQty)} {l.baseUomCode}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    {l.uomName || '—'}
                                                    {l.conversionMissing && (
                                                        <div style={{ fontSize: 10, color: '#b91c1c', fontWeight: 600, marginTop: 2, whiteSpace: 'nowrap' }}
                                                            title={`No conversion from ${l.uomName} to base UOM ${l.baseUomCode || ''}. Define it in Item master > UOM Conversions.`}>
                                                            ⚠ no conv. to {l.baseUomCode || 'base'}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="prd-num-cell">{fmt(l.unitPrice)}</td>
                                                <td className="prd-num-cell">{l.taxPct ? `${l.taxPct}%` : '—'}</td>
                                                <td className="prd-num-cell" style={{ fontWeight: 500 }}>{fmt(l.lineTotal)}</td>
                                                <td className="prd-num-cell" style={{ fontWeight: 500, color: '#1e40af' }}>{fmt(l.lineTotalWithTax)}</td>
                                                <td>
                                                    <span style={{ background: qc.bg, color: qc.color, padding: '2px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                        {l.qcStatus || '—'}
                                                    </span>
                                                </td>
                                                <td style={{ fontSize: 11, color: '#64748b' }}>
                                                    {l.batchNo  && <div>Batch: <strong>{l.batchNo}</strong></div>}
                                                    {l.serialNo && <div>S/N: <strong>{l.serialNo}</strong></div>}
                                                    {l.expiryDate && <div>Exp: {fmtDate(l.expiryDate)}</div>}
                                                    {!l.batchNo && !l.serialNo && !l.expiryDate && <span style={{ color: '#cbd5e1' }}>—</span>}
                                                </td>
                                                {canEdit && (
                                                    <td>
                                                        <button className="prd-line-act" onClick={() => openEdit(l)}>Edit</button>
                                                        <button className="prd-line-act prd-line-del" onClick={() => deleteLine(l.grnDetailId)} disabled={deleting === l.grnDetailId}>Del</button>
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                {lines.length > 0 && (
                                    <tfoot>
                                        <tr style={{ background: '#f4f7fb', fontWeight: 600 }}>
                                            <td colSpan={10} style={{ textAlign: 'right', fontSize: 11, color: '#3a5070', padding: '8px 10px', textTransform: 'uppercase', letterSpacing: '.3px' }}>Total</td>
                                            <td className="prd-num-cell" style={{ fontWeight: 700, color: '#1e3a5f' }}>{fmt(grandTotal)}</td>
                                            <td className="prd-num-cell" style={{ fontWeight: 700, color: '#1e40af' }}>{fmt(grandTotalWithTax)}</td>
                                            <td /><td />{canEdit && <td />}
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>

                        {showForm && (
                            <div className="prd-line-form">
                                <div className="prd-line-form-title">Edit Line</div>
                                {error && <div className="pf-err" style={{ marginBottom: 8 }}>{error}</div>}

                                {/* Item */}
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field">
                                        <label>Item</label>
                                        {form.grnDetailId > 0 ? (
                                            <input className="prd-lf-input"
                                                value={form.itemCode ? `[${form.itemCode}]` : '—'}
                                                readOnly
                                                style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                                title="Item cannot be changed on an existing GRN line" />
                                        ) : (
                                            <select className="prd-lf-input" name="itemId" value={form.itemId} onChange={handle}>
                                                <option value="">— Select Item —</option>
                                                {(itemLookup || []).map(i => <option key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.name}</option>)}
                                            </select>
                                        )}
                                    </div>
                                    <div className="prd-lf-field prd-lf-f2">
                                        <label>Description {isReq('itemDesc') && <span className="req">*</span>}</label>
                                        {form.grnDetailId > 0 ? (
                                            <input className="prd-lf-input"
                                                value={form.itemDesc}
                                                readOnly
                                                style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                                title="Item cannot be changed on an existing GRN line" />
                                        ) : (
                                            <input className="prd-lf-input" type="text" name="itemDesc" value={form.itemDesc} onChange={handle} placeholder="Item description" />
                                        )}
                                    </div>
                                </div>

                                {/* Quantities */}
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field">
                                        <label>
                                            Received Qty {isReq('receivedQty') && <span className="req">*</span>}
                                            {editLine?.orderedQty > 0 && (
                                                <span style={{ marginLeft: 6, fontSize: 10, color: '#b45309', fontWeight: 400 }}>
                                                    (max {editLine.orderedQty} — ordered)
                                                </span>
                                            )}
                                        </label>
                                        <input className="prd-lf-input" type="number" name="receivedQty" value={form.receivedQty} onChange={handle} min="0.01" step="0.01"
                                            max={editLine?.orderedQty > 0 ? editLine.orderedQty : undefined} />
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>Rejected Qty</label>
                                        <input className="prd-lf-input" type="number" name="rejectedQty" value={form.rejectedQty} onChange={handle} min="0" step="0.01" />
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>UOM</label>
                                        {form.grnDetailId > 0 ? (
                                            <input className="prd-lf-input"
                                                value={form.uomName || '—'}
                                                readOnly
                                                style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                                title="UOM follows the purchase order line and cannot be changed. Stock is converted to the item's base UOM at posting." />
                                        ) : (
                                            <select className="prd-lf-input" name="uomId" value={form.uomId} onChange={handle}>
                                                <option value="">— UOM —</option>
                                                {(uoms || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                            </select>
                                        )}
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>Unit Price</label>
                                        <AmountInput className="prd-lf-input" value={form.unitPrice} onChange={v => handle({ target: { name: 'unitPrice', value: v } })} />
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>Tax %</label>
                                        <select className="prd-lf-input" name="taxPct" value={form.taxPct} onChange={handle}>
                                            {getVList('Tax', 'VATRate').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                    </div>
                                </div>

                                {/* Traceability */}
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field">
                                        <label>Batch No</label>
                                        <input className="prd-lf-input" type="text" name="batchNo" value={form.batchNo} onChange={handle} placeholder="Batch / lot #" />
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>Serial No</label>
                                        <input className="prd-lf-input" type="text" name="serialNo" value={form.serialNo} onChange={handle} placeholder="Serial #" />
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>Expiry Date</label>
                                        <input className="prd-lf-input" type="date" name="expiryDate" value={form.expiryDate} onChange={handle} />
                                    </div>
                                </div>

                                {/* Storage */}
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field">
                                        <label>Storage Location</label>
                                        <input className="prd-lf-input" type="text" name="storageLocation" value={form.storageLocation} onChange={handle} placeholder="Warehouse zone" />
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>Bin Location</label>
                                        <input className="prd-lf-input" type="text" name="binLocation" value={form.binLocation} onChange={handle} placeholder="Shelf / bin #" />
                                    </div>
                                </div>

                                {/* QC */}
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field">
                                        <label>QC Status</label>
                                        <select className="prd-lf-input" name="qcStatus" value={form.qcStatus} onChange={handle}>
                                            <option value="">— Not set —</option>
                                            {QC_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                                        </select>
                                    </div>
                                    <div className="prd-lf-field prd-lf-f2">
                                        <label>QC Remarks</label>
                                        <input className="prd-lf-input" type="text" name="qcRemarks" value={form.qcRemarks} onChange={handle} placeholder="Quality control notes…" />
                                    </div>
                                </div>

                                {/* Remarks + Preview */}
                                <div className="prd-lf-row" style={{ alignItems: 'center' }}>
                                    <div className="prd-lf-field prd-lf-f2">
                                        <label>Remarks</label>
                                        <input className="prd-lf-input" type="text" name="remarks" value={form.remarks} onChange={handle} placeholder="Optional…" />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 8px', minWidth: 200 }}>
                                        <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>Preview Total</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>
                                            {fmt(lineTotalWithTax())} <span style={{ fontSize: 10, color: '#64748b' }}>(incl. tax)</span>
                                        </span>
                                        <span style={{ fontSize: 11, color: '#065f46', marginTop: 2 }}>
                                            Accepted: {fmt(acceptedQty())} {form.uomName || ''}
                                            {editLine?.conversionFactor > 1 && (
                                                <span style={{ color: '#64748b', marginLeft: 4 }}>
                                                    = {fmt(acceptedQty() * (editLine.conversionFactor || 1))} {editLine.baseUomCode}
                                                </span>
                                            )}
                                        </span>
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

export default GrnLinesTab;
