import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCartStore } from '../../store/useCartStore';
import { useAddressStore } from '../../store/useAddressStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useDineInSessionStore } from '../../store/useDineInSessionStore';
import { useOrderStore, useLiveOrderStore, useRestaurantStore } from '../../store';
import { orderApi } from '../../services/apiService';
import { resolveOutletLocation, getDistanceInKm, calculateDeliveryFee } from '../../utils/deliveryArea';
import { getFullImageUrl } from '../../constants/api';

export default function CheckoutScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { 
    items, 
    getItemCount, 
    getSubtotal, 
    getGst, 
    getDiscountAmount, 
    orderType,
    tableNumber,
    incrementQuantity,
    decrementQuantity,
    discountCode
  } = useCartStore();

  const { selectedDeliveryAddress, addresses, selectedAddressId } = useAddressStore();
  const { selectedOutlet } = useRestaurantStore();
  const { phone } = useAuthStore();
  const dineInSession = useDineInSessionStore();
  const [dineInPayLater, setDineInPayLater] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const cartItems = Object.values(items).filter(item => item && item.quantity > 0);
  const itemCount = getItemCount();
  const subtotal = getSubtotal();
  const gst = getGst();
  const discountAmount = getDiscountAmount();
  
  const packagingCharges = 0; // Fixed as per wireframe
  
  const toPay = subtotal + packagingCharges + gst - discountAmount;
  
  const selectedAddressObj = addresses.find(a => a.id == selectedAddressId) || addresses[0];
  const deliveryAddressType = selectedAddressObj ? selectedAddressObj.type : 'Home';

  const targetOutlet = resolveOutletLocation(selectedOutlet);
  const distanceKm = (selectedAddressObj?.latitude && selectedAddressObj?.longitude)
    ? getDistanceInKm(selectedAddressObj.latitude, selectedAddressObj.longitude, targetOutlet)
    : null;

  const deliveryFee = orderType === 'Delivery' ? calculateDeliveryFee(distanceKm) : 0;
  const finalToPay = toPay + deliveryFee;

  const handleProceed = async () => {
    if (orderType === 'Delivery') {
      if (!selectedDeliveryAddress) {
        router.push('/add-address');
        return;
      }
      router.push('/delivery-checkout');
      return;
    }

    if (orderType === 'Dine In') {
      setSubmitting(true);
      try {
        const formattedCart = cartItems.map(item => ({
          id: Number(item.id),
          quantity: item.quantity,
          price: item.price,
          name: item.name,
          image: item.image,
        }));

        const restaurantId = selectedOutlet?.restaurant_id;
        if (!restaurantId) {
          setSubmitting(false);
          Alert.alert('No Restaurant Selected', 'Please select a restaurant outlet before ordering.', [
            { text: 'Select Outlet', onPress: () => router.push('/outlet-selector') },
          ]);
          return;
        }

        const activeTable = dineInSession.tableNumber || tableNumber;
        if (!activeTable) {
          setSubmitting(false);
          Alert.alert('No Table Selected', 'Please scan your table QR or enter a table number before placing a Dine-In order.');
          return;
        }

        const res = await orderApi.createOrder({
          restaurant_id: restaurantId,
          cart: formattedCart,
          subtotal,
          gst,
          delivery_fee: 0,
          packaging_fee: 0,
          discount_amount: discountAmount,
          discount_code: discountCode,
          total_amount: Math.max(finalToPay, 0),
          order_type: 'DINE_IN',
          table_number: activeTable,
          payment_method: 'Pay Later',
          phone: phone || '',
          session_id: dineInSession.sessionDbId || undefined,
          session_uid: dineInSession.sessionUid || undefined,
        });

        if (dineInSession.isActive && (dineInSession.sessionDbId || dineInSession.sessionUid || dineInSession.activeDbOrderId)) {
          dineInSession.appendOrderRound(
            res.orderId,
            res.dbOrderId,
            formattedCart,
            Math.max(finalToPay, 0)
          );
        } else {
          dineInSession.startDineInOrder(
            activeTable,
            res.orderId,
            res.dbOrderId,
            formattedCart,
            Math.max(finalToPay, 0),
            { sessionId: res.sessionId, sessionUid: res.sessionUid }
          );
        }

        useOrderStore.getState().addPastOrder({
          orderId: res.orderId,
          dbOrderId: String(res.dbOrderId),
          date: new Date().toISOString(),
          total: Math.max(finalToPay, 0),
          itemsCount: formattedCart.length,
          status: 'Preparing',
          payment_status: 'Pending',
          table_number: activeTable,
          order_type: 'Dine In',
          customer_phone: phone || '',
          items: formattedCart,
        });
        useLiveOrderStore.getState().setLiveOrder('Dine In', res.orderId, String(res.dbOrderId), 'Preparing');
        useCartStore.getState().clearCart();
        setSubmitting(false);

        // Immediately navigate to Track Order status screen
        router.push({
          pathname: '/track-order',
          params: {
            orderId: res.orderId,
            dbOrderId: String(res.dbOrderId),
            sessionId: String(res.sessionId || dineInSession.sessionDbId || ''),
            sessionUid: res.sessionUid || dineInSession.sessionUid || '',
            tableNumber: activeTable,
            orderType: 'Dine In',
            cart: JSON.stringify(formattedCart),
          }
        });
      } catch (err: any) {
        setSubmitting(false);
        Alert.alert("Error", err.message || "Failed to place dine-in order.");
      }
      return;
    }

    // Otherwise standard checkout to payment screen
    router.push('/payment');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#222" />
      


      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/home')} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Your Cart ({itemCount} Items)</Text>
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Cart Items */}
        {cartItems.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <Image source={{ uri: getFullImageUrl(item.image, item.name) }} style={styles.itemImg} resizeMode="cover" />
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              {item.note ? (
                <Text style={styles.itemNote}>&quot;{item.note}&quot;</Text>
              ) : null}
              <View style={styles.itemBottomRow}>
                <Text style={styles.itemPrice}>Rs. {item.price}</Text>
                
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepBtnMinus} onPress={() => decrementQuantity(item.id as any)}>
                    <Ionicons name="remove" size={16} color="#ff3400" />
                  </TouchableOpacity>
                  <Text style={styles.stepVal}>{item.quantity}</Text>
                  <TouchableOpacity style={styles.stepBtnPlus} onPress={() => incrementQuantity(item.id as any)}>
                    <Ionicons name="add" size={16} color="#ff3400" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        ))}

        {/* Discount Banner (Hidden for Take Away) */}
        {orderType !== 'Take Away' && discountAmount > 0 && (
          <View style={styles.discountBanner}>
            <View style={styles.discountLeft}>
              <Ionicons name="ticket-outline" size={20} color="#ff3400" />
              <Text style={styles.discountText}><Text style={styles.discountCode}>{discountCode || 'UDIPIFEAST'}</Text> applied!</Text>
            </View>
            <Text style={styles.discountSaved}>Rs. {discountAmount} SAVED</Text>
          </View>
        )}

        {/* Delivery Address Box */}
        {orderType === 'Delivery' && (
          <View style={styles.addressBox}>
            <View style={styles.addressTop}>
              <Text style={styles.addressType}>Delivering to {selectedDeliveryAddress ? deliveryAddressType : 'Home'}</Text>
              <TouchableOpacity onPress={() => router.push('/add-address')}>
                <Text style={styles.changeBtn}>CHANGE</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.addressBottom}>
              <Text style={styles.addressText} numberOfLines={1}>
                {selectedDeliveryAddress || 'Select Delivery Address'}
              </Text>
              <View style={styles.etaBadge}>
                <Text style={styles.etaText}>30-40 MIN ETA</Text>
              </View>
            </View>
          </View>
        )}

        {/* Dine In Payment Preference */}
        {orderType === 'Dine In' && (
          <View style={styles.dineInPaymentCard}>
            <Text style={styles.dineInPaymentTitle}>
              {dineInSession.isActive
                ? `Active Table Order (#${dineInSession.activeOrderId})`
                : 'Dine-In Payment Preference'}
            </Text>
            {dineInSession.isActive ? (
              <Text style={styles.dineInPaymentSub}>
                These items will be sent to the kitchen and added to your ongoing bill for Table {dineInSession.tableNumber || tableNumber}.
              </Text>
            ) : (
              <View style={styles.dineInChoiceRow}>
                <TouchableOpacity
                  style={[styles.dineInChoiceOption, dineInPayLater && styles.dineInChoiceActive]}
                  onPress={() => setDineInPayLater(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={dineInPayLater ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={dineInPayLater ? '#00a01d' : '#888'}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.dineInChoiceText, dineInPayLater && styles.dineInChoiceTextActive]}>
                      Pay Later (At End of Meal)
                    </Text>
                    <Text style={styles.dineInChoiceDesc}>
                      Order goes to kitchen now; pay when you finish eating.
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.dineInChoiceOption, !dineInPayLater && styles.dineInChoiceActive]}
                  onPress={() => setDineInPayLater(false)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={!dineInPayLater ? 'radio-button-on' : 'radio-button-off'}
                    size={18}
                    color={!dineInPayLater ? '#00a01d' : '#888'}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={[styles.dineInChoiceText, !dineInPayLater && styles.dineInChoiceTextActive]}>
                      Pay Now (UPI / Cards)
                    </Text>
                    <Text style={styles.dineInChoiceDesc}>
                      Pay upfront before kitchen preparation starts.
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Bill Details */}
        <View style={styles.billDetailsBox}>
          <Text style={styles.billTitle}>Bill Details</Text>

          {/* Cart items with quantity breakdown */}
          {cartItems.map((item) => {
            const itemTotal = (Number(item.price) || 0) * (Number(item.quantity) || 1);
            return (
              <View key={item.id} style={styles.billItemRow}>
                <View style={styles.billItemTitleContainer}>
                  <Text style={styles.billItemName} numberOfLines={1} ellipsizeMode="tail">
                    {item.name}
                  </Text>
                  <Text style={styles.billItemQty}>x {item.quantity}</Text>
                </View>
                <Text style={styles.billItemPrice}>Rs. {itemTotal.toFixed(2)}</Text>
              </View>
            );
          })}

          {cartItems.length > 0 && <View style={styles.billSubDivider} />}
          
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Item Subtotal</Text>
            <Text style={styles.billValue}>Rs. {subtotal.toFixed(2)}</Text>
          </View>
          
          {orderType === 'Delivery' && (
            <View style={styles.billRow}>
              <Text style={styles.billLabel}>Delivery Fee</Text>
              <Text style={styles.billValue}>Rs. {deliveryFee.toFixed(2)}</Text>
            </View>
          )}
          
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Packaging Charges</Text>
            <Text style={styles.billValue}>Rs. {packagingCharges.toFixed(2)}</Text>
          </View>

          <View style={styles.billRow}>
            <Text style={styles.billLabel}>GST & Restaurant Taxes</Text>
            <Text style={styles.billValue}>Rs. {gst.toFixed(2)}</Text>
          </View>

          {discountAmount > 0 && (
            <View style={styles.billRow}>
              <Text style={styles.billLabelDiscount}>Discount coupon</Text>
              <Text style={styles.billValueDiscount}>- Rs. {discountAmount.toFixed(2)}</Text>
            </View>
          )}

          <View style={styles.divider} />

          <View style={styles.billRowToPay}>
            <Text style={styles.toPayLabel}>To Pay</Text>
            <Text style={styles.toPayValue}>Rs. {Math.max(finalToPay, 0).toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity 
          style={[styles.proceedBtn, submitting && styles.proceedBtnDisabled]}
          onPress={handleProceed}
          disabled={submitting}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.proceedBtnText}>
              {orderType === 'Dine In'
                ? dineInSession.isActive
                  ? `Add to Table Order (#${dineInSession.activeOrderId})`
                  : dineInPayLater
                  ? 'Place Dine-In Order (Pay Later)'
                  : 'Proceed to Payment'
                : 'Proceed to Checkout'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f9f9f9',
  },
  darkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#222',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  logoContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImageFull: {
    width: 130,
    height: 32,
  },
  tableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingLeft: 10,
    paddingRight: 2,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#dfdfdf',
  },
  tableText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#000',
  },
  tableCircle: {
    backgroundColor: '#ff3400',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  tableCircleText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
  },
  backBtn: {
    padding: 4,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000',
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  itemCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  itemImg: {
    width: 70,
    height: 70,
    borderRadius: 12,
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  itemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 6,
  },
  itemSubtitle: {
    fontSize: 11,
    color: '#888',
    marginBottom: 4,
  },
  itemNote: {
    fontSize: 11,
    color: '#ff6b6b',
    fontStyle: 'italic',
    marginBottom: 8,
  },
  itemBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff0e6',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stepBtnMinus: {
    paddingHorizontal: 4,
  },
  stepBtnPlus: {
    paddingHorizontal: 4,
  },
  stepVal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff3400',
    width: 24,
    textAlign: 'center',
  },
  discountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff9c85',
    borderStyle: 'dashed',
    padding: 12,
    marginBottom: 16,
  },
  discountLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  discountText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#333',
  },
  discountCode: {
    fontWeight: 'bold',
    color: '#000',
  },
  discountSaved: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#00a01d',
  },
  addressBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  addressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  addressType: {
    fontSize: 12,
    color: '#888',
  },
  changeBtn: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  addressBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  addressText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    flex: 1,
    marginRight: 12,
  },
  etaBadge: {
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  etaText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#00a01d',
  },
  billDetailsBox: {
    marginTop: 8,
    paddingHorizontal: 4,
  },
  billTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 16,
  },
  billItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  billItemTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  billItemName: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
    flexShrink: 1,
  },
  billItemQty: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
    marginLeft: 6,
  },
  billItemPrice: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  billSubDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginTop: 4,
    marginBottom: 12,
  },
  billRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  billLabel: {
    fontSize: 13,
    color: '#666',
  },
  billValue: {
    fontSize: 13,
    color: '#333',
  },
  billLabelDiscount: {
    fontSize: 13,
    color: '#00a01d',
  },
  billValueDiscount: {
    fontSize: 13,
    color: '#00a01d',
    fontWeight: 'bold',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 16,
  },
  billRowToPay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toPayLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
  },
  toPayValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  footer: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: '#eee',
  },
  proceedBtn: {
    backgroundColor: '#00a01d',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  proceedBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  proceedBtnDisabled: {
    opacity: 0.6,
  },
  dineInPaymentCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e8f5e9',
  },
  dineInPaymentTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 4,
  },
  dineInPaymentSub: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  dineInChoiceRow: {
    marginTop: 8,
    gap: 8,
  },
  dineInChoiceOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  dineInChoiceActive: {
    borderColor: '#00a01d',
    backgroundColor: '#f4fbf5',
  },
  dineInChoiceText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#444',
  },
  dineInChoiceTextActive: {
    color: '#00a01d',
  },
  dineInChoiceDesc: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
});
