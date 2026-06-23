using System.Text.Json.Serialization;

namespace ERPWEB.Models.Bom
{
    // ── BOM Header ────────────────────────────────────────────────
    public class BomHeader
    {
        public int       BomHeaderId      { get; set; }
        public string    JobId            { get; set; } = string.Empty;
        public string?   JobTypeId        { get; set; }
        public DateTime  BomDate          { get; set; }
        public string?   BomDescription   { get; set; }
        public int       BomVersion       { get; set; } = 1;
        public string    BomStatus        { get; set; } = "Draft";
        public decimal   TotalBomValue    { get; set; }
        public string?   BomApprovedBy    { get; set; }
        public DateTime? BomApprovedDate  { get; set; }
        public bool      IsActive         { get; set; } = true;
        public string?   CreatedBy        { get; set; }
        public DateTime? CreatedDate      { get; set; }
        public string?   ModifiedBy       { get; set; }
        public DateTime? ModifiedDate     { get; set; }

        // Joined from TBL_JOB / TBL_CUSTOMER / TBL_JOBTYPE
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public string? JobDescription { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public string? ProjectName    { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public string? CustomerName   { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public string? JobTypeName    { get; set; }

        // From the job type — drives BOM read-only (costed) vs editable (in-house).
        // NOTE: no WhenWritingDefault ignore, so `false` (in-house) is always sent.
        public bool IsCostingRequired    { get; set; } = true;
        public bool IsBudgetHeaderLinked { get; set; }

        // Pagination / aggregates
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int LineCount { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }

    // ── Reorder request ──────────────────────────────────────────
    public class ReorderBomRequest
    {
        public int                    BomHeaderId { get; set; }
        public string                 ModifiedBy  { get; set; } = string.Empty;
        public List<BomLineOrder>     Order       { get; set; } = new();
    }
    public class BomLineOrder
    {
        public int BomId     { get; set; }
        public int SortOrder { get; set; }
    }

    // ── BOM Section (master data) ─────────────────────────────────
    public class BomSection
    {
        public int     BomSectionId  { get; set; }
        public string? JobTypeId     { get; set; }
        public string  SectionCode   { get; set; } = string.Empty;
        public string  SectionName   { get; set; } = string.Empty;
        public int     SortOrder     { get; set; }
    }

    // ── BOM Detail line ───────────────────────────────────────────
    public class BomDetail
    {
        public int       BomId                { get; set; }
        public int       BomHeaderId          { get; set; }
        public string    JobId                { get; set; } = string.Empty;
        public int       BomSectionId         { get; set; }
        public string?   SectionCode          { get; set; }
        public string?   SectionName          { get; set; }
        public int       SectionSortOrder     { get; set; }
        public int       ItemId               { get; set; }
        public string?   ItemCode             { get; set; }
        public string?   ItemName             { get; set; }
        public int?      ItemDetailId         { get; set; }
        public int       SortOrder            { get; set; }
        public decimal   BomRequestedQty      { get; set; }
        public decimal   BomReceivedQty       { get; set; }
        public decimal   PrCreatedQty         { get; set; }
        public decimal   PoCreatedQty         { get; set; }
        public int       UomId                { get; set; }
        public string?   UomCode              { get; set; }
        public decimal   BomPrice             { get; set; }
        public int?      CurrencyId           { get; set; }
        public decimal   ExchangeRate         { get; set; } = 1;
        public DateTime? ItemReqDate          { get; set; }
        public DateTime? ExpectedDelivery     { get; set; }
        public string    BomStatus            { get; set; } = "Pending";
        public bool      IsCritical           { get; set; }
        public bool      IsSubstituteAllowed  { get; set; }
        public string?   Remarks              { get; set; }
        public bool      IsActive             { get; set; } = true;
        public string?   CreatedBy            { get; set; }
        public DateTime? CreatedDate          { get; set; }
        public string?   ModifiedBy           { get; set; }
        public DateTime? ModifiedDate         { get; set; }

        // Computed
        public decimal LineTotal   { get; set; }
        public decimal BalanceQty  { get; set; }
    }

    // ── Request models ────────────────────────────────────────────
    public class SaveBomHeaderRequest
    {
        public int     BomHeaderId    { get; set; }
        public string  JobId          { get; set; } = string.Empty;
        public string? JobTypeId      { get; set; }
        public string? BomDate        { get; set; }
        public string? BomDescription { get; set; }
        public int?    BomVersion     { get; set; }
        public string? CreatedBy      { get; set; }
        public string? ModifiedBy     { get; set; }
    }

    public class SaveBomDetailRequest
    {
        public int      BomId               { get; set; }
        public int      BomHeaderId         { get; set; }
        public string   JobId               { get; set; } = string.Empty;
        public int      BomSectionId        { get; set; }
        public int      ItemId              { get; set; }
        public int?     ItemDetailId        { get; set; }
        public int      SortOrder           { get; set; }
        public decimal  BomRequestedQty     { get; set; }
        public int      UomId               { get; set; }
        public decimal  BomPrice            { get; set; }
        public int?     CurrencyId          { get; set; }
        public decimal  ExchangeRate        { get; set; } = 1;
        public string?  ItemReqDate         { get; set; }
        public string?  ExpectedDelivery    { get; set; }
        public bool     IsCritical          { get; set; }
        public bool     IsSubstituteAllowed { get; set; }
        public string?  Remarks             { get; set; }
        public string?  CreatedBy           { get; set; }
        public string?  ModifiedBy          { get; set; }
    }

    public class ApproveBomRequest
    {
        public string  Action     { get; set; } = "APPROVE";
        public string? ApprovedBy { get; set; }
    }

    public class ReviseBomRequest
    {
        public string  RevisedBy    { get; set; } = "";
        public string? Reason       { get; set; }
        public string? Password     { get; set; }
    }

    public class DeleteBomRequest
    {
        public string? ModifiedBy { get; set; }
    }

    public class CopyBomRequest
    {
        public int     SourceBomHeaderId { get; set; }
        public string  TargetJobId       { get; set; } = string.Empty;
        public string? CreatedBy         { get; set; }
    }
}
