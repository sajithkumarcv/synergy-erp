using Dapper;
using ERPWEB.Models.Alerts;
using Microsoft.Data.SqlClient;
using System.Data;
using System.Diagnostics;
using System.Text.RegularExpressions;

namespace ERPWEB.Services
{
    /// <summary>
    /// Core alert processing engine.
    /// For each due alert: fetches data from its configured view, renders the template,
    /// sends email to all group members, and writes full audit logs.
    /// </summary>
    public class EmailAlertProcessorService
    {
        private readonly string _connectionString;
        private readonly string _schema;
        private readonly EmailService _email;
        private readonly ILogger<EmailAlertProcessorService> _logger;

        public EmailAlertProcessorService(
            IConfiguration config,
            EmailService email,
            ILogger<EmailAlertProcessorService> logger)
        {
            _connectionString = config.GetConnectionString("DefaultConnection") ?? "";
            _schema           = config["DbSchema"] ?? "proj";
            _email            = email;
            _logger           = logger;
        }

        // ── Public entry point ────────────────────────────────────────────────

        public async Task ProcessAlertAsync(AlertConfigRow alert)
        {
            var sw = Stopwatch.StartNew();
            _logger.LogInformation("Processing alert {Id} '{Name}'", alert.AlertId, alert.AlertName);

            // Validate view name before using it in SQL (prevent injection)
            if (!IsValidViewName(alert.SqlViewName))
            {
                _logger.LogWarning("Invalid view name '{View}' for alert {Id} — skipped.", alert.SqlViewName, alert.AlertId);
                await UpdateLastRunAsync(alert.AlertId, false, $"Invalid view name: {alert.SqlViewName}");
                return;
            }

            try
            {
                // 1. Fetch data from the alert view
                var rows = await FetchAlertDataAsync(alert.SqlViewName);

                // 2. Honour SkipIfNoData
                if (rows.Count == 0 && alert.SkipIfNoData)
                {
                    _logger.LogInformation("Alert {Id} has no data — skipped (SkipIfNoData=true).", alert.AlertId);
                    await LogAlertRunAsync(alert.AlertId, "NoData", null, 0, 0, (int)sw.ElapsedMilliseconds);
                    await UpdateLastRunAsync(alert.AlertId, true, null);
                    return;
                }

                // 3. Load template
                var template = await GetTemplateAsync(alert.TemplateId);
                if (template == null)
                {
                    await LogAlertRunAsync(alert.AlertId, "Failed", "Template not found.", 0, rows.Count, (int)sw.ElapsedMilliseconds);
                    await UpdateLastRunAsync(alert.AlertId, false, "Template not found.");
                    return;
                }

                // 4. Render content
                var subject = TemplateEngine.RenderSubject(template.SubjectTemplate, alert.AlertName, rows.Count);
                var body    = TemplateEngine.RenderBody(template.BodyTemplate, alert.AlertName, rows);

                // 5. Get recipients
                var recipients = await GetGroupMembersAsync(alert.GroupId);
                if (recipients.Count == 0)
                {
                    await LogAlertRunAsync(alert.AlertId, "NoRecipients", "Group has no active members with email.", 0, rows.Count, (int)sw.ElapsedMilliseconds);
                    await UpdateLastRunAsync(alert.AlertId, true, null);
                    return;
                }

                // 6. Create run log record
                int logId = await LogAlertRunAsync(alert.AlertId, "Running", null, recipients.Count, rows.Count, 0);

                // 7. Send to each recipient
                int sent = 0;
                foreach (var r in recipients)
                {
                    bool ok = await _email.SendAsync(r.Email, subject, body);
                    await LogRecipientAsync(logId, r.UserId, r.Email, r.FullName,
                        ok ? "Sent" : "Failed",
                        ok ? null : "SMTP send failed");
                    if (ok) sent++;
                }

                sw.Stop();

                // 8. Finalise log
                await UpdateLogStatusAsync(logId, sent > 0 ? "Success" : "Failed",
                    sent == 0 ? "All recipient sends failed." : null,
                    sent, rows.Count, (int)sw.ElapsedMilliseconds);

                await UpdateLastRunAsync(alert.AlertId, sent > 0, sent == 0 ? "All sends failed." : null);

                _logger.LogInformation("Alert {Id} completed. Sent={Sent}/{Total} in {Ms}ms.",
                    alert.AlertId, sent, recipients.Count, sw.ElapsedMilliseconds);
            }
            catch (Exception ex)
            {
                sw.Stop();
                _logger.LogError(ex, "Alert {Id} '{Name}' failed.", alert.AlertId, alert.AlertName);
                await LogAlertRunAsync(alert.AlertId, "Failed", ex.Message, 0, 0, (int)sw.ElapsedMilliseconds);
                await UpdateLastRunAsync(alert.AlertId, false, ex.Message);
            }
        }

        // ── Fetch alert view data ─────────────────────────────────────────────

        private async Task<IList<IDictionary<string, object?>>> FetchAlertDataAsync(string viewName)
        {
            using IDbConnection db = new SqlConnection(_connectionString);
            var rows = await db.QueryAsync($"SELECT * FROM {_schema}.{viewName}");
            return rows.Select(r => (IDictionary<string, object?>)r).ToList();
        }

        // ── DB helpers ────────────────────────────────────────────────────────

        private async Task<EmailTemplateRow?> GetTemplateAsync(int templateId)
        {
            using IDbConnection db = new SqlConnection(_connectionString);
            return await db.QueryFirstOrDefaultAsync<EmailTemplateRow>(
                $"{_schema}.sp_GetEmailTemplates",
                new { TemplateId = templateId },
                commandType: CommandType.StoredProcedure);
        }

        private async Task<IList<AlertRecipient>> GetGroupMembersAsync(int groupId)
        {
            using IDbConnection db = new SqlConnection(_connectionString);
            var rows = await db.QueryAsync<AlertRecipient>(
                $"{_schema}.sp_GetAlertGroupMembers",
                new { GroupId = groupId },
                commandType: CommandType.StoredProcedure);
            return rows.ToList();
        }

        private async Task<int> LogAlertRunAsync(int alertId, string status,
            string? error, int recipients, int dataRows, int durationMs)
        {
            using IDbConnection db = new SqlConnection(_connectionString);
            return await db.ExecuteScalarAsync<int>(
                $"{_schema}.sp_LogAlertRun",
                new { AlertId = alertId, Status = status, ErrorMessage = error,
                      RecipientCount = recipients, DataRowCount = dataRows, DurationMs = durationMs },
                commandType: CommandType.StoredProcedure);
        }

        private async Task UpdateLogStatusAsync(int logId, string status,
            string? error, int sent, int dataRows, int durationMs)
        {
            using IDbConnection db = new SqlConnection(_connectionString);
            await db.ExecuteAsync(
                $"UPDATE {_schema}.TBL_EMAIL_ALERT_LOG SET Status=@Status,ErrorMessage=@Error,RecipientCount=@Sent,DataRowCount=@DataRows,DurationMs=@Ms WHERE LogId=@LogId",
                new { LogId = logId, Status = status, Error = error, Sent = sent, DataRows = dataRows, Ms = durationMs });
        }

        private async Task LogRecipientAsync(int logId, int userId, string email,
            string fullName, string status, string? error)
        {
            using IDbConnection db = new SqlConnection(_connectionString);
            await db.ExecuteAsync(
                $"{_schema}.sp_LogAlertRecipient",
                new { LogId = logId, UserId = userId, Email = email,
                      FullName = fullName, Status = status, ErrorMessage = error },
                commandType: CommandType.StoredProcedure);
        }

        private async Task UpdateLastRunAsync(int alertId, bool success, string? error)
        {
            using IDbConnection db = new SqlConnection(_connectionString);
            await db.ExecuteAsync(
                $"{_schema}.sp_UpdateAlertLastRun",
                new { AlertId = alertId, Success = success, ErrorMessage = error },
                commandType: CommandType.StoredProcedure);
        }

        // ── Security: whitelist view names ────────────────────────────────────

        private static bool IsValidViewName(string name) =>
            !string.IsNullOrWhiteSpace(name) &&
            name.StartsWith("vw_Alert", StringComparison.OrdinalIgnoreCase) &&
            Regex.IsMatch(name, @"^[a-zA-Z0-9_]+$");
    }
}
