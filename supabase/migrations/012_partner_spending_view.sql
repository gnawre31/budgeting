-- 012_partner_spending_view.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- BUG: When the partner logs in their dashboard shows $0 spending.
--
-- Root cause: monthly_category_spend only groups by `user_id` (the transaction
-- poster).  A partner querying `.eq("user_id", partner.id)` gets 0 rows because
-- every transaction is stored under the other person's user_id.
--
-- Fix: UNION a second "partner perspective" leg that re-keys the same rows by
-- partner_id, with partner_amount as the partner's self_spent.
--
-- Result for partner logged-in user querying .eq("user_id", partner.id):
--   self_spent   → their portion of the expense  (was partner_amount in DB)
--   partner_spent → the poster's portion          (was self_amount in DB)
--   total_spent  → full household amount           (same for both perspectives)
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS monthly_category_spend CASCADE;

CREATE VIEW monthly_category_spend AS

-- ── Leg 1: Owner / poster perspective ────────────────────────────────────────
-- Rows are keyed by the user who entered the transaction.
-- self_spent  = what they paid themselves (self_amount)
-- total_spent = full household amount (amount)
SELECT
    user_id,
    TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
    category,
    SUM(self_amount)                 AS self_spent,
    SUM(partner_amount)              AS partner_spent,
    SUM(amount)                      AS total_spent
FROM transactions
WHERE type                = 'Expense'
  AND exclude_from_report = false
GROUP BY user_id, category, DATE_TRUNC('month', date)

UNION ALL

-- ── Leg 2: Partner perspective ───────────────────────────────────────────────
-- Re-keys the same expense rows by partner_id so the partner's dashboard query
-- (.eq("user_id", partner.id)) returns non-zero results.
--
-- self_spent  = partner's portion of the expense (partner_amount)
-- total_spent = same full household amount — both users see the same household total
--
-- is_partner_credit rows always have partner_id = null, so they're automatically
-- excluded by the "AND partner_id IS NOT NULL" guard below.
SELECT
    partner_id                       AS user_id,
    TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') AS month,
    category,
    SUM(partner_amount)              AS self_spent,   -- partner's own share
    SUM(self_amount)                 AS partner_spent, -- poster's share
    SUM(amount)                      AS total_spent   -- full household amount
FROM transactions
WHERE type                = 'Expense'
  AND exclude_from_report = false
  AND partner_id          IS NOT NULL
GROUP BY partner_id, category, DATE_TRUNC('month', date);

GRANT SELECT ON monthly_category_spend TO authenticated;
GRANT SELECT ON monthly_category_spend TO anon;
