namespace ERPWEB.Models.General
{
    public class DocumentTypeItem
    {
        public int    DocumentTypeId { get; set; }
        public string DocumentType   { get; set; } = string.Empty;
        public string ModuleName     { get; set; } = string.Empty;
        public bool   IsMandatory    { get; set; }
    }

    public class Document
    {
        public int      DocumentId     { get; set; }
        public string   ReferenceTable { get; set; } = string.Empty;
        public string   ReferenceKey   { get; set; } = string.Empty;
        public string?  DocumentType   { get; set; }
        public string   FileName       { get; set; } = string.Empty;
        public string?  FileType       { get; set; }
        public int      FileSize       { get; set; }
        public string?  FilePath       { get; set; }
        public string?  Remarks        { get; set; }
        public string   UploadedBy     { get; set; } = string.Empty;
        public DateTime UploadedDate   { get; set; }
        public bool     IsActive       { get; set; } = true;
        public bool     IsMandatory    { get; set; }
    }
}
