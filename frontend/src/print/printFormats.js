import { useLookup } from '../LookupContext';

// ── Print format registry ────────────────────────────────────────────────────
// Central definition of which print layouts (formats) exist per document module,
// and which one is active. The active format is driven by the
// 'Biz.Print.<MODULE>' app setting (editable in Company Settings → Print Formats),
// so the app shows a SINGLE configured print modal instead of a format picker.
//
// Documents with only one layout today register a single "Standard" option — they
// still flow through the same config so adding a 2nd layout later is a drop-in:
// add the option here and render the matching component in that detail page.

const STANDARD = [{ value: '1', label: 'Standard' }];

export const PRINT_FORMATS = {
    // ── Multi-format documents ──
    INV: {
        label: 'Invoice', setting: 'Biz.Print.INV', fallback: '1',
        options: [
            { value: '1', label: 'Format 1 — Classic' },
            { value: '2', label: 'Format 2 — Modern'  },
            { value: '3', label: 'Format 3 — Compact' },
        ],
    },
    PO: {
        label: 'Purchase Order', setting: 'Biz.Print.PO', fallback: '1',
        options: [
            { value: '1', label: 'Format 1 — Classic'  },
            { value: '2', label: 'Format 2 — Modern'   },
            { value: '3', label: 'Format 3 — With T&C' },
        ],
    },

    // ── Single-layout documents (config-ready, one option today) ──
    PR:   { label: 'Purchase Request',  setting: 'Biz.Print.PR',   fallback: '1', options: STANDARD },
    GRN:  { label: 'Goods Receipt Note',setting: 'Biz.Print.GRN',  fallback: '1', options: STANDARD },
    FGRN: { label: 'Free-Issue GRN',    setting: 'Biz.Print.FGRN', fallback: '1', options: STANDARD },
    DLV:  { label: 'Delivery Note',     setting: 'Biz.Print.DLV',  fallback: '1', options: STANDARD },
    RV:   { label: 'Receipt Voucher',   setting: 'Biz.Print.RV',   fallback: '1', options: STANDARD },
    PV:   { label: 'Payment Voucher',   setting: 'Biz.Print.PV',   fallback: '1', options: STANDARD },
    CN:   { label: 'Credit Note',       setting: 'Biz.Print.CN',   fallback: '1', options: STANDARD },
    DN:   { label: 'Debit Note',        setting: 'Biz.Print.DN',   fallback: '1', options: STANDARD },
    ISS:  { label: 'Stock Issue',       setting: 'Biz.Print.ISS',  fallback: '1', options: STANDARD },
    IRN:  { label: 'Issue Return',      setting: 'Biz.Print.IRN',  fallback: '1', options: STANDARD },
};

// Ordered list for the admin UI.
export const PRINT_DOC_TYPES = Object.entries(PRINT_FORMATS)
    .map(([module, cfg]) => ({ module, ...cfg }));

// Resolve the active format number for a module.
//   getSetting — from useLookup(); reads the Biz.* app settings loaded at startup.
// Returns a Number (e.g. 2). Falls back to the module's `fallback` when unset or
// when the stored value isn't one of the registered options.
export const resolvePrintFormat = (module, getSetting) => {
    const cfg = PRINT_FORMATS[module];
    if (!cfg) return 1;
    const raw = String(getSetting?.(cfg.setting, cfg.fallback) ?? cfg.fallback);
    const valid = cfg.options.some(o => o.value === raw);
    return Number(valid ? raw : cfg.fallback);
};

// Convenience hook: returns the active format number for a module.
// Use in a detail page:  const printFmt = usePrintFormat('RV');
//                        <button onClick={() => setShowPrint(printFmt)}>Print</button>
export const usePrintFormat = (module) => {
    const { getSetting } = useLookup();
    return resolvePrintFormat(module, getSetting);
};
