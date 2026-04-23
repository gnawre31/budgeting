-- Per-category fixed monthly partner contribution
-- Used to split expenses like mortgage where one partner contributes a
-- fixed dollar amount per month regardless of how many transactions there are.
ALTER TABLE user_categories
ADD COLUMN IF NOT EXISTS monthly_partner_contribution numeric DEFAULT 0;
