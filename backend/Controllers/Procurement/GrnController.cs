using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Procurement
{
    using GrnHeader           = ERPWEB.Models.Procurement.GrnHeader;
    using GrnDetail           = ERPWEB.Models.Procurement.GrnDetail;
    using StatusChangeRequest = ERPWEB.Models.Procurement.StatusChangeRequest;
    using CancelGrnRequest    = ERPWEB.Models.Procurement.CancelGrnRequest;

    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class GrnController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public GrnController(DbCon dbcon) { _dbcon = dbcon; }

        // ── SEARCH ───────────────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> SearchGRNs(
            [FromQuery] string? searchText = null,
            [FromQuery] string? status     = null,
            [FromQuery] int?    supplierId = null,
            [FromQuery] string? jobId      = null,
            [FromQuery] int?    poId       = null,
            [FromQuery] string? poNumber   = null,
            [FromQuery] string? createdBy  = null,
            [FromQuery] string? dateFrom   = null,
            [FromQuery] string? dateTo     = null,
            [FromQuery] int     page       = 1,
            [FromQuery] int     pageSize   = 20,
            [FromQuery] string  sortCol    = "GrnDate",
            [FromQuery] string  sortDir    = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText    = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    Status        = string.IsNullOrWhiteSpace(status)     ? null : status,
                    SupplierId    = supplierId,
                    JobId         = string.IsNullOrWhiteSpace(jobId)      ? null : jobId.Trim(),
                    PoId          = poId,
                    PoNumber      = string.IsNullOrWhiteSpace(poNumber)   ? null : poNumber.Trim(),
                    CreatedBy     = string.IsNullOrWhiteSpace(createdBy)  ? null : createdBy.Trim(),
                    DateFrom      = string.IsNullOrWhiteSpace(dateFrom)   ? null : dateFrom,
                    DateTo        = string.IsNullOrWhiteSpace(dateTo)     ? null : dateTo,
                    PageNumber    = page < 1 ? 1 : page,
                    PageSize      = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn    = sortCol,
                    SortDirection = sortDir
                };

                var rows  = await _dbcon.QueryAsync<GrnHeader>("sp_SearchGRNs", p);
                var list  = rows?.ToList() ?? new List<GrnHeader>();
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
                await _dbcon.WriteLog(ex, controller: "Grn", action: "SearchGRNs", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching GRNs." });
            }
        }

        // ── GET BY ID ────────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetGRN(int id)
        {
            try
            {
                var rows   = await _dbcon.QueryAsync<GrnHeader>("sp_GetGRN", new { GrnId = id });
                var record = rows?.FirstOrDefault();
                if (record == null) return NotFound(new { message = "GRN not found." });
                return Ok(record);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "GetGRN", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching GRN." });
            }
        }

        // ── SAVE ─────────────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> SetGRN([FromBody] GrnHeader model)
        {
            try
            {
                var p = new
                {
                    model.GrnId,
                    model.PoId,
                    model.SupplierId,
                    model.JobId,
                    model.GrnDate,
                    model.ReceivedDate,
                    model.DoNo,
                    model.ReceivedBy,
                    model.ReceivedFrom,
                    model.ShipmentBy,
                    model.DeliveryTerms,
                    model.DeliveryLocation,
                    model.ShipmentDetails,
                    model.InvoiceNo,
                    model.InvoiceDate,
                    model.CurrencyId,
                    model.ExchangeRate,
                    model.TotalAmount,
                    model.BoeNo,
                    model.BoeDate,
                    model.IsRegistered,
                    model.RegisteredBy,
                    model.RegisteredDate,
                    model.Remarks,
                    model.CreatedBy,
                    model.ModifiedBy
                };

                string result = await _dbcon.ExecuteScalarAsync("sp_SetGRN", p);
                return Ok(new { id = result, message = model.GrnId == 0 ? "GRN created" : "GRN updated" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "SetGRN", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving GRN." });
            }
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeleteGRN(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteGRN", new { GrnId = id });
                if (result == "NotExists")    return NotFound(new { message = "GRN not found." });
                if (result == "CannotDelete") return BadRequest(new { message = "Only Draft GRNs can be deleted." });
                return Ok(new { id, message = "GRN deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "DeleteGRN", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting GRN." });
            }
        }

        // ── CHANGE STATUS ────────────────────────────────────────────────────
        [HttpPost("changestatus")]
        public async Task<IActionResult> ChangeStatus([FromBody] StatusChangeRequest model)
        {
            // Require login password when marking as Received
            if (string.Equals(model.Status, "Received", StringComparison.OrdinalIgnoreCase))
            {
                if (string.IsNullOrWhiteSpace(model.LoginPassword))
                    return BadRequest(new { message = "Your login password is required to mark this GRN as Received." });
                var valid = await _dbcon.QueryAsync<dynamic>("sp_ValidateUser",
                    new { Username = model.ChangedBy, Password = Sha256Hex(model.LoginPassword) });
                if (!valid.Any())
                {
                    await _dbcon.WriteRawLog("Incorrect login password on GRN Received attempt.",
                        controller: "Grn", action: "ChangeStatus",
                        requestPath: HttpContext.Request.Path, userId: model.ChangedBy, logLevel: "Warning");
                    return BadRequest(new { message = "Incorrect password. Status not changed." });
                }
            }

            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ChangeGRNStatus", new
                {
                    GrnId     = model.Id,
                    NewStatus = model.Status,
                    model.ChangedBy
                });
                return Ok(new { message = $"Status updated to {model.Status}" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "ChangeStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error changing status." });
            }
        }

        // ── CANCEL (password-protected) ──────────────────────────────────────
        [HttpPost("{id:int}/cancel")]
        public async Task<IActionResult> CancelGRN(int id, [FromBody] CancelGrnRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.CancelledBy))
                return BadRequest(new { message = "CancelledBy is required." });
            if (string.IsNullOrWhiteSpace(model.Reason))
                return BadRequest(new { message = "Cancellation reason is required." });
            if (string.IsNullOrWhiteSpace(model.Password))
                return BadRequest(new { message = "Password is required." });
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_CancelGRN", new
                {
                    GrnId        = id,
                    CancelledBy  = model.CancelledBy,
                    Reason       = model.Reason.Trim(),
                    PasswordHash = Sha256Hex(model.Password)
                });
                return Ok(new { message = "GRN cancelled successfully." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "CancelGRN", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error cancelling GRN." });
            }
        }

        private static string Sha256Hex(string input)
        {
            using var sha = SHA256.Create();
            var hash = sha.ComputeHash(Encoding.UTF8.GetBytes(input));
            return BitConverter.ToString(hash).Replace("-", "").ToLower();
        }

        // ── LINES ────────────────────────────────────────────────────────────
        [HttpGet("lines/{grnId:int}")]
        public async Task<IActionResult> GetLines(int grnId)
        {
            try
            {
                var list = await _dbcon.QueryAsync<GrnDetail>("sp_GetGRNLines", new { GrnId = grnId });
                return Ok(list ?? new List<GrnDetail>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "GetLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching GRN lines." });
            }
        }

        [HttpPost("lines/save")]
        public async Task<IActionResult> SaveLine([FromBody] GrnDetail model)
        {
            if (string.IsNullOrEmpty(model.ItemDesc))
                return BadRequest(new { message = "Item description is required." });
            try
            {
                var p = new
                {
                    model.GrnDetailId,
                    model.GrnId,
                    model.PoLineId,
                    model.PrLineId,
                    model.ItemId,
                    model.ItemCode,
                    model.ItemDesc,
                    model.OrderedQty,
                    model.ReceivedQty,
                    model.RejectedQty,
                    model.UomId,
                    model.UomName,
                    model.UnitPrice,
                    model.TaxPct,
                    model.BatchNo,
                    model.SerialNo,
                    model.ExpiryDate,
                    model.StorageLocation,
                    model.BinLocation,
                    model.QcStatus,
                    model.QcRemarks,
                    model.Remarks,
                    model.CreatedBy,
                    model.ModifiedBy
                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetGRNLine", p);
                return Ok(new { id = result, message = "Line saved successfully" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving GRN line." });
            }
        }

        // ── CLEAR INVOICE REFERENCE ──────────────────────────────────────────
        [HttpPost("{id:int}/clear-invoice")]
        public async Task<IActionResult> ClearInvoice(int id, [FromQuery] string modifiedBy)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ClearGRNInvoice", new { GrnId = id, ModifiedBy = modifiedBy });
                return Ok(new { message = "Invoice reference cleared." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "ClearInvoice", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error clearing invoice reference." });
            }
        }

        [HttpDelete("lines/{id:int}")]
        public async Task<IActionResult> DeleteLine(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteGRNLine", new { GrnDetailId = id });
                if (result == "NotExists") return NotFound(new { message = "Line not found." });
                return Ok(new { id, message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting GRN line." });
            }
        }

        // ── QC CHECKLIST ITEMS ───────────────────────────────────────────────
        [HttpGet("qc-items")]
        public async Task<IActionResult> GetQcItems()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<ERPWEB.Models.Procurement.GrnQcItem>("sp_GetGRNQCItems", null);
                return Ok(rows ?? Enumerable.Empty<ERPWEB.Models.Procurement.GrnQcItem>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "GetQcItems", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading QC checklist." });
            }
        }

        // ── SAVE QC LOG ──────────────────────────────────────────────────────
        [HttpPost("{id:int}/qc-log")]
        public async Task<IActionResult> SaveQcLog(int id, [FromBody] ERPWEB.Models.Procurement.SaveGrnQcLogRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.CheckedBy))
                return BadRequest(new { message = "CheckedBy is required." });
            if (model.Items == null || model.Items.Count == 0)
                return BadRequest(new { message = "No checklist items provided." });
            try
            {
                if (string.IsNullOrWhiteSpace(model.Decision))
                    return BadRequest(new { message = "A Usage Decision (Accept, ConditionalAccept, or Reject) is required." });

                var itemsJson = System.Text.Json.JsonSerializer.Serialize(model.Items.Select(i => new
                {
                    qcItemId  = i.QcItemId,
                    itemName  = i.ItemName,
                    isChecked = i.IsChecked,
                    notes     = i.Notes
                }));
                var result = await _dbcon.ExecuteScalarAsync("sp_SaveGRNQCLog", new
                {
                    GrnId         = id,
                    CheckedBy     = model.CheckedBy,
                    Remarks       = string.IsNullOrWhiteSpace(model.Remarks)       ? null : model.Remarks.Trim(),
                    ItemsJson     = itemsJson,
                    Decision      = model.Decision.Trim(),
                    DecisionNotes = string.IsNullOrWhiteSpace(model.DecisionNotes) ? null : model.DecisionNotes.Trim(),
                    DecisionBy    = string.IsNullOrWhiteSpace(model.DecisionBy)    ? model.CheckedBy : model.DecisionBy.Trim()
                });
                return Ok(new { qcLogId = result, message = "QC log saved." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "SaveQcLog", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving QC log." });
            }
        }

        // ── GET QC LOG ───────────────────────────────────────────────────────
        [HttpGet("{id:int}/qc-log")]
        public async Task<IActionResult> GetQcLog(int id)
        {
            try
            {
                using var grid = await _dbcon.QueryMultipleAsync("sp_GetGRNQCLog", new { GrnId = id });
                var headers = (await grid.ReadAsync<ERPWEB.Models.Procurement.GrnQcLogHeader>()).ToList();
                var details = (await grid.ReadAsync<ERPWEB.Models.Procurement.GrnQcLogDetail>()).ToList();
                return Ok(new { headers, details });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Grn", action: "GetQcLog", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading QC log." });
            }
        }
    }
}
