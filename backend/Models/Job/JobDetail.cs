namespace ERPWEB.Models.Job
{
    // ── Job Terms ─────────────────────────────────────────────
    public class JobTerms
    {
        public string  JobId            { get; set; } = "";
        public string? JobPaymentTerms  { get; set; }
        public string? WarrantyTerms    { get; set; }
        public string? JobDeliveryTerms { get; set; }
        public string  CreatedBy        { get; set; } = "";
        public string? ModifiedBy       { get; set; }
    }

    // ── Expense Category ──────────────────────────────────────
    public class ExpenseCategory
    {
        public int     ExpenseCategoryId { get; set; }
        public string  CategoryName      { get; set; } = "";
        public string? CategoryCode      { get; set; }
        public string? Description       { get; set; }
        public bool    IsActive          { get; set; } = true;
        public int     SortOrder         { get; set; }
    }

    // ── Job Expense ───────────────────────────────────────────
    public class JobExpense
    {
        public int      ExpenseId            { get; set; }
        public string   JobId                { get; set; } = "";
        public int      ExpenseCategoryId    { get; set; }
        public string?  CategoryName         { get; set; }
        public string?  ExpenseDescription   { get; set; }
        public decimal  ExpenseAmount        { get; set; }
        public DateTime ExpenseDate          { get; set; }
        public int?     CurrencyId           { get; set; }
        public string?  CurrencyName         { get; set; }
        public decimal  ExchangeRate         { get; set; } = 1;
        public decimal? AmountInBaseCurrency { get; set; }
        public string?  ReferenceNo          { get; set; }
        public string?  Remarks              { get; set; }
        public bool     IsApproved           { get; set; }
        public string?  ApprovedBy           { get; set; }
        public DateTime? ApprovedDate        { get; set; }
        public string   CreatedBy            { get; set; } = "";
        public string?  ModifiedBy           { get; set; }
    }

    // ── Engineer ──────────────────────────────────────────────
    public class Engineer
    {
        public int     EngineerId   { get; set; }
        public string  EngineerName { get; set; } = "";
        public string? Email        { get; set; }
        public int?    TeamId       { get; set; }
        public bool    IsActive     { get; set; } = true;
        public string Designation { get; set; } = "";
    }

    // ── Job Engineer Assignment ───────────────────────────────
    public class JobEngineer
    {
        public int      JobEngineerId { get; set; }
        public string   JobId         { get; set; } = "";
        public int      EngineerId    { get; set; }
        public string?  EngineerName  { get; set; }
        public string?  Email         { get; set; }
        public string?  Role          { get; set; }
        public DateTime? AssignedDate { get; set; }
        public string?  AssignedBy    { get; set; }
        public bool     Completed     { get; set; }
        public string?  ModifiedBy    { get; set; }
    }

    // ── JobType-Stage Mapping ─────────────────────────────────
  

    // ── Job Audit Trail ───────────────────────────────────────
    public class JobAudit
    {
        public int      AuditId     { get; set; }
        public string   JobId       { get; set; } = "";
        public string   Action      { get; set; } = "";
        public string   Section     { get; set; } = "";
        public string?  OldValue    { get; set; }
        public string?  NewValue    { get; set; }
        public string?  Remarks     { get; set; }
        public string   CreatedBy   { get; set; } = "";
        public DateTime CreatedDate { get; set; }
    }
}
