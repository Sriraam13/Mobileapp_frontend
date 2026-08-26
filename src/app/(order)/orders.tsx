import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';;
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useNavigation } from 'expo-router';
import { orderApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import { useAuthStore, useCartStore, useOrderStore, useRestaurantStore } from '../../store';

export default function Orders() {
  const router = useRouter();
  const navigation = useNavigation();
  const { phone } = useAuthStore();
  const { clearCart, addItem, setOrderType } = useCartStore();
  const [activeTab, setActiveTab] = useState('All');
  const [orders, setOrders] = useState<any[]>([]);
  const { pastOrders } = useOrderStore();
  const { selectedOutlet } = useRestaurantStore();

  const loadOrders = async () => {
    try {
      const userPhone = phone || '+919876543210';
      if (userPhone) {
        // Fetch from both Mugalivakkam (1) and MGR Nagar (2)
        const [data1, data2] = await Promise.all([
          orderApi.getCustomerOrders(userPhone, 1).catch(() => []),
          orderApi.getCustomerOrders(userPhone, 2).catch(() => [])
        ]);
        
        let allData: any[] = [];
        if (Array.isArray(data1)) allData = [...allData, ...data1];
        if (Array.isArray(data2)) allData = [...allData, ...data2];
        
        if (allData.length > 0) {
          // Sort combined orders by created_at descending
          allData.sort((a, b) => new Date(b.order?.created_at || 0).getTime() - new Date(a.order?.created_at || 0).getTime());

          const formattedOrders = allData.map((entry: any) => {
            const o = entry.order;
            const items = entry.items;
            
            // Format for UI
            const finalOrderId = o.orderId || `ORD-${String(o.id).padStart(6, '0')}`;
            return {
              id: finalOrderId,
              dbId: o.id,
              restaurant: o.restaurant_id === 2 ? 'MGR Nagar' : 'Mugalivakkam',
              date: o.created_at || new Date().toISOString(),
              status: o.status || 'Pending',
              items: items || [],
              total: o.total_amount || 0,
              image: items?.[0]?.image_url ? getFullImageUrl(items[0].image_url) : 'https://via.placeholder.com/150',
              order_type: o.order_type || 'Dine In'
            }
          });
          setOrders(formattedOrders);
          return;
        }
      }

      // Fallback if backend fetch fails or no phone
      const formattedOrders = pastOrders.map((o: any) => {
        return {
          id: o.orderId || `ORD-${String(o.id || 0).padStart(6, '0')}`,
          restaurant: 'Data Udipi',
          date: o.date || new Date().toISOString(),
          status: o.status || 'Pending',
          items: o.items || o.cart || [],
          total: o.total || 0,
          image: o.items?.[0]?.image ? getFullImageUrl(o.items[0].image) : 'https://via.placeholder.com/150',
          order_type: o.orderType || 'Dine In'
        };
      });
      
      setOrders(formattedOrders);
    } catch (e) {
      console.error("Error loading local orders", e);
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
      return ['SERVED', 'COMPLETED', 'DELIVERED'].includes(status);
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

    if (order.raw_items && order.raw_items.length > 0) {
      order.raw_items.forEach((item: any) => addItem(item));
    }
    router.push('/checkout');
  };

  const handleOrderPress = (order: any) => {
    const activeStatuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'ALMOST_READY', 'READY'];
    if (activeStatuses.includes((order.status || '').toUpperCase())) {
      router.push({ 
        pathname: '/track-order', 
        params: { 
          dbOrderId: order.dbOrderId,
          orderId: order.id,
          orderType: order.order_type || 'Take Away'
        } 
      });
    } else {
      router.push({ pathname: '/order-details', params: { orderId: order.dbOrderId || order.id } });
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
      const d = new Date(isoString);
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {filteredOrders.map(order => (
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

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 15 }}>
              <View style={styles.infoBadge}>
                <Text style={styles.infoBadgeLabel}>Order ID</Text>
                <Text style={styles.infoBadgeValue}>{order.id}</Text>
              </View>
              <View style={styles.infoBadge}>
                <Text style={styles.infoBadgeLabel}>Type</Text>
                <Text style={styles.infoBadgeValue}>{order.order_type}</Text>
              </View>
            </View>

            <View style={styles.orderDetails}>
              <Image source={{ uri: order.image }} style={styles.orderImage} />
              <View style={styles.orderInfo}>
                <Text style={styles.orderItems} numberOfLines={2}>
                  {Array.isArray(order.items) 
                    ? order.items.map((i: any) => `${i.quantity || 1}x ${i.name || 'Item'}`).join(', ') 
                    : 'Items'}
                </Text>
                <Text style={styles.orderPrice}>Rs. {order.total}</Text>
              </View>
              <TouchableOpacity style={styles.reorderBtn} onPress={() => handleReorder(order)}>
                <Text style={styles.reorderText}>Reorder</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/home')}>
          <Ionicons name='home-outline' size={24} color='#888' />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/menu')}>
          <Ionicons name='search-outline' size={24} color='#888' />
          <Text style={styles.navText}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name='receipt' size={24} color='#ff4500' />
          <Text style={[styles.navText, { color: '#ff4500' }]}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/profile')}>
          <Ionicons name='person-outline' size={24} color='#888' />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
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
    paddingBottom: 100,
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
