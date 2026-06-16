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

        // GET: api/priceanalysis/po?itemId=&dateFrom=&dateTo=&supplierId=
        [HttpGet("po")]
        public async Task<IActionResult> PoPrice(
            [FromQuery] int     itemId,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int?    supplierId = null)
        {
            if (itemId <= 0)
                return BadRequest(new { message = "itemId is required." });
            try
            {
                var p = new
                {
                    ItemId     = itemId,
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    SupplierId = supplierId,
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
    }
}
