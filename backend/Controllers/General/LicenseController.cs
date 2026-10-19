using ERPWEB.Services;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.General;

// Anonymous on purpose: the login page must be able to show "expired / wrong server",
// and the vendor needs the server ID to issue a bound license. Nothing here is secret.
[ApiController]
[Route("api/[controller]")]
public class LicenseController(LicenseService license) : ControllerBase
{
    [HttpGet("status")]
    public IActionResult Status() => Ok(new
    {
        valid         = license.IsValid,
        message       = license.StatusMessage,
        client        = license.License?.ClientName,
        expiryDate    = license.License?.ExpiryDate,
        daysRemaining = license.DaysRemaining,
        serverId      = license.MachineFingerprint,
        bound         = !string.IsNullOrEmpty(license.License?.Fingerprint)
    });
}
