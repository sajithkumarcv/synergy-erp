using ERPWEB.Dbcontext;
using ERPWEB.Models.Inventory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Reports
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class ReportsController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public ReportsController(DbCon dbcon) { _dbcon = dbcon; }

        // ── PR REPORT ────────────────────────────────────────────────────────
        [HttpGet("pr")]
        public async Task<IActionResult> PrReport(
            [FromQuery] string? dateFrom  = null,
            [FromQuery] string? dateTo    = null,
            [FromQuery] string? status    = null,
            [FromQuery] string? priority  = null,
            [FromQuery] string? jobId     = null,
            [FromQuery] string? createdBy = null,
            [FromQuery] bool    noPOOnly  = false)
        {
            try
            {
                var p = new
                {
                    DateFrom  = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo    = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    Status    = string.IsNullOrWhiteSpace(status)    ? null : status,
                    Priority  = string.IsNullOrWhiteSpace(priority)  ? null : priority,
                    JobId     = string.IsNullOrWhiteSpace(jobId)     ? null : jobId.Trim(),
                    CreatedBy = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                    NoPOOnly  = noPOOnly ? 1 : 0,
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportPRs", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    prId       = (int)r.PrId,
                    prNumber   = (string)r.PrNumber,
                    prDate     = (DateTime?)r.PrDate,
                    requestedBy= (string?)r.RequestedBy,
                    jobId      = (string?)r.JobId,
                    jobTitle   = (string?)r.JobTitle,
                    status     = (string)r.Status,
                    priority   = (string?)r.Priority,
                    createdBy  = (string?)r.CreatedBy,
                    createdDate= (DateTime?)r.CreatedDate,
                    notes      = (string?)r.Notes,
                    lineCount  = (int)r.LineCount,
                    poCount    = (int)r.PoCount,
                    linkedPOs  = (string?)r.LinkedPOs,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "PrReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating PR report." });
            }
        }

        // ── JOB REPORT ───────────────────────────────────────────────────────
        [HttpGet("job")]
        public async Task<IActionResult> JobReport(
            [FromQuery] string? dateFrom       = null,
            [FromQuery] string? dateTo         = null,
            [FromQuery] int?    customerId     = null,
            [FromQuery] string? jobTypeId      = null,
            [FromQuery] string? jobStageId     = null,
            [FromQuery] int?    jobStatusId    = null,
            [FromQuery] string? approvalStatus = null,
            [FromQuery] string? createdBy      = null)
        {
            try
            {
                var p = new
                {
                    DateFrom       = string.IsNullOrWhiteSpace(dateFrom)       ? null : dateFrom,
                    DateTo         = string.IsNullOrWhiteSpace(dateTo)         ? null : dateTo,
                    CustomerId     = customerId,
                    JobTypeId      = string.IsNullOrWhiteSpace(jobTypeId)      ? null : jobTypeId.Trim(),
                    JobStageId     = string.IsNullOrWhiteSpace(jobStageId)     ? null : jobStageId.Trim(),
                    JobStatusId    = jobStatusId,
                    ApprovalStatus = string.IsNullOrWhiteSpace(approvalStatus) ? null : approvalStatus.Trim(),
                    CreatedBy      = string.IsNullOrWhiteSpace(createdBy)      ? null : createdBy.Trim(),
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportJobs", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    jobNumId                = (int)r.JobNumId,
                    jobId                   = (string)r.JobId,
                    projectName             = (string?)r.ProjectName,
                    jobDate                 = (DateTime?)r.JobDate,
                    jobTypeName             = (string?)r.JobTypeName,
                    jobStageName            = (string?)r.JobStageName,
                    customerId              = (int?)r.CustomerId,
                    customerName            = (string?)r.CustomerName,
                    jobStatusName           = (string?)r.JobStatusName,
                    approvalStatus          = (string?)r.ApprovalStatus,
                    currencySymbol          = (string?)r.CurrencySymbol,
                    exchangeRate            = (decimal?)r.ExchangeRate,
                    orderValue              = (decimal?)r.OrderValue,
                    orderValueBase          = (decimal?)r.OrderValueBase,
                    totalActual             = (decimal?)r.TotalActual,
                    totalExpenses           = (decimal?)r.TotalExpenses,
                    totalInvoicing          = (decimal?)r.TotalInvoicing,
                    totalInvoicingBase      = (decimal?)r.TotalInvoicingBase,
                    totalPayments           = (decimal?)r.TotalPayments,
                    totalPaymentsBase       = (decimal?)r.TotalPaymentsBase,
                    totalCredit             = (decimal?)r.TotalCredit,
                    totalCreditBase         = (decimal?)r.TotalCreditBase,
                    totalBomValue           = (decimal?)r.TotalBomValue,
                    lpoRef                  = (string?)r.LpoRef,
                    contractRef             = (string?)r.ContractRef,
                    externalRef             = (string?)r.ExternalRef,
                    parentJobId             = (string?)r.ParentJobId,
                    jobCreatedBy            = (string?)r.JobCreatedBy,
                    jobCreatedDate          = (DateTime?)r.JobCreatedDate,
                    isClosedStatus          = (bool)r.IsClosedStatus,
                    jobPlannedStartDate     = (DateTime?)r.JobPlannedStartDate,
                    jobExpectedCompleteDate = (DateTime?)r.JobExpectedCompleteDate,
                    jobActualCompleteDate   = (DateTime?)r.JobActualCompleteDate,
                    jobExpectedDeliveryDate = (DateTime?)r.JobExpectedDeliveryDate,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "JobReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Job report." });
            }
        }

        // ── JOB BUDGET VARIANCE (OVER-BUDGET) REPORT ─────────────────────────
        [HttpGet("job-budget")]
        public async Task<IActionResult> JobBudgetReport(
            [FromQuery] string? dateFrom       = null,
            [FromQuery] string? dateTo         = null,
            [FromQuery] int?    customerId     = null,
            [FromQuery] string? jobTypeId      = null,
            [FromQuery] string? jobStageId     = null,
            [FromQuery] int?    jobStatusId    = null,
            [FromQuery] string? approvalStatus = null,
            [FromQuery] bool    overBudgetOnly = false)
        {
            try
            {
                var p = new
                {
                    DateFrom       = string.IsNullOrWhiteSpace(dateFrom)       ? null : dateFrom,
                    DateTo         = string.IsNullOrWhiteSpace(dateTo)         ? null : dateTo,
                    CustomerId     = customerId,
                    JobTypeId      = string.IsNullOrWhiteSpace(jobTypeId)      ? null : jobTypeId.Trim(),
                    JobStageId     = string.IsNullOrWhiteSpace(jobStageId)     ? null : jobStageId.Trim(),
                    JobStatusId    = jobStatusId,
                    ApprovalStatus = string.IsNullOrWhiteSpace(approvalStatus) ? null : approvalStatus.Trim(),
                    OverBudgetOnly = overBudgetOnly ? 1 : 0,
                };

                using var grid = await _dbcon.QueryMultipleAsync("sp_ReportJobBudgetVariance", p);

                var jobRows = (await grid.ReadAsync<dynamic>()).ToList();
                var catRows = (await grid.ReadAsync<dynamic>()).ToList();

                var jobs = jobRows.Select(r => new
                {
                    jobId             = (string)r.JobId,
                    projectName       = (string?)r.ProjectName,
                    jobDate           = (DateTime?)r.JobDate,
                    jobTypeName       = (string?)r.JobTypeName,
                    jobStageName      = (string?)r.JobStageName,
                    customerId        = (int?)r.CustomerId,
                    customerName      = (string?)r.CustomerName,
                    jobStatusName     = (string?)r.JobStatusName,
                    approvalStatus    = (string?)r.ApprovalStatus,
                    currencySymbol    = (string?)r.CurrencySymbol,
                    exchangeRate      = (decimal?)r.ExchangeRate,
                    totalBudget       = (decimal?)r.TotalBudget,
                    totalActual       = (decimal?)r.TotalActual,
                    variance          = (decimal?)r.Variance,
                    totalBudgetBase   = (decimal?)r.TotalBudgetBase,
                    totalActualBase   = (decimal?)r.TotalActualBase,
                    varianceBase      = (decimal?)r.VarianceBase,
                    variancePct       = (decimal?)r.VariancePct,
                    overCategoryCount = (int)r.OverCategoryCount,
                    budgetStatus      = (string?)r.BudgetStatus,
                });

                var categories = catRows.Select(r => new
                {
                    jobId          = (string)r.JobId,
                    costCategoryId = (int?)r.CostCategoryId,
                    categoryName   = (string?)r.CategoryName,
                    budgetedBase   = (decimal?)r.BudgetedBase,
                    actualBase     = (decimal?)r.ActualBase,
                    varianceBase   = (decimal?)r.VarianceBase,
                    budgeted       = (decimal?)r.Budgeted,
                    actual         = (decimal?)r.Actual,
                    variance       = (decimal?)r.Variance,
                    isOver         = (bool)r.IsOver,
                });

                return Ok(new { jobs, categories });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "JobBudgetReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Job Budget report." });
            }
        }

        // ── OPEN PO / COMMITMENT & PENDING-GRN AGING REPORT ──────────────────
        [HttpGet("open-po")]
        public async Task<IActionResult> OpenPoReport(
            [FromQuery] string? dateFrom          = null,
            [FromQuery] string? dateTo            = null,
            [FromQuery] int?    supplierId        = null,
            [FromQuery] string? jobId             = null,
            [FromQuery] int?    expenseCategoryId = null,
            [FromQuery] bool    overdueOnly       = false)
        {
            try
            {
                var p = new
                {
                    DateFrom          = string.IsNullOrWhiteSpace(dateFrom) ? null : dateFrom,
                    DateTo            = string.IsNullOrWhiteSpace(dateTo)   ? null : dateTo,
                    SupplierId        = supplierId,
                    JobId             = string.IsNullOrWhiteSpace(jobId)    ? null : jobId.Trim(),
                    ExpenseCategoryId = expenseCategoryId,
                    OverdueOnly       = overdueOnly ? 1 : 0,
                };

                var rows = await _dbcon.QueryAsync<dynamic>("sp_ReportOpenPoCommitment", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    poId                = (int)r.PoId,
                    poNumber            = (string)r.PoNumber,
                    poDate              = (DateTime?)r.PoDate,
                    deliveryDate        = (DateTime?)r.DeliveryDate,
                    supplierId          = (int?)r.SupplierId,
                    vendorName          = (string?)r.VendorName,
                    jobId               = (string?)r.JobId,
                    currencyShort       = (string?)r.CurrencyShort,
                    exchangeRate        = (decimal?)r.ExchangeRate,
                    poStatus            = (string?)r.PoStatus,
                    expenseCategoryName = (string?)r.ExpenseCategoryName,
                    poLineId            = (int)r.PoLineId,
                    lineNum             = (int?)r.LineNum,
                    itemCode            = (string?)r.ItemCode,
                    itemDesc            = (string?)r.ItemDesc,
                    uomName             = (string?)r.UomName,
                    orderedQty          = (decimal?)r.OrderedQty,
                    receivedQty         = (decimal?)r.ReceivedQty,
                    openQty             = (decimal?)r.OpenQty,
                    unitPrice           = (decimal?)r.UnitPrice,
                    openValue           = (decimal?)r.OpenValue,
                    openValueBase       = (decimal?)r.OpenValueBase,
                    lineStatus          = (string?)r.LineStatus,
                    lastGrnDate         = (DateTime?)r.LastGrnDate,
                    daysOverdue         = (int?)r.DaysOverdue,
                    agingBucket         = (string?)r.AgingBucket,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "OpenPoReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Open PO report." });
            }
        }

        // ── VENDOR SCORECARD REPORT ──────────────────────────────────────────
        [HttpGet("vendor-scorecard")]
        public async Task<IActionResult> VendorScorecard(
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int?    supplierId = null)
        {
            try
            {
                var p = new
                {
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom) ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)   ? null : dateTo,
                    SupplierId = supplierId,
                };

                var rows = await _dbcon.QueryAsync<dynamic>("sp_ReportVendorScorecard", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    supplierId         = (int)r.SupplierId,
                    supplierName       = (string?)r.SupplierName,
                    supplierCode       = (string?)r.SupplierCode,
                    poCount            = (int?)r.PoCount,
                    poValueBase        = (decimal?)r.PoValueBase,
                    totalLines         = (int?)r.TotalLines,
                    receivedLines      = (int?)r.ReceivedLines,
                    openLines          = (int?)r.OpenLines,
                    inFullLines        = (int?)r.InFullLines,
                    evaluableLines     = (int?)r.EvaluableLines,
                    otifLines          = (int?)r.OtifLines,
                    otifPct            = (decimal?)r.OtifPct,
                    fillRatePct        = (decimal?)r.FillRatePct,
                    avgLeadDays        = (decimal?)r.AvgLeadDays,
                    rejectedQty        = (decimal?)r.RejectedQty,
                    receivedQtyTotal   = (decimal?)r.ReceivedQtyTotal,
                    rejectPct          = (decimal?)r.RejectPct,
                    openCommitmentBase = (decimal?)r.OpenCommitmentBase,
                    lateOpenLines      = (int?)r.LateOpenLines,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "VendorScorecard", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Vendor Scorecard." });
            }
        }

        // ── GRN UNREGISTRATION REPORT ────────────────────────────────────────
        [HttpGet("grn-unreg")]
        public async Task<IActionResult> GrnUnregReport(
            [FromQuery] string? dateFrom    = null,
            [FromQuery] string? dateTo      = null,
            [FromQuery] int?    supplierId  = null,
            [FromQuery] string? jobId       = null,
            [FromQuery] string? cancelledBy = null,
            [FromQuery] string? createdBy   = null)
        {
            try
            {
                var p = new
                {
                    DateFrom    = string.IsNullOrWhiteSpace(dateFrom)    ? null : dateFrom,
                    DateTo      = string.IsNullOrWhiteSpace(dateTo)      ? null : dateTo,
                    SupplierId  = supplierId,
                    JobId       = string.IsNullOrWhiteSpace(jobId)       ? null : jobId.Trim(),
                    CancelledBy = string.IsNullOrWhiteSpace(cancelledBy) ? null : cancelledBy.Trim(),
                    CreatedBy   = string.IsNullOrWhiteSpace(createdBy)   ? null : createdBy.Trim(),
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportGRNUnregs", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    grnId         = (int)r.GrnId,
                    grnNumber     = (string)r.GrnNumber,
                    grnDate       = (DateTime?)r.GrnDate,
                    supplierId    = (int?)r.SupplierId,
                    supplierName  = (string?)r.SupplierName,
                    jobId         = (string?)r.JobId,
                    jobTitle      = (string?)r.JobTitle,
                    poNumber      = (string?)r.PoNumber,
                    totalAmount   = (decimal?)r.TotalAmount,
                    currencyShort = (string?)r.CurrencyShort,
                    doNo          = (string?)r.DoNo,
                    invoiceNo     = (string?)r.InvoiceNo,
                    cancelledBy   = (string?)r.CancelledBy,
                    cancelledDate = (DateTime?)r.CancelledDate,
                    cancelReason  = (string?)r.CancelReason,
                    createdBy     = (string?)r.CreatedBy,
                    createdDate   = (DateTime?)r.CreatedDate,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "GrnUnregReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating GRN Unregistration report." });
            }
        }

        // ── RETURN TO VENDOR REPORT ───────────────────────────────────────────
        [HttpGet("rtv")]
        public async Task<IActionResult> RtvReport(
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int?    supplierId = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? createdBy  = null)
        {
            try
            {
                var p = new
                {
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    SupplierId = supplierId,
                    JobId      = string.IsNullOrWhiteSpace(jobId)     ? null : jobId.Trim(),
                    Status     = string.IsNullOrWhiteSpace(status)    ? null : status,
                    CreatedBy  = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportRTVs", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    rtvId        = (int)r.RtvId,
                    rtvNumber    = (string)r.RtvNumber,
                    rtvDate      = (DateTime?)r.RtvDate,
                    status       = (string)r.Status,
                    supplierId   = (int?)r.SupplierId,
                    supplierName = (string?)r.SupplierName,
                    grnNumber    = (string?)r.GrnNumber,
                    poNumber     = (string?)r.PoNumber,
                    jobId        = (string?)r.JobId,
                    jobTitle     = (string?)r.JobTitle,
                    returnReason     = (string?)r.ReturnReason,
                    currencyShort    = (string?)r.CurrencyShort,
                    exchangeRate     = (decimal?)r.ExchangeRate,
                    totalAmount      = (decimal?)r.TotalAmount,
                    totalAmountBase  = (decimal?)r.TotalAmountBase,
                    remarks      = (string?)r.Remarks,
                    createdBy    = (string?)r.CreatedBy,
                    createdDate  = (DateTime?)r.CreatedDate,
                    lineCount    = (int)r.LineCount,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "RtvReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating RTV report." });
            }
        }

        // ── CUSTOMER INVOICE REPORT ───────────────────────────────────────────
        [HttpGet("invoice")]
        public async Task<IActionResult> InvoiceReport(
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int?    customerId = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? createdBy  = null)
        {
            try
            {
                var p = new
                {
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    CustomerId = customerId,
                    JobId      = string.IsNullOrWhiteSpace(jobId)     ? null : jobId.Trim(),
                    Status     = string.IsNullOrWhiteSpace(status)    ? null : status,
                    CreatedBy  = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportInvoices", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    invoiceId       = (int)r.InvoiceId,
                    invoiceNo       = (string)r.InvoiceNo,
                    invoiceDate     = (DateTime?)r.InvoiceDate,
                    customerId      = (int?)r.CustomerId,
                    customerName    = (string?)r.CustomerName,
                    jobId           = (string?)r.JobId,
                    jobTitle        = (string?)r.JobTitle,
                    currencyShort   = (string?)r.CurrencyShort,
                    exchangeRate    = (decimal?)r.ExchangeRate,
                    baseCurrency    = (string?)r.BaseCurrency,
                    subTotal        = (decimal?)r.SubTotal,
                    taxAmount       = (decimal?)r.TaxAmount,
                    totalAmount     = (decimal?)r.TotalAmount,
                    subTotalBase    = (decimal?)r.SubTotalBase,
                    taxAmountBase   = (decimal?)r.TaxAmountBase,
                    totalAmountBase = (decimal?)r.TotalAmountBase,
                    paidBase        = (decimal?)r.PaidBase,
                    balanceBase     = (decimal?)r.BalanceBase,
                    status          = (string)r.Status,
                    lpoNo           = (string?)r.LpoNo,
                    createdBy       = (string?)r.CreatedBy,
                    createdDate     = (DateTime?)r.CreatedDate,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "InvoiceReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Invoice report." });
            }
        }

        // ── RECEIPT VOUCHER REPORT ────────────────────────────────────────────
        [HttpGet("receipt")]
        public async Task<IActionResult> ReceiptVoucherReport(
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int?    customerId = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? createdBy  = null)
        {
            try
            {
                var p = new
                {
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    CustomerId = customerId,
                    Status     = string.IsNullOrWhiteSpace(status)    ? null : status,
                    CreatedBy  = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportReceiptVouchers", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    rvId               = (int)r.RvId,
                    rvNumber           = (string)r.RvNumber,
                    rvDate             = (DateTime?)r.RvDate,
                    customerId         = (int?)r.CustomerId,
                    customerName       = (string?)r.CustomerName,
                    currencyShort      = (string?)r.CurrencyShort,
                    exchangeRate       = (decimal?)r.ExchangeRate,
                    baseCurrency       = (string?)r.BaseCurrency,
                    paymentMode        = (string?)r.PaymentMode,
                    referenceNo        = (string?)r.ReferenceNo,
                    amountReceived     = (decimal?)r.AmountReceived,
                    amountReceivedBase = (decimal?)r.AmountReceivedBase,
                    allocatedAmount    = (decimal?)r.AllocatedAmount,
                    allocatedBase      = (decimal?)r.AllocatedBase,
                    unallocatedAmount  = (decimal?)r.UnallocatedAmount,
                    unallocatedBase    = (decimal?)r.UnallocatedBase,
                    status             = (string)r.Status,
                    createdBy          = (string?)r.CreatedBy,
                    createdDate        = (DateTime?)r.CreatedDate,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "ReceiptVoucherReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Receipt Voucher report." });
            }
        }

        // ── CREDIT NOTE REPORT ────────────────────────────────────────────────
        [HttpGet("credit-note")]
        public async Task<IActionResult> CreditNoteReport(
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int?    customerId = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? creditType = null,
            [FromQuery] string? createdBy  = null)
        {
            try
            {
                var p = new
                {
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom)   ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)     ? null : dateTo,
                    CustomerId = customerId,
                    Status     = string.IsNullOrWhiteSpace(status)     ? null : status,
                    CreditType = string.IsNullOrWhiteSpace(creditType) ? null : creditType.Trim(),
                    CreatedBy  = string.IsNullOrWhiteSpace(createdBy)  ? null : createdBy.Trim(),
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportCreditNotes", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    cnId              = (int)r.CnId,
                    cnNumber          = (string)r.CnNumber,
                    cnDate            = (DateTime?)r.CnDate,
                    customerId        = (int?)r.CustomerId,
                    customerName      = (string?)r.CustomerName,
                    currencyShort     = (string?)r.CurrencyShort,
                    exchangeRate      = (decimal?)r.ExchangeRate,
                    baseCurrency      = (string?)r.BaseCurrency,
                    creditType        = (string?)r.CreditType,
                    creditAmount      = (decimal?)r.CreditAmount,
                    creditAmountBase  = (decimal?)r.CreditAmountBase,
                    allocatedAmount   = (decimal?)r.AllocatedAmount,
                    allocatedBase     = (decimal?)r.AllocatedBase,
                    unallocatedAmount = (decimal?)r.UnallocatedAmount,
                    unallocatedBase   = (decimal?)r.UnallocatedBase,
                    status            = (string)r.Status,
                    reason            = (string?)r.Reason,
                    createdBy         = (string?)r.CreatedBy,
                    createdDate       = (DateTime?)r.CreatedDate,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "CreditNoteReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Credit Note report." });
            }
        }

        // ── DEBIT NOTE REPORT ─────────────────────────────────────────────────
        [HttpGet("debit-note")]
        public async Task<IActionResult> DebitNoteReport(
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int?    supplierId = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? debitType  = null,
            [FromQuery] string? createdBy  = null)
        {
            try
            {
                var p = new
                {
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    SupplierId = supplierId,
                    Status     = string.IsNullOrWhiteSpace(status)    ? null : status,
                    DebitType  = string.IsNullOrWhiteSpace(debitType) ? null : debitType.Trim(),
                    CreatedBy  = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportDebitNotes", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    dnId              = (int)r.DnId,
                    dnNumber          = (string)r.DnNumber,
                    dnDate            = (DateTime?)r.DnDate,
                    supplierId        = (int?)r.SupplierId,
                    supplierName      = (string?)r.SupplierName,
                    currencyShort     = (string?)r.CurrencyShort,
                    exchangeRate      = (decimal?)r.ExchangeRate,
                    baseCurrency      = (string?)r.BaseCurrency,
                    debitType         = (string?)r.DebitType,
                    debitAmount       = (decimal?)r.DebitAmount,
                    debitAmountBase   = (decimal?)r.DebitAmountBase,
                    allocatedAmount   = (decimal?)r.AllocatedAmount,
                    allocatedBase     = (decimal?)r.AllocatedBase,
                    unallocatedAmount = (decimal?)r.UnallocatedAmount,
                    unallocatedBase   = (decimal?)r.UnallocatedBase,
                    status            = (string)r.Status,
                    reason            = (string?)r.Reason,
                    createdBy         = (string?)r.CreatedBy,
                    createdDate       = (DateTime?)r.CreatedDate,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "DebitNoteReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Debit Note report." });
            }
        }

        // ── GRN REPORT ───────────────────────────────────────────────────────
        [HttpGet("grn")]
        public async Task<IActionResult> GrnReport(
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int?    supplierId = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? createdBy  = null)
        {
            try
            {
                var p = new
                {
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    SupplierId = supplierId,
                    JobId      = string.IsNullOrWhiteSpace(jobId)     ? null : jobId.Trim(),
                    Status     = string.IsNullOrWhiteSpace(status)    ? null : status,
                    CreatedBy  = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportGRNs", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    grnId         = (int)r.GrnId,
                    grnNumber     = (string)r.GrnNumber,
                    grnDate       = (DateTime?)r.GrnDate,
                    vendorName    = (string?)r.VendorName,
                    jobId         = (string?)r.JobId,
                    jobTitle      = (string?)r.JobTitle,
                    status        = (string)r.Status,
                    doNo          = (string?)r.DoNo,
                    invoiceNo     = (string?)r.InvoiceNo,
                    totalAmount   = (decimal?)r.TotalAmount,
                    currencyShort = (string?)r.CurrencyShort,
                    receivedBy    = (string?)r.ReceivedBy,
                    createdBy     = (string?)r.CreatedBy,
                    poNumber      = (string?)r.PoNumber,
                    lineCount     = (int)r.LineCount,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "GrnReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating GRN report." });
            }
        }

        // ── ISSUE NOTE REPORT ─────────────────────────────────────────────────
        [HttpGet("issue")]
        public async Task<IActionResult> IssueReport(
            [FromQuery] string? dateFrom    = null,
            [FromQuery] string? dateTo      = null,
            [FromQuery] string? jobId       = null,
            [FromQuery] string? status      = null,
            [FromQuery] string? createdBy   = null,
            [FromQuery] string? costingType = null)
        {
            try
            {
                var p = new
                {
                    DateFrom    = string.IsNullOrWhiteSpace(dateFrom)    ? null : dateFrom,
                    DateTo      = string.IsNullOrWhiteSpace(dateTo)      ? null : dateTo,
                    JobId       = string.IsNullOrWhiteSpace(jobId)       ? null : jobId.Trim(),
                    Status      = string.IsNullOrWhiteSpace(status)      ? null : status,
                    CreatedBy   = string.IsNullOrWhiteSpace(createdBy)   ? null : createdBy.Trim(),
                    CostingType = string.IsNullOrWhiteSpace(costingType) ? null : costingType,
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportIssues", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    issueId     = (int)r.IssueId,
                    issueNo     = (string)r.IssueNo,
                    issueDate   = (DateTime?)r.IssueDate,
                    jobId       = (string?)r.JobId,
                    jobTitle    = (string?)r.JobTitle,
                    status      = (string)r.Status,
                    issuedTo    = (string?)r.IssuedTo,
                    costingType = (string?)r.CostingType,
                    createdBy   = (string?)r.CreatedBy,
                    lineCount   = (int)r.LineCount,
                    totalValue  = (decimal?)r.TotalValue,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "IssueReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Issue Note report." });
            }
        }

        // ── ISSUE DETAILS REPORT (line-level) ─────────────────────────────────
        [HttpGet("issue-details")]
        public async Task<IActionResult> IssueDetailsReport(
            [FromQuery] string? dateFrom    = null,
            [FromQuery] string? dateTo      = null,
            [FromQuery] string? jobId       = null,
            [FromQuery] int?    itemId      = null,
            [FromQuery] int?    itemTypeId  = null,
            [FromQuery] int?    categoryId  = null,
            [FromQuery] string? searchText  = null,
            [FromQuery] string? status      = null,
            [FromQuery] string? costingType = null)
        {
            try
            {
                var p = new
                {
                    DateFrom    = string.IsNullOrWhiteSpace(dateFrom)    ? null : dateFrom,
                    DateTo      = string.IsNullOrWhiteSpace(dateTo)      ? null : dateTo,
                    JobId       = string.IsNullOrWhiteSpace(jobId)       ? null : jobId.Trim(),
                    ItemId      = itemId,
                    ItemTypeId  = itemTypeId,
                    CategoryId  = categoryId,
                    SearchText  = string.IsNullOrWhiteSpace(searchText)  ? null : searchText.Trim(),
                    Status      = string.IsNullOrWhiteSpace(status)      ? null : status,
                    CostingType = string.IsNullOrWhiteSpace(costingType) ? null : costingType,
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportIssueDetails", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    issueId     = (int)r.IssueId,
                    issueNo     = (string?)r.IssueNo,
                    issueDate   = (DateTime?)r.IssueDate,
                    jobId       = (string?)r.JobId,
                    projectName = (string?)r.ProjectName,
                    status      = (string?)r.Status,
                    costingType = (string?)r.CostingType,
                    issuedTo    = (string?)r.IssuedTo,
                    issueLineId = (int)r.IssueLineId,
                    lineNum     = (int?)r.LineNum,
                    itemId      = (int?)r.ItemId,
                    itemCode    = (string?)r.ItemCode,
                    itemDesc    = (string?)r.ItemDesc,
                    categoryName = (string?)r.CategoryName,
                    itemTypeName = (string?)r.ItemTypeName,
                    qty         = (decimal?)r.Qty,
                    uomName     = (string?)r.UomName,
                    unitCost    = (decimal?)r.UnitCost,
                    lineTotal   = (decimal?)r.LineTotal,
                    notes       = (string?)r.Notes,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "IssueDetailsReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Issue Details report." });
            }
        }

        // ── PURCHASE DETAILS REPORT (line-level stock receipts) ───────────────
        [HttpGet("purchase-details")]
        public async Task<IActionResult> PurchaseDetailsReport(
            [FromQuery] string? dateFrom    = null,
            [FromQuery] string? dateTo      = null,
            [FromQuery] string? receiptType = null,
            [FromQuery] string? jobId       = null,
            [FromQuery] int?    itemId      = null,
            [FromQuery] int?    itemTypeId  = null,
            [FromQuery] int?    categoryId  = null,
            [FromQuery] string? searchText  = null,
            [FromQuery] string? status      = null)
        {
            try
            {
                var p = new
                {
                    DateFrom    = string.IsNullOrWhiteSpace(dateFrom)    ? null : dateFrom,
                    DateTo      = string.IsNullOrWhiteSpace(dateTo)      ? null : dateTo,
                    ReceiptType = string.IsNullOrWhiteSpace(receiptType) ? null : receiptType.Trim().ToUpper(),
                    JobId       = string.IsNullOrWhiteSpace(jobId)       ? null : jobId.Trim(),
                    ItemId      = itemId,
                    ItemTypeId  = itemTypeId,
                    CategoryId  = categoryId,
                    SearchText  = string.IsNullOrWhiteSpace(searchText)  ? null : searchText.Trim(),
                    Status      = string.IsNullOrWhiteSpace(status)      ? null : status,
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportPurchaseDetails", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    receiptId    = (int)r.ReceiptId,
                    receiptNo    = (string?)r.ReceiptNo,
                    receiptDate  = (DateTime?)r.ReceiptDate,
                    receiptType  = (string?)r.ReceiptType,
                    jobId        = (string?)r.JobId,
                    projectName  = (string?)r.ProjectName,
                    supplierName = (string?)r.SupplierName,
                    poNumber     = (string?)r.PoNumber,
                    supplierRef  = (string?)r.SupplierRef,
                    status       = (string?)r.Status,
                    receiptLineId = (int)r.ReceiptLineId,
                    lineNum      = (int?)r.LineNum,
                    itemId       = (int?)r.ItemId,
                    itemCode     = (string?)r.ItemCode,
                    itemDesc     = (string?)r.ItemDesc,
                    categoryName = (string?)r.CategoryName,
                    itemTypeName = (string?)r.ItemTypeName,
                    qty          = (decimal?)r.Qty,
                    uomName      = (string?)r.UomName,
                    unitCost     = (decimal?)r.UnitCost,
                    lineTotal    = (decimal?)r.LineTotal,
                    isJobStock   = (bool?)r.IsJobStock,
                    notes        = (string?)r.Notes,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "PurchaseDetailsReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Purchase Details report." });
            }
        }

        // ── ISSUE RETURN REPORT ───────────────────────────────────────────────
        [HttpGet("issue-return")]
        public async Task<IActionResult> IssueReturnReport(
            [FromQuery] string? dateFrom  = null,
            [FromQuery] string? dateTo    = null,
            [FromQuery] string? jobId     = null,
            [FromQuery] string? status    = null,
            [FromQuery] string? createdBy = null)
        {
            try
            {
                var p = new
                {
                    DateFrom  = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo    = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    JobId     = string.IsNullOrWhiteSpace(jobId)     ? null : jobId.Trim(),
                    Status    = string.IsNullOrWhiteSpace(status)    ? null : status,
                    CreatedBy = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportIssueReturns", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    returnId   = (int)r.ReturnId,
                    returnNo   = (string)r.ReturnNo,
                    returnDate = (DateTime?)r.ReturnDate,
                    issueNo    = (string?)r.IssueNo,
                    jobId      = (string?)r.JobId,
                    jobTitle   = (string?)r.JobTitle,
                    status     = (string)r.Status,
                    returnedBy = (string?)r.ReturnedBy,
                    createdBy  = (string?)r.CreatedBy,
                    lineCount  = (int)r.LineCount,
                    totalValue = (decimal?)r.TotalValue,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "IssueReturnReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Issue Return report." });
            }
        }

        // ── BOM REPORT ───────────────────────────────────────────────────────
        [HttpGet("bom")]
        public async Task<IActionResult> BomReport(
            [FromQuery] string? dateFrom  = null,
            [FromQuery] string? dateTo    = null,
            [FromQuery] string? jobId     = null,
            [FromQuery] string? jobTypeId = null,
            [FromQuery] string? bomStatus = null,
            [FromQuery] string? createdBy = null)
        {
            try
            {
                var p = new
                {
                    DateFrom  = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo    = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    JobId     = string.IsNullOrWhiteSpace(jobId)     ? null : jobId.Trim(),
                    JobTypeId = string.IsNullOrWhiteSpace(jobTypeId) ? null : jobTypeId.Trim(),
                    BomStatus = string.IsNullOrWhiteSpace(bomStatus) ? null : bomStatus.Trim(),
                    CreatedBy = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportBOM", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    bomHeaderId    = (int)r.BomHeaderId,
                    jobId          = (string?)r.JobId,
                    bomDate        = (DateTime?)r.BomDate,
                    bomVersion     = (int?)r.BomVersion,
                    bomStatus      = (string?)r.BomStatus,
                    totalBomValue  = (decimal?)r.TotalBomValue,
                    bomApprovedBy  = (string?)r.BomApprovedBy,
                    bomApprovedDate= (DateTime?)r.BomApprovedDate,
                    createdBy      = (string?)r.CreatedBy,
                    createdDate    = (DateTime?)r.CreatedDate,
                    customerName   = (string?)r.CustomerName,
                    projectName    = (string?)r.ProjectName,
                    jobTypeName    = (string?)r.JobTypeName,
                    currencySymbol = (string?)r.CurrencySymbol,
                    jobExcRate     = (decimal?)r.JobExcRate,
                    jobStatusName  = (string?)r.JobStatusName,
                    lineCount      = (int)r.LineCount,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "BomReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating BOM report." });
            }
        }

        // ── SERVICE RECEIPT REPORT ────────────────────────────────────────────
        [HttpGet("srv")]
        public async Task<IActionResult> SrvReport(
            [FromQuery] string? dateFrom  = null,
            [FromQuery] string? dateTo    = null,
            [FromQuery] string? jobId     = null,
            [FromQuery] string? status    = null,
            [FromQuery] string? createdBy = null)
        {
            try
            {
                var p = new
                {
                    DateFrom  = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo    = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    JobId     = string.IsNullOrWhiteSpace(jobId)     ? null : jobId.Trim(),
                    Status    = string.IsNullOrWhiteSpace(status)    ? null : status,
                    CreatedBy = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportSRVs", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    srvId        = (int)r.SrvId,
                    srvNo        = (string)r.SrvNo,
                    srvDate      = (DateTime?)r.SrvDate,
                    supplierName = (string?)r.SupplierName,
                    poNumber     = (string?)r.PoNumber,
                    jobId        = (string?)r.JobId,
                    jobTitle     = (string?)r.JobTitle,
                    status         = (string)r.Status,
                    currencyShort  = (string?)r.CurrencyShort,
                    exchangeRate   = (decimal?)r.ExchangeRate,
                    createdBy      = (string?)r.CreatedBy,
                    lineCount      = (int)r.LineCount,
                    totalCost      = (decimal?)r.TotalCost,
                    totalCostBase  = (decimal?)r.TotalCostBase,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "SrvReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Service Receipt report." });
            }
        }

        // ── BACKLOG: BOM → PR ────────────────────────────────────────────────
        [HttpGet("backlog/bom-to-pr")]
        public async Task<IActionResult> BacklogBomToPr(
            [FromQuery] string? jobId    = null,
            [FromQuery] int?    critical = null)
        {
            try
            {
                var p = new
                {
                    JobId    = string.IsNullOrWhiteSpace(jobId) ? null : jobId.Trim(),
                    Critical = critical,
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_BacklogBomToPr", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    bomHeaderId      = (int)r.BomHeaderId,
                    jobId            = (string?)r.JobId,
                    projectName      = (string?)r.ProjectName,
                    sectionName      = (string?)r.SectionName,
                    itemCode         = (string?)r.ItemCode,
                    itemName         = (string?)r.ItemName,
                    uomName          = (string?)r.UomName,
                    bomRequestedQty  = (decimal?)r.BomRequestedQty,
                    prCreatedQty     = (decimal?)r.PrCreatedQty,
                    pendingQty       = (decimal?)r.PendingQty,
                    bomPrice         = (decimal?)r.BomPrice,
                    pendingValue     = (decimal?)r.PendingValue,
                    lineStatus       = (string?)r.LineStatus,
                    isCritical       = (bool?)r.IsCritical,
                    itemReqDate      = (DateTime?)r.ItemReqDate,
                    expectedDelivery = (DateTime?)r.ExpectedDelivery,
                    remarks          = (string?)r.Remarks,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "BacklogBomToPr", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating BOM→PR backlog report." });
            }
        }

        // ── BACKLOG: PR → PO ─────────────────────────────────────────────────
        [HttpGet("backlog/pr-to-po")]
        public async Task<IActionResult> BacklogPrToPo(
            [FromQuery] string? jobId = null)
        {
            try
            {
                var p = new
                {
                    JobId = string.IsNullOrWhiteSpace(jobId) ? null : jobId.Trim(),
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_BacklogPrToPo", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    prId          = (int)r.PrId,
                    prNumber      = (string?)r.PrNumber,
                    prDate        = (DateTime?)r.PrDate,
                    jobId         = (string?)r.JobId,
                    projectName   = (string?)r.ProjectName,
                    priority      = (string?)r.Priority,
                    prStatus      = (string?)r.PrStatus,
                    prLineId      = (int)r.PrLineId,
                    lineNum       = (int?)r.LineNum,
                    itemCode      = (string?)r.ItemCode,
                    itemDesc      = (string?)r.ItemDesc,
                    uomName       = (string?)r.UomName,
                    requiredQty   = (decimal?)r.RequiredQty,
                    poCreatedQty  = (decimal?)r.PoCreatedQty,
                    pendingQty    = (decimal?)r.PendingQty,
                    estUnitPrice  = (decimal?)r.EstUnitPrice,
                    pendingValue  = (decimal?)r.PendingValue,
                    requiredDate  = (DateTime?)r.RequiredDate,
                    remarks       = (string?)r.Remarks,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "BacklogPrToPo", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating PR→PO backlog report." });
            }
        }

        // ── BACKLOG: PO → GRN ────────────────────────────────────────────────
        [HttpGet("backlog/po-to-grn")]
        public async Task<IActionResult> BacklogPoToGrn(
            [FromQuery] string? jobId      = null,
            [FromQuery] int?    supplierId = null)
        {
            try
            {
                var p = new
                {
                    JobId      = string.IsNullOrWhiteSpace(jobId) ? null : jobId.Trim(),
                    SupplierId = supplierId,
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_BacklogPoToGrn", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    poId          = (int)r.PoId,
                    poNumber      = (string?)r.PoNumber,
                    poDate        = (DateTime?)r.PoDate,
                    supplierId    = (int?)r.SupplierId,
                    supplierName  = (string?)r.SupplierName,
                    jobId         = (string?)r.JobId,
                    projectName   = (string?)r.ProjectName,
                    poStatus      = (string?)r.PoStatus,
                    priority      = (string?)r.Priority,
                    deliveryDate  = (DateTime?)r.DeliveryDate,
                    currencyShort = (string?)r.CurrencyShort,
                    poLineId      = (int)r.PoLineId,
                    lineNum       = (int?)r.LineNum,
                    itemCode      = (string?)r.ItemCode,
                    itemDesc      = (string?)r.ItemDesc,
                    uomName       = (string?)r.UomName,
                    orderedQty    = (decimal?)r.OrderedQty,
                    receivedQty   = (decimal?)r.ReceivedQty,
                    pendingQty    = (decimal?)r.PendingQty,
                    unitPrice     = (decimal?)r.UnitPrice,
                    pendingValue  = (decimal?)r.PendingValue,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "BacklogPoToGrn", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating PO→GRN backlog report." });
            }
        }

        // ── ISSUE ITEMS PER JOB ──────────────────────────────────────────────
        [HttpGet("backlog/issue-items")]
        public async Task<IActionResult> IssueItemsPerJob(
            [FromQuery] string? jobId  = null,
            [FromQuery] string? status = null)
        {
            try
            {
                var p = new
                {
                    JobId  = string.IsNullOrWhiteSpace(jobId)  ? null : jobId.Trim(),
                    Status = string.IsNullOrWhiteSpace(status) ? null : status,
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_IssueItemsPerJob", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    issueId     = (int)r.IssueId,
                    issueNo     = (string?)r.IssueNo,
                    issueDate   = (DateTime?)r.IssueDate,
                    jobId       = (string?)r.JobId,
                    projectName = (string?)r.ProjectName,
                    status      = (string?)r.Status,
                    issuedTo    = (string?)r.IssuedTo,
                    issueLineId = (int)r.IssueLineId,
                    lineNum     = (int?)r.LineNum,
                    itemCode    = (string?)r.ItemCode,
                    itemDesc    = (string?)r.ItemDesc,
                    qty         = (decimal?)r.Qty,
                    uomName     = (string?)r.UomName,
                    unitCost    = (decimal?)r.UnitCost,
                    lineTotal   = (decimal?)r.LineTotal,
                    notes       = (string?)r.Notes,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "IssueItemsPerJob", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Issue Items report." });
            }
        }

        // ── PO REPORT ────────────────────────────────────────────────────────
        [HttpGet("po")]
        public async Task<IActionResult> PoReport(
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int?    supplierId = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] string? createdBy  = null,
            [FromQuery] string? priority   = null,
            [FromQuery] bool    noGrnOnly  = false,
            [FromQuery] string? grnFilter  = null,
            [FromQuery] string? approvedBy = null,
            [FromQuery] string? submittedBy = null)
        {
            try
            {
                var p = new
                {
                    DateFrom    = string.IsNullOrWhiteSpace(dateFrom)   ? null : dateFrom,
                    DateTo      = string.IsNullOrWhiteSpace(dateTo)     ? null : dateTo,
                    SupplierId  = supplierId,
                    Status      = string.IsNullOrWhiteSpace(status)     ? null : status,
                    JobId       = string.IsNullOrWhiteSpace(jobId)      ? null : jobId.Trim(),
                    CreatedBy   = string.IsNullOrWhiteSpace(createdBy)  ? null : createdBy.Trim(),
                    Priority    = string.IsNullOrWhiteSpace(priority)   ? null : priority,
                    NoGrnOnly   = noGrnOnly ? 1 : 0,
                    GrnFilter   = string.IsNullOrWhiteSpace(grnFilter)  ? null : grnFilter.Trim().ToUpper(),
                    ApprovedBy  = string.IsNullOrWhiteSpace(approvedBy) ? null : approvedBy.Trim(),
                    SubmittedBy = string.IsNullOrWhiteSpace(submittedBy)? null : submittedBy.Trim(),
                };

                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportPOs", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    poId           = (int)r.PoId,
                    poNumber       = (string)r.PoNumber,
                    poDate         = (DateTime?)r.PoDate,
                    supplierId     = (int?)r.SupplierId,
                    vendorName     = (string?)r.VendorName,
                    jobId          = (string?)r.JobId,
                    jobTitle       = (string?)r.JobTitle,
                    status         = (string)r.Status,
                    priority       = (string?)r.Priority,
                    currencyShort      = (string?)r.CurrencyShort,
                    exchangeRate       = (decimal?)r.ExchangeRate,
                    totalAmount        = (decimal?)r.TotalAmount,
                    totalAmountBase    = (decimal?)r.TotalAmountBase,
                    taxAmount          = (decimal?)r.TaxAmount,
                    taxAmountBase      = (decimal?)r.TaxAmountBase,
                    revision       = (int?)r.Revision,
                    createdBy      = (string?)r.CreatedBy,
                    modifiedBy     = (string?)r.ModifiedBy,
                    submittedBy    = (string?)r.SubmittedBy,
                    approvedBy     = (string?)r.ApprovedBy,
                    approvedDate   = (DateTime?)r.ApprovedDate,
                    vendorRef      = (string?)r.VendorRef,
                    deliveryDate   = (DateTime?)r.DeliveryDate,
                    createdDate    = (DateTime?)r.CreatedDate,
                    lineCount      = (int)r.LineCount,
                    grnCount       = (int)r.GrnCount,
                    receivedAmount     = (decimal)r.ReceivedAmount,
                    receivedAmountBase = (decimal)r.ReceivedAmountBase,
                    linkedPRs      = (string?)r.LinkedPRs,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "PoReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating PO report." });
            }
        }

        // ── JOB ITEM LEDGER — LOOKUPS ────────────────────────────────────────
        [HttpGet("job-item-ledger/lookups")]
        public async Task<IActionResult> JobItemLedgerLookups()
        {
            try
            {
                using var multi = await _dbcon.QueryMultipleAsync("sp_JobItemLedgerLookups", null);
                var jobTypes    = (await multi.ReadAsync<dynamic>()).Select(r => new { id = (string)r.Id, name = (string)r.Name });
                var categories  = (await multi.ReadAsync<dynamic>()).Select(r => new { id = (string)r.Id, name = (string)r.Name });
                var subCats     = (await multi.ReadAsync<dynamic>()).Select(r => new { id = (string)r.Id, name = (string)r.Name, parentId = (string?)r.ParentId });
                var itemTypes   = (await multi.ReadAsync<dynamic>()).Select(r => new { id = (string)r.Id, name = (string)r.Name });
                return Ok(new { jobTypes, categories, subCategories = subCats, itemTypes });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "JobItemLedgerLookups", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading lookups." });
            }
        }

        // ── JOB ITEM LEDGER — SUMMARY ────────────────────────────────────────
        [HttpGet("job-item-ledger")]
        public async Task<IActionResult> JobItemLedger(
            [FromQuery] string? dateFrom      = null,
            [FromQuery] string? dateTo        = null,
            [FromQuery] string? jobId         = null,
            [FromQuery] string? jobTypeId     = null,
            [FromQuery] int?    categoryId    = null,
            [FromQuery] int?    subCategoryId = null,
            [FromQuery] int?    itemTypeId    = null,
            [FromQuery] int?    itemId        = null)
        {
            try
            {
                var p = new
                {
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    JobId         = string.IsNullOrWhiteSpace(jobId)     ? null : jobId.Trim(),
                    JobTypeId     = string.IsNullOrWhiteSpace(jobTypeId) ? null : jobTypeId.Trim(),
                    CategoryId    = categoryId,
                    SubCategoryId = subCategoryId,
                    ItemTypeId    = itemTypeId,
                    ItemId        = itemId,
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_JobItemLedgerSummary", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    jobId              = (string)r.JobId,
                    projectName        = (string?)r.ProjectName,
                    jobTypeId          = (string?)r.JobTypeId,
                    jobTypeName        = (string?)r.JobTypeName,
                    itemId             = (int)r.ItemId,
                    itemCode           = (string?)r.ItemCode,
                    itemName           = (string?)r.ItemName,
                    uomName            = (string?)r.UomName,
                    categoryName       = (string?)r.CategoryName,
                    subCategoryName    = (string?)r.SubCategoryName,
                    itemCategoryId     = (int?)r.ItemCategoryId,
                    rootCategoryId     = (int?)r.RootCategoryId,
                    itemTypeName       = (string?)r.ItemTypeName,
                    itemTypeId         = (int?)r.ItemTypeId,
                    totalReceivedQty   = (decimal?)r.TotalReceivedQty,
                    totalReceivedValue = (decimal?)r.TotalReceivedValue,
                    totalIssuedQty     = (decimal?)r.TotalIssuedQty,
                    totalIssuedValue   = (decimal?)r.TotalIssuedValue,
                    netQty             = (decimal?)r.NetQty,
                    netValue           = (decimal?)r.NetValue,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "JobItemLedger", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Job Item Ledger." });
            }
        }

        // ── JOB ITEM LEDGER — IN (GRN receipts) ─────────────────────────────
        [HttpGet("job-item-ledger/in")]
        public async Task<IActionResult> JobItemLedgerIn(
            [FromQuery] string? dateFrom = null,
            [FromQuery] string? dateTo   = null,
            [FromQuery] string? jobId    = null,
            [FromQuery] int?    itemId   = null)
        {
            try
            {
                var p = new
                {
                    DateFrom = string.IsNullOrWhiteSpace(dateFrom) ? null : dateFrom,
                    DateTo   = string.IsNullOrWhiteSpace(dateTo)   ? null : dateTo,
                    JobId    = string.IsNullOrWhiteSpace(jobId)    ? null : jobId.Trim(),
                    ItemId   = itemId,
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_JobItemLedgerIn", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    grnId        = (int)r.GrnId,
                    grnNumber    = (string?)r.GrnNumber,
                    grnDate      = (DateTime?)r.GrnDate,
                    jobId        = (string?)r.JobId,
                    projectName  = (string?)r.ProjectName,
                    supplierName = (string?)r.SupplierName,
                    poNumber     = (string?)r.PoNumber,
                    grnDetailId  = (int)r.GrnDetailId,
                    lineNum      = (int?)r.LineNum,
                    itemDesc     = (string?)r.ItemDesc,
                    receivedQty  = (decimal?)r.ReceivedQty,
                    uomName      = (string?)r.UomName,
                    unitPrice    = (decimal?)r.UnitPrice,
                    lineTotal    = (decimal?)r.LineTotal,
                    invoiceNo    = (string?)r.InvoiceNo,
                    doNo         = (string?)r.DoNo,
                    status       = (string?)r.Status,
                    createdBy    = (string?)r.CreatedBy,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "JobItemLedgerIn", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading purchase receipts." });
            }
        }

        // ── INVENTORY GRN (STOCK RECEIPT) REPORT ────────────────────────────
        [HttpGet("inventory-grn")]
        public async Task<IActionResult> InventoryGrnReport(
            [FromQuery] string? dateFrom    = null,
            [FromQuery] string? dateTo      = null,
            [FromQuery] string? status      = null,
            [FromQuery] string? receiptType = null,
            [FromQuery] string? jobId       = null,
            [FromQuery] string? createdBy   = null)
        {
            try
            {
                var p = new
                {
                    DateFrom    = string.IsNullOrWhiteSpace(dateFrom)    ? null : dateFrom,
                    DateTo      = string.IsNullOrWhiteSpace(dateTo)      ? null : dateTo,
                    Status      = string.IsNullOrWhiteSpace(status)      ? null : status,
                    ReceiptType = string.IsNullOrWhiteSpace(receiptType) ? null : receiptType.ToUpper(),
                    JobId       = string.IsNullOrWhiteSpace(jobId)       ? null : jobId.Trim(),
                    CreatedBy   = string.IsNullOrWhiteSpace(createdBy)   ? null : createdBy.Trim(),
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportInventoryGRN", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    receiptId    = (int)r.ReceiptId,
                    receiptNo    = (string)r.ReceiptNo,
                    receiptDate  = (DateTime?)r.ReceiptDate,
                    receiptType  = (string)r.ReceiptType,
                    jobId        = (string?)r.JobId,
                    supplierName = (string?)r.SupplierName,
                    poNumber     = (string?)r.PoNumber,
                    supplierRef  = (string?)r.SupplierRef,
                    status       = (string)r.Status,
                    notes        = (string?)r.Notes,
                    createdBy    = (string?)r.CreatedBy,
                    createdDate  = (DateTime?)r.CreatedDate,
                    lineCount    = (int)r.LineCount,
                    totalCost    = (decimal)r.TotalCost,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "InventoryGrnReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Inventory GRN report." });
            }
        }

        // ── STOCK BALANCE REPORT ─────────────────────────────────────────────
        [HttpGet("stock-balance")]
        public async Task<IActionResult> StockBalanceReport(
            [FromQuery] string? searchText = null,
            [FromQuery] int?    categoryId = null,
            [FromQuery] int?    itemTypeId = null,
            [FromQuery] int?    itemId     = null,
            [FromQuery] bool    zeroStock  = true)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<StockBalance>("sp_GetStockBalance", new
                {
                    SearchText = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    CategoryId = categoryId,
                    ItemTypeId = itemTypeId,
                    ItemId     = itemId,
                    StockType  = (string?)null,
                    DateFrom   = (DateTime?)null,
                    DateTo     = (DateTime?)null,
                    ZeroStock  = zeroStock ? 1 : 0,
                });
                return Ok(rows ?? Enumerable.Empty<StockBalance>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "StockBalanceReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Stock Balance report." });
            }
        }

        // ── STOCK ADJUSTMENT REPORT ──────────────────────────────────────────
        [HttpGet("stock-adjustment")]
        public async Task<IActionResult> StockAdjustmentReport(
            [FromQuery] string? dateFrom  = null,
            [FromQuery] string? dateTo    = null,
            [FromQuery] string? status    = null,
            [FromQuery] string? reason    = null,
            [FromQuery] string? createdBy = null)
        {
            try
            {
                var p = new
                {
                    DateFrom  = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo    = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    Status    = string.IsNullOrWhiteSpace(status)    ? null : status,
                    Reason    = string.IsNullOrWhiteSpace(reason)    ? null : reason.Trim(),
                    CreatedBy = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportStockAdjustments", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    adjustmentId   = (int)r.AdjustmentId,
                    adjustmentNo   = (string)r.AdjustmentNo,
                    adjustmentDate = (DateTime?)r.AdjustmentDate,
                    reason         = (string?)r.Reason,
                    notes          = (string?)r.Notes,
                    status         = (string)r.Status,
                    postedBy       = (string?)r.PostedBy,
                    postedDate     = (DateTime?)r.PostedDate,
                    createdBy      = (string?)r.CreatedBy,
                    createdDate    = (DateTime?)r.CreatedDate,
                    lineCount      = (int)r.LineCount,
                    totalValue     = (decimal)r.TotalValue,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "StockAdjustmentReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Stock Adjustment report." });
            }
        }

        // ── SUPPLIER INVOICE REPORT ──────────────────────────────────────────
        [HttpGet("supplier-invoice")]
        public async Task<IActionResult> SupplierInvoiceReport(
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int?    supplierId = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? createdBy  = null)
        {
            try
            {
                var p = new
                {
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom)  ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)    ? null : dateTo,
                    SupplierId = supplierId,
                    Status     = string.IsNullOrWhiteSpace(status)    ? null : status,
                    CreatedBy  = string.IsNullOrWhiteSpace(createdBy) ? null : createdBy.Trim(),
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportSupplierInvoices", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    supplierInvoiceId = (int)r.SupplierInvoiceId,
                    invoiceNo         = (string)r.InvoiceNo,
                    supplierInvRef    = (string?)r.SupplierInvRef,
                    invoiceDate       = (DateTime?)r.InvoiceDate,
                    supplierId        = (int?)r.SupplierId,
                    supplierName      = (string?)r.SupplierName,
                    currencyShort     = (string?)r.CurrencyShort,
                    exchangeRate      = (decimal?)r.ExchangeRate,
                    dueDate           = (DateTime?)r.DueDate,
                    subTotal          = (decimal?)r.SubTotal,
                    taxAmount         = (decimal?)r.TaxAmount,
                    totalAmount       = (decimal?)r.TotalAmount,
                    paidAmount        = (decimal?)r.PaidAmount,
                    balanceAmount     = (decimal?)r.BalanceAmount,
                    status            = (string)r.Status,
                    notes             = (string?)r.Notes,
                    createdBy         = (string?)r.CreatedBy,
                    createdDate       = (DateTime?)r.CreatedDate,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "SupplierInvoiceReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Supplier Invoice report." });
            }
        }

        // ── PAYMENT VOUCHER REPORT ───────────────────────────────────────────
        [HttpGet("payment-voucher")]
        public async Task<IActionResult> PaymentVoucherReport(
            [FromQuery] string? dateFrom    = null,
            [FromQuery] string? dateTo      = null,
            [FromQuery] int?    supplierId  = null,
            [FromQuery] string? status      = null,
            [FromQuery] string? createdBy   = null,
            [FromQuery] string? paymentMode = null)
        {
            try
            {
                var p = new
                {
                    DateFrom    = string.IsNullOrWhiteSpace(dateFrom)    ? null : dateFrom,
                    DateTo      = string.IsNullOrWhiteSpace(dateTo)      ? null : dateTo,
                    SupplierId  = supplierId,
                    Status      = string.IsNullOrWhiteSpace(status)      ? null : status,
                    CreatedBy   = string.IsNullOrWhiteSpace(createdBy)   ? null : createdBy.Trim(),
                    PaymentMode = string.IsNullOrWhiteSpace(paymentMode) ? null : paymentMode.Trim(),
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_ReportPaymentVouchers", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    pvId              = (int)r.PvId,
                    pvNumber          = (string)r.PvNumber,
                    pvDate            = (DateTime?)r.PvDate,
                    supplierId        = (int?)r.SupplierId,
                    supplierName      = (string?)r.SupplierName,
                    currencyShort     = (string?)r.CurrencyShort,
                    exchangeRate      = (decimal?)r.ExchangeRate,
                    amountPaid        = (decimal?)r.AmountPaid,
                    allocatedAmount   = (decimal?)r.AllocatedAmount,
                    unallocatedAmount = (decimal?)r.UnallocatedAmount,
                    paymentMode       = (string?)r.PaymentMode,
                    referenceNo       = (string?)r.ReferenceNo,
                    referenceDate     = (DateTime?)r.ReferenceDate,
                    bankName          = (string?)r.BankName,
                    status            = (string)r.Status,
                    createdBy         = (string?)r.CreatedBy,
                    createdDate       = (DateTime?)r.CreatedDate,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "PaymentVoucherReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Payment Voucher report." });
            }
        }

        // ── MANHOUR REPORT ───────────────────────────────────────────────────
        [HttpGet("manhour")]
        public async Task<IActionResult> ManhourReport(
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? mType      = null,
            [FromQuery] string? site       = null,
            [FromQuery] int?    employeeId = null,
            [FromQuery] string? empType    = null,
            [FromQuery] int?    supplierId = null)
        {
            try
            {
                var p = new
                {
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom) ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)   ? null : dateTo,
                    JobId      = string.IsNullOrWhiteSpace(jobId)    ? null : jobId.Trim(),
                    Status     = string.IsNullOrWhiteSpace(status)   ? null : status,
                    MType      = string.IsNullOrWhiteSpace(mType)    ? null : mType.Trim().ToUpper(),
                    Site       = string.IsNullOrWhiteSpace(site)     ? null : site.Trim().ToUpper(),
                    EmployeeId = employeeId,
                    EmpType    = string.IsNullOrWhiteSpace(empType)  ? null : empType.Trim().ToUpper(),
                    SupplierId = supplierId,
                };
                using var grid = await _dbcon.QueryMultipleAsync("sp_ReportManhours", p);
                var batchRows    = (await grid.ReadAsync<dynamic>()).ToList();
                var supplierRows = (await grid.ReadAsync<dynamic>()).ToList();

                var batches = batchRows.Select(r => new
                {
                    batchId           = (int)r.BatchId,
                    documentNo        = (string)r.DocumentNo,
                    documentDate      = (DateTime?)r.DocumentDate,
                    status            = (string)r.Status,
                    uploadedFileName  = (string?)r.UploadedFileName,
                    jobCount          = (int)r.JobCount,
                    employeeCount     = (int)r.EmployeeCount,
                    totalHours        = (decimal)r.TotalHours,
                    totalOTHours      = (decimal)r.TotalOTHours,
                    createdBy         = (string?)r.CreatedBy,
                    createdDate       = (DateTime?)r.CreatedDate,
                });
                var suppliers = supplierRows.Select(r => new
                {
                    supplierId    = (int)r.SupplierId,
                    supplierName  = (string?)r.SupplierName,
                    employeeCount = (int)r.EmployeeCount,
                    batchCount    = (int)r.BatchCount,
                    totalHours    = (decimal)r.TotalHours,
                    totalOTHours  = (decimal)r.TotalOTHours,
                });
                return Ok(new { batches, suppliers });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "ManhourReport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error generating Manhour report." });
            }
        }

        // ── JOB ITEM LEDGER — OUT (Issue notes) ──────────────────────────────
        [HttpGet("job-item-ledger/out")]
        public async Task<IActionResult> JobItemLedgerOut(
            [FromQuery] string? dateFrom = null,
            [FromQuery] string? dateTo   = null,
            [FromQuery] string? jobId    = null,
            [FromQuery] int?    itemId   = null)
        {
            try
            {
                var p = new
                {
                    DateFrom = string.IsNullOrWhiteSpace(dateFrom) ? null : dateFrom,
                    DateTo   = string.IsNullOrWhiteSpace(dateTo)   ? null : dateTo,
                    JobId    = string.IsNullOrWhiteSpace(jobId)    ? null : jobId.Trim(),
                    ItemId   = itemId,
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_JobItemLedgerOut", p);
                var result = (rows ?? Enumerable.Empty<dynamic>()).Select(r => new
                {
                    issueId     = (int)r.IssueId,
                    issueNo     = (string?)r.IssueNo,
                    issueDate   = (DateTime?)r.IssueDate,
                    jobId       = (string?)r.JobId,
                    projectName = (string?)r.ProjectName,
                    issuedTo    = (string?)r.IssuedTo,
                    issueLineId = (int)r.IssueLineId,
                    lineNum     = (int?)r.LineNum,
                    itemDesc    = (string?)r.ItemDesc,
                    qty         = (decimal?)r.Qty,
                    uomName     = (string?)r.UomName,
                    unitCost    = (decimal?)r.UnitCost,
                    lineTotal   = (decimal?)r.LineTotal,
                    notes       = (string?)r.Notes,
                    status      = (string?)r.Status,
                    createdBy   = (string?)r.CreatedBy,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Reports", action: "JobItemLedgerOut", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading issue notes." });
            }
        }
    }
}
