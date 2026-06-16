using System.Text.Json.Serialization;

namespace ERPWEB.Models.Invoice
{
    // ────────────────────────────────────────────────────────────
    // Invoice Header
    // ────────────────────────────────────────────────────────────
    public class Invoice
    {
        public int       InvoiceId            { get; set; }
        public string    InvoiceNo            { get; set; } = string.Empty;
        public DateTime  InvoiceDate          { get; set; }
        public int       CustomerId           { get; set; }
        public string?   CustomerName         { get; set; }
        public string?   CustomerVatNo        { get; set; }
        public string?   BillingAddress       { get; set; }
        public int       CurrencyId           { get; set; }
        public string?   CurrencyShort        { get; set; }
        public string?   CurrencySymbol       { get; set; }
        public bool      IsBaseCurrency       { get; set; }
        public decimal   ExchangeRate         { get; set; }
        public DateTime? DueDate              { get; set; }
        public string?   JobId                { get; set; }
        public string?   JobTitle             { get; set; }
        public string?   LpoNo                { get; set; }
        public DateTime? LpoDate              { get; set; }
        public int?      ContactId            { get; set; }
        public string?   ContactName          { get; set; }
        public string?   ContactDesignation   { get; set; }
        public string?   ContactPhone         { get; set; }
        public string?   ContactEmail         { get; set; }
        public decimal   SubTotal             { get; set; }
        public decimal   TaxAmount            { get; set; }
        public decimal   TotalAmount          { get; set; }
        public string?   Notes                { get; set; }
        public string    Status               { get; set; } = "Draft";
        public int       Revision             { get; set; }
        public bool      IsActive             { get; set; } = true;
        public string    CreatedBy            { get; set; } = string.Empty;
        public string?   ModifiedBy           { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // Search-list computed
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int LineCount { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int DocumentCount { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int TotalRows { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Invoice Line
    // ────────────────────────────────────────────────────────────
    public class InvoiceLine
    {
        public int       InvoiceLineId { get; set; }
        public int       InvoiceId     { get; set; }
        public int       LineNum       { get; set; }
        public string    Description   { get; set; } = string.Empty;
        public string?   UomName       { get; set; }
        public decimal   UnitPrice     { get; set; }
        public decimal   Qty           { get; set; }
        public decimal   Amount        { get; set; }
        public decimal   VatPercent    { get; set; }
        public decimal   TaxAmount     { get; set; }
        public string?   Notes         { get; set; }
        public string    CreatedBy     { get; set; } = string.Empty;
        public string?   ModifiedBy    { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Currency dropdown item
    // ────────────────────────────────────────────────────────────
    public class CurrencyItem
    {
        public int     CurrencyId      { get; set; }
        public string  CurrencyName    { get; set; } = string.Empty;
        public string  ShortName       { get; set; } = string.Empty;
        public string  Symbol          { get; set; } = string.Empty;
        public decimal ExchangeRate    { get; set; }
        public bool    IsBaseCurrency  { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Customer-for-invoice (from sp_GetCustomerForInvoice)
    // ────────────────────────────────────────────────────────────
    public class CustomerForInvoice
    {
        public int     CustomerId      { get; set; }
        public string  CustomerName    { get; set; } = string.Empty;
        public string? VatNumber       { get; set; }
        public int     CurrencyId      { get; set; }
        public string? CurrencyShort   { get; set; }
        public string? CurrencySymbol  { get; set; }
        public int?    CreditDays      { get; set; }
        public string? Phone           { get; set; }
        public string? Email           { get; set; }
    }

    public class CustomerAddressItem
    {
        public int     CustomerAddressId { get; set; }
        public string? AddressType       { get; set; }
        public bool    IsDefault         { get; set; }
        public string  FullAddress       { get; set; } = string.Empty;
    }

    public class CustomerContactItem
    {
        public int     CustomerContactId { get; set; }
        public string  ContactName       { get; set; } = string.Empty;
        public string? Designation       { get; set; }
        public string? Phone             { get; set; }
        public string? Mobile            { get; set; }
        public string? Email             { get; set; }
        public bool    IsPrimary         { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Save request models  ([FromBody])
    // ────────────────────────────────────────────────────────────
    public class SaveInvoiceRequest
    {
        public int       InvoiceId      { get; set; }
        public DateTime? InvoiceDate    { get; set; }
        public int       CustomerId     { get; set; }
        public string?   BillingAddress { get; set; }
        public int       CurrencyId     { get; set; }
        public decimal?  ExchangeRate   { get; set; }   // null = auto-resolve to 1 for base currency
        public DateTime? DueDate        { get; set; }
        public string?   JobId          { get; set; }
        public string?   LpoNo          { get; set; }
        public DateTime? LpoDate        { get; set; }
        public int?      ContactId      { get; set; }
        public string?   Notes          { get; set; }
        public string?   CreatedBy      { get; set; }
        public string?   ModifiedBy     { get; set; }
    }

    public class SaveInvoiceLineRequest
    {
        public int      InvoiceLineId { get; set; }
        public int      InvoiceId     { get; set; }
        public int      LineNum       { get; set; }
        public string   Description   { get; set; } = string.Empty;
        public string?  UomName       { get; set; }
        public decimal  UnitPrice     { get; set; }
        public decimal  Qty           { get; set; }
        public decimal  VatPercent    { get; set; }
        public string?  Notes         { get; set; }
        public string?  CreatedBy     { get; set; }
        public string?  ModifiedBy    { get; set; }
    }

    public class ConfirmInvoiceRequest
    {
        public string? ModifiedBy { get; set; }
    }

    public class CopyInvoiceRequest
    {
        public DateTime? NewInvoiceDate { get; set; }
        public DateTime? NewDueDate     { get; set; }
        public string?   CreatedBy      { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Invoice Payment — a Receipt Voucher allocation applied to the invoice
    // AllocatedAmount is in the invoice's currency.
    // ────────────────────────────────────────────────────────────
    public class InvoicePayment
    {
        public int       AllocationId    { get; set; }
        public string?   SourceType      { get; set; }   // 'RV' = Receipt Voucher, 'CN' = Credit Note
        public int       RvId            { get; set; }   // source document id (RvId or CnId per SourceType)
        public string?   RvNumber        { get; set; }
        public DateTime  RvDate          { get; set; }
        public string?   PaymentMode     { get; set; }
        public string?   ReferenceNo     { get; set; }
        public DateTime? ReferenceDate   { get; set; }
        public string?   BankName        { get; set; }
        public string?   RvStatus        { get; set; }
        public string?   RvCurrency      { get; set; }
        public decimal   RvExchangeRate  { get; set; }
        public decimal   AllocatedAmount { get; set; }
        public string?   CreatedBy       { get; set; }
        public DateTime  CreatedDate     { get; set; }
        public string?   ModifiedBy      { get; set; }
        public DateTime? ModifiedDate    { get; set; }
    }
}
