using ERPWEB.Dbcontext;
using ERPWEB.Models.Inventory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Inventory
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class StockAdjustmentController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public StockAdjustmentController(DbCon dbcon) { _dbcon = dbcon; }

        // ── SEARCH ───────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText    = null,
            [FromQuery] string? status        = null,
            [FromQuery] string? reason        = null,
            [FromQuery] string? dateFrom      = null,
            [FromQuery] string? dateTo        = null,
            [FromQuery] int?    itemTypeId    = null,
            [FromQuery] int?    categoryId    = null,
            [FromQuery] int?    subCategoryId = null,
            [FromQuery] int?    itemId        = null,
            [FromQuery] int     page          = 1,
            [FromQuery] int     pageSize      = 20,
            [FromQuery] string  sortCol       = "AdjustmentDate",
            [FromQuery] string  sortDir       = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    Status        = string.IsNullOrWhiteSpace(status)     ? null : status,
                    Reason        = string.IsNullOrWhiteSpace(reason)     ? null : reason,
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom)   ? null : dateFrom,
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)     ? null : dateTo,
                    ItemTypeId    = itemTypeId,
                    CategoryId    = categoryId,
                    SubCategoryId = subCategoryId,
                    ItemId        = itemId,
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 500 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                };
                var rows = await _dbcon.QueryAsync<StockAdjustment>("sp_SearchAdjustments", p);
                var list = rows?.ToList() ?? new List<StockAdjustment>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { totalRows = total, page, pageSize, totalPages = (int)Math.Ceiling((double)total / pageSize), data = list });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockAdjustment", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching adjustments." });
            }
        }

        // ── GET SINGLE (header + lines) ──────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                var (headers, lines) = await _dbcon.QueryMultipleAsync<StockAdjustment, StockAdjustmentLine>(
                    "sp_GetAdjustment", new { AdjustmentId = id });
                var header = headers.FirstOrDefault();
                if (header == null) return NotFound(new { message = "Adjustment not found." });
                return Ok(new { adjustment = header, lines });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockAdjustment", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving adjustment." });
            }
        }

        // ── SAVE HEADER ──────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveAdjustmentRequest model)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_SetAdjustment", new
                {
                    model.AdjustmentId,
                    model.AdjustmentDate,
                    model.Reason,
                    model.Notes,
                    model.CreatedBy,
                    model.ModifiedBy
                });
                var result = rows?.FirstOrDefault();
                return Ok(new { adjustmentId = (int)result!.NewId, adjustmentNo = (string)result.AdjustmentNo });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockAdjustment", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving adjustment." });
            }
        }

        // ── SAVE LINE ────────────────────────────────────────────
        [HttpPost("line/save")]
        public async Task<IActionResult> SaveLine([FromBody] SaveAdjustmentLineRequest model)
        {
            if (model.AdjustmentId <= 0) return BadRequest(new { message = "AdjustmentId is required." });
            if (model.ItemId <= 0)       return BadRequest(new { message = "Item is required." });
            if (model.AdjustQty == 0)    return BadRequest(new { message = "Adjustment qty cannot be zero." });

            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_SetAdjustmentLine", new
                {
                    model.AdjustmentLineId,
                    model.AdjustmentId,
                    model.ItemId,
                    model.ItemDesc,
                    model.AdjustQty,
                    model.UomId,
                    model.UnitCost,
                    model.Reason,
                    model.Notes,
                    model.CreatedBy,
                    model.ModifiedBy
                });
                var result = rows?.FirstOrDefault();
                return Ok(new { adjustmentLineId = (int)result!.NewId });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockAdjustment", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving adjustment line." });
            }
        }

        // ── DELETE LINE ──────────────────────────────────────────
        [HttpDelete("line/{lineId:int}")]
        public async Task<IActionResult> DeleteLine(int lineId)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>("sp_DeleteAdjustmentLine", new { AdjustmentLineId = lineId });
                return Ok(new { message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockAdjustment", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting line." });
            }
        }

        // ── DELETE HEADER ────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>("sp_DeleteAdjustment", new { AdjustmentId = id });
                return Ok(new { id, message = "Adjustment deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockAdjustment", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting adjustment." });
            }
        }

        // ── SUBMIT FOR APPROVAL ──────────────────────────────────
        // Routes the adjustment into the approval engine (ADJ module).
        [HttpPost("{id:int}/submit")]
        public async Task<IActionResult> Submit(int id, [FromBody] SubmitAdjustmentRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.SubmittedBy))
                return BadRequest(new { message = "SubmittedBy is required." });

            try
            {
                // Need the document number + total value for the transaction record
                var (headers, lines) = await _dbcon.QueryMultipleAsync<StockAdjustment, StockAdjustmentLine>(
                    "sp_GetAdjustment", new { AdjustmentId = id });
                var header = headers.FirstOrDefault();
                if (header == null) return NotFound(new { message = "Adjustment not found." });
                if (!lines.Any())   return BadRequest(new { message = "Add at least one line before submitting." });

                decimal totalValue = lines.Sum(l => l.LineValue);

                var rows = await _dbcon.QueryAsync<dynamic>("sp_SubmitForApproval", new
                {
                    ModuleCode     = "ADJ",
                    DocumentId     = id,
                    DocumentNo     = header.AdjustmentNo,
                    DocumentAmount = totalValue,
                    CurrencyId     = (int?)null,
                    SubmittedBy    = req.SubmittedBy
                });
                var result = rows?.FirstOrDefault();
                int txId = (int)result!.TransactionId;
                if (txId < 0) return BadRequest(new { message = (string)result.Message });

                return Ok(new { transactionId = txId, newStatus = (string?)result.NewStatus, message = (string)result.Message });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockAdjustment", action: "Submit", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error submitting adjustment for approval." });
            }
        }
    }
}
