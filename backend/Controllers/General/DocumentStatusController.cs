using ERPWEB.Dbcontext;
using ERPWEB.Models.General;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.General
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class DocumentStatusController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public DocumentStatusController(DbCon dbcon) { _dbcon = dbcon; }

        // ── LIST ALL ──────────────────────────────────────────────
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                var list = await _dbcon.QueryAsync<DocumentStatus>("sp_GetDocumentStatuses", new { ModuleName = (string?)null });
                return Ok(list ?? Enumerable.Empty<DocumentStatus>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DocumentStatus", action: "GetAll", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading document statuses." });
            }
        }

        // ── LIST BY MODULE ────────────────────────────────────────
        [HttpGet("{module}")]
        public async Task<IActionResult> GetByModule(string module)
        {
            try
            {
                var list = await _dbcon.QueryAsync<DocumentStatus>("sp_GetDocumentStatuses", new { ModuleName = module });
                return Ok(list ?? Enumerable.Empty<DocumentStatus>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DocumentStatus", action: "GetByModule", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading document statuses." });
            }
        }

        // ── SAVE (create or update) ───────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] DocumentStatus model)
        {
            if (string.IsNullOrWhiteSpace(model.ModuleName))
                return BadRequest(new { message = "ModuleName is required." });
            if (string.IsNullOrWhiteSpace(model.StatusCode))
                return BadRequest(new { message = "StatusCode is required." });
            if (string.IsNullOrWhiteSpace(model.StatusLabel))
                return BadRequest(new { message = "StatusLabel is required." });

            try
            {
                var p = new
                {
                    model.StatusId,
                    model.ModuleName,
                    model.StatusCode,
                    model.StatusLabel,
                    model.BadgeBg,
                    model.BadgeColor,
                    model.BadgeDot,
                    model.SortOrder,
                    model.CanEdit,
                    model.CanDelete,
                    model.CanUploadDocs,
                    model.IsInitial,
                    model.IsTerminal,
                    model.AllowedTransitions,
                    model.IsActive,
                    SavedBy = model.ModifiedBy ?? model.CreatedBy
                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetDocumentStatus", p);
                int.TryParse(result, out int statusId);
                return Ok(new { statusId, message = "Status saved." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DocumentStatus", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving document status." });
            }
        }
    }
}
