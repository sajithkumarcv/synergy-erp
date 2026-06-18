import React, { useState, useEffect, useCallback, useRef } from 'react';
import { variables, authHeaders } from '../../Variable';
import { useCurrentUser } from '../../AuthContext';
import { useLookup } from '../../LookupContext';
import { usePermission } from '../../PermissionContext';
import { fmt } from '../jobConstants';
import AmountInput from '../../common/AmountInput';
import AlertModal from '../../common/AlertModal';

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
                <input type="password" className="pf-input"
                    style={{ width: '100%', padding: '7px 10px', fontSize: 13 }}
                    value={pwd} onChange={e => setPwd(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submit()}
                    disabled={busy} autoComplete="current-password" />

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
const JobBudgetTab = ({ job }) => {
    const currentUser       = useCurrentUser();
    const { lookups, baseCurrency, baseCurrencyCode } = useLookup();
    const { canDo }         = usePermission();
    const uoms              = lookups.uoms || [];
    const currencies        = lookups.currencies || [];

    const [header,  setHeader]  = useState({ currentRvNo: 0, isApproved: false, approvedBy: null, approvedDate: null, totalRevisions: 0 });
    const [rows,    setRows]    = useState([]);
    const [loading, setLoading] = useState(true);
    const [pwdAction, setPwdAction] = useState(null);  // 'approve' | 'revise' | null
    const [pwdBusy,   setPwdBusy]   = useState(false);
    const [banner,    setBanner]    = useState('');
    const [alertMsg,  setAlertMsg]  = useState(null);

    // ── Permission flags from TBL_ROLE_MENU_ACTION (via PermissionContext) ──
    const canEditPerm = canDo('/jobs', 'EDIT');
    const canApprove  = canDo('/jobs', 'APPROVE');
    const canRevise   = canDo('/jobs', 'REVISE');

    // canEdit = job not closed AND user has EDIT permission AND budget is not approved
    const jobOpen   = ![3, 4, 5].includes(Number(job.jobStatusId));
    const canEdit   = jobOpen && canEditPerm && !header.isApproved;

    const load = useCallback(() => {
        setLoading(true);
        fetch(`${variables.API_URL}jobbudget/${encodeURIComponent(job.jobId)}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => {
                setHeader(d?.header || { currentRvNo: 0, isApproved: false, totalRevisions: 0 });
                setRows(Array.isArray(d?.lines) ? d.lines : []);
            })
            .catch(e => console.error('Load budget:', e))
            .finally(() => setLoading(false));
    }, [job.jobId]);

    useEffect(() => { load(); }, [load]);

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

    const handleDelete = async (row) => {
        if (!row.jobBudgetId) return;
        if (!window.confirm(`Clear budget for "${row.categoryName}"?`)) return;
        try {
            const res = await fetch(`${variables.API_URL}jobbudget/${row.jobBudgetId}`, {
                method: 'DELETE', headers: authHeaders(),
            });
            const d = await res.json().catch(() => ({}));
            if (!res.ok) { setAlertMsg(d?.message || 'Delete failed.'); return; }
            load();
        } catch { setAlertMsg('Network error.'); }
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
            load();
            return true;
        } catch {
            setPwdBusy(false);
            return 'Network error. Please try again.';
        }
    };

    // Totals — budget lines may be in mixed currencies, so totals are in BASE currency.
    const totalBudget    = rows.reduce((s, r) => s + (r.amountInBaseCurrency || 0), 0);
    const totalActual    = rows.reduce((s, r) => s + (r.actualAmount  || 0), 0);
    const totalVar       = totalBudget - totalActual;
    const budgetUsedPct  = totalBudget > 0 ? Math.min((totalActual / totalBudget) * 100, 999) : 0;
    const setBudgetCount = rows.filter(r => r.budgetedAmount > 0).length;
    const showVersionBadge = header.totalRevisions > 1 || header.isApproved;

    if (loading) return <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Loading…</div>;

    return (
        <div>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            {/* ── Action banner ── */}
            {banner && (
                <div style={{ marginBottom: 12, padding: '8px 14px', background: '#dcfce7', color: '#166534', borderRadius: 6, fontSize: 12.5 }}>
                    ✓ {banner}
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
                    {header.isApproved && header.approvedBy && (
                        <span style={{ fontSize: 11, color: '#64748b' }}>
                            Approved by <strong>{header.approvedBy}</strong>
                            {header.approvedDate && ` on ${new Date(header.approvedDate).toLocaleDateString('en-GB')}`}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {/* Approve — only when there are lines, not yet approved */}
                    {!header.isApproved && setBudgetCount > 0 && canApprove && (
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
                    {/* Revise — only when approved */}
                    {header.isApproved && canRevise && (
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
            {canEdit && setBudgetCount === 0 && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, fontSize: 12.5, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>💡</span>
                    No budget set yet. Click <strong>＋ Set budget</strong> on any row below to enter budget amounts.
                </div>
            )}
            {header.isApproved && !canRevise && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 7, fontSize: 12.5, color: '#1e40af' }}>
                    🔒 Budget is approved and locked. Only users with <strong>Revise</strong> permission on Jobs can create a new revision.
                </div>
            )}

            {/* ── Budget table ── */}
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                    <tr style={{ background: '#f1f5f9' }}>
                        <th style={TH}>Cost Category</th>
                        <th style={{ ...TH, textAlign: 'right', minWidth: 180 }}>Budget</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Actual{baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}</th>
                        <th style={{ ...TH, textAlign: 'right' }}>Variance{baseCurrencyCode ? ` (${baseCurrencyCode})` : ''}</th>
                        <th style={{ ...TH, width: 160 }}>Spend</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const src      = SOURCE_INFO[row.categoryCode] || {};
                        const spendPct = row.amountInBaseCurrency > 0
                            ? Math.min((row.actualAmount / row.amountInBaseCurrency) * 100, 100).toFixed(0)
                            : null;

                        return (
                            <tr key={row.costCategoryId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={TD}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <span style={{ fontSize: 16 }}>{src.icon || '•'}</span>
                                        <div>
                                            <div style={{ fontWeight: 600, color: '#1e293b' }}>{row.categoryName}</div>
                                            {src.tip && <div style={{ fontSize: 10, color: '#94a3b8' }}>{src.tip}</div>}
                                        </div>
                                    </div>
                                </td>
                                <td style={{ ...TD, textAlign: 'right' }}>
                                    <EditableCell
                                        row={row}
                                        canEdit={canEdit}
                                        uoms={uoms}
                                        currencies={currencies}
                                        job={job}
                                        baseCurrencyCode={baseCurrencyCode}
                                        baseCurrencyId={baseCurrency?.id}
                                        onSave={(fields) => handleSave(row, fields)}
                                        onDelete={handleDelete}
                                    />
                                </td>
                                <td style={{ ...TD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 500, color: row.actualAmount > 0 ? '#1e293b' : '#94a3b8' }}>
                                    {row.actualAmount > 0 ? fmt(row.actualAmount) : '—'}
                                </td>
                                <td style={{ ...TD, textAlign: 'right', fontFamily: 'Courier New', ...varianceStyle(row.variance, row.budgetedAmount) }}>
                                    {row.budgetedAmount > 0
                                        ? (row.variance >= 0 ? '' : '− ') + fmt(Math.abs(row.variance))
                                        : '—'}
                                </td>
                                <td style={TD}>
                                    {spendPct !== null
                                        ? <div>
                                            <div style={{ fontSize: 10, color: '#64748b', textAlign: 'right' }}>{spendPct}%</div>
                                            <SpendBar actual={row.actualAmount} budget={row.amountInBaseCurrency} />
                                          </div>
                                        : <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                        <td style={{ ...TD, fontWeight: 700, color: '#fff' }}>TOTAL</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 700, color: '#fff' }}>{fmt(totalBudget)}</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 700, color: '#fff' }}>{fmt(totalActual)}</td>
                        <td style={{ ...TD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 700, color: totalVar >= 0 ? '#86efac' : '#fca5a5' }}>
                            {(totalVar >= 0 ? '' : '− ') + fmt(Math.abs(totalVar))}
                        </td>
                        <td style={TD}>
                            {totalBudget > 0 && (
                                <div>
                                    <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right' }}>{budgetUsedPct.toFixed(1)}% used</div>
                                    <SpendBar actual={totalActual} budget={totalBudget} />
                                </div>
                            )}
                        </td>
                    </tr>
                </tfoot>
            </table>

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
        </div>
    );
};

const TH = { padding: '8px 12px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px', color: '#475569', textAlign: 'left', whiteSpace: 'nowrap' };
const TD = { padding: '10px 12px', verticalAlign: 'middle' };

export default JobBudgetTab;
