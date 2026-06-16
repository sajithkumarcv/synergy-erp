namespace ERPWEB.Models.Alerts
{
    // ── User Group read models ────────────────────────────────────────────────
    public class UserGroupRow
    {
        public int     GroupId     { get; set; }
        public string  GroupName   { get; set; } = "";
        public string? Description { get; set; }
        public bool    IsActive    { get; set; } = true;
        public int     MemberCount { get; set; }
    }

    public class UserGroupMemberRow
    {
        public int     DetailId  { get; set; }
        public int     GroupId   { get; set; }
        public int     UserId    { get; set; }
        public string  UserName  { get; set; } = "";
        public string  FullName  { get; set; } = "";
        public string? Email     { get; set; }
        public bool    IsActive  { get; set; } = true;
    }

    // ── User Group ───────────────────────────────────────────────────────────
    public class SaveUserGroupRequest
    {
        public int GroupId { get; set; }
        public string GroupName { get; set; } = "";
        public string? Description { get; set; }
        public bool IsActive { get; set; } = true;
        public string ActionBy { get; set; } = "";
    }

    public class SaveUserGroupMemberRequest
    {
        public int GroupId { get; set; }
        public int UserId { get; set; }
        public string AddedBy { get; set; } = "";
    }

    // ── Email Template ───────────────────────────────────────────────────────
    public class SaveEmailTemplateRequest
    {
        public int TemplateId { get; set; }
        public string TemplateName { get; set; } = "";
        public string SubjectTemplate { get; set; } = "";
        public string BodyTemplate { get; set; } = "";
        public string? Placeholders { get; set; }
        public bool IsActive { get; set; } = true;
        public string ActionBy { get; set; } = "";
    }

    // ── Alert Config read models ──────────────────────────────────────────────
    public class EmailAlertConfigRow
    {
        public int       AlertId        { get; set; }
        public string    AlertName      { get; set; } = "";
        public string    AlertType      { get; set; } = "";
        public int       GroupId        { get; set; }
        public string    GroupName      { get; set; } = "";
        public int       TemplateId     { get; set; }
        public string    TemplateName   { get; set; } = "";
        public string    SqlViewName    { get; set; } = "";
        public string    Frequency      { get; set; } = "";
        public string    TimeOfDay      { get; set; } = "";
        public int?      DayOfWeek      { get; set; }
        public int?      DayOfMonth     { get; set; }
        public bool      IsActive       { get; set; }
        public bool      SkipIfNoData   { get; set; }
        public DateTime? LastRunDate    { get; set; }
        public DateTime? LastSuccessDate { get; set; }
        public string?   LastError      { get; set; }
    }

    public class AlertViewRow
    {
        public string ViewName  { get; set; } = "";
        public string ViewLabel { get; set; } = "";
    }

    public class AlertLogRow
    {
        public int       LogId          { get; set; }
        public int       AlertId        { get; set; }
        public string    AlertName      { get; set; } = "";
        public DateTime  RunDate        { get; set; }
        public string    Status         { get; set; } = "";
        public string?   ErrorMessage   { get; set; }
        public int       RecipientCount { get; set; }
        public int       DataRowCount   { get; set; }
        public int?      DurationMs     { get; set; }
        public int       TotalRows      { get; set; }
    }

    public class AlertRecipientLogRow
    {
        public int       RecipientLogId { get; set; }
        public int       LogId          { get; set; }
        public int       UserId         { get; set; }
        public string    Email          { get; set; } = "";
        public string    FullName       { get; set; } = "";
        public string    Status         { get; set; } = "";
        public string?   ErrorMessage   { get; set; }
        public DateTime? SentDate       { get; set; }
    }

    // ── Alert Config ─────────────────────────────────────────────────────────
    public class SaveEmailAlertConfigRequest
    {
        public int AlertId { get; set; }
        public string AlertName { get; set; } = "";
        public string AlertType { get; set; } = "";
        public int GroupId { get; set; }
        public int TemplateId { get; set; }
        public string SqlViewName { get; set; } = "";
        public string Frequency { get; set; } = "Daily";
        public string TimeOfDay { get; set; } = "08:00";
        public int? DayOfWeek { get; set; }
        public int? DayOfMonth { get; set; }
        public bool IsActive { get; set; } = true;
        public bool SkipIfNoData { get; set; } = true;
        public string ActionBy { get; set; } = "";
    }

    // ── Internal DTOs used by the processor service ──────────────────────────
    public class AlertConfigRow
    {
        public int AlertId { get; set; }
        public string AlertName { get; set; } = "";
        public string AlertType { get; set; } = "";
        public string SqlViewName { get; set; } = "";
        public int TemplateId { get; set; }
        public int GroupId { get; set; }
        public string Frequency { get; set; } = "Daily";
        public string TimeOfDay { get; set; } = "08:00";
        public int? DayOfWeek { get; set; }
        public int? DayOfMonth { get; set; }
        public bool SkipIfNoData { get; set; }
        public DateTime? LastRunDate { get; set; }
    }

    public class AlertRecipient
    {
        public int UserId { get; set; }
        public string FullName { get; set; } = "";
        public string Email { get; set; } = "";
    }

    public class EmailTemplateRow
    {
        public int     TemplateId       { get; set; }
        public string  TemplateName     { get; set; } = "";
        public string  SubjectTemplate  { get; set; } = "";
        public string  BodyTemplate     { get; set; } = "";
        public string? Placeholders     { get; set; }
        public bool    IsActive         { get; set; } = true;
    }
}
