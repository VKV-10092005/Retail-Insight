-- P1.4 A0 REVIEW ONLY. NOT EXECUTED.
-- Preconditions: maintenance+drain/fence, final tail reconciled, all markers,
-- no movement duplicate/mismatch, bootstrap manifest verified.
-- @statement REVIEW_ONLY_30
A0_REVIEW_ONLY_DO_NOT_EXECUTE;

-- @statement CT_HEADER
ALTER TABLE stock_documents
 MODIFY COLUMN business_date DATE NOT NULL,
 MODIFY COLUMN business_timezone VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 MODIFY COLUMN date_policy_version VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 MODIFY COLUMN business_date_origin VARCHAR(40) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
 MODIFY COLUMN writer_epoch INT UNSIGNED NOT NULL,
 ADD CONSTRAINT p14_doc_date CHECK(business_date>='1000-01-01'),
 ADD CONSTRAINT p14_doc_zone CHECK(business_timezone='Asia/Ho_Chi_Minh'),
 ADD CONSTRAINT p14_doc_lineage CHECK(
  (business_date_origin='DERIVED_FROM_RECORDED_AT' AND writer_epoch=0
   AND date_policy_version='recorded-time-iana-v1'
   AND posting_revision IS NULL AND policy_id IS NULL
   AND period_id IS NULL AND accepted_at_utc IS NULL)
  OR
  (business_date_origin='SERVER_TODAY' AND writer_epoch>0
   AND date_policy_version='business-date-v2'
   AND posting_revision IS NOT NULL AND posting_revision>0
   AND policy_id IS NOT NULL AND period_id IS NOT NULL AND accepted_at_utc IS NOT NULL));

-- @statement CT_MOVEMENT_IDENTITY
ALTER TABLE inventory_movements
 ADD UNIQUE KEY p14_movement_document_product(organization_id,document_id,product_id),
 ADD CONSTRAINT p14_movement_doc_branch_fk
  FOREIGN KEY(organization_id,branch_id,document_id)
  REFERENCES stock_documents(organization_id,branch_id,id),
 ADD CONSTRAINT p14_movement_nonzero CHECK(quantity_delta<>0);

-- @statement CT_DATE_INDEX
-- One branch-first candidate only, subject to native EXPLAIN/write-cost review.
-- Keep document_period(created_at); do not change legacy list ORDER BY id DESC.
CREATE INDEX p14_document_business_date
 ON stock_documents(organization_id,branch_id,business_date,id);

-- @statement CT_SCHEMA_VERSION
-- Parameters: UTC time, expected control version. Must affect exactly one row.
-- Remains MAINTENANCE; reader not switched until cutover.
UPDATE business_schema_control
SET schema_version=2,version=version+1,changed_at_utc=?
WHERE singleton_id=1 AND mode='MAINTENANCE' AND version=?;
-- No defaults for native business_date/epoch; legacy NULL lineage is intentional.
-- Do not MODIFY original created_at / request_key / payload_hash / money fields.
