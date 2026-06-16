using ERPWEB.Dbcontext;
using ERPWEB.Models.Procurement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Procurement
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class GrnUnregistrationController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public GrnUnregistrationController(DbCon dbcon) { _dbcon = dbcon; }

        // ── GET ELIGIBLE GRNs ─────────────────────────────────────────────────
        // Returns all GRNs in Received status that have not been cancelled
        // and have no invoice recorded.
        [HttpGet("eligible")]
        public async Task<IActionResult> GetEligible()
        {
            try
            {
                var list = await _dbcon.QueryAsync<GrnUnregEligible>("sp_GetEligibleGRNsForUnreg");
                return Ok(list ?? Enumerable.Empty<GrnUnregEligible>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "GrnUnregistration", action: "GetEligible", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching eligible GRNs." });
            }
        }

        // ── GET PREVIEW ───────────────────────────────────────────────────────
        // Returns header + lines for the selected GRN with a preview of
        // what the PO status will become after reversal.
        [HttpGet("{id:int}/preview")]
        public async Task<IActionResult> GetPreview(int id)
        {
            try
            {
                var (headers, lines) = await _dbcon.QueryMultipleAsync<GrnUnregPreviewHeader, GrnUnregPreviewLine>(
                    "sp_GetGRNUnregPreview", new { GrnId = id });

                var header = headers.FirstOrDefault();
                if (header == null) return NotFound(new { message = "GRN not found." });

                return Ok(new { header, lines });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "GrnUnregistration", action: "GetPreview", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching GRN preview." });
            }
        }

        // ── EXECUTE UNREGISTRATION ────────────────────────────────────────────
        // Cancels the GRN, reverses ReceivedQty on PO lines, and
        // recalculates PO status. Wrapped in a DB transaction.
        [HttpPost("execute")]
        public async Task<IActionResult> Execute([FromBody] GrnUnregRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.CancelReason))
                return BadRequest(new { message = "A cancellation reason is required." });

            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_UnregisterGRN", new
                {
                    model.GrnId,
                    model.CancelledBy,
                    model.CancelReason
                });

                var result    = rows?.FirstOrDefault();
                string newPo  = result?.NewPoStatus ?? "Updated";

                return Ok(new
                {
                    message      = "GRN unregistered successfully.",
                    newPoStatus  = newPo
                });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "GrnUnregistration", action: "Execute", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error unregistering GRN." });
            }
        }
    }
}
