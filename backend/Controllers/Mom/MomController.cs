using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Mom
{
    using Mom        = ERPWEB.Models.Mom.Mom;
    using MomTask    = ERPWEB.Models.Mom.MomTask;
    using MomTaskLog = ERPWEB.Models.Mom.MomTaskLog;

    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class MomController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public MomController(DbCon dbcon) { _dbcon = dbcon; }

        // ── GET MOMs — all filters optional ──────────────────────
        [HttpGet]
        public async Task<IActionResult> GetMOMList(
            [FromQuery] string? jobId      = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] string? createdBy  = null,
            [FromQuery] string? assignedTo = null)
        {
            try
            {
                var list = await _dbcon.QueryAsync<Mom>("sp_GetMOMList", new
                {
                    JobId      = string.IsNullOrWhiteSpace(jobId)      ? null : jobId.Trim(),
                    Status     = string.IsNullOrWhiteSpace(status)     ? null : status.Trim(),
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom)   ? (object)DBNull.Value : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)     ? (object)DBNull.Value : dateTo,
                    CreatedBy  = string.IsNullOrWhiteSpace(createdBy)  ? null : createdBy.Trim(),
                    AssignedTo = string.IsNullOrWhiteSpace(assignedTo) ? null : assignedTo.Trim(),
                });
                return Ok(list ?? new List<Mom>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Mom", "GetMOMList", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching MOM list." });
            }
        }

        // ── GET single MOM + tasks ────────────────────────────
        [HttpGet("{momId:int}")]
        public async Task<IActionResult> GetMOM(int momId)
        {
            try
            {
                var (moms, tasks) = await _dbcon.QueryMultipleAsync<Mom, MomTask>(
                    "sp_GetMOM", new { MomId = momId });

                var mom = moms.FirstOrDefault();
                if (mom == null) return NotFound(new { message = "MOM not found." });
                return Ok(new { mom, tasks });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Mom", "GetMOM", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching MOM." });
            }
        }

        // ── SAVE MOM ──────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> SaveMOM([FromBody] Mom model)
        {
            if (string.IsNullOrWhiteSpace(model.Title))
                return BadRequest(new { message = "Title is required." });
            if (string.IsNullOrWhiteSpace(model.MeetingDate))
                return BadRequest(new { message = "Meeting date is required." });
            try
            {
                var result = await _dbcon.ExecuteScalarAsync("sp_SetMOM", new
                {
                    model.MomId,
                    model.JobId,
                    MeetingDate = model.MeetingDate,
                    model.Title,
                    model.Venue,
                    model.Attendees,
                    model.Summary,
                    model.CreatedBy,
                    model.ModifiedBy
                });
                return Ok(new { id = result, message = model.MomId == 0 ? "MOM created." : "MOM updated." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Mom", "SaveMOM", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving MOM." });
            }
        }

        // ── CLOSE MOM ─────────────────────────────────────────
        [HttpPost("{momId:int}/close")]
        public async Task<IActionResult> CloseMOM(int momId, [FromBody] CloseRequest req)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_CloseMOM", new { MomId = momId, req.ModifiedBy });
                return Ok(new { message = "MOM closed." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Mom", "CloseMOM", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error closing MOM." });
            }
        }

        // ── GET tasks for a MOM ───────────────────────────────
        [HttpGet("{momId:int}/tasks")]
        public async Task<IActionResult> GetTasksByMom(int momId)
        {
            try
            {
                var tasks = await _dbcon.QueryAsync<MomTask>("sp_GetMOMTaskList", new { MomId = momId });
                return Ok(tasks ?? new List<MomTask>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Mom", "GetTasksByMom", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching tasks." });
            }
        }

        // ── GET tasks for a job ───────────────────────────────
        [HttpGet("job/{jobId}/tasks")]
        public async Task<IActionResult> GetTasksByJob(string jobId, [FromQuery] string? status = null)
        {
            try
            {
                var tasks = await _dbcon.QueryAsync<MomTask>("sp_GetMOMTaskList",
                    new { JobId = jobId, Status = status });
                return Ok(tasks ?? new List<MomTask>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Mom", "GetTasksByJob", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching tasks." });
            }
        }

        // ── GET my tasks (engineer view) ──────────────────────
        [HttpGet("my-tasks")]
        public async Task<IActionResult> GetMyTasks([FromQuery] string assignedTo, [FromQuery] string? status = null)
        {
            try
            {
                var tasks = await _dbcon.QueryAsync<MomTask>("sp_GetMOMTaskList",
                    new { AssignedTo = assignedTo, Status = status });
                return Ok(tasks ?? new List<MomTask>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Mom", "GetMyTasks", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching tasks." });
            }
        }

        // ── SAVE task ─────────────────────────────────────────
        [HttpPost("task/save")]
        public async Task<IActionResult> SaveTask([FromBody] MomTask model)
        {
            if (string.IsNullOrWhiteSpace(model.Description))
                return BadRequest(new { message = "Description is required." });
            if (string.IsNullOrWhiteSpace(model.AssignedTo))
                return BadRequest(new { message = "Assigned to is required." });
            if (string.IsNullOrWhiteSpace(model.DueDate))
                return BadRequest(new { message = "Due date is required." });
            try
            {
                var result = await _dbcon.ExecuteScalarAsync("sp_SetMOMTask", new
                {
                    model.MomTaskId,
                    model.MomId,
                    model.JobId,
                    model.Description,
                    DueDate    = string.IsNullOrEmpty(model.DueDate) ? (object)DBNull.Value : model.DueDate,
                    model.Priority,
                    model.AssignedTo,
                    model.Remarks,
                    model.CreatedBy,
                    model.ModifiedBy
                });
                return Ok(new { id = result, message = model.MomTaskId == 0 ? "Task created." : "Task updated." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Mom", "SaveTask", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving task." });
            }
        }

        // ── UPDATE task status ────────────────────────────────
        [HttpPost("task/{momTaskId:int}/status")]
        public async Task<IActionResult> UpdateTaskStatus(int momTaskId, [FromBody] StatusRequest req)
        {
            try
            {
                var result = await _dbcon.ExecuteScalarAsync("sp_SetMOMTaskStatus", new
                {
                    MomTaskId = momTaskId,
                    req.NewStatus,
                    req.Remarks,
                    req.ActionBy
                });
                if (result == "UNAUTHORIZED")
                    return StatusCode(403, new { message = "Only the assignee or assigner can update this task." });
                return Ok(new { message = "Status updated." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Mom", "UpdateTaskStatus", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error updating status." });
            }
        }

        // ── REASSIGN task ─────────────────────────────────────
        [HttpPost("task/{momTaskId:int}/reassign")]
        public async Task<IActionResult> ReassignTask(int momTaskId, [FromBody] ReassignRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ToUser))
                return BadRequest(new { message = "Target user is required." });
            try
            {
                var result = await _dbcon.ExecuteScalarAsync("sp_ReassignMOMTask", new
                {
                    MomTaskId = momTaskId,
                    req.ToUser,
                    req.Remarks,
                    req.ActionBy
                });
                if (result == "UNAUTHORIZED")
                    return StatusCode(403, new { message = "Only the assignee or assigner can reassign this task." });
                return Ok(new { message = "Task reassigned." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Mom", "ReassignTask", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error reassigning task." });
            }
        }

        // ── GET task audit log ────────────────────────────────
        [HttpGet("task/{momTaskId:int}/log")]
        public async Task<IActionResult> GetTaskLog(int momTaskId)
        {
            try
            {
                var log = await _dbcon.QueryAsync<MomTaskLog>("sp_GetMOMTaskLog", new { MomTaskId = momTaskId });
                return Ok(log ?? new List<MomTaskLog>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Mom", "GetTaskLog", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching task log." });
            }
        }

        // ── Request bodies ────────────────────────────────────
        public class CloseRequest    { public string ModifiedBy { get; set; } = ""; }
        public class StatusRequest   { public string NewStatus { get; set; } = ""; public string? Remarks { get; set; } public string ActionBy { get; set; } = ""; }
        public class ReassignRequest { public string ToUser { get; set; } = ""; public string? Remarks { get; set; } public string ActionBy { get; set; } = ""; }
    }
}
