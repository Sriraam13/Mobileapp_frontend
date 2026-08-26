import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, StatusBar, Linking, BackHandler } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { orderApi } from '../../services/apiService';
import { useLiveOrderStore, useRestaurantStore } from '../../store';
import { getFullImageUrl } from '../../constants/api';

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
    let intervalId: ReturnType<typeof setTimeout>;

    const fetchOrderDetails = async () => {
      try {
        let fetchId = params.dbOrderId || liveDbOrderId;
        if (!fetchId && params.orderId) {
          const match = params.orderId.match(/\d+/);
          if (match) {
            fetchId = match[0];
          }
        }
        
        if (fetchId && !['Preparing', 'Pending', 'Confirmed', 'Ready', 'Served', 'Completed'].includes(fetchId)) {
          let restId = 1;
          if (selectedOutlet?.restaurant_id) {
            restId = Number(selectedOutlet.restaurant_id);
          }
          try {
            const data = await orderApi.getOrderDetails(fetchId, restId);
            if (data && data.order) {
              setOrderDetails({
                 order: data.order,
                 items: data.items || []
              });
              const status = data.order.status.toUpperCase();
              if (status === 'SERVED' || status === 'COMPLETED') {
                 router.replace({
                  pathname: '/order-completed',
                  params: {
                    orderId: params.orderId || `ORD-${data.order.id.toString().padStart(6, '0')}`,
                    dbOrderId: fetchId.toString(),
                    tableNumber: data.order.table_number || params.tableNumber || 'Take Away',
                    totalAmount: data.order.total_amount?.toString() || '0.00',
                    paymentMethod: data.order.payment_method || 'UPI',
                    cartItems: JSON.stringify(data.items || []),
                    date: data.order.created_at || new Date().toISOString(),
                    phone: params.phone || '',
                  }
                });
                return;
              }
            }
          } catch (err) {
            console.error(err);
          }
        }
      } catch (err) {
        console.error("Failed to fetch order details", err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderDetails();
    intervalId = setInterval(fetchOrderDetails, 5000);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
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
  }
});
