import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  ScrollView,
  BackHandler,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCartStore, useRestaurantStore, useLiveOrderStore } from '../../store';
import { useAuthStore } from '../../store/useAuthStore';
import { orderApi, customerApi, deliveryApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import { formatTime } from '../../utils/dateUtils';

const UDIPI_GREEN = '#00a01d';

export default function DeliveryCompletedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { clearCart, addItem, setOrderType } = useCartStore();
  const { customerId } = useAuthStore();
  const { selectedOutlet } = useRestaurantStore();

  const params = useLocalSearchParams<{
    orderId: string;
    dbOrderId?: string;
    totalAmount?: string;
    paymentMethod?: string;
    cart?: string;
    date?: string;
    phone?: string;
    discountAmount?: string;
    discountCode?: string;
    orderType?: string;
    subtotal?: string;
    customerName?: string;
    orderStatus?: string;
    billNo?: string;
    riderName?: string;
  }>();

  // ── Derived values ──
  const rawIdDigits = String(params.dbOrderId || params.orderId || '').replace(/\D/g, '');
  const displayOrderId = rawIdDigits ? `ORD-${rawIdDigits}` : (params.orderId || 'ORD-000000');
  const feedbackOrderId = params.dbOrderId || rawIdDigits || displayOrderId;

  const [loading, setLoading] = useState(() => Boolean(params.dbOrderId || rawIdDigits));
  const [orderData, setOrderData] = useState<any>(null);
  const [trackingData, setTrackingData] = useState<any>(null);
  const [loyaltyPoints, setLoyaltyPoints] = useState<number | null>(null);

  // ── Feedback State ──
  const [recommendation, setRecommendation] = useState<'RECOMMENDED' | 'NOT_RECOMMENDED' | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);

  const POSITIVE_TAGS = ['On-time delivery', 'Hot & fresh food', 'Polite rider', 'Great packing'];
  const CRITIQUE_TAGS = ['Late delivery', 'Cold food', 'Damaged packing', 'Missing items'];
  const TAGS = recommendation === 'NOT_RECOMMENDED' ? CRITIQUE_TAGS : POSITIVE_TAGS;

  const toggleTag = (tag: string) =>
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );

  // ── Animation Values (1:1 identical to takeaway screen) ──
  const [headerScale] = useState(() => new Animated.Value(0.85));
  const [cardOpacity] = useState(() => new Animated.Value(0));
  const [cardTranslateY] = useState(() => new Animated.Value(30));

  // ── Navigation ──
  const handleReturnHome = () => {
    try {
      useLiveOrderStore.getState().clearLiveOrder();
    } catch (_) {}
    router.dismissAll();
    router.replace('/(main)/home' as any);
  };

  useEffect(() => {
    useLiveOrderStore.getState().clearLiveOrder();

    Animated.sequence([
      Animated.spring(headerScale, { toValue: 1, useNativeDriver: true, tension: 60 }),
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
        Animated.timing(cardTranslateY, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
    ]).start();

    const onBack = () => {
      handleReturnHome();
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);

  // ── Data Fetching (Delivery endpoints preserved) ──
  useEffect(() => {
    const dbId = params.dbOrderId || rawIdDigits;
    if (!dbId) {
      return;
    }

    const fetchRealData = async () => {
      try {
        const restaurantId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : null;
        if (!restaurantId) throw new Error('Restaurant context is unavailable for this order');

        const results = await Promise.allSettled([
          orderApi.getOrderDetails(dbId, restaurantId),
          deliveryApi.getOrderTracking(dbId),
        ]);

        if (results[0].status === 'fulfilled' && results[0].value?.order) {
          setOrderData(results[0].value);
        }
        if (results[1].status === 'fulfilled') {
          setTrackingData(results[1].value);
        }

        // Fetch loyalty transactions
        try {
          const lData = customerId ? await customerApi.getLoyalty(Number(customerId)).catch(() => null) : null;
          if (lData) {
            const txs = lData.recent_transactions || lData.transactions || [];
            const txForOrder = txs.find((t: any) => String(t.order_id) === String(dbId));
            if (txForOrder && txForOrder.points) {
              setLoyaltyPoints(txForOrder.points);
            }
          }
        } catch (_) {}
      } catch (err) {
        console.warn('Failed to load completed delivery data', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRealData();
  }, [params.dbOrderId, rawIdDigits, selectedOutlet]);

  const items = orderData?.items?.length ? orderData.items : (() => {
    try {
      const rawCart = params.cart || (params as any).cartData || (params as any).cartItems;
      if (rawCart && rawCart !== '[object Object]') {
        const parsed = typeof rawCart === 'string' ? JSON.parse(rawCart) : rawCart;
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (_) {}
    return [];
  })();

  const itemsSubtotal = items.reduce(
    (acc: number, item: any) => acc + (Number(item.price || item.unit_price || item.price_at_order || 0) * (item.quantity || item.qty || 1)),
    0
  );
  const subtotal = itemsSubtotal > 0 ? itemsSubtotal : Number(orderData?.order?.subtotal || params.subtotal || 0);

  // Delivery fee is strictly 0 Rs for all delivery orders as requested
  const deliveryFee = 0.0;
  const packagingFee = Number(orderData?.order?.packaging_fee || 0);
  const gstAmt = Number(orderData?.order?.gst_amount || 0);
  const discountAmt = Number(orderData?.order?.discount_amount || params.discountAmount || 0);

  // Guarantee totalAmount mathematically matches the breakdown items on screen:
  // Item Subtotal + Packaging + GST - Discount + Delivery Fee (Rs. 0)
  const calculatedBreakdownTotal = Math.max(0, subtotal + packagingFee + gstAmt - discountAmt);
  const rawDbTotal = Number(orderData?.order?.total_amount || params.totalAmount || 0);
  const rawDbDelivFee = Number(orderData?.order?.delivery_fee || 0);
  const safeDbTotal = Math.max(0, rawDbTotal - rawDbDelivFee);

  const totalAmount = (subtotal > 0)
    ? calculatedBreakdownTotal
    : (safeDbTotal > 0 ? safeDbTotal : calculatedBreakdownTotal);

  const rawMethod = orderData?.order?.payment_method || params.paymentMethod || 'UPI';
  const paymentMethod = (!rawMethod || rawMethod.toLowerCase().includes('cash') || rawMethod.toLowerCase().includes('cod') || rawMethod.toLowerCase().includes('counter'))
    ? 'UPI'
    : (rawMethod.toLowerCase().includes('upi') || rawMethod.toLowerCase().includes('razorpay') ? 'UPI' : rawMethod);
  const billNumber = orderData?.order?.bill_no || params.billNo || null;
  const completedTime = formatTime(orderData?.order?.delivered_at || params.date);

  const calculatedLoyaltyPoints = loyaltyPoints || Math.max(1, Math.round(totalAmount / 10));

  const submitFeedback = async () => {
    if (recommendation === null) {
      Alert.alert('Feedback Required', 'Please select Recommended or Not Recommended before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      const apiTags = selectedTags.map(t =>
        t === 'Great packing' ? 'GREAT_PACKAGING' : t.toUpperCase().replace(/ /g, '_')
      );
      const starRating = recommendation === 'RECOMMENDED' ? 5 : 0;
      const res = await orderApi.submitFeedback(feedbackOrderId, {
        rating: starRating,
        feedback_tags: [recommendation, ...apiTags],
      } as any);

      if (res?.success) {
        setFeedbackDone(true);
        Alert.alert('Thank you! 🎉', res.message || 'Your feedback has been submitted.');
      } else {
        Alert.alert('Error', 'Could not submit feedback. Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Network error submitting feedback.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReorder = () => {
    clearCart();
    setOrderType('Delivery');

    items.forEach((item: any) => {
      const realItemId = item.menu_item_id || item.menuItemId || item.id;
      addItem({
        id: realItemId,
        name: item.name || item.itemName || 'Item',
        price: Number(item.price || item.unit_price || 0),
        quantity: item.quantity || item.qty || 1,
        image: getFullImageUrl(item.image || item.image_url, item.name || item.itemName),
        category: item.category || 'General',
      });
    });
    Alert.alert('Reordered', 'Items have been added back to your cart.');
    router.dismissAll();
    router.replace('/(checkout)/delivery-checkout' as any);
  };

  const handleDownloadInvoice = () => {
    router.push({
      pathname: '/(checkout)/invoice' as any,
      params: {
        orderId: displayOrderId,
        dbOrderId: params.dbOrderId || feedbackOrderId,
        billNo: billNumber ? String(billNumber) : '',
        finalTotal: totalAmount.toString(),
        subtotal: subtotal.toString(),
        mobileNumber: params.phone || orderData?.order?.customer_phone || 'DELIVERY',
        customerName: params.customerName || orderData?.order?.customer_name || 'REGISTERED',
        paymentMethod: paymentMethod,
        cartData: JSON.stringify(items),
        discountAmount: discountAmt.toString(),
        discountCode: params.discountCode || '',
        orderType: 'Delivery',
      },
    });
  };

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={UDIPI_GREEN} />
        <Text style={{ marginTop: 14, color: '#666', fontWeight: '600' }}>Loading your order details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* ── Header (Exact Takeaway UI & Curved Udipi Green) ── */}
      <Animated.View
        style={[
          styles.header,
          { paddingTop: insets.top + 28, backgroundColor: UDIPI_GREEN },
          { transform: [{ scale: headerScale }] },
        ]}
      >
        {/* Icon circle */}
        <View style={styles.iconCircle}>
          <Ionicons name="bicycle-outline" size={30} color={UDIPI_GREEN} />
        </View>
        <Text style={styles.headerTitle}>Delivered!</Text>
        <Text style={styles.headerSubtitle}>
          Order completed at {completedTime}  •  {paymentMethod ? `Paid (${paymentMethod})` : 'Paid'}  •  Total Rs. {totalAmount.toFixed(0)}
        </Text>

        {/* Highlighted Bill Number Badge */}
        {billNumber ? (
          <View style={styles.billBadge}>
            <Ionicons name="receipt" size={15} color="#15803d" />
            <Text style={styles.billBadgeLabel}>BILL NUMBER</Text>
            <Text style={styles.billBadgeValue}>#{billNumber}</Text>
          </View>
        ) : null}
      </Animated.View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 200 }]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          style={{ opacity: cardOpacity, transform: [{ translateY: cardTranslateY }] }}
        >
          {/* ── Loyalty Points Card ── */}
          <View style={styles.loyaltyCard}>
            <View style={styles.loyaltyLeft}>
              <Ionicons name="gift-outline" size={18} color={UDIPI_GREEN} />
              <Text style={styles.loyaltyLabel}>Data Udipi Club Points</Text>
            </View>
            <Text style={styles.loyaltyPoints}>+{calculatedLoyaltyPoints} points</Text>
          </View>

          {/* ── Feedback Card ── */}
          <View style={styles.card}>
            <Text style={styles.feedbackQuestion}>How was your delivery experience?</Text>

            {/* Recommendation Buttons */}
            <View style={styles.recommendRow}>
              <TouchableOpacity
                style={[
                  styles.recommendBtn,
                  recommendation === 'RECOMMENDED' && styles.recommendBtnActive,
                ]}
                onPress={() => {
                  if (!feedbackDone) {
                    setRecommendation('RECOMMENDED');
                    setSelectedTags([]);
                  }
                }}
                activeOpacity={0.8}
                disabled={feedbackDone}
              >
                <Ionicons
                  name={recommendation === 'RECOMMENDED' ? 'thumbs-up' : 'thumbs-up-outline'}
                  size={20}
                  color={recommendation === 'RECOMMENDED' ? UDIPI_GREEN : '#6b7280'}
                />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={[
                    styles.recommendText,
                    recommendation === 'RECOMMENDED' && styles.recommendTextActive,
                  ]}
                >
                  Recommended
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.notRecommendBtn,
                  recommendation === 'NOT_RECOMMENDED' && styles.notRecommendBtnActive,
                ]}
                onPress={() => {
                  if (!feedbackDone) {
                    setRecommendation('NOT_RECOMMENDED');
                    setSelectedTags([]);
                  }
                }}
                activeOpacity={0.8}
                disabled={feedbackDone}
              >
                <Ionicons
                  name={recommendation === 'NOT_RECOMMENDED' ? 'thumbs-down' : 'thumbs-down-outline'}
                  size={20}
                  color={recommendation === 'NOT_RECOMMENDED' ? '#dc2626' : '#6b7280'}
                />
                <Text
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                  style={[
                    styles.notRecommendText,
                    recommendation === 'NOT_RECOMMENDED' && styles.notRecommendTextActive,
                  ]}
                >
                  Not Recommended
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quick Tags Section Header */}
            {recommendation && (
              <Text style={styles.tagSectionTitle}>
                {recommendation === 'RECOMMENDED' ? 'WHAT DID YOU LIKE MOST?' : 'WHAT CAN WE IMPROVE?'}
              </Text>
            )}

            {/* Quick Tags */}
            <View style={styles.tagsWrap}>
              {TAGS.map(tag => {
                const selected = selectedTags.includes(tag);
                return (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => !feedbackDone && toggleTag(tag)}
                    style={[styles.tagPill, selected && styles.tagPillSelected]}
                    activeOpacity={0.8}
                    disabled={feedbackDone}
                  >
                    <Text style={[styles.tagText, selected && styles.tagTextSelected]}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Submit / Done */}
            {feedbackDone ? (
              <View style={styles.feedbackDoneRow}>
                <Ionicons name="checkmark-circle" size={18} color={UDIPI_GREEN} />
                <Text style={styles.feedbackDoneText}>Feedback submitted — thank you!</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.submitBtn, recommendation === null && styles.submitBtnDisabled]}
                onPress={submitFeedback}
                activeOpacity={0.8}
                disabled={submitting || recommendation === null}
              >
                {submitting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Feedback</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* ── Items Ordered & Breakdown Card ── */}
          {items.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Items Ordered</Text>
              {items.map((item: any, idx: number) => {
                const qty = item.quantity || item.qty || 1;
                const price = Number(item.price || item.unit_price || 0);
                return (
                  <View key={idx} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {qty}x {item.name || item.itemName || 'Item'}
                    </Text>
                    <Text style={styles.itemPrice}>
                      Rs. {(price * qty).toFixed(0)}
                    </Text>
                  </View>
                );
              })}

              <View style={styles.divider} />

              <View style={styles.itemRow}>
                <Text style={styles.breakdownLabel}>Subtotal</Text>
                <Text style={styles.breakdownValue}>Rs. {subtotal.toFixed(0)}</Text>
              </View>

              {/* Delivery Fee: 0 Rs (FREE) */}
              <View style={styles.itemRow}>
                <Text style={styles.breakdownLabel}>Delivery Fee</Text>
                <Text style={[styles.breakdownValue, { color: UDIPI_GREEN, fontWeight: '700' }]}>
                  FREE (Rs. 0)
                </Text>
              </View>

              {packagingFee > 0 && (
                <View style={styles.itemRow}>
                  <Text style={styles.breakdownLabel}>Packaging Charges</Text>
                  <Text style={styles.breakdownValue}>Rs. {packagingFee.toFixed(0)}</Text>
                </View>
              )}

              {gstAmt > 0 && (
                <View style={styles.itemRow}>
                  <Text style={styles.breakdownLabel}>GST (5%)</Text>
                  <Text style={styles.breakdownValue}>Rs. {gstAmt.toFixed(2)}</Text>
                </View>
              )}

              {discountAmt > 0 && (
                <View style={styles.itemRow}>
                  <Text style={[styles.breakdownLabel, { color: UDIPI_GREEN }]}>Discount</Text>
                  <Text style={[styles.breakdownValue, { color: UDIPI_GREEN, fontWeight: '700' }]}>
                    - Rs. {discountAmt.toFixed(2)}
                  </Text>
                </View>
              )}

              <View style={styles.divider} />
              <View style={styles.itemRow}>
                <Text style={[styles.itemName, { fontWeight: '700', color: '#111' }]}>
                  Total Paid {paymentMethod ? `(${paymentMethod})` : ''}
                </Text>
                <Text style={[styles.itemPrice, { color: UDIPI_GREEN, fontSize: 16 }]}>
                  Rs. {totalAmount.toFixed(0)}
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      {/* ── Bottom Actions (Exact Takeaway UI & Udipi Green) ── */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        {/* Reorder */}
        <TouchableOpacity style={styles.reorderBtn} onPress={handleReorder} activeOpacity={0.85}>
          <Ionicons name="refresh-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.reorderText}>Reorder This Meal</Text>
        </TouchableOpacity>

        {/* Download E-Invoice */}
        <TouchableOpacity style={styles.invoiceBtn} onPress={handleDownloadInvoice} activeOpacity={0.85}>
          <Ionicons name="document-text-outline" size={16} color={UDIPI_GREEN} style={{ marginRight: 6 }} />
          <Text style={styles.invoiceText}>Download E-Invoice</Text>
        </TouchableOpacity>

        {/* Back to Home */}
        <TouchableOpacity onPress={handleReturnHome} activeOpacity={0.7} style={styles.homeBtn}>
          <Text style={styles.homeText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles (Exact 1:1 match with Takeaway order-completed.tsx with Udipi Green) ───

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },

  // Header
  header: {
    alignItems: 'center',
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    textAlign: 'center',
    paddingHorizontal: 24,
  },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 18,
  },

  // Loyalty card
  loyaltyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#e6f7eb',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
  },
  loyaltyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loyaltyLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  loyaltyPoints: {
    fontSize: 14,
    fontWeight: '800',
    color: UDIPI_GREEN,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },

  // Feedback
  feedbackQuestion: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    textAlign: 'center',
    marginBottom: 16,
  },
  billBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 22,
    marginTop: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    gap: 7,
  },
  billBadgeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803d',
    letterSpacing: 0.8,
  },
  billBadgeValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    letterSpacing: 0.5,
  },
  recommendRow: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  recommendBtn: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    gap: 6,
  },
  recommendBtnActive: {
    backgroundColor: '#f0fdf4',
    borderColor: UDIPI_GREEN,
    shadowColor: UDIPI_GREEN,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  notRecommendBtn: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: '#f9fafb',
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    gap: 6,
  },
  notRecommendBtnActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#ef4444',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  recommendText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#4b5563',
    textAlign: 'center',
  },
  recommendTextActive: {
    color: '#15803d',
    fontWeight: '700',
  },
  notRecommendText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#4b5563',
    textAlign: 'center',
  },
  notRecommendTextActive: {
    color: '#b91c1c',
    fontWeight: '700',
  },
  tagSectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#888',
    letterSpacing: 0.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 20,
  },
  tagPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  tagPillSelected: {
    backgroundColor: '#e6f7eb',
    borderColor: UDIPI_GREEN,
  },
  tagText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  tagTextSelected: {
    color: UDIPI_GREEN,
    fontWeight: '700',
  },
  submitBtn: {
    backgroundColor: UDIPI_GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: UDIPI_GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  submitBtnDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  feedbackDoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    paddingVertical: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  feedbackDoneText: {
    fontSize: 13,
    color: UDIPI_GREEN,
    fontWeight: '600',
  },

  // Items ordered
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 14,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  itemName: {
    fontSize: 13,
    color: '#444',
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  itemPrice: {
    fontSize: 13,
    color: '#111',
    fontWeight: '700',
  },
  breakdownLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: 13,
    color: '#222',
    fontWeight: '600',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 8,
  },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#ececec',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 8,
  },
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: UDIPI_GREEN,
    borderRadius: 24,
    paddingVertical: 15,
    marginBottom: 10,
    shadowColor: UDIPI_GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  reorderText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  invoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e6f7eb',
    borderRadius: 24,
    paddingVertical: 13,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: UDIPI_GREEN,
  },
  invoiceText: {
    color: UDIPI_GREEN,
    fontSize: 14,
    fontWeight: '700',
  },
  homeBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  homeText: {
    fontSize: 14,
    color: '#888',
    fontWeight: '600',
  },
});
