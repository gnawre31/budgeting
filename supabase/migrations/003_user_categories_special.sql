-- Add special and always-excluded flags to user_categories
ALTER TABLE user_categories ADD COLUMN IF NOT EXISTS is_special        boolean DEFAULT false;
ALTER TABLE user_categories ADD COLUMN IF NOT EXISTS is_always_excluded boolean DEFAULT false;

-- Back-fill existing system categories
UPDATE user_categories
SET is_always_excluded = true
WHERE name IN ('Reimbursement', 'Credit Card Payment', 'Internal Transfer')
  AND is_system = true;

-- Update RLS: allow a user to also manage their partner's categories
DROP POLICY IF EXISTS "Users manage own categories" ON user_categories;

CREATE POLICY "Users manage own and partner categories"
ON user_categories FOR ALL
USING (
    auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.partner_id = user_categories.user_id
    )
)
WITH CHECK (
    auth.uid() = user_id
    OR EXISTS (
        SELECT 1 FROM users
        WHERE users.id = auth.uid()
          AND users.partner_id = user_categories.user_id
    )
);
