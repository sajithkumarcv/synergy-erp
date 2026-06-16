namespace ERPWEB.Models.Menu
{
    // ── Returned by sp_GetUserMenus (result set 1) ───────────────────────────
    public class MenuItemDto
    {
        public int     MenuId       { get; set; }
        public int?    ParentMenuId { get; set; }
        public string  MenuName     { get; set; } = string.Empty;
        public string? MenuUrl      { get; set; }
        public string? MenuIcon     { get; set; }
        public int     MenuOrder    { get; set; }
    }

    // ── Returned by sp_GetUserMenus (result set 2) ───────────────────────────
    public class MenuActionDto
    {
        public int    ActionId   { get; set; }
        public int    MenuId     { get; set; }
        public string ActionName { get; set; } = string.Empty;
        public string ActionCode { get; set; } = string.Empty;
        public bool   IsAllowed  { get; set; }
    }

    // ── Response wrapper for GET api/Menu/user/{userId} ──────────────────────
    public class UserMenusResponse
    {
        public List<MenuItemDto>   Menus   { get; set; } = new();
        public List<MenuActionDto> Actions { get; set; } = new();
    }

    // ── Returned by sp_GetMenuTree (result set 1) ────────────────────────────
    public class MenuTreeItem
    {
        public int     MenuId         { get; set; }
        public int?    ParentMenuId   { get; set; }
        public string  MenuName       { get; set; } = string.Empty;
        public string  MenuUrl        { get; set; } = string.Empty;
        public string  MenuIcon       { get; set; } = string.Empty;
        public int     MenuOrder      { get; set; }
        public bool    IsActive       { get; set; }
        public string  ParentMenuName { get; set; } = string.Empty;
    }

    // ── Returned by sp_GetMenuTree (result set 2) ────────────────────────────
    public class MenuActionTreeItem
    {
        public int    ActionId   { get; set; }
        public int    MenuId     { get; set; }
        public string ActionName { get; set; } = string.Empty;
        public string ActionCode { get; set; } = string.Empty;
        public bool   IsActive   { get; set; }
    }

    // ── POST api/Menu ─────────────────────────────────────────────────────────
    public class SaveMenuRequest
    {
        public int     MenuId       { get; set; }   // 0 = new
        public int?    ParentMenuId { get; set; }
        public string  MenuName     { get; set; } = string.Empty;
        public string? MenuUrl      { get; set; }
        public string? MenuIcon     { get; set; }
        public int     MenuOrder    { get; set; }
        public bool    IsActive     { get; set; } = true;
    }
}
