/**
 * Opens the rendered print document in a clean new browser window and triggers
 * the browser print dialog (Save as PDF).
 *
 * Key design decisions:
 *  1. Extract only SCREEN CSS — @media print blocks are intentionally skipped.
 *     The app's print rules use visibility:hidden + position:absolute tricks that
 *     only work when the full page is being printed; in an isolated window they
 *     clip content and hide everything.
 *  2. The document root element (po-print-doc / ip2-doc / po3-doc) gets its
 *     fixed A4 dimensions removed so content flows naturally across pages.
 *  3. We supply our own clean @media print block for pagination only.
 *
 * @param {string} docSelector  CSS selector for the document root element
 * @param {string} title        Title shown in the browser tab / PDF file name
 */
export const openPrintWindow = (docSelector, title) => {
    const el = document.querySelector(docSelector);
    if (!el) { window.print(); return; }

    // Collect only screen (non-print) CSS rules from all loaded stylesheets.
    // type === 4 is CSSMediaRule; we skip any whose mediaText contains 'print'.
    const screenStyles = Array.from(document.styleSheets).reduce((acc, sheet) => {
        try {
            const rules = Array.from(sheet.cssRules).filter(r => {
                if (r.type === 4) {                          // CSSMediaRule
                    return !r.media.mediaText.includes('print');
                }
                return true;
            });
            return acc + rules.map(r => r.cssText).join('\n');
        } catch {
            return acc;  // cross-origin sheet — skip safely
        }
    }, '');

    const win = window.open('', '_blank');
    if (!win) { window.print(); return; }

    win.document.write(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>
<style>
/* ── Page setup ─────────────────────────────────────────────── */
@page {
  size: A4 portrait;
  margin: 10mm 10mm 12mm;
  @bottom-right {
    content: "Page " counter(page) " of " counter(pages);
    font-size: 8pt;
    color: #94a3b8;
    font-family: 'Segoe UI', Arial, sans-serif;
  }
}

/* ── Base reset ─────────────────────────────────────────────── */
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 0;   /* all page margin comes from @page — no double margin */
  font-family: 'Segoe UI', Arial, sans-serif;
  font-size: 11px;
  color: #1e293b;
}

/* ── App screen styles (print blocks stripped out above) ──── */
${screenStyles}

/* ── Window-level overrides: remove fixed A4 box constraints ─
   The screen CSS sizes these to exactly 794×1123 px for the
   in-app preview.  In the isolated window they must be fluid. */
.po-print-doc,
.po3-doc,
.ip2-doc,
.ip3-doc {
  width: 100% !important;
  min-height: auto !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  padding: 0 !important;
}

/* ── Spacer divs that push footer to bottom of A4 on-screen ──
   In a multi-page flow they would create huge blank gaps. */
.po-print-doc > div[style*="flex: 1"],
.po3-doc      > div[style*="flex: 1"],
.ip2-doc      > div[style*="flex: 1"],
.ip2-body     > div[style*="flex: 1"],
.ip3-doc      > div[style*="flex: 1"],
.ip3-body     > div[style*="flex: 1"] {
  display: none !important;
}

/* ── Invoice sticky footer ──────────────────────────────────────
   Make the document fill the page and push the bank + signature
   cluster to the bottom, so a short invoice (only a few line items)
   doesn't leave the footer floating with blank space beneath it.
   For a multi-page invoice the free space is 0, so it flows normally.
   The small -8px guard keeps 100vh from spilling onto a blank page 2. */
.ip2-doc, .ip3-doc {
  min-height: calc(100vh - 8px) !important;
  display: flex !important;
  flex-direction: column !important;
}
.ip2-body, .ip3-body {
  flex: 1 0 auto !important;
  display: flex !important;
  flex-direction: column !important;
}
/* First element of the bottom cluster absorbs the free space above it.
   If there are no bank details, the signature footer takes over. */
.ip2-body > .print-bank-block,
.ip3-body > .print-bank-block,
.ip2-footer,
.ip3-footer { margin-top: auto; }

/* Voucher / note signatures block (inline marginTop → needs !important). */
.ip2-body > .print-signatures { margin-top: auto !important; }

/* ── Clean print rules for the isolated window ──────────────── */
@media print {
  thead                { display: table-header-group; }
  tbody tr             { break-inside: avoid; page-break-inside: avoid; }
  .po3-totals,
  .po3-notes,
  .po3-tc,
  .po3-footer,
  .pop-totals,
  .pop-notes,
  .pop-footer,
  .ip2-totals-wrap,
  .ip2-footer,
  .ip3-totals-wrap,
  .ip3-footer          { break-inside: avoid; page-break-inside: avoid; }

  /* Bank details: never slice a single bank across pages, and keep the
     "Bank Details" header attached to the first bank so it can't be
     orphaned at the foot of a page. The block itself may break BETWEEN
     banks when there are several. */
  .print-bank-group    { break-inside: avoid; page-break-inside: avoid; }
  .print-bank-group table { break-inside: avoid; page-break-inside: avoid; }
  .print-bank-header   { break-after: avoid; page-break-after: avoid; }
}
</style>
</head>
<body>${el.outerHTML}</body>
</html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 400);
};
