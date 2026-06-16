using ERPWEB.Dbcontext;
using ERPWEB.Models.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Finance
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class PayablesController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public PayablesController(DbCon dbcon) { _dbcon = dbcon; }

        // ── DASHBOARD ────────────────────────────────────────────────────────
        // Returns KPI summary, aging buckets, monthly trend, and top overdue suppliers.
        [HttpGet("dashboard")]
        public async Task<IActionResult> Dashboard(
            [FromQuery] int?    supplierId = null,
            [FromQuery] int?    currencyId = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null)
        {
            try
            {
                var p = new
                {
                    SupplierId = supplierId,
                    CurrencyId = currencyId,
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                };

                var (kpiRows, agingRows, monthlyRows, overdueRows) =
                    await _dbcon.QueryMultipleAsync4<
                        PayablesDashboardKpi,
                        PayablesAgingBuckets,
                        MonthlyInvoicePayment,
                        TopOverdueSupplier>(
                        "sp_GetPayablesDashboard", p);

                return Ok(new
                {
                    kpi        = kpiRows.FirstOrDefault()   ?? new PayablesDashboardKpi(),
                    aging      = agingRows.FirstOrDefault() ?? new PayablesAgingBuckets(),
                    monthly    = monthlyRows  ?? Enumerable.Empty<MonthlyInvoicePayment>(),
                    topOverdue = overdueRows  ?? Enumerable.Empty<TopOverdueSupplier>(),
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Payables", action: "Dashboard", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading payables dashboard." });
            }
        }

        // ── SUPPLIER SUMMARY ─────────────────────────────────────────────────
        [HttpGet("suppliers")]
        public async Task<IActionResult> Suppliers(
            [FromQuery] string? searchText = null,
            [FromQuery] int?    supplierId = null,
            [FromQuery] int?    currencyId = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "TotalPendingBase",
            [FromQuery] string  sortDir    = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    SupplierId    = supplierId,
                    CurrencyId    = currencyId,
                    Status        = string.IsNullOrWhiteSpace(status) ? null : status.Trim(),
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir,
                };
                var rows  = await _dbcon.QueryAsync<SupplierPayable>("sp_GetSupplierPayables", p);
                var list  = rows?.ToList() ?? new List<SupplierPayable>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new
                {
                    totalRows  = total,
                    page,
                    pageSize,
                    totalPages = (int)Math.Ceiling((double)total / pageSize),
                    data       = list,
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Payables", action: "Suppliers", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading supplier payables." });
            }
        }

        // ── SUPPLIER INVOICE DETAILS ─────────────────────────────────────────
        [HttpGet("supplier-invoices/{supplierId:int}")]
        public async Task<IActionResult> SupplierInvoices(
            int     supplierId,
            [FromQuery] string? invoiceNo    = null,
            [FromQuery] int?    currencyId   = null,
            [FromQuery] string? status       = null,
            [FromQuery] string? dateFrom     = null,
            [FromQuery] string? dateTo       = null,
            [FromQuery] string? dueDateFrom  = null,
            [FromQuery] string? dueDateTo    = null,
            [FromQuery] int     page         = 1,
            [FromQuery] int     pageSize     = 50,
            [FromQuery] string  sortCol      = "InvoiceDate",
            [FromQuery] string  sortDir      = "DESC")
        {
            try
            {
                var p = new
                {
                    SupplierId    = supplierId,
                    InvoiceNo     = string.IsNullOrWhiteSpace(invoiceNo)   ? null : invoiceNo.Trim(),
                    CurrencyId    = currencyId,
                    Status        = string.IsNullOrWhiteSpace(status)      ? null : status.Trim(),
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom)    ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)      ? (DateTime?)null : DateTime.Parse(dateTo),
                    DueDateFrom   = string.IsNullOrWhiteSpace(dueDateFrom) ? (DateTime?)null : DateTime.Parse(dueDateFrom),
                    DueDateTo     = string.IsNullOrWhiteSpace(dueDateTo)   ? (DateTime?)null : DateTime.Parse(dueDateTo),
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 500 ? 50 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir,
                };
                var rows  = await _dbcon.QueryAsync<InvoicePayable>("sp_GetSupplierInvoicePayables", p);
                var list  = rows?.ToList() ?? new List<InvoicePayable>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new
                {
                    totalRows  = total,
                    page,
                    pageSize,
                    totalPages = (int)Math.Ceiling((double)total / pageSize),
                    data       = list,
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Payables", action: "SupplierInvoices", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading supplier invoices." });
            }
        }

        // ── INVOICE PV ALLOCATIONS ────────────────────────────────────────────
        [HttpGet("invoice-allocations/{invoiceId:int}")]
        public async Task<IActionResult> InvoiceAllocations(int invoiceId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<InvoicePvAllocation>(
                    "sp_GetInvoicePvAllocations", new { SupplierInvoiceId = invoiceId });
                return Ok(rows ?? Enumerable.Empty<InvoicePvAllocation>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Payables", action: "InvoiceAllocations", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading invoice PV allocations." });
            }
        }

        // ── SUPPLIER PAYMENT HISTORY ─────────────────────────────────────────
        [HttpGet("supplier-payment-history/{supplierId:int}")]
        public async Task<IActionResult> SupplierPaymentHistory(int supplierId)
        {
            try
            {
                var (summaryRows, historyRows) =
                    await _dbcon.QueryMultipleAsync<SupplierPaymentSummary, SupplierPaymentHistory>(
                        "sp_GetSupplierPaymentHistory", new { SupplierId = supplierId });

                return Ok(new
                {
                    summary = summaryRows.FirstOrDefault() ?? new SupplierPaymentSummary(),
                    history = historyRows ?? Enumerable.Empty<SupplierPaymentHistory>(),
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Payables", action: "SupplierPaymentHistory", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading supplier payment history." });
            }
        }

        // ── AGING ANALYSIS ───────────────────────────────────────────────────
        [HttpGet("aging")]
        public async Task<IActionResult> Aging(
            [FromQuery] string? searchText = null,
            [FromQuery] int?    supplierId = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "Total",
            [FromQuery] string  sortDir    = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    SupplierId    = supplierId,
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir,
                };
                var rows  = await _dbcon.QueryAsync<SupplierAgingRow>("sp_GetPayablesAging", p);
                var list  = rows?.ToList() ?? new List<SupplierAgingRow>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;
                return Ok(new
                {
                    totalRows  = total,
                    page,
                    pageSize,
                    totalPages = (int)Math.Ceiling((double)total / pageSize),
                    data       = list,
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Payables", action: "Aging", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading aging analysis." });
            }
        }
    }
}
