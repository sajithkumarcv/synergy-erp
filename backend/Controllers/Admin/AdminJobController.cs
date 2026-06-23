using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace ERPWEB.Controllers.Admin
{
    // ── Models ────────────────────────────────────────────────────────────────
    public class CurrencyModel
    {
        public int     CurrencyId     { get; set; }
        public string  CurrencyName   { get; set; } = "";
        public string  ShortName      { get; set; } = "";
        public string  Symbol         { get; set; } = "";
        public decimal ExchangeRate   { get; set; } = 1;
        public bool    IsBaseCurrency { get; set; }
        public bool    IsActive       { get; set; } = true;
        public int     SortOrder      { get; set; }
    }

    public class EngineerModel
    {
        public int     EngineerId   { get; set; }
        public string  EngineerName { get; set; } = "";
        public int?    TeamId       { get; set; }
        public string? TeamName     { get; set; }
        public string? Email        { get; set; }
        public decimal HourlyRate   { get; set; }
        public bool    IsActive     { get; set; } = true;
        public int?    UserId       { get; set; }
        public string? LinkedUser   { get; set; }
    }

    public class VListModel
    {
        public int    VListID         { get; set; }
        public string TypeName        { get; set; } = "";
        public string ListName        { get; set; } = "";
        public string ItemValue       { get; set; } = "";
        public string ItemDescription { get; set; } = "";
        public bool   IsActive        { get; set; } = true;
        public int    SortOrder       { get; set; }
    }

    public class JobTypeModel
    {
        public string  JobTypeId          { get; set; } = "";
        public string  JobTypeName        { get; set; } = "";
        public string? PreFix             { get; set; }
        public string? Suffix             { get; set; }
        public string? StartingSeries     { get; set; }
        public bool    IsCostingRequired  { get; set; }
        public bool    RequiresParentJob  { get; set; }
        public bool    IsStockJob         { get; set; }
        public bool    IsActive           { get; set; } = true;
        public int     SortOrder          { get; set; }
        public bool    IsBudgetHeaderLinked { get; set; }
        public bool    IsNew              { get; set; } = true;
    }

    // ── Controller ────────────────────────────────────────────────────────────
    [Authorize]
    [Route("api/adminjob")]
    [ApiController]
    public class AdminJobController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public AdminJobController(DbCon dbcon) { _dbcon = dbcon; }

        private string ActionBy =>
            User.FindFirstValue(ClaimTypes.NameIdentifier)
            ?? User.FindFirstValue("sub")
            ?? "system";

        // ── Currency ──────────────────────────────────────────────────────────
        [HttpGet("currency")]
        public async Task<IActionResult> GetCurrencies()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<CurrencyModel>("proj.sp_AdminCurrencyList");
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "GetCurrencies", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading currencies." });
            }
        }

        [HttpPost("currency/save")]
        public async Task<IActionResult> SaveCurrency([FromBody] CurrencyModel req)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("proj.sp_AdminCurrencySave", new
                {
                    req.CurrencyId, req.CurrencyName, req.ShortName, req.Symbol,
                    req.ExchangeRate, req.IsBaseCurrency, req.IsActive, req.SortOrder,
                    ActionBy = ActionBy,
                });
                var r = rows.FirstOrDefault();
                return Ok(new { newId = r?.NewId, message = "Saved." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "SaveCurrency", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving currency." });
            }
        }

        [HttpDelete("currency/{id:int}")]
        public async Task<IActionResult> DeleteCurrency(int id)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>("proj.sp_AdminCurrencyDelete",
                    new { CurrencyId = id, ActionBy = ActionBy });
                return Ok(new { message = "Deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "DeleteCurrency", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting currency." });
            }
        }

        // ── Engineer ──────────────────────────────────────────────────────────
        [HttpGet("engineer")]
        public async Task<IActionResult> GetEngineers()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<EngineerModel>("proj.sp_AdminEngineerList");
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "GetEngineers", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading engineers." });
            }
        }

        [HttpPost("engineer/save")]
        public async Task<IActionResult> SaveEngineer([FromBody] EngineerModel req)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("proj.sp_AdminEngineerSave", new
                {
                    req.EngineerId, req.EngineerName, req.TeamId,
                    req.Email, req.HourlyRate, req.IsActive,
                    req.UserId,
                    ActionBy = ActionBy,
                });
                var r = rows.FirstOrDefault();
                return Ok(new { newId = r?.NewId, message = "Saved." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "SaveEngineer", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving engineer." });
            }
        }

        [HttpDelete("engineer/{id:int}")]
        public async Task<IActionResult> DeleteEngineer(int id)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>("proj.sp_AdminEngineerDelete",
                    new { EngineerId = id, ActionBy = ActionBy });
                return Ok(new { message = "Deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "DeleteEngineer", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting engineer." });
            }
        }

        // ── VList ─────────────────────────────────────────────────────────────
        [HttpGet("vlist")]
        public async Task<IActionResult> GetVList()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<VListModel>("proj.sp_AdminVListList");
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "GetVList", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading VList." });
            }
        }

        [HttpGet("vlist/{typeName}/{listName}")]
        public async Task<IActionResult> GetVListFiltered(string typeName, string listName)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<VListModel>("proj.sp_AdminVListList",
                    new { TypeName = typeName, ListName = listName });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "GetVListFiltered", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading VList." });
            }
        }

        [HttpPost("vlist/save")]
        public async Task<IActionResult> SaveVList([FromBody] VListModel req)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("proj.sp_AdminVListSave", new
                {
                    req.VListID, req.TypeName, req.ListName,
                    req.ItemValue, req.ItemDescription, req.IsActive, req.SortOrder,
                    ActionBy = ActionBy,
                });
                var r = rows.FirstOrDefault();
                return Ok(new { newId = r?.NewId, message = "Saved." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "SaveVList", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving VList entry." });
            }
        }

        [HttpDelete("vlist/{id:int}")]
        public async Task<IActionResult> DeleteVList(int id)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>("proj.sp_AdminVListDelete",
                    new { VListID = id, ActionBy = ActionBy });
                return Ok(new { message = "Deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "DeleteVList", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting VList entry." });
            }
        }

        // ── Job Type ──────────────────────────────────────────────────────────
        [HttpGet("jobtype")]
        public async Task<IActionResult> GetJobTypes()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<JobTypeModel>("proj.sp_AdminJobTypeList");
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "GetJobTypes", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading job types." });
            }
        }

        [HttpPost("jobtype/save")]
        public async Task<IActionResult> SaveJobType([FromBody] JobTypeModel req)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("proj.sp_AdminJobTypeSave", new
                {
                    req.JobTypeId, req.JobTypeName, req.PreFix, req.Suffix,
                    req.StartingSeries, req.IsCostingRequired, req.RequiresParentJob,
                    req.IsStockJob, req.IsActive, req.SortOrder,
                    req.IsBudgetHeaderLinked,
                    req.IsNew,
                    ActionBy = ActionBy,
                });
                var r = rows.FirstOrDefault();
                return Ok(new { newId = r?.NewId, message = "Saved." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "SaveJobType", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving job type." });
            }
        }

        [HttpDelete("jobtype/{id}")]
        public async Task<IActionResult> DeleteJobType(string id)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>("proj.sp_AdminJobTypeDelete",
                    new { JobTypeId = id, ActionBy = ActionBy });
                return Ok(new { message = "Deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "AdminJob", "DeleteJobType", HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting job type." });
            }
        }
    }
}
