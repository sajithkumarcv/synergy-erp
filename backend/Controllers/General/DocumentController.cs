using ERPWEB.Dbcontext;
using ERPWEB.Models.General;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace ERPWEB.Controllers.General
{
    [Authorize]
    [Route("api/[controller]")]
    [ApiController]
    public class DocumentController : ControllerBase
    {
        private readonly DbCon              _dbcon;
        private readonly IWebHostEnvironment _env;

        private static readonly HashSet<string> _allowedExt =
            new(StringComparer.OrdinalIgnoreCase) { ".jpg", ".jpeg", ".pdf" };

        private static readonly Dictionary<string, string> _contentTypes = new(StringComparer.OrdinalIgnoreCase)
        {
            { ".jpg",  "image/jpeg" },
            { ".jpeg", "image/jpeg" },
            { ".pdf",  "application/pdf" },
        };

        public DocumentController(DbCon dbcon, IWebHostEnvironment env)
        {
            _dbcon = dbcon;
            _env   = env;
        }

        // ── DOCUMENT TYPES ───────────────────────────────────────────────
        [HttpGet("types/{module}")]
        public async Task<IActionResult> GetTypes(string module)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<DocumentTypeItem>("sp_GetDocumentTypes", new { ModuleName = module.ToUpper() });
                return Ok(rows ?? Enumerable.Empty<DocumentTypeItem>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Document", action: "GetTypes", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching document types." });
            }
        }

        // ── LIST ─────────────────────────────────────────────────────────
        [HttpGet("{refTable}/{refKey}")]
        public async Task<IActionResult> GetDocuments(string refTable, string refKey)
        {
            try
            {
                var docs = await _dbcon.QueryAsync<Document>("sp_GetDocumentsByRef",
                    new { ReferenceTable = refTable.ToUpper(), ReferenceKey = refKey });
                return Ok(docs ?? Enumerable.Empty<Document>());
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Document", action: "GetDocuments", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error fetching documents." });
            }
        }

        // ── UPLOAD ───────────────────────────────────────────────────────
        [HttpPost("{refTable}/{refKey}")]
        [RequestSizeLimit(20_971_520)] // 20 MB
        public async Task<IActionResult> Upload(
            string refTable, string refKey,
            IFormFile file,
            [FromForm] string documentType,
            [FromForm] string uploadedBy,
            [FromForm] string? remarks = null)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { message = "No file provided." });

            var ext = Path.GetExtension(file.FileName).ToLower();
            if (!_allowedExt.Contains(ext))
                return BadRequest(new { message = "Only JPG, JPEG and PDF files are allowed." });

            if (string.IsNullOrWhiteSpace(documentType))
                return BadRequest(new { message = "Document type is required." });

            try
            {
                // ── Build consistent filename ──────────────────────────
                // Pattern: {refKey}_{doctype-slug}_{yyyyMMdd_HHmmss}{ext}
                // e.g.    1001_lpo-copy_20260513_143022.pdf
                var slug      = documentType.ToLower().Replace(' ', '-').Replace('/', '-');
                var timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
                var fileName  = $"{refKey}_{slug}_{timestamp}{ext}";

                // ── Create folder: Docs/jobs/{refKey}/ ────────────────
                var folder = Path.Combine(_env.ContentRootPath, "Docs", refTable.ToLower() + "s", refKey);
                Directory.CreateDirectory(folder);

                var fullPath     = Path.Combine(folder, fileName);
                var relativePath = Path.Combine("Docs", refTable.ToLower() + "s", refKey, fileName);

                // ── Save file to disk ──────────────────────────────────
                await using var stream = new FileStream(fullPath, FileMode.Create);
                await file.CopyToAsync(stream);

                // ── Save metadata to DB ────────────────────────────────
                var p = new
                {
                    ReferenceTable = refTable.ToUpper(),
                    ReferenceKey   = refKey,
                    DocumentType   = documentType,
                    FileName       = fileName,
                    FileType       = ext.TrimStart('.').ToUpper(),
                    FileSize       = (int)file.Length,
                    FilePath       = relativePath,
                    Remarks        = remarks?.Trim(),
                    UploadedBy     = uploadedBy
                };

                var result = await _dbcon.ExecuteScalarAsync("sp_SaveDocument", p);
                return Ok(new { id = result, fileName, message = "Document uploaded successfully." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Document", action: "Upload", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error uploading document." });
            }
        }

        // ── DOWNLOAD / VIEW ──────────────────────────────────────────────
        [HttpGet("{id:int}/download")]
        public async Task<IActionResult> Download(int id)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<Document>("sp_GetDocumentById", new { DocumentId = id });
                var doc  = rows?.FirstOrDefault();
                if (doc == null) return NotFound(new { message = "Document not found." });

                var fullPath = Path.Combine(_env.ContentRootPath, doc.FilePath ?? "");
                if (!System.IO.File.Exists(fullPath))
                    return NotFound(new { message = "File not found on server." });

                var ext         = Path.GetExtension(doc.FileName).ToLower();
                var contentType = _contentTypes.TryGetValue(ext, out var ct) ? ct : "application/octet-stream";
                var bytes       = await System.IO.File.ReadAllBytesAsync(fullPath);

                Response.Headers["Content-Disposition"] = $"inline; filename=\"{doc.FileName}\"";
                return File(bytes, contentType);
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Document", action: "Download", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error downloading document." });
            }
        }

        // ── DELETE ───────────────────────────────────────────────────────
        [HttpDelete("{id:int}")]
        public async Task<IActionResult> Delete(int id)
        {
            try
            {
                var rows = await _dbcon.QueryAsync<Document>("sp_DeleteDocument", new { DocumentId = id });
                var filePath = rows?.FirstOrDefault()?.FilePath;

                // Delete physical file if it exists
                if (!string.IsNullOrEmpty(filePath))
                {
                    var fullPath = Path.Combine(_env.ContentRootPath, filePath);
                    if (System.IO.File.Exists(fullPath))
                        System.IO.File.Delete(fullPath);
                }

                return Ok(new { id, message = "Document deleted." });
            }
            catch (Exception ex)
            {
                await _dbcon.WriteLog(ex, controller: "Document", action: "Delete", requestPath: HttpContext.Request.Path);
                return StatusCode(500, new { message = "Error deleting document." });
            }
        }
    }
}
