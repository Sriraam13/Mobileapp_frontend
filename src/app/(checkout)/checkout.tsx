import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Platform, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCartStore } from '../../store/useCartStore';

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

  const cartItems = Object.values(items).filter(item => item && item.quantity > 0);
  const itemCount = getItemCount();
  const subtotal = getSubtotal();
  const gst = getGst();
  const discountAmount = getDiscountAmount();
  
  const packagingCharges = 0; // Fixed as per wireframe
  
  const toPay = subtotal + packagingCharges + gst - discountAmount;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#222" />
      
      {/* Dark Top Header */}
      <View style={styles.darkHeader}>
        {orderType !== 'Take Away' && (
          <View style={styles.tableBadge}>
            <Text style={styles.tableText}>Table no : </Text>
            <View style={styles.tableCircle}>
              <Text style={styles.tableCircleText}>{tableNumber?.replace('T-', '') ?? '06'}</Text>
            </View>
          </View>
        )}
        
        <View style={styles.logoContainer}>
          <Image 
            source={require('../../../assets/images/Dataudupi.png')} 
            style={styles.logoImageFull} 
            resizeMode="contain"
          />
        </View>

        {/* Spacer to keep logo centered */}
        <View style={{ width: 32 }} />
      </View>

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
            <Image source={{ uri: item.image || 'https://via.placeholder.com/150' }} style={styles.itemImg} resizeMode="cover" />
            <View style={styles.itemInfo}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemSubtitle}>{item.category || 'Special'}</Text>
              {item.note ? (
                <Text style={styles.itemNote}>"{item.note}"</Text>
              ) : null}
              <View style={styles.itemBottomRow}>
                <Text style={styles.itemPrice}>Rs. {item.price}</Text>
                
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepBtnMinus} onPress={() => decrementQuantity(item.id)}>
                    <Ionicons name="remove" size={16} color="#ff3400" />
                  </TouchableOpacity>
                  <Text style={styles.stepVal}>{item.quantity}</Text>
                  <TouchableOpacity style={styles.stepBtnPlus} onPress={() => incrementQuantity(item.id)}>
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

        {/* Bill Details */}
        <View style={styles.billDetailsBox}>
          <Text style={styles.billTitle}>Bill Details</Text>
          
          <View style={styles.billRow}>
            <Text style={styles.billLabel}>Item Subtotal</Text>
            <Text style={styles.billValue}>Rs. {subtotal.toFixed(2)}</Text>
          </View>
          
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
            <Text style={styles.toPayValue}>Rs. {Math.max(toPay, 0).toFixed(2)}</Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <TouchableOpacity 
          style={styles.proceedBtn}
          onPress={() => router.push('/payment')}
        >
          <Text style={styles.proceedBtnText}>Proceed to Payment</Text>
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
    marginBottom: 2,
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
  }
});
