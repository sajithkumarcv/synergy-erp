-- 2026-09-07: Issue Request — BUILD STEP 2b of 5: document statuses
--
-- Apply to: ERPDB
-- Requires: 2026-09-07b (tables/series/module/menu)
-- Design:   backend/Docs/DESIGN-issue-request.md §6
--
-- TBL_DOCUMENT_STATUS drives three things in the UI, all of which are broken
-- without these rows:
--   * the status badge on the list and detail pages (statusBadgeCfg falls back to
--     a grey em-dash when the module has no rows at all)
--   * the Status filter options — the list calls getModuleStatuses('ISR')
--   * CanEdit / CanDelete / CanPrint, which the pages read before showing the
--     Edit, Delete and Print controls
--
-- The status set is §6's header model plus the four the approval engine itself
-- sets (PendingApproval, PendingL1, PendingL2, SentBack). Colours and sort orders
-- copy the IRN rows so the two documents look alike.
--
-- Approved is deliberately NOT terminal: the request carries on to PartiallyIssued
-- and FullyIssued as the store issues against it in step 3.
--
-- Idempotent — inserts only the codes that are missing.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

;WITH src (StatusCode, StatusLabel, BadgeBg, BadgeColor, BadgeDot, SortOrder,
           CanEdit, CanDelete, CanUploadDocs, IsInitial, IsTerminal, CanPrint) AS (
    SELECT * FROM (VALUES
        ('Draft',           'Draft',                    '#f1f5f9', '#475569', '#94a3b8',  1, 1, 1, 0, 1, 0, 0),
        ('PendingApproval', 'Pending Approval',         '#fef3c7', '#92400e', '#f59e0b', 15, 0, 0, 1, 0, 0, 0),
        ('PendingL1',       'Pending Level 1 Approval', '#fef3c7', '#92400e', '#f59e0b', 16, 0, 0, 1, 0, 0, 0),
        ('PendingL2',       'Pending Level 2 Approval', '#fef3c7', '#78350f', '#d97706', 17, 0, 0, 1, 0, 0, 0),
        ('Approved',        'Approved',                 '#dcfce7', '#166534', '#22c55e', 20, 0, 0, 1, 0, 0, 1),
        ('PartiallyIssued', 'Partially Issued',         '#e0f2fe', '#075985', '#0ea5e9', 21, 0, 0, 1, 0, 0, 1),
        ('FullyIssued',     'Fully Issued',             '#d1fae5', '#065f46', '#10b981', 22, 0, 0, 1, 0, 0, 1),
        ('Closed',          'Closed',                   '#e2e8f0', '#334155', '#64748b', 23, 0, 0, 1, 0, 1, 1),
        ('Rejected',        'Rejected',                 '#fee2e2', '#991b1b', '#dc2626', 25, 1, 0, 1, 0, 0, 0),
        ('Cancelled',       'Cancelled',                '#fce7f3', '#9d174d', '#db2777', 30, 0, 0, 1, 0, 1, 0),
        ('SentBack',        'Sent Back',                '#fef3c7', '#92400e', '#f59e0b', 35, 1, 0, 1, 0, 0, 0)
    ) v (StatusCode, StatusLabel, BadgeBg, BadgeColor, BadgeDot, SortOrder,
         CanEdit, CanDelete, CanUploadDocs, IsInitial, IsTerminal, CanPrint)
)
INSERT INTO proj.TBL_DOCUMENT_STATUS
    (ModuleName, StatusCode, StatusLabel, BadgeBg, BadgeColor, BadgeDot, SortOrder,
     CanEdit, CanDelete, CanUploadDocs, IsInitial, IsTerminal, CanPrint, IsActive, CreatedBy)
SELECT 'ISR', s.StatusCode, s.StatusLabel, s.BadgeBg, s.BadgeColor, s.BadgeDot, s.SortOrder,
       s.CanEdit, s.CanDelete, s.CanUploadDocs, s.IsInitial, s.IsTerminal, s.CanPrint, 1, 'system'
FROM src s
WHERE NOT EXISTS (
    SELECT 1 FROM proj.TBL_DOCUMENT_STATUS d
    WHERE d.ModuleName = 'ISR' AND d.StatusCode = s.StatusCode);
GO

/* Verify */
SELECT CONCAT(COUNT(*), ' of 11 ISR statuses') AS Result
FROM proj.TBL_DOCUMENT_STATUS WHERE ModuleName = 'ISR';
GO
