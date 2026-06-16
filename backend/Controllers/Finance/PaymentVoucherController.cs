using ERPWEB.Dbcontext;
using ERPWEB.Models.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Finance
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class PaymentVoucherController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public PaymentVoucherController(DbCon dbcon) { _dbcon = dbcon; }

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
            [FromQuery] int?    supplierId = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "PvDate",
            [FromQuery] string  sortDir    = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    SupplierId    = supplierId,
                    Status        = string.IsNullOrWhiteSpace(status) ? null : status,
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                };
                var rows  = await _dbcon.QueryAsync<PaymentVoucher>("sp_SearchPaymentVouchers", p);
                var list  = rows?.ToList() ?? new List<PaymentVoucher>();
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
                await _dbcon.WriteLog(ex, controller: "PaymentVoucher", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching payment vouchers." });
            }
        }

        // ── GET BY ID ────────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                var (headers, allocations) =
                    await _dbcon.QueryMultipleAsync<PaymentVoucher, PaymentVoucherAllocation>(
                        "sp_GetPaymentVoucher", new { PvId = id });

                var pv = headers.FirstOrDefault();
                if (pv == null) return NotFound(new { message = "Payment voucher not found." });

                return Ok(new { paymentVoucher = pv, allocations });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentVoucher", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving payment voucher." });
            }
        }

        // ── SUPPLIER OPEN INVOICES ────────────────────────────────────────────
        [HttpGet("supplier-open-invoices")]
        public async Task<IActionResult> GetSupplierOpenInvoices([FromQuery] int supplierId, [FromQuery] int pvId = 0)
        {
            if (supplierId <= 0) return BadRequest(new { message = "supplierId is required." });
            try
            {
                var list = await _dbcon.QueryAsync<SupplierOpenInvoice>(
                    "sp_GetSupplierOpenInvoices", new { SupplierId = supplierId, PvId = pvId });
                return Ok(list ?? Enumerable.Empty<SupplierOpenInvoice>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentVoucher", action: "GetSupplierOpenInvoices", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching open invoices." });
            }
        }

        // ── POs COVERED BY A SUPPLIER INVOICE ────────────────────────────────
        // Drives the "Apply to PO" dropdown in the PV allocation modal so the
        // user can choose which PO the payment lands on (instead of guessing).
        [HttpGet("supplier-invoice-pos/{supplierInvoiceId:int}")]
        public async Task<IActionResult> GetSupplierInvoicePos(int supplierInvoiceId)
        {
            try
            {
                var list = await _dbcon.QueryAsync<dynamic>(
                    "sp_GetSupplierInvoicePos", new { SupplierInvoiceId = supplierInvoiceId });
                return Ok((list ?? Enumerable.Empty<dynamic>()).Select(ToCamel));
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentVoucher", action: "GetSupplierInvoicePos", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching POs for invoice." });
            }
        }

        private static object? ToCamel(object? row)
        {
            if (row is IDictionary<string, object> dict)
            {
                var camel = new Dictionary<string, object?>(dict.Count);
                foreach (var kv in dict)
                    camel[System.Text.Json.JsonNamingPolicy.CamelCase.ConvertName(kv.Key)] = kv.Value;
                return camel;
            }
            return row;
        }

        // ── INVOICE ALLOCATION HISTORY ────────────────────────────────────────
        [HttpGet("invoice-allocation-history")]
        public async Task<IActionResult> GetInvoiceAllocationHistory([FromQuery] int supplierInvoiceId)
        {
            if (supplierInvoiceId <= 0) return BadRequest(new { message = "supplierInvoiceId is required." });
            try
            {
                var list = await _dbcon.QueryAsync<PvAllocationHistory>(
                    "sp_GetInvoicePvAllocationHistory", new { SupplierInvoiceId = supplierInvoiceId });
                return Ok(list ?? Enumerable.Empty<PvAllocationHistory>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentVoucher", action: "GetInvoiceAllocationHistory", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching allocation history." });
            }
        }

        // ── SAVE HEADER ──────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SavePaymentVoucherRequest model)
        {
            if (model.SupplierId <= 0)
                return BadRequest(new { message = "Supplier is required." });
            if (model.CurrencyId <= 0)
                return BadRequest(new { message = "Currency is required." });
            if (model.AmountPaid <= 0)
                return BadRequest(new { message = "Amount paid must be greater than zero." });
            if (string.Equals(model.PaymentMode, "Cheque", StringComparison.OrdinalIgnoreCase)
                && string.IsNullOrWhiteSpace(model.ReferenceNo))
                return BadRequest(new { message = "Cheque No is required when Payment Mode is Cheque." });

            try
            {
                var p = new
                {
                    model.PvId,
                    model.PvDate,
                    model.SupplierId,
                    model.CurrencyId,
                    model.ExchangeRate,
                    model.AmountPaid,
                    model.PaymentMode,
                    model.ReferenceNo,
                    model.ReferenceDate,
                    model.BankName,
                    model.Notes,
                    model.CreatedBy,
                    model.ModifiedBy
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_SetPaymentVoucher", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { pvId = (int)result!.NewId, pvNumber = (string)result.PvNumber });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentVoucher", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving payment voucher." });
            }
        }

        // ── SAVE ALLOCATION ──────────────────────────────────────────────────
        [HttpPost("allocation/save")]
        public async Task<IActionResult> SaveAllocation([FromBody] SavePvAllocationRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to modify an allocation on an approved payment voucher." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });

            try
            {
                var p = new
                {
                    model.AllocationId,
                    model.PvId,
                    model.SupplierInvoiceId,
                    model.AllocatedAmount,
                    PoId = model.PoId,
                    model.CreatedBy,
                    model.ModifiedBy,
                    model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                };
                await _dbcon.ExecuteScalarAsync("sp_SetPvAllocation", p);
                return Ok(new { message = "Allocation saved." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentVoucher", action: "SaveAllocation", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving allocation." });
            }
        }

        // ── DELETE ALLOCATION ────────────────────────────────────────────────
        [HttpDelete("allocation/{id:int}")]
        public async Task<IActionResult> DeleteAllocation(int id, [FromBody] DeletePvAllocationRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to remove an allocation from an approved payment voucher." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeletePvAllocation", new
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
                await _dbcon.WriteLog(ex, controller: "PaymentVoucher", action: "DeleteAllocation", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error removing allocation." });
            }
        }

        // ── DELETE VOUCHER ───────────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id, [FromQuery] string? modifiedBy = null)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeletePaymentVoucher",
                    new { PvId = id, ModifiedBy = modifiedBy });
                if (result == "NotExists")    return NotFound(new { message = "Payment voucher not found." });
                if (result == "CannotDelete") return BadRequest(new { message = "Only Draft payment vouchers can be deleted." });
                return Ok(new { id, message = "Payment voucher deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentVoucher", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting payment voucher." });
            }
        }

        // ── REVISE ───────────────────────────────────────────────────────────
        [HttpPost("{id:int}/revise")]
        public async Task<IActionResult> Revise(int id, [FromBody] RevisePvRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to revise an approved payment voucher." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });
            if (string.IsNullOrWhiteSpace(model?.RevisedBy))
                return BadRequest(new { message = "RevisedBy is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_RevisePaymentVoucher", new
                {
                    PvId         = id,
                    model.RevisedBy,
                    model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                });
                return Ok(new { message = "Payment voucher revised. Status reset to Draft — edit then re-submit for approval." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentVoucher", action: "Revise", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error revising payment voucher." });
            }
        }

        // ── CANCEL ───────────────────────────────────────────────────────────
        [HttpPost("{id:int}/cancel")]
        public async Task<IActionResult> Cancel(int id, [FromBody] CancelPvRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to cancel an approved payment voucher." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });
            if (string.IsNullOrWhiteSpace(model?.CancelledBy))
                return BadRequest(new { message = "CancelledBy is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_CancelPaymentVoucher", new
                {
                    PvId         = id,
                    model.CancelledBy,
                    model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                });
                return Ok(new { message = "Payment voucher cancelled. All allocations reversed." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PaymentVoucher", action: "Cancel", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error cancelling payment voucher." });
            }
        }
    }
}
