import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { cacheGet, cacheSet, cacheKey } from '../lib/queryCache';

const C = {
  white: '#FFFFFF',
  gray900: '#111827',
  gray800: '#1F2937',
  gray500: '#6B7280',
  gray400: '#9CA3AF',
  gray300: '#D1D5DB',
  gray200: '#E5E7EB',
  gray100: '#F3F4F6',
  indigo500: '#6366F1',
};

const CAT_COLORS = {
  Groceries: '#34d399',
  Restaurant: '#fb923c',
  Transportation: '#60a5fa',
  Entertainment: '#a78bfa',
  Shopping: '#f43f5e',
  Rent: '#6366f1',
  Utilities: '#14b8a6',
  'Bill Payment': '#f59e0b',
  Other: '#94a3b8',
};
const catColor = (cat) => CAT_COLORS[cat] || '#94a3b8';

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 2,
  }).format(n);

export default function LargestTransactions({
  selectedMonth,
  viewMode,
  excludeSpecial = false,
  specialCategories = [],
  alwaysExcludedCategories = [],
  refreshKey = 0,
}) {
  const [rawTxns, setRawTxns] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setCurrentUserId(user.id);

      const [y, m] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const start = `${selectedMonth}-01`;
      const end = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

      const key = cacheKey(user.id, 'largest_txns', selectedMonth);
      const cached = await cacheGet(key);
      if (cached && !cancelled) {
        setRawTxns(cached);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('transactions')
        .select('id, merchant, amount, self_amount, partner_amount, user_id, category, date, description')
        .eq('type', 'Expense')
        .eq('exclude_from_report', false)
        .is('parent_id', null)
        .gte('date', start)
        .lte('date', end)
        .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`)
        .order('amount', { ascending: false })
        .limit(15);

      if (cancelled) return;
      const txns = data || [];
      await cacheSet(key, txns);
      setRawTxns(txns);
      setLoading(false);
    };
    fetch();
    return () => { cancelled = true; };
  }, [selectedMonth, refreshKey]);

  const top5 = useMemo(() => {
    return rawTxns
      .filter((tx) => !alwaysExcludedCategories.includes(tx.category))
      .filter((tx) => !excludeSpecial || !specialCategories.includes(tx.category))
      .map((tx) => ({
        ...tx,
        displayAmount:
          viewMode === 'household'
            ? tx.amount
            : tx.user_id === currentUserId
            ? tx.self_amount
            : tx.partner_amount,
      }))
      .filter((tx) => tx.displayAmount > 0)
      .sort((a, b) => b.displayAmount - a.displayAmount)
      .slice(0, 5);
  }, [rawTxns, viewMode, currentUserId, alwaysExcludedCategories, excludeSpecial, specialCategories]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Largest Transactions</Text>
        <Text style={styles.subtitle}>Top 5 this month</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={C.indigo500} />
        </View>
      ) : top5.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No transactions</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {top5.map((tx) => {
            const color = catColor(tx.category);
            return (
              <View key={tx.id} style={styles.row}>
                <View style={[styles.colorBar, { backgroundColor: color }]} />
                <View style={styles.rowBody}>
                  <Text style={styles.merchant} numberOfLines={1}>{tx.merchant}</Text>
                  <View style={styles.meta}>
                    <View style={[styles.catBadge, { backgroundColor: color + '22' }]}>
                      <Text style={[styles.catBadgeText, { color }]}>{tx.category}</Text>
                    </View>
                    <Text style={styles.date}>{tx.date}</Text>
                  </View>
                </View>
                <Text style={styles.amount}>{fmt(tx.displayAmount)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.gray200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    overflow: 'hidden',
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: C.gray900,
  },
  subtitle: {
    fontSize: 12,
    color: C.gray500,
    marginTop: 2,
  },
  loadingBox: {
    padding: 32,
    alignItems: 'center',
  },
  emptyBox: {
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: C.gray400,
  },
  list: {
    padding: 12,
    gap: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  colorBar: {
    width: 3,
    height: 28,
    borderRadius: 2,
    flexShrink: 0,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  merchant: {
    fontSize: 13,
    fontWeight: '600',
    color: C.gray800,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  catBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  catBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  date: {
    fontSize: 10,
    color: C.gray300,
  },
  amount: {
    fontSize: 13,
    fontWeight: '700',
    color: C.gray900,
    flexShrink: 0,
  },
});
