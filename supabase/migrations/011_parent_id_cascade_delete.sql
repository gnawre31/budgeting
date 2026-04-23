-- Add a self-referencing FK on parent_id so that deleting a parent transaction
-- automatically deletes its partner-credit children (is_partner_credit = true).

ALTER TABLE transactions
  ADD CONSTRAINT transactions_parent_id_fkey
  FOREIGN KEY (parent_id)
  REFERENCES transactions(id)
  ON DELETE CASCADE;
