-- Remove the Partner $/mo feature entirely.
-- The column is no longer used by the application.

ALTER TABLE user_categories
  DROP COLUMN IF EXISTS monthly_partner_contribution;
