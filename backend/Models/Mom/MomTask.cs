using System.Text.Json.Serialization;

namespace ERPWEB.Models.Mom
{
    public class MomTask
    {
        public int     MomTaskId   { get; set; }
        public int     MomId       { get; set; }
        public string  JobId       { get; set; } = string.Empty;
        public string? MomTitle    { get; set; }
        public string? MeetingDate { get; set; }
        public string  Description { get; set; } = string.Empty;
        public string? DueDate     { get; set; }
        public string  Priority    { get; set; } = "Medium";
        public string  AssignedTo  { get; set; } = string.Empty;
        public string  Status      { get; set; } = "Open";
        public string? Remarks     { get; set; }
        public string  CreatedBy   { get; set; } = string.Empty;
        public string? ModifiedBy  { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }
    }
}
