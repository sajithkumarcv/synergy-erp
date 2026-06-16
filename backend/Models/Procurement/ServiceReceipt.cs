using System.Text.Json.Serialization;

namespace ERPWEB.Models.Procurement
{
    // ── Service Receipt Header ────────────────────────────────────────────────
    public class ServiceReceipt
    {
        public int      SrvId        { get; set; }
        public string   SrvNo        { get; set; } = string.Empty;
        public DateTime SrvDate      { get; set; }
        public int?     PoId         { get; set; }
        public string?  PoNumber     { get; set; }
        public string?  JobId        { get; set; }
        public string?  SupplierName { get; set; }
        public string?  Notes        { get; set; }
        public string   Status       { get; set; } = "Draft";   // Draft | Confirmed | Cancelled
        public bool     IsActive     { get; set; } = true;
        public string   CreatedBy    { get; set; } = string.Empty;
        public string?  ModifiedBy   { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // Computed
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public decimal TotalCost  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int     LineCount  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int     TotalRows  { get; set; }
    }

    // ── Service Receipt Line ──────────────────────────────────────────────────
    public class ServiceReceiptLine
    {
        public int      SrvLineId    { get; set; }
        public int      SrvId        { get; set; }
        public int      LineNum      { get; set; }
        public int?     PoLineId     { get; set; }
        public int?     ItemId       { get; set; }
        public string?  ItemCode     { get; set; }
        public string   ItemDesc     { get; set; } = string.Empty;
        public decimal  CompletedQty { get; set; }
        public int?     UomId        { get; set; }
        public string?  UomName      { get; set; }
        public decimal  UnitCost     { get; set; }
        public decimal  TotalCost    { get; set; }
        public string?  Notes        { get; set; }
        public bool     IsActive     { get; set; } = true;
        public string   CreatedBy    { get; set; } = string.Empty;

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime CreatedDate { get; set; }
    }

    // ── PO line picker for SRV (non-stockable lines) ──────────────────────────
    public class PoLineForSrv
    {
        public int      PoLineId          { get; set; }
        public int      LineNum           { get; set; }
        public int?     ItemId            { get; set; }
        public string?  ItemCode          { get; set; }
        public string   ItemDesc          { get; set; } = string.Empty;
        public string?  ItemTypeCode      { get; set; }
        public string?  ItemTypeName      { get; set; }
        public decimal  OrderedQty        { get; set; }
        public decimal  ReceivedQty       { get; set; }
        public decimal  RemainingQty      { get; set; }
        public int?     UomId             { get; set; }
        public string?  UomName           { get; set; }
        public decimal  UnitPrice         { get; set; }
        public bool     AlreadyConfirmed  { get; set; }
    }

    // ── Save request models ───────────────────────────────────────────────────
    public class SaveServiceReceiptRequest
    {
        public int      SrvId        { get; set; }
        public DateTime? SrvDate     { get; set; }
        public int?     PoId         { get; set; }
        public string?  JobId        { get; set; }
        public string?  SupplierName { get; set; }
        public string?  Notes        { get; set; }
        public string?  CreatedBy    { get; set; }
        public string?  ModifiedBy   { get; set; }
    }

    public class SaveServiceReceiptLineRequest
    {
        public int      SrvLineId    { get; set; }
        public int      SrvId        { get; set; }
        public int      LineNum      { get; set; }
        public int?     PoLineId     { get; set; }
        public int?     ItemId       { get; set; }
        public string?  ItemCode     { get; set; }
        public string?  ItemDesc     { get; set; }
        public decimal  CompletedQty { get; set; }
        public int?     UomId        { get; set; }
        public string?  UomName      { get; set; }
        public decimal  UnitCost     { get; set; }
        public string?  Notes        { get; set; }
        public string?  CreatedBy    { get; set; }
        public string?  ModifiedBy   { get; set; }
    }
}
