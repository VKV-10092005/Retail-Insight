-- P1.4 A0 REVIEW ONLY. NOT EXECUTED.
-- Not a run script: operator choreography/readiness/grants/ingress are mandatory.
-- @statement REVIEW_ONLY_50
A0_REVIEW_ONLY_DO_NOT_EXECUTE;

-- @statement CO_LOCK_CONTROL
-- Start an explicit transaction in the future runner before this statement.
SELECT mode,required_writer_epoch,schema_version,reader_basis,version
FROM business_schema_control WHERE singleton_id=1 FOR UPDATE;

-- @statement CO_ENTER_MAINTENANCE
-- Parameters: UTC time,expected control version; exactly one affected row.
-- Execute BEFORE final tail/30/40/41, COMMIT this change, keep ingress closed.
UPDATE business_schema_control
SET mode='MAINTENANCE',version=version+1,changed_at_utc=?
WHERE singleton_id=1 AND mode IN ('EXPAND','ENFORCED') AND version=?;

-- @statement CO_ACTIVATE
-- Parameters: approved new epoch,UTC time,expected version.
-- Separate later transaction, only AFTER 30/40/41 verified, old credentials fenced,
-- all native tests/parity/bootstrap evidence, app readiness and release approval.
UPDATE business_schema_control
SET mode='ENFORCED',required_writer_epoch=?,reader_basis='BUSINESS_DATE',
 version=version+1,changed_at_utc=?
WHERE singleton_id=1 AND mode='MAINTENANCE' AND schema_version=2 AND version=?;

-- @statement CO_READ_BASIS_RECOVERY
-- Parameters: UTC time,expected version.
-- Alternative recovery branch ONLY in maintenance under separate approval.
-- Keep writer epoch and schema version; never reopen old binary.
UPDATE business_schema_control
SET reader_basis='RECORDED_TIME',version=version+1,changed_at_utc=?
WHERE singleton_id=1 AND mode='MAINTENANCE' AND version=?;
-- Do not execute CO_ACTIVATE and recovery as a blind sequential script.
-- A later operator may reopen ENFORCED with RECORDED_TIME only in an approved
-- release whose reader fallback and new-epoch-compatible writer have been tested.
