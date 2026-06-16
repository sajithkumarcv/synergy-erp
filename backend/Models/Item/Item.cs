namespace ERPWEB.Models.Item
{
    public class Item
    {
        public int     ItemId            { get; set; }
        public string? ItemCode          { get; set; }
        public string  ItemName          { get; set; } = string.Empty;
        public string? ItemNameAr        { get; set; }
        public string? ShortDescription  { get; set; }
        public int?    CategoryId        { get; set; }
        public string? CategoryName      { get; set; }
        public int?    ItemTypeId        { get; set; }
        public string? ItemTypeName      { get; set; }
        public int?    BaseUomId         { get; set; }
        public string? BaseUomName       { get; set; }
        public int?    PurchaseUomId     { get; set; }
        public string? PurchaseUomName   { get; set; }
        public int?    SalesUomId        { get; set; }
        public string? SalesUomName      { get; set; }
        public string? Barcode           { get; set; }
        public string? HSCode            { get; set; }
        public bool    IsStockable       { get; set; }
        public bool?   IsSaleable        { get; set; }
        public bool?   IsPurchasable     { get; set; }
        public bool    IsActive          { get; set; } = true;
        public string? CreatedBy         { get; set; }
        public DateTime? CreatedDate     { get; set; }
        public string? ModifiedBy        { get; set; }
        public DateTime? ModifiedDate    { get; set; }
        public int     TotalRows         { get; set; }
    }

    public class ItemDetail
    {
        public int      ItemDetailId        { get; set; }
        public int      ItemId              { get; set; }
        public string?  SKUCode             { get; set; }
        public int?     CountryOfOriginId   { get; set; }
        public string?  CountryName         { get; set; }
        public string?  Brand               { get; set; }
        public string?  Model               { get; set; }
        public string?  Colour              { get; set; }
        public string?  Size                { get; set; }
        public string?  Grade               { get; set; }
        public string?  SupplierPartNo      { get; set; }
        public string?  ManufacturerPartNo  { get; set; }
        public decimal? StandardCost        { get; set; }
        public decimal? ListPrice           { get; set; }
        public decimal? Weight              { get; set; }
        public string?  WeightUom           { get; set; }
        public int?     LeadTimeDays        { get; set; }
        public int?     ShelfLifeDays       { get; set; }
        public decimal? MinStockLevel       { get; set; }
        public decimal? MaxStockLevel       { get; set; }
        public decimal? ReorderLevel        { get; set; }
        public bool?    IsDefault           { get; set; }
        public bool?    IsActive            { get; set; }
        public string?  CreatedBy           { get; set; }
        public string?  ModifiedBy          { get; set; }
    }

    public class ItemSpec
    {
        public int     SpecId      { get; set; }
        public int     ItemId      { get; set; }
        public string  SpecName    { get; set; } = string.Empty;
        public string? SpecValue   { get; set; }
        public string? SpecUnit    { get; set; }
        public int?    SortOrder   { get; set; }
        public string? CreatedBy   { get; set; }
        public string? ModifiedBy  { get; set; }
    }

    public class ItemUomConversion
    {
        public int     ConversionId      { get; set; }
        public int     ItemId            { get; set; }
        public int     FromUomId         { get; set; }
        public string? FromUomCode       { get; set; }
        public string? FromUomName       { get; set; }
        public int     ToUomId           { get; set; }
        public string? ToUomCode         { get; set; }
        public string? ToUomName         { get; set; }
        public decimal ConversionFactor  { get; set; }
        public bool?   IsActive          { get; set; }
        public string? CreatedBy         { get; set; }
        public string? ModifiedBy        { get; set; }
    }

    public class ItemType
    {
        public int     ItemTypeId   { get; set; }
        public string  TypeCode     { get; set; } = string.Empty;
        public string  TypeName     { get; set; } = string.Empty;
        public bool?   IsStockable  { get; set; }
        public bool?   IsService    { get; set; }
        public bool?   IsAsset      { get; set; }
        public int?    SortOrder    { get; set; }
    }

    public class ItemCategory
    {
        public int     CategoryId       { get; set; }
        public int?    ParentCategoryId { get; set; }
        public byte    Level            { get; set; }
        public string? CategoryCode     { get; set; }
        public string  CategoryName     { get; set; } = string.Empty;
        public string? Description      { get; set; }
        public int?    SortOrder        { get; set; }
        public bool    IsActive         { get; set; }
    }

    public class ItemUom
    {
        public int     UomId     { get; set; }
        public string  UomCode   { get; set; } = string.Empty;
        public string  UomName   { get; set; } = string.Empty;
        public string? UomType   { get; set; }
        public bool?   IsActive  { get; set; }
    }

    // ── Import DTO ────────────────────────────────────────────────
    public class ItemImportRow
    {
        public string? ItemCode         { get; set; }
        public string? ItemName         { get; set; }
        public string? ItemNameAr       { get; set; }
        public string? ShortDescription { get; set; }
        public string? CategoryName     { get; set; }
        public string? ItemTypeName     { get; set; }
        public string? BaseUom          { get; set; }
        public string? PurchaseUom      { get; set; }
        public string? SalesUom         { get; set; }
        public string? Barcode          { get; set; }
        public string? HSCode           { get; set; }
        public string? IsStockable      { get; set; }
        public string? IsSaleable       { get; set; }
        public string? IsPurchasable    { get; set; }
        public string? IsActive         { get; set; }
    }

    public class ItemImportRequest
    {
        public List<ItemImportRow> Rows   { get; set; } = new();
        public string?             ImportedBy { get; set; }
    }

    public class ItemImportRowResult
    {
        public int     RowNumber { get; set; }
        public string? ItemCode  { get; set; }
        public string? ItemName  { get; set; }
        public bool    Success   { get; set; }
        public int?    ItemId    { get; set; }
        public string? Message   { get; set; }
    }
}
