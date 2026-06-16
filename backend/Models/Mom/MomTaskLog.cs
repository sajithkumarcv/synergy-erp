namespace ERPWEB.Models.Mom
{
    public class MomTaskLog
    {
        public int      MomTaskLogId { get; set; }
        public int      MomTaskId    { get; set; }
        public string   Action       { get; set; } = string.Empty;
        public string?  FromUser     { get; set; }
        public string?  ToUser       { get; set; }
        public string?  OldStatus    { get; set; }
        public string?  NewStatus    { get; set; }
        public string?  Remarks      { get; set; }
        public string   ActionBy     { get; set; } = string.Empty;
        public DateTime ActionDate   { get; set; }
    }
}
