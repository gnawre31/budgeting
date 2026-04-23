-- Replace the case-sensitive UNIQUE(user_id, name, type) constraint with a
-- case-insensitive functional unique index so "Coffee" and "coffee" are
-- treated as the same category name.

ALTER TABLE user_categories
  DROP CONSTRAINT IF EXISTS user_categories_user_id_name_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS user_categories_lower_name_unique
  ON user_categories (user_id, LOWER(name), type);
