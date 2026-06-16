using System.Text.Json.Serialization;

namespace ERPWEB.Models.Finance
{
    // ── Dashboard KPI ─────────────────────────────────────────────────────────
    public class PayablesDashboardKpi
    {
        public decimal TotalPayablesBase { get; set; }
        public decimal OverdueAmount     { get; set; }
        public int     TotalSuppliers    { get; set; }
        public int     TotalInvoices     { get; set; }
    }

    public class PayablesAgingBuckets
    {
        public decimal CurrentAmount { get; set; }
        public decimal Amount0_30    { get; set; }
        public decimal Amount31_60   { get; set; }
        public decimal Amount61_90   { get; set; }
        public decimal Amount90Plus  { get; set; }
    }

    public class MonthlyInvoicePayment
    {
        public string  MonthLabel     { get; set; } = string.Empty;
        public decimal InvoiceAmount  { get; set; }
        public decimal PaymentAmount  { get; set; }
    }

    public class TopOverdueSupplier
    {
        public int     SupplierId           { get; set; }
        public string  SupplierName         { get; set; } = string.Empty;
        public decimal OverdueAmountBase    { get; set; }
        public decimal TotalOutstandingBase { get; set; }
    }

    // ── Supplier Summary (paginated grid) ────────────────────────────────────
    public class SupplierPayable
    {
        public int     SupplierId               { get; set; }
        public string  SupplierName             { get; set; } = string.Empty;
        public string? SupplierCode             { get; set; }
        public int     TotalInvoiceCount        { get; set; }
        public int     UnpaidCount              { get; set; }
        public int     PartiallyPaidCount       { get; set; }
        public decimal TotalInvoiceAmount       { get; set; }   // original currency
        public decimal TotalPaidAmount          { get; set; }   // original currency
        public string? InvoiceCurrencyShort     { get; set; }   // single code or 'Multi'
        public decimal TotalInvoiceAmountBase   { get; set; }   // base currency
        public decimal TotalPaidAmountBase      { get; set; }   // base currency
        public decimal TotalPendingBase         { get; set; }
        public decimal OverdueAmountBase        { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }

    // ── Invoice-level Payable ─────────────────────────────────────────────────
    public class InvoicePayable
    {
        public int      SupplierInvoiceId  { get; set; }
        public string   InvoiceNo          { get; set; } = string.Empty;
        public string?  SupplierInvRef     { get; set; }
        public DateTime InvoiceDate        { get; set; }
        public DateTime? DueDate           { get; set; }
        public string?  CurrencyShort      { get; set; }
        public decimal  ExchangeRate       { get; set; }
        public decimal  InvoiceAmount      { get; set; }
        public decimal  InvoiceAmountBase  { get; set; }
        public decimal  PaidAmount         { get; set; }
        public decimal  PendingAmount      { get; set; }
        public decimal  PendingAmountBase  { get; set; }
        public string   PaymentStatus      { get; set; } = string.Empty;
        public int      DaysOverdue        { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }

    // ── PV Allocation against a supplier invoice ──────────────────────────────
    public class InvoicePvAllocation
    {
        public int      AllocationId        { get; set; }
        public string   PvNumber            { get; set; } = string.Empty;
        public DateTime PvDate              { get; set; }
        public string?  PvCurrencyShort      { get; set; }
        public decimal  PvExchangeRate       { get; set; }
        public string?  InvoiceCurrencyShort { get; set; }
        public decimal  AllocatedAmount      { get; set; }
        public decimal  AllocatedAmountBase  { get; set; }
        public string   SourceType           { get; set; } = "PV";
        public string?  PaymentMode          { get; set; }
        public string?  CreatedBy            { get; set; }
        public DateTime CreatedDate          { get; set; }
    }

    // ── Supplier payment summary header ──────────────────────────────────────
    public class SupplierPaymentSummary
    {
        public decimal InvoicesRaised     { get; set; }
        public decimal PaymentsMade       { get; set; }
        public decimal OutstandingBalance { get; set; }
        public decimal OverdueAmount      { get; set; }
    }

    // ── PV entry in payment history ───────────────────────────────────────────
    public class SupplierPaymentHistory
    {
        public string   PvNumber        { get; set; } = string.Empty;
        public DateTime PvDate          { get; set; }
        public string?  CurrencyShort   { get; set; }
        public decimal  ExchangeRate    { get; set; }
        public decimal  AmountPaid      { get; set; }
        public decimal  AmountBase      { get; set; }
        public decimal  AllocatedAmount { get; set; }
        public decimal  AllocatedBase   { get; set; }
        public string   Status          { get; set; } = string.Empty;
        public string?  PaymentMode     { get; set; }
        public string?  CreatedBy       { get; set; }
        public DateTime CreatedDate     { get; set; }
    }

    // ── Aging per supplier (paginated grid) ───────────────────────────────────
    public class SupplierAgingRow
    {
        public int     SupplierId   { get; set; }
        public string  SupplierName { get; set; } = string.Empty;
        public decimal Current      { get; set; }
        public decimal Days0_30     { get; set; }
        public decimal Days31_60    { get; set; }
        public decimal Days61_90    { get; set; }
        public decimal Days90Plus   { get; set; }
        public decimal Total        { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }
}
