namespace ERPWEB.Models.General
{
    public class Country
    {
        public int CountryId { get; set; }
        public required string CountryCode { get; set; }
        public required string CountryName { get; set; }
        public bool IsActive { get; set; }

        public int SortOrder { get; set; }
        public DateTime CreatedDate { get; set; }
        public required string CreatedBy { get; set; }
        public string? ModifiedBy { get; set; }
        public DateTime ModifiedDate { get; set; }
    }
}
