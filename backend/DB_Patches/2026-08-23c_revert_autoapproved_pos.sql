/* ============================================================================
   Revert POs that were auto-approved at Level 1 in error

   These POs were submitted for approval only, but one or more levels
   auto-approved themselves: the PROJ.MANAGER row at Level 1 has
   AllowSelfApproval = 1 and sp_SubmitForApproval applied it level-wide.
   They now sit at Level 2 (one level auto-cleared) or Level 3 (two levels)
   without those approvals ever really happening.

   SCOPE: vijay.bhusnar's POs only - all at Level 2, i.e. Level 1 auto-cleared.
   POs submitted by abhijeet.patil and vishal.bhalerao are NOT touched; their
   approvals are legitimate.

   This script uses the application's OWN engine (sp_ProcessApproval with
   'Cancel'), not hand-edited rows, so:
     - the approval trail records a proper 'Cancelled' entry (audit intact)
     - the PO returns to its configured CancelledStatus, which for PO is Draft
     - the document status column is updated by the same code path the UI uses
   Cancel is permitted when @ActionByName = that transaction's own submitter.

   ORDER OF WORK - do not skip step 0, or re-submitting repeats the problem:

     0. Stop the auto-approval:
          a) run 2026-08-23b_self_approval_per_role.sql   (per-role enforcement)
          b) clear the flag on the Level 1 rows            (see PART 0 below)
        The submitters hold roles whose Level 1 row has the flag = 1, so (a)
        alone does NOT change their outcome. (b) is what actually stops it.
     1. PART 1 - preview. Changes nothing.
     2. PART 2 - cancel. POs go back to Draft.
     3. Each submitter re-submits their own POs from the UI. They now stop at
        Level 1 and wait for a real approver.

   Only transactions whose CurrentStatus is still 'Pending' can be cancelled;
   any already 'Approved' are reported as skipped by PART 2 and need a
   different route (Revise PO). Nothing is forced.

   APPLY TO: SYNERPINDIA (and SYNERPUAE only if the same happened there).
   ============================================================================ */

SET NOCOUNT ON;

/* -- the POs to revert. Edit this list; everything below follows it. ------- */
DECLARE @Targets TABLE (PoNumber NVARCHAR(50) PRIMARY KEY);
-- vijay.bhusnar's POs only. Deliberately EXCLUDED because their approvals are
-- legitimate, not the bug:
--   PO-26-0148, PO-26-0154  submitted by abhijeet.patil  (at Level 3)
--   PO-26-0157              submitted by vishal.bhalerao
INSERT INTO @Targets (PoNumber) VALUES
    ('PO-26-0149'), ('PO-26-0150'), ('PO-26-0151'), ('PO-26-0152'),
    ('PO-26-0153'), ('PO-26-0155'), ('PO-26-0156'), ('PO-26-0158'),
    ('PO-26-0159');

DECLARE @ModuleId INT = (SELECT ModuleId FROM PROJ.TBL_APPROVAL_MODULE WHERE ModuleCode = 'PO');

/* ═══════════════════════════════════════════════════════════════════════════
   PART 0 - clear self-approval on Level 1 (PREVIEW then UPDATE)

   Preview which rows would change:
   ═══════════════════════════════════════════════════════════════════════════ */
SELECT DISTINCT al.PolicyId, al.LevelNo, al.LevelId,
       CASE al.ApproverType WHEN 'Role' THEN r.RoleName
                            WHEN 'User' THEN u.FullName ELSE 'Anyone' END AS Approver,
       al.AllowSelfApproval
FROM PROJ.TBL_APPROVAL_LEVEL al
LEFT JOIN PROJ.TBL_ROLES r ON r.RoleId = al.ApproverId AND al.ApproverType = 'Role'
LEFT JOIN PROJ.TBL_USERS u ON u.UserId = al.ApproverId AND al.ApproverType = 'User'
WHERE al.IsActive = 1
  AND al.AllowSelfApproval = 1
  AND al.PolicyId IN (SELECT DISTINCT t.PolicyId
                      FROM PROJ.TBL_APPROVAL_TRANSACTION t
                      JOIN @Targets g ON g.PoNumber = t.DocumentNo
                      WHERE t.ModuleId = @ModuleId)
ORDER BY al.PolicyId, al.LevelNo, al.LevelId;

/*  Then, when the list above is what you expect, run:

    UPDATE al
    SET    al.AllowSelfApproval = 0
    FROM   PROJ.TBL_APPROVAL_LEVEL al
    WHERE  al.IsActive = 1
      AND  al.AllowSelfApproval = 1
      AND  al.LevelNo = 1                     -- drop this line to clear ALL levels
      AND  al.PolicyId IN (SELECT DISTINCT t.PolicyId
                           FROM PROJ.TBL_APPROVAL_TRANSACTION t
                           JOIN @Targets g ON g.PoNumber = t.DocumentNo
                           WHERE t.ModuleId = @ModuleId);
*/

/* ═══════════════════════════════════════════════════════════════════════════
   PART 1 - PREVIEW. Changes nothing. Check every row before PART 2.
   ═══════════════════════════════════════════════════════════════════════════ */
SELECT  g.PoNumber,
        po.Status                AS PoStatus,
        t.TransactionId,
        t.CurrentStatus,
        t.CurrentLevelNo,
        t.TotalLevels,
        t.SubmittedBy,
        CASE WHEN t.TransactionId IS NULL           THEN 'no approval transaction - skip'
             WHEN t.CurrentStatus <> 'Pending'      THEN 'already complete - CANNOT cancel'
             WHEN u.UserId IS NULL                  THEN 'submitter not found in TBL_USERS - cannot cancel'
             ELSE 'will be cancelled -> Draft (as ' + t.SubmittedBy + ')' END AS WillDo,
        t.CurrentLevelNo - 1                        AS LevelsAutoCleared
FROM @Targets g
LEFT JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoNumber = g.PoNumber
LEFT JOIN PROJ.TBL_APPROVAL_TRANSACTION t
       ON t.DocumentId = po.PoId AND t.ModuleId = @ModuleId
LEFT JOIN PROJ.TBL_USERS u ON u.UserName = t.SubmittedBy
ORDER BY g.PoNumber;

/* ═══════════════════════════════════════════════════════════════════════════
   PART 2 - CANCEL. Commented out on purpose: uncomment and run only after
   PART 1 shows exactly what you expect.

   Runs as the submitter, which is what authorises the cancel. Each call is
   independent - one failure does not stop the rest, and every outcome is
   reported at the end.

-- These POs were submitted by SEVERAL people (abhijeet.patil, vishal.bhalerao,
-- vijay.bhusnar). sp_ProcessApproval authorises Cancel with
--     IF @Action = 'Cancel' AND @ActionByName = @SubmittedBy
-- so each one must be cancelled AS ITS OWN SUBMITTER, not as a fixed user.
DECLARE @SubmitterName NVARCHAR(100), @SubmitterId INT;

DECLARE @Results TABLE (PoNumber NVARCHAR(50), TransactionId INT, NewStatus NVARCHAR(50),
                        IsComplete BIT, Message NVARCHAR(400), ModuleCode NVARCHAR(20), DocumentId INT);
DECLARE @PoNumber NVARCHAR(50), @TxnId INT;

DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
    SELECT g.PoNumber, t.TransactionId, t.SubmittedBy, u.UserId
    FROM @Targets g
    JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoNumber = g.PoNumber
    JOIN PROJ.TBL_APPROVAL_TRANSACTION t ON t.DocumentId = po.PoId AND t.ModuleId = @ModuleId
    JOIN PROJ.TBL_USERS u ON u.UserName = t.SubmittedBy
    WHERE t.CurrentStatus = 'Pending'
    ORDER BY g.PoNumber;

OPEN cur;
FETCH NEXT FROM cur INTO @PoNumber, @TxnId, @SubmitterName, @SubmitterId;
WHILE @@FETCH_STATUS = 0
BEGIN
    INSERT INTO @Results (TransactionId, NewStatus, IsComplete, Message, ModuleCode, DocumentId)
    EXEC PROJ.sp_ProcessApproval
         @TransactionId = @TxnId,
         @Action        = 'Cancel',
         @ActionBy      = @SubmitterId,
         @ActionByName  = @SubmitterName,
         @Remarks       = 'Reverted - levels auto-approved in error; resubmitting for proper approval';

    UPDATE @Results SET PoNumber = @PoNumber WHERE PoNumber IS NULL;
    FETCH NEXT FROM cur INTO @PoNumber, @TxnId, @SubmitterName, @SubmitterId;
END
CLOSE cur; DEALLOCATE cur;

SELECT * FROM @Results ORDER BY PoNumber;

   ═══════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════
   PART 3 - CONFIRM after running PART 2. Every PO should read Draft, and the
   transaction Cancelled.
   ═══════════════════════════════════════════════════════════════════════════ */
/*
SELECT g.PoNumber, po.Status AS PoStatus, t.CurrentStatus, t.FinalAction, t.FinalRemarks
FROM @Targets g
JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoNumber = g.PoNumber
LEFT JOIN PROJ.TBL_APPROVAL_TRANSACTION t ON t.DocumentId = po.PoId AND t.ModuleId = @ModuleId
ORDER BY g.PoNumber;
*/
