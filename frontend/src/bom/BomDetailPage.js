import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useCurrentUser, useCurrentUserId } from '../AuthContext';
import { useLookup } from '../LookupContext';
import { usePermission } from '../PermissionContext';
import { fmt, fmtDate } from '../inventory/inventoryConstants';
import ApprovalHistoryTab   from '../approval/ApprovalHistoryTab';
import ApprovalStatusBanner from '../approval/ApprovalStatusBanner';
import JobClosedBanner      from '../jobs/JobClosedBanner';
import AmountInput          from '../common/AmountInput';
import BomImportModal       from './BomImportModal';
import '../inventory/Inventory.css';

// ── BOM line status colours ─────────────────────────────────────
const LINE_STATUS = {
    Pending:         { bg: '#f1f5f9', color: '#64748b' },
    PRPartial:       { bg: '#fef3c7', color: '#92400e' },
    PRRaised:        { bg: '#fef9c3', color: '#854d0e' },
    POPartial:       { bg: '#ede9fe', color: '#5b21b6' },
    PORaised:        { bg: '#ddd6fe', color: '#4c1d95' },
    PartialReceived: { bg: '#cffafe', color: '#164e63' },
    FullyReceived:   { bg: '#dcfce7', color: '#166534' },
};

// ── KPI chip with portal tooltip (never clipped by overflow) ───
const KpiChip = ({ label, count, active, onClick, bg, color, activeBg, tooltip }) => {
    const [rect, setRect] = useState(null);
    const btnRef = useRef(null);

    const showTip = () => {
        if (btnRef.current) setRect(btnRef.current.getBoundingClientRect());
    };
    const hideTip = () => setRect(null);

    // Decide: show above or below based on available space
    const spaceAbove = rect ? rect.top : 999;
    const below      = spaceAbove < 100;   // less than 100px above → flip to below

    return (
        <div style={{ display: 'inline-block' }}>
            <button
                ref={btnRef}
                onClick={onClick}
                onMouseEnter={showTip}
                onMouseLeave={hideTip}
                style={{
                    padding: '4px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontSize: 11, fontWeight: 700, transition: 'all .15s',
                    background: active ? (activeBg || color) : bg,
                    color:      active ? '#fff' : color,
                    boxShadow:  active ? `0 0 0 2px ${color}40` : 'none',
                }}>
                {label} <span style={{ fontWeight: 400, marginLeft: 3, opacity: .85 }}>{count}</span>
            </button>

            {rect && tooltip && ReactDOM.createPortal(
                <div style={{
                    position:   'fixed',
                    left:       Math.min(rect.left + rect.width / 2, window.innerWidth - 120),
                    ...(below
                        ? { top: rect.bottom + 8 }
                        : { top: rect.top - 8, transform: 'translateY(-100%)' }),
                    transform:  `translateX(-50%)${below ? '' : ' translateY(-100%)'}`,
                    background: '#1e293b',
                    color:      '#f1f5f9',
                    fontSize:   11,
                    fontWeight: 400,
                    lineHeight: 1.6,
                    padding:    '8px 12px',
                    borderRadius: 7,
                    width:      220,
                    boxShadow:  '0 4px 20px rgba(0,0,0,.28)',
                    zIndex:     99999,
                    pointerEvents: 'none',
                }}>
                    {tooltip}
                    {/* Arrow */}
                    <div style={{
                        position:    'absolute',
                        left:        '50%',
                        transform:   'translateX(-50%)',
                        width: 0, height: 0,
                        ...(below ? {
                            bottom:      '100%',
                            borderLeft:  '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderBottom:'6px solid #1e293b',
                        } : {
                            top:         '100%',
                            borderLeft:  '6px solid transparent',
                            borderRight: '6px solid transparent',
                            borderTop:   '6px solid #1e293b',
                        }),
                    }} />
                </div>,
                document.body
            )}
        </div>
    );
};

// ── Highlight matched text ──────────────────────────────────────
const Highlight = ({ text, query }) => {
    if (!query || !text) return <>{text || ''}</>;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return <>{text}</>;
    return (
        <>
            {text.slice(0, idx)}
            <mark style={{ background: '#fef08a', color: '#713f12', borderRadius: 2, padding: '0 1px' }}>
                {text.slice(idx, idx + query.length)}
            </mark>
            {text.slice(idx + query.length)}
        </>
    );
};

// bomDetailStatuses prop is optional — badge falls back to the status value string
const LineBadge = ({ status, statusList }) => {
    const s     = LINE_STATUS[status] || LINE_STATUS.Pending;
    const label = statusList?.find(v => v.value === status)?.label || status;
    return (
        <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                       background: s.bg, color: s.color, whiteSpace: 'nowrap' }}>
            {label}
        </span>
    );
};

// ── Item search dropdown ────────────────────────────────────────
// Uses a React portal + position:fixed so the list is never clipped by
// overflow:hidden / overflow:auto ancestors (table scroll container, section wrapper).
const ItemSearch = ({ value, label, onSelect }) => {
    const [query,    setQuery]    = useState(label || '');
    const [results,  setResults]  = useState([]);
    const [totalRows, setTotalRows] = useState(0);
    const [open,     setOpen]     = useState(false);
    const [dropRect, setDropRect] = useState(null);
    const timer    = useRef(null);
    const wrap     = useRef(null);
    const inputRef = useRef(null);
    const dropRef  = useRef(null);

    // Close when clicking outside both the input wrapper AND the portal dropdown
    useEffect(() => {
        const h = e => {
            if (
                wrap.current    && !wrap.current.contains(e.target) &&
                (!dropRef.current || !dropRef.current.contains(e.target))
            ) setOpen(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    useEffect(() => { if (label && !query) setQuery(label); }, [label]);  // eslint-disable-line

    // Keep dropdown aligned while open (handles scroll / resize)
    useEffect(() => {
        if (!open || !inputRef.current) return;
        const update = () => {
            const r = inputRef.current?.getBoundingClientRect();
            if (r) setDropRect(r);
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [open]);

    const search = (q) => {
        setQuery(q);
        clearTimeout(timer.current);
        if (!q.trim()) { setResults([]); setTotalRows(0); setOpen(false); return; }
        timer.current = setTimeout(async () => {
            try {
                const r = await fetch(`${variables.API_URL}item/search?searchText=${encodeURIComponent(q)}&pageSize=25`, { headers: authHeaders() });
                const d = await r.json();
                const list = d.data || d || [];
                setResults(list);
                setTotalRows(d.totalRows ?? list.length);
                setOpen(true);
            } catch { setResults([]); setTotalRows(0); }
        }, 300);
    };

    const select = (item) => {
        setQuery(`${item.itemCode} — ${item.itemName}`);
        setOpen(false);
        onSelect(item);
    };

    return (
        <div ref={wrap} style={{ position: 'relative', minWidth: 220 }}>
            <input
                ref={inputRef}
                className="invd-input"
                placeholder="Search item…"
                value={query}
                onChange={e => search(e.target.value)}
                style={{ fontSize: 12 }}
            />
            {open && results.length > 0 && dropRect && ReactDOM.createPortal(
                <div
                    ref={dropRef}
                    style={{
                        position:  'fixed',
                        top:       dropRect.bottom + 2,
                        left:      dropRect.left,
                        width:     Math.max(dropRect.width, 340),
                        background: '#fff',
                        border:    '1px solid #e2e8f0',
                        borderRadius: 6,
                        boxShadow: '0 4px 16px rgba(0,0,0,.12)',
                        zIndex:    9999,
                        maxHeight: 220,
                        overflowY: 'auto',
                    }}>
                    {results.map(item => (
                        <div key={item.itemId}
                            // onMouseDown keeps focus on the input so the portal close-handler
                            // still sees the click as "inside dropRef"
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => select(item)}
                            style={{ padding: '7px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <span style={{ fontWeight: 700, color: '#1e40af', marginRight: 6 }}>{item.itemCode}</span>
                            <span>{item.itemName}</span>
                        </div>
                    ))}
                    {totalRows > results.length && (
                        <div style={{ padding: '6px 10px', fontSize: 11, color: '#94a3b8', fontStyle: 'italic', background: '#f8fafc' }}>
                            Showing {results.length} of {totalRows} matches — keep typing to narrow down
                        </div>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
};

// ── Add / Edit line form (inline within section) ────────────────
const LineForm = ({ line, sections, bomDetailStatuses, onSave, onCancel, saving, saveError, allDetails = [] }) => {
    const prCreatedQty = line?.prCreatedQty || 0;   // qty already raised in PRs (0 for new lines)

    const [form, setForm] = useState({
        bomId:               line?.bomId               ?? 0,
        bomHeaderId:         line?.bomHeaderId         ?? 0,
        jobId:               line?.jobId               ?? '',
        bomSectionId:        line?.bomSectionId        ?? (sections[0]?.bomSectionId ?? 0),
        itemId:              line?.itemId              ?? 0,
        itemLabel:           line?.itemCode ? `${line.itemCode} — ${line.itemName || ''}` : '',
        uomId:               line?.uomId               ?? 0,
        uomCode:             line?.uomCode             ?? '',
        bomRequestedQty:     line?.bomRequestedQty     ?? '',
        bomPrice:            line?.bomPrice            ?? '',
        exchangeRate:        line?.exchangeRate        ?? 1,
        itemReqDate:         line?.itemReqDate         ? line.itemReqDate.slice(0, 10) : '',
        expectedDelivery:    line?.expectedDelivery    ? line.expectedDelivery.slice(0, 10) : '',
        isCritical:          line?.isCritical          ?? false,
        isSubstituteAllowed: line?.isSubstituteAllowed ?? false,
        remarks:             line?.remarks             ?? '',
        sortOrder:           line?.sortOrder           ?? 0,
    });
    const [err,          setErr]          = useState({});
    const [dupItem,      setDupItem]      = useState(null);  // existing line if duplicate, null otherwise
    const [priceLoading, setPriceLoading] = useState(false);
    // Selectable UOMs for the chosen item = base UOM + any UOM that converts to it.
    // Authoring the BOM line in a larger UOM (e.g. BOX) lets the chain (PR→PO→GRN)
    // stay in that UOM and convert to base at GRN stock posting.
    const [uomOptions, setUomOptions] = useState([]);
    const [baseUom,    setBaseUom]    = useState(null);   // { id, code }

    // Clear duplicate flag if the item field is cleared
    useEffect(() => { if (!form.itemId) setDupItem(null); }, [form.itemId]);

    // Build the UOM option list whenever the selected item changes
    useEffect(() => {
        if (!form.itemId) { setUomOptions([]); setBaseUom(null); return; }
        let cancelled = false;
        (async () => {
            try {
                const [defRes, convRes] = await Promise.all([
                    fetch(`${variables.API_URL}bom/item-defaults/${form.itemId}`, { headers: authHeaders() }),
                    fetch(`${variables.API_URL}item/${form.itemId}/uom-conversions`, { headers: authHeaders() }),
                ]);
                const def  = defRes.ok  ? await defRes.json()  : {};
                const conv = convRes.ok ? await convRes.json() : [];
                const baseId   = def.baseUomId;
                const baseCode = def.baseUomCode;
                const opts = [];
                if (baseId) opts.push({ id: baseId, code: baseCode });
                (Array.isArray(conv) ? conv : [])
                    .filter(c => c.toUomId === baseId && c.isActive !== false)
                    .forEach(c => { if (!opts.some(o => o.id === c.fromUomId)) opts.push({ id: c.fromUomId, code: c.fromUomCode }); });
                // keep the line's current UOM visible even if it predates a conversion change
                if (form.uomId && !opts.some(o => o.id === form.uomId)) opts.push({ id: form.uomId, code: form.uomCode });
                if (!cancelled) { setUomOptions(opts); setBaseUom(baseId ? { id: baseId, code: baseCode } : null); }
            } catch { /* leave as-is */ }
        })();
        return () => { cancelled = true; };
    }, [form.itemId]);  // eslint-disable-line react-hooks/exhaustive-deps

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const validate = () => {
        const e = {};
        if (!form.itemId)                                                e.item    = 'Item is required.';
        else if (dupItem)                                                e.item    = 'Item already exists in this BOM — edit that line to update the qty.';
        if (!form.bomSectionId)                                          e.section = 'Section is required.';
        if (!form.uomId)                                                 e.uom     = 'UOM is required.';
        if (!form.bomRequestedQty || parseFloat(form.bomRequestedQty) <= 0)
            e.qty = 'Qty > 0 required.';
        else if (prCreatedQty > 0 && parseFloat(form.bomRequestedQty) < prCreatedQty)
            e.qty = `Cannot be less than PR raised qty (${fmt(prCreatedQty, 4)}).`;
        return e;
    };

    const handleSave = () => {
        const e = validate();
        setErr(e);
        if (Object.keys(e).length) return;
        onSave(form);
    };

    return (
        <tr style={{ background: '#f0f9ff' }}>
            <td colSpan={14} style={{ padding: '12px 14px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
                    {/* Section — locked. Add Line is launched from a specific section
                        accordion, and Edit happens inside the section the line already
                        lives in. Moving a line across sections via this inline form would
                        be confusing and risks silently re-categorising tracked qty. */}
                    <div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Section *</div>
                        <select className="invd-select" value={form.bomSectionId}
                            onChange={e => set('bomSectionId', parseInt(e.target.value))}
                            disabled
                            title="Section is fixed at the level you opened this from."
                            style={{
                                fontSize: 12, minWidth: 160,
                                background: '#f1f5f9', color: '#475569',
                                cursor: 'not-allowed',
                            }}>
                            {sections.map(s => (
                                <option key={s.bomSectionId} value={s.bomSectionId}>
                                    {s.sectionCode} — {s.sectionName}
                                </option>
                            ))}
                        </select>
                        {err.section && <div style={{ color: '#dc2626', fontSize: 10 }}>{err.section}</div>}
                    </div>
                    {/* Item */}
                    <div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Item *</div>
                        <ItemSearch
                            value={form.itemId}
                            label={form.itemLabel}
                            onSelect={async (item) => {
                                // Duplicate check — block if this itemId already exists in any section
                                // (exclude the line currently being edited, identified by bomId)
                                const existing = allDetails.find(
                                    d => d.itemId === item.itemId && d.bomId !== (line?.bomId ?? 0)
                                );
                                setDupItem(existing || null);

                                // Apply what we already have from the search result immediately
                                // sp_SearchItems returns BaseUomCode (not BaseUom)
                                setForm(f => ({
                                    ...f,
                                    itemId:    item.itemId,
                                    itemLabel: `${item.itemCode} — ${item.itemName}`,
                                    uomId:     item.baseUomId   || f.uomId,
                                    uomCode:   item.baseUomCode || f.uomCode,
                                }));
                                // Fetch UOM + last purchase price from DB
                                setPriceLoading(true);
                                try {
                                    const r = await fetch(
                                        `${variables.API_URL}bom/item-defaults/${item.itemId}`,
                                        { headers: authHeaders() }
                                    );
                                    if (r.ok) {
                                        const d = await r.json();
                                        setForm(f => ({
                                            ...f,
                                            uomId:    d.baseUomId   || f.uomId,
                                            uomCode:  d.baseUomCode || f.uomCode,
                                            bomPrice: d.lastPurchasePrice > 0
                                                ? String(d.lastPurchasePrice)
                                                : f.bomPrice,
                                        }));
                                    }
                                } catch { /* leave fields as-is */ }
                                finally { setPriceLoading(false); }
                            }}
                        />
                        {err.item && <div style={{ color: '#dc2626', fontSize: 10, marginTop: 3 }}>{err.item}</div>}
                        {dupItem && (
                            <div style={{ marginTop: 5, padding: '7px 10px', background: '#fef2f2',
                                          border: '1px solid #fca5a5', borderRadius: 6,
                                          fontSize: 11, color: '#991b1b', maxWidth: 320, lineHeight: 1.6 }}>
                                <div style={{ fontWeight: 700, marginBottom: 2 }}>
                                    ❌ Item already in this BOM
                                </div>
                                <div>
                                    <strong>{dupItem.itemCode}</strong> — {dupItem.itemName}
                                </div>
                                <div style={{ marginTop: 2, color: '#b91c1c' }}>
                                    Section: <strong>{dupItem.sectionName || dupItem.sectionCode || '—'}</strong>
                                    &nbsp;·&nbsp; Current Qty: <strong>{fmt(dupItem.bomRequestedQty, 4)} {dupItem.uomCode}</strong>
                                </div>
                                <div style={{ marginTop: 4, color: '#7f1d1d', fontStyle: 'italic' }}>
                                    Find that line and edit the quantity instead of adding a new line.
                                </div>
                            </div>
                        )}
                    </div>
                    {/* UOM — base + any UOM that converts to base (e.g. BOX) */}
                    <div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>UOM *</div>
                        {uomOptions.length > 1 ? (
                            <select className="invd-select" value={form.uomId}
                                onChange={e => {
                                    const id = Number(e.target.value);
                                    const opt = uomOptions.find(o => o.id === id);
                                    setForm(f => ({ ...f, uomId: id, uomCode: opt?.code || f.uomCode }));
                                }}
                                style={{ fontSize: 12, width: 90, borderColor: err.uom ? '#dc2626' : '' }}>
                                {uomOptions.map(o => <option key={o.id} value={o.id}>{o.code}</option>)}
                            </select>
                        ) : (
                            <input className="invd-input" value={form.uomCode} readOnly
                                style={{ fontSize: 12, width: 70, background: '#f8fafc' }} />
                        )}
                        {baseUom && form.uomId && form.uomId !== baseUom.id && (
                            <div style={{ fontSize: 10, color: '#0369a1', marginTop: 2, whiteSpace: 'nowrap' }}>
                                → stocks as {baseUom.code}
                            </div>
                        )}
                    </div>
                    {/* Req Qty */}
                    <div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>
                            Req Qty *
                            {prCreatedQty > 0 && (
                                <span style={{ marginLeft: 5, color: '#92400e', fontWeight: 700 }}>
                                    (min {fmt(prCreatedQty, 4)} — PR raised)
                                </span>
                            )}
                        </div>
                        <input className="invd-input" type="number" step="0.0001"
                            min={prCreatedQty > 0 ? prCreatedQty : 0}
                            value={form.bomRequestedQty}
                            onChange={e => set('bomRequestedQty', e.target.value)}
                            style={{ fontSize: 12, width: 110,
                                     borderColor: err.qty ? '#dc2626' : '' }} />
                        {err.qty && <div style={{ color: '#dc2626', fontSize: 10 }}>{err.qty}</div>}
                    </div>
                    {/* Unit Price */}
                    <div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>
                            Unit Price
                            {priceLoading && (
                                <span style={{ marginLeft: 5, color: '#3b82f6', fontSize: 10 }}>loading…</span>
                            )}
                        </div>
                        <AmountInput className="invd-input" decimals={4}
                            value={form.bomPrice}
                            onChange={v => set('bomPrice', v)}
                            disabled={priceLoading}
                            style={{ fontSize: 12, width: 100, opacity: priceLoading ? 0.6 : 1 }} />
                    </div>
                    {/* Req Date */}
                    <div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Req Date</div>
                        <input className="invd-input" type="date" value={form.itemReqDate}
                            onChange={e => set('itemReqDate', e.target.value)}
                            style={{ fontSize: 12 }} />
                    </div>
                    {/* Expected Delivery */}
                    <div>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Exp. Delivery</div>
                        <input className="invd-input" type="date" value={form.expectedDelivery}
                            onChange={e => set('expectedDelivery', e.target.value)}
                            style={{ fontSize: 12 }} />
                    </div>
                    {/* Flags */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.isCritical}
                                onChange={e => set('isCritical', e.target.checked)} />
                            Critical
                        </label>
                        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                            <input type="checkbox" checked={form.isSubstituteAllowed}
                                onChange={e => set('isSubstituteAllowed', e.target.checked)} />
                            Substitute OK
                        </label>
                    </div>
                    {/* Remarks */}
                    <div style={{ flex: 1, minWidth: 140 }}>
                        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>Remarks</div>
                        <input className="invd-input" value={form.remarks}
                            onChange={e => set('remarks', e.target.value)}
                            placeholder="Optional…" style={{ fontSize: 12 }} />
                    </div>
                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 6, alignSelf: 'flex-end', paddingBottom: 1 }}>
                        <button className="inv-btn inv-btn-ghost" onClick={onCancel} disabled={saving} style={{ fontSize: 12 }}>Cancel</button>
                        <button className="inv-btn inv-btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 12 }}>
                            {saving ? 'Saving…' : (form.bomId ? 'Update' : 'Add')}
                        </button>
                    </div>
                </div>
                {/* Server-side error banner — surfaces messages from sp_AssertJobOpen,
                    sp_AssertBudgetApproved, FK violations, SP RAISERROR, etc. without
                    a popup. WriteLog has already persisted the full exception. */}
                {saveError && (
                    <div style={{
                        marginTop: 10,
                        padding: '8px 12px',
                        background: '#fef2f2',
                        border: '1px solid #fecaca',
                        borderLeft: '4px solid #dc2626',
                        borderRadius: 6,
                        color: '#991b1b',
                        fontSize: 12,
                        lineHeight: 1.5,
                    }}>
                        <strong>Could not save: </strong>{saveError}
                    </div>
                )}
            </td>
        </tr>
    );
};

// ── Section accordion ───────────────────────────────────────────
// `bomSectionId` is the SECTION'S id passed down from the parent. We no longer
// look it up by sectionCode here — SectionCode is NULL for migrated sections,
// which used to collapse every NULL-code section onto the first one in the
// master list and silently put new lines under the wrong section.
const SectionGroup = ({ bomSectionId, sectionCode, sectionName, sectionSortOrder, lines, isApproved, sections, bomDetailStatuses, bomHeaderId, jobId, currentUser, onRefresh, searchQuery = '', forceOpen = false, allDetails = [] }) => {
    const [open,     setOpen]     = useState(true);

    // Auto-expand when a filter is active, restore when cleared
    useEffect(() => { if (forceOpen) setOpen(true); }, [forceOpen]);

    // ── Column sort state ─────────────────────────────────────────
    const [sortCol, setSortCol] = useState('');   // field key or ''
    const [sortDir, setSortDir] = useState('asc');

    const SORTABLE = {
        '#':        (r) => r.sortOrder ?? 0,
        'Item':     (r) => ((r.itemCode || '') + ' ' + (r.itemName || '')).toLowerCase(),
        'UOM':      (r) => (r.uomCode || '').toLowerCase(),
        'Req Qty':  (r) => r.bomRequestedQty ?? 0,
        'Price':    (r) => r.bomPrice ?? 0,
        'Total':    (r) => r.lineTotal ?? 0,
        'PR Qty':   (r) => r.prCreatedQty ?? 0,
        'PO Qty':   (r) => r.poCreatedQty ?? 0,
        'Recv Qty': (r) => r.bomReceivedQty ?? 0,
        'Bal Qty':  (r) => r.balanceQty ?? 0,
        'Req Date': (r) => r.itemReqDate || '',
        'Status':   (r) => (r.bomStatus || '').toLowerCase(),
    };

    const toggleSort = (col) => {
        if (!SORTABLE[col]) return;
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
    };

    // ── Drag-to-reorder state ─────────────────────────────────────
    const [dragIdx,      setDragIdx]      = useState(null);
    const [dragOverIdx,  setDragOverIdx]  = useState(null);
    const [reordering,   setReordering]   = useState(false);

    // Base lines: sorted if a sort column is active, otherwise original order
    const sortedLines = React.useMemo(() => {
        if (!sortCol || !SORTABLE[sortCol]) return lines;
        const fn = SORTABLE[sortCol];
        return [...lines].sort((a, b) => {
            const av = fn(a), bv = fn(b);
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ?  1 : -1;
            return 0;
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lines, sortCol, sortDir]);

    const [localLines, setLocalLines] = useState(sortedLines);

    // Keep localLines in sync when parent reloads OR sort changes
    useEffect(() => { setLocalLines(sortedLines); }, [sortedLines]);

    const handleDragStart = (e, idx) => {
        setDragIdx(idx);
        e.dataTransfer.effectAllowed = 'move';
        // Needed for Firefox
        e.dataTransfer.setData('text/plain', idx);
    };
    const handleDragOver = (e, idx) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (idx !== dragOverIdx) setDragOverIdx(idx);
    };
    const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

    const handleDrop = async (e, dropIdx) => {
        e.preventDefault();
        setDragOverIdx(null);
        if (dragIdx === null || dragIdx === dropIdx) { setDragIdx(null); return; }

        // Reorder locally (optimistic)
        const reordered = [...localLines];
        const [moved] = reordered.splice(dragIdx, 1);
        reordered.splice(dropIdx, 0, moved);
        setLocalLines(reordered);
        setDragIdx(null);

        // Persist new sort orders
        setReordering(true);
        try {
            const order = reordered.map((l, i) => ({ bomId: l.bomId, sortOrder: (i + 1) * 10 }));
            await fetch(`${variables.API_URL}bom/detail/reorder`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ bomHeaderId, modifiedBy: currentUser, order }),
            });
            onRefresh();
        } catch { onRefresh(); }  // refresh even on error to restore server state
        finally { setReordering(false); }
    };
    const [editLine, setEditLine] = useState(null);  // null | 'new' | row-object
    const [saving,   setSaving]   = useState(false);
    const [deleting, setDeleting] = useState(null);

    const sectionTotal = lines.reduce((s, r) => s + (r.lineTotal || 0), 0);

    const thisSectionId = bomSectionId;

    // Surfaced inside the inline LineForm so the user sees server errors
    // (budget guard, FK violation, SP RAISERROR, etc.) without an alert popup,
    // and they don't lose what they typed.
    const [saveError, setSaveError] = useState('');

    const saveLine = async (form) => {
        setSaveError('');
        setSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}bom/detail/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    bomId:               form.bomId,
                    bomHeaderId,
                    jobId,
                    bomSectionId:        form.bomSectionId,
                    itemId:              form.itemId,
                    itemDetailId:        null,
                    sortOrder:           form.sortOrder || 0,
                    bomRequestedQty:     parseFloat(form.bomRequestedQty)  || 0,
                    uomId:               form.uomId,
                    bomPrice:            parseFloat(form.bomPrice)         || 0,
                    currencyId:          null,
                    exchangeRate:        parseFloat(form.exchangeRate)     || 1,
                    itemReqDate:         form.itemReqDate      || null,
                    expectedDelivery:    form.expectedDelivery || null,
                    isCritical:          form.isCritical,
                    isSubstituteAllowed: form.isSubstituteAllowed,
                    remarks:             form.remarks || null,
                    createdBy:           currentUser,
                    modifiedBy:          currentUser,
                }),
            });
            // Parse defensively — the server may return a non-JSON body on 500.
            const d = await res.json().catch(() => ({}));
            if (!res.ok) {
                setSaveError(d?.message || `Save failed (HTTP ${res.status}).`);
                return;
            }
            setEditLine(null);
            onRefresh();
        } catch (e) {
            // Network failure, JSON parse error, etc. — show the user something
            // useful instead of leaving the button stuck on "Saving…".
            setSaveError(`Network error — ${e?.message || 'could not reach the server.'} Please try again.`);
        } finally {
            setSaving(false);
        }
    };

    const [pendingDeleteLineId, setPendingDeleteLineId] = useState(null);
    const [lineDeleteError,     setLineDeleteError]     = useState('');

    const confirmDeleteLine = async () => {
        setLineDeleteError('');
        setDeleting(pendingDeleteLineId);
        try {
            const res = await fetch(`${variables.API_URL}bom/detail/${pendingDeleteLineId}`, {
                method: 'DELETE', headers: authHeaders(),
                body: JSON.stringify({ modifiedBy: currentUser }),
            });
            if (!res.ok) { const d = await res.json(); setLineDeleteError(d?.message || 'Delete failed.'); return; }
            setPendingDeleteLineId(null);
            onRefresh();
        } finally { setDeleting(null); }
    };

    const deleteLine = (bomId) => {
        setLineDeleteError('');
        setPendingDeleteLineId(bomId);
    };

    // Drag handle column is always present — reordering is display-only and allowed on any status.
    const COLS      = ['', '#', 'Item', 'UOM', 'Req Qty', 'Price', 'Total', 'PR Qty', 'PO Qty', 'Recv Qty', 'Bal Qty', 'Req Date', 'Status', ''];
    const RIGHT_COLS = new Set(['Req Qty', 'Price', 'Total', 'PR Qty', 'PO Qty', 'Recv Qty', 'Bal Qty']);
    const colSpan    = COLS.length;

    return (
        <>
        <div style={{ marginBottom: 10, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            {/* Section header row */}
            <div
                onClick={() => setOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', padding: '10px 14px',
                         background: '#f8fafc', borderBottom: open ? '1px solid #e2e8f0' : 'none',
                         cursor: 'pointer', userSelect: 'none' }}>
                <span style={{ fontSize: 13, marginRight: 8, color: '#64748b' }}>{open ? '▾' : '▸'}</span>
                <span style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 13, marginRight: 8 }}>
                    [{sectionCode}] {sectionName}
                </span>
                <span style={{ fontSize: 12, color: '#94a3b8', marginRight: 'auto' }}>
                    {lines.length} {lines.length === 1 ? 'line' : 'lines'}
                    {reordering && <span style={{ marginLeft: 8, color: '#3b82f6', fontStyle: 'italic' }}>saving order…</span>}
                </span>
                {sectionTotal > 0 && (
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1e3a5f', marginRight: 12 }}>
                        {fmt(sectionTotal)}
                    </span>
                )}
                {!isApproved && (
                    <button
                        className="inv-btn inv-btn-ghost"
                        style={{ fontSize: 11, padding: '3px 10px' }}
                        onClick={e => { e.stopPropagation(); setEditLine('new'); setOpen(true); }}>
                        + Add Line
                    </button>
                )}
            </div>

            {open && (
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
                                {COLS.map((h, ci) => {
                                    const sortable = !!SORTABLE[h];
                                    const active   = sortCol === h;
                                    return (
                                        <th key={ci}
                                            onClick={sortable ? () => toggleSort(h) : undefined}
                                            style={{
                                                padding: '6px 10px',
                                                textAlign: RIGHT_COLS.has(h) ? 'right' : 'left',
                                                fontSize: 10, fontWeight: 700,
                                                color: active ? '#1e40af' : '#64748b',
                                                textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap',
                                                width: h === '' && ci === 0 ? 28 : undefined,
                                                cursor: sortable ? 'pointer' : 'default',
                                                userSelect: 'none',
                                                background: active ? '#e0e7ff' : undefined,
                                            }}>
                                            {h}
                                            {sortable && (
                                                <span style={{ marginLeft: 3, opacity: active ? 1 : 0.3 }}>
                                                    {active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅'}
                                                </span>
                                            )}
                                        </th>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {localLines.map((r, i) => (
                                editLine?.bomId === r.bomId ? (
                                    <LineForm key={r.bomId} line={editLine} sections={sections} bomDetailStatuses={bomDetailStatuses}
                                        onSave={saveLine} onCancel={() => { setSaveError(''); setEditLine(null); }} saving={saving} saveError={saveError}
                                        allDetails={allDetails} />
                                ) : (
                                    <tr
                                        key={r.bomId}
                                        draggable
                                        onDragStart={(e) => handleDragStart(e, i)}
                                        onDragOver ={(e) => handleDragOver(e, i)}
                                        onDrop     ={(e) => handleDrop(e, i)}
                                        onDragEnd  ={handleDragEnd}
                                        style={{
                                            background:   dragOverIdx === i ? '#dbeafe'
                                                        : dragIdx    === i ? '#f0f9ff'
                                                        : i % 2 === 0      ? '#fff' : '#f8fafc',
                                            borderBottom: dragOverIdx === i
                                                ? '2px solid #3b82f6'
                                                : '1px solid #f1f5f9',
                                            opacity:      dragIdx === i ? 0.5 : 1,
                                            transition:   'background .1s, border-color .1s',
                                        }}>
                                        {/* Drag handle — always visible, reordering is display-only */}
                                        <td style={{ padding: '0 6px', textAlign: 'center', width: 24,
                                                     cursor: 'grab', userSelect: 'none' }}
                                            title="Drag to reorder">
                                            <span style={{
                                                display: 'inline-grid',
                                                gridTemplateColumns: '4px 4px',
                                                gap: '3px',
                                                padding: '2px 0',
                                            }}>
                                                {[0,1,2,3,4,5].map(d => (
                                                    <span key={d} style={{
                                                        width: 3, height: 3, borderRadius: '50%',
                                                        background: '#94a3b8', display: 'block',
                                                    }} />
                                                ))}
                                            </span>
                                        </td>
                                        <td style={{ padding: '8px 10px', textAlign: 'center', color: '#94a3b8', fontSize: 11, fontWeight: 600, width: 36, userSelect: 'none' }}>
                                            {i + 1}
                                        </td>
                                        <td style={{ padding: '8px 10px', minWidth: 160 }}>
                                            <div style={{ fontWeight: 600, color: '#1e40af', fontSize: 12 }}>
                                                <Highlight text={r.itemCode} query={searchQuery} />
                                            </div>
                                            <div style={{ fontSize: 11, color: '#64748b' }}>
                                                <Highlight text={r.itemName} query={searchQuery} />
                                            </div>
                                            {r.isCritical && <span style={{ fontSize: 10, color: '#dc2626', fontWeight: 700 }}>⚑ Critical</span>}
                                            {r.isSubstituteAllowed && <span style={{ fontSize: 10, color: '#6366f1', marginLeft: 4 }}>↔ Sub OK</span>}
                                        </td>
                                        <td style={{ padding: '8px 10px', color: '#64748b' }}>{r.uomCode || '—'}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600 }}>{fmt(r.bomRequestedQty, 4)}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{r.bomPrice > 0 ? fmt(r.bomPrice) : '—'}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: '#1e3a5f' }}>{r.lineTotal > 0 ? fmt(r.lineTotal) : '—'}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: r.prCreatedQty > 0 ? '#92400e' : '#94a3b8', fontWeight: r.prCreatedQty > 0 ? 600 : 400 }}>{r.prCreatedQty > 0 ? fmt(r.prCreatedQty, 4) : '—'}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: r.poCreatedQty > 0 ? '#1d4ed8' : '#94a3b8', fontWeight: r.poCreatedQty > 0 ? 600 : 400 }}>{r.poCreatedQty > 0 ? fmt(r.poCreatedQty, 4) : '—'}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: r.bomReceivedQty > 0 ? '#166534' : '#94a3b8', fontWeight: r.bomReceivedQty > 0 ? 600 : 400 }}>{r.bomReceivedQty > 0 ? fmt(r.bomReceivedQty, 4) : '—'}</td>
                                        <td style={{ padding: '8px 10px', textAlign: 'right', color: r.balanceQty > 0 ? '#dc2626' : '#94a3b8' }}>{fmt(r.balanceQty, 4)}</td>
                                        <td style={{ padding: '8px 10px', color: '#64748b', fontSize: 11, whiteSpace: 'nowrap' }}>{r.itemReqDate ? fmtDate(r.itemReqDate) : '—'}</td>
                                        <td style={{ padding: '8px 10px' }}><LineBadge status={r.bomStatus} statusList={bomDetailStatuses} /></td>
                                        <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                            {!isApproved && (
                                                <>
                                                    <button onClick={() => setEditLine({ ...r })}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6', fontSize: 12, padding: '2px 5px' }}
                                                        title="Edit">✏️</button>
                                                    <button
                                                        onClick={() => deleteLine(r.bomId)}
                                                        disabled={deleting === r.bomId || r.prCreatedQty > 0}
                                                        title={r.prCreatedQty > 0
                                                            ? `Cannot delete — ${fmt(r.prCreatedQty, 4)} already raised in PR`
                                                            : 'Delete'}
                                                        style={{
                                                            background: 'none', border: 'none', fontSize: 12, padding: '2px 5px',
                                                            cursor:  r.prCreatedQty > 0 ? 'not-allowed' : 'pointer',
                                                            color:   r.prCreatedQty > 0 ? '#94a3b8'     : '#ef4444',
                                                            opacity: (deleting === r.bomId || r.prCreatedQty > 0) ? 0.45 : 1,
                                                        }}>
                                                        {deleting === r.bomId ? '…' : '🗑️'}
                                                    </button>
                                                </>
                                            )}
                                        </td>
                                    </tr>
                                )
                            ))}

                            {/* New line form at bottom of section */}
                            {editLine === 'new' && (
                                <LineForm
                                    line={{
                                        bomId: 0, bomHeaderId, jobId,
                                        bomSectionId: thisSectionId || sections[0]?.bomSectionId || 0,
                                        sectionCode, sectionName
                                    }}
                                    sections={sections}
                                    bomDetailStatuses={bomDetailStatuses}
                                    onSave={saveLine}
                                    onCancel={() => { setSaveError(''); setEditLine(null); }}
                                    saving={saving}
                                    saveError={saveError}
                                    allDetails={allDetails}
                                />
                            )}

                            {lines.length === 0 && editLine !== 'new' && (
                                <tr>
                                    <td colSpan={colSpan} style={{ padding: '14px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                                        No lines in this section yet.
                                        {!isApproved && (
                                            <button
                                                onClick={() => { setEditLine('new'); }}
                                                style={{ marginLeft: 8, background: 'none', border: 'none',
                                                         color: '#3b82f6', fontSize: 12, cursor: 'pointer',
                                                         textDecoration: 'underline', padding: 0 }}>
                                                + Add the first line
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            )}

                            {/* Bottom add-line row — visible when section has lines and BOM is editable */}
                            {!isApproved && lines.length > 0 && editLine === null && (
                                <tr style={{ background: '#f8fafc' }}>
                                    <td colSpan={colSpan} style={{ padding: '6px 12px' }}>
                                        <button
                                            onClick={() => { setEditLine('new'); setOpen(true); }}
                                            style={{ background: 'none', border: '1px dashed #cbd5e1',
                                                     borderRadius: 6, padding: '5px 14px',
                                                     fontSize: 12, color: '#64748b', cursor: 'pointer',
                                                     width: '100%', textAlign: 'left', transition: 'all .15s' }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.background = '#eff6ff'; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#64748b'; e.currentTarget.style.background = 'none'; }}>
                                            + Add line to [{sectionCode}] {sectionName}
                                        </button>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>

        {/* ── Line delete confirm modal ── */}
        {pendingDeleteLineId && ReactDOM.createPortal(
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px',
                    width: 420, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: '#991b1b' }}>
                        🗑 Remove BOM Line
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                        Are you sure you want to remove this line? This action cannot be undone.
                    </div>
                    {lineDeleteError && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5',
                            borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 14 }}>
                            ⚠️ {lineDeleteError}
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="inv-btn inv-btn-ghost"
                            onClick={() => { setPendingDeleteLineId(null); setLineDeleteError(''); }}
                            disabled={!!deleting}>
                            Cancel
                        </button>
                        <button className="inv-btn" onClick={confirmDeleteLine}
                            disabled={!!deleting}
                            style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}>
                            {deleting ? 'Removing…' : 'Remove Line'}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )}
        </>
    );
};

// ── Main BOM Detail Page ────────────────────────────────────────
const BomDetailPage = () => {
    const { bomId: id } = useParams();
    const navigate    = useNavigate();
    const currentUser = useCurrentUser();
    const userId      = useCurrentUserId();
    const { vlist }   = useLookup();
    const { canDo }   = usePermission();
    const canDelete   = canDo('/bom', 'DELETE');
    const canRevise   = canDo('/bom', 'REVISE');
    const bomDetailStatuses = vlist?.['Procurement.BOMDetailStatus'] || [];

    const [header,    setHeader]    = useState(null);
    const [details,   setDetails]   = useState([]);
    const [sections,  setSections]  = useState([]);
    const [loading,   setLoading]   = useState(true);
    const [loadError, setLoadError] = useState('');
    const [tab,       setTab]       = useState('lines');
    const [approvalTx,   setApprovalTx]   = useState(null);
    const [deleting,      setDeleting]      = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteError,     setDeleteError]     = useState('');
    const [revising,        setRevising]        = useState(false);
    const [reviseError,     setReviseError]     = useState('');
    const [showReviseModal, setShowReviseModal] = useState(false);
    const [showImport,      setShowImport]      = useState(false);
    const [reviseReason,    setReviseReason]    = useState('');
    const [revisePassword,  setRevisePassword]  = useState('');
    const [revisedOk,       setRevisedOk]       = useState(false);  // success notice

    // ── Filter state (lines tab) ────────────────────────────────────
    const [filterText,     setFilterText]     = useState('');
    const [filterStatus,   setFilterStatus]   = useState('');   // status key or '_balance'
    const [filterSection,  setFilterSection]  = useState('');   // bomSectionId string
    const [filterCritical, setFilterCritical] = useState(false);
    // Same "only headers with entries" default used on the Job Budget and
    // Job Overview pages — a job type's full section list (~28 on this
    // fork's data) is mostly untouched for any given BOM, so default to
    // just the sections that actually have line items. Independent of the
    // search-style filters above (searchText/status/section/critical) —
    // not reset by "Clear all", same convention as the other 3 pages.
    const [onlyWithEntries, setOnlyWithEntries] = useState(true);

    const clearFilters = () => { setFilterText(''); setFilterStatus(''); setFilterSection(''); setFilterCritical(false); };

    // BOM header edit form state
    const [infoForm,    setInfoForm]    = useState({ bomDate: '', bomVersion: 1, bomDescription: '' });
    const [infoSaving,  setInfoSaving]  = useState(false);
    const [infoSaved,   setInfoSaved]   = useState(false);
    const [infoError,   setInfoError]   = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const res = await fetch(`${variables.API_URL}bom/${id}`, { headers: authHeaders() });
            if (!res.ok) {
                const body = await res.json().catch(() => null);
                setLoadError(body?.message || `Server returned HTTP ${res.status}.`);
                return;
            }
            const d = await res.json();
            setHeader(d.header);
            setDetails(d.details || []);
        } catch (err) {
            setLoadError(err?.message || 'Network error — could not reach the server.');
        }
        finally { setLoading(false); }
    }, [id]);

    const loadSections = useCallback(async (jobTypeId) => {
        try {
            const url = `${variables.API_URL}bom/sections${jobTypeId ? `?jobTypeId=${encodeURIComponent(jobTypeId)}` : ''}`;
            const res = await fetch(url, { headers: authHeaders() });
            const d   = await res.json();
            setSections(Array.isArray(d) ? d : []);
        } catch { setSections([]); }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Load approval status up front (not just when the Approval tab is opened) so
    // the header bar can show the right primary action — "Submit for Approval" /
    // "Approve BOM" / a pending badge — without the user having to find the tab first.
    useEffect(() => {
        if (!header?.bomHeaderId) return;
        fetch(`${variables.API_URL}approval/status/BOM/${header.bomHeaderId}?userId=${userId}`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : null)
            .then(d => setApprovalTx(d?.transaction || null))
            .catch(() => {});
    }, [header?.bomHeaderId, userId]);

    useEffect(() => {
        if (header) {
            loadSections(header.jobTypeId || header.jobJobTypeId || null);
            setInfoForm({
                bomDate:        header.bomDate?.slice(0, 10) || '',
                bomVersion:     header.bomVersion ?? 1,
                bomDescription: header.bomDescription || '',
            });
        }
    }, [header, loadSections]);

    // Group lines by section; also include sections with no lines so empty sections show.
    // We key on bomSectionId (always unique) instead of sectionCode (often NULL after
    // the legacy migration), and carry it through so the SectionGroup doesn't need to
    // re-lookup by code.
    const groupedSections = React.useMemo(() => {
        const map = new Map();

        // Populate from actual detail lines first
        details.forEach(line => {
            const key = line.bomSectionId;
            if (!map.has(key)) {
                map.set(key, {
                    bomSectionId:     line.bomSectionId,
                    sectionCode:      line.sectionCode,
                    sectionName:      line.sectionName,
                    sectionSortOrder: line.sectionSortOrder,
                    lines:            [],
                });
            }
            map.get(key).lines.push(line);
        });

        // Fill in master sections that have no lines yet, so empty sections still
        // show up and can be added to. In-house jobs are no longer tied to a
        // single cost-header section (budget header is optional/decoupled from
        // BOM now) — they get the same full section list as costed jobs.
        sections.forEach(s => {
            const key = s.bomSectionId;
            if (!map.has(key)) {
                map.set(key, {
                    bomSectionId:     s.bomSectionId,
                    sectionCode:      s.sectionCode,
                    sectionName:      s.sectionName,
                    sectionSortOrder: s.sortOrder,
                    lines:            [],
                });
            }
        });

        return Array.from(map.values()).sort((a, b) => a.sectionSortOrder - b.sectionSortOrder);
    }, [details, sections]);

    // In-house jobs get the same full section list as costed jobs — no longer
    // restricted to a single cost-header section (see groupedSections above).
    const sectionChoices = sections;

    const totalValue = details.reduce((s, r) => s + (r.lineTotal || 0), 0);
    const isApproved = header?.bomStatus === 'Approved';
    // BOMs are created directly once the job is approved and edited directly
    // here — there's no budget-driven generation/lock. Only an Approved BOM
    // itself is read-only (use Revise BOM to make further changes).
    const linesLocked = isApproved;

    // ── Status KPI counts (always over full dataset) ────────────────
    const statusCounts = React.useMemo(() => {
        const c = {};
        details.forEach(d => { c[d.bomStatus] = (c[d.bomStatus] || 0) + 1; });
        return c;
    }, [details]);
    const balanceCount = details.filter(d => (d.balanceQty || 0) > 0).length;

    // ── Filtered sections ──────────────────────────────────────────
    const isFiltering = !!(filterText.trim() || filterStatus || filterSection || filterCritical);
    const filteredGroupedSections = React.useMemo(() => {
        if (!isFiltering) return groupedSections;
        const q = filterText.trim().toLowerCase();
        return groupedSections
            .map(sec => {
                if (filterSection && sec.bomSectionId !== parseInt(filterSection, 10))
                    return { ...sec, lines: [] };
                let lines = sec.lines;
                if (q) lines = lines.filter(l =>
                    (l.itemCode || '').toLowerCase().includes(q) ||
                    (l.itemName || '').toLowerCase().includes(q) ||
                    (l.remarks  || '').toLowerCase().includes(q)
                );
                if (filterStatus === '_balance') lines = lines.filter(l => (l.balanceQty || 0) > 0);
                else if (filterStatus)           lines = lines.filter(l => l.bomStatus === filterStatus);
                if (filterCritical)              lines = lines.filter(l => l.isCritical);
                return { ...sec, lines };
            })
            .filter(sec => sec.lines.length > 0);
    }, [groupedSections, filterText, filterStatus, filterSection, filterCritical, isFiltering]);

    // Applies on top of whichever base list is active (filtered or not) —
    // independent of isFiltering so it works the same whether or not a
    // search/status/section/critical filter is also active.
    const visibleSections = React.useMemo(() => {
        const base = isFiltering ? filteredGroupedSections : groupedSections;
        return onlyWithEntries ? base.filter(sec => sec.lines.length > 0) : base;
    }, [isFiltering, filteredGroupedSections, groupedSections, onlyWithEntries]);

    const totalMatched = isFiltering
        ? filteredGroupedSections.reduce((s, sec) => s + sec.lines.length, 0)
        : details.length;

    const saveInfo = async () => {
        setInfoError(''); setInfoSaved(false); setInfoSaving(true);
        try {
            const res = await fetch(`${variables.API_URL}bom/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    bomHeaderId:    parseInt(id),
                    jobId:          header.jobId,
                    jobTypeId:      header.jobTypeId || null,
                    bomDate:        infoForm.bomDate        || null,
                    bomDescription: infoForm.bomDescription || null,
                    bomVersion:     infoForm.bomVersion,
                    modifiedBy:     currentUser,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setInfoError(d?.message || 'Save failed.'); return; }
            setInfoSaved(true);
            load();
            setTimeout(() => setInfoSaved(false), 3000);
        } catch { setInfoError('Network error.'); }
        finally { setInfoSaving(false); }
    };

    const handleDelete = async () => {
        setDeleteError('');
        setDeleting(true);
        try {
            const res = await fetch(`${variables.API_URL}bom/${id}`, {
                method: 'DELETE', headers: authHeaders(),
                body: JSON.stringify({ modifiedBy: currentUser }),
            });
            if (!res.ok) { const d = await res.json(); setDeleteError(d?.message || 'Delete failed.'); return; }
            navigate('/bom');
        } finally { setDeleting(false); }
    };

    const openReviseModal = () => {
        setReviseReason('');
        setRevisePassword('');
        setReviseError('');
        setShowReviseModal(true);
    };

    const handleRevise = async () => {
        if (!reviseReason.trim()) { setReviseError('Please enter a reason.'); return; }
        if (!revisePassword)      { setReviseError('Please enter your password.'); return; }
        setRevising(true);
        setReviseError('');
        try {
            const res = await fetch(`${variables.API_URL}bom/${id}/revise`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    revisedBy: currentUser,
                    reason:    reviseReason.trim(),
                    password:  revisePassword,
                }),
            });
            const d = await res.json();
            if (!res.ok) { setReviseError(d?.message || 'Revise failed.'); return; }
            setShowReviseModal(false);
            setTab('lines');        // land on lines so user sees their items
            clearFilters();         // clear any active filter that might hide lines
            await load();           // await so data is loaded before revising state clears
            setRevisedOk(true);
            setTimeout(() => setRevisedOk(false), 6000);
        } finally { setRevising(false); }
    };

    if (loading) return <div className="inv-page"><div className="inv-loading"><div className="inv-spinner" />Loading BOM…</div></div>;
    if (loadError) return (
        <div className="inv-page" style={{ padding: 32 }}>
            <div style={{ maxWidth: 520, background: '#fee2e2', border: '1px solid #fca5a5',
                          borderRadius: 10, padding: '20px 24px', color: '#991b1b' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>⚠️ Could not load BOM</div>
                <div style={{ fontSize: 13, marginBottom: 16 }}>{loadError}</div>
                <button className="inv-btn inv-btn-ghost" onClick={() => navigate('/bom')}>← Back to BOMs</button>
            </div>
        </div>
    );
    if (!header) return null;

    return (
        <>
        <div className="invd-shell">
            {/* Top bar */}
            <div className="invd-topbar">
                <button className="invd-back" onClick={() => navigate('/bom')}>← BOMs</button>
                <div className="invd-topbar-title" style={{ display: 'flex', flexDirection: 'column', gap: 2, justifyContent: 'center' }}>
                    {/* Row 1 — Job ID + status badge */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{
                            fontFamily: 'monospace', fontWeight: 700, fontSize: 13,
                            color: '#fff', background: '#1e40af',
                            padding: '2px 9px', borderRadius: 5, letterSpacing: '.5px',
                        }}>
                            {header.jobId}
                        </span>
                        <span style={{
                            padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                            background: isApproved ? '#dcfce7' : '#fef9c3',
                            color:      isApproved ? '#166534' : '#854d0e',
                        }}>
                            {(vlist?.['Procurement.BOMHeaderStatus'] || []).find(v => v.value === header.bomStatus)?.label || header.bomStatus}
                        </span>
                        {header.bomApprovedBy && (
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                · Approved by {header.bomApprovedBy}
                            </span>
                        )}
                    </div>
                    {/* Row 2 — Project name */}
                    {(header.projectName || header.jobDescription) && (
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', lineHeight: 1.3 }}>
                            {header.projectName || header.jobDescription}
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
                    {/* Import is offered only while the lines are editable - an
                        Approved BOM has to be revised first, same rule the line
                        editor and sp_ImportBomDetail both enforce. */}
                    {!linesLocked && (
                        <button className="inv-btn" onClick={() => setShowImport(true)}
                            style={{ background: '#0f766e', color: '#fff', border: '1px solid #0f766e', fontWeight: 700 }}>
                            📥 Import Excel
                        </button>
                    )}
                    {isApproved && canRevise && (
                        <button className="inv-btn" onClick={openReviseModal} disabled={revising}
                            style={{ background: '#7c3aed', color: '#fff', border: '1px solid #7c3aed', fontWeight: 700 }}>
                            🔄 Revise BOM
                        </button>
                    )}
                </div>
            </div>

            {/* Summary strip */}
            <div style={{ display: 'flex', gap: 24, padding: '10px 20px', background: '#f8fafc',
                          borderBottom: '1px solid #e2e8f0', flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ fontSize: 12 }}>
                    <span style={{ color: '#64748b' }}>Customer: </span>
                    <span style={{ fontWeight: 600 }}>{header.customerName || '—'}</span>
                </div>
                <div style={{ fontSize: 12 }}>
                    <span style={{ color: '#64748b' }}>Job Type: </span>
                    <span style={{ fontWeight: 600 }}>{header.jobTypeName || '—'}</span>
                </div>
                <div style={{ fontSize: 12 }}>
                    <span style={{ color: '#64748b' }}>BOM Date: </span>
                    <span style={{ fontWeight: 600 }}>{fmtDate(header.bomDate)}</span>
                </div>
                <div style={{ fontSize: 12 }}>
                    <span style={{ color: '#64748b' }}>Version: </span>
                    <span style={{ fontWeight: 600 }}>v{header.bomVersion}</span>
                </div>
                <div style={{ fontSize: 12 }}>
                    <span style={{ color: '#64748b' }}>Lines: </span>
                    <span style={{ fontWeight: 600 }}>{details.length}</span>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: 12 }}>
                    <span style={{ color: '#64748b' }}>Total BOM Value: </span>
                    <span style={{ fontWeight: 700, color: '#1e3a5f', fontSize: 15 }}>{fmt(totalValue)}</span>
                </div>
            </div>

            {/* Closed-job and approval banners — shown on all tabs except the approval tab */}
            {tab !== 'approval' && (
                <>
                    <JobClosedBanner jobId={header?.jobId} />
                    <ApprovalStatusBanner transaction={approvalTx} />
                </>
            )}

            {/* Tabs */}
            <div className="invd-tabs">
                {[['lines', 'Material Lines'], ['info', 'BOM Info'], ['approval', 'Approval']].map(([key, label]) => (
                    <button key={key} className={`invd-tab${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
                        {label}
                    </button>
                ))}
            </div>

            <div className="invd-body">
                {/* ── Approval tab ── */}
                {tab === 'approval' && (
                    <ApprovalHistoryTab
                        moduleCode="BOM"
                        documentId={header.bomHeaderId}
                        documentNo={`BOM-${header.jobId}-v${header.bomVersion}`}
                        linesCount={details.length}
                        lineLabel="BOM detail lines"
                        onStatusChange={load}
                        onTransactionLoad={setApprovalTx}
                    />
                )}

                {/* ── Lines tab ── */}
                {tab === 'lines' && (
                    <div>
                        {/* Revise success notice — auto-dismisses after 6 s */}
                        {revisedOk && (
                            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8,
                                          padding: '10px 16px', marginBottom: 14, fontSize: 13, color: '#92400e',
                                          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>🔄 BOM moved back to <strong>Draft</strong> (v{header.bomVersion}). All {details.length} lines are preserved — you can now add, edit, or remove lines and re-submit for approval.</span>
                                <button onClick={() => setRevisedOk(false)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#92400e', fontSize: 16, padding: '0 0 0 12px' }}>✕</button>
                            </div>
                        )}

                        {isApproved && (
                            <div style={{ background: '#dcfce7', border: '1px solid #86efac', borderRadius: 8,
                                          padding: '10px 16px', marginBottom: 14, fontSize: 13, color: '#166534', fontWeight: 600 }}>
                                ✅ This BOM is Approved — lines are read-only. Click <strong>Revise BOM</strong> to make changes.
                            </div>
                        )}

                        {/* ── Status KPI strip ── */}
                        {details.length > 0 && (() => {
                            const TOOLTIPS = {
                                '':               'Every line in this BOM regardless of status. Click to clear the status filter.',
                                'Pending':        'Item is in the BOM but no Purchase Request has been raised yet. These items still need to be requested for purchase.',
                                'PRPartial':      'A PR has been raised but for less than the required BOM qty. The remaining balance needs another PR.',
                                'PRRaised':       'PR raised for the full qty but no Purchase Order created yet. Waiting for the buyer to convert to a PO.',
                                'POPartial':      'PO raised for less than the PR qty — not fully covered by purchase orders. May be split across suppliers.',
                                'PORaised':       'PO raised for the full qty but goods not yet received. Waiting for supplier delivery.',
                                'PartialReceived':'Some qty has been received but balance is still outstanding — supplier made a short delivery.',
                                'FullyReceived':  '100% of the requested qty has been received. This line is complete — no further action needed.',
                                '_balance':       'Any item where balance qty > 0 — not fully delivered regardless of procurement stage. Use this to see all outstanding items in one view.',
                            };
                            const chips = [
                                { key: '', label: 'All Items', count: details.length, bg: '#dbeafe', color: '#1e40af', activeBg: '#1e40af' },
                                ...(Object.entries(statusCounts).map(([st, cnt]) => ({
                                    key:   st,
                                    label: bomDetailStatuses.find(v => v.value === st)?.label || st,
                                    count: cnt,
                                    bg:    LINE_STATUS[st]?.bg    || '#f1f5f9',
                                    color: LINE_STATUS[st]?.color || '#475569',
                                }))),
                                ...(balanceCount > 0 ? [{ key: '_balance', label: 'Has Balance', count: balanceCount, bg: '#fee2e2', color: '#991b1b' }] : []),
                            ];
                            return (
                                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                                    {chips.map(c => (
                                        <KpiChip
                                            key={c.key}
                                            label={c.label}
                                            count={c.count}
                                            active={filterStatus === c.key}
                                            onClick={() => setFilterStatus(s => s === c.key ? '' : c.key)}
                                            bg={c.bg}
                                            color={c.color}
                                            activeBg={c.activeBg}
                                            tooltip={TOOLTIPS[c.key] || null}
                                        />
                                    ))}
                                </div>
                            );
                        })()}

                        {/* ── Filter / search bar ── */}
                        {details.length > 0 && (
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                                          padding: '10px 12px', background: '#f8fafc',
                                          border: `1px solid ${isFiltering ? '#93c5fd' : '#e2e8f0'}`,
                                          borderRadius: 8, marginBottom: 14, transition: 'border-color .2s' }}>

                                {/* Text search */}
                                <div style={{ position: 'relative', flex: '1 1 180px', minWidth: 140 }}>
                                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                                                   color: '#94a3b8', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
                                    <input
                                        value={filterText}
                                        onChange={e => setFilterText(e.target.value)}
                                        placeholder="Search item code or name…"
                                        style={{ width: '100%', padding: '6px 28px 6px 28px', border: '1px solid #e2e8f0',
                                                 borderRadius: 6, fontSize: 12, boxSizing: 'border-box', fontFamily: 'inherit',
                                                 background: '#fff', outline: 'none' }}
                                    />
                                    {filterText && (
                                        <button onClick={() => setFilterText('')}
                                            style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
                                                     background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8',
                                                     fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
                                    )}
                                </div>

                                {/* Section filter — only sections that have lines in this BOM */}
                                <select value={filterSection} onChange={e => setFilterSection(e.target.value)}
                                    style={{ padding: '6px 8px', border: `1px solid ${filterSection ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 6,
                                             fontSize: 12, background: '#fff', fontFamily: 'inherit', cursor: 'pointer',
                                             fontWeight: filterSection ? 600 : 400 }}>
                                    <option value="">All Sections</option>
                                    {groupedSections
                                        .filter(s => s.lines.length > 0)
                                        .map(s => (
                                            <option key={s.bomSectionId} value={s.bomSectionId}>
                                                [{s.sectionCode}] {s.sectionName}
                                            </option>
                                        ))}
                                </select>

                                {/* Critical toggle */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                                                cursor: 'pointer', color: filterCritical ? '#dc2626' : '#64748b',
                                                fontWeight: filterCritical ? 700 : 400 }}>
                                    <input type="checkbox" checked={filterCritical}
                                        onChange={e => setFilterCritical(e.target.checked)}
                                        style={{ accentColor: '#dc2626' }} />
                                    ⚑ Critical only
                                </label>

                                {/* Only sections with entries */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                                                cursor: 'pointer', color: onlyWithEntries ? '#1e40af' : '#64748b',
                                                fontWeight: onlyWithEntries ? 700 : 400 }}>
                                    <input type="checkbox" checked={onlyWithEntries}
                                        onChange={e => setOnlyWithEntries(e.target.checked)} />
                                    Only sections with entries
                                </label>

                                {/* Match count + clear */}
                                {isFiltering && (
                                    <>
                                        <span style={{ fontSize: 12, color: totalMatched === 0 ? '#dc2626' : '#1e40af',
                                                       fontWeight: 600, marginLeft: 4 }}>
                                            {totalMatched === 0 ? 'No matches' : `${totalMatched} of ${details.length} items`}
                                        </span>
                                        <button onClick={clearFilters}
                                            style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #cbd5e1',
                                                     background: '#fff', fontSize: 12, cursor: 'pointer', color: '#64748b',
                                                     fontFamily: 'inherit' }}>
                                            Clear all
                                        </button>
                                    </>
                                )}
                            </div>
                        )}

                        {/* ── Section groups ── */}
                        {visibleSections.map(sec => (
                            <SectionGroup
                                key={sec.bomSectionId}
                                bomSectionId={sec.bomSectionId}
                                sectionCode={sec.sectionCode}
                                sectionName={sec.sectionName}
                                sectionSortOrder={sec.sectionSortOrder}
                                lines={sec.lines}
                                isApproved={linesLocked}
                                sections={sectionChoices}
                                bomDetailStatuses={bomDetailStatuses}
                                bomHeaderId={parseInt(id)}
                                jobId={header.jobId}
                                currentUser={currentUser}
                                onRefresh={load}
                                searchQuery={filterText.trim()}
                                forceOpen={isFiltering}
                                allDetails={details}
                            />
                        ))}

                        {/* No results */}
                        {isFiltering && filteredGroupedSections.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                                <div style={{ fontSize: 32, marginBottom: 10 }}>🔍</div>
                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: '#64748b' }}>No items match your filters</div>
                                <div style={{ fontSize: 12 }}>
                                    Try different search terms or{' '}
                                    <button onClick={clearFilters}
                                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer',
                                                 fontSize: 12, padding: 0, textDecoration: 'underline' }}>
                                        clear all filters
                                    </button>
                                </div>
                            </div>
                        )}

                        {!isFiltering && groupedSections.length === 0 && (
                            <div className="inv-empty">
                                <div className="inv-empty-icon">📋</div>
                                <div className="inv-empty-title">No sections loaded</div>
                                <div className="inv-empty-sub">Sections are driven by the job type master data.</div>
                            </div>
                        )}

                        {!isFiltering && groupedSections.length > 0 && visibleSections.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                                <div style={{ fontSize: 32, marginBottom: 10 }}>📋</div>
                                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4, color: '#64748b' }}>No sections have any line items yet</div>
                                <div style={{ fontSize: 12 }}>
                                    <button onClick={() => setOnlyWithEntries(false)}
                                        style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer',
                                                 fontSize: 12, padding: 0, textDecoration: 'underline' }}>
                                        Show all {groupedSections.length} sections
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Info tab ── */}
                {tab === 'info' && (
                    <div style={{ maxWidth: 560 }}>

                        {/* Read-only job info */}
                        <div className="invd-field" style={{ marginBottom: 14 }}>
                            <label className="invd-label">Job</label>
                            <input className="invd-input" value={header.jobId} readOnly
                                style={{ background: '#f8fafc', fontWeight: 700, color: '#1e40af' }} />
                        </div>
                        <div className="invd-field" style={{ marginBottom: 14 }}>
                            <label className="invd-label">Job Description</label>
                            <input className="invd-input" value={header.jobDescription || ''} readOnly
                                style={{ background: '#f8fafc' }} />
                        </div>
                        <div className="invd-field" style={{ marginBottom: 14 }}>
                            <label className="invd-label">Customer</label>
                            <input className="invd-input" value={header.customerName || ''} readOnly
                                style={{ background: '#f8fafc' }} />
                        </div>
                        <div className="invd-field" style={{ marginBottom: 14 }}>
                            <label className="invd-label">Job Type</label>
                            <input className="invd-input" value={header.jobTypeName || '—'} readOnly
                                style={{ background: '#f8fafc' }} />
                        </div>

                        {/* Editable header fields */}
                        {infoError && (
                            <div style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5',
                                          borderRadius: 6, padding: '7px 12px', fontSize: 12.5, marginBottom: 12 }}>
                                ⚠️ {infoError}
                            </div>
                        )}
                        {infoSaved && (
                            <div style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac',
                                          borderRadius: 6, padding: '7px 12px', fontSize: 12.5, marginBottom: 12 }}>
                                ✓ BOM header saved.
                            </div>
                        )}

                        <div className="invd-field" style={{ marginBottom: 14 }}>
                            <label className="invd-label">BOM Description</label>
                            <textarea className="invd-input" rows={3}
                                value={infoForm.bomDescription}
                                readOnly={isApproved}
                                onChange={e => setInfoForm(f => ({ ...f, bomDescription: e.target.value }))}
                                style={{ resize: 'vertical', background: isApproved ? '#f8fafc' : '' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                            <div className="invd-field">
                                <label className="invd-label">BOM Date</label>
                                <input className="invd-input" type="date"
                                    value={infoForm.bomDate}
                                    readOnly={isApproved}
                                    onChange={e => setInfoForm(f => ({ ...f, bomDate: e.target.value }))}
                                    style={{ background: isApproved ? '#f8fafc' : '' }} />
                            </div>
                            <div className="invd-field">
                                <label className="invd-label">Version</label>
                                <input className="invd-input" type="number" min={1} max={99}
                                    value={infoForm.bomVersion}
                                    readOnly={isApproved}
                                    onChange={e => setInfoForm(f => ({ ...f, bomVersion: parseInt(e.target.value) || 1 }))}
                                    style={{ background: isApproved ? '#f8fafc' : '' }} />
                            </div>
                        </div>
                        {!isApproved && (
                            <button className="inv-btn inv-btn-primary" onClick={saveInfo} disabled={infoSaving}
                                style={{ marginBottom: 20 }}>
                                {infoSaving ? 'Saving…' : 'Save Header'}
                            </button>
                        )}

                        {/* Audit trail */}
                        <div style={{ background: '#f8fafc', borderRadius: 8, padding: '12px 14px',
                                      fontSize: 12, color: '#64748b', marginTop: 8,
                                      border: '1px solid #e2e8f0' }}>
                            <div style={{ fontWeight: 700, marginBottom: 8, color: '#374151', fontSize: 13 }}>Audit Trail</div>
                            <div>Created by <strong>{header.createdBy}</strong> on {fmtDate(header.createdDate)}</div>
                            {header.modifiedBy && (
                                <div style={{ marginTop: 4 }}>
                                    Last modified by <strong>{header.modifiedBy}</strong> on {fmtDate(header.modifiedDate)}
                                </div>
                            )}
                            {header.bomApprovedBy && (
                                <div style={{ marginTop: 4 }}>
                                    Approved by <strong>{header.bomApprovedBy}</strong> on {fmtDate(header.bomApprovedDate)}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {showImport && (
            <BomImportModal
                bomHeaderId={header.bomHeaderId}
                sections={sections}
                onClose={() => setShowImport(false)}
                onImported={load}
            />
        )}

        {/* ── Revise BOM Modal ── */}
        {showReviseModal && ReactDOM.createPortal(
            <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 9999,
            }}>
                <div style={{
                    background: '#fff', borderRadius: 12, padding: '28px 32px',
                    width: 420, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, color: '#1e293b' }}>
                        🔄 Revise BOM
                    </div>
                    <div style={{ fontSize: 13, color: '#64748b', marginBottom: 20 }}>
                        This will reset the BOM to <strong>Draft</strong> and cancel the current approval.
                        You can then edit and re-submit for approval.
                    </div>

                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                        Reason <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <textarea
                        rows={3}
                        className="invd-input"
                        placeholder="Enter reason for revising this BOM…"
                        value={reviseReason}
                        onChange={e => setReviseReason(e.target.value)}
                        style={{ width: '100%', resize: 'vertical', marginBottom: 16, boxSizing: 'border-box' }}
                    />

                    <label style={{ fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                        Your Password <span style={{ color: '#dc2626' }}>*</span>
                    </label>
                    <input
                        type="password" autoComplete="new-password"
                        className="invd-input"
                        placeholder="Enter your login password to confirm"
                        value={revisePassword}
                        onChange={e => setRevisePassword(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRevise(); }}
                        style={{ width: '100%', marginBottom: 16, boxSizing: 'border-box' }}
                    />

                    {reviseError && (
                        <div style={{
                            background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5',
                            borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 14,
                        }}>
                            ⚠️ {reviseError}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button
                            className="inv-btn inv-btn-ghost"
                            onClick={() => setShowReviseModal(false)}
                            disabled={revising}
                        >
                            Cancel
                        </button>
                        <button
                            className="inv-btn"
                            onClick={handleRevise}
                            disabled={revising}
                            style={{ background: '#7c3aed', color: '#fff', borderColor: '#7c3aed' }}
                        >
                            {revising ? 'Revising…' : 'Confirm Revise'}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )}

        {/* ── Delete BOM confirm modal ── */}
        {showDeleteModal && ReactDOM.createPortal(
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
                <div style={{ background: '#fff', borderRadius: 12, padding: '28px 32px',
                    width: 440, maxWidth: '95vw', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}>
                    {/* Warning banner */}
                    <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8,
                        padding: '12px 16px', display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 20 }}>
                        <span style={{ fontSize: 20, flexShrink: 0 }}>⛔</span>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>
                                This action is permanent and cannot be undone.
                            </div>
                            <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 3 }}>
                                The BOM for <strong>{header?.jobId}</strong> will be permanently deleted along with all its lines.
                            </div>
                        </div>
                    </div>

                    {deleteError && (
                        <div style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5',
                            borderRadius: 6, padding: '8px 12px', fontSize: 12.5, marginBottom: 14 }}>
                            ⚠️ {deleteError}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                        <button className="inv-btn inv-btn-ghost"
                            onClick={() => { setShowDeleteModal(false); setDeleteError(''); }}
                            disabled={deleting}>
                            Cancel
                        </button>
                        <button className="inv-btn" onClick={handleDelete}
                            disabled={deleting}
                            style={{ background: '#dc2626', color: '#fff', borderColor: '#dc2626' }}>
                            {deleting ? 'Deleting…' : '🗑 Delete BOM'}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        )}
        </>
    );
};

export default BomDetailPage;
