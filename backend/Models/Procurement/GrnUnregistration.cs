namespace ERPWEB.Models.Procurement
{
    public class GrnUnregEligible
    {
        public int      GrnId        { get; set; }
        public string   GrnNumber    { get; set; } = string.Empty;
        public DateTime GrnDate      { get; set; }
        public int      PoId         { get; set; }
        public string?  PoNumber     { get; set; }
        public int?     SupplierId   { get; set; }
        public string?  SupplierName { get; set; }
        public decimal? TotalAmount  { get; set; }
        public string   CreatedBy    { get; set; } = string.Empty;
        public DateTime CreatedDate  { get; set; }
    }

    public class GrnUnregPreviewHeader
    {
        public int      GrnId            { get; set; }
        public string   GrnNumber        { get; set; } = string.Empty;
        public DateTime GrnDate          { get; set; }
        public int      PoId             { get; set; }
        public string?  PoNumber         { get; set; }
        public int?     SupplierId       { get; set; }
        public string?  SupplierName     { get; set; }
        public string   Status           { get; set; } = string.Empty;
        public decimal? TotalAmount      { get; set; }
        public string?  InvoiceNo        { get; set; }
        public bool     AlreadyCancelled  { get; set; }
        public bool     HasInvoice        { get; set; }
        public bool     WouldGoNegative   { get; set; }
        public bool     HasPostGrnIssues  { get; set; }
        public string?  PoStatusAfter     { get; set; }
    }

    public class GrnUnregPreviewLine
    {
        public int      GrnDetailId    { get; set; }
        public int      LineNum        { get; set; }
        public string?  ItemCode       { get; set; }
        public string?  ItemDesc       { get; set; }
        public decimal  OrderedQty     { get; set; }
        public decimal  ReceivedQty    { get; set; }
        public decimal  RejectedQty    { get; set; }
        public decimal  AcceptedQty    { get; set; }
        public string?  UomName        { get; set; }
        public decimal  UnitPrice      { get; set; }
        public decimal? LineTotal      { get; set; }
        public int?     PoLineId       { get; set; }
        public decimal  CurrentStock   { get; set; }
        public bool     WouldGoNegative { get; set; }
        public string?  FirstPostIssue  { get; set; }
    }

    public class GrnUnregRequest
    {
        public int    GrnId        { get; set; }
        public string CancelledBy  { get; set; } = string.Empty;
        public string CancelReason { get; set; } = string.Empty;
    }
}
