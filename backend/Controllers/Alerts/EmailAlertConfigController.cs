using ERPWEB.Dbcontext;
using ERPWEB.Models.Alerts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Alerts
{
    [Authorize]
    [Route("api/[Controller]")]
    [ApiController]
    public class EmailAlertConfigController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public EmailAlertConfigController(DbCon dbcon) => _dbcon = dbcon;

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] int? alertId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<EmailAlertConfigRow>("sp_GetEmailAlertConfigs",
                    new { AlertId = alertId });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "EmailAlertConfig", "GetAll", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpGet("available-views")]
        public async Task<IActionResult> GetAvailableViews()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<AlertViewRow>("sp_GetAvailableAlertViews");
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "EmailAlertConfig", "GetAvailableViews", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveEmailAlertConfigRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.AlertName))
                return BadRequest(new { message = "Alert name is required." });
            if (model.GroupId <= 0)
                return BadRequest(new { message = "User group is required." });
            if (model.TemplateId <= 0)
                return BadRequest(new { message = "Email template is required." });
            if (string.IsNullOrWhiteSpace(model.SqlViewName))
                return BadRequest(new { message = "Data source (view) is required." });
            try
            {
                var parameters = new Dictionary<string, object>
                {
                    { "@AlertId",      model.AlertId },
                    { "@AlertName",    model.AlertName.Trim() },
                    { "@AlertType",    model.AlertType },
                    { "@GroupId",      model.GroupId },
                    { "@TemplateId",   model.TemplateId },
                    { "@SqlViewName",  model.SqlViewName },
                    { "@Frequency",    model.Frequency },
                    { "@TimeOfDay",    model.TimeOfDay },
                    { "@DayOfWeek",    (object?)model.DayOfWeek   ?? DBNull.Value },
                    { "@DayOfMonth",   (object?)model.DayOfMonth  ?? DBNull.Value },
                    { "@IsActive",     model.IsActive },
                    { "@SkipIfNoData", model.SkipIfNoData },
                    { "@ActionBy",     model.ActionBy }
                };
                string result = _dbcon.ExecuteSetProcedure(parameters, "sp_SaveEmailAlertConfig");
                string action = model.AlertId == 0 ? "added" : "updated";
                return Ok(new { id = result, message = $"Alert {action} successfully." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "EmailAlertConfig", "Save", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpDelete("{alertId}")]
        public async Task<IActionResult> Delete(int alertId)
        {
            try
            {
                string result = _dbcon.ExecuteSetProcedure(
                    new Dictionary<string, object> { { "@AlertId", alertId } },
                    "sp_DeleteEmailAlertConfig");
                return result switch
                {
                    "Deleted"   => Ok(new { message = "Alert deleted successfully." }),
                    "NotExists" => NotFound(new { message = "Alert not found." }),
                    _           => BadRequest(new { message = "Failed to delete alert." })
                };
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "EmailAlertConfig", "Delete", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpGet("logs")]
        public async Task<IActionResult> GetLogs(
            [FromQuery] int?    alertId  = null,
            [FromQuery] string? status   = null,
            [FromQuery] string? dateFrom = null,
            [FromQuery] string? dateTo   = null,
            [FromQuery] int     page     = 1,
            [FromQuery] int     pageSize = 20)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<AlertLogRow>("sp_GetAlertLogs", new
                {
                    AlertId  = alertId,
                    Status   = string.IsNullOrWhiteSpace(status)   ? null : status.Trim(),
                    DateFrom = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo   = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    Page     = page < 1 ? 1 : page,
                    PageSize = pageSize is < 1 or > 200 ? 20 : pageSize,
                });
                var list      = rows?.ToList() ?? new List<AlertLogRow>();
                int totalRows = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { totalRows, page, pageSize, data = list });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "EmailAlertConfig", "GetLogs", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpGet("logs/{logId}/recipients")]
        public async Task<IActionResult> GetRecipientLogs(int logId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<AlertRecipientLogRow>("sp_GetAlertRecipientLogs",
                    new { LogId = logId });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "EmailAlertConfig", "GetRecipientLogs", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }
    }
}
