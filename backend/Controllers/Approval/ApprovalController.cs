using Dapper;
using ERPWEB.Dbcontext;
using ERPWEB.Models.Approval;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;

namespace ERPWEB.Controllers.Approval
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class ApprovalController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public ApprovalController(DbCon dbcon) { _dbcon = dbcon; }

        private static string Sha256Hex(string raw)
        {
            using var sha = System.Security.Cryptography.SHA256.Create();
            return Convert.ToHexString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(raw ?? string.Empty))).ToLower();
        }

        // ── POST api/approval/submit ─────────────────────────────────────
        // Submit a document into the approval workflow
        [HttpPost("submit")]
        public async Task<IActionResult> Submit([FromBody] SubmitForApprovalRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ModuleCode))
                return BadRequest(new { message = "ModuleCode is required." });
            if (req.DocumentId <= 0)
                return BadRequest(new { message = "DocumentId is required." });
            if (string.IsNullOrWhiteSpace(req.SubmittedBy))
                return BadRequest(new { message = "SubmittedBy is required." });

            try
            {
                // ── Job-specific mandatory-data validation before it enters the workflow ──
                if (string.Equals(req.ModuleCode, "JOB", StringComparison.OrdinalIgnoreCase))
                {
                    var problems = (await _dbcon.QueryAsync<dynamic>("sp_ValidateJobForApproval",
                        new { JobNumId = req.DocumentId })).ToList();
                    if (problems.Count > 0)
                    {
                        var lines = problems.Select(p => $"• {(string)p.Message}");
                        var vmsg  = "Cannot submit for approval — please complete the following:\n" + string.Join("\n", lines);
                        await _dbcon.WriteRawLog(vmsg, controller: "Approval", action: "Submit",
                            requestPath: HttpContext.Request.Path, userId: req.SubmittedBy, logLevel: "Warning");
                        return BadRequest(new { message = vmsg, validation = problems.Select(p => new { requirement = (string)p.Requirement, message = (string)p.Message }) });
                    }
                }

                // ── Budget-overrun override: validate the budget password first ──
                // Use the module's own menu so permission is checked against what the
                // submitter can already do (e.g. a purchaser has EDIT on /purchase-orders
                // but has no /jobs permission, which is what APPROVE checks against by default).
                bool overrideBudget = false;
                if (!string.IsNullOrWhiteSpace(req.BudgetPassword))
                {
                    var menuUrl    = ModuleMenuUrl(req.ModuleCode);
                    var actionCode = ModuleSubmitAction(req.ModuleCode);
                    var vr = await _dbcon.QueryFirstOrDefaultAsync<dynamic>(
                        "sp_ValidateBudgetPassword",
                        new { UserName = req.SubmittedBy, PasswordHash = Sha256Hex(req.BudgetPassword), ActionCode = actionCode, MenuUrl = menuUrl });

                    bool ok = vr != null && Convert.ToBoolean(vr.Success);
                    if (!ok)
                    {
                        var vmsg = (string?)vr?.Message ?? "Budget password validation failed.";
                        await _dbcon.WriteRawLog(vmsg, controller: "Approval", action: "Submit",
                            requestPath: HttpContext.Request.Path, userId: req.SubmittedBy, logLevel: "Warning");
                        return BadRequest(new { message = vmsg });
                    }

                    overrideBudget = true;
                }

                var p = new
                {
                    req.ModuleCode,
                    req.DocumentId,
                    req.DocumentNo,
                    req.DocumentAmount,
                    req.CurrencyId,
                    req.SubmittedBy,
                    OverrideBudget = overrideBudget,
                    OverrideReason = overrideBudget && !string.IsNullOrWhiteSpace(req.OverrideReason)
                                     ? req.OverrideReason.Trim() : null,
                };

                var result = await _dbcon.QueryFirstAsync<dynamic>("sp_SubmitForApproval", p);
                int txId = (int)result.TransactionId;

                if (txId < 0)
                {
                    var smsg = (string)result.Message;
                    await _dbcon.WriteRawLog(smsg, controller: "Approval", action: "Submit",
                        requestPath: HttpContext.Request.Path, userId: req.SubmittedBy, logLevel: "Warning");
                    return BadRequest(new { message = smsg });
                }

                return Ok(new
                {
                    transactionId = txId,
                    policyId      = (int?)result.PolicyId,
                    totalLevels   = (int)result.TotalLevels,
                    newStatus     = (string)result.NewStatus,
                    message       = (string)result.Message,
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "Submit", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error submitting for approval." });
            }
        }

        // ── POST api/approval/action ─────────────────────────────────────
        // Approve / Reject / SendBack / Cancel
        [HttpPost("action")]
        public async Task<IActionResult> ProcessAction([FromBody] ProcessApprovalRequest req)
        {
            if (req.TransactionId <= 0)
                return BadRequest(new { message = "TransactionId is required." });
            if (string.IsNullOrWhiteSpace(req.Action))
                return BadRequest(new { message = "Action is required." });

            try
            {
                // ── Credit-hold guard: block approving an invoice for a customer on hold ──
                if (string.Equals(req.Action, "Approve", System.StringComparison.OrdinalIgnoreCase))
                {
                    var credit = await _dbcon.QueryFirstOrDefaultAsync<ERPWEB.Models.Customer.CustomerCreditStatus>(
                        "sp_CheckApprovalCustomerCredit", new { req.TransactionId });
                    if (credit != null && credit.CanTransact == 0)
                        return BadRequest(new { message = string.IsNullOrWhiteSpace(credit.StatusMessage)
                            ? "Customer is on credit hold — approval is blocked."
                            : credit.StatusMessage });
                }

                // ── Budget-overrun override: validate the budget password first ──
                bool overrideBudget = false;
                if (string.Equals(req.Action, "Approve", System.StringComparison.OrdinalIgnoreCase)
                    && !string.IsNullOrWhiteSpace(req.BudgetPassword))
                {
                    var vr = await _dbcon.QueryFirstOrDefaultAsync<dynamic>(
                        "sp_ValidateBudgetPassword",
                        new { UserName = req.ActionByName, PasswordHash = Sha256Hex(req.BudgetPassword), ActionCode = "APPROVE" });

                    bool ok = vr != null && Convert.ToBoolean(vr.Success);
                    if (!ok)
                    {
                        var vmsg = (string?)vr?.Message ?? "Budget password validation failed.";
                        await _dbcon.WriteRawLog(vmsg, controller: "Approval", action: "Action",
                            requestPath: HttpContext.Request.Path, userId: req.ActionByName, logLevel: "Warning");
                        return BadRequest(new { message = vmsg });
                    }

                    overrideBudget = true;
                }

                // When overriding, fold the reason into the remarks so it lands in the approval log
                string? remarks = req.Remarks;
                if (overrideBudget && !string.IsNullOrWhiteSpace(req.OverrideReason))
                    remarks = (string.IsNullOrWhiteSpace(remarks) ? "" : remarks + " — ")
                            + "Budget override: " + req.OverrideReason.Trim();

                var p = new
                {
                    req.TransactionId,
                    req.Action,
                    req.ActionBy,
                    req.ActionByName,
                    Remarks        = remarks,
                    OverrideBudget = overrideBudget,
                };

                // Read the LAST result set. A post-approval hook (run inside
                // sp_ProcessApproval) may emit its own recordset, which would shadow
                // the status row if we read the first set. sp_ProcessApproval's
                // status/error SELECT is always the final result set, so taking the
                // last set is immune to any current or future hook that emits rows.
                dynamic? result = null;
                using (var grid = await _dbcon.QueryMultipleAsync("sp_ProcessApproval", p))
                {
                    while (!grid.IsConsumed)
                    {
                        var set = (await grid.ReadAsync<dynamic>()).ToList();
                        if (set.Count > 0) result = set[set.Count - 1];
                    }
                }
                if (result == null)
                {
                    await _dbcon.WriteRawLog("sp_ProcessApproval returned no result row.", controller: "Approval",
                        action: "Action", requestPath: HttpContext.Request.Path, userId: req.ActionByName, logLevel: "Warning");
                    return BadRequest(new { message = "Approval action could not be processed." });
                }
                bool isComplete = Convert.ToBoolean(result.IsComplete);

                if (result.NewStatus == null && !isComplete)
                {
                    var amsg = (string)result.Message;
                    await _dbcon.WriteRawLog(amsg, controller: "Approval", action: "Action",
                        requestPath: HttpContext.Request.Path, userId: req.ActionByName, logLevel: "Warning");
                    return BadRequest(new { message = amsg });
                }

                return Ok(new
                {
                    transactionId = (int)result.TransactionId,
                    newStatus     = (string?)result.NewStatus,
                    isComplete    = isComplete,
                    message       = (string)result.Message,
                    moduleCode    = (string?)result.ModuleCode,
                    documentId    = result.DocumentId != null ? (int?)result.DocumentId : null,
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "Action", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error processing approval action." });
            }
        }

        // ── GET api/approval/status/{moduleCode}/{documentId} ────────────
        // Returns current transaction + log for a document
        // Pass ?userId=N so the SP can compute canAct / canCancel flags
        [HttpGet("status/{moduleCode}/{documentId:int}")]
        public async Task<IActionResult> GetStatus(string moduleCode, int documentId, [FromQuery] int userId = 0)
        {
            try
            {
                using var grid = await _dbcon.QueryMultipleAsync(
                    "sp_GetApprovalStatus",
                    new { ModuleCode = moduleCode, DocumentId = documentId, UserId = userId });

                var transaction = (await grid.ReadAsync<ApprovalTransaction>()).FirstOrDefault();
                var log         = (await grid.ReadAsync<ApprovalLog>()).ToList();

                return Ok(new ApprovalStatusResponse { Transaction = transaction, Log = log });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "GetStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading approval status." });
            }
        }

        // ── GET api/approval/all ─────────────────────────────────────────
        // Admin view — all approval transactions with filters + pagination
        [HttpGet("all")]
        public async Task<IActionResult> GetAll(
            [FromQuery] string? status        = null,
            [FromQuery] string? moduleCode    = null,
            [FromQuery] string? searchText    = null,
            [FromQuery] string? submittedBy   = null,
            [FromQuery] string? finalActionBy = null,
            [FromQuery] string? dateFrom      = null,
            [FromQuery] string? dateTo        = null,
            [FromQuery] int     page          = 1,
            [FromQuery] int     pageSize      = 50,
            [FromQuery] string  sortCol       = "SubmittedDate",
            [FromQuery] string  sortDir       = "DESC")
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetAllApprovals", new
                {
                    Status        = string.IsNullOrWhiteSpace(status)        ? null : status.Trim(),
                    ModuleCode    = string.IsNullOrWhiteSpace(moduleCode)    ? null : moduleCode.Trim(),
                    SearchText    = string.IsNullOrWhiteSpace(searchText)    ? null : searchText.Trim(),
                    SubmittedBy   = string.IsNullOrWhiteSpace(submittedBy)   ? null : submittedBy.Trim(),
                    FinalActionBy = string.IsNullOrWhiteSpace(finalActionBy) ? null : finalActionBy.Trim(),
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom)      ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)        ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 500 ? 50 : pageSize,
                    SortCol       = sortCol,
                    SortDir       = sortDir,
                });
                var list  = rows?.ToList() ?? new List<dynamic>();
                int total = list.Count > 0 ? (int)list[0].TotalRows : 0;
                // Explicitly map to camelCase anonymous objects — Dapper dynamic keeps PascalCase
                var data = list.Select(r => new
                {
                    transactionId  = (int)r.TransactionId,
                    moduleCode     = (string?)r.ModuleCode,
                    moduleName     = (string?)r.ModuleName,
                    documentId     = (int?)r.DocumentId,
                    documentNo     = (string?)r.DocumentNo,
                    documentAmount = (decimal?)r.DocumentAmount,
                    currentStatus  = (string?)r.CurrentStatus,
                    currentLevelNo = (int?)r.CurrentLevelNo,
                    totalLevels    = (int?)r.TotalLevels,
                    policyName     = (string?)r.PolicyName,
                    currentApprover= (string?)r.CurrentApprover,
                    submittedBy    = (string?)r.SubmittedBy,
                    submittedDate  = (DateTime?)r.SubmittedDate,
                    completedDate  = (DateTime?)r.CompletedDate,
                    finalAction    = (string?)r.FinalAction,
                    finalActionBy  = (string?)r.FinalActionBy,
                    finalRemarks   = (string?)r.FinalRemarks,
                    daysElapsed    = (int?)r.DaysElapsed,
                }).ToList();
                return Ok(new
                {
                    data,
                    totalRows  = total,
                    page,
                    pageSize,
                    totalPages = (int)Math.Ceiling(total / (double)pageSize),
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "GetAll", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading approvals." });
            }
        }

        // ── GET api/approval/my/{userId} ─────────────────────────────────
        // Returns pending approvals for a user
        [HttpGet("my/{userId:int}")]
        public async Task<IActionResult> GetMyApprovals(
            int userId,
            [FromQuery] int page     = 1,
            [FromQuery] int pageSize = 20)
        {
            try
            {
                var items = (await _dbcon.QueryAsync<MyApprovalItem>(
                    "sp_GetMyApprovals",
                    new { UserId = userId, Page = page, PageSize = pageSize }
                )).ToList();

                int totalRows = items.FirstOrDefault()?.TotalRows ?? 0;
                return Ok(new
                {
                    items,
                    totalRows,
                    page,
                    pageSize,
                    totalPages = (int)Math.Ceiling(totalRows / (double)pageSize),
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "GetMyApprovals", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading approvals." });
            }
        }

        // ── GET api/approval/history/{transactionId} ─────────────────────
        [HttpGet("history/{transactionId:int}")]
        public async Task<IActionResult> GetHistory(int transactionId)
        {
            try
            {
                using var grid = await _dbcon.QueryMultipleAsync(
                    "sp_GetApprovalHistory",
                    new { TransactionId = transactionId });

                var transaction = (await grid.ReadAsync<ApprovalTransaction>()).FirstOrDefault();
                var levels      = (await grid.ReadAsync<ApprovalLevel>()).ToList();
                var log         = (await grid.ReadAsync<ApprovalLog>()).ToList();

                return Ok(new ApprovalHistoryResponse { Transaction = transaction, Levels = levels, Log = log });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "GetHistory", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading approval history." });
            }
        }

        // ── GET api/approval/policies ─────────────────────────────────────
        // GET api/approval/policies?moduleCode=PR
        [HttpGet("policies")]
        public async Task<IActionResult> GetPolicies([FromQuery] string? moduleCode = null)
        {
            try
            {
                using var grid = await _dbcon.QueryMultipleAsync(
                    "sp_GetApprovalPolicies",
                    new { ModuleCode = moduleCode });

                var policies = (await grid.ReadAsync<ApprovalPolicy>()).ToList();
                var levels   = (await grid.ReadAsync<ApprovalLevel>()).ToList();

                return Ok(new PoliciesResponse { Policies = policies, Levels = levels });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "GetPolicies", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading approval policies." });
            }
        }

        // ── POST api/approval/policies/save ──────────────────────────────
        [HttpPost("policies/save")]
        public async Task<IActionResult> SavePolicy([FromBody] SavePolicyRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ModuleCode))
                return BadRequest(new { message = "ModuleCode is required." });
            if (string.IsNullOrWhiteSpace(req.PolicyName))
                return BadRequest(new { message = "PolicyName is required." });
            if (!req.Levels.Any())
                return BadRequest(new { message = "At least one approval level is required." });

            try
            {
                // Serialize levels to JSON for the SP
                var levelsJson = JsonSerializer.Serialize(req.Levels, new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                });

                var p = new
                {
                    req.PolicyId,
                    req.ModuleCode,
                    req.PolicyName,
                    req.Description,
                    req.AmountFrom,
                    req.AmountTo,
                    req.IsSequential,
                    req.IsActive,
                    req.SortOrder,
                    req.SavedBy,
                    LevelsJson = levelsJson,
                };

                var result = await _dbcon.QueryFirstAsync<dynamic>("sp_SaveApprovalPolicy", p);
                int policyId = (int)result.PolicyId;

                if (policyId < 0)
                    return BadRequest(new { message = (string)result.Message });

                return Ok(new { policyId, message = (string)result.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "SavePolicy", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving approval policy." });
            }
        }

        // ── GET api/approval/modules ──────────────────────────────────────
        [HttpGet("modules")]
        public async Task<IActionResult> GetModules()
        {
            try
            {
                var list = await _dbcon.QueryAsync<ApprovalModule>(
                    "sp_GetApprovalModules");
                return Ok(list ?? Enumerable.Empty<ApprovalModule>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "GetModules", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading approval modules." });
            }
        }

        // ── GET api/approval/delegates ────────────────────────────────────
        // Optional: ?levelId=N  or  ?moduleCode=PR  to filter
        [HttpGet("delegates")]
        public async Task<IActionResult> GetDelegates(
            [FromQuery] int?    levelId    = null,
            [FromQuery] string? moduleCode = null)
        {
            try
            {
                var list = await _dbcon.QueryAsync<ApprovalDelegate>(
                    "sp_GetApprovalDelegates",
                    new { LevelId = levelId, ModuleCode = moduleCode });
                return Ok(list ?? Enumerable.Empty<ApprovalDelegate>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "GetDelegates", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading approval delegates." });
            }
        }

        // ── POST api/approval/delegates/save ─────────────────────────────
        [HttpPost("delegates/save")]
        public async Task<IActionResult> SaveDelegate([FromBody] SaveDelegateRequest req)
        {
            if (req.LevelId <= 0)
                return BadRequest(new { message = "LevelId is required." });
            if (req.OriginalUserId <= 0)
                return BadRequest(new { message = "OriginalUserId is required." });
            if (req.DelegateUserId <= 0)
                return BadRequest(new { message = "DelegateUserId is required." });
            if (string.IsNullOrWhiteSpace(req.FromDate))
                return BadRequest(new { message = "FromDate is required." });
            if (string.IsNullOrWhiteSpace(req.ToDate))
                return BadRequest(new { message = "ToDate is required." });
            if (string.IsNullOrWhiteSpace(req.SavedBy))
                return BadRequest(new { message = "SavedBy is required." });

            try
            {
                var result = await _dbcon.QueryFirstAsync<dynamic>("sp_SaveApprovalDelegate", new
                {
                    req.DelegateId,
                    req.LevelId,
                    req.OriginalUserId,
                    req.DelegateUserId,
                    req.FromDate,
                    req.ToDate,
                    req.Reason,
                    req.IsActive,
                    req.SavedBy,
                });

                int delegateId = (int)result.DelegateId;
                if (delegateId < 0)
                    return BadRequest(new { message = (string)result.Message });

                return Ok(new { delegateId, message = (string)result.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "SaveDelegate", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving approval delegate." });
            }
        }

        // ── Helpers: map module code → its menu URL and submit action ───────
        // sp_ValidateBudgetPassword checks the user's permission on the given menu
        // before accepting the budget-override password. Each module's submitter
        // already has at least EDIT on their own menu, so we use that as the gate.
        private static string ModuleMenuUrl(string? moduleCode) => moduleCode?.ToUpperInvariant() switch
        {
            "PO"  => "/purchase-orders",
            "PR"  => "/purchase-requests",
            "SRV" => "/service-requests",
            "INV" => "/invoices",
            "RV"  => "/receipt-vouchers",
            "CN"  => "/credit-notes",
            "DN"  => "/debit-notes",
            "PV"  => "/payment-vouchers",
            "BOM" => "/bom",
            _     => "/jobs",
        };

        private static string ModuleSubmitAction(string? moduleCode) => moduleCode?.ToUpperInvariant() switch
        {
            "PO" or "PR" or "SRV" or "INV" or "RV" or "CN" or "DN" or "PV" or "BOM" => "EDIT",
            _ => "APPROVE",
        };

        // ── DELETE api/approval/delegates/{id} ───────────────────────────
        [HttpDelete("delegates/{id:int}")]
        public async Task<IActionResult> DeleteDelegate(int id, [FromQuery] string deletedBy = "")
        {
            if (id <= 0)
                return BadRequest(new { message = "DelegateId is required." });

            try
            {
                var result = await _dbcon.QueryFirstAsync<dynamic>("sp_DeleteApprovalDelegate",
                    new { DelegateId = id, DeletedBy = deletedBy });

                int rows = (int)result.RowsAffected;
                if (rows == 0)
                    return NotFound(new { message = "Delegate record not found." });

                return Ok(new { message = "Delegate removed successfully." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Approval", action: "DeleteDelegate", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting approval delegate." });
            }
        }
    }
}
