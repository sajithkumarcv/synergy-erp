using ERPWEB.Dbcontext;
using ERPWEB.Models.General;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Data;


namespace ERPWEB.Controllers.General
{
    [Authorize]
    [Route("api/[Controller]")]
    [ApiController]
    public class CountryController : ControllerBase
    {

        private readonly DbCon _dbcon;
        public CountryController(DbCon dbcon)
        {
            _dbcon = dbcon;
        }

        [HttpGet]
        public async Task<IActionResult> GetAllCountry()
        {
            try
            {
                DataSet ds = _dbcon.ExecuteProcedure("sp_GetCountryList");

                if (ds == null || ds.Tables.Count == 0)
                    return NotFound("No data found");

                // Convert the DataTable rows into a List of Dictionary or a Custom Class
                var results = ds.Tables[0].AsEnumerable().Select(row => new
                {
                    // Match these names to your SQL Column Names
                    CountryId = row["CountryId"],
                    CountryCode = row["CountryCode"],
                    CountryName = row["CountryName"],
                    SortOrder = row["SortOrder"],
                    IsActive = row["IsActive"],
                    CreatedBy = row["CreatedBy"],
                    CreatedDate = row["CreatedDate"],
                    ModifiedBy = row["ModifiedBy"],
                    ModifiedDate = row["ModifiedDate"]
                }).ToList();

                return Ok(results);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Country", action: "GetAllCountry", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        [HttpPost("save")]
        public async Task<IActionResult> SetCountry([FromBody] Country model)
        {
            if (string.IsNullOrWhiteSpace(model.CountryName) || string.IsNullOrWhiteSpace(model.CountryCode))
            {
                return BadRequest(new { message = "Country Name and Code are required." });
            }
            try
            {
                // 1. Prepare the parameters matching your SP variable names
                var parameters = new Dictionary<string, object>

        {
            { "@CountryName", model.CountryName },
            { "@CountryCode", model.CountryCode },
            { "@IsActive", model.IsActive },
            { "@SortOrder", model.SortOrder }, { "@CreatedBy", model.CreatedBy }, { "@ModifiedBy", (object?)model.ModifiedBy ?? DBNull.Value },
            { "@CountryId", model.CountryId },// Send 0 to Insert, or an ID to Update
        };


                string result = _dbcon.ExecuteSetProcedure(parameters, "sp_SetCountry");

                // 1. Handle Duplicate Case
                if (result == "-1")
                {
                    return BadRequest(new { message = "Duplicate Error: A Country with this name already exists." });
                }

                // 2. Handle Success Case
                if (!string.IsNullOrEmpty(result) && result != "0")
                {
                    // If DepartmentId was 0 in parameters, it was an Insert. Otherwise, an Update.
                    string action = parameters["@CountryId"].ToString() == "0" ? "added" : "updated";

                    return Ok(new
                    {
                        id = result,
                        message = $"Country {action} successfully"
                    });
                }
            }
            // 3. Fallback for unexpected failures
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Country", action: "SetCountry", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
            return BadRequest(new { message = "An error occurred while saving the Country." });

        }


        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCountry(int id)
        {
            try
            {
                var parameters = new Dictionary<string, object>
        {
            { "@CountryId", id }
        };

                // Call the method - it returns the string from our SQL SELECT
                string result = _dbcon.ExecuteSetProcedure(parameters, "sp_DeleteCountry");

                // 1. Handle "Not Exists" Case
                if (result == "NotExists")
                {
                    return NotFound(new { message = "Country not found or already deleted." });
                }

                // 2. Handle "Deleted" Success Case
                if (result == "Deleted")
                {
                    return Ok(new
                    {
                        id,
                        message = "Country Deleted successfully"
                    });
                }

                // 3. Fallback if something else was returned
                return BadRequest(new { message = "An error occurred while Deleting the Country." });
            }
            catch (Exception ex)
            {
                // 4. Handle actual code/connection crashes
                await _dbcon.WriteLog(ex, controller: "Country", action: "DeleteCountry", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }
    }

}

