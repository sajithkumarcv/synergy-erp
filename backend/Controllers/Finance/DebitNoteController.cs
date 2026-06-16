using ERPWEB.Dbcontext;
using ERPWEB.Models.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Finance
{
    [Authorize]
    [Route("api/debitnote")]
    [ApiController]
    public class DebitNoteController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public DebitNoteController(DbCon dbcon) { _dbcon = dbcon; }

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
            [FromQuery] string  sortCol    = "DnDate",
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
                var rows  = await _dbcon.QueryAsync<DebitNote>("sp_SearchDebitNotes", p);
                var list  = rows?.ToList() ?? new List<DebitNote>();
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
                await _dbcon.WriteLog(ex, controller: "DebitNote", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching debit notes." });
            }
        }

        // ── GET BY ID (header + allocations) ─────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                var (headers, allocations) =
                    await _dbcon.QueryMultipleAsync<DebitNote, DebitNoteAllocation>(
                        "sp_GetDebitNote", new { DnId = id });

                var dn = headers.FirstOrDefault();
                if (dn == null) return NotFound(new { message = "Debit note not found." });

                return Ok(new { debitNote = dn, allocations });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DebitNote", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving debit note." });
            }
        }

        // ── SUPPLIER OPEN INVOICES (for allocation UI) ───────────────────────
        [HttpGet("supplier-open-invoices")]
        public async Task<IActionResult> GetSupplierOpenInvoices([FromQuery] int supplierId, [FromQuery] int dnId = 0)
        {
            if (supplierId <= 0) return BadRequest(new { message = "supplierId is required." });
            try
            {
                var list = await _dbcon.QueryAsync<DnOpenInvoice>(
                    "sp_GetSupplierOpenInvoicesForDN", new { SupplierId = supplierId, DnId = dnId });
                return Ok(list ?? Enumerable.Empty<DnOpenInvoice>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DebitNote", action: "GetSupplierOpenInvoices", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching open invoices." });
            }
        }

        // ── SAVE HEADER ──────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveDebitNoteRequest model)
        {
            if (model.SupplierId <= 0)
                return BadRequest(new { message = "Supplier is required." });
            if (model.CurrencyId <= 0)
                return BadRequest(new { message = "Currency is required." });
            if (model.DebitAmount <= 0)
                return BadRequest(new { message = "Debit amount must be greater than zero." });
            if (string.IsNullOrWhiteSpace(model.Reason))
                return BadRequest(new { message = "Reason is required." });

            try
            {
                var p = new
                {
                    model.DnId,
                    model.DnDate,
                    model.SupplierId,
                    model.CurrencyId,
                    model.ExchangeRate,
                    model.DebitAmount,
                    model.DebitType,
                    model.Reason,
                    model.Notes,
                    model.CreatedBy,
                    model.ModifiedBy
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_SetDebitNote", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { dnId = (int)result!.NewId, dnNumber = (string)result.DnNumber });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DebitNote", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving debit note." });
            }
        }

        // ── SAVE ALLOCATION ──────────────────────────────────────────────────
        [HttpPost("allocation/save")]
        public async Task<IActionResult> SaveAllocation([FromBody] SaveDnAllocationRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to modify an allocation on an approved debit note." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });

            try
            {
                var p = new
                {
                    model.AllocationId,
                    model.DnId,
                    model.SupplierInvoiceId,
                    model.AllocatedAmount,
                    model.CreatedBy,
                    model.ModifiedBy,
                    model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                };
                await _dbcon.ExecuteScalarAsync("sp_SetDnAllocation", p);
                return Ok(new { message = "Allocation saved." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DebitNote", action: "SaveAllocation", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving allocation." });
            }
        }

        // ── DELETE ALLOCATION ────────────────────────────────────────────────
        [HttpDelete("allocation/{id:int}")]
        public async Task<IActionResult> DeleteAllocation(int id, [FromBody] DeleteDnAllocationRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to remove an allocation from an approved debit note." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeleteDnAllocation", new
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
                await _dbcon.WriteLog(ex, controller: "DebitNote", action: "DeleteAllocation", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error removing allocation." });
            }
        }

        // ── DELETE DEBIT NOTE ────────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id, [FromQuery] string? modifiedBy = null)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteDebitNote", new { DnId = id, ModifiedBy = modifiedBy });
                if (result == "NotExists")    return NotFound(new { message = "Debit note not found." });
                if (result == "CannotDelete") return BadRequest(new { message = "Only Draft debit notes can be deleted." });
                return Ok(new { id, message = "Debit note deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DebitNote", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting debit note." });
            }
        }

        // ── REVISE (Approved → Draft, requires reason + password) ────────────
        [HttpPost("{id:int}/revise")]
        public async Task<IActionResult> Revise(int id, [FromBody] ReviseDnRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to revise an approved debit note." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });
            if (string.IsNullOrWhiteSpace(model?.RevisedBy))
                return BadRequest(new { message = "RevisedBy is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ReviseDebitNote", new
                {
                    DnId         = id,
                    RevisedBy    = model.RevisedBy,
                    Reason       = model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                });
                return Ok(new { message = "Debit note revised. Status reset to Draft — edit then re-submit for approval." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DebitNote", action: "Revise", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error revising debit note." });
            }
        }

        // ── CANCEL ───────────────────────────────────────────────────────────
        [HttpPost("{id:int}/cancel")]
        public async Task<IActionResult> Cancel(int id, [FromBody] CancelDnRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to cancel an approved debit note." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });
            if (string.IsNullOrWhiteSpace(model?.CancelledBy))
                return BadRequest(new { message = "CancelledBy is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_CancelDebitNote", new
                {
                    DnId         = id,
                    CancelledBy  = model.CancelledBy,
                    Reason       = model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                });
                return Ok(new { message = "Debit note cancelled. All allocations reversed." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "DebitNote", action: "Cancel", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error cancelling debit note." });
            }
        }
    }
}
