using ERPWEB.Dbcontext;
using ERPWEB.Models.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Finance
{
    /// <summary>
    /// Payment Follow-up (Collections) — shared accounts-team worklist of
    /// customers to chase for payment, the per-customer contact log, and
    /// promise-to-pay tracking. Outstanding balances reuse the Receivables
    /// calculation; nothing is recomputed differently here.
    /// </summary>
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class PaymentFollowupController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public PaymentFollowupController(DbCon dbcon) { _dbcon = dbcon; }

        // ── WORKLIST ─────────────────────────────────────────────────────────
        [HttpGet("worklist")]
        public async Task<IActionResult> Worklist(
            [FromQuery] string? searchText = null,
            [FromQuery] string? state      = null,
            [FromQuery] bool    showAll    = false,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "Priority",
            [FromQuery] string  sortDir    = "ASC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    State         = string.IsNullOrWhiteSpace(state) ? null : state.Trim(),
                    ShowAll       = showAll,
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir,
                };
                var rows  = await _dbcon.QueryAsync<FollowupWorklistRow>("sp_GetFollowupWorklist", p);
                var list  = rows?.ToList() ?? new List<FollowupWorklistRow>();
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
                await _dbcon.WriteLog(ex, controller: "PaymentFollowup", action: "Worklist", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading follow-up worklist." });
            }
        }

        // ── WORKLIST SUMMARY (header cards) ──────────────────────────────────
        [HttpGet("worklist-summary")]
        public async Task<IActionResult> WorklistSummary()
        {
            try
            {
                var row = await _dbcon.QueryFirstOrDefaultAsync<FollowupWorklistSummary>("sp_GetFollowupWorklistSummary");
                return Ok(row ?? new FollowupWorklistSummary());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentFollowup", action: "WorklistSummary", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading worklist summary." });
            }
        }

        // ── CUSTOMER FOLLOW-UP PANEL (summary + timeline) ────────────────────
        [HttpGet("customer-history/{customerId:int}")]
        public async Task<IActionResult> CustomerHistory(int customerId)
        {
            try
            {
                var (summaryRows, historyRows) =
                    await _dbcon.QueryMultipleAsync<CustomerFollowupSummary, FollowupHistoryItem>(
                        "sp_GetCustomerFollowupHistory", new { CustomerId = customerId });

                return Ok(new
                {
                    summary = summaryRows.FirstOrDefault() ?? new CustomerFollowupSummary(),
                    history = historyRows ?? Enumerable.Empty<FollowupHistoryItem>(),
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentFollowup", action: "CustomerHistory", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading customer follow-up history." });
            }
        }

        // ── SAVE (log a call / edit an entry) ────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SavePaymentFollowupRequest model)
        {
            if (model.CustomerId <= 0)
                return BadRequest(new { message = "Customer is required." });
            if (string.IsNullOrWhiteSpace(model.Outcome))
                return BadRequest(new { message = "Outcome is required." });
            if (string.IsNullOrWhiteSpace(model.ActionBy))
                return BadRequest(new { message = "User is required." });

            try
            {
                var parameters = new Dictionary<string, object>
                {
                    { "@FollowupId",          model.FollowupId },
                    { "@CustomerId",          model.CustomerId },
                    { "@ContactDate",         model.ContactDate },
                    { "@ContactPerson",       (object?)model.ContactPerson ?? DBNull.Value },
                    { "@ContactMode",         (object?)model.ContactMode   ?? DBNull.Value },
                    { "@Outcome",             model.Outcome },
                    { "@Notes",               (object?)model.Notes ?? DBNull.Value },
                    { "@PromiseAmount",       (object?)model.PromiseAmount       ?? DBNull.Value },
                    { "@PromiseDate",         (object?)model.PromiseDate         ?? DBNull.Value },
                    { "@NextFollowupDate",    (object?)model.NextFollowupDate    ?? DBNull.Value },
                    { "@OutstandingSnapshot", (object?)model.OutstandingSnapshot ?? DBNull.Value },
                    { "@CreatedBy",           model.ActionBy },
                    { "@ModifiedBy",          model.FollowupId == 0 ? (object)DBNull.Value : model.ActionBy },
                };
                string result = _dbcon.ExecuteSetProcedure(parameters, "sp_SavePaymentFollowup");
                string action = model.FollowupId == 0 ? "logged" : "updated";
                return Ok(new { id = result, message = $"Follow-up {action} successfully." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentFollowup", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving follow-up." });
            }
        }

        // ── MARK PROMISE Kept / Broken / Open ────────────────────────────────
        [HttpPost("promise-status")]
        public async Task<IActionResult> PromiseStatus([FromBody] SetPromiseStatusRequest model)
        {
            if (model.FollowupId <= 0)
                return BadRequest(new { message = "Follow-up id is required." });
            var allowed = new[] { "Kept", "Broken", "Open" };
            if (!allowed.Contains(model.Status))
                return BadRequest(new { message = "Status must be Kept, Broken, or Open." });
            if (string.IsNullOrWhiteSpace(model.ActionBy))
                return BadRequest(new { message = "User is required." });

            try
            {
                var parameters = new Dictionary<string, object>
                {
                    { "@FollowupId", model.FollowupId },
                    { "@Status",     model.Status },
                    { "@ModifiedBy", model.ActionBy },
                };
                string result = _dbcon.ExecuteSetProcedure(parameters, "sp_SetFollowupPromiseStatus");
                return Ok(new { id = result, message = $"Promise marked {model.Status}." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentFollowup", action: "PromiseStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error updating promise status." });
            }
        }

        // ── DELETE (soft) ─────────────────────────────────────────────────────
        [HttpDelete("{followupId:int}")]
        public async Task<IActionResult> Delete(int followupId, [FromQuery] string actionBy)
        {
            if (string.IsNullOrWhiteSpace(actionBy))
                return BadRequest(new { message = "User is required." });
            try
            {
                string result = _dbcon.ExecuteSetProcedure(
                    new Dictionary<string, object>
                    {
                        { "@FollowupId", followupId },
                        { "@ModifiedBy", actionBy },
                    },
                    "sp_DeletePaymentFollowup");
                return result switch
                {
                    "Deleted"   => Ok(new { message = "Follow-up deleted." }),
                    "NotExists" => NotFound(new { message = "Follow-up not found." }),
                    _           => BadRequest(new { message = "Failed to delete follow-up." })
                };
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentFollowup", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting follow-up." });
            }
        }
    }
}
