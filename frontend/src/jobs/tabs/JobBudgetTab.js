import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import { fmt } from '../jobConstants';
import AmountInput from '../../common/AmountInput';
import AlertModal from '../../common/AlertModal';
import ConfirmModal from '../../common/ConfirmModal';
import BudgetImportModal from './BudgetImportModal';

// ── Variance colour ───────────────────────────────────────────
const varianceStyle = (v, budgeted) => {
    if (!budgeted) return {};
    if (v >= 0) return { color: '#16a34a', fontWeight: 600 };
    return { color: '#dc2626', fontWeight: 600 };
};

// ── Progress bar ──────────────────────────────────────────────
const SpendBar = ({ actual, budget }) => {
    if (!budget || budget <= 0) return null;
    const pct  = Math.min((actual / budget) * 100, 100);
    const over = actual > budget;
    return (
        <div style={{ height: 4, background: '#e2e8f0', borderRadius: 3, marginTop: 5, width: '100%' }}>
            <div style={{
                height: '100%', borderRadius: 3,
                width: `${pct}%`,
                background: over ? '#dc2626' : pct > 80 ? '#f59e0b' : '#16a34a',
                transition: 'width .3s',
            }} />
        </div>
    );
};

// ── Source legend — icon + auto-populate tip per category code ─
const SOURCE_INFO = {
    STEEL:        { icon: '🏗️',  tip: 'Structural and fabricated steel' },
    ELEC_MAT:     { icon: '⚡',  tip: 'Cables, switchgear, electrical components' },
    MH_MECH:      { icon: '👷',  tip: 'Approved manhour sheets × hourly rate' },
    MH_ELEC:      { icon: '👷',  tip: 'Approved manhour sheets × hourly rate' },
    BLAST_PAINT:  { icon: '🎨',  tip: 'Blasting and painting materials' },
    INSP_TEST:    { icon: '🔍',  tip: 'NDT, inspection and testing costs' },
    TRANSPORT:    { icon: '🚛',  tip: 'Approved transport / logistics expenses' },
    SUBCON:       { icon: '🔧',  tip: 'Confirmed service receipt lines' },
    INSTRU:       { icon: '📡',  tip: 'Instruments and control devices' },
    PIPES:        { icon: '🔩',  tip: 'Pipes, flanges, valves and fittings' },
    FG_SYS:       { icon: '🔥',  tip: 'Fire and gas detection materials' },
    ENCLOSURE:    { icon: '📦',  tip: 'Panel enclosures and accessories' },
    CONSUMABLE:   { icon: '🪛',  tip: 'Welding rods, gases, consumables' },
    NON_FERROUS:  { icon: '🥇',  tip: 'Copper, aluminium, non-ferrous materials' },
    MISC:         { icon: '📋',  tip: 'Approved miscellaneous expenses' },
    INSULATION:   { icon: '🧱',  tip: 'Thermal and acoustic insulation' },
    BOUGHT_OUT:   { icon: '🛒',  tip: 'Confirmed stock issues + committed POs' },
    DESIGN:       { icon: '📐',  tip: 'Design, drafting and engineering costs' },
    OVER_BUDGET:  { icon: '⚠️',  tip: 'Costs exceeding original budget' },
    INSTALL:      { icon: '🔨',  tip: 'Site installation and commissioning' },
    ADD_PURCHASE: { icon: '➕',  tip: 'Unplanned additional purchases' },
    FAN:          { icon: '🌀',  tip: 'Fan units and components' },
    RADIATOR:     { icon: '♨️',  tip: 'Radiator units and components' },
    MOTOR:        { icon: '⚙️',  tip: 'Motor units and components' },
    GASKET:       { icon: '🔘',  tip: 'Gaskets and sealing materials' },
    COOLER:       { icon: '❄️',  tip: 'Cooler units and components' },
    HVAC:         { icon: '🌡️',  tip: 'HVAC system costs' },
};

// ── Budget reason + password modal ────────────────────────────
// Reason is mandatory and persisted to TBL_JOB_BUDGET (ApprovalReason /
// RevisionReason) + TBL_JOB_AUDIT. Mirrors the modal in JobOverview.js — when
// updating one, update the other too.
const PasswordModal = ({ title, message, onCancel, onConfirm, busy }) => {
    const [reason, setReason] = useState('');
    const [pwd,    setPwd]    = useState('');
    const [err,    setErr]    = useState('');
    const reasonRef          = useRef(null);
    const mouseDownOnBackdrop = useRef(false);

    useEffect(() => { setTimeout(() => reasonRef.current?.focus(), 50); }, []);

    const submit = async () => {
        if (!reason.trim()) { setErr('Reason is required.');   return; }
        if (!pwd)           { setErr('Password is required.'); return; }
        setErr('');
        const result = await onConfirm(pwd, reason.trim());
        if (result !== true) setErr(typeof result === 'string' ? result : 'Operation failed — wrong password or action not allowed.');
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}
            onMouseDown={e => { mouseDownOnBackdrop.current = (e.target === e.currentTarget); }}
            onClick={e => { if (mouseDownOnBackdrop.current && e.target === e.currentTarget && !busy) onCancel(); }}>
            <div style={{ background: '#fff', borderRadius: 10, width: 420, padding: 22, boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}
                onClick={e => e.stopPropagation()}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{title}</div>
                <div style={{ fontSize: 12.5, color: '#475569', marginBottom: 14, lineHeight: 1.5 }}>{message}</div>

                <label style={{ fontSize: 11.5, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }}>
                    Reason <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea ref={reasonRef} className="pf-input"
                    style={{ width: '100%', padding: '7px 10px', fontSize: 13, minHeight: 60, resize: 'vertical' }}
                    value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="Why is this action being taken?"
                    disabled={busy} />

                <label style={{ fontSize: 11.5, fontWeight: 600, color: '#374151', display: 'block', margin: '12px 0 4px' }}>
                    Budget password <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <input type="password" autoComplete="new-password" className="pf-input" name="budget-action-pwd"
                    style={{ width: '100%', padding: '7px 10px', fontSize: 13 }}
                    value={pwd} onChange={e => setPwd(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    disabled={busy} />

                {err && <div style={{ color: '#dc2626', fontSize: 11.5, marginTop: 8 }}>{err}</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button className="pf-btn-sec" onClick={onCancel} disabled={busy} style={{ padding: '6px 14px', fontSize: 12.5 }}>Cancel</button>
                    <button className="pf-btn-pri" onClick={submit}
                        disabled={busy || !reason.trim() || !pwd}
                        style={{ padding: '6px 14px', fontSize: 12.5 }}>
                        {busy ? 'Working…' : 'Confirm'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ── Inline-edit cell (unchanged) ──────────────────────────────
const EditableCell = ({ row, canEdit, uoms, currencies, job, baseCurrencyCode, baseCurrencyId, onSave, onDelete }) => {
    const [open,      setOpen]     = useState(false);
    const [qty,       setQty]      = useState('');
    const [unitPrice, setUnitPrice]= useState('');
    const [uomId,     setUomId]    = useState('');
    const [notes,     setNotes]    = useState('');
    const [currencyId, setCurrencyId] = useState('');
    const [exchangeRate, setExchangeRate] = useState('1');
    const [saving,    setSaving]   = useState(false);
    const [err,       setErr]      = useState('');
    const qtyRef = useRef(null);

    const derivedAmount = () => {
        const q = parseFloat(qty);
        const u = parseFloat(unitPrice);
        if (!isNaN(q) && !isNaN(u)) return q * u;
        return parseFloat(unitPrice) || parseFloat(qty) || 0;
    };

    const pickCurrency = (id) => {
        setCurrencyId(id);
        const c = (currencies || []).find(x => String(x.id) === String(id));
        if (c) setExchangeRate(c.isBaseCurrency ? '1' : String(c.exchangeRate ?? '1'));
    };

    const openEdit = () => {
        if (!canEdit) return;
        setQty(row.qty != null ? String(row.qty) : '');
        setUnitPrice(row.unitPrice != null ? String(row.unitPrice) : row.budgetedAmount > 0 ? String(row.budgetedAmount) : '');
        setUomId(row.uomId != null ? String(row.uomId) : '');
        setNotes(row.notes || '');
        // Resolve currency: prefer saved currencyId, then look up by saved currencyShort,
        // then fall back to base currency (budget lines default to AED so multi-currency
        // jobs don't accidentally create foreign-currency budget lines).
        let resolvedId = row.currencyId;
        if (!resolvedId && row.currencyShort) {
            const match = (currencies || []).find(c => c.shortName === row.currencyShort);
            resolvedId = match?.id;
        }
        const cid = resolvedId ?? baseCurrencyId ?? job?.jobCurrencyId ?? '';
        setCurrencyId(String(cid ?? ''));
        if (row.exchangeRate != null) setExchangeRate(String(row.exchangeRate));
        else {
            const c = (currencies || []).find(x => String(x.id) === String(cid));
            setExchangeRate(c ? (c.isBaseCurrency ? '1' : String(c.exchangeRate ?? '1')) : String(job?.jobExcRate ?? '1'));
        }
        setErr('');
        setOpen(true);
        setTimeout(() => qtyRef.current?.focus(), 50);
    };

    const cancel = () => { setOpen(false); setErr(''); };

    const save = async () => {
        const amt = derivedAmount();
        if (amt < 0) { setErr('Amount cannot be negative.'); return; }
        setSaving(true); setErr('');
        const result = await onSave({
            budgetedAmount: amt,
            qty:       parseFloat(qty)       || null,
            unitPrice: parseFloat(unitPrice) || null,
            uomId:     uomId ? Number(uomId) : null,
            notes:     notes.trim()          || null,
            currencyId:   currencyId ? Number(currencyId) : null,
            exchangeRate: parseFloat(exchangeRate) || null,
        });
        setSaving(false);
        if (result === true) setOpen(false);
        else setErr(typeof result === 'string' ? result : 'Save failed.');
    };

    const handleKey = (e) => {
        if (e.key === 'Escape') cancel();
    };

    if (open) {
        const computed = derivedAmount();
        const curObj   = (currencies || []).find(x => String(x.id) === String(currencyId));
        const curCode  = curObj?.shortName || baseCurrencyCode || '';
        const rate     = parseFloat(exchangeRate) || 1;
        const isForeignLine = !!baseCurrencyCode && curCode !== baseCurrencyCode;
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, padding: '6px 0', minWidth: 280 }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>QTY</div>
                        <input ref={qtyRef} type="number" min="0" step="any" className="pf-input"
                            style={{ width: '100%', textAlign: 'right', padding: '3px 7px', fontSize: 12 }}
                            value={qty} onChange={e => setQty(e.target.value)} onKeyDown={handleKey} placeholder="—" />
                    </div>
                    <div style={{ paddingTop: 14, color: '#94a3b8', fontSize: 12 }}>×</div>
                    <div style={{ flex: 1.5 }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>UNIT PRICE</div>
                        <AmountInput className="pf-input"
                            style={{ width: '100%', padding: '3px 7px', fontSize: 12 }}
                            value={unitPrice} onChange={v => setUnitPrice(v)} onKeyDown={handleKey} placeholder="0.00" />
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>UOM</div>
                        <select className="pf-input"
                            style={{ width: '100%', padding: '3px 7px', fontSize: 12 }}
                            value={uomId} onChange={e => setUomId(e.target.value)}>
                            <option value="">—</option>
                            {uoms.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>CURRENCY</div>
                        <select className="pf-input"
                            style={{ width: '100%', padding: '3px 7px', fontSize: 12 }}
                            value={currencyId} onChange={e => pickCurrency(e.target.value)}>
                            {(currencies || []).map(c => (
                                <option key={c.id} value={c.id}>{c.shortName}{c.isBaseCurrency ? ' (Base)' : ''}</option>
                            ))}
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 9, color: '#94a3b8', marginBottom: 2 }}>RATE → {baseCurrencyCode}</div>
                        <input type="number" min="0" step="0.000001" className="pf-input"
                            style={{ width: '100%', textAlign: 'right', padding: '3px 7px', fontSize: 12 }}
                            value={exchangeRate} onChange={e => setExchangeRate(e.target.value)}
                            disabled={isForeignLine === false} />
                    </div>
                </div>
                {(qty || unitPrice) && (
                    <div style={{ fontSize: 11, color: '#1e40af', fontFamily: 'Courier New', textAlign: 'right' }}>
                        = {fmt(computed)} {curCode}
                        {isForeignLine && (
                            <span style={{ color: '#64748b' }}> · ≈ {fmt(computed * rate)} {baseCurrencyCode}</span>
                        )}
                    </div>
                )}
                <input type="text" className="pf-input"
                    style={{ width: '100%', padding: '3px 7px', fontSize: 11 }}
                    value={notes} onChange={e => setNotes(e.target.value)} onKeyDown={handleKey}
                    placeholder="Notes (optional)" />
                {err && <div style={{ color: '#dc2626', fontSize: 10.5 }}>{err}</div>}
                <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                    <button className="pf-btn-pri" style={{ padding: '4px 12px', fontSize: 11 }}
                        onClick={save} disabled={saving}>{saving ? '…' : '✓ Save'}</button>
                    <button className="pf-btn-sec" style={{ padding: '4px 8px', fontSize: 11 }}
                        onClick={cancel}>✕</button>
                    {row.jobBudgetId && (
                        <button onClick={() => { cancel(); onDelete(row); }}
                            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#dc2626', fontSize: 10.5, cursor: 'pointer', padding: 0 }}>
                            🗑 Clear
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const hasValue = row.budgetedAmount > 0;

    if (!hasValue) {
        return (
            <div onClick={openEdit} title={canEdit ? 'Click to set budget' : 'Locked'}
                style={{
                    cursor: canEdit ? 'pointer' : 'default',
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '3px 8px', borderRadius: 5,
                    border: canEdit ? '1.5px dashed #94a3b8' : 'none',
                    color: '#94a3b8', fontSize: 11.5,
                }}>
                {canEdit ? <><span style={{ fontSize: 13 }}>＋</span> Set budget</> : '—'}
            </div>
        );
    }

    return (
        <div onClick={openEdit} title={canEdit ? 'Click to edit' : 'Locked (budget approved)'} style={{ cursor: canEdit ? 'pointer' : 'default' }}>
            <div style={{
                fontFamily: 'Courier New', fontWeight: 600, color: '#1e293b', fontSize: 13,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '2px 6px', borderRadius: 4,
            }}>
                {fmt(row.budgetedAmount)} <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{row.currencyShort || baseCurrencyCode}</span>
                {canEdit && <span style={{ fontSize: 10, color: '#94a3b8' }}>✏</span>}
            </div>
            {!!baseCurrencyCode && row.currencyShort && row.currencyShort !== baseCurrencyCode && row.amountInBaseCurrency != null && (
                <div style={{ fontSize: 10, fontWeight: 700, color: '#334155', marginTop: 1 }}>
                    ≈ {fmt(row.amountInBaseCurrency)} {baseCurrencyCode}
                </div>
            )}
            {row.qty != null && row.unitPrice != null && (
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>
                    {row.qty} {row.uomCode || ''} × {fmt(row.unitPrice, 4)}
                </div>
            )}
            {row.notes && <div style={{ fontSize: 10, color: '#64748b', marginTop: 1 }}>{row.notes}</div>}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────
const JobBudgetEditor = ({ job }) => {
    const currentUser       = useCurrentUser();
    const { lookups, baseCurrency, baseCurrencyCode } = useLookup();
    const { canDo }         = usePermission();
    const uoms              = lookups.uoms || [];
    const currencies        = lookups.currencies || [];

    const [header,  setHeader]  = useState({ currentRvNo: 0, isApproved: false, approvedBy: null, approvedDate: null, totalRevisions: 0 });
    const [rows,    setRows]    = useState([]);
    const [loading, setLoading] = useState(true);
    const [revisions, setRevisions] = useState([]);
    const [viewRv,    setViewRv]    = useState(null);   // null = latest; else a specific revision
    const [pwdAction, setPwdAction] = useState(null);  // 'approve' | 'revise' | null
    const [pwdBusy,   setPwdBusy]   = useState(false);
    const [banner,    setBanner]    = useState('');
    const [alertMsg,  setAlertMsg]  = useState(null);
    const [confirm,   setConfirm]   = useState(null);

    // ── Budget item lines (per header) — drives the BOM on approval ──
    const itemsLookup = lookups.items || [];
    const [expandedCat, setExpandedCat] = useState(null);
    const [allItems,    setAllItems]    = useState([]);   // every budget item line for the revision
    const [itemDraft,   setItemDraft]   = useState({ budgetItemId: 0, itemId: '', qty: '', unitPrice: '' });
    // Item picker options loaded per category from the server (the global lookup is
    // capped at 500 items, which hides most of a category's items in a 3,000+ catalog).
    const [catItems,        setCatItems]        = useState({});   // costCategoryId → item option array
    const [catItemsLoading, setCatItemsLoading] = useState(null); // costCategoryId currently loading
    const [itemSearch,      setItemSearch]      = useState('');   // typeahead text for the item picker
    const [itemPickerOpen,  setItemPickerOpen]  = useState(false);
    const itemInputRef = useRef(null);
    const [pickerRect, setPickerRect] = useState(null);  // input screen rect for the portaled dropdown
    // Filters (BOM-detail style)
    const [headerFilter, setHeaderFilter] = useState('');
    const [searchText,   setSearchText]   = useState('');
    const [createdBy,    setCreatedBy]    = useState('');
    const [showLog,      setShowLog]      = useState(false);
    const [logRows,      setLogRows]      = useState([]);

    const [logRvOnly,    setLogRvOnly]    = useState(false);   // false = whole job history, true = current revision only
    const [logItemId,    setLogItemId]    = useState(null);    // when set, log is filtered to a single item
    const [logItemLabel, setLogItemLabel] = useState('');
    const [logAction,    setLogAction]    = useState('');      // ADD | INCREASE | DECREASE | UPDATE | DELETE | '' (all)
    const [logSearch,    setLogSearch]    = useState('');      // free-text item / header search within the log

    const fetchLog = async (rvOnly, itemId = logItemId) => {
        const params = [];
        if (rvOnly) params.push(`rvNo=${header.currentRvNo}`);
        if (itemId) params.push(`itemId=${itemId}`);
        const qs = params.length ? `?${params.join('&')}` : '';
        try {
            const r = await fetch(`${variables.API_URL}jobbudget/${encodeURIComponent(job.jobId)}/item-log${qs}`,
                { headers: authHeaders() });
            setLogRows(r.ok ? await r.json() : []);
        } catch { setLogRows([]); }
    };

    const openLog = async () => {
        setLogRvOnly(false); setLogItemId(null); setLogItemLabel(''); setLogAction(''); setLogSearch('');
        await fetchLog(false, null);
        setShowLog(true);
    };

    const openItemLog = async (it) => {
        setLogRvOnly(false); setLogAction(''); setLogSearch('');
        setLogItemId(it.itemId);
        setLogItemLabel(`${it.itemCode ? `[${it.itemCode}] ` : ''}${it.itemName || ''}`);
        await fetchLog(false, it.itemId);
        setShowLog(true);
    };

    const loadAllItems = useCallback(() => {
        fetch(`${variables.API_URL}jobbudget/${encodeURIComponent(job.jobId)}/items?rvNo=${header.currentRvNo}`,
            { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setAllItems(Array.isArray(d) ? d : []))
            .catch(console.error);
    }, [job.jobId, header.currentRvNo]);

    useEffect(() => { loadAllItems(); }, [loadAllItems]);

    const itemsByCat = React.useMemo(() => {
        const m = {};
        allItems.forEach(it => { (m[it.costCategoryId] = m[it.costCategoryId] || []).push(it); });
        return m;
    }, [allItems]);

    // When a category is expanded, load ALL of its purchasable items from the server
    // (scoped by budgetCategoryId) — the global lookup only holds the first 500 items
    // catalog-wide, so most of a category's items are otherwise missing from the picker.
    useEffect(() => {
        if (expandedCat == null || catItems[expandedCat]) return;
        let cancelled = false;
        setCatItemsLoading(expandedCat);
        fetch(`${variables.API_URL}item/search?budgetCategoryId=${expandedCat}&isActive=true&pageSize=500&page=1&sortCol=ItemName&sortDir=ASC`,
              { headers: authHeaders() })
            .then(r => r.ok ? r.json() : { data: [] })
            .then(d => {
                if (cancelled) return;
                const opts = (d.data || []).map(i => ({
                    id: i.itemId, name: i.itemName || i.itemNameEn || '', code: i.itemCode || '',
                    budgetCategoryId: i.budgetCategoryId ?? null,
                    lastPurchasePrice: i.lastPurchasePrice ?? null,
                    lastPurchaseCurrencyShort: i.lastPurchaseCurrencyShort ?? null,
                }));
                setCatItems(prev => ({ ...prev, [expandedCat]: opts }));
            })
            .catch(() => { if (!cancelled) setCatItems(prev => ({ ...prev, [expandedCat]: [] })); })
            .finally(() => { if (!cancelled) setCatItemsLoading(null); });
        return () => { cancelled = true; };
    }, [expandedCat, catItems]);

    // Keep the portaled item-picker dropdown aligned to its input (the dropdown is
    // portaled to <body> to escape the accordion's overflow:hidden clipping).
    useEffect(() => {
        if (!itemPickerOpen) return;
        const update = () => {
            const el = itemInputRef.current;
            if (el) setPickerRect(el.getBoundingClientRect());
        };
        update();
        window.addEventListener('scroll', update, true);
        window.addEventListener('resize', update);
        return () => {
            window.removeEventListener('scroll', update, true);
            window.removeEventListener('resize', update);
        };
    }, [itemPickerOpen]);

    const blankDraft = { budgetItemId: 0, itemId: '', qty: '', unitPrice: '' };
    const itemOptLabel = (it) => `${it.code ? `[${it.code}] ` : ''}${it.name}`;

    const toggleItems = (catId) => {
        setItemDraft(blankDraft);
        setItemSearch(''); setItemPickerOpen(false);
        setExpandedCat(prev => prev === catId ? null : catId);
    };

    const editBudgetItem = (it) => {
        setItemDraft({
            budgetItemId: it.budgetItemId,
            itemId: String(it.itemId),
            qty: it.qty != null ? String(it.qty) : '',
            unitPrice: it.unitPrice != null ? String(it.unitPrice) : '',
        });
        setItemSearch(`${it.itemCode ? `[${it.itemCode}] ` : ''}${it.itemName || ''}`);
        setItemPickerOpen(false);
    };

    // ── Budget item save / delete (no password — draft budget is free to edit) ──
    const [itemBusy, setItemBusy] = useState(false);
    const [itemErr,  setItemErr]  = useState('');

    const saveBudgetItem = async (catId) => {
        if (!itemDraft.itemId || !(Number(itemDraft.qty) > 0)) { setAlertMsg('Pick an item and enter a quantity.'); return; }
        setItemBusy(true); setItemErr('');
        try {
            const res = await fetch(`${variables.API_URL}jobbudget/item/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    budgetItemId: itemDraft.budgetItemId || 0, jobId: job.jobId, rvNo: header.currentRvNo, costCategoryId: catId,
                    itemId: Number(itemDraft.itemId), qty: Number(itemDraft.qty),
                    unitPrice: Number(itemDraft.unitPrice) || 0, createdBy: currentUser, modifiedBy: currentUser,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setItemErr(d?.message || 'Save failed.'); return; }
            setItemDraft(blankDraft);
            setItemSearch(''); setItemPickerOpen(false);
            loadAllItems();
        } catch { setItemErr('Network error.'); }
        finally { setItemBusy(false); }
    };

    const deleteBudgetItem = (catId, budgetItemId) => {
        setConfirm({
            title: 'Remove budget item',
            message: 'Remove this item from the budget list?',
            confirmLabel: 'Remove',
            onConfirm: async () => {
                setConfirm(null);
                try {
                    const res = await fetch(
                        `${variables.API_URL}jobbudget/item/${budgetItemId}?modifiedBy=${encodeURIComponent(currentUser)}`,
                        { method: 'DELETE', headers: authHeaders() });
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setAlertMsg(d?.message || 'Delete failed.'); return; }
                    loadAllItems();
                } catch { setAlertMsg('Network error.'); }
            },
        });
    };

    // ── Permission flags from TBL_ROLE_MENU_ACTION (via PermissionContext) ──
    const canEditPerm = canDo('/jobs', 'EDIT');
    const canApprove  = canDo('/jobs', 'APPROVE');
    const canRevise   = canDo('/jobs', 'REVISE');

    // canEdit = job open, job APPROVED, EDIT permission, budget not approved, AND viewing the latest revision.
    // The budget can only be built once the job itself has cleared its approval workflow
    // (Draft → PendingLn → Approved). Until then the page is read-only.
    const jobOpen     = ![3, 4, 5].includes(Number(job.jobStatusId));
    const jobApproved = String(job.approvalStatus) === 'Approved';
    const canEdit     = jobOpen && jobApproved && canEditPerm && !header.isApproved && !header.isHistorical;

    const load = useCallback(() => {
        setLoading(true);
        const url = `${variables.API_URL}jobbudget/${encodeURIComponent(job.jobId)}` + (viewRv != null ? `?rvNo=${viewRv}` : '');
        fetch(url, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => {
                setHeader(d?.header || { currentRvNo: 0, isApproved: false, totalRevisions: 0 });
                setRows(Array.isArray(d?.lines) ? d.lines : []);
            })
            .catch(e => console.error('Load budget:', e))
            .finally(() => setLoading(false));
    }, [job.jobId, viewRv]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        fetch(`${variables.API_URL}jobbudget/${encodeURIComponent(job.jobId)}/revisions`, { headers: authHeaders() })
            .then(r => r.ok ? r.json() : [])
            .then(d => setRevisions(Array.isArray(d) ? d : []))
            .catch(() => setRevisions([]));
    }, [job.jobId]);

    const showBanner = (msg) => {
        setBanner(msg);
        setTimeout(() => setBanner(''), 3500);
    };

    const handleSave = async (row, fields) => {
        try {
            const res = await fetch(`${variables.API_URL}jobbudget/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    jobId:          job.jobId,
                    costCategoryId: row.costCategoryId,
                    rvNo:           row.rvNo ?? 0,
                    budgetedAmount: fields.budgetedAmount,
                    qty:            fields.qty,
                    unitPrice:      fields.unitPrice,
                    uomId:          fields.uomId,
                    notes:          fields.notes,
                    currencyId:     fields.currencyId,
                    exchangeRate:   fields.exchangeRate,
                    createdBy:      currentUser,
                    modifiedBy:     currentUser,
                }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) return d?.message || 'Save failed.';
            load();
            return true;
        } catch { return 'Network error.'; }
    };

    const handleDelete = (row) => {
        if (!row.jobBudgetId) return;
        setConfirm({
            title: 'Clear Budget',
            message: `Clear budget for "${row.categoryName}"?`,
            confirmLabel: 'Clear',
            onConfirm: async () => {
                setConfirm(null);
                try {
                    const res = await fetch(`${variables.API_URL}jobbudget/${row.jobBudgetId}`, {
                        method: 'DELETE', headers: authHeaders(),
                    });
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setAlertMsg(d?.message || 'Delete failed.'); return; }
                    load();
                } catch { setAlertMsg('Network error.'); }
            },
        });
    };

    // ── Approve / Revise ──────────────────────────────────────
    // Returns true on success, or an error message string on failure.
    const callBudgetAction = async (endpoint, password, reason) => {
        setPwdBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}jobbudget/${endpoint}`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ jobId: job.jobId, password, actedBy: currentUser, reason }),
            });
            const d = await res.json().catch(() => ({}));
            setPwdBusy(false);
            if (!res.ok) return d?.message || 'Operation failed.';
            setPwdAction(null);
            showBanner(d?.message || 'Done.');
            setSearchText(''); setHeaderFilter(''); setCreatedBy('');
            load();
            return true;
        } catch {
            setPwdBusy(false);
            return 'Network error. Please try again.';
        }
    };

    const [showImport, setShowImport] = useState(false);

    // ── Generate BOM from budget items (no approval) — for in-house jobs ──
    const [bomBusy, setBomBusy] = useState(false);
    const generateBom = async () => {
        setBomBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}jobbudget/generate-bom`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ jobId: job.jobId, actedBy: currentUser }),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setAlertMsg(d?.message || 'Could not generate BOM.'); return; }
            showBanner(d?.message || 'BOM generated from budget.');
        } catch { setAlertMsg('Network error.'); }
        finally { setBomBusy(false); }
    };

    // Totals — budget lines may be in mixed currencies, so totals are in BASE currency.
    const totalBudget    = rows.reduce((s, r) => s + (r.amountInBaseCurrency || 0), 0);
    const totalActual    = rows.reduce((s, r) => s + (r.actualAmount  || 0), 0);
    const totalVar       = totalBudget - totalActual;
    const budgetUsedPct  = totalBudget > 0 ? Math.min((totalActual / totalBudget) * 100, 999) : 0;
    const setBudgetCount = rows.filter(r => r.budgetedAmount > 0).length;
    // For in-house jobs with item-based budgets, category totals may be 0 until prices
    // are entered — count items as evidence that budget work has begun.
    const hasAnyBudget   = setBudgetCount > 0 || allItems.length > 0;
    const showVersionBadge = header.totalRevisions > 1 || header.isApproved;

    // In-house jobs are tied to ONE cost header → show only that header (one
    // section of items, one-section BOM). Costed jobs budget across all headers.
    const visibleRows = (job.isCostingRequired === false && job.budgetCategoryId)
        ? rows.filter(r => String(r.costCategoryId) === String(job.budgetCategoryId))
        : rows;

    // Distinct "created by" values across budgeted headers (for the filter).
    const creators = Array.from(new Set(visibleRows.map(r => r.createdBy).filter(Boolean)));

    // Filters: header dropdown + free-text search (header or its items) + created-by.
    const filteredRows = visibleRows.filter(r => {
        if (headerFilter && String(r.costCategoryId) !== String(headerFilter)) return false;
        if (createdBy && r.createdBy !== createdBy) return false;
        if (searchText) {
            const q = searchText.toLowerCase();
            const inHeader = `${r.categoryName || ''} ${r.categoryCode || ''}`.toLowerCase().includes(q);
            const inItems  = (itemsByCat[r.costCategoryId] || []).some(it =>
                `${it.itemCode || ''} ${it.itemName || ''}`.toLowerCase().includes(q));
            if (!inHeader && !inItems) return false;
        }
        return true;
    });
    const isFiltering = !!(headerFilter || createdBy || searchText);

    if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading…</div>;

    return (
        <div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            {/* ── Action banner ── */}
            {banner && (
                <div style={{ marginBottom: 12, padding: '8px 14px', background: '#dcfce7', color: '#166534', borderRadius: 6, fontSize: 12.5 }}>
                    ✓ {banner}
                </div>
            )}

            {/* ── Job-not-approved gate banner ── */}
            {!jobApproved && (
                <div style={{ marginBottom: 12, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderLeft: '4px solid #f59e0b', borderRadius: 7, fontSize: 12.5, color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>🔒</span>
                    <div style={{ lineHeight: 1.5 }}>
                        <strong>Budget is locked until the job is approved.</strong>{' '}
                        This job's approval status is <strong>{job.approvalStatus || 'Draft'}</strong>. Fill in the job details and submit it for approval — once it is <strong>Approved</strong>, the <strong>Add&nbsp;Budget</strong> controls appear here.
                        <div style={{ fontSize: 11, marginTop: 3, color: '#78350f' }}>Existing budget lines remain visible in read-only mode.</div>
                    </div>
                </div>
            )}

            {/* ── Header bar: revision/approval status + actions ── */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                marginBottom: 12, padding: '10px 14px',
                background: header.isApproved ? '#f0fdf4' : '#fffbeb',
                border: `1px solid ${header.isApproved ? '#86efac' : '#fde68a'}`,
                borderRadius: 8,
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{
                        fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 5,
                        background: header.isApproved ? '#16a34a' : '#f59e0b', color: '#fff',
                    }}>
                        {header.isApproved ? '🔒 APPROVED' : '✏ DRAFT'}
                    </span>
                    {showVersionBadge && (
                        <span style={{ fontSize: 11.5, color: '#475569' }}>
                            Revision <strong>Rev {header.currentRvNo}</strong>
                            {header.totalRevisions > 1 && ` of ${header.totalRevisions}`}
                        </span>
                    )}
                    {revisions.length > 1 && (
                        <select
                            value={viewRv ?? (revisions.find(r => r.isCurrent)?.rvNo ?? '')}
                            onChange={e => {
                                const v = Number(e.target.value);
                                setViewRv(revisions.find(r => r.rvNo === v)?.isCurrent ? null : v);
                            }}
                            title="View an earlier budget revision"
                            style={{ fontSize: 11.5, padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: 5 }}>
                            {revisions.map(rv => (
                                <option key={rv.rvNo} value={rv.rvNo}>
                                    Rev {rv.rvNo}{rv.isCurrent ? ' (current)' : ''}{rv.isApproved ? ' · approved' : ' · draft'}
                                </option>
                            ))}
                        </select>
                    )}
                    {header.isHistorical && (
                        <span style={{ fontSize: 11, fontWeight: 600, background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 10 }}>
                            Historical — read-only
                        </span>
                    )}
                    {header.isApproved && header.approvedBy && (
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                            Approved by <strong>{header.approvedBy}</strong>
                            {header.approvedDate && ` on ${new Date(header.approvedDate).toLocaleDateString('en-GB')}`}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {/* Approve — when budget work has begun (items or amounts), not yet approved */}
                    {!header.isApproved && hasAnyBudget && canApprove && (
                        <button
                            onClick={() => setPwdAction('approve')}
                            style={{
                                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                                background: '#16a34a', color: '#fff', border: 'none',
                                borderRadius: 5, cursor: 'pointer',
                            }}>
                            ✓ Approve Budget
                        </button>
                    )}
                    {/* Revise — only when approved (and viewing the current revision) */}
                    {header.isApproved && canRevise && !header.isHistorical && (
                        <button
                            onClick={() => setPwdAction('revise')}
                            style={{
                                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                                background: '#f59e0b', color: '#fff', border: 'none',
                                borderRadius: 5, cursor: 'pointer',
                            }}>
                            ↻ Revise Budget
                        </button>
                    )}
                    {/* Import budget items from Excel — when the budget is editable */}
                    {canEdit && (
                        <button
                            onClick={() => setShowImport(true)}
                            style={{
                                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                                background: '#0f766e', color: '#fff', border: 'none',
                                borderRadius: 5, cursor: 'pointer',
                            }}>
                            📥 Import from Excel
                        </button>
                    )}
                    {/* Generate BOM from budget items — in-house jobs only (no approval).
                        Costed jobs get the BOM automatically when the budget is approved. */}
                    {setBudgetCount > 0 && canEditPerm && jobApproved && job.isCostingRequired === false && !header.isHistorical && (
                        <button
                            onClick={generateBom}
                            disabled={bomBusy}
                            title="Create the job BOM from the budget item lines"
                            style={{
                                padding: '6px 14px', fontSize: 12, fontWeight: 600,
                                background: '#1e40af', color: '#fff', border: 'none',
                                borderRadius: 5, cursor: bomBusy ? 'not-allowed' : 'pointer',
                            }}>
                            {bomBusy ? 'Generating…' : '⚙ Generate BOM'}
                        </button>
                    )}
                </div>
            </div>

            {/* ── Summary KPIs ── */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                {[
                    { label: `Total Budget${baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}`, value: fmt(totalBudget), color: '#1e40af', bg: '#eff6ff' },
                    { label: `Total Actual${baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}`, value: fmt(totalActual), color: totalActual > totalBudget ? '#dc2626' : '#0f766e', bg: totalActual > totalBudget ? '#fef2f2' : '#f0fdfa' },
                    { label: `Variance${baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}`,     value: (totalVar >= 0 ? '' : '− ') + fmt(Math.abs(totalVar)), color: totalVar >= 0 ? '#16a34a' : '#dc2626', bg: totalVar >= 0 ? '#f0fdf4' : '#fef2f2' },
                    { label: 'Budget Used',  value: totalBudget > 0 ? `${budgetUsedPct.toFixed(1)}%` : '—', color: '#7c3aed', bg: '#faf5ff' },
                ].map(k => (
                    <div key={k.label} style={{ flex: '1 1 150px', background: k.bg, border: `1px solid ${k.color}22`, borderRadius: 8, padding: '10px 16px' }}>
                        <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>{k.label}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: 'Courier New' }}>{k.value}</div>
                    </div>
                ))}
            </div>

            {/* ── Hints ── */}
            {canEdit && !hasAnyBudget && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, fontSize: 12.5, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>💡</span>
                    No budget set yet. Expand a cost header below to add items, or click <strong>＋ Set budget</strong> on a row to enter a lump-sum amount.
                </div>
            )}
            {header.isApproved && !canRevise && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 7, fontSize: 12.5, color: '#1e40af' }}>
                    🔒 Budget is approved and locked. Only users with <strong>Revise</strong> permission on Jobs can create a new revision.
                </div>
            )}

            {/* ── Section header ── */}
            <div style={{ margin: '4px 0 8px' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>Budget by Cost Header</div>
                <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 2 }}>
                    Expand a header to add items &amp; quantities — the approved budget drives the BOM → PR → PO.
                </div>
            </div>

            {/* ── Filter bar ── */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center',
                          padding: '10px 12px', background: '#f8fafc',
                          border: `1px solid ${isFiltering ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 8, marginBottom: 14 }}>
                <input value={searchText} onChange={e => setSearchText(e.target.value)}
                    placeholder="🔍 Search header or item…"
                    type="search" name="budget-search" autoComplete="off"
                    data-lpignore="true" data-form-type="other"
                    style={{ flex: '1 1 200px', minWidth: 160, padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12.5, background: '#fff' }} />
                {visibleRows.length > 1 && (
                    <select value={headerFilter} onChange={e => setHeaderFilter(e.target.value)}
                        style={{ padding: '6px 10px', border: `1px solid ${headerFilter ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 6, fontSize: 12.5, background: '#fff', fontWeight: headerFilter ? 600 : 400 }}>
                        <option value="">All headers</option>
                        {visibleRows.map(r => (
                            <option key={r.costCategoryId} value={r.costCategoryId}>{r.categoryName}{r.categoryCode ? ` (${r.categoryCode})` : ''}</option>
                        ))}
                    </select>
                )}
                {creators.length > 0 && (
                    <select value={createdBy} onChange={e => setCreatedBy(e.target.value)}
                        style={{ padding: '6px 10px', border: `1px solid ${createdBy ? '#93c5fd' : '#e2e8f0'}`, borderRadius: 6, fontSize: 12.5, background: '#fff', fontWeight: createdBy ? 600 : 400 }}>
                        <option value="">Any creator</option>
                        {creators.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                )}
                {isFiltering && (
                    <>
                        <span style={{ fontSize: 12, color: filteredRows.length === 0 ? '#dc2626' : '#1e40af', fontWeight: 600 }}>
                            {filteredRows.length} of {visibleRows.length}
                        </span>
                        <button onClick={() => { setSearchText(''); setHeaderFilter(''); setCreatedBy(''); }}
                            style={{ padding: '5px 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', fontSize: 12, cursor: 'pointer', color: '#64748b' }}>
                            Clear
                        </button>
                    </>
                )}
                <button onClick={openLog} title="View qty change history for this revision"
                    style={{ marginLeft: 'auto', padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', fontSize: 12, cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
                    📜 Change log
                </button>
            </div>

            {/* ── Accordion: one card per cost header ── */}
            {filteredRows.length === 0 && (
                <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', border: '1px dashed #e2e8f0', borderRadius: 8 }}>
                    No headers match your filters.
                </div>
            )}
            {filteredRows.map(row => {
                const src      = SOURCE_INFO[row.categoryCode] || {};
                const items    = itemsByCat[row.costCategoryId] || [];
                const expanded = expandedCat === row.costCategoryId;
                // Prefer the full server-loaded list for this category; fall back to the
                // (capped) global lookup only until that fetch completes.
                const pickItems = catItems[row.costCategoryId]
                    ?? itemsLookup.filter(it => String(it.budgetCategoryId) === String(row.costCategoryId));
                const pickLoading = catItemsLoading === row.costCategoryId && !catItems[row.costCategoryId];
                const spendPct = row.amountInBaseCurrency > 0
                    ? Math.min((row.actualAmount / row.amountInBaseCurrency) * 100, 100).toFixed(0) : null;
                const Stat = ({ label, children, alignEditable }) => (
                    <div style={{ minWidth: alignEditable ? 120 : 92, textAlign: 'right' }}>
                        <div style={{ fontSize: 9.5, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
                        <div style={{ fontFamily: 'Courier New', fontWeight: 600, color: '#1e293b' }}>{children}</div>
                    </div>
                );
                return (
                    <div key={row.costCategoryId} style={{ border: `1px solid ${expanded ? '#bfdbfe' : '#e2e8f0'}`, borderRadius: 8, marginBottom: 8, overflow: 'hidden', background: '#fff' }}>
                        {/* Accordion header */}
                        <div style={{ display: 'flex', alignItems: 'center', background: expanded ? '#f8fafc' : '#fff' }}>
                            <div onClick={() => toggleItems(row.costCategoryId)}
                                 style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer' }}>
                                <span style={{ fontSize: 12, color: '#64748b', width: 12 }}>{expanded ? '▾' : '▸'}</span>
                                <span style={{ fontSize: 18 }}>{src.icon || '•'}</span>
                                <div>
                                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                                        {row.categoryName}
                                        {row.categoryCode && <span style={{ color: '#94a3b8', fontWeight: 400 }}> ({row.categoryCode})</span>}
                                    </div>
                                    <div style={{ fontSize: 10.5, color: '#94a3b8' }}>
                                        {items.length} item{items.length !== 1 ? 's' : ''}{src.tip ? ` · ${src.tip}` : ''}
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '6px 14px' }}>
                                <Stat label={`Budget${baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}`} alignEditable>
                                    <EditableCell row={row} canEdit={canEdit} uoms={uoms} currencies={currencies} job={job}
                                        baseCurrencyCode={baseCurrencyCode} baseCurrencyId={baseCurrency?.id}
                                        onSave={(fields) => handleSave(row, fields)} onDelete={handleDelete} />
                                </Stat>
                                <Stat label="Actual"><span style={{ color: row.actualAmount > 0 ? '#1e293b' : '#cbd5e1' }}>{row.actualAmount > 0 ? fmt(row.actualAmount) : '—'}</span></Stat>
                                <Stat label="Variance"><span style={varianceStyle(row.variance, row.budgetedAmount)}>{row.budgetedAmount > 0 ? (row.variance >= 0 ? '' : '− ') + fmt(Math.abs(row.variance)) : '—'}</span></Stat>
                                <div style={{ width: 120 }}>
                                    {spendPct !== null
                                        ? <><div style={{ fontSize: 10, color: '#64748b', textAlign: 'right' }}>{spendPct}%</div><SpendBar actual={row.actualAmount} budget={row.amountInBaseCurrency} /></>
                                        : <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>}
                                </div>
                            </div>
                        </div>

                        {/* Accordion body: items (BOM list — qty-based, price is indicative only) */}
                        {expanded && (
                            <div style={{ padding: '10px 14px 14px 38px', background: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: 10.5, color: '#64748b', marginBottom: 6, fontStyle: 'italic' }}>
                                    Items below form the material list (BOM) for this cost header.
                                    The <strong>budget amount is set on the header row above</strong> and is independent of these line quantities.
                                    Unit price here is indicative only (last purchase price pre-filled as a reference).
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                                    <thead><tr style={{ color: '#94a3b8' }}>
                                        <th style={{ textAlign: 'left', padding: '4px 6px' }}>Item</th>
                                        <th style={{ textAlign: 'right', padding: '4px 6px', width: 90 }}>Qty</th>
                                        <th style={{ textAlign: 'right', padding: '4px 6px', width: 130 }}
                                            title="Indicative unit price — pre-filled from last purchase. Does not affect the budget amount above.">
                                            Unit Price <span style={{ fontWeight: 400, fontSize: 9 }}>(indicative)</span>
                                        </th>
                                        <th style={{ width: 60 }}></th>
                                    </tr></thead>
                                    <tbody>
                                        {items.length === 0 && (
                                            <tr><td colSpan={4} style={{ padding: '6px', color: '#94a3b8' }}>No items yet.</td></tr>
                                        )}
                                        {items.map(it => (
                                            <tr key={it.budgetItemId}>
                                                <td style={{ padding: '4px 6px' }}>{it.itemCode ? `[${it.itemCode}] ` : ''}{it.itemName}</td>
                                                <td style={{ padding: '4px 6px', textAlign: 'right' }}>{fmt(it.qty)} {it.uomCode || ''}</td>
                                                <td style={{ padding: '4px 6px', textAlign: 'right' }}
                                                    title={it.lastPurchasePrice ? `Last purchase: ${fmt(it.lastPurchasePrice)} ${it.lastPurchaseCurrencyShort || ''}` : 'No purchase history'}>
                                                    {it.unitPrice > 0
                                                        ? <span style={{ color: '#1e293b' }}>{fmt(it.unitPrice)}</span>
                                                        : it.lastPurchasePrice
                                                            ? <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>— (last: {fmt(it.lastPurchasePrice)} {it.lastPurchaseCurrencyShort || ''})</span>
                                                            : <span style={{ color: '#cbd5e1' }}>—</span>}
                                                </td>
                                                <td style={{ padding: '4px 6px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    <button type="button" title="View qty change history for this item" onClick={() => openItemLog(it)}
                                                        style={{ background: 'none', border: 0, color: '#64748b', cursor: 'pointer', marginRight: 6 }}>🕘</button>
                                                    {canEdit && <>
                                                        <button type="button" title="Edit line" onClick={() => editBudgetItem(it)}
                                                            style={{ background: 'none', border: 0, color: '#2563eb', cursor: 'pointer', marginRight: 6 }}>✏️</button>
                                                        <button type="button" title="Delete line" onClick={() => deleteBudgetItem(row.costCategoryId, it.budgetItemId)}
                                                            style={{ background: 'none', border: 0, color: '#dc2626', cursor: 'pointer' }}>✕</button>
                                                    </>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {canEdit && (
                                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
                                        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                                            <input type="text"
                                                ref={itemInputRef}
                                                value={itemSearch}
                                                disabled={pickLoading || !pickItems.length}
                                                placeholder={pickLoading ? 'Loading items…' : pickItems.length ? `Search ${pickItems.length} items by code or name…` : 'No items linked to this header'}
                                                onChange={e => { setItemSearch(e.target.value); setItemPickerOpen(true); setItemDraft(p => ({ ...p, itemId: '' })); }}
                                                onFocus={() => pickItems.length && setItemPickerOpen(true)}
                                                onBlur={() => setTimeout(() => setItemPickerOpen(false), 150)}
                                                style={{ width: '100%', boxSizing: 'border-box', padding: 6,
                                                         border: `1px solid ${itemDraft.itemId ? '#0f766e' : '#cbd5e1'}`, borderRadius: 5, fontSize: 12,
                                                         background: (pickLoading || !pickItems.length) ? '#f1f5f9' : '#fff' }} />
                                            {itemPickerOpen && pickItems.length > 0 && pickerRect && ReactDOM.createPortal((() => {
                                                const q = itemSearch.trim().toLowerCase();
                                                const matches = q
                                                    ? pickItems.filter(it => (it.name || '').toLowerCase().includes(q) || (it.code || '').toLowerCase().includes(q))
                                                    : pickItems;
                                                const shown = matches.slice(0, 50);
                                                return (
                                                    <div style={{ position: 'fixed', top: pickerRect.bottom + 2, left: pickerRect.left, width: pickerRect.width,
                                                                  zIndex: 9999, background: '#fff', border: '1px solid #c8d4e4', borderRadius: 6,
                                                                  boxShadow: '0 4px 16px rgba(0,0,0,.18)', maxHeight: 240, overflowY: 'auto' }}>
                                                        {shown.length === 0
                                                            ? <div style={{ padding: '7px 10px', fontSize: 12, color: '#94a3b8' }}>No matching items.</div>
                                                            : shown.map(it => (
                                                                <div key={it.id}
                                                                    onMouseDown={() => {
                                                                        setItemDraft(p => ({ ...p, itemId: String(it.id),
                                                                            unitPrice: it.lastPurchasePrice != null ? String(it.lastPurchasePrice) : p.unitPrice }));
                                                                        setItemSearch(itemOptLabel(it));
                                                                        setItemPickerOpen(false);
                                                                    }}
                                                                    style={{ padding: '7px 10px', cursor: 'pointer', fontSize: 12, borderBottom: '1px solid #f1f5f9' }}
                                                                    onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                                                                    onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                                                                    {itemOptLabel(it)}
                                                                    {it.lastPurchasePrice ? <span style={{ color: '#94a3b8' }}> · last: {fmt(it.lastPurchasePrice)} {it.lastPurchaseCurrencyShort || ''}</span> : ''}
                                                                </div>
                                                            ))}
                                                        {!q && matches.length > 50 && (
                                                            <div style={{ padding: '6px 10px', fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                                                                Showing 50 of {matches.length} — type to narrow.
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })(), document.body)}
                                        </div>
                                        <input type="number" placeholder="Qty" value={itemDraft.qty} onChange={e => setItemDraft(p => ({ ...p, qty: e.target.value }))}
                                            style={{ width: 80, padding: 6, border: '1px solid #cbd5e1', borderRadius: 5, fontSize: 12 }} />
                                        <div style={{ position: 'relative' }}>
                                            <input type="number" value={itemDraft.unitPrice} onChange={e => setItemDraft(p => ({ ...p, unitPrice: e.target.value }))}
                                                title="Indicative unit price — pre-filled from last purchase. Optional; does not affect the budget amount set above."
                                                style={{ width: 110, padding: 6, border: '1px solid #cbd5e1', borderRadius: 5, fontSize: 12,
                                                         background: itemDraft.unitPrice ? '#fff' : '#fffbeb' }}
                                                placeholder="Price (opt.)" />
                                        </div>
                                        {itemErr && <span style={{ fontSize: 11, color: '#dc2626' }}>{itemErr}</span>}
                                        <button type="button" onClick={() => saveBudgetItem(row.costCategoryId)} disabled={itemBusy}
                                            style={{ background: itemDraft.budgetItemId ? '#2563eb' : '#0f766e', color: '#fff', border: 0, borderRadius: 5, padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}>
                                            {itemBusy ? '…' : itemDraft.budgetItemId ? 'Update' : 'Add'}
                                        </button>
                                        {itemDraft.budgetItemId ? (
                                            <button type="button" onClick={() => { setItemDraft(blankDraft); setItemSearch(''); setItemPickerOpen(false); }}
                                                style={{ background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', borderRadius: 5, padding: '6px 10px', cursor: 'pointer', fontSize: 12 }}>Cancel</button>
                                        ) : null}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* ── Totals bar ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12,
                          marginTop: 6, padding: '12px 16px', background: '#1e3a5f', color: '#fff', borderRadius: 8 }}>
                <span style={{ fontWeight: 700, letterSpacing: '.5px' }}>TOTAL</span>
                <div style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap', fontFamily: 'Courier New' }}>
                    <span>Budget <strong>{fmt(totalBudget)}</strong></span>
                    <span>Actual <strong>{fmt(totalActual)}</strong></span>
                    <span style={{ color: totalVar >= 0 ? '#86efac' : '#fca5a5' }}>Variance <strong>{(totalVar >= 0 ? '' : '− ') + fmt(Math.abs(totalVar))}</strong></span>
                    {totalBudget > 0 && <span style={{ color: '#94a3b8' }}>{budgetUsedPct.toFixed(1)}% used</span>}
                </div>
            </div>

            <div style={{ marginTop: 12, fontSize: 10.5, color: '#94a3b8' }}>
                Actual costs: Committed POs + Confirmed SRVs + Confirmed Timesheets + Stock Issues + Approved Expenses
            </div>

            {/* ── Reason + password modal for approve / revise ── */}
            {pwdAction === 'approve' && (
                <PasswordModal
                    title="Approve budget"
                    message={`This will lock the current revision (Rev ${header.currentRvNo}) so no further edits are possible until someone with Revise permission creates a new revision. A reason and the shared budget password are required.`}
                    busy={pwdBusy}
                    onCancel={() => !pwdBusy && setPwdAction(null)}
                    onConfirm={(pwd, reason) => callBudgetAction('approve', pwd, reason)}
                />
            )}
            {pwdAction === 'revise' && (
                <PasswordModal
                    title="Revise approved budget"
                    message={`This will copy the approved Rev ${header.currentRvNo} into a new editable Rev ${header.currentRvNo + 1}. The current revision will be preserved as history. A reason and the shared budget password are required.`}
                    busy={pwdBusy}
                    onCancel={() => !pwdBusy && setPwdAction(null)}
                    onConfirm={(pwd, reason) => callBudgetAction('revise', pwd, reason)}
                />
            )}
            {showImport && (
                <BudgetImportModal
                    job={job}
                    rvNo={header.currentRvNo}
                    onClose={() => setShowImport(false)}
                    onImported={() => { setShowImport(false); load(); }}
                />
            )}
            {showLog && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                     onMouseDown={e => { if (e.target === e.currentTarget) setShowLog(false); }}>
                    <div onMouseDown={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, width: '92%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ padding: '16px 22px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                            <div style={{ fontWeight: 700, fontSize: 16, color: '#1e293b' }}>
                                {logItemId ? 'Item Change History' : `Budget Item Change Log — ${job.jobId}`}
                                <span style={{ fontWeight: 400, fontSize: 12.5, color: '#94a3b8', marginLeft: 8 }}>
                                    {logItemId ? logItemLabel : (logRvOnly ? `Rev ${header.currentRvNo} only` : 'all revisions')}
                                </span>
                                {logItemId && (
                                    <button onClick={() => { setLogItemId(null); setLogItemLabel(''); fetchLog(logRvOnly, null); }}
                                        style={{ marginLeft: 10, fontSize: 11, padding: '2px 8px', border: '1px solid #cbd5e1', borderRadius: 10, background: '#fff', cursor: 'pointer', color: '#475569', fontWeight: 600 }}>
                                        Show all items
                                    </button>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <label style={{ fontSize: 12, color: '#475569', display: 'flex', gap: 5, alignItems: 'center', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={logRvOnly}
                                        onChange={e => { setLogRvOnly(e.target.checked); fetchLog(e.target.checked); }} />
                                    This revision only
                                </label>
                                <button onClick={() => setShowLog(false)} style={{ background: 'none', border: 0, fontSize: 20, cursor: 'pointer', color: '#64748b' }}>✕</button>
                            </div>
                        </div>
                        {logRows.length > 0 && (() => {
                            const counts = logRows.reduce((m, l) => { m[l.action] = (m[l.action] || 0) + 1; return m; }, {});
                            const actions = ['ADD', 'INCREASE', 'DECREASE', 'UPDATE', 'DELETE'].filter(a => counts[a]);
                            const chipCol = { ADD: ['#dcfce7', '#166534'], INCREASE: ['#dbeafe', '#1e40af'], DECREASE: ['#fef3c7', '#92400e'], UPDATE: ['#e2e8f0', '#475569'], DELETE: ['#fee2e2', '#991b1b'] };
                            return (
                                <div style={{ padding: '10px 22px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', background: '#fbfcfe' }}>
                                    <input value={logSearch} onChange={e => setLogSearch(e.target.value)}
                                        type="search" autoComplete="off" placeholder="🔍 Filter by item or header…"
                                        style={{ flex: '1 1 200px', minWidth: 150, padding: '5px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 12, background: '#fff' }} />
                                    <button onClick={() => setLogAction('')}
                                        style={{ padding: '4px 10px', borderRadius: 14, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                 border: `1px solid ${logAction === '' ? '#94a3b8' : '#e2e8f0'}`, background: logAction === '' ? '#475569' : '#fff', color: logAction === '' ? '#fff' : '#475569' }}>
                                        All ({logRows.length})
                                    </button>
                                    {actions.map(a => {
                                        const on = logAction === a;
                                        const [bg, fg] = chipCol[a];
                                        return (
                                            <button key={a} onClick={() => setLogAction(on ? '' : a)}
                                                style={{ padding: '4px 10px', borderRadius: 14, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                                                         border: `1px solid ${on ? fg : '#e2e8f0'}`, background: on ? bg : '#fff', color: fg }}>
                                                {a} ({counts[a]})
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })()}
                        <div style={{ padding: '14px 22px', overflowY: 'auto' }}>
                            {(() => { const term = logSearch.trim().toLowerCase();
                              const shown = logRows.filter(l =>
                                  (!logAction || l.action === logAction) &&
                                  (!term || `${l.itemCode || ''} ${l.itemName || ''} ${l.budgetHeader || ''}`.toLowerCase().includes(term)));
                              return logRows.length === 0 ? (
                                <div style={{ color: '#94a3b8', padding: 12 }}>
                                    No budget-item changes recorded {logItemId ? 'for this item' : logRvOnly ? `for Rev ${header.currentRvNo}` : 'for this job'} yet.
                                    <div style={{ fontSize: 11, marginTop: 6 }}>Tracking begins from the first add/edit/delete after this feature was enabled — earlier edits are not back-filled.</div>
                                </div>
                              ) : shown.length === 0 ? (
                                <div style={{ color: '#94a3b8', padding: 12 }}>No changes match the current filters.</div>
                              ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                    <thead><tr style={{ color: '#64748b', background: '#f8fafc' }}>
                                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>When</th>
                                        <th style={{ textAlign: 'center', padding: '6px 8px' }}>Rev</th>
                                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>Item</th>
                                        <th style={{ textAlign: 'center', padding: '6px 8px' }}>Action</th>
                                        <th style={{ textAlign: 'right', padding: '6px 8px' }}>Old Qty</th>
                                        <th style={{ textAlign: 'right', padding: '6px 8px' }}>New Qty</th>
                                        <th style={{ textAlign: 'right', padding: '6px 8px' }}>Δ</th>
                                        <th style={{ textAlign: 'left', padding: '6px 8px' }}>By</th>
                                    </tr></thead>
                                    <tbody>
                                        {shown.map(l => {
                                            const chip = { ADD: ['#dcfce7', '#166534'], INCREASE: ['#dbeafe', '#1e40af'], DECREASE: ['#fef3c7', '#92400e'], UPDATE: ['#e2e8f0', '#475569'], DELETE: ['#fee2e2', '#991b1b'] }[l.action] || ['#e2e8f0', '#475569'];
                                            return (
                                                <tr key={l.logId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#64748b' }}>{l.changedDate ? new Date(l.changedDate).toLocaleString('en-GB') : '—'}</td>
                                                    <td style={{ padding: '6px 8px', textAlign: 'center', color: '#64748b', fontWeight: 600 }}>{l.rvNo}</td>
                                                    <td style={{ padding: '6px 8px' }}>{l.itemCode ? `[${l.itemCode}] ` : ''}{l.itemName}<div style={{ fontSize: 10, color: '#94a3b8' }}>{l.budgetHeader}</div></td>
                                                    <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                        <span style={{ background: chip[0], color: chip[1], padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>{l.action}</span>
                                                    </td>
                                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'Courier New' }}>{l.oldQty != null ? fmt(l.oldQty) : '—'}</td>
                                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'Courier New', fontWeight: 600 }}>{l.newQty != null ? fmt(l.newQty) : '—'}</td>
                                                    <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'Courier New', color: (l.qtyDelta || 0) > 0 ? '#16a34a' : (l.qtyDelta || 0) < 0 ? '#dc2626' : '#94a3b8' }}>
                                                        {(l.qtyDelta || 0) > 0 ? '+' : ''}{fmt(l.qtyDelta || 0)}
                                                    </td>
                                                    <td style={{ padding: '6px 8px', color: '#64748b' }}>
                                                        {l.changedBy || '—'}
                                                        {l.reason && <div style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic', maxWidth: 200, whiteSpace: 'normal' }} title={l.reason}>“{l.reason}”</div>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                              ); })()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const TH = { padding: '8px 12px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px', color: '#475569', textAlign: 'left', whiteSpace: 'nowrap' };
const TD = { padding: '10px 12px', verticalAlign: 'middle' };

// ── Summary-only tab (read-only) — add/edit happens on the dedicated page ──
const JobBudgetSummaryTab = ({ job }) => {
    const navigate = useNavigate();
    const { baseCurrencyCode } = useLookup();
    const [header,  setHeader]  = useState({ currentRvNo: 0, isApproved: false });
    const [rows,    setRows]    = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`${variables.API_URL}jobbudget/${encodeURIComponent(job.jobId)}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => { setHeader(d?.header || { currentRvNo: 0, isApproved: false }); setRows(Array.isArray(d?.lines) ? d.lines : []); })
            .catch(e => console.error('Load budget summary:', e))
            .finally(() => setLoading(false));
    }, [job.jobId]);

    const totalBudget = rows.reduce((s, r) => s + (r.amountInBaseCurrency || 0), 0);
    const totalActual = rows.reduce((s, r) => s + (r.actualAmount || 0), 0);
    const totalVar    = totalBudget - totalActual;
    const usedPct     = totalBudget > 0 ? Math.min((totalActual / totalBudget) * 100, 999) : 0;
    const setRowsN    = rows.filter(r => r.budgetedAmount > 0).length;
    // In-house jobs: scope the summary to the single linked cost header.
    const visibleRows = (job.isCostingRequired === false && job.budgetCategoryId)
        ? rows.filter(r => String(r.costCategoryId) === String(job.budgetCategoryId))
        : rows;

    if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading…</div>;

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ fontSize: 13, color: '#475569' }}>
                    Revision <strong>Rev {header.currentRvNo}</strong>
                    {header.isApproved
                        ? <span style={{ marginLeft: 8, background: '#dcfce7', color: '#166534', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>🔒 Approved</span>
                        : <span style={{ marginLeft: 8, background: '#fef9c3', color: '#854d0e', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600 }}>Draft</span>}
                    <span style={{ marginLeft: 10, color: '#94a3b8' }}>{setRowsN} of {visibleRows.length} headers budgeted</span>
                </div>
                {job.approvalStatus === 'Approved' && (
                    <button onClick={() => navigate(`/jobs/${encodeURIComponent(job.jobId)}/budget`)}
                        style={{ background: '#1e40af', color: '#fff', border: 0, borderRadius: 7, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        Add / Edit Budget →
                    </button>
                )}
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                        <th style={TH}>Cost Category</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Budget{baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Actual{baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Variance{baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}</th>
                        <th style={{ ...TH, width: 160 }}>Spend</th>
                    </tr>
                </thead>
                <tbody>
                    {visibleRows.map(row => {
                        const src      = SOURCE_INFO[row.categoryCode] || {};
                        const spendPct = row.amountInBaseCurrency > 0
                            ? Math.min((row.actualAmount / row.amountInBaseCurrency) * 100, 100).toFixed(0) : null;
                        return (
                            <tr key={row.costCategoryId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={TD}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 16 }}>{src.icon || '•'}</span>
                                        <div style={{ fontWeight: 600, color: '#1e293b' }}>{row.categoryName}</div>
                                    </div>
                                </td>
                                <td style={{ ...TD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 600, color: row.amountInBaseCurrency > 0 ? '#1e293b' : '#cbd5e1' }}>
                                    {row.amountInBaseCurrency > 0 ? fmt(row.amountInBaseCurrency) : '—'}
                                </td>
                                <td style={{ ...TD, textAlign: 'right', fontFamily: 'Courier New', color: row.actualAmount > 0 ? '#1e293b' : '#94a3b8' }}>
                                    {row.actualAmount > 0 ? fmt(row.actualAmount) : '—'}
                                </td>
                                <td style={{ ...TD, textAlign: 'right', fontFamily: 'Courier New', ...varianceStyle(row.variance, row.budgetedAmount) }}>
                                    {row.budgetedAmount > 0 ? (row.variance >= 0 ? '' : '− ') + fmt(Math.abs(row.variance)) : '—'}
                                </td>
                                <td style={TD}>
                                    {spendPct !== null
                                        ? <div><div style={{ fontSize: 10, color: '#64748b', textAlign: 'right' }}>{spendPct}%</div><SpendBar actual={row.actualAmount} budget={row.amountInBaseCurrency} /></div>
                                        : <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>}
                                </td>
                            </tr>
                        );
                    })}
                    {visibleRows.length === 0 && <tr><td style={TD} colSpan={5}><span style={{ color: '#94a3b8' }}>No budget set yet. Click <strong>Add / Edit Budget</strong>.</span></td></tr>}
                </tbody>
                <tfoot>
                    <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                        <td style={{ ...TD, fontWeight: 700, color: '#fff' }}>TOTAL</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 700, color: '#fff' }}>{fmt(totalBudget)}</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 700, color: '#fff' }}>{fmt(totalActual)}</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 700, color: totalVar >= 0 ? '#86efac' : '#fca5a5' }}>
                            {(totalVar >= 0 ? '' : '− ') + fmt(Math.abs(totalVar))}
                        </td>
                        <td style={TD}>{totalBudget > 0 && <div><div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right' }}>{usedPct.toFixed(1)}% used</div><SpendBar actual={totalActual} budget={totalBudget} /></div>}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    );
};

export { JobBudgetEditor };
export default JobBudgetSummaryTab;
