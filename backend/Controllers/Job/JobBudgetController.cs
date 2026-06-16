using ERPWEB.Dbcontext;
using ERPWEB.Models.Job;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Job
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class JobBudgetController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public JobBudgetController(DbCon dbcon) { _dbcon = dbcon; }

        private static string Sha256Hex(string raw)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw ?? string.Empty));
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        // ── GET budget header + lines + actuals ─────────────────
        [HttpGet("{jobId}")]
        public async Task<IActionResult> Get(string jobId)
        {
            try
            {
                var (headers, lines) = await _dbcon.QueryMultipleAsync<JobBudgetHeader, JobBudgetLine>(
                    "sp_GetJobBudget", new { JobId = jobId });
                return Ok(new JobBudgetResponse
                {
                    Header = headers.FirstOrDefault() ?? new JobBudgetHeader { JobId = jobId },
                    Lines  = lines ?? new List<JobBudgetLine>()
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching budget." });
            }
        }

        // ── SAVE (upsert) one budget line ───────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveJobBudgetRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_SetJobBudget", new
                {
                    model.JobId,
                    model.CostCategoryId,
                    model.RvNo,
                    model.BudgetedAmount,
                    model.Qty,
                    model.UnitPrice,
                    model.UomId,
                    model.Notes,
                    model.CurrencyId,
                    model.ExchangeRate,
                    model.CreatedBy,
                    model.ModifiedBy
                });
                return Ok(new { message = "Budget saved." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                // SP raises business-rule errors (e.g. approved-row guard) → surface as 400
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving budget." });
            }
        }

        // ── DELETE one budget line ──────────────────────────────
        [HttpDelete("{jobBudgetId:int}")]
        public async Task<IActionResult> Delete(int jobBudgetId)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeleteJobBudget", new { JobBudgetId = jobBudgetId });
                return Ok(new { message = "Budget line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting budget line." });
            }
        }

        // ── APPROVE the current revision (locks it) ─────────────
        [HttpPost("approve")]
        public async Task<IActionResult> Approve([FromBody] BudgetActionRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.JobId))      return BadRequest(new { message = "JobId is required." });
            if (string.IsNullOrWhiteSpace(req.Password))   return BadRequest(new { message = "Budget password is required." });
            if (string.IsNullOrWhiteSpace(req.ActedBy))    return BadRequest(new { message = "ActedBy is required." });
            if (string.IsNullOrWhiteSpace(req.Reason))     return BadRequest(new { message = "Reason is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ApproveJobBudget", new
                {
                    req.JobId,
                    PasswordHash = Sha256Hex(req.Password),
                    ApprovedBy   = req.ActedBy,
                    Reason       = req.Reason.Trim(),
                });
                return Ok(new { message = "Budget approved and locked." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "Approve", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error approving budget." });
            }
        }

        // ── REVISE: copy the approved revision into a new editable one ──
        [HttpPost("revise")]
        public async Task<IActionResult> Revise([FromBody] BudgetActionRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.JobId))      return BadRequest(new { message = "JobId is required." });
            if (string.IsNullOrWhiteSpace(req.Password))   return BadRequest(new { message = "Budget password is required." });
            if (string.IsNullOrWhiteSpace(req.ActedBy))    return BadRequest(new { message = "ActedBy is required." });
            if (string.IsNullOrWhiteSpace(req.Reason))     return BadRequest(new { message = "Reason is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ReviseJobBudget", new
                {
                    req.JobId,
                    PasswordHash = Sha256Hex(req.Password),
                    RevisedBy    = req.ActedBy,
                    Reason       = req.Reason.Trim(),
                });
                return Ok(new { message = "Budget revised. A new editable revision has been created." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "Revise", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error revising budget." });
            }
        }

        // ── Set / change the budget password for a specific role ────
        [HttpPost("set-password")]
        public async Task<IActionResult> SetPassword([FromBody] SetBudgetPasswordRequest req)
        {
            if (req.RoleId <= 0)
                return BadRequest(new { message = "RoleId is required." });
            if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 4)
                return BadRequest(new { message = "Password must be at least 4 characters." });
            if (string.IsNullOrWhiteSpace(req.ChangedBy))
                return BadRequest(new { message = "ChangedBy is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_SetRoleSecret", new
                {
                    req.RoleId,
                    SecretKey       = "BUDGET_PASSWORD",
                    SecretValueHash = Sha256Hex(req.NewPassword),
                    ModifiedBy      = req.ChangedBy
                });
                return Ok(new { message = "Budget password updated for the selected role." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "SetPassword", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error updating password." });
            }
        }

        // ── List every role + whether its budget password is configured ──
        [HttpGet("password-roles")]
        public async Task<IActionResult> PasswordRoles()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<RoleSecretStatusRow>(
                    "sp_GetRolesWithSecretStatus", new { SecretKey = "BUDGET_PASSWORD" });
                return Ok(rows ?? Enumerable.Empty<RoleSecretStatusRow>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "PasswordRoles", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching password roles." });
            }
        }

        // ═══════════════════════════════════════════════════════
        //  PER-USER BUDGET PASSWORD
        //  Self-service: the logged-in user sets their own password.
        //  Once set, it is the authoritative source for that user's
        //  Approve/Revise/Complete/Cancel/Freeze/Reopen actions.
        // ═══════════════════════════════════════════════════════

        // GET /api/JobBudget/my-password-status → { hasPassword: bool, modifiedDate? }
        [HttpGet("my-password-status")]
        public async Task<IActionResult> MyPasswordStatus()
        {
            try
            {
                var userName = User.Identity?.Name;
                if (string.IsNullOrWhiteSpace(userName))
                    return Unauthorized();

                var row = await _dbcon.QueryFirstOrDefaultAsync<dynamic>(
                    "proj.sp_GetUserBudgetPasswordStatus",
                    new { UserName = userName });
                return Ok(row ?? new { hasPassword = false });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "MyPasswordStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching password status." });
            }
        }

        // POST /api/JobBudget/set-my-password { newPassword, currentPassword? }
        // currentPassword is required only when the user already has one set
        // (prevents an unattended session from being able to overwrite it).
        [HttpPost("set-my-password")]
        public async Task<IActionResult> SetMyPassword([FromBody] SetMyBudgetPasswordRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.NewPassword) || req.NewPassword.Length < 4)
                return BadRequest(new { message = "Password must be at least 4 characters." });

            var userName = User.Identity?.Name;
            if (string.IsNullOrWhiteSpace(userName))
                return Unauthorized();

            try
            {
                var user = await _dbcon.QueryFirstOrDefaultAsync<dynamic>(
                    "proj.sp_GetUserBudgetPasswordForVerify",
                    new { UserName = userName });

                if (user is null) return Unauthorized();

                bool hasPassword = (bool)user.HasPassword;
                if (hasPassword)
                {
                    if (string.IsNullOrWhiteSpace(req.CurrentPassword))
                        return BadRequest(new { message = "Current password is required to change your existing budget password." });
                    if (!string.Equals((string)user.ExistingHash, Sha256Hex(req.CurrentPassword), StringComparison.OrdinalIgnoreCase))
                        return BadRequest(new { message = "Current password is incorrect." });
                }

                int userId = (int)user.UserId;
                await _dbcon.ExecuteScalarAsync("sp_SetUserSecret", new
                {
                    UserId          = userId,
                    SecretKey       = "BUDGET_PASSWORD",
                    SecretValueHash = Sha256Hex(req.NewPassword),
                    ModifiedBy      = userName,
                });

                return Ok(new { message = hasPassword ? "Budget password changed." : "Budget password set." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "SetMyPassword", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error setting password." });
            }
        }
    }
}
