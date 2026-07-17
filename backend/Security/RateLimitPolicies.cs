namespace ERPWEB.Security;

/// <summary>
/// Rate-limiter policy names. Shared so the registration in Program.cs and the
/// [EnableRateLimiting] attributes cannot drift apart — a typo in either would
/// silently leave the endpoint unthrottled.
/// </summary>
public static class RateLimitPolicies
{
    public const string Login = "login";
}
