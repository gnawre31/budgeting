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
  indigo500: '#6366F1',
  indigo600: '#4F46E5',
};

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const CHART_H = 120;
const MAX_BAR = 80;
const fmt = (n) => `$${Math.round(n).toLocaleString()}`;

export default function DayHeatmap({
  selectedMonth,
  viewMode,
  excludeSpecial = false,
  specialCategories = [],
  alwaysExcludedCategories = [],
  refreshKey = 0,
}) {
  const [rawTxns, setRawTxns] = useState([]);
  const [loading, setLoading] = useState(true);

  const { start, end } = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const endDate = new Date(y, m, 0);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 89);
    const fmtDate = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: fmtDate(startDate), end: fmtDate(endDate) };
  }, [selectedMonth]);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const key = cacheKey(user.id, 'heatmap_txns', start, end);
      const cached = await cacheGet(key);
      if (cached && !cancelled) {
        setRawTxns(cached);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('transactions')
        .select('date, amount, self_amount, partner_amount, user_id, category')
        .eq('type', 'Expense')
        .eq('exclude_from_report', false)
        .is('parent_id', null)
        .gte('date', start)
        .lte('date', end)
        .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`);

      if (cancelled) return;
      const txns = data || [];
      await cacheSet(key, txns);
      setRawTxns(txns);
      setLoading(false);
    };
    fetch();
    return () => { cancelled = true; };
  }, [start, end]);

  const dayBuckets = useMemo(() => {
    const filtered = rawTxns
      .filter((tx) => !alwaysExcludedCategories.includes(tx.category))
      .filter((tx) => !excludeSpecial || !specialCategories.includes(tx.category));

    const sums = Array(7).fill(0);
    const counts = Array(7).fill(0);

    filtered.forEach((tx) => {
      const d = new Date(tx.date + 'T00:00:00');
      const dow = (d.getDay() + 6) % 7; // Mon=0
      const amt = viewMode === 'household' ? tx.amount || 0 : tx.self_amount || 0;
      sums[dow] += amt;
      counts[dow]++;
    });

    return DAYS.map((label, i) => ({
      label,
      avg: counts[i] > 0 ? sums[i] / counts[i] : 0,
      count: counts[i],
    }));
  }, [rawTxns, viewMode, alwaysExcludedCategories, excludeSpecial, specialCategories]);

  const maxAvg = useMemo(
    () => Math.max(...dayBuckets.map((d) => d.avg), 1),
    [dayBuckets]
  );

  const peakIdx = useMemo(() => {
    let best = 0;
    dayBuckets.forEach((d, i) => {
      if (d.avg > dayBuckets[best].avg) best = i;
    });
    return best;
  }, [dayBuckets]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Spending by Day</Text>
        <Text style={styles.subtitle}>Avg daily spend (90 days)</Text>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={C.indigo500} />
        </View>
      ) : (
        <View style={styles.body}>
          <View style={[styles.chartArea, { height: CHART_H }]}>
            {dayBuckets.map((d, i) => {
              const intensity = maxAvg > 0 ? d.avg / maxAvg : 0;
              const barH = Math.max(d.avg > 0 ? 6 : 0, Math.round(intensity * MAX_BAR));
              const isPeak = i === peakIdx && d.avg > 0;
              const color = isPeak
                ? C.indigo500
                : `rgba(99,102,241,${(0.1 + intensity * 0.45).toFixed(2)})`;

              return (
                <View key={d.label} style={styles.barCol}>
                  {d.avg > 0 ? (
                    <Text
                      style={[styles.avgLabel, isPeak ? styles.avgLabelPeak : null]}
                      numberOfLines={1}
                    >
                      {fmt(d.avg)}
                    </Text>
                  ) : (
                    <Text style={styles.avgLabel}> </Text>
                  )}
                  <View
                    style={[
                      styles.bar,
                      { height: barH, backgroundColor: color },
                    ]}
                  />
                </View>
              );
            })}
          </View>

          {/* Day labels */}
          <View style={styles.dayRow}>
            {dayBuckets.map((d, i) => {
              const isPeak = i === peakIdx && d.avg > 0;
              return (
                <View key={d.label} style={styles.dayLabelWrapper}>
                  <Text
                    style={[
                      styles.dayLabel,
                      isPeak ? styles.dayLabelPeak : null,
                    ]}
                  >
                    {d.label}
                  </Text>
                </View>
              );
            })}
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
    gap: 8,
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
  avgLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: C.gray400,
    textAlign: 'center',
  },
  avgLabelPeak: {
    color: C.indigo500,
  },
  bar: {
    width: '100%',
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
  dayRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.gray100,
    paddingTop: 8,
    gap: 4,
  },
  dayLabelWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  dayLabel: {
    fontSize: 10,
    fontWeight: '500',
    color: C.gray400,
  },
  dayLabelPeak: {
    color: C.indigo600,
    fontWeight: '700',
  },
});
