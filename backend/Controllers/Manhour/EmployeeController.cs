using System.Text.Json;
using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Manhour
{
    public class EmployeeModel
    {
        public int      EmployeeId   { get; set; }
        public string   EmpCode      { get; set; } = string.Empty;
        public string   EmployeeName { get; set; } = string.Empty;
        public string   EmpType      { get; set; } = "COMPANY";
        public int?     SupplierId   { get; set; }
        public string?  SupplierCode { get; set; }
        public string?  SupplierName { get; set; }
        public bool     IsActive     { get; set; } = true;
        public string?  CreatedBy    { get; set; }
        public DateTime CreatedDate  { get; set; }
    }

    public class ImportEmployeeRow
    {
        public string   EmpCode      { get; set; } = string.Empty;
        public string   EmployeeName { get; set; } = string.Empty;
        public string   EmpType      { get; set; } = "COMPANY";
        public string?  SupplierCode { get; set; }
    }

    public class ImportEmployeeRequest
    {
        public List<ImportEmployeeRow> Rows    { get; set; } = new();
        public string                  SavedBy { get; set; } = string.Empty;
    }

    public class SaveEmployeeRequest
    {
        public int      EmployeeId   { get; set; }
        public string   EmpCode      { get; set; } = string.Empty;
        public string   EmployeeName { get; set; } = string.Empty;
        public string   EmpType      { get; set; } = "COMPANY";
        public int?     SupplierId   { get; set; }
        public bool     IsActive     { get; set; } = true;
        public string   SavedBy      { get; set; } = string.Empty;
    }

    [Authorize]
    [Route("api/employee")]
    [ApiController]
    public class EmployeeController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public EmployeeController(DbCon dbcon) { _dbcon = dbcon; }

        [HttpGet]
        public async Task<IActionResult> GetAll()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<EmployeeModel>("sp_GetEmployeeList");
                return Ok(rows ?? Enumerable.Empty<EmployeeModel>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Employee", action: "GetAll", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error loading employees." });
            }
        }

        // ── POST /api/employee/import ─────────────────────────────────────
        [HttpPost("import")]
        public async Task<IActionResult> Import([FromBody] ImportEmployeeRequest req)
        {
            if (req.Rows == null || req.Rows.Count == 0)
                return BadRequest(new { message = "No rows to import." });

            try
            {
                var json = JsonSerializer.Serialize(req.Rows.Select(r => new
                {
                    empCode      = r.EmpCode.Trim().ToUpper(),
                    employeeName = r.EmployeeName.Trim(),
                    empType      = string.IsNullOrWhiteSpace(r.EmpType) ? "COMPANY" : r.EmpType.Trim().ToUpper(),
                    supplierCode = string.IsNullOrWhiteSpace(r.SupplierCode) ? null : r.SupplierCode.Trim().ToUpper(),
                }));

                var rows = await _dbcon.QueryAsync<dynamic>("sp_ImportEmployees", new
                {
                    EmployeesJson = json,
                    SavedBy       = req.SavedBy,
                });

                var results = rows?.ToList() ?? new List<dynamic>();
                var imported = results.Count(r => Convert.ToBoolean(r.Success));
                var failed   = results.Count(r => !Convert.ToBoolean(r.Success));

                return Ok(new
                {
                    imported,
                    failed,
                    results = results.Select(r => new
                    {
                        empCode      = (string?)r.EmpCode,
                        employeeName = (string?)r.EmployeeName,
                        success      = Convert.ToBoolean(r.Success),
                        message      = (string?)r.Message,
                    }),
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Employee", action: "Import", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error importing employees." });
            }
        }

        [HttpPost("save")]
        public async Task<IActionResult> Save([FromBody] SaveEmployeeRequest req)
        {
            if (string.IsNullOrWhiteSpace(req.EmpCode))
                return BadRequest(new { message = "Employee code is required." });
            if (string.IsNullOrWhiteSpace(req.EmployeeName))
                return BadRequest(new { message = "Employee name is required." });

            var empType = string.IsNullOrWhiteSpace(req.EmpType) ? "COMPANY" : req.EmpType.Trim().ToUpper();
            if (empType != "COMPANY" && empType != "OUTSOURCED")
                return BadRequest(new { message = "EmpType must be COMPANY or OUTSOURCED." });

            try
            {
                var result = await _dbcon.QueryFirstAsync<dynamic>("sp_SaveEmployee", new
                {
                    EmployeeId   = req.EmployeeId,
                    EmpCode      = req.EmpCode.Trim().ToUpper(),
                    EmployeeName = req.EmployeeName.Trim(),
                    EmpType      = empType,
                    SupplierId   = empType == "OUTSOURCED" ? req.SupplierId : null,
                    IsActive     = req.IsActive,
                    SavedBy      = req.SavedBy,
                });

                int id = (int)result.EmployeeId;
                if (id < 0)
                    return BadRequest(new { message = (string)result.Message });

                return Ok(new { employeeId = id, message = (string)result.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Employee", action: "Save", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving employee." });
            }
        }
    }
}
