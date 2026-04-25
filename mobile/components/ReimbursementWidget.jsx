import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
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
  indigo100: '#E0E7FF',
  indigo50: '#EEF2FF',
  green500: '#22C55E',
  green50: '#F0FDF4',
  violet500: '#8B5CF6',
};

const MAX_VIS = 4;

const fmt = (n) =>
  new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
    maximumFractionDigits: 2,
  }).format(n);

export default function ReimbursementWidget({ refreshKey = 0 }) {
  const router = useRouter();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (bust = false) => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const key = cacheKey(user.id, 'reimbursements');
    if (!bust) {
      const cached = await cacheGet(key);
      if (cached) {
        setItems(cached);
        setLoading(false);
        return;
      }
    }

    const { data, error } = await supabase
      .from('transactions')
      .select('id, merchant, amount, partner_amount, self_amount, user_id, date, description, linked_category')
      .eq('category', 'Reimbursement')
      .is('parent_id', null)
      .or(`user_id.eq.${user.id},and(partner_id.eq.${user.id},partner_amount.gt.0)`)
      .order('date', { ascending: false });

    if (error) {
      setLoading(false);
      return;
    }

    const normalised = (data || [])
      .filter((tx) => !tx.linked_category)
      .map((tx) => ({
        id: tx.id,
        merchant: tx.merchant,
        date: tx.date,
        description: tx.description,
        amount: tx.user_id === user.id ? tx.amount : tx.partner_amount,
        isPartner: tx.user_id !== user.id,
      }));

    await cacheSet(key, normalised, 30 * 60 * 1000); // 30-min TTL
    setItems(normalised);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData(true);
  }, [refreshKey, fetchData]);

  // Refresh on focus
  useFocusEffect(
    useCallback(() => {
      fetchData(true);
    }, [fetchData])
  );

  const total = items.reduce((s, tx) => s + (tx.amount || 0), 0);
  const overflow = Math.max(0, items.length - MAX_VIS);
  const visible = overflow > 0 ? items.slice(0, MAX_VIS) : items;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Reimbursements</Text>
          <Text style={styles.subtitle}>Unreconciled items</Text>
        </View>
        {items.length > 0 && (
          <TouchableOpacity
            onPress={() => router.push('/(tabs)/reconcile')}
            style={styles.reconcileBtn}
          >
            <Text style={styles.reconcileBtnText}>Reconcile →</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Body */}
      <View style={styles.body}>
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="small" color={C.indigo500} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.allClearBox}>
            <View style={styles.checkCircle}>
              <Ionicons name="checkmark" size={20} color={C.green500} />
            </View>
            <Text style={styles.allClearText}>All clear</Text>
          </View>
        ) : (
          <>
            <View style={styles.totalRow}>
              <Text style={styles.totalAmount}>{fmt(total)}</Text>
              <Text style={styles.totalLabel}> outstanding</Text>
            </View>
            <View style={styles.itemList}>
              {visible.map((tx) => (
                <View key={tx.id} style={styles.item}>
                  <View style={styles.itemLeft}>
                    <View style={styles.itemMerchantRow}>
                      <Text style={styles.itemMerchant} numberOfLines={1}>{tx.merchant}</Text>
                      {tx.isPartner && (
                        <View style={styles.partnerBadge}>
                          <Text style={styles.partnerBadgeText}>partner</Text>
                        </View>
                      )}
                    </View>
                    {tx.description ? (
                      <Text style={styles.itemDesc} numberOfLines={1}>{tx.description}</Text>
                    ) : null}
                    <Text style={styles.itemDate}>{tx.date}</Text>
                  </View>
                  <Text style={styles.itemAmount}>{fmt(tx.amount)}</Text>
                </View>
              ))}
              {overflow > 0 && (
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/reconcile')}
                  style={styles.moreRow}
                >
                  <Text style={styles.moreText}>+{overflow} more</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </View>
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
    alignItems: 'flex-start',
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
  reconcileBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.indigo100,
    backgroundColor: C.indigo50,
  },
  reconcileBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.indigo500,
  },
  body: {
    padding: 16,
  },
  loadingBox: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  allClearBox: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  checkCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.green50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  allClearText: {
    fontSize: 14,
    fontWeight: '600',
    color: C.gray500,
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  totalAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: C.violet500,
    letterSpacing: -0.5,
  },
  totalLabel: {
    fontSize: 13,
    color: C.gray400,
  },
  itemList: {
    gap: 10,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.gray100,
  },
  itemLeft: {
    flex: 1,
    marginRight: 8,
  },
  itemMerchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  itemMerchant: {
    fontSize: 13,
    fontWeight: '500',
    color: C.gray700,
    flex: 1,
  },
  partnerBadge: {
    backgroundColor: C.gray100,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  partnerBadgeText: {
    fontSize: 9,
    fontWeight: '600',
    color: C.gray400,
  },
  itemDesc: {
    fontSize: 11,
    color: C.gray400,
    marginTop: 1,
  },
  itemDate: {
    fontSize: 10,
    color: C.gray300,
    marginTop: 2,
  },
  itemAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: C.gray900,
    flexShrink: 0,
  },
  moreRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  moreText: {
    fontSize: 12,
    fontWeight: '500',
    color: C.gray400,
  },
});
