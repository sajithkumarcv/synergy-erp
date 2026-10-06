import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { variables, authHeaders } from '../../../Variable';
import { useCurrentUser } from '../../../AuthContext';
import ConfirmModal from '../../../common/ConfirmModal';
import { useLookup } from '../../../LookupContext';
import { usePermission } from '../../../PermissionContext';
import { fmt } from '../../inventoryConstants';
import { useFieldConfig } from '../../../FieldConfigContext';

// ── Searchable item picker (server-side search on api/item/search) ─────────
// Results render in a portal with position:fixed so they are never clipped by
// the lines-table's overflow / row stacking contexts. Same component shape as
// AdjustmentLinesTab's picker.
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
            <span className="prd-lf-input" style={{
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
            <input ref={inputRef} className="prd-lf-input" placeholder="Search by item code or name…"
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

// ── Line status badge ─────────────────────────────────────────
const LINE_STATUS = {
    Pending:         { label: 'Pending',          bg: '#f1f5f9', color: '#475569' },
    PartiallyIssued: { label: 'Partially Issued', bg: '#e0f2fe', color: '#075985' },
    FullyIssued:     { label: 'Fully Issued',     bg: '#d1fae5', color: '#065f46' },
    Closed:          { label: 'Closed',           bg: '#e2e8f0', color: '#334155' },
    Cancelled:       { label: 'Cancelled',        bg: '#fce7f3', color: '#9d174d' },
};
const LineStatusBadge = ({ status }) => {
    const s = LINE_STATUS[status] || { label: status || '—', bg: '#f1f5f9', color: '#475569' };
    return (
        <span style={{ background: s.bg, color: s.color, padding: '2px 8px', borderRadius: 10, fontSize: 10.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
            {s.label}
        </span>
    );
};

// ── IssueRequestLinesTab ──────────────────────────────────────
const IssueRequestLinesTab = ({ issueRequest, lines, onRefresh }) => {
    const currentUser                  = useCurrentUser();
    const { lookups, getStatusConfig } = useLookup();
    const { isReq }                    = useFieldConfig('STOCK_ISSUE_REQUEST_LINE');
    const { uoms }                     = lookups;
    const { canDo }                    = usePermission();

    const canEdit = (getStatusConfig('ISR', issueRequest.status)?.canEdit ?? (issueRequest.status === 'Draft'))
                    && canDo('/inventory-issue-request', 'EDIT');

    // Availability for the item currently in the add/edit form. Reuses the existing
    // sp_GetStockAvailability endpoint, which already mirrors the three branches
    // sp_ConfirmStockIssue consumes stock from — so what it reports is what the
    // issue note will actually be able to give.
    const [avail,        setAvail]        = useState(null);
    const [availLoading, setAvailLoading] = useState(false);

    const loadAvailability = useCallback((itemId) => {
        if (!itemId) { setAvail(null); return; }
        setAvailLoading(true);
        const q = new URLSearchParams({ costingType: issueRequest.issueTypeCode || 'INC_COSTING' });
        if (issueRequest.jobId) q.set('jobId', issueRequest.jobId);
        fetch(`${variables.API_URL}stockissue/stockavail/${itemId}?${q}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => setAvail(d))
            .catch(() => setAvail(null))
            .finally(() => setAvailLoading(false));
    }, [issueRequest.jobId, issueRequest.issueTypeCode]);

    const EMPTY_FORM = { item: null, requestedQty: '', uomId: '', requiredDate: '', notes: '' };
    const [showForm, setShowForm] = useState(false);
    const [editLine, setEditLine] = useState(null);
    const [form,     setForm]     = useState(EMPTY_FORM);
    const [saving,   setSaving]   = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [error,    setError]    = useState('');
    const [confirm,  setConfirm]  = useState(null);

    const handle = e => setForm(p => ({ ...p, [e.target.name]: e.target.value }));

    const handleItemSelect = (item) => {
        if (!item) { setForm(f => ({ ...f, item: null })); setAvail(null); return; }
        setForm(f => ({
            ...f,
            item:  item,
            // Default the UOM to the item's base unit; the user can still change it.
            uomId: item.baseUomId ? String(item.baseUomId) : f.uomId,
        }));
        loadAvailability(item.itemId);
    };

    // ── Import from BOM ───────────────────────────────────────────────────
    const [showBom,    setShowBom]    = useState(false);
    const [bomLines,   setBomLines]   = useState([]);
    const [bomSel,     setBomSel]     = useState({});   // bomId -> { line, qty }
    const [bomLoading, setBomLoading] = useState(false);
    const [bomSaving,  setBomSaving]  = useState(false);
    const [bomError,   setBomError]   = useState('');

    const openBom = () => {
        setShowBom(true); setBomError(''); setBomSel({}); setBomLoading(true);
        fetch(`${variables.API_URL}issuerequest/bom-lines?jobId=${encodeURIComponent(issueRequest.jobId)}`,
              { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setBomLines(Array.isArray(d) ? d : []))
            .catch(() => setBomLines([]))
            .finally(() => setBomLoading(false));
    };

    const toggleBom = (b, on) => setBomSel(s => {
        const next = { ...s };
        // Never propose more than the store can give: the open BOM balance is
        // the ceiling, available stock is the reality.
        if (on) next[b.bomId] = { line: b, qty: String(Math.min(b.openQty, Math.max(b.availableQty, 0)) || 0) };
        else    delete next[b.bomId];
        return next;
    });

    const setBomQty = (b, v) => setBomSel(s =>
        s[b.bomId] ? { ...s, [b.bomId]: { ...s[b.bomId], qty: v } } : s);

    // One save per picked line, so a rejected line reports itself by name and
    // the rest still go in.
    const saveBomPicked = async () => {
        const picked = Object.values(bomSel);
        if (picked.length === 0) return;
        setBomSaving(true); setBomError('');
        const failures = [];
        for (const { line, qty } of picked) {
            const q = Number(qty);
            if (!q || q <= 0) { failures.push(`${line.itemCode}: enter a quantity`); continue; }
            try {
                const res = await fetch(`${variables.API_URL}issuerequest/line/save`, {
                    method: 'POST', headers: authHeaders(),
                    body: JSON.stringify({
                        requestLineId: 0,
                        requestId:     issueRequest.requestId,
                        itemId:        line.itemId,
                        requestedQty:  q,
                        uomId:         line.uomId ?? null,
                        bomId:         line.bomId,     // links it back to the requirement
                        requiredDate:  null,
                        notes:         null,
                        createdBy:     currentUser,
                    }),
                });
                if (!res.ok) {
                    const d = await res.json().catch(() => ({}));
                    failures.push(`${line.itemCode}: ${d?.message || 'failed'}`);
                }
            } catch { failures.push(`${line.itemCode}: network error`); }
        }
        setBomSaving(false);
        if (failures.length) setBomError(failures.join(' · '));
        else { setShowBom(false); setBomSel({}); }
        onRefresh();
    };

    const openAdd = () => {
        setEditLine(null);
        setForm({ ...EMPTY_FORM, requiredDate: issueRequest.requiredDate ? issueRequest.requiredDate.slice(0, 10) : '' });
        setAvail(null);
        setError('');
        setShowForm(true);
    };

    const openEdit = (l) => {
        setEditLine(l);
        setForm({
            item:         { itemId: l.itemId, itemCode: l.itemCode, itemName: l.itemName },
            requestedQty: l.requestedQty != null ? String(l.requestedQty) : '',
            uomId:        l.uomId ? String(l.uomId) : '',
            requiredDate: l.requiredDate ? l.requiredDate.slice(0, 10) : '',
            notes:        l.notes || '',
        });
        setError('');
        setShowForm(true);
        loadAvailability(l.itemId);
    };

    const save = () => {
        if (!form.item)                                                                          { setError('Select an item.'); return; }
        if (!form.requestedQty || isNaN(Number(form.requestedQty)) || Number(form.requestedQty) <= 0) { setError('Valid requested quantity required.'); return; }

        // The proc is what enforces this; the client check just saves a round trip.
        if (editLine && Number(form.requestedQty) < (editLine.issuedQty || 0)) {
            setError(`Requested qty cannot be less than the qty already issued (${fmt(editLine.issuedQty, 4)}).`);
            return;
        }

        setError(''); setSaving(true);
        fetch(`${variables.API_URL}issuerequest/line/save`, {
            method: 'POST', headers: authHeaders(),
            body: JSON.stringify({
                requestLineId: editLine?.requestLineId || 0,
                requestId:     issueRequest.requestId,
                itemId:        form.item.itemId,
                requestedQty:  Number(form.requestedQty),
                uomId:         form.uomId ? Number(form.uomId) : null,
                bomId:         editLine?.bomId ?? null,
                requiredDate:  form.requiredDate || null,
                notes:         form.notes.trim() || null,
                createdBy:     currentUser,
                modifiedBy:    editLine ? currentUser : null,
            }),
        })
            .then(r => r.json().then(d => ({ ok: r.ok, d })))
            .then(({ ok, d }) => {
                if (!ok) { setError(d.message || 'Error saving line.'); return; }
                setShowForm(false);
                onRefresh();
            })
            .catch(() => setError('Network error.'))
            .finally(() => setSaving(false));
    };

    const deleteLine = (lineId) => {
        setConfirm({
            title: 'Delete Line',
            message: 'Delete this request line?',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                setConfirm(null);
                setDeleting(lineId);
                try {
                    const res = await fetch(
                        `${variables.API_URL}issuerequest/line/${lineId}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() }
                    );
                    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d?.message || 'Failed to delete line.'); return; }
                    onRefresh();
                } catch { setError('Network error. Please try again.'); }
                finally { setDeleting(null); }
            },
        });
    };

    const totalRequested = lines.reduce((s, l) => s + (l.requestedQty || 0), 0);
    const totalIssued    = lines.reduce((s, l) => s + (l.issuedQty    || 0), 0);
    const totalReserved  = lines.reduce((s, l) => s + (l.reservedQty  || 0), 0);

    // Shortfall drives the warning only — never the Save button.
    const availableQty = avail?.availableQty ?? 0;
    const shortBy      = (avail && !availLoading && Number(form.requestedQty) > 0)
        ? Math.max(0, Number(form.requestedQty) - availableQty)
        : 0;

    return (
        <div>
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}

            {/* Info banner */}
            <div style={{
                padding: '8px 14px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd',
                fontSize: 12, color: '#075985', display: 'flex', alignItems: 'center', gap: 6,
            }}>
                <span>📦</span>
                <strong>Request</strong> — what site is asking the store for. Nothing moves until the
                request is approved and an Issue Note is raised against it.
            </div>

            <div className="prd-lines-wrap">
                {/* Toolbar */}
                <div className="prd-lines-header">
                    <span className="prd-lines-title">Requested Items ({lines.length})</span>
                    {canEdit && (
                        <span style={{ display: 'flex', gap: 8 }}>
                            <button className="prd-add-btn" style={{ background: '#0f766e' }}
                                onClick={openBom}>⇩ Import from BOM</button>
                            <button className="prd-add-btn" onClick={openAdd}>+ Add Line</button>
                        </span>
                    )}
                </div>

                {/* ── Import from BOM: the gross-to-net screen ──────────────────
                    A BOM line is the gross requirement. What is taken here is
                    covered from stock; what is left stays open for a PR. */}
                {showBom && (
                    <div className="prd-line-form">
                        <div className="prd-line-form-title">Import from the job's BOM</div>
                        {bomError && <div className="pf-err" style={{ marginBottom: 8 }}>{bomError}</div>}
                        {bomLoading ? (
                            <div style={{ fontSize: 12, color: '#64748b', padding: '8px 0' }}>⏳ Loading BOM lines…</div>
                        ) : bomLines.length === 0 ? (
                            <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '8px 0' }}>
                                Nothing open on this job's BOM — every line is already covered by a PR or a request.
                            </div>
                        ) : (
                            <>
                                <div style={{ overflowX: 'auto' }}>
                                    <table className="prd-lines-table">
                                        <thead>
                                            <tr>
                                                <th style={{ width: 32 }}></th>
                                                <th>Item Code</th>
                                                <th>Description</th>
                                                <th style={{ textAlign: 'right' }}>BOM Qty</th>
                                                <th style={{ textAlign: 'right' }}>On PR</th>
                                                <th style={{ textAlign: 'right' }}>Open</th>
                                                <th style={{ textAlign: 'right' }}>In Store</th>
                                                <th>UOM</th>
                                                <th style={{ textAlign: 'right' }}>Take from stock</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {bomLines.map(b => {
                                                const sel   = bomSel[b.bomId];
                                                // Propose the smaller of "what is still open" and
                                                // "what the store can actually give" — proposing more
                                                // than exists is how a request becomes a promise
                                                // nobody can keep.
                                                const short = b.openQty > b.availableQty;
                                                return (
                                                    <tr key={b.bomId}>
                                                        <td>
                                                            <input type="checkbox" checked={!!sel}
                                                                onChange={e => toggleBom(b, e.target.checked)} />
                                                        </td>
                                                        <td>
                                                            <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>
                                                                {b.itemCode}
                                                            </span>
                                                        </td>
                                                        <td style={{ color: '#1e293b' }}>{b.itemName}</td>
                                                        <td className="prd-num-cell">{fmt(b.bomRequestedQty, 4)}</td>
                                                        <td className="prd-num-cell" style={{ color: '#64748b' }}>{fmt(b.prCreatedQty, 4)}</td>
                                                        <td className="prd-num-cell" style={{ fontWeight: 600, color: '#b45309' }}>{fmt(b.openQty, 4)}</td>
                                                        <td className="prd-num-cell"
                                                            title={short ? 'Less in the store than the BOM still needs — the remainder has to be purchased' : undefined}
                                                            style={{ fontWeight: 600, color: b.availableQty > 0 ? '#166534' : '#991b1b' }}>
                                                            {fmt(b.availableQty, 4)}
                                                        </td>
                                                        <td style={{ color: '#475569' }}>{b.uomName || '—'}</td>
                                                        <td>
                                                            <input className="prd-lf-input" type="number" min="0" step="0.0001"
                                                                style={{ textAlign: 'right', width: 110 }}
                                                                disabled={!sel}
                                                                value={sel?.qty ?? ''}
                                                                onChange={e => setBomQty(b, e.target.value)} />
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div style={{ fontSize: 11, color: '#64748b', marginTop: 6 }}>
                                    Quantities default to whichever is smaller — what the BOM still has open, or what
                                    the store can actually give. Whatever you leave behind stays open on the BOM for a
                                    purchase requisition.
                                </div>
                            </>
                        )}
                        <div className="prd-lf-actions">
                            <button className="prd-lf-cancel" onClick={() => { setShowBom(false); setBomError(''); }}>Cancel</button>
                            <button className="prd-lf-save" onClick={saveBomPicked}
                                disabled={bomSaving || Object.keys(bomSel).length === 0}>
                                {bomSaving ? 'Adding…' : `Add ${Object.keys(bomSel).length || ''} line${Object.keys(bomSel).length === 1 ? '' : 's'}`}
                            </button>
                        </div>
                    </div>
                )}

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                    <table className="prd-lines-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Item Code</th>
                                <th>Description</th>
                                <th style={{ textAlign: 'right' }}>Requested</th>
                                <th style={{ textAlign: 'right' }}>Issued</th>
                                <th style={{ textAlign: 'right' }}>Reserved</th>
                                <th style={{ textAlign: 'right' }}>Balance</th>
                                <th>UOM</th>
                                <th>Required</th>
                                <th>Status</th>
                                <th>Notes</th>
                                {canEdit && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {lines.length === 0 ? (
                                <tr>
                                    <td colSpan={canEdit ? 12 : 11} className="prd-lines-empty">
                                        No lines yet. {canEdit && 'Click "+ Add Line" to begin.'}
                                    </td>
                                </tr>
                            ) : lines.map(l => (
                                <tr key={l.requestLineId}>
                                    <td><span className="prd-line-num">{l.lineNum}</span></td>
                                    <td>
                                        <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#2e5fa3', background: '#dbeafe', padding: '2px 6px', borderRadius: 4 }}>
                                            {l.itemCode || '—'}
                                        </span>
                                    </td>
                                    <td style={{ color: '#1e293b' }}>{l.itemName || '—'}</td>
                                    <td className="prd-num-cell" style={{ fontWeight: 500 }}>{fmt(l.requestedQty, 4)}</td>
                                    <td className="prd-num-cell" style={{ color: '#166534' }}>{fmt(l.issuedQty, 4)}</td>
                                    {/* Stock actually held for this line. Only ever non-zero once
                                        the request is approved — the hold is taken then, capped at
                                        what was genuinely free. */}
                                    <td className="prd-num-cell"
                                        title={l.reservedQty > 0
                                            ? `${fmt(l.reservedQty, 4)} held in the store for this line`
                                            : 'Nothing held — either not approved yet, or no free stock when it was'}
                                        style={{ color: l.reservedQty > 0 ? '#0369a1' : '#cbd5e1', fontWeight: l.reservedQty > 0 ? 600 : 400 }}>
                                        {fmt(l.reservedQty, 4)}
                                    </td>
                                    <td className="prd-num-cell" style={{ color: l.balanceQty > 0 ? '#b45309' : '#94a3b8', fontWeight: 600 }}>
                                        {fmt(l.balanceQty, 4)}
                                    </td>
                                    <td style={{ color: '#475569' }}>{l.uomName || '—'}</td>
                                    <td style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap' }}>
                                        {l.requiredDate ? l.requiredDate.slice(0, 10) : '—'}
                                    </td>
                                    <td><LineStatusBadge status={l.lineStatus} /></td>
                                    <td style={{ fontSize: 11, color: '#64748b' }}>{l.notes || '—'}</td>
                                    {canEdit && (
                                        <td>
                                            <button className="prd-line-act" onClick={() => openEdit(l)}>Edit</button>
                                            <button className="prd-line-act prd-line-del"
                                                onClick={() => deleteLine(l.requestLineId)}
                                                disabled={deleting === l.requestLineId}>
                                                {deleting === l.requestLineId ? '…' : 'Del'}
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                        {lines.length > 0 && (
                            <tfoot>
                                <tr style={{ background: '#f4f7fb', fontWeight: 600 }}>
                                    <td colSpan={3} style={{ textAlign: 'right', fontSize: 11, color: '#3a5070', padding: '8px 10px', textTransform: 'uppercase', letterSpacing: '.3px' }}>
                                        Totals
                                    </td>
                                    <td className="prd-num-cell" style={{ fontWeight: 700, color: '#1e3a5f' }}>{fmt(totalRequested, 4)}</td>
                                    <td className="prd-num-cell" style={{ fontWeight: 700, color: '#166534' }}>{fmt(totalIssued, 4)}</td>
                                    <td className="prd-num-cell" style={{ fontWeight: 700, color: '#0369a1' }}>{fmt(totalReserved, 4)}</td>
                                    <td className="prd-num-cell" style={{ fontWeight: 700, color: '#b45309' }}>{fmt(totalRequested - totalIssued, 4)}</td>
                                    <td /><td /><td /><td />{canEdit && <td />}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* ── Add / Edit inline form ── */}
                {showForm && (
                    <div className="prd-line-form">
                        <div className="prd-line-form-title">{editLine ? 'Edit Request Line' : 'Add Request Line'}</div>
                        {error && <div className="pf-err" style={{ marginBottom: 8 }}>{error}</div>}

                        {/* Availability — shown, never enforced. A request is a demand
                            document: asking for more than the store holds is legitimate and
                            is often what triggers a purchase. The reservation caps at what
                            is actually there, and sp_ConfirmStockIssue is the hard stop. */}
                        {form.item && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
                                padding: '7px 12px', marginBottom: 8, borderRadius: 6,
                                background: shortBy > 0 ? '#fffbeb' : '#f8fafc',
                                border: `1px solid ${shortBy > 0 ? '#fcd34d' : '#e2e8f0'}`,
                                fontSize: 11.5,
                            }}>
                                {availLoading ? <span style={{ color: '#64748b' }}>⏳ Checking stock…</span> : (
                                    <>
                                        <span style={{ color: '#475569' }}>
                                            Available to issue:{' '}
                                            <strong style={{ color: availableQty > 0 ? '#166534' : '#991b1b', fontSize: 13 }}>
                                                {fmt(availableQty, 4)}
                                            </strong>
                                        </span>
                                        <span style={{ color: '#64748b' }}>Store: <strong>{fmt(avail?.storeStock ?? 0, 4)}</strong></span>
                                        <span style={{ color: '#64748b' }}>Job stock: <strong>{fmt(avail?.jobStock ?? 0, 4)}</strong></span>
                                    </>
                                )}
                            </div>
                        )}

                        {shortBy > 0 && (
                            <div style={{
                                padding: '8px 12px', marginBottom: 8, borderRadius: 6,
                                background: '#fffbeb', border: '1px solid #fcd34d',
                                color: '#92400e', fontSize: 12,
                            }}>
                                ⚠ Requesting <strong>{fmt(shortBy, 4)}</strong> more than is available to issue
                                {(avail?.jobStock ?? 0) > 0 && (avail?.storeStock ?? 0) <= 0 && (
                                    <> — all {fmt(avail.jobStock, 4)} on hand is held as <strong>job stock</strong>, not store stock</>
                                )}
                                . You can still raise the request; the shortfall will need purchasing
                                before it can be issued.
                            </div>
                        )}

                        <div className="prd-lf-row">
                            <div className="prd-lf-field prd-lf-f2">
                                <label>Item {isReq('itemId') && <span className="req">*</span>}</label>
                                <ItemSearchSelect value={form.item} onSelect={handleItemSelect} />
                            </div>
                            <div className="prd-lf-field">
                                <label>Requested Qty {isReq('requestedQty') && <span className="req">*</span>}</label>
                                <input className="prd-lf-input" type="number" name="requestedQty"
                                    value={form.requestedQty} onChange={handle} min="0" step="0.0001" />
                                {editLine && editLine.issuedQty > 0 && (
                                    <div style={{ fontSize: 10.5, marginTop: 3, color: '#64748b' }}>
                                        Already issued: <strong style={{ color: '#166534' }}>{fmt(editLine.issuedQty, 4)}</strong> — cannot go below this
                                    </div>
                                )}
                            </div>
                            <div className="prd-lf-field">
                                <label>UOM</label>
                                <select className="prd-lf-input" name="uomId" value={form.uomId} onChange={handle}>
                                    <option value="">— None —</option>
                                    {(uoms || []).map(u => (
                                        <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="prd-lf-row">
                            <div className="prd-lf-field">
                                <label>Required Date</label>
                                <input className="prd-lf-input" type="date" name="requiredDate"
                                    value={form.requiredDate} onChange={handle} />
                            </div>
                            <div className="prd-lf-field prd-lf-f2">
                                <label>Notes</label>
                                <input className="prd-lf-input" type="text" name="notes" value={form.notes}
                                    onChange={handle} placeholder="Optional line note…" />
                            </div>
                        </div>

                        <div className="prd-lf-actions">
                            <button className="prd-lf-cancel" onClick={() => { setShowForm(false); setError(''); }}>Cancel</button>
                            <button className="prd-lf-save" onClick={save} disabled={saving}>
                                {saving ? 'Saving…' : editLine ? 'Update Line' : 'Add Line'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default IssueRequestLinesTab;
