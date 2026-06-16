using ERPWEB.Dbcontext;
using ERPWEB.Models.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Finance
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class ReceivablesController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public ReceivablesController(DbCon dbcon) { _dbcon = dbcon; }

        // ── DASHBOARD ────────────────────────────────────────────────────────
        // Returns KPI summary, aging buckets, monthly trend, and top overdue customers.
        [HttpGet("dashboard")]
        public async Task<IActionResult> Dashboard(
            [FromQuery] int?    customerId = null,
            [FromQuery] int?    currencyId = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null)
        {
            try
            {
                var p = new
                {
                    CustomerId = customerId,
                    CurrencyId = currencyId,
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                };

                var (kpiRows, agingRows, monthlyRows, overdueRows) =
                    await _dbcon.QueryMultipleAsync4<
                        ReceivablesDashboardKpi,
                        ReceivablesAgingBuckets,
                        MonthlyInvoiceReceipt,
                        TopOverdueCustomer>(
                        "sp_GetReceivablesDashboard", p);

                return Ok(new
                {
                    kpi         = kpiRows.FirstOrDefault()  ?? new ReceivablesDashboardKpi(),
                    aging       = agingRows.FirstOrDefault() ?? new ReceivablesAgingBuckets(),
                    monthly     = monthlyRows ?? Enumerable.Empty<MonthlyInvoiceReceipt>(),
                    topOverdue  = overdueRows ?? Enumerable.Empty<TopOverdueCustomer>(),
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Receivables", action: "Dashboard", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading receivables dashboard." });
            }
        }

        // ── CUSTOMER SUMMARY ─────────────────────────────────────────────────
        [HttpGet("customers")]
        public async Task<IActionResult> Customers(
            [FromQuery] string? searchText = null,
            [FromQuery] int?    customerId = null,
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
                    CustomerId    = customerId,
                    CurrencyId    = currencyId,
                    Status        = string.IsNullOrWhiteSpace(status) ? null : status.Trim(),
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir,
                };
                var rows  = await _dbcon.QueryAsync<CustomerReceivable>("sp_GetCustomerReceivables", p);
                var list  = rows?.ToList() ?? new List<CustomerReceivable>();
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
                await _dbcon.WriteLog(ex, controller: "Receivables", action: "Customers", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading customer receivables." });
            }
        }

        // ── CUSTOMER INVOICE DETAILS ─────────────────────────────────────────
        [HttpGet("customer-invoices/{customerId:int}")]
        public async Task<IActionResult> CustomerInvoices(
            int     customerId,
            [FromQuery] string? invoiceNo    = null,
            [FromQuery] string? jobId        = null,
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
                    CustomerId    = customerId,
                    InvoiceNo     = string.IsNullOrWhiteSpace(invoiceNo)   ? null : invoiceNo.Trim(),
                    JobId         = string.IsNullOrWhiteSpace(jobId)       ? null : jobId.Trim(),
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
                var rows  = await _dbcon.QueryAsync<InvoiceReceivable>("sp_GetCustomerInvoiceReceivables", p);
                var list  = rows?.ToList() ?? new List<InvoiceReceivable>();
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
                await _dbcon.WriteLog(ex, controller: "Receivables", action: "CustomerInvoices", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading customer invoices." });
            }
        }

        // ── INVOICE RECEIPT ALLOCATIONS ───────────────────────────────────────
        [HttpGet("invoice-allocations/{invoiceId:int}")]
        public async Task<IActionResult> InvoiceAllocations(int invoiceId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<InvoiceReceiptAllocation>(
                    "sp_GetInvoiceReceiptAllocations", new { InvoiceId = invoiceId });
                return Ok(rows ?? Enumerable.Empty<InvoiceReceiptAllocation>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Receivables", action: "InvoiceAllocations", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading invoice allocations." });
            }
        }

        // ── CUSTOMER PAYMENT HISTORY ─────────────────────────────────────────
        [HttpGet("customer-payment-history/{customerId:int}")]
        public async Task<IActionResult> CustomerPaymentHistory(int customerId)
        {
            try
            {
                var (summaryRows, historyRows) =
                    await _dbcon.QueryMultipleAsync<CustomerPaymentSummary, CustomerReceiptHistory>(
                        "sp_GetCustomerPaymentHistory", new { CustomerId = customerId });

                return Ok(new
                {
                    summary = summaryRows.FirstOrDefault() ?? new CustomerPaymentSummary(),
                    history = historyRows ?? Enumerable.Empty<CustomerReceiptHistory>(),
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Receivables", action: "CustomerPaymentHistory", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading payment history." });
            }
        }

        // ── AGING ANALYSIS ───────────────────────────────────────────────────
        [HttpGet("aging")]
        public async Task<IActionResult> Aging(
            [FromQuery] string? searchText = null,
            [FromQuery] int?    customerId = null,
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
                    CustomerId    = customerId,
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir,
                };
                var rows  = await _dbcon.QueryAsync<CustomerAgingRow>("sp_GetReceivablesAging", p);
                var list  = rows?.ToList() ?? new List<CustomerAgingRow>();
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
                await _dbcon.WriteLog(ex, controller: "Receivables", action: "Aging", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading aging analysis." });
            }
        }
    }
}
