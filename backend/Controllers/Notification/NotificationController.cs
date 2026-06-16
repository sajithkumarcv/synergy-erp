using ERPWEB.Dbcontext;
using ERPWEB.Models.Approval;
using ERPWEB.Models.Mom;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Notification
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class NotificationController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public NotificationController(DbCon dbcon) { _dbcon = dbcon; }

        // ── GET api/Notification/my?userId=2&userName=SAJITH ──
        [HttpGet("my")]
        public async Task<IActionResult> GetMyNotifications(
            [FromQuery] int    userId   = 0,
            [FromQuery] string userName = "")
        {
            try
            {
                var tasksTask = _dbcon.QueryAsync<MomTask>("sp_GetMOMTaskList", new
                {
                    AssignedTo = string.IsNullOrWhiteSpace(userName) ? null : userName.Trim(),
                    Status     = (string?)null,
                    MomId      = (int?)null,
                    JobId      = (string?)null,
                });

                var approvalsTask = userId > 0
                    ? _dbcon.QueryAsync<MyApprovalItem>("sp_GetMyApprovals", new { UserId = userId, Page = 1, PageSize = 50 })
                    : Task.FromResult<IEnumerable<MyApprovalItem>>(new List<MyApprovalItem>());

                await Task.WhenAll(tasksTask, approvalsTask);

                var activeTasks = (await tasksTask ?? new List<MomTask>())
                    .Where(t => t.Status == "Open" || t.Status == "InProgress")
                    .ToList();

                var pendingApprovals = (await approvalsTask ?? new List<MyApprovalItem>()).ToList();

                return Ok(new
                {
                    totalCount = activeTasks.Count + pendingApprovals.Count,
                    tasks      = activeTasks,
                    approvals  = pendingApprovals,
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "Notification", "GetMyNotifications", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching notifications." });
            }
        }
    }
}
