using System.Text.Json.Serialization;

namespace ERPWEB.Models.Finance
{
    public class PaymentVoucher
    {
        public int       PvId              { get; set; }
        public string    PvNumber          { get; set; } = string.Empty;
        public DateTime  PvDate            { get; set; }
        public int       SupplierId        { get; set; }
        public string?   SupplierName      { get; set; }
        public int?      CurrencyId        { get; set; }
        public string?   CurrencyShort     { get; set; }
        public decimal   ExchangeRate      { get; set; } = 1;
        public decimal   AmountPaid        { get; set; }
        public decimal   AllocatedAmount   { get; set; }
        public decimal   UnallocatedAmount { get; set; }
        public string?   PaymentMode       { get; set; }
        public string?   ReferenceNo       { get; set; }
        public DateTime? ReferenceDate     { get; set; }
        public string?   BankName          { get; set; }
        public string?   Notes             { get; set; }
        public string    Status            { get; set; } = "Draft";
        public string?   PostedBy          { get; set; }
        public DateTime? PostedDate        { get; set; }
        public string?   CreatedBy         { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate       { get; set; }
        public string?   ModifiedBy        { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate      { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int       TotalRows         { get; set; }
    }

    public class PaymentVoucherAllocation
    {
        public int       AllocationId      { get; set; }
        public int       PvId              { get; set; }
        public int       SupplierInvoiceId { get; set; }
        public string?   InvoiceNo         { get; set; }
        public DateTime? InvoiceDate       { get; set; }
        public string?   SupplierInvRef    { get; set; }
        public string?   InvoiceCurrencyShort   { get; set; }
        public string?   PvCurrencyShort        { get; set; }
        public decimal   InvoiceTotal           { get; set; }
        public decimal   AllocatedAmount        { get; set; }
        public decimal   AllocatedAmountPvCcy   { get; set; }
        public decimal   AllocatedAmountBase    { get; set; }
        // NEW: the PO this allocation is tagged to (nullable for legacy rows).
        // PoNumber + JobId come from the LEFT JOIN; SiCoversPoNumbers is the
        // CSV summary used to label untagged historical rows in the UI.
        public int?      PoId              { get; set; }
        public string?   PoNumber          { get; set; }
        public string?   JobId             { get; set; }
        public string?   SiCoversPoNumbers { get; set; }
        public string?   Reason            { get; set; }
        public decimal   PaidByOthers      { get; set; }
        public decimal   Outstanding       { get; set; }
        public string?   CreatedBy         { get; set; }
        public DateTime  CreatedDate       { get; set; }
        public string?   ModifiedBy        { get; set; }
        public DateTime? ModifiedDate      { get; set; }
    }

    public class SupplierOpenInvoice
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
        public decimal   ThisPvAllocated   { get; set; }
        public string?   PoNumbers         { get; set; }
        public string?   JobIds            { get; set; }
    }

    public class PvAllocationHistory
    {
        public int       AllocationId    { get; set; }
        public int       PvId            { get; set; }
        public string    PvNumber        { get; set; } = string.Empty;
        public DateTime  PvDate          { get; set; }
        public string?   PvStatus        { get; set; }
        public decimal   AllocatedAmount { get; set; }
        public string?   Reason          { get; set; }
        public bool      IsActive        { get; set; }
        public string?   CreatedBy       { get; set; }
        public DateTime  CreatedDate     { get; set; }
        public string?   ModifiedBy      { get; set; }
        public DateTime? ModifiedDate    { get; set; }
    }

    // ── Request DTOs ──────────────────────────────────────────────────────────
    public class SavePaymentVoucherRequest
    {
        public int       PvId          { get; set; }
        public DateTime? PvDate        { get; set; }
        public int       SupplierId    { get; set; }
        public int       CurrencyId    { get; set; }
        public decimal   ExchangeRate  { get; set; } = 1;
        public decimal   AmountPaid    { get; set; }
        public string?   PaymentMode   { get; set; }
        public string?   ReferenceNo   { get; set; }
        public DateTime? ReferenceDate { get; set; }
        public string?   BankName      { get; set; }
        public string?   Notes         { get; set; }
        public string?   CreatedBy     { get; set; }
        public string?   ModifiedBy    { get; set; }
    }

    public class SavePvAllocationRequest
    {
        public int     AllocationId      { get; set; }
        public int     PvId              { get; set; }
        public int     SupplierInvoiceId { get; set; }
        public decimal AllocatedAmount   { get; set; }
        // Optional PoId that ties the allocation to a specific PO covered by
        // the supplier invoice. Required by UI for new allocations; legacy
        // rows may carry NULL and fall back to the prorate calculation.
        public int?    PoId              { get; set; }
        public string? CreatedBy         { get; set; }
        public string? ModifiedBy        { get; set; }
        public string? Reason            { get; set; }
        public string? Password          { get; set; }
    }

    public class DeletePvAllocationRequest
    {
        public string? ModifiedBy { get; set; }
        public string? Reason     { get; set; }
        public string? Password   { get; set; }
    }

    public class RevisePvRequest
    {
        public string? Reason    { get; set; }
        public string? Password  { get; set; }
        public string? RevisedBy { get; set; }
    }

    public class CancelPvRequest
    {
        public string? Reason      { get; set; }
        public string? Password    { get; set; }
        public string? CancelledBy { get; set; }
    }
}
