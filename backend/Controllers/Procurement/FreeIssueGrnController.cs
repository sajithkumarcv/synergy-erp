using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Procurement
{
    using FreeIssueGrnHeader        = ERPWEB.Models.Procurement.FreeIssueGrnHeader;
    using FreeIssueGrnLine          = ERPWEB.Models.Procurement.FreeIssueGrnLine;
    using FreeIssueGrnStatusRequest = ERPWEB.Models.Procurement.FreeIssueGrnStatusRequest;
    using FreeIssueGrnCancelRequest = ERPWEB.Models.Procurement.FreeIssueGrnCancelRequest;
    using FreeIssueGrnReviseRequest = ERPWEB.Models.Procurement.FreeIssueGrnReviseRequest;
    using FreeIssueGrnRevision      = ERPWEB.Models.Procurement.FreeIssueGrnRevision;

    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class FreeIssueGrnController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public FreeIssueGrnController(DbCon dbcon) { _dbcon = dbcon; }

        // ── SEARCH ───────────────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] string? createdBy  = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "ReceiptDate",
            [FromQuery] string  sortDir    = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    Status        = string.IsNullOrWhiteSpace(status)     ? null : status,
                    JobId         = string.IsNullOrWhiteSpace(jobId)      ? null : jobId.Trim(),
                    CreatedBy     = string.IsNullOrWhiteSpace(createdBy)  ? null : createdBy.Trim(),
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom)   ? null : dateFrom,
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)     ? null : dateTo,
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                };

                var rows  = await _dbcon.QueryAsync<FreeIssueGrnHeader>("sp_SearchFreeIssueGrns", p);
                var list  = rows?.ToList() ?? new List<FreeIssueGrnHeader>();
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
                await _dbcon.WriteLog(ex, controller: "FreeIssueGrn", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching Free Issue GRNs." });
            }
        }

        // ── GET BY ID ────────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                var rows   = await _dbcon.QueryAsync<FreeIssueGrnHeader>("sp_GetFreeIssueGrn", new { FreeIssueGrnId = id });
                var record = rows?.FirstOrDefault();
                if (record == null) return NotFound(new { message = "Free Issue GRN not found." });
                return Ok(record);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "FreeIssueGrn", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching Free Issue GRN." });
            }
        }

        // ── SAVE (header) ────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] FreeIssueGrnHeader model)
        {
            try
            {
                var p = new
                {
                    model.FreeIssueGrnId,
                    model.JobId,
                    model.ReceiptDate,
                    model.ReceivedBy,
                    model.BriefDescription,
                    model.DetailedDescription,
                    model.DeliveredBy,
                    model.Remarks,
                    model.BoeNo,
                    model.BoeDate,
                    model.DeliveryNoteFilePath,
                    model.CreatedBy,
                    model.ModifiedBy
                };

                string result = await _dbcon.ExecuteScalarAsync("sp_SetFreeIssueGrn", p);
                return Ok(new { id = result, message = model.FreeIssueGrnId == 0 ? "Free Issue GRN created" : "Free Issue GRN updated" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "FreeIssueGrn", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving Free Issue GRN." });
            }
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteFreeIssueGrn", new { FreeIssueGrnId = id });
                if (result == "NotExists")    return NotFound(new { message = "Free Issue GRN not found." });
                if (result == "CannotDelete") return BadRequest(new { message = "Only Draft records can be deleted." });
                return Ok(new { id, message = "Free Issue GRN deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "FreeIssueGrn", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting Free Issue GRN." });
            }
        }

        // ── CHANGE STATUS ────────────────────────────────────────────────────
        [HttpPost("changestatus")]
        public async Task<IActionResult> ChangeStatus([FromBody] FreeIssueGrnStatusRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ChangeFreeIssueGrnStatus", new
                {
                    FreeIssueGrnId = model.Id,
                    NewStatus      = model.Status,
                    model.ChangedBy
                });
                return Ok(new { message = $"Status updated to {model.Status}" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "FreeIssueGrn", action: "ChangeStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error changing status." });
            }
        }

        // ── CANCEL ───────────────────────────────────────────────────────────
        [HttpPost("{id:int}/cancel")]
        public async Task<IActionResult> Cancel(int id, [FromBody] FreeIssueGrnCancelRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.CancelledBy))
                return BadRequest(new { message = "CancelledBy is required." });
            if (string.IsNullOrWhiteSpace(model.Reason))
                return BadRequest(new { message = "Cancellation reason is required." });
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_CancelFreeIssueGrn", new
                {
                    FreeIssueGrnId = id,
                    CancelledBy    = model.CancelledBy,
                    Reason         = model.Reason.Trim()
                });
                return Ok(new { message = "Free Issue GRN cancelled successfully." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "FreeIssueGrn", action: "Cancel", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error cancelling Free Issue GRN." });
            }
        }

        // ── REVISE (Confirmed → Draft, logged) ───────────────────────────────
        [HttpPost("{id:int}/revise")]
        public async Task<IActionResult> Revise(int id, [FromBody] FreeIssueGrnReviseRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.RevisedBy))
                return BadRequest(new { message = "RevisedBy is required." });
            if (string.IsNullOrWhiteSpace(model.Reason))
                return BadRequest(new { message = "A revision reason is required." });
            try
            {
                var revNo = await _dbcon.ExecuteScalarAsync("sp_ReviseFreeIssueGrn", new
                {
                    FreeIssueGrnId = id,
                    RevisedBy      = model.RevisedBy,
                    Reason         = model.Reason.Trim()
                });
                return Ok(new { revisionNo = revNo, message = "GRN reopened for editing (Draft)." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "FreeIssueGrn", action: "Revise", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error revising Free Issue GRN." });
            }
        }

        // ── REVISION HISTORY ─────────────────────────────────────────────────
        [HttpGet("{id:int}/revisions")]
        public async Task<IActionResult> GetRevisions(int id)
        {
            try
            {
                var list = await _dbcon.QueryAsync<FreeIssueGrnRevision>("sp_GetFreeIssueGrnRevisions", new { FreeIssueGrnId = id });
                return Ok(list ?? new List<FreeIssueGrnRevision>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "FreeIssueGrn", action: "GetRevisions", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching revision history." });
            }
        }

        // ── LINES ────────────────────────────────────────────────────────────
        [HttpGet("lines/{grnId:int}")]
        public async Task<IActionResult> GetLines(int grnId)
        {
            try
            {
                var list = await _dbcon.QueryAsync<FreeIssueGrnLine>("sp_GetFreeIssueGrnLines", new { FreeIssueGrnId = grnId });
                return Ok(list ?? new List<FreeIssueGrnLine>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "FreeIssueGrn", action: "GetLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching lines." });
            }
        }

        [HttpPost("lines/save")]
        public async Task<IActionResult> SaveLine([FromBody] FreeIssueGrnLine model)
        {
            if (string.IsNullOrWhiteSpace(model.Description))
                return BadRequest(new { message = "Line description is required." });
            try
            {
                var p = new
                {
                    model.FreeIssueGrnDetailId,
                    model.FreeIssueGrnId,
                    model.LineNum,
                    model.Description,
                    model.Qty,
                    model.UomName,
                    model.Remarks,
                    model.CreatedBy,
                    model.ModifiedBy
                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetFreeIssueGrnLine", p);
                return Ok(new { id = result, message = "Line saved successfully" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "FreeIssueGrn", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving line." });
            }
        }

        [HttpDelete("lines/{id:int}")]
        public async Task<IActionResult> DeleteLine(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteFreeIssueGrnLine", new { FreeIssueGrnDetailId = id });
                if (result == "NotExists") return NotFound(new { message = "Line not found." });
                return Ok(new { id, message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "FreeIssueGrn", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting line." });
            }
        }
    }
}
