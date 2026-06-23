using ERPWEB.Dbcontext;
using ERPWEB.Models.Customer;
using ERPWEB.Models.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Finance
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class DeliveryController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public DeliveryController(DbCon dbcon) { _dbcon = dbcon; }

        // ── SEARCH ───────────────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string?  searchText = null,
            [FromQuery] int?     customerId = null,
            [FromQuery] string?  status     = null,
            [FromQuery] string?  dateFrom   = null,
            [FromQuery] string?  dateTo     = null,
            [FromQuery] int      page       = 1,
            [FromQuery] int      pageSize   = 20)
        {
            try
            {
                var p = new
                {
                    SearchText = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    CustomerId = customerId,
                    Status     = string.IsNullOrWhiteSpace(status)   ? null : status,
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom) ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)   ? null : dateTo,
                    PageNumber = page < 1 ? 1 : page,
                    PageSize   = pageSize is < 1 or > 200 ? 20 : pageSize
                };

                var rows  = await _dbcon.QueryAsync<DeliveryHeader>("sp_SearchDeliveries", p);
                var list  = rows?.ToList() ?? new List<DeliveryHeader>();
                int total = list.Count > 0 ? list[0].TotalRows : 0;

                return Ok(new
                {
                    totalRows  = total,
                    page,
                    pageSize,
                    totalPages = (int)Math.Ceiling((double)total / pageSize),
                    data       = list
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Delivery", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching deliveries." });
            }
        }

        // ── GET BY ID ────────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                var (headers, lines) = await _dbcon.QueryMultipleAsync<DeliveryHeader, DeliveryLine>(
                    "sp_GetDelivery", new { DeliveryId = id });

                var header = headers.FirstOrDefault();
                if (header == null) return NotFound(new { message = "Delivery not found." });

                return Ok(new { header, lines });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Delivery", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching delivery." });
            }
        }

        // ── SAVE HEADER ──────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] DeliveryHeader model)
        {
            try
            {
                // ── Credit-hold enforcement ───────────────────────────────────
                if (model.CustomerId > 0)
                {
                    var credit = await _dbcon.QueryFirstOrDefaultAsync<CustomerCreditStatus>(
                        "sp_CheckCustomerCreditStatus", new { CustomerId = model.CustomerId });
                    if (credit != null && credit.CanTransact == 0)
                        return BadRequest(new { message = credit.StatusMessage
                            ?? "Customer is on credit hold — delivery is blocked." });
                }

                var p = new
                {
                    model.DeliveryId,
                    model.DeliveryNo,
                    model.DeliveryDate,
                    InvoiceId        = model.InvoiceId ?? 0,
                    model.CustomerId,
                    model.JobId,
                    model.DeliveryAddress,
                    ContactId        = model.ContactId ?? 0,
                    model.Consignee,
                    model.ConsigneeAddress,
                    model.ConsigneeLpoNo,
                    model.ConsigneeLpoDate,
                    model.ConsigneeTrn,
                    model.VehicleNo,
                    model.DeliveredBy,
                    model.DeliveredByDate,
                    model.BuyerTrnNo,
                    model.BuyerLpoNo,
                    model.BuyerLpoDate,
                    model.Notes,
                    ActionBy = model.DeliveryId == 0 ? model.CreatedBy : model.ModifiedBy
                };

                string result = await _dbcon.ExecuteScalarAsync("sp_SetDelivery", p);
                return Ok(new
                {
                    id      = result,
                    message = model.DeliveryId == 0 ? "Delivery created." : "Delivery updated."
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Delivery", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving delivery." });
            }
        }

        // ── SAVE LINE ────────────────────────────────────────────────────────
        [HttpPost("saveline")]
        public async Task<IActionResult> SaveLine([FromBody] DeliveryLine model)
        {
            try
            {
                var p = new
                {
                    model.DeliveryLineId,
                    model.DeliveryId,
                    InvoiceLineId = model.InvoiceLineId ?? 0,
                    model.LineNum,
                    model.Description,
                    model.UomName,
                    model.Qty,
                    model.Remarks,
                    ActionBy = User.Identity?.Name ?? "system"
                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetDeliveryLine", p);
                return Ok(new { id = result, message = "Line saved." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Delivery", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving delivery line." });
            }
        }

        // ── DELETE LINE ──────────────────────────────────────────────────────
        [HttpDelete("deleteline/{id:int}")]
        public async Task<IActionResult> DeleteLine(int id)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeleteDeliveryLine",
                    new { DeliveryLineId = id, ActionBy = User.Identity?.Name ?? "system" });
                return Ok(new { message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Delivery", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting delivery line." });
            }
        }

        // ── DELETE DELIVERY ──────────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteDelivery",
                    new { DeliveryId = id, ActionBy = User.Identity?.Name ?? "system" });

                if (result != "OK") return BadRequest(new { message = result });
                return Ok(new { message = "Delivery deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Delivery", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting delivery." });
            }
        }

        // ── CHANGE STATUS ────────────────────────────────────────────────────
        [HttpPost("changestatus")]
        public async Task<IActionResult> ChangeStatus([FromBody] ChangeDeliveryStatusRequest model)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_ChangeDeliveryStatus",
                    new { model.DeliveryId, model.NewStatus, ActionBy = User.Identity?.Name ?? "system" });

                if (result != "OK") return BadRequest(new { message = result });
                return Ok(new { message = $"Delivery status changed to {model.NewStatus}." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Delivery", action: "ChangeStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error changing delivery status." });
            }
        }

        // ── INVOICES FOR CUSTOMER ─────────────────────────────────────────────
        [HttpGet("invoices/{customerId:int}")]
        public async Task<IActionResult> GetInvoicesForDelivery(int customerId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<InvoiceForDelivery>("sp_GetInvoicesForDelivery",
                    new { CustomerId = customerId });
                return Ok(rows?.ToList() ?? new List<InvoiceForDelivery>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Delivery", action: "GetInvoicesForDelivery", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching invoices." });
            }
        }

        // ── JOBS FOR CUSTOMER ─────────────────────────────────────────────────
        [HttpGet("jobs/{customerId:int}")]
        public async Task<IActionResult> GetJobsForCustomer(int customerId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<JobForDelivery>("sp_GetJobsForCustomer",
                    new { CustomerId = customerId });
                return Ok(rows?.ToList() ?? new List<JobForDelivery>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Delivery", action: "GetJobsForCustomer", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching jobs." });
            }
        }

        // ── INVOICE LINES FOR DELIVERY ────────────────────────────────────────
        [HttpGet("invoicelines/{invoiceId:int}")]
        public async Task<IActionResult> GetInvoiceLinesForDelivery(int invoiceId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<InvoiceLineForDelivery>("sp_GetInvoiceLinesForDelivery",
                    new { InvoiceId = invoiceId });
                return Ok(rows?.ToList() ?? new List<InvoiceLineForDelivery>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Delivery", action: "GetInvoiceLinesForDelivery", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching invoice lines." });
            }
        }
    }
}
