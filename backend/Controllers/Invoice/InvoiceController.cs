using ERPWEB.Dbcontext;
using ERPWEB.Models.Invoice;
using ERPWEB.Models.Customer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Invoice
{
    public record ReviseInvoiceRequest(
        string? Reason     = null,
        string? Password   = null,   // plaintext; hashed server-side
        string? RevisedBy  = null,
        string? ChangedBy  = null    // kept for backwards-compat
    );

    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class InvoiceController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public InvoiceController(DbCon dbcon) { _dbcon = dbcon; }

        private static string Sha256Hex(string raw)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw ?? string.Empty));
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        // ═══════════════════════════════════════════════════════
        // CURRENCIES  —  GET: api/invoice/currencies
        // ═══════════════════════════════════════════════════════
        [HttpGet("currencies")]
        public async Task<IActionResult> GetCurrencies()
        {
            try
            {
                var list = await _dbcon.QueryAsync<CurrencyItem>("sp_GetCurrencies", null);
                return Ok(list ?? new List<CurrencyItem>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Invoice", action: "GetCurrencies",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching currencies." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // CUSTOMER DATA  —  GET: api/invoice/customer/{id}
        // Returns header + addresses + contacts in one call
        // ═══════════════════════════════════════════════════════
        [HttpGet("customer/{customerId:int}")]
        public async Task<IActionResult> GetCustomerData(int customerId)
        {
            try
            {
                var results = await _dbcon.QueryMultipleAsync(
                    "sp_GetCustomerForInvoice", new { CustomerId = customerId });

                if (results == null)
                    return NotFound(new { message = "Customer not found." });

                var customer  = results.Read<CustomerForInvoice>().FirstOrDefault();
                var addresses = results.Read<CustomerAddressItem>().ToList();
                var contacts  = results.Read<CustomerContactItem>().ToList();

                return Ok(new { customer, addresses, contacts });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Invoice", action: "GetCustomerData",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching customer data." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // SEARCH / LIST  —  GET: api/invoice/search
        // ═══════════════════════════════════════════════════════
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? searchText = null,
            [FromQuery] int?    customerId = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] string? status     = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "InvoiceDate",
            [FromQuery] string  sortDir    = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    CustomerId    = customerId,
                    JobId         = string.IsNullOrWhiteSpace(jobId)   ? null : jobId,
                    Status        = string.IsNullOrWhiteSpace(status)  ? null : status,
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom) ? (DateTime?)null : DateTime.Parse(dateFrom),
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)   ? (DateTime?)null : DateTime.Parse(dateTo),
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 500 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                };
                var rows  = await _dbcon.QueryAsync<Models.Invoice.Invoice>("sp_SearchInvoices", p);
                var list  = rows?.ToList() ?? new List<Models.Invoice.Invoice>();
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
                await _dbcon.WriteLog(ex, controller: "Invoice", action: "Search",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching invoices." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // GET SINGLE  —  GET: api/invoice/{id}
        // ═══════════════════════════════════════════════════════
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetInvoice(int id)
        {
            try
            {
                var results = await _dbcon.QueryMultipleAsync(
                    "sp_GetInvoice", new { InvoiceId = id, InvoiceNo = (string?)null });

                if (results == null)
                    return NotFound(new { message = "Invoice not found." });

                var invoice = results.Read<Models.Invoice.Invoice>().FirstOrDefault();
                if (invoice == null)
                    return NotFound(new { message = "Invoice not found." });

                var lines = results.Read<InvoiceLine>().ToList();
                return Ok(new { invoice, lines });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Invoice", action: "GetInvoice",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving invoice." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // PAYMENTS  —  GET: api/invoice/{id}/payments
        // Receipt Voucher allocations applied to this invoice.
        // ═══════════════════════════════════════════════════════
        [HttpGet("{id:int}/payments")]
        public async Task<IActionResult> GetPayments(int id)
        {
            try
            {
                var list = await _dbcon.QueryAsync<InvoicePayment>(
                    "sp_GetInvoicePayments", new { InvoiceId = id });
                return Ok(list ?? Enumerable.Empty<InvoicePayment>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Invoice", action: "GetPayments",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching invoice payments." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // SAVE HEADER  —  POST: api/invoice/save
        // ═══════════════════════════════════════════════════════
        [HttpPost("save")]
        public async Task<IActionResult> SaveInvoice([FromBody] SaveInvoiceRequest model)
        {
            try
            {
                // ── Credit-hold enforcement ───────────────────────────────────
                // Block invoicing a customer who is on credit hold (CanTransact = 0).
                var credit = await _dbcon.QueryFirstOrDefaultAsync<CustomerCreditStatus>(
                    "sp_CheckCustomerCreditStatus", new { CustomerId = model.CustomerId });
                if (credit != null && credit.CanTransact == 0)
                    return BadRequest(new { message = string.IsNullOrWhiteSpace(credit.StatusMessage)
                        ? "Customer is on credit hold — invoicing is blocked."
                        : credit.StatusMessage });

                var p = new
                {
                    InvoiceId      = model.InvoiceId,
                    InvoiceDate    = model.InvoiceDate,
                    CustomerId     = model.CustomerId,
                    BillingAddress = model.BillingAddress,
                    CurrencyId     = model.CurrencyId > 0 ? model.CurrencyId : 2,   // 2 = AED base
                    ExchangeRate   = model.ExchangeRate,   // SP resolves to 1 when IsBaseCurrency
                    DueDate        = model.DueDate,
                    JobId          = string.IsNullOrWhiteSpace(model.JobId) ? null : model.JobId,
                    LpoNo          = model.LpoNo,
                    LpoDate        = model.LpoDate,
                    ContactId      = model.ContactId,
                    Notes          = model.Notes,
                    CreatedBy      = model.CreatedBy,
                    ModifiedBy     = model.ModifiedBy
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_SetInvoice", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { invoiceId = (int)result!.NewId, invoiceNo = (string)result.InvoiceNo });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                // Mandatory-field / business-rule errors raised by the SP (e.g. Job required) — surface to user.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Invoice", action: "SaveInvoice",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving invoice." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // SAVE LINE  —  POST: api/invoice/line/save
        // ═══════════════════════════════════════════════════════
        [HttpPost("line/save")]
        public async Task<IActionResult> SaveLine([FromBody] SaveInvoiceLineRequest model)
        {
            try
            {
                var p = new
                {
                    InvoiceLineId = model.InvoiceLineId,
                    InvoiceId     = model.InvoiceId,
                    LineNum       = model.LineNum,
                    Description   = model.Description,
                    UomName       = model.UomName,
                    UnitPrice     = model.UnitPrice,
                    Qty           = model.Qty,
                    VatPercent    = model.VatPercent,
                    Notes         = model.Notes,
                    CreatedBy     = model.CreatedBy,
                    ModifiedBy    = model.ModifiedBy
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_SetInvoiceLine", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { invoiceLineId = (int)result!.InvoiceLineId });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Invoice", action: "SaveLine",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving invoice line." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // DELETE LINE  —  DELETE: api/invoice/line/{lineId}
        // ═══════════════════════════════════════════════════════
        [HttpDelete("line/{lineId:int}")]
        public async Task<IActionResult> DeleteLine(
            int lineId,
            [FromQuery] string? modifiedBy = null)
        {
            try
            {
                await _dbcon.QueryAsync<dynamic>(
                    "sp_DeleteInvoiceLine",
                    new { InvoiceLineId = lineId, ModifiedBy = modifiedBy });
                return Ok(new { message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Invoice", action: "DeleteLine",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting invoice line." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // DELETE HEADER  —  DELETE: api/invoice/{id}
        // ═══════════════════════════════════════════════════════
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteInvoice(
            int id,
            [FromQuery] string? modifiedBy = null)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync(
                    "sp_DeleteInvoice",
                    new { InvoiceId = id, ModifiedBy = modifiedBy });

                if (result == "NotExists")    return NotFound(new { message = "Invoice not found." });
                if (result == "CannotDelete") return BadRequest(new { message = "Only Draft invoices can be deleted." });
                return Ok(new { id, message = "Invoice deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Invoice", action: "DeleteInvoice",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting invoice." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // REVISE  —  POST: api/invoice/{id}/revise
        // Resets a Confirmed invoice back to Draft (increments Revision) so the
        // lines can be edited and re-submitted for approval. Mirrors PO revise.
        // ═══════════════════════════════════════════════════════
        [HttpPost("{id:int}/revise")]
        public async Task<IActionResult> Revise(int id, [FromBody] ReviseInvoiceRequest model)
        {
            var revisedBy = model?.RevisedBy ?? model?.ChangedBy;
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to revise a confirmed invoice." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });
            if (string.IsNullOrWhiteSpace(revisedBy))
                return BadRequest(new { message = "RevisedBy is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ReviseInvoice", new
                {
                    InvoiceId    = id,
                    Reason       = model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                    RevisedBy    = revisedBy,
                });
                return Ok(new { message = "Invoice revised. Status reset to Draft — edit lines then re-submit for approval." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Invoice", action: "Revise",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error revising invoice." });
            }
        }

        // ═══════════════════════════════════════════════════════
        // CONFIRM  —  POST: api/invoice/{id}/confirm
        // Invoice status changes are controlled exclusively by the approval workflow.
        // Direct confirm/cancel are blocked — use POST /api/approval/action instead.
        // ═══════════════════════════════════════════════════════
        [HttpPost("{id:int}/confirm")]
        public IActionResult Confirm(int id) =>
            Conflict(new { message = "Invoice status changes are controlled by the approval workflow. Use POST /api/approval/action instead." });

        // ═══════════════════════════════════════════════════════
        // CANCEL  —  POST: api/invoice/{id}/cancel
        // ═══════════════════════════════════════════════════════
        [HttpPost("{id:int}/cancel")]
        public IActionResult Cancel(int id) =>
            Conflict(new { message = "Invoice status changes are controlled by the approval workflow. Use POST /api/approval/action instead." });

        // ═══════════════════════════════════════════════════════
        // COPY  —  POST: api/invoice/{id}/copy
        // Creates a new Draft invoice copied from source.
        // Header fields are preserved; dates are replaced by the
        // caller-supplied values; all line amounts are zeroed out.
        // ═══════════════════════════════════════════════════════
        [HttpPost("{id:int}/copy")]
        public async Task<IActionResult> Copy(int id, [FromBody] CopyInvoiceRequest model)
        {
            if (model.NewInvoiceDate == null)
                return BadRequest(new { message = "NewInvoiceDate is required." });
            try
            {
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_CopyInvoice", new
                {
                    SourceInvoiceId = id,
                    NewInvoiceDate  = model.NewInvoiceDate,
                    NewDueDate      = model.NewDueDate,
                    CreatedBy       = model.CreatedBy,
                });
                var result = rows?.FirstOrDefault();
                return Ok(new
                {
                    newInvoiceId = (int)result!.NewInvoiceId,
                    newInvoiceNo = (string)result!.NewInvoiceNo,
                });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Invoice", action: "Copy",
                    requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error copying invoice." });
            }
        }

    }
}
