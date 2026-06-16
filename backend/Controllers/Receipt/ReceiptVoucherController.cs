using ERPWEB.Dbcontext;
using ERPWEB.Models.Receipt;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Receipt
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class ReceiptVoucherController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public ReceiptVoucherController(DbCon dbcon) { _dbcon = dbcon; }

        private static string Sha256Hex(string raw)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw ?? string.Empty));
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        // ── SEARCH ───────────────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText = null,
            [FromQuery] int?    customerId = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "RvDate",
            [FromQuery] string  sortDir    = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    CustomerId    = customerId,
                    Status        = string.IsNullOrWhiteSpace(status) ? null : status,
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                };
                var rows  = await _dbcon.QueryAsync<ReceiptVoucher>("sp_SearchReceiptVouchers", p);
                var list  = rows?.ToList() ?? new List<ReceiptVoucher>();
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
                await _dbcon.WriteLog(ex, controller: "ReceiptVoucher", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching receipt vouchers." });
            }
        }

        // ── GET BY ID (header + allocations) ─────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                var (headers, allocations) =
                    await _dbcon.QueryMultipleAsync<ReceiptVoucher, ReceiptVoucherAllocation>(
                        "sp_GetReceiptVoucher", new { RvId = id });

                var rv = headers.FirstOrDefault();
                if (rv == null) return NotFound(new { message = "Receipt voucher not found." });

                return Ok(new { receiptVoucher = rv, allocations });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ReceiptVoucher", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving receipt voucher." });
            }
        }

        // ── INVOICE ALLOCATION HISTORY ────────────────────────────────────────
        [HttpGet("invoice-allocation-history")]
        public async Task<IActionResult> GetInvoiceAllocationHistory([FromQuery] int invoiceId)
        {
            if (invoiceId <= 0) return BadRequest(new { message = "invoiceId is required." });
            try
            {
                var list = await _dbcon.QueryAsync<InvoiceAllocationHistory>(
                    "sp_GetInvoiceAllocationHistory", new { InvoiceId = invoiceId });
                return Ok(list ?? Enumerable.Empty<InvoiceAllocationHistory>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ReceiptVoucher", action: "GetInvoiceAllocationHistory", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching allocation history." });
            }
        }

        // ── CUSTOMER OPEN INVOICES (for allocation UI) ───────────────────────
        [HttpGet("customer-open-invoices")]
        public async Task<IActionResult> GetCustomerOpenInvoices([FromQuery] int customerId, [FromQuery] int rvId = 0)
        {
            if (customerId <= 0) return BadRequest(new { message = "customerId is required." });
            try
            {
                var list = await _dbcon.QueryAsync<CustomerOpenInvoice>(
                    "sp_GetCustomerOpenInvoices", new { CustomerId = customerId, RvId = rvId });
                return Ok(list ?? Enumerable.Empty<CustomerOpenInvoice>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ReceiptVoucher", action: "GetCustomerOpenInvoices", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching open invoices." });
            }
        }

        // ── SAVE HEADER ──────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveReceiptVoucherRequest model)
        {
            // Fast fail — surface clean messages before hitting the SP
            if (model.CustomerId <= 0)
                return BadRequest(new { message = "Customer is required." });
            if (model.CurrencyId <= 0)
                return BadRequest(new { message = "Currency is required." });
            if (model.AmountReceived <= 0)
                return BadRequest(new { message = "Amount received must be greater than zero." });
            if (string.Equals(model.PaymentMode, "Cheque", StringComparison.OrdinalIgnoreCase)
                && string.IsNullOrWhiteSpace(model.ReferenceNo))
                return BadRequest(new { message = "Cheque No is required when Payment Mode is Cheque." });

            try
            {
                var p = new
                {
                    model.RvId,
                    model.RvDate,
                    model.CustomerId,
                    model.CurrencyId,
                    model.ExchangeRate,
                    model.AmountReceived,
                    model.PaymentMode,
                    model.ReferenceNo,
                    model.ReferenceDate,
                    model.BankName,
                    model.Notes,
                    model.CreatedBy,
                    model.ModifiedBy
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_SetReceiptVoucher", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { rvId = (int)result!.NewId, rvNumber = (string)result.RvNumber });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ReceiptVoucher", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving receipt voucher." });
            }
        }

        // ── SAVE ALLOCATION ──────────────────────────────────────────────────
        [HttpPost("allocation/save")]
        public async Task<IActionResult> SaveAllocation([FromBody] SaveAllocationRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to modify an allocation on an approved receipt voucher." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });

            try
            {
                var p = new
                {
                    model.AllocationId,
                    model.RvId,
                    model.InvoiceId,
                    model.AllocatedAmount,
                    model.CreatedBy,
                    model.ModifiedBy,
                    model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                };
                await _dbcon.ExecuteScalarAsync("sp_SetRvAllocation", p);
                return Ok(new { message = "Allocation saved." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ReceiptVoucher", action: "SaveAllocation", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving allocation." });
            }
        }

        // ── DELETE ALLOCATION ────────────────────────────────────────────────
        [HttpDelete("allocation/{id:int}")]
        public async Task<IActionResult> DeleteAllocation(int id, [FromBody] DeleteAllocationRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to remove an allocation from an approved receipt voucher." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeleteRvAllocation", new
                {
                    AllocationId = id,
                    ModifiedBy   = model.ModifiedBy,
                    model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                });
                return Ok(new { message = "Allocation removed." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ReceiptVoucher", action: "DeleteAllocation", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error removing allocation." });
            }
        }

        // ── DELETE VOUCHER ───────────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id, [FromQuery] string? modifiedBy = null)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteReceiptVoucher", new { RvId = id, ModifiedBy = modifiedBy });
                if (result == "NotExists")    return NotFound(new { message = "Receipt voucher not found." });
                if (result == "CannotDelete") return BadRequest(new { message = "Only Draft receipt vouchers can be deleted." });
                return Ok(new { id, message = "Receipt voucher deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ReceiptVoucher", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting receipt voucher." });
            }
        }

        // ── REVISE (Approved → Draft, requires reason + role password) ──────
        [HttpPost("{id:int}/revise")]
        public async Task<IActionResult> Revise(int id, [FromBody] ReviseRvRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to revise an approved receipt voucher." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });
            if (string.IsNullOrWhiteSpace(model?.RevisedBy))
                return BadRequest(new { message = "RevisedBy is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ReviseReceiptVoucher", new
                {
                    RvId         = id,
                    RevisedBy    = model.RevisedBy,
                    Reason       = model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                });
                return Ok(new { message = "Receipt voucher revised. Status reset to Draft — edit then re-submit for approval." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ReceiptVoucher", action: "Revise", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error revising receipt voucher." });
            }
        }

        // ── CANCEL (reverse allocations, recompute job payments) ─────────────
        [HttpPost("{id:int}/cancel")]
        public async Task<IActionResult> Cancel(int id, [FromBody] CancelRvRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to cancel an approved receipt voucher." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });
            if (string.IsNullOrWhiteSpace(model?.CancelledBy))
                return BadRequest(new { message = "CancelledBy is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_CancelReceiptVoucher", new
                {
                    RvId         = id,
                    CancelledBy  = model.CancelledBy,
                    Reason       = model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                });
                return Ok(new { message = "Receipt voucher cancelled. All allocations reversed and job payments updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "ReceiptVoucher", action: "Cancel", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error cancelling receipt voucher." });
            }
        }
    }
}
