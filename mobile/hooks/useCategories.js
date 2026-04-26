import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  fetchUserCategories,
  seedDefaultCategories,
  addCategory as svcAdd,
  updateCategory as svcUpdate,
  removeCategory as svcRemove,
  getPartnerId,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '../services/categoryService';

// Fallback when user_categories table doesn't exist yet
const FALLBACK_CATEGORIES = [
  ...DEFAULT_EXPENSE_CATEGORIES.map((c, i) => ({ id: `fb-exp-${i}`, type: 'expense', ...c })),
  ...DEFAULT_INCOME_CATEGORIES.map((c, i)  => ({ id: `fb-inc-${i}`, type: 'income',  ...c })),
];

export function useCategories() {
  const [categories, setCategories] = useState(FALLBACK_CATEGORIES);
  const [loading, setLoading]       = useState(true);
  const [userId, setUserId]         = useState(null);
  const [partnerId, setPartnerId]   = useState(null);
  const [dbAvailable, setDbAvailable] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const pid = await getPartnerId(user.id);
      setPartnerId(pid);

      let cats;
      try {
        cats = await fetchUserCategories(user.id);
        if (cats.length === 0) {
          await seedDefaultCategories(user.id);
          if (pid) {
            const partnerCats = await fetchUserCategories(pid);
            if (partnerCats.length === 0) await seedDefaultCategories(pid);
          }
          cats = await fetchUserCategories(user.id);
        }
        setDbAvailable(true);
        setCategories(cats.length > 0 ? cats : FALLBACK_CATEGORIES);
      } catch {
        setDbAvailable(false);
        setCategories(FALLBACK_CATEGORIES);
      }
    } catch (err) {
      console.error('useCategories:', err);
      setCategories(FALLBACK_CATEGORIES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Derived lists (memoized)
  const expenseCategories        = useMemo(() => categories.filter(c => c.type === 'expense').map(c => c.name), [categories]);
  const incomeCategories         = useMemo(() => categories.filter(c => c.type === 'income').map(c => c.name),  [categories]);
  const specialCategories        = useMemo(() => categories.filter(c => c.is_special).map(c => c.name),         [categories]);
  const alwaysExcludedCategories = useMemo(() => categories.filter(c => c.is_always_excluded).map(c => c.name), [categories]);
  const fixedCategories          = useMemo(() => categories.filter(c => c.is_fixed).map(c => c.name),           [categories]);

  // Partner sync helper
  const syncPartner = useCallback(async (name, type, updates) => {
    if (!partnerId) return;
    try {
      await supabase
        .from('user_categories')
        .update(updates)
        .eq('user_id', partnerId)
        .eq('name', name)
        .eq('type', type);
    } catch { /* partner may not have the row yet; non-fatal */ }
  }, [partnerId]);

  // Mutations
  const addCategory = useCallback(async (name, type, flags = {}) => {
    if (!userId || !dbAvailable) return;
    const cat = await svcAdd(userId, name, type, flags);
    if (partnerId) {
      try {
        await supabase
          .from('user_categories')
          .upsert(
            { user_id: partnerId, name: name.trim(), type, is_system: false, ...flags },
            { onConflict: 'user_id,name,type' }
          );
      } catch { /* non-fatal */ }
    }
    setCategories(prev => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
  }, [userId, partnerId, dbAvailable]);

  const updateCategory = useCallback(async (id, updates) => {
    if (!dbAvailable) return;
    const cat = categories.find(c => c.id === id);
    const updated = await svcUpdate(id, updates);
    if (cat) await syncPartner(cat.name, cat.type, updates);
    setCategories(prev => prev.map(c => c.id === id ? updated : c));
  }, [categories, dbAvailable, syncPartner]);

  const removeCategory = useCallback(async (id) => {
    if (!dbAvailable) return;
    const cat = categories.find(c => c.id === id);
    await svcRemove(id);
    if (cat && partnerId) {
      try {
        await supabase
          .from('user_categories')
          .delete()
          .eq('user_id', partnerId)
          .eq('name', cat.name)
          .eq('type', cat.type);
      } catch { /* non-fatal */ }
    }
    setCategories(prev => prev.filter(c => c.id !== id));
  }, [categories, partnerId, dbAvailable]);

  return {
    categories,
    expenseCategories,
    incomeCategories,
    specialCategories,
    alwaysExcludedCategories,
    fixedCategories,
    loading,
    dbAvailable,
    partnerId,
    addCategory,
    updateCategory,
    removeCategory,
    refresh: load,
  };
}
