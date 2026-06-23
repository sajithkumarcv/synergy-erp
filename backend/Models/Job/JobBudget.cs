namespace ERPWEB.Models.Job
{
    // ── One row per cost category in the latest revision ────────
    public class JobBudgetLine
    {
        public int       CostCategoryId  { get; set; }
        public string    CategoryCode    { get; set; } = string.Empty;
        public string    CategoryName    { get; set; } = string.Empty;
        public int       SortOrder       { get; set; }
        public int?      JobBudgetId     { get; set; }
        public int       RvNo            { get; set; }
        public decimal   BudgetedAmount  { get; set; }
        public decimal?  Qty             { get; set; }
        public decimal?  UnitPrice       { get; set; }
        public int?      UomId           { get; set; }
        public string?   UomCode         { get; set; }
        public string?   UomName         { get; set; }
        public string?   Notes           { get; set; }
        public int?      CurrencyId      { get; set; }
        public string?   CurrencyShort   { get; set; }
        public decimal?  ExchangeRate    { get; set; }
        public decimal?  AmountInBaseCurrency { get; set; }
        public bool      IsApproved      { get; set; }
        public string?   CreatedBy       { get; set; }
        public DateTime? CreatedDate     { get; set; }
        public string?   ModifiedBy      { get; set; }
        public DateTime? ModifiedDate    { get; set; }
        public decimal   ActualAmount    { get; set; }
        public decimal   Variance        { get; set; }
    }

    // ── Single-row header summarising approval / version state ──
    public class JobBudgetHeader
    {
        public string    JobId          { get; set; } = string.Empty;
        public int       CurrentRvNo    { get; set; }   // the revision being shown
        public int       LatestRvNo     { get; set; }
        public bool      IsHistorical   { get; set; }   // true when viewing an older revision
        public bool      IsApproved     { get; set; }
        public string?   ApprovedBy     { get; set; }
        public DateTime? ApprovedDate   { get; set; }
        public int       TotalRevisions { get; set; }
    }

    // ── Composite GET response ──────────────────────────────────
    public class JobBudgetResponse
    {
        public JobBudgetHeader      Header { get; set; } = new();
        public List<JobBudgetLine>  Lines  { get; set; } = new();
    }

    public class SaveJobBudgetRequest
    {
        public string    JobId           { get; set; } = string.Empty;
        public int       CostCategoryId  { get; set; }
        public int       RvNo            { get; set; }
        public decimal   BudgetedAmount  { get; set; }
        public decimal?  Qty             { get; set; }
        public decimal?  UnitPrice       { get; set; }
        public int?      UomId           { get; set; }
        public string?   Notes           { get; set; }
        public int?      CurrencyId      { get; set; }
        public decimal?  ExchangeRate    { get; set; }
        public string    CreatedBy       { get; set; } = string.Empty;
        public string?   ModifiedBy      { get; set; }
    }

    // ── Approve / revise: password (plain) + audit user ─────────
    public class BudgetActionRequest
    {
        public string JobId    { get; set; } = string.Empty;
        public string Password { get; set; } = string.Empty;  // plaintext from client; hashed server-side
        public string ActedBy  { get; set; } = string.Empty;
        public string Reason   { get; set; } = string.Empty;  // mandatory — persisted to TBL_JOB_BUDGET + audit
    }

    // ── Setting the LOGGED-IN user's own budget password ─────────
    public class SetMyBudgetPasswordRequest
    {
        public string  NewPassword     { get; set; } = string.Empty;
        public string? CurrentPassword { get; set; }  // required only when one already exists
    }

    // ── Setting a per-role budget password ──────────────────────
    public class SetBudgetPasswordRequest
    {
        public int    RoleId      { get; set; }
        public string NewPassword { get; set; } = string.Empty;
        public string ChangedBy   { get; set; } = string.Empty;
    }

    // ── Returned by /jobbudget/password-roles ───────────────────
    public class RoleSecretStatusRow
    {
        public int       RoleId       { get; set; }
        public string    RoleName     { get; set; } = string.Empty;
        public string    RoleCode     { get; set; } = string.Empty;
        public bool      IsConfigured { get; set; }
        public string?   ModifiedBy   { get; set; }
        public DateTime? ModifiedDate { get; set; }
    }
}
