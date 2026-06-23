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
        public async Task<IActionResult> Get(string jobId, [FromQuery] int? rvNo = null)
        {
            try
            {
                var (headers, lines) = await _dbcon.QueryMultipleAsync<JobBudgetHeader, JobBudgetLine>(
                    "sp_GetJobBudget", new { JobId = jobId, RvNo = rvNo });
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
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) when (sqlEx.Number >= 50000)
            {
                // SP business-rule error (RAISERROR/THROW ≥ 50000) → surface as 400.
                // System SQL errors fall through to the logged generic 500 below.
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
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) when (sqlEx.Number >= 50000)
            {
                // SP business-rule error (RAISERROR/THROW ≥ 50000) → surface; system errors → logged 500 below.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting budget line." });
            }
        }

        // ── List all budget revisions for the job ───────────────
        [HttpGet("{jobId}/revisions")]
        public async Task<IActionResult> Revisions(string jobId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetJobBudgetRevisions", new { JobId = jobId });
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    rvNo            = (int)r.RvNo,
                    isApproved      = Convert.ToInt32(r.IsApproved) == 1,
                    isCurrent       = Convert.ToInt32(r.IsCurrent) == 1,
                    approvedBy      = (string?)r.ApprovedBy,
                    approvedDate    = (DateTime?)r.ApprovedDate,
                    revisionReason  = (string?)r.RevisionReason,
                    totalBudgetBase = (decimal?)r.TotalBudgetBase,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "Revisions", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching budget revisions." });
            }
        }

        // ── Budget item change log (qty before/after audit) ────
        [HttpGet("{jobId}/item-log")]
        public async Task<IActionResult> ItemLog(string jobId, [FromQuery] int? rvNo = null, [FromQuery] int? itemId = null)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetJobBudgetItemLog",
                    new { JobId = jobId, RvNo = rvNo, ItemId = itemId });
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    logId        = (int)r.LogId,
                    rvNo         = (int)r.RvNo,
                    budgetHeader = (string?)r.BudgetHeader,
                    itemCode     = (string?)r.ItemCode,
                    itemName     = (string?)r.ItemName,
                    action       = (string?)r.Action,
                    oldQty       = (decimal?)r.OldQty,
                    newQty       = (decimal?)r.NewQty,
                    qtyDelta     = (decimal?)r.QtyDelta,
                    oldUnitPrice = (decimal?)r.OldUnitPrice,
                    newUnitPrice = (decimal?)r.NewUnitPrice,
                    reason       = (string?)r.Reason,
                    changedBy    = (string?)r.ChangedBy,
                    changedDate  = (DateTime?)r.ChangedDate,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "ItemLog", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching budget item log." });
            }
        }

        // ── Budget ITEMS under a header (drives BOM on approval) ─
        [HttpGet("{jobId}/items")]
        public async Task<IActionResult> GetItems(string jobId, [FromQuery] int? rvNo = null, [FromQuery] int? costCategoryId = null)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetJobBudgetItems",
                    new { JobId = jobId, RvNo = rvNo, CostCategoryId = costCategoryId });
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    budgetItemId   = (int)r.BudgetItemId,
                    jobId          = (string?)r.JobId,
                    rvNo           = (int)r.RvNo,
                    costCategoryId = (int)r.CostCategoryId,
                    budgetHeader   = (string?)r.BudgetHeader,
                    budgetHeaderCode = (string?)r.BudgetHeaderCode,
                    itemId         = (int)r.ItemId,
                    itemCode       = (string?)r.ItemCode,
                    itemName       = (string?)r.ItemName,
                    isPurchasable  = (bool?)r.IsPurchasable,
                    qty            = (decimal?)r.Qty,
                    uomId          = (int?)r.UomId,
                    uomCode        = (string?)r.UomCode,
                    unitPrice      = (decimal?)r.UnitPrice,
                    lineTotal      = (decimal?)r.LineTotal,
                    notes          = (string?)r.Notes,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "GetItems", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching budget items." });
            }
        }

        [HttpPost("item/save")]
        public async Task<IActionResult> SaveItem([FromBody] SaveBudgetItemRequest m)
        {
            // Financial-edit guard: reason (≥10 chars) + budget password required.
            var reasonErr = Security.FinancialGuard.ValidateReason(m.Reason);
            if (reasonErr != null) return BadRequest(new { message = reasonErr });
            if (!await Security.FinancialGuard.VerifyBudgetPasswordAsync(_dbcon, User.Identity?.Name ?? m.ModifiedBy ?? m.CreatedBy, m.Password))
                return BadRequest(new { message = "Incorrect budget password." });
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_SetJobBudgetItem", new
                {
                    m.BudgetItemId, m.JobId, m.RvNo, m.CostCategoryId, m.ItemId,
                    m.Qty, m.UomId, m.UnitPrice, m.Notes, m.CreatedBy, m.ModifiedBy, m.Reason
                });
                var r = rows?.FirstOrDefault();
                return Ok(new { budgetItemId = (int?)r?.BudgetItemId, categoryTotal = (decimal?)r?.CategoryTotal });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) when (sqlEx.Number >= 50000)
            {
                // Business-rule THROW (approved-lock / job-not-approved / qty<=0) → surface to the user.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "SaveItem", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving budget item." });
            }
        }

        [HttpDelete("item/{budgetItemId:int}")]
        public async Task<IActionResult> DeleteItem(int budgetItemId, [FromQuery] string? modifiedBy = null,
            [FromQuery] string? password = null, [FromQuery] string? reason = null)
        {
            // Financial-edit guard: reason (≥10 chars) + budget password required.
            var reasonErr = Security.FinancialGuard.ValidateReason(reason);
            if (reasonErr != null) return BadRequest(new { message = reasonErr });
            if (!await Security.FinancialGuard.VerifyBudgetPasswordAsync(_dbcon, User.Identity?.Name ?? modifiedBy, password))
                return BadRequest(new { message = "Incorrect budget password." });
            try
            {
                await _dbcon.QueryAsync<dynamic>("sp_DeleteJobBudgetItem",
                    new { BudgetItemId = budgetItemId, ModifiedBy = modifiedBy, Reason = reason });
                return Ok(new { message = "Budget item deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) when (sqlEx.Number >= 50000)
            {
                // Business-rule THROW (item not found / approved-lock) → surface to the user.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "DeleteItem", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting budget item." });
            }
        }

        // ── Bulk import budget items from Excel ─────────────────
        [HttpPost("items/import")]
        public async Task<IActionResult> ImportItems([FromBody] BudgetImportRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.JobId)) return BadRequest(new { message = "JobId is required." });
            try
            {
                var results = new List<object>();
                int ok = 0, fail = 0, n = 0;
                foreach (var row in req.Rows)
                {
                    n++;
                    try
                    {
                        var rs = await _dbcon.QueryAsync<dynamic>("sp_ImportJobBudgetItem", new
                        {
                            req.JobId, req.RvNo,
                            BudgetHeader = string.IsNullOrWhiteSpace(row.BudgetHeader) ? null : row.BudgetHeader.Trim(),
                            ItemCode     = row.ItemCode?.Trim(),
                            row.Qty, row.UnitPrice, By = req.ImportedBy
                        });
                        var r = rs?.FirstOrDefault();
                        bool success = r != null && Convert.ToBoolean(r.Success);
                        string msg   = (string?)r?.Message ?? "Unknown error";
                        if (success) ok++; else fail++;
                        results.Add(new { rowNumber = n, itemCode = row.ItemCode, budgetHeader = row.BudgetHeader, success, message = msg });
                    }
                    catch (Microsoft.Data.SqlClient.SqlException sqlRow) when (sqlRow.Number >= 50000)
                    {
                        // Business-rule THROW for this row → surface its message, not an error.
                        fail++;
                        results.Add(new { rowNumber = n, itemCode = row.ItemCode, success = false, message = sqlRow.Message });
                    }
                    catch (Exception exRow)
                    {
                        // Genuine error on this row → log it, show a safe per-row message.
                        await _dbcon.WriteLog(exRow, controller: "JobBudget", action: "ImportItems.Row", requestPath: HttpContext.Request.Path);
                        fail++;
                        results.Add(new { rowNumber = n, itemCode = row.ItemCode, success = false, message = "Row failed — see application log." });
                    }
                }
                return Ok(new { successCount = ok, failCount = fail, results });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "ImportItems", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error importing budget items." });
            }
        }

        // ── Generate BOM from budget items WITHOUT approval ─────
        // For in-house / non-costed jobs that skip the budget-approval ceremony.
        [HttpPost("generate-bom")]
        public async Task<IActionResult> GenerateBom([FromBody] BudgetActionRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.JobId)) return BadRequest(new { message = "JobId is required." });
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GenerateBomFromBudgetForJob",
                    new { JobId = req.JobId, By = req.ActedBy });
                var r = rows?.FirstOrDefault();
                bool created = r != null && Convert.ToBoolean(r.Created);
                string message = (string?)r?.Message ?? "Done.";
                if (!created) return BadRequest(new { message });
                return Ok(new { message });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) when (sqlEx.Number >= 50000)
            {
                // Business-rule THROW → surface to the user.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "JobBudget", action: "GenerateBom", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating BOM." });
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
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) when (sqlEx.Number >= 50000)
            {
                // SP business-rule error (RAISERROR/THROW ≥ 50000) → surface; system errors → logged 500 below.
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
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) when (sqlEx.Number >= 50000)
            {
                // SP business-rule error (RAISERROR/THROW ≥ 50000) → surface; system errors → logged 500 below.
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

    public class BudgetImportRow
    {
        public string? BudgetHeader { get; set; }
        public string? ItemCode     { get; set; }
        public decimal Qty          { get; set; }
        public decimal UnitPrice    { get; set; }
    }

    public class BudgetImportRequest
    {
        public string JobId             { get; set; } = "";
        public int    RvNo              { get; set; }
        public string? ImportedBy       { get; set; }
        public List<BudgetImportRow> Rows { get; set; } = new();
    }

    public class SaveBudgetItemRequest
    {
        public int      BudgetItemId   { get; set; }
        public string   JobId          { get; set; } = "";
        public int      RvNo           { get; set; }
        public int      CostCategoryId { get; set; }
        public int      ItemId         { get; set; }
        public decimal  Qty            { get; set; }
        public int?     UomId          { get; set; }
        public decimal  UnitPrice      { get; set; }
        public string?  Notes          { get; set; }
        public string?  CreatedBy      { get; set; }
        public string?  ModifiedBy     { get; set; }
        public string?  Password       { get; set; }
        public string?  Reason         { get; set; }
    }
}
