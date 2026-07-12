using Microsoft.AspNetCore.Mvc;
using ERPWEB.Dbcontext;

namespace ERPWEB.Controllers.General
{
    [ApiController]
    [Route("api/dashboard")]
    public class DashboardController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public DashboardController(DbCon dbcon) { _dbcon = dbcon; }

        [HttpGet("drafts")]
        public async Task<IActionResult> GetMyDrafts([FromQuery] int userId = 0)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetMyDrafts", new { UserId = userId });
                var result = rows.Select(r => new {
                    docType     = (string?)r.DocType,
                    docId       = (int)r.DocId,
                    docNo       = (string?)r.DocNo,
                    jobId       = (string?)r.JobId,
                    createdDate = (DateTime?)r.CreatedDate,
                    daysOld     = (int)r.DaysOld,
                    lineCount   = (int)r.LineCount,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Dashboard", action: "GetMyDrafts", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Failed to load drafts." });
            }
        }

        // Procurement analytics — overview, payment monitoring, top suppliers,
        // supplier engagement, category shares, and monthly spend trend.
        [HttpGet("procurement-analytics")]
        public async Task<IActionResult> GetProcurementAnalytics()
        {
            try
            {
                using var multi = await _dbcon.QueryMultipleAsync("sp_GetProcurementAnalytics");
                var overview   = (await multi.ReadAsync<dynamic>()).FirstOrDefault();
                var payments   = (await multi.ReadAsync<dynamic>()).FirstOrDefault();
                var topSup     = (await multi.ReadAsync<dynamic>()).ToList();
                var engagement = (await multi.ReadAsync<dynamic>()).FirstOrDefault();
                var categories = (await multi.ReadAsync<dynamic>()).ToList();
                var trend      = (await multi.ReadAsync<dynamic>()).ToList();

                return Ok(new
                {
                    overview = overview == null ? null : new {
                        totalPR             = (int)overview.totalPR,
                        totalPO             = (int)overview.totalPO,
                        poOutstanding       = (int)overview.poOutstanding,
                        materialOutstanding = (int)overview.materialOutstanding,
                    },
                    payments = payments == null ? null : new {
                        totalInvoice = (int)payments.totalInvoice,
                        openPayment  = (int)payments.openPayment,
                        vendorCount  = (int)payments.vendorCount,
                    },
                    topSuppliers = topSup.Select(r => new {
                        supplierName = (string?)r.supplierName,
                        supplierCode = (string?)r.supplierCode,
                        poCount      = (int)r.poCount,
                        spendBase    = (decimal?)r.spendBase ?? 0m,
                    }),
                    engagement = engagement == null ? null : new {
                        totalSuppliers   = (int)engagement.totalSuppliers,
                        engagedSuppliers = (int)engagement.engagedSuppliers,
                    },
                    categories = categories.Select(r => new {
                        categoryName  = (string?)r.categoryName,
                        supplierCount = (int)r.supplierCount,
                    }),
                    trend = trend.Select(r => new {
                        monthLabel = (string?)r.monthLabel,
                        spendBase  = (decimal?)r.spendBase ?? 0m,
                    }),
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Dashboard", action: "GetProcurementAnalytics", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Failed to load procurement analytics." });
            }
        }

        // Today's document activity for the signed-in user (PO / GRN / Issue / PR created today).
        [HttpGet("today-activity")]
        public async Task<IActionResult> GetTodayActivity([FromQuery] int userId = 0)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetTodayActivity", new { UserId = userId });
                var r = rows.FirstOrDefault();
                if (r == null) return Ok(new { poCount = 0, poValue = 0m, grnCount = 0, issueCount = 0, prCount = 0 });
                return Ok(new {
                    poCount    = (int)r.poCount,
                    poValue    = (decimal?)r.poValue ?? 0m,
                    grnCount   = (int)r.grnCount,
                    issueCount = (int)r.issueCount,
                    prCount    = (int)r.prCount,
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Dashboard", action: "GetTodayActivity", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Failed to load today's activity." });
            }
        }

        // Approved PRs that still have un-ordered balance — the procurement work queue.
        [HttpGet("approved-prs")]
        public async Task<IActionResult> GetApprovedPRsAwaitingPO()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetApprovedPRsAwaitingPO");
                var result = rows.Select(r => new {
                    prId         = (int)r.PrId,
                    prNumber     = (string?)r.PrNumber,
                    jobId        = (string?)r.JobId,
                    projectName  = (string?)r.ProjectName,
                    requestedBy  = (string?)r.RequestedBy,
                    priority     = (string?)r.Priority,
                    approvedDate = (DateTime?)r.ApprovedDate,
                    daysWaiting  = (int)r.DaysWaiting,
                    openLines    = (int)r.OpenLines,
                    openValue    = (decimal?)r.OpenValue ?? 0m,
                });
                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Dashboard", action: "GetApprovedPRsAwaitingPO", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Failed to load approved PRs." });
            }
        }

        [HttpGet]
        public async Task<IActionResult> Get([FromQuery] int userId = 0)
        {
            try
            {
                using var multi = await _dbcon.QueryMultipleAsync("sp_GetDashboard", new { UserId = userId });

                var kpis         = (await multi.ReadAsync<dynamic>()).FirstOrDefault();
                var jobSummary   = (await multi.ReadAsync<dynamic>()).FirstOrDefault();
                var myApprovals  = (await multi.ReadAsync<dynamic>()).ToList();
                var prStatus     = (await multi.ReadAsync<dynamic>()).FirstOrDefault();
                var poStatus     = (await multi.ReadAsync<dynamic>()).FirstOrDefault();
                var inventory    = (await multi.ReadAsync<dynamic>()).FirstOrDefault();
                var financials   = (await multi.ReadAsync<dynamic>()).FirstOrDefault();
                var jobCosting   = (await multi.ReadAsync<dynamic>()).FirstOrDefault();

                return Ok(new {
                    kpis = kpis == null ? null : new {
                        activeJobs        = (int?)kpis.ActiveJobs,
                        openPRs           = (int?)kpis.OpenPRs,
                        openPOs           = (int?)kpis.OpenPOs,
                        pendingApprovals  = (int?)kpis.PendingApprovals,
                        openInvoices      = (int?)kpis.OpenInvoices,
                    },
                    jobSummary = jobSummary == null ? null : new {
                        activeJobs    = (int?)jobSummary.ActiveJobs,
                        completedJobs = (int?)jobSummary.CompletedJobs,
                        cancelledJobs = (int?)jobSummary.CancelledJobs,
                        waitingJobs   = (int?)jobSummary.WaitingJobs,
                        freezedJobs   = (int?)jobSummary.FreezedJobs,
                    },
                    myApprovals = myApprovals.Select(r => new {
                        transactionId = (int)r.TransactionId,
                        moduleCode    = (string?)r.ModuleCode,
                        documentNo    = (string?)r.DocumentNo,
                        documentId    = (int?)r.DocumentId,
                        documentAmount= (decimal?)r.DocumentAmount,
                        submittedDate = (DateTime?)r.SubmittedDate,
                        daysPending   = (int?)r.DaysPending,
                        currentLevel  = (int?)r.CurrentLevelNo,
                        totalLevels   = (int?)r.TotalLevels,
                    }).ToList(),
                    procurement = new {
                        draftPR    = (int?)prStatus?.DraftPR    ?? 0,
                        pendingPR  = (int?)prStatus?.PendingPR  ?? 0,
                        approvedPR = (int?)prStatus?.ApprovedPR ?? 0,
                        draftPO    = (int?)poStatus?.DraftPO    ?? 0,
                        sentPO     = (int?)poStatus?.SentPO     ?? 0,
                        partialPO  = (int?)poStatus?.PartialPO  ?? 0,
                        approvedPO = (int?)poStatus?.ApprovedPO ?? 0,
                    },
                    inventory = inventory == null ? null : new {
                        totalItems  = (int?)inventory.TotalItems,
                        outOfStock  = (int?)inventory.OutOfStock,
                        lowStock    = (int?)inventory.LowStock,
                        stockValue  = (decimal?)inventory.StockValue,
                        pendingGRN  = (int?)inventory.PendingGRN,
                    },
                    financials = financials == null ? null : new {
                        customerInvoices = (decimal?)financials.CustomerInvoices,
                        supplierInvoices = (decimal?)financials.SupplierInvoices,
                        receipts         = (decimal?)financials.Receipts,
                        payments         = (decimal?)financials.Payments,
                        receivables      = (decimal?)financials.Receivables,
                        payables         = (decimal?)financials.Payables,
                    },
                    jobCosting = jobCosting == null ? null : new {
                        totalOrderValue = (decimal?)jobCosting.TotalOrderValue,
                        totalActualCost = (decimal?)jobCosting.TotalActualCost,
                        totalInvoiced   = (decimal?)jobCosting.TotalInvoiced,
                    },
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Dashboard", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading dashboard." });
            }
        }
    }
}
