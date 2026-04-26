import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabaseClient';
import { useCategories } from '../../hooks/useCategories';

const C = {
  bg: '#F5F5F7',
  white: '#FFFFFF',
  gray900: '#111827',
  gray700: '#374151',
  gray500: '#6B7280',
  gray400: '#9CA3AF',
  gray300: '#D1D5DB',
  gray200: '#E5E7EB',
  gray100: '#F3F4F6',
  indigo500: '#6366F1',
  indigo100: '#E0E7FF',
  indigo50: '#EEF2FF',
  teal500: '#14B8A6',
  teal50: '#F0FDFA',
  rose500: '#F43F5E',
  rose50: '#FFF1F2',
  amber500: '#F59E0B',
  amber100: '#FEF3C7',
};

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 2 }).format(n);

function fmtMonth(dateStr) {
  const [y, m] = dateStr.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function ReconcileScreen() {
  const { expenseCategories } = useCategories();

  const [reimbursements, setReimbursements] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [linkMode, setLinkMode] = useState('category');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Category link state
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showCatPicker, setShowCatPicker] = useState(false);

  // Transaction link state
  const [txSearch, setTxSearch] = useState('');
  const [potentialParents, setPotentialParents] = useState([]);
  const [parentsLoading, setParentsLoading] = useState(false);

  // ── load reimbursements ───────────────────────────────────────────────────

  const loadReimbursements = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    let result = await supabase
      .from('transactions')
      .select('*, parent:parent_id(merchant)')
      .eq('category', 'Reimbursement')
      .eq('user_id', user.id)
      .order('date', { ascending: false });

    if (result.error) {
      result = await supabase
        .from('transactions')
        .select('*')
        .eq('category', 'Reimbursement')
        .eq('user_id', user.id)
        .order('date', { ascending: false });
    }

    if (result.error) { console.error('loadReimbursements error:', result.error); return; }
    setReimbursements((result.data || []).filter(tx => !tx.is_partner_credit));
  }, []);

  useFocusEffect(useCallback(() => { loadReimbursements(); }, [loadReimbursements]));

  // ── load potential parents ────────────────────────────────────────────────

  const loadPotentialParents = useCallback(async () => {
    if (!selectedChild || linkMode !== 'transaction') return;
    setParentsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setParentsLoading(false); return; }

    let query = supabase
      .from('transactions')
      .select('*')
      .eq('type', 'Expense')
      .is('parent_id', null)
      .neq('id', selectedChild.id)
      .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`);

    if (txSearch) query = query.ilike('merchant', `%${txSearch}%`);

    const { data } = await query.order('date', { ascending: false }).limit(20);
    setPotentialParents((data || []).filter(t => !t.is_partner_credit));
    setParentsLoading(false);
  }, [selectedChild, linkMode, txSearch]);

  React.useEffect(() => { loadPotentialParents(); }, [loadPotentialParents]);

  // ── actions ───────────────────────────────────────────────────────────────

  const handleLinkToCategory = async () => {
    if (!selectedChild || !selectedCategory) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: profile } = await supabase
        .from('users')
        .select('partner_id')
        .eq('id', user.id)
        .maybeSingle();

      const month = fmtMonth(selectedChild.date);
      const merchant = `↩ Partner credit – ${selectedCategory}`;

      const { error: insertErr } = await supabase.from('transactions').insert({
        date: selectedChild.date,
        merchant,
        merchant_normalized: merchant.toLowerCase(),
        description: `Partner contribution · ${month} — auto-created from reconciliation`,
        amount: -selectedChild.amount,
        original_amount: -selectedChild.amount,
        self_amount: -selectedChild.amount,
        partner_amount: 0,
        type: 'Expense',
        category: selectedCategory,
        user_id: user.id,
        partner_id: profile?.partner_id ?? null,
        exclude_from_report: false,
        parent_id: selectedChild.id,
        is_partner_credit: true,
      });
      if (insertErr) throw insertErr;

      await supabase
        .from('transactions')
        .update({ linked_category: selectedCategory })
        .eq('id', selectedChild.id);

      setSelectedChild(null);
      setSelectedCategory('');
      await loadReimbursements();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkToTransaction = async (parentId) => {
    if (!selectedChild) return;
    setLoading(true);
    setError(null);
    try {
      const { data: parent, error: fetchErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', parentId)
        .single();
      if (fetchErr) throw fetchErr;

      if (selectedChild.amount > parent.amount) {
        throw new Error(`Reimbursement ($${selectedChild.amount.toFixed(2)}) exceeds expense ($${parent.amount.toFixed(2)}). Link to a larger expense.`);
      }

      const selfRatio = (parent.self_amount ?? 0) / (parent.amount || 1);
      const newTotal = Math.max(0, parent.amount - selectedChild.amount);
      const newSelf = Number((newTotal * selfRatio).toFixed(2));
      const newPartner = Number((newTotal - newSelf).toFixed(2));

      await supabase.from('transactions').update({ parent_id: parentId }).eq('id', selectedChild.id);
      await supabase.from('transactions').update({ amount: newTotal, self_amount: newSelf, partner_amount: newPartner }).eq('id', parentId);

      setSelectedChild(null);
      setTxSearch('');
      await loadReimbursements();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async (tx) => {
    Alert.alert('Unlink', `Unlink "${tx.merchant}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unlink', style: 'destructive', onPress: async () => {
          try {
            if (tx.linked_category) {
              await supabase.from('transactions').delete().eq('parent_id', tx.id).eq('is_partner_credit', true);
              await supabase.from('transactions').update({ linked_category: null }).eq('id', tx.id);
            } else if (tx.parent_id) {
              const { data: parent } = await supabase.from('transactions').select('*').eq('id', tx.parent_id).single();
              if (parent) {
                const selfRatio = (parent.self_amount ?? 0) / (parent.amount || 1);
                const restored = Number((parent.amount + tx.amount).toFixed(2));
                await supabase.from('transactions').update({
                  amount: restored,
                  self_amount: Number((restored * selfRatio).toFixed(2)),
                  partner_amount: Number((restored * (1 - selfRatio)).toFixed(2)),
                }).eq('id', tx.parent_id);
              }
              await supabase.from('transactions').update({ parent_id: null }).eq('id', tx.id);
            }
            await loadReimbursements();
          } catch (err) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  // ── derived ───────────────────────────────────────────────────────────────

  const unlinked = reimbursements.filter(r => !r.parent_id && !r.linked_category);
  const linked   = reimbursements.filter(r =>  r.parent_id ||  r.linked_category);

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Reconcile</Text>
        <Text style={styles.headerSub}>Link reimbursements to an expense or category</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}><Text style={styles.errorDismiss}>Dismiss</Text></TouchableOpacity>
          </View>
        )}

        {/* Needs Linking */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Needs Linking</Text>
            {unlinked.length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unlinked.length}</Text>
              </View>
            )}
          </View>

          {unlinked.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>All reimbursements are reconciled ✓</Text>
            </View>
          ) : unlinked.map(tx => (
            <TouchableOpacity
              key={tx.id}
              style={[styles.txRow, selectedChild?.id === tx.id && styles.txRowSelected]}
              onPress={() => setSelectedChild(selectedChild?.id === tx.id ? null : tx)}
            >
              <View style={styles.txRowBody}>
                <Text style={[styles.txMerchant, selectedChild?.id === tx.id && styles.txMerchantSelected]} numberOfLines={1}>
                  {tx.merchant}
                </Text>
                <Text style={styles.txDate}>{tx.date}</Text>
              </View>
              <Text style={[styles.txAmount, selectedChild?.id === tx.id && styles.txAmountSelected]}>
                {fmt(tx.amount)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Link Panel — shown when a reimbursement is selected */}
        {selectedChild && (
          <View style={styles.section}>
            {/* Selected pill */}
            <View style={styles.selectedPill}>
              <Text style={styles.selectedPillLabel}>Reconciling</Text>
              <View style={styles.selectedPillRow}>
                <Text style={styles.selectedPillMerchant} numberOfLines={1}>{selectedChild.merchant}</Text>
                <Text style={styles.selectedPillAmount}>{fmt(selectedChild.amount)}</Text>
              </View>
              <Text style={styles.selectedPillDate}>{selectedChild.date}</Text>
            </View>

            {/* Mode toggle */}
            <View style={styles.modeToggle}>
              <TouchableOpacity
                onPress={() => setLinkMode('category')}
                style={[styles.modeBtn, linkMode === 'category' && styles.modeBtnActive]}
              >
                <Text style={[styles.modeBtnText, linkMode === 'category' && styles.modeBtnTextActive]}>→ Category</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setLinkMode('transaction')}
                style={[styles.modeBtn, linkMode === 'transaction' && styles.modeBtnActive]}
              >
                <Text style={[styles.modeBtnText, linkMode === 'transaction' && styles.modeBtnTextActive]}>→ Transaction</Text>
              </TouchableOpacity>
            </View>

            {linkMode === 'category' ? (
              <View style={styles.linkPanel}>
                <Text style={styles.linkPanelLabel}>Select a category to offset</Text>
                <TouchableOpacity style={styles.catPickerBtn} onPress={() => setShowCatPicker(true)}>
                  <Text style={[styles.catPickerBtnText, !selectedCategory && { color: C.gray400 }]}>
                    {selectedCategory || 'Pick a category...'}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={C.gray400} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.linkBtn, (!selectedCategory || loading) && styles.linkBtnDisabled]}
                  onPress={handleLinkToCategory}
                  disabled={!selectedCategory || loading}
                >
                  {loading ? <ActivityIndicator size="small" color={C.white} /> : <Text style={styles.linkBtnText}>Link to Category</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.linkPanel}>
                <View style={styles.searchBox}>
                  <Ionicons name="search-outline" size={14} color={C.gray400} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search expenses..."
                    placeholderTextColor={C.gray400}
                    value={txSearch}
                    onChangeText={setTxSearch}
                  />
                </View>
                {parentsLoading ? (
                  <ActivityIndicator size="small" color={C.indigo500} style={{ marginTop: 12 }} />
                ) : potentialParents.length === 0 ? (
                  <Text style={styles.emptyText}>No expenses found</Text>
                ) : potentialParents.map(parent => (
                  <TouchableOpacity
                    key={parent.id}
                    style={styles.parentRow}
                    onPress={() => handleLinkToTransaction(parent.id)}
                  >
                    <View style={styles.parentBody}>
                      <Text style={styles.parentMerchant} numberOfLines={1}>{parent.merchant}</Text>
                      <Text style={styles.parentMeta}>{parent.date} · {parent.category}</Text>
                    </View>
                    <Text style={styles.parentAmount}>{fmt(parent.amount)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Reconciled */}
        {linked.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Reconciled</Text>
            </View>
            {linked.map(tx => (
              <View key={tx.id} style={styles.linkedRow}>
                <View style={styles.txRowBody}>
                  <View style={styles.linkedMerchantRow}>
                    <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant}</Text>
                    <View style={[styles.linkedBadge, tx.linked_category ? styles.linkedBadgeTeal : styles.linkedBadgeIndigo]}>
                      <Text style={[styles.linkedBadgeText, tx.linked_category ? { color: C.teal500 } : { color: C.indigo500 }]}>
                        {tx.linked_category ? `↩ ${tx.linked_category}` : `→ ${tx.parent?.merchant ?? 'Expense'}`}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.txDate}>{tx.date} · {fmt(tx.amount)}</Text>
                </View>
                <TouchableOpacity onPress={() => handleUnlink(tx)} style={styles.unlinkBtn}>
                  <Text style={styles.unlinkBtnText}>Unlink</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Category picker modal */}
      <Modal visible={showCatPicker} transparent animationType="slide" onRequestClose={() => setShowCatPicker(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setShowCatPicker(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>Select Category</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {expenseCategories.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.pickerRow, selectedCategory === cat && styles.pickerRowSelected]}
                  onPress={() => { setSelectedCategory(cat); setShowCatPicker(false); }}
                >
                  <Text style={[styles.pickerRowText, selectedCategory === cat && styles.pickerRowTextSelected]}>{cat}</Text>
                  {selectedCategory === cat && <Ionicons name="checkmark" size={16} color={C.indigo500} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setShowCatPicker(false)} style={styles.pickerClose}>
              <Text style={styles.pickerCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    backgroundColor: C.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.gray200,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: C.gray900 },
  headerSub: { fontSize: 12, color: C.gray400, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { padding: 12, gap: 12 },
  errorBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.rose50, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#FECDD3',
  },
  errorText: { fontSize: 13, color: C.rose500, flex: 1 },
  errorDismiss: { fontSize: 12, fontWeight: '600', color: C.rose500, marginLeft: 8 },
  section: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.gray200,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.gray100,
  },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.5 },
  badge: { backgroundColor: C.amber100, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { fontSize: 11, fontWeight: '700', color: C.amber500 },
  emptyBox: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 13, color: C.gray400, textAlign: 'center' },
  txRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.gray100,
  },
  txRowSelected: { backgroundColor: C.indigo50 },
  txRowBody: { flex: 1, gap: 2 },
  txMerchant: { fontSize: 13, fontWeight: '600', color: C.gray900 },
  txMerchantSelected: { color: C.indigo500 },
  txDate: { fontSize: 11, color: C.gray400 },
  txAmount: { fontSize: 13, fontWeight: '700', color: C.teal500, marginLeft: 12 },
  txAmountSelected: { color: C.indigo500 },
  // Link panel
  selectedPill: {
    margin: 12, marginBottom: 0,
    backgroundColor: C.indigo50, borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: C.indigo100,
  },
  selectedPillLabel: { fontSize: 9, fontWeight: '700', color: C.indigo500, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  selectedPillRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  selectedPillMerchant: { fontSize: 14, fontWeight: '700', color: '#3730A3', flex: 1 },
  selectedPillAmount: { fontSize: 14, fontWeight: '700', color: C.indigo500 },
  selectedPillDate: { fontSize: 11, color: C.indigo500, marginTop: 2, opacity: 0.7 },
  modeToggle: {
    flexDirection: 'row', margin: 12, marginBottom: 0,
    borderRadius: 10, borderWidth: 1, borderColor: C.gray200, overflow: 'hidden',
  },
  modeBtn: { flex: 1, paddingVertical: 9, alignItems: 'center', backgroundColor: C.white },
  modeBtnActive: { backgroundColor: C.gray900 },
  modeBtnText: { fontSize: 12, fontWeight: '600', color: C.gray400 },
  modeBtnTextActive: { color: C.white },
  linkPanel: { padding: 12, gap: 10 },
  linkPanelLabel: { fontSize: 12, color: C.gray500 },
  catPickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: C.gray100, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  catPickerBtnText: { fontSize: 14, color: C.gray900, flex: 1 },
  linkBtn: {
    backgroundColor: C.indigo500, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  linkBtnDisabled: { opacity: 0.4 },
  linkBtnText: { color: C.white, fontSize: 14, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.gray100, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: C.gray900, padding: 0 },
  parentRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.gray100,
  },
  parentBody: { flex: 1, gap: 2 },
  parentMerchant: { fontSize: 13, fontWeight: '600', color: C.gray900 },
  parentMeta: { fontSize: 11, color: C.gray400 },
  parentAmount: { fontSize: 13, fontWeight: '700', color: C.gray700, marginLeft: 12 },
  linkedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.gray100,
  },
  linkedMerchantRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  linkedBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  linkedBadgeTeal: { backgroundColor: C.teal50 },
  linkedBadgeIndigo: { backgroundColor: C.indigo50 },
  linkedBadgeText: { fontSize: 10, fontWeight: '600' },
  unlinkBtn: { marginLeft: 8 },
  unlinkBtnText: { fontSize: 12, fontWeight: '600', color: C.rose500 },
  // Category picker modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  pickerSheet: {
    backgroundColor: C.white, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '60%',
  },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: C.gray900, marginBottom: 12 },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: C.gray100,
  },
  pickerRowSelected: { backgroundColor: C.indigo50, marginHorizontal: -4, paddingHorizontal: 4, borderRadius: 8 },
  pickerRowText: { fontSize: 14, color: C.gray700 },
  pickerRowTextSelected: { color: C.indigo500, fontWeight: '600' },
  pickerClose: {
    backgroundColor: C.gray100, borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 12,
  },
  pickerCloseText: { fontSize: 14, fontWeight: '600', color: C.gray700 },
});
