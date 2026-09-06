/* ============================================================================
   Self-approval must be per APPROVER ROLE, not per level

   BUG (seen on PO-26-0145, prod): the approval trail shows
       Level 1 - Manager L1   Approved   "Auto-approved (submitter is approver)"
   even though the Procurement Manager row at Level 1 has AllowSelfApproval = 0.

   CAUSE: sp_SubmitForApproval decides self-approval for the whole LEVEL:

       SELECT @LvlAllowSelf = CASE WHEN MAX(CAST(AllowSelfApproval AS INT)) = 1 ...
       FROM PROJ.TBL_APPROVAL_LEVEL WHERE PolicyId=@PolicyId AND LevelNo=@CurrentLevelNo AND IsActive=1;

   MAX() spans every active approver row at that level, so ONE role with the
   flag grants self-approval to EVERY approver at that level. On the policy
   behind PO-26-0145, Level 1 is:
       PROJ.MANAGER        AllowSelfApproval = 1
       SR.PROJ.MANAGER     AllowSelfApproval = 1
       Procurement Manager AllowSelfApproval = 0   <- ignored at runtime
   The flag is stored per row and configured per row in the UI, but enforced
   per level - so a role explicitly denied self-approval still self-approves.
   That is a segregation-of-duties control that does not hold.

   FIX: evaluate the flag ONLY on the rows the submitter actually matches
   (ANY / their Role / their UserId). PROJ.MANAGER and SR.PROJ.MANAGER keep
   self-approval; a Procurement Manager submitting the same PO now stops at
   Level 1 and waits for someone else, exactly as configured.

   HOW THIS SCRIPT WORKS - read before running:
   It does NOT contain a retyped copy of the procedure. It reads the CURRENT
   definition out of sys.sql_modules, replaces one expression, and re-executes
   it as an ALTER. So it preserves whatever else that database's copy contains,
   and it ABORTS without changing anything if the expected expression is not
   found exactly once. Re-running it is a no-op (the old expression is gone).

   DB-ONLY: no API or frontend change, nothing to rebuild or redeploy.
   APPLY TO: SYNERPINDIA and SYNERPUAE.

   NOT CHANGED (deliberately): the "senior approver" short-circuit, which
   auto-clears lower levels when the submitter is an approver at a HIGHER
   level, regardless of this flag. It logs a different remark -
   'Auto-approved by senior approver (submitter)'. Say so if that should
   change too; it is a separate branch and a separate decision.
   ============================================================================ */

SET NOCOUNT ON;

DECLARE @def NVARCHAR(MAX),
        @old NVARCHAR(MAX),
        @new NVARCHAR(MAX),
        @hits INT;

SELECT @def = m.definition
FROM sys.sql_modules m
JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name = 'sp_SubmitForApproval';

IF @def IS NULL
BEGIN
    RAISERROR('sp_SubmitForApproval not found in %s. Nothing changed.', 16, 1, @@SERVERNAME);
    RETURN;
END

-- Single-line target on purpose: no embedded newlines, so CRLF/LF differences
-- between this file and the stored definition cannot break the match.
SET @old = N'MAX(CAST(AllowSelfApproval AS INT))';

SET @hits = (LEN(@def) - LEN(REPLACE(@def, @old, ''))) / LEN(@old);
IF @hits <> 1
BEGIN
    RAISERROR('Expected the self-approval expression exactly once, found %d. This database differs from what the patch was written for - nothing changed.', 16, 1, @hits);
    RETURN;
END

-- Scope the flag to the rows this submitter matches. Correlates only to
-- variables already in scope at that point in the procedure
-- (@PolicyId, @CurrentLevelNo, @SubmittedByUserId), so it is valid inside the
-- existing aggregate SELECT.
SET @new = N'(SELECT MAX(CAST(al2.AllowSelfApproval AS INT))
                            FROM PROJ.TBL_APPROVAL_LEVEL al2
                            WHERE al2.PolicyId = @PolicyId
                              AND al2.LevelNo  = @CurrentLevelNo
                              AND al2.IsActive = 1
                              AND (al2.ApproverType = ''ANY''
                                OR (al2.ApproverType = ''Role'' AND EXISTS (
                                        SELECT 1 FROM PROJ.TBL_USER_ROLES ur2
                                        WHERE ur2.UserId = @SubmittedByUserId
                                          AND ur2.RoleId = al2.ApproverId))
                                OR (al2.ApproverType = ''User''
                                        AND al2.ApproverId = @SubmittedByUserId)))';

SET @def = REPLACE(@def, @old, @new);

-- CREATE PROCEDURE -> ALTER PROCEDURE.
-- The keyword is NOT always at position 1: SYNERPINDIA's copy opens with a
-- comment header from the 2026-08-15 GST patch, which puts CREATE at 1760.
-- Assuming position 1 mangles the leading text and the dynamic batch then fails
-- with "Incorrect syntax" / "CREATE/ALTER PROCEDURE must be the first statement".
-- So find the CREATE that actually begins the CREATE PROCEDURE statement.
-- (Comments before it are fine - a comment is not a statement.)
DECLARE @p INT = 1, @createPos INT = 0;
WHILE 1 = 1
BEGIN
    SET @p = CHARINDEX(N'CREATE', @def, @p);
    IF @p = 0 BREAK;
    IF SUBSTRING(@def, @p, 40) LIKE N'CREATE%PROC%'
    BEGIN
        SET @createPos = @p;
        BREAK;
    END
    SET @p = @p + 6;
END

IF @createPos = 0
BEGIN
    RAISERROR('Could not locate the CREATE PROCEDURE keyword - nothing changed.', 16, 1);
    RETURN;
END

SET @def = STUFF(@def, @createPos, 6, N'ALTER ');

EXEC sp_executesql @def;

PRINT 'sp_SubmitForApproval patched: self-approval is now evaluated per approver role.';
GO

/* ═══════════════════════════════════════════════════════════════════════════
   VERIFY - both must be as noted
   ═══════════════════════════════════════════════════════════════════════════ */
SELECT
    CASE WHEN m.definition LIKE '%al2.ApproverType%' THEN 'PATCHED' ELSE 'NOT PATCHED' END AS Status,
    CASE WHEN m.definition LIKE '%MAX(CAST(AllowSelfApproval AS INT))%'
         THEN 'old level-wide expression still present - INVESTIGATE'
         ELSE 'old expression gone - correct' END AS OldExpression
FROM sys.sql_modules m
JOIN sys.objects o ON o.object_id = m.object_id
WHERE o.name = 'sp_SubmitForApproval';

/* ═══════════════════════════════════════════════════════════════════════════
   WHAT CHANGES IN PRACTICE

   Existing documents are untouched - this only affects future submissions.

   For the PO-26-0145 policy, Level 1:
     PROJ.MANAGER        submits -> still auto-approves Level 1 (flag = 1)
     SR.PROJ.MANAGER     submits -> still auto-approves Level 1 (flag = 1)
     Procurement Manager submits -> NO LONGER auto-approves; the PO waits at
                                    Level 1 for another approver (flag = 0)

   To stop self-approval at Level 1 entirely, clear the flag on the rows too:

     UPDATE PROJ.TBL_APPROVAL_LEVEL
     SET    AllowSelfApproval = 0
     WHERE  PolicyId = <policy> AND LevelNo = 1 AND IsActive = 1;

   RELATED, still level-wide: sp_GetMyApprovals computes CanAct with
   'EXISTS(... AND al.AllowSelfApproval = 1)' across the level, so a submitter
   whose own role is denied may still see their document as actionable in the
   queue. sp_ProcessApproval, which performs the actual approve, already reads
   the flag from the acting user's own row, so the action itself is governed
   correctly. Worth aligning CanAct in a follow-up for a consistent UI.
   ═══════════════════════════════════════════════════════════════════════════ */
