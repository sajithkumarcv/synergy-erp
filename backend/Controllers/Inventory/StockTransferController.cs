using ERPWEB.Dbcontext;
using ERPWEB.Models.Inventory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Inventory
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class StockTransferController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public StockTransferController(DbCon dbcon) { _dbcon = dbcon; }

        // GET: api/stocktransfer/search
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? fromJobId  = null,
            [FromQuery] string? toJobId    = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20)
        {
            try
            {
                var p = new
                {
                    SearchText = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    Status     = string.IsNullOrWhiteSpace(status)     ? null : status,
                    FromJobId  = string.IsNullOrWhiteSpace(fromJobId)  ? null : fromJobId,
                    ToJobId    = string.IsNullOrWhiteSpace(toJobId)    ? null : toJobId,
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom)   ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)     ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber = page < 1 ? 1 : page,
                    PageSize   = pageSize is < 1 or > 500 ? 20 : pageSize
                };
                var rows = await _dbcon.QueryAsync<StockTransfer>("sp_SearchStockTransfers", p);
                var list = rows?.ToList() ?? new List<StockTransfer>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { totalRows = total, page, pageSize, totalPages = (int)Math.Ceiling((double)total / pageSize), data = list });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockTransfer", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching stock transfers." });
            }
        }

        // GET: api/stocktransfer/{id}
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                var results = await _dbcon.QueryMultipleAsync("sp_GetStockTransfer", new { TransferId = id });
                if (results == null) return NotFound(new { message = "Transfer not found." });
                var header = results.Read<StockTransfer>().FirstOrDefault();
                if (header == null) return NotFound(new { message = "Transfer not found." });
                var lines = results.Read<StockTransferLine>().ToList();
                return Ok(new { transfer = header, lines });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockTransfer", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving transfer." });
            }
        }

        // GET: api/stocktransfer/job/{jobId}/stock-items
        [HttpGet("job/{jobId}/stock-items")]
        public async Task<IActionResult> GetJobStockItems(string jobId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<TransferStockItem>("sp_GetTransferableJobStock", new { JobId = jobId });
                return Ok(rows?.ToList() ?? new List<TransferStockItem>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockTransfer", action: "GetJobStockItems", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job stock items." });
            }
        }

        // POST: api/stocktransfer/save
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveTransferRequest model)
        {
            try
            {
                var p = new
                {
                    model.TransferId, model.TransferDate, model.FromJobId, model.ToJobId,
                    model.TransferReason, model.Notes, model.CreatedBy, model.ModifiedBy
                };
                var rows = await _dbcon.QueryAsync<dynamic>("sp_SetStockTransfer", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { transferId = (int)result!.NewId, transferNo = (string)result.TransferNo });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockTransfer", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving transfer." });
            }
        }

        // POST: api/stocktransfer/line/save
        [HttpPost("line/save")]
        public async Task<IActionResult> SaveLine([FromBody] SaveTransferLineRequest model)
        {
            try
            {
                var p = new
                {
                    model.TransferLineId, model.TransferId, model.ItemId, model.Qty,
                    model.UomId, model.UnitCost, model.Notes, model.CreatedBy, model.ModifiedBy
                };
                var rows = await _dbcon.QueryAsync<dynamic>("sp_SetStockTransferLine", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { transferLineId = (int)result!.NewId });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockTransfer", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving transfer line." });
            }
        }

        // DELETE: api/stocktransfer/line/{lineId}
        [HttpDelete("line/{lineId:int}")]
        public async Task<IActionResult> DeleteLine(int lineId)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>("sp_DeleteStockTransferLine", new { TransferLineId = lineId });
                return Ok(new { message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockTransfer", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting line." });
            }
        }

        // DELETE: api/stocktransfer/{id}
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>("sp_DeleteStockTransfer", new { TransferId = id });
                return Ok(new { id, message = "Transfer deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockTransfer", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting transfer." });
            }
        }
    }
}
