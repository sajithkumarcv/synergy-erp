namespace ERPWEB.Models.Inventory
{
    public class StockAdjustment
    {
        public int       AdjustmentId   { get; set; }
        public string    AdjustmentNo   { get; set; } = string.Empty;
        public DateTime  AdjustmentDate { get; set; }
        public string?   Reason         { get; set; }
        public string?   Notes          { get; set; }
        public string    Status         { get; set; } = "Draft";
        public int       LineCount      { get; set; }
        public decimal   TotalValue     { get; set; }
        public string?   CreatedBy      { get; set; }
        public DateTime  CreatedDate    { get; set; }
        public string?   ModifiedBy     { get; set; }
        public DateTime? ModifiedDate   { get; set; }
        public string?   PostedBy       { get; set; }
        public DateTime? PostedDate     { get; set; }
        public int       TotalRows      { get; set; }
    }

    public class StockAdjustmentLine
    {
        public int       AdjustmentLineId { get; set; }
        public int       AdjustmentId     { get; set; }
        public int       LineNum          { get; set; }
        public int       ItemId           { get; set; }
        public string?   ItemCode         { get; set; }
        public string?   ItemDesc         { get; set; }
        public decimal   AdjustQty        { get; set; }   // signed
        public int?      UomId            { get; set; }
        public string?   UomName          { get; set; }
        public decimal   UnitCost         { get; set; }
        public decimal   LineValue        { get; set; }
        public string?   Direction        { get; set; }   // IN | OUT
        public string?   Reason           { get; set; }
        public string?   ReasonLabel      { get; set; }
        public string?   Notes            { get; set; }
        public decimal?  CurrentStock     { get; set; }
    }

    public class SaveAdjustmentRequest
    {
        public int       AdjustmentId   { get; set; }
        public DateTime? AdjustmentDate { get; set; }
        public string?   Reason         { get; set; }
        public string?   Notes          { get; set; }
        public string?   CreatedBy      { get; set; }
        public string?   ModifiedBy     { get; set; }
    }

    public class SaveAdjustmentLineRequest
    {
        public int      AdjustmentLineId { get; set; }
        public int      AdjustmentId     { get; set; }
        public int      ItemId           { get; set; }
        public string?  ItemDesc         { get; set; }
        public decimal  AdjustQty        { get; set; }
        public int?     UomId            { get; set; }
        public decimal  UnitCost         { get; set; }
        public string?  Reason           { get; set; }
        public string?  Notes            { get; set; }
        public string?  CreatedBy        { get; set; }
        public string?  ModifiedBy       { get; set; }
    }

    public class SubmitAdjustmentRequest
    {
        public string SubmittedBy { get; set; } = string.Empty;
    }
}
