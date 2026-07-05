import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { variables, authHeaders } from '../Variable';
import { useLookup } from '../LookupContext';
import { useCurrentUser } from '../AuthContext';
import { usePermission } from '../PermissionContext';
import AmountInput from '../common/AmountInput';
import AlertModal from '../common/AlertModal';
import ConfirmModal from '../common/ConfirmModal';
import PoPrintModal            from '../procurement/po/PoPrintModal';
import IssueNotePrintModal     from '../inventory/issue/IssueNotePrintModal';
import IssueReturnPrintModal   from '../inventory/issuereturn/IssueReturnPrintModal';
import InvoicePrintModal       from '../invoice/InvoicePrintModal';
import DeliveryPrintModal      from '../delivery/DeliveryPrintModal';
import { openPrintWindow }     from '../utils/printWindow';
import '../procurement/Procurement.css';

// ── helpers ───────────────────────────────────────────────────────────────────
const fmt = (n, dec = 2) =>
    n == null ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtDate = d => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtDateLong = d => {
    if (!d) return '—';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
};

const StatusBadge = ({ text, closed }) => {
    // closed-job override comes first; otherwise map a handful of common
    // document / job statuses to colours and fall through to a neutral chip.
    const map = {
        Active:           { bg: '#dcfce7', color: '#166534' },
        Approved:         { bg: '#dcfce7', color: '#166534' },
        Confirmed:        { bg: '#dcfce7', color: '#166534' },
        Received:         { bg: '#dcfce7', color: '#166534' },
        Posted:           { bg: '#d1fae5', color: '#065f46' },
        Completed:        { bg: '#d1fae5', color: '#065f46' },
        Draft:            { bg: '#e0f2fe', color: '#0369a1' },
        Pending:          { bg: '#fef9c3', color: '#854d0e' },
        PendingApproval:  { bg: '#fef9c3', color: '#854d0e' },
        PendingL1:        { bg: '#fef9c3', color: '#854d0e' },
        PendingL2:        { bg: '#fef9c3', color: '#854d0e' },
        Partial:          { bg: '#ffedd5', color: '#9a3412' },
        'Waiting':        { bg: '#fef9c3', color: '#854d0e' },
        Cancelled:        { bg: '#fee2e2', color: '#991b1b' },
        Rejected:         { bg: '#fee2e2', color: '#991b1b' },
        SentBack:         { bg: '#fef3c7', color: '#92400e' },
        Returned:         { bg: '#fef3c7', color: '#92400e' },
        Freezed:          { bg: '#ede9fe', color: '#5b21b6' },
        Revised:          { bg: '#ede9fe', color: '#5b21b6' },
    };
    const color = closed
        ? { bg: '#fee2e2', color: '#991b1b' }
        : map[text] || { bg: '#f1f5f9', color: '#475569' };
    return (
        <span style={{
            background: color.bg, color: color.color,
            padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap'
        }}>{text || '—'}</span>
    );
};

// ── Collapsible section ───────────────────────────────────────────────────────
const Section = ({ title, count, icon, children, defaultOpen = true }) => {
    const [open, setOpen] = useState(defaultOpen);
    const hasData = count != null && count > 0;
    return (
        <div style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderLeft: hasData ? '4px solid #22c55e' : '1px solid #e2e8f0',
            borderRadius: 8, marginBottom: 12, overflow: 'hidden'
        }}>
            <div onClick={() => setOpen(o => !o)} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '11px 18px', cursor: 'pointer',
                background: open ? '#f8fafc' : '#fff',
                borderBottom: open ? '1px solid #e2e8f0' : 'none',
                userSelect: 'none'
            }}>
                {icon && <span style={{ fontSize: 15 }}>{icon}</span>}
                <span style={{ fontWeight: 600, fontSize: 13, color: '#1e293b', flex: 1 }}>{title}</span>
                {hasData && (
                    <span style={{ background: '#dcfce7', color: '#16a34a', padding: '1px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{count}</span>
                )}
                <span style={{ color: '#94a3b8', fontSize: 11, marginLeft: 4 }}>{open ? '▲' : '▼'}</span>
            </div>
            {open && <div style={{ padding: '16px 18px' }}>{children}</div>}
        </div>
    );
};

// ── Key/value info grid ───────────────────────────────────────────────────────
const InfoGrid = ({ items }) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '10px 24px' }}>
        {items.filter(i => i.value != null && i.value !== '' && i.value !== '—').map(({ label, value }) => (
            <div key={label}>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 13, color: '#1e293b', fontWeight: 500 }}>{value}</div>
            </div>
        ))}
    </div>
);

// ── Sub-section header inside a section ──────────────────────────────────────
const SubHead = ({ label }) => (
    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.6px',
                  textTransform: 'uppercase', borderTop: '1px solid #f1f5f9',
                  paddingTop: 12, marginTop: 14, marginBottom: 8 }}>
        {label}
    </div>
);

// ── Manhour stat card ─────────────────────────────────────────────────────────
const MhCard = ({ label, hours, cost, currency = '', highlight = false }) => (
    <div style={{
        border: `1px solid ${highlight ? '#bfdbfe' : '#e2e8f0'}`,
        borderRadius: 8, padding: '10px 14px',
        background: highlight ? '#eff6ff' : '#f8fafc',
        minWidth: 160
    }}>
        <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: highlight ? '#1d4ed8' : '#334155' }}>
            {fmt(hours, 2)} hrs
        </div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {currency} {fmt(cost)}
        </div>
    </div>
);

// ── Simple table ──────────────────────────────────────────────────────────────
const OvTable = ({ cols, rows, keyField }) => (
    <div style={{ overflowX: 'auto' }}>
        <table style={{
            width: '100%', borderCollapse: 'collapse', fontSize: 12,
            tableLayout: 'auto'
        }}>
            <thead>
                <tr style={{ background: '#f8fafc' }}>
                    {cols.map(c => (
                        <th key={c.key} style={{
                            padding: '7px 10px', textAlign: c.align || 'left',
                            fontWeight: 600, color: '#64748b', fontSize: 11,
                            borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap',
                            ...c.style
                        }}>{c.label}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.length === 0
                    ? <tr><td colSpan={cols.length} style={{ textAlign: 'center', padding: '16px', color: '#94a3b8', fontSize: 12 }}>No records.</td></tr>
                    : rows.map((r, i) => (
                        <tr key={r[keyField] ?? i} style={{ borderBottom: '1px solid #f1f5f9' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            {cols.map(c => (
                                <td key={c.key} style={{
                                    padding: '7px 10px', color: '#334155',
                                    textAlign: c.align || 'left', ...c.tdStyle
                                }}>
                                    {c.render ? c.render(r) : (r[c.key] ?? '—')}
                                </td>
                            ))}
                        </tr>
                    ))}
            </tbody>
        </table>
    </div>
);

// ── Shared fmtK helper ────────────────────────────────────────────────────────
const fmtK = v => v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : Math.round(v).toLocaleString();

// ── Budget utilisation donut (SVG, viewBox-scalable) ──────────────────────────
const DonutChart = ({ budget, actual, currency = '', scale = 1 }) => {
    const R = 40, CX = 58, CY = 58, SW = 15;
    const circ = 2 * Math.PI * R;
    const pct  = budget > 0 ? actual / budget : 0;
    const over = pct > 1;
    const dash = Math.min(pct, 1) * circ;
    return (
        <svg width={200 * scale} height={116 * scale} viewBox="0 0 200 116">
            <circle cx={CX} cy={CY} r={R} fill="none" stroke="#e2e8f0" strokeWidth={SW} />
            {pct > 0 && (
                <circle cx={CX} cy={CY} r={R} fill="none"
                    stroke={over ? '#ef4444' : '#22c55e'} strokeWidth={SW}
                    strokeDasharray={`${dash} ${circ}`}
                    strokeLinecap={pct < 1 ? 'round' : 'butt'}
                    style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px` }} />
            )}
            <text x={CX} y={CY - 3} textAnchor="middle" fontSize={14} fontWeight={700} fill={over ? '#ef4444' : '#16a34a'}>
                {(pct * 100).toFixed(1)}%
            </text>
            <text x={CX} y={CY + 12} textAnchor="middle" fontSize={9} fill="#94a3b8">utilised</text>
            <rect x={120} y={14} width={8} height={8} fill="#93c5fd" rx={1} />
            <text x={132} y={21} fontSize={9} fill="#94a3b8">Budget</text>
            <text x={120} y={36} fontSize={10} fontWeight={600} fill="#334155">{currency} {fmtK(budget)}</text>
            <rect x={120} y={48} width={8} height={8} fill={over ? '#fca5a5' : '#86efac'} rx={1} />
            <text x={132} y={55} fontSize={9} fill="#94a3b8">Actual</text>
            <text x={120} y={70} fontSize={10} fontWeight={600} fill={over ? '#ef4444' : '#16a34a'}>{currency} {fmtK(actual)}</text>
            {over && <>
                <text x={120} y={86} fontSize={9} fill="#94a3b8">Over by</text>
                <text x={120} y={101} fontSize={10} fontWeight={700} fill="#ef4444">{currency} {fmtK(actual - budget)}</text>
            </>}
        </svg>
    );
};

// ── Budget grouped bar chart (SVG, no dep) ────────────────────────────────────
const BudgetBarChart = ({ rows, currency = '', large = false }) => {
    const PT = 10, PL = 54, PR = 16;
    const PB   = large ? 60  : 48;
    const CH   = large ? 240 : 160;
    const BAR  = large ? 22  : 14;
    const GAP  = large ? 5   : 3;
    const GGAP = large ? 30  : 18;
    const groupW = BAR * 2 + GAP;
    const contentW = PL + rows.length * (groupW + GGAP) - GGAP + PR;
    const W = Math.max(contentW, large ? 500 : 280);
    const avail = CH - PT - PB;
    // Use amountInBaseCurrency for budget so both bars are in the same currency (base).
    const maxV = Math.max(...rows.flatMap(r => [(r.amountInBaseCurrency || r.budgetedAmount || 0), r.actualAmount || 0]), 1);
    const sy = v => PT + (1 - v / maxV) * avail;
    const bh = v => (v / maxV) * avail;
    const baseY = PT + avail;
    const fs = large ? 10 : 8;
    return (
        <div style={{ overflowX: 'auto' }}>
            <svg width={W} height={CH} style={{ display: 'block' }}>
                {[0, 0.25, 0.5, 0.75, 1].map(f => {
                    const y = PT + (1 - f) * avail;
                    return (
                        <g key={f}>
                            <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="#f1f5f9" strokeWidth={1} />
                            <text x={PL - 5} y={y + 3} textAnchor="end" fontSize={fs} fill="#94a3b8">{fmtK(maxV * f)}</text>
                        </g>
                    );
                })}
                <line x1={PL} x2={W - PR} y1={baseY} y2={baseY} stroke="#e2e8f0" strokeWidth={1} />
                {rows.map((r, i) => {
                    const x    = PL + i * (groupW + GGAP);
                    const budg = r.amountInBaseCurrency || r.budgetedAmount || 0;
                    const act  = r.actualAmount  || 0;
                    const over = act > budg;
                    const lbl  = (r.categoryName || '').slice(0, large ? 14 : 9);
                    const lcx  = x + groupW / 2;
                    return (
                        <g key={r.jobBudgetId || i}>
                            <rect x={x} y={sy(budg)} width={BAR} height={bh(budg)} fill="#93c5fd" rx={2}>
                                <title>Budget: {currency} {budg.toLocaleString()}</title>
                            </rect>
                            <rect x={x + BAR + GAP} y={sy(act)} width={BAR} height={bh(act)} fill={over ? '#fca5a5' : '#86efac'} rx={2}>
                                <title>Actual: {currency} {act.toLocaleString()}</title>
                            </rect>
                            <text x={lcx} y={baseY + 5} fontSize={fs} fill="#64748b" textAnchor="end"
                                transform={`rotate(-40,${lcx},${baseY + 5})`}>{lbl}</text>
                        </g>
                    );
                })}
                <rect x={PL} y={CH - 11} width={9} height={9} fill="#93c5fd" rx={1} />
                <text x={PL + 13} y={CH - 4} fontSize={fs} fill="#64748b">Budget</text>
                <rect x={PL + 58} y={CH - 11} width={9} height={9} fill="#86efac" rx={1} />
                <text x={PL + 71} y={CH - 4} fontSize={fs} fill="#64748b">Actual</text>
            </svg>
        </div>
    );
};

// ── Chart modal overlay ───────────────────────────────────────────────────────
const ChartModal = ({ title, onClose, children }) => (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        onClick={onClose}>
        <div style={{ background: '#fff', borderRadius: 12, padding: 28, maxWidth: 780, width: '100%', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 24px 64px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#1e293b' }}>{title}</span>
                <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontSize: 14, color: '#64748b' }}>✕</button>
            </div>
            {children}
        </div>
    </div>
);

// ── Clickable chart wrapper ───────────────────────────────────────────────────
const ChartWrap = ({ title, onExpand, children }) => (
    <div style={{ position: 'relative', cursor: 'pointer' }}
        onClick={onExpand}
        title="Click to expand">
        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>{title}</div>
        {children}
        <span style={{ position: 'absolute', top: 0, right: 0, fontSize: 9, color: '#cbd5e1', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 4, padding: '1px 5px' }}>⊕</span>
    </div>
);

// ── Budget table style constants ─────────────────────────────────────────────
const BudTH = { padding: '8px 12px', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '.4px', color: '#475569', textAlign: 'left', whiteSpace: 'nowrap' };
const BudTD = { padding: '10px 12px', verticalAlign: 'middle' };

// ── Budget reason + password modal ────────────────────────────────────────────
// Used for Approve Budget and Revise Budget. Reason is persisted to TBL_JOB_BUDGET
// (ApprovalReason / RevisionReason) and audited in TBL_JOB_AUDIT.
const PasswordModal = ({ title, message, onCancel, onConfirm, busy }) => {
    const [reason, setReason] = React.useState('');
    const [pwd,    setPwd]    = React.useState('');
    const [err,    setErr]    = React.useState('');
    const reasonRef           = React.useRef(null);
    const mouseDownOnBackdrop = React.useRef(false);

    React.useEffect(() => { setTimeout(() => reasonRef.current?.focus(), 50); }, []);

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
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
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
                <input type="password" autoComplete="new-password" className="pf-input"
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

// ── Variance colour ───────────────────────────────────────────────────────────
const varianceStyle = (v, budgeted) => {
    if (!budgeted) return {};
    if (v >= 0) return { color: '#16a34a', fontWeight: 600 };
    return { color: '#dc2626', fontWeight: 600 };
};

// ── Spend progress bar ────────────────────────────────────────────────────────
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

// ── Category icon map ─────────────────────────────────────────────────────────
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

// ── Inline-edit budget cell ───────────────────────────────────────────────────
const EditableCell = ({ row, canEdit, uoms, currencies, job, baseCurrencyCode, onSave, onDelete }) => {
    const [open,         setOpen]        = useState(false);
    const [qty,          setQty]         = useState('');
    const [unitPrice,    setUnitPrice]   = useState('');
    const [uomId,        setUomId]       = useState('');
    const [notes,        setNotes]       = useState('');
    const [currencyId,   setCurrencyId]  = useState('');
    const [exchangeRate, setExchangeRate]= useState('1');
    const [saving,       setSaving]      = useState(false);
    const [err,          setErr]         = useState('');
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
        // then fall back to the job's own currency (never silently default to base/AED).
        let resolvedId = row.currencyId;
        if (!resolvedId && row.currencyShort) {
            const match = (currencies || []).find(c => c.shortName === row.currencyShort);
            resolvedId = match?.id;
        }
        const cid = resolvedId ?? job?.jobCurrencyId ?? '';
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
            qty:          parseFloat(qty)          || null,
            unitPrice:    parseFloat(unitPrice)    || null,
            uomId:        uomId ? Number(uomId)    : null,
            notes:        notes.trim()             || null,
            currencyId:   currencyId ? Number(currencyId) : null,
            exchangeRate: parseFloat(exchangeRate) || null,
        });
        setSaving(false);
        if (result === true) setOpen(false);
        else setErr(typeof result === 'string' ? result : 'Save failed.');
    };

    const handleKey = (e) => { if (e.key === 'Escape') cancel(); };

    if (open) {
        const computed     = derivedAmount();
        const curObj       = (currencies || []).find(x => String(x.id) === String(currencyId));
        const curCode      = curObj?.shortName || baseCurrencyCode || '';
        const rate         = parseFloat(exchangeRate) || 1;
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
                            disabled={!isForeignLine} />
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

// ── Customer live-search widget ───────────────────────────────────────────────
const CustSearch = ({ value, label, onChange }) => {
    const [q, setQ] = useState(label || '');
    const [results, setResults] = useState([]);
    const [open, setOpen] = useState(false);
    const timer = useRef(null);
    const wrap = useRef(null);

    useEffect(() => { if (!value) setQ(''); }, [value]);

    const search = val => {
        clearTimeout(timer.current);
        setQ(val);
        if (!val.trim()) { setResults([]); setOpen(false); onChange(null, ''); return; }
        timer.current = setTimeout(() => {
            fetch(`${variables.API_URL}customer/search?searchText=${encodeURIComponent(val)}&pageSize=8&page=1&sortCol=CustomerName&sortDir=ASC`,
                { headers: authHeaders() })
                .then(r => r.json()).then(d => { setResults(d.data || []); setOpen(true); })
                .catch(() => {});
        }, 280);
    };

    useEffect(() => {
        const handler = e => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const sel = { padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#334155', background: '#fff', outline: 'none', height: 32, width: 180 };

    return (
        <div ref={wrap} style={{ position: 'relative' }}>
            <input style={sel} placeholder="Customer…" value={q}
                onChange={e => search(e.target.value)}
                onFocus={() => results.length > 0 && setOpen(true)} />
            {value && (
                <button onClick={() => { onChange(null, ''); setQ(''); setResults([]); setOpen(false); }}
                    style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 14 }}>✕</button>
            )}
            {open && results.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 100, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.1)', minWidth: 240, maxHeight: 220, overflowY: 'auto' }}>
                    {results.map(c => (
                        <div key={c.customerId}
                            onMouseDown={() => { onChange(c.customerId, c.customerName); setQ(c.customerName); setOpen(false); }}
                            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = '#fff'}>
                            <div style={{ fontWeight: 600 }}>{c.customerName}</div>
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>{c.customerCode}</div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const ADJ_STATUS_MAP = {
    1: { label: 'Open',        bg: '#dbeafe', color: '#1e40af' },
    2: { label: 'In Progress', bg: '#fef9c3', color: '#854d0e' },
    3: { label: 'Completed',   bg: '#dcfce7', color: '#166534' },
    4: { label: 'On Hold',     bg: '#fce7f3', color: '#9d174d' },
    5: { label: 'Cancelled',   bg: '#fee2e2', color: '#991b1b' },
};

// ── Main component ─────────────────────────────────────────────────────────────
const JobOverview = () => {
    const navigate      = useNavigate();
    const { lookups, baseCurrencyCode } = useLookup();
    const { jobStatuses } = lookups;
    const uoms          = lookups.uoms || [];
    const currentUser   = useCurrentUser();
    const { canDo }     = usePermission();

    const [jobTypeFilter, setJobTypeFilter] = useState('');
    const [statusFilter,  setStatusFilter]  = useState('');
    const [custId,        setCustId]        = useState(null);
    const [custLabel,     setCustLabel]     = useState('');
    const [selectedJobId, setSelectedJobId] = useState('');

    const [jobTypes,    setJobTypes]    = useState([]);
    const [jobList,     setJobList]     = useState([]);
    const [jobsLoading, setJobsLoading] = useState(false);

    const [data,          setData]         = useState(null);
    const [loading,       setLoading]      = useState(false);
    const [error,         setError]        = useState('');
    const [modal,         setModal]        = useState(null); // { title, content }
    const [budgetHeader,  setBudgetHeader] = useState({ currentRvNo: 0, isApproved: false, approvedBy: null, approvedDate: null, totalRevisions: 0 });
    const [budgetRows,    setBudgetRows]   = useState([]);
    const [budgetLoading, setBudgetLoading]= useState(false);
    const [pwdAction,     setPwdAction]    = useState(null); // 'approve' | 'revise' | null
    const [pwdBusy,       setPwdBusy]      = useState(false);
    const [budgetBanner,  setBudgetBanner] = useState('');
    const [additionalJobs,setAdditionalJobs] = useState([]);
    const [addlLoading,   setAddlLoading]  = useState(false);
    const [variationFinances, setVariationFinances] = useState([]);
    const [alertMsg,      setAlertMsg]     = useState(null);
    const [confirm,       setConfirm]      = useState(null);
    const [printData,     setPrintData]    = useState(null);
    const [printLoading,  setPrintLoading] = useState(false);

    const triggerPrint = async (type, id) => {
        if (printLoading) return;
        setPrintLoading(true);
        const h = { headers: authHeaders() };
        try {
            let payload;
            if (type === 'po') {
                const res = await fetch(`${variables.API_URL}purchaseorder/${id}`, h);
                payload = { po: await res.json() };
            } else if (type === 'issue') {
                const d = await (await fetch(`${variables.API_URL}stockissue/${id}`, h)).json();
                payload = { issue: d.issue, lines: d.lines || [] };
            } else if (type === 'return') {
                const d = await (await fetch(`${variables.API_URL}stockissuereturn/${id}`, h)).json();
                payload = { issueReturn: d.issueReturn, lines: d.lines || [] };
            } else if (type === 'invoice') {
                const d = await (await fetch(`${variables.API_URL}invoice/${id}`, h)).json();
                payload = { invoice: d.invoice, lines: d.lines || [] };
            } else if (type === 'delivery') {
                const d = await (await fetch(`${variables.API_URL}delivery/${id}`, h)).json();
                payload = { delivery: d.header, lines: d.lines || [] };
            }
            setPrintData({ type, payload });
        } catch (e) {
            console.error('Print fetch failed', e);
            setPrintLoading(false);
        }
    };

    useEffect(() => {
        if (!printData) return;
        const delay = printData.type === 'po' ? 1500 : 400;
        const t = setTimeout(() => {
            const titles = {
                po:       `Purchase Order - ${printData.payload.po?.poNumber || ''}`,
                issue:    `Issue Note - ${printData.payload.issue?.issueNo || ''}`,
                return:   `Issue Return - ${printData.payload.issueReturn?.returnNo || ''}`,
                invoice:  `Invoice - ${printData.payload.invoice?.invoiceNo || ''}`,
                delivery: `Delivery Note - ${printData.payload.delivery?.deliveryNo || ''}`,
            };
            openPrintWindow('.po-print-doc', titles[printData.type] || 'Print');
            setPrintData(null);
            setPrintLoading(false);
        }, delay);
        return () => clearTimeout(t);
    }, [printData]);

    useEffect(() => {
        fetch(`${variables.API_URL}job/types`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setJobTypes(Array.isArray(d) ? d : [])).catch(console.error);
    }, []);

    const loadJobs = useCallback(() => {
        setJobsLoading(true);
        setSelectedJobId('');
        setData(null);
        const q = new URLSearchParams();
        if (jobTypeFilter) q.set('jobTypeId',  jobTypeFilter);
        if (statusFilter)  q.set('statusId',   statusFilter);
        if (custId)        q.set('customerId', custId);
        fetch(`${variables.API_URL}job-overview/jobs?${q}`, { headers: authHeaders() })
            .then(r => r.json()).then(d => setJobList(Array.isArray(d) ? d : []))
            .catch(() => setJobList([]))
            .finally(() => setJobsLoading(false));
    }, [jobTypeFilter, statusFilter, custId]);

    useEffect(() => { loadJobs(); }, [loadJobs]);

    const loadOverview = useCallback(jobId => {
        if (!jobId) { setData(null); return; }
        setLoading(true); setError('');
        fetch(`${variables.API_URL}job-overview/${encodeURIComponent(jobId)}`, { headers: authHeaders() })
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
            .then(d => setData(d))
            .catch(e => setError(e.message || 'Error loading overview.'))
            .finally(() => setLoading(false));
    }, []);

    const loadBudget = useCallback(jobId => {
        if (!jobId) { setBudgetRows([]); setBudgetHeader({ currentRvNo: 0, isApproved: false, approvedBy: null, approvedDate: null, totalRevisions: 0 }); return; }
        setBudgetLoading(true);
        fetch(`${variables.API_URL}jobbudget/${encodeURIComponent(jobId)}`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                setBudgetHeader(d?.header || { currentRvNo: 0, isApproved: false, totalRevisions: 0 });
                setBudgetRows(Array.isArray(d?.lines) ? d.lines : Array.isArray(d) ? d : []);
            })
            .catch(console.error)
            .finally(() => setBudgetLoading(false));
    }, []);

    useEffect(() => { loadBudget(selectedJobId); }, [selectedJobId, loadBudget]);

    const loadAdditionalJobs = useCallback(jobId => {
        if (!jobId) { setAdditionalJobs([]); return; }
        setAddlLoading(true);
        fetch(`${variables.API_URL}job/${encodeURIComponent(jobId)}/additional-jobs`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => setAdditionalJobs(Array.isArray(d) ? d : []))
            .catch(console.error)
            .finally(() => setAddlLoading(false));
    }, []);

    useEffect(() => { loadAdditionalJobs(selectedJobId); }, [selectedJobId, loadAdditionalJobs]);

    // Pull each variation's finance block so we can roll-up Variation Invoiced
    // / Variation Order values in the main job's Financial Summary panel.
    // We also capture each variation's currency + exchange rate so amounts can
    // be normalised to the BASE currency before being summed with the main job
    // — variations may be issued in a different currency from the parent.
    useEffect(() => {
        if (!additionalJobs.length) { setVariationFinances([]); return; }
        let cancelled = false;
        Promise.all(additionalJobs.map(v => {
            const jid = v.jobId ?? v.JobId;
            return fetch(`${variables.API_URL}job-overview/${encodeURIComponent(jid)}`, { headers: authHeaders() })
                .then(r => r.ok ? r.json() : null)
                .then(d => ({
                    jobId:        jid,
                    currencyCode: d?.header?.currencyCode || null,
                    exchangeRate: Number(d?.header?.exchangeRate) || 1,  // → base currency
                    finance:      d?.finance || null,
                    invoiceTotal: (d?.invoices || []).reduce((s, i) => s + (i.subTotal || 0), 0),
                }))
                .catch(() => ({ jobId: jid, currencyCode: null, exchangeRate: 1, finance: null, invoiceTotal: 0 }));
        })).then(rows => { if (!cancelled) setVariationFinances(rows); });
        return () => { cancelled = true; };
    }, [additionalJobs]);

    const handleBudgetSave = async (row, fields) => {
        try {
            const res = await fetch(`${variables.API_URL}jobbudget/save`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({
                    jobId:          selectedJobId,
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
            loadBudget(selectedJobId);
            loadOverview(selectedJobId);
            return true;
        } catch { return 'Network error.'; }
    };

    const callBudgetAction = async (endpoint, password, reason) => {
        setPwdBusy(true);
        try {
            const res = await fetch(`${variables.API_URL}jobbudget/${endpoint}`, {
                method: 'POST', headers: authHeaders(),
                body: JSON.stringify({ jobId: selectedJobId, password, actedBy: currentUser, reason }),
            });
            const d = await res.json().catch(() => ({}));
            setPwdBusy(false);
            if (!res.ok) return d?.message || 'Operation failed.';
            setPwdAction(null);
            setBudgetBanner(d?.message || 'Done.');
            setTimeout(() => setBudgetBanner(''), 3500);
            loadBudget(selectedJobId);
            loadOverview(selectedJobId);
            return true;
        } catch {
            setPwdBusy(false);
            return 'Network error. Please try again.';
        }
    };

    const handleBudgetDelete = (row) => {
        if (!row.jobBudgetId) return;
        setConfirm({
            title: 'Clear Budget',
            message: `Clear budget for "${row.categoryName}"?`,
            confirmLabel: 'Clear',
            confirmStyle: { background: '#92400e', color: '#fff' },
            onConfirm: async () => {
                setConfirm(null);
                try {
                    const res = await fetch(`${variables.API_URL}jobbudget/${row.jobBudgetId}`, {
                        method: 'DELETE', headers: authHeaders(),
                    });
                    const d = await res.json().catch(() => ({}));
                    if (!res.ok) { setAlertMsg(d?.message || 'Delete failed.'); return; }
                    loadBudget(selectedJobId);
                    loadOverview(selectedJobId);
                } catch { setAlertMsg('Network error.'); }
            },
        });
    };

    const handleJobSelect = e => { const v = e.target.value; setSelectedJobId(v); loadOverview(v); };

    const sel = { padding: '5px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, color: '#334155', background: '#fff', outline: 'none', cursor: 'pointer', height: 32 };

    const h   = data?.header;
    const fi  = data?.finance;
    const mhs = data?.manhourSummary;
    const cur = h?.currencyCode || h?.baseCurrencyCode || '';
    // Dual-currency formatter: when the job currency differs from base, show the
    // job-currency amount with the base equivalent in parentheses, e.g.
    // "EUR 753,364.90 ( AED 3,239,469.07 )". Input is a JOB-currency amount.
    const jobRate     = Number(h?.exchangeRate) || 1;
    const isForeignJob = !!baseCurrencyCode && !!cur && baseCurrencyCode !== cur;
    const fmtDual = (jobVal) => isForeignJob
        ? `${cur} ${fmt(jobVal)} ( ${baseCurrencyCode} ${fmt((Number(jobVal) || 0) * jobRate)} )`
        : `${cur} ${fmt(jobVal)}`;
    // Same, but the input amount is already in BASE currency (job value = base ÷ rate)
    const fmtDualFromBase = (baseVal) => isForeignJob
        ? `${cur} ${fmt((Number(baseVal) || 0) / jobRate)} ( ${baseCurrencyCode} ${fmt(baseVal)} )`
        : `${baseCurrencyCode} ${fmt(baseVal)}`;
    // Budget derived values
    const budTotalBudget    = budgetRows.reduce((s, r) => s + (r.amountInBaseCurrency || r.budgetedAmount || 0), 0);
    const budTotalActual    = budgetRows.reduce((s, r) => s + (r.actualAmount   || 0), 0);
    const budTotalVar       = budTotalBudget - budTotalActual;
    const budUsedPct        = budTotalBudget > 0 ? Math.min((budTotalActual / budTotalBudget) * 100, 999) : 0;
    const setBudgetCount    = budgetRows.filter(r => r.budgetedAmount > 0).length;
    const currentRvNo       = budgetHeader.currentRvNo;
    const budgetApproved    = budgetHeader.isApproved;
    // All closed statuses (Freezed=3, Completed=4, Cancelled=5) block every
    // write / approve / revise action on the overview. Only Revise & Reopen
    // (from JobDetailPage) can resurrect them.
    const isClosedFinal     = [3, 4, 5].includes(h?.jobStatusId);
    const canApprove        = canDo('/jobs', 'APPROVE') && !isClosedFinal;
    const canRevise         = canDo('/jobs', 'REVISE')  && !isClosedFinal;
    // Budget editability: job not closed, user has EDIT perm on /jobs, and budget not approved
    const budgetCanEdit     = !h?.isClosed && canDo('/jobs', 'EDIT') && !budgetApproved;

    return (
        <div className="po-page" style={printLoading ? { cursor: 'wait' } : {}}>
            {alertMsg && <AlertModal message={alertMsg} onClose={() => setAlertMsg(null)} />}
            {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} />}
            {/* ── Filter bar ──────────────────────────────────────────────── */}
            {/* overflow:visible + raised stacking so the customer live-search dropdown
                is not clipped by .po-grid-wrap's `overflow:hidden` and sits above the
                job-overview content below. */}
            <div className="po-grid-wrap" style={{ overflow: 'visible', position: 'relative', zIndex: 30 }}>
                <div className="po-grid-header">
                    <div className="po-title-row">
                        <div>
                            <div className="po-page-title">Job Overview</div>
                            <div className="po-page-sub">Filter by type / status / customer, then select a job</div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 10, flexWrap: 'wrap' }}>
                        <select style={sel} value={jobTypeFilter} onChange={e => setJobTypeFilter(e.target.value)}>
                            <option value="">All Job Types</option>
                            {jobTypes.map(jt => <option key={jt.jobTypeId} value={jt.jobTypeId}>{jt.jobTypeName}</option>)}
                        </select>
                        <select style={sel} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                            <option value="">All Statuses</option>
                            {jobStatuses.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                        <CustSearch value={custId} label={custLabel}
                            onChange={(id, name) => { setCustId(id); setCustLabel(name); }} />
                        <div style={{ width: 1, height: 24, background: '#e2e8f0', margin: '0 2px' }} />
                        <select
                            style={{ ...sel, minWidth: 300,
                                     fontWeight: selectedJobId ? 600 : 400,
                                     borderColor: selectedJobId ? '#3b82f6' : '#d1d5db',
                                     color: selectedJobId ? '#1d4ed8' : '#334155' }}
                            value={selectedJobId} onChange={handleJobSelect} disabled={jobsLoading}>
                            <option value="">{jobsLoading ? 'Loading…' : `— Select Job (${jobList.length}) —`}</option>
                            {jobList.map(j => {
                                // job-overview/jobs returns Dapper dynamic rows → PascalCase keys.
                                // Read PascalCase first, fall back to camelCase, so the JobId always shows.
                                const jid  = j.JobId        ?? j.jobId;
                                const name = j.ProjectName  ?? j.projectName;
                                const cust = j.CustomerName ?? j.customerName;
                                return (
                                    <option key={jid} value={jid}>
                                        {jid}{name ? ` — ${name}` : ''}{cust ? ` (${cust})` : ''}
                                    </option>
                                );
                            })}
                        </select>
                        {selectedJobId && (
                            <button onClick={() => { setSelectedJobId(''); setData(null); }}
                                style={{ padding: '4px 10px', border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc', color: '#64748b', fontSize: 12, cursor: 'pointer' }}>
                                ✕ Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {loading && (
                <div style={{ textAlign: 'center', padding: 40, color: '#64748b', fontSize: 13 }}>
                    Loading job overview…
                </div>
            )}
            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '12px 18px', color: '#dc2626', margin: '12px 0' }}>{error}</div>
            )}

            {data && h && (
                <div style={{ marginTop: 14 }}>

                    {/* ── Job badge strip ──────────────────────────────────── */}
                    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 18px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'Courier New', fontSize: 17, fontWeight: 700, color: '#1e40af', background: '#eff6ff', padding: '3px 12px', borderRadius: 6 }}>{h.jobId}</span>
                        <div style={{ flex: 1, minWidth: 160 }}>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1e293b' }}>{h.jobDescription || '—'}</div>
                            {h.projectName && <div style={{ fontSize: 12, color: '#64748b' }}>{h.projectName}</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                            <StatusBadge text={h.jobStatusName} closed={h.isClosed} />
                            {h.jobTypeName  && <span style={{ background: '#f0fdf4', color: '#166534', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{h.jobTypeName}</span>}
                            {h.jobStageName && <span style={{ background: '#faf5ff', color: '#7e22ce', padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>{h.jobStageName}</span>}
                            {h.customerName && <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>{h.customerName}</span>}
                        </div>
                    </div>

                    {/* ── S1: Job Information + Engineers inline ───────────── */}
                    {canDo('/job-overview', 'SECTION_JOB_INFO') && (
                    <Section title="Job Information" icon="📋" defaultOpen>
                        <InfoGrid items={[
                            { label: 'Job ID',           value: h.jobId },
                            { label: 'Job Type',         value: h.jobTypeName },
                            { label: 'Status',           value: h.jobStatusName },
                            { label: 'Stage',            value: h.jobStageName },
                            { label: 'Customer',         value: h.customerName },
                            { label: 'Customer Phone',   value: h.customerPhone },
                            { label: 'Project Name',     value: h.projectName },
                            { label: 'Job Date',         value: fmtDate(h.jobDate) },
                            { label: 'LPO Ref',          value: h.lpoRef },
                            { label: 'LPO Date',         value: fmtDate(h.lpoDate) },
                            { label: 'Contract Ref',     value: h.contractRef },
                            { label: 'External Ref',     value: h.externalRef },
                            { label: 'Currency',         value: h.currencyCode ? `${h.currencyCode} (${h.currencySymbol || ''})` : null },
                            { label: 'Exchange Rate',    value: h.exchangeRate && h.exchangeRate !== 1 ? fmt(h.exchangeRate, 4) : null },
                            { label: 'Parent Job',       value: h.parentJobId },
                            { label: 'Bay',              value: h.bayName },
                            { label: 'Quality Level',    value: h.qualityLevelName },
                            { label: 'Category',         value: h.jobCategoryName },
                            { label: 'Total Units',      value: h.totalUnits },
                            { label: 'Created By',       value: h.jobCreatedBy },
                            { label: 'Created Date',     value: fmtDate(h.jobCreatedDate) },
                            { label: 'Last Modified By', value: h.jobLastModifiedBy },
                            { label: 'Last Modified',    value: fmtDate(h.jobLastUpdatedDate) },
                        ]} />

                        {/* Engineers inline — always visible (empty state when none assigned) */}
                        <SubHead label={`Engineers / Team${data.engineers?.length ? ` (${data.engineers.length})` : ''}`} />
                        {data.engineers?.length > 0 ? (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {data.engineers.map(e => (
                                    <div key={e.jobEngineerId} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f1f5f9', borderRadius: 6, padding: '6px 12px' }}>
                                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>
                                            {(e.engineerName || '?').charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 12, fontWeight: 600, color: '#1e293b' }}>{e.engineerName || `#${e.engineerId}`}</div>
                                            <div style={{ fontSize: 10, color: '#64748b' }}>
                                                {[e.role, e.teamName].filter(Boolean).join(' · ') || 'Engineer'}
                                            </div>
                                        </div>
                                        {e.completed && <span style={{ fontSize: 10, color: '#16a34a', fontWeight: 700 }}>✓</span>}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                                No engineers assigned to this job.
                            </div>
                        )}

                        {/* Dates sub-section */}
                        {(h.jobPlannedStartDate || h.jobExpectedCompleteDate || h.jobActualCompleteDate || h.jobExpectedDeliveryDate || h.jobActualDeliveryDate) && (
                            <>
                                <SubHead label="Schedule" />
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: '8px 24px', fontSize: 12 }}>
                                    {h.jobPlannedStartDate      && <div><span style={{ color: '#94a3b8' }}>Planned Start: </span><strong>{fmtDate(h.jobPlannedStartDate)}</strong></div>}
                                    {h.jobExpectedCompleteDate  && <div><span style={{ color: '#94a3b8' }}>Exp. Complete: </span><strong>{fmtDate(h.jobExpectedCompleteDate)}</strong></div>}
                                    {h.jobActualCompleteDate    && <div><span style={{ color: '#94a3b8' }}>Act. Complete: </span><strong>{fmtDate(h.jobActualCompleteDate)}</strong></div>}
                                    {h.jobExpectedDeliveryDate  && <div><span style={{ color: '#94a3b8' }}>Exp. Delivery: </span><strong>{fmtDate(h.jobExpectedDeliveryDate)}</strong></div>}
                                    {h.jobActualDeliveryDate    && <div><span style={{ color: '#94a3b8' }}>Act. Delivery: </span><strong>{fmtDate(h.jobActualDeliveryDate)}</strong></div>}
                                </div>
                            </>
                        )}

                        {/* Terms sub-section */}
                        {(h.jobPaymentTerms || h.warrantyTerms || h.jobDeliveryTerms) && (
                            <>
                                <SubHead label="Terms" />
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px,1fr))', gap: '6px 24px', fontSize: 12 }}>
                                    {h.jobPaymentTerms  && <div><span style={{ color: '#94a3b8' }}>Payment: </span>{h.jobPaymentTerms}</div>}
                                    {h.jobDeliveryTerms && <div><span style={{ color: '#94a3b8' }}>Delivery: </span>{h.jobDeliveryTerms}</div>}
                                    {h.warrantyTerms    && <div><span style={{ color: '#94a3b8' }}>Warranty: </span>{h.warrantyTerms}</div>}
                                </div>
                            </>
                        )}
                    </Section>
                    )}

                    {/* ── S2: Financial Summary ──────────────────────────── */}
                    {canDo('/job-overview', 'SECTION_FINANCE') && (
                    <Section title="Financial Summary" icon="💰" defaultOpen>
                        {!fi ? <div style={{ color: '#94a3b8', fontSize: 13 }}>No financial data.</div> : (() => {
                            // ── Cancelled jobs are excluded from EVERY calculation ─────────
                            // A cancelled variation should not contribute to Variation Order /
                            // Invoiced / Receipts totals. We drop them up-front so both the
                            // table rendering AND every roll-up below see the same list.
                            const CANCELLED_STATUS_ID = 5;
                            const activeVariations = additionalJobs.filter(
                                v => (v.jobStatusId ?? v.JobStatusId) !== CANCELLED_STATUS_ID
                            );
                            const cancelledCount = additionalJobs.length - activeVariations.length;

                            // ── Currency normalisation ─────────────────────────────────────
                            // Variations may be in a DIFFERENT currency from the parent. We
                            // therefore aggregate everything in the BASE currency (each row
                            // multiplied by its own exchange rate), then convert the total
                            // back into the main job's display currency if needed.
                            const mainRate = Number(h?.exchangeRate) || 1;
                            // Figures are presented in the JOB currency, with the base-currency
                            // equivalent shown in parentheses on each row.
                            const dispCode  = cur;
                            const showBaseParen = !!baseCurrencyCode && baseCurrencyCode !== cur;
                            // main-job amounts are already in job currency; foreign amounts
                            // (own currency × own rate → base) are divided back into job currency.
                            const mToB = v => (Number(v) || 0);
                            const xToD = (val, rate) => (Number(val) || 0) * (Number(rate) || 1) / mainRate;

                            // ── MAIN job, in base currency ──────────────────────────
                            const mainOrderBase    = mToB(fi.orderValue);
                            const mainInvBase      = mToB(fi.totalInvoicing);
                            const mainPaymentsBase = mToB(fi.totalPayments);
                            // Each invoice may be in its own currency; convert PER ROW (subTotal × ExchangeRate)
                            // so mixed-currency invoices roll up correctly in base. Falls back to the row's
                            // exchangeRate if subTotalInBase isn't provided by the server.
                            const mainInvNoVatBase = (data.invoices || []).reduce(
                                (s, i) => s + xToD(i.subTotal, i.exchangeRate), 0
                            );
                            const budgetCostBase   = mToB(fi.totalBudget);
                            const actualCostBase   = mToB(fi.totalActual);

                            // ── VARIATIONS, each row × its own rate → base currency ─
                            // Per-variation order value uses its OWN rate, NOT the parent's.
                            // Cancelled variations excluded via activeVariations.
                            const activeIds = new Set(activeVariations.map(v => v.jobId ?? v.JobId));
                            const variationOrderBase = activeVariations.reduce((s, v) => {
                                const jid    = v.jobId ?? v.JobId;
                                const orderV = Number(v.orderValue ?? v.OrderValue ?? 0);
                                const match  = variationFinances.find(x => x.jobId === jid);
                                const rate   = match?.exchangeRate ?? 1;
                                return s + xToD(orderV, rate);
                            }, 0);
                            const activeFinances = variationFinances.filter(x => activeIds.has(x.jobId));
                            const variationInvBase      = activeFinances.reduce((s, x) => s + xToD(x?.finance?.totalInvoicing, x?.exchangeRate), 0);
                            const variationPaymentsBase = activeFinances.reduce((s, x) => s + xToD(x?.finance?.totalPayments,  x?.exchangeRate), 0);
                            const variationInvNoVatBase = activeFinances.reduce((s, x) => s + xToD(x?.invoiceTotal,           x?.exchangeRate), 0);

                            // ── Final roll-ups (all values are now in BASE currency) ─
                            const mainOrderValue      = mainOrderBase;
                            const variationOrderValue = variationOrderBase;
                            const mainInvoicedValue   = mainInvBase;
                            const variationInvoicedValue = variationInvBase;
                            const finalOrderValue     = mainOrderBase    + variationOrderBase;
                            const finalInvoicedValue  = mainInvBase      + variationInvBase;
                            const receipts            = mainPaymentsBase + variationPaymentsBase;
                            const invoicedNoVat       = mainInvNoVatBase + variationInvNoVatBase;
                            const budgetCost          = budgetCostBase;
                            const actualCost          = actualCostBase;
                            const cashIn              = receipts;
                            // Cash Out = supplier payments allocated against this main job + its variations.
                            // Server returns `cashOut` per job in base currency; sum main + variations
                            // (each variation already provides its own cashOut in base via its finance pull).
                            const mainCashOutBase      = mToB(fi.cashOut);
                            const variationCashOutBase = activeFinances.reduce(
                                (s, x) => s + xToD(x?.finance?.cashOut, x?.exchangeRate), 0
                            );
                            const cashOut             = mainCashOutBase + variationCashOutBase;

                            // Margin % = (Final Order Value − Cost) / Final Order Value × 100
                            const budgetMarginPct = finalOrderValue > 0 ? ((finalOrderValue - budgetCost) / finalOrderValue) * 100 : 0;
                            const actualMarginPct = finalOrderValue > 0 ? ((finalOrderValue - actualCost) / finalOrderValue) * 100 : 0;

                            // Has at least one ACTIVE variation in a different currency from the main job?
                            const mixedCurrencies = activeFinances.some(x => x?.currencyCode && x.currencyCode !== cur);

                            // 2-column row helper (label left, value right) — always in base currency
                            const Row = ({ label, value, extraPct, bold }) => (
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '4px 0' }}>
                                    <div style={{ fontSize: 12.5, color: '#1e293b', minWidth: 170, fontWeight: bold ? 700 : 500 }}>
                                        {label}
                                    </div>
                                    <div style={{ fontSize: 12.5, color: '#1e293b', fontWeight: 700, fontFamily: 'Courier New' }}>
                                        {cur} {fmt(value)}
                                        {showBaseParen && (
                                            <span style={{ marginLeft: 6, color: '#64748b', fontWeight: 500 }}>
                                                ( {baseCurrencyCode} {fmt((Number(value) || 0) * mainRate)} )
                                            </span>
                                        )}
                                        {extraPct != null && (
                                            <span style={{ marginLeft: 8, color: '#475569', fontWeight: 600 }}>
                                                [ {extraPct.toFixed(2)} % ]
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );

                            // ── Collection donut + billing funnel ─────────────────
                            // Credit-note total (job currency) from non-draft invoices, same
                            // basis as the Receipts & Invoices section.
                            const creditTotal = (data.invoices || [])
                                .filter(r => r.status !== 'Draft')
                                .reduce((s, r) => s + xToD(r.cnAmount, r.exchangeRate), 0);
                            const collOutstanding = Math.max(0, finalInvoicedValue - receipts - creditTotal);

                            // Donut: splits Final Invoiced into Received / Credit / Outstanding.
                            const Donut = () => {
                                const inv = finalInvoicedValue;
                                const r = 54, cx = 70, cy = 70, C = 2 * Math.PI * r;
                                const segs = inv > 0
                                    ? [ { v: receipts, c: '#16a34a' }, { v: creditTotal, c: '#7c3aed' }, { v: collOutstanding, c: '#dc2626' } ]
                                    : [];
                                let acc = 0;
                                const pctColl = inv > 0 ? Math.round((receipts + creditTotal) / inv * 100) : 0;
                                return (
                                    <svg viewBox="0 0 140 140" style={{ width: 132, height: 132, flexShrink: 0 }}>
                                        <circle r={r} cx={cx} cy={cy} fill="none" stroke="#eef2f7" strokeWidth="22" />
                                        {segs.map((s, i) => {
                                            const frac = Math.max(0, Math.min(1, (s.v || 0) / inv));
                                            const el = (
                                                <circle key={i} r={r} cx={cx} cy={cy} fill="none" stroke={s.c} strokeWidth="22"
                                                    strokeDasharray={`${(frac * C).toFixed(2)} ${(C - frac * C).toFixed(2)}`}
                                                    strokeDashoffset={(-acc * C).toFixed(2)}
                                                    transform={`rotate(-90 ${cx} ${cy})`} />
                                            );
                                            acc += frac;
                                            return el;
                                        })}
                                        <text x={cx} y={cy - 1} textAnchor="middle" fontSize="24" fontWeight="800" fill="#1e293b">{pctColl}%</text>
                                        <text x={cx} y={cy + 16} textAnchor="middle" fontSize="9.5" fill="#94a3b8"
                                              style={{ textTransform: 'uppercase', letterSpacing: '.4px' }}>collected</text>
                                    </svg>
                                );
                            };

                            // Funnel: Order → Invoiced → Invoicing Pending → Received, scaled to Order.
                            const invoicingPending = Math.max(0, finalOrderValue - finalInvoicedValue);
                            const Funnel = () => {
                                const top = finalOrderValue || 1;
                                const pctInv  = finalOrderValue    > 0 ? finalInvoicedValue / finalOrderValue    * 100 : 0;
                                const pctPend = finalOrderValue    > 0 ? invoicingPending   / finalOrderValue    * 100 : 0;
                                const pctRecv = finalInvoicedValue > 0 ? receipts           / finalInvoicedValue * 100 : 0;
                                const stages = [
                                    { label: 'Order',             value: finalOrderValue,    c: '#2563eb', note: null },
                                    { label: 'Invoiced',          value: finalInvoicedValue, c: '#0ea5e9', note: `${pctInv.toFixed(0)}% of order` },
                                    { label: 'Invoicing Pending', value: invoicingPending,   c: '#f59e0b', note: `${pctPend.toFixed(0)}% of order` },
                                    { label: 'Received',          value: receipts,           c: '#16a34a', note: `${pctRecv.toFixed(0)}% of invoiced` },
                                ];
                                return (
                                    <div style={{ flex: 1, minWidth: 230, display: 'flex', flexDirection: 'column', gap: 9 }}>
                                        {stages.map((st) => {
                                            const pct = Math.max(0, Math.min(100, (st.value || 0) / top * 100));
                                            return (
                                                <div key={st.label}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                                                        <span style={{ fontSize: 11.5, color: '#475569', fontWeight: 500 }}>
                                                            {st.label}
                                                            {st.note && (
                                                                <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {st.note}</span>
                                                            )}
                                                        </span>
                                                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1e293b', fontFamily: 'Courier New' }}>
                                                            {cur} {fmt(st.value)}
                                                        </span>
                                                    </div>
                                                    <div style={{ height: 16, background: '#f1f5f9', borderRadius: 5, overflow: 'hidden' }}>
                                                        <div style={{ width: `${pct}%`, minWidth: st.value > 0 ? 6 : 0,
                                                            height: '100%', background: st.c, borderRadius: 5 }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            };

                            return (
                                <>
                                    {/* Currency indicator — values shown in BASE currency */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: '#3730a3',
                                            background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 6, padding: '3px 10px' }}>
                                            💱 Job Currency {cur}{showBaseParen ? ` @ ${mainRate}` : ''}
                                        </span>
                                        {showBaseParen && (
                                            <span style={{ fontSize: 11, color: '#64748b' }}>
                                                Base equivalent ({baseCurrencyCode}) shown in parentheses
                                            </span>
                                        )}
                                        {mixedCurrencies && (
                                            <span style={{ fontSize: 11, color: '#64748b' }}>
                                                Variations in mixed currencies — each row converted at its own rate
                                            </span>
                                        )}
                                    </div>

                                    {/* ── Variations mini-table ──────────────────────────── */}
                                    {activeVariations.length > 0 && (
                                        <div style={{ marginBottom: 18 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                                <div style={{ fontWeight: 600, color: '#334155', fontSize: 12 }}>Variations</div>
                                                {cancelledCount > 0 && (
                                                    <span style={{ fontSize: 11, color: '#64748b' }}>
                                                        ({cancelledCount} cancelled excluded)
                                                    </span>
                                                )}
                                            </div>
                                            {(() => {
                                                // Same palette as OvTable so the variation grid sits visually with the
                                                // rest of the Overview — no extra colours, no inverted footer band.
                                                const th = { padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };
                                                const td = { padding: '7px 10px', color: '#334155', borderBottom: '1px solid #f1f5f9' };
                                                const tdRight = { ...td, textAlign: 'right' };
                                                return (
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'auto' }}>
                                                    <thead>
                                                        <tr style={{ background: '#f8fafc' }}>
                                                            <th style={{ ...th, width: 110 }}>Job Ref</th>
                                                            <th style={{ ...th, width: 100 }}>Date</th>
                                                            <th style={{ ...th, width: 130 }}>LPO No</th>
                                                            <th style={{ ...th, width: 100 }}>LPO Date</th>
                                                            <th style={{ ...th, width: 130, textAlign: 'right' }}>Job Amount</th>
                                                            <th style={{ ...th, width: 60, textAlign: 'center' }}>Ccy</th>
                                                            <th style={{ ...th, width: 90, textAlign: 'right' }}>Rate</th>
                                                            <th style={{ ...th, width: 130, textAlign: 'right' }}>{`≈ ${dispCode}`}</th>
                                                            <th style={th}>Description</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {activeVariations.map((v) => {
                                                            const jid    = v.jobId ?? v.JobId;
                                                            const orderV = Number(v.orderValue ?? v.OrderValue ?? 0);
                                                            const match  = variationFinances.find(x => x.jobId === jid);
                                                            const ccy    = match?.currencyCode || cur;
                                                            const rate   = match?.exchangeRate ?? 1;
                                                            const inBase = xToD(orderV, rate);
                                                            const lpoNo  = v.lpoRef  ?? v.LpoRef;
                                                            const lpoDt  = v.lpoDate ?? v.LpoDate;
                                                            return (
                                                                <tr key={jid}
                                                                    onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                                                    onMouseLeave={e => e.currentTarget.style.background = ''}>
                                                                    <td style={td}>
                                                                        <span onClick={() => navigate(`/jobs/${encodeURIComponent(jid)}`)}
                                                                            style={{ cursor: 'pointer' }}>
                                                                            {jid}
                                                                        </span>
                                                                    </td>
                                                                    <td style={td}>{fmtDate(v.jobDate ?? v.JobDate)}</td>
                                                                    <td style={td}>{lpoNo || '—'}</td>
                                                                    <td style={td}>{lpoDt ? fmtDate(lpoDt) : '—'}</td>
                                                                    <td style={tdRight}>{fmt(orderV)}</td>
                                                                    <td style={{ ...td, textAlign: 'center' }}>{ccy}</td>
                                                                    <td style={tdRight}>{rate === 1 ? '1.0000' : rate.toFixed(4)}</td>
                                                                    <td style={{ ...tdRight, fontWeight: 600 }}>{fmt(inBase)}</td>
                                                                    <td style={td}>{v.jobDescription || v.JobDescription || '—'}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                        <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                                                            <td style={{ ...td, fontWeight: 700, textAlign: 'right' }} colSpan={7}>
                                                                Variations total ({dispCode})
                                                            </td>
                                                            <td style={{ ...tdRight, fontWeight: 700 }}>{fmt(variationOrderBase)}</td>
                                                            <td style={td} />
                                                        </tr>
                                                    </tbody>
                                                </table>
                                                );
                                            })()}
                                        </div>
                                    )}

                                    {/* ── 2-column financial summary ─────────────────────── */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 40, rowGap: 2 }}>
                                        {/* LEFT column */}
                                        <Row label="Main Order Value"        value={mainOrderValue} />
                                        {/* RIGHT column */}
                                        <Row label="Main Invoiced Value"     value={mainInvoicedValue} />

                                        <Row label="Variation Order Value"   value={variationOrderValue} />
                                        <Row label="Variation Invoiced Value" value={variationInvoicedValue} />

                                        <Row label="Final Order Value"       value={finalOrderValue}    bold />
                                        <Row label="Final Invoiced Value"    value={finalInvoicedValue} bold />

                                        <Row label="Receipts"                value={receipts} />
                                        <Row label="Invoiced(without VAT)"   value={invoicedNoVat} />

                                        <Row label="Budget Cost"             value={budgetCost} extraPct={budgetMarginPct} />
                                        <Row label="Actual Cost"             value={actualCost} extraPct={actualMarginPct} />

                                        <Row label="Cash In"                 value={cashIn} />
                                        <Row label="Cash Out"                value={cashOut} />
                                    </div>

                                    {/* ── Financial overview: collection donut + billing funnel ── */}
                                    {(finalOrderValue > 0 || finalInvoicedValue > 0) && (
                                        <div style={{ marginTop: 16, padding: '14px 16px', border: '1px solid #e2e8f0',
                                            borderRadius: 8, background: '#fcfdff' }}>
                                            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b',
                                                textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 14 }}>
                                                Financial Overview ({cur})
                                            </div>
                                            <div style={{ display: 'flex', gap: 28, alignItems: 'center', flexWrap: 'wrap' }}>
                                                {/* Collection donut + legend */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                                    <Donut />
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                                        {[
                                                            { label: 'Received',    value: receipts,        c: '#16a34a' },
                                                            { label: 'Credit',      value: creditTotal,     c: '#7c3aed' },
                                                            { label: 'Outstanding', value: collOutstanding, c: '#dc2626' },
                                                        ].map(g => (
                                                            <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                                <span style={{ width: 11, height: 11, borderRadius: 3, background: g.c, flexShrink: 0 }} />
                                                                <span style={{ fontSize: 11.5, color: '#64748b', minWidth: 78 }}>{g.label}</span>
                                                                <span style={{ fontSize: 11.5, fontWeight: 700, color: '#1e293b', fontFamily: 'Courier New' }}>
                                                                    {cur} {fmt(g.value)}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                <div style={{ width: 1, alignSelf: 'stretch', background: '#e2e8f0' }} />

                                                {/* Order → Invoiced → Received funnel */}
                                                <Funnel />
                                            </div>
                                        </div>
                                    )}

                                    {/* Actual cost breakdown strip (kept — useful detail) */}
                                    {actualCost > 0 && (
                                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, padding: '9px 14px', marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: '6px 24px', alignItems: 'center' }}>
                                            <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 4 }}>Actual Cost Breakdown</span>
                                            {[
                                                // Services are already part of Purchase Orders (PoTotal sums every
                                                // non-Draft PO line regardless of item type), so they're rolled in
                                                // under "Purchase Orders" and not shown as a separate chip.
                                                { label: 'Purchase Orders', value: fi.poTotal,      icon: '🛒' },
                                                { label: 'Stock Issues',    value: fi.issueTotal,   icon: '📦' },
                                                // Issue Returns deduct from actual cost — render as a negative figure
                                                { label: 'Issue Returns',   value: -(fi.returnTotal || 0), icon: '↩️', isReturn: true },
                                                { label: 'Manhours',        value: fi.manhourTotal, icon: '⏱' },
                                                { label: 'Other Expenses',  value: fi.expenseTotal, icon: '💳' },
                                            ].filter(b => Math.abs(b.value || 0) > 0).map(b => (
                                                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                                    <span style={{ fontSize: 12 }}>{b.icon}</span>
                                                    <span style={{ fontSize: 11, color: '#78350f' }}>{b.label}:</span>
                                                    <span style={{ fontSize: 11, fontWeight: 700, color: b.isReturn ? '#166534' : '#92400e' }}>
                                                        {b.isReturn ? '−' : ''}{fmtDual(Math.abs(b.value))}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {fi.isLDApplicable && (
                                        <div style={{ background: '#fef2f2', borderRadius: 6, padding: '7px 12px', fontSize: 12, color: '#dc2626', marginTop: 10 }}>
                                            LD Applicable — {fi.ldPercent}% / {fmt(fi.ldAmount)}
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </Section>
                    )}

                    {/* ── S3: Budget vs Actual ──────────────────────────── */}
                    {canDo('/job-overview', 'SECTION_BUDGET') && (
                    <Section title="Budget vs Actual" icon="📊" count={setBudgetCount} defaultOpen={false}>

                        {/* Action banner */}
                        {budgetBanner && (
                            <div style={{ marginBottom: 12, padding: '8px 14px', background: '#dcfce7', color: '#166534', borderRadius: 6, fontSize: 12.5 }}>
                                ✓ {budgetBanner}
                            </div>
                        )}

                        {/* Approve / Revise header bar */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            marginBottom: 12, padding: '10px 14px',
                            background: budgetApproved ? '#f0fdf4' : '#fffbeb',
                            border: `1px solid ${budgetApproved ? '#86efac' : '#fde68a'}`,
                            borderRadius: 8,
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <span style={{
                                    fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 5,
                                    background: budgetApproved ? '#16a34a' : '#f59e0b', color: '#fff',
                                }}>
                                    {budgetApproved ? '🔒 APPROVED' : '✏ DRAFT'}
                                </span>
                                {(budgetHeader.totalRevisions > 1 || budgetApproved) && (
                                    <span style={{ fontSize: 11.5, color: '#475569' }}>
                                        Revision <strong>Rev {currentRvNo}</strong>
                                        {budgetHeader.totalRevisions > 1 && ` of ${budgetHeader.totalRevisions}`}
                                    </span>
                                )}
                                {budgetApproved && budgetHeader.approvedBy && (
                                    <span style={{ fontSize: 11, color: '#64748b' }}>
                                        Approved by <strong>{budgetHeader.approvedBy}</strong>
                                        {budgetHeader.approvedDate && ` on ${new Date(budgetHeader.approvedDate).toLocaleDateString('en-GB')}`}
                                    </span>
                                )}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                                {!budgetApproved && setBudgetCount > 0 && canApprove && (
                                    <button onClick={() => setPwdAction('approve')}
                                        style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: '#16a34a', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>
                                        ✓ Approve Budget
                                    </button>
                                )}
                                {budgetApproved && canRevise && (
                                    <button onClick={() => setPwdAction('revise')}
                                        style={{ padding: '6px 14px', fontSize: 12, fontWeight: 600, background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>
                                        ↻ Revise Budget
                                    </button>
                                )}
                            </div>
                        </div>

                        {budgetApproved && !canRevise && (
                            <div style={{ marginBottom: 12, padding: '10px 14px', background: '#f0f9ff', border: '1px solid #bfdbfe', borderRadius: 7, fontSize: 12.5, color: '#1e40af' }}>
                                🔒 Budget is approved and locked. Only users with <strong>Revise</strong> permission on Jobs can create a new revision.
                            </div>
                        )}

                        {/* Charts row */}
                        {setBudgetCount > 0 && (
                            <div style={{ display: 'flex', gap: 20, marginBottom: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                                <ChartWrap title="Overall Utilisation" onExpand={() => setModal({
                                    title: 'Budget Utilisation',
                                    content: <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <DonutChart scale={2.4} budget={fi?.totalBudget || 0} actual={fi?.totalActual || 0} currency={baseCurrencyCode || cur} />
                                    </div>
                                })}>
                                    <DonutChart budget={fi?.totalBudget || 0} actual={fi?.totalActual || 0} currency={baseCurrencyCode || cur} />
                                </ChartWrap>
                                <ChartWrap title="By Category" onExpand={() => setModal({
                                    title: 'Budget vs Actual by Category',
                                    content: <BudgetBarChart large rows={budgetRows.filter(r => r.budgetedAmount > 0)} currency={baseCurrencyCode || cur} />
                                })}>
                                    <div style={{ flex: 1, minWidth: 240 }}>
                                        <BudgetBarChart rows={budgetRows.filter(r => r.budgetedAmount > 0)} currency={baseCurrencyCode || cur} />
                                    </div>
                                </ChartWrap>
                            </div>
                        )}

                        {/* KPI strip — budget totals are held in BASE currency; show the
                            job currency primary with the base equivalent beneath. */}
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
                            {[
                                { label: 'Total Budget', base: budTotalBudget, color: '#1e40af', bg: '#eff6ff' },
                                { label: 'Total Actual', base: budTotalActual, color: budTotalActual > budTotalBudget ? '#dc2626' : '#0f766e', bg: budTotalActual > budTotalBudget ? '#fef2f2' : '#f0fdfa' },
                                { label: 'Variance',     base: budTotalVar, signed: true, color: budTotalVar >= 0 ? '#16a34a' : '#dc2626', bg: budTotalVar >= 0 ? '#f0fdf4' : '#fef2f2' },
                                { label: 'Budget Used',  pct: budTotalBudget > 0 ? `${budUsedPct.toFixed(1)}%` : '—', color: '#7c3aed', bg: '#faf5ff' },
                            ].map(k => {
                                const sign = k.signed && k.base < 0 ? '− ' : '';
                                const absBase = Math.abs(Number(k.base) || 0);
                                return (
                                <div key={k.label} style={{ flex: '1 1 150px', background: k.bg, border: `1px solid ${k.color}22`, borderRadius: 8, padding: '10px 16px' }}>
                                    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3 }}>{k.label}</div>
                                    {k.pct != null ? (
                                        <div style={{ fontSize: 18, fontWeight: 700, color: k.color, fontFamily: 'Courier New' }}>{k.pct}</div>
                                    ) : (
                                        <>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: k.color, fontFamily: 'Courier New' }}>
                                                {sign}{cur} {fmt(absBase / jobRate)}
                                            </div>
                                            {isForeignJob && (
                                                <div style={{ fontSize: 10.5, color: '#64748b', fontFamily: 'Courier New', marginTop: 1 }}>
                                                    {sign}{baseCurrencyCode} {fmt(absBase)}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                );
                            })}
                        </div>

                        {/* No-budget hint */}
                        {budgetCanEdit && setBudgetCount === 0 && !budgetLoading && budgetRows.length > 0 && (
                            <div style={{ marginBottom: 16, padding: '10px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 7, fontSize: 12.5, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 16 }}>💡</span>
                                No budget set yet. Click <strong>＋ Set budget</strong> on any row below to enter budget amounts.
                            </div>
                        )}

                        {/* Budget table */}
                        {budgetLoading
                            ? <div style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>Loading…</div>
                            : budgetRows.length > 0 && (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                    <thead>
                                        <tr style={{ background: '#f1f5f9' }}>
                                            <th style={BudTH}>Cost Category</th>
                                            <th style={{ ...BudTH, textAlign: 'right', minWidth: 180 }}>Budget</th>
                                            <th style={{ ...BudTH, textAlign: 'right' }}>Actual</th>
                                            <th style={{ ...BudTH, textAlign: 'right' }}>Variance</th>
                                            <th style={{ ...BudTH, width: 160 }}>Spend</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {budgetRows.map(row => {
                                            const src      = SOURCE_INFO[row.categoryCode] || {};
                                            const spendPct = row.budgetedAmount > 0
                                                ? Math.min((row.actualAmount / row.budgetedAmount) * 100, 100).toFixed(0)
                                                : null;
                                            return (
                                                <tr key={row.costCategoryId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                    <td style={BudTD}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                            <span style={{ fontSize: 16 }}>{src.icon || '•'}</span>
                                                            <div>
                                                                <div style={{ fontWeight: 600, color: '#1e293b' }}>{row.categoryName}</div>
                                                                {src.tip && <div style={{ fontSize: 10, color: '#94a3b8' }}>{src.tip}</div>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td style={{ ...BudTD, textAlign: 'right' }}>
                                                        <EditableCell row={row} canEdit={budgetCanEdit} uoms={uoms}
                                                            currencies={lookups.currencies || []}
                                                            job={{ jobCurrencyId: h?.currencyId, jobExcRate: h?.exchangeRate }}
                                                            baseCurrencyCode={baseCurrencyCode}
                                                            onSave={(fields) => handleBudgetSave(row, fields)}
                                                            onDelete={handleBudgetDelete} />
                                                    </td>
                                                    <td style={{ ...BudTD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 500, color: (row.actualAmount || 0) > 0 ? '#1e293b' : '#94a3b8' }}>
                                                        {(row.actualAmount || 0) > 0 ? fmt(row.actualAmount) : '—'}
                                                    </td>
                                                    <td style={{ ...BudTD, textAlign: 'right', fontFamily: 'Courier New', ...varianceStyle(row.variance, row.budgetedAmount) }}>
                                                        {row.budgetedAmount > 0
                                                            ? (row.variance >= 0 ? '' : '− ') + fmt(Math.abs(row.variance))
                                                            : '—'}
                                                    </td>
                                                    <td style={BudTD}>
                                                        {spendPct !== null
                                                            ? <div>
                                                                <div style={{ fontSize: 10, color: '#64748b', textAlign: 'right' }}>{spendPct}%</div>
                                                                <SpendBar actual={row.actualAmount} budget={row.budgetedAmount} />
                                                              </div>
                                                            : <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                                            <td style={{ ...BudTD, fontWeight: 700, color: '#fff' }}>TOTAL</td>
                                            <td style={{ ...BudTD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 700, color: '#fff' }}>{fmtDualFromBase(budTotalBudget)}</td>
                                            <td style={{ ...BudTD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 700, color: '#fff' }}>{fmtDualFromBase(budTotalActual)}</td>
                                            <td style={{ ...BudTD, textAlign: 'right', fontFamily: 'Courier New', fontWeight: 700, color: budTotalVar >= 0 ? '#86efac' : '#fca5a5' }}>
                                                {(budTotalVar >= 0 ? '' : '− ') + fmtDualFromBase(Math.abs(budTotalVar))}
                                            </td>
                                            <td style={BudTD}>
                                                {budTotalBudget > 0 && (
                                                    <div>
                                                        <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'right' }}>{budUsedPct.toFixed(1)}% used</div>
                                                        <SpendBar actual={budTotalActual} budget={budTotalBudget} />
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )
                        }

                        <div style={{ marginTop: 12, fontSize: 10.5, color: '#94a3b8' }}>
                            Actual costs: Committed POs + Confirmed SRVs + Confirmed Timesheets + Stock Issues + Approved Expenses
                        </div>

                        {/* Reason + password modal for approve / revise */}
                        {pwdAction === 'approve' && (
                            <PasswordModal
                                title="Approve budget"
                                message={`This will lock the current revision (Rev ${currentRvNo}) so no further edits are possible until someone with Revise permission creates a new revision. A reason and the shared budget password are required.`}
                                busy={pwdBusy}
                                onCancel={() => !pwdBusy && setPwdAction(null)}
                                onConfirm={(pwd, reason) => callBudgetAction('approve', pwd, reason)}
                            />
                        )}
                        {pwdAction === 'revise' && (
                            <PasswordModal
                                title="Revise approved budget"
                                message={`This will copy the approved Rev ${currentRvNo} into a new editable Rev ${currentRvNo + 1}. The current revision will be preserved as history. A reason and the shared budget password are required.`}
                                busy={pwdBusy}
                                onCancel={() => !pwdBusy && setPwdAction(null)}
                                onConfirm={(pwd, reason) => callBudgetAction('revise', pwd, reason)}
                            />
                        )}
                    </Section>
                    )}

                    {/* ── S4: Manhour Summary ───────────────────────────── */}
                    {canDo('/job-overview', 'SECTION_MANHOUR') && (
                    <Section title="Manhour Summary" icon="⏱" defaultOpen={false}>
                        {mhs ? (
                            <>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                                    <MhCard label="Total ManHours"    hours={mhs.totalHours}   cost={mhs.totalCost}   currency={baseCurrencyCode || cur} highlight />
                                    <MhCard label="Non-Site ManHours" hours={mhs.nonSiteHours} cost={mhs.nonSiteCost} currency={baseCurrencyCode || cur} />
                                    <MhCard label="Site ManHours"     hours={mhs.siteHours}    cost={mhs.siteCost}    currency={baseCurrencyCode || cur} />
                                    <MhCard label="Mechanical"        hours={mhs.mechHours}    cost={mhs.mechCost}    currency={baseCurrencyCode || cur} />
                                    <MhCard label="Electrical"        hours={mhs.elecHours}    cost={mhs.elecCost}    currency={baseCurrencyCode || cur} />
                                </div>
                                {mhs.lastUpdated && (
                                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                        Last Updated: {fmtDateLong(mhs.lastUpdated)}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div style={{ color: '#94a3b8', fontSize: 13 }}>No manhour data.</div>
                        )}
                    </Section>
                    )}

                    {/* ── S5: Purchase Orders ───────────────────────────── */}
                    {canDo('/job-overview', 'SECTION_PO') && (
                    <Section title="Purchase Orders" icon="🛒" count={(data.purchaseOrders || []).filter(r => r.status !== 'Draft').length} defaultOpen={false}>
                        {(() => {
                            const rows = (data.purchaseOrders || []).filter(r => r.status !== 'Draft');
                            if (rows.length === 0) {
                                return <div style={{ color: '#94a3b8', fontSize: 13, padding: '10px 0' }}>No approved purchase orders.</div>;
                            }
                            // Group by budget header (ExpenseCategoryName) — preserve SP ordering
                            const groups = [];
                            const groupIdx = new Map();
                            for (const r of rows) {
                                const key = r.expenseCategoryName || 'Uncategorised';
                                if (!groupIdx.has(key)) {
                                    groupIdx.set(key, groups.length);
                                    groups.push({ name: key, rows: [], totalPo: 0, totalPaid: 0, totalBal: 0 });
                                }
                                const g = groups[groupIdx.get(key)];
                                g.rows.push(r);
                                // Sum in BASE/job currency — POs may each be in a different
                                // currency, so raw totalAmount must not be added together.
                                g.totalPo   += Number(r.totalAmountBase   ?? r.totalAmount  ?? 0);
                                g.totalPaid += Number(r.paidAmountBase    ?? r.paidAmount    ?? 0);
                                g.totalBal  += Number(r.balanceAmountBase ?? r.balanceAmount ?? 0);
                            }
                            const grandPo   = groups.reduce((s, g) => s + g.totalPo,   0);
                            const grandPaid = groups.reduce((s, g) => s + g.totalPaid, 0);
                            const grandBal  = groups.reduce((s, g) => s + g.totalBal,  0);

                            // Match the rest of the Overview: same header band, same cell palette as OvTable.
                            const th = { padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' };
                            const td = { padding: '7px 10px', color: '#334155', borderBottom: '1px solid #f1f5f9' };
                            const tdRight = { ...td, textAlign: 'right' };
                            return (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'auto' }}>
                                        <thead>
                                            <tr style={{ background: '#f8fafc' }}>
                                                <th style={{ ...th, width: 110 }}>PO Ref #</th>
                                                <th style={{ ...th, width: 100 }}>PO Date</th>
                                                <th style={th}>Supplier</th>
                                                <th style={{ ...th, textAlign: 'right' }}>PO Amount</th>
                                                <th style={{ ...th, textAlign: 'right' }}>Paid</th>
                                                <th style={{ ...th, textAlign: 'right' }}>Balance</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {groups.map(g => (
                                                <React.Fragment key={g.name}>
                                                    {/* Budget group band (full width) */}
                                                    <tr>
                                                        <td colSpan={6} style={{ ...td, fontWeight: 700, color: '#1e3a5f', background: '#eef2f8', borderBottom: '1px solid #d4dce9' }}>
                                                            {g.name}
                                                        </td>
                                                    </tr>
                                                    {g.rows.map(r => (
                                                        <tr key={r.poId}>
                                                            <td style={td}>
                                                                <span onClick={() => triggerPrint('po', r.poId)}
                                                                    style={{ fontFamily: 'Courier New', fontSize: 11, background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, cursor: 'pointer', color: '#1e40af' }}>
                                                                    {r.poNumber}
                                                                </span>
                                                            </td>
                                                            <td style={td}>{fmtDate(r.poDate)}</td>
                                                            <td style={td}>{r.vendorName}</td>
                                                            <td style={tdRight}>
                                                                {r.currencyCode || baseCurrencyCode} {fmt(r.totalAmount)}
                                                                {Number(r.exchangeRate) !== 1 && (
                                                                    <div style={{ fontSize: 10, color: '#94a3b8' }}>@ {fmt(r.exchangeRate)} = {baseCurrencyCode} {fmt(r.totalAmountBase)}</div>
                                                                )}
                                                            </td>
                                                            <td style={tdRight}>{r.currencyCode || baseCurrencyCode} {fmt(r.paidAmount || 0)}</td>
                                                            <td style={tdRight}>{r.currencyCode || baseCurrencyCode} {fmt(r.balanceAmount || 0)}</td>
                                                        </tr>
                                                    ))}
                                                    <tr style={{ background: '#f8fafc' }}>
                                                        <td style={{ ...td, textAlign: 'right', fontWeight: 600 }} colSpan={3}>Sub Total</td>
                                                        <td style={{ ...tdRight, fontWeight: 600 }}>{fmtDual(g.totalPo)}</td>
                                                        <td style={{ ...tdRight, fontWeight: 600 }}>{fmtDual(g.totalPaid)}</td>
                                                        <td style={{ ...tdRight, fontWeight: 600 }}>{fmtDual(g.totalBal)}</td>
                                                    </tr>
                                                </React.Fragment>
                                            ))}
                                            <tr style={{ background: '#f1f5f9', borderTop: '2px solid #cbd5e1' }}>
                                                <td style={{ ...td, fontWeight: 700, textAlign: 'right' }} colSpan={3}>Grand Total</td>
                                                <td style={{ ...tdRight, fontWeight: 700 }}>{fmtDual(grandPo)}</td>
                                                <td style={{ ...tdRight, fontWeight: 700 }}>{fmtDual(grandPaid)}</td>
                                                <td style={{ ...tdRight, fontWeight: 700 }}>{fmtDual(grandBal)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            );
                        })()}
                    </Section>
                    )}

                    {/* ── S6: Stock Issues (Include-in-Costing only) ─────── */}
                    {canDo('/job-overview', 'SECTION_ISSUES') && (
                    <Section title="Stock Issues" icon="📦" count={(data.stockIssues || []).filter(r => r.costingType !== 'EXC_COSTING' && r.status !== 'Draft').length} defaultOpen={false}>
                        {(() => {
                            // Backend already filters to INC_COSTING, but guard client-side too.
                            const rows  = (data.stockIssues || []).filter(r => r.costingType !== 'EXC_COSTING' && r.status !== 'Draft');
                            const total = rows.reduce((s, r) => s + Number(r.totalCost || 0), 0);
                            const ccy   = rows[0]?.currencyCode || '';
                            return (
                                <>
                                    <OvTable keyField="issueId" rows={rows} cols={[
                                        { key: 'issueNo',     label: 'Issue No',
                                            render: r => <span onClick={() => triggerPrint('issue', r.issueId)} style={{ fontFamily: 'Courier New', fontSize: 11, background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, cursor: 'pointer', color: '#1e40af' }}>{r.issueNo}</span> },
                                        { key: 'issueDate',   label: 'Date',      render: r => fmtDate(r.issueDate) },
                                        { key: 'issuedTo',    label: 'Issued To', style: { minWidth: 130 } },
                                        { key: 'status',      label: 'Status',    render: r => <StatusBadge text={r.status} /> },
                                        { key: 'lineCount',   label: 'Lines',     align: 'center' },
                                        { key: 'currencyCode',label: 'Ccy',       align: 'center', style: { width: 60 },
                                            render: r => <span style={{ fontSize: 10.5, color: '#64748b' }}>{r.currencyCode || ccy}</span> },
                                        { key: 'totalCost',   label: 'Total Cost (base)', align: 'right', tdStyle: { fontWeight: 600 }, render: r => fmt(r.totalCost) },
                                        { key: 'notes',       label: 'Notes' },
                                    ]} />
                                    {rows.length > 0 && (
                                        <div style={{ marginTop: 8, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: '#1d4ed8' }}>
                                            Total Issued: <span style={{ fontFamily: 'monospace' }}>{fmtDualFromBase(total)}</span>
                                        </div>
                                    )}
                                </>
                            );
                        })()}
                    </Section>
                    )}

                    {/* ── S6b: Issue Returns (reduces actual stock cost) ─── */}
                    {canDo('/job-overview', 'SECTION_ISSUES') && (
                    <Section title="Issue Returns" icon="↩️" count={(data.issueReturns || []).filter(r => r.status !== 'Draft').length} defaultOpen={false}>
                        {(() => {
                            const rows  = (data.issueReturns || []).filter(r => r.status !== 'Draft');
                            const total = rows.reduce((s, r) => s + Number(r.totalCost || 0), 0);
                            const ccy   = rows[0]?.currencyCode || '';
                            if (rows.length === 0) {
                                return (
                                    <div style={{ color: '#94a3b8', fontSize: 13, padding: '10px 0' }}>
                                        No issue returns recorded for this job.
                                    </div>
                                );
                            }
                            return (
                                <>
                                    <OvTable keyField="returnId" rows={rows} cols={[
                                        { key: 'returnNo',  label: 'Return No',
                                            render: r => <span onClick={() => triggerPrint('return', r.returnId)} style={{ fontFamily: 'Courier New', fontSize: 11, background: '#fef3c7', color: '#92400e', padding: '1px 6px', borderRadius: 4, cursor: 'pointer' }}>{r.returnNo}</span> },
                                        { key: 'returnDate',label: 'Date',       render: r => fmtDate(r.returnDate) },
                                        { key: 'issueNo',   label: 'Against Issue',
                                            render: r => <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#475569' }}>{r.issueNo}</span> },
                                        { key: 'returnedBy',label: 'Returned By',style: { minWidth: 120 } },
                                        { key: 'status',    label: 'Status',     render: r => <StatusBadge text={r.status} /> },
                                        { key: 'lineCount', label: 'Lines',      align: 'center' },
                                        { key: 'currencyCode', label: 'Ccy',     align: 'center', style: { width: 60 },
                                            render: r => <span style={{ fontSize: 10.5, color: '#64748b' }}>{r.currencyCode || ccy}</span> },
                                        { key: 'totalCost', label: 'Return Value (base)', align: 'right', tdStyle: { fontWeight: 600, color: '#166534' }, render: r => fmt(r.totalCost) },
                                        { key: 'notes',     label: 'Notes' },
                                    ]} />
                                    <div style={{ marginTop: 8, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: '#166534' }}>
                                        Total Returned: <span style={{ fontFamily: 'monospace' }}>{fmtDualFromBase(total)}</span>
                                    </div>
                                </>
                            );
                        })()}
                    </Section>
                    )}

                    {/* ── S7: Invoices ──────────────────────────────────── */}
                    {canDo('/job-overview', 'SECTION_INVOICES') && (
                    <Section title="Invoices" icon="🧾" count={(data.invoices || []).filter(r => r.status !== 'Draft').length} defaultOpen={false}>
                        <OvTable keyField="invoiceId" rows={(data.invoices || []).filter(r => r.status !== 'Draft')} cols={[
                            { key: 'invoiceNo',      label: 'Invoice No',
                                render: r => <span onClick={() => triggerPrint('invoice', r.invoiceId)} style={{ fontFamily: 'Courier New', fontSize: 11, background: '#f1f5f9', padding: '1px 6px', borderRadius: 4, cursor: 'pointer', color: '#1e40af' }}>{r.invoiceNo}</span> },
                            { key: 'invoiceDate',    label: 'Date',       render: r => fmtDate(r.invoiceDate) },
                            { key: 'dueDate',        label: 'Due',        render: r => fmtDate(r.dueDate) },
                            { key: 'status',         label: 'Status',     render: r => <StatusBadge text={r.status} /> },
                            { key: 'currencyCode',   label: 'Ccy',        style: { width: 60 } },
                            { key: 'subTotal',       label: 'Sub Total',  align: 'right', render: r => fmt(r.subTotal) },
                            { key: 'taxAmount',      label: 'Tax',        align: 'right', render: r => fmt(r.taxAmount) },
                            { key: 'totalAmount',    label: 'Total',      align: 'right', tdStyle: { fontWeight: 700 }, render: r => fmt(r.totalAmount) },
                            { key: 'receivedAmount', label: 'Received',   align: 'right',
                                tdStyle: { fontWeight: 600, color: '#166534' },
                                render: r => fmt(r.receivedAmount || 0) },
                            { key: 'cnAmount',       label: 'Credit Note', align: 'right',
                                tdStyle: { fontWeight: 600, color: '#7c3aed' },
                                render: r => (r.cnAmount || 0) > 0 ? fmt(r.cnAmount) : '—' },
                            { key: '_outstanding',   label: 'Outstanding',align: 'right',
                                render: r => {
                                    const bal = Math.max(0, Number(r.totalAmount || 0) - Number(r.receivedAmount || 0) - Number(r.cnAmount || 0));
                                    return <span style={{ fontWeight: 600, color: bal > 0 ? '#b45309' : '#166534' }}>{fmt(bal)}</span>;
                                }},
                        ]} />
                        {(data.invoices || []).filter(r => r.status !== 'Draft').length > 0 && (() => {
                            const filtered = (data.invoices || []).filter(r => r.status !== 'Draft');
                            const totalBase = filtered.reduce((s, r) => {
                                const inBase = (r.amountInBaseCurrency != null)
                                    ? Number(r.amountInBaseCurrency)
                                    : Number(r.totalAmount || 0) * Number(r.exchangeRate || 1);
                                return s + inBase;
                            }, 0);
                            const receivedBase = filtered.reduce((s, r) =>
                                s + Number(r.receivedAmount || 0) * Number(r.exchangeRate || 1), 0);
                            const cnBase = filtered.reduce((s, r) =>
                                s + Number(r.cnAmount || 0) * Number(r.exchangeRate || 1), 0);
                            return (
                                <div style={{ marginTop: 8, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: '#1d4ed8', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
                                    <span>Total Invoiced: <span style={{ fontFamily: 'monospace' }}>{fmtDualFromBase(totalBase)}</span></span>
                                    <span style={{ color: '#166534' }}>Received: <span style={{ fontFamily: 'monospace' }}>{fmtDualFromBase(receivedBase)}</span></span>
                                    {cnBase > 0 && <span style={{ color: '#7c3aed' }}>Credit Notes: <span style={{ fontFamily: 'monospace' }}>{fmtDualFromBase(cnBase)}</span></span>}
                                    <span style={{ color: '#b45309' }}>Outstanding: <span style={{ fontFamily: 'monospace' }}>{fmtDualFromBase(Math.max(0, totalBase - receivedBase - cnBase))}</span></span>
                                </div>
                            );
                        })()}
                    </Section>
                    )}

                    {/* ── S7b: Additional Job Invoices ──────────────────────
                        Invoices raised against ANY child job (job whose ParentJobId
                        is this job). Appears only when at least one exists. */}
                    {canDo('/job-overview', 'SECTION_INVOICES') && ((data.childInvoices || []).filter(r => r.status !== 'Draft').length > 0) && (
                    <Section title="Additional Job Invoices" icon="🧾➕" count={(data.childInvoices || []).filter(r => r.status !== 'Draft').length} defaultOpen={false}>
                        <OvTable keyField="invoiceId" rows={(data.childInvoices || []).filter(r => r.status !== 'Draft')} cols={[
                            { key: 'invoiceNo',      label: 'Invoice No',
                                render: r => <span onClick={() => triggerPrint('invoice', r.invoiceId)} style={{ fontFamily: 'Courier New', fontSize: 11, background: '#fff7ed', color: '#9a3412', padding: '1px 6px', borderRadius: 4, cursor: 'pointer' }}>{r.invoiceNo}</span> },
                            { key: 'invoiceDate',    label: 'Date',       render: r => fmtDate(r.invoiceDate) },
                            { key: 'childJobId',     label: 'Child Job',
                                render: r => <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#0f766e', background: '#ccfbf1', padding: '1px 6px', borderRadius: 4 }}>{r.childJobId}</span> },
                            { key: 'childProjectName', label: 'Project',  style: { minWidth: 160 } },
                            { key: 'status',         label: 'Status',     render: r => <StatusBadge text={r.status} /> },
                            { key: 'currencyCode',   label: 'Ccy',        style: { width: 60 } },
                            { key: 'subTotal',       label: 'Sub Total',  align: 'right', render: r => fmt(r.subTotal) },
                            { key: 'taxAmount',      label: 'Tax',        align: 'right', render: r => fmt(r.taxAmount) },
                            { key: 'totalAmount',    label: 'Total',      align: 'right', tdStyle: { fontWeight: 700 }, render: r => fmt(r.totalAmount) },
                            { key: 'receivedAmount', label: 'Received',   align: 'right',
                                tdStyle: { fontWeight: 600, color: '#166534' },
                                render: r => fmt(r.receivedAmount || 0) },
                            { key: 'cnAmount',       label: 'Credit Note', align: 'right',
                                tdStyle: { fontWeight: 600, color: '#7c3aed' },
                                render: r => (r.cnAmount || 0) > 0 ? fmt(r.cnAmount) : '—' },
                            { key: '_outstanding',   label: 'Outstanding',align: 'right',
                                render: r => {
                                    const bal = Math.max(0, Number(r.totalAmount || 0) - Number(r.receivedAmount || 0) - Number(r.cnAmount || 0));
                                    return <span style={{ fontWeight: 600, color: bal > 0 ? '#b45309' : '#166534' }}>{fmt(bal)}</span>;
                                }},
                        ]} />
                        {(() => {
                            const filtered = (data.childInvoices || []).filter(r => r.status !== 'Draft');
                            const totalBase = filtered.reduce((s, r) => {
                                const inBase = (r.amountInBaseCurrency != null)
                                    ? Number(r.amountInBaseCurrency)
                                    : Number(r.totalAmount || 0) * Number(r.exchangeRate || 1);
                                return s + inBase;
                            }, 0);
                            const receivedBase = filtered.reduce((s, r) =>
                                s + Number(r.receivedAmount || 0) * Number(r.exchangeRate || 1), 0);
                            const cnBase = filtered.reduce((s, r) =>
                                s + Number(r.cnAmount || 0) * Number(r.exchangeRate || 1), 0);
                            return (
                                <div style={{ marginTop: 8, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: '#9a3412', display: 'flex', justifyContent: 'flex-end', gap: 24 }}>
                                    <span>Total Invoiced — Child Jobs: <span style={{ fontFamily: 'monospace' }}>{fmtDualFromBase(totalBase)}</span></span>
                                    <span style={{ color: '#166534' }}>Received: <span style={{ fontFamily: 'monospace' }}>{fmtDualFromBase(receivedBase)}</span></span>
                                    {cnBase > 0 && <span style={{ color: '#7c3aed' }}>Credit Notes: <span style={{ fontFamily: 'monospace' }}>{fmtDualFromBase(cnBase)}</span></span>}
                                    <span style={{ color: '#b45309' }}>Outstanding: <span style={{ fontFamily: 'monospace' }}>{fmtDualFromBase(Math.max(0, totalBase - receivedBase - cnBase))}</span></span>
                                </div>
                            );
                        })()}
                    </Section>
                    )}

                    {/* ── S8: Expenses ──────────────────────────────────── */}
                    {canDo('/job-overview', 'SECTION_EXPENSES') && (
                    <Section title="Expenses" icon="💳" count={data.expenses?.length || 0} defaultOpen={false}>
                        <OvTable keyField="expenseId" rows={data.expenses || []} cols={[
                            { key: 'expenseDate',         label: 'Date',       render: r => fmtDate(r.expenseDate) },
                            { key: 'expenseCategoryName', label: 'Category',   style: { minWidth: 120 } },
                            { key: 'expenseDescription',  label: 'Description',style: { minWidth: 150 } },
                            { key: 'currencyCode',        label: 'Ccy',        style: { width: 60 } },
                            { key: 'expenseAmount',       label: 'Amount',     align: 'right', render: r => fmt(r.expenseAmount) },
                            { key: 'amountInBaseCurrency',label: 'Base Amt',   align: 'right', tdStyle: { fontWeight: 600 }, render: r => fmt(r.amountInBaseCurrency) },
                            { key: 'isApproved',          label: 'Approved',
                                render: r => r.isApproved
                                    ? <span style={{ background: '#dcfce7', color: '#166534', padding: '1px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>Yes</span>
                                    : <span style={{ background: '#f1f5f9', color: '#94a3b8', padding: '1px 8px', borderRadius: 10, fontSize: 10 }}>No</span> },
                            { key: 'referenceNo', label: 'Ref No' },
                        ]} />
                        {data.expenses?.length > 0 && (
                            <div style={{ marginTop: 8, textAlign: 'right', fontSize: 12, fontWeight: 600, color: '#1d4ed8' }}>
                                Total: {fmtDualFromBase(data.expenses.reduce((a, r) => a + (r.amountInBaseCurrency || 0), 0))}
                            </div>
                        )}
                    </Section>
                    )}

                    {/* ── S8b: Delivery Notes — always rendered LAST (after Expenses) ── */}
                    {canDo('/job-overview', 'SECTION_INVOICES') && (data.deliveryNotes?.length > 0) && (
                    <Section title="Delivery Notes" icon="🚚" count={data.deliveryNotes.length} defaultOpen={false}>
                        <OvTable keyField="deliveryId" rows={data.deliveryNotes} cols={[
                            { key: 'deliveryNo',        label: 'DN No',
                                render: r => <span onClick={() => triggerPrint('delivery', r.deliveryId)} style={{ fontFamily: 'Courier New', fontSize: 11, background: '#eef2ff', color: '#3730a3', padding: '1px 6px', borderRadius: 4, cursor: 'pointer' }}>{r.deliveryNo}</span> },
                            { key: 'deliveryDate',      label: 'Date',         render: r => fmtDate(r.deliveryDate) },
                            { key: 'invoiceNo',         label: 'Invoice',
                                render: r => r.invoiceNo
                                    ? <span style={{ fontFamily: 'Courier New', fontSize: 11, color: '#475569' }}>{r.invoiceNo}</span>
                                    : <span style={{ color: '#94a3b8' }}>—</span> },
                            { key: 'consignee',         label: 'Consignee',    style: { minWidth: 150 } },
                            { key: 'consigneeLpoNo',    label: 'LPO No' },
                            { key: 'consigneeLpoDate',  label: 'LPO Date',     render: r => fmtDate(r.consigneeLpoDate) },
                            { key: 'vehicleNo',         label: 'Vehicle No' },
                            { key: 'deliveredBy',       label: 'Delivered By' },
                            { key: 'deliveredByDate',   label: 'Delivered On', render: r => fmtDate(r.deliveredByDate) },
                            { key: 'status',            label: 'Status',       render: r => <StatusBadge text={r.status} /> },
                            { key: 'notes',             label: 'Notes' },
                        ]} />
                    </Section>
                    )}

                    {/* ── S9: Additional Jobs (hidden — already rendered as Variations in Financial Summary) ── */}
                    {false && canDo('/job-overview', 'SECTION_ADDITIONAL') && (addlLoading || additionalJobs.length > 0) && (
                        <Section title="Additional Jobs" icon="🔗" count={additionalJobs.length} defaultOpen={additionalJobs.length > 0}>
                            {addlLoading ? (
                                <div style={{ color: '#94a3b8', fontSize: 13, padding: '8px 0' }}>Loading…</div>
                            ) : (
                                <>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                                            <thead>
                                                <tr style={{ background: '#f1f5f9', borderBottom: '2px solid #e2e8f0' }}>
                                                    {['Job No.', 'Description', 'LPO Ref', 'LPO Date', 'Contract Ref', 'Order Value', 'Stage', 'Status', ''].map(h => (
                                                        <th key={h} style={{
                                                            padding: '7px 10px', textAlign: h === 'Order Value' ? 'right' : 'left',
                                                            fontSize: 11, fontWeight: 700, color: '#64748b',
                                                            textTransform: 'uppercase', letterSpacing: '.4px', whiteSpace: 'nowrap',
                                                        }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {additionalJobs.map((r, i) => {
                                                    const jid = r.jobId || r.JobId;
                                                    const sid = r.jobStatusId ?? r.JobStatusId;
                                                    const st  = ADJ_STATUS_MAP[sid] || { label: 'Unknown', bg: '#f1f5f9', color: '#64748b' };
                                                    return (
                                                        <tr key={jid}
                                                            style={{ background: i % 2 === 0 ? '#fff' : '#f8fafc', borderBottom: '1px solid #f1f5f9' }}
                                                            onMouseEnter={e => e.currentTarget.style.background = '#eff6ff'}
                                                            onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? '#fff' : '#f8fafc'}>
                                                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                                                <button onClick={() => navigate(`/jobs/${encodeURIComponent(jid)}`)}
                                                                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#2e5fa3', fontWeight: 700, fontSize: 12.5, padding: 0, textDecoration: 'underline' }}>
                                                                    {jid}
                                                                </button>
                                                            </td>
                                                            <td style={{ padding: '8px 10px', color: '#475569', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {r.jobDescription || r.JobDescription || '—'}
                                                            </td>
                                                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11.5, color: '#64748b' }}>
                                                                {r.lpoRef || r.LpoRef || '—'}
                                                            </td>
                                                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap', color: '#64748b' }}>
                                                                {fmtDate(r.lpoDate || r.LpoDate)}
                                                            </td>
                                                            <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11.5, color: '#64748b' }}>
                                                                {r.contractRef || r.ContractRef || '—'}
                                                            </td>
                                                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, whiteSpace: 'nowrap', fontFamily: 'Courier New' }}>
                                                                {(r.orderValue || r.OrderValue) ? fmt(r.orderValue ?? r.OrderValue) : '—'}
                                                            </td>
                                                            <td style={{ padding: '8px 10px', color: '#64748b', whiteSpace: 'nowrap' }}>
                                                                {r.jobStageName || r.JobStageName || '—'}
                                                            </td>
                                                            <td style={{ padding: '8px 10px' }}>
                                                                <span style={{ background: st.bg, color: st.color, borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 600 }}>
                                                                    {st.label}
                                                                </span>
                                                            </td>
                                                            <td style={{ padding: '8px 10px' }}>
                                                                <button onClick={() => navigate(`/jobs/${encodeURIComponent(jid)}`)}
                                                                    style={{ padding: '3px 10px', fontSize: 11, fontWeight: 600, background: '#2e5fa3', color: '#fff', border: 'none', borderRadius: 5, cursor: 'pointer' }}>
                                                                    Open
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ background: '#1e3a5f', color: '#fff' }}>
                                                    <td colSpan={5} style={{ padding: '7px 10px', fontWeight: 700, color: '#fff', fontSize: 12 }}>
                                                        TOTAL ({additionalJobs.length} jobs)
                                                    </td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, fontFamily: 'Courier New', fontSize: 12.5, color: '#fff' }}>
                                                        {fmt(additionalJobs.reduce((s, r) => s + (r.orderValue || r.OrderValue || 0), 0))}
                                                    </td>
                                                    <td colSpan={3} />
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </>
                            )}
                        </Section>
                    )}

                </div>
            )}

            {!loading && !data && !selectedJobId && (
                <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
                    <div style={{ fontSize: 14 }}>Select a job above to view its full overview</div>
                </div>
            )}

            {/* ── Chart modal ──────────────────────────────────────────── */}
            {modal && (
                <ChartModal title={modal.title} onClose={() => setModal(null)}>
                    {modal.content}
                </ChartModal>
            )}

            {/* ── Hidden print dock — renders print modal off-screen so openPrintWindow can capture it ── */}
            {printData && (
                <div style={{ position: 'fixed', top: -9999, left: -9999, visibility: 'hidden', pointerEvents: 'none' }}>
                    {printData.type === 'po'       && <PoPrintModal          po={printData.payload.po}                   onClose={() => {}} />}
                    {printData.type === 'issue'    && <IssueNotePrintModal   issue={printData.payload.issue}   lines={printData.payload.lines}  onClose={() => {}} />}
                    {printData.type === 'return'   && <IssueReturnPrintModal issueReturn={printData.payload.issueReturn} lines={printData.payload.lines} onClose={() => {}} />}
                    {printData.type === 'invoice'  && <InvoicePrintModal     invoice={printData.payload.invoice}  lines={printData.payload.lines} onClose={() => {}} />}
                    {printData.type === 'delivery' && <DeliveryPrintModal    delivery={printData.payload.delivery} lines={printData.payload.lines} onClose={() => {}} />}
                </div>
            )}
        </div>
    );
};

export default JobOverview;
