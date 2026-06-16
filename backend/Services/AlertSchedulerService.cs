using Dapper;
using ERPWEB.Models.Alerts;
using Microsoft.Data.SqlClient;
using System.Data;

namespace ERPWEB.Services
{
    /// <summary>
    /// Background service that wakes every 60 seconds, loads all active alert configs,
    /// filters to those that are due to run, and processes them.
    /// All scheduling logic (frequency, time slots) lives here — nothing is hardcoded per alert.
    /// </summary>
    public class AlertSchedulerService : BackgroundService
    {
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly IConfiguration _config;
        private readonly ILogger<AlertSchedulerService> _logger;

        private readonly string _connectionString;
        private readonly string _schema;

        public AlertSchedulerService(
            IServiceScopeFactory scopeFactory,
            IConfiguration config,
            ILogger<AlertSchedulerService> logger)
        {
            _scopeFactory     = scopeFactory;
            _config           = config;
            _logger           = logger;
            _connectionString = config.GetConnectionString("DefaultConnection") ?? "";
            _schema           = config["DbSchema"] ?? "proj";
        }

        protected override async Task ExecuteAsync(CancellationToken ct)
        {
            _logger.LogInformation("Alert scheduler started.");

            while (!ct.IsCancellationRequested)
            {
                try
                {
                    var alerts = await GetActiveAlertsAsync();
                    var due    = alerts.Where(IsDue).ToList();

                    if (due.Any())
                    {
                        _logger.LogInformation("{Count} alert(s) due to run.", due.Count);
                        using var scope     = _scopeFactory.CreateScope();
                        var processor       = scope.ServiceProvider.GetRequiredService<EmailAlertProcessorService>();

                        foreach (var alert in due)
                        {
                            if (ct.IsCancellationRequested) break;
                            await processor.ProcessAlertAsync(alert);
                        }
                    }
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Alert scheduler encountered an error.");
                }

                await Task.Delay(TimeSpan.FromSeconds(60), ct).ContinueWith(_ => { }, ct);
            }

            _logger.LogInformation("Alert scheduler stopped.");
        }

        // ── Scheduling logic ──────────────────────────────────────────────────

        /// <summary>
        /// Determines whether an alert is due to run right now based on its
        /// Frequency, TimeOfDay, DayOfWeek, DayOfMonth, and LastRunDate.
        /// </summary>
        private static bool IsDue(AlertConfigRow alert)
        {
            var now      = DateTime.Now;
            var today    = now.Date;
            var timeNow  = now.TimeOfDay;

            // Parse time slots (comma-separated for MultipleDaily, single for others)
            var slots = alert.TimeOfDay
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Where(t => TimeSpan.TryParseExact(t.PadLeft(5, '0'), @"hh\:mm", null, out _))
                .Select(t => TimeSpan.ParseExact(t.PadLeft(5, '0'), @"hh\:mm", null))
                .OrderBy(t => t)
                .ToList();

            if (!slots.Any()) return false;

            // Check day condition
            bool dayOk = alert.Frequency switch
            {
                "Daily"         => true,
                "MultipleDaily" => true,
                // Stored as 1=Monday … 7=Sunday to match UI dropdowns
                // .NET DayOfWeek: 0=Sunday,1=Monday…6=Saturday
                "Weekly"  => alert.DayOfWeek.HasValue &&
                             alert.DayOfWeek.Value == ((int)now.DayOfWeek == 0 ? 7 : (int)now.DayOfWeek),
                "Monthly" => alert.DayOfMonth.HasValue && now.Day == alert.DayOfMonth.Value,
                _         => false
            };

            if (!dayOk) return false;

            // Find any time slot that has passed today and hasn't been run since that slot
            foreach (var slot in slots)
            {
                if (timeNow < slot) continue; // slot not yet reached today

                var slotDateTime = today.Add(slot);
                if (alert.LastRunDate == null || alert.LastRunDate < slotDateTime)
                    return true;
            }

            return false;
        }

        // ── Data access ───────────────────────────────────────────────────────

        private async Task<IList<AlertConfigRow>> GetActiveAlertsAsync()
        {
            using IDbConnection db = new SqlConnection(_connectionString);
            var rows = await db.QueryAsync<AlertConfigRow>(
                $"{_schema}.sp_GetDueAlerts",
                commandType: CommandType.StoredProcedure);
            return rows.ToList();
        }
    }
}
