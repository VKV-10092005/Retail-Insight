ALTER TABLE branches
 ADD COLUMN store_phone VARCHAR(50) NULL AFTER phone,
 ADD COLUMN store_address VARCHAR(500) NULL AFTER store_phone,
 ADD COLUMN wifi_password VARCHAR(120) NULL AFTER store_address;

