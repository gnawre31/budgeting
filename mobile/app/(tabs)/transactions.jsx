import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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
  gray50: '#F9FAFB',
  indigo500: '#6366F1',
  indigo50: '#EEF2FF',
  green500: '#22C55E',
  green50: '#F0FDF4',
  rose500: '#F43F5E',
  rose50: '#FFF1F2',
  teal500: '#14B8A6',
  teal50: '#F0FDFA',
};

const TYPE_OPTIONS = ['Expense', 'Income'];

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 2,
  }).format(n);

function TransactionItem({ tx, onDelete, currentUserId }) {
  const isPartnerCredit = tx.is_partner_credit === true;
  const isFlipped = tx._isFlipped === true;

  if (isPartnerCredit) {
    return (
      <View style={[styles.txCard, styles.txCardTeal]}>
        <Text style={styles.txTealLabel}>↩</Text>
        <View style={styles.txBody}>
          <Text style={[styles.txMerchant, { color: C.teal500 }]} numberOfLines={1}>
            {tx.merchant}
          </Text>
          <Text style={styles.txMeta}>
            {tx.date} · {tx.category}
          </Text>
        </View>
        <Text style={[styles.txAmount, { color: C.teal500 }]}>{fmt(tx.amount)}</Text>
      </View>
    );
  }

  return (
    <View style={styles.txCard}>
      <View style={styles.txBody}>
        <View style={styles.txTopRow}>
          {isFlipped && (
            <View style={styles.flippedDot} />
          )}
          <Text style={styles.txMerchant} numberOfLines={1}>{tx.merchant}</Text>
        </View>
        <View style={styles.txMetaRow}>
          <Text style={styles.txMeta}>{tx.date}</Text>
          <View
            style={[
              styles.typeBadge,
              tx.type === 'Income' ? styles.typeBadgeIncome : styles.typeBadgeExpense,
            ]}
          >
            <Text
              style={[
                styles.typeBadgeText,
                tx.type === 'Income' ? { color: C.green500 } : { color: C.rose500 },
              ]}
            >
              {tx.type}
            </Text>
          </View>
          <Text style={styles.txCat}>{tx.category}</Text>
        </View>
        {tx.description ? (
          <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>
        ) : null}
      </View>
      <View style={styles.txRight}>
        <Text style={[styles.txAmount, tx.type === 'Income' ? { color: C.green500 } : null]}>
          {fmt(tx.amount)}
        </Text>
        {!isFlipped && (
          <TouchableOpacity
            onPress={() => {
              Alert.alert('Delete Transaction', 'Permanently delete this transaction?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: () => onDelete(tx.id) },
              ]);
            }}
            style={styles.deleteBtn}
          >
            <Ionicons name="trash-outline" size={15} color={C.gray400} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    date: new Date().toISOString().split('T')[0],
    merchant: '',
    type: 'Expense',
    category: 'Other',
    amount: '',
    self_amount: '',
    partner_amount: '',
    description: '',
    exclude_from_report: false,
  });
  const [addError, setAddError] = useState(null);
  const [adding, setAdding] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  const { expenseCategories, incomeCategories } = useCategories();
  const categoryOptions = addForm.type === 'Income' ? incomeCategories : expenseCategories;

  const debounceRef = useRef(null);

  const fetchTransactions = useCallback(async (searchText = '') => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setCurrentUserId(user.id);

    let query = supabase
      .from('transactions')
      .select('*, parent:parent_id(merchant, amount)')
      .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`);

    if (searchText) query = query.ilike('merchant', `%${searchText}%`);

    const { data, error } = await query
      .order('date', { ascending: false })
      .limit(100);

    if (!error) {
      setTransactions(
        (data || []).map((tx) => {
          if (tx.user_id !== user.id && tx.partner_id === user.id) {
            return { ...tx, _isFlipped: true };
          }
          return { ...tx, _isFlipped: false };
        })
      );
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTransactions(search);
    }, [])
  );

  const handleSearchChange = (text) => {
    setSearch(text);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchTransactions(text), 400);
  };

  const handleDelete = async (id) => {
    setLoading(true);
    await supabase.from('transactions').delete().eq('parent_id', id).eq('is_partner_credit', true);
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) Alert.alert('Error', error.message);
    await fetchTransactions(search);
  };

  const handleAddFieldChange = (field, value) => {
    setAddError(null);
    setAddForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'amount') {
        const n = parseFloat(value) || 0;
        next.self_amount = String(n);
        next.partner_amount = '0';
      } else if (field === 'self_amount') {
        next.partner_amount = String(
          Math.max(0, Number(((parseFloat(prev.amount) || 0) - (parseFloat(value) || 0)).toFixed(2)))
        );
      } else if (field === 'partner_amount') {
        next.self_amount = String(
          Math.max(0, Number(((parseFloat(prev.amount) || 0) - (parseFloat(value) || 0)).toFixed(2)))
        );
      } else if (field === 'type' && value === 'Income') {
        next.category = 'Reimbursement';
      }
      return next;
    });
  };

  const handleAddSubmit = async () => {
    if (!addForm.merchant.trim() || !addForm.amount) return;
    const amount = Math.abs(parseFloat(addForm.amount));
    const selfAmt = addForm.self_amount !== '' ? parseFloat(addForm.self_amount) : amount;
    const partnerAmt = addForm.partner_amount !== '' ? parseFloat(addForm.partner_amount) : 0;

    if (Math.abs(selfAmt + partnerAmt - amount) > 0.01) {
      setAddError(
        `Self ($${selfAmt.toFixed(2)}) + Partner ($${partnerAmt.toFixed(2)}) must equal Total ($${amount.toFixed(2)})`
      );
      return;
    }

    setAdding(true);
    setAddError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from('users')
        .select('partner_id')
        .eq('id', user.id)
        .maybeSingle();

      const { error } = await supabase.from('transactions').insert({
        user_id: user.id,
        partner_id: profile?.partner_id ?? null,
        date: addForm.date,
        merchant: addForm.merchant.trim(),
        merchant_normalized: addForm.merchant.trim().toLowerCase(),
        type: addForm.type,
        category: addForm.category,
        amount,
        self_amount: selfAmt,
        partner_amount: partnerAmt,
        original_amount: amount,
        exclude_from_report: addForm.exclude_from_report,
        description: addForm.description || null,
      });

      if (error) throw error;
      setShowAddModal(false);
      setAddForm({
        date: new Date().toISOString().split('T')[0],
        merchant: '',
        type: 'Expense',
        category: 'Other',
        amount: '',
        self_amount: '',
        partner_amount: '',
        description: '',
        exclude_from_report: false,
      });
      await fetchTransactions(search);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setAdding(false);
    }
  };

  const renderItem = ({ item }) => (
    <TransactionItem
      tx={item}
      onDelete={handleDelete}
      currentUserId={currentUserId}
    />
  );

  const keyExtractor = (item) => item.id;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transactions</Text>
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search-outline" size={16} color={C.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search merchant..."
            placeholderTextColor={C.gray400}
            value={search}
            onChangeText={handleSearchChange}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearchChange('')}>
              <Ionicons name="close-circle" size={16} color={C.gray400} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* List */}
      {loading && transactions.length === 0 ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={C.indigo500} />
        </View>
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          onRefresh={() => fetchTransactions(search)}
          refreshing={loading}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                {search ? 'No transactions matching your search.' : 'No transactions yet.'}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddModal(true)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={26} color={C.white} />
      </TouchableOpacity>

      {/* Add Transaction Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKav}
        >
          <Pressable style={styles.modalOverlay} onPress={() => setShowAddModal(false)}>
            <Pressable style={styles.addSheet} onPress={(e) => e.stopPropagation()}>
              {/* Modal header */}
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Add Transaction</Text>
                <TouchableOpacity onPress={() => setShowAddModal(false)}>
                  <Ionicons name="close" size={22} color={C.gray500} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                {addError && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{addError}</Text>
                  </View>
                )}

                {/* Date */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Date</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={addForm.date}
                    onChangeText={(v) => handleAddFieldChange('date', v)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={C.gray400}
                  />
                </View>

                {/* Merchant */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Merchant</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={addForm.merchant}
                    onChangeText={(v) => handleAddFieldChange('merchant', v)}
                    placeholder="e.g. Whole Foods"
                    placeholderTextColor={C.gray400}
                  />
                </View>

                {/* Type toggle */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Type</Text>
                  <View style={styles.typeToggle}>
                    {TYPE_OPTIONS.map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => handleAddFieldChange('type', t)}
                        style={[
                          styles.typeBtn,
                          addForm.type === t && (t === 'Income' ? styles.typeBtnIncome : styles.typeBtnExpense),
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeBtnText,
                            addForm.type === t && styles.typeBtnTextActive,
                          ]}
                        >
                          {t}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Category */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Category</Text>
                  <TouchableOpacity
                    style={styles.fieldInput}
                    onPress={() => setShowCategoryPicker(true)}
                  >
                    <Text style={[styles.fieldInputText, !addForm.category && { color: C.gray400 }]}>
                      {addForm.category || 'Select category...'}
                    </Text>
                    <Ionicons name="chevron-down" size={14} color={C.gray400} />
                  </TouchableOpacity>
                </View>

                {/* Amount row */}
                <View style={styles.amountRow}>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Total</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={addForm.amount}
                      onChangeText={(v) => handleAddFieldChange('amount', v)}
                      placeholder="0.00"
                      placeholderTextColor={C.gray400}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>My share</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={addForm.self_amount}
                      onChangeText={(v) => handleAddFieldChange('self_amount', v)}
                      placeholder="0.00"
                      placeholderTextColor={C.gray400}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  <View style={[styles.field, { flex: 1 }]}>
                    <Text style={styles.fieldLabel}>Partner</Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={addForm.partner_amount}
                      onChangeText={(v) => handleAddFieldChange('partner_amount', v)}
                      placeholder="0.00"
                      placeholderTextColor={C.gray400}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                {/* Description */}
                <View style={styles.field}>
                  <Text style={styles.fieldLabel}>Notes (optional)</Text>
                  <TextInput
                    style={styles.fieldInput}
                    value={addForm.description}
                    onChangeText={(v) => handleAddFieldChange('description', v)}
                    placeholder="Optional note..."
                    placeholderTextColor={C.gray400}
                  />
                </View>

                {/* Exclude toggle */}
                <View style={styles.excludeRow}>
                  <Text style={styles.excludeLabel}>Exclude from reports</Text>
                  <Switch
                    value={addForm.exclude_from_report}
                    onValueChange={(v) => handleAddFieldChange('exclude_from_report', v)}
                    trackColor={{ false: C.gray300, true: C.indigo500 }}
                  />
                </View>

                {/* Submit */}
                <TouchableOpacity
                  style={[
                    styles.submitBtn,
                    (adding || !addForm.merchant.trim() || !addForm.amount) && styles.submitBtnDisabled,
                  ]}
                  onPress={handleAddSubmit}
                  disabled={adding || !addForm.merchant.trim() || !addForm.amount}
                >
                  {adding ? (
                    <ActivityIndicator size="small" color={C.white} />
                  ) : (
                    <Text style={styles.submitBtnText}>Add Transaction</Text>
                  )}
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Category picker modal */}
      <Modal
        visible={showCategoryPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCategoryPicker(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowCategoryPicker(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.pickerTitle}>Select Category</Text>
            <ScrollView showsVerticalScrollIndicator={false}>
              {categoryOptions.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.pickerRow,
                    addForm.category === cat && styles.pickerRowSelected,
                  ]}
                  onPress={() => {
                    handleAddFieldChange('category', cat);
                    setShowCategoryPicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerRowText,
                      addForm.category === cat && styles.pickerRowTextSelected,
                    ]}
                  >
                    {cat}
                  </Text>
                  {addForm.category === cat && (
                    <Ionicons name="checkmark" size={16} color={C.indigo500} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setShowCategoryPicker(false)}
              style={styles.pickerClose}
            >
              <Text style={styles.pickerCloseText}>Close</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    backgroundColor: C.white,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.gray200,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.gray900,
  },
  searchRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.white,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 8,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: C.gray900,
    padding: 0,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 100,
    gap: 6,
  },
  loadingCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: C.gray400,
    textAlign: 'center',
  },
  // Transaction cards
  txCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.gray200,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  txCardTeal: {
    backgroundColor: '#F0FDFA',
    borderColor: '#CCFBF1',
  },
  txTealLabel: {
    fontSize: 16,
    color: C.teal500,
  },
  txBody: {
    flex: 1,
    gap: 3,
  },
  txTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  flippedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.teal500,
    flexShrink: 0,
  },
  txMerchant: {
    fontSize: 13,
    fontWeight: '600',
    color: C.gray900,
    flex: 1,
  },
  txMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  txMeta: {
    fontSize: 11,
    color: C.gray400,
  },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  typeBadgeIncome: {
    backgroundColor: '#F0FDF4',
  },
  typeBadgeExpense: {
    backgroundColor: '#FFF1F2',
  },
  typeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  txCat: {
    fontSize: 11,
    color: C.gray500,
  },
  txDesc: {
    fontSize: 11,
    color: C.gray400,
    fontStyle: 'italic',
  },
  txRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: C.gray900,
  },
  deleteBtn: {
    padding: 4,
  },
  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.indigo500,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.indigo500,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  // Modal / sheet
  modalKav: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  addSheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.gray900,
  },
  errorBox: {
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  errorText: {
    fontSize: 12,
    color: C.rose500,
  },
  field: {
    marginBottom: 12,
    gap: 5,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: C.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  fieldInput: {
    backgroundColor: C.gray100,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: C.gray900,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldInputText: {
    fontSize: 14,
    color: C.gray900,
    flex: 1,
  },
  typeToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: C.gray100,
    alignItems: 'center',
  },
  typeBtnIncome: {
    backgroundColor: C.green50,
  },
  typeBtnExpense: {
    backgroundColor: C.rose50,
  },
  typeBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: C.gray500,
  },
  typeBtnTextActive: {
    color: C.gray900,
  },
  amountRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  excludeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 16,
  },
  excludeLabel: {
    fontSize: 14,
    color: C.gray700,
  },
  submitBtn: {
    backgroundColor: C.indigo500,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '700',
  },
  // Category picker
  pickerSheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '60%',
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.gray900,
    marginBottom: 12,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  pickerRowSelected: {
    backgroundColor: C.indigo50,
    marginHorizontal: -4,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  pickerRowText: {
    fontSize: 14,
    color: C.gray700,
  },
  pickerRowTextSelected: {
    color: C.indigo500,
    fontWeight: '600',
  },
  pickerClose: {
    backgroundColor: C.gray100,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  pickerCloseText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.gray700,
  },
});
