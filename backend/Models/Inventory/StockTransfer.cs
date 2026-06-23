namespace ERPWEB.Models.Inventory
{
    public class StockTransfer
    {
        public int       TransferId      { get; set; }
        public string    TransferNo      { get; set; } = string.Empty;
        public DateTime  TransferDate    { get; set; }
        public string    Status          { get; set; } = "Draft";
        public string?   TransferReason  { get; set; }
        public string?   Notes           { get; set; }
        public bool      IsActive        { get; set; } = true;

        public string?   FromJobId       { get; set; }
        public string?   FromJobName     { get; set; }
        public string?   ToJobId         { get; set; }
        public string?   ToJobName       { get; set; }

        public int       LineCount       { get; set; }
        public string?   CreatedBy       { get; set; }
        public DateTime? CreatedDate     { get; set; }
        public string?   ModifiedBy      { get; set; }
        public DateTime? ModifiedDate    { get; set; }

        public int       TotalRows       { get; set; }
    }

    public class StockTransferLine
    {
        public int      TransferLineId { get; set; }
        public int      TransferId     { get; set; }
        public int      LineNum        { get; set; }
        public int      ItemId         { get; set; }
        public string?  ItemCode       { get; set; }
        public string?  ItemName       { get; set; }
        public decimal  Qty            { get; set; }
        public decimal  AvailableQty   { get; set; }
        public int?     UomId          { get; set; }
        public string?  UomCode        { get; set; }
        public string?  UomName        { get; set; }
        public decimal  UnitCost       { get; set; }
        public decimal  LineValue      { get; set; }
        public string?  Notes          { get; set; }
    }

    public class SaveTransferRequest
    {
        public int       TransferId      { get; set; }
        public DateTime? TransferDate    { get; set; }
        public string?   FromJobId       { get; set; }
        public string?   ToJobId         { get; set; }
        public string?   TransferReason  { get; set; }
        public string?   Notes           { get; set; }
        public string?   CreatedBy       { get; set; }
        public string?   ModifiedBy      { get; set; }
    }

    public class SaveTransferLineRequest
    {
        public int      TransferLineId { get; set; }
        public int      TransferId     { get; set; }
        public int      ItemId         { get; set; }
        public decimal  Qty            { get; set; }
        public int?     UomId          { get; set; }
        public decimal  UnitCost       { get; set; }
        public string?  Notes          { get; set; }
        public string?  CreatedBy      { get; set; }
        public string?  ModifiedBy     { get; set; }
    }

    public class ConfirmRequest
    {
        public string? ModifiedBy { get; set; }
    }
}
