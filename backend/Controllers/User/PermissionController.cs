using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using ERPWEB.Dbcontext;
using ERPWEB.Models.User;

namespace ERPWEB.Controllers.User
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class PermissionController : ControllerBase
    {
        private readonly DbCon _db;
        public PermissionController(DbCon db) { _db = db; }

        // ── Menu Permissions ──────────────────────────────────────
        // GET api/Permission/menu/5
        [HttpGet("menu/{roleId:int}")]
        public async Task<IActionResult> GetMenuPermissions(int roleId)
        {
            try
            {
                var rows = await _db.QueryAsync<MenuPermissionRow>("sp_GetMenuPermissions", new { RoleId = roleId });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Permission", action: "GetMenuPermissions", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching menu permissions." });
            }
        }

        // POST api/Permission/menu
        [HttpPost("menu")]
        public async Task<IActionResult> SaveMenuPermission([FromBody] SaveMenuPermissionRequest req)
        {
            try
            {
                await _db.QueryAsync<dynamic>("sp_SaveMenuPermission", new
                {
                    req.RoleId, req.MenuId, req.CanView
                });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Permission", action: "SaveMenuPermission", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving menu permission." });
            }
        }

        // ── Action Permissions ────────────────────────────────────
        // GET api/Permission/action/5
        [HttpGet("action/{roleId:int}")]
        public async Task<IActionResult> GetActionPermissions(int roleId)
        {
            try
            {
                var rows = await _db.QueryAsync<ActionPermissionRow>("sp_GetActionPermissions", new { RoleId = roleId });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Permission", action: "GetActionPermissions", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching action permissions." });
            }
        }

        // POST api/Permission/action
        [HttpPost("action")]
        public async Task<IActionResult> SaveActionPermission([FromBody] SaveActionPermissionRequest req)
        {
            try
            {
                await _db.QueryAsync<dynamic>("sp_SaveActionPermission", new
                {
                    req.RoleId, req.MenuId, req.ActionId, req.IsAllowed
                });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Permission", action: "SaveActionPermission", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving action permission." });
            }
        }
    }
}
