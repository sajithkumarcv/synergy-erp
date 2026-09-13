import React, { useEffect, useMemo, useState } from 'react';
import { useLookup } from '../LookupContext';
import { fmt } from '../procurement/procurementConstants';
import { fetchItemHistory, evaluateVariance, usePriceVarianceSettings } from './PriceVarianceWarning';
import LastPurchaseModal from './LastPurchaseModal';

// ─────────────────────────────────────────────────────────────────────
// The approver's half of the price-variance feature.
//
// The buyer gets a warning per line while typing. An approver is looking at
// a finished PO and needs ONE unmissable statement instead. Scans every
// line, lists the ones above tolerance, and renders NOTHING when all are
// fine - silence is the common case and must stay quiet.
//
// Uses the same evaluateVariance() as the buyer's warning. If the two had
// separate maths, an approver could read "within tolerance" for a line the
// buyer was warned about, which destroys trust in both.
//
// One lookup per DISTINCT item, not per line.
// ─────────────────────────────────────────────────────────────────────
const PriceVarianceSummary = ({ lines = [], exchangeRate = 1, currencyCode = '' }) => {
    const { lookups } = useLookup();
    // Memoised: a bare `lookups?.uoms || []` yields a new array identity on
    // every render, which would re-run the effect and refetch endlessly.
    const uoms        = useMemo(() => lookups?.uoms || [], [lookups]);
    const settings    = usePriceVarianceSettings();
    const [flagged, setFlagged] = useState([]);
    const [peek,    setPeek]    = useState(null);    // item whose history is open
    const total = (lines || []).length;

    // Depend on the CONTENT of the lines, not the array's identity. The parent
    // rebuilds `lines` on every render, so using the array itself would re-run this
    // effect forever. Only itemId / price / uom affect the verdict.
    const linesKey = useMemo(
        () => (lines || []).map(l => `${l.itemId}:${l.unitPrice}:${l.uomId}`).join('|'),
        [lines]
    );

    useEffect(() => {
        let live = true;
        const priced = (lines || []).filter(l => l.itemId && Number(l.unitPrice) > 0);
        if (priced.length === 0) { setFlagged([]); return; }

        // Distinct items only - a 40-line PO of one item is one request.
        const ids = [...new Set(priced.map(l => String(l.itemId)))];
        Promise.all(ids.map(id => fetchItemHistory(id).then(rows => [id, rows])))
            .then(pairs => {
                if (!live) return;
                const byItem = new Map(pairs);
                const out = [];
                for (const l of priced) {
                    const v = evaluateVariance({
                        history:      byItem.get(String(l.itemId)) || [],
                        typedPrice:   l.unitPrice,
                        exchangeRate,
                        lineUomId:    l.uomId,
                        lineUomLabel: l.uomName,
                        uoms,
                        settings,
                    });
                    if (v.state === 'warn') out.push({ line: l, v });
                }
                out.sort((a, b) => b.v.pct - a.v.pct);
                setFlagged(out);
            })
            .catch(() => { if (live) setFlagged([]); });
        return () => { live = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [linesKey, exchangeRate, uoms, settings]);

    if (flagged.length === 0) return null;   // all within tolerance - say nothing

    const worst    = flagged[0].v.severity === 'critical' ? 'critical' : 'warn';
    const border   = worst === 'critical' ? '#dc2626' : '#d97706';
    const bg       = worst === 'critical' ? '#fef2f2' : '#fffbeb';
    const fg       = worst === 'critical' ? '#b91c1c' : '#b45309';
    const cur      = currencyCode ? `${currencyCode} ` : '';

    // One headline plus a chip per flagged line. A 20-line PO must not turn into
    // a paragraph nobody reads: chips stay scannable at any count, and clicking
    // one opens that item's price history rather than spelling it out inline.

    return (
        // pv-no-print: the PO approval review page doubles as the PRINTED PO.
        // An internal review prompt must never reach the supplier's copy.
        <div className="pv-no-print"
            style={{ margin: '0 0 12px', padding: '8px 12px', borderRadius: 8,
                     border: `1px solid ${border}`, background: bg, color: fg }}>
            <style>{`@media print { .pv-no-print { display: none !important; } }`}</style>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: 12.5 }}>
                    {worst === 'critical' ? '⛔' : '⚠'} {flagged.length} of {total} line{total === 1 ? '' : 's'} priced above the usual level
                </span>
                <span style={{ fontSize: 11.5, opacity: .85 }}>
                    · worst ▲{flagged[0].v.pct.toFixed(0)}%
                </span>
            </div>

            {/* One chip per flagged line. Clicking opens that item's price history,
                so the banner stays short no matter how many lines are flagged. */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 6 }}>
                {flagged.map(({ line, v }, i) => (
                    <button
                        key={`${line.poLineId || line.itemId}-${i}`}
                        type="button"
                        onClick={() => setPeek({
                            itemId:    line.itemId,
                            itemLabel: `[${line.itemCode || '—'}] ${line.itemDesc || ''}`.trim(),
                        })}
                        title={`${cur}${fmt(line.unitPrice)} vs usual ${cur}${fmt(v.baseline)}`
                               + (v.last?.supplierName ? ` · last from ${v.last.supplierName}` : '')
                               + ' — click for price history'}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                            border: `1px solid ${v.severity === 'critical' ? '#dc2626' : border}`,
                            background: 'rgba(255,255,255,.55)',
                            color: v.severity === 'critical' ? '#b91c1c' : fg,
                            cursor: 'pointer', whiteSpace: 'nowrap',
                        }}>
                        {line.itemCode || line.itemDesc || 'Item'}
                        <span style={{ fontWeight: 700 }}>▲{v.pct.toFixed(0)}%</span>
                    </button>
                ))}
            </div>

            {peek && (
                <LastPurchaseModal
                    itemId={peek.itemId}
                    itemLabel={peek.itemLabel}
                    onClose={() => setPeek(null)}
                />
            )}
        </div>
    );
};

export default PriceVarianceSummary;
