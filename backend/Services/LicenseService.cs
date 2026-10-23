using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Data.SqlClient;

namespace ERPWEB.Services;

public class LicenseInfo
{
    public int Version { get; set; } = 1;            // 1 = legacy (unbound), 2 = bound to a machine fingerprint
    public string ClientName { get; set; } = "";
    public string IssuedDate { get; set; } = "";
    public string ExpiryDate { get; set; } = "";
    public string[] Modules { get; set; } = [];
    public string Fingerprint { get; set; } = "";    // v2 only; empty = not machine-bound
    public bool ResetStamp { get; set; }             // v2 only; lets this license re-register the DB to a new client name
    public string Signature { get; set; } = "";
}

public class LicenseService
{
    // After running LicenseTool generate-keys, paste the printed public key here.
    private const string PublicKeyPem = """
        -----BEGIN PUBLIC KEY-----
        MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArLUD6cbLVUS/nNOBSqSY
        vXdThH26Xhg0VPpt0juI4uXGOYGL6JMb3Fxtah4yr2cvXtguZjD8Df7Rx/orB/+y
        IGkl9RmT7Pq3VMLjrYRAoJsBrqg0lFvNtgfSfrQVZMUihDjqbJSPcMA82w2Ub5Y9
        klqmTnQo+LgaPKwpeJTw0PuVKrpdvgkFzqxY6+4kMPhy6UtEwO8kWbrfNJvww8I0
        oxzTqYt6LgfX9ALo+HDB1fVabJMp/0Vr0PcWO/2GgKhSJfRamG0ut80Edt8Mqxrc
        xsRSxFUepxHsNeQ7+jGu2FLbVB3tQzThU70XjWZs8nxD3F8WdUpMQ9cS9ffvn49q
        3QIDAQAB
        -----END PUBLIC KEY-----
        """;

    // After expiry the app keeps working for this many days (with a warning) so a late
    // renewal or a mis-copied license file is not an instant outage.
    public const int GraceDays = 7;
    public const int WarnDays = 30;

    // The newest TBL_APP_LOG row is older evidence of "now" than the system clock can be
    // faked back past. LogDate may be local rather than UTC, so allow generous slack.
    private static readonly TimeSpan ClockSlack = TimeSpan.FromDays(2);
    private static readonly TimeSpan ClockCheckInterval = TimeSpan.FromMinutes(10);

    private readonly string _path;
    private readonly string _connectionString;
    private readonly object _lock = new();
    private readonly bool _requireBinding;   // appsettings "License:RequireServerBinding": reject unbound (legacy) licenses

    private LicenseInfo? _license;
    private string _loadError = "License not loaded";   // set when the file is missing/unsigned/wrong machine
    private DateTime _fileStamp = DateTime.MinValue;
    private DateTime _lastClockCheck = DateTime.MinValue;
    private bool _clockTampered;
    private string? _stampError;                     // set when the DB is registered to a different client
    private readonly string _stampTable;

    public LicenseService(IWebHostEnvironment env, IConfiguration config)
    {
        _path = Path.Combine(env.ContentRootPath, "license.json");
        _connectionString = config.GetConnectionString("DefaultConnection") ?? "";
        var schema = config["DbSchema"];
        _stampTable = string.IsNullOrWhiteSpace(schema) ? "TBL_LICENSE_STAMP" : $"{schema}.TBL_LICENSE_STAMP";
        _requireBinding = config.GetValue<bool>("License:RequireServerBinding");
        MachineFingerprint = ComputeFingerprint(_connectionString, env.ContentRootPath);
        Load();
    }

    /// <summary>
    /// This installation's ID (server + app folder + database) — give it to the vendor to get a bound (v2) license.
    /// The database name and the app folder are included because several companies, or several copies of the
    /// app, can share one server and one build: a license is good for one folder and one database only.
    /// </summary>
    public string MachineFingerprint { get; }

    public LicenseInfo? License { get { Refresh(); return _license; } }

    public bool IsValid { get { Refresh(); return Evaluate().valid; } }

    public string StatusMessage { get { Refresh(); return Evaluate().message; } }

    /// <summary>Days until expiry (negative once expired); null when there is no usable license.</summary>
    public int? DaysRemaining
    {
        get
        {
            Refresh();
            return _license != null && TryParseExpiry(_license, out var e)
                ? e.DayNumber - DateOnly.FromDateTime(DateTime.UtcNow).DayNumber
                : null;
        }
    }

    public bool HasModule(string module)
    {
        Refresh();
        return Evaluate().valid && (
            _license?.Modules.Contains("ALL", StringComparer.OrdinalIgnoreCase) == true ||
            _license?.Modules.Contains(module, StringComparer.OrdinalIgnoreCase) == true);
    }

    // ── Re-evaluation ────────────────────────────────────────────────────────
    // Expiry is computed from the live date on every call (the old code froze it at
    // startup, so a long-running process never expired). The file is re-read when it
    // changes on disk, so a renewal needs no restart.
    private void Refresh()
    {
        var stamp = File.Exists(_path) ? File.GetLastWriteTimeUtc(_path) : DateTime.MinValue;
        if (stamp != _fileStamp) Load();

        if (DateTime.UtcNow - _lastClockCheck > ClockCheckInterval) { CheckClock(); CheckStamp(); }
    }

    private (bool valid, string message) Evaluate()
    {
        if (_license == null) return (false, _loadError);
        if (_clockTampered)
            return (false, "System clock is earlier than existing activity records. Correct the server date/time.");
        if (_stampError != null) return (false, _stampError);
        if (!TryParseExpiry(_license, out var expiry))
            return (false, "License expiry date is invalid.");

        var left = expiry.DayNumber - DateOnly.FromDateTime(DateTime.UtcNow).DayNumber;
        if (left < -GraceDays)
            return (false, $"License expired on {_license.ExpiryDate}. Please contact your vendor.");
        if (left < 0)
            return (true, $"License EXPIRED on {_license.ExpiryDate}. Grace period ends in {GraceDays + left} day(s) — renew now.");
        if (left <= WarnDays)
            return (true, $"Licensed to {_license.ClientName}. Expires in {left} day(s) on {_license.ExpiryDate} — please renew.");
        return (true, $"Licensed to {_license.ClientName}, valid until {_license.ExpiryDate}");
    }

    private static bool TryParseExpiry(LicenseInfo info, out DateOnly expiry) =>
        DateOnly.TryParse(info.ExpiryDate, out expiry);

    private void Load()
    {
        lock (_lock)
        {
            _license = null;
            _fileStamp = File.Exists(_path) ? File.GetLastWriteTimeUtc(_path) : DateTime.MinValue;

            if (!File.Exists(_path))
            {
                _loadError = "license.json not found. Place a valid license file in the application root.";
                return;
            }

            try
            {
                var json = File.ReadAllText(_path);
                var info = JsonSerializer.Deserialize<LicenseInfo>(json,
                    new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

                if (info == null) { _loadError = "Invalid license file format."; return; }

                if (PublicKeyPem.Contains("PASTE_YOUR_PUBLIC_KEY_HERE"))
                {
                    _loadError = "Public key not configured in LicenseService.cs.";
                    return;
                }

                // Rebuild the exact payload that was signed. v1 files have no "version" field.
                var modules = string.Join(",", info.Modules);
                var payload = info.Version >= 2
                    ? $"v2|{info.ClientName}|{info.IssuedDate}|{info.ExpiryDate}|{modules}|{info.Fingerprint}" +
                      (info.ResetStamp ? "|resetstamp" : "")
                    : $"{info.ClientName}|{info.IssuedDate}|{info.ExpiryDate}|{modules}";

                using var rsa = RSA.Create();
                rsa.ImportFromPem(PublicKeyPem);
                var signatureValid = rsa.VerifyData(
                    Encoding.UTF8.GetBytes(payload),
                    Convert.FromBase64String(info.Signature),
                    HashAlgorithmName.SHA256,
                    RSASignaturePadding.Pkcs1);

                if (!signatureValid)
                {
                    _loadError = "License signature is invalid. The file may have been tampered with.";
                    return;
                }

                if (_requireBinding && (info.Version < 2 || string.IsNullOrEmpty(info.Fingerprint)))
                {
                    _loadError = "This license is not tied to a server and is no longer accepted. " +
                                 $"Send this server's ID ({MachineFingerprint}) to your vendor for a new license.";
                    return;
                }

                if (info.Version >= 2 && !string.IsNullOrEmpty(info.Fingerprint) &&
                    !string.Equals(info.Fingerprint, MachineFingerprint, StringComparison.OrdinalIgnoreCase))
                {
                    _loadError = "This license was issued for a different server. Send this server's ID " +
                                 $"({MachineFingerprint}) to your vendor to get a license for it.";
                    return;
                }

                _license = info;
                CheckStamp();
            }
            catch (Exception ex)
            {
                _loadError = $"License load error: {ex.Message}";
            }
        }
    }

    // ── Clock rollback ──────────────────────────────────────────────────────
    // If "now" is earlier than the newest activity record, the clock was set back.
    private void CheckClock()
    {
        _lastClockCheck = DateTime.UtcNow;
        if (string.IsNullOrEmpty(_connectionString)) return;

        try
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();
            using var cmd = new SqlCommand("SELECT MAX(LogDate) FROM TBL_APP_LOG", conn) { CommandTimeout = 5 };
            var result = cmd.ExecuteScalar();
            if (result is DateTime latest)
                _clockTampered = DateTime.UtcNow < latest - ClockSlack;
        }
        catch
        {
            // DB unreachable / table missing: keep the previous verdict rather than lock people out.
        }
    }

    // ── Database stamp ──────────────────────────────────────────────────────
    // TBL_LICENSE_STAMP holds one row naming the client this database belongs to. The install
    // script seeds it unclaimed; the first valid bound license claims it. After that a license
    // for a different client is refused, and a missing row means someone removed it.
    // Only bound (v2 + fingerprint) licenses are checked, so unbound licenses are unaffected.
    // Any SQL failure (table not created yet, DB down) leaves the previous verdict — never locks out.
    private const string StampSecret = "erpweb-stamp-7f3c91a2d5e84b06";

    private static string StampCheck(string? client) =>
        Convert.ToHexString(SHA256.HashData(
            Encoding.UTF8.GetBytes($"{StampSecret}|{(client ?? "").Trim().ToLowerInvariant()}")));

    private void CheckStamp()
    {
        var lic = _license;
        _stampError = null;
        if (lic == null || lic.Version < 2 || string.IsNullOrEmpty(lic.Fingerprint)) return;
        if (string.IsNullOrEmpty(_connectionString)) return;

        try
        {
            using var conn = new SqlConnection(_connectionString);
            conn.Open();

            using (var exists = new SqlCommand("SELECT OBJECT_ID(@t)", conn) { CommandTimeout = 5 })
            {
                exists.Parameters.AddWithValue("@t", _stampTable);
                if (exists.ExecuteScalar() is DBNull or null) return;   // script not applied yet
            }

            string? client = null, check = null;
            bool found = false;
            using (var read = new SqlCommand($"SELECT TOP 1 ClientName, CheckValue FROM {_stampTable} ORDER BY StampId", conn) { CommandTimeout = 5 })
            using (var rd = read.ExecuteReader())
            {
                if (rd.Read())
                {
                    found = true;
                    client = rd.IsDBNull(0) ? null : rd.GetString(0);
                    check = rd.IsDBNull(1) ? null : rd.GetString(1);
                }
            }

            if (!found)
            {
                _stampError = "License registration record is missing from the database. Contact your vendor.";
                return;
            }
            if (check != StampCheck(client))
            {
                _stampError = "License registration record is invalid. Contact your vendor.";
                return;
            }

            if (client == null)                                    // unclaimed → claim for this license
            {
                WriteStamp(conn, lic.ClientName);
                return;
            }

            if (!string.Equals(client, lic.ClientName, StringComparison.OrdinalIgnoreCase))
            {
                if (lic.ResetStamp) { WriteStamp(conn, lic.ClientName); return; }
                _stampError = $"This database is registered to \"{client}\" and cannot be used with the license for \"{lic.ClientName}\".";
            }
        }
        catch
        {
            // keep going: a stamp problem must not take the system down on its own
        }
    }

    private void WriteStamp(SqlConnection conn, string client)
    {
        using var up = new SqlCommand(
            $"UPDATE {_stampTable} SET ClientName=@c, CheckValue=@v, StampedAt=SYSUTCDATETIME()", conn) { CommandTimeout = 5 };
        up.Parameters.AddWithValue("@c", client);
        up.Parameters.AddWithValue("@v", StampCheck(client));
        up.ExecuteNonQuery();
    }

    // ── Fingerprint ─────────────────────────────────────────────────────────
    private static string ComputeFingerprint(string connectionString, string contentRoot)
    {
        string db = "";
        try { db = new SqlConnectionStringBuilder(connectionString).InitialCatalog; } catch { }

        // The folder the app runs from, normalised so C:\ERP\App, c:\erp\app\ and C:\ERP\.\App give one ID.
        string folder = "";
        try
        {
            folder = Path.GetFullPath(contentRoot ?? "")
                         .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                         .Replace('/', '\\').ToLowerInvariant();
        }
        catch { folder = (contentRoot ?? "").ToLowerInvariant(); }

        string id = Environment.MachineName;
        try
        {
            if (OperatingSystem.IsWindows())
            {
                using var key = Microsoft.Win32.Registry.LocalMachine
                    .OpenSubKey(@"SOFTWARE\Microsoft\Cryptography");
                if (key?.GetValue("MachineGuid") is string guid && guid.Length > 0) id = guid;
            }
        }
        catch { /* fall back to machine name */ }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes("ERPWEB2|" + id.ToLowerInvariant() + "|" + folder + "|" + db.ToLowerInvariant()));
        var hex = Convert.ToHexString(hash)[..16];
        return $"{hex[..4]}-{hex[4..8]}-{hex[8..12]}-{hex[12..16]}";
    }
}
