import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Platform,
  StatusBar,
  Dimensions,
  Linking,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { deliveryApi, orderApi } from '../../services/apiService';
import { useRestaurantStore, useLiveOrderStore } from '../../store';
import { purgeDeletedOrderLocally } from '../../store/sessionUtils';
import { getFullImageUrl } from '../../constants/api';
import {
  DELIVERY_STATUS,
  getDeliveryContextText,
  getDeliveryProgressStep,
  isLiveTrackingStatus,
  isDeliveredStatus,
  isTerminalStatus,
  resolveDeliveryStatus,
} from '../../utils/deliveryStatusUtils';
import { LIGHT_MAP_STYLE } from '../../constants/mapStyle';
import { resolveOutletLocation } from '../../utils/deliveryArea';
import {
  getKitchenBanner,
  getKitchenLevel,
  getDishProgress,
  normalizeOrderType,
  getUnifiedDeliveryStage,
} from '../../utils/orderStatusMessages';


const { width } = Dimensions.get('window');

type DeliveryStatus = typeof DELIVERY_STATUS[keyof typeof DELIVERY_STATUS] | null;

export default function DeliveryTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId: string;
    dbOrderId: string;
    cart: string;
    totalAmount?: string;
    paymentMethod?: string;
  }>();

  const { selectedOutlet } = useRestaurantStore();
  const [currentStatus, setCurrentStatus] = useState('PENDING');
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryStatus>(null);
  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [orderSummaryExpanded, setOrderSummaryExpanded] = useState(true);

  // Cancellation State
  const [cancelling, setCancelling] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const handleOpenCancelModal = () => {
    setCancelError(null);
    setCancelModalVisible(true);
  };

  const handleExecuteCancel = async () => {
    const rawId = params.dbOrderId || (params.orderId ? params.orderId.replace(/\D/g, '') : '');
    if (!rawId) return;

    try {
      setCancelling(true);
      setCancelError(null);
      const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : undefined;
      await orderApi.cancelOrder(rawId, restId);

      setCurrentStatus('CANCELLED');
      setDeliveryStatus(DELIVERY_STATUS.CANCELLED);
      useLiveOrderStore.getState().clearLiveOrder();
      setCancelModalVisible(false);
      Alert.alert('Order Cancelled', 'Your delivery order has been cancelled successfully.', [
        { text: 'Return Home', onPress: () => router.replace('/(main)/home') }
      ]);
    } catch (err: any) {
      console.warn('Delivery cancel error:', err?.message || err);
      const msg = err?.message || '';
      if (msg.includes('409') || msg.toLowerCase().includes('preparing') || msg.toLowerCase().includes('already started')) {
        setCancelError('Cancellation unavailable. The kitchen has already started preparing this order.');
      } else {
        setCancelError(msg || 'Unable to cancel order at this stage.');
      }
    } finally {
      setCancelling(false);
    }
  };

  const [riderInfo, setRiderInfo] = useState<{
    id?: number;
    name?: string;
    phone?: string;
    rating?: number;
    vehicle_type?: string;
    vehicle_number?: string;
    profile_image?: string;
    partner?: string;
    delivery_partner?: string;
    eta?: string;
    estimated_delivery_time?: string;
    tracking_url?: string;
    otp?: string;
  } | null>(null);

  const [assignmentData, setAssignmentData] = useState<any>(null);


  const [customerLocation, setCustomerLocation] = useState<{
    full_address?: string;
    latitude?: number;
    longitude?: number;
  } | null>(null);

  const [restaurantLocation, setRestaurantLocation] = useState<{
    name?: string;
    latitude?: number;
    longitude?: number;
  } | null>(null);

  const [timeline, setTimeline] = useState<any[]>([]);
  const hasNavigatedRef = useRef(false);
  const isPollingRef = useRef(false);
  const lastDeliveryStatusRef = useRef<string>('');
  const [networkError, setNetworkError] = useState(false);

  // Live Decreasing Countdown for Delivery ETA
  const [countdownText, setCountdownText] = useState<string>('');

  useEffect(() => {
    const rawEta = assignmentData?.estimated_delivery_time || riderInfo?.estimated_delivery_time || riderInfo?.eta || '';
    if (!rawEta) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCountdownText('');
      return;
    }

    const match = rawEta.match(/\d+/);
    const etaMinutes = match ? parseInt(match[0], 10) : 25;

    let baseTime = Date.now();
    if (assignmentData?.assigned_at) {
      let isoStr = String(assignmentData.assigned_at).trim();
      if (!isoStr.endsWith('Z') && !isoStr.includes('+')) {
        isoStr += 'Z';
      }
      const parsedAssigned = new Date(isoStr).getTime();
      if (!isNaN(parsedAssigned) && parsedAssigned > 0) {
        const elapsedMs = Date.now() - parsedAssigned;
        const totalDurationMs = etaMinutes * 60 * 1000;
        if (elapsedMs >= 0 && elapsedMs < totalDurationMs) {
          baseTime = parsedAssigned;
        } else {
          baseTime = Date.now();
        }
      }
    }

    const targetTime = baseTime + etaMinutes * 60 * 1000;

    const updateCountdown = () => {
      if (isDeliveredStatus(deliveryStatus)) {
        setCountdownText('Delivered');
        return;
      }

      const now = Date.now();
      const diffMs = targetTime - now;

      if (diffMs <= 0) {
        setCountdownText('Arriving soon');
        return;
      }

      const totalSeconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      const formattedSec = seconds < 10 ? `0${seconds}` : `${seconds}`;

      setCountdownText(`${minutes}:${formattedSec} mins`);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [assignmentData?.estimated_delivery_time, assignmentData?.assigned_at, riderInfo?.estimated_delivery_time, riderInfo?.eta, deliveryStatus]);

  // Partner details are shown ONLY when Admin has actually entered them.
  const isAssignmentActive = Boolean(assignmentData?.status && !['UNASSIGNED', 'CANCELLED', 'PENDING'].includes(assignmentData.status));
  const hasAdminAssignedPartner = Boolean(
    isAssignmentActive && (
      assignmentData?.delivery_partner ||
      riderInfo?.name ||
      riderInfo?.delivery_partner ||
      riderInfo?.partner
    )
  );

  // Persisted order type: this screen is delivery-only. Redirect anything else.
  const persistedOrderType = normalizeOrderType(orderDetails?.order?.order_type);
  useEffect(() => {
    if (persistedOrderType !== 'UNKNOWN' && persistedOrderType !== 'DELIVERY') {
      router.replace({
        pathname: '/(order)/track-order',
        params: {
          orderId: params.orderId || String(orderDetails?.order?.id || ''),
          dbOrderId: params.dbOrderId || String(orderDetails?.order?.id || ''),
          orderType: persistedOrderType === 'TAKEAWAY' ? 'Take Away' : 'Dine In',
        },
      } as any);
    }
  }, [persistedOrderType]);

  useEffect(() => {
    const dbId = params.dbOrderId || (params.orderId ? params.orderId.replace(/\D/g, '') : '');
    if (!dbId) return;

    let interval: ReturnType<typeof setInterval>;

    const fetchTracking = async () => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : null;
        if (!restId) {
          throw new Error('Restaurant context is unavailable for this order');
        }

        const results = await Promise.allSettled([
          deliveryApi.getOrderTracking(dbId),
          orderApi.getOrderDetails(dbId, restId)
        ]);
        const trackingData = results[0].status === 'fulfilled' ? results[0].value : null;
        const orderData = results[1].status === 'fulfilled' ? results[1].value : null;
        setNetworkError(results[0].status === 'rejected' && results[1].status === 'rejected');

        if (trackingData) {
          if (trackingData.rider) {
            setRiderInfo(trackingData.rider);
          }
          if (trackingData.assignment) {
            setAssignmentData({
              ...trackingData.assignment,
              delivery_partner: trackingData.assignment.delivery_partner || trackingData.delivery_partner || trackingData.rider?.delivery_partner,
              estimated_delivery_time: trackingData.assignment.estimated_delivery_time || trackingData.estimated_delivery_time || trackingData.rider?.estimated_delivery_time,
              otp: trackingData.otp || trackingData.assignment.otp || trackingData.rider?.otp,
            });
          }
          if (trackingData.delivery_address) {
            setCustomerLocation({
              full_address: trackingData.delivery_address.full_address,
              latitude: trackingData.delivery_address.latitude ? Number(trackingData.delivery_address.latitude) : undefined,
              longitude: trackingData.delivery_address.longitude ? Number(trackingData.delivery_address.longitude) : undefined,
            });
          }
          if (trackingData.restaurant) {
            const rawLat = trackingData.restaurant.latitude != null ? Number(trackingData.restaurant.latitude) : null;
            const rawLng = trackingData.restaurant.longitude != null ? Number(trackingData.restaurant.longitude) : null;
            const outletResolved = resolveOutletLocation({
              restaurant_id: trackingData.restaurant.id || selectedOutlet?.restaurant_id,
              name: trackingData.restaurant.name || selectedOutlet?.name,
              lat: rawLat,
              lng: rawLng,
            });

            setRestaurantLocation({
              name: trackingData.restaurant.name || outletResolved.name,
              latitude: (rawLat && !isNaN(rawLat)) ? rawLat : outletResolved.latitude,
              longitude: (rawLng && !isNaN(rawLng)) ? rawLng : outletResolved.longitude,
            });
          } else {
            const outletResolved = resolveOutletLocation(selectedOutlet);
            setRestaurantLocation({
              name: outletResolved.name,
              latitude: outletResolved.latitude,
              longitude: outletResolved.longitude,
            });
          }
          if (Array.isArray(trackingData.timeline)) {
            setTimeline(trackingData.timeline);
          }
        }

        if (orderData) {
          setOrderDetails(orderData);
          if (orderData.order?.status) {
            const s = orderData.order.status.toUpperCase();
            setCurrentStatus(s);
          }
        }

        // Determine delivery status from orderData or trackingData
        const rawDS = orderData?.order?.delivery_status || trackingData?.delivery_status;
        if (rawDS) {
          const resolvedDS = resolveDeliveryStatus(lastDeliveryStatusRef.current, rawDS);
          lastDeliveryStatusRef.current = resolvedDS;
          setDeliveryStatus(resolvedDS as DeliveryStatus);

          if (isDeliveredStatus(resolvedDS) && !hasNavigatedRef.current) {
            hasNavigatedRef.current = true;
            clearInterval(interval);
            router.replace({
              pathname: '/delivery-completed',
              params: {
                orderId: params.orderId,
                dbOrderId: params.dbOrderId,
              }
            });
            return;
          }

          if (isTerminalStatus(resolvedDS)) {
            clearInterval(interval);
            return;
          }
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '').toLowerCase();
        const isNotFound = err?.status === 404 || msg.includes('404') || msg.includes('not found');
        if (isNotFound) {
          if (interval) clearInterval(interval);
          await purgeDeletedOrderLocally(dbId || params.orderId || '');
          Alert.alert("Order Not Found", "This delivery order is no longer available.", [
            { text: "OK", onPress: () => router.replace('/(main)/home') }
          ]);
          return;
        } else {
          console.warn('Tracking poll status:', err?.message || err);
          setNetworkError(true);
        }
      } finally {
        isPollingRef.current = false;
      }
    };

    fetchTracking();
    interval = setInterval(fetchTracking, 4000);
    return () => clearInterval(interval);
  }, [params.dbOrderId, params.orderId, selectedOutlet]);

  // Items resolution
  const displayItems = (() => {
    if (orderDetails?.items && Array.isArray(orderDetails.items) && orderDetails.items.length > 0) {
      return orderDetails.items;
    }
    try {
      if (params.cart && params.cart !== '[object Object]') {
        const parsed = JSON.parse(params.cart);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) { }
    return [];
  })();

  const computedItemsSubtotal = displayItems.reduce((acc: number, it: any) => acc + (Number(it.price || 0) * Number(it.quantity || it.qty || 1)), 0);
  const packagingFeeVal = Number(orderDetails?.order?.packaging_fee || 0);
  const gstAmtVal = Number(orderDetails?.order?.gst_amount || 0);
  const discountAmtVal = Number(orderDetails?.order?.discount_amount || 0);
  const calculatedGrandTotal = Math.max(0, computedItemsSubtotal + packagingFeeVal + gstAmtVal - discountAmtVal);
  const rawDbTotal = Number(orderDetails?.order?.total_amount || params.totalAmount || 0);
  const rawDbDelivFee = Number(orderDetails?.order?.delivery_fee || 0);
  const safeDbTotal = Math.max(0, rawDbTotal - rawDbDelivFee);

  const totalAmountVal = (computedItemsSubtotal > 0)
    ? calculatedGrandTotal
    : (safeDbTotal > 0 ? safeDbTotal : calculatedGrandTotal);

  const rawIdDigits = String(orderDetails?.order?.id || params.dbOrderId || params.orderId || '').replace(/\D/g, '');
  const displayOrderNumber = rawIdDigits ? `DU-${rawIdDigits}` : 'DU';

  // Single unified stage calculation based on KOT kitchen status and delivery status
  const unifiedStage = getUnifiedDeliveryStage(currentStatus, deliveryStatus, displayItems);
  const stepIndex = unifiedStage.stepIndex;
  const isConfirmedCard = stepIndex < 3;
  const topStatusText = unifiedStage.statusText;

  // Delivery Partner Information (only real, Admin-entered values; nothing fabricated)
  const partnerName = assignmentData?.delivery_partner || riderInfo?.delivery_partner || riderInfo?.partner || '';
  const etaVal = assignmentData?.estimated_delivery_time || riderInfo?.estimated_delivery_time || riderInfo?.eta || '';
  const otpVal = assignmentData?.otp || riderInfo?.otp || (orderDetails?.order as any)?.delivery_otp || '';
  const riderPhoneVal = riderInfo?.phone
    ? (riderInfo.phone.startsWith('+91') ? riderInfo.phone : `+91 ${riderInfo.phone}`)
    : null;
  const trackingUrl = assignmentData?.tracking_url || riderInfo?.tracking_url || (assignmentData as any)?.tracking_url || '';
  const effectiveTrackingUrl = trackingUrl || (
    customerLocation?.latitude && customerLocation?.longitude
      ? `https://www.google.com/maps/dir/?api=1&destination=${customerLocation.latitude},${customerLocation.longitude}`
      : ''
  );
  const assignmentStatusVal = assignmentData?.status
    ? String(assignmentData.status).replace(/_/g, ' ').toLowerCase().replace(/^\w|\s\w/g, (c: string) => c.toUpperCase())
    : '';

  // Single Unified 4-Step Stepper (Order Confirmed -> Cooking/Preparing -> Out for Delivery -> Delivered)
  const unifiedSteps = [
    { label: 'Order\nConfirmed', icon: 'checkmark', type: 'ion' },
    { label: 'Cooking', icon: 'flame', type: 'ion' },
    { label: 'Out for\nDelivery', icon: 'moped', type: 'mc' },
    { label: 'Delivered', icon: 'home-outline', type: 'ion' },
  ];

  const statusLevel = stepIndex >= 3 ? 5 : getKitchenLevel(currentStatus);
  const banner = { title: unifiedStage.bannerTitle, sub: unifiedStage.bannerSub };

  const handleCallRider = () => {
    if (riderPhoneVal) {
      Linking.openURL(`tel:${riderPhoneVal}`);
    }
  };

  const handleTrackOnPartnerApp = () => {
    const targetUrl = effectiveTrackingUrl || trackingUrl;
    if (targetUrl) {
      Linking.openURL(targetUrl);
    }
  };

  const isCancelled = (currentStatus || '').toUpperCase() === 'CANCELLED' || deliveryStatus === DELIVERY_STATUS.CANCELLED;
  const canCancel = !isCancelled && stepIndex <= 1 && ['PENDING', 'CONFIRMED'].includes((currentStatus || '').toUpperCase());

  return (
    <SafeAreaView style={styles.pixelContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />

      {/* Top Header */}
      <View style={[styles.pixelHeader, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.pixelBackBtn} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={24} color="#111827" />
        </TouchableOpacity>
        <View style={styles.pixelHeaderTitleBlock}>
          <Text style={styles.headerOrderIdRed}>#{displayOrderNumber}</Text>
          <Text style={styles.pixelHeaderTitle}>Order Status</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={[styles.pixelTopStatusPill, isConfirmedCard && { backgroundColor: '#FFEDD5' }]}>
            <MaterialCommunityIcons
              name="moped"
              size={16}
              color={isConfirmedCard ? '#EA580C' : '#16A34A'}
            />
            <Text style={[styles.pixelTopStatusText, isConfirmedCard && { color: '#EA580C' }]}>
              {topStatusText}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 110, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingTop: 8 }}>
          {/* Single Unified Stepper (Based on KOT Kitchen + Delivery) */}
          <View style={styles.pixelStepperBox}>
            <View style={styles.pixelStepperTrack}>
              <View style={[styles.pixelStepperLine, { left: '12%', right: '62%', backgroundColor: stepIndex >= 2 ? '#00A01D' : '#E5E7EB' }]} />
              <View style={[styles.pixelStepperLine, { left: '38%', right: '38%', backgroundColor: stepIndex > 3 ? '#00A01D' : stepIndex === 3 ? '#FF3400' : '#E5E7EB' }]} />
              <View style={[styles.pixelStepperLine, { left: '62%', right: '12%', backgroundColor: stepIndex >= 4 ? '#00A01D' : '#E5E7EB' }]} />
              {unifiedSteps.map((st, idx) => {
                const sNum = idx + 1;
                const done = stepIndex > sNum || (sNum === 4 && stepIndex >= 4) || (sNum === 1 && stepIndex >= 1);
                const active = stepIndex === sNum && !done;
                const bg = done ? '#00A01D' : active ? '#FF3400' : '#FFFFFF';
                const border = done ? '#00A01D' : active ? '#FF3400' : '#D1D5DB';
                const fg = done || active ? '#FFFFFF' : '#9CA3AF';
                const tc = done ? '#00A01D' : active ? '#FF3400' : '#6B7280';
                return (
                  <View key={st.label} style={styles.pixelStepColumn}>
                    <View style={[styles.pixelStepCircle, { backgroundColor: bg, borderColor: border }]}>
                      {st.type === 'mc' ? (
                        <MaterialCommunityIcons name={st.icon as any} size={18} color={fg} />
                      ) : (
                        <Ionicons name={st.icon as any} size={16} color={fg} />
                      )}
                    </View>
                    <Text style={[styles.pixelStepLabel, { color: tc, fontWeight: done || active ? '700' : '600' }]}>{st.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Context-appropriate preparation message */}
          <View style={styles.imageChefCard}>
            <View style={styles.imageChefIconBox}>
              <Ionicons name={isCancelled ? 'close-circle' : 'flame'} size={24} color="#FF3400" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.imageChefTitle}>{banner.title}</Text>
              <Text style={styles.imageChefSub}>{banner.sub}</Text>
            </View>
          </View>

          {/* Dish preparation status (from persisted item statuses) */}
          {displayItems.length > 0 && (
            <>
              <Text style={styles.imageDishSectionTitle}>Dish preparation status</Text>
              <View style={styles.imageDishList}>
                {displayItems.map((item: any, idx: number) => {
                  const prog = getDishProgress(item, statusLevel, currentStatus);
                  const imgUri = getFullImageUrl(item.image_url || item.image, item.name);
                  return (
                    <View key={item.id || idx} style={styles.imageDishCard}>
                      {imgUri ? (
                        <Image source={{ uri: imgUri }} style={styles.imageDishImg} />
                      ) : (
                        <View style={[styles.imageDishImg, { backgroundColor: '#F3F4F6' }]} />
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={styles.imageDishTopRow}>
                          <Text style={[styles.imageDishName, { flex: 1, marginRight: 8 }]} numberOfLines={2}>
                            {item.name} (x{item.quantity || item.qty || 1})
                          </Text>
                          <Text style={[styles.imageDishTag, { color: prog.color }]}>{prog.label}</Text>
                        </View>
                        <View style={styles.imageProgressBarBg}>
                          <View style={[styles.imageProgressBarFill, { width: prog.pct as any, backgroundColor: prog.color }]} />
                        </View>
                        {!!prog.sub && <Text style={styles.imageDishSub}>{prog.sub}</Text>}
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Delivery partner (same screen, delivery orders only) */}
          {!isCancelled && (
            <View style={styles.pixelPartnerCard}>
              <View style={styles.pixelPartnerTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pixelPartnerLabel}>Delivery Partner</Text>
                  {hasAdminAssignedPartner && !!partnerName && (
                    <Text style={styles.pixelPartnerName}>{partnerName}</Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.pixelAssignedPill, !hasAdminAssignedPartner && { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.pixelAssignedText, !hasAdminAssignedPartner && { color: '#D97706' }]}>
                      {hasAdminAssignedPartner ? 'Assigned' : 'Pending'}
                    </Text>
                  </View>
                </View>
              </View>

              {!hasAdminAssignedPartner ? (
                <Text style={{ fontSize: 13, color: '#6B7280', paddingVertical: 8 }}>
                  Delivery partner details will be updated shortly.
                </Text>
              ) : (
                <>
                  {!!riderInfo?.name && (
                    <View style={styles.pixelDetailRow}>
                      <View style={styles.pixelRowLeft}>
                        <Ionicons name="person" size={18} color="#6B7280" style={styles.pixelRowIcon} />
                        <Text style={styles.pixelRowLabel}>Rider Name</Text>
                      </View>
                      <Text style={styles.pixelRowValue} numberOfLines={1}>{riderInfo.name}</Text>
                    </View>
                  )}
                  {!!riderPhoneVal && (
                    <View style={styles.pixelDetailRow}>
                      <View style={styles.pixelRowLeft}>
                        <Ionicons name="call" size={18} color="#6B7280" style={styles.pixelRowIcon} />
                        <Text style={styles.pixelRowLabel}>Rider Phone</Text>
                      </View>
                      <Text style={[styles.pixelRowValue, { fontWeight: '600', color: '#111827' }]}>{riderPhoneVal}</Text>
                      <TouchableOpacity style={styles.pixelGreenCallBtn} onPress={handleCallRider} activeOpacity={0.8}>
                        <Ionicons name="call" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  )}
                  {!!riderInfo?.vehicle_type && (
                    <View style={styles.pixelDetailRow}>
                      <View style={styles.pixelRowLeft}>
                        <MaterialIcons name="two-wheeler" size={18} color="#6B7280" style={styles.pixelRowIcon} />
                        <Text style={styles.pixelRowLabel}>Vehicle Type</Text>
                      </View>
                      <Text style={styles.pixelRowValue}>{riderInfo.vehicle_type}</Text>
                    </View>
                  )}
                  {!!riderInfo?.vehicle_number && (
                    <View style={styles.pixelDetailRow}>
                      <View style={styles.pixelRowLeft}>
                        <MaterialCommunityIcons name="card-bulleted-outline" size={18} color="#6B7280" style={styles.pixelRowIcon} />
                        <Text style={styles.pixelRowLabel}>Vehicle Number</Text>
                      </View>
                      <Text style={styles.pixelRowValue}>{riderInfo.vehicle_number}</Text>
                    </View>
                  )}
                  {!!assignmentStatusVal && (
                    <View style={styles.pixelDetailRow}>
                      <View style={styles.pixelRowLeft}>
                        <Ionicons name="information-circle-outline" size={18} color="#6B7280" style={styles.pixelRowIcon} />
                        <Text style={styles.pixelRowLabel}>Assignment Status</Text>
                      </View>
                      <Text style={styles.pixelRowValue}>{assignmentStatusVal}</Text>
                    </View>
                  )}
                  {!!otpVal && (
                    <View style={styles.pixelDetailRow}>
                      <View style={styles.pixelRowLeft}>
                        <Ionicons name="key-outline" size={18} color="#FF6600" style={styles.pixelRowIcon} />
                        <Text style={styles.pixelRowLabel}>Delivery OTP</Text>
                      </View>
                      <View style={styles.otpBadgeContainer}>
                        <Text style={styles.otpBadgeText}>{otpVal}</Text>
                      </View>
                    </View>
                  )}
                  {!!(countdownText || etaVal) && (
                    <View style={styles.pixelDetailRow}>
                      <View style={styles.pixelRowLeft}>
                        <Ionicons name="time-outline" size={18} color="#059669" style={styles.pixelRowIcon} />
                        <Text style={styles.pixelRowLabel}>Estimated Arrival (ETA)</Text>
                      </View>
                      <View style={styles.etaCountdownBadge}>
                        <View style={styles.etaGreenPulseDot} />
                        <Text style={styles.etaCountdownText}>{countdownText || etaVal}</Text>
                      </View>
                    </View>
                  )}
                  <View style={[styles.pixelDetailRow, { borderBottomWidth: 0 }]}>
                    <View style={styles.pixelRowLeft}>
                      <Ionicons name="navigate-outline" size={18} color="#00A01D" style={styles.pixelRowIcon} />
                      <Text style={styles.pixelRowLabel}>Rider Live Track</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.pixelTrackBadge}
                      onPress={handleTrackOnPartnerApp}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="location" size={13} color="#00A01D" style={{ marginRight: 4 }} />
                      <Text style={styles.pixelTrackBadgeText}>Track Rider ↗</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity 
                    style={styles.pixelTrackPartnerAppBtn} 
                    onPress={handleTrackOnPartnerApp} 
                    activeOpacity={0.8}
                  >
                    <Ionicons name="navigate-circle" size={20} color="#00A01D" />
                    <Text style={styles.pixelTrackPartnerAppText}>Track Rider Live Location</Text>
                    <Ionicons name="chevron-forward" size={16} color="#00A01D" />
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}

          {/* Order Summary Collapsible Card */}
          <View style={styles.pixelSummaryCard}>
            <TouchableOpacity
              style={styles.pixelSummaryHeader}
              onPress={() => setOrderSummaryExpanded(prev => !prev)}
              activeOpacity={0.7}
            >
              <View style={styles.pixelSummaryTitleRow}>
                <Text style={styles.pixelSummaryTitle}>Order Summary</Text>
                <Text style={styles.pixelSummaryCount}> ({displayItems.length} Items)</Text>
              </View>
              <View style={styles.pixelSummaryPriceRow}>
                <Text style={styles.pixelSummaryPriceText}>₹{totalAmountVal.toFixed(0)}</Text>
                <Ionicons
                  name={orderSummaryExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color="#FF3400"
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
                      {imgUri ? (
                        <Image source={{ uri: imgUri }} style={styles.pixelItemThumb} />
                      ) : (
                        <View style={[styles.pixelItemThumb, { backgroundColor: '#F3F4F6' }]} />
                      )}
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.pixelItemName} numberOfLines={2}>{item.name}</Text>
                        <Text style={styles.pixelItemSub}>{qty} × ₹{price.toFixed(0)}</Text>
                      </View>
                      <Text style={styles.pixelItemRowPrice}>₹{(price * qty).toFixed(0)}</Text>
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
                  // Delivery fee is strictly Rs. 0 (Free Delivery)
                  const deliveryFeeVal = 0;
                  const taxesVal = Number(orderObj?.gst_amount || 0);
                  const discountVal = Number(orderObj?.discount_amount || 0);

                  return (
                    <View style={styles.pixelBillSplitBox}>
                      <View style={styles.pixelBillDivider} />
                      <Text style={styles.pixelBillHeader}>BILL SUMMARY</Text>

                      <View style={styles.pixelBillRow}>
                        <Text style={styles.pixelBillLabel}>Item Total</Text>
                        <Text style={styles.pixelBillValue}>₹{subtotalVal.toFixed(0)}</Text>
                      </View>

                      <View style={styles.pixelBillRow}>
                        <Text style={styles.pixelBillLabel}>Delivery Fee</Text>
                        {deliveryFeeVal > 0 ? (
                          <Text style={styles.pixelBillValue}>₹{deliveryFeeVal.toFixed(0)}</Text>
                        ) : (
                          <Text style={styles.pixelBillValue}>
                            <Text style={{ textDecorationLine: 'line-through', color: '#9CA3AF' }}>₹40</Text>
                            <Text style={{ color: '#16A34A', fontWeight: '700' }}> FREE</Text>
                          </Text>
                        )}
                      </View>

                      {taxesVal > 0 && (
                        <View style={styles.pixelBillRow}>
                          <Text style={styles.pixelBillLabel}>Taxes & Restaurant Charges</Text>
                          <Text style={styles.pixelBillValue}>₹{taxesVal.toFixed(2)}</Text>
                        </View>
                      )}

                      {discountVal > 0 && (
                        <View style={styles.pixelBillRow}>
                          <Text style={[styles.pixelBillLabel, { color: '#DC2626' }]}>Coupon / Discount</Text>
                          <Text style={[styles.pixelBillValue, { color: '#DC2626' }]}>- ₹{discountVal.toFixed(2)}</Text>
                        </View>
                      )}

                      <View style={[styles.pixelBillRow, styles.pixelGrandTotalRow]}>
                        <Text style={styles.pixelGrandTotalLabel}>To Pay / Paid</Text>
                        <Text style={styles.pixelGrandTotalValue}>₹{totalAmountVal.toFixed(0)}</Text>
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
              <Ionicons name="headset-outline" size={24} color="#FF3400" />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.pixelHelpTitle}>Need help with your order?</Text>
              <Text style={styles.pixelHelpSub}>Our support team is here to help</Text>
            </View>
            {!!selectedOutlet?.phone && (
              <TouchableOpacity
                style={styles.pixelChatBtn}
                onPress={() => Linking.openURL(`tel:${selectedOutlet.phone}`)}
                activeOpacity={0.8}
              >
                <Text style={styles.pixelChatBtnText}>Call</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Cancellation Card for Delivery (Before Kitchen Prepares) */}
        {canCancel && (
          <View style={styles.cancelCard}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.cancelCardTitle}>Need to cancel?</Text>
              <Text style={styles.cancelCardSub}>
                Cancellation is available before the kitchen starts preparing your food.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.cancelDeliveryBtn}
              onPress={handleOpenCancelModal}
              disabled={cancelling}
              activeOpacity={0.8}
            >
              <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
              <Text style={styles.cancelDeliveryBtnText}>Cancel Order</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Cancelled Banner */}
        {isCancelled && (
          <View style={styles.cancelledBanner}>
            <Ionicons name="close-circle" size={24} color="#DC2626" />
            <View style={{ marginLeft: 12, flex: 1 }}>
              <Text style={styles.cancelledBannerTitle}>Order Cancelled</Text>
              <Text style={styles.cancelledBannerSub}>This delivery order has been cancelled.</Text>
            </View>
            <TouchableOpacity
              style={styles.returnHomeBtn}
              onPress={() => router.replace('/(main)/home')}
              activeOpacity={0.8}
            >
              <Text style={styles.returnHomeBtnText}>Home</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>


      {/* Cancellation Modal */}
      <Modal
        visible={cancelModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !cancelling && setCancelModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconBox}>
              <Ionicons name="alert-circle" size={36} color="#DC2626" />
            </View>
            <Text style={styles.modalTitle}>Cancel Delivery Order?</Text>
            <Text style={styles.modalSub}>
              Are you sure you want to cancel this order? Once the kitchen starts cooking, cancellation is no longer possible.
            </Text>

            {cancelError && (
              <View style={styles.modalErrorBox}>
                <Ionicons name="warning-outline" size={16} color="#DC2626" />
                <Text style={styles.modalErrorText}>{cancelError}</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalKeepBtn}
                onPress={() => setCancelModalVisible(false)}
                disabled={cancelling}
                activeOpacity={0.8}
              >
                <Text style={styles.modalKeepText}>Keep Order</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalConfirmBtn}
                onPress={handleExecuteCancel}
                disabled={cancelling}
                activeOpacity={0.8}
              >
                {cancelling ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Yes, Cancel</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pixelContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  pixelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  pixelBackBtn: {
    padding: 6,
    marginRight: 6,
  },
  pixelHeaderTitleBlock: {
    flex: 1,
  },
  headerOrderIdRed: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FF3400',
  },
  pixelHeaderTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
  },
  pixelTopStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pixelTopStatusText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#16A34A',
    marginLeft: 6,
  },
  viewModeSwitcher: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    padding: 3,
  },
  viewModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  viewModeTabActive: {
    backgroundColor: '#111827',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  viewModeTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  viewModeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  // Image UI Specific Styles
  imageStepperBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 10,
    marginBottom: 14,
  },
  imageStepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  imageStepItem: {
    alignItems: 'center',
    width: '19%',
  },
  imageStepCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  imageStepLabel: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 14,
  },
  imageChefCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FF4500',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  imageChefIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFF0EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageChefTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#111827',
  },
  imageChefSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  imagePrepBox: {
    backgroundColor: '#1F2937',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  imagePrepLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  imagePrepTime: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  imageAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  imageAlertTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  imageAlertSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  adminAssignNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  adminAssignNoticeIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminAssignNoticeTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#C2410C',
  },
  adminAssignNoticeSub: {
    fontSize: 11.5,
    color: '#9A3412',
    marginTop: 2,
    lineHeight: 15,
  },
  adminAssignNoticeBtn: {
    backgroundColor: '#EA580C',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginLeft: 8,
  },
  adminAssignNoticeBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  imageDishSectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 10,
    marginTop: 4,
  },
  imageDishList: {
    marginBottom: 10,
  },
  imageDishCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  imageDishImg: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
  },
  imageDishTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  imageDishName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  imageDishTag: {
    fontSize: 12,
    fontWeight: '800',
  },
  imageProgressBarBg: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  imageProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  imageDishSub: {
    fontSize: 11.5,
    color: '#6B7280',
  },

  // Delivery Partner View Styles
  pixelStepperBox: {
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 10,
  },
  pixelStepperTrack: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
  },
  pixelStepperLine: {
    position: 'absolute',
    top: 17,
    height: 3,
    zIndex: 0,
  },
  pixelStepColumn: {
    alignItems: 'center',
    width: 76,
    zIndex: 1,
  },
  pixelStepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  pixelStepLabel: {
    fontSize: 11.5,
    textAlign: 'center',
    lineHeight: 15,
  },
  pixelMintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
  },
  pixelOrangeBanner: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  pixelMintIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pixelOrangeIconBox: {
    backgroundColor: '#FFEDD5',
  },
  pixelMintContentBox: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  pixelMintTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  pixelMintSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6B7280',
    marginTop: 3,
    lineHeight: 16,
  },
  pixelMintEtaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pixelOrangeEtaPill: {
    backgroundColor: '#FFEDD5',
  },
  pixelMintEtaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
  },
  pixelOrangeEtaText: {
    color: '#EA580C',
  },
  pixelPartnerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  pixelPartnerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  pixelPartnerLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
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
    borderRadius: 6,
  },
  pixelAssignedText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  pixelAdminIconBtn: {
    padding: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    marginLeft: 4,
  },
  pixelDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pixelRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    marginRight: 12,
  },
  pixelRowIcon: {
    marginRight: 10,
  },
  pixelRowLabel: {
    fontSize: 13.5,
    color: '#4B5563',
    fontWeight: '500',
  },
  pixelRowValue: {
    fontSize: 13.5,
    color: '#111827',
    fontWeight: '600',
    textAlign: 'right',
  },
  otpBadgeContainer: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#FFB74D',
  },
  otpBadgeText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#E65100',
    letterSpacing: 3,
  },
  etaCountdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  etaGreenPulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
    marginRight: 6,
  },
  etaCountdownText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#065F46',
  },
  pixelTrackBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  pixelTrackBadgeText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#00A01D',
  },
  pixelGreenCallBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  pixelTrackPartnerAppBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#22C55E',
    borderRadius: 10,
    height: 46,
    marginTop: 14,
  },
  pixelTrackPartnerAppText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#16A34A',
    marginHorizontal: 8,
  },
  viewLiveMapLink: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
    textDecorationLine: 'underline',
  },
  pixelSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  pixelSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pixelSummaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pixelSummaryTitle: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#111827',
  },
  pixelSummaryCount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  pixelSummaryPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pixelSummaryPriceText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#EA580C',
  },
  pixelSummaryBody: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    paddingTop: 12,
  },
  pixelItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  pixelItemThumb: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  pixelItemName: {
    fontSize: 14.5,
    fontWeight: '600',
    color: '#111827',
  },
  pixelItemSub: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 3,
  },
  pixelItemRowPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginLeft: 8,
  },
  pixelBillSplitBox: {
    marginTop: 6,
    paddingTop: 6,
  },
  pixelBillDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 10,
  },
  pixelBillHeader: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  pixelBillRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  pixelBillLabel: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
  pixelBillValue: {
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  pixelGrandTotalRow: {
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginBottom: 0,
  },
  pixelGrandTotalLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  pixelGrandTotalValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#EA580C',
  },
  pixelHelpCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderRadius: 16,
    padding: 14,
    marginTop: 16,
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
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  pixelChatBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#EA580C',
  },
  cancelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 14,
    marginTop: 18,
  },
  cancelCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#991B1B',
    marginBottom: 2,
  },
  cancelCardSub: {
    fontSize: 12,
    color: '#7F1D1D',
    lineHeight: 16,
  },
  cancelDeliveryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 4,
  },
  cancelDeliveryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#DC2626',
  },
  cancelledBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    padding: 16,
    marginTop: 18,
  },
  cancelledBannerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#991B1B',
  },
  cancelledBannerSub: {
    fontSize: 12,
    color: '#7F1D1D',
    marginTop: 2,
  },
  returnHomeBtn: {
    backgroundColor: '#DC2626',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 8,
  },
  returnHomeBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  mapModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  restaurantMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ff3400',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeMarker: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#00a01d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  modalIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalSub: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 16,
  },
  modalErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
    gap: 6,
    width: '100%',
  },
  modalErrorText: {
    fontSize: 12,
    color: '#991B1B',
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 8,
  },
  modalKeepBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalKeepText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#374151',
  },
  modalConfirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#DC2626',
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
