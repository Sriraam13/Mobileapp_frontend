import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar, Image, RefreshControl, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import { orderApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import { useAuthStore, useCartStore, useOrderStore, useRestaurantStore } from '../../store';
import { useDineInSessionStore } from '../../store/useDineInSessionStore';
import BottomNavBar from '../../components/layout/BottomNavBar';

const parseOrderTypeAndTable = (rawTypeInput: any, rawTableInput: any) => {
  const rawType = String(rawTypeInput || '').toUpperCase();
  const rawTable = String(rawTableInput || '').trim();
  const upperTable = rawTable.toUpperCase();

  if (rawType.includes('DELIV') || upperTable === 'DELIVERY') {
    return { mappedType: 'Delivery', tableNumber: null };
  }
  
  if (rawType.includes('TAKE') || rawType.includes('PICK') || upperTable.includes('TAKE') || upperTable.includes('PICK')) {
    return { mappedType: 'Takeaway', tableNumber: null };
  }

  let tableNumber: string | null = null;
  if (rawTable && !['DELIVERY', 'TAKE AWAY', 'TAKEAWAY', 'PICKUP', 'NULL', 'UNDEFINED'].includes(upperTable)) {
    if (/^\d+$/.test(rawTable)) {
      tableNumber = `T-${rawTable.padStart(2, '0')}`;
    } else if (rawTable.toLowerCase().startsWith('t-') || rawTable.toLowerCase().startsWith('t')) {
      tableNumber = rawTable.toUpperCase();
    } else {
      tableNumber = rawTable;
    }
  }

  return { mappedType: 'Dine In', tableNumber };
};

export default function Orders() {
  const router = useRouter();
  const navigation = useNavigation();
  const { phone } = useAuthStore();
  const { clearCart, addItem, setOrderType } = useCartStore();
  const [activeTab, setActiveTab] = useState('All');
  const [orders, setOrders] = useState<any[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadOrders();
    setRefreshing(false);
  };
  const { pastOrders } = useOrderStore();
  const { selectedOutlet } = useRestaurantStore();
  const dineInSession = useDineInSessionStore();

  const loadOrders = async () => {
    setIsLoading(true);
    try {
      const userPhone = phone?.trim();
      const rawUserDigits = (userPhone || '').replace(/\D/g, '');
      const userLast10 = rawUserDigits.length >= 10 ? rawUserDigits.slice(-10) : rawUserDigits;

      let formattedOrders: any[] = [];

      // Fetch online customer orders for this specific phone from backend
      if (userPhone && rawUserDigits.length >= 10 && !['1234567890', '9876543210'].includes(userLast10)) {
        const [data1, data2] = await Promise.all([
          orderApi.getCustomerOrders(userPhone, 1).catch(() => []),
          orderApi.getCustomerOrders(userPhone, 2).catch(() => [])
        ]);

        let allData: any[] = [];
        if (Array.isArray(data1)) allData = [...allData, ...data1];
        if (Array.isArray(data2)) allData = [...allData, ...data2];

        if (allData.length > 0) {
          formattedOrders = allData.map((entry: any) => {
            const o = entry.order;
            const items = entry.items;
            const finalOrderId = o.orderId || `ORD-${String(o.id).padStart(6, '0')}`;
            const { mappedType, tableNumber } = parseOrderTypeAndTable(o.order_type, o.table_number);

            const isDineIn = mappedType === 'Dine In';
            const normPayMethod = (o.payment_method || '').toLowerCase().replace(/[\s_-]/g, '');
            const isCounterPaid = normPayMethod === 'payatcounter' || normPayMethod === 'counter';
            const isPaidStatus = (o.payment_status || '').toUpperCase() === 'PAID' || isCounterPaid;

            return {
              id: finalOrderId,
              dbId: o.id,
              restaurant: o.restaurant_id === 2 ? 'MGR Nagar' : 'Mugalivakkam',
              date: o.created_at || new Date().toISOString(),
              status: (isCounterPaid && isDineIn) ? 'SERVED' : (o.status || 'Pending'),
              payment_status: isPaidStatus ? 'Paid' : (o.payment_status || 'Pending'),
              payment_method: o.payment_method,
              table_number: tableNumber,
              items: items || [],
              total: o.total_amount || 0,
              image: items?.[0]?.image_url ? getFullImageUrl(items[0].image_url) : 'https://via.placeholder.com/150',
              order_type: mappedType
            };
          });
        }
      }

      // Fallback to local pastOrders strictly if offline and matching user phone
      if (formattedOrders.length === 0 && userPhone && rawUserDigits.length >= 10 && !['1234567890', '9876543210'].includes(userLast10)) {
        const accountPastOrders = (pastOrders || []).filter((o: any) => {
          if (o.customer_phone) {
            const ordPhone = String(o.customer_phone).replace(/\D/g, '');
            return ordPhone.endsWith(userLast10) || ordPhone === rawUserDigits;
          }
          return false;
        });

        formattedOrders = accountPastOrders.map((o: any) => {
          const { mappedType, tableNumber } = parseOrderTypeAndTable(o.orderType || o.order_type, o.table_number);
          const isDineIn = mappedType === 'Dine In';
          const normPayMethod = (o.payment_method || '').toLowerCase().replace(/[\s_-]/g, '');
          const isCounterPaid = normPayMethod === 'payatcounter' || normPayMethod === 'counter';
          const isPaidStatus = (o.payment_status || '').toUpperCase() === 'PAID' || isCounterPaid;

          return {
            id: o.orderId || `ORD-${String(o.dbOrderId || o.id || 0).padStart(6, '0')}`,
            dbId: o.dbOrderId || o.id,
            restaurant: 'Data Udipi',
            date: o.date || new Date().toISOString(),
            status: (isCounterPaid && isDineIn) ? 'SERVED' : (o.status || 'Pending'),
            payment_status: isPaidStatus ? 'Paid' : (o.payment_status || 'Pending'),
            payment_method: o.payment_method,
            table_number: tableNumber,
            items: o.items || o.cart || [],
            total: o.total || 0,
            image: o.items?.[0]?.image ? getFullImageUrl(o.items[0].image) : 'https://via.placeholder.com/150',
            order_type: mappedType,
          };
        });
      }

      // Sort by date descending
      formattedOrders.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      // Merge active ongoing dine-in order under ONE single order ID
      if (dineInSession.isActive && dineInSession.activeOrderId) {
        const existingIndex = formattedOrders.findIndex(
          (o: any) => o.id === dineInSession.activeOrderId || String(o.dbId) === String(dineInSession.activeDbOrderId)
        );
        const activeOrderCard = {
          id: dineInSession.activeOrderId,
          dbId: dineInSession.activeDbOrderId,
          restaurant: selectedOutlet?.name || 'Data Udipi',
          date: new Date().toISOString(),
          status: 'PREPARING',
          payment_status: 'Pending',
          table_number: dineInSession.tableNumber,
          items: dineInSession.orderedItems || [],
          total: dineInSession.totalAmount || 0,
          image: dineInSession.orderedItems?.[0]?.image ? getFullImageUrl(dineInSession.orderedItems[0].image) : 'https://via.placeholder.com/150',
          order_type: 'Dine In',
          isOngoingDineIn: true,
        };

        if (existingIndex >= 0) {
          formattedOrders[existingIndex] = {
            ...formattedOrders[existingIndex],
            ...activeOrderCard,
            status: formattedOrders[existingIndex].status || 'PREPARING',
          };
        } else {
          formattedOrders.unshift(activeOrderCard);
        }
      }

      setOrders(formattedOrders);
    } catch (e) {
      console.error("Error loading local orders", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadOrders();
    });
    return unsubscribe;
  }, [navigation]);

  const filteredOrders = orders.filter(order => {
    if (activeTab === 'All') return true;
    
    const status = (order.status || '').toUpperCase();
    if (activeTab === 'Delivered' || activeTab === 'Completed') {
      return ['SERVED', 'COMPLETED', 'DELIVERED'].includes(status) && order.payment_status?.toUpperCase() === 'PAID';
    }
    if (activeTab === 'Cancelled' || activeTab === 'CANCELLED') {
      return status === 'CANCELLED';
    }
    
    return status === activeTab.toUpperCase();
  });

  const handleReorder = (order: any) => {
    clearCart();
    if (order.order_type === 'Take Away') setOrderType('Take Away');
    else if (order.order_type === 'Delivery') setOrderType('Delivery');
    else setOrderType('Dine In');

    if (Array.isArray(order.items)) {
      order.items.forEach((item: any) => {
        addItem({
          id: String(item.menu_item_id || item.id),
          name: item.name || 'Item',
          price: item.price || 0,
          quantity: item.quantity || 1,
          image: item.image_url || item.image || '',
          category: item.category || 'General',
        });
      });
    }
    router.replace('/checkout');
  };

  const handleOrderPress = (order: any) => {
    if (order.order_type === 'Delivery') {
      router.push({
        pathname: '/delivery-success',
        params: {
          dbOrderId: String(order.dbOrderId || order.dbId || ''),
          orderId: order.id,
          orderType: 'Delivery',
          total: String(order.total || 0),
          paymentMethod: order.payment_method || 'Cash',
          phone: phone || '',
          cart: typeof order.items === 'string' ? order.items : JSON.stringify(order.items || []),
        }
      });
    } else if (order.order_type === 'Takeaway' || order.order_type === 'Take Away') {
      router.push({
        pathname: '/order-success',
        params: {
          dbOrderId: String(order.dbOrderId || order.dbId || ''),
          orderId: order.id,
          orderType: 'Takeaway',
          tableNumber: 'Take Away',
          total: String(order.total || 0),
          paymentMethod: order.payment_method || 'UPI',
          phone: phone || '',
          cart: typeof order.items === 'string' ? order.items : JSON.stringify(order.items || []),
        }
      });
    } else {
      const isUnpaid = (order.payment_status || '').toUpperCase() !== 'PAID';
      if (isUnpaid || order.isOngoingDineIn) {
        router.push({ 
          pathname: '/track-order', 
          params: { 
            dbOrderId: String(order.dbOrderId || order.dbId || ''),
            orderId: order.id,
            orderType: 'Dine In',
            tableNumber: order.table_number || 'T-01',
          } 
        });
      } else {
        router.push({ pathname: '/order-details', params: { orderId: order.dbOrderId || order.id || order.dbId } });
      }
    }
  };

  const getDisplayStatus = (status: string, type: string) => {
    const s = status?.toUpperCase();
    if (s === 'CANCELLED') return 'Cancelled';
    if (s === 'CONFIRMED') return 'Confirmed';
    if (s === 'PREPARING') return 'Preparing';
    if (s === 'READY') {
      if (type === 'Take Away') return 'Ready to Pick up';
      if (type === 'Delivery') return 'Ready for Delivery';
      return 'Ready to Serve';
    }
    if (s === 'SERVED' || s === 'COMPLETED' || s === 'DELIVERED') {
      if (type === 'Take Away') return 'Picked Up';
      if (type === 'Delivery') return 'Delivered';
      return 'Served';
    }
    return status;
  };

  const formatDate = (isoString: string) => {
    try {
      let parsedString = isoString;
      if (parsedString && parsedString.includes('T') && !parsedString.endsWith('Z') && !parsedString.includes('+')) {
        parsedString += 'Z';
      }
      const d = new Date(parsedString);
      if (isNaN(d.getTime())) return isoString;
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const date = d.getDate();
      const month = months[d.getMonth()];
      const year = d.getFullYear();
      let hours = d.getHours();
      const minutes = d.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12;
      return `${date} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
    } catch {
      return isoString;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#fff' />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/home')}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Orders</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {['All', 'Completed', 'Cancelled'].map(tab => {
          // Note: Mapping 'Completed' to 'Delivered' in the data logic
          const isSelected = activeTab === tab || (activeTab === 'Delivered' && tab === 'Completed');
          return (
            <TouchableOpacity 
              key={tab} 
              style={[styles.filterBtn, isSelected && styles.filterBtnActive]}
              onPress={() => setActiveTab(tab === 'Completed' ? 'Delivered' : tab)}
            >
              <Text style={[styles.filterText, isSelected && styles.filterTextActive]}>{tab}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ff4500']} />}
      >
        {isLoading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 }}>
            <ActivityIndicator size="large" color="#ff4500" />
            <Text style={{ marginTop: 10, color: '#666' }}>Loading your orders...</Text>
          </View>
        ) : filteredOrders.map(order => (
          <TouchableOpacity 
            key={order.id} 
            style={styles.orderCard}
            onPress={() => handleOrderPress(order)}
          >
            <View style={styles.orderHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.restaurantName} numberOfLines={1}>{order.restaurant}</Text>
                <Text style={styles.orderDate} numberOfLines={1}>{formatDate(order.date)}</Text>
              </View>
              <View style={[
                styles.statusBadge, 
                order.status?.toUpperCase() === 'CANCELLED' ? styles.statusCancelled : styles.statusDelivered
              ]}>
                <Text style={[
                  styles.statusText,
                  order.status?.toUpperCase() === 'CANCELLED' ? styles.statusTextCancelled : styles.statusTextDelivered
                ]}>{getDisplayStatus(order.status, order.order_type)}</Text>
              </View>
            </View>

            {(() => {
              const isDineIn = order.order_type === 'Dine In';
              const normPayMethod = (order.payment_method || '').toLowerCase().replace(/[\s_-]/g, '');
              const isCounterPaid = normPayMethod === 'payatcounter' || normPayMethod === 'counter';
              const isPaid = (order.payment_status || '').toUpperCase() === 'PAID' || (isDineIn && isCounterPaid);
              const isUnpaidDineIn = isDineIn && (!isPaid || order.isOngoingDineIn);

              return (
                <>
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 15, flexWrap: 'wrap' }}>
                    <View style={styles.infoBadge}>
                      <Text style={styles.infoBadgeLabel}>Order ID</Text>
                      <Text style={styles.infoBadgeValue}>{order.id}</Text>
                    </View>
                    <View style={styles.infoBadge}>
                      <Text style={styles.infoBadgeLabel}>Type</Text>
                      <Text style={styles.infoBadgeValue}>
                        {isDineIn
                          ? `Dine In${order.table_number ? ` (${order.table_number})` : ''}`
                          : order.order_type}
                      </Text>
                    </View>
                    <View style={[styles.infoBadge, isPaid ? { backgroundColor: '#e8f5e9' } : { backgroundColor: '#fff3e0' }]}>
                      <Text style={styles.infoBadgeLabel}>Payment</Text>
                      <Text style={[styles.infoBadgeValue, { color: isPaid ? '#16a34a' : '#ff4500', fontWeight: 'bold' }]}>
                        {isPaid ? 'Paid' : (order.order_type === 'Delivery' ? 'Cash on Delivery' : 'Pay Later')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.orderDetails}>
                    {order.image && order.image !== 'https://via.placeholder.com/150' ? (
                      <Image source={{ uri: order.image }} style={styles.orderImage} />
                    ) : (
                      <View style={[styles.orderImage, { backgroundColor: '#fff0eb', alignItems: 'center', justifyContent: 'center' }]}>
                        <Ionicons name="restaurant-outline" size={26} color="#ff4500" />
                      </View>
                    )}
                    <View style={styles.orderInfo}>
                      <Text style={styles.orderItems} numberOfLines={2}>
                        {Array.isArray(order.items) 
                          ? order.items.map((i: any) => `${i.quantity || 1}x ${i.name || 'Item'}`).join(', ') 
                          : (typeof order.items === 'string' ? order.items : 'Items')}
                      </Text>
                      <Text style={styles.orderPrice}>Rs. {order.total}</Text>
                    </View>
                    {isUnpaidDineIn ? (
                      <TouchableOpacity 
                        style={[styles.reorderBtn, { backgroundColor: '#ff4500', borderColor: '#ff4500', minWidth: 100, alignItems: 'center', justifyContent: 'center' }]} 
                        onPress={() => handleOrderPress(order)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.reorderText, { color: '#ffffff', fontWeight: 'bold' }]}>Track / Pay</Text>
                      </TouchableOpacity>
                    ) : (order.order_type === 'Delivery' || order.order_type === 'Takeaway' || order.order_type === 'Take Away') ? (
                      <TouchableOpacity 
                        style={[styles.reorderBtn, { backgroundColor: '#ff4500', borderColor: '#ff4500', minWidth: 100, alignItems: 'center', justifyContent: 'center' }]} 
                        onPress={() => handleOrderPress(order)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.reorderText, { color: '#ffffff', fontWeight: 'bold' }]}>Track / Pay</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity 
                        style={[styles.reorderBtn, { backgroundColor: '#fff', borderColor: '#ff4500', minWidth: 100, alignItems: 'center', justifyContent: 'center' }]} 
                        onPress={() => router.push({ pathname: '/order-details', params: { orderId: order.dbId || order.id } })}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.reorderText, { color: '#ff4500', fontWeight: 'bold' }]}>View Details</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              );
            })()}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Bottom Navigation */}
      <BottomNavBar activeTab="orders" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
  },
  backBtn: {
    marginRight: 15,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    gap: 10,
  },
  filterBtn: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  filterBtnActive: {
    backgroundColor: '#ff4500',
    borderColor: '#ff4500',
  },
  filterText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  filterTextActive: {
    color: '#fff',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 120,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 12,
    color: '#888',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusDelivered: {
    backgroundColor: '#e6ffe6',
  },
  statusCancelled: {
    backgroundColor: '#ffe6e6',
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  statusTextDelivered: {
    color: '#00cc66',
  },
  statusTextCancelled: {
    color: '#ff4500',
  },
  orderDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderImage: {
    width: 60,
    height: 60,
    borderRadius: 10,
    marginRight: 15,
  },
  orderInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  orderItems: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  orderPrice: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  reorderBtn: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ff4500',
  },
  reorderText: {
    color: '#ff4500',
    fontSize: 14,
    fontWeight: 'bold',
  },
  infoBadge: {
    backgroundColor: '#f9f9f9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  infoBadgeLabel: {
    fontSize: 10,
    color: '#888',
    marginBottom: 4,
  },
  infoBadgeValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#000',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  navItem: {
    alignItems: 'center',
  },
  navText: {
    fontSize: 10,
    marginTop: 5,
    color: '#888',
  }
});
