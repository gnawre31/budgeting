import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabaseClient';
import { cacheGet, cacheSet, cacheKey } from '../lib/queryCache';

const C = {
  white: '#FFFFFF',
  gray900: '#111827',
  gray400: '#9CA3AF',
  gray200: '#E5E7EB',
  green500: '#22C55E',
  rose500: '#F43F5E',
  amber500: '#F59E0B',
};

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n);

const fmtPct = (n) => `${n >= 0 ? '' : '−'}${Math.abs(n).toFixed(1)}%`;

function KPICard({ label, value, sub, color }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>{label}</Text>
      <Text style={[styles.cardValue, color && { color }]}>{value}</Text>
      {sub ? <Text style={styles.cardSub}>{sub}</Text> : null}
    </View>
  );
}

export default function KPIStrip({
  selectedMonth,
  viewMode,
  excludeSpecial = false,
  specialCategories = [],
  alwaysExcludedCategories = [],
  fixedCategories = [],
  refreshKey = 0,
  partnerId = null,
}) {
  const [rawExpenses, setRawExpenses] = useState([]);
  const [rawIncome, setRawIncome] = useState([]);
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

      const [year, month] = selectedMonth.split('-');
      const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
      const start = `${selectedMonth}-01`;
      const end = `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;

      const expKey = cacheKey(user.id, 'monthly_spend', selectedMonth);
      const incKey = cacheKey(user.id, 'income_txns', selectedMonth, partnerId ?? 'solo');

      const cachedExp = await cacheGet(expKey);
      const cachedInc = await cacheGet(incKey);

      if (cachedExp && cachedInc && !cancelled) {
        setRawExpenses(cachedExp);
        setRawIncome(cachedInc);
        setLoading(false);
        return;
      }

      const [{ data: expData }, { data: incData }] = await Promise.all([
        supabase
          .from('monthly_category_spend')
          .select('category, total_spent, self_spent')
          .eq('user_id', user.id)
          .eq('month', selectedMonth),
        supabase
          .from('transactions')
          .select('amount, self_amount, partner_amount, user_id, category')
          .eq('type', 'Income')
          .eq('exclude_from_report', false)
          .is('parent_id', null)
          .gte('date', start)
          .lte('date', end)
          .in('user_id', partnerId ? [user.id, partnerId] : [user.id]),
      ]);

      if (cancelled) return;
      const expenses = expData || [];
      const income = incData || [];
      await cacheSet(expKey, expenses);
      await cacheSet(incKey, income);
      setRawExpenses(expenses);
      setRawIncome(income);
      setLoading(false);
    };
    fetch();
    return () => { cancelled = true; };
  }, [selectedMonth, refreshKey, partnerId]);

  const { totalSpend, totalIncome, net, rate } = useMemo(() => {
    const filtered = rawExpenses
      .filter((d) => !alwaysExcludedCategories.includes(d.category))
      .filter((d) => !excludeSpecial || !specialCategories.includes(d.category));

    const totalSpend = filtered.reduce(
      (s, d) => s + (viewMode === 'household' ? d.total_spent || 0 : d.self_spent || 0),
      0
    );

    const incFiltered = rawIncome
      .filter((tx) => !alwaysExcludedCategories.includes(tx.category))
      .filter((tx) => !excludeSpecial || !specialCategories.includes(tx.category));

    const totalIncome = incFiltered.reduce((s, tx) => {
      if (viewMode === 'household') return s + (tx.amount || 0);
      return s + (tx.user_id === currentUserId ? tx.self_amount || 0 : tx.partner_amount || 0);
    }, 0);

    const net = totalIncome - totalSpend;
    const rate = totalIncome > 0 ? (net / totalIncome) * 100 : null;
    return { totalSpend, totalIncome, net, rate };
  }, [rawExpenses, rawIncome, viewMode, currentUserId, alwaysExcludedCategories, excludeSpecial, specialCategories]);

  if (loading) {
    return (
      <View style={styles.loadingRow}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={[styles.card, styles.cardSkeleton]} />
        ))}
      </View>
    );
  }

  const rateColor =
    rate === null
      ? C.gray400
      : rate >= 20
      ? C.green500
      : rate >= 0
      ? C.amber500
      : C.rose500;

  const rateSub =
    rate !== null && rate >= 20
      ? 'On track'
      : rate !== null && rate < 0
      ? 'Deficit'
      : undefined;

  return (
    <View style={styles.row}>
      <View style={styles.col}>
        <KPICard label="SPENDING" value={fmt(totalSpend)} />
        <KPICard label="INCOME" value={fmt(totalIncome)} color={C.green500} />
      </View>
      <View style={styles.col}>
        <KPICard
          label="NET SAVED"
          value={fmt(net)}
          color={net >= 0 ? C.green500 : C.rose500}
        />
        <KPICard
          label="SAVINGS RATE"
          value={rate !== null ? fmtPct(rate) : '—'}
          color={rateColor}
          sub={rateSub}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  col: {
    flex: 1,
    gap: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.gray200,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
    padding: 14,
    flex: 1,
  },
  cardSkeleton: {
    height: 80,
    backgroundColor: '#F3F4F6',
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: C.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: -0.5,
  },
  cardSub: {
    fontSize: 10,
    color: C.gray400,
    marginTop: 2,
  },
});
