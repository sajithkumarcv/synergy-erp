using System.Text.Json.Serialization;

namespace ERPWEB.Models.Mom
{
    public class MomTask
    {
        public int     MomTaskId   { get; set; }
        // Nullable — tasks auto-created from a non-MOM source (e.g. "create PO"
        // on PR approval, via RefModuleCode/RefDocumentId below) have no MOM.
        public int?    MomId       { get; set; }
        public string  JobId       { get; set; } = string.Empty;
        public string? MomTitle    { get; set; }
        public string? MeetingDate { get; set; }
        public string  Description { get; set; } = string.Empty;
        public string? DueDate     { get; set; }
        public string  Priority    { get; set; } = "Medium";
        public string  AssignedTo  { get; set; } = string.Empty;
        public string  Status      { get; set; } = "Open";
        public string? Remarks     { get; set; }
        // Generic "this task is about that document" reference — e.g.
        // RefModuleCode='PR', RefDocumentId=<PrId>, RefDocumentNo='PR-26-0007'
        // for an auto-created "create PO" task. Mirrors the ModuleId/DocumentId
        // /DocumentNo shape already used by TBL_APPROVAL_TRANSACTION.
        public string? RefModuleCode { get; set; }
        public int?    RefDocumentId { get; set; }
        public string? RefDocumentNo { get; set; }
        public string  CreatedBy   { get; set; } = string.Empty;
        public string? ModifiedBy  { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }
    }
}
