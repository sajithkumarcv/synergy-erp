using ERPWEB.Dbcontext;
using ERPWEB.Models.Alerts;
using ERPWEB.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Alerts
{
    /// <summary>
    /// Allows admins to manually trigger a specific alert or all active alerts
    /// without waiting for the scheduler. Useful for testing.
    /// </summary>
    [Authorize]
    [Route("api/[Controller]")]
    [ApiController]
    public class EmailAlertProcessorController : ControllerBase
    {
        private readonly DbCon _dbcon;
        private readonly EmailAlertProcessorService _processor;

        public EmailAlertProcessorController(DbCon dbcon, EmailAlertProcessorService processor)
        {
            _dbcon     = dbcon;
            _processor = processor;
        }

        /// <summary>Manually run a specific alert by ID.</summary>
        [HttpPost("run/{alertId:int}")]
        public async Task<IActionResult> RunAlert(int alertId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<AlertConfigRow>("sp_GetEmailAlertConfigs",
                    new { AlertId = alertId });
                var alert = rows.FirstOrDefault();
                if (alert == null)
                    return NotFound(new { message = "Alert not found." });

                // Run fire-and-forget style, return immediately
                _ = Task.Run(() => _processor.ProcessAlertAsync(alert));

                return Ok(new { message = $"Alert '{alert.AlertName}' triggered. Check logs for results." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "EmailAlertProcessor", "RunAlert", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        /// <summary>Manually run all active alerts immediately.</summary>
        [HttpPost("run-all")]
        public async Task<IActionResult> RunAll()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<AlertConfigRow>("sp_GetEmailAlertConfigs");
                var active = rows.Where(a => a.AlertId > 0).ToList();

                foreach (var alert in active)
                    _ = Task.Run(() => _processor.ProcessAlertAsync(alert));

                return Ok(new { message = $"{active.Count} alert(s) triggered. Check logs for results." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "EmailAlertProcessor", "RunAll", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }
    }
}
