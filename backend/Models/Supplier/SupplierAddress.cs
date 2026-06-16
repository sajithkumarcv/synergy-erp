using System.Text.Json.Serialization;

namespace ERPWEB.Models.Supplier
{
    /// <summary>
    /// Maps to PROJ.TBL_SUPPLIER_ADDRESS
    /// CreatedDate / ModifiedDate are set by GETDATE() in the SP — never sent by client.
    /// </summary>
    public class SupplierAddress
    {
        public int SupplierAddressId { get; set; }
        public int SupplierId        { get; set; }

        public string? AddressType  { get; set; }
        public string  AddressLine1 { get; set; } = string.Empty;
        public string? AddressLine2 { get; set; }
        public string? City         { get; set; }
        public string? State        { get; set; }
        public int     CountryId    { get; set; }
        public string? PostalCode   { get; set; }
        public string? POBox        { get; set; }
        public bool?   IsDefault    { get; set; }
        public bool    IsActive     { get; set; } = true;

        // Sent by client on save
        public string  CreatedBy  { get; set; } = string.Empty;
        public string? ModifiedBy { get; set; }

        // ── Server-side only — never accepted from client ────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // Read-only joined display field
        public string? CountryName { get; set; }
    }
}
