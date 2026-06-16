using System.Text.Json.Serialization;

namespace ERPWEB.Models.Approval
{
    // ── Reference / config models ────────────────────────────────────────
    public class ApprovalModule
    {
        public int     ModuleId        { get; set; }
        public string  ModuleCode      { get; set; } = string.Empty;
        public string  ModuleName      { get; set; } = string.Empty;
        public string? Description     { get; set; }
        public bool    IsAmountBased   { get; set; }
        public bool    IsActive        { get; set; }
    }

    public class ApprovalPolicy
    {
        public int      PolicyId     { get; set; }
        public int      ModuleId     { get; set; }
        public string   ModuleCode   { get; set; } = string.Empty;
        public string   ModuleName   { get; set; } = string.Empty;
        public string   PolicyName   { get; set; } = string.Empty;
        public string?  Description  { get; set; }
        public decimal? AmountFrom   { get; set; }
        public decimal? AmountTo     { get; set; }
        public int      TotalLevels  { get; set; }
        public bool     IsSequential { get; set; }
        public bool     IsActive     { get; set; }
        public int      SortOrder    { get; set; }
        public string   CreatedBy    { get; set; } = string.Empty;
        public DateTime CreatedDate  { get; set; }
    }

    public class ApprovalLevel
    {
        public int     LevelId          { get; set; }
        public int     PolicyId         { get; set; }
        public int     LevelNo          { get; set; }
        public string? LevelName        { get; set; }
        public string  ApproverType     { get; set; } = string.Empty;   // ANY | ROLE | USER
        public int?    ApproverId       { get; set; }                   // null for ANY
        public string? ApproverName     { get; set; }
        public bool    IsMandatory      { get; set; }
        public bool    AllowSelfApproval{ get; set; }
        public int?    TimeoutHours     { get; set; }
        public string? OnTimeoutAction  { get; set; }
        public bool    IsActive         { get; set; }
    }

    // ── Transaction / runtime models ─────────────────────────────────────
    public class ApprovalTransaction
    {
        public int      TransactionId  { get; set; }
        public string   ModuleCode     { get; set; } = string.Empty;
        public string   ModuleName     { get; set; } = string.Empty;
        public int      DocumentId     { get; set; }
        public string   DocumentNo     { get; set; } = string.Empty;
        public decimal? DocumentAmount { get; set; }
        public int      PolicyId       { get; set; }
        public string   PolicyName     { get; set; } = string.Empty;
        public string   CurrentStatus  { get; set; } = string.Empty;
        public int      CurrentLevelNo { get; set; }
        public int      TotalLevels    { get; set; }
        public string   SubmittedBy    { get; set; } = string.Empty;
        public DateTime SubmittedDate  { get; set; }
        public DateTime? CompletedDate { get; set; }
        public string?  FinalAction    { get; set; }
        public string?  FinalActionBy  { get; set; }
        public string?  FinalRemarks   { get; set; }
        // Current level info (joined)
        public int?    LevelId         { get; set; }
        public string? LevelName       { get; set; }
        public string? ApproverType    { get; set; }
        public int?    ApproverId      { get; set; }
        public string? ApproverName    { get; set; }
        public string? ApproverUsers   { get; set; }
        // Next level info
        public int?    NextLevelNo     { get; set; }
        public string? NextLevelName   { get; set; }
        public string? NextApproverName  { get; set; }
        public string? NextApproverUsers { get; set; }
        // Role-based permission flags (computed by SP per calling user)
        public bool    CanAct          { get; set; }
        public bool    CanCancel       { get; set; }
    }

    public class ApprovalLog
    {
        public long     LogId              { get; set; }
        public int      LevelNo            { get; set; }
        public string?  LevelName          { get; set; }
        public string   Action             { get; set; } = string.Empty;
        public int      ActionBy           { get; set; }
        public string?  ActionByName       { get; set; }
        public DateTime ActionDate         { get; set; }
        public string?  Remarks            { get; set; }
        public bool     IsDelegated        { get; set; }
        public string?  DelegatedFromName  { get; set; }
        public bool     IsTimedOut         { get; set; }
    }

    public class MyApprovalItem
    {
        public int      TransactionId  { get; set; }
        public string   ModuleCode     { get; set; } = string.Empty;
        public string   ModuleName     { get; set; } = string.Empty;
        public int      DocumentId     { get; set; }
        public string   DocumentNo     { get; set; } = string.Empty;
        public decimal? DocumentAmount { get; set; }
        public int      CurrentLevelNo { get; set; }
        public int      TotalLevels    { get; set; }
        public string?  LevelName      { get; set; }
        public string   SubmittedBy      { get; set; } = string.Empty;
        public DateTime SubmittedDate    { get; set; }
        public string?  ApproverUsers    { get; set; }
        public int?     NextLevelNo      { get; set; }
        public string?  NextLevelName    { get; set; }
        public string?  NextApproverUsers { get; set; }
        public bool     CanAct           { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int      TotalRows        { get; set; }
    }

    // ── Request models ───────────────────────────────────────────────────
    public class SubmitForApprovalRequest
    {
        public string   ModuleCode     { get; set; } = string.Empty;
        public int      DocumentId     { get; set; }
        public string   DocumentNo     { get; set; } = string.Empty;
        public decimal? DocumentAmount { get; set; }
        public int?     CurrencyId     { get; set; }
        public string   SubmittedBy    { get; set; } = string.Empty;

        // Budget-overrun override (optional) — submitter auto-approving past budget.
        public string? BudgetPassword { get; set; }
        public string? OverrideReason { get; set; }
    }

    public class ProcessApprovalRequest
    {
        public int    TransactionId { get; set; }
        public string Action        { get; set; } = string.Empty;  // Approve|Reject|SendBack|Cancel
        public int    ActionBy      { get; set; }
        public string ActionByName  { get; set; } = string.Empty;
        public string? Remarks      { get; set; }

        // ── Budget-overrun override (optional) ──
        // When the user supplies their budget password to authorise approving a
        // document that exceeds its budget, these are sent. The password is
        // validated server-side via sp_ValidateBudgetPassword; only on success
        // is @OverrideBudget = 1 passed to sp_ProcessApproval.
        public string? BudgetPassword { get; set; }
        public string? OverrideReason { get; set; }
    }

    public class SavePolicyRequest
    {
        public int      PolicyId     { get; set; }   // 0 = new
        public string   ModuleCode   { get; set; } = string.Empty;
        public string   PolicyName   { get; set; } = string.Empty;
        public string?  Description  { get; set; }
        public decimal? AmountFrom   { get; set; }
        public decimal? AmountTo     { get; set; }
        public bool     IsSequential { get; set; } = true;
        public bool     IsActive     { get; set; } = true;
        public int      SortOrder    { get; set; }
        public string   SavedBy      { get; set; } = string.Empty;
        public List<SaveLevelRequest> Levels { get; set; } = new();
    }

    public class SaveLevelRequest
    {
        public int     LevelNo          { get; set; }
        public string? LevelName        { get; set; }
        public string  ApproverType     { get; set; } = string.Empty;   // ANY | ROLE | USER
        public int?    ApproverId       { get; set; }                   // null for ANY
        public bool    IsMandatory      { get; set; } = true;
        public bool    AllowSelfApproval{ get; set; }
        public int?    TimeoutHours     { get; set; }
        public string? OnTimeoutAction  { get; set; }
    }

    // ── Delegation models ────────────────────────────────────────────────
    public class ApprovalDelegate
    {
        public int      DelegateId        { get; set; }
        public int      LevelId           { get; set; }
        public int      LevelNo           { get; set; }
        public string?  LevelName         { get; set; }
        public string?  ApproverType      { get; set; }
        public int      PolicyId          { get; set; }
        public string   PolicyName        { get; set; } = string.Empty;
        public string   ModuleCode        { get; set; } = string.Empty;
        public string   ModuleName        { get; set; } = string.Empty;
        public int      OriginalUserId    { get; set; }
        public string   OriginalUserName  { get; set; } = string.Empty;
        public int      DelegateUserId    { get; set; }
        public string   DelegateUserName  { get; set; } = string.Empty;
        public DateTime FromDate          { get; set; }
        public DateTime ToDate            { get; set; }
        public string?  Reason            { get; set; }
        public bool     IsActive          { get; set; }
        public bool     IsCurrentlyActive { get; set; }
        public string   CreatedBy         { get; set; } = string.Empty;
        public DateTime CreatedDate       { get; set; }
        public string?  ModifiedBy        { get; set; }
        public DateTime? ModifiedDate     { get; set; }
    }

    public class SaveDelegateRequest
    {
        public int     DelegateId      { get; set; }   // 0 = new
        public int     LevelId         { get; set; }
        public int     OriginalUserId  { get; set; }
        public int     DelegateUserId  { get; set; }
        public string  FromDate        { get; set; } = string.Empty;
        public string  ToDate          { get; set; } = string.Empty;
        public string? Reason          { get; set; }
        public bool    IsActive        { get; set; } = true;
        public string  SavedBy         { get; set; } = string.Empty;
    }

    // ── Response wrappers ────────────────────────────────────────────────
    public class ApprovalStatusResponse
    {
        public ApprovalTransaction? Transaction { get; set; }
        public List<ApprovalLog>    Log         { get; set; } = new();
    }

    public class ApprovalHistoryResponse
    {
        public ApprovalTransaction?  Transaction { get; set; }
        public List<ApprovalLevel>   Levels      { get; set; } = new();
        public List<ApprovalLog>     Log         { get; set; } = new();
    }

    public class PoliciesResponse
    {
        public List<ApprovalPolicy> Policies { get; set; } = new();
        public List<ApprovalLevel>  Levels   { get; set; } = new();
    }
}
