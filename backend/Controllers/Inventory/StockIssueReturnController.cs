using ERPWEB.Dbcontext;
using ERPWEB.Models.Inventory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Inventory
{
    public class ConfirmIssueReturnRequest
    {
        public string ModifiedBy { get; set; } = string.Empty;
        public string Password   { get; set; } = string.Empty;
    }

    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class StockIssueReturnController : ControllerBase
    {
        private readonly DbCon _db;
        public StockIssueReturnController(DbCon db) { _db = db; }

        private static string Sha256Hex(string raw)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw ?? string.Empty));
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        // ── List ──────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText,
            [FromQuery] int?    issueId,
            [FromQuery] string? status,
            [FromQuery] string? dateFrom,
            [FromQuery] string? dateTo,
            [FromQuery] int     page          = 1,
            [FromQuery] int     pageSize      = 20,
            [FromQuery] string  sortCol       = "ReturnDate",
            [FromQuery] string  sortDir       = "DESC")
        {
            try
            {
                var rows = await _db.QueryAsync<StockIssueReturn>("sp_SearchIssueReturns", new
                {
                    SearchText    = searchText,
                    IssueId       = issueId,
                    Status        = status,
                    DateFrom      = string.IsNullOrEmpty(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrEmpty(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber    = page,
                    PageSize      = pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                });
                var list  = rows.ToList();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { data = list, totalRows = total });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "StockIssueReturn", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching issue returns." });
            }
        }

        // ── Get Single ────────────────────────────────────────────
        [HttpGet("{returnId:int}")]
        public async Task<IActionResult> Get(int returnId)
        {
            try
            {
                using var multi = await _db.QueryMultipleAsync("sp_GetIssueReturn", new { ReturnId = returnId });
                var header = (await multi.ReadAsync<StockIssueReturn>()).FirstOrDefault();
                var lines  = (await multi.ReadAsync<StockIssueReturnLine>()).ToList();
                if (header == null) return NotFound(new { message = "Issue return not found." });
                return Ok(new { issueReturn = header, lines });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "StockIssueReturn", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching issue return." });
            }
        }

        // ── Save Header ───────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveIssueReturnRequest req)
        {
            try
            {
                var rows = await _db.QueryAsync<dynamic>("sp_SetIssueReturn", new
                {
                    ReturnId   = req.ReturnId,
                    IssueId    = req.IssueId,
                    ReturnDate = req.ReturnDate?.Date ?? DateTime.Today,
                    ReturnedBy = req.ReturnedBy,
                    Notes      = req.Notes,
                    CreatedBy  = req.CreatedBy,
                    ModifiedBy = req.ModifiedBy
                });
                var row = rows.FirstOrDefault();
                return Ok(new { returnId = (int)row!.ReturnId, returnNo = (string)row.ReturnNo });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "StockIssueReturn", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving issue return." });
            }
        }

        // ── Save Line ─────────────────────────────────────────────
        [HttpPost("line/save")]
        public async Task<IActionResult> SaveLine([FromBody] SaveIssueReturnLineRequest req)
        {
            try
            {
                var rows = await _db.QueryAsync<dynamic>("sp_SetIssueReturnLine", new
                {
                    ReturnLineId = req.ReturnLineId,
                    ReturnId     = req.ReturnId,
                    IssueLineId  = req.IssueLineId,
                    LineNum      = req.LineNum,
                    ItemDesc     = req.ItemDesc,
                    ReturnQty    = req.ReturnQty,
                    UomId        = req.UomId,
                    UnitCost     = req.UnitCost,
                    Notes        = req.Notes,
                    CreatedBy    = req.CreatedBy,
                    ModifiedBy   = req.ModifiedBy
                });
                var row = rows.FirstOrDefault();
                return Ok(new { returnLineId = (int)row!.ReturnLineId });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "StockIssueReturn", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving issue return line." });
            }
        }

        // ── Delete Line ───────────────────────────────────────────
        [HttpDelete("line/{returnLineId:int}")]
        public async Task<IActionResult> DeleteLine(int returnLineId, [FromQuery] string modifiedBy)
        {
            try
            {
                await _db.QueryAsync<dynamic>("sp_DeleteIssueReturnLine", new
                {
                    ReturnLineId = returnLineId,
                    ModifiedBy   = modifiedBy
                });
                return Ok(new { success = true });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "StockIssueReturn", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting issue return line." });
            }
        }

        // ── Confirm ───────────────────────────────────────────────
        [HttpPost("{returnId:int}/confirm")]
        public async Task<IActionResult> Confirm(int returnId, [FromBody] ConfirmIssueReturnRequest req)
        {
            try
            {
                var rows = await _db.QueryAsync<dynamic>("sp_ConfirmIssueReturn", new
                {
                    ReturnId     = returnId,
                    ModifiedBy   = req.ModifiedBy,
                    PasswordHash = Sha256Hex(req.Password)
                });
                var row = rows.FirstOrDefault();
                return Ok(new { newStatus = (string)row!.NewStatus });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "StockIssueReturn", action: "Confirm", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error confirming issue return." });
            }
        }

        // ── Delete Header ─────────────────────────────────────────
        [HttpDelete("{returnId:int}")]
        public async Task<IActionResult> Delete(int returnId, [FromQuery] string modifiedBy)
        {
            try
            {
                await _db.QueryAsync<dynamic>("sp_DeleteIssueReturn", new
                {
                    ReturnId   = returnId,
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
                await _db.WriteLog(ex, controller: "StockIssueReturn", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting issue return." });
            }
        }

        // ── Get Issue Lines for Return (picker) ───────────────────
        [HttpGet("issue-lines/{issueId:int}")]
        public async Task<IActionResult> GetIssueLines(int issueId)
        {
            try
            {
                var rows = await _db.QueryAsync<IssueLineForReturn>("sp_GetIssueLinesForReturn", new { IssueId = issueId });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "StockIssueReturn", action: "GetIssueLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching issue lines." });
            }
        }
    }
}
