-- P1.4 A0 REVIEW ONLY. NOT EXECUTED.
-- Install ONLY after backfill+contract under MAINTENANCE, before ENFORCED.
-- Each complete CREATE TRIGGER ... BEGIN/END is one @statement block.
-- Do not send DELIMITER or split on semicolons.
-- @statement REVIEW_ONLY_40
A0_REVIEW_ONLY_DO_NOT_EXECUTE;

-- @statement FN_HEADER_INSERT
CREATE TRIGGER p14_doc_before_insert BEFORE INSERT ON stock_documents
FOR EACH ROW
BEGIN
 DECLARE v_mode VARCHAR(24) DEFAULT NULL;
 DECLARE v_epoch INT UNSIGNED DEFAULT NULL;
 DECLARE v_policy BIGINT UNSIGNED DEFAULT NULL;
 DECLARE v_revision BIGINT UNSIGNED DEFAULT NULL;
 DECLARE v_effective DATETIME(6) DEFAULT NULL;
 DECLARE v_start DATE DEFAULT NULL;
 DECLARE v_end DATE DEFAULT NULL;
 DECLARE v_state VARCHAR(12) DEFAULT NULL;
 SELECT mode,required_writer_epoch INTO v_mode,v_epoch
 FROM business_schema_control WHERE singleton_id=1 FOR SHARE;
 IF v_mode IS NULL OR v_mode<>'ENFORCED' OR NEW.writer_epoch IS NULL
  OR NEW.writer_epoch<>v_epoch OR @@session.time_zone<>'+00:00' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 writer unavailable or incompatible';
 END IF;
 IF NEW.business_date_origin<>'SERVER_TODAY' OR NEW.writer_epoch=0
  OR NEW.policy_id IS NULL OR NEW.period_id IS NULL OR NEW.accepted_at_utc IS NULL
  OR NEW.business_timezone<>'Asia/Ho_Chi_Minh'
  OR NEW.date_policy_version<>'business-date-v2' THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 native metadata required';
 END IF;
 SELECT g.active_policy_id,g.live_revision,p.effective_from_utc
 INTO v_policy,v_revision,v_effective
 FROM branch_posting_guards g
 JOIN business_posting_policies p ON p.organization_id=g.organization_id
  AND p.branch_id=g.branch_id AND p.id=g.active_policy_id
 WHERE g.organization_id=NEW.organization_id AND g.branch_id=NEW.branch_id
 FOR SHARE;
 IF v_policy IS NULL OR v_policy<>NEW.policy_id
  OR NEW.posting_revision IS NULL OR NEW.posting_revision<>v_revision+1
  OR v_effective>NEW.accepted_at_utc THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 policy or revision mismatch';
 END IF;
 SELECT date_start,date_end_exclusive,live_state INTO v_start,v_end,v_state
 FROM business_periods WHERE organization_id=NEW.organization_id
  AND branch_id=NEW.branch_id AND id=NEW.period_id FOR SHARE;
 IF v_state IS NULL OR v_state<>'OPEN' OR NEW.business_date<v_start
  OR NEW.business_date>=v_end THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 period closed or missing';
 END IF;
 IF NEW.created_at IS NULL
  OR TIMESTAMPDIFF(MICROSECOND,CAST(NEW.created_at AS DATETIME(6)),NEW.accepted_at_utc)
   NOT BETWEEN 0 AND 999999 THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 accepted timestamp mismatch';
 END IF;
 -- IANA today, real actor permissions and receipt/complete commit are service checks.
 -- Do not use fixed +7 or CONVERT_TZ to pretend to validate historical IANA here.
END;

-- @statement FN_ITEM_INSERT
CREATE TRIGGER p14_item_before_insert BEFORE INSERT ON stock_document_items
FOR EACH ROW
BEGIN
 DECLARE v_doc BIGINT UNSIGNED DEFAULT NULL;
 SELECT id INTO v_doc FROM stock_documents
 WHERE organization_id=NEW.organization_id AND id=NEW.document_id FOR SHARE;
 IF v_doc IS NULL OR EXISTS(
  SELECT 1 FROM document_finalizations
  WHERE organization_id=NEW.organization_id AND document_id=NEW.document_id
 ) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 document finalized or missing';
 END IF;
END;

-- @statement FN_MOVEMENT_INSERT
CREATE TRIGGER p14_movement_before_insert BEFORE INSERT ON inventory_movements
FOR EACH ROW
BEGIN
 DECLARE v_doc BIGINT UNSIGNED DEFAULT NULL;
 DECLARE v_type VARCHAR(12) DEFAULT NULL;
 DECLARE v_quantity INT DEFAULT NULL;
 SELECT id,type INTO v_doc,v_type FROM stock_documents
 WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id
  AND id=NEW.document_id FOR SHARE;
 IF v_doc IS NULL OR EXISTS(
  SELECT 1 FROM document_finalizations
  WHERE organization_id=NEW.organization_id AND document_id=NEW.document_id
 ) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 document finalized or missing';
 END IF;
 SELECT quantity INTO v_quantity FROM stock_document_items
 WHERE organization_id=NEW.organization_id AND document_id=NEW.document_id
  AND product_id=NEW.product_id FOR SHARE;
 IF v_quantity IS NULL OR NEW.quantity_delta<>
  CASE WHEN v_type='SALE' THEN -v_quantity ELSE v_quantity END THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 movement item mismatch';
 END IF;
END;

-- @statement FN_RECEIPT_INSERT
CREATE TRIGGER p14_receipt_before_insert BEFORE INSERT ON document_request_receipts
FOR EACH ROW
BEGIN
 DECLARE v_doc BIGINT UNSIGNED DEFAULT NULL;
 DECLARE v_policy BIGINT UNSIGNED DEFAULT NULL;
 DECLARE v_period BIGINT UNSIGNED DEFAULT NULL;
 DECLARE v_date DATE DEFAULT NULL;
 DECLARE v_accepted DATETIME(6) DEFAULT NULL;
 SELECT id,policy_id,period_id,business_date,accepted_at_utc
 INTO v_doc,v_policy,v_period,v_date,v_accepted FROM stock_documents
 WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id
  AND id=NEW.document_id FOR SHARE;
 IF v_doc IS NULL OR v_policy IS NULL OR v_period IS NULL
  OR NOT(v_policy <=> NEW.policy_id) OR NOT(v_period <=> NEW.period_id)
  OR NOT(v_date <=> NEW.business_date) OR NOT(v_accepted <=> NEW.accepted_at_utc)
  OR EXISTS(SELECT 1 FROM document_finalizations
   WHERE organization_id=NEW.organization_id AND document_id=NEW.document_id) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 receipt metadata mismatch';
 END IF;
END;

-- @statement FN_FINALIZATION_INSERT
CREATE TRIGGER p14_final_before_insert BEFORE INSERT ON document_finalizations
FOR EACH ROW
BEGIN
 DECLARE v_origin VARCHAR(40) DEFAULT NULL;
 DECLARE v_total DECIMAL(16,2) DEFAULT NULL;
 DECLARE v_item_total DECIMAL(38,2) DEFAULT NULL;
 DECLARE v_items BIGINT UNSIGNED DEFAULT 0;
 DECLARE v_moves BIGINT UNSIGNED DEFAULT 0;
 SELECT business_date_origin,total INTO v_origin,v_total FROM stock_documents
 WHERE organization_id=NEW.organization_id AND branch_id=NEW.branch_id
  AND id=NEW.document_id FOR UPDATE;
 IF v_origin IS NULL OR NEW.kind<>'NATIVE' OR v_origin<>'SERVER_TODAY'
  OR NEW.receipt_id IS NULL THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 native finalization required';
 END IF;
 SELECT COUNT(*),SUM(quantity*unit_price) INTO v_items,v_item_total
 FROM stock_document_items
 WHERE organization_id=NEW.organization_id AND document_id=NEW.document_id;
 SELECT COUNT(*) INTO v_moves FROM inventory_movements
 WHERE organization_id=NEW.organization_id AND document_id=NEW.document_id;
 IF v_items<1 OR v_items>100 OR v_items<>v_moves
  OR NOT(v_total <=> v_item_total) THEN
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='P14 incomplete document';
 END IF;
 -- receipt FK is checked immediately; marker last in the same transaction.
 -- Legacy markers must already exist before this trigger is installed.
END;
