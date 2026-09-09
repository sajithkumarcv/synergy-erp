import React, { useEffect, useMemo, useState } from 'react';
import { useLookup } from '../LookupContext';
import { fmt } from '../procurement/procurementConstants';
import { fetchItemHistory, evaluateVariance, usePriceVarianceSettings } from './PriceVarianceWarning';

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
    }, [lines, exchangeRate, uoms, settings]);

    if (flagged.length === 0) return null;   // all within tolerance - say nothing

    const worst    = flagged[0].v.severity === 'critical' ? 'critical' : 'warn';
    const border   = worst === 'critical' ? '#dc2626' : '#d97706';
    const bg       = worst === 'critical' ? '#fef2f2' : '#fffbeb';
    const fg       = worst === 'critical' ? '#b91c1c' : '#b45309';
    const cur      = currencyCode ? `${currencyCode} ` : '';

    return (
        // pv-no-print: the PO approval review page doubles as the PRINTED PO.
        // An internal review prompt must never reach the supplier's copy.
        <div className="pv-no-print"
            style={{ margin: '0 0 12px', padding: '10px 12px', borderRadius: 8,
                     border: `1px solid ${border}`, background: bg, color: fg }}>
            <style>{`@media print { .pv-no-print { display: none !important; } }`}</style>
            <div style={{ fontWeight: 700, fontSize: 12.5 }}>
                {worst === 'critical' ? '⛔' : '⚠'} {flagged.length} line{flagged.length === 1 ? '' : 's'} priced above the usual level
            </div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 11.5, lineHeight: 1.6 }}>
                {flagged.map(({ line, v }, i) => (
                    <li key={`${line.poLineId || line.itemId}-${i}`}>
                        <strong>{line.itemCode || line.itemDesc || 'Item'}</strong>
                        {' — '}{cur}{fmt(line.unitPrice)} vs usual {cur}{fmt(v.baseline)}
                        {' · '}<strong>{v.pct.toFixed(0)}% higher</strong>
                        {v.last?.supplierName && <> · last from {v.last.supplierName}</>}
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default PriceVarianceSummary;
