using Dapper;
using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace ERPWEB.Controllers.Job
{
    [Authorize]
    [Route("api/job-overview")]
    [ApiController]
    public class JobOverviewController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public JobOverviewController(DbCon dbcon) { _dbcon = dbcon; }

        // Dapper `dynamic` rows serialize their dictionary keys verbatim (PascalCase),
        // because DictionaryKeyPolicy is intentionally NOT camelCase (that would break
        // the VLIST keyed lookups). The frontend expects camelCase, so normalise the
        // keys of each row here. Single-place fix for all dynamic result sets.
        private static object? ToCamel(object? row)
        {
            if (row is IDictionary<string, object> dict)
            {
                var camel = new Dictionary<string, object?>(dict.Count);
                foreach (var kv in dict)
                    camel[JsonNamingPolicy.CamelCase.ConvertName(kv.Key)] = kv.Value;
                return camel;
            }
            return row;
        }

        // ── GET api/job-overview/jobs ────────────────────────────────────────
        // Cascading dropdown: filter by JobTypeId / StatusId / CustomerId
        [HttpGet("jobs")]
        public async Task<IActionResult> GetJobs(
            [FromQuery] string? jobTypeId  = null,
            [FromQuery] int?    statusId   = null,
            [FromQuery] int?    customerId = null,
            [FromQuery] string? searchText = null)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>(
                    "sp_GetJobsForOverview",
                    new
                    {
                        JobTypeId  = string.IsNullOrWhiteSpace(jobTypeId) ? null : jobTypeId,
                        StatusId   = statusId,
                        CustomerId = customerId,
                        SearchText = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim()
                    });

                return Ok((rows ?? Enumerable.Empty<dynamic>()).Select(ToCamel));
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobOverview", action: "GetJobs", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading jobs." });
            }
        }

        // ── GET api/job-overview/{jobId} ─────────────────────────────────────
        // Full overview — 11 result sets
        [HttpGet("{jobId}")]
        public async Task<IActionResult> GetOverview(string jobId)
        {
            try
            {
                using var grid = await _dbcon.QueryMultipleAsync(
                    "sp_GetJobOverview",
                    new { JobId = jobId });

                var header          = ToCamel((await grid.ReadAsync<dynamic>()).FirstOrDefault());
                if (header == null)
                    return NotFound(new { message = "Job not found." });

                var finance         = ToCamel((await grid.ReadAsync<dynamic>()).FirstOrDefault());
                var budget          = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var engineers       = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var manhourSummary  = ToCamel((await grid.ReadAsync<dynamic>()).FirstOrDefault());
                var manhours        = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var pos             = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var issues          = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var issueReturns    = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var invoices        = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var childInvoices   = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var deliveryNotes   = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var expenses        = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var audit           = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();

                return Ok(new
                {
                    header,
                    finance,
                    budget,
                    engineers,
                    manhourSummary,
                    manhours,
                    purchaseOrders = pos,
                    stockIssues    = issues,
                    issueReturns,
                    invoices,
                    childInvoices,
                    deliveryNotes,
                    expenses,
                    audit
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobOverview", action: "GetOverview", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading job overview." });
            }
        }
    }
}
