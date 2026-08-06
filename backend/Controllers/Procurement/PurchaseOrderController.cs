using Dapper;
using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography;
using System.Text;

namespace ERPWEB.Controllers.Procurement
{
    using PurchaseOrder       = ERPWEB.Models.Procurement.PurchaseOrder;
    using PurchaseOrderLine   = ERPWEB.Models.Procurement.PurchaseOrderLine;
    using POBudgetCheckResult = ERPWEB.Models.Procurement.POBudgetCheckResult;
    using PoTerm              = ERPWEB.Models.Procurement.PoTerm;
    using StatusChangeRequest = ERPWEB.Models.Procurement.StatusChangeRequest;
    using AmendQtyRequest     = ERPWEB.Models.Procurement.AmendQtyRequest;
    using AmendLineRequest    = ERPWEB.Models.Procurement.AmendLineRequest;
    using RevisePoRequest     = ERPWEB.Models.Procurement.RevisePoRequest;
    using HoldPoRequest       = ERPWEB.Models.Procurement.HoldPoRequest;
    using ReleasePoRequest    = ERPWEB.Models.Procurement.ReleasePoRequest;

    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class PurchaseOrderController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public PurchaseOrderController(DbCon dbcon) { _dbcon = dbcon; }

        private static string Sha256Hex(string raw)
        {
            using var sha   = SHA256.Create();
            var bytes       = sha.ComputeHash(Encoding.UTF8.GetBytes(raw ?? string.Empty));
            var sb          = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        // Camel-case key normalizer for `dynamic` rows from Dapper. CRITICAL: we
        // intentionally do NOT enable JsonNamingPolicy.CamelCase on the JSON
        // serializer (per CLAUDE.md) — that breaks the rest of the app. So we
        // convert keys ourselves at the point we return camelCase-shaped DTOs.
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

        // ── SEARCH ───────────────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> SearchPOs(
            [FromQuery] string? searchText        = null,
            [FromQuery] string? status            = null,
            [FromQuery] int?    supplierId        = null,
            [FromQuery] string? jobId             = null,
            [FromQuery] string? priority          = null,
            [FromQuery] string? createdBy         = null,
            [FromQuery] string? dateFrom          = null,
            [FromQuery] string? dateTo            = null,
            [FromQuery] bool?   isSubcontractOnly = null,
            [FromQuery] int     page              = 1,
            [FromQuery] int     pageSize          = 20,
            [FromQuery] string  sortCol           = "PoDate",
            [FromQuery] string  sortDir           = "DESC")
        {
            try
            {
                var p = new
                {
                    SearchText         = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    Status             = string.IsNullOrWhiteSpace(status)     ? null : status,
                    SupplierId         = supplierId,
                    JobId              = string.IsNullOrWhiteSpace(jobId)      ? null : jobId.Trim(),
                    Priority           = string.IsNullOrWhiteSpace(priority)   ? null : priority.Trim(),
                    CreatedBy          = string.IsNullOrWhiteSpace(createdBy)  ? null : createdBy.Trim(),
                    DateFrom           = string.IsNullOrWhiteSpace(dateFrom)   ? null : dateFrom,
                    DateTo             = string.IsNullOrWhiteSpace(dateTo)     ? null : dateTo,
                    IsSubcontractOnly  = isSubcontractOnly,
                    PageNumber         = page < 1 ? 1 : page,
                    PageSize           = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn         = sortCol,
                    SortDirection      = sortDir
                };

                var rows  = await _dbcon.QueryAsync<PurchaseOrder>("sp_SearchPOs", p);
                var list  = rows?.ToList() ?? new List<PurchaseOrder>();
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
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "SearchPOs", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching purchase orders." });
            }
        }

        // ── GET BY ID ────────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetPO(int id)
        {
            try
            {
                var rows   = await _dbcon.QueryAsync<PurchaseOrder>("sp_GetPO", new { PoId = id });
                var record = rows?.FirstOrDefault();
                if (record == null) return NotFound(new { message = "Purchase Order not found." });
                return Ok(record);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "GetPO", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching purchase order." });
            }
        }

        // ── SAVE ─────────────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> SetPO([FromBody] PurchaseOrder model)
        {
            try
            {
                var p = new
                {
                    model.PoId,
                    model.PoDate,
                    model.SupplierId,
                    model.SupplierContactId,
                    model.JobId,
                    model.VendorName,
                    model.VendorRef,
                    model.VendorQuoteDate,
                    model.CurrencyId,
                    model.ExchangeRate,
                    model.PaymentTermsId,
                    model.PaymentTermsOther,
                    model.DeliveryDate,
                    model.DeliveryAddr,
                    model.DeliveryTerms,
                    model.Discount,
                    model.TaxAmount,
                    model.TotalAmount,
                    model.PaidAmount,
                    model.InvoiceReceived,
                    model.ApprovedBy,
                    model.ApprovedDate,
                    model.HoldBy,
                    model.HoldDate,
                    model.Revision,
                    model.Priority,
                    model.Notes,
                    model.ExpenseCategoryId,
                    model.CreatedBy,
                    model.ModifiedBy
                };

                string result = await _dbcon.ExecuteScalarAsync("sp_SetPO", p);
                return Ok(new { id = result, message = model.PoId == 0 ? "Purchase Order created" : "Purchase Order updated" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                // Mandatory-field / business-rule errors raised by the SP — surface to the user.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "SetPO", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving purchase order." });
            }
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> DeletePO(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeletePO", new { PoId = id });
                if (result == "NotExists")    return NotFound(new { message = "Purchase Order not found." });
                if (result == "CannotDelete") return BadRequest(new { message = "Only Draft purchase orders can be deleted." });
                return Ok(new { id, message = "Purchase Order deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "DeletePO", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting purchase order." });
            }
        }

        // ── REVISE ───────────────────────────────────────────────────────────
        [HttpPost("{id:int}/revise")]
        public async Task<IActionResult> RevisePO(int id, [FromBody] RevisePoRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.Reason))
                return BadRequest(new { message = "A reason is required to revise the PO." });
            if (string.IsNullOrWhiteSpace(model.Password))
                return BadRequest(new { message = "Password is required." });
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_RevisePO", new
                {
                    PoId         = id,
                    RevisedBy    = model.RevisedBy,
                    Reason       = model.Reason.Trim(),
                    PasswordHash = Sha256Hex(model.Password)
                });
                return Ok(new { message = "PO revised. Status reset to Draft — edit lines then re-submit for approval." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "RevisePO", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error revising purchase order." });
            }
        }

        // ── REVISION LOG ─────────────────────────────────────────────────────
        [HttpGet("{id:int}/revisions")]
        public async Task<IActionResult> GetRevisions(int id)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetPORevisionLog", new { PoId = id });
                return Ok(rows ?? new List<dynamic>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "GetRevisions", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching revision log." });
            }
        }

        // ── CHANGE STATUS ────────────────────────────────────────────────────
        // Approval-controlled transitions (Draft → Approved) are blocked.
        // Only operational transitions listed in TBL_DOCUMENT_STATUS.AllowedTransitions
        // for the document's current status are permitted (e.g. Approved→Sent, Sent→Received).
        [HttpPost("changestatus")]
        public async Task<IActionResult> ChangeStatus([FromBody] StatusChangeRequest model)
        {
            try
            {
                // Guard: fetch current status and its allowed transitions for this PO.
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetPOCurrentStatus", new { PoId = model.Id });
                var row  = rows?.FirstOrDefault();

                if (row == null)
                    return NotFound(new { message = "Purchase order not found." });

                string? allowedTransitions = row.AllowedTransitions as string;

                // NULL AllowedTransitions means the status is approval-controlled — block.
                if (string.IsNullOrWhiteSpace(allowedTransitions))
                    return Conflict(new { message = "This status transition is controlled by the approval workflow. Use POST /api/approval/action instead." });

                // Parse comma-separated list and validate requested status is allowed.
                var allowed = allowedTransitions.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (!allowed.Contains(model.Status, StringComparer.OrdinalIgnoreCase))
                    return Conflict(new { message = $"Transition to '{model.Status}' is not permitted from the current status." });

                await _dbcon.ExecuteScalarAsync("sp_ChangePOStatus", new
                {
                    PoId      = model.Id,
                    NewStatus = model.Status,
                    model.ChangedBy
                });
                return Ok(new { message = $"Status updated to {model.Status}" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "ChangeStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error changing status." });
            }
        }

        // ── SAVE META ────────────────────────────────────────────────────────
        [HttpPost("meta/save")]
        public async Task<IActionResult> SaveMeta([FromBody] ERPWEB.Models.Procurement.PurchaseOrderMeta model)
        {
            try
            {
                var p = new
                {
                    model.PoId,
                    model.IsWarranty,
                    model.IsPreInspection,
                    model.IsShipping,
                    model.IsCOO,
                    model.IsDrawing,
                    model.IsMTC,
                    model.IsQtn,
                    model.IsOthers,
                    model.IsNote1,
                    model.IsNote2,
                    model.IsNote3,
                    model.VendorQuoteDate,
                    model.ModifiedBy
                };
                await _dbcon.ExecuteScalarAsync("sp_SetPOMeta", p);
                return Ok(new { message = "Meta information saved." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "SaveMeta", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving meta information." });
            }
        }

        // ── PR LINES FOR IMPORT ──────────────────────────────────────────────
        [HttpGet("prlines/{prId:int}")]
        public async Task<IActionResult> GetPrLinesForImport(int prId, [FromQuery] int poId = 0)
        {
            try
            {
                // Must use a typed model — QueryAsync<dynamic> returns DapperRow (IDictionary) which
                // bypasses the global camelCase JsonNamingPolicy, causing PascalCase keys in JSON.
                var list = await _dbcon.QueryAsync<ERPWEB.Models.Procurement.PrLineForPo>(
                    "sp_GetPRLinesForPO", new { PrId = prId, PoId = poId });
                return Ok(list ?? Enumerable.Empty<ERPWEB.Models.Procurement.PrLineForPo>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "GetPrLinesForImport", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching PR lines." });
            }
        }

        // ── LINES ────────────────────────────────────────────────────────────
        [HttpGet("lines/{poId:int}")]
        public async Task<IActionResult> GetLines(int poId)
        {
            try
            {
                var list = await _dbcon.QueryAsync<PurchaseOrderLine>("sp_GetPOLines", new { PoId = poId });
                return Ok(list ?? new List<PurchaseOrderLine>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "GetLines", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching PO lines." });
            }
        }

        [HttpPost("lines/save")]
        public async Task<IActionResult> SaveLine([FromBody] PurchaseOrderLine model)
        {
            if (string.IsNullOrEmpty(model.ItemDesc))
                return BadRequest(new { message = "Item description is required." });
            try
            {
                var p = new
                {
                    model.PoLineId,
                    model.PoId,
                    model.PrLineId,
                    model.ItemId,
                    model.ItemCode,
                    model.ItemDesc,
                    model.OrderedQty,
                    model.UomId,
                    model.UomName,
                    model.UnitPrice,
                    model.TaxPct,
                    model.Remarks,
                    model.CreatedBy,
                    model.ModifiedBy
                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetPOLine", p);
                return Ok(new { id = result, message = "Line saved successfully" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                // Business-rule violations raised by the SP (PR balance, budget exceeded)
                // are user-facing messages — return 400 so the frontend can display them.
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "SaveLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving PO line." });
            }
        }

        // ── BUDGET CHECK ─────────────────────────────────────────────────────
        /// <summary>
        /// Returns the budget and committed spend for a job + cost category.
        /// Pass excludePoLineId when editing an existing line so its current
        /// value is not double-counted in "committed". Omit categoryId (or
        /// pass 0) to check the whole job's budget across all categories
        /// combined instead of one specific category.
        /// </summary>
        [HttpGet("budget-check")]
        public async Task<IActionResult> GetBudgetCheck(
            [FromQuery] string jobId,
            [FromQuery] int    categoryId = 0,
            [FromQuery] int    excludePoLineId = 0)
        {
            if (string.IsNullOrWhiteSpace(jobId))
                return BadRequest(new { message = "jobId is required." });

            try
            {
                var rows = await _dbcon.QueryAsync<POBudgetCheckResult>(
                    "sp_GetPOBudgetCheck",
                    new { JobId = jobId.Trim(), CostCategoryId = categoryId > 0 ? (int?)categoryId : null, ExcludePoLineId = excludePoLineId });

                var result = rows?.FirstOrDefault();
                if (result == null)
                    return Ok(new POBudgetCheckResult());

                return Ok(result);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "GetBudgetCheck", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching budget check." });
            }
        }

        [HttpPost("lines/{id:int}/changestatus")]
        public async Task<IActionResult> ChangeLineStatus(int id, [FromBody] StatusChangeRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ChangePoLineStatus", new
                {
                    PoLineId  = id,
                    NewStatus = model.Status,
                    ChangedBy = model.ChangedBy,
                });
                return Ok(new { message = $"Line status updated to {model.Status}." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "ChangeLineStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error changing line status." });
            }
        }

        [HttpDelete("lines/{id:int}")]
        public async Task<IActionResult> DeleteLine(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeletePOLine", new { PoLineId = id });
                if (result == "NotExists") return NotFound(new { message = "Line not found." });
                return Ok(new { id, message = "Line deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "DeleteLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting PO line." });
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // ANNEXURES — header + typeable detail rows + linked PO lines.
        // Multi-page specs / drawings list attached to a PO. Read-only once
        // the PO leaves Draft; revising the PO opens them for edit again.
        // ═══════════════════════════════════════════════════════════════════

        [HttpGet("{poId:int}/annexures")]
        public async Task<IActionResult> GetAnnexures(int poId)
        {
            try
            {
                using var grid = await _dbcon.QueryMultipleAsync("sp_GetPOAnnexures", new { PoId = poId });
                var headers = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var details = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                var links   = (await grid.ReadAsync<dynamic>()).Select(ToCamel).ToList();
                return Ok(new { headers, details, links });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "GetAnnexures", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading annexures." });
            }
        }

        public record SaveAnnexureRequest(int AnnexureId, int PoId, string? AnnexureCode, string? Title, string? Notes, int SortOrder, string? CreatedBy, string? ModifiedBy);

        [HttpPost("annexure/save")]
        public async Task<IActionResult> SaveAnnexure([FromBody] SaveAnnexureRequest model)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_SetPOAnnexure", new
                {
                    AnnexureId   = model.AnnexureId,
                    PoId         = model.PoId,
                    AnnexureCode = model.AnnexureCode,
                    Title        = model.Title,
                    Notes        = model.Notes,
                    SortOrder    = model.SortOrder,
                    CreatedBy    = model.CreatedBy,
                    ModifiedBy   = model.ModifiedBy
                });
                var r = rows?.FirstOrDefault();
                return Ok(new { annexureId = (int)r!.AnnexureId, annexureCode = (string?)r.AnnexureCode });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) { return BadRequest(new { message = sqlEx.Message }); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "SaveAnnexure", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving annexure." });
            }
        }

        public record SaveAnnexureDetailRequest(int AnnexureDetailId, int AnnexureId, int LineNum, string? Description, string? Remarks, string? CreatedBy, string? ModifiedBy);

        [HttpPost("annexure/detail/save")]
        public async Task<IActionResult> SaveAnnexureDetail([FromBody] SaveAnnexureDetailRequest model)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_SetPOAnnexureDetail", new
                {
                    AnnexureDetailId = model.AnnexureDetailId,
                    AnnexureId       = model.AnnexureId,
                    LineNum          = model.LineNum,
                    Description      = model.Description,
                    Remarks          = model.Remarks,
                    CreatedBy        = model.CreatedBy,
                    ModifiedBy       = model.ModifiedBy
                });
                var r = rows?.FirstOrDefault();
                return Ok(new { annexureDetailId = (int)r!.AnnexureDetailId });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) { return BadRequest(new { message = sqlEx.Message }); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "SaveAnnexureDetail", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving annexure row." });
            }
        }

        [HttpDelete("annexure/detail/{id:int}")]
        public async Task<IActionResult> DeleteAnnexureDetail(int id, [FromQuery] string? modifiedBy = null)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeletePOAnnexureDetail", new { AnnexureDetailId = id, ModifiedBy = modifiedBy });
                return Ok(new { message = "Row deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) { return BadRequest(new { message = sqlEx.Message }); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "DeleteAnnexureDetail", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting annexure row." });
            }
        }

        [HttpDelete("annexure/{id:int}")]
        public async Task<IActionResult> DeleteAnnexure(int id, [FromQuery] string? modifiedBy = null)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_DeletePOAnnexure", new { AnnexureId = id, ModifiedBy = modifiedBy });
                return Ok(new { message = "Annexure deleted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) { return BadRequest(new { message = sqlEx.Message }); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "DeleteAnnexure", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting annexure." });
            }
        }

        public record SaveAnnexureLinksRequest(int AnnexureId, string? PoLineIds, string? CreatedBy);

        [HttpPost("annexure/links/save")]
        public async Task<IActionResult> SaveAnnexureLinks([FromBody] SaveAnnexureLinksRequest model)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_SetPOAnnexureLineLinks", new
                {
                    AnnexureId = model.AnnexureId,
                    PoLineIds  = model.PoLineIds,
                    CreatedBy  = model.CreatedBy
                });
                var r = rows?.FirstOrDefault();
                return Ok(new { linkCount = (int)(r?.LinkCount ?? 0) });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx) { return BadRequest(new { message = sqlEx.Message }); }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "SaveAnnexureLinks", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving annexure line links." });
            }
        }

        // ── AMEND LINE QTY ───────────────────────────────────────────────────
        // Reduces ordered qty on an Approved/Partial PO line down to received qty.
        // Used to close out partially-delivered lines without a full revision.
        [HttpPost("lines/{id:int}/amend-qty")]
        public async Task<IActionResult> AmendLineQty(int id, [FromBody] AmendQtyRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_AmendPOLineQty", new
                {
                    PoLineId   = id,
                    NewQty     = model.NewQty,
                    ModifiedBy = model.ModifiedBy
                });
                return Ok(new { message = "Ordered quantity updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "AmendLineQty", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error amending line quantity." });
            }
        }

        // ── AMENDMENT LOG ────────────────────────────────────────────────────
        [HttpGet("{id:int}/amendments")]
        public async Task<IActionResult> GetAmendments(int id)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetPOAmendmentLog", new { PoId = id });
                return Ok(rows ?? new List<dynamic>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "GetAmendments", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching amendment log." });
            }
        }

        // ── AMEND LINE (QTY + PRICE) ─────────────────────────────────────────
        [HttpPost("lines/{id:int}/amend")]
        public async Task<IActionResult> AmendLine(int id, [FromBody] AmendLineRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.Reason))
                return BadRequest(new { message = "A reason is required for amendment." });
            if (string.IsNullOrWhiteSpace(model.Password))
                return BadRequest(new { message = "Password is required." });
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_AmendPOLine", new
                {
                    PoLineId     = id,
                    NewQty       = model.NewQty,
                    NewPrice     = model.NewPrice,
                    Reason       = model.Reason.Trim(),
                    PasswordHash = Sha256Hex(model.Password),
                    ModifiedBy   = model.ModifiedBy
                });
                return Ok(new { message = "Line amended." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "AmendLine", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error amending PO line." });
            }
        }

        // ── HOLD LOG ─────────────────────────────────────────────────────────
        [HttpGet("{id:int}/hold-log")]
        public async Task<IActionResult> GetHoldLog(int id)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("sp_GetPOHoldLog", new { PoId = id });
                return Ok(rows ?? new List<dynamic>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "GetHoldLog", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching hold log." });
            }
        }

        // ── HOLD PO ──────────────────────────────────────────────────────────
        [HttpPost("{id:int}/hold")]
        public async Task<IActionResult> HoldPO(int id, [FromBody] HoldPoRequest model)
        {
            if (string.IsNullOrWhiteSpace(model.Reason))
                return BadRequest(new { message = "A reason is required to place the PO on hold." });
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_HoldPO", new
                {
                    PoId   = id,
                    Reason = model.Reason.Trim(),
                    HeldBy = model.HoldBy
                });
                return Ok(new { message = "Purchase Order placed on hold." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "HoldPO", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error placing PO on hold." });
            }
        }

        // ── RELEASE PO ───────────────────────────────────────────────────────
        [HttpPost("{id:int}/release")]
        public async Task<IActionResult> ReleasePO(int id, [FromBody] ReleasePoRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ReleasePO", new
                {
                    PoId       = id,
                    ReleasedBy = model.ReleasedBy,
                    Reason     = string.IsNullOrWhiteSpace(model.Reason) ? null : model.Reason.Trim()
                });
                return Ok(new { message = "Purchase Order hold released." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "ReleasePO", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error releasing PO hold." });
            }
        }

        // ── PO TERMS & CONDITIONS ────────────────────────────────────────────
        [HttpGet("terms")]
        public async Task<IActionResult> GetTerms()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<PoTerm>("proj.sp_GetPoTerms", null);
                return Ok(rows ?? Enumerable.Empty<PoTerm>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "PurchaseOrder", action: "GetTerms", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Failed to load PO terms." });
            }
        }
    }
}
