using System.Security.Cryptography;
using System.Text;
using ERPWEB.Dbcontext;

namespace ERPWEB.Security
{
    /// <summary>
    /// Shared guard for financial mutations (budget, PO, invoice, expense).
    /// Every edit that changes a money amount must pass the user's budget
    /// password and carry a reason (≥ MinReasonLength chars) for the audit log.
    /// </summary>
    public static class FinancialGuard
    {
        public const int MinReasonLength = 10;

        public static string Sha256Hex(string raw)
        {
            using var sha = SHA256.Create();
            var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(raw ?? string.Empty));
            var sb = new StringBuilder(bytes.Length * 2);
            foreach (var b in bytes) sb.Append(b.ToString("x2"));
            return sb.ToString();
        }

        /// <summary>Returns null when the reason is acceptable, else an error message.</summary>
        public static string? ValidateReason(string? reason)
        {
            if (string.IsNullOrWhiteSpace(reason) || reason.Trim().Length < MinReasonLength)
                return $"A reason of at least {MinReasonLength} characters is required for this financial change.";
            return null;
        }

        /// <summary>Verifies the plain budget password for the user (personal secret, role fallback).</summary>
        public static async Task<bool> VerifyBudgetPasswordAsync(DbCon db, string? userName, string? plainPassword)
        {
            if (string.IsNullOrWhiteSpace(userName) || string.IsNullOrWhiteSpace(plainPassword))
                return false;
            var row = await db.QueryFirstOrDefaultAsync<dynamic>("sp_VerifyBudgetPassword",
                new { UserName = userName, PasswordHash = Sha256Hex(plainPassword) });
            return row != null && (bool)row.IsValid;
        }
    }
}
