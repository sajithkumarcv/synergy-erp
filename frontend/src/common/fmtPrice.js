// Unit prices and unit costs are stored to 4 decimals in the database. Show them as stored (at least 2),
// so a small-item price such as 0.0125 or 1362.625 is never displayed rounded. Totals still use the 2-decimal fmt.
export const fmtPrice = (n) =>
    n != null && n !== '' ? Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '—';
