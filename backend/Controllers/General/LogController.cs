using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.General
{
    [Route("api/[controller]")]
    [ApiController]
    public class LogController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public LogController(DbCon dbcon) { _dbcon = dbcon; }

        public class ClientLogRequest
        {
            public string?  Message        { get; set; }
            public string?  StackTrace     { get; set; }
            public string?  Source         { get; set; }   // component / page
            public string?  Action         { get; set; }   // what the user was doing
            public string?  RequestPath    { get; set; }   // browser URL / route
            public string?  UserId         { get; set; }   // username
            public string?  InnerException { get; set; }
            public string?  Level          { get; set; }   // Error | Warn | Info
        }

        // ── POST api/log/client ──────────────────────────────────────────────
        // Receives a front-end error and persists it to TBL_APP_LOG.
        // AllowAnonymous so logging still works if the token has expired / before login.
        [AllowAnonymous]
        [HttpPost("client")]
        public async Task<IActionResult> LogClient([FromBody] ClientLogRequest req)
        {
            // Never let logging fail the caller — always return 204.
            try
            {
                if (req != null && !string.IsNullOrWhiteSpace(req.Message))
                {
                    var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
                    await _dbcon.WriteRawLog(
                        message:        req.Message,
                        stackTrace:     req.StackTrace,
                        controller:     string.IsNullOrWhiteSpace(req.Source) ? "CLIENT" : $"CLIENT/{req.Source}",
                        action:         req.Action,
                        requestPath:    req.RequestPath,
                        userId:         req.UserId,
                        ipAddress:      ip,
                        innerException: req.InnerException,
                        logLevel:       string.IsNullOrWhiteSpace(req.Level) ? "Error" : req.Level);
                }
            }
            catch { /* swallow — logging must never throw back to the client */ }

            return NoContent();
        }

        public class AppLogRow
        {
            public long      LogId          { get; set; }
            public string?   LogLevel       { get; set; }
            public string?   Controller     { get; set; }
            public string?   Action         { get; set; }
            public string?   Message        { get; set; }
            public string?   StackTrace     { get; set; }
            public string?   InnerException { get; set; }
            public string?   RequestPath    { get; set; }
            public string?   UserId         { get; set; }
            public string?   IpAddress      { get; set; }
            public DateTime  LogDate        { get; set; }
            public string?   Source         { get; set; }
            public int       TotalRows      { get; set; }
        }

        // ── GET api/log/search ───────────────────────────────────────────────
        [Authorize]
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] string? logLevel   = null,
            [FromQuery] string? source     = null,
            [FromQuery] string? controller = null,
            [FromQuery] string? userId     = null,
            [FromQuery] string? searchText = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 50)
        {
            try
            {
                var p = new
                {
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom)   ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)     ? null : dateTo,
                    LogLevel   = string.IsNullOrWhiteSpace(logLevel)   ? null : logLevel,
                    Source     = string.IsNullOrWhiteSpace(source)     ? null : source.Trim().ToUpper(),
                    Controller = string.IsNullOrWhiteSpace(controller) ? null : controller.Trim(),
                    UserId     = string.IsNullOrWhiteSpace(userId)     ? null : userId.Trim(),
                    SearchText = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    PageNumber = page < 1 ? 1 : page,
                    PageSize   = pageSize is < 1 or > 500 ? 50 : pageSize,
                };
                var rows  = await _dbcon.QueryAsync<AppLogRow>("sp_SearchAppLog", p);
                var list  = rows?.ToList() ?? new List<AppLogRow>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { totalRows = total, page, pageSize, totalPages = (int)Math.Ceiling((double)total / pageSize), data = list });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Log", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading application log." });
            }
        }
    }
}
