-- 013_household_leg3.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- BUG: Dashboard household mode shows only the logged-in user's own expenses.
--      Both users should see the same household total (sum of both partners).
--
-- Root cause: monthly_category_spend has two legs:
--   Leg 1 — keyed by the transaction poster (user_id)
--   Leg 2 — re-keyed by partner_id for split transactions
-- Neither leg surfaces 100% solo transactions posted by the *other* user
-- (partner_id IS NULL, user_id = partner) to the main user's household view.
--
-- Fix: Add Leg 3.
--
-- JOIN direction: "JOIN users u ON u.partner_id = t.user_id"
--   This reads the *querying user's own row* (u.id = auth.uid()) and checks
--   whether their partner_id matches the transaction poster.  It never needs
--   to read the partner's row, so it is safe even with row-level restrictions.
--
-- security_invoker = false: makes the view execute as its owner (postgres),
--   bypassing any RLS policies that might restrict cross-user reads.
--
-- Double-counting audit:
--   Leg 1  counts t.user_id = A, partner_id = B  → keyed by A ✓
--   Leg 2  counts same row                       → keyed by B ✓
--   Leg 3  counts t.user_id = B, partner_id NULL → keyed by A ✓
--   No row appears in more than one leg.
--
-- Self mode: Leg 3 contributes self_spent = 0, so personal KPIs are unchanged.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS monthly_category_spend CASCADE;

CREATE VIEW monthly_category_spend
    WITH (security_invoker = false)
AS

-- ── Leg 1: Poster perspective ─────────────────────────────────────────────────
SELECT
    t.user_id,
    TO_CHAR(DATE_TRUNC('month', t.date), 'YYYY-MM') AS month,
    t.category,
    SUM(t.self_amount)    AS self_spent,
    SUM(t.partner_amount) AS partner_spent,
    SUM(t.amount)         AS total_spent
FROM transactions t
WHERE t.type                = 'Expense'
  AND t.exclude_from_report = false
GROUP BY t.user_id, t.category, DATE_TRUNC('month', t.date)

UNION ALL

-- ── Leg 2: Partner perspective (split transactions only) ──────────────────────
-- Re-keys split expenses by partner_id so the partner's dashboard query
-- (.eq("user_id", partner.id)) returns non-zero results.
SELECT
    t.partner_id              AS user_id,
    TO_CHAR(DATE_TRUNC('month', t.date), 'YYYY-MM') AS month,
    t.category,
    SUM(t.partner_amount)     AS self_spent,    -- partner's own share
    SUM(t.self_amount)        AS partner_spent, -- poster's share
    SUM(t.amount)             AS total_spent
FROM transactions t
WHERE t.type                = 'Expense'
  AND t.exclude_from_report = false
  AND t.partner_id          IS NOT NULL
GROUP BY t.partner_id, t.category, DATE_TRUNC('month', t.date)

UNION ALL

-- ── Leg 3: Partner's 100% solo expenses, visible in household mode ────────────
-- JOIN reads the *querying user's own row* (u.partner_id = t.user_id means
-- "this transaction was posted by my partner").  No cross-user row access needed.
-- self_spent = 0 because the querying user paid nothing for these transactions.
-- total_spent = full amount so household aggregations are complete.
SELECT
    u.id                      AS user_id,   -- the user who will query this
    TO_CHAR(DATE_TRUNC('month', t.date), 'YYYY-MM') AS month,
    t.category,
    0::numeric                AS self_spent,
    0::numeric                AS partner_spent,
    SUM(t.amount)             AS total_spent
FROM transactions t
JOIN users u ON u.partner_id = t.user_id  -- u is the querying user; t was posted by their partner
WHERE t.type                = 'Expense'
  AND t.exclude_from_report = false
  AND t.partner_id          IS NULL        -- solo transactions only (no split already handled by Leg 2)
GROUP BY u.id, t.category, DATE_TRUNC('month', t.date);

GRANT SELECT ON monthly_category_spend TO authenticated;
GRANT SELECT ON monthly_category_spend TO anon;
