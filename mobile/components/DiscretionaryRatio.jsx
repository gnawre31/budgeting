import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { cacheGet, cacheSet, cacheKey } from '../lib/queryCache';

const C = {
  white: '#FFFFFF',
  gray900: '#111827',
  gray500: '#6B7280',
  gray400: '#9CA3AF',
  gray200: '#E5E7EB',
  gray100: '#F3F4F6',
  gray50: '#F9FAFB',
  indigo500: '#6366F1',
  indigo300: '#A5B4FC',
  rose300: '#FDA4AF',
  rose400: '#FB7185',
};

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n);

export default function DiscretionaryRatio({
  selectedMonth,
  viewMode,
  excludeSpecial = false,
  specialCategories = [],
  alwaysExcludedCategories = [],
  fixedCategories = [],
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

  const { fixed, variable, total } = useMemo(() => {
    const spendKey = viewMode === 'household' ? 'total_spent' : 'self_spent';
    const filtered = rawExpenses
      .filter((d) => !alwaysExcludedCategories.includes(d.category))
      .filter((d) => !excludeSpecial || !specialCategories.includes(d.category));

    const fixed = filtered
      .filter((d) => fixedCategories.includes(d.category))
      .reduce((s, d) => s + (d[spendKey] || 0), 0);
    const variable = filtered
      .filter((d) => !fixedCategories.includes(d.category))
      .reduce((s, d) => s + (d[spendKey] || 0), 0);
    return { fixed, variable, total: fixed + variable };
  }, [rawExpenses, viewMode, alwaysExcludedCategories, excludeSpecial, specialCategories, fixedCategories]);

  const fixedPct = total > 0 ? (fixed / total) * 100 : 0;
  const varPct = total > 0 ? (variable / total) * 100 : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Fixed vs Variable</Text>
        <Text style={styles.subtitle}>Discretionary breakdown</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={C.indigo500} />
        </View>
      ) : (
        <View style={styles.body}>
          {/* Cards */}
          <View style={styles.cardsRow}>
            <View style={[styles.miniCard, { flex: 1 }]}>
              <Text style={styles.miniCardLabel}>FIXED</Text>
              <Text style={[styles.miniCardValue, { color: C.indigo500 }]}>{fmt(fixed)}</Text>
              <Text style={styles.miniCardSub}>{fixedPct.toFixed(0)}% of spend</Text>
            </View>
            <View style={[styles.miniCard, { flex: 1 }]}>
              <Text style={styles.miniCardLabel}>VARIABLE</Text>
              <Text style={[styles.miniCardValue, { color: C.rose400 }]}>{fmt(variable)}</Text>
              <Text style={styles.miniCardSub}>{varPct.toFixed(0)}% of spend</Text>
            </View>
          </View>

          {/* Segmented bar */}
          {total > 0 ? (
            <View style={styles.barSection}>
              <View style={styles.segBar}>
                <View
                  style={[
                    styles.segFixed,
                    { flex: fixedPct || 0.001 },
                  ]}
                />
                <View
                  style={[
                    styles.segVariable,
                    { flex: varPct || 0.001 },
                  ]}
                />
              </View>
              <View style={styles.barFooter}>
                <Text style={styles.barFooterText}>{fixedPct.toFixed(0)}% fixed</Text>
                <Text style={styles.barFooterText}>{fmt(total)} total</Text>
                <Text style={styles.barFooterText}>{varPct.toFixed(0)}% variable</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.emptyText}>No spending data</Text>
          )}
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
  body: {
    padding: 16,
    gap: 16,
  },
  cardsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  miniCard: {
    backgroundColor: C.gray50,
    borderRadius: 12,
    padding: 14,
  },
  miniCardLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: C.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  miniCardValue: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  miniCardSub: {
    fontSize: 10,
    color: C.gray400,
    marginTop: 2,
  },
  barSection: {
    gap: 6,
  },
  segBar: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: C.gray100,
  },
  segFixed: {
    backgroundColor: C.indigo300,
  },
  segVariable: {
    backgroundColor: C.rose300,
  },
  barFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  barFooterText: {
    fontSize: 10,
    color: C.gray400,
  },
  emptyText: {
    fontSize: 13,
    color: C.gray400,
    textAlign: 'center',
    paddingVertical: 8,
  },
});
