namespace ERPWEB.Models.Supplier
{
    public class SupplierBank
    {
        public int     SupplierBankId  { get; set; }
        public int     SupplierId      { get; set; }
        public string  BankName        { get; set; } = string.Empty;
        public string? AccountName     { get; set; }
        public string  AccountNumber   { get; set; } = string.Empty;
        public string? IBAN            { get; set; }
        public string? SwiftCode       { get; set; }
        public string? BranchName      { get; set; }
        public int?    CurrencyId      { get; set; }
        public bool    IsDefault       { get; set; } = false;
        public bool    IsActive        { get; set; } = true;
        public string? CreatedBy       { get; set; }
        public string? ModifiedBy      { get; set; }

        // Joined from TBL_CURRENCY
        public string? CurrencyName      { get; set; }
        public string? CurrencyShortName { get; set; }
        public string? CurrencySymbol    { get; set; }
    }
}
