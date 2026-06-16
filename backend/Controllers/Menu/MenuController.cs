using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using ERPWEB.Dbcontext;
using ERPWEB.Models.Menu;

namespace ERPWEB.Controllers.Menu
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class MenuController : ControllerBase
    {
        private readonly DbCon _db;
        public MenuController(DbCon db) { _db = db; }

        // ── GET api/Menu/user/5 ───────────────────────────────────────────────
        // Returns the full permitted menu tree + allowed actions for a user.
        // Called by the frontend PermissionContext immediately after login.
        [HttpGet("user/{userId:int}")]
        public async Task<IActionResult> GetUserMenus(int userId)
        {
            try
            {
                using var multi = await _db.QueryMultipleAsync("sp_GetUserMenus", new { UserId = userId });
                var menus   = (await multi.ReadAsync<MenuItemDto>()).ToList();
                var actions = (await multi.ReadAsync<MenuActionDto>()).ToList();
                return Ok(new UserMenusResponse { Menus = menus, Actions = actions });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Menu", action: "GetUserMenus",
                                   requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading user menus." });
            }
        }

        // ── GET api/Menu/all ──────────────────────────────────────────────────
        // Returns the complete menu tree (all menus + actions) for admin management.
        [HttpGet("all")]
        public async Task<IActionResult> GetMenuTree()
        {
            try
            {
                using var multi = await _db.QueryMultipleAsync("sp_GetMenuTree", null);
                var menus   = (await multi.ReadAsync<MenuTreeItem>()).ToList();
                var actions = (await multi.ReadAsync<MenuActionTreeItem>()).ToList();
                return Ok(new { menus, actions });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Menu", action: "GetMenuTree",
                                   requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading menu tree." });
            }
        }

        // ── POST api/Menu ─────────────────────────────────────────────────────
        // Insert (menuId=0) or update an existing menu entry.
        [HttpPost]
        public async Task<IActionResult> SaveMenu([FromBody] SaveMenuRequest req)
        {
            try
            {
                var result = await _db.QueryFirstAsync<dynamic>("sp_SaveMenu", new
                {
                    req.MenuId,
                    ParentMenuId = (object?)req.ParentMenuId ?? DBNull.Value,
                    req.MenuName,
                    MenuUrl  = (object?)(req.MenuUrl  ?? "") ?? DBNull.Value,
                    MenuIcon = (object?)(req.MenuIcon ?? "") ?? DBNull.Value,
                    req.MenuOrder,
                    req.IsActive,
                });
                return Ok(new { success = true, menuId = (int)result.MenuId });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Menu", action: "SaveMenu",
                                   requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving menu entry." });
            }
        }

        // ── DELETE api/Menu/5 ─────────────────────────────────────────────────
        // Soft-delete: set IsActive = 0.
        [HttpDelete("{menuId:int}")]
        public async Task<IActionResult> DeleteMenu(int menuId)
        {
            try
            {
                await _db.QueryAsync<dynamic>("proj.sp_SoftDeleteMenu", new { MenuId = menuId });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Menu", action: "DeleteMenu",
                                   requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting menu." });
            }
        }
    }
}
