namespace ERPWEB.Models.General
{
    public class DocumentStatus
    {
        public int     StatusId           { get; set; }
        public string  ModuleName         { get; set; } = string.Empty;
        public string  StatusCode         { get; set; } = string.Empty;
        public string  StatusLabel        { get; set; } = string.Empty;
        public string  BadgeBg            { get; set; } = "#f1f5f9";
        public string  BadgeColor         { get; set; } = "#475569";
        public string  BadgeDot           { get; set; } = "#94a3b8";
        public int     SortOrder          { get; set; }
        public bool    CanEdit            { get; set; }
        public bool    CanDelete          { get; set; }
        public bool    CanUploadDocs      { get; set; }
        public bool    CanPrint           { get; set; } = true;
        public bool    IsInitial          { get; set; }
        public bool    IsTerminal         { get; set; }
        public string? AllowedTransitions { get; set; }
        public bool    IsActive           { get; set; } = true;

        public string   CreatedBy    { get; set; } = string.Empty;
        public DateTime CreatedDate  { get; set; }
        public string?  ModifiedBy   { get; set; }
        public DateTime? ModifiedDate { get; set; }
    }
}
