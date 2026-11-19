ALTER TABLE support_threads
 ADD COLUMN web_request_status ENUM('NEW','IN_PROGRESS','COMPLETED') NULL DEFAULT NULL AFTER category,
 ADD KEY idx_support_threads_type_category_activity (thread_type,category,last_message_at);

UPDATE support_threads
 SET web_request_status=CASE status WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS' WHEN 'RESOLVED' THEN 'COMPLETED' WHEN 'CLOSED' THEN 'COMPLETED' ELSE 'NEW' END
 WHERE category='WEB_DESIGN';

UPDATE support_threads t
 JOIN support_tickets st ON st.support_thread_id=t.id
 SET t.category='WEB_DESIGN',
     t.web_request_status=CASE st.status WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS' WHEN 'RESOLVED' THEN 'COMPLETED' WHEN 'CLOSED' THEN 'COMPLETED' ELSE 'NEW' END
 WHERE st.category='ONLINE_WEB_REQUEST';
