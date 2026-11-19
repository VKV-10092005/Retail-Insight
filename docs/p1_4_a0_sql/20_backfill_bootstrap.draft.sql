-- P1.4 A0 REVIEW ONLY. PREPARED TEMPLATES, NOT EXECUTED.
-- Bind every ? using approved manifest; do not paste real parameters here.
-- @statement REVIEW_ONLY_20
A0_REVIEW_ONLY_DO_NOT_EXECUTE;

-- @statement BF_CONTROL_SEED
-- Parameters: UTC time. Exactly one seed, schema1 EXPAND writer epoch1.
INSERT INTO business_schema_control
 (singleton_id,mode,required_writer_epoch,schema_version,reader_basis,version,changed_at_utc)
VALUES(1,'EXPAND',1,1,'RECORDED_TIME',1,?);

-- @statement BF_DOCUMENT_PAGE
-- Parameters: last_pk,high_watermark,chunk_limit (positive bounded integer).
SELECT id,organization_id,branch_id,created_at,payload_hash,total,
 business_date,business_timezone,date_policy_version,business_date_origin,
 writer_epoch,posting_revision,policy_id,period_id,accepted_at_utc
FROM stock_documents WHERE id>? AND id<=? ORDER BY id LIMIT ?;

-- @statement BF_LOCK_DOCUMENT
-- Parameters: org,doc_id. Chunk transaction locks each target before update.
SELECT id,created_at,payload_hash,total,business_date,business_timezone,
 date_policy_version,business_date_origin,writer_epoch,posting_revision,
 policy_id,period_id,accepted_at_utc
FROM stock_documents WHERE organization_id=? AND id=? FOR UPDATE;

-- @statement BF_DERIVE_LEGACY
-- Parameters: DATE computed by pinned Temporal IANA from original UTC,
-- org,doc_id,expected original created_at.
-- UTC session mandatory; no SET created_at / total / payload_hash.
UPDATE stock_documents
SET business_date=?,business_timezone='Asia/Ho_Chi_Minh',
 date_policy_version='recorded-time-iana-v1',
 business_date_origin='DERIVED_FROM_RECORDED_AT',writer_epoch=0
WHERE organization_id=? AND id=? AND created_at=?
 AND business_date IS NULL AND business_timezone IS NULL
 AND date_policy_version IS NULL AND business_date_origin IS NULL
 AND writer_epoch IS NULL AND posting_revision IS NULL
 AND policy_id IS NULL AND period_id IS NULL AND accepted_at_utc IS NULL;

-- @statement BF_POLICY_SEED
-- Parameters: org,branch,version,effective_from_utc,real authorized actor,created_at_utc.
-- No hidden user and no policy fabricated for legacy documents.
INSERT INTO business_posting_policies
 (organization_id,branch_id,policy_version,business_timezone,date_algorithm_version,
  live_date_mode,archive_enabled,combined_enabled,effective_from_utc,created_by,created_at_utc)
VALUES(?,?,?,'Asia/Ho_Chi_Minh','business-date-v2','TODAY_ONLY',FALSE,FALSE,?,?,?);

-- @statement BF_GUARD_SEED
-- Parameters: org,branch,approved policy_id (same org/branch).
INSERT INTO branch_posting_guards
 (organization_id,branch_id,active_policy_id,live_revision,archive_revision)
VALUES(?,?,?,0,0);

-- @statement BF_PERIOD_SEED
-- Parameters: org,branch,date_start,date_end_exclusive,
-- live_state,archive_state,policy_id,real actor,changed_at_utc.
-- States from approval manifest; never default missing period to OPEN.
INSERT INTO business_periods
 (organization_id,branch_id,date_start,date_end_exclusive,live_state,archive_state,
  version,policy_id,changed_by,changed_at_utc)
VALUES(?,?,?,?,?,?,1,?,?,?);

-- @statement BF_LEGACY_FINALIZATION
-- Parameters: org,branch,doc_id,manifest SHA256 bytes,finalized UTC.
-- Only after full original-item/movement/economic reconciliation.
INSERT INTO document_finalizations
 (organization_id,branch_id,document_id,kind,receipt_id,
  migration_manifest_sha256,finalized_at_utc)
VALUES(?,?,?,'LEGACY',NULL,?,?);

-- @statement BF_MISSING_METADATA
SELECT COUNT(*) AS invalid_rows FROM stock_documents
WHERE business_date IS NULL OR business_timezone IS NULL OR date_policy_version IS NULL
 OR business_date_origin IS NULL OR writer_epoch IS NULL;

-- @statement BF_MISSING_FINALIZATIONS
SELECT COUNT(*) AS invalid_rows FROM stock_documents d
LEFT JOIN document_finalizations f
 ON f.organization_id=d.organization_id AND f.document_id=d.id
WHERE f.document_id IS NULL;

-- @statement BF_MISSING_GUARD
SELECT COUNT(*) AS invalid_rows FROM branches b
LEFT JOIN branch_posting_guards g
 ON g.organization_id=b.organization_id AND g.branch_id=b.id
WHERE b.status='ACTIVE' AND (g.branch_id IS NULL OR g.active_policy_id IS NULL);

-- Bootstrap audit uses business_audit_events prepared insert through future
-- operator adapter, SERVICE actor + manifest reference, no invented actor ID.
-- Atomic chunk checkpoint/receipt SQL is runner implementation work in A1,
-- not a missing instruction to execute templates manually.
