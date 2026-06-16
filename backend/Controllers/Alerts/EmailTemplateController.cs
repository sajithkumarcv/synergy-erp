using ERPWEB.Dbcontext;
using ERPWEB.Models.Alerts;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Alerts
{
    [Authorize]
    [Route("api/[Controller]")]
    [ApiController]
    public class EmailTemplateController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public EmailTemplateController(DbCon dbcon) => _dbcon = dbcon;

        [HttpGet]
        public async Task<IActionResult> GetAll([FromQuery] int? templateId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<EmailTemplateRow>("sp_GetEmailTemplates",
                    new { TemplateId = templateId });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "EmailTemplate", "GetAll", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveEmailTemplateRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.TemplateName))
                return BadRequest(new { message = "Template name is required." });
            if (string.IsNullOrWhiteSpace(model.SubjectTemplate))
                return BadRequest(new { message = "Subject template is required." });
            if (string.IsNullOrWhiteSpace(model.BodyTemplate))
                return BadRequest(new { message = "Body template is required." });
            try
            {
                var parameters = new Dictionary<string, object>
                {
                    { "@TemplateId",      model.TemplateId },
                    { "@TemplateName",    model.TemplateName.Trim() },
                    { "@SubjectTemplate", model.SubjectTemplate },
                    { "@BodyTemplate",    model.BodyTemplate },
                    { "@Placeholders",    (object?)model.Placeholders ?? DBNull.Value },
                    { "@IsActive",        model.IsActive },
                    { "@ActionBy",        model.ActionBy }
                };
                string result = _dbcon.ExecuteSetProcedure(parameters, "sp_SaveEmailTemplate");
                string action = model.TemplateId == 0 ? "added" : "updated";
                return Ok(new { id = result, message = $"Template {action} successfully." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "EmailTemplate", "Save", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpDelete("{templateId}")]
        public async Task<IActionResult> Delete(int templateId)
        {
            try
            {
                string result = _dbcon.ExecuteSetProcedure(
                    new Dictionary<string, object> { { "@TemplateId", templateId } },
                    "sp_DeleteEmailTemplate");
                return result switch
                {
                    "Deleted"   => Ok(new { message = "Template deleted successfully." }),
                    "InUse"     => BadRequest(new { message = "Cannot delete a template that is used by active alerts." }),
                    "NotExists" => NotFound(new { message = "Template not found." }),
                    _           => BadRequest(new { message = "Failed to delete template." })
                };
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, "EmailTemplate", "Delete", HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }
    }
}
