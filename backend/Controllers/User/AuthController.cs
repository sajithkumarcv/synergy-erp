using ERPWEB.Dbcontext;
using ERPWEB.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Data;
using System.Security.Claims;
using System.Security.Cryptography;

namespace ERPWEB.Controllers.User
{
    public record LoginRequest(string Username, string Password, bool Force = false);
    public record ForgotPasswordRequest(string Email, string Username);
    public record ResetPasswordWithTokenRequest(string Token, string NewPassword);
    public record ChangePasswordRequest(string Username, string OldPassword, string NewPassword);

    // Typed projection of sp_GetLoginHistory so JSON is camelCased for the UI.
    public class LoginHistoryRow
    {
        public int       Id           { get; set; }
        public int?      UserId       { get; set; }
        public string?   UserName     { get; set; }
        public string?   FullName     { get; set; }
        public DateTime  LoginTime    { get; set; }
        public DateTime? LogoutTime   { get; set; }
        public DateTime? ExpiresAt    { get; set; }
        public string?   IpAddress    { get; set; }
        public string?   UserAgent    { get; set; }
        public string?   Status       { get; set; }
        public DateTime? LastActivity { get; set; }
        public string?   Browser      { get; set; }
        public string?   OS           { get; set; }
        public string?   Region       { get; set; }
    }

    [Route("api/[Controller]")]
    [ApiController]
    public class AuthController : ControllerBase
    {
        private readonly DbCon _dbcon;
        private readonly JwtService _jwtService;
        private readonly EmailService _email;
        private readonly IConfiguration _config;

        public AuthController(DbCon dbcon, JwtService jwtService, EmailService email, IConfiguration config)
        {
            _dbcon = dbcon;
            _jwtService = jwtService;
            _email = email;
            _config = config;
        }

        // Real client IP — prefers X-Forwarded-For (set by IIS/nginx/load balancers)
        // over the direct connection IP, so the actual client is recorded behind a proxy.
        private string? ClientIp()
        {
            var xff = Request.Headers["X-Forwarded-For"].ToString();
            if (!string.IsNullOrWhiteSpace(xff))
            {
                var first = xff.Split(',')[0].Trim();       // left-most = original client
                if (!string.IsNullOrWhiteSpace(first)) return first;
            }
            return HttpContext.Connection.RemoteIpAddress?.ToString();
        }

        // Lightweight User-Agent parsing — enough for an audit log without a NuGet dependency.
        private static (string? Browser, string? Os) ParseUserAgent(string? ua)
        {
            if (string.IsNullOrWhiteSpace(ua)) return (null, null);

            string? browser =
                ua.Contains("Edg/")            ? "Microsoft Edge" :
                ua.Contains("OPR/") || ua.Contains("Opera") ? "Opera" :
                ua.Contains("Chrome/")         ? "Chrome" :
                ua.Contains("Firefox/")        ? "Firefox" :
                (ua.Contains("Safari/") && ua.Contains("Version/")) ? "Safari" :
                ua.Contains("MSIE") || ua.Contains("Trident/") ? "Internet Explorer" :
                null;

            string? os =
                ua.Contains("Windows NT 10.0") ? "Windows 10/11" :
                ua.Contains("Windows NT 6.3")  ? "Windows 8.1" :
                ua.Contains("Windows NT 6.1")  ? "Windows 7" :
                ua.Contains("Windows")         ? "Windows" :
                ua.Contains("Android")         ? "Android" :
                (ua.Contains("iPhone") || ua.Contains("iPad")) ? "iOS" :
                ua.Contains("Mac OS X")        ? "macOS" :
                ua.Contains("Linux")           ? "Linux" :
                null;

            return (browser, os);
        }

        // ── Helpers ──────────────────────────────────────────────────────────
        private static string Sha256Hex(string input) =>
            Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(input))).ToLower();

        /// <summary>Cryptographically-random, URL-safe token.</summary>
        private static string GenerateToken()
        {
            var bytes = RandomNumberGenerator.GetBytes(32);
            return Convert.ToBase64String(bytes)
                .Replace("+", "-").Replace("/", "_").Replace("=", "");
        }

        [HttpPost("login")]
        [Microsoft.AspNetCore.RateLimiting.EnableRateLimiting(ERPWEB.Security.RateLimitPolicies.Login)]
        public async Task<IActionResult> Login([FromBody] LoginRequest model)
        {
            try
            {
                string hashedPassword = Convert.ToHexString(
                    SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(model.Password))
                ).ToLower();

                // Client context captured up-front so it's available for both the
                // success and the failed-login audit paths.
                var rawUa         = Request.Headers.UserAgent.ToString();
                var (browser, os) = ParseUserAgent(rawUa);
                var clientIp      = ClientIp();
                var uaTrimmed     = rawUa is { Length: > 0 } ua0 ? ua0[..Math.Min(ua0.Length, 512)] : null;

                var parameters = new Dictionary<string, object>
                {
                    { "@Username", model.Username },
                    { "@Password", hashedPassword }
                };

                DataSet ds = _dbcon.ExecuteProcedure(parameters, "sp_ValidateUser");

                // sp_ValidateUser counts the failure and decides the lockout; it always
                // returns a Status. No rows at all means the proc pre-dates login_lockout.sql.
                if (ds == null || ds.Tables.Count == 0 || ds.Tables[0].Rows.Count == 0)
                {
                    await _dbcon.WriteRawLog(
                        message: $"Failed login attempt for username '{model.Username}' ({browser} on {os}).",
                        controller: "Auth",
                        action: "Login",
                        requestPath: HttpContext.Request.Path,
                        ipAddress: clientIp,
                        logLevel: "Warning");
                    return Unauthorized(new { message = "Invalid username or password." });
                }

                var row = ds.Tables[0].Rows[0];
                string loginStatus = row.Table.Columns.Contains("Status")
                                     ? row["Status"]?.ToString() ?? "INVALID"
                                     : "OK";   // pre-lockout proc: a returned row meant success

                if (loginStatus != "OK")
                {
                    DateTime? lockedUntil = row.Table.Columns.Contains("LockedUntil")
                                            && row["LockedUntil"] != DBNull.Value
                                            ? Convert.ToDateTime(row["LockedUntil"])
                                            : null;

                    await _dbcon.WriteRawLog(
                        message: $"Failed login attempt for username '{model.Username}' ({browser} on {os}) — {loginStatus}"
                               + (lockedUntil.HasValue ? $", locked until {lockedUntil:u}." : "."),
                        controller: "Auth",
                        action: "Login",
                        requestPath: HttpContext.Request.Path,
                        ipAddress: clientIp,
                        logLevel: "Warning");

                    return loginStatus switch
                    {
                        // 423 rather than 401: the frontend hard-codes the 401 copy,
                        // and a locked-out user needs to be told why.
                        "LOCKED_TEMP" => StatusCode(StatusCodes.Status423Locked, new
                        {
                            code    = "ACCOUNT_LOCKED_TEMP",
                            message = lockedUntil.HasValue
                                      ? $"Too many failed attempts. Try again in "
                                        + $"{Math.Max(1, (int)Math.Ceiling((lockedUntil.Value - DateTime.Now).TotalMinutes))} minute(s)."
                                      : "Too many failed attempts. Please try again later.",
                            lockedUntil
                        }),
                        "LOCKED" => StatusCode(StatusCodes.Status423Locked, new
                        {
                            code    = "ACCOUNT_LOCKED",
                            message = "Your account is locked. Please contact your administrator."
                        }),
                        _ => Unauthorized(new { message = "Invalid username or password." })
                    };
                }

                string userId   = row["UserId"].ToString()!;
                string username = row["Username"].ToString()!;
                string fullName = row["FullName"].ToString()!;
                string email    = row["Email"].ToString()!;
                string role     = row["RoleName"].ToString()!;
                string theme    = row.Table.Columns.Contains("Theme")
                                  ? row["Theme"]?.ToString() ?? "ocean-blue"
                                  : "ocean-blue";

                // ── Single-PC session enforcement ────────────────────────────
                int expiryMinutes = _config.GetValue<int>("Jwt:ExpiryMinutes", 480);
                var sessionId = Guid.NewGuid();

                var session = await _dbcon.QueryFirstOrDefaultAsync<dynamic>("sp_CreateLoginSession", new
                {
                    UserId             = int.Parse(userId),
                    SessionId          = sessionId,
                    IpAddress          = clientIp,
                    UserAgent          = uaTrimmed,
                    ExpiryMinutes      = expiryMinutes,
                    Force              = model.Force,
                    IdleTimeoutMinutes = _config.GetValue<int>("Session:IdleTimeoutMinutes", 60),
                    Browser            = browser,
                    OS                 = os,
                    Region             = (string?)null    // geolocation: pending deployment decision
                });

                if (session != null && (bool)session.Blocked)
                {
                    await _dbcon.WriteRawLog(
                        message: $"Login blocked for '{username}' — already signed in on another PC "
                               + $"(active since {(DateTime?)session.ActiveSince:u} from {(string?)session.ActiveIp}).",
                        controller: "Auth",
                        action: "Login",
                        requestPath: HttpContext.Request.Path,
                        userId: userId,
                        ipAddress: clientIp,
                        logLevel: "Warning");
                    return Conflict(new
                    {
                        code        = "ACTIVE_SESSION",
                        message     = "This account is already signed in on another PC.",
                        activeSince = (DateTime?)session.ActiveSince,
                        ipAddress   = (string?)session.ActiveIp
                    });
                }

                string token = _jwtService.GenerateToken(userId, username, role, sessionId.ToString());

                return Ok(new
                {
                    token,
                    userId,
                    username,
                    fullName,
                    email,
                    role,
                    theme,
                    expiresIn = expiryMinutes
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Auth", action: "Login", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        // ── LOGOUT ────────────────────────────────────────────────────────────
        // Ends the server-side login session (jti = TBL_LOGIN_HISTORY.SessionId)
        // so the account frees up for the next PC immediately.
        [Authorize]
        [HttpPost("logout")]
        public async Task<IActionResult> Logout()
        {
            try
            {
                var jti = User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Jti)?.Value;
                if (Guid.TryParse(jti, out var sessionId))
                    await _dbcon.QueryAsync<dynamic>("sp_EndLoginSession", new { SessionId = sessionId, Status = "LoggedOut" });

                return Ok(new { message = "Signed out." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Auth", action: "Logout", requestPath: HttpContext.Request.Path);
                return Ok(new { message = "Signed out." }); // logout must never fail visibly
            }
        }

        // ── SESSION CHECK (heartbeat) ─────────────────────────────────────────
        // SessionValidationMiddleware does the real work: it validates the jti
        // session and returns 401 { code, message } if it's gone. Reaching this
        // action means the session is still valid. ?active=1 marks real user
        // activity (refreshes LastActivity); without it the ping doesn't keep an
        // idle tab alive.
        [Authorize]
        [HttpGet("session-check")]
        public IActionResult SessionCheck() => Ok(new { ok = true });

        // ── LOGIN HISTORY (admin) ─────────────────────────────────────────────
        [Authorize(Roles = "ADMIN")]
        [HttpGet("login-history")]
        public async Task<IActionResult> LoginHistory([FromQuery] int? userId = null, [FromQuery] int top = 200)
        {
            try
            {
                // Typed row (not dynamic) so JSON keys are camelCased consistently
                // for the React table (dynamic serializes PascalCase → blank cells).
                var rows = await _dbcon.QueryAsync<LoginHistoryRow>("sp_GetLoginHistory", new { UserId = userId, Top = top });
                return Ok(rows);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Auth", action: "LoginHistory", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        // ── FORGOT PASSWORD ───────────────────────────────────────────────────
        // Internal ERP: enumeration is accepted, so validation errors are
        // returned as specific messages (username first, then email format,
        // then email/username mismatch — sp_CreatePasswordResetToken enforces
        // the ordering and returns a Status column).
        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest model)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(model?.Email) || string.IsNullOrWhiteSpace(model?.Username))
                    return BadRequest(new { message = "Please enter your username and email address." });

                // Format check happens here but is passed to the proc so the
                // username-exists check still comes first in the message order.
                bool emailFormatValid = System.Text.RegularExpressions.Regex.IsMatch(
                    model.Email.Trim(), @"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$");

                var rawToken  = GenerateToken();
                var tokenHash = Sha256Hex(rawToken);
                var expiresAt = DateTime.Now.AddMinutes(30);
                var ip        = HttpContext.Connection.RemoteIpAddress?.ToString();

                var rows = await _dbcon.QueryAsync<dynamic>("sp_CreatePasswordResetToken", new
                {
                    Email            = model.Email.Trim(),
                    UserName         = model.Username.Trim(),
                    TokenHash        = tokenHash,
                    ExpiresAt        = expiresAt,
                    RequestedIp      = ip,
                    EmailFormatValid = emailFormatValid
                });

                var user = rows?.FirstOrDefault();
                string status = user != null ? (string)user.Status : "USER_NOT_FOUND";

                switch (status)
                {
                    case "USER_NOT_FOUND":
                        return BadRequest(new { message = "The specified username does not exist." });
                    case "EMAIL_INVALID":
                        return BadRequest(new { message = "Please enter a valid email address." });
                    case "EMAIL_MISMATCH":
                        return BadRequest(new { message = "The email address does not match our records." });
                }

                string email    = (string)user!.Email;
                string fullName = (string)user.FullName;
                string baseUrl  = (_config["App:FrontendUrl"] ?? "http://localhost:3000").TrimEnd('/');
                string link     = $"{baseUrl}/?reset-token={rawToken}";

                bool emailSent = await _email.SendAsync(email, "WebERP — Password Reset Request", BuildResetEmail(fullName, link));
                if (!emailSent)
                {
                    await _dbcon.WriteRawLog(
                        message: $"Password reset email failed to send to '{email}' for user '{(string)user.UserName}'.",
                        controller: "Auth",
                        action: "ForgotPassword",
                        requestPath: HttpContext.Request.Path,
                        userId: ((int)user.UserId).ToString(),
                        ipAddress: ip,
                        logLevel: "Warning");
                    return StatusCode(502, new { message = "We could not send the reset email. Please contact support." });
                }

                return Ok(new { message = "A password reset link has been sent to your email address." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Auth", action: "ForgotPassword", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        // ── VALIDATE RESET TOKEN ──────────────────────────────────────────────
        // Lets the frontend check a token before showing the reset form.
        [HttpGet("validate-reset-token")]
        public async Task<IActionResult> ValidateResetToken([FromQuery] string token)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(token))
                    return Ok(new { valid = false });

                var rows = await _dbcon.QueryAsync<dynamic>("sp_ValidatePasswordResetToken",
                    new { TokenHash = Sha256Hex(token) });
                var row = rows?.FirstOrDefault();

                return Ok(new { valid = row != null, username = row != null ? (string)row.UserName : null });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Auth", action: "ValidateResetToken", requestPath: HttpContext.Request.Path);
                return Ok(new { valid = false });
            }
        }

        // ── RESET PASSWORD ────────────────────────────────────────────────────
        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordWithTokenRequest model)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(model?.Token) || string.IsNullOrWhiteSpace(model?.NewPassword))
                    return BadRequest(new { message = "Token and new password are required." });

                if (model.NewPassword.Length < 6)
                    return BadRequest(new { message = "Password must be at least 6 characters long." });

                var rows = await _dbcon.QueryAsync<dynamic>("sp_ResetPasswordWithToken", new
                {
                    TokenHash    = Sha256Hex(model.Token),
                    PasswordHash = Sha256Hex(model.NewPassword)
                });

                var row = rows?.FirstOrDefault();
                bool success = row != null && Convert.ToInt32(row.Success) == 1;

                if (!success)
                    return BadRequest(new { message = row != null ? (string)row.Message : "Password reset failed." });

                return Ok(new { message = "Your password has been reset successfully. You can now sign in." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Auth", action: "ResetPassword", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        // ── CHANGE PASSWORD (logged-in user, self-service) ────────────────────
        [Authorize]
        [HttpPost("change-password")]
        public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest model)
        {
            try
            {
                // Username checks come first (before password validation).
                if (string.IsNullOrWhiteSpace(model?.Username))
                    return BadRequest(new { message = "Username is required." });

                // Never trust the client's username to pick the account — it must
                // match the signed-in user's JWT username claim (case-insensitive).
                var jwtUsername = User.Identity?.Name
                                  ?? User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.UniqueName)?.Value;
                if (string.IsNullOrWhiteSpace(jwtUsername)
                    || !string.Equals(model.Username.Trim(), jwtUsername, StringComparison.OrdinalIgnoreCase))
                    return BadRequest(new { message = "The username does not match your account." });

                if (string.IsNullOrWhiteSpace(model?.OldPassword) || string.IsNullOrWhiteSpace(model?.NewPassword))
                    return BadRequest(new { message = "Current and new passwords are required." });

                if (model.NewPassword.Length < 6)
                    return BadRequest(new { message = "New password must be at least 6 characters long." });

                // Derive the user id from the JWT (never trust a client-supplied id for this).
                var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value
                          ?? User.FindFirst("sub")?.Value;
                if (!int.TryParse(sub, out var userId) || userId <= 0)
                    return Unauthorized(new { message = "Invalid session. Please sign in again." });

                var rows = await _dbcon.QueryAsync<dynamic>("sp_ChangeUserPassword", new
                {
                    UserId          = userId,
                    OldPasswordHash = Sha256Hex(model.OldPassword),
                    NewPasswordHash = Sha256Hex(model.NewPassword)
                });

                var row = rows?.FirstOrDefault();
                bool success = row != null && Convert.ToInt32(row.Success) == 1;

                if (!success)
                    return BadRequest(new { message = row != null ? (string)row.ErrorMessage : "Password change failed." });

                return Ok(new { message = "Your password has been changed. Please sign in again." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Auth", action: "ChangePassword", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        // ── Email template ────────────────────────────────────────────────────
        private static string BuildResetEmail(string fullName, string link) => $@"
<div style=""font-family:Segoe UI,Arial,sans-serif;max-width:520px;margin:0 auto;color:#1e293b;"">
  <div style=""background:linear-gradient(135deg,#1e40af,#2e5fa3);padding:24px;border-radius:10px 10px 0 0;text-align:center;"">
    <h1 style=""color:#fff;margin:0;font-size:22px;"">WebERP</h1>
  </div>
  <div style=""border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:28px 26px;background:#fff;"">
    <p style=""font-size:15px;"">Hello {System.Net.WebUtility.HtmlEncode(fullName)},</p>
    <p style=""font-size:14px;line-height:1.6;color:#475569;"">
      We received a request to reset the password for your WebERP account.
      Click the button below to choose a new password. This link is valid for <strong>30 minutes</strong>.
    </p>
    <div style=""text-align:center;margin:28px 0;"">
      <a href=""{link}"" style=""background:#1e40af;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;display:inline-block;"">
        Reset Password
      </a>
    </div>
    <p style=""font-size:12.5px;color:#94a3b8;line-height:1.6;"">
      If the button doesn't work, copy and paste this link into your browser:<br/>
      <a href=""{link}"" style=""color:#2e5fa3;word-break:break-all;"">{link}</a>
    </p>
    <hr style=""border:none;border-top:1px solid #e2e8f0;margin:22px 0;""/>
    <p style=""font-size:12px;color:#94a3b8;"">
      If you did not request a password reset, you can safely ignore this email — your password will remain unchanged.
    </p>
  </div>
</div>";
    }
}
