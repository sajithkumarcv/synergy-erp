using ERPWEB.Dbcontext;
using ERPWEB.Models.Procurement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Procurement
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class ServiceReceiptController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public ServiceReceiptController(DbCon dbcon) { _dbcon = dbcon; }

        // ── SEARCH ───────────────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] int?    poId       = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "SrvDate",
            [FromQuery] string  sortDir    = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    Status        = string.IsNullOrWhiteSpace(status)     ? null : status,
                    JobId         = string.IsNullOrWhiteSpace(jobId)      ? null : jobId.Trim(),
                    PoId          = poId,
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom)   ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)     ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                };
                var rows  = await _dbcon.QueryAsync<ServiceReceipt>("sp_SearchServiceReceipts", p);
                var list  = rows?.ToList() ?? new List<ServiceReceipt>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { totalRows = total, page, pageSize, totalPages = (int)Math.Ceiling((double)total / pageSize), data = list });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ServiceReceipt", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching service receipts." });
            }
        }

        // ── GET BY ID ────────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                using var multi = await _dbcon.QueryMultipleAsync("sp_GetServiceReceipt", new { SrvId = id });
                var header = (await multi.ReadAsync<ServiceReceipt>()).FirstOrDefault();
                if (header == null) return NotFound(new { message = "Service receipt not found." });
                var lines = (await multi.ReadAsync<ServiceReceiptLine>()).ToList();
                return Ok(new { header, lines });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ServiceReceipt", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching service receipt." });
            }
        }

        // ── SAVE HEADER ──────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveServiceReceiptRequest model)
        {
            try
            {
                var p = new
                {
                    model.SrvId,
                    SrvDate      = model.SrvDate,
                    PoId         = model.PoId,
                    JobId        = model.JobId,
                    model.SupplierName,
                    model.Notes,
                    model.CreatedBy,
                    model.ModifiedBy
                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetServiceReceipt", p);
                return Ok(new { id = result, message = model.SrvId == 0 ? "Service Receipt created." : "Service Receipt updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ServiceReceipt", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving service receipt." });
            }
        }

        // ── SAVE LINE ────────────────────────────────────────────────────────
        [HttpPost("lines/save")]
        public async Task<IActionResult> SaveLine([FromBody] SaveServiceReceiptLineRequest model)
        {
            try
            {
                var p = new
                {
                    model.SrvLineId,
                    model.SrvId,
                    model.LineNum,
                    PoLineId     = model.PoLineId,
                    ItemId       = model.ItemId,
                    model.ItemCode,
                    model.ItemDesc,
                    model.CompletedQty,
                    UomId        = model.UomId,
                    model.UomName,
                    model.UnitCost,
                    model.Notes,
                    model.CreatedBy,
                    model.ModifiedBy
                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetServiceReceiptLine", p);
                return Ok(new { id = result });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ServiceReceipt", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving line." });
            }
        }

        // ── DELETE LINE ──────────────────────────────────────────────────────
        [HttpDelete("lines/{id:int}")]
        public async Task<IActionResult> DeleteLine(int id)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeleteServiceReceiptLine", new { SrvLineId = id });
                return Ok(new { message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ServiceReceipt", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting line." });
            }
        }

        // ── CHANGE STATUS ────────────────────────────────────────────────────
        [HttpPost("{id:int}/status")]
        public async Task<IActionResult> ChangeStatus(int id, [FromBody] StatusChangeRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ChangeServiceReceiptStatus", new
                {
                    SrvId     = id,
                    NewStatus = model.Status,
                    ChangedBy = model.ChangedBy
                });
                return Ok(new { message = $"Status changed to {model.Status}." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ServiceReceipt", action: "ChangeStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = ex.Message.Contains("Cannot") || ex.Message.Contains("Invalid") ? ex.Message : "Error changing status." });
            }
        }

        // ── PO LINES FOR SRV PICKER ──────────────────────────────────────────
        [HttpGet("polines/{poId:int}")]
        public async Task<IActionResult> GetPoLines(int poId, [FromQuery] int srvId = 0)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<PoLineForSrv>("sp_GetPOLinesForSRV", new { PoId = poId, SrvId = srvId });
                return Ok(rows ?? Enumerable.Empty<PoLineForSrv>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ServiceReceipt", action: "GetPoLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching PO lines." });
            }
        }
    }
}
