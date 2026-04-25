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
  indigo400: '#818CF8',
  indigo500: '#6366F1',
  rose500: '#F43F5E',
  rose50: '#FFF1F2',
  green500: '#22C55E',
  green50: '#F0FDF4',
};

const fmt = (n) => `$${Math.round(n).toLocaleString()}`;

function prevMonthOf(m) {
  const [y, mo] = m.split('-');
  const d = new Date(parseInt(y), parseInt(mo) - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function MoMComparison({
  selectedMonth,
  viewMode,
  excludeSpecial = false,
  specialCategories = [],
  alwaysExcludedCategories = [],
  refreshKey = 0,
}) {
  const prevMonth = useMemo(() => prevMonthOf(selectedMonth), [selectedMonth]);

  const [rawCurrent, setRawCurrent] = useState([]);
  const [rawPrev, setRawPrev] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const curKey = cacheKey(user.id, 'monthly_spend', selectedMonth);
      const prvKey = cacheKey(user.id, 'monthly_spend', prevMonth);
      const cachedCur = await cacheGet(curKey);
      const cachedPrv = await cacheGet(prvKey);

      if (cachedCur && cachedPrv && !cancelled) {
        setRawCurrent(cachedCur);
        setRawPrev(cachedPrv);
        setLoading(false);
        return;
      }

      const [{ data: cur }, { data: prv }] = await Promise.all([
        supabase
          .from('monthly_category_spend')
          .select('category, total_spent, self_spent')
          .eq('user_id', user.id)
          .eq('month', selectedMonth),
        supabase
          .from('monthly_category_spend')
          .select('category, total_spent, self_spent')
          .eq('user_id', user.id)
          .eq('month', prevMonth),
      ]);

      if (cancelled) return;
      const current = cur || [];
      const prev = prv || [];
      await cacheSet(curKey, current);
      await cacheSet(prvKey, prev);
      setRawCurrent(current);
      setRawPrev(prev);
      setLoading(false);
    };
    fetch();
    return () => { cancelled = true; };
  }, [selectedMonth, prevMonth, refreshKey]);

  const rows = useMemo(() => {
    const spendKey = viewMode === 'household' ? 'total_spent' : 'self_spent';
    const filter = (d) =>
      !alwaysExcludedCategories.includes(d.category) &&
      (!excludeSpecial || !specialCategories.includes(d.category));

    const cats = new Set([
      ...rawCurrent.filter(filter).map((d) => d.category),
      ...rawPrev.filter(filter).map((d) => d.category),
    ]);

    return Array.from(cats)
      .map((cat) => {
        const cur = rawCurrent.find((d) => d.category === cat)?.[spendKey] || 0;
        const prv = rawPrev.find((d) => d.category === cat)?.[spendKey] || 0;
        return { cat, cur, prv, delta: cur - prv };
      })
      .filter((r) => r.cur > 0 || r.prv > 0)
      .sort((a, b) => b.cur - a.cur);
  }, [rawCurrent, rawPrev, viewMode, alwaysExcludedCategories, excludeSpecial, specialCategories]);

  const maxVal = useMemo(() => Math.max(...rows.flatMap((r) => [r.cur, r.prv]), 1), [rows]);

  const prevLabel = useMemo(() => {
    const [y, m] = prevMonth.split('-');
    return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
    });
  }, [prevMonth]);

  const curLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-');
    return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
    });
  }, [selectedMonth]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Month-over-Month</Text>
          <Text style={styles.subtitle}>Spending by category</Text>
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: C.gray400 }]} />
            <Text style={styles.legendText}>{prevLabel}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: C.indigo400 }]} />
            <Text style={styles.legendText}>{curLabel}</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={C.indigo500} />
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No spending data</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {rows.map(({ cat, cur, prv, delta }) => {
            const significant = Math.abs(delta) > 30;
            return (
              <View key={cat} style={styles.row}>
                <View style={styles.rowHeader}>
                  <Text style={styles.catName} numberOfLines={1}>{cat}</Text>
                  <View style={styles.rowRight}>
                    {significant && (
                      <View
                        style={[
                          styles.deltaBadge,
                          delta > 0 ? styles.deltaBadgeUp : styles.deltaBadgeDown,
                        ]}
                      >
                        <Text
                          style={[
                            styles.deltaBadgeText,
                            delta > 0 ? styles.deltaUp : styles.deltaDown,
                          ]}
                        >
                          {delta > 0 ? '↑' : '↓'} {fmt(Math.abs(delta))}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.curAmount}>{fmt(cur)}</Text>
                  </View>
                </View>
                {/* Bars */}
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${(prv / maxVal) * 100}%`, backgroundColor: '#D1D5DB' },
                    ]}
                  />
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${(cur / maxVal) * 100}%`, backgroundColor: C.indigo400 },
                    ]}
                  />
                </View>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  legend: {
    flexDirection: 'row',
    gap: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 6,
    borderRadius: 3,
  },
  legendText: {
    fontSize: 11,
    color: C.gray400,
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
    gap: 12,
  },
  row: {
    gap: 4,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  catName: {
    fontSize: 13,
    fontWeight: '600',
    color: C.gray700,
    flex: 1,
    marginRight: 8,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deltaBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  deltaBadgeUp: {
    backgroundColor: '#FFF1F2',
  },
  deltaBadgeDown: {
    backgroundColor: '#F0FDF4',
  },
  deltaBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  deltaUp: {
    color: C.rose500,
  },
  deltaDown: {
    color: C.green500,
  },
  curAmount: {
    fontSize: 12,
    color: C.gray500,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 5,
    backgroundColor: C.gray100,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
});
