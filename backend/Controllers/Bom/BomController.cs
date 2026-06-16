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
            [FromQuery] string? bomStatus,
            [FromQuery] string? dateFrom,
            [FromQuery] string? dateTo,
            [FromQuery] bool excludeClosedStatus = false,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                var rows = await _db.QueryAsync<BomHeader>("sp_SearchBoms", new
                {
                    SearchText           = searchText,
                    JobId                = jobId,
                    BomStatus            = bomStatus,
                    DateFrom             = string.IsNullOrEmpty(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo               = string.IsNullOrEmpty(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    ExcludeClosedStatus  = excludeClosedStatus,
                    PageNumber           = page,
                    PageSize             = pageSize,
                    SortColumn           = "BomDate",
                    SortDirection        = "DESC"
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
    }
}
