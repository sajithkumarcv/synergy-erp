using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace ERPWEB.Controllers.General
{
    public class AppSettingRow
    {
        public string SettingKey   { get; set; } = "";
        public string SettingValue { get; set; } = "";
    }

    public class SmtpSettingsRequest
    {
        public string Host        { get; set; } = "";
        public int    Port        { get; set; } = 587;
        public string Username    { get; set; } = "";
        public string Password    { get; set; } = "";
        public string FromAddress { get; set; } = "";
        public string FromName    { get; set; } = "";
        public bool   EnableSsl   { get; set; } = true;
    }

    [Authorize]
    [Route("api/appsettings")]
    [ApiController]
    public class AppSettingsController : ControllerBase
    {
        private readonly DbCon _db;
        public AppSettingsController(DbCon db) { _db = db; }

        private string ActionBy =>
            User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? "system";

        // GET api/appsettings/public
        // Returns ONLY the non-secret 'Biz.*' business constants — never SMTP/secrets.
        // The prefix is fixed server-side so the client cannot request other namespaces.
        [HttpGet("public")]
        public async Task<IActionResult> GetPublic()
        {
            try
            {
                var rows = await _db.QueryAsync<AppSettingRow>(
                    "sp_GetAppSettings", new { Prefix = "Biz." });

                var dict = (rows ?? Enumerable.Empty<AppSettingRow>())
                    .ToDictionary(r => r.SettingKey, r => r.SettingValue);

                return Ok(dict);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "AppSettings", "GetPublic", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading settings." });
            }
        }

        // GET api/appsettings/smtp
        [HttpGet("smtp")]
        public async Task<IActionResult> GetSmtp()
        {
            try
            {
                var rows = await _db.QueryAsync<AppSettingRow>(
                    "sp_GetAppSettings", new { Prefix = "Smtp." });

                var dict = (rows ?? Enumerable.Empty<AppSettingRow>())
                    .ToDictionary(r => r.SettingKey, r => r.SettingValue);

                var result = new SmtpSettingsRequest
                {
                    Host        = dict.GetValueOrDefault("Smtp.Host",        ""),
                    Port        = int.TryParse(dict.GetValueOrDefault("Smtp.Port", "587"), out var p) ? p : 587,
                    Username    = dict.GetValueOrDefault("Smtp.Username",    ""),
                    Password    = dict.GetValueOrDefault("Smtp.Password",    ""),
                    FromAddress = dict.GetValueOrDefault("Smtp.FromAddress", ""),
                    FromName    = dict.GetValueOrDefault("Smtp.FromName",    ""),
                    EnableSsl   = dict.GetValueOrDefault("Smtp.EnableSsl",   "true") == "true",
                };

                return Ok(result);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "AppSettings", "GetSmtp", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading SMTP settings." });
            }
        }

        // POST api/appsettings/smtp
        [HttpPost("smtp")]
        public async Task<IActionResult> SaveSmtp([FromBody] SmtpSettingsRequest req)
        {
            try
            {
                var settings = new Dictionary<string, string>
                {
                    { "Smtp.Host",        req.Host.Trim() },
                    { "Smtp.Port",        req.Port.ToString() },
                    { "Smtp.Username",    req.Username.Trim() },
                    { "Smtp.Password",    req.Password },
                    { "Smtp.FromAddress", req.FromAddress.Trim() },
                    { "Smtp.FromName",    req.FromName.Trim() },
                    { "Smtp.EnableSsl",   req.EnableSsl ? "true" : "false" },
                };

                foreach (var kv in settings)
                {
                    await _db.QueryAsync<dynamic>("sp_SetAppSetting", new
                    {
                        SettingKey   = kv.Key,
                        SettingValue = kv.Value,
                        ModifiedBy   = ActionBy,
                    });
                }

                return Ok(new { message = "SMTP settings saved successfully." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "AppSettings", "SaveSmtp", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving SMTP settings." });
            }
        }
    }
}
