import { supabase } from '../lib/supabaseClient';

export async function getCategorizationRules() {
  const { data, error } = await supabase
    .from('categorization_rules')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createCategorizationRule(rule) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('categorization_rules')
    .insert([{ ...rule, user_id: user.id }])
    .select();
  if (error) throw error;
  return data[0];
}

export async function deleteCategorizationRule(id) {
  const { error } = await supabase
    .from('categorization_rules')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
