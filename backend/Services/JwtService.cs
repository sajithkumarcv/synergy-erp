using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace ERPWEB.Services
{
    public class JwtService
    {
        private readonly IConfiguration _config;

        public JwtService(IConfiguration config)
        {
            _config = config;
        }

        // roles = the user's ROLE CODES (TBL_ROLES.RoleCode), never role names: names differ per company, codes are stable.
        // One role claim per code, so [Authorize(Roles = "ADMIN")] matches whichever of the user's roles carries that code.
        public string GenerateToken(string userId, string username, IEnumerable<string> roles, string? sessionId = null)
        {
            var jwtKey = _config["Jwt:Key"] ?? throw new InvalidOperationException("Jwt:Key is not configured.");
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
            var expiryMinutes = double.Parse(_config["Jwt:ExpiryMinutes"] ?? "480");
            var expiry = DateTime.UtcNow.AddMinutes(expiryMinutes);

            var claims = new List<Claim>
            {
                new Claim(JwtRegisteredClaimNames.Sub, userId),
                new Claim(JwtRegisteredClaimNames.UniqueName, username),
            };
            foreach (var r in roles) claims.Add(new Claim(ClaimTypes.Role, r));
            // jti carries the server-side login-session id (TBL_LOGIN_HISTORY.SessionId)
            // so SessionValidationMiddleware can validate the session on every request.
            claims.Add(new Claim(JwtRegisteredClaimNames.Jti, sessionId ?? Guid.NewGuid().ToString()));

            var token = new JwtSecurityToken(
                issuer:   _config["Jwt:Issuer"],
                audience: _config["Jwt:Audience"],
                claims:   claims,
                expires:  expiry,
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }
}
