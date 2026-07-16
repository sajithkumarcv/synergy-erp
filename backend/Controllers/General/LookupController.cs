using ERPWEB.Dbcontext;
using ERPWEB.Models.General;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Data;

namespace ERPWEB.Controllers.General
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class LookupController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public LookupController(DbCon dbcon) { _dbcon = dbcon; }

        // ── VList ALL groups ─────────────────────────────────────
        [HttpGet("vlist")]
        public async Task<IActionResult> GetAllVList()
        {
            try
            {
                var all = await _dbcon.QueryAsync<VListItem>("sp_GetVListAll");
                var grouped = all
                    .Where(v => v.IsActive)
                    .GroupBy(v => $"{v.TypeName}.{v.ListName}")
                    .ToDictionary(
                        g => g.Key,
                        g => g.OrderBy(v => v.SortOrder)
                              .Select(v => new { value = v.ItemValue, label = v.ItemDescription, id = v.VListID })
                              .ToList()
                    );
                return Ok(grouped);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Lookup", action: "GetAllVList", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading VList." });
            }
        }

        // ── VList single group ───────────────────────────────────
        [HttpGet("vlist/{typeName}/{listName}")]
        public async Task<IActionResult> GetVList(string typeName, string listName)
        {
            try
            {
                var items = await _dbcon.QueryAsync<VListItem>("sp_GetVList", new { TypeName = typeName, ListName = listName });
                var result = items
                    .Where(v => v.IsActive)
                    .OrderBy(v => v.SortOrder)
                    .Select(v => new { value = v.ItemValue, label = v.ItemDescription, id = v.VListID });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Lookup", action: "GetVList", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading VList." });
            }
        }

        // ── Standard master lookups ──────────────────────────────
        // Includes customerCategory — all served via same pattern.
        // Declared AFTER explicit routes to avoid route conflict.
        [HttpGet("{type}")]
        public async Task<IActionResult> GetLookup(string type)
        {
            try
            {
                string spName = type.ToLower() switch
                {
                    "paymentterms"     => "sp_GetPaymentTerms",
                    "currency"         => "sp_GetCurrencyList",
                    "country"          => "sp_GetCountryList",
                    "company"          => "sp_GetCompanyList",
                    "customercategory" => "sp_GetCustomerCategoryList",
                    "jobstatus"        => "sp_GetJobStatusList",
                    _                  => ""
                };

                if (string.IsNullOrEmpty(spName))
                    return BadRequest(new { message = $"Invalid lookup type: {type}" });

                DataSet ds = _dbcon.ExecuteProcedure(spName);
                var results = ds.Tables[0].AsEnumerable()
                    .Select(row => new { id = row[0], name = row[1] })
                    .ToList();
                return Ok(results);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Lookup", action: "GetLookup", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading lookup data." });
            }
        }

        // ── Currency list with exchange rates ────────────────────
        [HttpGet("currency-rates")]
        public async Task<IActionResult> GetCurrencyRates()
        {
            try
            {
                DataSet ds = _dbcon.ExecuteProcedure("sp_GetCurrencyList");
                var results = ds.Tables[0].AsEnumerable()
                    .Where(row => row["IsActive"] != DBNull.Value && (bool)row["IsActive"])
                    .Select(row => new
                    {
                        id             = row["CurrencyId"],
                        name           = row["CurrencyName"],
                        shortName      = row["ShortName"],
                        exchangeRate   = row["ExchangeRate"],
                        isBaseCurrency = row["IsBaseCurrency"]
                    })
                    .ToList();
                return Ok(results);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Lookup", action: "GetCurrencyRates", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading currencies." });
            }
        }

        // ── Payment Terms ─────────────────────────────────────────
        // Explicit route (takes precedence over the generic {type} switch below)
        // so we can also expose TermCode — needed by the PO form to detect the
        // "Other" term and require its free-text specification.
        [HttpGet("paymentterms")]
        public async Task<IActionResult> GetPaymentTermsWithCode()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetPaymentTerms");
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    id   = (int)r.PaymentTermsId,
                    name = (string)r.DisplayName,
                    code = (string)r.TermCode,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Lookup", action: "GetPaymentTermsWithCode", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading payment terms." });
            }
        }

        // ── Delivery Terms ───────────────────────────────────────
        [HttpGet("deliveryterms")]
        public async Task<IActionResult> GetDeliveryTerms()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetDeliveryTermsList");
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    id          = (int)r.DeliveryTermsId,
                    code        = (string)r.TermCode,
                    name        = (string)r.TermName,
                    description = (string?)r.Description
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Lookup", action: "GetDeliveryTerms", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading delivery terms." });
            }
        }

        // ── Job Expense Categories ───────────────────────────────
        [HttpGet("expensecategories")]
        public async Task<IActionResult> GetExpenseCategories()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetJobExpenseCategoryList");
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    id   = (int)r.ExpenseCategoryId,
                    code = (string)r.CategoryCode,
                    name = (string)r.CategoryName,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Lookup", action: "GetExpenseCategories", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading expense categories." });
            }
        }

        // ── Budget Categories (UsedForBudget=1) ──────────────────
        [HttpGet("budgetcategories")]
        public async Task<IActionResult> GetBudgetCategories()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetExpenseCategoryList");
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    id   = (int)r.ExpenseCategoryId,
                    code = (string)r.CategoryCode,
                    name = (string)r.CategoryName,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Lookup", action: "GetBudgetCategories", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading budget categories." });
            }
        }

        // ── Parent-filtered lookups ──────────────────────────────
        [HttpGet("{type}/parent/{parentId}")]
        public async Task<IActionResult> GetLookupByParent(string type, int parentId)
        {
            try
            {
                string spName = type.ToLower() switch
                {
                    "branch" => "sp_GetBranchListByCompany",
                    _        => ""
                };

                if (string.IsNullOrEmpty(spName))
                    return BadRequest(new { message = "Invalid type" });

                var parameters = new Dictionary<string, object> { { "@ParentId", parentId } };
                DataSet ds = _dbcon.ExecuteProcedure(spName, parameters);
                List<LookUp> lookupList = ds.Tables[0].AsEnumerable()
                    .Select(row => new LookUp { Id = row[0], Name = row[1].ToString() ?? "" })
                    .ToList();
                return Ok(lookupList);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Lookup", action: "GetLookupByParent", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading lookup data." });
            }
        }
    }
}
