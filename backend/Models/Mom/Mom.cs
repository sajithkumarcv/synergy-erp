using System.Text.Json.Serialization;

namespace ERPWEB.Models.Mom
{
    public class Mom
    {
        public int     MomId       { get; set; }
        public string  JobId       { get; set; } = string.Empty;
        public string  MeetingDate { get; set; } = string.Empty;
        public string  Title       { get; set; } = string.Empty;
        public string? Venue       { get; set; }
        public string? Attendees   { get; set; }
        public string? Summary     { get; set; }
        public string  Status      { get; set; } = "Open";
        public string  CreatedBy   { get; set; } = string.Empty;
        public string? ModifiedBy  { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // Aggregates from sp_GetMOMList
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalTasks { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int OpenTasks  { get; set; }
    }
}
