using ERPWEB.Dbcontext;
using ERPWEB.Models.Bom;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Bom
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class BomController : ControllerBase
    {
        private readonly DbCon _db;
        public BomController(DbCon db) { _db = db; }

        private static string Sha256Hex(string raw)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw ?? string.Empty));
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        // ── BOM List ─────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText,
            [FromQuery] string? jobId,
            [FromQuery] string? bomStatus,      // CSV of statuses (a single value still works)
            [FromQuery] string? jobTypeIds,     // CSV of JobTypeId
            [FromQuery] int? customerId,
            [FromQuery] string? dateFrom,
            [FromQuery] string? dateTo,
            [FromQuery] bool excludeClosedStatus = false,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            [FromQuery] string sortColumn = "BomDate",
            [FromQuery] string sortDirection = "DESC")
        {
            try
            {
                var rows = await _db.QueryAsync<BomHeader>("sp_SearchBoms", new
                {
                    SearchText           = searchText,
                    JobId                = jobId,
                    BomStatus            = bomStatus,
                    JobTypeIds           = jobTypeIds,
                    CustomerId           = customerId,
                    DateFrom             = string.IsNullOrEmpty(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo               = string.IsNullOrEmpty(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    ExcludeClosedStatus  = excludeClosedStatus,
                    PageNumber           = page,
                    PageSize             = pageSize,
                    // The grid sorts; sp_SearchBoms whitelists the column name and
                    // falls back to BomDate DESC for anything it doesn't recognise.
                    SortColumn           = sortColumn,
                    SortDirection        = sortDirection
                });
                var list  = rows.ToList();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { data = list, totalRows = total });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching BOM list." });
            }
        }

        // ── Get Single BOM (header + details) ────────────────────
        [HttpGet("{bomHeaderId:int}")]
        public async Task<IActionResult> Get(int bomHeaderId)
        {
            try
            {
                var (headers, details) = await _db.QueryMultipleAsync<BomHeader, BomDetail>(
                    "sp_GetBomWithDetails", new { BomHeaderId = bomHeaderId });
                var header = headers.FirstOrDefault();
                if (header == null) return NotFound(new { message = "BOM not found." });
                return Ok(new { header, details });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching BOM." });
            }
        }

        // ── Save BOM Header ───────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveBomHeaderRequest req)
        {
            try
            {
                var result = await _db.QueryFirstAsync<dynamic>("sp_SetBomHeader", new
                {
                    BomHeaderId    = req.BomHeaderId,
                    JobId          = req.JobId,
                    JobTypeId      = req.JobTypeId,
                    BomDate        = string.IsNullOrEmpty(req.BomDate) ? (DateTime?)null : DateTime.Parse(req.BomDate),
                    BomDescription = req.BomDescription,
                    BomVersion     = req.BomVersion,
                    CreatedBy      = req.CreatedBy,
                    ModifiedBy     = req.ModifiedBy
                });
                return Ok(new { bomHeaderId = (int)result.BomHeaderId });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "Save", requestPath: HttpContext.Request.Path);
                return BadRequest(new { message = ex.Message });
            }
        }

        // ── Delete BOM Header ─────────────────────────────────────
        [HttpDelete("{bomHeaderId:int}")]
        public async Task<IActionResult> Delete(int bomHeaderId, [FromBody] DeleteBomRequest req)
        {
            try
            {
                await _db.QueryFirstAsync<dynamic>("sp_DeleteBomHeader", new
                {
                    BomHeaderId = bomHeaderId,
                    ModifiedBy  = req.ModifiedBy
                });
                return Ok(new { success = true });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting BOM." });
            }
        }

        // ── Approve / Unapprove ───────────────────────────────────
        [HttpPost("{bomHeaderId:int}/approve")]
        public async Task<IActionResult> Approve(int bomHeaderId, [FromBody] ApproveBomRequest req)
        {
            try
            {
                var result = await _db.QueryFirstAsync<dynamic>("sp_ApproveBom", new
                {
                    BomHeaderId = bomHeaderId,
                    Action      = req.Action,
                    ApprovedBy  = req.ApprovedBy
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "Approve", requestPath: HttpContext.Request.Path);
                return BadRequest(new { message = ex.Message });
            }
        }

        // ── Revise approved BOM back to Draft ────────────────────
        [HttpPost("{bomHeaderId:int}/revise")]
        public async Task<IActionResult> Revise(int bomHeaderId, [FromBody] ReviseBomRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.RevisedBy))
                return BadRequest(new { message = "RevisedBy is required." });
            if (string.IsNullOrWhiteSpace(req.Reason))
                return BadRequest(new { message = "A reason is required to revise the BOM." });
            if (string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { message = "Password is required." });
            try
            {
                await _db.QueryFirstAsync<dynamic>("sp_ReviseBom", new
                {
                    BomHeaderId   = bomHeaderId,
                    RevisedBy     = req.RevisedBy,
                    Reason        = req.Reason,
                    PasswordHash  = Sha256Hex(req.Password),
                });
                return Ok(new { message = "BOM revised back to Draft. You can now edit and re-submit for approval." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "Revise", requestPath: HttpContext.Request.Path);
                return BadRequest(new { message = ex.Message });
            }
        }

        // ── Reorder BOM detail lines ──────────────────────────────
        [HttpPost("detail/reorder")]
        public async Task<IActionResult> ReorderDetails([FromBody] ReorderBomRequest req)
        {
            if (req.BomHeaderId <= 0 || req.Order == null || req.Order.Count == 0)
                return BadRequest(new { message = "BomHeaderId and Order list are required." });
            try
            {
                var orderJson = System.Text.Json.JsonSerializer.Serialize(
                    req.Order.Select(o => new { bomId = o.BomId, sortOrder = o.SortOrder }));
                await _db.ExecuteScalarAsync("sp_ReorderBomDetails", new
                {
                    BomHeaderId = req.BomHeaderId,
                    OrderJson   = orderJson,
                    ModifiedBy  = req.ModifiedBy
                });
                return Ok(new { message = "Lines reordered." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "ReorderDetails", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error reordering BOM lines." });
            }
        }

        // ── Sections lookup ───────────────────────────────────────
        [HttpGet("sections")]
        public async Task<IActionResult> GetSections([FromQuery] string? jobTypeId)
        {
            try
            {
                var rows = await _db.QueryAsync<BomSection>("sp_GetBomSections", new { JobTypeId = jobTypeId });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "GetSections", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching BOM sections." });
            }
        }

        // ── Save BOM Detail line ──────────────────────────────────
        [HttpPost("detail/save")]
        public async Task<IActionResult> SaveDetail([FromBody] SaveBomDetailRequest req)
        {
            try
            {
                var result = await _db.QueryFirstAsync<dynamic>("sp_SetBomDetail", new
                {
                    BomId               = req.BomId,
                    BomHeaderId         = req.BomHeaderId,
                    JobId               = req.JobId,
                    BomSectionId        = req.BomSectionId,
                    ItemId              = req.ItemId,
                    ItemDetailId        = req.ItemDetailId,
                    SortOrder           = req.SortOrder,
                    BomRequestedQty     = req.BomRequestedQty,
                    UomId               = req.UomId,
                    BomPrice            = req.BomPrice,
                    CurrencyId          = req.CurrencyId,
                    ExchangeRate        = req.ExchangeRate,
                    ItemReqDate         = string.IsNullOrEmpty(req.ItemReqDate)      ? (DateTime?)null : DateTime.Parse(req.ItemReqDate),
                    ExpectedDelivery    = string.IsNullOrEmpty(req.ExpectedDelivery) ? (DateTime?)null : DateTime.Parse(req.ExpectedDelivery),
                    IsCritical          = req.IsCritical,
                    IsSubstituteAllowed = req.IsSubstituteAllowed,
                    Remarks             = req.Remarks,
                    CreatedBy           = req.CreatedBy,
                    ModifiedBy          = req.ModifiedBy
                });
                return Ok(new { bomId = (int)result.BomId });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "SaveDetail", requestPath: HttpContext.Request.Path);
                return BadRequest(new { message = ex.Message });
            }
        }

        // ── Item defaults (UOM + last purchase price) ────────────
        [HttpGet("item-defaults/{itemId:int}")]
        public async Task<IActionResult> GetItemDefaults(int itemId)
        {
            try
            {
                var rows = await _db.QueryAsync<dynamic>("sp_GetItemDefaults", new { ItemId = itemId });
                var row  = rows?.FirstOrDefault();
                if (row == null) return NotFound(new { message = "Item not found." });
                return Ok(new
                {
                    baseUomId         = (int?)row.BaseUomId,
                    baseUomCode       = (string?)row.BaseUomCode,
                    lastPurchasePrice = (decimal?)row.LastPurchasePrice,
                    lastPriceCurrency = (string?)row.LastPriceCurrency,
                });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "GetItemDefaults", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching item defaults." });
            }
        }

        // ── Copy BOM to another job ───────────────────────────────
        [HttpPost("copy")]
        public async Task<IActionResult> Copy([FromBody] CopyBomRequest req)
        {
            if (req.SourceBomHeaderId <= 0)
                return BadRequest(new { message = "SourceBomHeaderId is required." });
            if (string.IsNullOrWhiteSpace(req.TargetJobId))
                return BadRequest(new { message = "TargetJobId is required." });
            try
            {
                var result = await _db.QueryFirstAsync<dynamic>("sp_CopyBom", new
                {
                    SourceBomHeaderId = req.SourceBomHeaderId,
                    TargetJobId       = req.TargetJobId,
                    CreatedBy         = req.CreatedBy,
                });
                return Ok(new { newBomHeaderId = (int)result.NewBomHeaderId });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "Copy", requestPath: HttpContext.Request.Path);
                return BadRequest(new { message = ex.Message });
            }
        }

        // ── Delete BOM Detail line ────────────────────────────────
        [HttpDelete("detail/{bomId:int}")]
        public async Task<IActionResult> DeleteDetail(int bomId, [FromBody] DeleteBomRequest req)
        {
            try
            {
                await _db.QueryFirstAsync<dynamic>("sp_DeleteBomDetail", new
                {
                    BomId      = bomId,
                    ModifiedBy = req.ModifiedBy
                });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "DeleteDetail", requestPath: HttpContext.Request.Path);
                return BadRequest(new { message = ex.Message });
            }
        }

        // ── Bulk import BOM lines from Excel ──────────────────────
        // One sp_ImportBomDetail call per row: the proc always returns a
        // (Success, Message) row rather than throwing, so a bad line reports
        // itself and the rest of the sheet still imports. Same shape as
        // JobBudgetController.ImportItems.
        [HttpPost("detail/import")]
        public async Task<IActionResult> ImportDetails([FromBody] BomImportRequest req)
        {
            if (req.BomHeaderId <= 0)
                return BadRequest(new { message = "BomHeaderId is required." });
            if (req.Rows == null || req.Rows.Count == 0)
                return BadRequest(new { message = "No rows to import." });

            try
            {
                var results = new List<object>();
                int ok = 0, fail = 0, n = 0;

                foreach (var row in req.Rows)
                {
                    n++;
                    try
                    {
                        DateTime? reqDate = string.IsNullOrWhiteSpace(row.ReqDate)
                            ? (DateTime?)null
                            : DateTime.Parse(row.ReqDate);

                        var rs = await _db.QueryAsync<dynamic>("sp_ImportBomDetail", new
                        {
                            req.BomHeaderId,
                            Section    = string.IsNullOrWhiteSpace(row.Section) ? null : row.Section.Trim(),
                            ItemCode   = row.ItemCode?.Trim(),
                            row.Qty,
                            Uom        = string.IsNullOrWhiteSpace(row.Uom) ? null : row.Uom.Trim(),
                            row.UnitPrice,
                            ReqDate    = reqDate,
                            row.IsCritical,
                            Remarks    = string.IsNullOrWhiteSpace(row.Remarks) ? null : row.Remarks.Trim(),
                            By         = req.ImportedBy
                        });

                        var r = rs?.FirstOrDefault();
                        bool success = r != null && Convert.ToBoolean(r.Success);
                        string msg   = (string?)r?.Message ?? "Unknown error";
                        if (success) ok++; else fail++;
                        results.Add(new { rowNumber = n, itemCode = row.ItemCode, section = row.Section, success, message = msg });
                    }
                    catch (Microsoft.Data.SqlClient.SqlException sqlRow) when (sqlRow.Number >= 50000)
                    {
                        // Business-rule THROW for this row (e.g. a closed job) → its message, not an error.
                        fail++;
                        results.Add(new { rowNumber = n, itemCode = row.ItemCode, section = row.Section, success = false, message = sqlRow.Message });
                    }
                    catch (Exception exRow)
                    {
                        await _db.WriteLog(exRow, controller: "Bom", action: "ImportDetails.Row", requestPath: HttpContext.Request.Path);
                        fail++;
                        results.Add(new { rowNumber = n, itemCode = row.ItemCode, section = row.Section, success = false, message = "Row failed — see application log." });
                    }
                }

                return Ok(new { successCount = ok, failCount = fail, results });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Bom", action: "ImportDetails", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error importing BOM lines." });
            }
        }
    }
}
