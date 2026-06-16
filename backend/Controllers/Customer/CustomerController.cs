using Dapper;
using ERPWEB.Dbcontext;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.Customer
{
    using Customer          = ERPWEB.Models.Customer.Customer;
    using CustomerAddress   = ERPWEB.Models.Customer.CustomerAddress;
    using CustomerContact   = ERPWEB.Models.Customer.CustomerContact;
    using CustomerCategory  = ERPWEB.Models.Customer.CustomerCategory;
    using CreditHoldRequest = ERPWEB.Models.Customer.CreditHoldRequest;

    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class CustomerController : ControllerBase
    {
        private readonly DbCon _dbcon;
        public CustomerController(DbCon dbcon) { _dbcon = dbcon; }

        // ── SEARCH ───────────────────────────────────────────────────────────
        [HttpGet("search")]
        public async Task<IActionResult> SearchCustomers(
            [FromQuery] string? searchText     = null,
            [FromQuery] int?    categoryId     = null,
            [FromQuery] string? customerType   = null,
            [FromQuery] int?    currencyId     = null,
            [FromQuery] int?    paymentTermsId = null,
            [FromQuery] bool?   creditHold     = null,
            [FromQuery] bool?   isActive       = null,
            [FromQuery] string? creditFlag     = null,
            [FromQuery] int     page           = 1,
            [FromQuery] int     pageSize       = 20,
            [FromQuery] string  sortCol        = "CustomerName",
            [FromQuery] string  sortDir        = "ASC")
        {
            try
            {
                var p = new
                {
                    SearchText         = string.IsNullOrWhiteSpace(searchText) ? null : searchText.Trim(),
                    CustomerCategoryId = categoryId,
                    CustomerType       = string.IsNullOrWhiteSpace(customerType) ? null : customerType,
                    CurrencyId         = currencyId,
                    PaymentTermsId     = paymentTermsId,
                    CreditHold         = creditHold,
                    IsActive           = isActive,
                    CreditFlag         = string.IsNullOrWhiteSpace(creditFlag) ? null : creditFlag,
                    PageNumber         = page < 1 ? 1 : page,
                    PageSize           = pageSize is < 1 or > 200 ? 20 : pageSize,
                    SortColumn         = sortCol,
                    SortDirection      = sortDir
                };

                var rows  = await _dbcon.QueryAsync<Customer>("sp_SearchCustomers", p);
                var list  = rows?.ToList() ?? new List<Customer>();
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
                await _dbcon.WriteLog(ex, controller: "Customer", action: "SearchCustomers", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error searching customers." });
            }
        }

        // ── GET BY ID ────────────────────────────────────────────────────────
        [HttpGet("{id:int}")]
        public async Task<IActionResult> GetCustomer(int id)
        {
            try
            {
                var rows   = await _dbcon.QueryAsync<Customer>("sp_GetCustomer", new { CustomerId = id });
                var record = rows?.FirstOrDefault();
                if (record == null) return NotFound(new { message = "Customer not found." });
                return Ok(record);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "GetCustomer", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching customer." });
            }
        }

        // ── GET ALL (dropdown use) ───────────────────────────────────────────
        [HttpGet]
        public async Task<IActionResult> GetAllCustomers()
        {
            try
            {
                var customers = await _dbcon.QueryAsync<Customer>("sp_GetCustomerList");
                return Ok(customers ?? new List<Customer>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "GetAllCustomers", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching customers." });
            }
        }

        // ── SAVE ─────────────────────────────────────────────────────────────
        [HttpPost("save")]
        public async Task<IActionResult> SetCustomer([FromBody] Customer model)
        {
            if (string.IsNullOrEmpty(model.CustomerName))
                return BadRequest(new { message = "Customer Name is required." });
            try
            {
                var p = new
                {
                    model.CustomerId,
                    model.CustomerCode,
                    model.CustomerName,
                    model.CustomerRef,
                    model.CustomerShortName,
                    model.CustomerType,
                    model.CustomerCategoryId,
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
                    model.SalesPerson,
                    model.Remarks,
                    model.IsActive,
                    model.CreatedBy,
                    model.ModifiedBy
                };

                string result = await _dbcon.ExecuteScalarAsync("sp_SetCustomer", p);
                if (result == "-1") return BadRequest(new { message = "Customer Code already exists." });
                return Ok(new { id = result, message = model.CustomerId == 0 ? "Customer added" : "Customer updated" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "SetCustomer", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving customer." });
            }
        }

        // ── DELETE ───────────────────────────────────────────────────────────
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteCustomer(int id)
        {
            try
            {
                string result = await _dbcon.ExecuteScalarAsync("sp_DeleteCustomer", new { CustomerId = id });
                if (result == "NotExists") return NotFound(new { message = "Customer not found." });
                return Ok(new { id, message = "Customer deleted successfully" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "DeleteCustomer", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting customer." });
            }
        }

        // ── CREDIT HOLD ──────────────────────────────────────────────────────
        [HttpPost("credithold")]
        public async Task<IActionResult> SetCreditHold([FromBody] CreditHoldRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_SetCustomerCreditHold", new
                {
                    model.CustomerId,
                    model.CreditHold,
                    model.CreditHoldBy,
                    model.CreditHoldNote
                });
                return Ok(new { message = model.CreditHold ? "Customer placed on credit hold." : "Credit hold released." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "SetCreditHold", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error updating credit hold." });
            }
        }

        // ── AUTO CREDIT HOLD CHECK (nightly + manual trigger) ────────────────
        [HttpPost("auto-hold-check")]
        public async Task<IActionResult> AutoHoldCheck()
        {
            try
            {
                var rows = await _dbcon.QueryAsync<dynamic>("proj.sp_AutoCreditHoldCheck", null);
                var result = rows?.FirstOrDefault();
                return Ok(new
                {
                    newHolds = result != null ? (int)(result.NewHolds ?? 0) : 0,
                    released = result != null ? (int)(result.Released ?? 0) : 0,
                    message  = "Auto credit hold check completed."
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "AutoHoldCheck", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error running auto hold check." });
            }
        }

        // ── CREDIT FLAG (manual rating: GREEN / YELLOW / RED) ────────────────
        public class CreditFlagRequest
        {
            public int     CustomerId     { get; set; }
            public string  CreditFlag     { get; set; } = "GREEN";
            public string? CreditFlagNote { get; set; }
            public string? CreditFlagBy   { get; set; }
        }

        [HttpPost("creditflag")]
        public async Task<IActionResult> SetCreditFlag([FromBody] CreditFlagRequest model)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_SetCustomerCreditFlag", new
                {
                    model.CustomerId,
                    model.CreditFlag,
                    model.CreditFlagNote,
                    model.CreditFlagBy
                });
                return Ok(new { message = "Credit flag updated." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "SetCreditFlag", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error updating credit flag." });
            }
        }

        [HttpGet("creditstatus/{customerId}")]
        public async Task<IActionResult> GetCreditStatus(int customerId)
        {
            try
            {
                var result = await _dbcon.QueryAsync<dynamic>("sp_CheckCustomerCreditStatus", new { CustomerId = customerId });
                return Ok(result?.FirstOrDefault());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "GetCreditStatus", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error checking credit status." });
            }
        }

        // ── ADDRESSES ────────────────────────────────────────────────────────
        [HttpGet("addresses/{customerId}")]
        public async Task<IActionResult> GetAddresses(int customerId)
        {
            try
            {
                var list = await _dbcon.QueryAsync<CustomerAddress>("sp_GetCustomerAddressList", new { CustomerId = customerId });
                return Ok(list ?? new List<CustomerAddress>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "GetAddresses", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching addresses." });
            }
        }

        [HttpPost("address/save")]
        public async Task<IActionResult> SaveAddress([FromBody] CustomerAddress model)
        {
            try
            {
                var p = new
                {
                    model.CustomerAddressId,
                    model.CustomerId,
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
                var result = await _dbcon.ExecuteScalarAsync("sp_SetCustomerAddress", p);
                return Ok(new { id = result, message = "Address saved successfully" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "SaveAddress", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving address." });
            }
        }

        [HttpDelete("address/{id}")]
        public async Task<IActionResult> DeleteAddress(int id)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_SetCustomerAddress", new
                {
                    CustomerAddressId = id,
                    CustomerId        = 0,
                    AddressType       = (string?)null,
                    AddressLine1      = "",
                    AddressLine2      = (string?)null,
                    City              = (string?)null,
                    State             = (string?)null,
                    CountryId         = 0,
                    PostalCode        = (string?)null,
                    POBox             = (string?)null,
                    IsDefault         = false,
                    CreatedBy         = "system",
                    ModifiedBy        = "system",
                    IsActive          = false
                });
                return Ok(new { message = "Address deleted" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "DeleteAddress", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting address." });
            }
        }

        // ── CONTACTS ─────────────────────────────────────────────────────────
        [HttpGet("contacts/{customerId}")]
        public async Task<IActionResult> GetContacts(int customerId)
        {
            try
            {
                var list = await _dbcon.QueryAsync<CustomerContact>("sp_GetCustomerContactList", new { CustomerId = customerId });
                return Ok(list ?? new List<CustomerContact>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "GetContacts", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching contacts." });
            }
        }

        [HttpPost("contacts/save")]
        public async Task<IActionResult> SaveContact([FromBody] CustomerContact model)
        {
            if (string.IsNullOrEmpty(model.ContactName))
                return BadRequest(new { message = "Contact Name is required." });
            try
            {
                var p = new
                {
                    model.CustomerContactId,
                    model.CustomerId,
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
                string result = await _dbcon.ExecuteScalarAsync("sp_SetCustomerContact", p);
                return Ok(new { id = result, message = "Contact saved successfully" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "SaveContact", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error saving contact." });
            }
        }

        [HttpDelete("contacts/{id}")]
        public async Task<IActionResult> DeleteContact(int id)
        {
            try
            {
                await _dbcon.ExecuteScalarAsync("sp_SetCustomerContact", new
                {
                    CustomerContactId = id,
                    CustomerId        = 0,
                    ContactTitle      = (string?)null,
                    ContactName       = "deleted",
                    Designation       = (string?)null,
                    Phone             = (string?)null,
                    Mobile            = (string?)null,
                    Email             = (string?)null,
                    IsPrimary         = false,
                    CreatedBy         = "system",
                    ModifiedBy        = "system",
                    IsActive          = false
                });
                return Ok(new { message = "Contact deleted" });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Customer", action: "DeleteContact", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting contact." });
            }
        }
    }
}
