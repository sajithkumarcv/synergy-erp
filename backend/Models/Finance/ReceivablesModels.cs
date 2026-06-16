using System.Text.Json.Serialization;

namespace ERPWEB.Models.Finance
{
    // ── Dashboard KPI ─────────────────────────────────────────────────────────
    public class ReceivablesDashboardKpi
    {
        public decimal TotalReceivablesBase { get; set; }
        public decimal OverdueAmount        { get; set; }
        public int     TotalCustomers       { get; set; }
        public int     TotalInvoices        { get; set; }
    }

    public class ReceivablesAgingBuckets
    {
        public decimal CurrentAmount  { get; set; }
        public decimal Amount0_30     { get; set; }
        public decimal Amount31_60    { get; set; }
        public decimal Amount61_90    { get; set; }
        public decimal Amount90Plus   { get; set; }
    }

    public class MonthlyInvoiceReceipt
    {
        public string  MonthLabel    { get; set; } = string.Empty;
        public decimal InvoiceAmount { get; set; }
        public decimal ReceiptAmount { get; set; }
    }

    public class TopOverdueCustomer
    {
        public int     CustomerId           { get; set; }
        public string  CustomerName         { get; set; } = string.Empty;
        public decimal OverdueAmountBase    { get; set; }
        public decimal TotalOutstandingBase { get; set; }
    }

    // ── Customer Summary (paginated grid) ────────────────────────────────────
    public class CustomerReceivable
    {
        public int     CustomerId           { get; set; }
        public string  CustomerName         { get; set; } = string.Empty;
        public string? CustomerCode         { get; set; }
        public int     TotalInvoiceCount        { get; set; }
        public int     UnpaidCount              { get; set; }
        public int     PartiallyPaidCount       { get; set; }
        public decimal TotalInvoiceAmount       { get; set; }   // original currency
        public decimal TotalReceivedAmount      { get; set; }   // original currency
        public string? InvoiceCurrencyShort     { get; set; }   // single code or 'Multi'
        public decimal TotalInvoiceAmountBase   { get; set; }   // base currency
        public decimal TotalReceivedAmountBase  { get; set; }   // base currency
        public decimal TotalPendingBase         { get; set; }
        public decimal OverdueAmountBase        { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }

    // ── Invoice-level Receivable ──────────────────────────────────────────────
    public class InvoiceReceivable
    {
        public int      InvoiceId         { get; set; }
        public string   InvoiceNo         { get; set; } = string.Empty;
        public DateTime InvoiceDate       { get; set; }
        public DateTime? DueDate          { get; set; }
        public string?  CurrencyShort     { get; set; }
        public decimal  ExchangeRate      { get; set; }
        public decimal  InvoiceAmount     { get; set; }
        public decimal  InvoiceAmountBase { get; set; }
        public decimal  ReceivedAmount    { get; set; }
        public decimal  PendingAmount     { get; set; }
        public decimal  PendingAmountBase { get; set; }
        public string   PaymentStatus     { get; set; } = string.Empty;
        public string?  JobId             { get; set; }
        public int      DaysOverdue       { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }

    // ── Receipt/CN Allocation against an invoice ──────────────────────────────
    public class InvoiceReceiptAllocation
    {
        public int      AllocationId        { get; set; }
        public string   RvNumber            { get; set; } = string.Empty;
        public DateTime RvDate              { get; set; }
        public string?  RvCurrencyShort      { get; set; }
        public decimal  RvExchangeRate       { get; set; }
        public string?  InvoiceCurrencyShort { get; set; }
        public decimal  AllocatedAmount      { get; set; }
        public decimal  AllocatedAmountBase { get; set; }
        public string   SourceType          { get; set; } = "RV";
        public string?  CreatedBy           { get; set; }
        public DateTime CreatedDate         { get; set; }
    }

    // ── Customer payment summary header ──────────────────────────────────────
    public class CustomerPaymentSummary
    {
        public decimal InvoicesRaised     { get; set; }
        public decimal ReceiptsReceived   { get; set; }
        public decimal OutstandingBalance { get; set; }
        public decimal OverdueAmount      { get; set; }
    }

    // ── Receipt voucher entry in payment history ──────────────────────────────
    public class CustomerReceiptHistory
    {
        public string   RvNumber       { get; set; } = string.Empty;
        public DateTime RvDate         { get; set; }
        public string?  CurrencyShort  { get; set; }
        public decimal  ExchangeRate   { get; set; }
        public decimal  AmountReceived { get; set; }
        public decimal  AmountBase     { get; set; }
        public decimal  AllocatedAmount { get; set; }
        public decimal  AllocatedBase  { get; set; }
        public string   Status         { get; set; } = string.Empty;
        public string?  PaymentMode    { get; set; }
        public string?  CreatedBy      { get; set; }
        public DateTime CreatedDate    { get; set; }
    }

    // ── Aging per customer (paginated grid) ───────────────────────────────────
    public class CustomerAgingRow
    {
        public int     CustomerId  { get; set; }
        public string  CustomerName { get; set; } = string.Empty;
        public decimal Current     { get; set; }
        public decimal Days0_30    { get; set; }
        public decimal Days31_60   { get; set; }
        public decimal Days61_90   { get; set; }
        public decimal Days90Plus  { get; set; }
        public decimal Total       { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }
}
