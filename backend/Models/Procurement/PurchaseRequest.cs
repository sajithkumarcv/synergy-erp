using System.Text.Json.Serialization;

namespace ERPWEB.Models.Procurement
{
    public class PurchaseRequest
    {
        // ── Primary Key ──────────────────────────────────────────
        public int    PrId        { get; set; }
        public string PrNumber    { get; set; } = string.Empty;
        public DateTime PrDate   { get; set; }
        public string RequestedBy { get; set; } = string.Empty;

        // ── Link to Job ──────────────────────────────────────────
        public string? JobId    { get; set; }   // NVARCHAR job number e.g. "JOB-2025-0001"
        public string? JobTitle  { get; set; }

        // ── Details ──────────────────────────────────────────────
        public string? Priority { get; set; }
        public string  Status   { get; set; } = "Draft";
        public int     Revision { get; set; }
        public string? Notes    { get; set; }
        public bool    IsActive { get; set; } = true;

        // ── Audit ────────────────────────────────────────────────
        public string  CreatedBy   { get; set; } = string.Empty;
        public string? ModifiedBy  { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // ── Detail counts (from sp_GetPR) ─────────────────────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int LineCount      { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int PoCount        { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int DocumentCount  { get; set; }
        // True when every active PR line has been fully converted to PO (PoCreatedQty >= RequiredQty).
        // Used by the PO "Import from PR" dropdown to hide PRs that have nothing left to import.
        public bool FullyOrdered  { get; set; }

        // ── Paging metadata (from sp_SearchPRs) ──────────────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }

    public class PurchaseRequestLine
    {
        public int    PrLineId     { get; set; }
        public int    PrId         { get; set; }
        public int    LineNum       { get; set; }
        public int?   ItemId       { get; set; }
        public string? ItemCode    { get; set; }
        public string  ItemDesc    { get; set; } = string.Empty;
        public decimal  RequiredQty    { get; set; }
        public decimal? PoCreatedQty   { get; set; }
        public decimal? RemainingQty   { get; set; }
        public int?   UomId            { get; set; }
        public string? UomName     { get; set; }
        public DateTime? RequiredDate { get; set; }
        public decimal? EstUnitPrice  { get; set; }
        public string? Remarks        { get; set; }
        public int?   BomDetailId     { get; set; }
        public string  LineStatus     { get; set; } = "Open";
        public bool   IsActive        { get; set; } = true;
        public string  CreatedBy      { get; set; } = string.Empty;
        public string? ModifiedBy     { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // ── Joined ───────────────────────────────────────────────
        public string? ItemName     { get; set; }
        public string? ItemNameAr   { get; set; }
        public string? ItemTypeName { get; set; }
    }

    public class StatusChangeRequest
    {
        public int    Id        { get; set; }
        public string Status    { get; set; } = string.Empty;
        public string ChangedBy { get; set; } = string.Empty;
    }

    /// <summary>
    /// Typed projection of sp_GetPRLinesForPO — ensures camelCase JSON serialisation
    /// (dynamic/DapperRow bypasses the global naming policy).
    /// </summary>
    public class PrLineForPo
    {
        public int      PrLineId      { get; set; }
        public int      PrId          { get; set; }
        public int      LineNum       { get; set; }
        public int?     ItemId        { get; set; }
        public string?  ItemCode      { get; set; }
        public string?  ItemDesc      { get; set; }
        public decimal  RequiredQty   { get; set; }
        public decimal  PoCreatedQty  { get; set; }
        public decimal  RemainingQty  { get; set; }
        public int?     UomId         { get; set; }
        public string?  UomName       { get; set; }
        public DateTime? RequiredDate { get; set; }
        public decimal? EstUnitPrice  { get; set; }
        public string?  Remarks       { get; set; }
        public bool     AlreadyAdded  { get; set; }
    }

    public class RevisePrRequest
    {
        public string RevisedBy { get; set; } = string.Empty;
        public string Reason    { get; set; } = string.Empty;
    }
}
