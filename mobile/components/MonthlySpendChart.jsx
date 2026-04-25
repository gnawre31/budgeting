import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabaseClient';
import { cacheGet, cacheSet, cacheKey } from '../lib/queryCache';

const C = {
  white: '#FFFFFF',
  gray900: '#111827',
  gray700: '#374151',
  gray500: '#6B7280',
  gray400: '#9CA3AF',
  gray300: '#D1D5DB',
  gray200: '#E5E7EB',
  gray100: '#F3F4F6',
  indigo500: '#6366F1',
};

const CHART_H = 160;
const MAX_BAR = 110;
const NUM_MONTHS = 6;

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 0,
  }).format(n);

function getLast6Months(endMonth) {
  const [year, month] = endMonth.split('-');
  return Array.from({ length: NUM_MONTHS }, (_, i) => {
    const d = new Date(parseInt(year), parseInt(month) - 1 - (NUM_MONTHS - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

export default function MonthlySpendChart({
  selectedMonth,
  viewMode,
  alwaysExcludedCategories = [],
  refreshKey = 0,
}) {
  const [rawData, setRawData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCats, setSelectedCats] = useState(null); // null = all
  const [filterOpen, setFilterOpen] = useState(false);

  const months = useMemo(() => getLast6Months(selectedMonth), [selectedMonth]);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      const first = months[0];
      const last = months[months.length - 1];
      const key = cacheKey(user.id, 'monthly_spend_range', first, last);
      const cached = await cacheGet(key);
      if (cached && !cancelled) {
        setRawData(cached);
        setLoading(false);
        return;
      }

      const { data } = await supabase
        .from('monthly_category_spend')
        .select('month, category, total_spent, self_spent')
        .eq('user_id', user.id)
        .gte('month', first)
        .lte('month', last);

      if (cancelled) return;
      const rows = data || [];
      await cacheSet(key, rows);
      setRawData(rows);
      setLoading(false);
    };
    fetch();
    return () => { cancelled = true; };
  }, [months, refreshKey]);

  const availableCats = useMemo(() => {
    return [...new Set(rawData.map((d) => d.category))]
      .filter((c) => !alwaysExcludedCategories.includes(c))
      .sort();
  }, [rawData, alwaysExcludedCategories]);

  const isAll = selectedCats === null;

  const monthBuckets = useMemo(() => {
    const spendKey = viewMode === 'household' ? 'total_spent' : 'self_spent';
    return months.map((m) => {
      const total = Math.max(
        0,
        rawData
          .filter((d) => d.month === m)
          .filter((d) => !alwaysExcludedCategories.includes(d.category))
          .filter((d) => isAll || (selectedCats && selectedCats.has(d.category)))
          .reduce((s, d) => s + (d[spendKey] || 0), 0)
      );
      const [y, mo] = m.split('-');
      const label = new Date(parseInt(y), parseInt(mo) - 1, 1).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
      });
      return { month: m, total, label };
    });
  }, [rawData, months, viewMode, alwaysExcludedCategories, selectedCats, isAll]);

  const maxTotal = useMemo(
    () => Math.max(...monthBuckets.map((b) => b.total), 1),
    [monthBuckets]
  );

  const toggleCat = useCallback(
    (cat) => {
      setSelectedCats((prev) => {
        const next = new Set(prev === null ? availableCats : prev);
        if (next.has(cat)) next.delete(cat);
        else next.add(cat);
        if (next.size === availableCats.length) return null;
        return next;
      });
    },
    [availableCats]
  );

  const noneSelected = selectedCats !== null && selectedCats.size === 0;
  const filterLabel = isAll
    ? 'All categories'
    : noneSelected
    ? 'No categories'
    : `${selectedCats.size}/${availableCats.length} cats`;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Monthly Spend</Text>
          <Text style={styles.subtitle}>Last {NUM_MONTHS} months</Text>
        </View>
        <TouchableOpacity
          onPress={() => setFilterOpen(true)}
          style={styles.filterBtn}
        >
          <Ionicons name="options-outline" size={14} color={C.gray500} />
          <Text style={styles.filterBtnText}>{filterLabel}</Text>
        </TouchableOpacity>
      </View>

      {/* Chart */}
      <View style={[styles.chartArea, { height: CHART_H }]}>
        {monthBuckets.map((b) => {
          const isSelected = b.month === selectedMonth;
          const intensity = maxTotal > 0 ? b.total / maxTotal : 0;
          const barH = b.total > 0 ? Math.max(8, Math.round(intensity * MAX_BAR)) : 3;
          const color = isSelected
            ? C.indigo500
            : `rgba(99,102,241,${(0.12 + intensity * 0.5).toFixed(2)})`;

          return (
            <View key={b.month} style={styles.barCol}>
              {b.total > 0 && (
                <Text
                  style={[
                    styles.barLabel,
                    isSelected ? styles.barLabelSelected : null,
                  ]}
                  numberOfLines={1}
                >
                  {fmt(b.total)}
                </Text>
              )}
              <View
                style={[
                  styles.bar,
                  {
                    height: barH,
                    backgroundColor: color,
                    borderWidth: isSelected ? 2 : 0,
                    borderColor: 'rgba(99,102,241,0.4)',
                  },
                ]}
              />
              <Text
                style={[
                  styles.monthLabel,
                  isSelected ? styles.monthLabelSelected : null,
                ]}
                numberOfLines={1}
              >
                {b.label}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Category filter modal */}
      <Modal visible={filterOpen} transparent animationType="slide" onRequestClose={() => setFilterOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setFilterOpen(false)}>
          <Pressable style={styles.filterSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.filterHeader}>
              <Text style={styles.filterTitle}>Filter Categories</Text>
              <View style={styles.filterActions}>
                <TouchableOpacity onPress={() => setSelectedCats(null)}>
                  <Text style={styles.filterActionAll}>Select all</Text>
                </TouchableOpacity>
                <Text style={{ color: C.gray300 }}>  |  </Text>
                <TouchableOpacity onPress={() => setSelectedCats(new Set())}>
                  <Text style={styles.filterActionClear}>Clear</Text>
                </TouchableOpacity>
              </View>
            </View>
            <ScrollView style={styles.catList} showsVerticalScrollIndicator={false}>
              {availableCats.map((cat) => {
                const checked = isAll || (selectedCats?.has(cat) ?? false);
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => toggleCat(cat)}
                    style={styles.catRow}
                  >
                    <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
                      {checked && <Ionicons name="checkmark" size={12} color={C.white} />}
                    </View>
                    <Text style={styles.catName}>{cat}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              onPress={() => setFilterOpen(false)}
              style={styles.filterDone}
            >
              <Text style={styles.filterDoneText}>Done</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  filterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.gray100,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.gray700,
  },
  chartArea: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 8,
    gap: 4,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
    gap: 3,
  },
  barLabel: {
    fontSize: 8,
    fontWeight: '600',
    color: C.gray400,
    textAlign: 'center',
  },
  barLabelSelected: {
    color: C.indigo500,
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
    color: C.gray900,
    fontWeight: '700',
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  filterSheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '70%',
    padding: 20,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.gray900,
  },
  filterActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  filterActionAll: {
    fontSize: 13,
    fontWeight: '600',
    color: C.indigo500,
  },
  filterActionClear: {
    fontSize: 13,
    fontWeight: '600',
    color: C.gray400,
  },
  catList: {
    maxHeight: 300,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.gray300,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: C.indigo500,
    borderColor: C.indigo500,
  },
  catName: {
    fontSize: 14,
    color: C.gray700,
  },
  filterDone: {
    backgroundColor: C.gray900,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  filterDoneText: {
    color: C.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
