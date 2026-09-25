using System.Net;
using System.Text.Json;

namespace ERPWEB.Middleware;

/// <summary>
/// Maintenance mode. While "Maintenance:Enabled" is true in appsettings.json every API request is answered
/// with HTTP 503 (+ Retry-After, X-Maintenance: 1 and a JSON body with the message) instead of running.
/// The web app recognises that response and shows its "Under maintenance" page.
///
///   "Maintenance": {
///     "Enabled": true,
///     "Message": "We are upgrading the system. Please try again shortly.",
///     "Until": "2026-09-25T18:00:00",        // optional, shown to users
///     "AllowedIps": [ "192.168.50.10" ]      // optional, these clients keep working (e.g. the admin doing the upgrade)
///   }
///
/// appsettings.json is reloaded when it changes, so the switch needs no rebuild; the pipeline reads it per request.
/// GET /api/maintenance/status is always answered (never 503) so the web app can poll for "is it back yet?".
/// </summary>
public class MaintenanceMiddleware(RequestDelegate next, IConfiguration config)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var path    = context.Request.Path.Value ?? "";
        var enabled = config.GetValue<bool>("Maintenance:Enabled");
        var message = config["Maintenance:Message"];
        if (string.IsNullOrWhiteSpace(message))
            message = "The system is under maintenance. Please try again shortly.";
        var until = config["Maintenance:Until"];

        // Status probe: always available, never blocked.
        if (path.Equals("/api/maintenance/status", StringComparison.OrdinalIgnoreCase))
        {
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(JsonSerializer.Serialize(new
            {
                enabled,
                message = enabled ? message : null,
                until   = enabled ? until   : null,
            }));
            return;
        }

        if (!enabled) { await next(context); return; }

        // Let swagger, CORS pre-flights and allow-listed client IPs through.
        var ip = context.Connection.RemoteIpAddress;
        var allowed = config.GetSection("Maintenance:AllowedIps").Get<string[]>() ?? Array.Empty<string>();
        bool isAllowedIp = ip != null && allowed.Any(a => IPAddress.TryParse(a, out var x) && x.Equals(ip.IsIPv4MappedToIPv6 ? ip.MapToIPv4() : ip));
        if (context.Request.Method == HttpMethods.Options ||
            path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase) ||
            isAllowedIp)
        {
            await next(context);
            return;
        }

        context.Response.StatusCode  = (int)HttpStatusCode.ServiceUnavailable;
        context.Response.ContentType = "application/json";
        context.Response.Headers["Retry-After"]   = "300";
        context.Response.Headers["X-Maintenance"] = "1";
        context.Response.Headers["Access-Control-Expose-Headers"] = "X-Maintenance, Retry-After";
        await context.Response.WriteAsync(JsonSerializer.Serialize(new
        {
            maintenance = true,
            message,
            until,
        }));
    }
}
