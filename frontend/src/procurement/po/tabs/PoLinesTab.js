import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmt, fmtDate } from '../../procurementConstants';
import { useFieldConfig } from '../../../FieldConfigContext';

const EMPTY_LINE = {
    poLineId:    0,
    prLineId:    '',
    itemId:      '',
    itemCode:    '',
    itemDesc:    '',
    orderedQty:  '',
    uomId:       '',
    uomName:     '',
    unitPrice:   '',
    taxPct:      '0',
    remarks:     '',
};

// ── Confirm Delete Modal ──────────────────────────────────────────
const ConfirmModal = ({ title = 'Confirm Delete', message, onConfirm, onCancel, confirmLabel = 'Delete', busyLabel = 'Deleting…', confirmColor = '#dc2626', loading = false }) =>
    ReactDOM.createPortal(
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 10, padding: '28px 32px', width: 380, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                <h3 style={{ margin: '0 0 12px', fontSize: 15, color: '#1e293b' }}>{title}</h3>
                <p style={{ margin: '0 0 22px', fontSize: 13, color: '#475569', lineHeight: 1.55 }}>{message}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onCancel} disabled={loading}
                        style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button onClick={onConfirm} disabled={loading}
                        style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: confirmColor, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                        {loading ? busyLabel : confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );

// ── Amend Line Modal (qty + price) ───────────────────────────────
const AmendLineModal = ({ line, onClose, onSaved }) => {
    const currentUser = useCurrentUser();
    const minQty  = line.receivedQty || 0;
    const maxQty  = line.orderedQty  || 0;

    const [qty,      setQty]      = useState(String(minQty));
    const [price,    setPrice]    = useState(String(line.unitPrice ?? ''));
    const [reason,   setReason]   = useState('');
    const [password, setPassword] = useState('');
    const [saving,   setSaving]   = useState(false);
    const [err,      setErr]      = useState('');

    const handleSave = async () => {
        setErr('');
        const newQty   = parseFloat(qty);
        const newPrice = parseFloat(price);
        if (isNaN(newQty)   || newQty   <= 0)   { setErr('Enter a valid quantity.');  return; }
        if (newQty < minQty)                     { setErr(`Qty cannot be less than already received (${minQty}).`); return; }
        if (newQty > maxQty)                     { setErr(`Qty cannot exceed current ordered qty (${maxQty}).`);    return; }
        if (isNaN(newPrice) || newPrice < 0)     { setErr('Enter a valid unit price.'); return; }
        if (!reason.trim())                      { setErr('A reason is required.'); return; }
        if (!password)                           { setErr('Password is required.'); return; }

        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}purchaseorder/lines/${line.poLineId}/amend`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ newQty, newPrice, reason: reason.trim(), password, modifiedBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setErr(d?.message || `Amendment failed (HTTP ${res.status}).`); return; }
            onSaved();
        } catch (e) {
            setErr(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally { setSaving(false); }
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 10, padding: '28px 32px', width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.18)' }}>
                <h3 style={{ margin: '0 0 4px', fontSize: 15, color: '#1e293b' }}>Amend PO Line</h3>
                <p style={{ margin: '0 0 18px', fontSize: 12, color: '#64748b' }}>{line.itemDesc}</p>

                <table style={{ width: '100%', fontSize: 12, marginBottom: 18, borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc' }}>
                            <th style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 600, color: '#475569', border: '1px solid #e2e8f0' }}></th>
                            <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#475569', border: '1px solid #e2e8f0' }}>Current</th>
                            <th style={{ padding: '6px 10px', textAlign: 'right', fontWeight: 600, color: '#475569', border: '1px solid #e2e8f0' }}>New</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td style={{ padding: '7px 10px', border: '1px solid #e2e8f0', color: '#374151' }}>Quantity</td>
                            <td style={{ padding: '7px 10px', border: '1px solid #e2e8f0', textAlign: 'right', color: '#374151' }}>
                                {maxQty} <span style={{ color: '#94a3b8', fontSize: 11 }}>(rcvd: {minQty})</span>
                            </td>
                            <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0' }}>
                                <input
                                    type="number" min={minQty} max={maxQty} step="any"
                                    value={qty} onChange={e => setQty(e.target.value)}
                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, textAlign: 'right', boxSizing: 'border-box' }}
                                    autoFocus
                                />
                            </td>
                        </tr>
                        <tr>
                            <td style={{ padding: '7px 10px', border: '1px solid #e2e8f0', color: '#374151' }}>Unit Price</td>
                            <td style={{ padding: '7px 10px', border: '1px solid #e2e8f0', textAlign: 'right', color: '#374151' }}>{fmt(line.unitPrice)}</td>
                            <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0' }}>
                                <input
                                    type="number" min="0" step="any"
                                    value={price} onChange={e => setPrice(e.target.value)}
                                    style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, textAlign: 'right', boxSizing: 'border-box' }}
                                />
                            </td>
                        </tr>
                    </tbody>
                </table>

                <div style={{ marginBottom: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                        Reason <span style={{ color: '#e53e3e' }}>*</span>
                    </label>
                    <textarea
                        rows={2}
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        placeholder="Enter reason for amendment…"
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    />
                </div>

                <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>
                        Your password <span style={{ color: '#e53e3e' }}>*</span>
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Enter your login password to confirm"
                        style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12, boxSizing: 'border-box' }}
                    />
                </div>

                {err && <div style={{ marginBottom: 14, padding: '7px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 5, fontSize: 12, color: '#b91c1c' }}>{err}</div>}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                    <button onClick={onClose} disabled={saving}
                        style={{ padding: '7px 18px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#f8fafc', fontSize: 13, cursor: 'pointer' }}>
                        Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving}
                        style={{ padding: '7px 18px', borderRadius: 6, border: 'none', background: '#0f766e', color: '#fff', fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                        {saving ? 'Saving…' : 'Save Amendment'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── PR Lines Import Modal ─────────────────────────────────────────
const PrImportModal = ({ po, initialPrId, onClose, onImported, budgetInfo }) => {
    const currentUser    = useCurrentUser();
    // PR picker state
    const [prs,          setPrs]          = useState([]);
    const [prsLoading,   setPrsLoading]   = useState(true);
    const [selectedPrId, setSelectedPrId] = useState(initialPrId ? String(initialPrId) : '');
    // Lines state
    const [prLines,      setPrLines]      = useState([]);
    const [linesLoading, setLinesLoading] = useState(false);
    const [selected,     setSelected]     = useState({});
    const [qtys,         setQtys]         = useState({});   // prLineId → qty string (editable)
    const [prices,       setPrices]       = useState({});   // prLineId → unit price string (editable)
    const [importing,    setImporting]    = useState(false);
    const [error,        setError]        = useState('');
    const [search,       setSearch]       = useState('');
    const [sortKey,      setSortKey]      = useState('');
    const [sortDir,      setSortDir]      = useState('asc');

    // Load Approved PRs for this job on open
    useEffect(() => {
        if (!po.jobId) { setPrsLoading(false); return; }
        setPrsLoading(true);
        fetch(`${variables.API_URL}purchaserequest/search?status=Approved,Partial&jobId=${encodeURIComponent(po.jobId)}&pageSize=200&page=1`, { headers: authHeaders() })
            .then(r => r.json())
            // Hide PRs where every line is already fully ordered to PO — nothing left to import.
            .then(d => setPrs((d.data || []).filter(p => !p.fullyOrdered)))
            .catch(() => setError('Failed to load purchase requests.'))
            .finally(() => setPrsLoading(false));
    }, [po.jobId]);

    // Load PR lines whenever a PR is selected
    useEffect(() => {
        if (!selectedPrId) { setPrLines([]); setSelected({}); setQtys({}); setPrices({}); return; }
        setLinesLoading(true);
        fetch(`${variables.API_URL}purchaseorder/prlines/${selectedPrId}?poId=${po.poId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                const rows = Array.isArray(d) ? d : [];
                setPrLines(rows);
                const sel    = {};
                const qMap   = {};
                const pMap   = {};
                // PR EstUnitPrice is always base currency; convert to PO currency
                const poRate = Number(po.exchangeRate) || 1;
                rows.forEach(r => {
                    if (!r.alreadyAdded) {
                        sel[r.prLineId]  = true;
                        qMap[r.prLineId] = String(r.remainingQty > 0 ? r.remainingQty : r.requiredQty);
                        pMap[r.prLineId] = r.estUnitPrice != null
                            ? String(+(r.estUnitPrice / poRate).toFixed(4))
                            : '';
                    }
                });
                setSelected(sel);
                setQtys(qMap);
                setPrices(pMap);
            })
            .catch(() => setError('Failed to load PR lines.'))
            .finally(() => setLinesLoading(false));
    }, [selectedPrId, po.poId]);

    const cycleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('asc'); }
    };

    const displayLines = React.useMemo(() => {
        let rows = prLines;
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
    }, [prLines, search, sortKey, sortDir]);

    const toggle    = (id) => setSelected(p => ({ ...p, [id]: !p[id] }));
    const toggleAll = () => {
        const eligible = displayLines.filter(l => !l.alreadyAdded);
        const allOn    = eligible.every(l => selected[l.prLineId]);
        const next     = {};
        eligible.forEach(l => { next[l.prLineId] = !allOn; });
        setSelected(p => ({ ...p, ...next }));
    };
    const setQty   = (id, val) => setQtys(p => ({ ...p, [id]: val }));
    const setPrice = (id, val) => setPrices(p => ({ ...p, [id]: val }));

    const doImport = async () => {
        const toImport = prLines.filter(l => selected[l.prLineId] && !l.alreadyAdded);
        if (toImport.length === 0) { setError('No new lines selected.'); return; }

        // Validate qtys are positive and within PR balance
        for (const l of toImport) {
            const q      = Number(qtys[l.prLineId]);
            const maxQty = l.remainingQty > 0 ? l.remainingQty : l.requiredQty;
            if (!q || q <= 0) {
                setError(`Enter a valid quantity for "${l.itemDesc || l.itemCode}".`);
                return;
            }
            if (q > maxQty) {
                setError(`Quantity for "${l.itemDesc || l.itemCode}" (${q}) exceeds PR balance (${maxQty}).`);
                return;
            }
        }

        setImporting(true); setError('');
        const errors = [];
        let succeeded = 0;
        try {
            for (const l of toImport) {
                const r = await fetch(`${variables.API_URL}purchaseorder/lines/save`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({
                        poLineId:   0,
                        poId:       po.poId,
                        prLineId:   l.prLineId,
                        itemId:     l.itemId    || null,
                        itemCode:   l.itemCode  || null,
                        itemDesc:   l.itemDesc  || 'Item',
                        orderedQty: Number(qtys[l.prLineId]),
                        uomId:      l.uomId     || null,
                        uomName:    l.uomName   || null,
                        unitPrice:  parseFloat(prices[l.prLineId]) || 0,
                        taxPct:     0,
                        remarks:    l.remarks   || null,
                        createdBy:  currentUser,
                        modifiedBy: null,
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
                // Stay open — show which lines failed and why
                const successNote = succeeded > 0 ? ` (${succeeded} line(s) imported successfully)` : '';
                setError(errors.join('\n') + successNote);
                if (succeeded > 0) onImported(); // refresh parent list but keep modal open for error review
            } else {
                onImported(); // all succeeded — close normally
            }
        } catch {
            setError('Network error while importing lines. Please try again.');
        } finally {
            setImporting(false);
        }
    };

    const eligible    = prLines.filter(l => !l.alreadyAdded);
    const visibleElig = displayLines.filter(l => !l.alreadyAdded);
    const allChecked  = visibleElig.length > 0 && visibleElig.every(l => selected[l.prLineId]);
    const selCount    = Object.values(selected).filter(Boolean).length;
    const sortIcon    = (key) => sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';

    const TH = ({ children, align = 'left', highlight = false }) => (
        <th style={{ padding: '8px 10px', textAlign: align, fontWeight: 600,
            color: highlight ? '#1e40af' : '#3a5070', textTransform: 'uppercase',
            fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9',
            background: highlight ? '#eff6ff' : undefined }}>
            {children}
        </th>
    );
    const SortTH = ({ children, colKey, align = 'left' }) => (
        <th onClick={() => cycleSort(colKey)} style={{
            padding: '8px 10px', textAlign: align, fontWeight: 600,
            color: sortKey === colKey ? '#1e40af' : '#3a5070', textTransform: 'uppercase',
            fontSize: 10, letterSpacing: '.4px', borderBottom: '1px solid #d4dce9',
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
            <style>{`
                @keyframes budget-flash {
                    0%, 100% { opacity: 1; background: #fef3c7; }
                    50%       { opacity: .7; background: #fde68a; }
                }
            `}</style>
            <div style={{
                background: '#fff', borderRadius: 10, width: 1020, maxWidth: '96vw',
                maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                boxShadow: '0 20px 60px rgba(0,0,0,.2)'
            }}>
                {/* Header */}
                <div style={{ background: '#2e5fa3', padding: '16px 20px', borderRadius: '10px 10px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <div style={{ color: '#fff', fontWeight: 600, fontSize: 15 }}>Import from PR Lines</div>
                        <div style={{ color: 'rgba(255,255,255,.7)', fontSize: 11.5, marginTop: 2 }}>
                            Select a Purchase Request then choose lines to add to this PO
                        </div>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,.15)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>✕</button>
                </div>

                {/* PR Picker */}
                <div style={{ padding: '12px 20px', background: '#f4f7fb', borderBottom: '1px solid #d4dce9', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, color: '#3a5070', whiteSpace: 'nowrap' }}>Purchase Request</label>
                    {prsLoading ? (
                        <span style={{ fontSize: 12, color: '#64748b' }}>Loading…</span>
                    ) : (
                        <select
                            className="pf-input"
                            style={{ flex: 1 }}
                            value={selectedPrId}
                            onChange={e => { setSelectedPrId(e.target.value); setError(''); }}>
                            <option value="">— Select a PR —</option>
                            {prs.map(p => (
                                <option key={p.prId} value={p.prId}>
                                    {p.prNumber}  ·  {p.lineCount} line{p.lineCount !== 1 ? 's' : ''}
                                    {p.requestedBy ? `  ·  ${p.requestedBy}` : ''}
                                </option>
                            ))}
                        </select>
                    )}
                    {!prsLoading && prs.length === 0 && (
                        <span style={{ fontSize: 12, color: '#b45309' }}>⚠ No Approved PRs for job {po.jobId}</span>
                    )}
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflow: 'auto' }}>
                    {!selectedPrId ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                            Select a Purchase Request above to view its lines.
                        </div>
                    ) : linesLoading ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading PR lines…</div>
                    ) : prLines.length === 0 ? (
                        <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                            No lines found in the selected PR.
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
                            />
                            {search && (
                                <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>✕</button>
                            )}
                            {search && <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>{displayLines.length} of {prLines.length}</span>}
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                            <thead>
                                <tr style={{ background: '#eef2f8' }}>
                                    <th style={{ padding: '8px 10px', width: 36, textAlign: 'center', borderBottom: '1px solid #d4dce9' }}>
                                        <input type="checkbox" checked={allChecked} onChange={toggleAll}
                                            style={{ cursor: 'pointer', accentColor: '#2e5fa3' }} />
                                    </th>
                                    <TH>#</TH>
                                    <SortTH colKey="code">Item Code</SortTH>
                                    <SortTH colKey="name">Description</SortTH>
                                    <TH align="right">PR Qty</TH>
                                    <TH align="right">Ordered</TH>
                                    <TH align="right">Balance</TH>
                                    <TH align="right" highlight>PO Qty ✎</TH>
                                    <TH>UOM</TH>
                                    <TH align="right" highlight>Unit Price ✎</TH>
                                    <TH>Required By</TH>
                                    <TH>Status</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {displayLines.length === 0 ? (
                                    <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No items match your search.</td></tr>
                                ) : displayLines.map(l => {
                                    const isAdded   = !!l.alreadyAdded;
                                    const isChecked = !!selected[l.prLineId];
                                    return (
                                        <tr key={l.prLineId}
                                            style={{ background: isAdded ? '#f8fffe' : (isChecked ? '#f0f7ff' : '#fff'), cursor: isAdded ? 'default' : 'pointer' }}
                                            onClick={() => !isAdded && toggle(l.prLineId)}>
                                            <td style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid #f0f4f8' }}>
                                                {isAdded ? (
                                                    <span title="Already in this PO" style={{ color: '#16a34a', fontSize: 14 }}>✓</span>
                                                ) : (
                                                    <input type="checkbox" checked={isChecked}
                                                        onChange={() => toggle(l.prLineId)}
                                                        onClick={e => e.stopPropagation()}
                                                        style={{ cursor: 'pointer', accentColor: '#2e5fa3' }} />
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8', color: '#64748b', fontFamily: 'Courier New', fontSize: 11 }}>{l.lineNum}</td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8' }}>
                                                {l.itemCode
                                                    ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>{l.itemCode}</span>
                                                    : <span style={{ color: '#94a3b8' }}>—</span>
                                                }
                                            </td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8', color: isAdded ? '#64748b' : '#1e3a5f' }}>{l.itemDesc}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>{fmt(l.requiredQty)}</td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', fontVariantNumeric: 'tabular-nums', color: l.poCreatedQty > 0 ? '#b45309' : '#94a3b8' }}>
                                                {l.poCreatedQty > 0 ? fmt(l.poCreatedQty) : '—'}
                                            </td>
                                            <td style={{ padding: '8px 10px', textAlign: 'right', borderBottom: '1px solid #f0f4f8', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                                                color: l.remainingQty <= 0 ? '#16a34a' : (l.remainingQty < l.requiredQty ? '#b45309' : '#1e3a5f') }}>
                                                {l.remainingQty <= 0
                                                    ? <span title="Fully covered by POs">✓ Full</span>
                                                    : fmt(l.remainingQty)
                                                }
                                            </td>
                                            {/* ── Editable PO Qty ── */}
                                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f4f8', background: isAdded ? 'transparent' : (isChecked ? '#eff6ff' : '#f8fafc') }}
                                                onClick={e => e.stopPropagation()}>
                                                {isAdded ? (
                                                    <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span>
                                                ) : (
                                                    <input
                                                        type="number"
                                                        min="0.0001"
                                                        max={l.remainingQty > 0 ? l.remainingQty : l.requiredQty}
                                                        step="any"
                                                        value={qtys[l.prLineId] ?? ''}
                                                        disabled={!isChecked}
                                                        onChange={e => setQty(l.prLineId, e.target.value)}
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
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8', color: '#475569' }}>{l.uomName || '—'}</td>
                                            {/* ── Editable Unit Price ── */}
                                            <td style={{ padding: '5px 8px', borderBottom: '1px solid #f0f4f8', background: isAdded ? 'transparent' : (isChecked ? '#eff6ff' : '#f8fafc') }}
                                                onClick={e => e.stopPropagation()}>
                                                {isAdded ? (
                                                    <span style={{ color: '#94a3b8', fontSize: 11 }}>{l.estUnitPrice != null ? fmt(l.estUnitPrice) : '—'}</span>
                                                ) : (
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="any"
                                                        value={prices[l.prLineId] ?? ''}
                                                        disabled={!isChecked}
                                                        onChange={e => setPrice(l.prLineId, e.target.value)}
                                                        style={{
                                                            width: 90, padding: '4px 6px',
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
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8', color: '#64748b' }}>{fmtDate(l.requiredDate)}</td>
                                            <td style={{ padding: '8px 10px', borderBottom: '1px solid #f0f4f8' }}>
                                                {isAdded
                                                    ? <span style={{ background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>In PO</span>
                                                    : l.remainingQty <= 0
                                                        ? <span style={{ background: '#f0fdf4', color: '#16a34a', padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>Covered</span>
                                                        : <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: 8, fontSize: 10 }}>Pending</span>
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
                        {(() => {
                            const selectedTotal = prLines
                                .filter(l => selected[l.prLineId] && !l.alreadyAdded)
                                .reduce((s, l) => s + (Number(qtys[l.prLineId]) || 0) * (parseFloat(prices[l.prLineId]) || 0), 0);
                            // Convert the import total (PO currency) to base before comparing to the base-currency budget.
                            const importRate        = Number(po.exchangeRate) || 1;
                            const selectedTotalBase = selectedTotal * importRate;
                            const importWouldExceed = budgetInfo && budgetInfo.budgeted > 0 && selectedTotalBase > budgetInfo.remaining;
                            const importOverBy      = importWouldExceed ? selectedTotalBase - budgetInfo.remaining : 0;
                            return (
                                <>
                                    {eligible.length > 0
                                        ? `${selCount} of ${eligible.length} lines selected`
                                        : 'All PR lines already added to this PO'
                                    }
                                    {budgetInfo && budgetInfo.budgeted > 0 && selectedTotal > 0 && (
                                        importWouldExceed ? (
                                            <div style={{
                                                marginTop: 6, padding: '6px 12px', borderRadius: 6,
                                                fontSize: 12, fontWeight: 700, color: '#92400e',
                                                border: '1.5px solid #f59e0b',
                                                animation: 'budget-flash 1s ease-in-out infinite',
                                            }}>
                                                ⚠ Import total <strong>{fmt(selectedTotalBase)}</strong> (base) exceeds remaining budget <strong>{fmt(budgetInfo.remaining)}</strong> — over by <strong style={{ color: '#dc2626' }}>{fmt(importOverBy)}</strong>
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: 4, fontSize: 11, color: '#166534', fontWeight: 500 }}>
                                                ✓ Import total {fmt(selectedTotalBase)} (base) within remaining budget {fmt(budgetInfo.remaining)}
                                            </div>
                                        )
                                    )}
                                </>
                            );
                        })()}
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
                            {importing ? 'Importing…' : `Import ${selCount || ''} Lines`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ── PO Lines Tab ──────────────────────────────────────────────────
const PoLinesTab = ({ po, onRefresh, initialPrId }) => {
    const currentUser = useCurrentUser();
    const { lookups, getStatusConfig, getVList } = useLookup();
    const { isReq } = useFieldConfig('PO_LINE');
    const { items: itemLookup, uoms } = lookups;

    const [lines,        setLines]        = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [showForm,     setShowForm]     = useState(false);
    const [showImport,   setShowImport]   = useState(false);
    const [editLine,     setEditLine]     = useState(null);
    const [form,         setForm]         = useState(EMPTY_LINE);
    const [saving,       setSaving]       = useState(false);
    const [deleting,     setDeleting]     = useState(null);
    const [confirmDel,   setConfirmDel]   = useState(null); // poLineId pending delete
    const [confirmStatus, setConfirmStatus] = useState(null); // { lineId, newStatus } pending close/cancel
    const [statusBusy,   setStatusBusy]   = useState(false);
    const [amendLine,    setAmendLine]    = useState(null);
    const [error,         setError]         = useState('');
    const [confirmBudget, setConfirmBudget] = useState(false); // over-budget save acknowledge
    const [pendingSave,   setPendingSave]   = useState(null);  // { orderedQty, unitPrice } held while budget confirm is open
    const [budgetInfo,    setBudgetInfo]    = useState(null); // { categoryName, budgeted, committed, remaining }
    const [sortKey,      setSortKey]      = useState('');
    const [sortDir,      setSortDir]      = useState('asc');
    const [expandedGroups, setExpandedGroups] = useState(new Set());

    const { canDo } = usePermission();
    const canEdit = (getStatusConfig('PO', po.status)?.canEdit ?? po.status === 'Draft') && canDo('/purchase-orders', 'EDIT');
    const hasJob  = !!po.jobId;

    // ── Load budget info whenever the PO has a job + category ────────────────
    useEffect(() => {
        if (!po.jobId || !po.expenseCategoryId) { setBudgetInfo(null); return; }
        fetch(
            `${variables.API_URL}purchaseorder/budget-check?jobId=${encodeURIComponent(po.jobId)}&categoryId=${po.expenseCategoryId}`,
            { headers: authHeaders() }
        )
            .then(r => r.json())
            .then(d => setBudgetInfo(d.budgeted > 0 ? d : null))
            .catch(() => setBudgetInfo(null));
    }, [po.jobId, po.expenseCategoryId]);

    // Auto-open import modal when navigated here right after PO creation
    useEffect(() => {
        if (initialPrId && canEdit) setShowImport(true);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const loadLines = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}purchaseorder/lines/${po.poId}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setLines(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [po.poId]);

    useEffect(() => { loadLines(); }, [loadLines]);

    const openEdit = (line) => {
        setEditLine(line);
        setForm({
            poLineId:    line.poLineId,
            prLineId:    line.prLineId ? String(line.prLineId) : '',
            itemId:      line.itemId ? String(line.itemId) : '',
            itemCode:    line.itemCode || '',
            itemDesc:    line.itemDesc || '',
            orderedQty:  line.orderedQty  != null ? String(line.orderedQty)  : '',
            uomId:       line.uomId ? String(line.uomId) : '',
            uomName:     line.uomName || '',
            unitPrice:   line.unitPrice != null ? String(line.unitPrice) : '',
            taxPct:      line.taxPct    != null ? String(line.taxPct)    : '0',
            remarks:     line.remarks || '',
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

    const lineTotal        = () => (Number(form.orderedQty) || 0) * (Number(form.unitPrice) || 0);
    const lineTotalWithTax = () => lineTotal() * (1 + (Number(form.taxPct) || 0) / 100);

    // ── Budget soft-warning helpers ───────────────────────────────────────────
    // When editing, the existing line already contributes to `committed`; back
    // it out so we compare the NET change, not an additive double-count.
    // Budget figures (budgeted/committed/remaining) are in BASE currency, but the
    // PO line total is in the PO's transaction currency. Convert the line to base
    // via the PO exchange rate before comparing — otherwise a foreign-currency PO
    // (e.g. EUR 6,400 @ 4 = AED 25,600) is wrongly compared as 6,400 < budget.
    const poRate           = Number(po.exchangeRate) || 1;
    const oldLineContrib   = editLine ? (editLine.lineTotal || 0) * poRate : 0;
    const remainingForEdit = budgetInfo ? budgetInfo.remaining + oldLineContrib : null;
    const lineTotalBase    = lineTotal() * poRate;
    const wouldExceed      = remainingForEdit !== null && lineTotalBase > remainingForEdit;
    const overBy           = wouldExceed ? lineTotalBase - remainingForEdit : 0;

    // Friendly prompt for a numeric field. Loops on invalid input so the user
    // doesn't get stuck. Returns the parsed number, or null if the user cancels.
    const promptForNumber = (label, defaultVal = '') => {
        let raw = defaultVal;
        while (true) {
            raw = window.prompt(label, raw == null ? '' : String(raw));
            if (raw === null) return null;                                // user cancelled
            const n = parseFloat(String(raw).trim());
            if (!isNaN(n) && n >= 0 && isFinite(n)) return n;
            window.alert('Please enter a valid number (zero or greater).');
        }
    };

    const doSave = (orderedQty, unitPrice) => {
        setError(''); setSaving(true);
        fetch(`${variables.API_URL}purchaseorder/lines/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                poLineId:  form.poLineId || 0,
                poId:      po.poId,
                prLineId:  form.prLineId ? Number(form.prLineId) : null,
                itemId:    form.itemId   ? Number(form.itemId)   : null,
                itemCode:  form.itemCode || null,
                itemDesc:  form.itemDesc.trim(),
                orderedQty,
                uomId:     form.uomId    ? Number(form.uomId)    : null,
                uomName:   form.uomName  || null,
                unitPrice,
                taxPct:    Number(form.taxPct)    || 0,
                remarks:   form.remarks.trim()    || null,
                createdBy: currentUser,
                modifiedBy: form.poLineId ? currentUser : null,
            })
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error.'); return; }
                setShowForm(false);
                loadLines();
                onRefresh();
                // Refresh budget committed figure after saving
                if (po.jobId && po.expenseCategoryId) {
                    fetch(
                        `${variables.API_URL}purchaseorder/budget-check?jobId=${encodeURIComponent(po.jobId)}&categoryId=${po.expenseCategoryId}`,
                        { headers: authHeaders() }
                    )
                        .then(r => r.json())
                        .then(d => setBudgetInfo(d.budgeted > 0 ? d : null))
                        .catch(() => {});
                }
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    const save = () => {
        if (!form.itemDesc.trim()) { setError('Item description is required.'); return; }

        let orderedQty = parseFloat(form.orderedQty);
        if (!form.orderedQty || isNaN(orderedQty) || orderedQty <= 0) {
            const q = promptForNumber(`Enter ordered quantity for "${form.itemDesc.trim()}":`, form.orderedQty || '');
            if (q === null) return;
            if (q <= 0) { setError('Ordered quantity must be greater than zero.'); return; }
            orderedQty = q;
            setForm(p => ({ ...p, orderedQty: String(q) }));
        }

        let unitPrice = parseFloat(form.unitPrice);
        if (form.unitPrice === '' || form.unitPrice == null || isNaN(unitPrice)) {
            const p = promptForNumber(`Enter unit price for "${form.itemDesc.trim()}" (enter 0 if free of charge):`, form.unitPrice || '');
            if (p === null) return;
            unitPrice = p;
            setForm(prev => ({ ...prev, unitPrice: String(p) }));
        }

        // Soft budget guard: warn the purchaser when this line (in base currency) would
        // exceed the remaining category budget. They can acknowledge and save anyway.
        const computedBase = orderedQty * unitPrice * poRate;
        const exceedsAfterEdit = remainingForEdit !== null && computedBase > remainingForEdit;
        if (exceedsAfterEdit) {
            setPendingSave({ orderedQty, unitPrice });
            setConfirmBudget(true);
            return;
        }

        doSave(orderedQty, unitPrice);
    };

    const doDeleteLine = async () => {
        const lineId = confirmDel;
        if (!lineId) return;
        setError('');
        setDeleting(lineId);
        try {
            const res = await fetch(`${variables.API_URL}purchaseorder/lines/${lineId}`, { method: 'DELETE', headers: authHeaders() });
            if (!res.ok) {
                const d = await res.json().catch(() => ({}));
                setError(d?.message || `Failed to delete line (HTTP ${res.status}).`);
                return;
            }
            loadLines(); onRefresh();
        } catch (e) {
            setError(`Network error — ${e?.message || 'could not reach the server.'}`);
        } finally {
            setDeleting(null);
            setConfirmDel(null);
        }
    };

    const handleImported = () => {
        setShowImport(false);
        loadLines();
        onRefresh();
    };

    const handleAmendQty = (line) => setAmendLine(line);

    const LINE_STATUS_CFG = {
        Open:      { bg: '#f1f5f9', color: '#475569' },
        Partial:   { bg: '#fef3c7', color: '#92400e' },
        Received:  { bg: '#d1fae5', color: '#065f46' },
        Closed:    { bg: '#f3f4f6', color: '#374151' },
        Cancelled: { bg: '#fce7f3', color: '#9d174d' },
    };

    const changeLineStatus = (lineId, newStatus) => setConfirmStatus({ lineId, newStatus });

    const doChangeLineStatus = async () => {
        if (!confirmStatus) return;
        const { lineId, newStatus } = confirmStatus;
        const label = newStatus === 'Closed' ? 'close' : 'cancel';
        setStatusBusy(true); setError('');
        try {
            const res = await fetch(`${variables.API_URL}purchaseorder/lines/${lineId}/changestatus`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ id: lineId, status: newStatus, changedBy: currentUser }),
            });
            if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.message || `Failed to ${label} line.`); return; }
            loadLines(); onRefresh();
            setConfirmStatus(null);
        } catch { setError('Network error.'); }
        finally { setStatusBusy(false); }
    };

    const grandTotal        = lines.reduce((s, l) => s + (l.lineTotal || 0), 0);
    const grandTotalWithTax = lines.reduce((s, l) => s + (l.lineTotalWithTax || 0), 0);

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

    // Group lines by itemCode — same itemCode in one PO is merged into one display row
    const groupedLines = React.useMemo(() => {
        const groups = {};
        const order  = [];
        sortedLines.forEach(l => {
            const key = l.itemCode ? String(l.itemCode) : `__noc__${l.poLineId}`;
            if (!groups[key]) { groups[key] = { key, lines: [] }; order.push(key); }
            groups[key].lines.push(l);
        });
        return order.map(k => {
            const { key, lines } = groups[k];
            const f = lines[0];
            return {
                key, lines,
                isMerged:         lines.length > 1,
                itemCode:         f.itemCode,
                itemDesc:         f.itemDesc,
                uomName:          f.uomName,
                unitPrice:        f.unitPrice,
                taxPct:           f.taxPct,
                lineNum:          f.lineNum,
                orderedQty:       lines.reduce((s, l) => s + (Number(l.orderedQty)       || 0), 0),
                receivedQty:      lines.reduce((s, l) => s + (Number(l.receivedQty)      || 0), 0),
                lineTotal:        lines.reduce((s, l) => s + (Number(l.lineTotal)        || 0), 0),
                lineTotalWithTax: lines.reduce((s, l) => s + (Number(l.lineTotalWithTax) || 0), 0),
                lineStatus:       lines.every(l => l.lineStatus === f.lineStatus) ? (f.lineStatus || 'Open') : 'Mixed',
                hasSource:        lines.some(l => !!l.prLineId),
            };
        });
    }, [sortedLines]);

    const toggleGroup = (key) => setExpandedGroups(prev => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
    });

    return (
        <div>
            <style>{`
                @keyframes budget-flash {
                    0%, 100% { opacity: 1; background: #fef3c7; }
                    50%       { opacity: .7; background: #fde68a; }
                }
            `}</style>
            {showImport && (
                <PrImportModal
                    po={po}
                    initialPrId={initialPrId || ''}
                    onClose={() => setShowImport(false)}
                    onImported={handleImported}
                    budgetInfo={budgetInfo}
                />
            )}
            {amendLine && (
                <AmendLineModal
                    line={amendLine}
                    onClose={() => setAmendLine(null)}
                    onSaved={() => { setAmendLine(null); loadLines(); onRefresh(); }}
                />
            )}
            {confirmBudget && pendingSave && (
                <ConfirmModal
                    title="Over Budget — Proceed?"
                    message={`This line (${fmt(pendingSave.orderedQty * pendingSave.unitPrice * poRate)} base) exceeds the remaining budget of ${fmt(remainingForEdit)} by ${fmt(pendingSave.orderedQty * pendingSave.unitPrice * poRate - remainingForEdit)}.\n\nYou can still save — the system will require budget authorisation at submission. Continue?`}
                    confirmLabel="Save Anyway"
                    busyLabel="Saving…"
                    confirmColor="#92400e"
                    loading={saving}
                    onConfirm={() => { setConfirmBudget(false); doSave(pendingSave.orderedQty, pendingSave.unitPrice); }}
                    onCancel={() => { setConfirmBudget(false); setPendingSave(null); }}
                />
            )}
            {confirmDel && (
                <ConfirmModal
                    message="Are you sure you want to delete this PO line? This action cannot be undone."
                    onConfirm={doDeleteLine}
                    onCancel={() => setConfirmDel(null)}
                    loading={deleting === confirmDel}
                />
            )}
            {confirmStatus && (
                <ConfirmModal
                    title={confirmStatus.newStatus === 'Closed' ? 'Confirm Close' : 'Confirm Cancel'}
                    message={`Are you sure you want to ${confirmStatus.newStatus === 'Closed' ? 'close' : 'cancel'} this PO line? This action cannot be undone.`}
                    confirmLabel={confirmStatus.newStatus === 'Closed' ? 'Close Line' : 'Cancel Line'}
                    busyLabel={confirmStatus.newStatus === 'Closed' ? 'Closing…' : 'Cancelling…'}
                    confirmColor={confirmStatus.newStatus === 'Closed' ? '#374151' : '#9d174d'}
                    onConfirm={doChangeLineStatus}
                    onCancel={() => setConfirmStatus(null)}
                    loading={statusBusy}
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
                            title="Import lines from a Purchase Request"
                        >
                            📋 Import from PR
                        </button>
                    )}
                </div>

                {/* Import hint when no lines yet */}
                {canEdit && hasJob && lines.length === 0 && !showImport && (
                    <div style={{ padding: '10px 14px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', fontSize: 12, color: '#166534' }}>
                        💡 Click <strong>📋 Import from PR</strong> to populate lines from one or more Approved Purchase Requests for this job.
                    </div>
                )}
                {canEdit && !hasJob && lines.length === 0 && (
                    <div style={{ padding: '10px 14px', background: '#fef9c3', borderBottom: '1px solid #fde68a', fontSize: 12, color: '#854d0e' }}>
                        ⚠ This PO is not linked to a Job. Link a Job in the Overview tab to enable PR import.
                    </div>
                )}

                {loading ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: 12 }}>Loading…</div>
                ) : (
                    <>
                        <table className="prd-lines-table">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th onClick={() => cycleSort('code')} style={{ cursor: 'pointer', userSelect: 'none', color: sortKey === 'code' ? '#1e40af' : undefined, background: sortKey === 'code' ? '#e8f0fe' : undefined, whiteSpace: 'nowrap' }}>Item Code{sortIcon('code')}</th>
                                    <th onClick={() => cycleSort('name')} style={{ cursor: 'pointer', userSelect: 'none', color: sortKey === 'name' ? '#1e40af' : undefined, background: sortKey === 'name' ? '#e8f0fe' : undefined, whiteSpace: 'nowrap' }}>Description{sortIcon('name')}</th>
                                    <th style={{ textAlign: 'right' }}>Ordered</th>
                                    <th style={{ textAlign: 'right' }}>Received</th>
                                    <th>UOM</th>
                                    <th style={{ textAlign: 'right' }}>Unit Price</th>
                                    <th style={{ textAlign: 'right' }}>Tax %</th>
                                    <th style={{ textAlign: 'right' }}>Line Total</th>
                                    <th style={{ textAlign: 'right' }}>w/ Tax</th>
                                    <th>Status</th>
                                    <th>Source</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.length === 0 ? (
                                    <tr><td colSpan={13} className="prd-lines-empty">
                                        {hasJob ? 'No lines yet. Click "📋 Import from PR" to import lines from an approved Purchase Request.' : 'No lines yet.'}
                                    </td></tr>
                                ) : groupedLines.map(g => {
                                    const recv      = g.receivedQty;
                                    const ord       = g.orderedQty;
                                    const recvColor = recv <= 0 ? '#ef4444' : recv >= ord ? '#22c55e' : '#3b82f6';
                                    const isExpanded = expandedGroups.has(g.key);
                                    const l0        = g.lines[0]; // first sub-line (used for single-line actions)
                                    return (
                                    <React.Fragment key={g.key}>
                                        {/* ── Merged / single summary row ── */}
                                        <tr style={{ borderLeft: `3px solid ${recvColor}`, background: g.isMerged ? '#f0f9ff' : undefined }}>
                                            <td>
                                                <span className="prd-line-num">{g.lineNum}</span>
                                                {g.isMerged && (
                                                    <span style={{ marginLeft: 5, fontSize: 10, background: '#dbeafe', color: '#1e40af', borderRadius: 8, padding: '1px 6px', fontWeight: 700, verticalAlign: 'middle' }}>
                                                        ×{g.lines.length}
                                                    </span>
                                                )}
                                            </td>
                                            <td>
                                                <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>
                                                    {g.itemCode || '—'}
                                                </span>
                                            </td>
                                            <td>{g.itemDesc}</td>
                                            <td className="prd-num-cell" style={{ fontWeight: g.isMerged ? 700 : undefined }}>{fmt(g.orderedQty)}</td>
                                            <td className="prd-num-cell" style={{ color: recvColor, fontWeight: 600 }}>{fmt(g.receivedQty)}</td>
                                            <td>{g.uomName || '—'}</td>
                                            <td className="prd-num-cell">{g.isMerged ? <span style={{ color: '#94a3b8', fontSize: 11 }}>—</span> : fmt(g.unitPrice)}</td>
                                            <td className="prd-num-cell">{(!g.isMerged && g.taxPct) ? `${g.taxPct}%` : '—'}</td>
                                            <td className="prd-num-cell" style={{ fontWeight: 500 }}>{fmt(g.lineTotal)}</td>
                                            <td className="prd-num-cell" style={{ fontWeight: 500, color: '#1e40af' }}>{fmt(g.lineTotalWithTax)}</td>
                                            <td>
                                                {(() => {
                                                    const sc = LINE_STATUS_CFG[g.lineStatus] || LINE_STATUS_CFG.Open;
                                                    return <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{g.lineStatus}</span>;
                                                })()}
                                            </td>
                                            <td>
                                                {g.hasSource
                                                    ? <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>PR</span>
                                                    : <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 7px', borderRadius: 8, fontSize: 10 }}>Manual</span>
                                                }
                                            </td>
                                            <td>
                                                {g.isMerged ? (
                                                    /* Merged row: just show expand/collapse toggle */
                                                    <button className="prd-line-act" onClick={() => toggleGroup(g.key)}
                                                        style={{ color: '#1e40af', borderColor: '#93c5fd', background: '#eff6ff', fontWeight: 600 }}>
                                                        {isExpanded ? '▲ Hide' : '▼ Lines'}
                                                    </button>
                                                ) : (
                                                    /* Single-line row: normal action buttons */
                                                    <>
                                                        {canEdit && (
                                                            <>
                                                                <button className="prd-line-act" onClick={() => openEdit(l0)}>Edit</button>
                                                                <button className="prd-line-act prd-line-del" onClick={() => setConfirmDel(l0.poLineId)} disabled={deleting === l0.poLineId}>Delete</button>
                                                            </>
                                                        )}
                                                        {!['Closed','Cancelled','Received'].includes(l0.lineStatus) && !canEdit && ['Approved','Sent','Partial'].includes(po.status) && (
                                                            <>
                                                                {canDo('/purchase-orders', 'CLOSE') && (
                                                                    <button className="prd-line-act" onClick={() => changeLineStatus(l0.poLineId, 'Closed')}
                                                                        style={{ color: '#374151', borderColor: '#d1d5db', background: '#f3f4f6' }} title="Close this line — no further GRNs">
                                                                        Close
                                                                    </button>
                                                                )}
                                                                {(l0.receivedQty || 0) === 0 && canDo('/purchase-orders', 'CANCEL') && (
                                                                    <button className="prd-line-act prd-line-del" onClick={() => changeLineStatus(l0.poLineId, 'Cancelled')}
                                                                        title="Cancel this line — no receipts allowed">
                                                                        Cancel
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                        {!canEdit && ['Approved','Partial'].includes(po.status) && (l0.receivedQty || 0) > 0 && (l0.receivedQty || 0) < (l0.orderedQty || 0) && (
                                                            <button className="prd-line-act" onClick={() => handleAmendQty(l0)}
                                                                title="Reduce ordered qty to match partial receipt"
                                                                style={{ color: '#92400e', borderColor: '#fcd34d', background: '#fef3c7' }}>
                                                                Amend
                                                            </button>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                        </tr>

                                        {/* ── Sub-rows shown when merged row is expanded ── */}
                                        {g.isMerged && isExpanded && g.lines.map((l, idx) => {
                                            const lRecv  = l.receivedQty || 0;
                                            const lOrd   = l.orderedQty  || 0;
                                            const lColor = lRecv <= 0 ? '#ef4444' : lRecv >= lOrd ? '#22c55e' : '#3b82f6';
                                            return (
                                                <tr key={l.poLineId} style={{ background: idx % 2 === 0 ? '#f4f9ff' : '#eef5ff', borderLeft: `3px solid ${lColor}` }}>
                                                    <td style={{ paddingLeft: 20, color: '#64748b', fontSize: 11, whiteSpace: 'nowrap' }}>
                                                        └ <span className="prd-line-num" style={{ fontSize: 10 }}>#{l.lineNum}</span>
                                                    </td>
                                                    <td />
                                                    <td style={{ color: '#475569', fontSize: 12 }}>{l.itemDesc}</td>
                                                    <td className="prd-num-cell">{fmt(l.orderedQty)}</td>
                                                    <td className="prd-num-cell" style={{ color: lColor, fontWeight: 600 }}>{fmt(l.receivedQty)}</td>
                                                    <td>{l.uomName || '—'}</td>
                                                    <td className="prd-num-cell">{fmt(l.unitPrice)}</td>
                                                    <td className="prd-num-cell">{l.taxPct ? `${l.taxPct}%` : '—'}</td>
                                                    <td className="prd-num-cell" style={{ fontWeight: 500 }}>{fmt(l.lineTotal)}</td>
                                                    <td className="prd-num-cell" style={{ fontWeight: 500, color: '#1e40af' }}>{fmt(l.lineTotalWithTax)}</td>
                                                    <td>
                                                        {(() => {
                                                            const sc = LINE_STATUS_CFG[l.lineStatus] || LINE_STATUS_CFG.Open;
                                                            return <span style={{ background: sc.bg, color: sc.color, padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>{l.lineStatus || 'Open'}</span>;
                                                        })()}
                                                    </td>
                                                    <td>
                                                        {l.prLineId
                                                            ? <span style={{ background: '#dbeafe', color: '#1e40af', padding: '2px 7px', borderRadius: 8, fontSize: 10, fontWeight: 600 }}>PR</span>
                                                            : <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 7px', borderRadius: 8, fontSize: 10 }}>Manual</span>
                                                        }
                                                    </td>
                                                    <td>
                                                        {canEdit && (
                                                            <>
                                                                <button className="prd-line-act" onClick={() => openEdit(l)}>Edit</button>
                                                                <button className="prd-line-act prd-line-del" onClick={() => setConfirmDel(l.poLineId)} disabled={deleting === l.poLineId}>Delete</button>
                                                            </>
                                                        )}
                                                        {!['Closed','Cancelled','Received'].includes(l.lineStatus) && !canEdit && ['Approved','Sent','Partial'].includes(po.status) && (
                                                            <>
                                                                {canDo('/purchase-orders', 'CLOSE') && (
                                                                    <button className="prd-line-act" onClick={() => changeLineStatus(l.poLineId, 'Closed')}
                                                                        style={{ color: '#374151', borderColor: '#d1d5db', background: '#f3f4f6' }}>
                                                                        Close
                                                                    </button>
                                                                )}
                                                                {(l.receivedQty || 0) === 0 && canDo('/purchase-orders', 'CANCEL') && (
                                                                    <button className="prd-line-act prd-line-del" onClick={() => changeLineStatus(l.poLineId, 'Cancelled')}>
                                                                        Cancel
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                        {!canEdit && ['Approved','Partial'].includes(po.status) && (l.receivedQty || 0) > 0 && (l.receivedQty || 0) < (l.orderedQty || 0) && (
                                                            <button className="prd-line-act" onClick={() => handleAmendQty(l)}
                                                                style={{ color: '#92400e', borderColor: '#fcd34d', background: '#fef3c7' }}>
                                                                Amend
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </React.Fragment>
                                    );
                                })}
                            </tbody>
                            {lines.length > 0 && (
                                <tfoot>
                                    <tr style={{ background: '#f4f7fb', fontWeight: 600 }}>
                                        <td colSpan={canEdit ? 8 : 9} style={{ textAlign: 'right', fontSize: 11, color: '#3a5070', padding: '8px 10px', textTransform: 'uppercase', letterSpacing: '.3px' }}>Total</td>
                                        <td className="prd-num-cell" style={{ fontWeight: 700, color: '#1e3a5f' }}>{fmt(grandTotal)}</td>
                                        <td className="prd-num-cell" style={{ fontWeight: 700, color: '#1e40af' }}>{fmt(grandTotalWithTax)}</td>
                                        <td />{canEdit && <td />}
                                    </tr>
                                </tfoot>
                            )}
                        </table>

                        {showForm && (
                            <div className="prd-line-form">
                                <div className="prd-line-form-title">Edit Line</div>

                                {/* Budget info strip — always visible when a budget exists */}
                                {budgetInfo && (
                                    <div style={{
                                        display: 'flex', flexWrap: 'wrap', gap: '4px 20px', alignItems: 'center',
                                        background: '#f0f9ff', border: '1px solid #bae6fd',
                                        borderRadius: 6, padding: '7px 12px', marginBottom: 8, fontSize: 11.5, color: '#0369a1',
                                    }}>
                                        <span style={{ fontWeight: 700 }}>📊 {budgetInfo.categoryName}</span>
                                        <span>Budgeted: <strong>{fmt(budgetInfo.budgeted)}</strong></span>
                                        <span>Committed: <strong>{fmt(budgetInfo.committed)}</strong></span>
                                        <span>Remaining: <strong style={{ color: remainingForEdit >= 0 ? '#166534' : '#dc2626' }}>{fmt(remainingForEdit ?? budgetInfo.remaining)}</strong></span>
                                    </div>
                                )}

                                {/* Budget warning strip — shown only when this line would exceed */}
                                {wouldExceed && (
                                    <div style={{
                                        display: 'flex', flexWrap: 'wrap', gap: '4px 16px', alignItems: 'center',
                                        border: '1.5px solid #f59e0b',
                                        borderRadius: 6, padding: '7px 12px', marginBottom: 8, fontSize: 12, color: '#92400e',
                                        fontWeight: 700,
                                        animation: 'budget-flash 1s ease-in-out infinite',
                                    }}>
                                        <span>⚠ Budget Exceeded</span>
                                        <span>This line (base): <strong>{fmt(lineTotalBase)}</strong></span>
                                        <span>Available: <strong>{fmt(remainingForEdit)}</strong></span>
                                        <span style={{ color: '#dc2626' }}>Over by: <strong>{fmt(overBy)}</strong></span>
                                    </div>
                                )}

                                {error && <div className="pf-err" style={{ marginBottom: 8 }}>{error}</div>}
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field">
                                        <label>Item</label>
                                        {form.poLineId > 0 ? (
                                            <input
                                                className="prd-lf-input"
                                                value={form.itemCode ? `[${form.itemCode}]` : '—'}
                                                readOnly
                                                style={{ background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                                                title="Item cannot be changed on an existing PO line"
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
                                            readOnly={form.poLineId > 0}
                                            style={form.poLineId > 0 ? { background: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' } : {}}
                                            title={form.poLineId > 0 ? 'Item cannot be changed on an existing PO line' : ''}
                                        />
                                    </div>
                                </div>
                                <div className="prd-lf-row">
                                    <div className="prd-lf-field">
                                        <label>Ordered Qty {isReq('orderedQty') && <span className="req">*</span>}</label>
                                        <input className="prd-lf-input" type="number" name="orderedQty" value={form.orderedQty} onChange={handle} min="0" step="0.01" />
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>UOM</label>
                                        <select className="prd-lf-input" name="uomId" value={form.uomId} onChange={handle}>
                                            <option value="">— UOM —</option>
                                            {(uoms || []).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>Unit Price</label>
                                        <input className="prd-lf-input" type="number" name="unitPrice" value={form.unitPrice} onChange={handle} min="0" step="0.01" />
                                    </div>
                                    <div className="prd-lf-field">
                                        <label>Tax %</label>
                                        <select className="prd-lf-input" name="taxPct" value={form.taxPct} onChange={handle}>
                                            {getVList('Tax', 'VATRate').map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="prd-lf-row" style={{ alignItems: 'center' }}>
                                    <div className="prd-lf-field prd-lf-f2">
                                        <label>Remarks</label>
                                        <input className="prd-lf-input" type="text" name="remarks" value={form.remarks} onChange={handle} placeholder="Optional…" />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', padding: '0 8px', minWidth: 160 }}>
                                        <span style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>Preview Total</span>
                                        <span style={{ fontSize: 13, fontWeight: 600, color: '#1e40af' }}>{fmt(lineTotalWithTax())} <span style={{ fontSize: 10, color: '#64748b' }}>(incl. tax)</span></span>
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

export default PoLinesTab;
