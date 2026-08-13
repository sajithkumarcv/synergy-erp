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
    public class JobController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public JobController(DbCon dbcon) { _dbcon = dbcon; }

        // Same hash format that JobBudgetController uses for BUDGET_PASSWORD,
        // so the cancel/complete password validates against the same secret.
        private static string Sha256Hex(string s)
        {
            using var sha = SHA256.Create();
            return Convert.ToHexString(sha.ComputeHash(Encoding.UTF8.GetBytes(s ?? "")));
        }

        // ═══════════════════════════════════════════════════════
        // JOB LIST / SEARCH
        // ═══════════════════════════════════════════════════════
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText = null,
            [FromQuery] string? jobTypeId = null,
            [FromQuery] string? jobTypeIds = null,
            [FromQuery] string? jobStageId = null,
            [FromQuery] int? customerId = null,
            [FromQuery] int? jobStatusId = null,
            [FromQuery] string? jobStatusIds = null,
            [FromQuery] string? dateFrom = null,
            [FromQuery] string? dateTo = null,
            [FromQuery] bool excludeClosedStatus = false,
            [FromQuery] string? approvalStatus = null,
            [FromQuery] int page = 1,
            [FromQuery] int pageSize = 20,
            [FromQuery] string sortCol = "JobDate",
            [FromQuery] string sortDir = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    JobTypeId = string.IsNullOrWhiteSpace(jobTypeId) ? null : jobTypeId,
                    JobTypeIds = string.IsNullOrWhiteSpace(jobTypeIds) ? null : jobTypeIds.Trim(),
                    JobStageId = string.IsNullOrWhiteSpace(jobStageId) ? null : jobStageId,
                    CustomerId = customerId,
                    JobStatusId  = jobStatusId,
                    JobStatusIds = string.IsNullOrWhiteSpace(jobStatusIds) ? null : jobStatusIds.Trim(),
                    DateFrom = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo = string.IsNullOrWhiteSpace(dateTo) ? (DateTime?)null : DateTime.Parse(dateTo),
                    ExcludeClosedStatus = excludeClosedStatus,
                    ApprovalStatus = string.IsNullOrWhiteSpace(approvalStatus) ? null : approvalStatus.Trim(),
                    PageNumber = page < 1 ? 1 : page,
                    PageSize = pageSize is < 1 or > 500 ? 20 : pageSize,
                    SortColumn = sortCol,
                    SortDirection = sortDir
                };
                var rows = await _dbcon.QueryAsync<ERPWEB.Models.Job.Job>("sp_SearchJobs", p);
                var list = rows?.ToList() ?? new List<ERPWEB.Models.Job.Job>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { totalRows = total, page, pageSize, totalPages = (int)Math.Ceiling((double)total / pageSize), data = list });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error  searching job details." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // GET SINGLE JOB
        // ═══════════════════════════════════════════════════════
        [HttpGet("{jobId}")]
        public async Task<IActionResult> GetJob(string jobId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<ERPWEB.Models.Job.Job>("sp_SearchJobs", new
                {
                    SearchText = jobId,
                    PageNumber = 1,
                    PageSize = 1,
                    SortColumn = "JobId",
                    SortDirection = "ASC"
                });
                var job = rows?.FirstOrDefault(j => j.JobId == jobId);
                if (job == null) return NotFound(new { message = "Job not found." });
                return Ok(job);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetJob", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job details." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // GET JOB BY NUMERIC SURROGATE (JobNumId) — approval workflows
        // (TBL_APPROVAL_TRANSACTION.DocumentId) reference jobs by this numeric
        // id, not the JobId string, so callers that only have a documentId
        // (e.g. the My Approvals preview drawer) need this instead of GetJob.
        // ═══════════════════════════════════════════════════════
        [HttpGet("by-num/{jobNumId:int}")]
        public async Task<IActionResult> GetJobByNumId(int jobNumId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<ERPWEB.Models.Job.Job>("sp_SearchJobs", new
                {
                    JobNumId = jobNumId,
                    PageNumber = 1,
                    PageSize = 1,
                    SortColumn = "JobId",
                    SortDirection = "ASC"
                });
                var job = rows?.FirstOrDefault();
                if (job == null) return NotFound(new { message = "Job not found." });
                return Ok(job);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetJobByNumId", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job details." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // PREVIEW JOB ID + COSTING FLAG (no series consumed)
        // GET: api/job/preview-id/T1
        // Returns: { previewJobId, jobTypeName, isCostingRequired, nextSeries }
        // ═══════════════════════════════════════════════════════
        [HttpGet("preview-id/{jobTypeId}")]
        public async Task<IActionResult> PreviewJobId(string jobTypeId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<JobIdPreview>(
                    "sp_PreviewJobId", new { JobTypeId = jobTypeId });
                var result = rows?.FirstOrDefault();
                if (result == null)
                    return NotFound(new { message = $"Job type '{jobTypeId}' not found." });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "PreviewJobId", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error Preview job details." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // CREATE / UPDATE JOB  (uses SP_GENERATEJOBSERIES inside sp_SetJob)
        // ═══════════════════════════════════════════════════════
        [HttpPost("save")]
        public async Task<IActionResult> SaveJob([FromBody] ERPWEB.Models.Job.Job model)
        {
            try
            {
                var p = new
                {
                    JobId = string.IsNullOrWhiteSpace(model.JobId) ? null : model.JobId,
                    model.ParentJobId,
                    model.JobTypeId,
                    model.JobStageId,
                    model.CustomerId,
                    model.JobCurrencyId,
                    model.JobExcRate,
                    model.JobDescription,
                    JobDate = model.JobDate == default ? (DateTime?)null : model.JobDate,
                    model.ProjectName,
                    model.LpoDate,
                    model.ContractRef,
                    model.LpoRef,
                    model.JobStatusId,
                    model.ExternalRef,
                    CreatedBy = model.JobCreatedBy,
                    ModifiedBy = model.JobLastModifiedBy,
                    model.OrderValue,
                    model.JobAdvanceAmount,
                    model.JobExpectedCompleteDate,
                    model.JobExpectedDeliveryDate,
                    model.JobPlannedStartDate,
                    model.BudgetCategoryId

                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetJob", p);

                bool isNew = string.IsNullOrWhiteSpace(model.JobId);
                await _dbcon.ExecuteScalarAsync("sp_AddJobAudit", new
                {
                    JobId = result,
                    Action = isNew ? "CREATED" : "UPDATED",
                    Section = "Overview",
                    NewValue = isNew ? $"Job created as {result}" : "Job details updated",
                    CreatedBy = isNew ? model.JobCreatedBy : model.JobLastModifiedBy
                });

                return Ok(new
                {
                    jobId = result,
                    message = isNew ? $"Job created: {result}" : "Job updated"
                });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                // Validation errors raised by sp_SetJob (e.g. missing budget header
                // for a budget-header-linked job type) surface to the user, not a 500.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "SaveJob", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving job details." });
            }

        }

        // ═══════════════════════════════════════════════════════
        // DELETE JOB
        // ═══════════════════════════════════════════════════════
        [HttpDelete("{jobId}")]
        public async Task<IActionResult> DeleteJob(string jobId)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteJob", new { JobId = jobId });
                if (result == "NotExists") return NotFound(new { message = "Job not found." });
                return Ok(new { jobId, message = "Job deleted" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "DeleteJob", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting job details." });
            }
        }

        // Direct status change is disabled — all status transitions go through the approval workflow.
        // Kept as 409 so callers get a clear error rather than a 404.
        [HttpPost("{jobId}/status")]
        public IActionResult ChangeStatus(string jobId) =>
            Conflict(new { message = "Job status changes are controlled by the approval workflow. Use POST /api/approval/action instead." });

        // ═══════════════════════════════════════════════════════
        // IS-CLOSED CHECK  (lightweight — for UI banners)
        // GET /api/job/{jobId}/is-closed
        // ═══════════════════════════════════════════════════════
        [HttpGet("{jobId}/is-closed")]
        public async Task<IActionResult> IsClosed(string jobId)
        {
            try
            {
                var row = await _dbcon.QueryFirstOrDefaultAsync<dynamic>(
                    "sp_CheckJobOpenForTransactions", new { JobId = jobId });

                if (row == null)
                    return NotFound(new { message = $"Job {jobId} not found." });

                return Ok(new
                {
                    jobId      = (string)row.JobId,
                    isClosed   = (bool)row.IsClosed,
                    statusName = (string)row.StatusName,
                    message    = (string?)row.Message,
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "IsClosed", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error checking job status." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // CLOSE READINESS  (pre-flight checklist — read only)
        // GET /api/job/{jobId}/close-readiness?action=complete|cancel
        // ═══════════════════════════════════════════════════════
        [HttpGet("{jobId}/close-readiness")]
        public async Task<IActionResult> CloseReadiness(string jobId, [FromQuery] string action = "complete")
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>(
                    "sp_GetJobCloseReadiness", new { JobId = jobId, Action = action });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "CloseReadiness", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading close readiness." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // COMPLETION CHECK  (pre-flight — read only)
        // GET /api/job/{jobId}/completion-check
        // ═══════════════════════════════════════════════════════
        [HttpGet("{jobId}/completion-check")]
        public async Task<IActionResult> CompletionCheck(string jobId)
        {
            try
            {
                var row = await _dbcon.QueryFirstOrDefaultAsync<dynamic>(
                    "sp_GetJobCompletionCheck", new { JobId = jobId });

                if (row == null)
                    return NotFound(new { message = $"Job {jobId} not found." });

                return Ok(new
                {
                    jobId            = (string)row.JobId,
                    orderValue       = (decimal)row.OrderValue,
                    orderValueBase   = (decimal)row.OrderValueBase,
                    totalInvoiced    = (decimal)row.TotalInvoiced,
                    totalPaid        = (decimal)row.TotalPaid,
                    invoicedPct      = (decimal)row.InvoicedPct,
                    paidPct          = (decimal)row.PaidPct,
                    invoiceOk        = (bool)row.InvoiceOk,
                    paymentOk        = (bool)row.PaymentOk,
                    canComplete      = (bool)row.CanComplete,
                    currencyCode     = (string?)row.CurrencyCode,
                    exchangeRate     = (decimal)row.ExchangeRate,
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "CompletionCheck", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error checking job completion status." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // COMPLETE JOB
        // POST /api/job/{jobId}/complete
        // ═══════════════════════════════════════════════════════
        [HttpPost("{jobId}/complete")]
        public async Task<IActionResult> CompleteJob(string jobId, [FromBody] CompleteJobRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ModifiedBy))
                return BadRequest(new { message = "ModifiedBy is required." });
            if (string.IsNullOrWhiteSpace(req.Reason))
                return BadRequest(new { message = "Reason is required." });
            if (string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { message = "Password is required." });

            try
            {
                var result = await _dbcon.QueryFirstAsync<dynamic>("sp_ChangeJobStatus", new
                {
                    JobId        = jobId,
                    JobStatusId  = 4,
                    OldStatus    = req.OldStatus,
                    NewStatus    = "Completed",
                    ModifiedBy   = req.ModifiedBy,
                    Reason       = req.Reason.Trim(),
                    PasswordHash = Sha256Hex(req.Password),
                });

                bool success = Convert.ToBoolean(result.Success);
                if (!success)
                    return BadRequest(new { message = (string)result.Message });

                return Ok(new { message = "Job marked as Completed.", jobId = (string)result.JobId });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "CompleteJob", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error completing job." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // CANCEL JOB
        // POST /api/job/{jobId}/cancel
        // ═══════════════════════════════════════════════════════
        [HttpPost("{jobId}/cancel")]
        public async Task<IActionResult> CancelJob(string jobId, [FromBody] CompleteJobRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.ModifiedBy))
                return BadRequest(new { message = "ModifiedBy is required." });
            if (string.IsNullOrWhiteSpace(req.Reason))
                return BadRequest(new { message = "Reason is required." });
            if (string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { message = "Password is required." });

            try
            {
                var result = await _dbcon.QueryFirstAsync<dynamic>("sp_ChangeJobStatus", new
                {
                    JobId        = jobId,
                    JobStatusId  = 5,
                    OldStatus    = req.OldStatus,
                    NewStatus    = "Cancelled",
                    ModifiedBy   = req.ModifiedBy,
                    Reason       = req.Reason.Trim(),
                    PasswordHash = Sha256Hex(req.Password),
                });

                bool success = Convert.ToBoolean(result.Success);
                if (!success)
                    return BadRequest(new { message = (string)result.Message });

                return Ok(new { message = "Job cancelled.", jobId = (string)result.JobId });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "CancelJob", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error cancelling job." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // REVISE JOB  (reopen a closed job)
        // POST /api/job/{jobId}/revise
        // ═══════════════════════════════════════════════════════
        [HttpPost("{jobId}/revise")]
        public async Task<IActionResult> ReviseJob(string jobId, [FromBody] ReviseJobRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.Reason))
                return BadRequest(new { message = "Revision reason is required." });
            if (string.IsNullOrWhiteSpace(req.RevisedBy))
                return BadRequest(new { message = "RevisedBy is required." });
            if (string.IsNullOrWhiteSpace(req.Password))
                return BadRequest(new { message = "Password is required." });

            try
            {
                var result = await _dbcon.QueryFirstAsync<dynamic>("sp_ReviseJob", new
                {
                    JobId        = jobId,
                    req.Reason,
                    req.RevisedBy,
                    PasswordHash = Sha256Hex(req.Password),
                });

                bool success = Convert.ToBoolean(result.Success);
                if (!success)
                    return BadRequest(new { message = (string)result.Message });

                return Ok(new { message = (string)result.Message, jobId = (string)result.JobId });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "ReviseJob", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error revising job." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // CHANGE STAGE
        // ═══════════════════════════════════════════════════════
        [HttpPost("{jobId}/stage")]
        public async Task<IActionResult> ChangeStage(string jobId, [FromBody] ChangeStageRequest model)
        {
            try
            {
                var result = await _dbcon.QueryFirstOrDefaultAsync<dynamic>("sp_ChangeJobStage", new
                {
                    JobId        = jobId,
                    model.JobStageId,
                    OldStage     = model.OldStage,
                    NewStage     = model.NewStage,
                    ModifiedBy   = model.ModifiedBy,
                    Reason       = string.IsNullOrWhiteSpace(model.Reason) ? null : model.Reason.Trim(),
                    PasswordHash = string.IsNullOrWhiteSpace(model.Password) ? null : Sha256Hex(model.Password),
                });

                // The SP returns Success/Message rows for the freeze path; legacy stage
                // changes return JobId/Freezed only. Treat missing Success as success.
                // We cast through IDictionary<string, object?> so the compiler can do
                // definite-assignment tracking on the looked-up value.
                if (result is IDictionary<string, object?> row)
                {
                    object? successVal = null;
                    row.TryGetValue("Success", out successVal);
                    if (successVal != null && Convert.ToInt32(successVal) == 0)
                    {
                        object? messageVal = null;
                        row.TryGetValue("Message", out messageVal);
                        return BadRequest(new { message = messageVal as string ?? "Stage update failed." });
                    }
                }

                return Ok(new { message = "Stage updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "ChangeStage", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error changing job stage." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // UPDATE FINANCE (order value + advance amount)
        // ═══════════════════════════════════════════════════════
        [HttpPatch("{jobId}/finance")]
        public async Task<IActionResult> UpdateFinance(string jobId, [FromBody] UpdateFinanceRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_UpdateJobFinance", new
                {
                    JobId         = jobId,
                    CurrencyId    = model.CurrencyId,
                    ExchangeRate  = model.ExchangeRate,
                    OrderValue    = model.OrderValue,
                    AdvanceAmount = model.AdvanceAmount,
                    ModifiedBy    = model.ModifiedBy
                });
                return Ok(new { message = "Financial values updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                // Business-rule violations raised by the SP (e.g. order value reduced
                // below the budget already allocated) are user-facing messages —
                // return 400 so the frontend can display them, instead of the
                // generic 500 below swallowing the specific reason.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "UpdateFinance", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error updating financial values." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // AUDIT TRAIL
        // ═══════════════════════════════════════════════════════
        [HttpGet("{jobId}/audit")]
        public async Task<IActionResult> GetAudit(string jobId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<JobAudit>("sp_GetJobAudit", new { JobId = jobId });
                return Ok(rows ?? Enumerable.Empty<JobAudit>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetAudit", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job audit trail." });
            }
        }

        // GET /api/job/{jobId}/lifecycle — immutable Completed/Cancelled audit columns
        [HttpGet("{jobId}/lifecycle")]
        public async Task<IActionResult> GetLifecycle(string jobId)
        {
            try
            {
                var row = await _dbcon.QueryFirstOrDefaultAsync<dynamic>(
                    "sp_GetJobLifecycle", new { JobId = jobId });
                return Ok(row ?? new { });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetLifecycle", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job lifecycle data." });
            }
        }

        // GET /api/job/{jobId}/lock-state — { isLocked, isCompleted, isCancelled, … }
        // Lightweight check used by transactional modules (PR/PO/GRN/Invoice/Issue/etc.)
        // before they open a "create / edit" form against this job.
        [HttpGet("{jobId}/lock-state")]
        public async Task<IActionResult> GetLockState(string jobId)
        {
            try
            {
                var row = await _dbcon.QueryFirstOrDefaultAsync<dynamic>(
                    "sp_GetJobLockState", new { JobId = jobId });
                return Ok(row ?? new { isLocked = false });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetLockState", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job lock state." });
            }
        }

        // GET /api/job/{jobId}/approval-readiness
        // Returns a checklist of requirements that must be met before the job can
        // be submitted for approval (Engineers, Terms, Documents, Meta, Finance).
        [HttpGet("{jobId}/approval-readiness")]
        public async Task<IActionResult> GetApprovalReadiness(string jobId)
        {
            try
            {
                var failures = (await _dbcon.QueryAsync<dynamic>("sp_ValidateJobForApproval",
                    new { JobId = jobId }))?.ToList() ?? new List<dynamic>();
                string[] allReqs = ["Finance", "Engineers", "Terms", "Documents", "Meta"];
                var failMap = failures.ToDictionary(r => (string)r.Requirement, r => (string)r.Message);
                var result = allReqs.Select(r => new
                {
                    requirement = r,
                    ok          = !failMap.ContainsKey(r),
                    message     = failMap.TryGetValue(r, out var m) ? m : (string?)null,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetApprovalReadiness", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error checking approval readiness." });
            }
        }

        // GET /api/job/{jobId}/budget-state → { state: 'NONE' | 'DRAFT' | 'APPROVED' }
        // Used by the JobDetailPage banner and by transactional modules to pre-block
        // their "Create" buttons before the SP refuses.
        [HttpGet("{jobId}/budget-state")]
        public async Task<IActionResult> GetBudgetState(string jobId)
        {
            try
            {
                // Calls the scalar UDF directly via an inline SELECT — keeps the
                // round-trip tiny and avoids adding a single-purpose SP wrapper.
                var row = await _dbcon.QueryFirstOrDefaultAsync<BudgetStateRow>(
                    "sp_GetJobBudgetState", new { JobId = jobId });
                return Ok(new { state = row?.State ?? "NONE" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetBudgetState", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving budget state." });
            }
        }

        private class BudgetStateRow { public string? State { get; set; } }

        // ═══════════════════════════════════════════════════════
        // JOB TYPES & STAGES
        // ═══════════════════════════════════════════════════════
        [HttpGet("types")]
        public async Task<IActionResult> GetJobTypes()
        {
            try { return Ok(await _dbcon.QueryAsync<JobType>("sp_GetJobTypeList") ?? Enumerable.Empty<JobType>()); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetJobTypes", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job types." });
            }
        }

        [HttpGet("stages")]
        public async Task<IActionResult> GetJobStages()
        {
            try { return Ok(await _dbcon.QueryAsync<JobStage>("sp_GetJobStageList") ?? Enumerable.Empty<JobStage>()); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetJobStages", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job stages." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // TERMS
        // ═══════════════════════════════════════════════════════
        [HttpGet("{jobId}/terms")]
        public async Task<IActionResult> GetTerms(string jobId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<JobTerms>("sp_GetJobTerms", new { JobId = jobId });
                return Ok(rows?.FirstOrDefault());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetTerms", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job terms." });
            }
        }

        [HttpPost("{jobId}/terms")]
        public async Task<IActionResult> SaveTerms(string jobId, [FromBody] JobTerms model)
        {
            try
            {
                model.JobId = jobId;
                await _dbcon.ExecuteScalarAsync("sp_SetJobTerms", new
                {
                    model.JobId,
                    model.JobPaymentTerms,
                    model.WarrantyTerms,
                    model.JobDeliveryTerms,
                    model.CreatedBy,
                    model.ModifiedBy
                });
                await _dbcon.ExecuteScalarAsync("sp_AddJobAudit", new
                {
                    JobId = jobId,
                    Action = "UPDATED",
                    Section = "Terms",
                    CreatedBy = model.ModifiedBy ?? model.CreatedBy
                });
                return Ok(new { message = "Terms saved." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "SaveTerms", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving job terms." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // EXPENSES
        // ═══════════════════════════════════════════════════════
        [HttpGet("expense-categories")]
        public async Task<IActionResult> GetExpenseCategories()
        {
            try { return Ok(await _dbcon.QueryAsync<ExpenseCategory>("sp_GetJobExpenseCategoryList") ?? Enumerable.Empty<ExpenseCategory>()); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetExpenseCategories", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving expense categories." });
            }
        }

        [HttpGet("{jobId}/expenses")]
        public async Task<IActionResult> GetExpenses(string jobId)
        {
            try { return Ok(await _dbcon.QueryAsync<JobExpense>("sp_GetJobExpenses", new { JobId = jobId }) ?? Enumerable.Empty<JobExpense>()); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetExpenses", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job expenses." });
            }
        }

        [HttpPost("{jobId}/expenses")]
        public async Task<IActionResult> SaveExpense(string jobId, [FromBody] JobExpense model)
        {
            // Financial-edit guard: reason (≥10 chars) + budget password required.
            // Only editing an existing expense is gated — adding a new expense
            // (ExpenseId == 0, incl. reversals) is not, matching the client flow.
            if (model.ExpenseId > 0)
            {
                var reasonErr = ERPWEB.Security.FinancialGuard.ValidateReason(model.Reason);
                if (reasonErr != null) return BadRequest(new { message = reasonErr });
                if (!await ERPWEB.Security.FinancialGuard.VerifyBudgetPasswordAsync(_dbcon, User.Identity?.Name ?? model.ModifiedBy ?? model.CreatedBy, model.Password))
                    return BadRequest(new { message = "Incorrect budget password." });
            }
            try
            {
                model.JobId = jobId;
                var result = await _dbcon.ExecuteScalarAsync("sp_SetJobExpense", new
                {
                    model.ExpenseId,
                    model.JobId,
                    model.ExpenseCategoryId,
                    model.ExpenseDescription,
                    model.ExpenseAmount,
                    ExpenseDate = model.ExpenseDate.Date,
                    model.CurrencyId,
                    model.ExchangeRate,
                    model.AmountInBaseCurrency,
                    model.ReferenceNo,
                    model.Remarks,
                    model.CreatedBy,
                    model.ModifiedBy
                });
                string action = model.ExpenseId == 0 ? "EXPENSE_ADDED" : "EXPENSE_UPDATED";
                await _dbcon.ExecuteScalarAsync("sp_AddJobAudit", new
                {
                    JobId = jobId,
                    Action = action,
                    Section = "Expenses",
                    NewValue = $"{model.ExpenseAmount} — {model.ExpenseDescription} (reason: {model.Reason?.Trim()})",
                    CreatedBy = model.ModifiedBy ?? model.CreatedBy
                });
                return Ok(new { expenseId = result });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "SaveExpense", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving expense." });
            }
        }

        [HttpDelete("{jobId}/expenses/{expenseId}")]
        public async Task<IActionResult> DeleteExpense(string jobId, int expenseId,
            [FromQuery] string? modifiedBy = null, [FromQuery] string? password = null, [FromQuery] string? reason = null)
        {
            // Financial-edit guard: reason (≥10 chars) + budget password required.
            var reasonErr = ERPWEB.Security.FinancialGuard.ValidateReason(reason);
            if (reasonErr != null) return BadRequest(new { message = reasonErr });
            if (!await ERPWEB.Security.FinancialGuard.VerifyBudgetPasswordAsync(_dbcon, User.Identity?.Name ?? modifiedBy, password))
                return BadRequest(new { message = "Incorrect budget password." });
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeleteJobExpense", new { ExpenseId = expenseId, JobId = jobId });
                await _dbcon.ExecuteScalarAsync("sp_AddJobAudit", new
                {
                    JobId = jobId, Action = "EXPENSE_DELETED", Section = "Expenses",
                    NewValue = $"Expense #{expenseId} removed (reason: {reason?.Trim()})",
                    CreatedBy = modifiedBy
                });
                return Ok(new { message = "Expense deleted" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "DeleteExpense", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting expense." });
            }
        }

        [HttpPost("{jobId}/expenses/{expenseId}/approve")]
        public async Task<IActionResult> ApproveExpense(string jobId, int expenseId, [FromBody] ApproveRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ApproveJobExpense", new
                {
                    ExpenseId = expenseId,
                    JobId = jobId,
                    ApprovedBy = model.ApprovedBy
                });
                await _dbcon.ExecuteScalarAsync("sp_AddJobAudit", new
                {
                    JobId = jobId,
                    Action = "EXPENSE_APPROVED",
                    Section = "Expenses",
                    OldValue = "Pending",
                    NewValue = "Approved",
                    CreatedBy = model.ApprovedBy
                });
                return Ok(new { message = "Expense approved." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "ApproveExpense", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error approving expense." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // ENGINEERS
        // ═══════════════════════════════════════════════════════
        [HttpGet("engineers")]
        public async Task<IActionResult> GetEngineers()
        {
            try { return Ok(await _dbcon.QueryAsync<Engineer>("sp_GetEngineerList") ?? Enumerable.Empty<Engineer>()); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetEngineers", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving engineers." });
            }
        }

        [HttpGet("roles")]
        public async Task<IActionResult> GetJobRoles()
        {
            try { return Ok(await _dbcon.QueryAsync<JobRole>("sp_GetJobRoles") ?? Enumerable.Empty<JobRole>()); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetJobRoles", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching job roles." });
            }
        }

        [HttpGet("{jobId}/engineers")]
        public async Task<IActionResult> GetJobEngineers(string jobId)
        {
            try { return Ok(await _dbcon.QueryAsync<JobEngineer>("sp_GetJobEngineers", new { JobId = jobId }) ?? Enumerable.Empty<JobEngineer>()); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetJobEngineers", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job engineers." });
            }
        }

        [HttpPost("{jobId}/engineers")]
        public async Task<IActionResult> SaveJobEngineer(string jobId, [FromBody] JobEngineer model)
        {
            try
            {
                model.JobId = jobId;
                var result = await _dbcon.ExecuteScalarAsync("sp_SetJobEngineer", new
                {
                    model.JobEngineerId,
                    model.JobId,
                    model.EngineerId,
                    model.Role,
                    AssignedBy = model.AssignedBy,
                    model.Completed
                });
                if (result == "-1") return BadRequest(new { message = "Engineer already assigned to this job." });

                await _dbcon.ExecuteScalarAsync("sp_AddJobAudit", new
                {
                    JobId = jobId,
                    Action = model.JobEngineerId == 0 ? "ENGINEER_ASSIGNED" : "ENGINEER_UPDATED",
                    Section = "Engineers",
                    NewValue = model.EngineerName ?? $"Engineer #{model.EngineerId}",
                    CreatedBy = model.AssignedBy
                });
                return Ok(new { jobEngineerId = result });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "SaveJobEngineer", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving job engineer." });
            }
        }

        [HttpDelete("{jobId}/engineers/{jobEngineerId}")]
        public async Task<IActionResult> DeleteJobEngineer(string jobId, int jobEngineerId)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeleteJobEngineer", new { JobEngineerId = jobEngineerId, JobId = jobId });
                return Ok(new { message = "Engineer removed" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "DeleteJobEngineer", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error removing job engineer." });
            }
        }

        //// ═══════════════════════════════════════════════════════
        //// JOBTYPE-STAGE MAPPING
        //// ═══════════════════════════════════════════════════════
        //[HttpGet("types/{jobTypeId}/stages")]
        //public async Task<IActionResult> GetJobTypeStages(string jobTypeId)
        //{
        //    try { return Ok(await _dbcon.QueryAsync<JobTypeStage>("sp_GetJobTypeStages", new { JobTypeId = jobTypeId }) ?? Enumerable.Empty<JobTypeStage>()); }
        //    catch (Exception ex) { return StatusCode(500, new { message = ex.Message }); }
        //}

     

        // ═══════════════════════════════════════════════════════
        // ADDITIONAL JOBS  (children of a parent job)
        // ═══════════════════════════════════════════════════════
        [HttpGet("{jobId}/additional-jobs")]
        public async Task<IActionResult> GetAdditionalJobs(string jobId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetAdditionalJobs", new { ParentJobId = jobId });
                return Ok(rows ?? Enumerable.Empty<dynamic>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetAdditionalJobs", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving additional jobs." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // JOB META  (bay / category / quality / total units)
        // ═══════════════════════════════════════════════════════

        [HttpGet("bays")]
        public async Task<IActionResult> GetJobBays()
        {
            try { return Ok(await _dbcon.QueryAsync<JobBay>("sp_GetJobBays") ?? Enumerable.Empty<JobBay>()); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetJobBays", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving bay list." });
            }
        }

        [HttpGet("categories")]
        public async Task<IActionResult> GetJobCategories()
        {
            try { return Ok(await _dbcon.QueryAsync<JobCategory>("sp_GetJobCategories") ?? Enumerable.Empty<JobCategory>()); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetJobCategories", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job category list." });
            }
        }

        [HttpGet("quality-levels")]
        public async Task<IActionResult> GetJobQualityLevels()
        {
            try { return Ok(await _dbcon.QueryAsync<JobQualityLevel>("sp_GetJobQualityLevels") ?? Enumerable.Empty<JobQualityLevel>()); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetJobQualityLevels", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving quality level list." });
            }
        }

        [HttpGet("{jobId}/meta")]
        public async Task<IActionResult> GetJobMeta(string jobId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<JobMeta>("sp_GetJobMeta", new { JobId = jobId });
                var meta = rows?.FirstOrDefault();
                if (meta == null) return NotFound(new { message = "No meta record for this job." });
                return Ok(meta);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetJobMeta", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving job meta." });
            }
        }

        [HttpPost("{jobId}/meta")]
        public async Task<IActionResult> SaveJobMeta(string jobId, [FromBody] SaveMetaRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_SetJobMeta", new
                {
                    JobId          = jobId,
                    model.BayId,
                    model.JobCategoryId,
                    model.QualityLevelId,
                    model.TotalUnits,
                    model.DeliveredUnit,
                    ModifiedBy     = model.ModifiedBy
                });
                return Ok(new { message = "Job meta saved." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                // Surface validation errors (e.g. total < delivered) to the client.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "SaveJobMeta", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving job meta." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // JOB BOMs  (multi-BOM per job)
        // ═══════════════════════════════════════════════════════






        // ═══════════════════════════════════════════════════════
        // JOB REPORT  —  GET: api/job/{jobId}/report
        // Aggregates job header + budget + linked PRs/POs/Invoices
        // into a single payload for the print modal.
        // ═══════════════════════════════════════════════════════
        [HttpGet("{jobId}/report")]
        public async Task<IActionResult> GetJobReport(string jobId)
        {
            try
            {
                // ── Job header (reuse existing search SP, 1-row filter) ──
                var jobRows = await _dbcon.QueryAsync<ERPWEB.Models.Job.Job>("sp_SearchJobs", new
                {
                    SearchText    = jobId,
                    PageNumber    = 1,
                    PageSize      = 1,
                    SortColumn    = "JobId",
                    SortDirection = "ASC"
                });
                var job = jobRows?.FirstOrDefault(j => j.JobId == jobId);
                if (job == null) return NotFound(new { message = "Job not found." });

                // ── Budget (reuse existing SP) ───────────────────────────
                var (budgetHeaders, budgetLines) = await _dbcon.QueryMultipleAsync<
                    ERPWEB.Models.Job.JobBudgetHeader,
                    ERPWEB.Models.Job.JobBudgetLine>("sp_GetJobBudget", new { JobId = jobId });

                // ── Linked docs (POs, Invoices) ──────────────────────────
                using var docs = await _dbcon.QueryMultipleAsync("sp_GetJobReportDocs", new { JobId = jobId });
                var pos      = (await docs.ReadAsync<ERPWEB.Models.Job.JobReportPo>()).ToList();
                var invoices = (await docs.ReadAsync<ERPWEB.Models.Job.JobReportInvoice>()).ToList();

                return Ok(new ERPWEB.Models.Job.JobReportResponse
                {
                    Header      = job,
                    BudgetMeta  = budgetHeaders.FirstOrDefault() ?? new ERPWEB.Models.Job.JobBudgetHeader { JobId = jobId },
                    BudgetLines = budgetLines ?? new List<ERPWEB.Models.Job.JobBudgetLine>(),
                    Pos         = pos,
                    Invoices    = invoices,
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Job", action: "GetJobReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating job report." });
            }
        }

        // ── Inline request / response models ──────────────────────
        public class ChangeStatusRequest
        {
            public int JobStatusId { get; set; }
            public string OldStatus { get; set; } = "";
            public string NewStatus { get; set; } = "";
            public string ModifiedBy { get; set; } = "";
        }

        public class ChangeStageRequest
        {
            public string  JobStageId { get; set; } = "";
            public string  OldStage   { get; set; } = "";
            public string  NewStage   { get; set; } = "";
            public string  ModifiedBy { get; set; } = "";
            // Reason + password are required when the picked stage triggers an
            // auto-freeze (currently STAGE5). Both are forwarded to the SP which
            // re-validates them (the SP is authoritative — UI is just UX).
            public string? Reason     { get; set; }
            public string? Password   { get; set; }
        }

        public class ApproveRequest
        {
            public string ApprovedBy { get; set; } = "";
        }

        public class GenerateMaterialsRequest
        {
            public string CreatedBy { get; set; } = "";
        }

        public class JobRole
        {
            public int    JobRoleId   { get; set; }
            public string JobRoleName { get; set; } = "";
        }

        public class SaveMetaRequest
        {
            public int     BayId          { get; set; }
            public int     JobCategoryId  { get; set; }
            public int      QualityLevelId { get; set; }
            public decimal  TotalUnits     { get; set; }
            public decimal? DeliveredUnit  { get; set; }
            public string   ModifiedBy     { get; set; } = "";
        }

        public class UpdateFinanceRequest
        {
            public int     CurrencyId    { get; set; }
            public decimal ExchangeRate  { get; set; } = 1;
            public decimal OrderValue    { get; set; }
            public decimal AdvanceAmount { get; set; }
            public string  ModifiedBy    { get; set; } = "";
        }

        public class CompleteJobRequest
        {
            public string OldStatus  { get; set; } = "";
            public string ModifiedBy { get; set; } = "";
            public string Reason     { get; set; } = "";   // mandatory — persisted to TBL_JOB.*Reason
            public string Password   { get; set; } = "";   // mandatory — validated against BUDGET_PASSWORD
        }

        public class ReviseJobRequest
        {
            public string Reason    { get; set; } = "";
            public string RevisedBy { get; set; } = "";
            public string Password  { get; set; } = "";   // validated against BUDGET_PASSWORD secret
        }

        // JobBom and JobMaterial live in Models/Job/Job.cs — referenced here via using ERPWEB.Models.Job

        // Returned by GET /job/preview-id/:jobTypeId
        public class JobIdPreview
        {
            public string PreviewJobId     { get; set; } = "";
            public string JobTypeName      { get; set; } = "";
            public bool   IsCostingRequired  { get; set; }
            public bool   RequiresParentJob  { get; set; }
            public bool   IsBudgetHeaderLinked { get; set; }
            public int    NextSeries          { get; set; }
        }
    }
}
