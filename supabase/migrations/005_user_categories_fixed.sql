ALTER TABLE user_categories ADD COLUMN IF NOT EXISTS is_fixed boolean DEFAULT false;

UPDATE user_categories
SET is_fixed = true
WHERE type = 'expense'
  AND name IN ('Rent', 'Mortgage', 'Utilities', 'Subscriptions', 'Insurance', 'Phone', 'Internet', 'Loan Payment');
