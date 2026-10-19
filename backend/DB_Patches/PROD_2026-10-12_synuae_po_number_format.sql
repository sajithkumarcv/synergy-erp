/* SYNERPUAE - PO numbers become  SIPS-UAE/PO/2026-1000, SIPS-UAE/PO/2026-1001, ...  (restarts at 1000 each year).
   Run on SYNERPUAE ONLY, and only AFTER 2026-10-12_docnumber_year_token.sql (the guard below stops it otherwise).
   Changes ONE row: the 'PO' row of PROJ.TBL_DOCUMENT_SERIES. PR / GRN / other series are untouched,
   and POs already created keep their old numbers (PO-26-xxxx). */
SET XACT_ABORT ON;

IF OBJECT_DEFINITION(OBJECT_ID(N'PROJ.sp_GetNextDocNumber')) NOT LIKE N'%{YYYY}%'
    THROW 50001, 'sp_GetNextDocNumber is not patched yet - run 2026-10-12_docnumber_year_token.sql first. Nothing changed.', 1;

UPDATE PROJ.TBL_DOCUMENT_SERIES
SET Prefix         = N'SIPS-UAE/PO/{YYYY}',
    Separator      = N'-',
    IncludeYear    = 0,
    YearDigits     = 4,
    ResetYearly    = 1,
    PadLength      = 4,
    StartingSeries = 1000,
    CurrentSeries  = 999,
    CurrentYear    = NULL
WHERE DocTypeId = N'PO';

-- Must show 1 row, and the preview must read SIPS-UAE/PO/2026-1000
SELECT DocTypeId, Prefix, Separator, IncludeYear, YearDigits, PadLength, StartingSeries, CurrentSeries FROM PROJ.TBL_DOCUMENT_SERIES WHERE DocTypeId = N'PO';
EXEC PROJ.sp_PreviewDocNumber N'PO';
