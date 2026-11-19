-- P1.4 A0 REVIEW ONLY. NOT EXECUTED. Never place in backend/src/db/migrations.
-- @statement REVIEW_ONLY_00
A0_REVIEW_ONLY_DO_NOT_EXECUTE;

-- @statement PF_IDENTITY
SELECT DATABASE() AS schema_name, @@server_uuid AS server_uuid,
       @@port AS server_port, VERSION() AS mysql_version,
       CURRENT_USER() AS authenticated_account,
       @@session.time_zone AS session_timezone, @@session.sql_mode AS sql_mode,
       @@session.transaction_isolation AS transaction_isolation;

-- @statement PF_TABLES
SELECT table_name, engine, table_collation
FROM information_schema.tables
WHERE table_schema = DATABASE()
ORDER BY table_name;

-- @statement PF_COLUMNS
SELECT table_name, ordinal_position, column_name, column_type, is_nullable,
       column_default, character_set_name, collation_name, extra
FROM information_schema.columns
WHERE table_schema = DATABASE()
ORDER BY table_name, ordinal_position;

-- @statement PF_INDEXES
SELECT table_name, index_name, non_unique, seq_in_index, column_name, sub_part
FROM information_schema.statistics
WHERE table_schema = DATABASE()
ORDER BY table_name, index_name, seq_in_index;

-- @statement PF_CONSTRAINTS
SELECT tc.table_name, tc.constraint_name, tc.constraint_type,
       kcu.column_name, kcu.ordinal_position,
       kcu.referenced_table_name, kcu.referenced_column_name
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
 ON kcu.constraint_schema=tc.constraint_schema
 AND kcu.table_name=tc.table_name AND kcu.constraint_name=tc.constraint_name
WHERE tc.constraint_schema=DATABASE()
ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position;

-- @statement PF_CHECKS
SELECT tc.table_name, tc.constraint_name, tc.enforced, cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
 ON cc.constraint_schema=tc.constraint_schema AND cc.constraint_name=tc.constraint_name
WHERE tc.constraint_schema=DATABASE() AND tc.constraint_type='CHECK';

-- @statement PF_TRIGGERS
SELECT trigger_name, event_manipulation, event_object_table, action_timing,
       action_statement, sql_mode, character_set_client, collation_connection
FROM information_schema.triggers
WHERE trigger_schema=DATABASE()
ORDER BY event_object_table, action_timing, trigger_name;

-- @statement PF_NULL_DOCUMENT_TIME
SELECT COUNT(*) AS invalid_rows FROM stock_documents WHERE created_at IS NULL;

-- @statement PF_MOVEMENT_DUPLICATES
SELECT organization_id, document_id, product_id, COUNT(*) AS rows_per_item
FROM inventory_movements
GROUP BY organization_id, document_id, product_id HAVING COUNT(*)<>1;

-- @statement PF_MOVEMENT_BRANCH
SELECT COUNT(*) AS invalid_rows
FROM inventory_movements m
LEFT JOIN stock_documents d
 ON d.organization_id=m.organization_id AND d.id=m.document_id
WHERE d.id IS NULL OR d.branch_id<>m.branch_id;

-- @statement PF_DOCUMENT_TOTAL
SELECT COUNT(*) AS invalid_rows
FROM stock_documents d
LEFT JOIN (
 SELECT organization_id,document_id,COUNT(*) AS n,
        SUM(quantity*unit_price) AS total
 FROM stock_document_items GROUP BY organization_id,document_id
) x ON x.organization_id=d.organization_id AND x.document_id=d.id
WHERE COALESCE(x.n,0)=0 OR NOT(d.total <=> x.total);

-- @statement PF_ITEM_MOVEMENT
SELECT COUNT(*) AS invalid_rows
FROM stock_document_items x
JOIN stock_documents d ON d.organization_id=x.organization_id AND d.id=x.document_id
LEFT JOIN inventory_movements m
 ON m.organization_id=x.organization_id AND m.document_id=x.document_id
 AND m.product_id=x.product_id
WHERE m.id IS NULL OR m.quantity_delta<>
 CASE WHEN d.type='SALE' THEN -x.quantity ELSE x.quantity END;

-- @statement PF_EXTRA_MOVEMENT
SELECT COUNT(*) AS invalid_rows
FROM inventory_movements m
LEFT JOIN stock_document_items x
 ON x.organization_id=m.organization_id AND x.document_id=m.document_id
 AND x.product_id=m.product_id
WHERE x.id IS NULL;

-- @statement PF_BALANCE_RECONCILE
SELECT COUNT(*) AS invalid_rows
FROM (
 SELECT organization_id,branch_id,product_id,SUM(quantity_delta) AS quantity
 FROM inventory_movements GROUP BY organization_id,branch_id,product_id
) m
LEFT JOIN inventory_balances b ON b.organization_id=m.organization_id
 AND b.branch_id=m.branch_id AND b.product_id=m.product_id
WHERE b.product_id IS NULL OR b.quantity<>m.quantity;

-- @statement PF_BALANCE_WITHOUT_MOVEMENT
SELECT COUNT(*) AS invalid_rows
FROM inventory_balances b
LEFT JOIN inventory_movements m ON m.organization_id=b.organization_id
 AND m.branch_id=b.branch_id AND m.product_id=b.product_id
WHERE m.id IS NULL AND b.quantity<>0;
-- Also collect SHOW CREATE TABLE, SHOW GRANTS/active roles, schema_migrations
-- and server/TLS identity using the future runner's redacted metadata adapter.
-- Invariant violations are NO-GO; no repair DML is included.
