using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using System.Security.Cryptography;
using System.Text;
using ERPWEB.Dbcontext;
using ERPWEB.Models.User;

namespace ERPWEB.Controllers.User
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class UserController : ControllerBase
    {
        private readonly DbCon _db;
        public UserController(DbCon db) { _db = db; }

        // ── Active user list for dropdowns ───────────────────────
        // GET api/User/list
        [HttpGet("list")]
        public async Task<IActionResult> GetActiveList()
        {
            try
            {
                var rows = await _db.QueryAsync<UserListRow>("sp_SearchUsers", new
                {
                    SearchText    = (string?)null,
                    Status        = "active",
                    RoleId        = (int?)null,
                    PageNumber    = 1,
                    PageSize      = 500,
                    SortColumn    = "FullName",
                    SortDirection = "ASC"
                });
                // sp_SearchUsers LEFT JOINs roles, so a multi-role user appears once per
                // role — group by user and join their role names into one label.
                var result = (rows ?? new List<UserListRow>())
                    .GroupBy(u => u.UserId)
                    .Select(g =>
                    {
                        var u = g.First();
                        var roles = string.Join(", ",
                            g.Select(x => x.RoleName)
                             .Where(rn => !string.IsNullOrWhiteSpace(rn))
                             .Distinct());
                        return new { u.UserId, u.UserName, u.FullName, RoleName = roles };
                    });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "User", action: "GetActiveList", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching user list." });
            }
        }

        // ── Search / list ─────────────────────────────────────────
        // GET api/User/search?searchText=&status=&roleId=&page=1&pageSize=20&sortCol=CreatedDate&sortDir=DESC
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText,
            [FromQuery] string? status,
            [FromQuery] int?    roleId,
            [FromQuery] int     page      = 1,
            [FromQuery] int     pageSize  = 20,
            [FromQuery] string  sortCol   = "CreatedDate",
            [FromQuery] string  sortDir   = "DESC")
        {
            try
            {
                var rows = await _db.QueryAsync<UserListRow>("sp_SearchUsers", new
                {
                    SearchText    = searchText,
                    Status        = status,
                    RoleId        = roleId,
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
                await _db.WriteLog(ex, controller: "User", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching users." });
            }
        }

        // ── Save (create / update) ────────────────────────────────
        // POST api/User/save
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveUserRequest req)
        {
            try
            {
                string? passwordHash = null;
                if (req.UserId == 0 && !string.IsNullOrWhiteSpace(req.Password))
                {
                    using var sha = SHA256.Create();
                    var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(req.Password));
                    passwordHash = BitConverter.ToString(hash).Replace("-", "").ToLower();
                }

                var rows = await _db.QueryAsync<SpIdResult>("sp_SetUserNew", new
                {
                    UserId       = req.UserId,
                    UserCode     = req.UserCode,
                    UserName     = req.UserName,
                    FullName     = req.FullName,
                    Email        = req.Email,
                    Mobile       = req.Mobile,
                    IsActive     = req.IsActive,
                    IsLocked     = req.IsLocked,
                    PasswordHash = passwordHash,
                    CreatedBy    = req.CreatedBy,
                    ModifiedBy   = req.ModifiedBy
                });
                var r = rows.FirstOrDefault();
                if (r == null) return StatusCode(500, new { message = "Unexpected error." });
                if (r.ErrorMessage != null) return BadRequest(new { message = r.ErrorMessage });
                return Ok(new { userId = r.UserId, message = req.UserId == 0 ? "User created." : "User updated." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "User", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving user." });
            }
        }

        // ── Delete ────────────────────────────────────────────────
        // DELETE api/User/5?modifiedBy=admin
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id, [FromQuery] string modifiedBy)
        {
            try
            {
                await _db.QueryAsync<dynamic>("sp_DeleteUser", new { UserId = id });
                return Ok(new { success = true });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "User", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting user." });
            }
        }

        // ── Reset password ────────────────────────────────────────
        // POST api/User/reset-password
        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest req)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(req.NewPassword))
                    return BadRequest(new { message = "New password is required." });

                using var sha = SHA256.Create();
                var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(req.NewPassword));
                var passwordHash = BitConverter.ToString(hash).Replace("-", "").ToLower();

                var rows = await _db.QueryAsync<SpSuccessResult>("sp_ResetUserPassword", new
                {
                    req.UserId,
                    PasswordHash = passwordHash,
                    req.ModifiedBy
                });
                var r = rows.FirstOrDefault();
                if (r?.Success != 1) return BadRequest(new { message = r?.ErrorMessage ?? "Reset failed." });
                return Ok(new { message = "Password reset successfully." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "User", action: "ResetPassword", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error resetting password." });
            }
        }

        // ── Get user roles ────────────────────────────────────────
        // GET api/User/5/roles
        [HttpGet("{id:int}/roles")]
        public async Task<IActionResult> GetUserRoles(int id)
        {
            try
            {
                var rows = await _db.QueryAsync<UserRoleItem>("sp_GetUserRoles", new { UserId = id });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "User", action: "GetUserRoles", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching user roles." });
            }
        }

        // ── Assign / remove role ──────────────────────────────────
        // POST api/User/role
        [HttpPost("role")]
        public async Task<IActionResult> SetUserRole([FromBody] UserRoleRequest req)
        {
            try
            {
                var rows = await _db.QueryAsync<SpSuccessResult>("sp_SetUserRole", new
                {
                    req.UserId,
                    req.RoleId,
                    Action = req.Action,
                    req.ActionBy
                });
                var r = rows.FirstOrDefault();
                if (r?.Success != 1) return BadRequest(new { message = r?.ErrorMessage ?? "Operation failed." });
                return Ok(new { message = req.Action == "ASSIGN" ? "Role assigned." : "Role removed." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "User", action: "SetUserRole", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error updating user role." });
            }
        }

        // ── All active roles (for dropdowns) ─────────────────────
        // GET api/User/roles
        [HttpGet("roles")]
        public async Task<IActionResult> GetRoles()
        {
            try
            {
                var rows = await _db.QueryAsync<RoleListRow>("sp_SearchRoles", new
                {
                    IsActive   = (bool?)true,
                    PageNumber = 1,
                    PageSize   = 500
                });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "User", action: "GetRoles", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading roles." });
            }
        }

        // ── Theme (unchanged) ─────────────────────────────────────
        [HttpPost("theme")]
        public async Task<IActionResult> SetTheme([FromBody] ThemeRequest model)
        {
            try
            {
                var validThemes = new[] { "ocean-blue", "midnight-dark", "forest-green" };
                if (!validThemes.Contains(model.Theme))
                    return BadRequest(new { message = "Invalid theme." });
                await _db.ExecuteScalarAsync("sp_SetUserTheme", new { model.UserId, model.Theme });
                return Ok(new { theme = model.Theme, message = "Theme saved." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "User", action: "SetTheme", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving theme." });
            }
        }
    }

    public class ThemeRequest
    {
        public int    UserId { get; set; }
        public string Theme  { get; set; } = "ocean-blue";
    }
}
