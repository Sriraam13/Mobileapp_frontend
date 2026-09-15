import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDineInSessionStore } from '../store/useDineInSessionStore';
import { orderApi } from '../services/apiService';

interface DineInActiveBannerProps {
  bottomOffset?: number;
}

export default function DineInActiveBanner({ bottomOffset }: DineInActiveBannerProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    isActive,
    tableNumber,
    activeOrderId,
    activeDbOrderId,
    orderedItems,
    totalAmount,
    completeDineInSession,
  } = useDineInSessionStore();

  const [isSettleModalVisible, setIsSettleModalVisible] = useState(false);

  if (!isActive || !activeOrderId) {
    return null;
  }

  const defaultBottom = (Platform.OS === 'android' ? 68 : 60) + insets.bottom + 10;
  const computedBottom = bottomOffset !== undefined ? bottomOffset : defaultBottom;

  const handleOrderMore = () => {
    setIsSettleModalVisible(false);
    router.replace({
      pathname: '/menu',
      params: {
        orderType: 'Dine In',
        tableNumber: tableNumber || '',
      },
    });
  };

  const handleNavigateToPayment = () => {
    setIsSettleModalVisible(false);
    router.push({
      pathname: '/(checkout)/payment',
      params: {
        isDineInSettlement: 'true',
        orderId: activeOrderId,
        dbOrderId: activeDbOrderId ? String(activeDbOrderId) : '',
        tableNumber: tableNumber || 'T-01',
        totalAmount: totalAmount.toString(),
        cartItems: JSON.stringify(orderedItems),
      },
    });
  };

  return (
    <>
      {/* Floating Active Dine-In Bar */}
      <View style={[styles.bannerContainer, { bottom: computedBottom }]}>
        <View style={styles.bannerCard}>
          <View style={styles.bannerLeft}>
            <View style={styles.tableBadge}>
              <Ionicons name="restaurant" size={14} color="#00a01d" />
              <Text style={styles.tableBadgeText}>{tableNumber || 'Table'}</Text>
            </View>
            <View style={styles.infoCol}>
              <Text style={styles.orderIdText}>{activeOrderId} • In Kitchen</Text>
              <Text style={styles.totalText}>
                {orderedItems.reduce((sum, item) => sum + item.quantity, 0)} items • Rs.{' '}
                {totalAmount.toFixed(0)}
              </Text>
            </View>
          </View>

          <View style={styles.actionsRight}>
            <TouchableOpacity
              style={styles.orderMoreBtn}
              onPress={handleOrderMore}
              activeOpacity={0.8}
            >
              <Ionicons name="add-circle-outline" size={14} color="#ff3400" />
              <Text style={styles.orderMoreBtnText}>Order More</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.completeBtn}
              onPress={() => setIsSettleModalVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.completeBtnText}>Pay Bill</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Bill Settlement Modal */}
      <Modal
        visible={isSettleModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsSettleModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsSettleModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.bottomSheet}>
            <View style={styles.dragHandle} />

            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>Complete Meal & Pay</Text>
                <Text style={styles.sheetSub}>
                  {tableNumber || 'Table'} • Order #{activeOrderId}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setIsSettleModalVisible(false)}
                style={styles.closeModalBtn}
              >
                <Ionicons name="close" size={20} color="#666" />
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionHeading}>Items Ordered in this Session</Text>
            <ScrollView
              style={styles.itemsScroll}
              contentContainerStyle={{ paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
            >
              {orderedItems.map((item, index) => (
                <View key={`${item.id}-${index}`} style={styles.billItemRow}>
                  <View style={styles.billItemLeft}>
                    <Text style={styles.billItemQty}>{item.quantity}x</Text>
                    <Text style={styles.billItemName} numberOfLines={1}>
                      {item.name}
                    </Text>
                  </View>
                  <Text style={styles.billItemPrice}>
                    Rs. {(item.price * item.quantity).toFixed(0)}
                  </Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Grand Total Due</Text>
              <Text style={styles.totalValue}>Rs. {totalAmount.toFixed(0)}</Text>
            </View>

            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={styles.orderMoreSheetBtn}
                onPress={handleOrderMore}
                activeOpacity={0.8}
              >
                <Ionicons name="fast-food-outline" size={16} color="#ff3400" />
                <Text style={styles.orderMoreSheetBtnText}>Order More Food</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.payNowBtn}
                onPress={handleNavigateToPayment}
                activeOpacity={0.85}
              >
                <Ionicons name="arrow-forward-circle-outline" size={18} color="#fff" />
                <Text style={styles.payNowBtnText}>
                  Pay & Complete Meal (Rs. {totalAmount.toFixed(0)})
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    left: 14,
    right: 14,
    zIndex: 98,
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e1e1e',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    borderWidth: 1,
    borderColor: '#333',
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  tableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
  },
  tableBadgeText: {
    color: '#00a01d',
    fontWeight: 'bold',
    fontSize: 12,
  },
  infoCol: {
    flex: 1,
  },
  orderIdText: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '600',
  },
  totalText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
    marginTop: 2,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  orderMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#fff0eb',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
  },
  orderMoreBtnText: {
    color: '#ff3400',
    fontSize: 11,
    fontWeight: '700',
  },
  completeBtn: {
    backgroundColor: '#00a01d',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  completeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111',
  },
  sheetSub: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  closeModalBtn: {
    padding: 6,
  },
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#555',
    marginBottom: 8,
    marginTop: 4,
  },
  itemsScroll: {
    maxHeight: 180,
    marginBottom: 12,
  },
  billItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f7f7f7',
  },
  billItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  billItemQty: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#ff3400',
    width: 24,
  },
  billItemName: {
    fontSize: 13,
    color: '#222',
    flex: 1,
  },
  billItemPrice: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    padding: 12,
    borderRadius: 12,
    marginBottom: 14,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#00a01d',
  },
  paymentMethodsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  paymentOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  paymentOptionActive: {
    borderColor: '#00a01d',
    backgroundColor: '#e8f5e9',
  },
  paymentOptionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  paymentOptionTextActive: {
    color: '#00a01d',
    fontWeight: 'bold',
  },
  sheetActions: {
    gap: 10,
  },
  orderMoreSheetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ff3400',
    backgroundColor: '#fff',
  },
  orderMoreSheetBtnText: {
    color: '#ff3400',
    fontSize: 14,
    fontWeight: 'bold',
  },
  payNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00a01d',
    borderRadius: 24,
    paddingVertical: 14,
  },
  payNowBtnDisabled: {
    opacity: 0.6,
  },
  payNowBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
});
