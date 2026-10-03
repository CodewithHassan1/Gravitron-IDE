-- V0012__auth_enhancements.sql

-- Add missing fields to users table
ALTER TABLE users 
    ADD COLUMN display_name VARCHAR(255),
    ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'PENDING_VERIFICATION';

-- For existing mock/legacy data, set them to active so we don't break existing IDE tests or functions
UPDATE users SET status = 'ACTIVE' WHERE created_at < NOW();
