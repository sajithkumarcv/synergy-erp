-- PROD_2026-11-15c: SYNERPINDIA only. Country = India for the 7 active suppliers that have no address (so 05c could not
--   fill them). Evidence (13 Nov restore): all 7 use INR; CC-76 and SUPP-007 have Indian GSTINs (27...), SE-1168 a .in email.
--   Only a supplier whose country is still empty is changed. India is found by name. Safe to re-run.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;

IF DB_NAME() <> N'SYNERPINDIA'
    THROW 50900, 'Wrong database: this script is for SYNERPINDIA only.', 1;

DECLARE @India INT = (SELECT CountryId FROM proj.TBL_COUNTRY WHERE CountryName = N'India');
IF @India IS NULL THROW 50901, 'Country India not found. Nothing changed.', 1;

BEGIN TRAN;
    UPDATE proj.TBL_SUPPLIER
    SET    CountryId = @India, ModifiedBy = N'DATA_FIX_20261115', ModifiedDate = GETDATE()
    WHERE  CountryId IS NULL
      AND  SupplierCode IN (N'CC-76', N'KM-1160', N'NG-39', N'PF-1182', N'SE-1168', N'ST-141', N'SUPP-007');
    DECLARE @n INT = @@ROWCOUNT;
COMMIT;

SELECT CONCAT('DONE - India set for ', @n, ' supplier(s)') AS result;
SELECT s.SupplierCode, s.SupplierName, c.CountryName
FROM   proj.TBL_SUPPLIER s LEFT JOIN proj.TBL_COUNTRY c ON c.CountryId = s.CountryId
WHERE  s.SupplierCode IN (N'CC-76', N'KM-1160', N'NG-39', N'PF-1182', N'SE-1168', N'ST-141', N'SUPP-007')
ORDER BY s.SupplierCode;
SELECT COUNT(*) AS active_suppliers_still_without_country FROM proj.TBL_SUPPLIER WHERE IsActive = 1 AND CountryId IS NULL;
