namespace ERPWEB.Models.Job
{
    public class Job
    {
        public int      JobNumId        { get; set; }   // numeric surrogate key for approval workflow
        public string?  JobId           { get; set; }
        public string?  ParentJobId     { get; set; }
        public string   ApprovalStatus  { get; set; } = "Draft";
        public string   JobTypeId       { get; set; } = "";
        public string?  JobTypeName     { get; set; }
        public string   JobStageId      { get; set; } = "";
        public string?  JobStageName    { get; set; }
        public int      CustomerId      { get; set; }
        public string?  CustomerName    { get; set; }
        public string?  CustomerCode    { get; set; }
        public int      JobCurrencyId   { get; set; }
        public string?  CurrencyName    { get; set; }
        public string?  CurrencySymbol  { get; set; }
        public decimal  JobExcRate      { get; set; } = 1;
        public string?  JobDescription  { get; set; }
        public DateTime JobDate         { get; set; }
        public string?  ProjectName     { get; set; }
        public DateTime? LpoDate        { get; set; }
        public string?  ContractRef     { get; set; }
        public string?  LpoRef          { get; set; }
        public int      JobStatusId     { get; set; } = 1;
        public string?  JobStatusName   { get; set; }
        public bool     IsClosedStatus  { get; set; }
        public string?  ExternalRef     { get; set; }
        public string?  JobCreatedBy    { get; set; }
        public string?  JobLastModifiedBy { get; set; }

        // Finance (from TBL_JOB_FINANCE + VW_JOB_COST_ACTUAL)
        public decimal  OrderValue        { get; set; }
        public decimal  TotalActual       { get; set; }   // live from VW_JOB_COST_ACTUAL
        public decimal  TotalExpenses     { get; set; }   // legacy stored column — use TotalActual instead
        public decimal  TotalInvoicing    { get; set; }
        public decimal  TotalPayments     { get; set; }
        public decimal  TotalCredit       { get; set; }   // credit notes applied (reduces outstanding)
        public decimal  BalanceAmount     { get; set; }   // OrderValue*Rate - Payments - Credits (base)
        public decimal  JobAdvanceAmount  { get; set; }

        // Dates (from TBL_JOB_DATES)
        public DateTime? JobExpectedCompleteDate { get; set; }
        public DateTime? JobActualCompleteDate   { get; set; }
        public DateTime? JobExpectedDeliveryDate { get; set; }
        public DateTime? JobActualDeliveryDate   { get; set; }
        public DateTime? JobPlannedStartDate     { get; set; }

        // Immutable lifecycle audit (set once by sp_ChangeJobStatus)
        public DateTime? CompletedDate   { get; set; }
        public string?   CompletedReason { get; set; }
        public string?   CompletedBy     { get; set; }
        public DateTime? CancelledDate   { get; set; }
        public string?   CancelledReason { get; set; }
        public string?   CancelledBy     { get; set; }

        

        // Pagination
        public int TotalRows { get; set; }
    }

    public class JobMeta
    {
        public string?   JobId              { get; set; }
        public int       BayId              { get; set; }
        public string?   BayName            { get; set; }
        public int       JobCategoryId      { get; set; }
        public string?   JobCategoryName    { get; set; }
        public int       QualityLevelId     { get; set; }
        public string?   QualityLevelName   { get; set; }
        public string?   QualityDescription { get; set; }
        public decimal   TotalUnits         { get; set; }
        public string?   CreatedBy          { get; set; }
        public DateTime? CreatedDate        { get; set; }
        public string?   ModifiedBy         { get; set; }
        public DateTime? ModifiedDate       { get; set; }
    }

    public class JobBay
    {
        public int    BayId     { get; set; }
        public string BayName   { get; set; } = "";
        public int    SortOrder { get; set; }
    }

    public class JobCategory
    {
        public int    JobCategoryId   { get; set; }
        public string JobCategoryName { get; set; } = "";
        public int    SortOrder       { get; set; }
    }

    public class JobQualityLevel
    {
        public int     QualityLevelId   { get; set; }
        public string  QualityLevelName { get; set; } = "";
        public string? Description      { get; set; }
        public int?    SortOrder        { get; set; }
    }
}
