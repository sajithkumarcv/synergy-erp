using ERPWEB.Dbcontext;
using System.IdentityModel.Tokens.Jwt;

namespace ERPWEB.Middleware
{
    /// <summary>
    /// Enforces the single-PC login session on every authenticated request.
    /// Registered between UseAuthentication and UseAuthorization.
    ///
    /// The JWT jti claim carries the server-side session id
    /// (TBL_LOGIN_HISTORY.SessionId). Each request calls sp_ValidateLoginSession,
    /// which expires / idle-closes the session if due and otherwise refreshes
    /// LastActivity. Heartbeat pings (GET Auth/session-check without ?active=1)
    /// do NOT refresh LastActivity, so an idle tab can't keep itself alive.
    ///
    /// If the session is no longer valid the request is rejected with 401 and a
    /// JSON body { code, message } the frontend maps to a friendly logout reason.
    /// If the validation itself fails (DB down etc.) the request is let through
    /// (fail open) — session enforcement must never take the whole API down.
    /// </summary>
    public class SessionValidationMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly IConfiguration _config;

        public SessionValidationMiddleware(RequestDelegate next, IConfiguration config)
        {
            _next = next;
            _config = config;
        }

        private record SessionCheck(bool IsValid, string Reason);

        public async Task InvokeAsync(HttpContext context, DbCon dbcon)
        {
            if (context.User?.Identity?.IsAuthenticated == true)
            {
                var jti = context.User.FindFirst(JwtRegisteredClaimNames.Jti)?.Value;

                // Tokens issued before session enforcement carry a random jti with
                // no session row — sp_ValidateLoginSession returns NotFound and the
                // user simply re-logs-in once.
                if (Guid.TryParse(jti, out var sessionId))
                {
                    // Heartbeat pings carry no real user activity unless ?active=1.
                    bool touch = true;
                    if (HttpMethods.IsGet(context.Request.Method)
                        && context.Request.Path.Value?.EndsWith("/Auth/session-check", StringComparison.OrdinalIgnoreCase) == true
                        && context.Request.Query["active"] != "1")
                    {
                        touch = false;
                    }

                    SessionCheck? check = null;
                    try
                    {
                        check = await dbcon.QueryFirstOrDefaultAsync<SessionCheck>("sp_ValidateLoginSession", new
                        {
                            SessionId = sessionId,
                            Touch = touch,
                            IdleTimeoutMinutes = _config.GetValue<int>("Session:IdleTimeoutMinutes", 60)
                        });
                    }
                    catch (Exception ex)
                    {
                        // Fail open: log and let the request through.
                        await dbcon.WriteLog(ex,
                            controller: "SessionValidationMiddleware",
                            action: "Invoke",
                            requestPath: context.Request.Path);
                    }

                    if (check != null && !check.IsValid)
                    {
                        var (code, message) = check.Reason == "IdleTimeout"
                            ? ("SESSION_IDLE", "You were signed out due to inactivity.")
                            : ("SESSION_ENDED", "Your session is no longer active. This account may have signed in on another PC.");

                        context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                        context.Response.ContentType = "application/json";
                        await context.Response.WriteAsJsonAsync(new { code, message });
                        return;
                    }
                }
            }

            await _next(context);
        }
    }
}
