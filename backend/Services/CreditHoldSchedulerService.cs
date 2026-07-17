using Dapper;
using Microsoft.Data.SqlClient;
using System.Data;

namespace ERPWEB.Services
{
    /// <summary>
    /// Background service that runs sp_AutoCreditHoldCheck on a configurable
    /// interval (default: every 60 minutes).
    ///
    /// Puts customers on credit hold when:
    ///   - Outstanding balance exceeds their credit limit, OR
    ///   - An invoice is overdue beyond their credit days
    /// Auto-releases holds when the conditions clear.
    ///
    /// Configure in appsettings.json:
    ///   "CreditHoldScheduler": { "IntervalMinutes": 60 }
    /// </summary>
    public class CreditHoldSchedulerService : BackgroundService
    {
        private readonly ILogger<CreditHoldSchedulerService> _logger;
        private readonly IServiceScopeFactory _scopeFactory;
        private readonly string _connectionString;
        private readonly string _schema;

        public CreditHoldSchedulerService(
            IConfiguration config,
            ILogger<CreditHoldSchedulerService> logger,
            IServiceScopeFactory scopeFactory)
        {
            _logger           = logger;
            _scopeFactory     = scopeFactory;
            _connectionString = config.GetConnectionString("DefaultConnection") ?? "";
            _schema           = config["DbSchema"] ?? "proj";
        }

        private async Task<int> GetIntervalMinutesAsync()
        {
            try
            {
                using IDbConnection db = new SqlConnection(_connectionString);
                var val = await db.ExecuteScalarAsync<string>(
                    $"SELECT SettingValue FROM {_schema}.TBL_APP_SETTINGS WHERE SettingKey = 'CreditHold.IntervalMinutes'");
                return int.TryParse(val, out var m) && m > 0 ? m : 60;
            }
            catch { return 60; }
        }

        protected override async Task ExecuteAsync(CancellationToken ct)
        {
            _logger.LogInformation("CreditHoldScheduler started — interval read from TBL_APP_SETTINGS.");

            // Small initial delay so API finishes starting before first run
            await Task.Delay(TimeSpan.FromSeconds(30), ct).ContinueWith(_ => { }, ct);

            while (!ct.IsCancellationRequested)
            {
                var intervalMinutes = await GetIntervalMinutesAsync();

                try
                {
                    await RunCheckAsync();
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "CreditHoldScheduler encountered an error.");
                    using var logScope = _scopeFactory.CreateScope();
                    await logScope.ServiceProvider.GetRequiredService<Dbcontext.DbCon>()
                        .WriteLog(ex, controller: "CreditHoldSchedulerService", action: "ExecuteAsync");
                }

                _logger.LogInformation("CreditHoldScheduler next run in {Interval} min(s).", intervalMinutes);
                await Task.Delay(TimeSpan.FromMinutes(intervalMinutes), ct)
                          .ContinueWith(_ => { }, ct);
            }

            _logger.LogInformation("CreditHoldScheduler stopped.");
        }

        private async Task RunCheckAsync()
        {
            using IDbConnection db = new SqlConnection(_connectionString);

            var result = await db.QueryFirstOrDefaultAsync(
                $"{_schema}.sp_AutoCreditHoldCheck",
                commandType: CommandType.StoredProcedure);

            int newHolds = result?.NewHolds ?? 0;
            int released = result?.Released ?? 0;

            if (newHolds > 0 || released > 0)
            {
                _logger.LogWarning(
                    "CreditHoldScheduler: {NewHolds} customer(s) placed on hold, {Released} released.",
                    newHolds, released);

                // Write to app log so it appears in Settings → Error Log
                await db.ExecuteAsync(
                    $"{_schema}.sp_WriteLog",
                    new
                    {
                        LogLevel       = "Info",
                        Controller     = "CreditHoldScheduler",
                        Action         = "AutoHoldCheck",
                        Message        = $"Auto credit hold: {newHolds} customer(s) placed on hold, {released} released.",
                        StackTrace     = (string?)null,
                        InnerException = (string?)null,
                        RequestPath    = "/scheduler/credit-hold",
                        UserId         = "SYSTEM",
                        IpAddress      = (string?)null,
                    },
                    commandType: CommandType.StoredProcedure);
            }
            else
            {
                _logger.LogInformation("CreditHoldScheduler: No changes required.");
            }
        }
    }
}
