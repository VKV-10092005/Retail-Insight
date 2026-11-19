UPDATE stock_document_items
SET line_total=quantity*unit_price
WHERE line_total=0 AND quantity*unit_price>0;

UPDATE stock_documents
SET subtotal=total
WHERE subtotal=0 AND total>0;
