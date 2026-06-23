namespace ERPWEB.Models.Finance
{
    public class DeliveryHeader
    {
        public int      DeliveryId        { get; set; }
        public string   DeliveryNo        { get; set; } = string.Empty;
        public DateTime DeliveryDate      { get; set; } = DateTime.Today;
        public int?     InvoiceId         { get; set; }
        public string?  InvoiceNo         { get; set; }
        public int      CustomerId        { get; set; }
        public string?  CustomerName      { get; set; }
        public string?  JobId             { get; set; }
        public string?  JobDescription    { get; set; }
        public string?  JobTitle          { get; set; }
        public string?  DeliveryAddress   { get; set; }
        public int?     ContactId             { get; set; }
        public string?  ContactName           { get; set; }
        public string?  ContactDesignation    { get; set; }
        public string?  ContactPhone          { get; set; }
        public string?  ContactMobile         { get; set; }
        public string?  ContactEmail          { get; set; }
        public string?  Consignee             { get; set; }
        public string?  ConsigneeAddress  { get; set; }
        public string?  ConsigneeLpoNo    { get; set; }
        public DateTime? ConsigneeLpoDate { get; set; }
        public string?  ConsigneeTrn      { get; set; }
        public string?  VehicleNo         { get; set; }
        public string?  DeliveredBy       { get; set; }
        public DateTime? DeliveredByDate  { get; set; }
        public string?  BuyerTrnNo        { get; set; }
        public string?  BuyerLpoNo        { get; set; }
        public DateTime? BuyerLpoDate     { get; set; }
        public string?  Notes             { get; set; }
        public string   Status            { get; set; } = "Draft";
        public string?  CreatedBy         { get; set; }
        public DateTime? CreatedDate      { get; set; }
        public string?  ModifiedBy        { get; set; }
        public DateTime? ModifiedDate     { get; set; }
        public int      DocumentCount     { get; set; }
        public int      TotalRows         { get; set; }
    }

    public class DeliveryLine
    {
        public int      DeliveryLineId  { get; set; }
        public int      DeliveryId      { get; set; }
        public int?     InvoiceLineId   { get; set; }
        public int      LineNum         { get; set; }
        public string   Description     { get; set; } = string.Empty;
        public string?  UomName         { get; set; }
        public decimal  Qty             { get; set; }
        public string?  Remarks         { get; set; }
    }

    public class InvoiceForDelivery
    {
        public int      InvoiceId    { get; set; }
        public string   InvoiceNo    { get; set; } = string.Empty;
        public DateTime InvoiceDate  { get; set; }
        public string?  JobId        { get; set; }
        public string?  LpoNo        { get; set; }
        public decimal? TotalAmount  { get; set; }
        public string   Status       { get; set; } = string.Empty;
    }

    public class JobForDelivery
    {
        public string    JobId       { get; set; } = string.Empty;
        public string?   ProjectName { get; set; }
        public DateTime? JobDate     { get; set; }
    }

    public class InvoiceLineForDelivery
    {
        public int      InvoiceLineId        { get; set; }
        public int      InvoiceId            { get; set; }
        public string?  InvoiceNo            { get; set; }
        public int      LineNum              { get; set; }
        public string   Description          { get; set; } = string.Empty;
        public string?  UomName              { get; set; }
        public decimal  InvoiceQty           { get; set; }
        public decimal  AlreadyDeliveredQty  { get; set; }
        public decimal  PendingQty           { get; set; }
        public decimal  UnitPrice            { get; set; }
        public decimal  VatPercent           { get; set; }
    }

    public class ChangeDeliveryStatusRequest
    {
        public int    DeliveryId { get; set; }
        public string NewStatus  { get; set; } = string.Empty;
    }
}
