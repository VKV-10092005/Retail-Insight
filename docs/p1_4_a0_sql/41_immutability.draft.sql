-- P1.4 A0 REVIEW ONLY. NOT EXECUTED. Install after final backfill.
-- Application principals must not ALTER/DROP triggers or TRUNCATE these tables.
-- @statement REVIEW_ONLY_41
A0_REVIEW_ONLY_DO_NOT_EXECUTE;

-- @statement IMM_DOC_UPDATE
CREATE TRIGGER p14_doc_no_update BEFORE UPDATE ON stock_documents
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_DOC_DELETE
CREATE TRIGGER p14_doc_no_delete BEFORE DELETE ON stock_documents
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_ITEM_UPDATE
CREATE TRIGGER p14_item_no_update BEFORE UPDATE ON stock_document_items
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_ITEM_DELETE
CREATE TRIGGER p14_item_no_delete BEFORE DELETE ON stock_document_items
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_MOVE_UPDATE
CREATE TRIGGER p14_move_no_update BEFORE UPDATE ON inventory_movements
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_MOVE_DELETE
CREATE TRIGGER p14_move_no_delete BEFORE DELETE ON inventory_movements
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_RECEIPT_UPDATE
CREATE TRIGGER p14_receipt_no_update BEFORE UPDATE ON document_request_receipts
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_RECEIPT_DELETE
CREATE TRIGGER p14_receipt_no_delete BEFORE DELETE ON document_request_receipts
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_FINAL_UPDATE
CREATE TRIGGER p14_final_no_update BEFORE UPDATE ON document_finalizations
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_FINAL_DELETE
CREATE TRIGGER p14_final_no_delete BEFORE DELETE ON document_finalizations
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_AUDIT_UPDATE
CREATE TRIGGER p14_audit_no_update BEFORE UPDATE ON business_audit_events
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_AUDIT_DELETE
CREATE TRIGGER p14_audit_no_delete BEFORE DELETE ON business_audit_events
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_POLICY_UPDATE
CREATE TRIGGER p14_policy_no_update BEFORE UPDATE ON business_posting_policies
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- @statement IMM_POLICY_DELETE
CREATE TRIGGER p14_policy_no_delete BEFORE DELETE ON business_posting_policies
FOR EACH ROW
BEGIN
 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 append-only data';
END;

-- These guards do not supply a deferred commit hook.
-- Trusted runtime must insert receipt/audit/finalization before COMMIT.
-- Stored-procedure hardening against arbitrary DML requires a separate approval.
