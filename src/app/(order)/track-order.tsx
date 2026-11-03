import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, StatusBar, Linking, BackHandler, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { orderApi, deliveryApi, dineInSessionApi } from '../../services/apiService';
import { getCookingMessage } from '../../utils/orderStatusMessages';
import { useLiveOrderStore, useRestaurantStore, useDineInSessionStore } from '../../store';
import { purgeDeletedOrderLocally } from '../../store/sessionUtils';
import { getFullImageUrl } from '../../constants/api';
import {
  getDeliveryProgressStep,
  getDeliveryContextText,
  getLabelForAssignment,
  isDeliveredStatus,
  isLiveTrackingStatus,
  isTerminalStatus,
  resolveDeliveryStatus,
  resolveOrderStatus,
  DELIVERY_STATUS,
} from '../../utils/deliveryStatusUtils';

export default function TrackOrderScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId: string;
    dbOrderId?: string;
    sessionId?: string;
    sessionUid?: string;
    tableNumber: string;
    cart: string;
    orderType?: string;
    phone?: string;
    billNo?: string;
  }>();

  const [orderDetails, setOrderDetails] = useState<any>(null);
  const billNumber = orderDetails?.order?.bill_no || params.billNo || null;
  const [loading, setLoading] = useState(true);
  const [deliveryStatus, setDeliveryStatus] = useState<string>('');
  const [riderInfo, setRiderInfo] = useState<any>(null);
  const [assignmentStatus, setAssignmentStatus] = useState<string>('');
  const [trackingTimeline, setTrackingTimeline] = useState<any[]>([]);
  const [networkError, setNetworkError] = useState(false);
  const [trackingData, setTrackingData] = useState<any>(null);
  const [orderSummaryExpanded, setOrderSummaryExpanded] = useState(true);

  // One-time navigation guards
  const hasNavigatedRef = useRef(false);
  // Stale-response regression guard
  const lastOrderStatusRef = useRef<string>('');
  const lastDeliveryStatusRef = useRef<string>('');
  // Rider banner dedup
  const shownBannerForAssignmentIdRef = useRef<number | string | null>(null);
  const [riderBanner, setRiderBanner] = useState<string | null>(null);
  // Overlap prevention
  const isPollingRef = useRef(false);

  const { orderId: liveOrderId, dbOrderId: liveDbOrderId } = useLiveOrderStore();
  const { selectedOutlet } = useRestaurantStore();
  const sessionStore = useDineInSessionStore();

  const handleGoBack = () => {
    router.dismissAll();
    router.replace('/home');
  };

  // ── Cancel Order Modal State ──────────────────────────────────────────────
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | number | null>(null);
  const [cancelTargetAmount, setCancelTargetAmount] = useState<number | null>(null);
  const [cancelTargetLabel, setCancelTargetLabel] = useState<string>('');
  const [cancelModalError, setCancelModalError] = useState<string | null>(null);
  const [cancelAllIds, setCancelAllIds] = useState<(string | number)[]>([]);

  const openCancelModal = (targetOrderId?: string | number, roundAmount?: number, label?: string) => {
    let orderIdToCancel = targetOrderId || params.dbOrderId || liveDbOrderId;
    if (!orderIdToCancel && params.orderId) {
      const match = params.orderId.match(/\d+/);
      if (match) orderIdToCancel = match[0];
    }
    if (!orderIdToCancel && orderDetails?.order?.id) {
      orderIdToCancel = orderDetails.order.id;
    }
    const finalAmount = roundAmount != null ? roundAmount : (orderDetails?.order?.total_amount ? Number(orderDetails.order.total_amount) : null);
    setCancelTargetId(orderIdToCancel || null);
    setCancelTargetAmount(finalAmount);
    setCancelTargetLabel(label || '');
    setCancelAllIds([]);
    setCancelModalError(null);
    setCancelModalVisible(true);
  };

  const openCancelAllModal = () => {
    const cancellableRounds = (sessionStore.orderRounds || []).filter(
      (r: any) => ['PENDING', 'CONFIRMED'].includes((r.status || '').toUpperCase())
    );
    if (cancellableRounds.length === 0) return;
    const allAmount = cancellableRounds.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
    const ids = cancellableRounds.map((r: any) => r.id);
    setCancelAllIds(ids);
    setCancelTargetId(null);
    setCancelTargetAmount(allAmount);
    setCancelTargetLabel('all cancellable rounds');
    setCancelModalError(null);
    setCancelModalVisible(true);
  };


  const executeCancelOrder = async () => {
    if (cancelling) return;
    const idsToCancel: (string | number)[] = cancelAllIds.length > 0
      ? cancelAllIds
      : (cancelTargetId ? [cancelTargetId] : []);
    if (idsToCancel.length === 0) return;
    try {
      setCancelling(true);
      setCancelModalError(null);
      // Prefer order's own actual restaurant_id, fallback to selected outlet
      const restId = orderDetails?.order?.restaurant_id
        ? Number(orderDetails.order.restaurant_id)
        : (selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : undefined);

      // Cancel each id sequentially
      let anyError: string | null = null;
      for (const id of idsToCancel) {
        try {
          await orderApi.cancelOrder(id, restId);
        } catch (err: any) {
          const msg = String(err?.message || '');
          if (msg.includes('409') || msg.toLowerCase().includes('preparing') || msg.toLowerCase().includes('already started')) {
            anyError = `Round #${id} could not be cancelled — kitchen already started.`;
          } else {
            anyError = msg || `Unable to cancel round #${id}.`;
          }
        }
      }

      // Instantly reflect cancelled status in order state
      setOrderDetails((prev: any) => prev ? {
        ...prev,
        order: { ...prev.order, status: idsToCancel.some(id => String(id) === String(prev.order?.id)) ? 'CANCELLED' : prev.order?.status }
      } : null);

      if (isDineIn) {
        // Optimistically update round status in sessionStore for all cancelled ids
        const currentRounds = sessionStore.orderRounds || [];
        const updatedRounds = currentRounds.map((r: any) => {
          if (idsToCancel.some(id => String(r.id) === String(id) || String(r.orderId).includes(String(id)))) {
            return { ...r, status: 'CANCELLED' };
          }
          return r;
        });
        const nonCancelled = updatedRounds.filter((r: any) => (r.status || '').toUpperCase() !== 'CANCELLED');
        const newTotal = nonCancelled.reduce((sum: number, r: any) => sum + (Number(r.total_amount) || 0), 0);

        if (nonCancelled.length === 0) {
          useLiveOrderStore.getState().clearLiveOrder();
          sessionStore.completeDineInSession();
        } else {
          sessionStore.syncSessionDetails({
            sessionId: sessionStore.sessionDbId || 0,
            sessionUid: sessionStore.sessionUid || '',
            tableNumber: sessionStore.tableNumber || '',
            totalAmount: newTotal,
            paymentStatus: sessionStore.paymentStatus || 'Pending',
            orders: nonCancelled,
            allItems: sessionStore.orderedItems || [],
          });

          const sKey = sessionStore.sessionDbId || sessionStore.sessionUid || params.sessionId || params.sessionUid;
          if (sKey) {
            dineInSessionApi.getSessionDetails(sKey, restId || 1).then((sData: any) => {
              if (sData?.success) {
                const activeBackRounds = (sData.orders || []).filter((o: any) => (o.status || '').toUpperCase() !== 'CANCELLED');
                if (activeBackRounds.length === 0) {
                  useLiveOrderStore.getState().clearLiveOrder();
                  sessionStore.completeDineInSession();
                } else {
                  sessionStore.syncSessionDetails({
                    sessionId: sData.sessionId,
                    sessionUid: sData.sessionUid,
                    tableNumber: sData.tableNumber,
                    totalAmount: sData.totalAmount,
                    paymentStatus: sData.paymentStatus,
                    orders: activeBackRounds,
                    allItems: sData.allItems || [],
                  });
                }
              }
            }).catch(() => {});
          }
        }
      } else {
        useLiveOrderStore.getState().clearLiveOrder();
      }

      if (anyError) {
        setCancelModalError(anyError);
      } else {
        setCancelModalVisible(false);
      }
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('409') || msg.toLowerCase().includes('preparing') || msg.toLowerCase().includes('already started')) {
        setCancelModalError("Cancellation unavailable: The kitchen has already started preparing this order.");
      } else {
        setCancelModalError(msg || "Unable to cancel order at this stage.");
      }
    } finally {
      setCancelling(false);
    }
  };

  const renderCancelModal = () => {
    const isMultiCancel = cancelAllIds.length > 0;
    const displayOrderLabel = isMultiCancel
      ? `Cancel All (${cancelAllIds.length} round${cancelAllIds.length > 1 ? 's' : ''})`
      : (cancelTargetLabel || (params.orderId ? `#${params.orderId}` : `Order #${cancelTargetId || ''}`));
    const displayAmount = cancelTargetAmount;

    return (
    <Modal
      visible={cancelModalVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => {
        if (!cancelling) setCancelModalVisible(false);
      }}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.cancelCard}>
          {/* Warning Icon Badge */}
          <View style={styles.cancelIconCircle}>
            <Ionicons name="alert-circle-outline" size={34} color="#DC2626" />
          </View>

          {/* Title & Subtitle */}
          <Text style={styles.cancelTitle}>
            {isMultiCancel ? 'Cancel All Rounds?' : 'Cancel Order?'}
          </Text>
          <Text style={styles.cancelSubtitle}>
            {isMultiCancel
              ? `This will cancel all ${cancelAllIds.length} pending round(s). Once the kitchen starts cooking, cancellation is not possible.`
              : 'Are you sure you want to cancel this order? Once the kitchen starts cooking, cancellation is no longer possible.'}
          </Text>

          {/* Order Info Badge */}
          <View style={styles.cancelOrderInfoRow}>
            <View style={styles.cancelOrderInfoLeft}>
              <Ionicons name="receipt-outline" size={15} color="#4B5563" style={{ marginRight: 6 }} />
              <Text style={styles.cancelOrderInfoText} numberOfLines={1}>
                {displayOrderLabel}
              </Text>
            </View>
            {displayAmount != null && displayAmount > 0 && (
              <Text style={styles.cancelOrderInfoPrice}>Rs. {displayAmount}</Text>
            )}
          </View>

          {/* Error Message if any */}
          {cancelModalError && (
            <View style={styles.cancelErrorBox}>
              <Ionicons name="alert-circle" size={16} color="#DC2626" style={{ marginRight: 6, marginTop: 1 }} />
              <Text style={styles.cancelErrorText}>{cancelModalError}</Text>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.cancelModalActions}>
            <TouchableOpacity
              style={styles.cancelKeepBtn}
              onPress={() => setCancelModalVisible(false)}
              disabled={cancelling}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelKeepBtnText}>Keep Order</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelConfirmBtn}
              onPress={executeCancelOrder}
              disabled={cancelling}
              activeOpacity={0.8}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="close-circle" size={16} color="#FFFFFF" style={{ marginRight: 5 }} />
                  <Text style={styles.cancelConfirmBtnText}>Yes, Cancel</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
  };

  useEffect(() => {
    if (!liveDbOrderId && !params.orderId && !params.dbOrderId) {
      router.replace('/home');
    }
  }, [liveDbOrderId, params, router]);

  useEffect(() => {
    const handleBackPress = () => {
      handleGoBack();
      return true;
    };
    let backHandler: any;
    if (BackHandler && BackHandler.addEventListener) {
      backHandler = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    }
    return () => {
      if (backHandler && backHandler.remove) {
        backHandler.remove();
      }
    };
  }, []);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval>;

    const fetchOrderDetails = async () => {
      // Prevent overlapping requests
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        let fetchId = params.dbOrderId || liveDbOrderId;
        if (!fetchId && params.orderId) {
          const match = params.orderId.match(/\d+/);
          if (match) fetchId = match[0];
        }

        if (!fetchId || ['Preparing', 'Pending', 'Confirmed', 'Ready', 'Served', 'Completed'].includes(fetchId)) {
          return;
        }

        const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : null;
        if (!restId) {
          throw new Error('Restaurant context is unavailable for this order');
        }

        const orderTypeParam = (params.orderType || '').toUpperCase().replace(/[\s_-]/g, '');
        const isDeliveryOrder =
          orderTypeParam === 'DELIVERY' ||
          params.orderType === 'Delivery';

        // For delivery: call both endpoints in one coordinated cycle
        let orderData: any = null;
        let trackingData: any = null;

        if (isDeliveryOrder) {
          const results = await Promise.allSettled([
            orderApi.getOrderDetails(fetchId, restId),
            deliveryApi.getOrderTracking(fetchId),
          ]);
          if (results[0].status === 'fulfilled') orderData = results[0].value;
          if (results[1].status === 'fulfilled') trackingData = results[1].value;
          if (results[0].status === 'rejected' && results[1].status === 'rejected') {
            setNetworkError(true);
          } else {
            setNetworkError(false);
          }
        } else {
          orderData = await orderApi.getOrderDetails(fetchId, restId);
        }

        if (orderData?.order) {
          setOrderDetails({ order: orderData.order, items: orderData.items || [] });
          setNetworkError(false);

          const rawOS = (orderData.order.status || '').toUpperCase();
          const rawDS = (orderData.order.delivery_status || '').toUpperCase();
          const paymentStatus = (orderData.order.payment_status || '').toUpperCase();
          const orderTypeNorm = (orderData.order.order_type || params.orderType || '').toUpperCase().replace(/[\s_-]/g, '');
          const isOrderDineIn = orderTypeNorm === 'DINEIN' || params.orderType === 'Dine In';

          if (isOrderDineIn) {
            const sessionStoreState = useDineInSessionStore.getState();
            const activeSessKey = params.sessionId || params.sessionUid || sessionStoreState.sessionDbId || sessionStoreState.sessionUid;
            
            if (activeSessKey) {
              // Await session details to get fresh backend statuses and authoritative combined total.
              // Do NOT call syncWithBackendOrder for Dine-In — it would overwrite the combined total
              // with the single-order total of the currently-polled order.
              try {
                const sData: any = await dineInSessionApi.getSessionDetails(activeSessKey, restId);
                if (sData?.success) {
                  useDineInSessionStore.getState().syncSessionDetails({
                    sessionId: sData.sessionId,
                    sessionUid: sData.sessionUid,
                    tableNumber: sData.tableNumber,
                    totalAmount: sData.totalAmount,      // Authoritative combined total from backend
                    paymentStatus: sData.paymentStatus,
                    orders: sData.orders || [],           // Each round with its independent backend status
                    allItems: sData.allItems || [],
                  });
                }
              } catch (_sessErr) {
                // Non-critical: session details may not be available, continue polling
              }
            }
            // NOTE: syncWithBackendOrder intentionally NOT called for Dine-In.
            // The combined session total is authoritative from the session-details endpoint.
          }
          const isOrderDelivery = orderTypeNorm === 'DELIVERY' || params.orderType === 'Delivery';
          const isOrderTakeaway = orderTypeNorm === 'TAKEAWAY' || params.orderType === 'Take Away';

          // Strictly isolate Delivery orders: redirect to dedicated delivery-tracking screen
          if (isOrderDelivery && !hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            if (intervalId) clearInterval(intervalId);
            router.replace({
              pathname: '/delivery-tracking',
              params: {
                orderId: params.orderId || `ORD-${orderData.order.id.toString().padStart(6, '0')}`,
                dbOrderId: fetchId.toString(),
                totalAmount: orderData.order.total_amount?.toString() || '0.00',
                paymentMethod: orderData.order.payment_method || 'UPI',
                cart: JSON.stringify(orderData.items || []),
              },
            });
            return;
          }
          
          // Regression-safe order status
          lastOrderStatusRef.current = resolveOrderStatus(lastOrderStatusRef.current, rawOS);

          if (isOrderDelivery) {
            // Regression-safe delivery status update
            const resolvedDS = resolveDeliveryStatus(lastDeliveryStatusRef.current, rawDS);
            lastDeliveryStatusRef.current = resolvedDS;
            setDeliveryStatus(resolvedDS);

            // Tracking data: rider, assignment, timeline
            if (trackingData) {
              setTrackingData(trackingData);
              const currentAssignment = trackingData.assignment || {};
              const currentAssignmentId = currentAssignment.id;

              if (trackingData.rider) {
                setRiderInfo(trackingData.rider);
                
                // One-time rider banner per assignment
                if (
                  currentAssignmentId &&
                  shownBannerForAssignmentIdRef.current !== currentAssignmentId
                ) {
                  shownBannerForAssignmentIdRef.current = currentAssignmentId;
                  const banner = `🏍 ${trackingData.rider.name} (${trackingData.rider.vehicle_type || 'Bike'} · ${trackingData.rider.vehicle_number || ''}) will pick up your order!`;
                  setRiderBanner(banner);
                  setTimeout(() => setRiderBanner(null), 5000);
                }
              }
              
              // Prefer assignment.status over timeline
              if (currentAssignment.status) {
                setAssignmentStatus(currentAssignment.status);
              } else if (Array.isArray(trackingData.timeline) && trackingData.timeline.length > 0) {
                const latest = trackingData.timeline[trackingData.timeline.length - 1];
                setAssignmentStatus(latest.status || '');
              }
              
              if (Array.isArray(trackingData.timeline)) {
                setTrackingTimeline(trackingData.timeline);
              }
            }

            // Keep customer on Track Order screen per UI spec (navigate when user taps track action)
            // if (isLiveTrackingStatus(resolvedDS) && !hasNavigatedRef.current) { ... }

            // Navigate to delivery-completed ONCE on DELIVERED
            if (isDeliveredStatus(resolvedDS) && !hasNavigatedRef.current) {
              hasNavigatedRef.current = true;
              clearInterval(intervalId);
              router.replace({
                pathname: '/delivery-completed',
                params: {
                  orderId: params.orderId || `ORD-${orderData.order.id.toString().padStart(6, '0')}`,
                  dbOrderId: fetchId.toString(),
                },
              });
              return;
            }

            // Stop polling on terminal status
            if (isTerminalStatus(resolvedDS)) {
              clearInterval(intervalId);
              return;
            }

          } else {
            // Stop polling and clear live order if order is cancelled
            if (rawOS === 'CANCELLED') {
              useLiveOrderStore.getState().clearLiveOrder();
              if (intervalId) clearInterval(intervalId);
              return;
            }

            // Non-delivery: handle completion redirect
            // When takeaway order is marked READY -> redirect to order-completed ("Pick Up!")
            // When takeaway order is marked SERVED/COMPLETED -> redirect to order-completed ("Picked Up!")
            const isTakeawayReadyOrCompleted = isOrderTakeaway && (rawOS === 'READY' || rawOS === 'SERVED' || rawOS === 'COMPLETED' || rawOS === 'DELIVERED');
            const isDineInCompleted = isOrderDineIn && (rawOS === 'SERVED' || rawOS === 'COMPLETED' || rawOS === 'DELIVERED') && paymentStatus === 'PAID';
            const shouldRedirect = isOrderTakeaway ? isTakeawayReadyOrCompleted : isDineInCompleted;
            if (shouldRedirect && !hasNavigatedRef.current) {
              hasNavigatedRef.current = true;
              clearInterval(intervalId);
              router.replace({
                pathname: '/order-completed',
                params: {
                  orderId: params.orderId || `ORD-${orderData.order.id.toString().padStart(6, '0')}`,
                  dbOrderId: fetchId.toString(),
                  tableNumber: orderData.order.table_number || params.tableNumber || (isOrderTakeaway ? 'Take Away' : 'Dine In'),
                  totalAmount: orderData.order.total_amount?.toString() || '0.00',
                  paymentMethod: orderData.order.payment_method || 'UPI',
                  cartItems: JSON.stringify(orderData.items || []),
                  date: orderData.order.updated_at || orderData.order.created_at || new Date().toISOString(),
                  orderType: isOrderTakeaway ? 'Take Away' : 'Dine In',
                  phone: params.phone || '',
                  orderStatus: rawOS,
                  billNo: orderData.order.bill_no ? String(orderData.order.bill_no) : (params.billNo || ''),
                },
              });
            }
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '').toLowerCase();
        const isNotFound = err?.status === 404 || msg.includes('404') || msg.includes('not found');
        if (isNotFound) {
          if (intervalId) clearInterval(intervalId);
          await purgeDeletedOrderLocally(fetchId || params.orderId || '');
          Alert.alert("Order Not Found", "This order is no longer available in the system.", [
            { text: "OK", onPress: () => router.replace('/(main)/home') }
          ]);
          return;
        } else {
          console.warn('Poll status:', err?.message || err);
          setNetworkError(true);
        }
      } finally {
        setLoading(false);
        isPollingRef.current = false;
      }
    };

    fetchOrderDetails();
    intervalId = setInterval(fetchOrderDetails, 5000);

    return () => clearInterval(intervalId);
  }, [params.orderId, params.dbOrderId, liveDbOrderId, selectedOutlet]);

  const orderItemsList = (() => {
    if (orderDetails?.items && orderDetails.items.length > 0) {
      return orderDetails.items;
    }
    if (params.cart) {
      try {
        const parsed = typeof params.cart === 'string' ? JSON.parse(params.cart) : params.cart;
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  })();

  const rawStatus = orderDetails?.order?.status?.toUpperCase() || 'CONFIRMED';
  
  // Mapping statuses to our 5 steps: Received (1), Kitchen (2), Cooking (3), Almost Ready (4), Ready (5)
  let statusLevel = 1;
  let bannerTitle = "Order Received!";
  let bannerSub = "Waiting for kitchen to accept";
  let alertTitle = "Hang tight!";
  let alertSub = "Your order is in the queue";

  if (rawStatus === 'CANCELLED') {
    statusLevel = -1;
    bannerTitle = "Order Cancelled";
    bannerSub = "This order was cancelled before cooking started";
    alertTitle = "Order Cancelled";
    alertSub = "This order is cancelled and will not be prepared";
  } else if (rawStatus === 'PENDING') {
    statusLevel = 1;
  } else if (rawStatus === 'CONFIRMED') {
    statusLevel = 2;
    bannerTitle = "Kitchen has received your order";
    bannerSub = "Getting ingredients ready";
  } else if (rawStatus === 'PREPARING') {
    statusLevel = 3;
    bannerTitle = getCookingMessage(orderItemsList).title;
    bannerSub = getCookingMessage(orderItemsList).sub;
    alertTitle = "Being prepared";
    alertSub = "We'll update you as soon as it's ready";
  } else if (rawStatus === 'ALMOST_READY') {
    statusLevel = 4;
    bannerTitle = "Almost done!";
    bannerSub = "Packing up your fresh food";
    alertTitle = "Almost ready";
    alertSub = "Your food is being packed";
  } else if (rawStatus === 'READY' || rawStatus === 'SERVED' || rawStatus === 'COMPLETED') {
    statusLevel = 5;
    bannerTitle = "Your food is ready!";
    bannerSub = "Please collect it at the counter";
    alertTitle = "Food is ready!";
    alertSub = "Collect it while it's hot";
  }

  // Generate dynamic item status bars
  const renderItemStatus = (item: any, idx: number) => {
    let itemStatusLabel = "Pending";
    let progressPct = "0%";
    let barColor = "#e2e8f0"; // Gray
    let textColor = "#888";
    let subText = "Waiting in queue";

    // Item-level status takes precedence for Dine-In reorders
    const rawItemStatus = (item?.status || '').toUpperCase();
    if (rawItemStatus === 'PENDING') {
      itemStatusLabel = "Pending";
      progressPct = "10%";
      barColor = "#ffb088";
      textColor = "#ff4500";
      subText = "Waiting for kitchen";
    } else if (rawItemStatus === 'PREPARING' || rawItemStatus === 'COOKING') {
      const val = 60 + (idx % 3) * 10;
      itemStatusLabel = `Cooking (${val}%)`;
      progressPct = `${val}%`;
      barColor = "#ff4500";
      textColor = "#ff4500";
      subText = "On the griddle - crisping up";
    } else if (rawItemStatus === 'READY' || rawItemStatus === 'ALMOST_READY') {
      itemStatusLabel = "Ready";
      progressPct = "95%";
      barColor = "#00a01d";
      textColor = "#00a01d";
      subText = "Ready to serve";
    } else if (rawItemStatus === 'SERVED' || rawItemStatus === 'COMPLETED') {
      itemStatusLabel = "Served";
      progressPct = "100%";
      barColor = "#00a01d";
      textColor = "#00a01d";
      subText = "Served at table";
    } else if (statusLevel === 1) {
      itemStatusLabel = "Received";
      progressPct = "10%";
      barColor = "#e2e8f0";
    } else if (statusLevel === 2) {
      itemStatusLabel = "Prep";
      progressPct = "30%";
      barColor = "#ffb088";
      textColor = "#ff4500";
      subText = "Ingredients ready";
    } else if (statusLevel === 3) {
      // Vary slightly based on index
      const val = 60 + (idx % 3) * 10; 
      itemStatusLabel = `Cooking (${val}%)`;
      progressPct = `${val}%`;
      barColor = "#ff4500";
      textColor = "#ff4500";
      subText = "On the griddle - crisping up";
    } else if (statusLevel === 4) {
      itemStatusLabel = `Almost Ready`;
      progressPct = `90%`;
      barColor = "#ff4500";
      textColor = "#ff4500";
      subText = "Adding final touches";
    } else if (statusLevel >= 5) {
      itemStatusLabel = `Completed`;
      progressPct = `100%`;
      barColor = "#00a01d";
      textColor = "#00a01d";
      subText = "Ready to serve";
    }

    return (
      <View key={idx} style={styles.dishCard}>
         <View style={styles.dishHeader}>
            <Image source={{ uri: getFullImageUrl(item.image || item.image_url) }} style={styles.dishImage} />
            <View style={{ flex: 1, marginLeft: 12 }}>
               <View style={styles.dishTitleRow}>
                  <Text style={styles.dishName} numberOfLines={1}>{item.name || item.title || 'Item'} (x{item.quantity || item.qty || 1})</Text>
                  <Text style={[styles.dishStatusText, { color: textColor }]}>{itemStatusLabel}</Text>
               </View>
               <View style={styles.progressContainer}>
                 <View style={[styles.progressBar, { width: progressPct as any, backgroundColor: barColor }]} />
               </View>
               <Text style={styles.dishSubText}>{subText}</Text>
            </View>
         </View>
      </View>
    );
  };

  const getStepStyle = (step: number) => {
    if (statusLevel > step) return styles.stepCompleted;
    if (statusLevel === step) return styles.stepActive;
    return styles.stepPending;
  };
  const getStepIconColor = (step: number) => {
    if (statusLevel > step) return "#fff";
    if (statusLevel === step) return "#fff";
    return "#888";
  };
  const getStepTextColor = (step: number) => {
    if (statusLevel > step) return "#00a01d";
    if (statusLevel === step) return "#ff4500";
    return "#888";
  };
  
  const stepIcons = ["checkmark", "checkmark-done", "flame", "time", "bag-check"];
  const stepLabels = ["Received", "Kitchen", "Cooking", "Almost Ready", "Ready"];

  const currentOrderType = (orderDetails?.order?.order_type || params.orderType || '').toUpperCase().replace(/[\s_-]/g, '');
  const isDelivery = currentOrderType === 'DELIVERY' || params.orderType === 'Delivery';
  const isTakeaway = currentOrderType === 'TAKEAWAY' || params.orderType === 'Take Away';
  const isDineIn = !isDelivery && !isTakeaway && (
    currentOrderType === 'DINEIN' ||
    params.orderType === 'Dine In' ||
    (Boolean(params.tableNumber) && !params.tableNumber.toLowerCase().includes('takeaway') && !params.tableNumber.toLowerCase().includes('delivery'))
  );
  const activeTable =
    orderDetails?.order?.table_number || params.tableNumber || 'T-01';
  const isPendingPayment =
    (orderDetails?.order?.payment_status || '').toLowerCase() !== 'paid';

  const activeOrderRounds = (sessionStore.orderRounds || []).filter(
    (roundObj: any) => (roundObj.status || '').toUpperCase() !== 'CANCELLED'
  );

  if (isDelivery) {
    const deliveryStatusRaw = (orderDetails?.order?.delivery_status || '').toUpperCase();
    const orderStatusRaw = (orderDetails?.order?.status || '').toUpperCase();
    
    // Calculate 4-step progress index (1: Confirmed, 2: Preparing, 3: Out for Delivery, 4: Delivered)
    const rawStep = getDeliveryProgressStep(orderStatusRaw, deliveryStatusRaw);
    let stepIndex = 1;
    if (rawStep >= 4 || deliveryStatusRaw === 'DELIVERED') {
      stepIndex = 4;
    } else if (rawStep >= 3 || deliveryStatusRaw === 'OUT_FOR_DELIVERY' || deliveryStatusRaw === 'PICKED_UP') {
      stepIndex = 3;
    } else if (rawStep >= 1 || ['PREPARING', 'ALMOST_READY', 'READY'].includes(orderStatusRaw)) {
      stepIndex = 2;
    } else {
      stepIndex = 1;
    }

    const rawIdDigits = String(orderDetails?.order?.id || params.dbOrderId || liveDbOrderId || params.orderId || '12345678').replace(/\D/g, '') || '12345678';
    const displayOrderNumber = `DU${rawIdDigits}`;

    const topStatusText = stepIndex === 4
      ? 'Delivered'
      : stepIndex === 3
      ? 'Out for Delivery'
      : stepIndex === 2
      ? 'Preparing'
      : 'Order Confirmed';

    const partnerName = trackingData?.assignment?.delivery_partner || trackingData?.rider?.partner || riderInfo?.partner || 'Rapido';
    const etaVal = trackingData?.assignment?.estimated_delivery_time || riderInfo?.eta || '20 mins';
    const riderNameVal = riderInfo?.name || 'Not available (provided by admin)';
    const riderPhoneVal = riderInfo?.phone
      ? (riderInfo.phone.startsWith('+91') ? riderInfo.phone : `+91 ${riderInfo.phone}`)
      : '+91 98765 43210';
    const vehicleTypeVal = riderInfo?.vehicle_type || 'Bike';
    const vehicleNumberVal = riderInfo?.vehicle_number || 'TN 09 AB 1234';
    const assignmentStatusVal = deliveryStatusRaw === 'OUT_FOR_DELIVERY' || deliveryStatusRaw === 'PICKED_UP'
      ? 'On the way to restaurant'
      : (getLabelForAssignment(assignmentStatus) || 'On the way to restaurant');

    const displayItems = orderItemsList.length > 0 ? orderItemsList : [
      { id: 1, name: 'South Indian Meals', quantity: 3, price: 125, image_url: 'https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=150' }
    ];
    const totalAmountVal = Number(orderDetails?.order?.total_amount || displayItems.reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || it.qty || 1)), 0));

    const fourSteps = [
      { label: 'Order\nConfirmed', icon: 'checkmark', type: 'ion' },
      { label: 'Preparing', icon: 'chef-hat', type: 'mc' },
      { label: 'Out for\nDelivery', icon: 'moped', type: 'mc' },
      { label: 'Delivered', icon: 'home-outline', type: 'ion' },
    ];

    return (
      <View style={styles.pixelContainer}>
        <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
        
        {/* Top Header */}
        <View style={[styles.pixelHeader, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={handleGoBack} style={styles.pixelBackBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={24} color="#111827" />
          </TouchableOpacity>
          <View style={styles.pixelHeaderTitleBlock}>
            <Text style={styles.pixelHeaderTitle}>Track Order</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text style={styles.pixelHeaderSubtitle}>Order #{displayOrderNumber}</Text>
              {billNumber ? (
                <View style={styles.deliveryBillBadge}>
                  <Ionicons name="receipt" size={11} color="#16a34a" style={{ marginRight: 3 }} />
                  <Text style={styles.deliveryBillBadgeText}>Bill #{billNumber}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.pixelTopStatusPill}>
            <MaterialCommunityIcons name="moped" size={16} color="#16A34A" />
            <Text style={styles.pixelTopStatusText}>{topStatusText}</Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 110, paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {/* 4-Step Stepper */}
          <View style={styles.pixelStepperBox}>
            <View style={styles.pixelStepperTrack}>
              {/* Line 1-2 */}
              <View style={[styles.pixelStepperLine, { left: '12%', right: '62%', backgroundColor: stepIndex >= 2 ? '#16A34A' : '#E5E7EB' }]} />
              {/* Line 2-3 */}
              <View style={[styles.pixelStepperLine, { left: '38%', right: '38%', backgroundColor: stepIndex > 3 ? '#16A34A' : stepIndex === 3 ? '#EA580C' : '#E5E7EB' }]} />
              {/* Line 3-4 */}
              <View style={[styles.pixelStepperLine, { left: '62%', right: '12%', backgroundColor: stepIndex >= 4 ? '#16A34A' : '#E5E7EB' }]} />

              {fourSteps.map((st, idx) => {
                const sNum = idx + 1;
                
                let circleBg = '#FFFFFF';
                let circleBorder = '#D1D5DB';
                let iconColor = '#9CA3AF';
                let textColor = '#6B7280';
                let textWeight: any = '600';

                if (sNum === 1 && stepIndex >= 1) {
                  circleBg = '#16A34A';
                  circleBorder = '#16A34A';
                  iconColor = '#FFFFFF';
                  textColor = '#16A34A';
                  textWeight = '700';
                } else if (sNum === 2) {
                  if (stepIndex >= 2) {
                    circleBg = '#16A34A';
                    circleBorder = '#16A34A';
                    iconColor = '#FFFFFF';
                    textColor = '#16A34A';
                    textWeight = '700';
                  }
                } else if (sNum === 3) {
                  if (stepIndex > 3) {
                    circleBg = '#16A34A';
                    circleBorder = '#16A34A';
                    iconColor = '#FFFFFF';
                    textColor = '#16A34A';
                    textWeight = '700';
                  } else if (stepIndex === 3) {
                    circleBg = '#EA580C';
                    circleBorder = '#EA580C';
                    iconColor = '#FFFFFF';
                    textColor = '#EA580C';
                    textWeight = '700';
                  }
                } else if (sNum === 4) {
                  if (stepIndex >= 4) {
                    circleBg = '#16A34A';
                    circleBorder = '#16A34A';
                    iconColor = '#FFFFFF';
                    textColor = '#16A34A';
                    textWeight = '700';
                  }
                }

                return (
                  <View key={st.label} style={styles.pixelStepColumn}>
                    <View style={[styles.pixelStepCircle, { backgroundColor: circleBg, borderColor: circleBorder }]}>
                      {st.type === 'mc' ? (
                        <MaterialCommunityIcons name={st.icon as any} size={18} color={iconColor} />
                      ) : (
                        <Ionicons name={st.icon as any} size={16} color={iconColor} />
                      )}
                    </View>
                    <Text style={[styles.pixelStepLabel, { color: textColor, fontWeight: textWeight }]}>
                      {st.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Mint Green Status Banner Card */}
          <View style={styles.pixelMintBanner}>
            <View style={styles.pixelMintIconBox}>
              <MaterialCommunityIcons name="moped" size={24} color="#16A34A" />
            </View>
            <View style={styles.pixelMintContentBox}>
              <Text style={styles.pixelMintTitle}>
                {stepIndex >= 3 ? 'Your order is on the way!' : stepIndex === 2 ? 'Chef is preparing your order!' : 'Your order is confirmed!'}
              </Text>
              <Text style={styles.pixelMintSubtitle}>
                {stepIndex >= 3 ? 'The delivery partner has picked up your order.' : stepIndex === 2 ? 'Cooking fresh dishes in the kitchen.' : 'We are packing and getting ready.'}
              </Text>
            </View>
            <View style={styles.pixelMintEtaPill}>
              <Ionicons name="time-outline" size={13} color="#15803D" style={{ marginRight: 4 }} />
              <Text style={styles.pixelMintEtaText}>ETA  {etaVal}</Text>
            </View>
          </View>

          {/* Delivery Partner Main Card */}
          <View style={styles.pixelPartnerCard}>
            <View style={styles.pixelPartnerTopRow}>
              <View>
                <Text style={styles.pixelPartnerLabel}>Delivery Partner</Text>
                <Text style={styles.pixelPartnerName}>{partnerName}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={styles.pixelAssignedPill}>
                  <Text style={styles.pixelAssignedText}>Assigned</Text>
                </View>
              </View>
            </View>

            {/* Row 1: Rider Name */}
            <View style={styles.pixelDetailRow}>
              <View style={styles.pixelRowLeft}>
                <Ionicons name="person" size={18} color="#6B7280" style={styles.pixelRowIcon} />
                <Text style={styles.pixelRowLabel}>Rider Name</Text>
              </View>
              <Text style={styles.pixelRowValue} numberOfLines={1}>{riderNameVal}</Text>
            </View>

            {/* Row 2: Rider Phone */}
            <View style={styles.pixelDetailRow}>
              <View style={styles.pixelRowLeft}>
                <Ionicons name="call" size={18} color="#6B7280" style={styles.pixelRowIcon} />
                <Text style={styles.pixelRowLabel}>Rider Phone</Text>
              </View>
              <Text style={[styles.pixelRowValue, { fontWeight: '600', color: '#111827' }]}>{riderPhoneVal}</Text>
              <TouchableOpacity
                style={styles.pixelGreenCallBtn}
                onPress={() => {
                  const ph = riderInfo?.phone || '9876543210';
                  Linking.openURL(`tel:${ph}`);
                }}
                activeOpacity={0.8}
              >
                <Ionicons name="call" size={16} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Row 3: Vehicle Type */}
            <View style={styles.pixelDetailRow}>
              <View style={styles.pixelRowLeft}>
                <MaterialIcons name="two-wheeler" size={18} color="#6B7280" style={styles.pixelRowIcon} />
                <Text style={styles.pixelRowLabel}>Vehicle Type</Text>
              </View>
              <Text style={styles.pixelRowValue}>{vehicleTypeVal}</Text>
            </View>

            {/* Row 4: Vehicle Number */}
            <View style={styles.pixelDetailRow}>
              <View style={styles.pixelRowLeft}>
                <MaterialCommunityIcons name="card-bulleted-outline" size={18} color="#6B7280" style={styles.pixelRowIcon} />
                <Text style={styles.pixelRowLabel}>Vehicle Number</Text>
              </View>
              <Text style={styles.pixelRowValue}>{vehicleNumberVal}</Text>
            </View>

            {/* Row 5: Assignment Status */}
            <View style={styles.pixelDetailRow}>
              <View style={styles.pixelRowLeft}>
                <Ionicons name="time-outline" size={18} color="#6B7280" style={styles.pixelRowIcon} />
                <Text style={styles.pixelRowLabel}>Assignment Status</Text>
              </View>
              <Text style={styles.pixelRowValue}>{assignmentStatusVal}</Text>
            </View>

            {/* Row 6: Estimated Arrival (ETA) */}
            <View style={[styles.pixelDetailRow, { borderBottomWidth: 0 }]}>
              <View style={styles.pixelRowLeft}>
                <Ionicons name="time-outline" size={18} color="#6B7280" style={styles.pixelRowIcon} />
                <Text style={styles.pixelRowLabel}>Estimated Arrival (ETA)</Text>
              </View>
              <Text style={styles.pixelRowValue}>{etaVal}</Text>
            </View>

            {/* Track on Partner App Button */}
            <TouchableOpacity
              style={styles.pixelTrackPartnerAppBtn}
              onPress={() => {
                const externalUrl = trackingData?.assignment?.tracking_url || riderInfo?.tracking_url;
                if (externalUrl) {
                  Linking.openURL(externalUrl);
                } else {
                  const dbId = params.dbOrderId || liveDbOrderId || orderDetails?.order?.id;
                  router.push({
                    pathname: '/delivery-tracking',
                    params: {
                      orderId: params.orderId || `ORD-${orderDetails?.order?.id || ''}`,
                      dbOrderId: String(dbId || ''),
                      cart: params.cart,
                      totalAmount: orderDetails?.order?.total_amount?.toString() || '0',
                      paymentMethod: orderDetails?.order?.payment_method || 'CASH',
                    }
                  });
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="open-outline" size={18} color="#16A34A" />
              <Text style={styles.pixelTrackPartnerAppText}>Track on Partner App</Text>
              <Ionicons name="chevron-forward" size={16} color="#16A34A" />
            </TouchableOpacity>
          </View>

          {/* Order Summary Collapsible Card */}
          <View style={styles.pixelSummaryCard}>
            <TouchableOpacity
              style={styles.pixelSummaryHeader}
              onPress={() => setOrderSummaryExpanded(prev => !prev)}
              activeOpacity={0.7}
            >
              <View style={styles.pixelSummaryTitleRow}>
                <Text style={styles.pixelSummaryTitle}>Order Summary</Text>
                <Text style={styles.pixelSummaryCount}>({displayItems.length} Items)</Text>
              </View>
              <View style={styles.pixelSummaryPriceRow}>
                <Text style={styles.pixelSummaryPriceText}>₹{totalAmountVal.toFixed(0)}</Text>
                <Ionicons
                  name={orderSummaryExpanded ? "chevron-up" : "chevron-down"}
                  size={18}
                  color="#EA580C"
                  style={{ marginLeft: 4 }}
                />
              </View>
            </TouchableOpacity>

            {orderSummaryExpanded && (
              <View style={styles.pixelSummaryBody}>
                {displayItems.map((item: any, idx: number) => {
                  const qty = Number(item.quantity || item.qty || 1);
                  const price = Number(item.price || 0);
                  const imgUri = getFullImageUrl(item.image_url || item.image, item.name);
                  return (
                    <View key={item.id || item.menu_item_id || idx} style={styles.pixelItemRow}>
                      <Image
                        source={{ uri: imgUri || "https://images.unsplash.com/photo-1610192244261-3f33de3f55e4?w=150" }}
                        style={styles.pixelItemThumb}
                      />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.pixelItemName} numberOfLines={1}>{item.name || 'South Indian Meals'}</Text>
                        <Text style={styles.pixelItemSub}>{qty} × ₹{price.toFixed(0)}</Text>
                      </View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827', marginLeft: 8 }}>₹{(price * qty).toFixed(0)}</Text>
                    </View>
                  );
                })}

                {/* Split up Bill Summary */}
                {(() => {
                  const itemsSubtotal = displayItems.reduce((acc: number, it: any) => {
                    return acc + (Number(it.price || 0) * Number(it.quantity || it.qty || 1));
                  }, 0);
                  const orderObj = orderDetails?.order;
                  const subtotalVal = Number(orderObj?.subtotal || itemsSubtotal);
                  const deliveryFeeVal = Number(orderObj?.delivery_fee || 0);
                  const taxesVal = Number(orderObj?.gst_amount || 0);
                  const discountVal = Number(orderObj?.discount_amount || 0);

                  return (
                    <View style={{ marginTop: 8, paddingTop: 6 }}>
                      <View style={{ height: 1, backgroundColor: '#E5E7EB', marginBottom: 10 }} />
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#9CA3AF', letterSpacing: 0.8, marginBottom: 8 }}>BILL SUMMARY</Text>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, color: '#4B5563', fontWeight: '500' }}>Item Total</Text>
                        <Text style={{ fontSize: 13, color: '#111827', fontWeight: '600' }}>₹{subtotalVal.toFixed(0)}</Text>
                      </View>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, color: '#4B5563', fontWeight: '500' }}>Delivery Fee</Text>
                        {deliveryFeeVal > 0 ? (
                          <Text style={{ fontSize: 13, color: '#111827', fontWeight: '600' }}>₹{deliveryFeeVal.toFixed(0)}</Text>
                        ) : (
                          <Text style={{ fontSize: 13, color: '#111827', fontWeight: '600' }}>
                            <Text style={{ textDecorationLine: 'line-through', color: '#9CA3AF' }}>₹40</Text>
                            <Text style={{ color: '#16A34A', fontWeight: '700' }}> FREE</Text>
                          </Text>
                        )}
                      </View>

                      {taxesVal > 0 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={{ fontSize: 13, color: '#4B5563', fontWeight: '500' }}>Taxes & Restaurant Charges</Text>
                          <Text style={{ fontSize: 13, color: '#111827', fontWeight: '600' }}>₹{taxesVal.toFixed(2)}</Text>
                        </View>
                      )}

                      {discountVal > 0 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '500' }}>Coupon / Discount</Text>
                          <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '600' }}>- ₹{discountVal.toFixed(2)}</Text>
                        </View>
                      )}

                      <View style={{ marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E5E7EB', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#111827' }}>To Pay / Paid</Text>
                        <Text style={{ fontSize: 16, fontWeight: '800', color: '#EA580C' }}>₹{totalAmountVal.toFixed(0)}</Text>
                      </View>
                    </View>
                  );
                })()}
              </View>
            )}
          </View>

          {/* Need help with your order? Card */}
          <View style={styles.pixelHelpCard}>
            <View style={styles.pixelHelpIconWrap}>
              <Ionicons name="headset-outline" size={22} color="#EA580C" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.pixelHelpTitle}>Need help with your order?</Text>
              <Text style={styles.pixelHelpSub}>Our support team is here to help</Text>
            </View>
            <TouchableOpacity
              style={styles.pixelChatBtn}
              onPress={() => {
                const phone = selectedOutlet?.phone || '1234567890';
                Linking.openURL(`tel:${phone}`);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.pixelChatBtnText}>Chat</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        {/* Bottom cancellation if order is PENDING/CONFIRMED */}
        {['PENDING', 'CONFIRMED'].includes(orderStatusRaw) && (
          <View style={[styles.pixelCancelBar, { paddingBottom: insets.bottom || 16 }]}>
            <TouchableOpacity
              style={styles.pixelCancelBtn}
              onPress={() => openCancelModal()}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
              <Text style={styles.pixelCancelBtnText}>Cancel Order</Text>
            </TouchableOpacity>
          </View>
        )}


        {renderCancelModal()}
      </View>
    );
  }

  if (isDineIn) {
    // Derive the displayed status from active rounds
    const sessionRounds: any[] = sessionStore.orderRounds || [];
    const nonCancelledRounds = sessionRounds.filter((r: any) => (r.status || '').toUpperCase() !== 'CANCELLED');
    const allServed = nonCancelledRounds.length > 0 && nonCancelledRounds.every((r: any) => ['SERVED', 'COMPLETED', 'DELIVERED'].includes((r.status || '').toUpperCase()));

    const latestActiveRound = [...nonCancelledRounds]
      .reverse()
      .find((r: any) => !['SERVED', 'COMPLETED'].includes((r.status || '').toUpperCase()));

    const latestRound = sessionRounds.length > 0 ? sessionRounds[sessionRounds.length - 1] : null;

    let dineInStatusRaw = (
      (latestActiveRound?.status) ||
      (allServed ? 'SERVED' : '') ||
      (latestRound?.status) ||
      orderDetails?.order?.status ||
      'PENDING'
    ).toUpperCase();

    let dineInStep = 1;
    let topTitle = "Order Received";
    let topSub = "We've got your order";
    let progressPct = "25%";

    if (dineInStatusRaw === 'CANCELLED') {
      dineInStep = -1;
      topTitle = "Order Cancelled";
      topSub = "This order was cancelled";
      progressPct = "0%";
    } else if (['CONFIRMED', 'PENDING'].includes(dineInStatusRaw)) {
      dineInStep = 1;
      topTitle = "Order Received";
      topSub = "We've got your order";
      progressPct = "25%";
    } else if (dineInStatusRaw === 'PREPARING') {
      dineInStep = 2;
      topTitle = "Preparing";
      topSub = "Chef is cooking your meal";
      progressPct = "50%";
    } else if (['READY', 'ALMOST_READY'].includes(dineInStatusRaw)) {
      dineInStep = 3;
      topTitle = "Ready to Serve";
      topSub = "Plating up Now";
      progressPct = "75%";
    } else if (['SERVED', 'COMPLETED', 'DELIVERED'].includes(dineInStatusRaw)) {
      dineInStep = 4;
      topTitle = "Served at Table";
      topSub = "Enjoy your meal!";
      progressPct = "100%";
    }

    const steps = [
      { id: 1, title: "Order Received", sub: "We've got your order", icon: "checkmark" },
      { id: 2, title: "Preparing", sub: "Chef is cooking your meal", icon: "restaurant" },
      { id: 3, title: "Ready to Serve", sub: "Plating up now", icon: "cafe" },
      { id: 4, title: "Served at Table", sub: "Enjoy your meal", icon: "fast-food" },
    ];

    const getDineInSubtotal = () => {
      const sessionStore = useDineInSessionStore.getState();
      if (sessionStore.orderRounds && sessionStore.orderRounds.length > 0) {
        const nonCancelled = sessionStore.orderRounds.filter((r: any) => (r.status || '').toUpperCase() !== 'CANCELLED');
        return nonCancelled.reduce((sum: number, r: any) => sum + (Number(r.total_amount) || 0), 0);
      }
      if (sessionStore.isActive && sessionStore.totalAmount > 0) {
        return sessionStore.totalAmount;
      }
      if ((orderDetails?.order?.status || '').toUpperCase() === 'CANCELLED') {
        return 0;
      }
      if (orderDetails?.order?.total_amount != null && Number(orderDetails.order.total_amount) > 0) {
        return Number(orderDetails.order.total_amount);
      }
      return orderItemsList.reduce((sum: number, item: any) => sum + (item.price * (item.quantity || item.qty || 1)), 0);
    };

    const topCardImageSource = require('../../../assets/images/restaurant_bg.png');

    return (
      <SafeAreaView style={[styles.container, { backgroundColor: '#fff' }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#fff" />
        
        {/* Header */}
        <View style={styles.dineInHeader}>
          <TouchableOpacity style={styles.dineInBackBtn} onPress={handleGoBack}>
            <Ionicons name="arrow-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.dineInHeaderTitle}>Track Order</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}>
          
          <View style={styles.dineInContent}>
            {/* Top Image Card */}
            <View style={styles.dineInTopCard}>
              <Image source={topCardImageSource} style={styles.dineInTopCardBg} blurRadius={2} />
              <View style={styles.dineInTopCardOverlay} />
              <View style={styles.dineInTopCardContent}>
                <View style={styles.dineInTopCardTopRow}>
                  <View>
                    <Text style={styles.dineInTopCardOrderIdLabel}>Order ID</Text>
                    <Text style={styles.dineInTopCardOrderIdValue}>{params.orderId}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {billNumber ? (
                      <View style={styles.dineInBillBadge}>
                        <Ionicons name="receipt-outline" size={11} color="#fff" style={{ marginRight: 4 }} />
                        <Text style={styles.dineInBillBadgeText}>Bill #{billNumber}</Text>
                      </View>
                    ) : null}
                  {dineInStatusRaw === 'CANCELLED' ? (
                    <View style={[styles.dineInLiveBadge, { backgroundColor: '#dc2626' }]}>
                      <Ionicons name="close-circle" size={10} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={styles.dineInLiveText}>Cancelled</Text>
                    </View>
                  ) : (
                    <View style={styles.dineInLiveBadge}>
                      <Ionicons name="notifications" size={10} color="#fff" style={{ marginRight: 4 }} />
                      <Text style={styles.dineInLiveText}>Live</Text>
                    </View>
                  )}
                  </View>
                </View>

                <View style={styles.dineInTopCardBottomRow}>
                  <Text style={styles.dineInTopCardStatus}>{topTitle}</Text>
                  <Text style={styles.dineInTopCardSub}>{topSub}</Text>
                  
                  <View style={styles.dineInProgressBarContainer}>
                    <View style={[styles.dineInProgressBarFill, { width: progressPct as any }]} />
                  </View>
                </View>
              </View>
            </View>

            {/* Status Display: Cancelled Banner vs Stepper */}
            {dineInStatusRaw === 'CANCELLED' ? (
              <View style={styles.cancelledStatusBanner}>
                <View style={styles.cancelledIconWrap}>
                  <Ionicons name="close-circle" size={28} color="#DC2626" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.cancelledStatusTitle}>Order Cancelled</Text>
                  <Text style={styles.cancelledStatusSub}>
                    This order was cancelled before kitchen preparation began.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={styles.dineInStepperContainer}>
                {steps.map((step, index) => {
                  const isCompleted = dineInStep > step.id;
                  const isActive = dineInStep === step.id;
                  const isPending = dineInStep < step.id;
                  
                  let iconBg = '#eee';
                  let iconColor = '#888';
                  if (isCompleted || isActive) {
                    iconBg = '#22c55e'; // Green
                    iconColor = '#fff';
                  }

                  return (
                    <View key={step.id} style={styles.dineInStepRow}>
                      {/* Left Column: Icon and Line */}
                      <View style={styles.dineInStepLeftCol}>
                        <View style={[styles.dineInStepIconContainer, { backgroundColor: iconBg }]}>
                          <Ionicons name={step.icon as any} size={14} color={iconColor} />
                        </View>
                        {index < steps.length - 1 && (
                          <View style={[
                            styles.dineInStepLine, 
                            (isCompleted) ? { backgroundColor: '#22c55e' } : { backgroundColor: '#eee' }
                          ]} />
                        )}
                      </View>

                      {/* Right Column: Text */}
                      <View style={styles.dineInStepRightCol}>
                        <Text style={[styles.dineInStepTitle, (isActive || isCompleted) ? { color: '#000' } : { color: '#888' }]}>
                          {step.title}
                        </Text>
                        <Text style={[styles.dineInStepSub, (isActive || isCompleted) ? { color: '#555' } : { color: '#888' }]}>
                          {step.sub}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Order Summary & Rounds */}
            {dineInStatusRaw === 'CANCELLED' ? (
              <View style={[styles.dineInOrderSummary, { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <Ionicons name="close-circle" size={18} color="#dc2626" style={{ marginRight: 6 }} />
                  <Text style={[styles.dineInOrderSummaryTitle, { color: '#991b1b', marginBottom: 0 }]}>Cancelled Order Summary</Text>
                </View>
                <Text style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 12 }}>
                  All items in this order have been cancelled. No items are active.
                </Text>

                <View style={styles.dineInOrderItems}>
                  {orderItemsList.map((item: any, idx: number) => (
                    <View key={idx} style={styles.dineInOrderItemRow}>
                      <Text style={[styles.dineInOrderItemName, { color: '#94a3b8', textDecorationLine: 'line-through' }]} numberOfLines={1}>
                        {item.quantity || item.qty || 1} x {item.name || item.title || 'Item'}
                      </Text>
                      <Text style={[styles.dineInOrderItemPrice, { color: '#dc2626', textDecorationLine: 'line-through' }]}>
                        Cancelled
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={[styles.dineInOrderSummaryDivider, { backgroundColor: '#fecaca' }]} />

                <View style={styles.dineInOrderTotalRow}>
                  <Text style={[styles.dineInOrderTotalLabel, { color: '#991b1b' }]}>Total :</Text>
                  <Text style={[styles.dineInOrderTotalValue, { color: '#dc2626' }]}>Cancelled (Rs. 0)</Text>
                </View>
              </View>
            ) : sessionStore.isActive && activeOrderRounds.length > 1 ? (
              <View style={styles.dineInOrderSummary}>
                <Text style={styles.dineInOrderSummaryTitle}>Order Rounds ({activeOrderRounds.length})</Text>
                
                {activeOrderRounds.map((roundObj: any, rIdx: number) => {
                  const rStatus = (roundObj.status || 'PENDING').toUpperCase();
                  let statusBg = '#e2e8f0';
                  let statusColor = '#475569';
                  let statusLabel = 'Order Received';

                  if (rStatus === 'PENDING' || rStatus === 'CONFIRMED') {
                    statusBg = '#fef3c7';
                    statusColor = '#d97706';
                    statusLabel = 'Order Received';
                  } else if (rStatus === 'PREPARING') {
                    statusBg = '#ffedd5';
                    statusColor = '#ea580c';
                    statusLabel = 'Cooking';
                  } else if (rStatus === 'READY' || rStatus === 'ALMOST_READY') {
                    statusBg = '#dcfce7';
                    statusColor = '#16a34a';
                    statusLabel = 'Ready to Serve';
                  } else if (rStatus === 'SERVED' || rStatus === 'COMPLETED') {
                    statusBg = '#f1f5f9';
                    statusColor = '#64748b';
                    statusLabel = 'Served';
                  }

                  const roundItems = (roundObj.items || []).filter(
                    (it: any) => (it.status || '').toUpperCase() !== 'CANCELLED'
                  );

                  return (
                    <View key={roundObj.id || rIdx} style={styles.dineInRoundCard}>
                      <View style={styles.dineInRoundHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.dineInRoundTitle}>Round {roundObj.round || rIdx + 1}</Text>
                          <Text style={styles.dineInRoundOrderId}> (#{roundObj.orderId})</Text>
                        </View>
                        <View style={[styles.dineInRoundBadge, { backgroundColor: statusBg }]}>
                          <Text style={[styles.dineInRoundBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                        </View>
                      </View>

                      <View style={styles.dineInRoundItemsList}>
                        {roundItems.map((item: any, iIdx: number) => (
                          <View key={iIdx} style={styles.dineInOrderItemRow}>
                            <Text style={styles.dineInOrderItemName} numberOfLines={1}>
                              {item.quantity || item.qty || 1} x {item.name || item.title || 'Item'}
                            </Text>
                            <Text style={styles.dineInOrderItemPrice}>
                              Rs. {Number(item.price) * (item.quantity || item.qty || 1)}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {['PENDING', 'CONFIRMED'].includes(rStatus) && (
                        <View style={styles.roundCancelRow}>
                          <Text style={styles.roundCancelNote}>Kitchen not started yet</Text>
                          <TouchableOpacity
                            style={styles.roundCancelBtn}
                            onPress={() => openCancelModal(
                              roundObj.id,
                              Number(roundObj.total_amount || 0),
                              `Round ${roundObj.round || rIdx + 1} (#${roundObj.orderId})`
                            )}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="close-circle-outline" size={13} color="#DC2626" style={{ marginRight: 4 }} />
                            <Text style={styles.roundCancelBtnText}>Cancel Round</Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}

                <View style={styles.dineInOrderSummaryDivider} />

                <View style={styles.dineInOrderTotalRow}>
                  <Text style={styles.dineInOrderTotalLabel}>Total Combined Bill :</Text>
                  <Text style={styles.dineInOrderTotalValue}>Rs. {getDineInSubtotal()}</Text>
                </View>
              </View>
            ) : (
              <View style={styles.dineInOrderSummary}>
                <Text style={styles.dineInOrderSummaryTitle}>Your Order</Text>
                
                <View style={styles.dineInOrderItems}>
                  {orderItemsList.map((item: any, idx: number) => {
                    const qty = Number(item.quantity || item.qty || 1);
                    const pr = Number(item.price || 0);
                    return (
                      <View key={idx} style={styles.dineInOrderItemRow}>
                        <Text style={styles.dineInOrderItemName} numberOfLines={1}>
                          {qty} x {item.name || item.title || 'Item'}
                        </Text>
                        <Text style={styles.dineInOrderItemPrice}>
                          Rs. {pr * qty}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Split up Bill Summary */}
                {(() => {
                  const subtotal = getDineInSubtotal();
                  const orderObj = orderDetails?.order;
                  const taxesVal = Number(orderObj?.gst_amount || 0);
                  const discountVal = Number(orderObj?.discount_amount || 0);
                  const finalTotal = subtotal + taxesVal - discountVal;

                  return (
                    <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f1f5f9' }}>
                      <Text style={{ fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 0.8, marginBottom: 8 }}>BILL SUMMARY</Text>

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500' }}>Item Subtotal</Text>
                        <Text style={{ fontSize: 13, color: '#1e293b', fontWeight: '600' }}>Rs. {subtotal}</Text>
                      </View>

                      {taxesVal > 0 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500' }}>Taxes & GST</Text>
                          <Text style={{ fontSize: 13, color: '#1e293b', fontWeight: '600' }}>Rs. {taxesVal.toFixed(2)}</Text>
                        </View>
                      )}

                      {discountVal > 0 && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '500' }}>Discount</Text>
                          <Text style={{ fontSize: 13, color: '#ef4444', fontWeight: '600' }}>- Rs. {discountVal.toFixed(2)}</Text>
                        </View>
                      )}

                      <View style={{ marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={styles.dineInOrderTotalLabel}>Grand Total :</Text>
                        <Text style={styles.dineInOrderTotalValue}>Rs. {finalTotal.toFixed(0)}</Text>
                      </View>
                    </View>
                  );
                })()}
              </View>
            )}

            {/* Modern Cancellation Option Card */}
            {['PENDING', 'CONFIRMED'].includes(dineInStatusRaw) && (() => {
              const cancellableRounds = (sessionStore.orderRounds || []).filter(
                (r: any) => ['PENDING', 'CONFIRMED'].includes((r.status || '').toUpperCase())
              );
              if (cancellableRounds.length === 0) return null;
              const totalCancellable = cancellableRounds.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
              return (
                <View style={styles.cancellationBannerCard}>
                  <View style={{ marginBottom: 10 }}>
                    <Text style={styles.cancellationBannerTitle}>Need to cancel the whole order?</Text>
                    <Text style={styles.cancellationBannerSub}>
                      Cancel all {cancellableRounds.length} pending round{cancellableRounds.length > 1 ? 's' : ''} (Rs. {totalCancellable}) before kitchen preparation begins.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.cancelActionBtn, { alignSelf: 'flex-start' }]}
                    onPress={openCancelAllModal}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle-outline" size={15} color="#DC2626" style={{ marginRight: 4 }} />
                    <Text style={styles.cancelActionBtnText}>Cancel Entire Order</Text>
                  </TouchableOpacity>
                </View>
              );
            })()}

          </View>
        </ScrollView>

        {/* Bottom Buttons */}
        <View style={[styles.dineInBottomActions, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          {dineInStatusRaw === 'CANCELLED' ? (
            <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
              <TouchableOpacity
                style={[styles.dineInCallStaffBtn, { flex: 1, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' }]}
                onPress={handleGoBack}
                activeOpacity={0.8}
              >
                <Ionicons name="home-outline" size={16} color="#334155" />
                <Text style={[styles.dineInCallStaffText, { color: '#334155' }]}>Home</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.dineInOrderMoreBtn, { flex: 2, backgroundColor: '#00a01d' }]}
                onPress={() => router.replace('/menu')}
                activeOpacity={0.8}
              >
                <Ionicons name="restaurant-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.dineInOrderMoreText}>Start New Order</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity style={styles.dineInCallStaffBtn} onPress={() => Linking.openURL(`tel:${selectedOutlet?.phone || '1234567890'}`)}>
                <Ionicons name="call-outline" size={16} color="#000" />
                <Text style={styles.dineInCallStaffText}>Call Staff</Text>
              </TouchableOpacity>

              {getDineInSubtotal() > 0 && (
                <TouchableOpacity style={styles.dineInPayBillBtn} onPress={() => {
                  const rawId = params.orderId || (orderDetails?.order?.id ? `ORD-${String(orderDetails.order.id).padStart(6, '0')}` : 'ORD-000000');
                  const dbId = params.dbOrderId || (orderDetails?.order?.id ? String(orderDetails.order.id) : '');
                  const tot = getDineInSubtotal();
                  const sessionStore = useDineInSessionStore.getState();

                  // Extract all items from active, non-cancelled rounds
                  const nonCancelledItems = sessionStore.isActive && sessionStore.orderRounds && sessionStore.orderRounds.length > 0
                    ? sessionStore.orderRounds
                        .filter((r: any) => (r.status || '').toUpperCase() !== 'CANCELLED')
                        .flatMap((r: any) => r.items || [])
                    : orderItemsList;

                  router.push({
                    pathname: '/(checkout)/payment',
                    params: {
                      isDineInSettlement: 'true',
                      orderId: rawId,
                      dbOrderId: dbId,
                      sessionId: String(sessionStore.sessionDbId || params.sessionId || ''),
                      sessionUid: sessionStore.sessionUid || params.sessionUid || '',
                      tableNumber: activeTable,
                      totalAmount: String(tot),
                      cartItems: JSON.stringify(nonCancelledItems),
                    }
                  });
                }}>
                  <Ionicons name="card-outline" size={16} color="#fff" />
                  <Text style={styles.dineInPayBillText}>Pay Bill</Text>
                </TouchableOpacity>
              )}
              
              <TouchableOpacity style={styles.dineInOrderMoreBtn} onPress={() => {
                router.push({
                  pathname: '/menu',
                  params: {
                    orderType: 'Dine In',
                    tableNumber: activeTable,
                  }
                });
              }}>
                <Text style={styles.dineInOrderMoreText}>Order More</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {renderCancelModal()}
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fafafa" />
      {/* Main Track Order Scroll Area */}
      <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingTop: insets.top + 10 }} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.headerBlock}>
          <View style={styles.takeawayHeaderRow}>
            <View>
              <Text style={styles.orderIdText}>#{params.orderId}</Text>
              <Text style={styles.pageTitle}>Order Status</Text>
            </View>
            {billNumber ? (
              <View style={styles.takeawayBillBadge}>
                <Ionicons name="receipt" size={14} color="#ea580c" style={{ marginRight: 5 }} />
                <Text style={styles.takeawayBillBadgeLabel}>BILL</Text>
                <Text style={styles.takeawayBillBadgeValue}>#{billNumber}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {rawStatus === 'CANCELLED' ? (
          <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
            <View style={styles.cancelledStatusBanner}>
              <View style={styles.cancelledIconWrap}>
                <Ionicons name="close-circle" size={28} color="#DC2626" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.cancelledStatusTitle}>Order Cancelled</Text>
                <Text style={styles.cancelledStatusSub}>
                  This takeaway order was cancelled before kitchen preparation began.
                </Text>
              </View>
            </View>

            {/* Cancelled Dishes Summary */}
            <View style={[styles.dineInOrderSummary, { backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, marginTop: 14 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Ionicons name="close-circle" size={18} color="#dc2626" style={{ marginRight: 6 }} />
                <Text style={[styles.dineInOrderSummaryTitle, { color: '#991b1b', marginBottom: 0 }]}>Cancelled Dishes</Text>
              </View>
              <Text style={{ fontSize: 13, color: '#7f1d1d', marginBottom: 12 }}>
                All items in this takeaway order have been cancelled. No items are active.
              </Text>
              <View style={styles.dineInOrderItems}>
                {orderItemsList.map((item: any, idx: number) => (
                  <View key={idx} style={styles.dineInOrderItemRow}>
                    <Text style={[styles.dineInOrderItemName, { color: '#94a3b8', textDecorationLine: 'line-through' }]} numberOfLines={1}>
                      {item.quantity || item.qty || 1} x {item.name || item.title || 'Item'}
                    </Text>
                    <Text style={[styles.dineInOrderItemPrice, { color: '#dc2626', textDecorationLine: 'line-through' }]}>
                      Cancelled
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : (
          <>
            {/* Progress Tracker Box */}
            <View style={styles.trackerBox}>
              <View style={styles.stepsRow}>
                 {stepLabels.map((label, idx) => {
                   const step = idx + 1;
                   const isActiveOrDone = statusLevel >= step;
                   const iconName = stepIcons[idx] as any;
                   return (
                     <View key={step} style={styles.stepItem}>
                       <View style={[styles.stepCircle, getStepStyle(step)]}>
                          <Ionicons name={iconName} size={16} color={getStepIconColor(step)} />
                       </View>
                       <Text style={[styles.stepLabel, { color: getStepTextColor(step) }]}>
                         {label.replace(' ', '\n')}
                       </Text>
                     </View>
                   )
                 })}
              </View>
            </View>

            <View style={{ paddingHorizontal: 16 }}>
              {/* Status Banner Card */}
              <View style={styles.bannerCard}>
                 <View style={styles.bannerIconCircle}>
                    <Ionicons name="flame" size={20} color="#ff4500" />
                 </View>
                 <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text style={styles.bannerTitle}>{bannerTitle}</Text>
                    <Text style={styles.bannerSub}>{bannerSub}</Text>
                 </View>
              </View>

              {/* Estimated Prep Box */}
              <View style={styles.prepBox}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.prepBoxLabel}>Estimated preparation</Text>
                  <Text style={styles.prepBoxTime}>Ready in ~8 minutes</Text>
                </View>
                <Ionicons name="time-outline" size={24} color="#fff" />
              </View>

              {/* Alert Box */}
              <View style={styles.alertBox}>
                <Ionicons name="warning-outline" size={20} color="#000" />
                <View style={{ marginLeft: 10 }}>
                  <Text style={styles.alertBoxTitle}>{alertTitle}</Text>
                  <Text style={styles.alertBoxSub}>{alertSub}</Text>
                </View>
              </View>

              {/* Takeaway Cancellation Option Card */}
              {['PENDING', 'CONFIRMED'].includes((orderDetails?.order?.status || '').toUpperCase()) && (
                <View style={styles.cancellationBannerCard}>
                  <View style={{ marginBottom: 10 }}>
                    <Text style={styles.cancellationBannerTitle}>Need to cancel?</Text>
                    <Text style={styles.cancellationBannerSub}>
                      Cancellation is available before the kitchen starts preparing your takeaway order.
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.cancelActionBtn, { alignSelf: 'flex-start' }]}
                    onPress={() => openCancelModal(orderDetails?.order?.id || params.dbOrderId)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="close-circle-outline" size={15} color="#DC2626" style={{ marginRight: 4 }} />
                    <Text style={styles.cancelActionBtnText}>Cancel Takeaway Order</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Dish Prep Status */}
              <Text style={styles.dishSectionTitle}>Dish preparation status</Text>
              <View style={styles.dishList}>
                {orderItemsList.map((item: any, idx: number) => renderItemStatus(item, idx))}
              </View>
            </View>
          </>
        )}
        
      </ScrollView>

      {/* Bottom Actions */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom || 16 }]}>
        {rawStatus === 'CANCELLED' ? (
          <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
            <TouchableOpacity
              style={[styles.callButton, { flex: 1, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' }]}
              onPress={handleGoBack}
              activeOpacity={0.8}
            >
              <Ionicons name="home-outline" size={16} color="#334155" />
              <Text style={[styles.callBtnText, { color: '#334155' }]}>Home</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.orderMoreBtn, { flex: 2, backgroundColor: '#00a01d' }]}
              onPress={() => router.replace('/menu')}
              activeOpacity={0.8}
            >
              <Ionicons name="restaurant-outline" size={16} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.orderMoreText}>Start New Order</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {['PENDING', 'CONFIRMED'].includes((orderDetails?.order?.status || '').toUpperCase()) && (
              <TouchableOpacity
                style={[styles.callButton, { borderColor: '#FECACA', backgroundColor: '#FEF2F2', marginRight: 8 }]}
                onPress={() => openCancelModal(orderDetails?.order?.id || params.dbOrderId)}
                activeOpacity={0.7}
              >
                <Ionicons name="close-circle-outline" size={18} color="#DC2626" />
                <Text style={[styles.callBtnText, { color: '#DC2626', fontWeight: '700', marginLeft: 4 }]}>Cancel</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.callButton} onPress={() => Linking.openURL(`tel:${selectedOutlet?.phone || '1234567890'}`)}>
              <Ionicons name="call-outline" size={18} color="#000" />
              <Text style={styles.callBtnText}>Call Restaurant</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.orderMoreBtn} onPress={() => router.replace('/menu')}>
              <Text style={styles.orderMoreText}>Order More</Text>
              <Ionicons name="restaurant-outline" size={18} color="#fff" />
            </TouchableOpacity>
          </>
        )}
      </View>

      {renderCancelModal()}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  headerBlock: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  takeawayHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  takeawayBillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff7ed',
    borderWidth: 1.5,
    borderColor: '#fed7aa',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
    shadowColor: '#ea580c',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  takeawayBillBadgeLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ea580c',
    letterSpacing: 0.8,
    marginRight: 4,
  },
  takeawayBillBadgeValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#9a3412',
    letterSpacing: 0.3,
  },
  dineInBillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.25)',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  dineInBillBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  deliveryBillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  deliveryBillBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16a34a',
  },
  orderIdText: {
    color: '#ff4500',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#000',
  },
  trackerBox: {
    backgroundColor: '#f9f9f9',
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  stepItem: {
    alignItems: 'center',
    width: '18%',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stepCompleted: {
    backgroundColor: '#00a01d',
  },
  stepActive: {
    backgroundColor: '#ff4500',
  },
  stepPending: {
    backgroundColor: '#eee',
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  bannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ff4500',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    backgroundColor: '#fff',
  },
  bannerIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff0eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  bannerSub: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  prepBox: {
    backgroundColor: '#222',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  prepBoxLabel: {
    color: '#aaa',
    fontSize: 12,
    marginBottom: 4,
  },
  prepBoxTime: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  alertBox: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  alertBoxTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  alertBoxSub: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  dishSectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  dishList: {
    paddingBottom: 20,
  },
  dishCard: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  dishHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dishImage: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#eee',
  },
  dishTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  dishName: {
    fontSize: 14,
    fontWeight: 'bold',
    flex: 1,
  },
  dishStatusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  progressContainer: {
    height: 4,
    backgroundColor: '#eee',
    borderRadius: 2,
    width: '100%',
    marginBottom: 6,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  dishSubText: {
    fontSize: 11,
    color: '#888',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#fff',
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    justifyContent: 'space-between',
  },
  callButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
    paddingVertical: 14,
    borderRadius: 12,
    flex: 0.48,
  },
  callBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginLeft: 6,
  },
  orderMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00a01d',
    paddingVertical: 14,
    borderRadius: 12,
    flex: 0.48,
  },
  orderMoreText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
    marginRight: 6,
  },
  payBillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ff3400',
    paddingVertical: 14,
    borderRadius: 12,
    flex: 0.48,
  },
  payBillBtnText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
  },
  // Dine In specific styles
  dineInHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  dineInBackBtn: {
    marginRight: 15,
  },
  dineInHeaderTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#000',
  },
  dineInContent: {
    paddingHorizontal: 20,
  },
  dineInTopCard: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 30,
    backgroundColor: '#000',
  },
  dineInTopCardBg: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  dineInTopCardOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  dineInTopCardContent: {
    padding: 16,
    flex: 1,
    justifyContent: 'space-between',
  },
  dineInTopCardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dineInTopCardOrderIdLabel: {
    color: '#ccc',
    fontSize: 10,
    marginBottom: 2,
  },
  dineInTopCardOrderIdValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  dineInLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ff4500',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dineInLiveText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  dineInTopCardBottomRow: {
    marginTop: 'auto',
  },
  dineInTopCardStatus: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    marginBottom: 4,
  },
  dineInTopCardSub: {
    color: '#eee',
    fontSize: 12,
    marginBottom: 12,
  },
  dineInProgressBarContainer: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  dineInProgressBarFill: {
    height: '100%',
    backgroundColor: '#ff4500',
    borderRadius: 2,
  },
  dineInStepperContainer: {
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  dineInStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dineInStepLeftCol: {
    alignItems: 'center',
    marginRight: 16,
    width: 24,
  },
  dineInStepIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  dineInStepLine: {
    width: 2,
    height: 40,
    marginVertical: -2,
    zIndex: 1,
  },
  dineInStepRightCol: {
    flex: 1,
    paddingBottom: 24,
  },
  dineInStepTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  dineInStepSub: {
    fontSize: 12,
  },
  dineInOrderSummary: {
    backgroundColor: '#f9f9f9',
    borderRadius: 16,
    padding: 16,
  },
  dineInOrderSummaryTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  dineInRoundCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  dineInRoundHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dineInRoundTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0f172a',
  },
  dineInRoundOrderId: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  dineInRoundBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dineInRoundBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  dineInRoundItemsList: {
    marginTop: 2,
  },
  dineInOrderItems: {
    marginBottom: 16,
  },
  dineInOrderItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dineInOrderItemName: {
    fontSize: 13,
    color: '#555',
    flex: 1,
    marginRight: 10,
  },
  dineInOrderItemPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000',
  },
  dineInOrderSummaryDivider: {
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 1,
    marginBottom: 16,
  },
  dineInOrderTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dineInOrderTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  dineInOrderTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  dineInBottomActions: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    backgroundColor: '#fff',
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    justifyContent: 'space-between',
  },
  dineInCallStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    paddingVertical: 14,
    borderRadius: 25,
    flex: 0.3,
    backgroundColor: '#fff',
  },
  dineInCallStaffText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000',
    marginLeft: 6,
  },
  dineInPayBillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e1e1e',
    paddingVertical: 14,
    borderRadius: 25,
    flex: 0.33,
  },
  dineInPayBillText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 6,
  },
  dineInOrderMoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00a01d', // Green like in the image
    paddingVertical: 14,
    borderRadius: 25,
    flex: 0.33,
  },
  dineInOrderMoreText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#fff',
  },
  dineInCancelRoundBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  dineInCancelRoundText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF4444',
  },
  // Modal & Cancellation Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  cancelCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  cancelIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  cancelTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  cancelSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  cancelOrderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  cancelOrderInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cancelOrderInfoText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
  },
  cancelOrderInfoPrice: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  cancelErrorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    width: '100%',
    marginBottom: 14,
  },
  cancelErrorText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
    lineHeight: 16,
    fontWeight: '600',
  },
  cancelModalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: 12,
  },
  cancelKeepBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelKeepBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  cancelConfirmBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  cancelConfirmBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancellationBannerCard: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FFE4E6',
    borderRadius: 16,
    padding: 16,
    marginTop: 14,
    marginBottom: 24,
  },
  cancellationBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9F1239',
    marginBottom: 2,
  },
  cancellationBannerSub: {
    fontSize: 11,
    color: '#BE123C',
    lineHeight: 15,
  },
  cancelActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  cancelActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  roundCancelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  roundCancelNote: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  roundCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  roundCancelBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
  },
  cancelledStatusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 16,
    padding: 16,
    marginVertical: 14,
  },
  cancelledIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelledStatusTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#991B1B',
    marginBottom: 2,
  },
  cancelledStatusSub: {
    fontSize: 12,
    color: '#B91C1C',
    lineHeight: 16,
  },
  tpDeliveryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 16,
    marginTop: 10,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tpPartnerCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tpPartnerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF5F2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFD5CC',
  },
  tpPartnerBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FF3400',
  },
  tpAdminAssignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  tpAdminAssignBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  tpRiderDetailBody: {
    marginTop: 4,
  },
  tpRiderInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tpRiderAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tpRiderNameText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
  },
  tpRiderSubText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  tpCallRiderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E8F8EE',
    borderWidth: 1,
    borderColor: '#B9F1CC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tpCallRiderBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#00a01d',
  },
  tpRiderMetaRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  tpMetaPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
  },
  tpMetaPillLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  tpMetaPillValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#111827',
  },
  tpExternalTrackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 12,
  },
  tpExternalTrackBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  tpUnassignedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBEB',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  tpUnassignedText: {
    fontSize: 13,
    color: '#92400E',
    fontWeight: '500',
    flex: 1,
  },
  tpViewMapActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FF3400',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 14,
  },
  tpViewMapActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  // Pixel-perfect reference styles
  pixelContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  pixelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
  },
  pixelBackBtn: {
    padding: 6,
    marginLeft: -6,
    marginRight: 8,
  },
  pixelHeaderTitleBlock: {
    flex: 1,
  },
  pixelHeaderTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  pixelHeaderSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  pixelTopStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F8EE',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pixelTopStatusText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
    marginLeft: 5,
  },
  pixelStepperBox: {
    marginVertical: 18,
  },
  pixelStepperTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    position: 'relative',
  },
  pixelStepperLine: {
    position: 'absolute',
    top: 16,
    height: 2,
    zIndex: 0,
  },
  pixelStepColumn: {
    alignItems: 'center',
    width: 75,
    zIndex: 1,
  },
  pixelStepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  pixelStepLabel: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 14,
  },
  pixelMintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  pixelMintIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pixelMintContentBox: {
    flex: 1,
    marginHorizontal: 10,
  },
  pixelMintTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  pixelMintSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  pixelMintEtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pixelMintEtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  pixelPartnerCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  pixelPartnerTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pixelPartnerLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  pixelPartnerName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginTop: 2,
  },
  pixelAssignedPill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pixelAssignedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  pixelAdminIconBtn: {
    padding: 4,
  },
  pixelDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  pixelRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 140,
  },
  pixelRowIcon: {
    marginRight: 8,
  },
  pixelRowLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  pixelRowValue: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
    flex: 1,
  },
  pixelGreenCallBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#00A01D',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  pixelTrackPartnerAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 14,
  },
  pixelTrackPartnerAppText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#16A34A',
    marginHorizontal: 8,
  },
  pixelSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
  },
  pixelSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pixelSummaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pixelSummaryTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  pixelSummaryCount: {
    fontSize: 13,
    color: '#6B7280',
    marginLeft: 6,
  },
  pixelSummaryPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pixelSummaryPriceText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FF3400',
  },
  pixelSummaryBody: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  pixelItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  pixelItemThumb: {
    width: 44,
    height: 44,
    borderRadius: 8,
  },
  pixelItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  pixelItemSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  pixelHelpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  pixelHelpIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pixelHelpTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  pixelHelpSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  pixelChatBtn: {
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pixelChatBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EA580C',
  },
  pixelCancelBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  pixelCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 12,
    borderRadius: 12,
  },
  pixelCancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#DC2626',
  },
});
