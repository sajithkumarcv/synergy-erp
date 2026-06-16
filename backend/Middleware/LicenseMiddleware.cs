using ERPWEB.Services;
using System.Text.Json;

namespace ERPWEB.Middleware;

public class LicenseMiddleware(RequestDelegate next)
{
    public async Task InvokeAsync(HttpContext context, LicenseService license)
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
            context.Response.StatusCode = 402;
            context.Response.ContentType = "application/json";
            await context.Response.WriteAsync(
                JsonSerializer.Serialize(new { message = license.StatusMessage }));
            return;
        }

        await next(context);
    }
}
