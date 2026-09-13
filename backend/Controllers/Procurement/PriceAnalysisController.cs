using ERPWEB.Dbcontext;
using ERPWEB.Models.Procurement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Procurement
{
    /// <summary>
    /// Purchase price analysis — PO unit price history for one item over a
    /// date interval, in base currency. Trend, weighted average, min/max and a
    /// per-vendor comparison (SAP ME1P / Odoo Purchase Analysis equivalent).
    /// </summary>
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class PriceAnalysisController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public PriceAnalysisController(DbCon dbcon) { _dbcon = dbcon; }

        // GET: api/priceanalysis/po?itemId=&dateFrom=&dateTo=&supplierId=&includeDraft=
        //
        // includeDraft defaults to false, which is the long-standing behaviour of
        // this screen: Draft and Cancelled orders are left out of the KPIs and the
        // trend. The last-purchase popup on the PR import grid passes true, because
        // a buyer pricing a line wants to see what has been drafted as well as
        // ordered. Cancelled is excluded either way.
        [HttpGet("po")]
        public async Task<IActionResult> PoPrice(
            [FromQuery] int     itemId,
            [FromQuery] string? dateFrom     = null,
            [FromQuery] string? dateTo       = null,
            [FromQuery] int?    supplierId   = null,
            [FromQuery] bool    includeDraft = false)
        {
            if (itemId <= 0)
                return BadRequest(new { message = "itemId is required." });
            try
            {
                var p = new
                {
                    ItemId       = itemId,
                    DateFrom     = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo       = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    SupplierId   = supplierId,
                    IncludeDraft = includeDraft,
                };

                var (summaryRows, monthlyRows, detailRows, vendorRows) =
                    await _dbcon.QueryMultipleAsync4<PoPriceSummary, PoPriceMonthly, PoPriceDetail, PoPriceVendor>(
                        "sp_GetItemPoPriceAnalysis", p);

                return Ok(new
                {
                    summary = summaryRows.FirstOrDefault() ?? new PoPriceSummary(),
                    monthly = monthlyRows ?? Enumerable.Empty<PoPriceMonthly>(),
                    detail  = detailRows  ?? Enumerable.Empty<PoPriceDetail>(),
                    vendors = vendorRows  ?? Enumerable.Empty<PoPriceVendor>(),
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PriceAnalysis", action: "PoPrice", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading PO price analysis." });
            }
        }

        // GET: api/priceanalysis/variance?dateFrom=&dateTo=&budgetCategoryId=&supplierId=&minExtraSpend=&topN=
        //
        // Cross-item price movement ranked by VALUE IMPACT, so buyers do not have to
        // open items one at a time. The per-item screen is the drill-down from here.
        // Defaults to the last 12 months when no dates are supplied.
        [HttpGet("variance")]
        public async Task<IActionResult> PriceVariance(
            [FromQuery] string?  dateFrom         = null,
            [FromQuery] string?  dateTo           = null,
            [FromQuery] int?     budgetCategoryId = null,
            [FromQuery] int?     supplierId       = null,
            [FromQuery] decimal? minExtraSpend    = null,
            [FromQuery] int      topN             = 200)
        {
            try
            {
                var p = new
                {
                    DateFrom         = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo           = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    BudgetCategoryId = budgetCategoryId,
                    SupplierId       = supplierId,
                    MinExtraSpend    = minExtraSpend,
                    TopN             = topN,
                };

                var rows = await _dbcon.QueryAsync<PriceVarianceRow>("sp_ReportPriceVariance", p);
                return Ok(rows ?? Enumerable.Empty<PriceVarianceRow>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PriceAnalysis", action: "PriceVariance", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading the price variance report." });
            }
        }
    }
}
