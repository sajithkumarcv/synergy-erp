-- License stamp: one row naming the client this database belongs to.
-- Seeded UNCLAIMED; the first valid server-bound license claims it. Safe to re-run.
-- Schema: PROJ. Does not touch any existing table.
IF OBJECT_ID(N'PROJ.TBL_LICENSE_STAMP') IS NULL
BEGIN
    CREATE TABLE PROJ.TBL_LICENSE_STAMP
    (
        StampId    INT           NOT NULL CONSTRAINT PK_TBL_LICENSE_STAMP PRIMARY KEY,
        ClientName NVARCHAR(200) NULL,          -- NULL = unclaimed
        CheckValue VARCHAR(64)   NOT NULL,
        StampedAt  DATETIME2     NULL
    );
END
GO
IF NOT EXISTS (SELECT 1 FROM PROJ.TBL_LICENSE_STAMP)
    INSERT INTO PROJ.TBL_LICENSE_STAMP (StampId, ClientName, CheckValue)
    VALUES (1, NULL, CONVERT(VARCHAR(64), HASHBYTES('SHA2_256', 'erpweb-stamp-7f3c91a2d5e84b06|'), 2));
GO
SELECT StampId, ClientName, CheckValue, StampedAt FROM PROJ.TBL_LICENSE_STAMP;
