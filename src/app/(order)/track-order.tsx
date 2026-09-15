import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, StatusBar, Linking, BackHandler, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { orderApi } from '../../services/apiService';
import { deliveryApi } from '../../services/apiService';
import { useLiveOrderStore, useRestaurantStore } from '../../store';
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
    tableNumber: string;
    cart: string;
    orderType?: string;
    phone?: string;
  }>();

  const [orderDetails, setOrderDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [deliveryStatus, setDeliveryStatus] = useState<string>('');
  const [riderInfo, setRiderInfo] = useState<any>(null);
  const [assignmentStatus, setAssignmentStatus] = useState<string>('');
  const [trackingTimeline, setTrackingTimeline] = useState<any[]>([]);
  const [networkError, setNetworkError] = useState(false);

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

  const handleGoBack = () => {
    router.dismissAll();
    router.replace('/home');
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
          const isOrderDelivery = orderTypeNorm === 'DELIVERY' || params.orderType === 'Delivery';
          const isOrderTakeaway = orderTypeNorm === 'TAKEAWAY' || params.orderType === 'Take Away';
          
          // Regression-safe order status
          lastOrderStatusRef.current = resolveOrderStatus(lastOrderStatusRef.current, rawOS);

          if (isOrderDelivery) {
            // Regression-safe delivery status update
            const resolvedDS = resolveDeliveryStatus(lastDeliveryStatusRef.current, rawDS);
            lastDeliveryStatusRef.current = resolvedDS;
            setDeliveryStatus(resolvedDS);

            // Tracking data: rider, assignment, timeline
            if (trackingData) {
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

            // Navigate to live map ONCE when rider picks up
            if (isLiveTrackingStatus(resolvedDS) && !hasNavigatedRef.current) {
              hasNavigatedRef.current = true;
              clearInterval(intervalId);
              router.replace({
                pathname: '/delivery-tracking',
                params: {
                  orderId: params.orderId || `ORD-${orderData.order.id.toString().padStart(6, '0')}`,
                  dbOrderId: fetchId.toString(),
                  cart: params.cart,
                  totalAmount: orderData.order.total_amount?.toString() || '0',
                  paymentMethod: orderData.order.payment_method || 'COD',
                },
              });
              return;
            }

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
            // Non-delivery: handle completion redirect
            const isCompleted = rawOS === 'SERVED' || rawOS === 'COMPLETED' || rawOS === 'DELIVERED';
            const shouldRedirect = isOrderDineIn ? (isCompleted && paymentStatus === 'PAID') : isCompleted;
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
                  paymentMethod: orderData.order.payment_method || 'Pay at Counter',
                  cartItems: JSON.stringify(orderData.items || []),
                  date: orderData.order.created_at || new Date().toISOString(),
                  orderType: isOrderTakeaway ? 'Take Away' : 'Dine In',
                  phone: params.phone || '',
                },
              });
            }
          }
        }
      } catch (err) {
        console.error('Poll error', err);
        setNetworkError(true);
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

  if (rawStatus === 'PENDING') {
    statusLevel = 1;
  } else if (rawStatus === 'CONFIRMED') {
    statusLevel = 2;
    bannerTitle = "Kitchen has received your order";
    bannerSub = "Getting ingredients ready";
  } else if (rawStatus === 'PREPARING') {
    statusLevel = 3;
    bannerTitle = "Chef is roasting your dosas!";
    bannerSub = "Fresh ghee, golden and crispy";
    alertTitle = "Leave now! Drive 8 min";
    alertSub = "Arrive right as they come hot off the tawa";
  } else if (rawStatus === 'ALMOST_READY') {
    statusLevel = 4;
    bannerTitle = "Almost done!";
    bannerSub = "Packing up your fresh food";
    alertTitle = "Leave now! Drive 3 min";
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

    if (statusLevel === 1) {
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

  if (isDelivery) {
    // The order is a delivery. Show a "Finding Rider" / kitchen status screen.
    // Once the backend assigns a rider (delivery_status transitions), the useEffect above
    // will automatically navigate to delivery-tracking.tsx.
    const deliveryStatusRaw = (orderDetails?.order?.delivery_status || '').toUpperCase();
    const isSearching = !deliveryStatusRaw || deliveryStatusRaw === 'RIDER_SEARCHING' || deliveryStatusRaw === 'PENDING';

    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#fafafa" />
        <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingTop: insets.top + 10 }} showsVerticalScrollIndicator={false}>

          {/* Header */}
          <View style={styles.headerBlock}>
            <Text style={styles.orderIdText}>#{params.orderId}</Text>
            <Text style={styles.pageTitle}>Order Status</Text>
          </View>

          {/* Progress Tracker Box */}
          <View style={styles.trackerBox}>
            <View style={styles.stepsRow}>
              {stepLabels.map((label, idx) => {
                const step = idx + 1;
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
                );
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

            {networkError && <Text style={{ color: '#777', fontSize: 12, marginBottom: 12 }}>Retrying...</Text>}

            {deliveryStatusRaw === DELIVERY_STATUS.DELIVERY_FAILED && (
              <View style={[styles.bannerCard, { borderColor: '#dc2626', backgroundColor: '#fef2f2' }]}>
                <Ionicons name="alert-circle" size={24} color="#dc2626" />
                <Text style={[styles.bannerTitle, { color: '#dc2626', marginLeft: 12 }]}>Delivery issue. Please contact support.</Text>
              </View>
            )}

            {deliveryStatusRaw === DELIVERY_STATUS.CANCELLED && (
              <View style={[styles.bannerCard, { borderColor: '#6b7280', backgroundColor: '#f3f4f6' }]}>
                <Ionicons name="close-circle" size={24} color="#6b7280" />
                <Text style={[styles.bannerTitle, { color: '#374151', marginLeft: 12 }]}>This order was cancelled.</Text>
              </View>
            )}

            {riderInfo && getDeliveryProgressStep(orderDetails?.order?.status, deliveryStatusRaw) >= 3 && (
              <View style={styles.bannerCard}>
                <Ionicons name="bicycle" size={24} color="#00a01d" />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={styles.bannerTitle}>{riderInfo.name || 'Delivery Partner'}</Text>
                  <Text style={styles.bannerSub}>{getLabelForAssignment(assignmentStatus) || 'Rider assigned'}</Text>
                  <Text style={styles.bannerSub}>{riderInfo.vehicle_type || 'Bike'} {riderInfo.vehicle_number || ''}</Text>
                </View>
              </View>
            )}

            {/* Current contextual status */}
            <View style={styles.prepBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.prepBoxLabel}>Current status</Text>
                <Text style={styles.prepBoxTime}>{getDeliveryContextText(deliveryStatusRaw)}</Text>
              </View>
              <Ionicons name="time-outline" size={24} color="#fff" />
            </View>

            {/* Searching Rider Banner */}
            {isSearching && (
              <View style={[styles.bannerCard, { borderColor: '#00a01d', marginBottom: 20 }]}>
                <View style={[styles.bannerIconCircle, { backgroundColor: '#e6f7ec' }]}>
                  <Ionicons name="search" size={20} color="#00a01d" />
                </View>
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={[styles.bannerTitle, { color: '#00a01d' }]}>Finding your delivery partner</Text>
                  <Text style={styles.bannerSub}>We&apos;re assigning the best rider to you</Text>
                </View>
              </View>
            )}

            {/* Alert Box */}
            <View style={styles.alertBox}>
              <Ionicons name="bicycle-outline" size={20} color="#000" />
              <View style={{ marginLeft: 10 }}>
                <Text style={styles.alertBoxTitle}>{alertTitle}</Text>
                <Text style={styles.alertBoxSub}>{alertSub}</Text>
              </View>
            </View>

            {/* Dish Prep Status */}
            <Text style={styles.dishSectionTitle}>Dish preparation status</Text>
            <View style={styles.dishList}>
              {orderItemsList.map((item: any, idx: number) => renderItemStatus(item, idx))}
            </View>
          </View>

        </ScrollView>

        {/* Bottom Actions */}
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom || 16 }]}>
          <TouchableOpacity style={styles.callButton} onPress={() => Linking.openURL(`tel:${selectedOutlet?.phone || '1234567890'}`)}
          >
            <Ionicons name="call-outline" size={18} color="#000" />
            <Text style={styles.callBtnText}>Call Restaurant</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.orderMoreBtn, { backgroundColor: '#ff4500' }]}
            onPress={() => {
              const dbId = params.dbOrderId || liveDbOrderId;
              if (dbId) {
                router.push({
                  pathname: '/delivery-tracking',
                  params: { orderId: params.orderId, dbOrderId: dbId, cart: params.cart }
                });
              }
            }}
          >
            <Text style={styles.orderMoreText}>Track Order</Text>
            <Ionicons name="navigate-outline" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (isDineIn) {
    let dineInStep = 1;
    let topTitle = "Order Received";
    let topSub = "We've got your order";
    let progressPct = "25%";

    if (['CONFIRMED', 'PENDING'].includes(rawStatus)) {
      dineInStep = 1;
      topTitle = "Order Received";
      topSub = "We've got your order";
      progressPct = "25%";
    } else if (rawStatus === 'PREPARING') {
      dineInStep = 2;
      topTitle = "Preparing";
      topSub = "Chef is cooking your meal";
      progressPct = "50%";
    } else if (['READY', 'ALMOST_READY'].includes(rawStatus)) {
      dineInStep = 3;
      topTitle = "Ready to Serve";
      topSub = "Plating up Now";
      progressPct = "75%";
    } else if (['SERVED', 'COMPLETED', 'DELIVERED'].includes(rawStatus)) {
      dineInStep = 4;
      topTitle = "Serve at Table";
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

        <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
          
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
                  <View style={styles.dineInLiveBadge}>
                    <Ionicons name="notifications" size={10} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={styles.dineInLiveText}>Live</Text>
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

            {/* Vertical Stepper (Pole) */}
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

            {/* Order Summary */}
            <View style={styles.dineInOrderSummary}>
              <Text style={styles.dineInOrderSummaryTitle}>Your Order</Text>
              
              <View style={styles.dineInOrderItems}>
                {orderItemsList.map((item: any, idx: number) => (
                  <View key={idx} style={styles.dineInOrderItemRow}>
                    <Text style={styles.dineInOrderItemName} numberOfLines={1}>
                      {item.quantity || item.qty || 1} x {item.name || item.title || 'Item'}
                    </Text>
                    <Text style={styles.dineInOrderItemPrice}>
                      Rs. {item.price * (item.quantity || item.qty || 1)}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.dineInOrderSummaryDivider} />

              <View style={styles.dineInOrderTotalRow}>
                <Text style={styles.dineInOrderTotalLabel}>Total :</Text>
                <Text style={styles.dineInOrderTotalValue}>Rs. {getDineInSubtotal()}</Text>
              </View>
            </View>

          </View>
        </ScrollView>

        {/* Bottom Buttons */}
        <View style={[styles.dineInBottomActions, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <TouchableOpacity style={styles.dineInCallStaffBtn} onPress={() => Linking.openURL(`tel:${selectedOutlet?.phone || '1234567890'}`)}>
            <Ionicons name="call-outline" size={18} color="#000" />
            <Text style={styles.dineInCallStaffText}>Call Staff</Text>
          </TouchableOpacity>
          
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
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fafafa" />
      <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingTop: insets.top + 10 }} showsVerticalScrollIndicator={false}>
        
        {/* Header */}
        <View style={styles.headerBlock}>
           <Text style={styles.orderIdText}>#{params.orderId}</Text>
           <Text style={styles.pageTitle}>Order Status</Text>
        </View>

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

          {/* Dish Prep Status */}
          <Text style={styles.dishSectionTitle}>Dish preparation status</Text>
          <View style={styles.dishList}>
            {orderItemsList.map((item: any, idx: number) => renderItemStatus(item, idx))}
          </View>
        </View>
        
      </ScrollView>

      {/* Bottom Actions */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom || 16 }]}>
        <TouchableOpacity style={styles.callButton} onPress={() => Linking.openURL(`tel:${selectedOutlet?.phone || '1234567890'}`)}>
          <Ionicons name="call-outline" size={18} color="#000" />
          <Text style={styles.callBtnText}>Call Restaurant</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.orderMoreBtn} onPress={() => router.replace('/menu')}>
          <Text style={styles.orderMoreText}>Order More</Text>
          <Ionicons name="restaurant-outline" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
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
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  dineInTopCardOverlay: {
    ...StyleSheet.absoluteFillObject,
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
    flex: 0.48,
    backgroundColor: '#fff',
  },
  dineInCallStaffText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginLeft: 8,
  },
  dineInOrderMoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00a01d', // Green like in the image
    paddingVertical: 14,
    borderRadius: 25,
    flex: 0.48,
  },
  dineInOrderMoreText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
  },
});
