namespace ERPWEB.Models.Procurement
{
    // ── PO price analysis — KPI summary (base currency) ───────────────────────
    public class PoPriceSummary
    {
        public decimal?  LastPrice     { get; set; }
        public DateTime? LastPriceDate { get; set; }
        public string?   LastSupplier  { get; set; }
        public decimal   WeightedAvg   { get; set; }
        public decimal   SimpleAvg     { get; set; }
        public decimal?  MinPrice      { get; set; }
        public string?   MinSupplier   { get; set; }
        public decimal?  MaxPrice      { get; set; }
        public string?   MaxSupplier   { get; set; }
        public int       OrderLines    { get; set; }
        public decimal   TotalQty      { get; set; }
        public decimal   ChangePct     { get; set; }
    }

    // ── Monthly trend point (for the chart) ───────────────────────────────────
    public class PoPriceMonthly
    {
        public string   MonthLabel  { get; set; } = string.Empty;
        public DateTime MonthStart  { get; set; }
        public decimal  AvgPrice    { get; set; }
        public decimal  WeightedAvg { get; set; }
        public decimal  MinPrice    { get; set; }
        public decimal  MaxPrice    { get; set; }
        public decimal  OrderQty    { get; set; }
        public int      OrderLines  { get; set; }
    }

    // ── One PO line (detail table) ────────────────────────────────────────────
    public class PoPriceDetail
    {
        public int      PoId          { get; set; }
        public string   PoNumber      { get; set; } = string.Empty;
        public DateTime PoDate        { get; set; }
        public string?  Status        { get; set; }   // Draft / PendingApproval / Approved / Received …
        public string?  SupplierName  { get; set; }
        public string?  UomName       { get; set; }
        public decimal  OrderedQty    { get; set; }
        public decimal  UnitPrice     { get; set; }   // original currency
        public string?  CurrencyShort { get; set; }
        public decimal  ExchangeRate  { get; set; }
        public decimal  UnitPriceBase { get; set; }
    }

    // ── Per-vendor comparison row ─────────────────────────────────────────────
    public class PoPriceVendor
    {
        public int       SupplierId    { get; set; }
        public string?   SupplierName  { get; set; }
        public int       OrderLines    { get; set; }
        public decimal   TotalQty      { get; set; }
        public decimal   WeightedAvg   { get; set; }
        public decimal   MinPrice      { get; set; }
        public decimal   MaxPrice      { get; set; }
        public DateTime? LastOrderDate { get; set; }
    }

    // ── Price Variance report — one row per item, ranked by money ─────────────
    // ExtraSpend = (PriceNow - PriceBefore) * QtyNow, and it is the sort key.
    // Percentage is shown but never ranked on: a 200% rise on a trivial item is
    // noise next to a 4% rise on the biggest line.
    public class PriceVarianceRow
    {
        public int       ItemId         { get; set; }
        public string?   ItemCode       { get; set; }
        public string?   ItemName       { get; set; }
        public string?   UomCode        { get; set; }
        public int?      UomId          { get; set; }
        public string?   BudgetCategory { get; set; }
        public decimal   QtyNow         { get; set; }
        public decimal   PriceNow       { get; set; }
        public decimal   PriceBefore    { get; set; }
        public decimal   ChangePct      { get; set; }
        public decimal   ExtraSpend     { get; set; }
        public decimal   SpendNow       { get; set; }
        public int       LinesNow       { get; set; }
        public int       SuppliersNow   { get; set; }
        public int       LinesBefore    { get; set; }
        public DateTime? LastPoDate     { get; set; }
        public DateTime? PrevPoDate     { get; set; }
    }
}
