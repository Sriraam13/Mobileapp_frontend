import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { orderApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import { useCartStore } from '../../store';

export default function OrderDetails() {
  const router = useRouter();
  const { orderId, isHistorical, restaurantId } = useLocalSearchParams();
  const { clearCart, addItem, setOrderType } = useCartStore();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (orderId && !isHistorical) {
      orderApi.getOrderDetails(orderId as string, restaurantId ? Number(restaurantId) : 1)
        .then(data => {
          if (data && data.order) {
            setOrder(data.order);
            setItems(data.items || []);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error('Failed to load order details', err);
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [orderId]);

  const handleReorder = () => {
    if (!items || items.length === 0) return;
    clearCart();
    if (order?.order_type === 'Take Away') setOrderType('Take Away');
    else if (order?.order_type === 'Delivery') setOrderType('Delivery');
    else setOrderType('Dine In');

    items.forEach((item: any) => {
      addItem({
        id: item.menu_item_id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        image: getFullImageUrl(item.image_url),
        category: 'Special',
      });
    });
    router.push('/checkout');
  };

  const handleInvoice = () => {
    if (!order) return;
    router.push({
      pathname: '/invoice',
      params: {
        orderId: order.orderId,
        subtotal: getSubtotal(),
        finalTotal: order.total_amount,
        discountAmount: order.discount_amount || 0,
        mobileNumber: order.customer_phone || '',
        customerName: order.customer_name || '',
        paymentMethod: order.payment_method || 'UPI',
        orderType: order.order_type || 'Dine In',
        cartData: JSON.stringify(items.map((i: any) => ({ ...i, qty: i.quantity })))
      }
    });
  };

  const getSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  const getTaxes = () => {
    // Deriving taxes back from final amount since it's not stored
    // Total = Sub + Taxes + Delivery - Discount
    const sub = getSubtotal();
    const dlv = order?.order_type === 'Delivery' ? 30 : 0;
    const disc = order?.discount_amount || 0;
    return Math.max(0, order?.total_amount - sub - dlv + disc);
  };

  const getDisplayStatus = () => {
    if (!order) return '';
    const status = order.status;
    if (status === 'COMPLETED' || status === 'SERVED') {
      if (order.order_type === 'Take Away') return 'Picked Up';
      if (order.order_type === 'Delivery') return 'Delivered';
      return 'Served';
    }
    if (status === 'CONFIRMED') return 'Confirmed';
    if (status === 'PREPARING') return 'Preparing';
    if (status === 'READY') {
      if (order.order_type === 'Take Away') return 'Ready to Pick up';
      if (order.order_type === 'Delivery') return 'Ready for Delivery';
      return 'Ready to Serve';
    }
    if (status === 'CANCELLED') return 'Cancelled';
    return status;
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color="#ff4500" />
      </SafeAreaView>
    );
  }

  if (!order) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 16, color: '#666' }}>Order not found</Text>
      </SafeAreaView>
    );
  }

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
          onPress={() => router.canGoBack() ? router.back() : router.replace('/orders')}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Details</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Order Header info */}
        <View style={styles.orderHeaderCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.orderDate}>
              Placed on {formatDate(order.created_at)}
            </Text>
          </View>
          <View style={[styles.statusBadge, order.status === 'CANCELLED' ? { backgroundColor: '#fee2e2' } : {}]}>
            <Text style={[styles.statusText, order.status === 'CANCELLED' ? { color: '#ef4444' } : {}]}>{getDisplayStatus()}</Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 15 }}>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeLabel}>Order ID</Text>
            <Text style={styles.infoBadgeValue}>{order.orderId || `ORD-${String(order.id).padStart(6, '0')}`}</Text>
          </View>
          <View style={styles.infoBadge}>
            <Text style={styles.infoBadgeLabel}>Type</Text>
            <Text style={styles.infoBadgeValue}>{order.order_type || 'Dine In'}</Text>
          </View>
        </View>

        <View style={styles.divider} />

        {/* Items */}
        {items.map((item, index) => (
          <View key={index} style={styles.itemRow}>
            <Image source={{ uri: getFullImageUrl(item.image_url) }} style={styles.itemImage} />
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemQty}>Qty: {item.quantity} • Rs. {item.price} each</Text>
            </View>
            <Text style={styles.itemTotal}>Rs. {item.price * item.quantity}</Text>
          </View>
        ))}

        <View style={styles.divider} />

        {/* Bill Details */}
        <View style={styles.billRow}>
          <Text style={styles.billLabel}>Subtotal</Text>
          <Text style={styles.billValue}>Rs. {getSubtotal().toFixed(0)}</Text>
        </View>
        
        {order.order_type === 'Delivery' && (
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Delivery Fee</Text>
            <Text style={styles.billValue}>
              <Text style={styles.strikethrough}>Rs. 40</Text>
              <Text style={styles.freeText}> FREE</Text>
            </Text>
          </View>
        )}
        
        {order.discount_amount > 0 && (
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Discount</Text>
            <Text style={[styles.billValue, { color: '#ef4444' }]}>- Rs. {order.discount_amount.toFixed(2)}</Text>
          </View>
        )}

        <View style={styles.billRow}>
          <Text style={styles.billLabel}>Taxes & charges</Text>
          <Text style={styles.billValue}>Rs. {getTaxes().toFixed(2)}</Text>
        </View>
        
        <View style={styles.grandTotalRow}>
          <Text style={styles.grandTotalLabel}>Grand Total</Text>
          <Text style={styles.grandTotalValue}>Rs. {order.total_amount.toFixed(2)}</Text>
        </View>

        <View style={styles.divider} />

        {/* Delivered To / Phone */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>{order.order_type === 'Delivery' ? 'DELIVERED TO' : 'CUSTOMER PHONE'}</Text>
          <Text style={styles.sectionText}>
            {order.order_type === 'Delivery' 
              ? (order.address || 'Flat 402, Sunshine Residency, Koramangala 3rd Block, Bangalore')
              : (order.customer_phone || 'WALK-IN')}
          </Text>
        </View>

        {/* Payment Method */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>
          <View style={styles.paymentRow}>
            <Ionicons name="card-outline" size={18} color="#555" />
            <Text style={styles.paymentText}>{order.payment_method}</Text>
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.invoiceBtn} onPress={handleInvoice}>
            <Text style={styles.invoiceText}>Invoice</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.reorderBtn} onPress={handleReorder}>
            <Text style={styles.reorderText}>Reorder</Text>
          </TouchableOpacity>
        </View>

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
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/orders')}>
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
    backgroundColor: '#fff',
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
    fontWeight: '900',
    color: '#000',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  orderHeaderCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderId: {
    fontSize: 16,
    fontWeight: '900',
    color: '#000',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 13,
    color: '#666',
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
  statusBadge: {
    backgroundColor: '#eaf5eb',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  statusText: {
    color: '#16a34a',
    fontSize: 12,
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginVertical: 20,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    marginRight: 15,
    backgroundColor: '#f3f4f6',
  },
  itemInfo: {
    flex: 1,
    marginRight: 10,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#000',
    marginBottom: 4,
  },
  itemQty: {
    fontSize: 12,
    color: '#666',
  },
  itemTotal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#000',
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  billLabel: {
    fontSize: 14,
    color: '#666',
  },
  billValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  strikethrough: {
    fontSize: 13,
    color: '#9ca3af',
    textDecorationLine: 'line-through',
    marginRight: 4,
  },
  freeText: {
    fontSize: 13,
    color: '#16a34a',
    fontWeight: 'bold',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  grandTotalLabel: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ff3400',
  },
  grandTotalValue: {
    fontSize: 16,
    fontWeight: '900',
    color: '#ff3400',
  },
  section: {
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#666',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  sectionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  paymentText: {
    fontSize: 14,
    color: '#333',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 10,
  },
  invoiceBtn: {
    flex: 1,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  invoiceText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
  },
  reorderBtn: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#ff3400',
    borderRadius: 12,
    alignItems: 'center',
  },
  reorderText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#fff',
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
