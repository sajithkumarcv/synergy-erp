namespace ERPWEB.Models.General
{
    public class DashboardRoleOption
    {
        public int    RoleId   { get; set; }
        public string RoleName { get; set; } = string.Empty;
    }

    public class DashboardRoleConfigRow
    {
        public int    ConfigId  { get; set; }
        public int    RoleId    { get; set; }
        public string ItemType  { get; set; } = string.Empty;   // 'KPI' or 'SECTION'
        public string ItemKey   { get; set; } = string.Empty;
        public bool   IsVisible { get; set; }
    }

    public class SaveDashboardRoleConfigRequest
    {
        public int    RoleId     { get; set; }
        public string ItemType   { get; set; } = string.Empty;
        public string ItemKey    { get; set; } = string.Empty;
        public bool   IsVisible  { get; set; }
        public string ModifiedBy { get; set; } = string.Empty;
    }
}
