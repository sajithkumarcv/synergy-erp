using System.Text.Json;
using ERPWEB.Dbcontext;
using ERPWEB.Models.Manhour;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Manhour
{
    [Authorize]
    [Route("api/manhour")]
    [ApiController]
    public class ManhourController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public ManhourController(DbCon dbcon) { _dbcon = dbcon; }

        // ── SEARCH / LIST ─────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? createdBy  = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "DocumentDate",
            [FromQuery] string  sortDir    = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    JobId         = string.IsNullOrWhiteSpace(jobId)      ? null : jobId.Trim(),
                    Status        = string.IsNullOrWhiteSpace(status)     ? null : status,
                    CreatedBy     = string.IsNullOrWhiteSpace(createdBy)  ? null : createdBy.Trim(),
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom)   ? null : dateFrom,
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)     ? null : dateTo,
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                };

                var rows  = await _dbcon.QueryAsync<ManhourBatch>("sp_SearchManhours", p);
                var list  = rows?.ToList() ?? new List<ManhourBatch>();
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
                await _dbcon.WriteLog(ex, controller: "Manhour", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching manhour records." });
            }
        }

        // ── GET BY BATCH ID ───────────────────────────────────────────────
        [HttpGet("{batchId:int}")]
        public async Task<IActionResult> GetById(int batchId)
        {
            try
            {
                using var multi = await _dbcon.QueryMultipleAsync("sp_GetManhour", new { BatchId = batchId });
                var batch = (await multi.ReadAsync<ManhourBatch>()).FirstOrDefault();
                if (batch == null) return NotFound(new { message = "Manhour batch not found." });
                var rows  = (await multi.ReadAsync<ManhourRow>()).ToList();

                return Ok(new { batch, rows });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Manhour", action: "GetById", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching manhour record." });
            }
        }

        // ── SAVE (create or replace batch) ────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveManhourRequest req)
        {
            try
            {
                if (req.Lines == null || req.Lines.Count == 0)
                    return BadRequest(new { message = "At least one detail line is required." });

                var errors = new List<string>();
                for (int i = 0; i < req.Lines.Count; i++)
                {
                    var ln = req.Lines[i];
                    if (string.IsNullOrWhiteSpace(ln.JobId)) errors.Add($"Row {i + 1}: Job ID is required.");
                    if (ln.EmployeeId <= 0)                  errors.Add($"Row {i + 1}: Employee is required.");
                    if (ln.Hours <= 0)                       errors.Add($"Row {i + 1}: Hours must be greater than 0.");
                    if (ln.Hours > 24)                       errors.Add($"Row {i + 1}: Hours cannot exceed 24.");
                    if (ln.OvertimeHours < 0)                errors.Add($"Row {i + 1}: OT hours cannot be negative.");
                    if (ln.Hours + ln.OvertimeHours > 24)    errors.Add($"Row {i + 1}: Total hours (regular + OT) cannot exceed 24.");
                }
                if (errors.Count > 0)
                    return BadRequest(new { message = "Validation failed.", errors });

                // Duplicate: same job + employee in one upload
                var dupes = req.Lines
                    .GroupBy(l => new { JobId = l.JobId.ToUpper(), l.EmployeeId })
                    .Where(g => g.Count() > 1)
                    .Select(g => $"Job {g.Key.JobId} / Employee {g.Key.EmployeeId} appears more than once.")
                    .ToList();
                if (dupes.Count > 0)
                    return BadRequest(new { message = "Duplicate entries detected.", errors = dupes });

                var linesJson = JsonSerializer.Serialize(req.Lines.Select(l => new
                {
                    jobId         = l.JobId,
                    employeeId    = l.EmployeeId,
                    hours         = l.Hours,
                    overtimeHours = l.OvertimeHours,
                    site          = l.Site,
                    mType         = l.MType,
                    remarks       = l.Remarks
                }));

                var p = new
                {
                    BatchId          = req.BatchId.HasValue && req.BatchId > 0 ? req.BatchId : null,
                    DocumentDate     = req.DocumentDate,
                    Remarks          = req.Remarks,
                    UploadedFileName = req.UploadedFileName,
                    SavedBy          = req.SavedBy,
                    Lines            = linesJson
                };

                var resultRows = await _dbcon.QueryAsync<dynamic>("sp_SaveManhour", p);
                var result     = resultRows?.FirstOrDefault();

                // SP returns BatchId = -1 when a closed-job block fires
                if ((int)result!.BatchId < 0)
                    return BadRequest(new { message = (string)result.ErrorMessage });

                return Ok(new
                {
                    batchId    = (int)result.BatchId,
                    documentNo = (string)result.DocumentNo,
                    status     = (string)result.Status
                });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                await _dbcon.WriteLog(sqlEx, controller: "Manhour", action: "Save", requestPath: HttpContext.Request.Path);
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Manhour", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving manhour batch." });
            }
        }

        // ── DELETE ────────────────────────────────────────────────────────
        [HttpDelete("{batchId:int}")]
        public async Task<IActionResult> Delete(int batchId, [FromQuery] string deletedBy)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deletedBy))
                    return BadRequest(new { message = "deletedBy is required." });

                await _dbcon.QueryAsync<dynamic>("sp_DeleteManhour", new
                {
                    BatchId   = batchId,
                    DeletedBy = deletedBy
                });
                return Ok(new { message = "Deleted successfully." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                await _dbcon.WriteLog(sqlEx, controller: "Manhour", action: "Delete", requestPath: HttpContext.Request.Path);
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Manhour", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting manhour batch." });
            }
        }

        // ── DELETE SINGLE LINE ────────────────────────────────────────────────
        [HttpDelete("line/{manhourId:int}")]
        public async Task<IActionResult> DeleteLine(int manhourId, [FromQuery] string deletedBy)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(deletedBy))
                    return BadRequest(new { message = "deletedBy is required." });

                var result = await _dbcon.QueryFirstAsync<dynamic>("sp_DeleteManhourLine", new
                {
                    ManhourId = manhourId,
                    DeletedBy = deletedBy
                });

                if ((int)result.Result < 0)
                    return BadRequest(new { message = (string)result.Message });

                return Ok(new { message = (string)result.Message });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Manhour", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting manhour line." });
            }
        }

        // ── APPROVE ───────────────────────────────────────────────────────
        [HttpPost("{batchId:int}/approve")]
        public async Task<IActionResult> Approve(int batchId, [FromQuery] string approvedBy)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(approvedBy))
                    return BadRequest(new { message = "approvedBy is required." });

                // sp_ApproveManhour raises errors via RAISERROR/THROW — no result set returned
                await _dbcon.QueryAsync<dynamic>("sp_ApproveManhour", new
                {
                    BatchId    = batchId,
                    ApprovedBy = approvedBy,
                });

                return Ok(new { message = "Manhour batch approved successfully." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                await _dbcon.WriteLog(sqlEx, controller: "Manhour", action: "Approve", requestPath: HttpContext.Request.Path);
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Manhour", action: "Approve", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error approving manhour batch." });
            }
        }

        // ── ADMIN: LINE-LEVEL SEARCH ──────────────────────────────────────
        [HttpGet("admin/lines")]
        public async Task<IActionResult> AdminSearchLines(
            [FromQuery] string? searchText = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] string? documentNo = null,
            [FromQuery] int?    employeeId = null,
            [FromQuery] string? empType    = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 50,
            [FromQuery] string  sortCol    = "DocumentDate",
            [FromQuery] string  sortDir    = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    JobId         = string.IsNullOrWhiteSpace(jobId)      ? null : jobId.Trim(),
                    DocumentNo    = string.IsNullOrWhiteSpace(documentNo) ? null : documentNo.Trim(),
                    EmployeeId    = employeeId,
                    EmpType       = string.IsNullOrWhiteSpace(empType)    ? null : empType.Trim(),
                    Status        = string.IsNullOrWhiteSpace(status)     ? null : status.Trim(),
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom)   ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)     ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 500 ? 50 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir,
                };
                var rows  = await _dbcon.QueryAsync<AdminManhourLineResult>("sp_AdminSearchManhourLines", p);
                var list  = rows?.ToList() ?? new List<AdminManhourLineResult>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new
                {
                    totalRows  = total,
                    page,
                    pageSize,
                    totalPages = (int)Math.Ceiling((double)total / pageSize),
                    data       = list,
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Manhour", action: "AdminSearchLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading manhour lines." });
            }
        }

        // ── ADMIN: UPDATE LINE ────────────────────────────────────────────
        [HttpPut("admin/line/{manhourId:int}")]
        public async Task<IActionResult> AdminUpdateLine(int manhourId, [FromBody] AdminManhourLineUpdate req)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(req.JobId))    return BadRequest(new { message = "Job ID is required." });
                if (req.EmployeeId <= 0)                      return BadRequest(new { message = "Employee is required." });
                if (req.Hours <= 0)                           return BadRequest(new { message = "Hours must be greater than 0." });
                if (req.Hours > 24)                           return BadRequest(new { message = "Hours cannot exceed 24." });
                if (req.OvertimeHours < 0)                    return BadRequest(new { message = "OT hours cannot be negative." });
                if (req.Hours + req.OvertimeHours > 24)       return BadRequest(new { message = "Total hours (NH + OT) cannot exceed 24." });

                var modifiedBy = User.Identity?.Name ?? "admin";
                await _dbcon.QueryAsync<dynamic>("sp_AdminUpdateManhourLine", new
                {
                    ManhourId     = manhourId,
                    req.JobId,
                    req.EmployeeId,
                    req.Hours,
                    req.OvertimeHours,
                    Site          = req.Site,
                    MType         = req.MType,
                    Remarks       = req.Remarks,
                    ModifiedBy    = modifiedBy,
                });
                return Ok(new { message = "Line updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                await _dbcon.WriteLog(sqlEx, controller: "Manhour", action: "AdminUpdateLine", requestPath: HttpContext.Request.Path);
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Manhour", action: "AdminUpdateLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error updating manhour line." });
            }
        }

        // ── ADMIN: FORCE DELETE LINE ──────────────────────────────────────
        [HttpDelete("admin/line/{manhourId:int}")]
        public async Task<IActionResult> AdminDeleteLine(int manhourId)
        {
            try
            {
                var deletedBy = User.Identity?.Name ?? "admin";
                await _dbcon.QueryAsync<dynamic>("sp_AdminDeleteManhourLine", new
                {
                    ManhourId = manhourId,
                    DeletedBy = deletedBy,
                });
                return Ok(new { message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                await _dbcon.WriteLog(sqlEx, controller: "Manhour", action: "AdminDeleteLine", requestPath: HttpContext.Request.Path);
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Manhour", action: "AdminDeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting manhour line." });
            }
        }

        // ── EMPLOYEE LOOKUP ───────────────────────────────────────────────
        [HttpGet("employees")]
        public async Task<IActionResult> GetEmployees()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<EmployeeLookup>("sp_GetEmployees", new { });
                return Ok(rows ?? Enumerable.Empty<EmployeeLookup>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Manhour", action: "GetEmployees", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching employees." });
            }
        }
    }
}
