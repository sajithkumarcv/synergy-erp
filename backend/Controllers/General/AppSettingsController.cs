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

    public class IssueRequestSettingsRequest
    {
        public List<string> RequiredFor     { get; set; } = new();
        public int          ReservationDays { get; set; } = 14;
    }

    public class PrInHouseRolesRequest
    {
        public List<string> Roles { get; set; } = new();
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

        // GET api/appsettings/print
        // Returns the configured print format per document module, e.g. { "INV": "2", "PO": "1" }.
        // Stored under the 'Biz.Print.<MODULE>' namespace so it also flows to the
        // public settings the client loads at startup (getSetting).
        [HttpGet("print")]
        public async Task<IActionResult> GetPrintFormats()
        {
            try
            {
                var rows = await _db.QueryAsync<AppSettingRow>(
                    "sp_GetAppSettings", new { Prefix = "Biz.Print." });

                var dict = (rows ?? Enumerable.Empty<AppSettingRow>())
                    .ToDictionary(
                        r => r.SettingKey.Replace("Biz.Print.", ""),
                        r => r.SettingValue);

                return Ok(dict);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "AppSettings", "GetPrintFormats", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading print formats." });
            }
        }

        // POST api/appsettings/print
        // Body: { "INV": "2", "PO": "1" } — module code → format number.
        // The 'Biz.Print.' prefix is fixed server-side so only this namespace can be written.
        [HttpPost("print")]
        public async Task<IActionResult> SavePrintFormats([FromBody] Dictionary<string, string> formats)
        {
            if (formats == null || formats.Count == 0)
                return BadRequest(new { message = "No print formats supplied." });

            try
            {
                foreach (var kv in formats)
                {
                    var module = (kv.Key ?? "").Trim().ToUpperInvariant();
                    var value  = (kv.Value ?? "").Trim();
                    if (module.Length == 0 || value.Length == 0) continue;

                    await _db.QueryAsync<dynamic>("sp_SetAppSetting", new
                    {
                        SettingKey   = $"Biz.Print.{module}",
                        SettingValue = value,
                        ModifiedBy   = ActionBy,
                    });
                }

                return Ok(new { message = "Print formats saved successfully." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "AppSettings", "SavePrintFormats", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving print formats." });
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

        // GET api/appsettings/pr-inhouse-roles
        // Which role codes may create a Purchase Request for an In House job, plus every active role to pick from.
        [Authorize(Roles = "ADMIN")]
        [HttpGet("pr-inhouse-roles")]
        public async Task<IActionResult> GetPrInHouseRoles()
        {
            try
            {
                var rows = await _db.QueryAsync<AppSettingRow>("sp_GetAppSettings", new { Prefix = "Purchasing.PR." });
                var value = (rows ?? Enumerable.Empty<AppSettingRow>())
                    .FirstOrDefault(r => r.SettingKey == "Purchasing.PR.InHouseRoles")?.SettingValue ?? "";
                var selected = value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .Select(c => c.ToUpperInvariant()).ToList();

                var roleRows = await _db.QueryAsync<dynamic>("sp_SearchRoles",
                    new { IsActive = (bool?)true, PageNumber = 1, PageSize = 500 });
                var roles = (roleRows ?? Enumerable.Empty<dynamic>())
                    .Select(r => new { code = (string)r.RoleCode, name = (string)r.RoleName })
                    .OrderBy(r => r.name).ToList();

                return Ok(new { roles = selected, allRoles = roles });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "AppSettings", "GetPrInHouseRoles", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading the In House PR roles." });
            }
        }

        // POST api/appsettings/pr-inhouse-roles
        // Body: { "roles": ["ADMIN", "IH_PROC_OFF"] }. Codes are checked against the real roles so a typo cannot
        // silently lock everyone out. An empty list switches the restriction off.
        [Authorize(Roles = "ADMIN")]
        [HttpPost("pr-inhouse-roles")]
        public async Task<IActionResult> SavePrInHouseRoles([FromBody] PrInHouseRolesRequest req)
        {
            if (req == null) return BadRequest(new { message = "No settings supplied." });
            try
            {
                var roleRows = await _db.QueryAsync<dynamic>("sp_SearchRoles",
                    new { IsActive = (bool?)true, PageNumber = 1, PageSize = 500 });
                var valid = (roleRows ?? Enumerable.Empty<dynamic>()).Select(r => (string)r.RoleCode).ToList();

                var chosen = (req.Roles ?? new List<string>())
                    .Select(c => (c ?? "").Trim()).Where(c => c.Length > 0).ToList();
                var unknown = chosen.Where(c => !valid.Any(v => string.Equals(v, c, StringComparison.OrdinalIgnoreCase))).ToList();
                if (unknown.Count > 0)
                    return BadRequest(new { message = $"Unknown role: {string.Join(", ", unknown)}." });

                var ordered = valid.Where(v => chosen.Any(c => string.Equals(v, c, StringComparison.OrdinalIgnoreCase)));

                await _db.QueryAsync<dynamic>("sp_SetAppSetting", new
                {
                    SettingKey   = "Purchasing.PR.InHouseRoles",
                    SettingValue = string.Join(",", ordered),
                    ModifiedBy   = ActionBy,
                });
                return Ok(new { message = chosen.Count == 0
                    ? "Saved. No restriction: any role can create In House PRs."
                    : "In House PR roles saved." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "AppSettings", "SavePrInHouseRoles", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving the In House PR roles." });
            }
        }

        // GET api/appsettings/issue-request
        // Which issue types need an approved Issue Request, and how long a reservation is held.
        // Admin only: the setting decides whether every Issue Note of a type can be confirmed.
        [Authorize(Roles = "ADMIN")]
        [HttpGet("issue-request")]
        public async Task<IActionResult> GetIssueRequestSettings()
        {
            try
            {
                var rows = await _db.QueryAsync<AppSettingRow>(
                    "sp_GetAppSettings", new { Prefix = "Inventory.IssueRequest." });
                var dict = (rows ?? Enumerable.Empty<AppSettingRow>())
                    .ToDictionary(r => r.SettingKey, r => r.SettingValue);

                var requiredFor = dict.GetValueOrDefault("Inventory.IssueRequest.RequiredFor", "")
                    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                    .ToList();
                var days = int.TryParse(dict.GetValueOrDefault("Inventory.IssueRequest.ReservationDays", "14"), out var d) ? d : 14;

                var typeRows = await _db.QueryAsync<dynamic>("sp_GetIssueTypes");
                var types = (typeRows ?? Enumerable.Empty<dynamic>())
                    .Select(t => new { code = (string)t.IssueTypeCode, name = (string)t.IssueTypeName })
                    .ToList();

                return Ok(new { requiredFor, reservationDays = days, issueTypes = types });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "AppSettings", "GetIssueRequestSettings", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading Issue Request settings." });
            }
        }

        // POST api/appsettings/issue-request
        // Body: { "requiredFor": ["INC_COSTING"], "reservationDays": 14 }
        // Codes are checked against the real issue types so a typo cannot silently switch the gate off.
        [Authorize(Roles = "ADMIN")]
        [HttpPost("issue-request")]
        public async Task<IActionResult> SaveIssueRequestSettings([FromBody] IssueRequestSettingsRequest req)
        {
            if (req == null) return BadRequest(new { message = "No settings supplied." });
            if (req.ReservationDays < 0 || req.ReservationDays > 365)
                return BadRequest(new { message = "Reservation days must be between 0 and 365 (0 = never expires)." });

            try
            {
                var typeRows = await _db.QueryAsync<dynamic>("sp_GetIssueTypes");
                var valid = (typeRows ?? Enumerable.Empty<dynamic>())
                    .Select(t => (string)t.IssueTypeCode).ToList();

                var chosen = (req.RequiredFor ?? new List<string>())
                    .Select(c => (c ?? "").Trim().ToUpperInvariant())
                    .Where(c => c.Length > 0).Distinct().ToList();

                var unknown = chosen.Where(c => !valid.Contains(c)).ToList();
                if (unknown.Count > 0)
                    return BadRequest(new { message = $"Unknown issue type: {string.Join(", ", unknown)}." });

                // keep the same order the issue types are listed in, so the stored value is stable
                var ordered = valid.Where(chosen.Contains);

                await _db.QueryAsync<dynamic>("sp_SetAppSetting", new
                {
                    SettingKey   = "Inventory.IssueRequest.RequiredFor",
                    SettingValue = string.Join(",", ordered),
                    ModifiedBy   = ActionBy,
                });
                await _db.QueryAsync<dynamic>("sp_SetAppSetting", new
                {
                    SettingKey   = "Inventory.IssueRequest.ReservationDays",
                    SettingValue = req.ReservationDays.ToString(),
                    ModifiedBy   = ActionBy,
                });

                return Ok(new { message = "Issue Request settings saved." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "AppSettings", "SaveIssueRequestSettings", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving Issue Request settings." });
            }
        }
    }
}
