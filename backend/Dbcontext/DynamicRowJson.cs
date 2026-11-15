namespace ERPWEB.Dbcontext
{
    // 2026-11-15: Dapper `dynamic` rows are dictionaries, so System.Text.Json writes their keys exactly as the SQL
    // column names (PascalCase) - the camelCase PropertyNamingPolicy does not apply to dictionary keys. Screens that
    // read camelCase fields (supplier approval checklist, stock revaluations) got undefined. Use this on endpoints
    // whose screen expects camelCase; do NOT change the global JSON options (other endpoints rely on PascalCase).
    public static class DynamicRowJson
    {
        public static List<Dictionary<string, object?>> ToCamelRows(this IEnumerable<dynamic>? rows)
        {
            var list = new List<Dictionary<string, object?>>();
            if (rows == null) return list;
            foreach (var row in rows)
            {
                if (row is IDictionary<string, object> d)
                {
                    var o = new Dictionary<string, object?>(d.Count);
                    foreach (var kv in d)
                        o[string.IsNullOrEmpty(kv.Key) ? kv.Key : char.ToLowerInvariant(kv.Key[0]) + kv.Key.Substring(1)] = kv.Value;
                    list.Add(o);
                }
            }
            return list;
        }
    }
}
