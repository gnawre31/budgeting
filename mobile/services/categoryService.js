import { supabase } from '../lib/supabaseClient';

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Groceries',           is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Restaurant',          is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Transportation',      is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Entertainment',       is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Shopping',            is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Rent',                is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Utilities',           is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Bill Payment',        is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Other',               is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Credit Card Payment', is_system: true,  is_special: false, is_always_excluded: true  },
  { name: 'Internal Transfer',   is_system: true,  is_special: false, is_always_excluded: true  },
];

export const DEFAULT_INCOME_CATEGORIES = [
  { name: 'Salary',        is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Freelance',     is_system: false, is_special: false, is_always_excluded: false },
  { name: 'E-Transfer',    is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Gift',          is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Other',         is_system: false, is_special: false, is_always_excluded: false },
  { name: 'Reimbursement', is_system: true,  is_special: false, is_always_excluded: true  },
];

export async function fetchUserCategories(userId) {
  const { data, error } = await supabase
    .from('user_categories')
    .select('*')
    .eq('user_id', userId)
    .order('is_system', { ascending: false })
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function seedDefaultCategories(userId) {
  const rows = [
    ...DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ user_id: userId, type: 'expense', ...c })),
    ...DEFAULT_INCOME_CATEGORIES.map((c) => ({ user_id: userId, type: 'income',  ...c })),
  ];
  const { error } = await supabase
    .from('user_categories')
    .upsert(rows, { onConflict: 'user_id,name,type' });
  if (error) throw error;
}

export async function addCategory(userId, name, type, flags = {}) {
  const row = {
    user_id: userId,
    name: name.trim(),
    type,
    is_system: false,
    is_special: flags.is_special ?? false,
    is_always_excluded: flags.is_always_excluded ?? false,
  };
  const { data, error } = await supabase
    .from('user_categories')
    .insert(row)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(categoryId, updates) {
  const { data, error } = await supabase
    .from('user_categories')
    .update(updates)
    .eq('id', categoryId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function removeCategory(categoryId) {
  const { error } = await supabase
    .from('user_categories')
    .delete()
    .eq('id', categoryId);
  if (error) throw error;
}

export async function getPartnerId(userId) {
  const { data } = await supabase
    .from('users')
    .select('partner_id')
    .eq('id', userId)
    .maybeSingle();
  return data?.partner_id ?? null;
}
