using ERPWEB.Dbcontext;
using ERPWEB.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Data;
using System.Security.Claims;
using System.Security.Cryptography;

namespace ERPWEB.Controllers.User
{
    public record LoginRequest(string Username, string Password);
    public record ForgotPasswordRequest(string Email, string Username);
    public record ResetPasswordWithTokenRequest(string Token, string NewPassword);
    public record ChangePasswordRequest(string OldPassword, string NewPassword);

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
        public async Task<IActionResult> Login([FromBody] LoginRequest model)
        {
            try
            {
                string hashedPassword = Convert.ToHexString(
                    SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(model.Password))
                ).ToLower();

                var parameters = new Dictionary<string, object>
                {
                    { "@Username", model.Username },
                    { "@Password", hashedPassword }
                };

                DataSet ds = _dbcon.ExecuteProcedure(parameters, "sp_ValidateUser");

                if (ds == null || ds.Tables.Count == 0 || ds.Tables[0].Rows.Count == 0)
                    return Unauthorized(new { message = "Invalid username or password." });

                var row = ds.Tables[0].Rows[0];

                string userId   = row["UserId"].ToString()!;
                string username = row["Username"].ToString()!;
                string fullName = row["FullName"].ToString()!;
                string email    = row["Email"].ToString()!;
                string role     = row["RoleName"].ToString()!;
                string theme    = row.Table.Columns.Contains("Theme")
                                  ? row["Theme"]?.ToString() ?? "ocean-blue"
                                  : "ocean-blue";

                string token = _jwtService.GenerateToken(userId, username, role);

                return Ok(new
                {
                    token,
                    userId,
                    username,
                    fullName,
                    email,
                    role,
                    theme,
                    expiresIn = 480
                });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Auth", action: "Login", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "An internal server error occurred." });
            }
        }

        // ── FORGOT PASSWORD ───────────────────────────────────────────────────
        // Always returns a generic success message regardless of whether the email
        // exists, to prevent account enumeration.
        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest model)
        {
            var generic = Ok(new { message = "If an account with that email exists, a password reset link has been sent." });

            try
            {
                if (string.IsNullOrWhiteSpace(model?.Email) || string.IsNullOrWhiteSpace(model?.Username))
                    return generic;

                var rawToken  = GenerateToken();
                var tokenHash = Sha256Hex(rawToken);
                var expiresAt = DateTime.Now.AddMinutes(30);
                var ip        = HttpContext.Connection.RemoteIpAddress?.ToString();

                var rows = await _dbcon.QueryAsync<dynamic>("sp_CreatePasswordResetToken", new
                {
                    Email       = model.Email.Trim(),
                    UserName    = model.Username.Trim(),
                    TokenHash   = tokenHash,
                    ExpiresAt   = expiresAt,
                    RequestedIp = ip
                });

                var user = rows?.FirstOrDefault();
                if (user == null)
                    return generic; // email not found — do not reveal

                string email    = (string)user.Email;
                string fullName = (string)user.FullName;
                string baseUrl  = (_config["App:FrontendUrl"] ?? "http://localhost:3000").TrimEnd('/');
                string link     = $"{baseUrl}/?reset-token={rawToken}";

                await _email.SendAsync(email, "WebERP — Password Reset Request", BuildResetEmail(fullName, link));
                return generic;
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Auth", action: "ForgotPassword", requestPath: HttpContext.Request.Path);
                return generic; // never leak internal errors on this endpoint
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
                if (string.IsNullOrWhiteSpace(model?.OldPassword) || string.IsNullOrWhiteSpace(model?.NewPassword))
                    return BadRequest(new { message = "Current and new passwords are required." });

                if (model.NewPassword.Length < 6)
                    return BadRequest(new { message = "New password must be at least 6 characters long." });

                // Derive the user from the JWT (never trust a client-supplied id for this).
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
