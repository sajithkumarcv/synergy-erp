-- BOM line -> the PRs / POs raised against it (drives the PR Qty / PO Qty click-through on the BOM page).
-- @Kind = 'PR' : one row per active PR line linked to the BOM line
-- @Kind = 'PO' : one row per active PO line whose PR line is linked to the BOM line
CREATE OR ALTER PROCEDURE PROJ.sp_GetBomLineDocs
    @BomDetailId INT = NULL,
    @Kind        NVARCHAR(2),
    @PrLineId    INT = NULL      -- PO kind only: POs raised against this one PR line (PR page)
AS
BEGIN
    SET NOCOUNT ON;

    IF @Kind = N'PR'
        SELECT pr.PrId       AS DocId,
               pr.PrNumber   AS DocNumber,
               pr.Status     AS DocStatus,
               prl.LineNum   AS LineNum,
               prl.RequiredQty AS Qty,
               prl.UomName   AS UomName,
               CAST(NULL AS DECIMAL(18,4)) AS UnitPrice,
               CAST(NULL AS NVARCHAR(10))  AS CurrencyCode,
               pr.PrDate     AS DocDate
        FROM PROJ.TBL_PURCHASE_REQUEST_LINE prl
        JOIN PROJ.TBL_PURCHASE_REQUEST pr ON pr.PrId = prl.PrId
        WHERE prl.BomDetailId = @BomDetailId AND prl.IsActive = 1 AND pr.IsActive = 1
        ORDER BY pr.PrDate, pr.PrId, prl.LineNum;
    ELSE
        SELECT po.PoId       AS DocId,
               po.PoNumber   AS DocNumber,
               po.Status     AS DocStatus,
               pol.LineNum   AS LineNum,
               pol.OrderedQty AS Qty,
               pol.UomName   AS UomName,
               pol.UnitPrice AS UnitPrice,
               cur.ShortName AS CurrencyCode,
               po.PoDate     AS DocDate
        FROM PROJ.TBL_PURCHASE_ORDER_LINE pol
        JOIN PROJ.TBL_PURCHASE_ORDER po ON po.PoId = pol.PoId
        JOIN PROJ.TBL_PURCHASE_REQUEST_LINE prl ON prl.PrLineId = pol.PrLineId
        LEFT JOIN PROJ.TBL_CURRENCY cur ON cur.CurrencyId = po.CurrencyId
        WHERE pol.IsActive = 1 AND po.IsActive = 1
          AND ((@PrLineId IS NOT NULL AND pol.PrLineId = @PrLineId)
            OR (@PrLineId IS NULL     AND prl.BomDetailId = @BomDetailId))
        ORDER BY po.PoDate, po.PoId, pol.LineNum;
END
