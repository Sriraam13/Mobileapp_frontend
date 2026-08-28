import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, StatusBar, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { orderApi } from '../../services/apiService';
import { useRestaurantStore } from '../../store';

const { width } = Dimensions.get('window');

export default function DeliveryTrackingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId: string;
    dbOrderId: string;
    cart: string;
  }>();

  const { selectedOutlet } = useRestaurantStore();
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [currentStatus, setCurrentStatus] = useState('PENDING');

  useEffect(() => {
    const dbId = params.dbOrderId;
    if (!dbId) return;

    const fetchStatus = async () => {
      try {
        const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : 1;
        const data = await orderApi.getOrderDetails(dbId, restId);
        if (data && data.order) {
          const s = data.order.status.toUpperCase();
          setCurrentStatus(s);
          if (['COMPLETED', 'DELIVERED', 'SERVED'].includes(s)) {
            router.replace({
              pathname: '/delivery-completed',
              params: {
                orderId: params.orderId,
                cart: params.cart
              }
            });
          }
        }
      } catch (err) {
        console.error("Tracking poll error", err);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, [params.dbOrderId, selectedOutlet]);

  const orderIdText = params.orderId ? params.orderId.replace('ORD-', 'DU') : 'DU12345678';

  // Extract items for details
  const items = (() => {
    try {
      if (params.cart && params.cart !== '[object Object]') {
         const parsed = JSON.parse(params.cart);
         return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) { }
    return [{ name: 'Ghee Roast Masala Dosa', quantity: 1, price: 260 }];
  })();

  const subtotal = items.reduce((acc, item) => acc + (Number(item.price) * (item.quantity || 1)), 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Live Tracking</Text>
        </View>
        <View style={styles.liveBadge}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        
        {/* Map Section (Mockup) */}
        <View style={styles.mapContainer}>
          <Image 
            source={{ uri: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=80' }} 
            style={styles.mapImage} 
            resizeMode="cover"
          />
          {/* Overlay to fade map slightly */}
          <View style={styles.mapOverlay} />
          
          {/* Simulated Route Markers */}
          <View style={[styles.marker, { top: '20%', left: '30%' }]}>
             <View style={styles.restaurantMarker}>
               <Ionicons name="restaurant" size={14} color="#ff3400" />
             </View>
          </View>
          <View style={[styles.marker, { top: '50%', left: '50%' }]}>
             <View style={styles.riderMarker}>
               <Ionicons name="bicycle" size={16} color="#fff" />
             </View>
          </View>
          <View style={[styles.marker, { top: '75%', left: '60%' }]}>
             <View style={styles.homeMarker}>
               <Ionicons name="home" size={16} color="#00a01d" />
             </View>
          </View>

          {/* Rider Details Floating Card */}
          <View style={styles.riderCard}>
            <View style={styles.riderRow}>
              <View style={styles.riderAvatarBox}>
                <Ionicons name="person" size={24} color="#888" />
              </View>
              <View style={styles.riderInfo}>
                <Text style={styles.riderName}>Ravi Kumar</Text>
                <Text style={styles.riderRole}>Your delivery partner</Text>
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={10} color="#fff" />
                  <Text style={styles.ratingText}>4.8</Text>
                </View>
              </View>
              <View style={styles.riderActions}>
                <TouchableOpacity style={styles.actionBtn}>
                  <Ionicons name="call" size={18} color="#ff3400" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn}>
                  <Ionicons name="chatbubble-ellipses" size={18} color="#ff3400" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Content Below Map */}
        <View style={styles.detailsContainer}>
           <View style={styles.orderInfoRow}>
             <View>
               <Text style={styles.infoLabel}>Order ID</Text>
               <Text style={styles.orderIdVal}>{orderIdText}</Text>
             </View>
             <View style={{ alignItems: 'flex-end' }}>
               <Text style={styles.infoLabel}>Estimated Delivery</Text>
               <Text style={styles.etaVal}>20-25 min</Text>
             </View>
           </View>

           <View style={styles.divider} />

           <Text style={styles.sectionTitle}>Order Progress</Text>
           <View style={styles.progressTracker}>
             {/* Step 1 */}
             <View style={styles.stepItem}>
               <View style={[styles.stepCircle, styles.stepCompleted]}>
                 <Ionicons name="checkmark" size={12} color="#fff" />
               </View>
               <Text style={[styles.stepText, styles.stepTextCompleted]}>Order{'\n'}Confirmed</Text>
               <Text style={styles.stepTime}>8:30 AM</Text>
             </View>
             <View style={[styles.stepLine, styles.lineCompleted]} />
             
             {/* Step 2 */}
             <View style={styles.stepItem}>
               <View style={[styles.stepCircle, styles.stepCompleted]}>
                 <Ionicons name="checkmark" size={12} color="#fff" />
               </View>
               <Text style={[styles.stepText, styles.stepTextCompleted]}>Preparing</Text>
               <Text style={styles.stepTime}>8:35 AM</Text>
             </View>
             <View style={[styles.stepLine, styles.lineActive]} />
             
             {/* Step 3 */}
             <View style={styles.stepItem}>
               <View style={[styles.stepCircle, styles.stepActive]}>
                 <View style={styles.innerDot} />
               </View>
               <Text style={[styles.stepText, styles.stepTextActive]}>On the{'\n'}Way</Text>
               <Text style={styles.stepTime}>8:45 AM</Text>
             </View>
             <View style={[styles.stepLine, styles.linePending]} />
             
             {/* Step 4 */}
             <View style={styles.stepItem}>
               <View style={[styles.stepCircle, styles.stepPending]} />
               <Text style={[styles.stepText, styles.stepTextPending]}>Delivered</Text>
               <Text style={styles.stepTime}>Pending</Text>
             </View>
           </View>

           <View style={styles.divider} />

           {/* Order Details Accordion */}
           <TouchableOpacity 
             style={styles.accordionHeader} 
             onPress={() => setDetailsExpanded(!detailsExpanded)}
             activeOpacity={0.7}
           >
             <Text style={styles.sectionTitle}>Order Details</Text>
             <Ionicons name={detailsExpanded ? "chevron-up" : "chevron-down"} size={20} color="#888" />
           </TouchableOpacity>

           {detailsExpanded && (
             <View style={styles.accordionContent}>
               {items.map((item, idx) => (
                 <View key={idx} style={styles.itemRow}>
                   <Text style={styles.itemName}>{item.name || item.itemName} x{item.quantity || 1}</Text>
                   <Text style={styles.itemPrice}>Rs. {Number(item.price) * (item.quantity || 1)}</Text>
                 </View>
               ))}
               <View style={styles.subtotalRow}>
                 <Text style={styles.subtotalLabel}>Total</Text>
                 <Text style={styles.subtotalValue}>Rs. {subtotal}</Text>
               </View>
             </View>
           )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backBtn: {
    padding: 4,
    marginRight: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebf0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff3400',
    marginRight: 4,
  },
  liveText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  container: {
    flex: 1,
  },
  mapContainer: {
    width: '100%',
    height: width * 1.1,
    position: 'relative',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  marker: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restaurantMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ff3400',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderMarker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ff3400',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  homeMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#00a01d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  riderCard: {
    position: 'absolute',
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  riderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  riderAvatarBox: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  riderInfo: {
    flex: 1,
  },
  riderName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 2,
  },
  riderRole: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00a01d',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  ratingText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  riderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  actionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ffe6e0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#ff3400',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  detailsContainer: {
    padding: 20,
  },
  orderInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  orderIdVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  etaVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  progressTracker: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  stepItem: {
    alignItems: 'center',
    width: 60,
  },
  stepCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stepCompleted: {
    backgroundColor: '#00a01d',
  },
  stepActive: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#ff3400',
  },
  innerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ff3400',
  },
  stepPending: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  stepText: {
    fontSize: 10,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 4,
  },
  stepTextCompleted: {
    color: '#00a01d',
  },
  stepTextActive: {
    color: '#ff3400',
  },
  stepTextPending: {
    color: '#aaa',
  },
  stepTime: {
    fontSize: 9,
    color: '#aaa',
  },
  stepLine: {
    flex: 1,
    height: 2,
    marginTop: 10,
    marginHorizontal: 4,
  },
  lineCompleted: {
    backgroundColor: '#00a01d',
  },
  lineActive: {
    backgroundColor: '#ff3400',
  },
  linePending: {
    backgroundColor: '#e0e0e0',
  },
  accordionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accordionContent: {
    marginTop: 16,
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  itemName: {
    fontSize: 13,
    color: '#333',
    flex: 1,
  },
  itemPrice: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000',
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    paddingTop: 12,
    marginTop: 4,
  },
  subtotalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  subtotalValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff3400',
  }
});
