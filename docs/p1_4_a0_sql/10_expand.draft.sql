-- P1.4 A0 REVIEW ONLY. NOT EXECUTED. Each @statement block is one statement.
-- Unresolved charset/collation tokens MUST be rendered from approved metadata.
-- No USE, CREATE DATABASE, GRANT or IF NOT EXISTS masking drift.
-- @statement REVIEW_ONLY_10
A0_REVIEW_ONLY_DO_NOT_EXECUTE;

-- @statement EX_CONTROL
CREATE TABLE business_schema_control (
 singleton_id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 mode VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 required_writer_epoch INT UNSIGNED NOT NULL,
 schema_version INT UNSIGNED NOT NULL,
 reader_basis VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 version BIGINT UNSIGNED NOT NULL,
 changed_at_utc DATETIME(6) NOT NULL,
 CONSTRAINT p14_control_single CHECK(singleton_id=1),
 CONSTRAINT p14_control_mode CHECK(mode IN ('EXPAND','MAINTENANCE','ENFORCED')),
 CONSTRAINT p14_control_reader CHECK(reader_basis IN ('RECORDED_TIME','BUSINESS_DATE')),
 CONSTRAINT p14_control_versions CHECK(required_writer_epoch>0 AND schema_version>0 AND version>0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- @statement EX_POLICY
CREATE TABLE business_posting_policies (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 organization_id INT UNSIGNED NOT NULL,
 branch_id INT UNSIGNED NOT NULL,
 policy_version BIGINT UNSIGNED NOT NULL,
 business_timezone VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 date_algorithm_version VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 live_date_mode VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 archive_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 combined_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 effective_from_utc DATETIME(6) NOT NULL,
 created_by INT UNSIGNED NOT NULL,
 created_at_utc DATETIME(6) NOT NULL,
 UNIQUE KEY p14_policy_tenant(organization_id,id),
 UNIQUE KEY p14_policy_branch(organization_id,branch_id,id),
 UNIQUE KEY p14_policy_version(organization_id,branch_id,policy_version),
 CONSTRAINT p14_policy_branch_fk FOREIGN KEY(organization_id,branch_id)
  REFERENCES branches(organization_id,id),
 CONSTRAINT p14_policy_actor_fk FOREIGN KEY(organization_id,created_by)
  REFERENCES users(organization_id,id),
 CONSTRAINT p14_policy_mode CHECK(live_date_mode='TODAY_ONLY'),
 CONSTRAINT p14_policy_zone CHECK(business_timezone='Asia/Ho_Chi_Minh'),
 CONSTRAINT p14_policy_algorithm CHECK(date_algorithm_version='business-date-v2'),
 CONSTRAINT p14_policy_rev CHECK(policy_version>0),
 CONSTRAINT p14_policy_flags CHECK(archive_enabled IN (0,1) AND combined_enabled IN (0,1)
  AND (combined_enabled=0 OR archive_enabled=1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- @statement EX_GUARD
CREATE TABLE branch_posting_guards (
 organization_id INT UNSIGNED NOT NULL,
 branch_id INT UNSIGNED NOT NULL,
 active_policy_id BIGINT UNSIGNED NULL,
 live_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
 archive_revision BIGINT UNSIGNED NOT NULL DEFAULT 0,
 PRIMARY KEY(organization_id,branch_id),
 CONSTRAINT p14_guard_branch_fk FOREIGN KEY(organization_id,branch_id)
  REFERENCES branches(organization_id,id),
 CONSTRAINT p14_guard_policy_fk FOREIGN KEY(organization_id,branch_id,active_policy_id)
  REFERENCES business_posting_policies(organization_id,branch_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- @statement EX_PERIOD
CREATE TABLE business_periods (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 organization_id INT UNSIGNED NOT NULL,
 branch_id INT UNSIGNED NOT NULL,
 date_start DATE NOT NULL,
 date_end_exclusive DATE NOT NULL,
 live_state VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 archive_state VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 version BIGINT UNSIGNED NOT NULL,
 policy_id BIGINT UNSIGNED NOT NULL,
 changed_by INT UNSIGNED NOT NULL,
 changed_at_utc DATETIME(6) NOT NULL,
 UNIQUE KEY p14_period_tenant(organization_id,id),
 UNIQUE KEY p14_period_branch(organization_id,branch_id,id),
 UNIQUE KEY p14_period_start(organization_id,branch_id,date_start),
 CONSTRAINT p14_period_branch_fk FOREIGN KEY(organization_id,branch_id)
  REFERENCES branches(organization_id,id),
 CONSTRAINT p14_period_policy_fk FOREIGN KEY(organization_id,branch_id,policy_id)
  REFERENCES business_posting_policies(organization_id,branch_id,id),
 CONSTRAINT p14_period_actor_fk FOREIGN KEY(organization_id,changed_by)
  REFERENCES users(organization_id,id),
 CONSTRAINT p14_period_states CHECK(live_state IN ('OPEN','CLOSED')
  AND archive_state IN ('OPEN','CLOSED')),
 CONSTRAINT p14_period_version CHECK(version>0),
 CONSTRAINT p14_period_month CHECK(
  CASE WHEN date_start<'1000-01-01' OR date_start>='9999-12-01' THEN FALSE
  ELSE DAYOFMONTH(date_start)=1
   AND date_end_exclusive=DATE_ADD(date_start,INTERVAL 1 MONTH) END)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- @statement EX_HEADER
ALTER TABLE stock_documents
 ADD COLUMN business_date DATE NULL,
 ADD COLUMN business_timezone VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD COLUMN date_policy_version VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD COLUMN business_date_origin VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NULL,
 ADD COLUMN writer_epoch INT UNSIGNED NULL,
 ADD COLUMN posting_revision BIGINT UNSIGNED NULL,
 ADD COLUMN policy_id BIGINT UNSIGNED NULL,
 ADD COLUMN period_id BIGINT UNSIGNED NULL,
 ADD COLUMN accepted_at_utc DATETIME(6) NULL,
 ADD UNIQUE KEY p14_document_branch(organization_id,branch_id,id),
 ADD UNIQUE KEY p14_document_identity(organization_id,branch_id,type,request_key,id),
 ADD UNIQUE KEY p14_document_revision(organization_id,branch_id,posting_revision),
 ADD CONSTRAINT p14_doc_policy_fk FOREIGN KEY(organization_id,branch_id,policy_id)
  REFERENCES business_posting_policies(organization_id,branch_id,id),
 ADD CONSTRAINT p14_doc_period_fk FOREIGN KEY(organization_id,branch_id,period_id)
  REFERENCES business_periods(organization_id,branch_id,id);

-- @statement EX_RECEIPT
CREATE TABLE document_request_receipts (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 organization_id INT UNSIGNED NOT NULL,
 branch_id INT UNSIGNED NOT NULL,
 document_type ENUM('RECEIPT','SALE') CHARACTER SET {{TYPE_CHARSET}} COLLATE {{TYPE_COLLATION}} NOT NULL,
 request_key VARCHAR(80) CHARACTER SET {{KEY_CHARSET}} COLLATE {{KEY_COLLATION}} NOT NULL,
 request_schema_version VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 envelope_hash BINARY(32) NOT NULL,
 resolved_hash BINARY(32) NOT NULL,
 business_date DATE NOT NULL,
 policy_id BIGINT UNSIGNED NOT NULL,
 period_id BIGINT UNSIGNED NOT NULL,
 accepted_at_utc DATETIME(6) NOT NULL,
 document_id BIGINT UNSIGNED NOT NULL,
 response_version VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 response_json JSON NOT NULL,
 UNIQUE KEY p14_receipt_tenant(organization_id,id),
 UNIQUE KEY p14_receipt_request(organization_id,document_type,request_key),
 UNIQUE KEY p14_receipt_doc(organization_id,branch_id,document_id),
 UNIQUE KEY p14_receipt_finalize(organization_id,branch_id,document_id,id),
 CONSTRAINT p14_receipt_doc_fk FOREIGN KEY
  (organization_id,branch_id,document_type,request_key,document_id)
  REFERENCES stock_documents(organization_id,branch_id,type,request_key,id),
 CONSTRAINT p14_receipt_policy_fk FOREIGN KEY(organization_id,branch_id,policy_id)
  REFERENCES business_posting_policies(organization_id,branch_id,id),
 CONSTRAINT p14_receipt_period_fk FOREIGN KEY(organization_id,branch_id,period_id)
  REFERENCES business_periods(organization_id,branch_id,id),
 CONSTRAINT p14_receipt_date CHECK(business_date>='1000-01-01')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- @statement EX_FINALIZATION
CREATE TABLE document_finalizations (
 organization_id INT UNSIGNED NOT NULL,
 branch_id INT UNSIGNED NOT NULL,
 document_id BIGINT UNSIGNED NOT NULL,
 kind VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 receipt_id BIGINT UNSIGNED NULL,
 migration_manifest_sha256 BINARY(32) NULL,
 finalized_at_utc DATETIME(6) NOT NULL,
 PRIMARY KEY(organization_id,document_id),
 CONSTRAINT p14_final_doc_fk FOREIGN KEY(organization_id,branch_id,document_id)
  REFERENCES stock_documents(organization_id,branch_id,id),
 CONSTRAINT p14_final_receipt_fk FOREIGN KEY(organization_id,branch_id,document_id,receipt_id)
  REFERENCES document_request_receipts(organization_id,branch_id,document_id,id),
 CONSTRAINT p14_final_kind CHECK(
  (kind='NATIVE' AND receipt_id IS NOT NULL AND migration_manifest_sha256 IS NULL)
  OR (kind='LEGACY' AND receipt_id IS NULL AND migration_manifest_sha256 IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- @statement EX_AUDIT
CREATE TABLE business_audit_events (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 organization_id INT UNSIGNED NOT NULL,
 branch_id INT UNSIGNED NULL,
 actor_kind VARCHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 actor_user_id INT UNSIGNED NULL,
 actor_service_ref VARCHAR(120) CHARACTER SET ascii COLLATE ascii_bin NULL,
 action VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 target_kind VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 target_ref VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 correlation_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 occurred_at_utc DATETIME(6) NOT NULL,
 policy_id BIGINT UNSIGNED NULL,
 data_revision BIGINT UNSIGNED NULL,
 reason VARCHAR(1000) NULL,
 metadata JSON NOT NULL,
 UNIQUE KEY p14_audit_tenant(organization_id,id),
 KEY p14_audit_scope(organization_id,branch_id,id),
 CONSTRAINT p14_audit_org_fk FOREIGN KEY(organization_id) REFERENCES organizations(id),
 CONSTRAINT p14_audit_branch_fk FOREIGN KEY(organization_id,branch_id)
  REFERENCES branches(organization_id,id),
 CONSTRAINT p14_audit_user_fk FOREIGN KEY(organization_id,actor_user_id)
  REFERENCES users(organization_id,id),
 CONSTRAINT p14_audit_policy_fk FOREIGN KEY(organization_id,branch_id,policy_id)
  REFERENCES business_posting_policies(organization_id,branch_id,id),
 CONSTRAINT p14_audit_actor CHECK(
  (actor_kind='USER' AND actor_user_id IS NOT NULL AND actor_service_ref IS NULL)
  OR (actor_kind='SERVICE' AND actor_user_id IS NULL AND actor_service_ref IS NOT NULL)),
 CONSTRAINT p14_audit_policy_scope CHECK(policy_id IS NULL OR branch_id IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
-- No data/bootstrap inserts in expand. No archive/AI schema created.
