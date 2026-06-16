-- ============================================================
-- Stock Alerts Stored Procedure
-- Schema : proj
-- Returns stockable items whose current QtyOnHand is
--   ZERO_STOCK    : QtyOnHand = 0
--   BELOW_MIN     : QtyOnHand < MinStockLevel  (and MinStockLevel > 0)
--   BELOW_REORDER : QtyOnHand <= ReorderLevel  (and ReorderLevel > 0)
-- Priority: ZERO_STOCK > BELOW_MIN > BELOW_REORDER
-- ============================================================
CREATE OR ALTER PROCEDURE proj.sp_GetStockAlerts
    @AlertType     VARCHAR(20)   = NULL,   -- NULL=all | 'ZERO_STOCK' | 'BELOW_MIN' | 'BELOW_REORDER'
    @SearchText    NVARCHAR(200) = NULL,
    @CategoryId    INT           = NULL,
    @SubCategoryId INT           = NULL,
    @ItemTypeId    INT           = NULL,
    @ItemId        INT           = NULL
AS
BEGIN
    SET NOCOUNT ON;

    SELECT
        i.ItemId, i.ItemCode, i.ItemName,
        cat.CategoryName,
        it.TypeName                            AS ItemTypeName,
        u.UomCode                              AS BaseUom,
        ISNULL(sb.QtyOnHand,      0)           AS QtyOnHand,
        ISNULL(id.MinStockLevel,  0)           AS MinStockLevel,
        ISNULL(id.ReorderLevel,   0)           AS ReorderLevel,
        ISNULL(id.MaxStockLevel,  0)           AS MaxStockLevel,
        ISNULL(id.LeadTimeDays,   0)           AS LeadTimeDays,
        -- Shortage = how many units short of MinStockLevel (0 if above min)
        CASE
            WHEN ISNULL(id.MinStockLevel, 0) > 0
                 AND ISNULL(sb.QtyOnHand, 0) < ISNULL(id.MinStockLevel, 0)
            THEN ISNULL(id.MinStockLevel, 0) - ISNULL(sb.QtyOnHand, 0)
            ELSE 0
        END                                    AS Shortage,
        -- AlertType: highest-priority alert for this item
        CASE
            WHEN ISNULL(sb.QtyOnHand, 0) = 0                                                               THEN 'ZERO_STOCK'
            WHEN ISNULL(sb.QtyOnHand, 0) < ISNULL(id.MinStockLevel, 0) AND ISNULL(id.MinStockLevel, 0) > 0 THEN 'BELOW_MIN'
            WHEN ISNULL(sb.QtyOnHand, 0) <= ISNULL(id.ReorderLevel,  0) AND ISNULL(id.ReorderLevel,  0) > 0 THEN 'BELOW_REORDER'
        END                                    AS AlertType,
        sb.LastReceiptDate
    FROM proj.TBL_ITEM i
    LEFT JOIN (
        SELECT ItemId, MIN(ItemDetailId) AS ItemDetailId
        FROM   proj.TBL_ITEM_DETAIL
        WHERE  ISNULL(IsActive, 1) = 1
        GROUP BY ItemId
    ) idsel ON idsel.ItemId = i.ItemId
    LEFT JOIN proj.TBL_ITEM_DETAIL   id  ON id.ItemDetailId  = idsel.ItemDetailId
    LEFT JOIN proj.TBL_STOCK_BALANCE sb  ON sb.ItemId        = i.ItemId
    LEFT JOIN proj.TBL_ITEM_CATEGORY cat ON cat.CategoryId   = i.CategoryId
    LEFT JOIN proj.TBL_ITEM_TYPE     it  ON it.ItemTypeId    = i.ItemTypeId
    LEFT JOIN proj.TBL_ITEM_UOM      u   ON u.UomId          = i.BaseUomId
    WHERE
        i.IsActive    = 1
        AND i.IsStockable = 1
        -- Must have at least one alert condition
        AND (
               ISNULL(sb.QtyOnHand, 0) = 0
            OR (ISNULL(sb.QtyOnHand, 0) < ISNULL(id.MinStockLevel,  0) AND ISNULL(id.MinStockLevel,  0) > 0)
            OR (ISNULL(sb.QtyOnHand, 0) <= ISNULL(id.ReorderLevel,  0) AND ISNULL(id.ReorderLevel,   0) > 0)
        )
        -- Alert type filter
        AND (
            @AlertType IS NULL
            OR (@AlertType = 'ZERO_STOCK'    AND ISNULL(sb.QtyOnHand, 0) = 0)
            OR (@AlertType = 'BELOW_MIN'     AND ISNULL(sb.QtyOnHand, 0) <  ISNULL(id.MinStockLevel, 0) AND ISNULL(id.MinStockLevel, 0) > 0)
            OR (@AlertType = 'BELOW_REORDER' AND ISNULL(sb.QtyOnHand, 0) <= ISNULL(id.ReorderLevel,  0) AND ISNULL(id.ReorderLevel,  0) > 0)
        )
        AND (@ItemId IS NULL OR i.ItemId = @ItemId)
        AND (
               (@CategoryId IS NULL AND @SubCategoryId IS NULL)
            OR (@SubCategoryId IS NOT NULL AND i.CategoryId = @SubCategoryId)
            OR (@SubCategoryId IS NULL AND @CategoryId IS NOT NULL AND (
                   i.CategoryId = @CategoryId
                   OR i.CategoryId IN (SELECT CategoryId FROM proj.TBL_ITEM_CATEGORY WHERE ParentCategoryId = @CategoryId)
               ))
        )
        AND (@ItemTypeId IS NULL OR i.ItemTypeId = @ItemTypeId)
        AND (@SearchText IS NULL OR i.ItemCode LIKE N'%' + @SearchText + N'%' OR i.ItemName LIKE N'%' + @SearchText + N'%')
    ORDER BY
        -- Severity order: zero stock first, then below min, then below reorder
        CASE
            WHEN ISNULL(sb.QtyOnHand, 0) = 0 THEN 1
            WHEN ISNULL(sb.QtyOnHand, 0) < ISNULL(id.MinStockLevel, 0) AND ISNULL(id.MinStockLevel, 0) > 0 THEN 2
            ELSE 3
        END,
        i.ItemCode;
END
