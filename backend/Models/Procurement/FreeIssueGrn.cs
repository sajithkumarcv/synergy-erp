using System.Text.Json.Serialization;

namespace ERPWEB.Models.Procurement
{
    // Documentation-only GRN for customer-supplied (free issue) material held in
    // our yard for a specific job. No PO / supplier / cost / stock impact.
    public class FreeIssueGrnHeader
    {
        // ── Primary Key ──────────────────────────────────────────
        public int    FreeIssueGrnId     { get; set; }
        public string FreeIssueGrnNumber { get; set; } = string.Empty;

        // ── Link ─────────────────────────────────────────────────
        public string  JobId        { get; set; } = string.Empty;
        public string? JobTitle     { get; set; }
        public int?    CustomerId   { get; set; }
        public string? CustomerName { get; set; }

        // ── Receipt ──────────────────────────────────────────────
        public DateTime ReceiptDate { get; set; } = DateTime.Today;
        public string   ReceivedBy  { get; set; } = string.Empty;
        public string   DeliveredBy { get; set; } = string.Empty;

        // ── Descriptions (typed) ─────────────────────────────────
        public string  BriefDescription    { get; set; } = string.Empty;
        public string  DetailedDescription { get; set; } = string.Empty;
        public string? Remarks             { get; set; }

        // ── Bill of Entry ────────────────────────────────────────
        public string?   BoeNo   { get; set; }
        public DateTime? BoeDate { get; set; }

        // ── Delivery note attachment ─────────────────────────────
        public string? DeliveryNoteFilePath { get; set; }

        // ── Status / Audit ───────────────────────────────────────
        public string  Status   { get; set; } = "Draft";
        public bool    IsActive  { get; set; } = true;
        public string  CreatedBy { get; set; } = string.Empty;
        public string? ModifiedBy { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        public string?   CancelledBy   { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? CancelledDate { get; set; }
        public string?   CancelReason  { get; set; }

        // ── List metadata ────────────────────────────────────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int LineCount     { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int DocumentCount { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows     { get; set; }
    }

    public class FreeIssueGrnLine
    {
        public int      FreeIssueGrnDetailId { get; set; }
        public int      FreeIssueGrnId       { get; set; }
        public int      LineNum              { get; set; }
        public string   Description          { get; set; } = string.Empty;
        public decimal? Qty                  { get; set; }
        public string?  UomName              { get; set; }
        public string?  Remarks              { get; set; }
        public string   CreatedBy            { get; set; } = string.Empty;
        public string?  ModifiedBy           { get; set; }
    }

    public class FreeIssueGrnRevision
    {
        public int      RevisionId     { get; set; }
        public int      FreeIssueGrnId { get; set; }
        public int      RevisionNo     { get; set; }
        public string   Reason         { get; set; } = string.Empty;
        public string   RevisedBy      { get; set; } = string.Empty;
        public DateTime RevisedDate    { get; set; }
    }

    public class FreeIssueGrnReviseRequest
    {
        public string RevisedBy { get; set; } = string.Empty;
        public string Reason    { get; set; } = string.Empty;
    }

    public class FreeIssueGrnStatusRequest
    {
        public int     Id        { get; set; }
        public string  Status    { get; set; } = string.Empty;
        public string? ChangedBy { get; set; }
    }

    public class FreeIssueGrnCancelRequest
    {
        public string CancelledBy { get; set; } = string.Empty;
        public string Reason      { get; set; } = string.Empty;
    }
}
