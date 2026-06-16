using ERPWEB.Dbcontext;
using ERPWEB.Models.General;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.General
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class FieldConfigController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public FieldConfigController(DbCon dbcon) { _dbcon = dbcon; }

        /// <summary>
        /// Returns all active field configurations.
        /// Frontend uses this to dynamically show the required (*) marker on form labels.
        /// </summary>
        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<FieldConfig>("sp_GetFieldConfig");
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "FieldConfig", action: "GetAll",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading field configuration." });
            }
        }
    }
}
