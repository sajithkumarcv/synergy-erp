/**
 * Vendor-facing PO line consolidation.
 *
 * Vendors get confused when the same SKU appears twice on a PO (e.g. when one
 * PO was created from two PRs that each requested the same item). The internal
 * database keeps every PR→PO link 1:1 — required for the PR backlog and GRN
 * allocation logic to work — but the printed PO collapses duplicates per
 * commercial-term group.
 *
 * Merge key:  itemId + unitPrice + taxPct + uomId
 *   - Same SKU at the SAME unit price + tax + UOM → one consolidated line.
 *   - Same SKU at a DIFFERENT price (e.g. quantity break) → separate line,
 *     because the vendor needs to honour two different unit costs.
 *   - Same SKU in a DIFFERENT UOM (e.g. EA vs BOX) → separate line.
 *
 * Returns an array of `{ poLineId, itemId, itemCode, itemDesc, orderedQty,
 *   uomName, unitPrice, taxPct, lineTotal, lineTotalWithTax, sourceCount }`
 * where `sourceCount` is the number of underlying DB rows merged into this row
 * (used by the print template to add a small "(combined from N PR lines)"
 * note if you want it). `poLineId` is the FIRST underlying id — the print
 * doesn't use it as a key so any is fine.
 *
 * Lines whose `merge key` is incomplete (missing itemId) fall through as-is
 * and are not merged with anything else — defensive against bad data.
 */

const sumQty   = (lines) => lines.reduce((s, l) => s + (Number(l.orderedQty)        || 0), 0);
const sumTotal = (lines) => lines.reduce((s, l) => s + (Number(l.lineTotal         ?? (l.orderedQty * l.unitPrice)) || 0), 0);
const sumTax   = (lines) => lines.reduce((s, l) => {
    const explicit = l.lineTotalWithTax;
    if (explicit != null) return s + Number(explicit);
    const base = Number(l.lineTotal ?? (l.orderedQty * l.unitPrice)) || 0;
    return s + base + base * (Number(l.taxPct) || 0) / 100;
}, 0);

export const consolidatePoLinesForPrint = (lines) => {
    if (!Array.isArray(lines) || lines.length === 0) return [];

    const buckets = new Map();
    // We keep the original ordering of the FIRST occurrence of each key, so
    // the printed PO line order matches the data-entry order minus the dupes.
    const order   = [];

    for (const l of lines) {
        if (!l.itemId) {
            // No itemId → bypass consolidation (rare; defensive). Push a unique
            // key so it ends up as its own line.
            const k = `_nokey_${order.length}`;
            buckets.set(k, [l]);
            order.push(k);
            continue;
        }
        const key = [
            l.itemId,
            Number(l.unitPrice ?? 0).toFixed(6),
            Number(l.taxPct    ?? 0).toFixed(4),
            l.uomId ?? '0',
        ].join('|');
        if (!buckets.has(key)) { buckets.set(key, []); order.push(key); }
        buckets.get(key).push(l);
    }

    return order.map(key => {
        const group = buckets.get(key);
        const head  = group[0];
        return {
            // Use the first row's id as the React key — fine, the print is
            // read-only and never edits by id.
            poLineId:         head.poLineId,
            itemId:           head.itemId,
            itemCode:         head.itemCode,
            itemDesc:         head.itemDesc || head.itemName,
            itemNameAr:       head.itemNameAr,
            uomName:          head.uomName,
            unitPrice:        head.unitPrice,
            taxPct:           head.taxPct,
            // Aggregated metrics
            orderedQty:       sumQty(group),
            lineTotal:        sumTotal(group),
            lineTotalWithTax: sumTax(group),
            // Optional traceability: how many DB rows ended up in this print row.
            sourceCount:      group.length,
            // Merge a deduped, comma-joined view of per-row remarks so the
            // vendor still sees any useful notes (e.g. "rev A drawing" on one
            // source line and "rush" on another).
            remarks: Array.from(new Set(
                group.map(g => (g.remarks || '').trim()).filter(Boolean)
            )).join(' · ') || null,
        };
    });
};

export default consolidatePoLinesForPrint;
