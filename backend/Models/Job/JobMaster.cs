namespace ERPWEB.Models.Job
{
    public class JobType
    {
        public string  JobTypeId          { get; set; } = "";
        public string  JobTypeName        { get; set; } = "";
        public string? PreFix             { get; set; }
        public string? Suffix             { get; set; }
        public string  StartingSeries     { get; set; } = "1";
        public int     CurrentSeries      { get; set; }
        public int     SortOrder          { get; set; }
        public bool    IsActive           { get; set; } = true;
        public bool    IsCostingRequired  { get; set; } = true;
        public bool    RequiresParentJob  { get; set; } = false;
        public string  CreatedBy          { get; set; } = "";
        public string? ModifiedBy         { get; set; }
    }

    public class JobStage
    {
        public string  JobStageId   { get; set; } = "";
        public string  JobStageName { get; set; } = "";
        public int     SortOrder    { get; set; }
        public string  CreatedBy    { get; set; } = "";
        public string? ModifiedBy   { get; set; }
    }
}
