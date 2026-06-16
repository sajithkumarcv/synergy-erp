using System.Text.Json.Serialization;

namespace ERPWEB.Models.Customer
{
    /// <summary>
    /// Maps to PROJ.TBL_CUSTOMER_CONTACT (11 columns)
    /// CreatedDate / ModifiedDate are set by GETDATE() in the SP — never sent by client.
    /// </summary>
    public class CustomerContact
    {
        public int CustomerContactId { get; set; }
        public int CustomerId        { get; set; }

        public string? ContactTitle { get; set; }
        public string  ContactName  { get; set; } = string.Empty;
        public string? Designation  { get; set; }
        public string? Phone        { get; set; }
        public string? Mobile       { get; set; }
        public string? Email        { get; set; }
        public bool?   IsPrimary    { get; set; }
        public bool    IsActive     { get; set; } = true;

        // Sent by client on save
        public string  CreatedBy  { get; set; } = string.Empty;
        public string? ModifiedBy { get; set; }

        // ── Server-side only — never accepted from client ────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }
    }
}
