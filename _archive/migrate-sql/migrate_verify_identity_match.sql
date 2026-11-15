/* Verifies that identity/PK column VALUES match exactly between
   SYN_PMS_IND (source) and SYNERP (target) for each migrated table -
   not just row counts. Any row returned below = a mismatch:
   'missing_in_target' = an ID exists in source but not target
   'extra_in_target'   = an ID exists in target but not source
   Run this in a session connected to SYNERP (uses 3-part naming for source). */

;WITH diff AS (
    SELECT 'TBL_ROLES' AS table_name, 'missing_in_target' AS issue, RoleId AS id
    FROM SYN_PMS_IND.proj.TBL_ROLES
    EXCEPT
    SELECT 'TBL_ROLES', 'missing_in_target', RoleId FROM SYNERP.proj.TBL_ROLES

    UNION ALL
    SELECT 'TBL_ROLES', 'extra_in_target', RoleId
    FROM SYNERP.proj.TBL_ROLES
    EXCEPT
    SELECT 'TBL_ROLES', 'extra_in_target', RoleId FROM SYN_PMS_IND.proj.TBL_ROLES

    UNION ALL
    SELECT 'TBL_ROLE_SECRET', 'missing_in_target', RoleId FROM SYN_PMS_IND.proj.TBL_ROLE_SECRET
    EXCEPT
    SELECT 'TBL_ROLE_SECRET', 'missing_in_target', RoleId FROM SYNERP.proj.TBL_ROLE_SECRET

    UNION ALL
    SELECT 'TBL_ROLE_SECRET', 'extra_in_target', RoleId FROM SYNERP.proj.TBL_ROLE_SECRET
    EXCEPT
    SELECT 'TBL_ROLE_SECRET', 'extra_in_target', RoleId FROM SYN_PMS_IND.proj.TBL_ROLE_SECRET

    UNION ALL
    SELECT 'TBL_USERS', 'missing_in_target', UserId FROM SYN_PMS_IND.proj.TBL_USERS
    EXCEPT
    SELECT 'TBL_USERS', 'missing_in_target', UserId FROM SYNERP.proj.TBL_USERS

    UNION ALL
    SELECT 'TBL_USERS', 'extra_in_target', UserId FROM SYNERP.proj.TBL_USERS
    EXCEPT
    SELECT 'TBL_USERS', 'extra_in_target', UserId FROM SYN_PMS_IND.proj.TBL_USERS

    UNION ALL
    SELECT 'TBL_USER_SECRET', 'missing_in_target', UserSecretId FROM SYN_PMS_IND.proj.TBL_USER_SECRET
    EXCEPT
    SELECT 'TBL_USER_SECRET', 'missing_in_target', UserSecretId FROM SYNERP.proj.TBL_USER_SECRET

    UNION ALL
    SELECT 'TBL_USER_SECRET', 'extra_in_target', UserSecretId FROM SYNERP.proj.TBL_USER_SECRET
    EXCEPT
    SELECT 'TBL_USER_SECRET', 'extra_in_target', UserSecretId FROM SYN_PMS_IND.proj.TBL_USER_SECRET

    UNION ALL
    SELECT 'TBL_USER_ROLES', 'missing_in_target', UserRoleId FROM SYN_PMS_IND.proj.TBL_USER_ROLES
    EXCEPT
    SELECT 'TBL_USER_ROLES', 'missing_in_target', UserRoleId FROM SYNERP.proj.TBL_USER_ROLES

    UNION ALL
    SELECT 'TBL_USER_ROLES', 'extra_in_target', UserRoleId FROM SYNERP.proj.TBL_USER_ROLES
    EXCEPT
    SELECT 'TBL_USER_ROLES', 'extra_in_target', UserRoleId FROM SYN_PMS_IND.proj.TBL_USER_ROLES

    UNION ALL
    SELECT 'TBL_USER_GROUP_DETAIL', 'missing_in_target', DetailId FROM SYN_PMS_IND.proj.TBL_USER_GROUP_DETAIL
    EXCEPT
    SELECT 'TBL_USER_GROUP_DETAIL', 'missing_in_target', DetailId FROM SYNERP.proj.TBL_USER_GROUP_DETAIL

    UNION ALL
    SELECT 'TBL_USER_GROUP_DETAIL', 'extra_in_target', DetailId FROM SYNERP.proj.TBL_USER_GROUP_DETAIL
    EXCEPT
    SELECT 'TBL_USER_GROUP_DETAIL', 'extra_in_target', DetailId FROM SYN_PMS_IND.proj.TBL_USER_GROUP_DETAIL

    UNION ALL
    SELECT 'TBL_ROLE_MENU', 'missing_in_target', RoleMenuId FROM SYN_PMS_IND.proj.TBL_ROLE_MENU
    EXCEPT
    SELECT 'TBL_ROLE_MENU', 'missing_in_target', RoleMenuId FROM SYNERP.proj.TBL_ROLE_MENU

    UNION ALL
    SELECT 'TBL_ROLE_MENU', 'extra_in_target', RoleMenuId FROM SYNERP.proj.TBL_ROLE_MENU
    EXCEPT
    SELECT 'TBL_ROLE_MENU', 'extra_in_target', RoleMenuId FROM SYN_PMS_IND.proj.TBL_ROLE_MENU

    UNION ALL
    SELECT 'TBL_ENGINEER', 'missing_in_target', EngineerId FROM SYN_PMS_IND.proj.TBL_ENGINEER
    EXCEPT
    SELECT 'TBL_ENGINEER', 'missing_in_target', EngineerId FROM SYNERP.proj.TBL_ENGINEER

    UNION ALL
    SELECT 'TBL_ENGINEER', 'extra_in_target', EngineerId FROM SYNERP.proj.TBL_ENGINEER
    EXCEPT
    SELECT 'TBL_ENGINEER', 'extra_in_target', EngineerId FROM SYN_PMS_IND.proj.TBL_ENGINEER

    UNION ALL
    SELECT 'TBL_ITEM_CATEGORY', 'missing_in_target', CategoryId FROM SYN_PMS_IND.proj.TBL_ITEM_CATEGORY
    EXCEPT
    SELECT 'TBL_ITEM_CATEGORY', 'missing_in_target', CategoryId FROM SYNERP.proj.TBL_ITEM_CATEGORY

    UNION ALL
    SELECT 'TBL_ITEM_CATEGORY', 'extra_in_target', CategoryId FROM SYNERP.proj.TBL_ITEM_CATEGORY
    EXCEPT
    SELECT 'TBL_ITEM_CATEGORY', 'extra_in_target', CategoryId FROM SYN_PMS_IND.proj.TBL_ITEM_CATEGORY

    UNION ALL
    SELECT 'TBL_ITEM_TYPE', 'missing_in_target', ItemTypeId FROM SYN_PMS_IND.proj.TBL_ITEM_TYPE
    EXCEPT
    SELECT 'TBL_ITEM_TYPE', 'missing_in_target', ItemTypeId FROM SYNERP.proj.TBL_ITEM_TYPE

    UNION ALL
    SELECT 'TBL_ITEM_TYPE', 'extra_in_target', ItemTypeId FROM SYNERP.proj.TBL_ITEM_TYPE
    EXCEPT
    SELECT 'TBL_ITEM_TYPE', 'extra_in_target', ItemTypeId FROM SYN_PMS_IND.proj.TBL_ITEM_TYPE

    UNION ALL
    SELECT 'TBL_ITEM_UOM', 'missing_in_target', UomId FROM SYN_PMS_IND.proj.TBL_ITEM_UOM
    EXCEPT
    SELECT 'TBL_ITEM_UOM', 'missing_in_target', UomId FROM SYNERP.proj.TBL_ITEM_UOM

    UNION ALL
    SELECT 'TBL_ITEM_UOM', 'extra_in_target', UomId FROM SYNERP.proj.TBL_ITEM_UOM
    EXCEPT
    SELECT 'TBL_ITEM_UOM', 'extra_in_target', UomId FROM SYN_PMS_IND.proj.TBL_ITEM_UOM

    UNION ALL
    SELECT 'TBL_ITEM', 'missing_in_target', ItemId FROM SYN_PMS_IND.proj.TBL_ITEM
    EXCEPT
    SELECT 'TBL_ITEM', 'missing_in_target', ItemId FROM SYNERP.proj.TBL_ITEM

    UNION ALL
    SELECT 'TBL_ITEM', 'extra_in_target', ItemId FROM SYNERP.proj.TBL_ITEM
    EXCEPT
    SELECT 'TBL_ITEM', 'extra_in_target', ItemId FROM SYN_PMS_IND.proj.TBL_ITEM

    UNION ALL
    SELECT 'TBL_CURRENCY', 'missing_in_target', CurrencyId FROM SYN_PMS_IND.proj.TBL_CURRENCY
    EXCEPT
    SELECT 'TBL_CURRENCY', 'missing_in_target', CurrencyId FROM SYNERP.proj.TBL_CURRENCY

    UNION ALL
    SELECT 'TBL_CURRENCY', 'extra_in_target', CurrencyId FROM SYNERP.proj.TBL_CURRENCY
    EXCEPT
    SELECT 'TBL_CURRENCY', 'extra_in_target', CurrencyId FROM SYN_PMS_IND.proj.TBL_CURRENCY

    UNION ALL
    SELECT 'TBL_VLIST', 'missing_in_target', VListID FROM SYN_PMS_IND.proj.TBL_VLIST
    EXCEPT
    SELECT 'TBL_VLIST', 'missing_in_target', VListID FROM SYNERP.proj.TBL_VLIST

    UNION ALL
    SELECT 'TBL_VLIST', 'extra_in_target', VListID FROM SYNERP.proj.TBL_VLIST
    EXCEPT
    SELECT 'TBL_VLIST', 'extra_in_target', VListID FROM SYN_PMS_IND.proj.TBL_VLIST

    UNION ALL
    SELECT 'TBL_APP_LOG', 'missing_in_target', LogId FROM SYN_PMS_IND.proj.TBL_APP_LOG
    EXCEPT
    SELECT 'TBL_APP_LOG', 'missing_in_target', LogId FROM SYNERP.proj.TBL_APP_LOG

    UNION ALL
    SELECT 'TBL_APP_LOG', 'extra_in_target', LogId FROM SYNERP.proj.TBL_APP_LOG
    EXCEPT
    SELECT 'TBL_APP_LOG', 'extra_in_target', LogId FROM SYN_PMS_IND.proj.TBL_APP_LOG
)
SELECT * FROM diff ORDER BY table_name, issue, id;

-- Empty result set = every ID in source has an identical-ID match in target, for all 15 tables.
