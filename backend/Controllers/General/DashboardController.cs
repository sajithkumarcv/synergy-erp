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
