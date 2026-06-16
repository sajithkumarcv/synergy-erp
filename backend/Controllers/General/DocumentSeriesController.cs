using ERPWEB.Dbcontext;
using ERPWEB.Models.General;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.General
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class DocumentSeriesController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public DocumentSeriesController(DbCon dbcon) { _dbcon = dbcon; }

        // ── LIST ALL ──────────────────────────────────────────────
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                var list = await _dbcon.QueryAsync<DocumentSeries>("sp_GetDocSeriesList");
                return Ok(list ?? Enumerable.Empty<DocumentSeries>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DocumentSeries", action: "GetAll", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading document series." });
            }
        }

        // ── PREVIEW NEXT NUMBER (no increment) ───────────────────
        [HttpGet("preview/{docTypeId}")]
        public async Task<IActionResult> Preview(string docTypeId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_PreviewDocNumber", new { DocTypeId = docTypeId });
                var row  = rows?.FirstOrDefault();
                if (row == null) return NotFound(new { message = $"Series '{docTypeId}' not found." });
                return Ok(new { previewNumber = row.PreviewNumber, nextSeries = row.NextSeries });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DocumentSeries", action: "Preview", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error previewing document number." });
            }
        }

        // ── SAVE (create or update) ───────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] DocumentSeries model)
        {
            if (string.IsNullOrWhiteSpace(model.DocTypeId))
                return BadRequest(new { message = "DocTypeId is required." });
            if (string.IsNullOrWhiteSpace(model.Prefix))
                return BadRequest(new { message = "Prefix is required." });

            try
            {
                var p = new
                {
                    model.DocTypeId,
                    model.DocTypeName,
                    model.Prefix,
                    model.Suffix,
                    model.Separator,
                    model.IncludeYear,
                    model.YearDigits,
                    model.ResetYearly,
                    model.PadLength,
                    model.StartingSeries,
                    model.SortOrder,
                    model.IsActive,
                    SavedBy = model.ModifiedBy ?? model.CreatedBy
                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetDocSeries", p);
                return Ok(new { id = result, message = "Series saved." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DocumentSeries", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving document series." });
            }
        }
    }
}
