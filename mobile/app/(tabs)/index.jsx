import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCategories } from '../../hooks/useCategories';
import KPIStrip from '../../components/KPIStrip';
import MonthlySpendChart from '../../components/MonthlySpendChart';
import MoMComparison from '../../components/MoMComparison';
import SpendingBreakdown from '../../components/SpendingBreakdown';
import SavingsRateTrend from '../../components/SavingsRateTrend';
import DiscretionaryRatio from '../../components/DiscretionaryRatio';
import DayHeatmap from '../../components/DayHeatmap';
import ReimbursementWidget from '../../components/ReimbursementWidget';
import LargestTransactions from '../../components/LargestTransactions';

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
  indigo500: '#6366F1',
  indigo100: '#E0E7FF',
  indigo50: '#EEF2FF',
  violet500: '#8B5CF6',
  violet50: '#F5F3FF',
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function MonthPickerModal({ visible, selectedMonth, onClose, onChange }) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthNum = now.getMonth() + 1;

  const [selYear, selMo] = selectedMonth.split('-').map(Number);
  const [pickerYear, setPickerYear] = useState(selYear);

  const isFuture = (mo) =>
    pickerYear > currentYear || (pickerYear === currentYear && mo > currentMonthNum);

  const handleSelect = (mo) => {
    if (isFuture(mo)) return;
    onChange(`${pickerYear}-${String(mo).padStart(2, '0')}`);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.pickerCard} onPress={(e) => e.stopPropagation()}>
          {/* Year nav */}
          <View style={styles.yearRow}>
            <TouchableOpacity
              onPress={() => setPickerYear((y) => y - 1)}
              style={styles.yearBtn}
            >
              <Ionicons name="chevron-back" size={18} color={C.gray500} />
            </TouchableOpacity>
            <Text style={styles.yearLabel}>{pickerYear}</Text>
            <TouchableOpacity
              onPress={() => setPickerYear((y) => Math.min(y + 1, currentYear))}
              disabled={pickerYear >= currentYear}
              style={styles.yearBtn}
            >
              <Ionicons
                name="chevron-forward"
                size={18}
                color={pickerYear >= currentYear ? C.gray300 : C.gray500}
              />
            </TouchableOpacity>
          </View>

          {/* Month grid */}
          <View style={styles.monthGrid}>
            {MONTH_LABELS.map((label, i) => {
              const mo = i + 1;
              const future = isFuture(mo);
              const sel = pickerYear === selYear && mo === selMo;
              return (
                <TouchableOpacity
                  key={label}
                  onPress={() => handleSelect(mo)}
                  disabled={future}
                  style={[
                    styles.monthBtn,
                    sel && styles.monthBtnSelected,
                    future && styles.monthBtnFuture,
                  ]}
                >
                  <Text
                    style={[
                      styles.monthBtnText,
                      sel && styles.monthBtnTextSelected,
                      future && styles.monthBtnTextFuture,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function DashboardScreen() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [viewMode, setViewMode] = useState('household');
  const [excludeSpecial, setExcludeSpecial] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [showMonthPicker, setShowMonthPicker] = useState(false);

  const { specialCategories, alwaysExcludedCategories, fixedCategories } = useCategories();

  const currentMonth = getCurrentMonth();

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      setRefreshKey((k) => k + 1);
    }, [])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 800);
  }, []);

  const handlePrevMonth = () => {
    const [year, month] = selectedMonth.split('-');
    const d = new Date(parseInt(year), parseInt(month) - 2, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [year, month] = selectedMonth.split('-');
    const d = new Date(parseInt(year), parseInt(month), 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (next <= currentMonth) setSelectedMonth(next);
  };

  const isCurrentMonth = selectedMonth >= currentMonth;
  const hasSpecialCategories = specialCategories.length > 0;

  const [selYear, selMo] = selectedMonth.split('-').map(Number);
  const displayName = new Date(selYear, selMo - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const sharedProps = {
    selectedMonth,
    viewMode,
    excludeSpecial,
    specialCategories,
    alwaysExcludedCategories,
    refreshKey,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Sticky header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Dashboard</Text>

          <View style={styles.controls}>
            {/* Special filter toggle */}
            {hasSpecialCategories && (
              <TouchableOpacity
                onPress={() => setExcludeSpecial((v) => !v)}
                style={[styles.specialBtn, excludeSpecial && styles.specialBtnActive]}
              >
                <Ionicons
                  name="sparkles"
                  size={14}
                  color={excludeSpecial ? C.violet500 : C.gray400}
                />
              </TouchableOpacity>
            )}

            {/* View toggle */}
            <View style={styles.viewToggle}>
              <TouchableOpacity
                onPress={() => setViewMode('household')}
                style={[styles.viewBtn, viewMode === 'household' && styles.viewBtnActive]}
              >
                <Text
                  style={[
                    styles.viewBtnText,
                    viewMode === 'household' && styles.viewBtnTextActive,
                  ]}
                >
                  Household
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setViewMode('self')}
                style={[styles.viewBtn, viewMode === 'self' && styles.viewBtnActive]}
              >
                <Text
                  style={[
                    styles.viewBtnText,
                    viewMode === 'self' && styles.viewBtnTextActive,
                  ]}
                >
                  Just Me
                </Text>
              </TouchableOpacity>
            </View>

            {/* Month navigator */}
            <View style={styles.monthNav}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.arrowBtn}>
                <Ionicons name="chevron-back" size={16} color={C.gray500} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setShowMonthPicker(true)}
                style={styles.monthLabel}
              >
                <Text style={styles.monthLabelText}>{displayName}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleNextMonth}
                disabled={isCurrentMonth}
                style={styles.arrowBtn}
              >
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={isCurrentMonth ? C.gray300 : C.gray500}
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Special filter banner */}
        {excludeSpecial && specialCategories.length > 0 && (
          <View style={styles.specialBanner}>
            <Ionicons name="sparkles" size={12} color={C.violet500} />
            <Text style={styles.specialBannerText}>
              Excluding: {specialCategories.join(', ')}
            </Text>
            <TouchableOpacity onPress={() => setExcludeSpecial(false)}>
              <Text style={styles.specialBannerClear}>Clear</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Month picker modal */}
      <MonthPickerModal
        visible={showMonthPicker}
        selectedMonth={selectedMonth}
        onClose={() => setShowMonthPicker(false)}
        onChange={(m) => { setSelectedMonth(m); setShowMonthPicker(false); }}
      />

      {/* Scrollable body */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.indigo500} />
        }
        showsVerticalScrollIndicator={false}
      >
        <KPIStrip {...sharedProps} fixedCategories={fixedCategories} />
        <MonthlySpendChart
          selectedMonth={selectedMonth}
          viewMode={viewMode}
          alwaysExcludedCategories={alwaysExcludedCategories}
          refreshKey={refreshKey}
        />
        <MoMComparison {...sharedProps} />
        <SpendingBreakdown {...sharedProps} />
        <SavingsRateTrend {...sharedProps} />
        <DiscretionaryRatio {...sharedProps} fixedCategories={fixedCategories} />
        <DayHeatmap {...sharedProps} />
        <ReimbursementWidget refreshKey={refreshKey} />
        <LargestTransactions {...sharedProps} />
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F5F5F7',
  },
  header: {
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: C.gray200,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.gray900,
    letterSpacing: -0.3,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  specialBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  specialBtnActive: {
    backgroundColor: '#F5F3FF',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: C.gray100,
    borderRadius: 10,
    padding: 2,
  },
  viewBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  viewBtnActive: {
    backgroundColor: C.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  viewBtnText: {
    fontSize: 11,
    fontWeight: '500',
    color: C.gray500,
  },
  viewBtnTextActive: {
    color: C.gray900,
    fontWeight: '600',
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.gray100,
    borderRadius: 10,
    padding: 2,
  },
  arrowBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  monthLabel: {
    paddingHorizontal: 6,
  },
  monthLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: C.gray700,
  },
  specialBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F5F3FF',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 8,
  },
  specialBannerText: {
    fontSize: 11,
    color: C.violet500,
    flex: 1,
  },
  specialBannerClear: {
    fontSize: 11,
    fontWeight: '600',
    color: C.violet500,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 12,
    gap: 12,
  },
  // Month picker modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 20,
    width: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 12,
  },
  yearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  yearBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: C.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: C.gray900,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthBtn: {
    width: '30%',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  monthBtnSelected: {
    backgroundColor: C.gray900,
  },
  monthBtnFuture: {
    opacity: 0.3,
  },
  monthBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: C.gray700,
  },
  monthBtnTextSelected: {
    color: C.white,
    fontWeight: '700',
  },
  monthBtnTextFuture: {
    color: C.gray400,
  },
});
