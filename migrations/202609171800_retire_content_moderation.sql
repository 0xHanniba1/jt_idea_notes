-- Internal accounts publish directly. Retain legacy columns for backup compatibility.
-- Approval does not restore soft-deleted records or alter member access or roles.
UPDATE tenants SET is_moderation_enabled = false WHERE is_moderation_enabled = true;
UPDATE posts SET is_approved = true WHERE is_approved = false;
UPDATE comments SET is_approved = true WHERE is_approved = false;
ALTER TABLE posts ALTER COLUMN is_approved SET DEFAULT true;
ALTER TABLE comments ALTER COLUMN is_approved SET DEFAULT true;
