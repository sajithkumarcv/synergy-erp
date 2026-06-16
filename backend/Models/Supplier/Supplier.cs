using System.Text.Json.Serialization;

namespace ERPWEB.Models.Supplier
{
    /// <summary>
    /// Maps to PROJ.TBL_SUPPLIER + joined view fields from VW_SUPPLIER
    /// </summary>
    public class Supplier
    {
        // ── Primary Key ──────────────────────────────────────────
        public int    SupplierId     { get; set; }
        public string SupplierCode   { get; set; } = string.Empty;
        public string SupplierName   { get; set; } = string.Empty;
        public int    CurrencyId     { get; set; }
        public int    PaymentTermsId { get; set; }
        public bool   IsActive       { get; set; } = true;

        // ── Descriptive ──────────────────────────────────────────
        public string? SupplierRef        { get; set; }
        public string? SupplierShortName  { get; set; }
        public string? SupplierType       { get; set; }
        public int?    SupplierCategoryId { get; set; }

        // ── Contact ──────────────────────────────────────────────
        public string? Phone  { get; set; }
        public string? Mobile { get; set; }
        public string? Email  { get; set; }
        public string? Web    { get; set; }

        // ── Financial ────────────────────────────────────────────
        public decimal? CreditLimit  { get; set; }
        public int?     CreditDays   { get; set; }
        public string?  PaymentMode  { get; set; }

        // ── Compliance / Procurement ──────────────────────────────
        public bool    IsApprovedVendor   { get; set; } = false;
        public bool    IsOnHold           { get; set; } = false;
        public int?    LeadTimeDays       { get; set; }
        public string? TradeLicenseNo     { get; set; }
        public DateTime? TradeLicenseExpiry { get; set; }
        public int?    CountryId          { get; set; }
        public byte?   Rating             { get; set; }

        // ── Tax ──────────────────────────────────────────────────
        public string? VatNumber      { get; set; }
        public string? TaxNumber      { get; set; }
        public string? AccountManager { get; set; }
        public string? Remarks        { get; set; }

        // ── Audit ────────────────────────────────────────────────
        public string  CreatedBy  { get; set; } = string.Empty;
        public string? ModifiedBy { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // ── Joined / computed from VW_SUPPLIER ───────────────────
        public string? SupplierCategoryName { get; set; }
        public string? CurrencyName         { get; set; }
        public string? CurrencyShortName    { get; set; }
        public string? CurrencySymbol       { get; set; }
        public string? PaymentTermName      { get; set; }
        public int?    PaymentTermDays      { get; set; }
        public string? CountryName          { get; set; }
        public string? StatusLabel          { get; set; }

        // ── Detail counts (from sp_GetSupplier) ───────────────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int ContactCount { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int AddressCount { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int BankCount    { get; set; }

        // ── Paging metadata (from sp_SearchSuppliers) ─────────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }
}
