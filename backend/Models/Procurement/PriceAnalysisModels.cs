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
}
