using ERPWEB.Dbcontext;
using ERPWEB.Services;
using System.Text.Json;

namespace ERPWEB.Middleware;

public class LicenseMiddleware(RequestDelegate next)
{
    // An invalid license blocks every request, so the rejection is logged at most
    // once per interval — enough to see the outage without a row per request.
    private static readonly TimeSpan LogInterval = TimeSpan.FromMinutes(5);
    private long _lastLoggedTicks;

    public async Task InvokeAsync(HttpContext context, LicenseService license, DbCon dbcon)
    {
        var path = context.Request.Path.Value ?? "";

        // Allow Swagger UI and the auth endpoint so clients can still log in and see the error
        if (path.StartsWith("/swagger", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/api/Auth", StringComparison.OrdinalIgnoreCase) ||
            path.StartsWith("/api/License", StringComparison.OrdinalIgnoreCase))
        {
            await next(context);
            return;
        }

        if (!license.IsValid)
        {
            var now  = DateTime.UtcNow.Ticks;
            var last = Interlocked.Read(ref _lastLoggedTicks);
            if (now - last > LogInterval.Ticks &&
                Interlocked.CompareExchange(ref _lastLoggedTicks, now, last) == last)
            {
                await dbcon.WriteRawLog(
                    message: $"Requests blocked — license not valid: {license.StatusMessage}",
                    controller: "LicenseMiddleware",
                    action: "Invoke",
                    requestPath: context.Request.Path,
                    ipAddress: context.Connection.RemoteIpAddress?.ToString(),
                    logLevel: "Warning");
            }

            context.Response.StatusCode = 402;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(
                JsonSerializer.Serialize(new { message = license.StatusMessage }));
            return;
        }

        await next(context);
    }
}
