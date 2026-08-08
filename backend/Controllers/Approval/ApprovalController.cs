using Dapper;
using ERPWEB.Dbcontext;
using ERPWEB.Models.Approval;
using ERPWEB.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using System.Text.Json;

namespace ERPWEB.Controllers.Approval
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class ApprovalController : ControllerBase
    {
        private readonly DbCon _dbcon;
        private readonly EmailService _email;
        private readonly IConfiguration _config;
        private readonly IServiceScopeFactory _scopeFactory;
        public ApprovalController(DbCon dbcon, EmailService email, IConfiguration config, IServiceScopeFactory scopeFactory)
        {
            _dbcon  = dbcon;
            _email  = email;
            _config = config;
            _scopeFactory = scopeFactory;
        }

        private static string Sha256Hex(string raw)
        {
            using var sha = System.Security.Cryptography.SHA256.Create();
            return Convert.ToHexString(sha.ComputeHash(System.Text.Encoding.UTF8.GetBytes(raw ?? string.Empty))).ToLower();
        }

        // Emails the procurement team when a PR is fully approved so they can raise the PO.
        // Never throws back to the caller — a mail failure must not fail the approval.
        //
        // Takes its dependencies as parameters (not the controller's own _dbcon/_email
        // fields) because it's invoked from a fire-and-forget background Task after the
        // HTTP response has already started returning — see the dispatcher below for why.
        // Using the request-scoped _dbcon/_email there would risk them being disposed
        // mid-send once ASP.NET Core tears down the request's DI scope.
        private async Task NotifyProcurementOnPRApproval(DbCon dbcon, EmailService email, int prId)
        {
            try
            {
                if (!await email.IsConfiguredAsync()) return;

                using var grid = await dbcon.QueryMultipleAsync("sp_GetPRApprovalNotify", new { PrId = prId });
                var pr         = (await grid.ReadAsync<dynamic>()).FirstOrDefault();
                var recipients = (await grid.ReadAsync<dynamic>()).ToList();
                if (pr == null || recipients.Count == 0) return;

                string prNumber = (string?)pr.PrNumber ?? $"PR #{prId}";
                string jobId    = (string?)pr.JobId ?? "—";
                string project  = (string?)pr.ProjectName ?? "";
                string reqBy    = (string?)pr.RequestedBy ?? "—";
                int    openLines = pr.OpenLines != null ? (int)pr.OpenLines : 0;
                decimal openVal  = pr.OpenValue != null ? (decimal)pr.OpenValue : 0m;

                string baseUrl = (_config["App:FrontendUrl"] ?? "http://localhost:3000").TrimEnd('/');
                string link    = $"{baseUrl}/purchase-requests/{prId}";
                string subject = $"PR Approved — {prNumber} ready for PO";
                string body    = BuildPRApprovedEmail(prNumber, jobId, project, reqBy, openLines, openVal, link);

                foreach (var r in recipients)
                {
                    string? to = (string?)r.Email;
                    if (string.IsNullOrWhiteSpace(to)) continue;

                    // SendAsync never throws — an unchecked result would mean procurement
                    // silently never hears about an approved PR.
                    if (!await email.SendAsync(to.Trim(), subject, body))
                    {
                        await dbcon.WriteRawLog(
                            message: $"PR approval notification failed to send to '{to.Trim()}' for {prNumber} (PrId {prId}).",
                            controller: "Approval",
                            action: "NotifyProcurementOnPRApproval",
                            logLevel: "Warning");
                    }
                }
            }
            catch (Exception ex)
            {
                await dbcon.WriteLog(ex, controller: "Approval", action: "NotifyProcurementOnPRApproval");
            }
        }

        // Creates a "create PO" task (proj.TBL_MOM_TASK, via sp_CreateProcurementPOTasks)
        // for every member of the "Procurement" user group. Idempotent on the SQL
        // side (skips if one's already open for this PR) and auto-closed by
        // sp_SetPOLine the moment any PO line gets raised against this PR — see
        // [[weberp-synergy-fork]]. Never throws back — a task-creation failure
        // must not fail the approval itself, same discipline as the email notify.
        // Same "takes dbcon as a parameter" reasoning as NotifyProcurementOnPRApproval above.
        private async Task CreateProcurementPOTask(DbCon dbcon, int prId)
        {
            try
            {
                await dbcon.ExecuteScalarAsync("sp_CreateProcurementPOTasks", new { PrId = prId, CreatedBy = "System" });
            }
            catch (Exception ex)
            {
                await dbcon.WriteLog(ex, controller: "Approval", action: "CreateProcurementPOTask");
            }
        }

        // Runs the two PR-approval side effects (email + task) in the background,
        // AFTER this request has already returned its response to the caller.
        // Approving a PR was measurably slow (8-12s+) because these ran synchronously
        // and NotifyProcurementOnPRApproval's email send retries (up to 3 attempts,
        // each up to 20s, see EmailService.SendAsync) against a currently-unreachable/
        // misconfigured SMTP host — entirely irrelevant to whether the approval itself
        // succeeded, which sp_ProcessApproval already committed before this runs.
        // Uses a fresh DI scope (IServiceScopeFactory) rather than this request's own
        // _dbcon/_email, since those are Scoped and get disposed when the request ends —
        // reusing them here would risk failures mid-flight once the response completes.
        private void FireAndForgetPrApprovalSideEffects(int prId)
        {
            _ = Task.Run(async () =>
            {
                using var scope = _scopeFactory.CreateScope();
                var sp     = scope.ServiceProvider;
                var dbcon  = sp.GetRequiredService<DbCon>();
                var email  = sp.GetRequiredService<EmailService>();
                await NotifyProcurementOnPRApproval(dbcon, email, prId);
                await CreateProcurementPOTask(dbcon, prId);
            });
        }

        private static string BuildPRApprovedEmail(string prNumber, string jobId, string project,
            string requestedBy, int openLines, decimal openValue, string link)
        {
            string proj = string.IsNullOrWhiteSpace(project) ? jobId : $"{jobId} — {System.Net.WebUtility.HtmlEncode(project)}";
            return $@"
<div style=""font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b;"">
  <div style=""background:linear-gradient(135deg,#1e40af,#2e5fa3);padding:22px;border-radius:10px 10px 0 0;text-align:center;"">
    <h1 style=""color:#fff;margin:0;font-size:20px;"">Purchase Request Approved</h1>
  </div>
  <div style=""border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:26px;background:#fff;"">
    <p style=""font-size:14px;line-height:1.6;color:#475569;margin-top:0;"">
      A purchase request has been fully approved and is ready to be converted into a Purchase Order.
    </p>
    <table style=""width:100%;font-size:13px;border-collapse:collapse;margin:16px 0;"">
      <tr><td style=""padding:6px 0;color:#64748b;width:150px;"">PR Number</td><td style=""padding:6px 0;font-weight:700;"">{System.Net.WebUtility.HtmlEncode(prNumber)}</td></tr>
      <tr><td style=""padding:6px 0;color:#64748b;"">Job</td><td style=""padding:6px 0;"">{proj}</td></tr>
      <tr><td style=""padding:6px 0;color:#64748b;"">Requested By</td><td style=""padding:6px 0;"">{System.Net.WebUtility.HtmlEncode(requestedBy)}</td></tr>
      <tr><td style=""padding:6px 0;color:#64748b;"">Open Lines</td><td style=""padding:6px 0;"">{openLines}</td></tr>
      <tr><td style=""padding:6px 0;color:#64748b;"">Est. Open Value</td><td style=""padding:6px 0;font-weight:600;"">{openValue:N2}</td></tr>
    </table>
    <div style=""text-align:center;margin:24px 0 8px;"">
      <a href=""{link}"" style=""background:#1e40af;color:#fff;text-decoration:none;padding:11px 30px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block;"">
        Open PR &amp; Create PO
      </a>
    </div>
  </div>
</div>";
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
                // ── Login password confirmation (required for Approve) ──
                if (string.Equals(req.Action, "Approve", System.StringComparison.OrdinalIgnoreCase))
                {
                    if (string.IsNullOrWhiteSpace(req.LoginPassword))
                        return BadRequest(new { message = "Your login password is required to approve." });

                    // Side-effect-free password check. sp_ValidateUser must NOT be used
                    // here: it now always returns a row (Status column) so !Any() no
                    // longer means "wrong password", and it counts toward login lockout.
                    var rows = await _dbcon.QueryAsync<dynamic>(
                        "sp_CheckUserPassword",
                        new { UserName = req.ActionByName, PasswordHash = Sha256Hex(req.LoginPassword) });

                    if (((int?)rows?.FirstOrDefault()?.IsValid ?? 0) != 1)
                    {
                        await _dbcon.WriteRawLog("Incorrect login password on approval attempt.",
                            controller: "Approval", action: "Action",
                            requestPath: HttpContext.Request.Path, userId: req.ActionByName, logLevel: "Warning");
                        return BadRequest(new { message = "Incorrect password. Approval not processed." });
                    }
                }

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

                var doneModule = (string?)result.ModuleCode;
                var doneDocId  = result.DocumentId != null ? (int?)result.DocumentId : null;

                // A fully-approved PR notifies the procurement team (email) and gives
                // them an actionable "create PO" task so it doesn't just get missed
                // in an inbox — see [[weberp-synergy-fork]].
                if (isComplete
                    && string.Equals((string?)result.NewStatus, "Approved", StringComparison.OrdinalIgnoreCase)
                    && string.Equals(doneModule, "PR", StringComparison.OrdinalIgnoreCase)
                    && doneDocId is int prId)
                {
                    // Fire-and-forget — the approval itself is already committed by
                    // sp_ProcessApproval above; the caller shouldn't wait on an email
                    // send (which can take 8-12s+ on a flaky/misconfigured SMTP host)
                    // for something that's irrelevant to whether their click succeeded.
                    FireAndForgetPrApprovalSideEffects(prId);
                }

                return Ok(new
                {
                    transactionId = (int)result.TransactionId,
                    newStatus     = (string?)result.NewStatus,
                    isComplete    = isComplete,
                    message       = (string)result.Message,
                    moduleCode    = doneModule,
                    documentId    = doneDocId,
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
