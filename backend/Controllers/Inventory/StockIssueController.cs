using ERPWEB.Dbcontext;
using ERPWEB.Models.Inventory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Inventory
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class StockIssueController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public StockIssueController(DbCon dbcon) { _dbcon = dbcon; }

        // ═══════════════════════════════════════════════════════
        // ISSUE TYPES
        // GET: api/stockissue/types
        // ═══════════════════════════════════════════════════════
        [HttpGet("types")]
        public async Task<IActionResult> GetIssueTypes()
        {
            try
            {
                var list = await _dbcon.QueryAsync<IssueType>("sp_GetIssueTypes", null);
                return Ok(list ?? new List<IssueType>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "GetIssueTypes", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching issue types." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // SEARCH / LIST
        // GET: api/stockissue/search
        // ═══════════════════════════════════════════════════════
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText   = null,
            [FromQuery] string? jobId        = null,
            [FromQuery] string? costingType  = null,
            [FromQuery] string? status       = null,
            [FromQuery] string? dateFrom     = null,
            [FromQuery] string? dateTo       = null,
            [FromQuery] int     page         = 1,
            [FromQuery] int     pageSize     = 20,
            [FromQuery] string  sortCol      = "IssueDate",
            [FromQuery] string  sortDir      = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText)  ? null : searchText.Trim(),
                    JobId         = string.IsNullOrWhiteSpace(jobId)       ? null : jobId,
                    CostingType   = string.IsNullOrWhiteSpace(costingType) ? null : costingType,
                    Status        = string.IsNullOrWhiteSpace(status)      ? null : status,
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom)    ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)      ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 500 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                };
                var rows = await _dbcon.QueryAsync<StockIssue>("sp_SearchStockIssues", p);
                var list = rows?.ToList() ?? new List<StockIssue>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { totalRows = total, page, pageSize, totalPages = (int)Math.Ceiling((double)total / pageSize), data = list });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching issue notes." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // GET SINGLE
        // GET: api/stockissue/{id}
        // ═══════════════════════════════════════════════════════
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetIssue(int id)
        {
            try
            {
                var results = await _dbcon.QueryMultipleAsync("sp_GetStockIssue", new { IssueId = id, IssueNo = (string?)null });
                if (results == null) return NotFound(new { message = "Issue Note not found." });

                var header = results.Read<StockIssue>().FirstOrDefault();
                if (header == null) return NotFound(new { message = "Issue Note not found." });
                var lines = results.Read<StockIssueLine>().ToList();
                return Ok(new { issue = header, lines });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "GetIssue", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving Issue Note." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // SAVE HEADER
        // POST: api/stockissue/save
        // ═══════════════════════════════════════════════════════
        [HttpPost("save")]
        public async Task<IActionResult> SaveIssue([FromBody] SaveIssueRequest model)
        {
            try
            {
                var p = new
                {
                    IssueId     = model.IssueId,
                    IssueDate   = model.IssueDate,
                    JobId       = model.JobId,
                    CostingType = model.CostingType ?? "INC_COSTING",
                    IssuedTo    = string.IsNullOrWhiteSpace(model.IssuedTo) ? null : model.IssuedTo.Trim(),
                    Notes       = model.Notes,
                    CreatedBy   = model.CreatedBy,
                    ModifiedBy  = model.ModifiedBy
                };
                var rows = await _dbcon.QueryAsync<dynamic>("sp_SetStockIssue", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { issueId = (int)result!.NewId, issueNo = (string)result.IssueNo });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "SaveIssue", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving Issue Note." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // SAVE LINE  (with stock-availability guard)
        // POST: api/stockissue/line/save
        // ═══════════════════════════════════════════════════════
        [HttpPost("line/save")]
        public async Task<IActionResult> SaveLine([FromBody] SaveIssueLineRequest model)
        {
            try
            {
                // ── Stock availability check ───────────────────────
                // Fetch the parent issue to get JobId + CostingType
                var issueRows = await _dbcon.QueryAsync<StockIssue>(
                    "sp_GetStockIssue", new { IssueId = model.IssueId, IssueNo = (string?)null });
                var issue = issueRows?.FirstOrDefault();

                if (issue != null)
                {
                    var avRows = await _dbcon.QueryAsync<StockAvailability>(
                        "sp_GetStockAvailability",
                        new { ItemId = model.ItemId, JobId = issue.JobId, CostingType = issue.CostingType });
                    var av = avRows?.FirstOrDefault();

                    if (av != null)
                    {
                        // When editing an existing line, the currently-saved qty is not yet
                        // deducted from balance (stock only moves on Confirm), so we compare
                        // the requested qty directly against available stock.
                        if (model.Qty > av.AvailableQty)
                            return BadRequest(new
                            {
                                message = $"Insufficient stock. Requested: {model.Qty:0.####}, " +
                                          $"Available: {av.AvailableQty:0.####}."
                            });
                    }
                }

                // ── Persist line ───────────────────────────────────
                var p = new
                {
                    IssueLineId = model.IssueLineId,
                    IssueId     = model.IssueId,
                    LineNum     = model.LineNum,
                    ItemId      = model.ItemId,
                    ItemDesc    = model.ItemDesc,
                    Qty         = model.Qty,
                    UomId       = model.UomId,
                    UnitCost    = model.UnitCost,
                    Notes       = model.Notes,
                    CreatedBy   = model.CreatedBy,
                    ModifiedBy  = model.ModifiedBy
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_SetStockIssueLine", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { issueLineId = (int)result!.IssueLineId });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving Issue Note line." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // DELETE LINE
        // DELETE: api/stockissue/line/{lineId}
        // ═══════════════════════════════════════════════════════
        [HttpDelete("line/{lineId:int}")]
        public async Task<IActionResult> DeleteLine(int lineId, [FromQuery] string? modifiedBy = null)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>("sp_DeleteStockIssueLine", new { IssueLineId = lineId, ModifiedBy = modifiedBy });
                return Ok(new { message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting line." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // DELETE HEADER
        // DELETE: api/stockissue/{id}
        // ═══════════════════════════════════════════════════════
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteIssue(int id, [FromQuery] string? modifiedBy = null)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteStockIssue", new { IssueId = id, ModifiedBy = modifiedBy });
                if (result == "NotExists")    return NotFound(new { message = "Issue Note not found." });
                if (result == "CannotDelete") return BadRequest(new { message = "Only Draft Issue Notes can be deleted." });
                return Ok(new { id, message = "Issue Note deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "DeleteIssue", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting Issue Note." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // CONFIRM ISSUE NOTE
        // POST: api/stockissue/{id}/confirm
        // ═══════════════════════════════════════════════════════
        [HttpPost("{id:int}/confirm")]
        public async Task<IActionResult> Confirm(int id, [FromBody] ConfirmRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.LoginPassword))
                return BadRequest(new { message = "Your login password is required to confirm this Issue Note." });
            var valid = await _dbcon.QueryAsync<dynamic>("sp_ValidateUser",
                new { Username = req.ModifiedBy, Password = Sha256Hex(req.LoginPassword) });
            if (!valid.Any())
            {
                await _dbcon.WriteRawLog("Incorrect login password on Issue Note confirm attempt.",
                    controller: "StockIssue", action: "Confirm",
                    requestPath: HttpContext.Request.Path, userId: req.ModifiedBy, logLevel: "Warning");
                return BadRequest(new { message = "Incorrect password. Issue Note not confirmed." });
            }

            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_ConfirmStockIssue", new { IssueId = id, ModifiedBy = req.ModifiedBy });
                var result = rows?.FirstOrDefault();
                return Ok(new { issueNo = (string)result!.IssueNo, status = (string)result.Status });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "Confirm", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error confirming Issue Note." });
            }
        }

        private static string Sha256Hex(string input)
        {
            using var sha = SHA256.Create();
            var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
            return BitConverter.ToString(hash).Replace("-", "").ToLower();
        }

        // ═══════════════════════════════════════════════════════
        // CANCEL ISSUE NOTE (Draft only)
        // POST: api/stockissue/{id}/cancel
        // A confirmed note must be reversed via an Issue Return, not cancelled.
        // ═══════════════════════════════════════════════════════
        [HttpPost("{id:int}/cancel")]
        public async Task<IActionResult> Cancel(int id, [FromBody] ConfirmRequest req)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_CancelStockIssue", new { IssueId = id, ModifiedBy = req.ModifiedBy });
                var result = rows?.FirstOrDefault();
                return Ok(new { issueNo = (string)result!.IssueNo, status = (string)result.Status });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "Cancel", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error cancelling Issue Note." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // FIFO COST
        // GET: api/stockissue/fifocost/{itemId}
        // ═══════════════════════════════════════════════════════
        [HttpGet("fifocost/{itemId:int}")]
        public async Task<IActionResult> GetFifoCost(int itemId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetFifoCost", new { ItemId = itemId });
                var result = rows?.FirstOrDefault();
                decimal cost = result != null ? (decimal)result.FifoCost : 0m;
                return Ok(new { itemId, fifoCost = cost });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "GetFifoCost", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving FIFO cost." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // JOB STOCK ITEMS  (EXC_COSTING item picker)
        // GET: api/stockissue/jobitems/{jobId}
        // ═══════════════════════════════════════════════════════
        [HttpGet("jobitems/{jobId}")]
        public async Task<IActionResult> GetJobItems(
            string jobId,
            [FromQuery] string? searchText = null,
            [FromQuery] int     pageSize   = 20)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<JobStockItem>("sp_GetJobStockItems", new
                {
                    JobId      = jobId,
                    SearchText = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    PageSize   = pageSize is < 1 or > 200 ? 20 : pageSize
                });
                return Ok(rows ?? new List<JobStockItem>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "GetJobItems", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job stock items." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // STOCK AVAILABILITY
        // GET: api/stockissue/stockavail/{itemId}
        // ═══════════════════════════════════════════════════════
        [HttpGet("stockavail/{itemId:int}")]
        public async Task<IActionResult> GetStockAvailability(
            int     itemId,
            [FromQuery] string? jobId       = null,
            [FromQuery] string  costingType = "INC_COSTING")
        {
            try
            {
                var rows = await _dbcon.QueryAsync<StockAvailability>("sp_GetStockAvailability", new
                {
                    ItemId      = itemId,
                    JobId       = string.IsNullOrWhiteSpace(jobId) ? null : jobId,
                    CostingType = costingType
                });
                var result = rows?.FirstOrDefault();
                return Ok(result ?? new StockAvailability { ItemId = itemId, AvailableQty = 0 });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockIssue", action: "GetStockAvailability", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving stock availability." });
            }
        }
    }
}
