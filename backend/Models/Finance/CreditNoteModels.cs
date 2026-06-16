using System.Text.Json.Serialization;

namespace ERPWEB.Models.Finance
{
    public class CreditNote
    {
        public int       CnId              { get; set; }
        public string    CnNumber          { get; set; } = string.Empty;
        public DateTime  CnDate            { get; set; }
        public int       CustomerId        { get; set; }
        public string?   CustomerName      { get; set; }
        public string?   CustomerCode      { get; set; }
        public int?      CurrencyId        { get; set; }
        public string?   CurrencyShort     { get; set; }
        public decimal   ExchangeRate      { get; set; } = 1;
        public decimal   CreditAmount      { get; set; }
        public decimal   AllocatedAmount   { get; set; }
        public decimal   UnallocatedAmount { get; set; }
        public string?   CreditType        { get; set; }
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

    public class CreditNoteAllocation
    {
        public int       AllocationId    { get; set; }
        public int       CnId            { get; set; }
        public int       InvoiceId       { get; set; }
        public string?   InvoiceNo       { get; set; }
        public DateTime? InvoiceDate     { get; set; }
        public string?   JobId           { get; set; }
        public string?   CurrencyShort   { get; set; }
        public decimal   InvoiceTotal    { get; set; }
        public decimal   AllocatedAmount { get; set; }
        public string?   Reason          { get; set; }
        public decimal   PaidByOthers    { get; set; }
        public decimal   Outstanding     { get; set; }
        public string?   CreatedBy       { get; set; }
        public DateTime  CreatedDate     { get; set; }
        public string?   ModifiedBy      { get; set; }
        public DateTime? ModifiedDate    { get; set; }
    }

    public class CnOpenInvoice
    {
        public int       InvoiceId        { get; set; }
        public string    InvoiceNo        { get; set; } = string.Empty;
        public DateTime  InvoiceDate      { get; set; }
        public DateTime? DueDate          { get; set; }
        public string?   JobId            { get; set; }
        public int?      CurrencyId       { get; set; }
        public string?   CurrencyShort    { get; set; }
        public decimal   TotalAmount      { get; set; }
        public decimal   PaidAmount       { get; set; }
        public decimal   Outstanding      { get; set; }
        public decimal   ThisCnAllocated  { get; set; }
    }

    // ── Request DTOs ──────────────────────────────────────────────────────────
    public class SaveCreditNoteRequest
    {
        public int       CnId          { get; set; }
        public DateTime? CnDate        { get; set; }
        public int       CustomerId    { get; set; }
        public int       CurrencyId    { get; set; }
        public decimal   ExchangeRate  { get; set; } = 1;
        public decimal   CreditAmount  { get; set; }
        public string?   CreditType    { get; set; }
        public string?   Reason        { get; set; }
        public string?   Notes         { get; set; }
        public string?   CreatedBy     { get; set; }
        public string?   ModifiedBy    { get; set; }
    }

    public class SaveCnAllocationRequest
    {
        public int     AllocationId    { get; set; }
        public int     CnId            { get; set; }
        public int     InvoiceId       { get; set; }
        public decimal AllocatedAmount { get; set; }
        public string? CreatedBy       { get; set; }
        public string? ModifiedBy      { get; set; }
        public string? Reason          { get; set; }
        public string? Password        { get; set; }   // plaintext; hashed server-side
    }

    public class DeleteCnAllocationRequest
    {
        public string? ModifiedBy { get; set; }
        public string? Reason     { get; set; }
        public string? Password   { get; set; }   // plaintext; hashed server-side
    }

    public class ReviseCnRequest
    {
        public string? Reason     { get; set; }
        public string? Password   { get; set; }   // plaintext; hashed server-side
        public string? RevisedBy  { get; set; }
    }

    public class CancelCnRequest
    {
        public string? Reason      { get; set; }
        public string? Password    { get; set; }   // plaintext; hashed server-side
        public string? CancelledBy { get; set; }
    }
}
