using System.Text.Json.Serialization;

namespace ERPWEB.Models.Inventory
{
    // ────────────────────────────────────────────────────────────
    // GRN (Goods Receipt Note / Stock Receipt)
    // ────────────────────────────────────────────────────────────
    public class StockReceipt
    {
        public int      ReceiptId    { get; set; }
        public string   ReceiptNo    { get; set; } = string.Empty;
        public DateTime ReceiptDate  { get; set; }
        public string   ReceiptType  { get; set; } = "STORE";   // "JOB" | "STORE"
        public string?  JobId        { get; set; }
        public int?     PoId         { get; set; }
        public string?  PoNumber     { get; set; }
        public int?     SupplierId   { get; set; }
        public string?  SupplierName { get; set; }
        public string?  SupplierRef  { get; set; }
        public string?  Notes        { get; set; }
        public string   Status       { get; set; } = "Draft";   // "Draft" | "Confirmed"
        public int?     GrnId        { get; set; }
        public bool     IsActive     { get; set; } = true;
        public string   CreatedBy    { get; set; } = string.Empty;
        public string?  ModifiedBy   { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // Computed (from sp_SearchStockReceipts)
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public decimal TotalCost  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int     LineCount  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int     TotalRows  { get; set; }
    }

    public class StockReceiptLine
    {
        public int      ReceiptLineId { get; set; }
        public int      ReceiptId     { get; set; }
        public int      LineNum       { get; set; }
        public int      ItemId        { get; set; }
        public string?  ItemCode      { get; set; }
        public string?  ItemName      { get; set; }
        public string?  ItemDesc      { get; set; }
        public decimal  Qty           { get; set; }
        public int?     UomId         { get; set; }
        public string?  UomName       { get; set; }
        public decimal  UnitCost      { get; set; }
        public decimal  TotalCost     { get; set; }
        public bool     IsJobStock    { get; set; }
        public string?  LineJobId     { get; set; }
        public string?  Notes         { get; set; }
        public string   CreatedBy     { get; set; } = string.Empty;
        public string?  ModifiedBy    { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Issue Note
    // ────────────────────────────────────────────────────────────
    public class StockIssue
    {
        public int      IssueId      { get; set; }
        public string   IssueNo      { get; set; } = string.Empty;
        public DateTime IssueDate    { get; set; }
        public string   JobId        { get; set; } = string.Empty;
        public string   CostingType  { get; set; } = "INC_COSTING";  // "INC_COSTING" | "EXC_COSTING"
        public string?  IssuedTo     { get; set; }
        public string?  Notes        { get; set; }
        public string   Status       { get; set; } = "Draft";
        public bool     IsActive     { get; set; } = true;
        public string   CreatedBy    { get; set; } = string.Empty;
        public string?   ModifiedBy   { get; set; }
        public DateTime? PostedDate   { get; set; }
        // Joined from VW_JOB
        public string?  CustomerName { get; set; }
        public string?  ProjectName  { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // Computed
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public decimal TotalCost  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int     LineCount  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int     TotalRows  { get; set; }
    }

    public class StockIssueLine
    {
        public int      IssueLineId { get; set; }
        public int      IssueId     { get; set; }
        public int      LineNum     { get; set; }
        public int      ItemId      { get; set; }
        public string?  ItemCode    { get; set; }
        public string?  ItemName    { get; set; }
        public string?  ItemDesc    { get; set; }
        public decimal  Qty         { get; set; }
        public int?     UomId       { get; set; }
        public string?  UomName     { get; set; }
        public decimal  UnitCost    { get; set; }
        public decimal  TotalCost   { get; set; }
        public string?  Notes       { get; set; }
        public string   CreatedBy   { get; set; } = string.Empty;
        public string?  ModifiedBy  { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Stock Balance
    // ────────────────────────────────────────────────────────────
    public class StockBalance
    {
        public int?     BalanceId      { get; set; }   // null when item has no balance record
        public int      ItemId         { get; set; }
        public string?  ItemCode       { get; set; }
        public string?  ItemName       { get; set; }
        public string?  CategoryName   { get; set; }
        public string?  ItemTypeName   { get; set; }
        public string?  BaseUom        { get; set; }
        public decimal  QtyOnHand      { get; set; }
        public decimal  QtyJobStock    { get; set; }
        public decimal  QtyStoreStock  { get; set; }
        public decimal  AvgUnitCost    { get; set; }
        public decimal  StockValue     { get; set; }
        public DateTime? LastReceiptDate { get; set; }
        public DateTime? LastIssueDate   { get; set; }
        public DateTime? UpdatedDate     { get; set; }  // null when item has no balance record
    }

    public class JobStockBreakdown
    {
        public string?  JobId         { get; set; }
        public decimal  TotalReceived { get; set; }
        public decimal  TotalIssued   { get; set; }
        public decimal  QtyBalance    { get; set; }
        public decimal  LastUnitCost  { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Stock by Job — one row per job holding job-direct stock
    // ────────────────────────────────────────────────────────────
    public class StockByJobRow
    {
        public string  JobId          { get; set; } = string.Empty;
        public string? ProjectName    { get; set; }
        public string? JobDescription { get; set; }
        public string? JobTypeId      { get; set; }
        public string? JobTypeName    { get; set; }
        public int?    CustomerId     { get; set; }
        public string? CustomerName   { get; set; }
        public int?    JobStatusId    { get; set; }
        public string? JobStatusName  { get; set; }
        public int     ItemCount      { get; set; }
        public decimal TotalQty       { get; set; }
        public decimal TotalValue     { get; set; }
    }

    // Item-level job stock (drill-down under one job in the Stock-by-Job page)
    public class JobStockLine
    {
        public int      ItemId           { get; set; }
        public string   ItemCode         { get; set; } = string.Empty;
        public string   ItemName         { get; set; } = string.Empty;
        public string?  CategoryName     { get; set; }
        public string?  BaseUom          { get; set; }
        public decimal  QtyBalance       { get; set; }
        public decimal  AvgUnitCost      { get; set; }
        public decimal  StockValue       { get; set; }
        public DateTime? LastMovementDate { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Stock Ledger
    // ────────────────────────────────────────────────────────────
    public class StockLedger
    {
        public int      LedgerId   { get; set; }
        public int      ItemId     { get; set; }
        public DateTime TransDate  { get; set; }
        public string   TransType  { get; set; } = string.Empty;   // "RECEIPT" | "ISSUE"
        public int      RefId      { get; set; }
        public string   RefNo      { get; set; } = string.Empty;
        public decimal  QtyIn      { get; set; }
        public decimal  QtyOut     { get; set; }
        public decimal  UnitCost   { get; set; }
        public decimal  LineValue  { get; set; }
        public bool     IsJobStock  { get; set; }
        public string?  JobId       { get; set; }
        public string?  CreatedBy   { get; set; }
        public decimal  TotalStock  { get; set; }
        public decimal  JobStock    { get; set; }
        public decimal  StoreStock  { get; set; }
        public int      TotalRows   { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Save request models (for controller [FromBody])
    // ────────────────────────────────────────────────────────────
    public class SaveReceiptRequest
    {
        public int      ReceiptId    { get; set; }
        public DateTime? ReceiptDate { get; set; }
        public string   ReceiptType  { get; set; } = "STORE";
        public string?  JobId        { get; set; }
        public int?     PoId         { get; set; }
        public string?  PoNumber     { get; set; }
        public int?     SupplierId   { get; set; }
        public string?  SupplierName { get; set; }
        public string?  SupplierRef  { get; set; }
        public string?  Notes        { get; set; }
        public string?  CreatedBy    { get; set; }
        public string?  ModifiedBy   { get; set; }
    }

    public class SaveReceiptLineRequest
    {
        public int      ReceiptLineId { get; set; }
        public int      ReceiptId     { get; set; }
        public int      LineNum       { get; set; }
        public int      ItemId        { get; set; }
        public string?  ItemDesc      { get; set; }
        public decimal  Qty           { get; set; }
        public int?     UomId         { get; set; }
        public decimal  UnitCost      { get; set; }
        public bool     IsJobStock    { get; set; }
        public string?  JobId         { get; set; }
        public string?  Notes         { get; set; }
        public string?  CreatedBy     { get; set; }
        public string?  ModifiedBy    { get; set; }
    }

    public class IssueType
    {
        public int     IssueTypeId   { get; set; }
        public string  IssueTypeCode { get; set; } = string.Empty;
        public string  IssueTypeName { get; set; } = string.Empty;
        public string? Description   { get; set; }
        public int     SortOrder     { get; set; }
    }

    // Item with available job-stock qty (for EXC_COSTING item picker)
    public class JobStockItem
    {
        public int      ItemId       { get; set; }
        public string?  ItemCode     { get; set; }
        public string?  ItemName     { get; set; }
        public int?     BaseUomId    { get; set; }
        public decimal  AvailableQty { get; set; }
        public decimal  LastCost     { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Stock Alerts
    // ────────────────────────────────────────────────────────────
    public class StockAlert
    {
        public int      ItemId         { get; set; }
        public string?  ItemCode       { get; set; }
        public string?  ItemName       { get; set; }
        public string?  CategoryName   { get; set; }
        public string?  ItemTypeName   { get; set; }
        public string?  BaseUom        { get; set; }
        public decimal  QtyOnHand      { get; set; }
        public decimal  MinStockLevel  { get; set; }
        public decimal  ReorderLevel   { get; set; }
        public decimal  MaxStockLevel  { get; set; }
        public int      LeadTimeDays   { get; set; }
        public decimal  Shortage       { get; set; }
        public string   AlertType      { get; set; } = string.Empty;
        public DateTime? LastReceiptDate { get; set; }
    }

    // Stock availability result
    public class StockAvailability
    {
        public int      ItemId       { get; set; }
        public string?  JobId        { get; set; }
        public string?  CostingType  { get; set; }
        public decimal  AvailableQty { get; set; }
        public decimal  JobStock     { get; set; }
        public decimal  StoreStock   { get; set; }
    }

    public class SaveIssueRequest
    {
        public int      IssueId      { get; set; }
        public DateTime? IssueDate   { get; set; }
        public string?  JobId        { get; set; }
        public string   CostingType  { get; set; } = "INC_COSTING";
        public string?  IssuedTo     { get; set; }
        public string?  Notes        { get; set; }
        public string?  CreatedBy    { get; set; }
        public string?  ModifiedBy   { get; set; }
    }

    public class SaveIssueLineRequest
    {
        public int      IssueLineId { get; set; }
        public int      IssueId     { get; set; }
        public int      LineNum     { get; set; }
        public int      ItemId      { get; set; }
        public string?  ItemDesc    { get; set; }
        public decimal  Qty         { get; set; }
        public int?     UomId       { get; set; }
        public decimal  UnitCost    { get; set; }
        public string?  Notes       { get; set; }
        public string?  CreatedBy   { get; set; }
        public string?  ModifiedBy  { get; set; }
    }

    // ────────────────────────────────────────────────────────────
    // Issue Return Note
    // ────────────────────────────────────────────────────────────
    public class StockIssueReturn
    {
        public int      ReturnId     { get; set; }
        public string   ReturnNo     { get; set; } = string.Empty;
        public DateTime ReturnDate   { get; set; }
        public int      IssueId      { get; set; }
        public string?  IssueNo      { get; set; }
        public string?  JobId        { get; set; }
        public string?  CostingType  { get; set; }
        public string?  IssuedTo     { get; set; }
        public string?  ReturnedBy   { get; set; }
        public string?  Notes        { get; set; }
        public string   Status       { get; set; } = "Draft";
        public bool      IsActive     { get; set; } = true;
        public string    CreatedBy    { get; set; } = string.Empty;
        public DateTime? PostedDate   { get; set; }

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime  CreatedDate  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime? ModifiedDate { get; set; }

        // Computed
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public decimal TotalCost  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int     LineCount  { get; set; }
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public int     TotalRows  { get; set; }
    }

    public class StockIssueReturnLine
    {
        public int      ReturnLineId { get; set; }
        public int      ReturnId     { get; set; }
        public int      IssueLineId  { get; set; }
        public int      LineNum      { get; set; }
        public int      ItemId       { get; set; }
        public string?  ItemCode     { get; set; }
        public string?  ItemName     { get; set; }
        public string?  ItemDesc     { get; set; }
        public decimal  ReturnQty    { get; set; }
        public int?     UomId        { get; set; }
        public string?  UomName      { get; set; }
        public decimal  UnitCost     { get; set; }
        public decimal  TotalCost    { get; set; }
        public string?  Notes        { get; set; }
        public string   CreatedBy    { get; set; } = string.Empty;

        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)]
        public DateTime CreatedDate  { get; set; }
    }

    // Issue line with returnable qty info (for line picker)
    public class IssueLineForReturn
    {
        public int      IssueLineId          { get; set; }
        public int      IssueId              { get; set; }
        public int      LineNum              { get; set; }
        public int      ItemId               { get; set; }
        public string?  ItemCode             { get; set; }
        public string?  ItemName             { get; set; }
        public string?  ItemDesc             { get; set; }
        public decimal  IssuedQty            { get; set; }
        public int?     UomId                { get; set; }
        public string?  UomName              { get; set; }
        public decimal  UnitCost             { get; set; }
        public decimal  AlreadyReturnedQty   { get; set; }
        public decimal  AvailableToReturnQty { get; set; }
    }

    public class SaveIssueReturnRequest
    {
        public int      ReturnId    { get; set; }
        public int      IssueId     { get; set; }
        public DateTime? ReturnDate { get; set; }
        public string?  ReturnedBy  { get; set; }
        public string?  Notes       { get; set; }
        public string?  CreatedBy   { get; set; }
        public string?  ModifiedBy  { get; set; }
    }

    public class SaveIssueReturnLineRequest
    {
        public int      ReturnLineId { get; set; }
        public int      ReturnId     { get; set; }
        public int      IssueLineId  { get; set; }
        public int      LineNum      { get; set; }
        public string?  ItemDesc     { get; set; }
        public decimal  ReturnQty    { get; set; }
        public int?     UomId        { get; set; }
        public decimal  UnitCost     { get; set; }
        public string?  Notes        { get; set; }
        public string?  CreatedBy    { get; set; }
        public string?  ModifiedBy   { get; set; }
    }
}
