namespace ERPWEB.Models.General
{
    public class OwnerCompany
    {
        public int     CompanyId   { get; set; }
        public string  CompanyName  { get; set; } = string.Empty;
        public string? DisplayName  { get; set; }   // Short / app name shown in the header
        public string? CompanyCode  { get; set; }
        public string? TRN         { get; set; }
        public string? GSTNo       { get; set; }
        public string? PAN         { get; set; }
        public string? CIN         { get; set; }
        public string? Phone       { get; set; }
        public string? Fax         { get; set; }
        public string? Email       { get; set; }
        public string? Website     { get; set; }
        public string? LogoPath    { get; set; }
        public string? PrintNote   { get; set; }

        public List<CompanyAddress> Addresses { get; set; } = new();
        public List<CompanyBank>    Banks      { get; set; } = new();
    }

    public class CompanyAddress
    {
        public int     AddressId    { get; set; }
        public int     CompanyId    { get; set; }
        public string? AddressLine1 { get; set; }
        public string? AddressLine2 { get; set; }
        public string? City         { get; set; }
        public string? State        { get; set; }
        public string? Country      { get; set; }
        public bool    IsPrimary    { get; set; }
        public int     SortOrder    { get; set; }
    }

    public class CompanyBank
    {
        public int     BankId        { get; set; }
        public int     CompanyId     { get; set; }
        public string  BankName      { get; set; } = string.Empty;
        public string? Beneficiary   { get; set; }
        public string? AccountNo     { get; set; }
        public string? IBAN          { get; set; }
        public string? Swift         { get; set; }
        public string? Currency      { get; set; }
        public string? BranchAddress { get; set; }
        public string? BranchName    { get; set; }
        public string? IFSC          { get; set; }
        public string? MICR          { get; set; }
        public string? AccountType   { get; set; }
        public string? CRN           { get; set; }
        public string? UpiId         { get; set; }
        public bool    IsPrimary     { get; set; }
        public int     SortOrder     { get; set; }
    }

    public class UpdateCompanyRequest
    {
        public string  CompanyName  { get; set; } = string.Empty;
        public string? DisplayName  { get; set; }
        public string? CompanyCode  { get; set; }
        public string? TRN         { get; set; }
        public string? GSTNo       { get; set; }
        public string? PAN         { get; set; }
        public string? CIN         { get; set; }
        public string? Phone       { get; set; }
        public string? Fax         { get; set; }
        public string? Email       { get; set; }
        public string? Website     { get; set; }
        public string? PrintNote   { get; set; }
    }

    public class SaveAddressRequest
    {
        public int?    AddressId    { get; set; }
        public string? AddressLine1 { get; set; }
        public string? AddressLine2 { get; set; }
        public string? City         { get; set; }
        public string? State        { get; set; }
        public string? Country      { get; set; }
        public bool    IsPrimary    { get; set; }
        public int     SortOrder    { get; set; }
        public string? CreatedBy    { get; set; }
    }

    public class SaveBankRequest
    {
        public int?    BankId        { get; set; }
        public string  BankName      { get; set; } = string.Empty;
        public string? Beneficiary   { get; set; }
        public string? AccountNo     { get; set; }
        public string? IBAN          { get; set; }
        public string? Swift         { get; set; }
        public string? Currency      { get; set; }
        public string? BranchAddress { get; set; }
        public string? BranchName    { get; set; }
        public string? IFSC          { get; set; }
        public string? MICR          { get; set; }
        public string? AccountType   { get; set; }
        public string? CRN           { get; set; }
        public string? UpiId         { get; set; }
        public bool    IsPrimary     { get; set; }
        public int     SortOrder     { get; set; }
        public string? CreatedBy     { get; set; }
    }
}
