using System.Text.Json.Serialization;

namespace ERPWEB.Models.Inventory
{
    /// <summary>
    /// Issue Request (ISR) header — the approved request that sits in front of an
    /// Issue Note, in the same shape as PR → PO. Design: backend/Docs/DESIGN-issue-request.md
    /// </summary>
    public class IssueRequest
    {
        public int       RequestId    { get; set; }
        public string    RequestNo    { get; set; } = string.Empty;
        public DateTime  RequestDate  { get; set; }
        public string    JobId        { get; set; } = string.Empty;
        public int       IssueTypeId  { get; set; }
        public DateTime? RequiredDate { get; set; }
        public string    RequestedBy  { get; set; } = string.Empty;
        public string?   Department   { get; set; }
        public string?   RequestedFor { get; set; }
        public string    Status       { get; set; } = "Draft";
        public string?   Priority     { get; set; }
        public string?   Notes        { get; set; }

        /// <summary>Stamped on approval by step 4's sp_PostIssueRequestApproval; null until then.</summary>
        public DateTime? ReservationExpiryDate { get; set; }

        public string    CreatedBy    { get; set; } = string.Empty;

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        public string?   ModifiedBy   { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // Joined from TBL_JOB / TBL_CUSTOMER / TBL_ISSUE_TYPE
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public string? JobDescription { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int?    CustomerId     { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public string? CustomerName   { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public string? IssueTypeCode  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public string? IssueTypeName  { get; set; }

        // Computed by sp_SearchIssueRequests
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int     LineCount         { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public decimal TotalRequestedQty { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public decimal TotalIssuedQty    { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int     TotalRows         { get; set; }
    }

    public class IssueRequestLine
    {
        public int       RequestLineId { get; set; }
        public int       RequestId     { get; set; }
        public int       LineNum       { get; set; }
        public int       ItemId        { get; set; }
        public string?   ItemCode      { get; set; }
        public string?   ItemName      { get; set; }
        /// <summary>Set when the line came from a BOM line; null for a hand-typed line.</summary>
        public int?      BomId         { get; set; }
        public decimal   RequestedQty  { get; set; }
        /// <summary>Written back by the issue note in step 3 — never typed by a user.</summary>
        public decimal   IssuedQty     { get; set; }
        /// <summary>Held by this line once step 4's reservation exists.</summary>
        public decimal   ReservedQty   { get; set; }
        /// <summary>RequestedQty - IssuedQty, computed by the proc and never stored.</summary>
        public decimal   BalanceQty    { get; set; }
        public int?      UomId         { get; set; }
        public string?   UomName       { get; set; }
        public DateTime? RequiredDate  { get; set; }
        public string    LineStatus    { get; set; } = "Pending";
        public string?   Notes         { get; set; }

        public string    CreatedBy     { get; set; } = string.Empty;
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate   { get; set; }
        public string?   ModifiedBy    { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate  { get; set; }
    }

    /// <summary>
    /// One BOM line still open for the "pull from BOM" picker — the gross-to-net
    /// view of a requirement: what was planned, what is already committed to a PR,
    /// what is left, and what the store could actually give right now.
    /// </summary>
    public class BomLineForIssueRequest
    {
        public int       BomId           { get; set; }
        public int       BomHeaderId     { get; set; }
        public int       BomVersion      { get; set; }
        public string?   JobId           { get; set; }
        public int       LineNum         { get; set; }
        public int       ItemId          { get; set; }
        public string?   ItemCode        { get; set; }
        public string?   ItemName        { get; set; }
        public decimal   BomRequestedQty { get; set; }
        public decimal   PrCreatedQty    { get; set; }
        public decimal   PoCreatedQty    { get; set; }
        public decimal   IsrCreatedQty   { get; set; }
        /// <summary>BomRequestedQty - PrCreatedQty - IsrCreatedQty.</summary>
        public decimal   OpenQty         { get; set; }
        public int?      UomId           { get; set; }
        public string?   UomName         { get; set; }
        /// <summary>Store stock net of everyone's reservations.</summary>
        public decimal   AvailableQty    { get; set; }
        public decimal   OnHandQty       { get; set; }
        public DateTime? ItemReqDate     { get; set; }
        public string?   BomStatus       { get; set; }
        public string?   Remarks         { get; set; }
    }

    // ── Request bodies ────────────────────────────────────────────

    public class SaveIssueRequestRequest
    {
        /// <summary>0 creates; any other value updates that request.</summary>
        public int       RequestId    { get; set; }
        public string    JobId        { get; set; } = string.Empty;
        public int       IssueTypeId  { get; set; }
        public DateTime? RequestDate  { get; set; }
        public DateTime? RequiredDate { get; set; }
        public string    RequestedBy  { get; set; } = string.Empty;
        public string?   Department   { get; set; }
        public string?   RequestedFor { get; set; }
        public string?   Priority     { get; set; }
        public string?   Notes        { get; set; }
        public string?   CreatedBy    { get; set; }
        public string?   ModifiedBy   { get; set; }
    }

    public class CloseIssueRequestRequest
    {
        public string? ModifiedBy { get; set; }
        /// <summary>Why the remaining balance is being written off; appended to Notes.</summary>
        public string? Reason     { get; set; }
    }

    public class SaveIssueRequestLineRequest
    {
        /// <summary>0 creates; any other value updates that line.</summary>
        public int       RequestLineId { get; set; }
        public int       RequestId     { get; set; }
        public int       ItemId        { get; set; }
        public decimal   RequestedQty  { get; set; }
        public int?      UomId         { get; set; }
        public int?      BomId         { get; set; }
        public DateTime? RequiredDate  { get; set; }
        public string?   Notes         { get; set; }
        public string?   CreatedBy     { get; set; }
        public string?   ModifiedBy    { get; set; }
    }
}
