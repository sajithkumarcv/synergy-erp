using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace ERPWEB.Controllers.Admin
{
    // Normalized row shape returned by sp_AdminLookupList for every simple table.
    // Using a typed class so System.Text.Json's CamelCase policy serializes
    // property names correctly (dynamic/ExpandoObject is treated as a dictionary
    // and bypasses PropertyNamingPolicy).
    public class AdminLookupRow
    {
        public string?  Id          { get; set; }
        public string?  Name        { get; set; }
        public string?  Code        { get; set; }
        public string?  Description { get; set; }
        public bool     IsActive    { get; set; } = true;
        public int?     SortOrder   { get; set; }
        public string?  Extra1      { get; set; }
        public string?  Extra2      { get; set; }
        public string?  Extra3      { get; set; }
    }

    [Authorize]
    [Route("api/adminlookup")]
    [ApiController]
    public class AdminLookupController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public AdminLookupController(DbCon dbcon) { _dbcon = dbcon; }

        private string ActionBy =>
            User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? "system";

        // ── List ─────────────────────────────────────────────────────────────
        // GET api/adminlookup/list/{tableKey}
        [HttpGet("list/{tableKey}")]
        public async Task<IActionResult> List(string tableKey)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<AdminLookupRow>("proj.sp_AdminLookupList",
                    new { TableKey = tableKey });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "AdminLookup", action: "List",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading lookup data." });
            }
        }

        // ── Save ─────────────────────────────────────────────────────────────
        // POST api/adminlookup/save/{tableKey}
        [HttpPost("save/{tableKey}")]
        public async Task<IActionResult> Save(string tableKey,
            [FromBody] Dictionary<string, object?> body)
        {
            try
            {
                string? Get(string key)
                {
                    if (!body.TryGetValue(key, out var v) || v is null) return null;
                    return v.ToString();
                }
                bool? GetBool(string key)
                {
                    var s = Get(key);
                    if (s is null) return null;
                    if (bool.TryParse(s, out var b)) return b;
                    if (s == "1" || s.Equals("true", StringComparison.OrdinalIgnoreCase)) return true;
                    return false;
                }
                int? GetInt(string key)
                {
                    var s = Get(key);
                    return int.TryParse(s, out var i) ? i : (int?)null;
                }

                var rows = await _dbcon.QueryAsync<dynamic>("proj.sp_AdminLookupSave", new
                {
                    TableKey    = tableKey,
                    Id          = Get("id"),
                    Name        = Get("name"),
                    Code        = Get("code"),
                    Description = Get("description"),
                    SortOrder   = GetInt("sortOrder") ?? 0,
                    IsActive    = GetBool("isActive") ?? true,
                    Extra1      = Get("extra1"),
                    Extra2      = Get("extra2"),
                    Extra3      = Get("extra3"),
                    ActionBy    = ActionBy,
                });
                var r = rows.FirstOrDefault();
                return Ok(new { newId = r?.NewId, message = "Saved." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                // Deliberate RAISERROR / constraint messages are meant for the user
                // (e.g. "Job Type is required for a BOM Section.") — surface them
                // instead of the generic message below.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "AdminLookup", action: "Save",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving record." });
            }
        }

        // ── Delete ───────────────────────────────────────────────────────────
        // DELETE api/adminlookup/{tableKey}/{id}
        [HttpDelete("{tableKey}/{id}")]
        public async Task<IActionResult> Delete(string tableKey, string id)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>("proj.sp_AdminLookupDelete", new
                {
                    TableKey = tableKey,
                    Id       = id,
                    ActionBy = ActionBy,
                });
                return Ok(new { message = "Deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "AdminLookup", action: "Delete",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting record." });
            }
        }
    }
}
