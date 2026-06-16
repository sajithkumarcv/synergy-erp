using ERPWEB.Dbcontext;
using ERPWEB.Models.Procurement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Procurement
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class RtvController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public RtvController(DbCon dbcon) { _dbcon = dbcon; }

        private static string Sha256Hex(string raw)
        {
            using var sha = SHA256.Create();
            var bytes     = sha.ComputeHash(Encoding.UTF8.GetBytes(raw ?? string.Empty));
            var sb        = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        // ── SEARCH ───────────────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText = null,
            [FromQuery] string? status     = null,
            [FromQuery] int?    supplierId = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string? sortCol    = "RtvDate",
            [FromQuery] string? sortDir    = "DESC")
        {
            var allowedCols = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                { "RtvNumber", "RtvDate", "SupplierName", "GrnNumber", "PoNumber", "TotalAmount", "Status", "CreatedBy" };
            var safeSortCol = allowedCols.Contains(sortCol ?? "") ? sortCol! : "RtvDate";
            var safeSortDir = string.Equals(sortDir, "ASC", StringComparison.OrdinalIgnoreCase) ? "ASC" : "DESC";

            try
            {
                var p = new
                {
                    SearchText     = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    Status         = string.IsNullOrWhiteSpace(status)     ? null : status,
                    SupplierId     = supplierId,
                    DateFrom       = string.IsNullOrWhiteSpace(dateFrom)   ? null : dateFrom,
                    DateTo         = string.IsNullOrWhiteSpace(dateTo)     ? null : dateTo,
                    PageNumber     = page < 1 ? 1 : page,
                    PageSize       = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn     = safeSortCol,
                    SortDirection  = safeSortDir
                };
                var rows  = await _dbcon.QueryAsync<RtvHeader>("sp_SearchRTVs", p);
                var list  = rows?.ToList() ?? new List<RtvHeader>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new
                {
                    totalRows  = total,
                    page,
                    pageSize,
                    totalPages = (int)Math.Ceiling((double)total / pageSize),
                    data       = list
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Rtv", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching RTVs." });
            }
        }

        // ── GET BY ID ────────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                var rows   = await _dbcon.QueryAsync<RtvHeader>("sp_GetRTV", new { RtvId = id });
                var record = rows?.FirstOrDefault();
                if (record == null) return NotFound(new { message = "RTV not found." });
                return Ok(record);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Rtv", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching RTV." });
            }
        }

        // ── SAVE HEADER ──────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] RtvSaveRequest model)
        {
            // C-2: Basic model validation
            if (model.RtvDate == default)
                return BadRequest(new { message = "RTV Date is required." });
            if (model.RtvId == 0 && string.IsNullOrWhiteSpace(model.CreatedBy))
                return BadRequest(new { message = "CreatedBy is required." });

            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_SetRTV", new
                {
                    model.RtvId,
                    RtvDate      = model.RtvDate == default ? DateTime.Today : model.RtvDate,
                    GrnId        = model.GrnId      == 0 ? (int?)null : model.GrnId,
                    SupplierId   = model.SupplierId == 0 ? (int?)null : model.SupplierId,
                    PoId         = model.PoId       == 0 ? (int?)null : model.PoId,
                    model.JobId,
                    model.ReturnReason,
                    model.Remarks,
                    model.CreatedBy,
                    model.ModifiedBy
                });
                return Ok(new { id = result, message = model.RtvId == 0 ? "RTV created." : "RTV updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                // SP raises business-rule errors (non-Draft, not found, etc.) — surface them as 400
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Rtv", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving RTV." });
            }
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeleteRTV", new { RtvId = id });
                return Ok(new { message = "RTV deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Rtv", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting RTV." });
            }
        }

        // ── POST (Draft → Posted) ────────────────────────────────────────────
        [HttpPost("{id:int}/post")]
        public async Task<IActionResult> Post(int id, [FromBody] RtvPostRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.PostedBy)) return BadRequest(new { message = "PostedBy is required." });
            if (string.IsNullOrWhiteSpace(model.Reason))   return BadRequest(new { message = "A reason is required to post the RTV." });
            if (string.IsNullOrWhiteSpace(model.Password)) return BadRequest(new { message = "Password is required." });
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_PostRTV", new
                {
                    RtvId        = id,
                    PostedBy     = model.PostedBy.Trim(),
                    Reason       = model.Reason.Trim(),
                    PasswordHash = Sha256Hex(model.Password)
                });
                return Ok(new { message = "RTV posted. Stock ledger updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Rtv", action: "Post", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error posting RTV." });
            }
        }

        // ── GET LINES ────────────────────────────────────────────────────────
        [HttpGet("{id:int}/lines")]
        public async Task<IActionResult> GetLines(int id)
        {
            try
            {
                var list = await _dbcon.QueryAsync<RtvLine>("sp_GetRTVLines", new { RtvId = id });
                return Ok(list ?? Enumerable.Empty<RtvLine>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Rtv", action: "GetLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching RTV lines." });
            }
        }

        // ── SAVE LINE ────────────────────────────────────────────────────────
        [HttpPost("lines/save")]
        public async Task<IActionResult> SaveLine([FromBody] RtvLineSaveRequest model)
        {
            // C-3: Basic model validation
            if (model.RtvId <= 0)
                return BadRequest(new { message = "RtvId is required." });
            if (model.ReturnQty <= 0)
                return BadRequest(new { message = "Return qty must be greater than zero." });
            if (model.UnitCost < 0)
                return BadRequest(new { message = "Unit cost cannot be negative." });

            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_SetRTVLine", new
                {
                    model.RtvLineId,
                    model.RtvId,
                    GrnDetailId = model.GrnDetailId == 0 ? (int?)null : model.GrnDetailId,
                    PoLineId    = model.PoLineId    == 0 ? (int?)null : model.PoLineId,
                    PrLineId    = model.PrLineId    == 0 ? (int?)null : model.PrLineId,
                    ItemId      = model.ItemId      == 0 ? (int?)null : model.ItemId,
                    model.ItemCode,
                    model.ItemDesc,
                    model.ReturnQty,
                    UomId       = model.UomId       == 0 ? (int?)null : model.UomId,
                    model.UomName,
                    model.UnitCost,
                    model.ReturnReason,
                    model.CreatedBy,
                    model.ModifiedBy
                });
                return Ok(new { id = result, message = "Line saved." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Rtv", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving RTV line." });
            }
        }

        // ── DELETE LINE ──────────────────────────────────────────────────────
        [HttpDelete("lines/{lineId:int}")]
        public async Task<IActionResult> DeleteLine(int lineId)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeleteRTVLine", new { RtvLineId = lineId });
                return Ok(new { message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Rtv", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting RTV line." });
            }
        }

        // ── GET GRN LINES FOR IMPORT ─────────────────────────────────────────
        [HttpGet("grn-lines/{grnId:int}")]
        public async Task<IActionResult> GetGrnLines(int grnId)
        {
            // C-5: grnId must be valid
            if (grnId <= 0)
                return BadRequest(new { message = "Invalid GRN ID." });

            try
            {
                var list = await _dbcon.QueryAsync<RtvGrnLine>("sp_GetGRNLinesForRTV", new { GrnId = grnId });
                return Ok(list ?? Enumerable.Empty<RtvGrnLine>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Rtv", action: "GetGrnLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching GRN lines." });
            }
        }
    }
}
