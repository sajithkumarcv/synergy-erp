using Dapper;
using Microsoft.Data.SqlClient;
using System.Data;
using System.Net;
using System.Net.Mail;

namespace ERPWEB.Services
{
    /// <summary>
    /// SMTP settings loaded from proj.TBL_APP_SETTINGS (keys prefixed with "Smtp.").
    /// </summary>
    public class EmailSettings
    {
        public string Host        { get; set; } = "";
        public int    Port        { get; set; } = 587;
        public bool   EnableSsl   { get; set; } = true;
        public string Username    { get; set; } = "";
        public string Password    { get; set; } = "";
        public string FromAddress { get; set; } = "";
        public string FromName    { get; set; } = "WebERP";
    }

    /// <summary>
    /// Loads SMTP credentials from the database (proj.TBL_APP_SETTINGS) at runtime,
    /// so credentials never need to be stored in appsettings.json.
    /// Settings are cached for 10 minutes to avoid a DB hit on every email.
    /// </summary>
    public class EmailService
    {
        private readonly string _connectionString;
        private readonly ILogger<EmailService> _logger;

        // Simple in-memory cache so we don't query DB on every send.
        private EmailSettings? _cached;
        private DateTime _cacheExpiry = DateTime.MinValue;
        private readonly TimeSpan _cacheDuration = TimeSpan.FromMinutes(10);

        public EmailService(IConfiguration config, ILogger<EmailService> logger)
        {
            _connectionString = config.GetConnectionString("DefaultConnection") ?? "";
            _logger = logger;
        }

        // ── Settings loader ──────────────────────────────────────────────────
        private async Task<EmailSettings> GetSettingsAsync()
        {
            if (_cached != null && DateTime.UtcNow < _cacheExpiry)
                return _cached;

            try
            {
                using IDbConnection db = new SqlConnection(_connectionString);
                var rows = await db.QueryAsync<(string Key, string Value)>(
                    "proj.sp_GetAppSettings",
                    new { Prefix = "Smtp." },
                    commandType: CommandType.StoredProcedure);

                var dict = rows.ToDictionary(r => r.Key, r => r.Value ?? "");

                _cached = new EmailSettings
                {
                    Host        = dict.GetValueOrDefault("Smtp.Host",        ""),
                    Port        = int.TryParse(dict.GetValueOrDefault("Smtp.Port", "587"), out var p) ? p : 587,
                    EnableSsl   = !string.Equals(dict.GetValueOrDefault("Smtp.EnableSsl", "true"), "false", StringComparison.OrdinalIgnoreCase),
                    Username    = dict.GetValueOrDefault("Smtp.Username",    ""),
                    Password    = dict.GetValueOrDefault("Smtp.Password",    ""),
                    FromAddress = dict.GetValueOrDefault("Smtp.FromAddress", ""),
                    FromName    = dict.GetValueOrDefault("Smtp.FromName",    "WebERP"),
                };
                _cacheExpiry = DateTime.UtcNow.Add(_cacheDuration);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to load SMTP settings from database.");
                _cached ??= new EmailSettings(); // fall back to empty (won't send)
            }

            return _cached!;
        }

        /// <summary>True when host + from-address are configured in the DB.</summary>
        public async Task<bool> IsConfiguredAsync()
        {
            var s = await GetSettingsAsync();
            return !string.IsNullOrWhiteSpace(s.Host) && !string.IsNullOrWhiteSpace(s.FromAddress);
        }

        // ── Send ─────────────────────────────────────────────────────────────
        public async Task<bool> SendAsync(string toEmail, string subject, string htmlBody)
        {
            var settings = await GetSettingsAsync();

            if (string.IsNullOrWhiteSpace(settings.Host) || string.IsNullOrWhiteSpace(settings.FromAddress))
            {
                _logger.LogWarning(
                    "SMTP is not configured in DB — email to {To} (subject: {Subject}) was not sent.",
                    toEmail, subject);
                return false;
            }

            try
            {
                using var msg = new MailMessage
                {
                    From       = new MailAddress(settings.FromAddress, settings.FromName),
                    Subject    = subject,
                    Body       = htmlBody,
                    IsBodyHtml = true
                };
                msg.To.Add(toEmail);

                using var client = new SmtpClient(settings.Host, settings.Port)
                {
                    EnableSsl   = settings.EnableSsl,
                    Credentials = string.IsNullOrWhiteSpace(settings.Username)
                                  ? CredentialCache.DefaultNetworkCredentials
                                  : new NetworkCredential(settings.Username, settings.Password)
                };

                await client.SendMailAsync(msg);
                return true;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send email to {To}.", toEmail);
                return false;
            }
        }
    }
}
