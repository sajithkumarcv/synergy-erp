namespace ERPWEB.Models.Procurement
{
    // ── List / header ─────────────────────────────────────────────────────────
    public class SubcontractOrder
    {
        public int       SubcontractId      { get; set; }
        public string    SubcontractNo      { get; set; } = "";
        public string    SubcontractType    { get; set; } = "MATERIAL_OUT"; // MATERIAL_OUT | SERVICE_ONLY
        public string    Status             { get; set; } = "Draft";
        public int       VendorId           { get; set; }
        public string?   VendorName         { get; set; }
        public string?   VendorCode         { get; set; }
        public string?   JobId              { get; set; }
        public int?      BudgetHeaderId     { get; set; }
        public int       OutputItemId       { get; set; }
        public string?   OutputItemCode     { get; set; }
        public string?   OutputItemName     { get; set; }
        public decimal   OutputQty          { get; set; }
        public int?      OutputUomId        { get; set; }
        public string?   OutputUomName      { get; set; }
        public string?   ServiceDescription { get; set; }
        public DateTime? ExpectedDate       { get; set; }
        public string?   Remarks            { get; set; }
        public int?      PoId               { get; set; }
        public string?   PoNumber           { get; set; }
        public string?   CreatedBy          { get; set; }
        public DateTime? CreatedDate        { get; set; }
        public string?   ModifiedBy         { get; set; }
        public DateTime? ModifiedDate       { get; set; }
        // summary fields from sp_GetSubcontractOrder
        public int       TotalComponents    { get; set; }
        public int       TotalMaterialOuts  { get; set; }
        public int       TotalReceipts      { get; set; }
        public decimal   TotalReceivedQty   { get; set; }
        // list only
        public int       TotalRows          { get; set; }
    }

    public class SubcontractComponent
    {
        public int      ComponentId  { get; set; }
        public int      SubcontractId { get; set; }
        public int      ItemId       { get; set; }
        public string?  ItemCode     { get; set; }
        public string?  ItemName     { get; set; }
        public int?     UomId        { get; set; }
        public string?  UomName      { get; set; }
        public decimal  RequiredQty  { get; set; }
        public decimal  IssuedQty    { get; set; }
        public decimal  QtyOnHand    { get; set; }
    }

    // ── Save requests ─────────────────────────────────────────────────────────
    public class SaveSubcontractOrderRequest
    {
        public int?     SubcontractId      { get; set; }
        public string   SubcontractType    { get; set; } = "MATERIAL_OUT";
        public int      VendorId           { get; set; }
        public string?  JobId              { get; set; }
        public int?     BudgetHeaderId     { get; set; }
        public int      OutputItemId       { get; set; }
        public decimal  OutputQty          { get; set; }
        public int?     OutputUomId        { get; set; }
        public string?  ServiceDescription { get; set; }
        public DateTime? ExpectedDate      { get; set; }
        public string?  Remarks            { get; set; }
        public string?  ComponentsJson     { get; set; }
        public int?     PoId               { get; set; }
        public string   ActionBy           { get; set; } = "";
    }

    // ── Material Out ──────────────────────────────────────────────────────────
    public class MaterialOut
    {
        public int       MaterialOutId    { get; set; }
        public string    MaterialOutNo    { get; set; } = "";
        public int       SubcontractId    { get; set; }
        public string?   SubcontractNo    { get; set; }
        public int       VendorId         { get; set; }
        public string?   VendorName       { get; set; }
        public DateTime? OutDate          { get; set; }
        public string    Status           { get; set; } = "Draft";
        public string?   Notes            { get; set; }
        public string?   CreatedBy        { get; set; }
        public DateTime? CreatedDate      { get; set; }
        public string?   ModifiedBy       { get; set; }
        public DateTime? ModifiedDate     { get; set; }
    }

    public class MaterialOutLine
    {
        public int      MaterialOutLineId { get; set; }
        public int      MaterialOutId     { get; set; }
        public int      ComponentId       { get; set; }
        public int      ItemId            { get; set; }
        public string?  ItemCode          { get; set; }
        public string?  ItemName          { get; set; }
        public decimal  Qty               { get; set; }
        public int?     UomId             { get; set; }
        public string?  UomName           { get; set; }
        public string?  Remarks           { get; set; }
        public decimal  QtyOnHand         { get; set; }
        public decimal  RequiredQty       { get; set; }
        public decimal  IssuedQty         { get; set; }
    }

    public class SaveMaterialOutRequest
    {
        public int?     MaterialOutId  { get; set; }
        public int      SubcontractId  { get; set; }
        public DateTime? OutDate       { get; set; }
        public string?  Notes          { get; set; }
        public string?  LinesJson      { get; set; }
        public string   ActionBy       { get; set; } = "";
    }

    // ── Subcontract Receipt ───────────────────────────────────────────────────
    public class SubcontractReceipt
    {
        public int       SubcontractReceiptId { get; set; }
        public string    ReceiptNo            { get; set; } = "";
        public int       SubcontractId        { get; set; }
        public int       VendorId             { get; set; }
        public string?   VendorName           { get; set; }
        public DateTime? ReceiptDate          { get; set; }
        public decimal   ReceivedQty          { get; set; }
        public decimal   UnitCost             { get; set; }
        public string?   VendorRef            { get; set; }
        public string    Status               { get; set; } = "Draft";
        public string?   Notes                { get; set; }
        public string?   CreatedBy            { get; set; }
        public DateTime? CreatedDate          { get; set; }
        public string?   ModifiedBy           { get; set; }
        public DateTime? ModifiedDate         { get; set; }
    }

    public class SaveSubcontractReceiptRequest
    {
        public int?     SubcontractReceiptId { get; set; }
        public int      SubcontractId        { get; set; }
        public DateTime? ReceiptDate         { get; set; }
        public decimal  ReceivedQty          { get; set; }
        public decimal  UnitCost             { get; set; }
        public string?  VendorRef            { get; set; }
        public string?  Notes                { get; set; }
        public string   ActionBy             { get; set; } = "";
    }

    public class SubcontractStatusRequest
    {
        public string NewStatus { get; set; } = "";
        public string ActionBy  { get; set; } = "";
    }
}
