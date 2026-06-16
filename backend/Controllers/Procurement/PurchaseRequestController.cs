using Dapper;
using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Procurement
{
    using PurchaseRequest     = ERPWEB.Models.Procurement.PurchaseRequest;
    using PurchaseRequestLine = ERPWEB.Models.Procurement.PurchaseRequestLine;
    using StatusChangeRequest = ERPWEB.Models.Procurement.StatusChangeRequest;

    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class PurchaseRequestController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public PurchaseRequestController(DbCon dbcon) { _dbcon = dbcon; }

        // ── SEARCH ───────────────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> SearchPRs(
            [FromQuery] string? searchText = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? priority   = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] string? createdBy  = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "PrDate",
            [FromQuery] string  sortDir    = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    Status        = string.IsNullOrWhiteSpace(status)    ? null : status,
                    Priority      = string.IsNullOrWhiteSpace(priority)  ? null : priority,
                    JobId         = string.IsNullOrWhiteSpace(jobId)     ? null : jobId.Trim(),
                    CreatedBy     = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                };

                var rows  = await _dbcon.QueryAsync<PurchaseRequest>("sp_SearchPRs", p);
                var list  = rows?.ToList() ?? new List<PurchaseRequest>();
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
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "SearchPRs", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching purchase requests." });
            }
        }

        // ── GET BY ID ────────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetPR(int id)
        {
            try
            {
                var rows   = await _dbcon.QueryAsync<PurchaseRequest>("sp_GetPR", new { PrId = id });
                var record = rows?.FirstOrDefault();
                if (record == null) return NotFound(new { message = "Purchase Request not found." });
                return Ok(record);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "GetPR", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching purchase request." });
            }
        }

        // ── SAVE ─────────────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> SetPR([FromBody] PurchaseRequest model)
        {
            if (string.IsNullOrEmpty(model.RequestedBy))
                return BadRequest(new { message = "Requested By is required." });
            try
            {
                var p = new
                {
                    model.PrId,
                    model.PrDate,
                    model.RequestedBy,
                    model.JobId,
                    model.Priority,
                    model.Notes,
                    model.CreatedBy,
                    model.ModifiedBy
                };

                string result = await _dbcon.ExecuteScalarAsync("sp_SetPR", p);
                return Ok(new { id = result, message = model.PrId == 0 ? "Purchase Request created" : "Purchase Request updated" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "SetPR", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving purchase request." });
            }
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeletePR(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeletePR", new { PrId = id });
                if (result == "NotExists")    return NotFound(new { message = "Purchase Request not found." });
                if (result == "CannotDelete") return BadRequest(new { message = "Only Draft purchase requests can be deleted." });
                return Ok(new { id, message = "Purchase Request deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "DeletePR", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting purchase request." });
            }
        }

        // ── CHANGE STATUS ────────────────────────────────────────────────────
        // PR status changes are controlled exclusively by the approval workflow.
        // Direct status changes are blocked — use POST /api/approval/action instead.
        [HttpPost("changestatus")]
        public IActionResult ChangeStatus() =>
            Conflict(new { message = "PR status changes are controlled by the approval workflow. Use POST /api/approval/action instead." });

        // ── REVISE ───────────────────────────────────────────────────────────
        [HttpPost("{id:int}/revise")]
        public async Task<IActionResult> RevisePR(int id, [FromBody] ERPWEB.Models.Procurement.RevisePrRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_RevisePR", new
                {
                    PrId      = id,
                    RevisedBy = model.RevisedBy,
                    Reason    = model.Reason,
                });
                return Ok(new { message = "PR revised. Status reset to Draft — edit lines then re-submit for approval." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "RevisePR", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error revising purchase request." });
            }
        }

        // ── CLOSE ────────────────────────────────────────────────────────────
        [HttpPost("{id:int}/close")]
        public async Task<IActionResult> ClosePR(int id, [FromBody] ERPWEB.Models.Procurement.RevisePrRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ClosePR", new
                {
                    PrId     = id,
                    Reason   = model.Reason,
                    ClosedBy = model.RevisedBy,
                });
                return Ok(new { message = "Purchase Request closed successfully." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "ClosePR", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error closing purchase request." });
            }
        }

        // ── BOM MATERIALS FOR IMPORT ─────────────────────────────────────────
        [HttpGet("bommaterials/{jobId}")]
        public async Task<IActionResult> GetBomMaterials(string jobId, [FromQuery] int prId = 0)
        {
            try
            {
                var list = await _dbcon.QueryAsync<dynamic>("sp_GetJobMaterialsForPR", new { JobId = jobId, PrId = prId });
                return Ok(list ?? new List<dynamic>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "GetBomMaterials", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching BOM materials." });
            }
        }

        // ── LINES ────────────────────────────────────────────────────────────
        [HttpGet("lines/{prId:int}")]
        public async Task<IActionResult> GetLines(int prId)
        {
            try
            {
                var list = await _dbcon.QueryAsync<PurchaseRequestLine>("sp_GetPRLines", new { PrId = prId });
                return Ok(list ?? new List<PurchaseRequestLine>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "GetLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching PR lines." });
            }
        }

        [HttpPost("lines/save")]
        public async Task<IActionResult> SaveLine([FromBody] PurchaseRequestLine model)
        {
            if (string.IsNullOrEmpty(model.ItemDesc))
                return BadRequest(new { message = "Item description is required." });
            try
            {
                var p = new
                {
                    model.PrLineId,
                    model.PrId,
                    model.ItemId,
                    model.ItemCode,
                    model.ItemDesc,
                    model.RequiredQty,
                    model.UomId,
                    model.UomName,
                    model.RequiredDate,
                    model.EstUnitPrice,
                    model.Remarks,
                    model.BomDetailId,
                    model.CreatedBy,
                    model.ModifiedBy
                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetPRLine", p);
                return Ok(new { id = result, message = "Line saved successfully" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving PR line." });
            }
        }

        [HttpDelete("lines/{id:int}")]
        public async Task<IActionResult> DeleteLine(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeletePRLine", new { PrLineId = id });
                if (result == "NotExists") return NotFound(new { message = "Line not found." });
                return Ok(new { id, message = "Line deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting PR line." });
            }
        }

        [HttpPost("lines/{id:int}/changestatus")]
        public async Task<IActionResult> ChangeLineStatus(int id, [FromBody] StatusChangeRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ChangePrLineStatus", new
                {
                    PrLineId  = id,
                    NewStatus = model.Status,
                    ChangedBy = model.ChangedBy,
                });
                return Ok(new { message = $"Line status updated to {model.Status}." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "ChangeLineStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error changing PR line status." });
            }
        }

        // ── POs RAISED FOR THIS PR ────────────────────────────────────────────
        [HttpGet("{prId:int}/pos")]
        public async Task<IActionResult> GetPosByPr(int prId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetPOsByPrId", new { PrId = prId });
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    poId          = (int)r.PoId,
                    poNumber      = (string)r.PoNumber,
                    poDate        = (DateTime?)r.PoDate,
                    status        = (string)r.Status,
                    vendorName    = (string?)r.VendorName,
                    jobId         = (string?)r.JobId,
                    totalAmount   = (decimal?)r.TotalAmount,
                    currencyShort = (string?)r.CurrencyShort,
                    revision      = (int?)r.Revision,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "GetPosByPr", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving POs for PR." });
            }
        }

        [HttpGet("history/{prId}")]
        public async Task<IActionResult> GetHistory(int prId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetPRHistory", new { PrId = prId });
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    entryType    = (string)r.EntryType,
                    entryId      = (int)r.EntryId,
                    revisionNo   = (int?)r.RevisionNo,
                    levelNo      = (int?)r.LevelNo,
                    action       = (string)r.Action,
                    actionBy     = (string)r.ActionBy,
                    actionByName = (string?)r.ActionByName,
                    actionDate   = (DateTime?)r.ActionDate,
                    remarks      = (string?)r.Remarks,
                    isDelegated  = (bool)r.IsDelegated,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseRequest", action: "GetHistory", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving PR history." });
            }
        }
    }
}
