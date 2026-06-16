// ─────────────────────────────────────────────────────────────────────
// invoiceConstants.js  —  shared config for the Invoice module
// ─────────────────────────────────────────────────────────────────────

export const INVOICE_TABS = [
    { key: 'overview',   label: 'Overview',   icon: '📋', description: 'Header & billing info' },
    { key: 'lines',      label: 'Lines',      icon: '📄', description: 'Invoice line items',  badge: true },
    { key: 'payments',   label: 'Payments',   icon: '💰', description: 'Receipt vouchers applied', badge: true },
    { key: 'documents',  label: 'Documents',  icon: '📎', description: 'Attached files',       badge: true },
    { key: 'approval',   label: 'Approval',   icon: '✔',  description: 'Approval workflow'             },
];

// ── Section divider for slide-over forms (mirrors PO FormSection) ────
export const FormSection = ({ label }) => (
    <div style={{
        fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
        letterSpacing: '.07em', color: '#3a5070',
        borderBottom: '1px solid #e2e8f0', paddingBottom: 4,
        marginTop: 18, marginBottom: 10,
    }}>
        {label}
    </div>
);

// VAT rates are config-driven via the `Tax.VATRate` VLIST (admin-editable),
// consumed through useLookup().getVList('Tax','VATRate'). Do not hardcode here.

// ── Formatters ───────────────────────────────────────────────────────
export const fmt = (n, decimals = 2) =>
    n != null
        ? Number(n).toLocaleString(undefined, {
              minimumFractionDigits:  decimals,
              maximumFractionDigits:  decimals,
          })
        : '—';

export const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
        })
      : '—';

export const fmtDateTime = (d) =>
    d ? new Date(d).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
      : '—';

export const today = () => new Date().toISOString().slice(0, 10);

export const addDays = (dateStr, days) => {
    if (!dateStr || !days) return '';
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
};

// ── Status badge config ───────────────────────────────────────────────
export const statusBadgeCfg = (cfg) =>
    cfg
        ? { label: cfg.statusLabel, bg: cfg.badgeBg, color: cfg.badgeColor, dot: cfg.badgeDot }
        : { label: '—', bg: '#f1f5f9', color: '#475569', dot: '#94a3b8' };

// ── Number-to-words  (UAE / English style)  ──────────────────────────
const ONES = [
    '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
    'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
    'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty',
              'Sixty', 'Seventy', 'Eighty', 'Ninety'];

const group = (n) => {
    if (n === 0) return '';
    if (n < 20)  return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : '');
    return ONES[Math.floor(n / 100)] + ' Hundred' +
           (n % 100 ? ' ' + group(n % 100) : '');
};

export const numberToWords = (amount) => {
    if (amount == null || isNaN(amount)) return '';
    const num   = Math.abs(Math.round(Number(amount) * 100)) / 100;
    const intPt = Math.floor(num);
    const decPt = Math.round((num - intPt) * 100);

    let words = '';
    if (intPt >= 1_000_000_000)
        words += group(Math.floor(intPt / 1_000_000_000)) + ' Billion ';
    if (intPt >= 1_000_000)
        words += group(Math.floor((intPt % 1_000_000_000) / 1_000_000)) + ' Million ';
    if (intPt >= 1_000)
        words += group(Math.floor((intPt % 1_000_000) / 1_000)) + ' Thousand ';
    words += group(intPt % 1_000);
    words = words.trim() || 'Zero';

    if (decPt > 0)
        words += ' and ' + String(decPt).padStart(2, '0') + '/100';

    return words + ' Only';
};
