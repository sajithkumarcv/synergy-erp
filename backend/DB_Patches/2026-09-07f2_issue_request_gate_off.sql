-- 2026-09-07f2: Issue Request - staged rollout, request gate OFF
--
-- Apply to: SYNERP
-- Requires: 2026-09-07f_issue_request_step3a_schema.sql (adds TBL_ISSUE_TYPE.RequiresRequest, default 1)
-- Run BEFORE 2026-09-07g / 07h / 09c, because 09c makes sp_ConfirmStockIssue refuse a note with no approved
-- request whenever RequiresRequest = 1, and the store cannot issue anything until the ISR approval policy
-- (2026-10-06c) and approvers are in place.
--
-- This was originally run inline on SYNERP on 2026-10-06; this file makes the order replayable.
--
-- To turn the rule ON later (one company DB at a time, no redeploy needed):
--   UPDATE proj.TBL_ISSUE_TYPE SET RequiresRequest = 1;
-- Idempotent.

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
GO

UPDATE proj.TBL_ISSUE_TYPE SET RequiresRequest = 0 WHERE RequiresRequest <> 0;
PRINT CONCAT('Issue types with the request gate OFF: ', (SELECT COUNT(*) FROM proj.TBL_ISSUE_TYPE WHERE RequiresRequest = 0));
GO

SELECT IssueTypeId, IssueTypeCode, RequiresRequest FROM proj.TBL_ISSUE_TYPE ORDER BY IssueTypeId;
GO
