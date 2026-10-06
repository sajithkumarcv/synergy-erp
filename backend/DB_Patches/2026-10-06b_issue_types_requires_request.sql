-- 2026-10-06b: sp_GetIssueTypes returns RequiresRequest
--
-- Apply to: SYNERP
-- Requires: 2026-09-07f_issue_request_step3a_schema.sql (adds TBL_ISSUE_TYPE.RequiresRequest)
--
-- The New Issue Note form needs to know, per issue type, whether an approved
-- Issue Request is mandatory. That lets the rollout be staged: with
-- RequiresRequest = 0 the Issue Request field is optional, and flipping a type to
-- 1 makes the form demand one - no code change, no redeploy.
--
-- Purely additive (one extra column in the result set). Idempotent.

SET NOCOUNT ON;
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

CREATE OR ALTER PROCEDURE proj.sp_GetIssueTypes
AS
BEGIN
    SET NOCOUNT ON;
    SELECT IssueTypeId, IssueTypeCode, IssueTypeName, Description, SortOrder,
           CAST(ISNULL(RequiresRequest, 0) AS BIT) AS RequiresRequest
    FROM   proj.TBL_ISSUE_TYPE
    WHERE  IsActive = 1
    ORDER  BY SortOrder;
END;
GO
