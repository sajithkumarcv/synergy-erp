using System.Text;
using System.Text.RegularExpressions;

namespace ERPWEB.Services
{
    /// <summary>
    /// Renders email templates by replacing {{placeholders}} and building HTML data tables
    /// dynamically from query result rows. No alert-specific logic here.
    /// </summary>
    public static class TemplateEngine
    {
        public static string RenderSubject(string template, string alertName, int rowCount) =>
            ApplyCommon(template, alertName, rowCount);

        public static string RenderBody(
            string template,
            string alertName,
            IList<IDictionary<string, object?>> rows)
        {
            var summary = rows.Count == 0
                ? "<p style='color:#64748b;font-style:italic;'>No records found for this alert.</p>"
                : $"<p style='font-size:14px;color:#475569;'><strong>{rows.Count:N0} record(s)</strong> found.</p>";

            var dataTable = BuildHtmlTable(rows);

            return ApplyCommon(template, alertName, rows.Count)
                .Replace("{{Summary}}", summary)
                .Replace("{{DataTable}}", dataTable);
        }

        // ── Private helpers ───────────────────────────────────────────────────

        private static string ApplyCommon(string s, string alertName, int count) =>
            s.Replace("{{AlertName}}", System.Net.WebUtility.HtmlEncode(alertName))
             .Replace("{{Date}}", DateTime.Now.ToString("dd MMM yyyy HH:mm"))
             .Replace("{{Count}}", count.ToString("N0"));

        private static string BuildHtmlTable(IList<IDictionary<string, object?>> rows)
        {
            if (rows.Count == 0)
                return "<p style='color:#94a3b8;font-size:13px;'>No data to display.</p>";

            var cols = rows[0].Keys.ToList();
            var sb   = new StringBuilder();

            sb.Append("<div style='overflow-x:auto;'>");
            sb.Append("<table style='width:100%;border-collapse:collapse;font-size:13px;min-width:600px;'>");

            // Header row
            sb.Append("<thead><tr>");
            foreach (var col in cols)
                sb.Append($"<th style='background:#1e40af;color:#fff;padding:9px 12px;text-align:left;white-space:nowrap;font-weight:600;font-size:12px;'>{FormatHeader(col)}</th>");
            sb.Append("</tr></thead><tbody>");

            // Data rows
            for (int i = 0; i < rows.Count; i++)
            {
                var bg = i % 2 == 0 ? "#ffffff" : "#f0f4ff";
                sb.Append($"<tr style='background:{bg};'>");
                foreach (var col in cols)
                {
                    rows[i].TryGetValue(col, out var v);
                    sb.Append($"<td style='padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;'>{FormatValue(v)}</td>");
                }
                sb.Append("</tr>");
            }

            sb.Append("</tbody></table></div>");
            return sb.ToString();
        }

        private static string FormatHeader(string col) =>
            Regex.Replace(col, "([A-Z])", " $1").Trim();

        private static string FormatValue(object? val)
        {
            if (val == null || val == DBNull.Value) return "<span style='color:#94a3b8;'>—</span>";
            if (val is DateTime dt) return dt.ToString("dd MMM yyyy");
            if (val is decimal d)   return d.ToString("N2");
            if (val is double dbl)  return dbl.ToString("N2");
            if (val is float flt)   return flt.ToString("N2");
            if (val is bool b)      return b ? "Yes" : "No";
            return System.Net.WebUtility.HtmlEncode(val.ToString() ?? "");
        }
    }
}
