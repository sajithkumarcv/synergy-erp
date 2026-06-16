using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ERPWEB.Dbcontext;
using ERPWEB.Models.General;

namespace ERPWEB.Controllers.General
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class CompanyController : ControllerBase
    {
        private readonly DbCon _db;
        private readonly IWebHostEnvironment _env;
        public CompanyController(DbCon db, IWebHostEnvironment env)
        {
            _db  = db;
            _env = env;
        }

        // GET api/company/owner
        // Returns the IsOwner=1 company with its addresses and bank accounts.
        [HttpGet("owner")]
        public async Task<IActionResult> GetOwner()
        {
            try
            {
                using var multi = await _db.QueryMultipleAsync("proj.sp_GetOwnerCompany");

                var company   = (await multi.ReadAsync<OwnerCompany>()).FirstOrDefault();
                if (company is null)
                    return NotFound(new { message = "No owner company configured." });

                company.Addresses = (await multi.ReadAsync<CompanyAddress>()).ToList();
                company.Banks     = (await multi.ReadAsync<CompanyBank>()).ToList();

                return Ok(company);
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "CompanyController", "GetOwner");
                return StatusCode(500, new { message = "Failed to load company details." });
            }
        }

        // PUT api/company/owner
        [HttpPut("owner")]
        public async Task<IActionResult> UpdateOwner([FromBody] UpdateCompanyRequest req)
        {
            try
            {
                await _db.QueryAsync<dynamic>("proj.sp_UpdateOwnerCompany", new
                {
                    CompanyName = req.CompanyName?.Trim(),
                    DisplayName = string.IsNullOrWhiteSpace(req.DisplayName) ? null : req.DisplayName.Trim(),
                    CompanyCode = req.CompanyCode?.Trim(),
                    TRN         = req.TRN?.Trim(),
                    Phone       = req.Phone?.Trim(),
                    Fax         = req.Fax?.Trim(),
                    Email       = req.Email?.Trim(),
                    Website     = req.Website?.Trim(),
                    PrintNote   = req.PrintNote?.Trim(),
                });
                return Ok(new { message = "Company details updated." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "CompanyController", "UpdateOwner");
                return StatusCode(500, new { message = "Failed to update company details." });
            }
        }

        // ── Address CRUD ──────────────────────────────────────────
        [HttpPost("address")]
        public async Task<IActionResult> SaveAddress([FromBody] SaveAddressRequest req)
        {
            try
            {
                var owner = await _db.QueryFirstOrDefaultAsync<OwnerCompany>("proj.sp_GetOwnerCompany");
                if (owner == null) return NotFound(new { message = "Owner company not found." });

                var p = new
                {
                    AddressId    = (req.AddressId == 0 ? null : req.AddressId),
                    CompanyId    = owner.CompanyId,
                    AddressLine1 = req.AddressLine1?.Trim(),
                    AddressLine2 = req.AddressLine2?.Trim(),
                    City         = req.City?.Trim(),
                    State        = req.State?.Trim(),
                    Country      = req.Country?.Trim(),
                    IsPrimary    = req.IsPrimary,
                    SortOrder    = req.SortOrder,
                    CreatedBy    = req.CreatedBy,
                };
                var id = await _db.ExecuteScalarAsync("proj.sp_SetCompanyAddress", p);
                return Ok(new { addressId = int.Parse(id), message = "Address saved." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "CompanyController", "SaveAddress");
                return StatusCode(500, new { message = "Failed to save address." });
            }
        }

        [HttpDelete("address/{id:int}")]
        public async Task<IActionResult> DeleteAddress(int id)
        {
            try
            {
                await _db.ExecuteScalarAsync("proj.sp_DeleteCompanyAddress", new { AddressId = id });
                return Ok(new { message = "Address deleted." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "CompanyController", "DeleteAddress");
                return StatusCode(500, new { message = "Failed to delete address." });
            }
        }

        // ── Bank CRUD ──────────────────────────────────────────────
        [HttpPost("bank")]
        public async Task<IActionResult> SaveBank([FromBody] SaveBankRequest req)
        {
            try
            {
                var owner = await _db.QueryFirstOrDefaultAsync<OwnerCompany>("proj.sp_GetOwnerCompany");
                if (owner == null) return NotFound(new { message = "Owner company not found." });

                if (string.IsNullOrWhiteSpace(req.BankName))
                    return BadRequest(new { message = "Bank Name is required." });

                var p = new
                {
                    BankId        = (req.BankId == 0 ? null : req.BankId),
                    CompanyId     = owner.CompanyId,
                    BankName      = req.BankName.Trim(),
                    Beneficiary   = req.Beneficiary?.Trim(),
                    AccountNo     = req.AccountNo?.Trim(),
                    IBAN          = req.IBAN?.Trim(),
                    Swift         = req.Swift?.Trim(),
                    Currency      = req.Currency?.Trim(),
                    BranchAddress = req.BranchAddress?.Trim(),
                    IsPrimary     = req.IsPrimary,
                    SortOrder     = req.SortOrder,
                    CreatedBy     = req.CreatedBy,
                };
                var id = await _db.ExecuteScalarAsync("proj.sp_SetCompanyBank", p);
                return Ok(new { bankId = int.Parse(id), message = "Bank account saved." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "CompanyController", "SaveBank");
                return StatusCode(500, new { message = "Failed to save bank account." });
            }
        }

        [HttpDelete("bank/{id:int}")]
        public async Task<IActionResult> DeleteBank(int id)
        {
            try
            {
                await _db.ExecuteScalarAsync("proj.sp_DeleteCompanyBank", new { BankId = id });
                return Ok(new { message = "Bank account deleted." });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "CompanyController", "DeleteBank");
                return StatusCode(500, new { message = "Failed to delete bank account." });
            }
        }

        // POST api/company/upload-logo
        [HttpPost("upload-logo")]
        [Consumes("multipart/form-data")]
        public async Task<IActionResult> UploadLogo(IFormFile file)
        {
            try
            {
                if (file == null || file.Length == 0)
                    return BadRequest(new { message = "No file provided." });

                var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
                if (!new[] { ".png", ".jpg", ".jpeg", ".svg", ".webp" }.Contains(ext))
                    return BadRequest(new { message = "Only PNG, JPG, SVG or WEBP files are allowed." });

                // Save to wwwroot/uploads/
                var uploadsDir = Path.Combine(_env.ContentRootPath, "wwwroot", "uploads");
                Directory.CreateDirectory(uploadsDir);

                var fileName = $"company-logo{ext}";
                var filePath = Path.Combine(uploadsDir, fileName);

                using (var stream = new FileStream(filePath, FileMode.Create))
                    await file.CopyToAsync(stream);

                // Store path relative to server root — frontend will prefix API host
                var logoPath = $"/uploads/{fileName}";

                await _db.QueryAsync<dynamic>("proj.sp_UpdateCompanyLogo", new { LogoPath = logoPath });

                return Ok(new { logoPath });
            }
            catch (Exception ex)
            {
                await _db.WriteLog(ex, "CompanyController", "UploadLogo");
                return StatusCode(500, new { message = "Failed to upload logo." });
            }
        }
    }
}
