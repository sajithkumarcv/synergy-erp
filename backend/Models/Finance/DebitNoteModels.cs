using System.Text.Json.Serialization;

namespace ERPWEB.Models.Finance
{
    public class DebitNote
    {
        public int       DnId              { get; set; }
        public string    DnNumber          { get; set; } = string.Empty;
        public DateTime  DnDate            { get; set; }
        public int       SupplierId        { get; set; }
        public string?   SupplierName      { get; set; }
        public string?   SupplierCode      { get; set; }
        public int?      CurrencyId        { get; set; }
        public string?   CurrencyShort     { get; set; }
        public decimal   ExchangeRate      { get; set; } = 1;
        public decimal   DebitAmount       { get; set; }
        public decimal   AllocatedAmount   { get; set; }
        public decimal   UnallocatedAmount { get; set; }
        public string?   DebitType         { get; set; }
        public string?   Reason            { get; set; }
        public string?   Notes             { get; set; }
        public string    Status            { get; set; } = "Draft";
        public string?   ReviseReason      { get; set; }
        public string?   RevisedBy         { get; set; }
        public DateTime? RevisedDate       { get; set; }
        public string?   CancelReason      { get; set; }
        public string?   CancelledBy       { get; set; }
        public DateTime? CancelledDate     { get; set; }
        public string?   CreatedBy         { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate       { get; set; }
        public string?   ModifiedBy        { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate      { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int       TotalRows         { get; set; }
    }

    public class DebitNoteAllocation
    {
        public int       AllocationId      { get; set; }
        public int       DnId              { get; set; }
        public int       SupplierInvoiceId { get; set; }
        public string?   InvoiceNo         { get; set; }
        public DateTime? InvoiceDate       { get; set; }
        public string?   SupplierInvRef    { get; set; }
        public string?   JobId                  { get; set; }
        public string?   InvoiceCurrencyShort   { get; set; }
        public string?   DnCurrencyShort        { get; set; }
        public decimal   InvoiceTotal           { get; set; }
        public decimal   AllocatedAmount        { get; set; }
        public decimal   AllocatedAmountDnCcy   { get; set; }
        public decimal   AllocatedAmountBase    { get; set; }
        public string?   Reason                 { get; set; }
        public decimal   PaidByOthers      { get; set; }
        public decimal   Outstanding       { get; set; }
        public string?   CreatedBy         { get; set; }
        public DateTime  CreatedDate       { get; set; }
        public string?   ModifiedBy        { get; set; }
        public DateTime? ModifiedDate      { get; set; }
    }

    public class DnOpenInvoice
    {
        public int       SupplierInvoiceId { get; set; }
        public string    InvoiceNo         { get; set; } = string.Empty;
        public DateTime  InvoiceDate       { get; set; }
        public DateTime? DueDate           { get; set; }
        public string?   SupplierInvRef    { get; set; }
        public int?      CurrencyId        { get; set; }
        public string?   CurrencyShort     { get; set; }
        public decimal   TotalAmount       { get; set; }
        public decimal   PaidAmount        { get; set; }
        public decimal   Outstanding       { get; set; }
        public decimal   ThisDnAllocated   { get; set; }
        public string?   PoNumbers         { get; set; }
        public string?   JobIds            { get; set; }
    }

    // ── Request DTOs ──────────────────────────────────────────────────────────
    public class SaveDebitNoteRequest
    {
        public int       DnId         { get; set; }
        public DateTime? DnDate       { get; set; }
        public int       SupplierId   { get; set; }
        public int       CurrencyId   { get; set; }
        public decimal   ExchangeRate { get; set; } = 1;
        public decimal   DebitAmount  { get; set; }
        public string?   DebitType    { get; set; }
        public string?   Reason       { get; set; }
        public string?   Notes        { get; set; }
        public string?   CreatedBy    { get; set; }
        public string?   ModifiedBy   { get; set; }
    }

    public class SaveDnAllocationRequest
    {
        public int     AllocationId      { get; set; }
        public int     DnId              { get; set; }
        public int     SupplierInvoiceId { get; set; }
        public decimal AllocatedAmount   { get; set; }
        public string? CreatedBy         { get; set; }
        public string? ModifiedBy        { get; set; }
        public string? Reason            { get; set; }
        public string? Password          { get; set; }   // plaintext; hashed server-side
    }

    public class DeleteDnAllocationRequest
    {
        public string? ModifiedBy { get; set; }
        public string? Reason     { get; set; }
        public string? Password   { get; set; }   // plaintext; hashed server-side
    }

    public class ReviseDnRequest
    {
        public string? Reason    { get; set; }
        public string? Password  { get; set; }   // plaintext; hashed server-side
        public string? RevisedBy { get; set; }
    }

    public class CancelDnRequest
    {
        public string? Reason      { get; set; }
        public string? Password    { get; set; }   // plaintext; hashed server-side
        public string? CancelledBy { get; set; }
    }
}
