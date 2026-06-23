using ERPWEB.Dbcontext;
using ERPWEB.Models.Procurement;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Procurement
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class SubcontractController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public SubcontractController(DbCon dbcon) { _dbcon = dbcon; }

        // ── LIST ─────────────────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> Search(
            [FromQuery] string? search          = null,
            [FromQuery] string? status          = null,
            [FromQuery] string? subcontractType = null,
            [FromQuery] int?    vendorId        = null,
            [FromQuery] string? jobId           = null,
            [FromQuery] int     page            = 1,
            [FromQuery] int     pageSize        = 20)
        {
            try
            {
                var totalRows = new Dapper.DynamicParameters();
                totalRows.Add("Search",          string.IsNullOrWhiteSpace(search) ? null : search.Trim());
                totalRows.Add("Status",          string.IsNullOrWhiteSpace(status) ? null : status);
                totalRows.Add("SubcontractType", string.IsNullOrWhiteSpace(subcontractType) ? null : subcontractType);
                totalRows.Add("VendorId",        vendorId);
                totalRows.Add("JobId",           string.IsNullOrWhiteSpace(jobId) ? null : jobId.Trim());
                totalRows.Add("Page",            page < 1 ? 1 : page);
                totalRows.Add("PageSize",        pageSize is < 1 or > 200 ? 20 : pageSize);
                totalRows.Add("TotalRows",       dbType: System.Data.DbType.Int32,
                              direction: System.Data.ParameterDirection.Output);

                var rows  = await _dbcon.QueryAsync<SubcontractOrder>("sp_GetSubcontractList", totalRows);
                var list  = rows?.ToList() ?? new List<SubcontractOrder>();
                int total = totalRows.Get<int>("TotalRows");

                return Ok(new { totalRows = total, page, pageSize,
                                totalPages = (int)Math.Ceiling((double)total / pageSize), data = list });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Subcontract", action: "Search", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching subcontract orders." });
            }
        }

        // ── GET SINGLE ───────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> Get(int id)
        {
            try
            {
                using var multi = await _dbcon.QueryMultipleAsync("sp_GetSubcontractOrder", new { SubcontractId = id });
                var header = (await multi.ReadAsync<SubcontractOrder>()).FirstOrDefault();
                if (header == null) return NotFound(new { message = "Subcontract order not found." });
                var components = (await multi.ReadAsync<SubcontractComponent>()).ToList();
                return Ok(new { header, components });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Subcontract", action: "Get", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching subcontract order." });
            }
        }

        // ── SAVE ─────────────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveSubcontractOrderRequest model)
        {
            try
            {
                var p = new
                {
                    SubcontractId      = model.SubcontractId,
                    SubcontractType    = model.SubcontractType,
                    VendorId           = model.VendorId,
                    JobId              = model.JobId,
                    BudgetHeaderId     = model.BudgetHeaderId,
                    OutputItemId       = model.OutputItemId,
                    OutputQty          = model.OutputQty,
                    OutputUomId        = model.OutputUomId,
                    ServiceDescription = model.ServiceDescription,
                    ExpectedDate       = model.ExpectedDate,
                    Remarks            = model.Remarks,
                    ComponentsJson     = model.ComponentsJson,
                    PoId               = model.PoId,
                    ActionBy           = model.ActionBy
                };
                var result = await _dbcon.ExecuteScalarAsync("sp_SaveSubcontractOrder", p);
                return Ok(new { subcontractId = result, message = model.SubcontractId == null ? "Subcontract order created." : "Subcontract order updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Subcontract", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving subcontract order." });
            }
        }

        // ── CHANGE STATUS ────────────────────────────────────────────────────
        [HttpPost("{id:int}/status")]
        public async Task<IActionResult> ChangeStatus(int id, [FromBody] SubcontractStatusRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_ChangeSubcontractOrderStatus", new
                {
                    SubcontractId = id,
                    model.NewStatus,
                    model.ActionBy
                });
                return Ok(new { message = $"Status changed to {model.NewStatus}." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Subcontract", action: "ChangeStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error changing status." });
            }
        }

        // ── MATERIAL OUT — GET ────────────────────────────────────────────────
        [HttpGet("{id:int}/material-outs")]
        public async Task<IActionResult> GetMaterialOuts(int id)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<MaterialOut>("sp_GetMaterialOut", new { SubcontractId = id });
                return Ok(rows?.ToList() ?? new List<MaterialOut>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Subcontract", action: "GetMaterialOuts", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching material outs." });
            }
        }

        [HttpGet("material-out/{materialOutId:int}")]
        public async Task<IActionResult> GetMaterialOut(int materialOutId)
        {
            try
            {
                using var multi = await _dbcon.QueryMultipleAsync("sp_GetMaterialOut", new { MaterialOutId = materialOutId });
                var header = (await multi.ReadAsync<MaterialOut>()).FirstOrDefault();
                if (header == null) return NotFound(new { message = "Material Out not found." });
                var lines = (await multi.ReadAsync<MaterialOutLine>()).ToList();
                return Ok(new { header, lines });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Subcontract", action: "GetMaterialOut", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching material out." });
            }
        }

        // ── MATERIAL OUT — SAVE ───────────────────────────────────────────────
        [HttpPost("material-out/save")]
        public async Task<IActionResult> SaveMaterialOut([FromBody] SaveMaterialOutRequest model)
        {
            try
            {
                var p = new
                {
                    MaterialOutId = model.MaterialOutId,
                    SubcontractId = model.SubcontractId,
                    OutDate       = model.OutDate,
                    Notes         = model.Notes,
                    LinesJson     = model.LinesJson,
                    ActionBy      = model.ActionBy
                };
                var result = await _dbcon.ExecuteScalarAsync("sp_SaveMaterialOut", p);
                return Ok(new { materialOutId = result, message = model.MaterialOutId == null ? "Material Out created." : "Material Out updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Subcontract", action: "SaveMaterialOut", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving material out." });
            }
        }

        // ── MATERIAL OUT — POST ───────────────────────────────────────────────
        [HttpPost("material-out/{materialOutId:int}/post")]
        public async Task<IActionResult> PostMaterialOut(int materialOutId, [FromBody] ActionByRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_PostMaterialOut", new
                {
                    MaterialOutId = materialOutId,
                    ActionBy      = model.ActionBy
                });
                return Ok(new { message = "Material Out posted." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Subcontract", action: "PostMaterialOut", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error posting material out." });
            }
        }

        // ── SUBCONTRACT RECEIPT — GET ─────────────────────────────────────────
        [HttpGet("{id:int}/receipts")]
        public async Task<IActionResult> GetReceipts(int id)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<SubcontractReceipt>("sp_GetSubcontractReceiptList", new { SubcontractId = id });
                return Ok(rows?.ToList() ?? new List<SubcontractReceipt>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Subcontract", action: "GetReceipts", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching receipts." });
            }
        }

        // ── SUBCONTRACT RECEIPT — SAVE ────────────────────────────────────────
        [HttpPost("receipt/save")]
        public async Task<IActionResult> SaveReceipt([FromBody] SaveSubcontractReceiptRequest model)
        {
            try
            {
                var p = new
                {
                    SubcontractReceiptId = model.SubcontractReceiptId,
                    SubcontractId        = model.SubcontractId,
                    ReceiptDate          = model.ReceiptDate,
                    ReceivedQty          = model.ReceivedQty,
                    UnitCost             = model.UnitCost,
                    VendorRef            = model.VendorRef,
                    Notes                = model.Notes,
                    ActionBy             = model.ActionBy
                };
                var result = await _dbcon.ExecuteScalarAsync("sp_SaveSubcontractReceipt", p);
                return Ok(new { subcontractReceiptId = result, message = model.SubcontractReceiptId == null ? "Receipt created." : "Receipt updated." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Subcontract", action: "SaveReceipt", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving receipt." });
            }
        }

        // ── SUBCONTRACT RECEIPT — POST ────────────────────────────────────────
        [HttpPost("receipt/{receiptId:int}/post")]
        public async Task<IActionResult> PostReceipt(int receiptId, [FromBody] ActionByRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_PostSubcontractReceipt", new
                {
                    SubcontractReceiptId = receiptId,
                    ActionBy             = model.ActionBy
                });
                return Ok(new { message = "Receipt posted. Finished goods added to stock." });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Subcontract", action: "PostReceipt", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error posting receipt." });
            }
        }
    }

    public class ActionByRequest
    {
        public string ActionBy { get; set; } = "";
    }
}
