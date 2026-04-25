import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { cacheGet, cacheSet, cacheKey } from '../lib/queryCache';

const C = {
  white: '#FFFFFF',
  gray900: '#111827',
  gray700: '#374151',
  gray500: '#6B7280',
  gray400: '#9CA3AF',
  gray200: '#E5E7EB',
  gray100: '#F3F4F6',
  indigo500: '#6366F1',
};

const COLORS = [
  '#6366f1', '#14b8a6', '#f43f5e', '#f59e0b', '#a78bfa',
  '#34d399', '#fb923c', '#60a5fa', '#e879f9', '#4ade80',
];

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n);

export default function SpendingBreakdown({
  selectedMonth,
  viewMode,
  excludeSpecial = false,
  specialCategories = [],
  alwaysExcludedCategories = [],
  refreshKey = 0,
}) {
  const [rawExpenses, setRawExpenses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const key = cacheKey(user.id, 'monthly_spend', selectedMonth);
      const cached = await cacheGet(key);
      if (cached && !cancelled) {
        setRawExpenses(cached);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('monthly_category_spend')
        .select('category, total_spent, self_spent')
        .eq('user_id', user.id)
        .eq('month', selectedMonth);

      if (cancelled) return;
      const expenses = data || [];
      await cacheSet(key, expenses);
      setRawExpenses(expenses);
      setLoading(false);
    };
    fetch();
    return () => { cancelled = true; };
  }, [selectedMonth, refreshKey]);

  const items = useMemo(() => {
    const spendKey = viewMode === 'household' ? 'total_spent' : 'self_spent';
    const filtered = rawExpenses
      .filter((d) => !alwaysExcludedCategories.includes(d.category))
      .filter((d) => !excludeSpecial || !specialCategories.includes(d.category))
      .map((d) => ({ label: d.category, value: d[spendKey] || 0 }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);

    const total = filtered.reduce((s, d) => s + d.value, 0);
    return { items: filtered.map((d, i) => ({ ...d, color: COLORS[i % COLORS.length], pct: total > 0 ? (d.value / total) * 100 : 0 })), total };
  }, [rawExpenses, viewMode, alwaysExcludedCategories, excludeSpecial, specialCategories]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Spending Breakdown</Text>
          <Text style={styles.subtitle}>By category — {fmt(items.total)} total</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={C.indigo500} />
        </View>
      ) : items.items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No spending data</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {items.items.map((item, i) => (
            <View key={item.label} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={styles.catName} numberOfLines={1}>{item.label}</Text>
              <View style={styles.rightSide}>
                <Text style={styles.amount}>{fmt(item.value)}</Text>
                <Text style={styles.pct}>{item.pct.toFixed(0)}%</Text>
              </View>
              {/* Progress bar */}
              <View style={styles.barTrackFull}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${item.pct}%`, backgroundColor: item.color + '66' },
                  ]}
                />
              </View>
            </View>
          ))}
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
    padding: 16,
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  catName: {
    fontSize: 13,
    color: C.gray700,
    flex: 1,
    fontWeight: '500',
  },
  rightSide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  amount: {
    fontSize: 13,
    fontWeight: '600',
    color: C.gray900,
  },
  pct: {
    fontSize: 11,
    color: C.gray400,
    width: 30,
    textAlign: 'right',
  },
  barTrackFull: {
    height: 4,
    backgroundColor: C.gray100,
    borderRadius: 2,
    overflow: 'hidden',
    width: '100%',
  },
  barFill: {
    height: '100%',
    borderRadius: 2,
  },
});
