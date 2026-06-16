namespace ERPWEB.Models.Manhour
{
    // ── Batch summary (one row per BatchId) ──────────────────────────────────
    // A batch = one date's worth of manhour entries across multiple jobs
    public class ManhourBatch
    {
        public int       BatchId          { get; set; }
        public string    DocumentNo       { get; set; } = string.Empty;
        public DateTime  DocumentDate     { get; set; }
        public string    Status           { get; set; } = "Draft";
        public int       JobCount         { get; set; }   // distinct jobs in this batch
        public decimal   TotalHours       { get; set; }
        public decimal   TotalOTHours     { get; set; }
        public int       TotalEmployees   { get; set; }
        public string?   Remarks          { get; set; }
        public string?   UploadedFileName { get; set; }
        public string    CreatedBy        { get; set; } = string.Empty;
        public DateTime  CreatedDate      { get; set; }
        public string?   ModifiedBy       { get; set; }
        public DateTime? ModifiedDate     { get; set; }

        // Badge / permission fields
        public string?  BadgeBg    { get; set; }
        public string?  BadgeColor { get; set; }
        public string?  BadgeDot   { get; set; }
        public bool     CanEdit    { get; set; }
        public bool     CanDelete  { get; set; }
        public bool     CanPrint   { get; set; }

        // Pagination helper
        public int TotalRows { get; set; }
    }

    // ── Individual flat row ───────────────────────────────────────────────────
    public class ManhourRow
    {
        public int       ManhourId      { get; set; }
        public int       BatchId        { get; set; }
        public string    JobId          { get; set; } = string.Empty;
        public string?   JobDescription { get; set; }
        public int       EmployeeId     { get; set; }
        public string?   EmpCode        { get; set; }
        public string?   EmployeeName   { get; set; }
        public decimal   Hours          { get; set; }
        public decimal   OvertimeHours  { get; set; }
        public string?   Site           { get; set; }
        public string?   MType          { get; set; }
        public string?   Remarks        { get; set; }
    }

    // ── Save request ──────────────────────────────────────────────────────────
    public class SaveManhourRequest
    {
        public int?     BatchId          { get; set; }   // null = new batch
        public DateTime DocumentDate     { get; set; }
        public string?  Remarks          { get; set; }
        public string?  UploadedFileName { get; set; }
        public string   SavedBy          { get; set; } = string.Empty;
        public List<ManhourLineInput> Lines { get; set; } = new();
    }

    // Each line carries its own JobId and EmployeeId (from the Excel row)
    public class ManhourLineInput
    {
        public string   JobId         { get; set; } = string.Empty;
        public int      EmployeeId    { get; set; }
        public decimal  Hours         { get; set; }
        public decimal  OvertimeHours { get; set; }
        public string?  Site          { get; set; }
        public string?  MType         { get; set; }
        public string?  Remarks       { get; set; }
    }

    // ── Admin line search result ──────────────────────────────────────────────
    public class AdminManhourLineResult
    {
        public int      ManhourId      { get; set; }
        public int      BatchId        { get; set; }
        public string   DocumentNo     { get; set; } = string.Empty;
        public DateTime DocumentDate   { get; set; }
        public string   JobId          { get; set; } = string.Empty;
        public string?  JobDescription { get; set; }
        public int      EmployeeId     { get; set; }
        public string?  EmpCode        { get; set; }
        public string?  EmployeeName   { get; set; }
        public string?  EmpType        { get; set; }
        public decimal  Hours          { get; set; }
        public decimal  OvertimeHours  { get; set; }
        public string?  Site           { get; set; }
        public string?  MType          { get; set; }
        public string   Status         { get; set; } = string.Empty;
        public decimal? NHRate         { get; set; }
        public decimal? OTRate         { get; set; }
        public string?  Remarks        { get; set; }
        public string?  CreatedBy      { get; set; }
        public DateTime CreatedDate    { get; set; }
        public string?  ModifiedBy     { get; set; }
        public DateTime? ModifiedDate  { get; set; }

        [System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }

    // ── Admin line update request ─────────────────────────────────────────────
    public class AdminManhourLineUpdate
    {
        public string   JobId         { get; set; } = string.Empty;
        public int      EmployeeId    { get; set; }
        public decimal  Hours         { get; set; }
        public decimal  OvertimeHours { get; set; }
        public string?  Site          { get; set; }
        public string?  MType         { get; set; }
        public string?  Remarks       { get; set; }
    }

    // ── Employee lookup ───────────────────────────────────────────────────────
    public class EmployeeLookup
    {
        public int     EmployeeId   { get; set; }
        public string  EmpCode      { get; set; } = string.Empty;
        public string  EmployeeName { get; set; } = string.Empty;
    }
}
