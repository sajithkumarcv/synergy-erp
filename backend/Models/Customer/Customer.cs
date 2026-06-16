using System.Text.Json.Serialization;

namespace ERPWEB.Models.Customer
{
    /// <summary>
    /// Maps to PROJ.TBL_CUSTOMER + joined view fields from VW_CUSTOMER
    /// </summary>
    public class Customer
    {
        // ── Primary Key ──────────────────────────────────────────
        public int    CustomerId     { get; set; }
        public string CustomerCode   { get; set; } = string.Empty;
        public string CustomerName   { get; set; } = string.Empty;
        public int    CurrencyId     { get; set; }
        public int    PaymentTermsId { get; set; }
        public bool   IsActive       { get; set; } = true;

        // ── Descriptive ──────────────────────────────────────────
        public string? CustomerRef        { get; set; }
        public string? CustomerShortName  { get; set; }
        public string? CustomerType       { get; set; }
        public int?    CustomerCategoryId { get; set; }

        // ── Contact ──────────────────────────────────────────────
        public string? Phone  { get; set; }
        public string? Mobile { get; set; }
        public string? Email  { get; set; }
        public string? Web    { get; set; }

        // ── Financial ────────────────────────────────────────────
        public decimal? CreditLimit { get; set; }
        public int?     CreditDays  { get; set; }

        // ── Tax ──────────────────────────────────────────────────
        public string? VatNumber   { get; set; }
        public string? TaxNumber   { get; set; }
        public string? SalesPerson { get; set; }
        public string? Remarks     { get; set; }

        // ── Credit Hold ──────────────────────────────────────────
        public bool    CreditHold     { get; set; } = false;
        public string? CreditHoldBy   { get; set; }
        public string? CreditHoldNote { get; set; }

        // ── Audit ────────────────────────────────────────────────
        public string  CreatedBy  { get; set; } = string.Empty;
        public string? ModifiedBy { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate    { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate   { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? CreditHoldDate { get; set; }

        // ── Joined / computed from VW_CUSTOMER ───────────────────
        public string? CustomerCategoryName { get; set; }
        public string? CurrencyName         { get; set; }
        public string? CurrencyShortName    { get; set; }
        public string? CurrencySymbol       { get; set; }
        public string? PaymentTermName      { get; set; }
        public int?    PaymentTermDays      { get; set; }
        public string? StatusLabel          { get; set; }
        public string?   CreditFlag       { get; set; }
        public string?   CreditFlagLabel  { get; set; }
        public string?   CreditFlagNote   { get; set; }
        public string?   CreditFlagBy     { get; set; }
        public DateTime? CreditFlagDate   { get; set; }

        // ── Detail counts (from sp_GetCustomer) ───────────────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int ContactCount { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int AddressCount { get; set; }

        // ── Paging metadata (from sp_SearchCustomers) ─────────────
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }
}
