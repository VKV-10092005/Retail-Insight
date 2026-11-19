-- PENDING transfers were previously represented only by payment_status.
-- Normalize those documents as OPEN so they appear in the POS open-order list.
UPDATE stock_documents
 SET order_status='OPEN',completed_at=NULL
 WHERE type='SALE' AND payment_status='WAITING_PAYMENT' AND order_status='COMPLETED';

-- Preserve the original sale timestamp as the best available completion time
-- for historical payments that were already marked PAID.
UPDATE stock_documents
 SET completed_at=created_at
 WHERE type='SALE' AND payment_status='PAID' AND completed_at IS NULL;
