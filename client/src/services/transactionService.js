import { supabase } from "../lib/supabaseClient";

const normalizeString = (str) => {
  if (!str) return "";
  return str.toString().toLowerCase().trim().replace(/\s+/g, " ");
};

/**
 * Pre-check: Compares pending transactions against the database.
 * Returns both the "clean" list and the "duplicate" list for the UI to handle.
 */
export async function checkDuplicates(transactions, partnerId) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "User not authenticated" };

  // 1. Format the data for comparison
  const formatted = transactions.map((tx) => ({
    ...tx,
    user_id: user.id,
    partner_id: partnerId,
    merchant_normalized: normalizeString(tx.merchant),
    amount: Number(tx.amount),
    original_amount: Number(tx.amount),
  }));

  // 2. Fetch existing records for the relevant dates
  const dates = [...new Set(formatted.map((t) => t.date))];
  const { data: existing, error } = await supabase
    .from("transactions")
    .select("date, merchant, amount")
    .eq("user_id", user.id)
    .in("date", dates);

  if (error) throw error;

  const potentialDuplicates = [];
  const safeToUpload = [];

  // 3. Compare
  formatted.forEach((incoming) => {
    const isDupe = existing?.some(
      (ext) =>
        ext.date === incoming.date &&
        normalizeString(ext.merchant) === normalizeString(incoming.merchant) &&
        Math.abs(Number(ext.amount) - Number(incoming.amount)) < 0.01,
    );

    if (isDupe) {
      potentialDuplicates.push(incoming);
    } else {
      safeToUpload.push(incoming);
    }
  });

  return { potentialDuplicates, safeToUpload };
}

/**
 * Final Step: Actually inserts the selected transactions into Supabase.
 */
// services/transactionService.js

export async function commitTransactions(transactions) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Clean the payload: ONLY send what the DB expects
  const cleanPayload = transactions.map((tx) => ({
    date: tx.date,
    merchant: tx.merchant,
    merchant_normalized: tx.merchant?.toLowerCase().trim().replace(/\s+/g, " "),
    description: tx.description || null,
    amount: Number(tx.amount),
    original_amount: Number(tx.amount),
    self_amount: Number(tx.self_amount),
    partner_amount: Number(tx.partner_amount),
    user_id: user.id,
    partner_id: tx.partner_id || null,
    type: tx.type || "Expense",
    category: tx.category || "Uncategorized",
    exclude_from_report: tx.exclude_from_report ?? false,
    parent_id: tx.parent_id || null,
  }));

  const { data, error } = await supabase
    .from("transactions")
    .insert(cleanPayload)
    .select(); // Crucial for getting the count back

  if (error) {
    console.error("Supabase Insertion Error:", error);
    return { count: 0, error: error.message };
  }

  return { count: data?.length || 0, error: null };
}
export async function linkReimbursement(childId, parentId) {
  const { data, error } = await supabase
    .from("transactions")
    .update({ parent_id: parentId })
    .eq("id", childId);
  return error ? { error: error.message } : { success: true, data };
}

// services/transactionService.js

export async function getCategorizationRules() {
  const { data, error } = await supabase
    .from("categorization_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createCategorizationRule(rule) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("categorization_rules")
    .insert([{ ...rule, user_id: user.id }])
    .select();
  if (error) throw error;
  return data[0];
}

export async function deleteCategorizationRule(id) {
  const { error } = await supabase
    .from("categorization_rules")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// Helper to use during upload
export function applyRules(transaction, rules) {
  const merchantLower = transaction.merchant.toLowerCase();
  const type = transaction.type; // 'Income' or 'Expense'

  const matchedRule = rules.find(
    (rule) =>
      merchantLower.includes(rule.keyword.toLowerCase()) &&
      rule.transaction_type === type,
  );

  if (matchedRule) {
    return {
      ...transaction,
      category: matchedRule.category,
      merchant: matchedRule.rename_to || transaction.merchant,
    };
  }
  return transaction;
}
