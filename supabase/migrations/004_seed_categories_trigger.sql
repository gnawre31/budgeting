-- 004_seed_categories_trigger.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A reusable SECURITY DEFINER function that seeds default categories for any
--    user_id, skipping rows that already exist (ON CONFLICT DO NOTHING).
-- 2. A one-time backfill for every existing user that has no categories yet.
-- 3. A trigger on public.users so every new account is seeded automatically.
-- ─────────────────────────────────────────────────────────────────────────────

-- Requires migration 003 to have been run first (is_special / is_always_excluded columns).

CREATE OR REPLACE FUNCTION public.seed_default_categories(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO user_categories (user_id, name, type, is_system, is_special, is_always_excluded)
  VALUES
    -- ── Expense ──────────────────────────────────────────────────────────────
    (p_user_id, 'Groceries',           'expense', false, false, false),
    (p_user_id, 'Restaurant',          'expense', false, false, false),
    (p_user_id, 'Transportation',      'expense', false, false, false),
    (p_user_id, 'Entertainment',       'expense', false, false, false),
    (p_user_id, 'Shopping',            'expense', false, false, false),
    (p_user_id, 'Rent',                'expense', false, false, false),
    (p_user_id, 'Utilities',           'expense', false, false, false),
    (p_user_id, 'Bill Payment',        'expense', false, false, false),
    (p_user_id, 'Other',               'expense', false, false, false),
    (p_user_id, 'Credit Card Payment', 'expense', true,  false, true ),
    (p_user_id, 'Internal Transfer',   'expense', true,  false, true ),
    -- ── Income ───────────────────────────────────────────────────────────────
    (p_user_id, 'Salary',              'income',  false, false, false),
    (p_user_id, 'Freelance',           'income',  false, false, false),
    (p_user_id, 'E-Transfer',          'income',  false, false, false),
    (p_user_id, 'Gift',                'income',  false, false, false),
    (p_user_id, 'Other',               'income',  false, false, false),
    (p_user_id, 'Reimbursement',       'income',  true,  false, true )
  ON CONFLICT (user_id, name, type) DO NOTHING;
END;
$$;


-- ── Backfill: seed defaults for every existing user ──────────────────────────
-- ON CONFLICT DO NOTHING inside seed_default_categories means existing rows are
-- preserved — only missing defaults are inserted.
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN SELECT id FROM public.users LOOP
    PERFORM public.seed_default_categories(u.id);
  END LOOP;
END;
$$;


-- ── Trigger: auto-seed on every new user insert ───────────────────────────────
CREATE OR REPLACE FUNCTION public.trigger_seed_default_categories()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_default_categories(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_created_seed_categories ON public.users;

CREATE TRIGGER on_user_created_seed_categories
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_seed_default_categories();
