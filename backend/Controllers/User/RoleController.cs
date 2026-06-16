using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using ERPWEB.Dbcontext;
using ERPWEB.Models.User;

namespace ERPWEB.Controllers.User
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class RoleController : ControllerBase
    {
        private readonly DbCon _db;
        public RoleController(DbCon db) { _db = db; }

        // ── Search / list ─────────────────────────────────────────
        // GET api/Role/search?searchText=&isActive=&page=1&pageSize=20&sortCol=RoleName&sortDir=ASC
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText,
            [FromQuery] bool?   isActive,
            [FromQuery] int     page      = 1,
            [FromQuery] int     pageSize  = 20,
            [FromQuery] string  sortCol   = "RoleName",
            [FromQuery] string  sortDir   = "ASC")
        {
            try
            {
                var rows = await _db.QueryAsync<RoleListRow>("sp_SearchRoles", new
                {
                    SearchText    = searchText,
                    IsActive      = isActive,
                    PageNumber    = page,
                    PageSize      = pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                });
                var list  = rows.ToList();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { data = list, totalRows = total });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Role", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching roles." });
            }
        }

        // ── Save (create / update) ────────────────────────────────
        // POST api/Role/save
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveRoleRequest req)
        {
            try
            {
                var rows = await _db.QueryAsync<SpRoleIdResult>("sp_SetRole", new
                {
                    req.RoleId,
                    req.RoleName,
                    req.RoleCode,
                    req.Description,
                    req.IsActive,
                    req.IsEngineerRole,
                    req.CreatedBy,
                    req.ModifiedBy
                });
                var r = rows.FirstOrDefault();
                if (r == null) return StatusCode(500, new { message = "Unexpected error." });
                if (r.ErrorMessage != null) return BadRequest(new { message = r.ErrorMessage });
                return Ok(new { roleId = r.RoleId, message = req.RoleId == 0 ? "Role created." : "Role updated." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Role", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving role." });
            }
        }

        // ── Delete ────────────────────────────────────────────────
        // DELETE api/Role/5?modifiedBy=admin
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id, [FromQuery] string modifiedBy)
        {
            try
            {
                var rows = await _db.QueryAsync<SpSuccessResult>("sp_DeleteRole", new
                {
                    RoleId     = id,
                    ModifiedBy = modifiedBy
                });
                var r = rows.FirstOrDefault();
                if (r?.Success != 1) return BadRequest(new { message = r?.ErrorMessage ?? "Delete failed." });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Role", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting role." });
            }
        }
    }
}
