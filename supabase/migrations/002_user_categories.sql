CREATE TABLE IF NOT EXISTS user_categories (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name        text NOT NULL,
  type        text NOT NULL CHECK (type IN ('expense', 'income')),
  is_system   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(user_id, name, type)
);

ALTER TABLE user_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own categories"
ON user_categories FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
