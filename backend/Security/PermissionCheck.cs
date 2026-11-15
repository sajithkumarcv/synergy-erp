using System.Security.Claims;
using ERPWEB.Dbcontext;

namespace ERPWEB.Security
{
    /// <summary>
    /// Server-side check of a menu action (the same grants the screens use through canDo), so a hidden
    /// figure on screen is also withheld by the API. Any of the user's roles with the action allowed counts.
    /// </summary>
    public static class PermissionCheck
    {
        public static async Task<bool> CanDoAsync(DbCon db, ClaimsPrincipal user, string menuUrl, string actionCode)
        {
            var name = user.Identity?.Name;
            if (string.IsNullOrWhiteSpace(name)) return false;
            var rows = await db.QueryAsync<bool>("sp_UserCanDo", new { UserName = name, MenuUrl = menuUrl, ActionCode = actionCode });
            return rows?.FirstOrDefault() ?? false;
        }
    }
}
