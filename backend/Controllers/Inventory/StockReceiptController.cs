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
    public class StockReceiptController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public StockReceiptController(DbCon dbcon) { _dbcon = dbcon; }

        private static string Sha256Hex(string raw)
        {
            using var sha = SHA256.Create();
            var bytes     = sha.ComputeHash(Encoding.UTF8.GetBytes(raw ?? string.Empty));
            var sb        = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        // ═══════════════════════════════════════════════════════
        // SEARCH / LIST
        // GET: api/stockreceipt/search
        // ═══════════════════════════════════════════════════════
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText   = null,
            [FromQuery] string? receiptType  = null,
            [FromQuery] string? status       = null,
            [FromQuery] string? jobId        = null,
            [FromQuery] string? dateFrom     = null,
            [FromQuery] string? dateTo       = null,
            [FromQuery] int     page         = 1,
            [FromQuery] int     pageSize     = 20,
            [FromQuery] string  sortCol      = "ReceiptDate",
            [FromQuery] string  sortDir      = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText   = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    ReceiptType  = string.IsNullOrWhiteSpace(receiptType) ? null : receiptType,
                    Status       = string.IsNullOrWhiteSpace(status) ? null : status,
                    JobId        = string.IsNullOrWhiteSpace(jobId) ? null : jobId,
                    DateFrom     = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo       = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber   = page < 1 ? 1 : page,
                    PageSize     = pageSize is < 1 or > 500 ? 20 : pageSize,
                    SortColumn   = sortCol,
                    SortDirection = sortDir
                };
                var rows = await _dbcon.QueryAsync<StockReceipt>("sp_SearchStockReceipts", p);
                var list = rows?.ToList() ?? new List<StockReceipt>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { totalRows = total, page, pageSize, totalPages = (int)Math.Ceiling((double)total / pageSize), data = list });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockReceipt", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching stock receipts." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // GET SINGLE (header + lines)
        // GET: api/stockreceipt/{id}
        // ═══════════════════════════════════════════════════════
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetReceipt(int id)
        {
            try
            {
                var (headers, lines) = await _dbcon.QueryMultipleAsync<StockReceipt, StockReceiptLine>(
                    "sp_GetStockReceipt", new { ReceiptId = id, ReceiptNo = (string?)null });

                var header = headers.FirstOrDefault();
                if (header == null) return NotFound(new { message = "GRN not found." });

                return Ok(new { receipt = header, lines });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockReceipt", action: "GetReceipt", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving GRN." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // SAVE HEADER (create or update)
        // POST: api/stockreceipt/save
        // ═══════════════════════════════════════════════════════
        [HttpPost("save")]
        public async Task<IActionResult> SaveReceipt([FromBody] SaveReceiptRequest model)
        {
            try
            {
                var p = new
                {
                    ReceiptId    = model.ReceiptId,
                    ReceiptDate  = model.ReceiptDate,
                    ReceiptType  = model.ReceiptType ?? "STORE",
                    JobId        = model.JobId,
                    PoId         = model.PoId,
                    PoNumber     = model.PoNumber,
                    SupplierId   = model.SupplierId,
                    SupplierName = model.SupplierName,
                    SupplierRef  = model.SupplierRef,
                    Notes        = model.Notes,
                    CreatedBy    = model.CreatedBy,
                    ModifiedBy   = model.ModifiedBy
                };
                var rows = await _dbcon.QueryAsync<dynamic>("sp_SetStockReceipt", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { receiptId = Convert.ToInt32(result!.NewId), receiptNo = (string)result.ReceiptNo });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockReceipt", action: "SaveReceipt", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving GRN." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // SAVE LINE
        // POST: api/stockreceipt/line/save
        // ═══════════════════════════════════════════════════════
        [HttpPost("line/save")]
        public async Task<IActionResult> SaveLine([FromBody] SaveReceiptLineRequest model)
        {
            try
            {
                var p = new
                {
                    ReceiptLineId = model.ReceiptLineId,
                    ReceiptId     = model.ReceiptId,
                    LineNum       = model.LineNum,
                    ItemId        = model.ItemId,
                    ItemDesc      = model.ItemDesc,
                    Qty           = model.Qty,
                    UomId         = model.UomId,
                    UnitCost      = model.UnitCost,
                    IsJobStock    = model.IsJobStock,
                    JobId         = model.JobId,
                    Notes         = model.Notes,
                    CreatedBy     = model.CreatedBy,
                    ModifiedBy    = model.ModifiedBy
                };
                var rows = await _dbcon.QueryAsync<dynamic>("sp_SetStockReceiptLine", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { receiptLineId = (int)result!.ReceiptLineId });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockReceipt", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving GRN line." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // DELETE LINE
        // DELETE: api/stockreceipt/line/{lineId}
        // ═══════════════════════════════════════════════════════
        [HttpDelete("line/{lineId:int}")]
        public async Task<IActionResult> DeleteLine(int lineId, [FromQuery] string? modifiedBy = null)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>("sp_DeleteStockReceiptLine", new { ReceiptLineId = lineId, ModifiedBy = modifiedBy });
                return Ok(new { message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockReceipt", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting GRN line." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // CONFIRM GRN
        // POST: api/stockreceipt/{id}/confirm
        // ═══════════════════════════════════════════════════════
        [HttpPost("{id:int}/confirm")]
        public async Task<IActionResult> Confirm(int id, [FromBody] ConfirmRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { message = "Password is required." });
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_ConfirmGRN",
                    new { ReceiptId = id, ModifiedBy = req.ModifiedBy, PasswordHash = Sha256Hex(req.Password) });
                var result = rows?.FirstOrDefault();
                return Ok(new { receiptNo = (string)result!.ReceiptNo, status = (string)result.Status });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockReceipt", action: "Confirm", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error confirming GRN." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // CANCEL / VOID
        // POST: api/stockreceipt/{id}/cancel
        // Reverses a confirmed receipt's stock; voids a draft.
        // ═══════════════════════════════════════════════════════
        [HttpPost("{id:int}/cancel")]
        public async Task<IActionResult> Cancel(int id, [FromBody] CancelReceiptRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { message = "Password is required." });
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_CancelStockReceipt",
                    new { ReceiptId = id, CancelledBy = req.CancelledBy, Reason = req.Reason, PasswordHash = Sha256Hex(req.Password) });
                var result = rows?.FirstOrDefault();
                return Ok(new { receiptNo = (string)result!.ReceiptNo, status = (string)result.Status });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockReceipt", action: "Cancel", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error cancelling stock receipt." });
            }
        }
    }

    public class ConfirmRequest
    {
        public string? ModifiedBy { get; set; }
        public string? Password   { get; set; }
    }

    public class CancelReceiptRequest
    {
        public string? CancelledBy { get; set; }
        public string? Reason      { get; set; }
        public string? Password    { get; set; }
    }
}
