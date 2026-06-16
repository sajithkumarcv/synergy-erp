using System.Text.Json.Serialization;

namespace ERPWEB.Models.Finance
{
    // ── Worklist row (paginated grid) ─────────────────────────────────────────
    // One row per customer with an outstanding balance that needs chasing.
    public class FollowupWorklistRow
    {
        public int      CustomerId        { get; set; }
        public string   CustomerName      { get; set; } = string.Empty;
        public string?  CustomerCode      { get; set; }
        public string?  Phone             { get; set; }
        public string?  Mobile            { get; set; }
        public string?  Email             { get; set; }
        public string?  SalesPerson       { get; set; }

        public decimal  TotalPendingBase  { get; set; }
        public decimal  OverdueAmountBase { get; set; }
        public int      MaxDaysOverdue    { get; set; }
        public int      FollowupCount     { get; set; }

        // Latest contact snapshot
        public int?      LastFollowupId   { get; set; }
        public DateTime? LastContactDate  { get; set; }
        public string?   LastOutcome      { get; set; }
        public string?   LastNotes        { get; set; }
        public string?   LastContactBy    { get; set; }
        public decimal?  PromiseAmount    { get; set; }
        public DateTime? PromiseDate      { get; set; }
        public DateTime? NextFollowupDate { get; set; }
        public string?   PromiseStatus    { get; set; }

        // Derived: PromiseBroken | PromiseDue | NeverContacted | FollowupDue | Scheduled | NoActionDue
        public string    FollowupState    { get; set; } = string.Empty;
        public int       Priority         { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }

    // ── Worklist KPI summary (header cards) ───────────────────────────────────
    public class FollowupWorklistSummary
    {
        public int     ActionDueCount      { get; set; }
        public int     BrokenPromiseCount  { get; set; }
        public int     PromiseDueCount     { get; set; }
        public int     NeverContactedCount { get; set; }
        public decimal TotalOverdueBase    { get; set; }
    }

    // ── Customer header for the follow-up panel (RS1) ─────────────────────────
    public class CustomerFollowupSummary
    {
        public int     CustomerId        { get; set; }
        public string  CustomerName      { get; set; } = string.Empty;
        public string? CustomerCode      { get; set; }
        public string? Phone             { get; set; }
        public string? Mobile            { get; set; }
        public string? Email             { get; set; }
        public string? SalesPerson       { get; set; }
        public int?    CreditDays        { get; set; }
        public decimal TotalPendingBase  { get; set; }
        public decimal OverdueAmountBase { get; set; }
        public int     MaxDaysOverdue    { get; set; }
    }

    // ── Follow-up timeline entry (RS2) ────────────────────────────────────────
    public class FollowupHistoryItem
    {
        public int      FollowupId          { get; set; }
        public int      CustomerId          { get; set; }
        public DateTime ContactDate         { get; set; }
        public string?  ContactPerson       { get; set; }
        public string?  ContactMode         { get; set; }
        public string   Outcome             { get; set; } = string.Empty;
        public string?  Notes               { get; set; }
        public decimal? PromiseAmount        { get; set; }
        public DateTime? PromiseDate         { get; set; }
        public DateTime? NextFollowupDate    { get; set; }
        public string?  PromiseStatus       { get; set; }
        public decimal? OutstandingSnapshot { get; set; }
        public string?  CreatedBy           { get; set; }
        public DateTime CreatedDate         { get; set; }
        public string?  ModifiedBy          { get; set; }
        public DateTime? ModifiedDate        { get; set; }
    }

    // ── Save request ──────────────────────────────────────────────────────────
    public class SavePaymentFollowupRequest
    {
        public int       FollowupId          { get; set; }   // 0 = insert
        public int       CustomerId          { get; set; }
        public DateTime  ContactDate         { get; set; }
        public string?   ContactPerson       { get; set; }
        public string?   ContactMode         { get; set; }
        public string    Outcome             { get; set; } = string.Empty;
        public string?   Notes               { get; set; }
        public decimal?  PromiseAmount       { get; set; }
        public DateTime? PromiseDate         { get; set; }
        public DateTime? NextFollowupDate    { get; set; }
        public decimal?  OutstandingSnapshot { get; set; }
        public string    ActionBy            { get; set; } = string.Empty;
    }

    // ── Promise status change request ─────────────────────────────────────────
    public class SetPromiseStatusRequest
    {
        public int    FollowupId { get; set; }
        public string Status     { get; set; } = string.Empty;   // Kept | Broken | Open
        public string ActionBy   { get; set; } = string.Empty;
    }
}
