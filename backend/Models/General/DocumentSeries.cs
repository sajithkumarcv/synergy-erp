using System.Text.Json.Serialization;

namespace ERPWEB.Models.General
{
    public class DocumentSeries
    {
        public string   DocTypeId      { get; set; } = string.Empty;
        public string   DocTypeName    { get; set; } = string.Empty;
        public string   Prefix         { get; set; } = string.Empty;
        public string?  Suffix         { get; set; }
        public string   Separator      { get; set; } = "-";
        public bool     IncludeYear    { get; set; } = true;
        public byte     YearDigits     { get; set; } = 4;
        public bool     ResetYearly    { get; set; } = true;
        public byte     PadLength      { get; set; } = 4;
        public int      StartingSeries { get; set; } = 1;
        public int      CurrentSeries  { get; set; }
        public short?   CurrentYear    { get; set; }
        public int      SortOrder      { get; set; }
        public bool     IsActive       { get; set; } = true;

        public string  CreatedBy   { get; set; } = string.Empty;
        public DateTime CreatedDate { get; set; }
        public string?  ModifiedBy  { get; set; }
        public DateTime? ModifiedDate { get; set; }

        // Read-only preview — returned by sp_GetDocSeriesList or sp_PreviewDocNumber
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public string? PreviewNumber { get; set; }
    }
}
