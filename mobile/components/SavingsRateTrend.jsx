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
  green400: '#4ADE80',
  green500: '#22C55E',
  amber400: '#FBBF24',
  amber500: '#F59E0B',
  rose400: '#FB7185',
  rose500: '#F43F5E',
};

const CONTAINER_H = 130;
const GOAL_RATE = 20;

function getLast6Months(endMonth) {
  const [year, month] = endMonth.split('-');
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(parseInt(year), parseInt(month) - 1 - (5 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

const fmtRate = (r) => `${r >= 0 ? '' : '−'}${Math.abs(r).toFixed(0)}%`;

export default function SavingsRateTrend({
  selectedMonth,
  viewMode,
  excludeSpecial = false,
  specialCategories = [],
  alwaysExcludedCategories = [],
  refreshKey = 0,
  partnerId = null,
}) {
  const [rawExpenses, setRawExpenses] = useState([]);
  const [rawIncome, setRawIncome] = useState([]);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [spanYears, setSpanYears] = useState(false);
  const [loading, setLoading] = useState(true);

  const months = useMemo(() => getLast6Months(selectedMonth), [selectedMonth]);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      setCurrentUserId(user.id);

      const first = months[0];
      const last = months[months.length - 1];
      const [ly, lm] = last.split('-');
      const lastDay = new Date(parseInt(ly), parseInt(lm), 0).getDate();

      const expKey = cacheKey(user.id, 'monthly_spend_range', first, last);
      const incKey = cacheKey(user.id, 'income_range', first, last, partnerId ?? 'solo');
      const cachedExp = await cacheGet(expKey);
      const cachedInc = await cacheGet(incKey);

      if (cachedExp && cachedInc && !cancelled) {
        setRawExpenses(cachedExp);
        setRawIncome(cachedInc);
        setSpanYears(new Set(months.map((m) => m.split('-')[0])).size > 1);
        setLoading(false);
        return;
      }

      const [{ data: expenses }, { data: income }] = await Promise.all([
        supabase
          .from('monthly_category_spend')
          .select('month, total_spent, self_spent, category')
          .eq('user_id', user.id)
          .gte('month', first)
          .lte('month', last),
        supabase
          .from('transactions')
          .select('date, amount, self_amount, partner_amount, user_id, category')
          .eq('type', 'Income')
          .eq('exclude_from_report', false)
          .is('parent_id', null)
          .gte('date', `${first}-01`)
          .lte('date', `${last}-${String(lastDay).padStart(2, '0')}`)
          .in('user_id', partnerId ? [user.id, partnerId] : [user.id]),
      ]);

      if (cancelled) return;
      const exp = expenses || [];
      const inc = income || [];
      await cacheSet(expKey, exp);
      await cacheSet(incKey, inc);
      setRawExpenses(exp);
      setRawIncome(inc);
      setSpanYears(new Set(months.map((m) => m.split('-')[0])).size > 1);
      setLoading(false);
    };
    fetch();
    return () => { cancelled = true; };
  }, [selectedMonth, refreshKey, partnerId]);

  const rates = useMemo(() => {
    return months.map((m) => {
      const monthExp = rawExpenses
        .filter((d) => d.month === m)
        .filter((d) => !alwaysExcludedCategories.includes(d.category))
        .filter((d) => !excludeSpecial || !specialCategories.includes(d.category));
      const expense = monthExp.reduce(
        (s, d) => s + (viewMode === 'household' ? d.total_spent || 0 : d.self_spent || 0),
        0
      );

      const monthInc = rawIncome
        .filter((tx) => tx.date?.substring(0, 7) === m)
        .filter((tx) => !alwaysExcludedCategories.includes(tx.category))
        .filter((tx) => !excludeSpecial || !specialCategories.includes(tx.category));
      const income = monthInc.reduce((s, tx) => {
        if (viewMode === 'household') return s + (tx.amount || 0);
        return s + (tx.user_id === currentUserId ? tx.self_amount || 0 : tx.partner_amount || 0);
      }, 0);

      const rate = income > 0 ? ((income - expense) / income) * 100 : null;
      const hasData = expense > 0 || income > 0;

      const labelDate = new Date(parseInt(m.split('-')[0]), parseInt(m.split('-')[1]) - 1, 1);
      const label = labelDate.toLocaleDateString('en-US', {
        month: 'short',
        ...(spanYears ? { year: '2-digit' } : {}),
      });

      return { month: m, rate, hasData, label };
    });
  }, [rawExpenses, rawIncome, months, viewMode, currentUserId, alwaysExcludedCategories, excludeSpecial, specialCategories, spanYears]);

  const maxAbsRate = useMemo(
    () => Math.max(...rates.filter((r) => r.rate !== null).map((r) => Math.abs(r.rate)), 1),
    [rates]
  );

  const avgRate = useMemo(() => {
    const valid = rates.filter((r) => r.rate !== null);
    return valid.length ? valid.reduce((s, r) => s + r.rate, 0) / valid.length : null;
  }, [rates]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Savings Rate</Text>
        <Text style={styles.subtitle}>% of income saved per month</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={C.indigo500} />
        </View>
      ) : (
        <View style={styles.body}>
          <View style={[styles.chartArea, { height: CONTAINER_H }]}>
            {rates.map((r) => {
              const isSelected = r.month === selectedMonth;
              const hasRate = r.rate !== null && r.hasData;
              const barPct = hasRate ? Math.max((Math.abs(r.rate) / maxAbsRate) * 80, 5) : 0;

              const barColor = !r.hasData
                ? C.gray100
                : r.rate === null
                ? C.gray100
                : r.rate >= GOAL_RATE
                ? C.green400
                : r.rate >= 0
                ? C.amber400
                : C.rose400;

              const labelColor = !r.hasData
                ? C.gray200
                : r.rate === null
                ? C.gray300
                : r.rate >= GOAL_RATE
                ? C.green500
                : r.rate >= 0
                ? C.amber500
                : C.rose500;

              return (
                <View key={r.month} style={styles.barCol}>
                  {hasRate ? (
                    <Text style={[styles.rateLabel, { color: labelColor }]}>
                      {fmtRate(r.rate)}
                    </Text>
                  ) : (
                    <Text style={styles.rateLabel}> </Text>
                  )}
                  <View
                    style={[
                      styles.bar,
                      {
                        height: hasRate ? `${barPct}%` : 2,
                        backgroundColor: barColor,
                        borderWidth: isSelected ? 2 : 0,
                        borderColor: 'rgba(0,0,0,0.15)',
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.monthLabel,
                      isSelected ? styles.monthLabelSelected : null,
                    ]}
                  >
                    {r.label}
                  </Text>
                </View>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Goal: <Text style={styles.footerBold}>{GOAL_RATE}%</Text>
            </Text>
            {avgRate !== null && (
              <Text style={styles.footerText}>
                6-mo avg:{' '}
                <Text
                  style={[
                    styles.footerBold,
                    {
                      color:
                        avgRate >= GOAL_RATE ? C.green500 : avgRate >= 0 ? C.amber500 : C.rose500,
                    },
                  ]}
                >
                  {fmtRate(avgRate)}
                </Text>
              </Text>
            )}
          </View>
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
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    gap: 3,
  },
  rateLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: C.gray400,
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  monthLabel: {
    fontSize: 9,
    fontWeight: '500',
    color: C.gray400,
    textAlign: 'center',
  },
  monthLabelSelected: {
    color: C.gray700,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: C.gray100,
  },
  footerText: {
    fontSize: 12,
    color: C.gray500,
  },
  footerBold: {
    fontWeight: '700',
    color: C.gray700,
  },
});
