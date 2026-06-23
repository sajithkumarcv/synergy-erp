using System.Text.Json.Serialization;

namespace ERPWEB.Models.Procurement
{
    public class PurchaseOrder
    {
        // ── Primary Key ──────────────────────────────────────────
        public int      PoId      { get; set; }
        public string   PoNumber  { get; set; } = string.Empty;
        public DateTime PoDate    { get; set; }
        public int      Revision  { get; set; } = 0;

        // ── Links ────────────────────────────────────────────────
        public int?    SupplierId          { get; set; }
        public string? SupplierCode        { get; set; }
        public string? SupplierNameResolved{ get; set; }
        public string? SupplierAddress     { get; set; }
        public string? JobId    { get; set; }
        public string? JobTitle { get; set; }
        public int?    ExpenseCategoryId    { get; set; }
        public string? ExpenseCategoryCode  { get; set; }
        public string? ExpenseCategoryName  { get; set; }
        public bool    IsSubcontractOrder   { get; set; }
        public int?    BudgetHeaderId       { get; set; }
        public bool    IsBudgetHeaderLinked { get; set; }

        // ── Supplier Contact ─────────────────────────────────────
        public int?    SupplierContactId      { get; set; }
        public string? ContactName            { get; set; }
        public string? ContactDesignation     { get; set; }
        public string? ContactPhone           { get; set; }
        public string? ContactMobile          { get; set; }
        public string? ContactEmail           { get; set; }

        // ── Vendor (fallback text) ───────────────────────────────
        public string?   VendorName       { get; set; }
        public string?   VendorRef        { get; set; }
        public DateTime? VendorQuoteDate  { get; set; }

        // ── Financial ────────────────────────────────────────────
        public int?    CurrencyId      { get; set; }
        public string? CurrencyName    { get; set; }
        public string? CurrencyShort   { get; set; }
        public string? CurrencySymbol  { get; set; }
        public decimal ExchangeRate    { get; set; } = 1;
        public int?    PaymentTermsId  { get; set; }
        public string? PaymentTermName { get; set; }
        public decimal? Discount       { get; set; }
        public decimal? TaxAmount      { get; set; }
        public decimal? TotalAmount    { get; set; }
        public decimal? PaidAmount     { get; set; }
        public decimal? BalanceAmount  { get; set; }
        public bool    InvoiceReceived { get; set; } = false;

        // ── Delivery ─────────────────────────────────────────────
        public DateTime? DeliveryDate  { get; set; }
        public string?   DeliveryAddr  { get; set; }
        public string?   DeliveryTerms { get; set; }

        // ── Approval / Hold / Sent ────────────────────────────────
        public string?   ApprovedBy   { get; set; }
        public DateTime? ApprovedDate { get; set; }
        public DateTime? PoSentDate   { get; set; }
        public string?   HoldBy           { get; set; }
        public DateTime? HoldDate         { get; set; }
        public string?   HoldReason       { get; set; }
        public string?   StatusBeforeHold { get; set; }

        // ── Status / Priority / Notes ────────────────────────────
        public string  Status   { get; set; } = "Draft";
        public string? Priority { get; set; }
        public string? Notes    { get; set; }
        public bool    IsActive { get; set; } = true;

        // ── META (from TBL_PURCHASE_ORDER_META) ──────────────────
        public bool      IsWarranty      { get; set; }
        public bool      IsPreInspection { get; set; }
        public bool      IsShipping      { get; set; }
        public bool      IsCOO           { get; set; }
        public bool      IsDrawing       { get; set; }
        public bool      IsMTC           { get; set; }
        public bool      IsQtn           { get; set; }
        public bool      IsOthers        { get; set; }
        public bool      IsNote1         { get; set; }
        public bool      IsNote2         { get; set; }
        public bool      IsNote3         { get; set; }

        // ── Computed from lines ───────────────────────────────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public decimal LinesSubTotal    { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public decimal LinesTotalWithTax { get; set; }

        // ── Audit ────────────────────────────────────────────────
        public string  CreatedBy  { get; set; } = string.Empty;
        public string? ModifiedBy { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // ── Derived / list metadata ───────────────────────────────
        public string? LinkedPRs { get; set; }   // comma-separated PR numbers from lines

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int LineCount { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }

        /// <summary>True when at least one active line has ReceivedQty > 0.
        /// Revision is blocked in this case.</summary>
        public bool HasReceivedLines { get; set; }
    }

    public class PurchaseOrderMeta
    {
        public int     PoId            { get; set; }
        public bool    IsWarranty      { get; set; }
        public bool    IsPreInspection { get; set; }
        public bool    IsShipping      { get; set; }
        public bool    IsCOO           { get; set; }
        public bool    IsDrawing       { get; set; }
        public bool    IsMTC           { get; set; }
        public bool    IsQtn           { get; set; }
        public bool    IsOthers        { get; set; }
        public bool    IsNote1         { get; set; }
        public bool    IsNote2         { get; set; }
        public bool    IsNote3         { get; set; }
        public string? VendorQuoteDate { get; set; }
        public string? ModifiedBy     { get; set; }
    }

    public class POBudgetCheckResult
    {
        public string  CategoryName { get; set; } = string.Empty;
        public decimal Budgeted     { get; set; }
        public decimal Committed    { get; set; }
        public decimal Remaining    { get; set; }
    }

    public class PurchaseOrderLine
    {
        public int    PoLineId    { get; set; }
        public int    PoId        { get; set; }
        public int?   PrLineId    { get; set; }
        public int    LineNum     { get; set; }
        public int?   ItemId      { get; set; }
        public string? ItemCode   { get; set; }
        public string  ItemDesc   { get; set; } = string.Empty;
        public decimal OrderedQty  { get; set; }
        public decimal ReceivedQty { get; set; }
        public int?   UomId        { get; set; }
        public string? UomName     { get; set; }
        public decimal UnitPrice   { get; set; }
        public decimal TaxPct      { get; set; }
        public string? Remarks     { get; set; }
        public string  LineStatus  { get; set; } = "Open";
        public bool   IsActive     { get; set; } = true;
        public string  CreatedBy   { get; set; } = string.Empty;
        public string? ModifiedBy  { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // ── Computed / Joined ─────────────────────────────────────
        public decimal LineTotal        { get; set; }
        public decimal LineTotalWithTax { get; set; }
        public string? ItemName         { get; set; }
        public string? ItemNameAr       { get; set; }
    }

    public class AmendQtyRequest
    {
        public decimal NewQty      { get; set; }
        public string  ModifiedBy  { get; set; } = string.Empty;
    }

    public class AmendLineRequest
    {
        public decimal NewQty      { get; set; }
        public decimal NewPrice    { get; set; }
        public string  Reason      { get; set; } = string.Empty;
        public string  Password    { get; set; } = string.Empty;
        public string  ModifiedBy  { get; set; } = string.Empty;
    }

    public class RevisePoRequest
    {
        public string Reason     { get; set; } = string.Empty;
        public string Password   { get; set; } = string.Empty;
        public string RevisedBy  { get; set; } = string.Empty;
    }

    public class HoldPoRequest
    {
        public string Reason { get; set; } = string.Empty;
        public string HoldBy { get; set; } = string.Empty;
    }

    public class ReleasePoRequest
    {
        public string  ReleasedBy { get; set; } = string.Empty;
        public string? Reason     { get; set; }
    }

    public class PoTerm
    {
        public int    TermId    { get; set; }
        public string TermText  { get; set; } = string.Empty;
        public int    SortOrder { get; set; }
    }
}
