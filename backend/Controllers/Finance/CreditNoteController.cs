using ERPWEB.Dbcontext;
using ERPWEB.Models.Finance;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Finance
{
    [Authorize]
    [Route("api/creditnote")]
    [ApiController]
    public class CreditNoteController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public CreditNoteController(DbCon dbcon) { _dbcon = dbcon; }

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
            [FromQuery] string  sortCol    = "CnDate",
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
                var rows  = await _dbcon.QueryAsync<CreditNote>("sp_SearchCreditNotes", p);
                var list  = rows?.ToList() ?? new List<CreditNote>();
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
                await _dbcon.WriteLog(ex, controller: "CreditNote", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching credit notes." });
            }
        }

        // ── GET BY ID (header + allocations) ─────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                var (headers, allocations) =
                    await _dbcon.QueryMultipleAsync<CreditNote, CreditNoteAllocation>(
                        "sp_GetCreditNote", new { CnId = id });

                var cn = headers.FirstOrDefault();
                if (cn == null) return NotFound(new { message = "Credit note not found." });

                return Ok(new { creditNote = cn, allocations });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "CreditNote", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error retrieving credit note." });
            }
        }

        // ── CUSTOMER OPEN INVOICES (for allocation UI) ───────────────────────
        [HttpGet("customer-open-invoices")]
        public async Task<IActionResult> GetCustomerOpenInvoices([FromQuery] int customerId, [FromQuery] int cnId = 0)
        {
            if (customerId <= 0) return BadRequest(new { message = "customerId is required." });
            try
            {
                var list = await _dbcon.QueryAsync<CnOpenInvoice>(
                    "sp_GetCustomerOpenInvoicesForCN", new { CustomerId = customerId, CnId = cnId });
                return Ok(list ?? Enumerable.Empty<CnOpenInvoice>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "CreditNote", action: "GetCustomerOpenInvoices", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching open invoices." });
            }
        }

        // ── SAVE HEADER ──────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveCreditNoteRequest model)
        {
            if (model.CustomerId <= 0)
                return BadRequest(new { message = "Customer is required." });
            if (model.CurrencyId <= 0)
                return BadRequest(new { message = "Currency is required." });
            if (model.CreditAmount <= 0)
                return BadRequest(new { message = "Credit amount must be greater than zero." });
            if (string.IsNullOrWhiteSpace(model.Reason))
                return BadRequest(new { message = "Reason is required." });

            try
            {
                var p = new
                {
                    model.CnId,
                    model.CnDate,
                    model.CustomerId,
                    model.CurrencyId,
                    model.ExchangeRate,
                    model.CreditAmount,
                    model.CreditType,
                    model.Reason,
                    model.Notes,
                    model.CreatedBy,
                    model.ModifiedBy
                };
                var rows   = await _dbcon.QueryAsync<dynamic>("sp_SetCreditNote", p);
                var result = rows?.FirstOrDefault();
                return Ok(new { cnId = (int)result!.NewId, cnNumber = (string)result.CnNumber });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "CreditNote", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving credit note." });
            }
        }

        // ── SAVE ALLOCATION ──────────────────────────────────────────────────
        [HttpPost("allocation/save")]
        public async Task<IActionResult> SaveAllocation([FromBody] SaveCnAllocationRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to modify an allocation on an approved credit note." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });

            try
            {
                var p = new
                {
                    model.AllocationId,
                    model.CnId,
                    model.InvoiceId,
                    model.AllocatedAmount,
                    model.CreatedBy,
                    model.ModifiedBy,
                    model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                };
                await _dbcon.ExecuteScalarAsync("sp_SetCnAllocation", p);
                return Ok(new { message = "Allocation saved." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "CreditNote", action: "SaveAllocation", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving allocation." });
            }
        }

        // ── DELETE ALLOCATION ────────────────────────────────────────────────
        [HttpDelete("allocation/{id:int}")]
        public async Task<IActionResult> DeleteAllocation(int id, [FromBody] DeleteCnAllocationRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to remove an allocation from an approved credit note." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeleteCnAllocation", new
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
                await _dbcon.WriteLog(ex, controller: "CreditNote", action: "DeleteAllocation", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error removing allocation." });
            }
        }

        // ── DELETE CREDIT NOTE ───────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id, [FromQuery] string? modifiedBy = null)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteCreditNote", new { CnId = id, ModifiedBy = modifiedBy });
                if (result == "NotExists")    return NotFound(new { message = "Credit note not found." });
                if (result == "CannotDelete") return BadRequest(new { message = "Only Draft credit notes can be deleted." });
                return Ok(new { id, message = "Credit note deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "CreditNote", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting credit note." });
            }
        }

        // ── REVISE (Approved → Draft, requires reason + password) ────────────
        [HttpPost("{id:int}/revise")]
        public async Task<IActionResult> Revise(int id, [FromBody] ReviseCnRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to revise an approved credit note." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });
            if (string.IsNullOrWhiteSpace(model?.RevisedBy))
                return BadRequest(new { message = "RevisedBy is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ReviseCreditNote", new
                {
                    CnId         = id,
                    RevisedBy    = model.RevisedBy,
                    Reason       = model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                });
                return Ok(new { message = "Credit note revised. Status reset to Draft — edit then re-submit for approval." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "CreditNote", action: "Revise", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error revising credit note." });
            }
        }

        // ── CANCEL ───────────────────────────────────────────────────────────
        [HttpPost("{id:int}/cancel")]
        public async Task<IActionResult> Cancel(int id, [FromBody] CancelCnRequest model)
        {
            if (string.IsNullOrWhiteSpace(model?.Reason))
                return BadRequest(new { message = "A reason is required to cancel an approved credit note." });
            if (string.IsNullOrWhiteSpace(model?.Password))
                return BadRequest(new { message = "Password is required." });
            if (string.IsNullOrWhiteSpace(model?.CancelledBy))
                return BadRequest(new { message = "CancelledBy is required." });

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_CancelCreditNote", new
                {
                    CnId         = id,
                    CancelledBy  = model.CancelledBy,
                    Reason       = model.Reason,
                    PasswordHash = Sha256Hex(model.Password),
                });
                return Ok(new { message = "Credit note cancelled. All allocations reversed." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "CreditNote", action: "Cancel", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error cancelling credit note." });
            }
        }
    }
}
