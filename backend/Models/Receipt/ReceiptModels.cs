using System.Text.Json.Serialization;

namespace ERPWEB.Models.Receipt
{
    public class ReceiptVoucher
    {
        public int       RvId            { get; set; }
        public string    RvNumber        { get; set; } = string.Empty;
        public DateTime  RvDate          { get; set; }
        public int       CustomerId      { get; set; }
        public string?   CustomerName    { get; set; }
        public string?   CustomerCode    { get; set; }
        public int?      CurrencyId      { get; set; }
        public string?   CurrencyShort   { get; set; }
        public decimal   ExchangeRate    { get; set; } = 1;
        public decimal   AmountReceived  { get; set; }
        public decimal   AllocatedAmount { get; set; }
        public decimal   UnallocatedAmount { get; set; }
        public string?   PaymentMode     { get; set; }
        public string?   ReferenceNo     { get; set; }
        public DateTime? ReferenceDate   { get; set; }
        public string?   BankName        { get; set; }
        public string?   Notes           { get; set; }
        public string    Status          { get; set; } = "Draft";
        public string?   PostedBy        { get; set; }
        public DateTime? PostedDate      { get; set; }
        public string?   CreatedBy       { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate     { get; set; }
        public string?   ModifiedBy      { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate    { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int       TotalRows       { get; set; }
    }

    public class ReceiptVoucherAllocation
    {
        public int       AllocationId    { get; set; }
        public int       RvId            { get; set; }
        public int       InvoiceId       { get; set; }
        public string?   InvoiceNo       { get; set; }
        public DateTime? InvoiceDate     { get; set; }
        public string?   JobId           { get; set; }
        public decimal   InvoiceTotal            { get; set; }
        public decimal   AllocatedAmount         { get; set; }
        public decimal   AllocatedAmountBase     { get; set; }
        public decimal   AllocatedAmountRvCcy    { get; set; }
        public string?   InvoiceCurrencyShort    { get; set; }
        public string?   RvCurrencyShort         { get; set; }
        public string?   Reason                  { get; set; }
        public decimal   PaidByOthers            { get; set; }
        public decimal   Outstanding             { get; set; }
        // Audit
        public string?   CreatedBy       { get; set; }
        public DateTime  CreatedDate     { get; set; }
        public string?   ModifiedBy      { get; set; }
        public DateTime? ModifiedDate    { get; set; }
    }

    public class CustomerOpenInvoice
    {
        public int       InvoiceId       { get; set; }
        public string    InvoiceNo       { get; set; } = string.Empty;
        public DateTime  InvoiceDate     { get; set; }
        public DateTime? DueDate         { get; set; }
        public string?   JobId           { get; set; }
        public int?      CurrencyId      { get; set; }
        public string?   CurrencyShort   { get; set; }
        public decimal   TotalAmount     { get; set; }
        public decimal   PaidAmount      { get; set; }
        public decimal   Outstanding          { get; set; }
        public decimal   ThisRvAllocated      { get; set; }
        public decimal   CnPaid               { get; set; }
        public decimal   InvoiceExchangeRate  { get; set; }
    }

    public class InvoiceAllocationHistory
    {
        public int       AllocationId    { get; set; }
        public int       RvId            { get; set; }
        public string    RvNumber        { get; set; } = string.Empty;
        public DateTime  RvDate          { get; set; }
        public string?   RvStatus        { get; set; }
        public decimal   AllocatedAmount { get; set; }
        public string?   Reason          { get; set; }
        public bool      IsActive        { get; set; }
        public string?   CreatedBy       { get; set; }
        public DateTime  CreatedDate     { get; set; }
        public string?   ModifiedBy      { get; set; }
        public DateTime? ModifiedDate    { get; set; }
    }

    // ── Request DTOs ──────────────────────────────────────────────────────
    public class SaveReceiptVoucherRequest
    {
        public int       RvId           { get; set; }
        public DateTime? RvDate         { get; set; }
        public int       CustomerId     { get; set; }
        public int       CurrencyId     { get; set; }       // required — 0 is invalid
        public decimal   ExchangeRate   { get; set; } = 1;
        public decimal   AmountReceived { get; set; }
        public string?   PaymentMode    { get; set; }
        public string?   ReferenceNo    { get; set; }
        public DateTime? ReferenceDate  { get; set; }
        public string?   BankName       { get; set; }
        public string?   Notes          { get; set; }
        public string?   CreatedBy      { get; set; }
        public string?   ModifiedBy     { get; set; }
    }

    public class SaveAllocationRequest
    {
        public int     AllocationId    { get; set; }
        public int     RvId            { get; set; }
        public int     InvoiceId       { get; set; }
        public decimal AllocatedAmount { get; set; }
        public string? CreatedBy       { get; set; }
        public string? ModifiedBy      { get; set; }
        public string? Reason          { get; set; }
        public string? Password        { get; set; }   // plaintext; hashed server-side
    }

    public class DeleteAllocationRequest
    {
        public string? ModifiedBy { get; set; }
        public string? Reason     { get; set; }
        public string? Password   { get; set; }   // plaintext; hashed server-side
    }

    public class RvActionRequest
    {
        public string? ActionBy { get; set; }
    }

    public class ReviseRvRequest
    {
        public string? Reason     { get; set; }
        public string? Password   { get; set; }   // plaintext; hashed server-side
        public string? RevisedBy  { get; set; }
    }

    public class CancelRvRequest
    {
        public string? Reason      { get; set; }
        public string? Password    { get; set; }   // plaintext; hashed server-side
        public string? CancelledBy { get; set; }
    }
}
