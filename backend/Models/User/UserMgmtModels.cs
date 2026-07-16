using System.Text.Json.Serialization;

namespace ERPWEB.Models.User
{
    // ── User search/list row ─────────────────────────────────────
    public class UserListRow
    {
        public int      UserId        { get; set; }
        public string   UserCode      { get; set; } = string.Empty;
        public string   UserName      { get; set; } = string.Empty;
        public string?  FullName      { get; set; }
        public string?  Email         { get; set; }
        public string?  Mobile        { get; set; }
        public bool     IsActive      { get; set; }
        public bool     IsLocked      { get; set; }
        public string?  RoleName      { get; set; }
        public int?     RoleId        { get; set; }
        public string   CreatedBy     { get; set; } = string.Empty;
        public DateTime CreatedDate   { get; set; }
        public DateTime? ModifiedDate { get; set; }
        public DateTime? LastLoginDate{ get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }

    // ── Save user request ────────────────────────────────────────
    public class SaveUserRequest
    {
        public int     UserId       { get; set; }
        public string? UserCode     { get; set; }
        public string  UserName     { get; set; } = string.Empty;
        public string? FullName     { get; set; }
        public string? Email        { get; set; }
        public string? Mobile       { get; set; }
        public bool    IsActive     { get; set; } = true;
        public bool    IsLocked     { get; set; } = false;
        public string? Password     { get; set; }   // plain-text, only on create
        public string  CreatedBy    { get; set; } = string.Empty;
        public string? ModifiedBy   { get; set; }
    }

    // ── Reset password request ───────────────────────────────────
    public class ResetPasswordRequest
    {
        public int    UserId      { get; set; }
        public string NewPassword { get; set; } = string.Empty;
        public string ModifiedBy  { get; set; } = string.Empty;
    }

    // ── Role list row ────────────────────────────────────────────
    public class RoleListRow
    {
        public int      RoleId           { get; set; }
        public string   RoleName         { get; set; } = string.Empty;
        public string   RoleCode         { get; set; } = string.Empty;
        public string?  Description      { get; set; }
        public bool     IsActive         { get; set; }
        public bool     IsEngineerRole   { get; set; }
        public int      UserCount        { get; set; }
        public string?  CreatedBy        { get; set; }
        public DateTime? CreatedDate     { get; set; }
        public string?  ModifiedBy       { get; set; }
        public DateTime? ModifiedDate    { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }

    // ── Save role request ────────────────────────────────────────
    public class SaveRoleRequest
    {
        public int     RoleId           { get; set; }
        public string  RoleName         { get; set; } = string.Empty;
        public string  RoleCode         { get; set; } = string.Empty;
        public string? Description      { get; set; }
        public bool    IsActive         { get; set; } = true;
        public bool    IsEngineerRole   { get; set; } = false;
        public string  CreatedBy        { get; set; } = string.Empty;
        public string? ModifiedBy       { get; set; }
    }

    // ── User role item ───────────────────────────────────────────
    public class UserRoleItem
    {
        public int    RoleId      { get; set; }
        public string RoleName    { get; set; } = string.Empty;
        public string RoleCode    { get; set; } = string.Empty;
        public string? Description{ get; set; }
        public bool   IsActive    { get; set; }
        public string?   AssignedBy   { get; set; }
        public DateTime? AssignedDate { get; set; }
    }

    // ── Assign/remove role request ───────────────────────────────
    public class UserRoleRequest
    {
        public int     UserId   { get; set; }
        public int     RoleId   { get; set; }
        public string  Action   { get; set; } = "ASSIGN";   // "ASSIGN" | "REMOVE"
        public string? ActionBy { get; set; }
    }

    // ── Menu permission row ──────────────────────────────────────
    public class MenuPermissionRow
    {
        public int     MenuId              { get; set; }
        public string  MenuName            { get; set; } = string.Empty;
        public string? MenuUrl             { get; set; }
        public int?    ParentMenuId        { get; set; }
        public string? ParentMenuName      { get; set; }
        public string? GrandParentMenuName { get; set; }
        public string? SectionName         { get; set; }
        public int     RoleMenuId          { get; set; }
        public bool    CanView             { get; set; }
    }

    // ── Save menu permission request ─────────────────────────────
    public class SaveMenuPermissionRequest
    {
        public int  RoleId  { get; set; }
        public int  MenuId  { get; set; }
        public bool CanView { get; set; }
    }

    // ── Action permission row ────────────────────────────────────
    public class ActionPermissionRow
    {
        public int     MenuId              { get; set; }
        public string  MenuName            { get; set; } = string.Empty;
        public string? MenuUrl             { get; set; }
        public string? ParentMenuName      { get; set; }
        public string? GrandParentMenuName { get; set; }
        public string? SectionName         { get; set; }
        public int     ActionId            { get; set; }
        public string  ActionName          { get; set; } = string.Empty;
        public string  ActionCode          { get; set; } = string.Empty;
        public int     RoleMenuActionId    { get; set; }
        public bool    IsAllowed           { get; set; }
    }

    // ── Save action permission request ───────────────────────────
    public class SaveActionPermissionRequest
    {
        public int  RoleId    { get; set; }
        public int  MenuId    { get; set; }
        public int  ActionId  { get; set; }
        public bool IsAllowed { get; set; }
    }

    // ── Sp result helpers ────────────────────────────────────────
    public class SpIdResult
    {
        public int     UserId       { get; set; }
        public string? ErrorMessage { get; set; }
    }
    public class SpRoleIdResult
    {
        public int     RoleId       { get; set; }
        public string? ErrorMessage { get; set; }
    }
    public class SpSuccessResult
    {
        public int     Success       { get; set; }
        public string? ErrorMessage  { get; set; }
    }
}
