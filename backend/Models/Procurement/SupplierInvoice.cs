namespace ERPWEB.Models.Procurement
{
    public class SupplierInvoiceHeader
    {
        public int     SupplierInvoiceId  { get; set; }
        public string  InvoiceNo          { get; set; } = string.Empty;
        public string? SupplierInvRef     { get; set; }
        public DateTime InvoiceDate       { get; set; } = DateTime.Today;
        public int     SupplierId         { get; set; }
        public string? SupplierName       { get; set; }
        public int     CurrencyId         { get; set; } = 2;
        public decimal ExchangeRate       { get; set; } = 1;
        public int?    PaymentTermsId     { get; set; }
        public string? PaymentTermsName   { get; set; }
        public DateTime? DueDate          { get; set; }
        public decimal SubTotal           { get; set; }
        public decimal TaxAmount          { get; set; }
        public decimal TotalAmount        { get; set; }
        // Live-computed: sum of approved PV allocations against this invoice.
        public decimal PaidAmount         { get; set; }
        // Live-computed: sum of approved Debit Note allocations against this invoice.
        public decimal DebitNoteAmount    { get; set; }
        // Live-computed: TotalAmount − PaidAmount − DebitNoteAmount.
        public decimal BalanceAmount      { get; set; }
        public string? Notes              { get; set; }
        public string  Status             { get; set; } = "Draft";
        public string? CreatedBy          { get; set; }
        public DateTime? CreatedDate      { get; set; }
        public string? ModifiedBy         { get; set; }
        public DateTime? ModifiedDate     { get; set; }
        public int TotalRows              { get; set; }
    }

    public class SupplierInvoiceLine
    {
        public int     SupplierInvLineId  { get; set; }
        public int     SupplierInvoiceId  { get; set; }
        public int     LineNum            { get; set; }
        public int?    GrnDetailId        { get; set; }
        public int?    GrnId              { get; set; }
        public string? GrnNumber          { get; set; }
        // NEW: parallel to GRN side — SI lines from a confirmed SRV
        public int?    SrvId              { get; set; }
        public int?    SrvLineId          { get; set; }
        public string? SrvNumber          { get; set; }
        public int?    PoLineId           { get; set; }
        public string? PoNumber           { get; set; }
        public int?    ItemId             { get; set; }
        public string? ItemCode           { get; set; }
        public string? ItemDesc           { get; set; }
        public string? UomName            { get; set; }
        public decimal Qty                { get; set; }
        public decimal UnitPrice          { get; set; }
        public decimal TaxPct             { get; set; }
        public decimal TaxAmount          { get; set; }
        public decimal LineTotal          { get; set; }
        public decimal LineTotalWithTax   { get; set; }
        public string? Notes              { get; set; }
    }

    // Mirrors GrnForInvoice for the service-receipt side
    public class SrvForInvoice
    {
        public int     SrvId        { get; set; }
        public string  SrvNumber    { get; set; } = string.Empty;
        public DateTime SrvDate     { get; set; }
        public string? PoNumber     { get; set; }
        public decimal? TotalAmount { get; set; }
        public string  Status       { get; set; } = string.Empty;
    }

    public class SrvLineForInvoice
    {
        public int     SrvLineId         { get; set; }
        public int     SrvId             { get; set; }
        public string? SrvNumber         { get; set; }
        public int?    PoLineId          { get; set; }
        public string? PoNumber          { get; set; }
        public int?    ItemId            { get; set; }
        public string? ItemCode          { get; set; }
        public string? ItemDesc          { get; set; }
        public string? UomName           { get; set; }
        public decimal ReceivedQty       { get; set; }
        public decimal AlreadyInvoicedQty { get; set; }
        public decimal PendingQty        { get; set; }
        public decimal UnitPrice         { get; set; }
        public decimal TaxPct            { get; set; }
    }

    public class GrnForInvoice
    {
        public int     GrnId        { get; set; }
        public string  GrnNumber    { get; set; } = string.Empty;
        public DateTime GrnDate     { get; set; }
        public string? PoNumber     { get; set; }
        public decimal? TotalAmount { get; set; }
        public string  Status       { get; set; } = string.Empty;
    }

    public class GrnLineForInvoice
    {
        public int     GrnDetailId       { get; set; }
        public int     GrnId             { get; set; }
        public string? GrnNumber         { get; set; }
        public int?    PoLineId          { get; set; }
        public string? PoNumber          { get; set; }
        public int?    ItemId            { get; set; }
        public string? ItemCode          { get; set; }
        public string? ItemDesc          { get; set; }
        public string? UomName           { get; set; }
        public decimal ReceivedQty       { get; set; }
        public decimal AlreadyInvoicedQty { get; set; }
        public decimal PendingQty        { get; set; }
        public decimal UnitPrice         { get; set; }
        public decimal TaxPct            { get; set; }
    }

    public class ChangeInvoiceStatusRequest
    {
        public int     SupplierInvoiceId { get; set; }
        public string  NewStatus         { get; set; } = string.Empty;
        public string? LoginPassword     { get; set; }
        public string? ChangedBy         { get; set; }
    }

    public class ReviseSupplierInvoiceRequest
    {
        public int    SupplierInvoiceId { get; set; }
        public string Reason            { get; set; } = string.Empty;
        public string Password          { get; set; } = string.Empty;  // plaintext; hashed server-side
        public string RevisedBy         { get; set; } = string.Empty;
    }

    public class SetRevisePasswordRequest
    {
        public int    RoleId      { get; set; }
        public string NewPassword { get; set; } = string.Empty;
        public string ChangedBy   { get; set; } = string.Empty;
    }
}
