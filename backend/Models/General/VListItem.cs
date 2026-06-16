namespace ERPWEB.Models.General
{
    public class VListItem
    {
        public int VListID { get; set; }
        public string TypeName { get; set; } = string.Empty;
        public string ListName { get; set; } = string.Empty;
        public string ItemValue { get; set; } = string.Empty;
        public string ItemDescription { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public int SortOrder { get; set; }
    }
}
