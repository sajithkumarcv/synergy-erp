namespace ERPWEB.Models.Procurement
{
    public class RtvHeader
    {
        public int      RtvId        { get; set; }
        public string   RtvNumber    { get; set; } = string.Empty;
        public DateTime RtvDate      { get; set; }
        public string   Status       { get; set; } = string.Empty;
        public int?     GrnId        { get; set; }
        public string?  GrnNumber    { get; set; }
        public int?     PoId         { get; set; }
        public string?  PoNumber     { get; set; }
        public int?     SupplierId   { get; set; }
        public string?  SupplierName { get; set; }
        public string?  SupplierCode { get; set; }
        public string?  JobId        { get; set; }
        public string?  ReturnReason { get; set; }
        public string?  Remarks      { get; set; }
        public decimal  TotalAmount  { get; set; }
        public int      LineCount    { get; set; }
        public string?  CreatedBy    { get; set; }
        public DateTime CreatedDate  { get; set; }
        public string?  ModifiedBy   { get; set; }
        public DateTime? ModifiedDate { get; set; }
        public int      TotalRows    { get; set; }
    }

    public class RtvLine
    {
        public int      RtvLineId    { get; set; }
        public int      RtvId        { get; set; }
        public int      LineNum      { get; set; }
        public int?     GrnDetailId  { get; set; }
        public int?     PoLineId     { get; set; }
        public int?     PrLineId     { get; set; }
        public int?     ItemId       { get; set; }
        public string?  ItemCode     { get; set; }
        public string?  ItemDesc     { get; set; }
        public decimal  ReturnQty    { get; set; }
        public int?     UomId        { get; set; }
        public string?  UomName      { get; set; }
        public decimal  UnitCost     { get; set; }
        public decimal  LineTotal    { get; set; }
        public string?  ReturnReason { get; set; }
        public string?  CreatedBy    { get; set; }
        public DateTime CreatedDate  { get; set; }
    }

    public class RtvPostRequest
    {
        public string PostedBy    { get; set; } = string.Empty;
        public string Reason      { get; set; } = string.Empty;
        public string Password    { get; set; } = string.Empty;
    }

    public class RtvSaveRequest
    {
        public int      RtvId        { get; set; }
        public DateTime RtvDate      { get; set; }
        public int?     GrnId        { get; set; }
        public int?     SupplierId   { get; set; }
        public int?     PoId         { get; set; }
        public string?  JobId        { get; set; }
        public string?  ReturnReason { get; set; }
        public string?  Remarks      { get; set; }
        public string?  CreatedBy    { get; set; }
        public string?  ModifiedBy   { get; set; }
    }

    public class RtvLineSaveRequest
    {
        public int      RtvLineId    { get; set; }
        public int      RtvId        { get; set; }
        public int?     GrnDetailId  { get; set; }
        public int?     PoLineId     { get; set; }
        public int?     PrLineId     { get; set; }
        public int?     ItemId       { get; set; }
        public string?  ItemCode     { get; set; }
        public string?  ItemDesc     { get; set; }
        public decimal  ReturnQty    { get; set; }
        public int?     UomId        { get; set; }
        public string?  UomName      { get; set; }
        public decimal  UnitCost     { get; set; }
        public string?  ReturnReason { get; set; }
        public string?  CreatedBy    { get; set; }
        public string?  ModifiedBy   { get; set; }
    }

    public class RtvGrnLine
    {
        public int      GrnDetailId  { get; set; }
        public int      LineNum      { get; set; }
        public int?     ItemId       { get; set; }
        public string?  ItemCode     { get; set; }
        public string?  ItemDesc     { get; set; }
        public decimal  AcceptedQty  { get; set; }
        public decimal  ReceivedQty  { get; set; }
        public decimal  RejectedQty  { get; set; }
        public int?     UomId        { get; set; }
        public string?  UomName      { get; set; }
        public decimal  UnitCost     { get; set; }
        public int?     PoLineId     { get; set; }
        public int?     PrLineId     { get; set; }
        public decimal  CurrentStock { get; set; }
    }
}
