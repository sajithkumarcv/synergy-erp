using ERPWEB.Dbcontext;
using ERPWEB.Models.Job;
using ERPWEB.Models.Procurement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Procurement
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class SupplierInvoiceController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public SupplierInvoiceController(DbCon dbcon) { _dbcon = dbcon; }

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
            [FromQuery] string?   searchText = null,
            [FromQuery] int?      supplierId = null,
            [FromQuery] string?   status     = null,
            [FromQuery] string?   dateFrom   = null,
            [FromQuery] string?   dateTo     = null,
            [FromQuery] int       page       = 1,
            [FromQuery] int       pageSize   = 20)
        {
            try
            {
                var p = new
                {
                    SearchText = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    SupplierId = supplierId,
                    Status     = string.IsNullOrWhiteSpace(status)   ? null : status,
                    DateFrom   = string.IsNullOrWhiteSpace(dateFrom) ? null : dateFrom,
                    DateTo     = string.IsNullOrWhiteSpace(dateTo)   ? null : dateTo,
                    PageNumber = page < 1 ? 1 : page,
                    PageSize   = pageSize is < 1 or > 200 ? 20 : pageSize
                };

                var rows  = await _dbcon.QueryAsync<SupplierInvoiceHeader>("sp_SearchSupplierInvoices", p);
                var list  = rows?.ToList() ?? new List<SupplierInvoiceHeader>();
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
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching supplier invoices." });
            }
        }

        // ── GET BY ID ────────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                var (headers, lines) = await _dbcon.QueryMultipleAsync<SupplierInvoiceHeader, SupplierInvoiceLine>(
                    "sp_GetSupplierInvoice", new { SupplierInvoiceId = id });

                var header = headers.FirstOrDefault();
                if (header == null) return NotFound(new { message = "Invoice not found." });

                return Ok(new { header, lines });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching invoice." });
            }
        }

        // ── SAVE HEADER ──────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SupplierInvoiceHeader model)
        {
            try
            {
                var p = new
                {
                    model.SupplierInvoiceId,
                    model.InvoiceNo,
                    model.SupplierInvRef,
                    model.InvoiceDate,
                    model.SupplierId,
                    model.CurrencyId,
                    model.ExchangeRate,
                    model.PaymentTermsId,
                    model.DueDate,
                    model.SubTotal,
                    model.TaxAmount,
                    model.TotalAmount,
                    model.Notes,
                    ActionBy = model.SupplierInvoiceId == 0 ? model.CreatedBy : model.ModifiedBy
                };

                string result = await _dbcon.ExecuteScalarAsync("sp_SetSupplierInvoice", p);

                if (result == "-1")
                    return BadRequest(new { message = "A supplier invoice with this reference already exists for this supplier." });

                return Ok(new
                {
                    id      = result,
                    message = model.SupplierInvoiceId == 0 ? "Invoice created." : "Invoice updated."
                });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving invoice." });
            }
        }

        // ── SAVE LINE ────────────────────────────────────────────────────────
        [HttpPost("saveline")]
        public async Task<IActionResult> SaveLine([FromBody] SupplierInvoiceLine model)
        {
            try
            {
                var p = new
                {
                    model.SupplierInvLineId,
                    model.SupplierInvoiceId,
                    model.LineNum,
                    model.GrnDetailId,
                    model.GrnId,
                    model.PoLineId,
                    SrvId     = model.SrvId,
                    SrvLineId = model.SrvLineId,
                    model.ItemId,
                    model.ItemCode,
                    model.ItemDesc,
                    model.UomName,
                    model.Qty,
                    model.UnitPrice,
                    model.TaxPct,
                    model.Notes,
                    ActionBy = User.Identity?.Name ?? "system"
                };

                string result = await _dbcon.ExecuteScalarAsync("sp_SetSupplierInvoiceLine", p);
                return Ok(new { id = result, message = "Line saved." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving invoice line." });
            }
        }

        // ── DELETE LINE ──────────────────────────────────────────────────────
        [HttpDelete("deleteline/{id:int}")]
        public async Task<IActionResult> DeleteLine(int id)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeleteSupplierInvoiceLine",
                    new { SupplierInvLineId = id, ActionBy = User.Identity?.Name ?? "system" });
                return Ok(new { message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting invoice line." });
            }
        }

        // ── DELETE INVOICE ───────────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteSupplierInvoice",
                    new { SupplierInvoiceId = id, ActionBy = User.Identity?.Name ?? "system" });

                if (result != "OK")
                    return BadRequest(new { message = result });

                return Ok(new { message = "Invoice deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting invoice." });
            }
        }

        // ── CHANGE STATUS ────────────────────────────────────────────────────
        [HttpPost("changestatus")]
        public async Task<IActionResult> ChangeStatus([FromBody] ChangeInvoiceStatusRequest model)
        {
            var actionBy = model.ChangedBy ?? User.Identity?.Name ?? "system";

            // Require login password when approving or posting (financial commitment steps)
            var passwordRequired = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "Approved", "Posted" };
            if (passwordRequired.Contains(model.NewStatus))
            {
                if (string.IsNullOrWhiteSpace(model.LoginPassword))
                    return BadRequest(new { message = $"Your login password is required to mark this invoice as {model.NewStatus}." });
                var valid = await _dbcon.QueryAsync<dynamic>("sp_ValidateUser",
                    new { Username = actionBy, Password = Sha256Hex(model.LoginPassword) });
                if (!valid.Any())
                {
                    await _dbcon.WriteRawLog($"Incorrect login password on Supplier Invoice status change to {model.NewStatus}.",
                        controller: "SupplierInvoice", action: "ChangeStatus",
                        requestPath: HttpContext.Request.Path, userId: actionBy, logLevel: "Warning");
                    return BadRequest(new { message = "Incorrect password. Status not changed." });
                }
            }

            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_ChangeSupplierInvoiceStatus",
                    new
                    {
                        model.SupplierInvoiceId,
                        model.NewStatus,
                        ActionBy = actionBy
                    });

                if (result != "OK")
                    return BadRequest(new { message = result });

                return Ok(new { message = $"Invoice status changed to {model.NewStatus}." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "ChangeStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error changing invoice status." });
            }
        }

        // ── REVISE (Approved → Draft, requires reason + role password) ──────
        [HttpPost("revise")]
        public async Task<IActionResult> Revise([FromBody] ReviseSupplierInvoiceRequest model)
        {
            if (model.SupplierInvoiceId <= 0)
                return BadRequest(new { message = "SupplierInvoiceId is required." });
            if (string.IsNullOrWhiteSpace(model.Reason))
                return BadRequest(new { message = "A reason is required to revise an approved invoice." });
            if (string.IsNullOrWhiteSpace(model.Password))
                return BadRequest(new { message = "Password is required." });
            if (string.IsNullOrWhiteSpace(model.RevisedBy))
                return BadRequest(new { message = "RevisedBy is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ReviseSupplierInvoice", new
                {
                    model.SupplierInvoiceId,
                    model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                    model.RevisedBy,
                });
                return Ok(new { message = "Invoice revised and returned to Draft." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "Revise", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error revising invoice." });
            }
        }

        // ── REVISE PASSWORD: list roles ──────────────────────────────────────
        [HttpGet("revise-password-roles")]
        public async Task<IActionResult> RevisePasswordRoles()
        {
            try
            {
                // Return the SAME typed row as the budget endpoint so JSON keys are
                // camelCased consistently (dynamic serialized PascalCase → blank UI).
                var rows = await _dbcon.QueryAsync<RoleSecretStatusRow>(
                    "sp_GetRolesWithSecretStatus", new { SecretKey = "INVOICE_REVISE" });
                return Ok(rows ?? Enumerable.Empty<RoleSecretStatusRow>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "RevisePasswordRoles", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching roles." });
            }
        }

        // ── REVISE PASSWORD: set for a role ──────────────────────────────────
        [HttpPost("set-revise-password")]
        public async Task<IActionResult> SetRevisePassword([FromBody] SetRevisePasswordRequest model)
        {
            if (model.RoleId <= 0)
                return BadRequest(new { message = "RoleId is required." });
            if (string.IsNullOrWhiteSpace(model.NewPassword) || model.NewPassword.Length < 4)
                return BadRequest(new { message = "Password must be at least 4 characters." });
            if (string.IsNullOrWhiteSpace(model.ChangedBy))
                return BadRequest(new { message = "ChangedBy is required." });
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_SetRoleSecret", new
                {
                    model.RoleId,
                    SecretKey       = "INVOICE_REVISE",
                    SecretValueHash = Sha256Hex(model.NewPassword),
                    model.ChangedBy,
                });
                return Ok(new { message = "Invoice revision password updated for the selected role." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "SetRevisePassword", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error updating password." });
            }
        }

        // ── GRNs FOR SUPPLIER ────────────────────────────────────────────────
        [HttpGet("grns/{supplierId:int}")]
        public async Task<IActionResult> GetGRNsForSupplier(int supplierId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<GrnForInvoice>("sp_GetGRNsForSupplierInvoice",
                    new { SupplierId = supplierId });
                return Ok(rows?.ToList() ?? new List<GrnForInvoice>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "GetGRNsForSupplier", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching GRNs." });
            }
        }

        // ── GRN LINES FOR INVOICE ────────────────────────────────────────────
        [HttpGet("grnlines/{grnId:int}")]
        public async Task<IActionResult> GetGRNLines(int grnId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<GrnLineForInvoice>("sp_GetGRNLinesForInvoice",
                    new { GrnId = grnId });
                return Ok(rows?.ToList() ?? new List<GrnLineForInvoice>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "GetGRNLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching GRN lines." });
            }
        }

        // ── SRVs FOR SUPPLIER (parallel to GRN endpoint) ─────────────────────
        // Lists confirmed Service Receipts for the supplier that still have
        // uninvoiced quantity. Drives the second "Import from SRV" picker on
        // the Supplier Invoice form.
        [HttpGet("srvs/{supplierId:int}")]
        public async Task<IActionResult> GetSRVsForSupplier(int supplierId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<SrvForInvoice>("sp_GetSRVsForSupplierInvoice",
                    new { SupplierId = supplierId });
                return Ok(rows?.ToList() ?? new List<SrvForInvoice>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "GetSRVsForSupplier", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching SRVs." });
            }
        }

        // ── SRV LINES FOR INVOICE ────────────────────────────────────────────
        [HttpGet("srvlines/{srvId:int}")]
        public async Task<IActionResult> GetSRVLines(int srvId)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<SrvLineForInvoice>("sp_GetSRVLinesForInvoice",
                    new { SrvId = srvId });
                return Ok(rows?.ToList() ?? new List<SrvLineForInvoice>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "SupplierInvoice", action: "GetSRVLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching SRV lines." });
            }
        }
    }
}
