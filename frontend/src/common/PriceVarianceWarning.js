import React from 'react';
import { variables, authHeaders } from '../Variable';
import { useLookup } from '../LookupContext';
import { fmt, fmtDate } from '../procurement/procurementConstants';

// ─────────────────────────────────────────────────────────────────────
// Purchase price-variance warning.
//
// Compares the unit price being typed on a PO line against what the item
// has actually cost, and warns at the point of commitment. Equivalent to
// SAP's tolerance key PE / D365's price tolerance groups.
//
// WARN, NEVER BLOCK. A hard stop on a legitimate price rise teaches people
// to route around the system.
//
// No proc and no endpoint of its own: it reuses GET api/priceanalysis/po
// (sp_GetItemPoPriceAnalysis), the same source the Item Price Analysis
// screen and the last-purchase popup read, so price history can never
// disagree with itself.
// ─────────────────────────────────────────────────────────────────────

// ── module-level cache ───────────────────────────────────────────────
// MUST be module level, not per component: a grid mounts one component per
// row, so a per-instance cache refetches the same item once per row. The
// in-flight promise is cached too, so concurrent rows for one item make a
// single request. Session lifetime is fine for a warning - Item Price
// Analysis remains the live view.
const _historyCache   = new Map();   // itemId -> detail rows
const _inFlight       = new Map();   // itemId -> Promise

export function fetchItemHistory(itemId) {
    const key = String(itemId);
    if (_historyCache.has(key)) return Promise.resolve(_historyCache.get(key));
    if (_inFlight.has(key))     return _inFlight.get(key);

    // includeDraft is deliberately left at its default (false): a baseline is
    // built from settled purchases, not from prices somebody is still drafting.
    const p = fetch(`${variables.API_URL}priceanalysis/po?itemId=${itemId}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
            const rows = Array.isArray(d?.detail) ? d.detail : [];
            _historyCache.set(key, rows);
            _inFlight.delete(key);
            return rows;
        })
        .catch(() => { _inFlight.delete(key); _historyCache.set(key, []); return []; });

    _inFlight.set(key, p);
    return p;
}

// ── unit resolution ──────────────────────────────────────────────────
// Documents do NOT store units consistently. In SYNERP the PO line table
// holds 'EA' on some rows and 'Each' on others; PR lines hold 'Each'; and
// 'SET' vs 'Set' differs only by case. Comparing raw strings decides one
// unit is two, which silently disables the whole check. Resolve BOTH sides
// to a uom id through the lookup, and fall back to a normalised string only
// when a unit is genuinely unknown.
export function resolveUomId(raw, uoms) {
    if (raw == null || raw === '') return null;
    const s = String(raw).trim().toLowerCase();
    if (!Array.isArray(uoms)) return null;
    const hit = uoms.find(u =>
        String(u.code || '').trim().toLowerCase() === s ||
        String(u.name || '').trim().toLowerCase() === s);
    return hit ? hit.id : null;
}

function sameUnit(rowUomName, lineUomId, lineUomLabel, uoms) {
    const rowId = resolveUomId(rowUomName, uoms);
    if (rowId != null && lineUomId != null) return String(rowId) === String(lineUomId);
    // Unknown on one side - compare normalised text rather than guessing.
    const a = String(rowUomName   || '').trim().toLowerCase();
    const b = String(lineUomLabel || '').trim().toLowerCase();
    return a !== '' && a === b;
}

// ── the rule ─────────────────────────────────────────────────────────
// ONE pure function, shared by the buyer's warning, the approver's summary
// and the input border. If they had separate maths an approver could read
// "within tolerance" for a line the buyer was warned about, which destroys
// trust in both.
//
// Returns { state, ... } where state is one of:
//   'none'  nothing to say (no history, disabled, or below thresholds)
//   'uom'   history exists but only in other units - not comparable
//   'info'  history known, nothing typed yet
//   'ok'    within tolerance
//   'warn'  over tolerance, with severity 'warn' | 'critical'
export function evaluateVariance({
    history       = [],
    typedPrice    = null,
    exchangeRate  = 1,
    lineUomId     = null,
    lineUomLabel  = '',
    uoms          = [],
    settings      = {},
}) {
    const warnPct  = Number(settings.warnPercent     ?? 10);
    const critPct  = Number(settings.criticalPercent ?? 25);
    const minPrice = Number(settings.minUnitPrice    ?? 1);
    const minCount = Number(settings.minHistoryCount ?? 1);

    if (!warnPct || warnPct <= 0)      return { state: 'none' };       // feature switched off
    if (!Array.isArray(history) || history.length === 0) return { state: 'none' };

    // Same unit only. Per-piece against per-box reads as a 12x spike.
    const comparable = history.filter(h => sameUnit(h.uomName, lineUomId, lineUomLabel, uoms));
    if (comparable.length === 0)       return { state: 'uom', otherUnits: true };
    if (comparable.length < minCount)  return { state: 'none' };

    // Quantity-weighted average of the BASE-currency price. Never compare
    // across currencies: an FX move would read as a price rise.
    let qty = 0, val = 0;
    for (const h of comparable) {
        const q = Number(h.orderedQty)    || 0;
        const p = Number(h.unitPriceBase) || 0;
        if (q > 0 && p > 0) { qty += q; val += q * p; }
    }
    if (qty <= 0)                      return { state: 'none' };
    const baseline = val / qty;
    if (baseline < minPrice)           return { state: 'none' };       // trivial item, ignore

    const sorted = [...comparable].sort((a, b) => {
        const d = new Date(b.poDate) - new Date(a.poDate);
        return d !== 0 ? d : (b.poId || 0) - (a.poId || 0);
    });
    const last = sorted[0];
    const ctx  = { baseline, last, count: comparable.length };

    const typed = Number(typedPrice);
    if (!typedPrice || !isFinite(typed) || typed <= 0) return { state: 'info', ...ctx };

    const typedBase = typed * (Number(exchangeRate) || 1);
    const pct       = ((typedBase - baseline) / baseline) * 100;

    if (pct < warnPct) return { state: 'ok', pct, typedBase, ...ctx };
    return {
        state:    'warn',
        severity: (critPct > 0 && pct >= critPct) ? 'critical' : 'warn',
        pct, typedBase, ...ctx,
    };
}

// ── tooltip ──────────────────────────────────────────────────────────
// Exported so every price field words it identically. Returns '' when there
// is nothing to say, so `title={tip || undefined}` yields no tooltip at all.
export function varianceTooltip(v, currencyCode = '') {
    if (!v || v.state === 'none') return '';
    if (v.state === 'uom')        return 'Previously purchased in a different unit - prices are not comparable.';
    if (!v.last)                  return '';
    const cur   = currencyCode ? `${currencyCode} ` : '';
    const lines = [`Last paid ${cur}${fmt(v.last.unitPriceBase)} on ${fmtDate(v.last.poDate)} — ${v.last.supplierName || 'unknown supplier'}`];
    if (v.count > 1) lines.push(`Average of ${v.count} purchases: ${cur}${fmt(v.baseline)}`);
    if (v.state === 'warn') lines.push(`This price is ${v.pct.toFixed(0)}% above that average.`);
    return lines.join('\n');
}

// ── settings hook ────────────────────────────────────────────────────
export function usePriceVarianceSettings() {
    const { getSetting } = useLookup();
    const warnPercent     = Number(getSetting('Biz.PriceVariance.WarnPercent',     '10'));
    const criticalPercent = Number(getSetting('Biz.PriceVariance.CriticalPercent', '25'));
    const minUnitPrice    = Number(getSetting('Biz.PriceVariance.MinUnitPrice',    '1'));
    const minHistoryCount = Number(getSetting('Biz.PriceVariance.MinHistoryCount', '1'));
    // MUST be memoised on the VALUES. Returning a fresh object literal each render
    // gives every consumer a new dependency identity; any useEffect depending on it
    // then re-runs, setStates, re-renders and re-runs forever. That loop pegged the
    // CPU and made the summary's chips unclickable.
    return React.useMemo(
        () => ({ warnPercent, criticalPercent, minUnitPrice, minHistoryCount }),
        [warnPercent, criticalPercent, minUnitPrice, minHistoryCount]
    );
}

// ── history hook ─────────────────────────────────────────────────────
export function useItemHistory(itemId) {
    const [rows, setRows] = React.useState(null);
    React.useEffect(() => {
        if (!itemId) { setRows(null); return; }
        let live = true;
        fetchItemHistory(itemId).then(r => { if (live) setRows(r); });
        return () => { live = false; };
    }, [itemId]);
    return rows;
}

// ── palette ──────────────────────────────────────────────────────────
// Colour ONLY. Border width stays 1px in every state - changing width
// reflows the row.
export const varianceColors = (v) => {
    if (!v) return null;
    if (v.state === 'warn') return v.severity === 'critical'
        ? { border: '#dc2626', bg: '#fef2f2', fg: '#b91c1c' }
        : { border: '#d97706', bg: '#fffbeb', fg: '#b45309' };
    return null;   // ok / info / uom / none leave the field alone
};

// ── block warning (manual PO line form) ──────────────────────────────
const PriceVarianceWarning = ({ variance, currencyCode = '' }) => {
    if (!variance || variance.state !== 'warn') return null;
    const c = varianceColors(variance);
    return (
        <div style={{
            marginTop: 6, padding: '8px 10px', borderRadius: 6,
            border: `1px solid ${c.border}`, background: c.bg, color: c.fg,
            fontSize: 11.5, lineHeight: 1.5,
        }}>
            <div style={{ fontWeight: 700 }}>
                {variance.severity === 'critical' ? '⛔ ' : '⚠ '}
                {variance.pct.toFixed(0)}% above the usual price
            </div>
            <div>
                Last paid {currencyCode ? `${currencyCode} ` : ''}{fmt(variance.last?.unitPriceBase)} on{' '}
                {fmtDate(variance.last?.poDate)} — {variance.last?.supplierName || 'unknown supplier'}
                {variance.count > 1 && <> · average of {variance.count} purchases {fmt(variance.baseline)}</>}
            </div>
        </div>
    );
};

// ── compact chip (import grids) ──────────────────────────────────────
export const PriceVarianceChip = ({ variance, currencyCode = '' }) => {
    if (!variance || variance.state !== 'warn') return null;
    const c = varianceColors(variance);
    return (
        <span title={varianceTooltip(variance, currencyCode)}
            style={{
                fontSize: 10, fontWeight: 700, padding: '2px 5px', borderRadius: 4,
                border: `1px solid ${c.border}`, background: c.bg, color: c.fg,
                whiteSpace: 'nowrap',
            }}>
            ▲ {variance.pct.toFixed(0)}%
        </span>
    );
};

export default PriceVarianceWarning;
