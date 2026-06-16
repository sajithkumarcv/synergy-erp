using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ERPWEB.Services;

public class LicenseInfo
{
    public string ClientName { get; set; } = "";
    public string IssuedDate { get; set; } = "";
    public string ExpiryDate { get; set; } = "";
    public string[] Modules { get; set; } = [];
    public string Signature { get; set; } = "";
}

public class LicenseService
{
    // After running LicenseTool generate-keys, paste the printed public key here.
    private const string PublicKeyPem = """
        PASTE_YOUR_PUBLIC_KEY_HERE
        """;

    public LicenseInfo? License { get; private set; }
    public bool IsValid { get; private set; }
    public string StatusMessage { get; private set; } = "License not loaded";

    public LicenseService(IWebHostEnvironment env)
    {
        var path = Path.Combine(env.ContentRootPath, "license.json");
        Load(path);
    }

    private void Load(string path)
    {
        if (!File.Exists(path))
        {
            StatusMessage = "license.json not found. Place a valid license file in the application root.";
            return;
        }

        try
        {
            var json = File.ReadAllText(path);
            var info = JsonSerializer.Deserialize<LicenseInfo>(json,
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

            if (info == null) { StatusMessage = "Invalid license file format."; return; }

            if (PublicKeyPem.Contains("MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArLUD6cbLVUS/nNOBSqSY\nvXdThH26Xhg0VPpt0juI4uXGOYGL6JMb3Fxtah4yr2cvXtguZjD8Df7Rx/orB/+y\nIGkl9RmT7Pq3VMLjrYRAoJsBrqg0lFvNtgfSfrQVZMUihDjqbJSPcMA82w2Ub5Y9\nklqmTnQo+LgaPKwpeJTw0PuVKrpdvgkFzqxY6+4kMPhy6UtEwO8kWbrfNJvww8I0\noxzTqYt6LgfX9ALo+HDB1fVabJMp/0Vr0PcWO/2GgKhSJfRamG0ut80Edt8Mqxrc\nxsRSxFUepxHsNeQ7+jGu2FLbVB3tQzThU70XjWZs8nxD3F8WdUpMQ9cS9ffvn49q\n3QIDAQAB"))
            {
                StatusMessage = "Public key not configured in LicenseService.cs.";
                return;
            }

            // Rebuild the exact payload that was signed
            var payload = $"{info.ClientName}|{info.IssuedDate}|{info.ExpiryDate}|{string.Join(",", info.Modules)}";
            using var rsa = RSA.Create();
            rsa.ImportFromPem(PublicKeyPem);
            var signatureBytes = Convert.FromBase64String(info.Signature);
            bool signatureValid = rsa.VerifyData(
                Encoding.UTF8.GetBytes(payload),
                signatureBytes,
                HashAlgorithmName.SHA256,
                RSASignaturePadding.Pkcs1);

            if (!signatureValid)
            {
                StatusMessage = "License signature is invalid. The file may have been tampered with.";
                return;
            }

            var expiry = DateOnly.Parse(info.ExpiryDate);
            License = info;

            if (expiry < DateOnly.FromDateTime(DateTime.UtcNow))
            {
                IsValid = false;
                StatusMessage = $"License expired on {info.ExpiryDate}. Please contact your vendor.";
                return;
            }

            IsValid = true;
            StatusMessage = $"Licensed to {info.ClientName}, valid until {info.ExpiryDate}";
        }
        catch (Exception ex)
        {
            StatusMessage = $"License load error: {ex.Message}";
        }
    }

    public bool HasModule(string module) =>
        IsValid && (
            License?.Modules.Contains("ALL", StringComparer.OrdinalIgnoreCase) == true ||
            License?.Modules.Contains(module, StringComparer.OrdinalIgnoreCase) == true
        );
}
