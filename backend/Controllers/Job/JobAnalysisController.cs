using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Job
{
    // ── Models ────────────────────────────────────────────────────
    public class JobAnalysisSummary
    {
        public int     TotalJobs          { get; set; }
        public decimal TotalOrderValue    { get; set; }
        public decimal TotalInvoiced      { get; set; }
        public decimal TotalReceived      { get; set; }
        public decimal TotalReceivable    { get; set; }
        public decimal TotalActualCost    { get; set; }
        public decimal TotalBudget        { get; set; }
        public decimal TotalGrossProfit   { get; set; }
        public decimal TotalBudgetVariance{ get; set; }
        public decimal AvgMarginPct       { get; set; }
    }

    public class JobAnalysisRow
    {
        // Per-Job fields
        public string?   JobId                  { get; set; }
        public string?   ProjectName            { get; set; }
        public string?   JobTypeName            { get; set; }
        public string?   CustomerName           { get; set; }
        public string?   JobStatusName          { get; set; }
        public string?   JobStageName           { get; set; }
        public DateTime? JobDate                { get; set; }
        public DateTime? JobExpectedCompleteDate{ get; set; }
        public DateTime? JobActualCompleteDate  { get; set; }
        public decimal   OrderValue             { get; set; }
        public decimal   Invoiced               { get; set; }
        public decimal   Received               { get; set; }
        public decimal   Receivable             { get; set; }
        public decimal   ActualCost             { get; set; }
        public decimal   MaterialCost           { get; set; }
        public decimal   ExpenseCost            { get; set; }
        public decimal   TotalBudget            { get; set; }
        public decimal   GrossProfit            { get; set; }
        public decimal   BudgetVariance         { get; set; }
        public decimal   MarginPct              { get; set; }
        public decimal   InvoicingPct           { get; set; }
        public bool      IsClosedStatus         { get; set; }

        // Grouped view fields
        public string?   JobTypeId              { get; set; }
        public int?      CustomerId             { get; set; }
        public int?      JobStatusId            { get; set; }
        public int       JobCount               { get; set; }

        public int       TotalRows              { get; set; }
    }

    [Authorize]
    [Route("api/jobanalysis")]
    [ApiController]
    public class JobAnalysisController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public JobAnalysisController(DbCon dbcon) { _dbcon = dbcon; }

        // GET api/jobanalysis
        [HttpGet]
        public async Task<IActionResult> Get(
            [FromQuery] string  groupBy    = "Job",
            [FromQuery] string? jobTypeId  = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] int?    customerId = null,
            [FromQuery] int?    statusId   = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] string? searchText = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 30)
        {
            try
            {
                var p = new
                {
                    GroupBy    = groupBy,
                    JobTypeId  = string.IsNullOrWhiteSpace(jobTypeId)  ? null : jobTypeId.Trim(),
                    JobId      = string.IsNullOrWhiteSpace(jobId)      ? null : jobId.Trim(),
                    CustomerId = customerId,
                    StatusId   = statusId,
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom)   ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)     ? (DateTime?)null : DateTime.Parse(dateTo),
                    SearchText = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    Page       = page < 1 ? 1 : page,
                    PageSize   = pageSize is < 1 or > 200 ? 30 : pageSize,
                };

                using var multi = await _dbcon.QueryMultipleAsync("proj.sp_GetJobAnalysis", p);

                var summary = (await multi.ReadAsync<JobAnalysisSummary>()).FirstOrDefault()
                              ?? new JobAnalysisSummary();
                var rows    = (await multi.ReadAsync<JobAnalysisRow>()).ToList();
                int total   = rows.Count > 0 ? rows[0].TotalRows : 0;

                return Ok(new { summary, totalRows = total, page, pageSize, data = rows });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "JobAnalysis", "Get", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading job analysis." });
            }
        }
    }
}
