-- PROD_2026-11-15b: fill the supplier's Country from its own address (user, 2026-11-15). SYNERPINDIA and SYNERPUAE.
--   Only suppliers with NO country are changed. The country comes from the supplier's default active address that has a
--   country, else its first active address that has one. Suppliers with no address keep no country (listed at the end,
--   to be completed on the supplier screen).
--   Checked on the 13 Nov restores: India 175 without country, 168 fillable (166 India, 2 UAE), 7 with no address;
--   UAE 13 without country, all fillable (12 UAE, 1 India). No supplier's addresses disagree on the country.
--   Safe to re-run: a second run finds nothing left to fill.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
SET XACT_ABORT ON;
SET NOCOUNT ON;

BEGIN TRAN;
    SELECT 'before' AS step, COUNT(*) AS active_suppliers, SUM(CASE WHEN CountryId IS NULL THEN 1 ELSE 0 END) AS without_country
    FROM proj.TBL_SUPPLIER WHERE IsActive = 1;

    UPDATE s
    SET    s.CountryId    = x.CountryId,
           s.ModifiedBy   = N'DATA_FIX_20261115',
           s.ModifiedDate = GETDATE()
    FROM   proj.TBL_SUPPLIER s
    CROSS APPLY (SELECT TOP 1 a.CountryId
                 FROM   proj.TBL_SUPPLIER_ADDRESS a
                 WHERE  a.SupplierId = s.SupplierId AND a.IsActive = 1 AND a.CountryId IS NOT NULL
                 ORDER BY a.IsDefault DESC, a.SupplierAddressId) x
    WHERE  s.CountryId IS NULL;

    DECLARE @n INT = @@ROWCOUNT;

    SELECT 'after' AS step, COUNT(*) AS active_suppliers, SUM(CASE WHEN CountryId IS NULL THEN 1 ELSE 0 END) AS without_country,
           @n AS filled_now
    FROM proj.TBL_SUPPLIER WHERE IsActive = 1;
COMMIT;

SELECT CONCAT('DONE - country filled for ', @n, ' supplier(s)') AS result;

SELECT 'still without country (no address) - complete on the supplier screen' AS note, s.SupplierCode, s.SupplierName
FROM   proj.TBL_SUPPLIER s
WHERE  s.IsActive = 1 AND s.CountryId IS NULL
ORDER BY s.SupplierCode;
