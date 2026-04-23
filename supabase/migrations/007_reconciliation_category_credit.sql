-- Marks a transaction as a synthetic partner-credit offset (created via Reconcile → Link to Category)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_partner_credit boolean DEFAULT false;

-- Set on the reimbursement tx when it is reconciled against a category (vs a specific transaction)
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS linked_category text;
