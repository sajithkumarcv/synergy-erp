using System.Text.Json.Serialization;

namespace ERPWEB.Models.Procurement
{
    public class GrnHeader
    {
        // ── Primary Key ──────────────────────────────────────────
        public int    GrnId     { get; set; }
        public string GrnNumber { get; set; } = string.Empty;

        // ── Links ────────────────────────────────────────────────
        public int?    PoId       { get; set; }
        public string? PoNumber   { get; set; }
        public int?    SupplierId { get; set; }
        public string? SupplierCode { get; set; }
        public string? SupplierName { get; set; }
        public string? JobId      { get; set; }
        public string? JobTitle   { get; set; }

        // ── Dates ────────────────────────────────────────────────
        public DateTime  GrnDate      { get; set; }
        public DateTime? ReceivedDate { get; set; }

        // ── Receipt Details ──────────────────────────────────────
        public string? DoNo             { get; set; }
        public string? ReceivedBy       { get; set; }
        public string? ReceivedFrom     { get; set; }
        public string? ShipmentBy       { get; set; }
        public string? DeliveryTerms    { get; set; }
        public string? DeliveryLocation { get; set; }
        public string? ShipmentDetails  { get; set; }

        // ── Invoice ──────────────────────────────────────────────
        public string?   InvoiceNo    { get; set; }
        public DateTime? InvoiceDate  { get; set; }
        public int?      CurrencyId   { get; set; }
        public string?   CurrencyName   { get; set; }
        public string?   CurrencyShort  { get; set; }
        public string?   CurrencySymbol { get; set; }
        public decimal   ExchangeRate { get; set; } = 1;
        public decimal?  TotalAmount  { get; set; }

        // ── BOE ──────────────────────────────────────────────────
        public string?   BoeNo   { get; set; }
        public DateTime? BoeDate { get; set; }

        // ── Registration ─────────────────────────────────────────
        public bool      IsRegistered   { get; set; } = false;
        public string?   RegisteredBy   { get; set; }
        public DateTime? RegisteredDate { get; set; }

        // ── Status / Notes ───────────────────────────────────────
        public string  Status  { get; set; } = "Draft";
        public string? Remarks { get; set; }
        public bool    IsActive { get; set; } = true;

        // ── Computed from lines ───────────────────────────────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public decimal LinesSubTotal     { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public decimal LinesTotalWithTax { get; set; }

        // ── Audit ────────────────────────────────────────────────
        public string  CreatedBy  { get; set; } = string.Empty;
        public string? ModifiedBy { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // ── List metadata ─────────────────────────────────────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int LineCount   { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int DocumentCount { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows   { get; set; }
    }

    public class GrnDetail
    {
        public int    GrnDetailId  { get; set; }
        public int    GrnId        { get; set; }
        public int    LineNum      { get; set; }

        // ── Source Links ─────────────────────────────────────────
        public int?   PoLineId  { get; set; }
        public int?   PrLineId  { get; set; }

        // ── Item ─────────────────────────────────────────────────
        public int?    ItemId   { get; set; }
        public string? ItemCode { get; set; }
        public string  ItemDesc { get; set; } = string.Empty;

        // ── Quantities ───────────────────────────────────────────
        public decimal OrderedQty  { get; set; }
        public decimal ReceivedQty { get; set; }
        public decimal RejectedQty { get; set; }
        public decimal AcceptedQty { get; set; }   // computed by SP

        // ── UOM ──────────────────────────────────────────────────
        public int?    UomId   { get; set; }
        public string? UomName { get; set; }

        // ── Pricing ──────────────────────────────────────────────
        public decimal UnitPrice       { get; set; }
        public decimal TaxPct          { get; set; }
        public decimal LineTotal        { get; set; }
        public decimal LineTotalWithTax { get; set; }

        // ── Traceability ─────────────────────────────────────────
        public string?   BatchNo    { get; set; }
        public string?   SerialNo   { get; set; }
        public DateTime? ExpiryDate { get; set; }

        // ── Storage ──────────────────────────────────────────────
        public string? StorageLocation { get; set; }
        public string? BinLocation     { get; set; }

        // ── QC ───────────────────────────────────────────────────
        public string? QcStatus  { get; set; }
        public string? QcRemarks { get; set; }

        // ── Notes ────────────────────────────────────────────────
        public string? Remarks { get; set; }

        // ── Audit ────────────────────────────────────────────────
        public string  CreatedBy  { get; set; } = string.Empty;
        public string? ModifiedBy { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }
    }

    // ── Cancel Request ───────────────────────────────────────────────────────
    public class CancelGrnRequest
    {
        public string  CancelledBy { get; set; } = string.Empty;
        public string  Reason      { get; set; } = string.Empty;
        public string  Password    { get; set; } = string.Empty;
    }

    // ── QC Checklist ─────────────────────────────────────────────────────────
    public class GrnQcItem
    {
        public int     QcItemId    { get; set; }
        public string  ItemName    { get; set; } = string.Empty;
        public string? Description { get; set; }
        public bool    IsRequired  { get; set; }
        public int     SortOrder   { get; set; }
    }

    public class GrnQcItemResponse
    {
        public int     QcItemId  { get; set; }
        public string  ItemName  { get; set; } = string.Empty;
        public bool    IsChecked { get; set; }
        public string? Notes     { get; set; }
    }

    public class SaveGrnQcLogRequest
    {
        public string                  CheckedBy     { get; set; } = string.Empty;
        public string?                 Remarks       { get; set; }
        public List<GrnQcItemResponse> Items         { get; set; } = new();
        public string                  Decision      { get; set; } = string.Empty;  // Accept | ConditionalAccept | Reject
        public string?                 DecisionNotes { get; set; }
        public string?                 DecisionBy    { get; set; }
    }

    public class GrnQcLogHeader
    {
        public int      QcLogId         { get; set; }
        public int      GrnId           { get; set; }
        public string   CheckedBy       { get; set; } = string.Empty;
        public string?  CheckedByName   { get; set; }
        public DateTime CheckedDate     { get; set; }
        public string?  Remarks         { get; set; }
        public string?  Decision        { get; set; }
        public string?  DecisionNotes   { get; set; }
        public string?  DecisionBy      { get; set; }
        public string?  DecisionByName  { get; set; }
        public DateTime? DecisionDate   { get; set; }
    }

    public class GrnQcLogDetail
    {
        public int     QcDetailId { get; set; }
        public int     QcLogId    { get; set; }
        public int     QcItemId   { get; set; }
        public string  ItemName   { get; set; } = string.Empty;
        public bool    IsChecked  { get; set; }
        public string? Notes      { get; set; }
    }
}
