using ERPWEB.Dbcontext;
using ERPWEB.Models.Inventory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Inventory
{
    /// <summary>
    /// Issue Request (ISR) — the approved request stage in front of the Issue Note.
    /// Build step 2 of backend/Docs/DESIGN-issue-request.md: CRUD, list and detail only.
    /// Submitting for approval goes through the shared approval endpoints with
    /// moduleCode "ISR"; nothing here posts stock or takes a reservation.
    /// Shaped after StockIssueReturnController, the closest existing document.
    /// </summary>
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class IssueRequestController : ControllerBase
    {
        private readonly DbCon _db;
        public IssueRequestController(DbCon db) { _db = db; }

        // ── List ──────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText,
            [FromQuery] string? jobId,
            [FromQuery] string? status,        // CSV of statuses (a single value still works)
            [FromQuery] int?    issueTypeId,
            [FromQuery] int?    customerId,
            [FromQuery] string? dateFrom,
            [FromQuery] string? dateTo,
            [FromQuery] int     page     = 1,
            [FromQuery] int     pageSize = 20,
            [FromQuery] string  sortCol  = "RequestDate",
            [FromQuery] string  sortDir  = "DESC")
        {
            try
            {
                var rows = await _db.QueryAsync<IssueRequest>("sp_SearchIssueRequests", new
                {
                    SearchText    = searchText,
                    JobId         = jobId,
                    Status        = status,
                    IssueTypeId   = issueTypeId,
                    CustomerId    = customerId,
                    DateFrom      = string.IsNullOrEmpty(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrEmpty(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber    = page,
                    PageSize      = pageSize,
                    // The proc whitelists the column name and falls back to
                    // RequestDate DESC for anything it doesn't recognise.
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                });
                var list  = rows.ToList();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { data = list, totalRows = total });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "IssueRequest", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching issue requests." });
            }
        }

        // ── Get single ────────────────────────────────────────────
        [HttpGet("{requestId:int}")]
        public async Task<IActionResult> Get(int requestId)
        {
            try
            {
                using var multi = await _db.QueryMultipleAsync("sp_GetIssueRequest", new { RequestId = requestId });
                var header = (await multi.ReadAsync<IssueRequest>()).FirstOrDefault();
                var lines  = (await multi.ReadAsync<IssueRequestLine>()).ToList();
                if (header == null) return NotFound(new { message = "Issue request not found." });
                return Ok(new { issueRequest = header, lines });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "IssueRequest", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching issue request." });
            }
        }

        // ── Save header ───────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveIssueRequestRequest req)
        {
            try
            {
                var rows = await _db.QueryAsync<dynamic>("sp_SetIssueRequest", new
                {
                    RequestId    = req.RequestId,
                    JobId        = req.JobId,
                    IssueTypeId  = req.IssueTypeId,
                    RequestDate  = req.RequestDate?.Date ?? DateTime.Today,
                    RequiredDate = req.RequiredDate?.Date,
                    RequestedBy  = req.RequestedBy,
                    Department   = req.Department,
                    RequestedFor = req.RequestedFor,
                    Priority     = req.Priority,
                    Notes        = req.Notes,
                    CreatedBy    = req.CreatedBy,
                    ModifiedBy   = req.ModifiedBy
                });
                var row = rows.FirstOrDefault();
                return Ok(new { requestId = (int)row!.RequestId, requestNo = (string)row.RequestNo });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                // Business-rule RAISERROR from the proc → its message, not a 500.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "IssueRequest", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving issue request." });
            }
        }

        // ── Save line ─────────────────────────────────────────────
        [HttpPost("line/save")]
        public async Task<IActionResult> SaveLine([FromBody] SaveIssueRequestLineRequest req)
        {
            try
            {
                var rows = await _db.QueryAsync<dynamic>("sp_SetIssueRequestLine", new
                {
                    RequestLineId = req.RequestLineId,
                    RequestId     = req.RequestId,
                    ItemId        = req.ItemId,
                    RequestedQty  = req.RequestedQty,
                    UomId         = req.UomId,
                    BomId         = req.BomId,
                    RequiredDate  = req.RequiredDate?.Date,
                    Notes         = req.Notes,
                    CreatedBy     = req.CreatedBy,
                    ModifiedBy    = req.ModifiedBy
                });
                var row = rows.FirstOrDefault();
                return Ok(new { requestLineId = (int)row!.RequestLineId });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "IssueRequest", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving issue request line." });
            }
        }

        // ── Delete line ───────────────────────────────────────────
        [HttpDelete("line/{requestLineId:int}")]
        public async Task<IActionResult> DeleteLine(int requestLineId, [FromQuery] string modifiedBy)
        {
            try
            {
                await _db.QueryAsync<dynamic>("sp_DeleteIssueRequestLine", new
                {
                    RequestLineId = requestLineId,
                    ModifiedBy    = modifiedBy
                });
                return Ok(new { success = true });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "IssueRequest", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting issue request line." });
            }
        }

        // ── Pull from BOM: open requirement lines for a job ───────
        // GET: api/issuerequest/bom-lines?jobId=&bomHeaderId=
        [HttpGet("bom-lines")]
        public async Task<IActionResult> GetBomLines(
            [FromQuery] string jobId,
            [FromQuery] int?   bomHeaderId = null)
        {
            if (string.IsNullOrWhiteSpace(jobId))
                return BadRequest(new { message = "jobId is required." });
            try
            {
                var rows = await _db.QueryAsync<BomLineForIssueRequest>("sp_GetBomLinesForIssueRequest", new
                {
                    JobId       = jobId,
                    BomHeaderId = bomHeaderId
                });
                return Ok(rows ?? Enumerable.Empty<BomLineForIssueRequest>());
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "IssueRequest", action: "GetBomLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching BOM lines." });
            }
        }

        // ── Close: end the remaining balance and release the hold ─
        [HttpPost("{requestId:int}/close")]
        public async Task<IActionResult> Close(int requestId, [FromBody] CloseIssueRequestRequest req)
        {
            try
            {
                var rows = await _db.QueryAsync<dynamic>("sp_CloseIssueRequest", new
                {
                    RequestId  = requestId,
                    ModifiedBy = req.ModifiedBy,
                    Reason     = req.Reason
                });
                var row = rows.FirstOrDefault();
                return Ok(new { requestId, status = (string)(row?.Status ?? "Closed") });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "IssueRequest", action: "Close", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error closing issue request." });
            }
        }

        // ── Delete header (soft) ──────────────────────────────────
        [HttpDelete("{requestId:int}")]
        public async Task<IActionResult> Delete(int requestId, [FromQuery] string modifiedBy)
        {
            try
            {
                await _db.QueryAsync<dynamic>("sp_DeleteIssueRequest", new
                {
                    RequestId  = requestId,
                    ModifiedBy = modifiedBy
                });
                return Ok(new { success = true });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "IssueRequest", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting issue request." });
            }
        }
    }
}
