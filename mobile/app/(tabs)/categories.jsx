import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
  rose500: '#F43F5E',
  rose50: '#FFF1F2',
  amber500: '#F59E0B',
  amber50: '#FFFBEB',
  violet500: '#8B5CF6',
  violet50: '#F5F3FF',
  teal500: '#14B8A6',
  teal50: '#F0FDFA',
};

const TABS = [
  { key: 'expense', label: 'Expense' },
  { key: 'income', label: 'Income' },
];

function CategoryRow({ cat, onUpdate, onRemove }) {
  return (
    <View style={styles.catRow}>
      <Text style={styles.catName} numberOfLines={1}>{cat.name}</Text>

      <View style={styles.catToggles}>
        {cat.type === 'expense' && (
          <View style={styles.toggleCol}>
            <Text style={styles.toggleLabel}>Fixed</Text>
            <Switch
              value={!!cat.is_fixed}
              onValueChange={(v) => onUpdate(cat.id, { is_fixed: v })}
              trackColor={{ false: C.gray300, true: C.teal500 }}
              thumbColor={C.white}
              style={styles.switch}
            />
          </View>
        )}
        <View style={styles.toggleCol}>
          <Text style={styles.toggleLabel}>Special</Text>
          <Switch
            value={!!cat.is_special}
            onValueChange={(v) => onUpdate(cat.id, { is_special: v })}
            trackColor={{ false: C.gray300, true: C.violet500 }}
            thumbColor={C.white}
            style={styles.switch}
          />
        </View>
        <View style={styles.toggleCol}>
          <Text style={styles.toggleLabel}>Exclude</Text>
          <Switch
            value={!!cat.is_always_excluded}
            onValueChange={(v) => onUpdate(cat.id, { is_always_excluded: v })}
            trackColor={{ false: C.gray300, true: C.rose500 }}
            thumbColor={C.white}
            style={styles.switch}
          />
        </View>
        <TouchableOpacity
          onPress={() => onRemove(cat)}
          style={styles.deleteBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="trash-outline" size={15} color={C.gray300} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function CategoriesScreen() {
  const { categories, loading, dbAvailable, addCategory, updateCategory, removeCategory } = useCategories();

  const [activeTab, setActiveTab] = useState('expense');
  const [newName, setNewName] = useState('');
  const [newFixed, setNewFixed] = useState(false);
  const [newSpecial, setNewSpecial] = useState(false);
  const [newAlwaysEx, setNewAlwaysEx] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  const visible = categories
    .filter((c) => c.type === activeTab)
    .sort((a, b) => a.name.localeCompare(b.name));

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    const conflict = categories.find(
      (c) => c.type === activeTab && c.name.toLowerCase() === name.toLowerCase()
    );
    if (conflict) {
      setError(`"${conflict.name}" already exists.`);
      return;
    }
    setAdding(true);
    setError(null);
    try {
      await addCategory(name, activeTab, {
        is_fixed: newFixed,
        is_special: newSpecial,
        is_always_excluded: newAlwaysEx,
      });
      setNewName('');
      setNewFixed(false);
      setNewSpecial(false);
      setNewAlwaysEx(false);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('23505')) {
        setError(`"${name}" already exists. Choose a different name.`);
      } else {
        setError(msg);
      }
    } finally {
      setAdding(false);
    }
  };

  const handleUpdate = async (id, updates) => {
    try {
      await updateCategory(id, updates);
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  const handleRemove = (cat) => {
    Alert.alert('Delete Category', `Delete "${cat.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeCategory(cat.id);
          } catch (err) {
            Alert.alert('Error', err.message);
          }
        },
      },
    ]);
  };

  const switchTab = (key) => {
    setActiveTab(key);
    setError(null);
    setNewName('');
    setNewFixed(false);
    setNewSpecial(false);
    setNewAlwaysEx(false);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Categories</Text>
        <Text style={styles.headerSub}>Manage categories for you and your partner</Text>
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => switchTab(t.key)}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
          >
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
              {t.label}
              <Text style={styles.tabCount}>
                {' '}({categories.filter((c) => c.type === t.key).length})
              </Text>
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Add form */}
      <View style={styles.addForm}>
        <View style={styles.addRow}>
          <TextInput
            style={styles.addInput}
            placeholder={`New ${activeTab} category…`}
            placeholderTextColor={C.gray400}
            value={newName}
            onChangeText={(v) => { setNewName(v); setError(null); }}
            returnKeyType="done"
            onSubmitEditing={handleAdd}
          />
          <TouchableOpacity
            onPress={handleAdd}
            disabled={adding || !newName.trim() || !dbAvailable}
            style={[styles.addBtn, (adding || !newName.trim() || !dbAvailable) && styles.addBtnDisabled]}
          >
            {adding
              ? <ActivityIndicator size="small" color={C.white} />
              : <Text style={styles.addBtnText}>Add</Text>
            }
          </TouchableOpacity>
        </View>

        {/* Flag toggles for new category */}
        <View style={styles.flagRow}>
          {activeTab === 'expense' && (
            <View style={styles.flagItem}>
              <Switch
                value={newFixed}
                onValueChange={setNewFixed}
                trackColor={{ false: C.gray300, true: C.teal500 }}
                thumbColor={C.white}
                style={styles.switch}
                disabled={!dbAvailable}
              />
              <Text style={styles.flagLabel}>Fixed</Text>
            </View>
          )}
          <View style={styles.flagItem}>
            <Switch
              value={newSpecial}
              onValueChange={setNewSpecial}
              trackColor={{ false: C.gray300, true: C.violet500 }}
              thumbColor={C.white}
              style={styles.switch}
              disabled={!dbAvailable}
            />
            <Text style={styles.flagLabel}>Special</Text>
          </View>
          <View style={styles.flagItem}>
            <Switch
              value={newAlwaysEx}
              onValueChange={setNewAlwaysEx}
              trackColor={{ false: C.gray300, true: C.rose500 }}
              thumbColor={C.white}
              style={styles.switch}
              disabled={!dbAvailable}
            />
            <Text style={styles.flagLabel}>Exclude</Text>
          </View>
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={C.indigo500} />
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No {activeTab} categories yet.</Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                <Text style={styles.footerBold}>Fixed</Text> — recurring fixed expenses (rent, subscriptions).{' '}
                <Text style={styles.footerBold}>Special</Text> — one-time/atypical spend, filterable on dashboard.{' '}
                <Text style={styles.footerBold}>Exclude</Text> — hides from all reports.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <CategoryRow
              cat={item}
              onUpdate={handleUpdate}
              onRemove={handleRemove}
            />
          )}
        />
      )}
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
  tabBar: {
    flexDirection: 'row',
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: C.gray900 },
  tabText: { fontSize: 13, fontWeight: '500', color: C.gray400 },
  tabTextActive: { color: C.gray900, fontWeight: '700' },
  tabCount: { fontWeight: '400', color: C.gray400 },
  addForm: {
    backgroundColor: C.white,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
    gap: 8,
  },
  addRow: { flexDirection: 'row', gap: 8 },
  addInput: {
    flex: 1,
    backgroundColor: C.gray100,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: C.gray900,
  },
  addBtn: {
    backgroundColor: C.gray900,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: C.white, fontSize: 14, fontWeight: '700' },
  flagRow: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  flagItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  flagLabel: { fontSize: 12, color: C.gray500 },
  switch: { transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] },
  errorText: { fontSize: 12, color: C.rose500 },
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 32, gap: 6 },
  emptyBox: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 13, color: C.gray400 },
  catRow: {
    backgroundColor: C.white,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.gray200,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  catName: { flex: 1, fontSize: 13, fontWeight: '600', color: C.gray900 },
  catToggles: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleCol: { alignItems: 'center', gap: 2 },
  toggleLabel: { fontSize: 9, fontWeight: '600', color: C.gray400, textTransform: 'uppercase', letterSpacing: 0.3 },
  deleteBtn: { marginLeft: 4, padding: 4 },
  footer: { paddingHorizontal: 4, paddingTop: 12, paddingBottom: 8 },
  footerText: { fontSize: 11, color: C.gray400, lineHeight: 16 },
  footerBold: { fontWeight: '700', color: C.gray500 },
});
