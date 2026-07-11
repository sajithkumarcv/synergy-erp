using ERPWEB.Dbcontext;
using ERPWEB.Models.Item;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Item
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class ItemController : ControllerBase
    {
        private readonly DbCon _db;
        public ItemController(DbCon db) { _db = db; }

        // ── Lookups ───────────────────────────────────────────────
        [HttpGet("types")]
        public async Task<IActionResult> GetTypes()
        {
            try { return Ok(await _db.QueryAsync<ItemType>("sp_GetItemTypes", null)); }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "GetTypes", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching item types." });
            }
        }

        [HttpGet("categories")]
        public async Task<IActionResult> GetCategories()
        {
            try { return Ok(await _db.QueryAsync<ItemCategory>("sp_GetItemCategories", null)); }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "GetCategories", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching item categories." });
            }
        }

        [HttpGet("uoms")]
        public async Task<IActionResult> GetUoms()
        {
            try { return Ok(await _db.QueryAsync<ItemUom>("sp_GetItemUoms", null)); }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "GetUoms", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching UOMs." });
            }
        }

        // ── Minimal item list (id + code + name, for filter dropdowns) ──
        [HttpGet("list-minimal")]
        public async Task<IActionResult> GetListMinimal()
        {
            try { return Ok(await _db.QueryAsync<dynamic>("sp_GetItemsMinimal", null)); }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "GetListMinimal", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching item list." });
            }
        }

        // ── Item List / Search ────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText = null,
            [FromQuery] int?    categoryId = null,
            [FromQuery] int?    itemTypeId = null,
            [FromQuery] bool?   isActive   = null,
            [FromQuery] int?    budgetCategoryId = null,
            [FromQuery] bool?   isStockable = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "ItemName",
            [FromQuery] string  sortDir    = "ASC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    CategoryId    = categoryId,
                    ItemTypeId    = itemTypeId,
                    IsActive      = isActive,
                    BudgetCategoryId = budgetCategoryId,
                    IsStockable   = isStockable,
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 500 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                };
                var rows  = await _db.QueryAsync<Models.Item.Item>("sp_SearchItems", p);
                var list  = rows?.ToList() ?? new List<Models.Item.Item>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new { totalRows = total, page, pageSize, totalPages = (int)Math.Ceiling((double)total / pageSize), data = list });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching items." });
            }
        }

        // ── Get Single Item ───────────────────────────────────────
        // Direct single-row lookup via sp_GetItemById. The previous implementation
        // grabbed the first 500 search results and filtered in memory, which
        // broke detail-page navigation for any item past page 1 (and we have
        // ~3,500+ items).
        [HttpGet("{itemId:int}")]
        public async Task<IActionResult> GetItem(int itemId)
        {
            try
            {
                var item = await _db.QueryFirstOrDefaultAsync<Models.Item.Item>(
                    "sp_GetItemById", new { ItemId = itemId });
                if (item == null) return NotFound(new { message = "Item not found." });
                return Ok(item);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "GetItem", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching item." });
            }
        }

        // ── Save Item ─────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] Models.Item.Item model)
        {
            try
            {
                var p = new
                {
                    ItemId           = model.ItemId == 0 ? (int?)null : model.ItemId,
                    model.ItemCode, model.ItemName, model.ItemNameAr, model.ShortDescription,
                    model.CategoryId, model.ItemTypeId,
                    model.BaseUomId, model.PurchaseUomId, model.SalesUomId,
                    model.Barcode, model.HSCode,
                    model.IsStockable, model.IsSaleable, model.IsPurchasable, model.IsActive,
                    model.BudgetCategoryId,
                    model.CreatedBy, model.ModifiedBy
                };
                string result = await _db.ExecuteScalarAsync("sp_SetItem", p);
                return Ok(new { itemId = int.Parse(result), message = model.ItemId == 0 ? "Item created." : "Item updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving item." });
            }
        }

        // ── Import Items from Excel ───────────────────────────────
        [HttpPost("import")]
        public async Task<IActionResult> Import([FromBody] ItemImportRequest request)
        {
            try
            {
                // Load all lookup tables once
                var categories = (await _db.QueryAsync<ItemCategory>("sp_GetItemCategories", null)).ToList();
                var itemTypes  = (await _db.QueryAsync<ItemType>    ("sp_GetItemTypes",       null)).ToList();
                var uoms       = (await _db.QueryAsync<ItemUom>     ("sp_GetItemUoms",         null)).ToList();
                var budgetCats = (await _db.QueryAsync<dynamic>     ("sp_GetExpenseCategoryList")).ToList();

                // Build lookup maps. Each entity is resolvable by numeric Id, by
                // code, or by name — so an import cell may contain any of them
                // (e.g. Category: "Aluminium", "CAT-002" or "2").
                static Dictionary<string, int> ByKey<T>(IEnumerable<T> src, Func<T, string?> key, Func<T, int> id) =>
                    src.Where(x => !string.IsNullOrWhiteSpace(key(x)))
                       .GroupBy(x => key(x)!.Trim().ToLowerInvariant())
                       .ToDictionary(g => g.Key, g => id(g.First()));

                var catByName  = ByKey(categories, c => c.CategoryName, c => c.CategoryId);
                var catByCode  = ByKey(categories, c => c.CategoryCode, c => c.CategoryId);
                var catIds     = new HashSet<int>(categories.Select(c => c.CategoryId));

                var typeByName = ByKey(itemTypes, t => t.TypeName, t => t.ItemTypeId);
                var typeByCode = ByKey(itemTypes, t => t.TypeCode, t => t.ItemTypeId);
                var typeIds    = new HashSet<int>(itemTypes.Select(t => t.ItemTypeId));

                var uomByCode  = ByKey(uoms, u => u.UomCode, u => u.UomId);
                var uomByName  = ByKey(uoms, u => u.UomName, u => u.UomId);
                var uomIds     = new HashSet<int>(uoms.Select(u => u.UomId));

                // Budget header (TBL_JOB_EXPENSE_CATEGORY) — resolvable by name/code/id.
                var budgetByName = new Dictionary<string, int>();
                var budgetByCode = new Dictionary<string, int>();
                var budgetIds    = new HashSet<int>();
                foreach (var b in budgetCats)
                {
                    int bid = (int)b.ExpenseCategoryId;
                    budgetIds.Add(bid);
                    var bn = ((string?)b.CategoryName ?? "").Trim().ToLowerInvariant();
                    var bc = ((string?)b.CategoryCode ?? "").Trim().ToLowerInvariant();
                    if (bn.Length > 0) budgetByName[bn] = bid;
                    if (bc.Length > 0) budgetByCode[bc] = bid;
                }

                // Resolve id/code/name → id; appends an error and returns null when unmatched.
                int? Resolve(string raw, string label, HashSet<int> ids,
                             Dictionary<string, int> byCode, Dictionary<string, int> byName, List<string> errs)
                {
                    var v = raw.Trim();
                    if (int.TryParse(v, out var n) && ids.Contains(n)) return n;
                    var key = v.ToLowerInvariant();
                    if (byCode.TryGetValue(key, out var id)) return id;
                    if (byName.TryGetValue(key, out id))     return id;
                    errs.Add($"{label} not found: '{raw}'");
                    return null;
                }

                var results = new List<ItemImportRowResult>();
                int rowNum  = 0;

                foreach (var row in request.Rows)
                {
                    rowNum++;
                    var result = new ItemImportRowResult
                    {
                        RowNumber = rowNum,
                        ItemCode  = row.ItemCode?.Trim(),
                        ItemName  = row.ItemName?.Trim(),
                    };

                    // ── Validate required fields ──────────────────
                    var errors = new List<string>();
                    if (string.IsNullOrWhiteSpace(row.ItemName))   errors.Add("ItemName is required");
                    if (string.IsNullOrWhiteSpace(row.ItemTypeName)) errors.Add("ItemTypeName is required");
                    if (string.IsNullOrWhiteSpace(row.BaseUom))    errors.Add("BaseUom is required");

                    // ── Resolve lookups ───────────────────────────
                    int? categoryId  = null;
                    int? itemTypeId  = null;
                    int? baseUomId   = null;
                    int? purchaseUomId = null;
                    int? salesUomId  = null;

                    int? budgetCategoryId = null;
                    if (!string.IsNullOrWhiteSpace(row.CategoryName))
                        categoryId    = Resolve(row.CategoryName, "Category",   catIds,  catByCode,  catByName,  errors);
                    if (!string.IsNullOrWhiteSpace(row.BudgetHeader))
                        budgetCategoryId = Resolve(row.BudgetHeader, "BudgetHeader", budgetIds, budgetByCode, budgetByName, errors);
                    else
                        errors.Add("BudgetHeader is required");
                    if (!string.IsNullOrWhiteSpace(row.ItemTypeName))
                        itemTypeId    = Resolve(row.ItemTypeName, "ItemType",   typeIds, typeByCode, typeByName, errors);
                    if (!string.IsNullOrWhiteSpace(row.BaseUom))
                        baseUomId     = Resolve(row.BaseUom,      "BaseUom",     uomIds, uomByCode,  uomByName,  errors);
                    if (!string.IsNullOrWhiteSpace(row.PurchaseUom))
                        purchaseUomId = Resolve(row.PurchaseUom,  "PurchaseUom", uomIds, uomByCode,  uomByName,  errors);
                    if (!string.IsNullOrWhiteSpace(row.SalesUom))
                        salesUomId    = Resolve(row.SalesUom,     "SalesUom",    uomIds, uomByCode,  uomByName,  errors);

                    if (errors.Count > 0)
                    {
                        result.Success = false;
                        result.Message = string.Join("; ", errors);
                        results.Add(result);
                        continue;
                    }

                    // ── Parse boolean flags ───────────────────────
                    static bool ParseBool(string? v, bool defaultVal = false) =>
                        v?.Trim().ToUpperInvariant() switch { "YES" => true, "TRUE" => true, "1" => true, "NO" => false, "FALSE" => false, "0" => false, _ => defaultVal };

                    // ── Call sp_SetItem ───────────────────────────
                    try
                    {
                        var p = new
                        {
                            ItemId        = (int?)null,
                            ItemCode      = string.IsNullOrWhiteSpace(row.ItemCode) ? null : row.ItemCode.Trim(),
                            ItemName      = row.ItemName!.Trim(),
                            ItemNameAr    = row.ItemNameAr?.Trim(),
                            ShortDescription = row.ShortDescription?.Trim(),
                            CategoryId    = categoryId,
                            BudgetCategoryId = budgetCategoryId,
                            ItemTypeId    = itemTypeId,
                            BaseUomId     = baseUomId,
                            PurchaseUomId = purchaseUomId,
                            SalesUomId    = salesUomId,
                            Barcode       = row.Barcode?.Trim(),
                            HSCode        = row.HSCode?.Trim(),
                            IsStockable   = ParseBool(row.IsStockable,  false),
                            IsSaleable    = ParseBool(row.IsSaleable,   true),
                            IsPurchasable = ParseBool(row.IsPurchasable, true),
                            IsActive      = ParseBool(row.IsActive,      true),
                            CreatedBy     = request.ImportedBy,
                            ModifiedBy    = (string?)null,
                        };
                        var idStr = await _db.ExecuteScalarAsync("sp_SetItem", p);
                        result.Success = true;
                        result.ItemId  = int.TryParse(idStr, out var id) ? id : null;
                        result.Message = "Imported successfully";
                    }
                    catch (Microsoft.Data.SqlClient.SqlException sqlEx)
                    {
                        result.Success = false;
                        result.Message = sqlEx.Message;
                    }
                    catch (Exception ex)
                    {
                        // Unexpected per-row failure — log to TBL_APP_LOG for diagnosis,
                        // but keep importing the remaining rows and report this row as failed.
                        await _db.WriteLog(ex, controller: "Item", action: $"Import (row {rowNum})",
                            requestPath: HttpContext.Request.Path);
                        result.Success = false;
                        result.Message = ex.Message;
                    }

                    results.Add(result);
                }

                var successCount = results.Count(r => r.Success);
                var failCount    = results.Count(r => !r.Success);
                return Ok(new { successCount, failCount, results });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "Import", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Import failed. Please try again." });
            }
        }

        // ── Delete Item ───────────────────────────────────────────
        [HttpDelete("{itemId:int}")]
        public async Task<IActionResult> Delete(int itemId)
        {
            try
            {
                string result = await _db.ExecuteScalarAsync("sp_DeleteItem", new { ItemId = itemId });
                if (result == "NotExists") return NotFound(new { message = "Item not found." });
                return Ok(new { itemId, message = "Item deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting item." });
            }
        }

        // ── Item Details (variants) ───────────────────────────────
        [HttpGet("{itemId:int}/details")]
        public async Task<IActionResult> GetDetails(int itemId)
        {
            try { return Ok(await _db.QueryAsync<ItemDetail>("sp_GetItemDetails", new { ItemId = itemId })); }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "GetDetails", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching item details." });
            }
        }

        [HttpPost("{itemId:int}/details")]
        public async Task<IActionResult> SaveDetail(int itemId, [FromBody] ItemDetail model)
        {
            try
            {
                var p = new
                {
                    ItemDetailId       = model.ItemDetailId == 0 ? (int?)null : model.ItemDetailId,
                    ItemId             = itemId,
                    model.SKUCode, model.CountryOfOriginId, model.Brand, model.Model,
                    model.Colour, model.Size, model.Grade,
                    model.SupplierPartNo, model.ManufacturerPartNo,
                    model.StandardCost, model.ListPrice,
                    model.Weight, model.WeightUom, model.LeadTimeDays, model.ShelfLifeDays,
                    model.MinStockLevel, model.MaxStockLevel, model.ReorderLevel,
                    IsDefault  = model.IsDefault  ?? false,
                    IsActive   = model.IsActive   ?? true,
                    model.CreatedBy, model.ModifiedBy
                };
                string result = await _db.ExecuteScalarAsync("sp_SetItemDetail", p);
                return Ok(new { itemDetailId = int.Parse(result) });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "SaveDetail", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving item detail." });
            }
        }

        [HttpDelete("{itemId:int}/details/{detailId:int}")]
        public async Task<IActionResult> DeleteDetail(int itemId, int detailId)
        {
            try
            {
                await _db.ExecuteScalarAsync("sp_DeleteItemDetail", new { ItemDetailId = detailId });
                return Ok(new { message = "Deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "DeleteDetail", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting item detail." });
            }
        }

        // ── Specifications ────────────────────────────────────────
        [HttpGet("{itemId:int}/specs")]
        public async Task<IActionResult> GetSpecs(int itemId)
        {
            try { return Ok(await _db.QueryAsync<ItemSpec>("sp_GetItemSpecs", new { ItemId = itemId })); }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "GetSpecs", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching item specs." });
            }
        }

        [HttpPost("{itemId:int}/specs")]
        public async Task<IActionResult> SaveSpec(int itemId, [FromBody] ItemSpec model)
        {
            try
            {
                var p = new
                {
                    SpecId      = model.SpecId == 0 ? (int?)null : model.SpecId,
                    ItemId      = itemId,
                    model.SpecName, model.SpecValue, model.SpecUnit, model.SortOrder,
                    model.CreatedBy, model.ModifiedBy
                };
                string result = await _db.ExecuteScalarAsync("sp_SetItemSpec", p);
                return Ok(new { specId = int.Parse(result) });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "SaveSpec", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving item spec." });
            }
        }

        [HttpDelete("{itemId:int}/specs/{specId:int}")]
        public async Task<IActionResult> DeleteSpec(int itemId, int specId)
        {
            try
            {
                await _db.ExecuteScalarAsync("sp_DeleteItemSpec", new { SpecId = specId });
                return Ok(new { message = "Deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "DeleteSpec", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting item spec." });
            }
        }

        // ── UOM Conversions ───────────────────────────────────────
        [HttpGet("{itemId:int}/uom-conversions")]
        public async Task<IActionResult> GetUomConversions(int itemId)
        {
            try { return Ok(await _db.QueryAsync<ItemUomConversion>("sp_GetItemUomConversions", new { ItemId = itemId })); }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "GetUomConversions", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching UOM conversions." });
            }
        }

        [HttpPost("{itemId:int}/uom-conversions")]
        public async Task<IActionResult> SaveUomConversion(int itemId, [FromBody] ItemUomConversion model)
        {
            try
            {
                var p = new
                {
                    ConversionId     = model.ConversionId == 0 ? (int?)null : model.ConversionId,
                    ItemId           = itemId,
                    model.FromUomId, model.ToUomId, model.ConversionFactor,
                    IsActive         = model.IsActive ?? true,
                    model.CreatedBy, model.ModifiedBy
                };
                string result = await _db.ExecuteScalarAsync("sp_SetItemUomConversion", p);
                return Ok(new { conversionId = int.Parse(result) });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "SaveUomConversion", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving UOM conversion." });
            }
        }

        [HttpDelete("{itemId:int}/uom-conversions/{conversionId:int}")]
        public async Task<IActionResult> DeleteUomConversion(int itemId, int conversionId)
        {
            try
            {
                await _db.ExecuteScalarAsync("sp_DeleteItemUomConversion", new { ConversionId = conversionId });
                return Ok(new { message = "Deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, controller: "Item", action: "DeleteUomConversion", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting UOM conversion." });
            }
        }
    }
}
