import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmt, fmtDate } from '../../procurementConstants';
import { useFieldConfig } from '../../../FieldConfigContext';

// ── Confirm Modal (delete / close / cancel line) ─────────────────
const ConfirmModal = ({ title, titleColor = '#dc2626', icon = '🗑', detail, warning, error, confirmLabel, confirmColor = '#dc2626', onConfirm, onCancel, busy }) =>
    ReactDOM.createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
             onMouseDown={e => { e.currentTarget.dataset.md = e.target === e.currentTarget ? '1' : '0'; }}
             onClick={e => { if (e.currentTarget.dataset.md === '1' && e.target === e.currentTarget && !busy) onCancel(); }}>
            <div style={{ background: '#fff', borderRadius: 10, width: 440, maxWidth: '94vw', boxShadow: '0 16px 48px rgba(0,0,0,.22)', overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ background: titleColor, padding: '13px 20px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 17 }}>{icon}</span>
                    <span style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{title}</span>
                </div>
                <div style={{ padding: '18px 20px' }}>
                    {/* Line detail card */}
                    {detail && (
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '10px 14px', marginBottom: 14, fontSize: 12 }}>
                            <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: 3 }}>{detail.itemDesc}</div>
                            {detail.itemCode && <div style={{ color: '#64748b' }}>Code: <span style={{ fontFamily: 'Courier New', color: '#2e5fa3', background: '#dbeafe', padding: '0 4px', borderRadius: 3 }}>{detail.itemCode}</span></div>}
                            <div style={{ color: '#64748b', marginTop: 2 }}>Qty: <strong>{detail.requiredQty}</strong> {detail.uomName || ''}</div>
                            {detail.lineStatus && <div style={{ color: '#64748b', marginTop: 2 }}>Status: {detail.lineStatus}</div>}
                        </div>
                    )}
                    {/* PO warning */}
                    {warning && (
                        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 7, padding: '9px 13px', marginBottom: 14, fontSize: 12, color: '#92400e', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                            <span style={{ flexShrink: 0, marginTop: 1 }}>⚠️</span>
                            <span>{warning}</span>
                        </div>
                    )}
                    {/* Backend error (shown after failed attempt) */}
                    {error && (
                        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '9px 13px', marginBottom: 14, fontSize: 12, color: '#dc2626', display: 'flex', gap: 7, alignItems: 'flex-start' }}>
                            <span style={{ flexShrink: 0, marginTop: 1 }}>❌</span>
                            <span>{error}</span>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                        <button onClick={onCancel} disabled={busy}
                            style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f1f5f9', color: '#475569', fontSize: 13, cursor: 'pointer' }}>
                            Cancel
                        </button>
                        <button onClick={onConfirm} disabled={busy}
                            style={{ padding: '7px 20px', borderRadius: 6, border: 'none', background: confirmColor, color: '#fff', fontSize: 13, fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? .7 : 1 }}>
                            {busy ? 'Please wait…' : confirmLabel}
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );

// ── BOM Import Modal ──────────────────────────────────────────────
const BomImportModal = ({ pr, onClose, onImported }) => {
    const currentUser = useCurrentUser();
    const [bomLines,  setBomLines]  = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [selected,  setSelected]  = useState({});   // bomDetailId → bool
    const [qtys,      setQtys]      = useState({});   // bomDetailId → qty string (editable)
    const [importing, setImporting] = useState(false);
    const [error,     setError]     = useState('');
    const [search,    setSearch]    = useState('');
    const [sortKey,   setSortKey]   = useState('');
    const [sortDir,   setSortDir]   = useState('asc');

    useEffect(() => {
        setLoading(true);
        fetch(`${variables.API_URL}purchaserequest/bommaterials/${encodeURIComponent(pr.jobId)}?prId=${pr.prId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const rows = Array.isArray(d) ? d : [];
                setBomLines(rows);
                // Pre-select lines not already added; pre-fill editable qty
                const sel = {};
                const qMap = {};
                rows.forEach(r => {
                    if (!r.alreadyAdded) {
                        sel[r.bomDetailId]  = true;
                        qMap[r.bomDetailId] = String(r.remainingQty > 0 ? r.remainingQty : r.plannedQty);
                    }
                });
                setSelected(sel);
                setQtys(qMap);
            })
            .catch(() => setError('Failed to load BOM materials.'))
            .finally(() => setLoading(false));
    }, [pr.jobId, pr.prId]);

    const cycleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };

    const displayLines = React.useMemo(() => {
        let rows = bomLines;
        if (search.trim()) {
            const q = search.toLowerCase();
            rows = rows.filter(b =>
                (b.componentItemCode || '').toLowerCase().includes(q) ||
                (b.componentItemName || '').toLowerCase().includes(q)
            );
        }
        if (sortKey) {
            rows = [...rows].sort((a, b) => {
                const va = (sortKey === 'code' ? a.componentItemCode : a.componentItemName) || '';
                const vb = (sortKey === 'code' ? b.componentItemCode : b.componentItemName) || '';
                return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
            });
        }
        return rows;
    }, [bomLines, search, sortKey, sortDir]);

    const toggle = (id) => setSelected(p => ({ ...p, [id]: !p[id] }));
    const toggleAll = () => {
        const eligible = displayLines.filter(b => !b.alreadyAdded);
        const allOn    = eligible.every(b => selected[b.bomDetailId]);
        const next = {};
        eligible.forEach(b => { next[b.bomDetailId] = !allOn; });
        setSelected(p => ({ ...p, ...next }));
    };

    const setQty = (id, val) => setQtys(p => ({ ...p, [id]: val }));

    const doImport = async () => {
        const toImport = bomLines.filter(b => selected[b.bomDetailId] && !b.alreadyAdded);
        if (toImport.length === 0) { setError('No new lines selected.'); return; }

        // Validate all editable qtys are positive and within BOM balance
        for (const b of toImport) {
            const q      = Number(qtys[b.bomDetailId]);
            const maxQty = b.remainingQty > 0 ? b.remainingQty : b.plannedQty;
            if (!q || q <= 0) {
                setError(`Enter a valid quantity for "${b.componentItemName || b.componentItemCode}".`);
                return;
            }
            if (q > maxQty) {
                setError(`Quantity for "${b.componentItemName || b.componentItemCode}" (${q}) exceeds BOM balance (${maxQty}).`);
                return;
            }
        }

        setImporting(true); setError('');
        const errors = [];
        let succeeded = 0;
        try {
            for (const b of toImport) {
                const r = await fetch(`${variables.API_URL}purchaserequest/lines/save`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({
                        prLineId:      0,
                        prId:          pr.prId,
                        itemId:        b.componentItemId   || null,
                        itemCode:      b.componentItemCode || null,
                        itemDesc:      b.componentItemName || b.componentItemCode || 'Item',
                        requiredQty:   Number(qtys[b.bomDetailId]),
                        uomId:         b.uomId   || null,
                        uomName:       b.uomName || null,
                        requiredDate:  null,
                        estUnitPrice:  b.unitPrice || null,
                        remarks:       b.remarks || null,
                        bomDetailId:   b.bomDetailId,
                        createdBy:     currentUser,
                        modifiedBy:    null,
                    })
                });
                if (r.ok) {
                    succeeded++;
                } else {
                    const d = await r.json().catch(() => ({}));
                    errors.push(`${b.componentItemCode || b.componentItemName}: ${d?.message || 'Save failed.'}`);
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

    const eligible      = bomLines.filter(b => !b.alreadyAdded);
    const visibleElig   = displayLines.filter(b => !b.alreadyAdded);
    const allChecked    = visibleElig.length > 0 && visibleElig.every(b => selected[b.bomDetailId]);
    const sortIcon      = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
    const SortTH        = ({ children, colKey, align = 'left' }) => (
        <th onClick={() => cycleSort(colKey)} style={{
            padding: '8px 10px', textAlign: align, fontWeight: 600, color: sortKey === colKey ? '#1e40af' : '#3a5070',
            textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9',
            cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
            background: sortKey === colKey ? '#e8f0fe' : undefined,
        }}>
            {children}{sortIcon(colKey)}
        </th>
    );

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)',
            zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }} onClick={e => e.target === e.currentTarget && onClose()}>
            <div style={{
                background: '#fff', borderRadius: 10, width: 880, maxWidth: '95vw',
                maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,.2)'
            }}>
                {/* Header */}
                <div style={{ background: '#2e5fa3', padding: '16px 20px', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Import from BOM</div>
                        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11.5, marginTop: 2 }}>
                            Job: {pr.jobNumber || pr.jobId} — select lines to add as PR items
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: 'auto', padding: 0 }}>
                    {loading ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading BOM materials…</div>
                    ) : bomLines.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                            No BOM materials found for this job.
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
                            {search && (
                                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>✕</button>
                            )}
                            {search && <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{displayLines.length} of {bomLines.length}</span>}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead>
                                <tr style={{ background: '#eef2f8' }}>
                                    <th style={{ padding: '8px 10px', width: 36, textAlign: 'center', borderBottom: '1px solid #d4dce9' }}>
                                        <input type="checkbox" checked={allChecked}
                                            onChange={toggleAll}
                                            style={{ cursor: 'pointer', accentColor: '#2e5fa3' }} />
                                    </th>
                                    <SortTH colKey="code">Item Code</SortTH>
                                    <SortTH colKey="name">Description</SortTH>
                                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9' }}>BOM Qty</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9' }}>Requested</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9' }}>Balance</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#1e40af', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9', background: '#eff6ff' }}>PR Qty ✎</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9' }}>UOM</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9' }}>Unit Price</th>
                                    <th style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#3a5070', textTransform: 'uppercase', fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {displayLines.length === 0 ? (
                                    <tr><td colSpan={10} style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No items match your search.</td></tr>
                                ) : displayLines.map(b => {
                                    const isAdded   = !!b.alreadyAdded;
                                    const isChecked = !!selected[b.bomDetailId];
                                    return (
                                        <tr key={b.bomDetailId}
                                            style={{ background: isAdded ? '#f8fffe' : (isChecked ? '#f0f7ff' : '#fff'), cursor: isAdded ? 'default' : 'pointer' }}
                                            onClick={() => !isAdded && toggle(b.bomDetailId)}>
                                            <td style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #f0f4f8' }}>
                                                {isAdded ? (
                                                    <span title="Already in this PR" style={{ color: '#16a34a', fontSize: 14 }}>✓</span>
                                                ) : (
                                                    <input type="checkbox" checked={isChecked}
                                                        onChange={() => toggle(b.bomDetailId)}
                                                        onClick={e => e.stopPropagation()}
                                                        style={{ cursor: 'pointer', accentColor: '#2e5fa3' }} />
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8' }}>
                                                <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>
                                                    {b.componentItemCode || '—'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8', color: isAdded ? '#64748b' : '#1e3a5f' }}>
                                                {b.componentItemName}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', fontVariantNumeric: 'tabular-nums' }}>{fmt(b.plannedQty)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', fontVariantNumeric: 'tabular-nums', color: '#64748b' }}>{fmt(b.issuedQty)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: b.remainingQty > 0 ? '#1e40af' : '#94a3b8' }}>
                                                {fmt(b.remainingQty)}
                                            </td>
                                            {/* ── Editable PR Qty ── */}
                                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f4f8', background: isAdded ? 'transparent' : (isChecked ? '#eff6ff' : '#f8fafc') }}
                                                onClick={e => e.stopPropagation()}>
                                                {isAdded ? (
                                                    <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                                                ) : (
                                                    <input
                                                        type="number"
                                                        min="0.0001"
                                                        max={b.remainingQty > 0 ? b.remainingQty : b.plannedQty}
                                                        step="any"
                                                        value={qtys[b.bomDetailId] ?? ''}
                                                        disabled={!isChecked}
                                                        onChange={e => setQty(b.bomDetailId, e.target.value)}
                                                        style={{
                                                            width: 80, padding: '4px 6px',
                                                            border: `1px solid ${isChecked ? '#93c5fd' : '#e2e8f0'}`,
                                                            borderRadius: 5, fontSize: 12,
                                                            textAlign: 'right',
                                                            background: isChecked ? '#fff' : '#f1f5f9',
                                                            color: isChecked ? '#1e3a5f' : '#94a3b8',
                                                            outline: 'none',
                                                        }}
                                                    />
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8', color: '#475569' }}>{b.uomName || b.uomCode || '—'}</td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: b.unitPrice ? '#1e293b' : '#94a3b8' }}>
                                                {b.unitPrice ? fmt(b.unitPrice) : '—'}
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8' }}>
                                                {isAdded
                                                    ? <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>In PR</span>
                                                    : <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 8, fontSize: 10 }}>{b.status || 'Planned'}</span>
                                                }
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div style={{ padding: '12px 20px', background: '#f4f7fb', borderTop: '1px solid #d4dce9', borderRadius: '0 0 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontSize: 12, color: '#64748b' }}>
                        {eligible.length > 0
                            ? `${Object.values(selected).filter(Boolean).length} of ${eligible.length} lines selected`
                            : 'All BOM lines already added to this PR'
                        }
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
                        <button onClick={doImport} disabled={importing || eligible.length === 0}
                            style={{ background: '#2e5fa3', color: '#fff', border: 'none', padding: '7px 20px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', opacity: (importing || eligible.length === 0) ? .6 : 1 }}>
                            {importing ? 'Importing…' : `Import ${Object.values(selected).filter(Boolean).length || ''} Lines`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── PR Lines Tab ──────────────────────────────────────────────────
const PrLinesTab = ({ pr, onRefresh }) => {
    const currentUser = useCurrentUser();
    const { lookups, getStatusConfig } = useLookup();
    const { isReq } = useFieldConfig('PR_LINE');
    const { items: itemLookup, uoms } = lookups;

    const [lines,      setLines]      = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [showForm,   setShowForm]   = useState(false);
    const [showImport, setShowImport] = useState(false);
    const [, setEditLine]   = useState(null);
    const [form,       setForm]       = useState({});
    const [saving,     setSaving]     = useState(false);
    const [error,      setError]      = useState('');
    const [sortKey,    setSortKey]    = useState('');
    const [sortDir,    setSortDir]    = useState('asc');

    // ── confirm-modal state ───────────────────────────────────────
    const [confirmDel,    setConfirmDel]    = useState(null);  // line object | null
    const [confirmStatus, setConfirmStatus] = useState(null);  // { line, newStatus } | null
    const [modalBusy,     setModalBusy]     = useState(false);
    const [modalError,    setModalError]    = useState('');

    const { canDo } = usePermission();
    const canEdit = (getStatusConfig('PR', pr.status)?.canEdit ?? (pr.status === 'Draft')) && canDo('/purchase-requests', 'EDIT');
    const hasJob  = !!pr.jobId;

    const loadLines = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}purchaserequest/lines/${pr.prId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [pr.prId]);

    useEffect(() => { loadLines(); }, [loadLines]);

    const openEdit = (line) => {
        setEditLine(line);
        setForm({
            prLineId:     line.prLineId,
            bomDetailId:  line.bomDetailId || null,
            itemId:       line.itemId ? String(line.itemId) : '',
            itemCode:     line.itemCode || '',
            itemDesc:     line.itemDesc || '',
            requiredQty:  line.requiredQty != null ? String(line.requiredQty) : '',
            uomId:        line.uomId ? String(line.uomId) : '',
            uomName:      line.uomName || '',
            requiredDate: line.requiredDate ? line.requiredDate.slice(0, 10) : '',
            estUnitPrice: line.estUnitPrice != null ? String(line.estUnitPrice) : '',
            remarks:      line.remarks || '',
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

    const save = () => {
        if (!form.itemDesc.trim()) { setError('Item description is required.'); return; }
        if (!form.requiredQty || isNaN(Number(form.requiredQty))) { setError('Required quantity must be a number.'); return; }
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}purchaserequest/lines/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                prLineId:     form.prLineId || 0,
                prId:         pr.prId,
                itemId:       form.itemId    ? Number(form.itemId)  : null,
                itemCode:     form.itemCode  || null,
                itemDesc:     form.itemDesc.trim(),
                requiredQty:  Number(form.requiredQty),
                uomId:        form.uomId    ? Number(form.uomId)   : null,
                uomName:      form.uomName  || null,
                requiredDate: form.requiredDate || null,
                estUnitPrice: form.estUnitPrice ? Number(form.estUnitPrice) : null,
                remarks:      form.remarks.trim() || null,
                bomDetailId:  form.bomDetailId || null,
                createdBy:    currentUser,
                modifiedBy:   form.prLineId ? currentUser : null,
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

    const deleteLine = async () => {
        if (!confirmDel) return;
        setModalBusy(true); setModalError('');
        try {
            const res = await fetch(`${variables.API_URL}purchaserequest/lines/${confirmDel.prLineId}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setModalError(d?.message || 'Failed to delete line.');
                return;  // keep modal open so the user can read the error
            }
            setConfirmDel(null);
            loadLines(); onRefresh();
        } catch { setModalError('Network error. Please try again.'); }
        finally { setModalBusy(false); }
    };

    const handleImported = () => {
        setShowImport(false);
        loadLines();
        onRefresh();
    };

    const PR_LINE_STATUS_CFG = {
        Open:      { bg: '#f1f5f9', color: '#475569' },
        Partial:   { bg: '#fef3c7', color: '#92400e' },
        Ordered:   { bg: '#d1fae5', color: '#065f46' },
        Closed:    { bg: '#f3f4f6', color: '#374151' },
        Cancelled: { bg: '#fce7f3', color: '#9d174d' },
    };

    const changeLineStatus = async () => {
        if (!confirmStatus) return;
        const { line, newStatus } = confirmStatus;
        setModalBusy(true); setModalError('');
        try {
            const res = await fetch(`${variables.API_URL}purchaserequest/lines/${line.prLineId}/changestatus`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ id: line.prLineId, status: newStatus, changedBy: currentUser }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setModalError(d?.message || `Failed to ${newStatus.toLowerCase()} this line.`);
                return;  // keep modal open
            }
            setConfirmStatus(null);
            loadLines(); onRefresh();
        } catch { setModalError('Network error.'); }
        finally { setModalBusy(false); }
    };

    const cycleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };
    const sortedLines = React.useMemo(() => {
        if (!sortKey) return lines;
        return [...lines].sort((a, b) => {
            const va = (sortKey === 'code' ? a.itemCode : a.itemDesc) || '';
            const vb = (sortKey === 'code' ? b.itemCode : b.itemDesc) || '';
            return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        });
    }, [lines, sortKey, sortDir]);
    const sortIcon = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

    return (
        <div>
            {showImport && <BomImportModal pr={pr} onClose={() => setShowImport(false)} onImported={handleImported} />}

            {/* ── Delete confirm modal ── */}
            {confirmDel && (
                <ConfirmModal
                    title="Delete PR Line"
                    titleColor="#dc2626"
                    icon="🗑"
                    detail={confirmDel}
                    warning={
                        (confirmDel.poCreatedQty || 0) > 0
                            ? `This line has ${confirmDel.poCreatedQty} unit(s) already raised on a Purchase Order. The system will block deletion if PO lines are linked.`
                            : null
                    }
                    error={modalError}
                    confirmLabel="Delete Line"
                    confirmColor="#dc2626"
                    onConfirm={deleteLine}
                    onCancel={() => { setConfirmDel(null); setModalError(''); }}
                    busy={modalBusy}
                />
            )}

            {/* ── Close / Cancel line confirm modal ── */}
            {confirmStatus && (
                <ConfirmModal
                    title={confirmStatus.newStatus === 'Closed' ? 'Close Line' : 'Cancel Line'}
                    titleColor={confirmStatus.newStatus === 'Closed' ? '#374151' : '#b45309'}
                    icon={confirmStatus.newStatus === 'Closed' ? '🔒' : '✖️'}
                    detail={confirmStatus.line}
                    warning="This action cannot be undone."
                    error={modalError}
                    confirmLabel={confirmStatus.newStatus === 'Closed' ? 'Close Line' : 'Cancel Line'}
                    confirmColor={confirmStatus.newStatus === 'Closed' ? '#374151' : '#b45309'}
                    onConfirm={changeLineStatus}
                    onCancel={() => { setConfirmStatus(null); setModalError(''); }}
                    busy={modalBusy}
                />
            )}

            <div className="prd-lines-wrap">
                <div className="prd-lines-header">
                    <span className="prd-lines-title">Lines ({lines.length})</span>
                    {canEdit && hasJob && (
                        <button
                            className="prd-add-btn"
                            style={{ background: '#0f766e' }}
                            onClick={() => setShowImport(true)}
                            title="Import lines from this job's BOM"
                        >
                            📦 Import from BOM
                        </button>
                    )}
                </div>

                {/* BOM link hint */}
                {canEdit && !hasJob && lines.length === 0 && (
                    <div style={{ padding: '10px 14px', background: '#fef9c3', borderBottom: '1px solid #fde68a', fontSize: 12, color: '#854d0e' }}>
                        💡 Tip: Link this PR to a Job (in Overview tab) to enable <strong>Import from BOM</strong> — auto-populate lines from the job's bill of materials.
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>Loading…</div>
                ) : (
                    <table className="prd-lines-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th onClick={() => cycleSort('code')} style={{ cursor: 'pointer', userSelect: 'none', color: sortKey === 'code' ? '#1e40af' : undefined, background: sortKey === 'code' ? '#e8f0fe' : undefined, whiteSpace: 'nowrap' }}>Item Code{sortIcon('code')}</th>
                                <th onClick={() => cycleSort('name')} style={{ cursor: 'pointer', userSelect: 'none', color: sortKey === 'name' ? '#1e40af' : undefined, background: sortKey === 'name' ? '#e8f0fe' : undefined, whiteSpace: 'nowrap' }}>Description{sortIcon('name')}</th>
                                <th style={{ textAlign: 'right' }}>Req Qty</th>
                                <th style={{ textAlign: 'right' }}>PO Qty</th>
                                <th>UOM</th>
                                <th>Required Date</th>
                                <th style={{ textAlign: 'right' }}>Est. Price</th>
                                <th>Status</th>
                                <th>Source</th>
                                <th>Remarks</th>
                                {canEdit && <th>Actions</th>}
                                {!canEdit && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {lines.length === 0 ? (
                                <tr><td colSpan={12} className="prd-lines-empty">
                                    {hasJob ? 'No lines yet. Use "📦 Import from BOM" to populate lines from the job\'s bill of materials.' : 'No lines yet. Link this PR to a Job (Overview tab) to enable BOM import.'}
                                </td></tr>
                            ) : sortedLines.map(l => {
                                const po  = l.poCreatedQty || 0;
                                const req = l.requiredQty  || 0;
                                const poColor = po <= 0
                                    ? '#ef4444'      // red  — no PO raised
                                    : po >= req
                                        ? '#22c55e'  // green — fully covered
                                        : '#3b82f6'; // blue  — partial PO
                                return (
                                <tr key={l.prLineId} style={{ borderLeft: `3px solid ${poColor}` }}>
                                    <td><span className="prd-line-num">{l.lineNum}</span></td>
                                    <td>
                                        <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>
                                            {l.itemCode || '—'}
                                        </span>
                                    </td>
                                    <td>{l.itemDesc}</td>
                                    <td className="prd-num-cell">{fmt(l.requiredQty)}</td>
                                    <td className="prd-num-cell" style={{ color: poColor, fontWeight: 600 }}>
                                        {po > 0 ? fmt(po) : '—'}
                                    </td>
                                    <td>{l.uomName || '—'}</td>
                                    <td>{fmtDate(l.requiredDate)}</td>
                                    <td className="prd-num-cell">{l.estUnitPrice != null ? fmt(l.estUnitPrice) : '—'}</td>
                                    <td>
                                        {(() => {
                                            const sc = PR_LINE_STATUS_CFG[l.lineStatus] || PR_LINE_STATUS_CFG.Open;
                                            return <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{l.lineStatus || 'Open'}</span>;
                                        })()}
                                    </td>
                                    <td>
                                        {l.bomDetailId
                                            ? <span style={{ background: '#d1fae5', color: '#065f46', padding: '2px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>BOM</span>
                                            : <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 7px', borderRadius: 8, fontSize: 10 }}>Manual</span>
                                        }
                                    </td>
                                    <td style={{ color: '#64748b', fontSize: 11 }}>{l.remarks || '—'}</td>
                                    {canEdit && (
                                        <td>
                                            <button className="prd-line-act" onClick={() => openEdit(l)}>Edit</button>
                                            <button className="prd-line-act prd-line-del"
                                                onClick={() => { setConfirmDel(l); setModalError(''); }}>
                                                Delete
                                            </button>
                                        </td>
                                    )}
                                    {!canEdit && (
                                        <td>
                                            {!['Closed','Cancelled','Ordered'].includes(l.lineStatus) && !['Draft','Cancelled','Rejected'].includes(pr.status) && (
                                                <>
                                                    {canDo('/purchase-requests', 'CLOSE') && (
                                                        <button className="prd-line-act"
                                                            onClick={() => { setConfirmStatus({ line: l, newStatus: 'Closed' }); setModalError(''); }}
                                                            style={{ color: '#374151', borderColor: '#d1d5db', background: '#f3f4f6' }}
                                                            title="Close this line — no further POs">
                                                            Close
                                                        </button>
                                                    )}
                                                    {(l.poCreatedQty || 0) === 0 && canDo('/purchase-requests', 'CANCEL') && (
                                                        <button className="prd-line-act prd-line-del"
                                                            onClick={() => { setConfirmStatus({ line: l, newStatus: 'Cancelled' }); setModalError(''); }}
                                                            title="Cancel this line — no POs allowed">
                                                            Cancel
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </td>
                                    )}
                                </tr>
                                );
                            })}
                        </tbody>
                    </table>
                )}

                {showForm && (
                    <div className="prd-line-form">
                        <div className="prd-line-form-title">Edit Line</div>
                        {error && <div className="pf-err" style={{ marginBottom: 8 }}>{error}</div>}

                        <div className="prd-lf-row">
                            <div className="prd-lf-field">
                                <label>Item</label>
                                {form.prLineId > 0 ? (
                                    <input
                                        className="prd-lf-input"
                                        value={form.itemCode ? `[${form.itemCode}]` : '—'}
                                        readOnly
                                        style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                        title="Item cannot be changed on an existing PR line"
                                    />
                                ) : (
                                    <select className="prd-lf-input" name="itemId" value={form.itemId} onChange={handle}>
                                        <option value="">— Select Item —</option>
                                        {(itemLookup || []).map(i => <option key={i.id} value={i.id}>{i.code ? `[${i.code}] ` : ''}{i.name}</option>)}
                                    </select>
                                )}
                            </div>
                            <div className="prd-lf-field prd-lf-f2">
                                <label>Description {isReq('itemDesc') && <span className="req">*</span>}</label>
                                <input
                                    className="prd-lf-input"
                                    type="text"
                                    name="itemDesc"
                                    value={form.itemDesc}
                                    onChange={handle}
                                    placeholder="Item description"
                                    readOnly={form.prLineId > 0}
                                    style={form.prLineId > 0 ? { background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' } : {}}
                                    title={form.prLineId > 0 ? 'Item cannot be changed on an existing PR line' : ''}
                                />
                            </div>
                        </div>
                        <div className="prd-lf-row">
                            <div className="prd-lf-field">
                                <label>Qty {isReq('requiredQty') && <span className="req">*</span>}</label>
                                <input className="prd-lf-input" type="number" name="requiredQty" value={form.requiredQty} onChange={handle} min="0" step="0.01" />
                            </div>
                            <div className="prd-lf-field">
                                <label>UOM</label>
                                <select className="prd-lf-input" name="uomId" value={form.uomId} onChange={handle}>
                                    <option value="">— UOM —</option>
                                    {(uoms || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                </select>
                            </div>
                            <div className="prd-lf-field">
                                <label>Required Date</label>
                                <input className="prd-lf-input" type="date" name="requiredDate" value={form.requiredDate} onChange={handle} />
                            </div>
                            <div className="prd-lf-field">
                                <label>Est. Unit Price</label>
                                <input className="prd-lf-input" type="number" name="estUnitPrice" value={form.estUnitPrice} onChange={handle} min="0" step="0.01" />
                            </div>
                        </div>
                        <div className="prd-lf-row">
                            <div className="prd-lf-field prd-lf-f3">
                                <label>Remarks</label>
                                <input className="prd-lf-input" type="text" name="remarks" value={form.remarks} onChange={handle} placeholder="Optional remarks…" />
                            </div>
                        </div>
                        <div className="prd-lf-actions">
                            <button className="prd-lf-cancel" onClick={() => { setShowForm(false); setError(''); }}>Cancel</button>
                            <button className="prd-lf-save" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Update Line'}</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PrLinesTab;
