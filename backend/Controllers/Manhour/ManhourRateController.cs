using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Manhour
{
    // ── Models ────────────────────────────────────────────────────────────────
    public class ManhourRateModel
    {
        public int       RateId        { get; set; }
        public string?   JobTypeId     { get; set; }
        public string?   JobTypeName   { get; set; }
        public string?   JobId         { get; set; }
        public string?   JobDescription{ get; set; }
        public DateTime  EffectiveFrom { get; set; }
        public DateTime  EffectiveTo   { get; set; }
        public decimal   NHRate        { get; set; }
        public decimal   OTRate        { get; set; }
        public string?   Remarks       { get; set; }
        public bool      IsActive      { get; set; }
        public string?   CreatedBy     { get; set; }
        public DateTime  CreatedDate   { get; set; }
        public string?   ModifiedBy    { get; set; }
        public DateTime? ModifiedDate  { get; set; }
        public string?   ScopeLabel    { get; set; }   // "Job" | "Job Type" | "Default"
        public int       Priority      { get; set; }   // 1 | 2 | 3
    }

    public class SaveManhourRateRequest
    {
        public int      RateId        { get; set; }
        public string?  JobTypeId     { get; set; }
        public string?  JobId         { get; set; }
        public string   EffectiveFrom { get; set; } = string.Empty;
        public string   EffectiveTo   { get; set; } = string.Empty;
        public decimal  NHRate        { get; set; }
        public decimal  OTRate        { get; set; }
        public string?  Remarks       { get; set; }
        public bool     IsActive      { get; set; } = true;
        public string   SavedBy       { get; set; } = string.Empty;
    }

    public class ManhourRateLookup
    {
        public int     RateId   { get; set; }
        public decimal NHRate   { get; set; }
        public decimal OTRate   { get; set; }
        public int     Priority { get; set; }
    }

    // ── Controller ────────────────────────────────────────────────────────────
    [Authorize]
    [Route("api/manhour-rate")]
    [ApiController]
    public class ManhourRateController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public ManhourRateController(DbCon dbcon) { _dbcon = dbcon; }

        // ── GET all (management list) ─────────────────────────────────────────
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<ManhourRateModel>("sp_GetManhourRateList");
                return Ok(rows ?? Enumerable.Empty<ManhourRateModel>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ManhourRate", action: "GetAll", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading manhour rates." });
            }
        }

        // ── POST save ─────────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveManhourRateRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.EffectiveFrom))
                return BadRequest(new { message = "Effective From date is required." });
            if (string.IsNullOrWhiteSpace(req.EffectiveTo))
                return BadRequest(new { message = "Effective To date is required." });

            try
            {
                var result = await _dbcon.QueryFirstAsync<dynamic>("sp_SaveManhourRate", new
                {
                    RateId        = req.RateId,
                    JobTypeId     = string.IsNullOrWhiteSpace(req.JobTypeId) ? null : req.JobTypeId.Trim(),
                    JobId         = string.IsNullOrWhiteSpace(req.JobId)     ? null : req.JobId.Trim().ToUpper(),
                    EffectiveFrom = req.EffectiveFrom,
                    EffectiveTo   = req.EffectiveTo,
                    NHRate        = req.NHRate,
                    OTRate        = req.OTRate,
                    Remarks       = req.Remarks,
                    IsActive      = req.IsActive,
                    SavedBy       = req.SavedBy,
                });

                int id = (int)result.RateId;
                if (id < 0)
                    return BadRequest(new { message = (string)result.Message });

                return Ok(new { rateId = id, message = (string)result.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ManhourRate", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving manhour rate." });
            }
        }

        // ── GET lookup (runtime costing) ──────────────────────────────────────
        [HttpGet("lookup")]
        public async Task<IActionResult> Lookup(
            [FromQuery] string workDate,
            [FromQuery] string jobId,
            [FromQuery] string jobTypeId)
        {
            try
            {
                var row = await _dbcon.QueryFirstAsync<ManhourRateLookup>("sp_GetManhourRate", new
                {
                    WorkDate  = workDate,
                    JobId     = jobId,
                    JobTypeId = jobTypeId,
                });
                if (row == null) return NotFound(new { message = "No rate found for the given parameters." });
                return Ok(row);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ManhourRate", action: "Lookup", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error looking up manhour rate." });
            }
        }
    }
}
