using ERPWEB.Dbcontext;
using ERPWEB.Models.Inventory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Inventory
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class StockBalanceController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public StockBalanceController(DbCon dbcon) { _dbcon = dbcon; }

        // ═══════════════════════════════════════════════════════
        // STOCK BALANCE OVERVIEW
        // GET: api/stockbalance
        // ═══════════════════════════════════════════════════════
        [HttpGet]
        public async Task<IActionResult> GetBalance(
            [FromQuery] string? searchText     = null,
            [FromQuery] int?    categoryId     = null,
            [FromQuery] int?    subCategoryId  = null,
            [FromQuery] int?    itemTypeId     = null,
            [FromQuery] int?    itemId         = null,
            [FromQuery] string? stockType      = null,
            [FromQuery] string? dateFrom       = null,
            [FromQuery] string? dateTo         = null,
            [FromQuery] bool    zeroStock      = false)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<StockBalance>("sp_GetStockBalance", new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    CategoryId    = categoryId,
                    SubCategoryId = subCategoryId,
                    ItemTypeId    = itemTypeId,
                    ItemId        = itemId,
                    StockType     = string.IsNullOrWhiteSpace(stockType) ? null : stockType.Trim().ToUpper(),
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    ZeroStock     = zeroStock ? 1 : 0
                });
                return Ok(rows ?? Enumerable.Empty<StockBalance>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockBalance", action: "GetBalance", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving stock balance." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // STOCK ALERTS
        // GET: api/stockbalance/alerts
        // ═══════════════════════════════════════════════════════
        [HttpGet("alerts")]
        public async Task<IActionResult> GetAlerts(
            [FromQuery] string? alertType     = null,
            [FromQuery] string? searchText    = null,
            [FromQuery] int?    categoryId    = null,
            [FromQuery] int?    subCategoryId = null,
            [FromQuery] int?    itemTypeId    = null,
            [FromQuery] int?    itemId        = null)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<StockAlert>("sp_GetStockAlerts", new
                {
                    AlertType     = string.IsNullOrWhiteSpace(alertType)  ? null : alertType.Trim().ToUpper(),
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    CategoryId    = categoryId,
                    SubCategoryId = subCategoryId,
                    ItemTypeId    = itemTypeId,
                    ItemId        = itemId
                });
                return Ok(rows ?? Enumerable.Empty<StockAlert>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockBalance", action: "GetAlerts", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving stock alerts." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // JOB STOCK BREAKDOWN (per-job for one item)
        // GET: api/stockbalance/item/{itemId}/job-breakdown
        // ═══════════════════════════════════════════════════════
        [HttpGet("item/{itemId:int}/job-breakdown")]
        public async Task<IActionResult> GetJobBreakdown(int itemId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<JobStockBreakdown>("sp_GetJobStockBreakdown", new { ItemId = itemId });
                return Ok(rows ?? Enumerable.Empty<JobStockBreakdown>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockBalance", action: "GetJobBreakdown", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job stock breakdown." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // STOCK BY JOB (one row per job holding job-direct stock)
        // GET: api/stockbalance/by-job
        // ═══════════════════════════════════════════════════════
        [HttpGet("by-job")]
        public async Task<IActionResult> GetStockByJob([FromQuery] string? searchText = null)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<StockByJobRow>("sp_GetStockByJob", new
                {
                    SearchText = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim()
                });
                return Ok(rows ?? Enumerable.Empty<StockByJobRow>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockBalance", action: "GetStockByJob", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving stock by job." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // JOB STOCK ITEMS (item-level drill-down for one job)
        // GET: api/stockbalance/job-items?jobId=...
        // (JobId is a free-form string, so it is passed via query string)
        // ═══════════════════════════════════════════════════════
        [HttpGet("job-items")]
        public async Task<IActionResult> GetJobStockItems([FromQuery] string jobId)
        {
            if (string.IsNullOrWhiteSpace(jobId))
                return BadRequest(new { message = "jobId is required." });
            try
            {
                var rows = await _dbcon.QueryAsync<JobStockLine>("sp_GetJobStockItems", new { JobId = jobId.Trim() });
                return Ok(rows ?? Enumerable.Empty<JobStockLine>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockBalance", action: "GetJobStockItems", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job stock items." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // STOCK LEDGER (history for one item)
        // GET: api/stockbalance/item/{itemId}/ledger
        // ═══════════════════════════════════════════════════════
        [HttpGet("item/{itemId:int}/ledger")]
        public async Task<IActionResult> GetLedger(
            int     itemId,
            [FromQuery] string? dateFrom = null,
            [FromQuery] string? dateTo   = null,
            [FromQuery] int     page     = 1,
            [FromQuery] int     pageSize = 50)
        {
            try
            {
                var p = new
                {
                    ItemId     = itemId,
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber = page < 1 ? 1 : page,
                    PageSize   = pageSize is < 1 or > 500 ? 50 : pageSize
                };
                var rows = await _dbcon.QueryAsync<StockLedger>("sp_GetStockLedger", p);
                var list = rows?.ToList() ?? new List<StockLedger>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { totalRows = total, page, pageSize, data = list });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "StockBalance", action: "GetLedger", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving stock ledger." });
            }
        }
    }
}
