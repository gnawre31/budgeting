-- Recreate monthly_category_spend to include negative amounts (partner credits).
-- The original view likely had WHERE amount > 0 or ABS(), which excluded the
-- -$1,800 pseudo credit transactions created by the Reconcile feature.

DROP VIEW IF EXISTS monthly_category_spend CASCADE;

CREATE VIEW monthly_category_spend AS
SELECT
    user_id,
    DATE_TRUNC('month', date)::date AS month,
    category,
    SUM(self_amount)    AS self_spent,
    SUM(partner_amount) AS partner_spent,
    SUM(amount)         AS total_spent
FROM transactions
WHERE type = 'Expense'
  AND exclude_from_report = false
GROUP BY user_id, category, DATE_TRUNC('month', date)::date;

GRANT SELECT ON monthly_category_spend TO authenticated;
GRANT SELECT ON monthly_category_spend TO anon;
