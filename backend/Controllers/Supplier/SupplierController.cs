using Dapper;
using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Supplier
{
    using Supplier         = ERPWEB.Models.Supplier.Supplier;
    using SupplierAddress  = ERPWEB.Models.Supplier.SupplierAddress;
    using SupplierContact  = ERPWEB.Models.Supplier.SupplierContact;
    using SupplierCategory = ERPWEB.Models.Supplier.SupplierCategory;
    using SupplierBank     = ERPWEB.Models.Supplier.SupplierBank;

    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class SupplierController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public SupplierController(DbCon dbcon) { _dbcon = dbcon; }

        // ── SEARCH ───────────────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> SearchSuppliers(
            [FromQuery] string? searchText     = null,
            [FromQuery] int?    categoryId     = null,
            [FromQuery] string? supplierType   = null,
            [FromQuery] int?    currencyId     = null,
            [FromQuery] int?    paymentTermsId = null,
            [FromQuery] bool?   isActive       = null,
            [FromQuery] int     page           = 1,
            [FromQuery] int     pageSize       = 20,
            [FromQuery] string  sortCol        = "SupplierName",
            [FromQuery] string  sortDir        = "ASC")
        {
            try
            {
                var p = new
                {
                    SearchText         = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    SupplierCategoryId = categoryId,
                    SupplierType       = string.IsNullOrWhiteSpace(supplierType) ? null : supplierType,
                    CurrencyId         = currencyId,
                    PaymentTermsId     = paymentTermsId,
                    IsActive           = isActive,
                    PageNumber         = page < 1 ? 1 : page,
                    PageSize           = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn         = sortCol,
                    SortDirection      = sortDir
                };

                var rows  = await _dbcon.QueryAsync<Supplier>("sp_SearchSuppliers", p);
                var list  = rows?.ToList() ?? new List<Supplier>();
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
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "SearchSuppliers", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching suppliers." });
            }
        }

        // ── GET BY ID ────────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetSupplier(int id)
        {
            try
            {
                var rows   = await _dbcon.QueryAsync<Supplier>("sp_GetSupplier", new { SupplierId = id });
                var record = rows?.FirstOrDefault();
                if (record == null) return NotFound(new { message = "Supplier not found." });
                return Ok(record);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "GetSupplier", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching supplier." });
            }
        }

        // ── GET ALL (dropdown use) ───────────────────────────────────────────
        [HttpGet]
        public async Task<IActionResult> GetAllSuppliers()
        {
            try
            {
                var suppliers = await _dbcon.QueryAsync<Supplier>("sp_GetSupplierList");
                return Ok(suppliers ?? new List<Supplier>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "GetAllSuppliers", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching suppliers." });
            }
        }

        // ── SAVE ─────────────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> SetSupplier([FromBody] Supplier model)
        {
            if (string.IsNullOrEmpty(model.SupplierName))
                return BadRequest(new { message = "Supplier Name is required." });
            try
            {
                var p = new
                {
                    model.SupplierId,
                    model.SupplierCode,
                    model.SupplierName,
                    model.SupplierRef,
                    model.SupplierShortName,
                    model.SupplierType,
                    model.SupplierCategoryId,
                    model.Phone,
                    model.Mobile,
                    model.Email,
                    model.Web,
                    model.CurrencyId,
                    model.CreditLimit,
                    model.CreditDays,
                    model.PaymentTermsId,
                    model.VatNumber,
                    model.TaxNumber,
                    model.AccountManager,
                    model.Remarks,
                    model.IsActive,
                    model.IsApprovedVendor,
                    model.IsOnHold,
                    model.LeadTimeDays,
                    model.PaymentMode,
                    model.TradeLicenseNo,
                    model.TradeLicenseExpiry,
                    model.CountryId,
                    model.Rating,
                    model.CreatedBy,
                    model.ModifiedBy
                };

                string result = await _dbcon.ExecuteScalarAsync("sp_SetSupplier", p);
                if (result == "-1") return BadRequest(new { message = "Supplier Code already exists." });
                return Ok(new { id = result, message = model.SupplierId == 0 ? "Supplier added" : "Supplier updated" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "SetSupplier", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving supplier." });
            }
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteSupplier(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteSupplier", new { SupplierId = id });
                if (result == "NotExists") return NotFound(new { message = "Supplier not found." });
                return Ok(new { id, message = "Supplier deleted successfully" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "DeleteSupplier", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting supplier." });
            }
        }

        // ── ADDRESSES ────────────────────────────────────────────────────────
        [HttpGet("addresses/{supplierId}")]
        public async Task<IActionResult> GetAddresses(int supplierId)
        {
            try
            {
                var list = await _dbcon.QueryAsync<SupplierAddress>("sp_GetSupplierAddressList", new { SupplierId = supplierId });
                return Ok(list ?? new List<SupplierAddress>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "GetAddresses", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching addresses." });
            }
        }

        [HttpPost("address/save")]
        public async Task<IActionResult> SaveAddress([FromBody] SupplierAddress model)
        {
            try
            {
                var p = new
                {
                    model.SupplierAddressId,
                    model.SupplierId,
                    model.AddressType,
                    model.AddressLine1,
                    model.AddressLine2,
                    model.City,
                    model.State,
                    model.CountryId,
                    model.PostalCode,
                    model.POBox,
                    model.IsDefault,
                    model.CreatedBy,
                    model.ModifiedBy,
                    model.IsActive
                };
                var result = await _dbcon.ExecuteScalarAsync("sp_SetSupplierAddress", p);
                return Ok(new { id = result, message = "Address saved successfully" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "SaveAddress", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving address." });
            }
        }

        [HttpDelete("address/{id}")]
        public async Task<IActionResult> DeleteAddress(int id)
        {
            try
            {
                var deletedBy = User.Identity?.Name ?? "system";
                await _dbcon.ExecuteScalarAsync("sp_DeleteSupplierAddress", new
                {
                    SupplierAddressId = id,
                    DeletedBy         = deletedBy
                });
                return Ok(new { message = "Address deleted" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "DeleteAddress", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting address." });
            }
        }

        // ── CONTACTS ─────────────────────────────────────────────────────────
        [HttpGet("contacts/{supplierId}")]
        public async Task<IActionResult> GetContacts(int supplierId)
        {
            try
            {
                var list = await _dbcon.QueryAsync<SupplierContact>("sp_GetSupplierContactList", new { SupplierId = supplierId });
                return Ok(list ?? new List<SupplierContact>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "GetContacts", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching contacts." });
            }
        }

        [HttpPost("contacts/save")]
        public async Task<IActionResult> SaveContact([FromBody] SupplierContact model)
        {
            if (string.IsNullOrEmpty(model.ContactName))
                return BadRequest(new { message = "Contact Name is required." });
            try
            {
                var p = new
                {
                    model.SupplierContactId,
                    model.SupplierId,
                    model.ContactTitle,
                    model.ContactName,
                    model.Designation,
                    model.Phone,
                    model.Mobile,
                    model.Email,
                    model.IsPrimary,
                    model.CreatedBy,
                    model.ModifiedBy,
                    model.IsActive
                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetSupplierContact", p);
                return Ok(new { id = result, message = "Contact saved successfully" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "SaveContact", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving contact." });
            }
        }

        [HttpDelete("contacts/{id}")]
        public async Task<IActionResult> DeleteContact(int id)
        {
            try
            {
                var deletedBy = User.Identity?.Name ?? "system";
                await _dbcon.ExecuteScalarAsync("sp_DeleteSupplierContact", new
                {
                    SupplierContactId = id,
                    DeletedBy         = deletedBy
                });
                return Ok(new { message = "Contact deleted" });
            }
            catch (Microsoft.Data.SqlClient.SqlException sqlEx)
            {
                return BadRequest(new { message = sqlEx.Message });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "DeleteContact", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting contact." });
            }
        }

        // ── CATEGORIES ───────────────────────────────────────────────────────
        [HttpGet("categories")]
        public async Task<IActionResult> GetCategories()
        {
            try
            {
                var list = await _dbcon.QueryAsync<SupplierCategory>("sp_GetSupplierCategoryList");
                return Ok(list ?? new List<SupplierCategory>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "GetCategories", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching supplier categories." });
            }
        }

        // ── BANK ACCOUNTS ────────────────────────────────────────────────────
        [HttpGet("banks/{supplierId:int}")]
        public async Task<IActionResult> GetBanks(int supplierId)
        {
            try
            {
                var list = await _dbcon.QueryAsync<SupplierBank>("sp_GetSupplierBankList", new { SupplierId = supplierId });
                return Ok(list ?? new List<SupplierBank>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "GetBanks", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching bank accounts." });
            }
        }

        [HttpPost("banks/save")]
        public async Task<IActionResult> SaveBank([FromBody] SupplierBank model)
        {
            if (string.IsNullOrWhiteSpace(model.BankName))
                return BadRequest(new { message = "Bank Name is required." });
            if (string.IsNullOrWhiteSpace(model.AccountNumber))
                return BadRequest(new { message = "Account Number is required." });
            try
            {
                var p = new
                {
                    model.SupplierBankId,
                    model.SupplierId,
                    model.BankName,
                    model.AccountName,
                    model.AccountNumber,
                    model.IBAN,
                    model.SwiftCode,
                    model.BranchName,
                    model.CurrencyId,
                    model.IsDefault,
                    model.IsActive,
                    model.CreatedBy,
                    model.ModifiedBy
                };
                string result = await _dbcon.ExecuteScalarAsync("sp_SetSupplierBank", p);
                return Ok(new { id = result, message = "Bank account saved." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "SaveBank", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving bank account." });
            }
        }

        [HttpDelete("banks/{id:int}")]
        public async Task<IActionResult> DeleteBank(int id)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_SetSupplierBank", new
                {
                    SupplierBankId = id,
                    SupplierId     = 0,
                    BankName       = "deleted",
                    AccountName    = (string?)null,
                    AccountNumber  = "0",
                    IBAN           = (string?)null,
                    SwiftCode      = (string?)null,
                    BranchName     = (string?)null,
                    CurrencyId     = (int?)null,
                    IsDefault      = false,
                    IsActive       = false,
                    CreatedBy      = "system",
                    ModifiedBy     = "system"
                });
                return Ok(new { message = "Bank account deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Supplier", action: "DeleteBank", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting bank account." });
            }
        }
    }
}
