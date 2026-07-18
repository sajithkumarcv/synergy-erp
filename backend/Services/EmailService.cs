using Dapper;
using ERPWEB.Dbcontext;
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
    ///
    /// Send failures are reported two ways: SendAsync returns false (callers must
    /// check it), and the underlying reason is written to TBL_APP_LOG. ILogger
    /// alone is not enough here — no file/Serilog sink is registered, so those
    /// entries are not retrievable from a deployed instance.
    /// </summary>
    public class EmailService
    {
        private readonly string _connectionString;
        private readonly ILogger<EmailService> _logger;
        private readonly DbCon _dbcon;

        // Simple in-memory cache so we don't query DB on every send.
        private EmailSettings? _cached;
        private DateTime _cacheExpiry = DateTime.MinValue;
        private readonly TimeSpan _cacheDuration = TimeSpan.FromMinutes(10);

        public EmailService(IConfiguration config, ILogger<EmailService> logger, DbCon dbcon)
        {
            _connectionString = config.GetConnectionString("DefaultConnection") ?? "";
            _logger = logger;
            _dbcon = dbcon;
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
                await _dbcon.WriteLog(ex, controller: "EmailService", action: "GetSettingsAsync");
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

        // Each send opens a fresh TCP+TLS+auth connection to the SMTP host. The
        // first cold connection to Gmail intermittently fails (handshake / transient
        // deferral) while an immediate retry succeeds — the classic "first email
        // fails, second works" symptom. System.Net.Mail.SmtpClient does not retry,
        // so we do it here.
        private const int  MaxAttempts   = 3;
        private const int  AttemptTimeoutMs = 20000;               // fail a hung connection fast, not after the 100s default
        private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(2);

        // ── Send ─────────────────────────────────────────────────────────────
        public async Task<bool> SendAsync(string toEmail, string subject, string htmlBody)
        {
            var settings = await GetSettingsAsync();

            if (string.IsNullOrWhiteSpace(settings.Host) || string.IsNullOrWhiteSpace(settings.FromAddress))
            {
                _logger.LogWarning(
                    "SMTP is not configured in DB — email to {To} (subject: {Subject}) was not sent.",
                    toEmail, subject);
                await _dbcon.WriteRawLog(
                    message: $"SMTP is not configured in TBL_APP_SETTINGS — email to '{toEmail}' (subject: {subject}) was not sent.",
                    controller: "EmailService",
                    action: "SendAsync",
                    logLevel: "Warning");
                return false;
            }

            Exception? last = null;
            for (int attempt = 1; attempt <= MaxAttempts; attempt++)
            {
                try
                {
                    // Rebuilt each attempt: a MailMessage/SmtpClient can't be reused
                    // after a failed send, and a fresh connection is what recovers.
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
                        Timeout     = AttemptTimeoutMs,
                        Credentials = string.IsNullOrWhiteSpace(settings.Username)
                                      ? CredentialCache.DefaultNetworkCredentials
                                      : new NetworkCredential(settings.Username, settings.Password)
                    };

                    await client.SendMailAsync(msg);

                    // Leave a durable trace when a retry was needed — confirms the
                    // transient-first-connection theory and flags a flaky SMTP host.
                    if (attempt > 1)
                        await _dbcon.WriteRawLog(
                            message: $"Email to '{toEmail}' (subject: {subject}) sent on attempt {attempt} of {MaxAttempts}.",
                            controller: "EmailService", action: "SendAsync", logLevel: "Warning");
                    return true;
                }
                catch (Exception ex)
                {
                    last = ex;
                    _logger.LogWarning(ex, "Email send attempt {Attempt}/{Max} to {To} failed.", attempt, MaxAttempts, toEmail);
                    if (attempt < MaxAttempts)
                        await Task.Delay(RetryDelay);
                }
            }

            _logger.LogError(last, "Failed to send email to {To} after {Max} attempts.", toEmail, MaxAttempts);
            await _dbcon.WriteLog(last!, controller: "EmailService", action: $"SendAsync → {toEmail} (after {MaxAttempts} attempts)");
            return false;
        }
    }
}
