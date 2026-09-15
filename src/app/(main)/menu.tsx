import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, FlatList, Platform, StatusBar, Image, Modal, BackHandler, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useVoiceAgentStore, useAuthStore, useOrderStore, useCartStore, useLiveOrderStore, useDineInSessionStore, useRestaurantStore } from '../../store';
import { menuApi, orderApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import DineInActiveBanner from '../../components/DineInActiveBanner';
import ViewCartButton from '../../components/layout/ViewCartButton';

export default function App() {
  const router = useRouter();
  const { phone } = useAuthStore();
  const dineInSession = useDineInSessionStore();
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const params = useLocalSearchParams<{ orderType?: string; tableNumber?: string; categoryId?: string }>();
  const insets = useSafeAreaInsets();
  const { items: cart, addItem, removeItem, incrementQuantity, decrementQuantity, orderType, setOrderType, tableNumber, setTableNumber, getItemCount, getSubtotal, clearCart } = useCartStore();
  
  useEffect(() => {
    const onBackPress = () => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/home');
      }
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (params.orderType) {
      const initialOrderType = params.orderType as string;
      const mappedOrderType = initialOrderType === "Takeaway" ? "Take Away" : (initialOrderType === "Dine-in" ? "Dine In" : initialOrderType) as "Dine In" | "Take Away" | "Delivery";
      if (mappedOrderType) setOrderType(mappedOrderType);
    }
    if (params.tableNumber) {
      setTableNumber(params.tableNumber as string);
    }
  }, [params.orderType, params.tableNumber, setOrderType, setTableNumber]);

  const [allCategories, setAllCategories] = useState<any[]>([]);
  const [menuItems, setMenuItems] = useState<any[]>([]);
  const [regions, setRegions] = useState<string[]>(["All Regions"]);
  const [activeRegion, setActiveRegion] = useState("All Regions");
  const [activeCat, setActiveCat] = useState((params.categoryId as string) || "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isCartModalVisible, setIsCartModalVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const showAgent = useVoiceAgentStore((state) => state.showAgent);
  const [availabilityFilter, setAvailabilityFilter] = useState("All Items");
  const [priceSort, setPriceSort] = useState("Default");
  
  const { selectedOutlet } = useRestaurantStore();
  const restaurantId = selectedOutlet?.restaurant_id;

  useEffect(() => {
    if (!restaurantId) {
      Alert.alert('No Outlet Selected', 'Please select a restaurant location first.', [
        { text: 'OK', onPress: () => router.replace('/home') }
      ]);
    }
  }, [restaurantId, router]);

  const handleDineInOrder = async (payLater: boolean) => {
    const activeTable = tableNumber || 'T-01';
    const rawCartItems = Object.values(cart).filter(item => item && item.quantity > 0);
    if (rawCartItems.length === 0) return;

    setIsPlacingOrder(true);
    try {
      const formattedCart = rawCartItems.map(item => ({
        id: Number(item.id),
        quantity: item.quantity,
        price: item.price,
        name: item.name,
        image: item.image,
      }));

      const subtotal = getSubtotal();

      if (dineInSession.isActive && dineInSession.activeDbOrderId) {
        // Append items to current active dine in order
        await orderApi.appendOrderItems(dineInSession.activeDbOrderId, {
          cart: formattedCart,
          total_amount: subtotal,
          order_type: 'DINE_IN',
          table_number: activeTable,
          phone: phone || '',
        });

        const newAllItems = [...dineInSession.orderedItems, ...formattedCart];
        const newTotal = (dineInSession.totalAmount || 0) + subtotal;
        dineInSession.appendItemsToOrder(formattedCart, subtotal);
        useOrderStore.getState().addPastOrder({
          orderId: dineInSession.activeOrderId ?? '',
          dbOrderId: String(dineInSession.activeDbOrderId ?? ''),
          date: new Date().toISOString(),
          total: newTotal,
          itemsCount: newAllItems.length,
          status: 'Preparing',
          payment_status: 'Pending',
          table_number: activeTable,
          order_type: 'Dine In',
          customer_phone: phone ?? '',
          items: newAllItems,
        });
        useLiveOrderStore.getState().setLiveOrder('Dine In', dineInSession.activeOrderId ?? '', String(dineInSession.activeDbOrderId ?? ''), 'Preparing');
        clearCart();
        setIsCartModalVisible(false);

        // Immediately navigate to Track Order status screen
        router.push({
          pathname: '/track-order',
          params: {
            orderId: dineInSession.activeOrderId ?? '',
            dbOrderId: String(dineInSession.activeDbOrderId ?? ''),
            tableNumber: activeTable,
            orderType: 'Dine In',
            cart: JSON.stringify(newAllItems),
          }
        });
      } else if (payLater) {
        // Place initial dine-in order with Pay Later
        const res = await orderApi.createOrder({
          cart: formattedCart,
          subtotal: subtotal,
          total_amount: subtotal,
          order_type: 'DINE_IN',
          table_number: activeTable,
          payment_method: 'Pay Later',
          phone: phone || '',
        });

        dineInSession.startDineInOrder(
          activeTable,
          res.orderId,
          res.dbOrderId,
          formattedCart,
          subtotal
        );
        useOrderStore.getState().addPastOrder({
          orderId: res.orderId,
          dbOrderId: String(res.dbOrderId),
          date: new Date().toISOString(),
          total: subtotal,
          itemsCount: formattedCart.length,
          status: 'Preparing',
          payment_status: 'Pending',
          table_number: activeTable,
          order_type: 'Dine In',
          customer_phone: phone || '',
          items: formattedCart,
        });
        useLiveOrderStore.getState().setLiveOrder('Dine In', res.orderId, String(res.dbOrderId), 'Preparing');
        clearCart();
        setIsCartModalVisible(false);

        // Immediately navigate to Track Order status screen
        router.push({
          pathname: '/track-order',
          params: {
            orderId: res.orderId,
            dbOrderId: String(res.dbOrderId),
            tableNumber: activeTable,
            orderType: 'Dine In',
            cart: JSON.stringify(formattedCart),
          }
        });
      } else {
        setIsCartModalVisible(false);
        router.push({ pathname: '/checkout' });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Failed to place dine-in order. Please try again.');
    } finally {
      setIsPlacingOrder(false);
    }
  };

  useEffect(() => {
    const fetchMenu = async () => {
        if (!restaurantId) return;
        try {
            // Fetch items first so we know which categories are actually used
            const itemData = await menuApi.getItems(restaurantId);
            const formattedItems = itemData.map((item: any) => ({
                id: item.id,
                name: item.name,
                desc: item.description,
                price: item.price,
                available: item.is_available,
                image: getFullImageUrl(item.image_url, item.name),
                category: item.category_id.toString(),
            }));
            
            const activeCategoryIds = new Set(formattedItems.map((i: any) => i.category));

            const catData = await menuApi.getCategories(restaurantId);
            
            const validRegions = new Set<string>();
            const categoryMap = new Map<string, any>(); // Used to deduplicate by clean label

            catData.forEach((c: any) => {
                const idStr = c.id.toString();
                
                // 1. Skip if this category has no items in the system
                if (!activeCategoryIds.has(idStr)) return;
                
                // 2. Skip internal categories
                if (c.name.includes('_all') || c.name.includes('_breakfast') || c.name.includes('_lunch') || c.name.includes('_dinner')) {
                    return;
                }

                const desc = c.description;
                if (desc && desc !== 'All Menu' && desc !== 'Breakfast' && desc !== 'Lunch' && desc !== 'Dinner') {
                    validRegions.add(desc);
                }
                
                // Remove the restaurant name in parentheses from the category label
                const cleanLabel = c.name.replace(/\s*\(.*\)\s*$/, '').trim();
                
                // Deduplicate: If multiple categories end up with the same clean label, we keep one
                if (!categoryMap.has(cleanLabel)) {
                    categoryMap.set(cleanLabel, { 
                        id: idStr, 
                        label: cleanLabel, 
                        region: desc 
                    });
                }
            });
            
            setAllCategories(Array.from(categoryMap.values()));
            setRegions(["All Regions", ...Array.from(validRegions)]);
            setMenuItems(formattedItems);
        } catch (e) {
            console.error("Error fetching menu data", e);
        }
    };
    fetchMenu();
  }, [restaurantId]);

  const handleIncrement = (id: any, itemObj?: any) => {
    const existing = cart[id] || cart[String(id)] || cart[Number(id)];
    if (existing) {
      incrementQuantity(existing.id);
    } else {
      const item = itemObj || 
        (selectedItem && (String(selectedItem.id) === String(id)) ? selectedItem : null) ||
        menuItems.find(m => String(m.id) === String(id));
      if (item) {
        addItem({ id: item.id, name: item.name, price: item.price, image: item.image, category: item.category, desc: item.desc, quantity: 1 });
      }
    }
  };

  const handleDecrement = (id: any) => {
    const existing = cart[id] || cart[String(id)] || cart[Number(id)];
    if (existing) {
      decrementQuantity(existing.id);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/home')}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Table No */}
        {orderType === "Dine In" && tableNumber ? (
          <View style={styles.tableBadgeContainer}>
            <View style={styles.tableTextContainer}>
              <Text style={styles.tableText}>Table no : </Text>
            </View>
            <View style={styles.tableLine} />
            <View style={styles.tableCircle}>
              <Text style={styles.tableCircleText}>{tableNumber.replace('T-', '')}</Text>
            </View>
          </View>
        ) : null}
      </View>
      
      {/* Logo */}
      <View style={styles.logoContainer}>
        <Image 
          source={require('../../../assets/images/Dataudupi.png')} 
          style={styles.logoImageFull} 
          resizeMode="contain"
        />
      </View>

      {/* Language / Globe Removed */}
    </View>
  );

  const renderMenuItem = ({ item }: { item: any }) => {
    const count = cart[item.id]?.quantity ?? 0;
    
    return (
      <TouchableOpacity activeOpacity={0.9} onPress={() => setSelectedItem(item)} style={styles.card}>
        <View style={styles.imagePlaceholder}>
          <Image source={{ uri: item.image }} style={styles.itemImage} resizeMode="cover" />
        </View>
        <View style={styles.cardContent}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.itemName}>{item.name}</Text>
            <View style={[styles.availBadge, !item.available && styles.unavailBadge]}>
              <View style={[styles.availDot, !item.available && styles.unavailDot]} />
              <Text style={[styles.availText, !item.available && styles.unavailText]}>
                {item.available ? 'Available' : 'Not Available'}
              </Text>
            </View>
          </View>
          
          <View style={styles.cardFooter}>
            <Text style={styles.price}>Rs. <Text style={styles.priceVal}>{item.price}</Text></Text>
            <View style={styles.stepper}>
              <TouchableOpacity 
                style={[styles.stepBtnMinus, (!item.available || count === 0) && styles.stepBtnDisabled]}
                onPress={() => handleDecrement(item.id)}
                disabled={!item.available || count === 0}
              >
                <Ionicons name="remove" size={16} color={(!item.available || count === 0) ? "#ccc" : "#f87171"} />
              </TouchableOpacity>
              <Text style={styles.stepVal}>{count}</Text>
              <TouchableOpacity 
                style={[styles.stepBtnPlus, !item.available && styles.stepBtnDisabled]}
                onPress={() => handleIncrement(item.id)}
                disabled={!item.available}
              >
                <Ionicons name="add" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const filteredItems = menuItems.filter(item => {
    const itemCat = allCategories.find(c => c.id === item.category);
    
    // Region match
    if (activeRegion !== "All Regions") {
      if (itemCat?.region !== activeRegion) return false;
    }
    
    // Category match
    if (activeCat !== "all") {
      if (item.category !== activeCat) return false;
    }
    
    // Search match
    if (searchQuery !== "") {
      if (!item.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    }
    
    // Availability Filter
    if (availabilityFilter === "Available Only") {
      if (!item.available) return false;
    }
    
    return true;
  }).sort((a, b) => {
    if (priceSort === "Low to High") return a.price - b.price;
    if (priceSort === "High to Low") return b.price - a.price;
    return 0; // Default
  });

  const categoriesToShow = [
    { id: "all", label: "All" },
    ...allCategories.filter(cat => activeRegion === "All Regions" || cat.region === activeRegion)
  ];

  const cartItemCount = getItemCount();

  return (
    <SafeAreaView style={styles.safeArea}>
      {renderHeader()}

      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search for food..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
        <TouchableOpacity style={styles.filterBtn} onPress={() => setIsFilterModalVisible(true)}>
          <Ionicons name="options-outline" size={20} color="#666" />
        </TouchableOpacity>
      </View>

      {/* Regions Scroll */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regionScroll}>
          {regions.map(region => (
            <TouchableOpacity 
              key={region} 
              style={[styles.regionTab, activeRegion === region && styles.regionTabActive]}
              onPress={() => {
                setActiveRegion(region);
                setActiveCat("all");
              }}
            >
              <Text style={[styles.regionText, activeRegion === region && styles.regionTextActive]}>{region}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Categories Scroll */}
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
          {categoriesToShow.map(cat => (
            <TouchableOpacity 
              key={cat.id} 
              style={[styles.catTab, activeCat === cat.id && styles.catTabActive]}
              onPress={() => setActiveCat(cat.id)}
            >
              <Text style={[styles.catText, activeCat === cat.id && styles.catTextActive]}>{cat.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {filteredItems.length > 0 ? (
        <FlatList 
          data={filteredItems}
          keyExtractor={i => i.id.toString()}
          numColumns={2}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.gridRow}
          renderItem={renderMenuItem}
          showsVerticalScrollIndicator={false}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Ionicons name="fast-food-outline" size={48} color="#ccc" />
          <Text style={styles.emptyText}>No items found</Text>
        </View>
      )}

      {/* Active Dine-In Session Banner */}
      <DineInActiveBanner bottomOffset={24 + insets.bottom + (cartItemCount > 0 ? 116 : 60)} />

      {/* Floating Buttons */}
      <View style={[styles.floatingContainer, { bottom: 24 + insets.bottom }]}>
        {cartItemCount > 0 && (
          <ViewCartButton />
        )}

        {/* Talk to Chef button */}
        <TouchableOpacity style={styles.talkToChefBtn} onPress={() => showAgent()}>
          <View style={styles.chefIconContainer}>
             <Image source={require('../../../assets/images/chef_mascot.png')} style={styles.talkChefImg} resizeMode="contain" />
          </View>
          <View style={styles.talkChefTextCol}>
            <Text style={styles.talkChefTitle}>Talk to Chef</Text>
            <View style={styles.talkChefSubRow}>
              <Ionicons name="mic-outline" size={12} color="#666" />
              <Text style={styles.talkChefSub}>Tap to speak</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      {/* Cart Modal */}
      <Modal
        visible={isCartModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsCartModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay} 
          activeOpacity={1} 
          onPress={() => setIsCartModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.bottomSheet}>
            <View style={styles.dragHandle} />
            
             <View style={styles.cartHeaderRow}>
              <Text style={styles.cartTitle}>Cart</Text>
              {orderType === "Dine In" && (
                <View style={styles.tableSelector}>
                  <Text style={styles.tableSelectorText}>Table No : {tableNumber.replace('T-', '')}</Text>
                  <Ionicons name="chevron-down" size={14} color="#00a01d" />
                </View>
              )}
            </View>
            <Text style={styles.orderIdText}># Order Status : Pending</Text>

            <View style={styles.orderTypeContainer}>
              <TouchableOpacity 
                style={[styles.orderTypeBtn, orderType === "Dine In" && styles.orderTypeActive]}
                onPress={() => setOrderType("Dine In")}
              >
                <Ionicons name="restaurant-outline" size={16} color={orderType === "Dine In" ? "#fff" : "#ccc"} />
                <Text style={orderType === "Dine In" ? styles.orderTypeActiveText : styles.orderTypeInactiveText}>Dine In</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.orderTypeBtn, orderType === "Take Away" && styles.orderTypeActive]}
                onPress={() => setOrderType("Take Away")}
              >
                <Ionicons name="bag-handle-outline" size={16} color={orderType === "Take Away" ? "#fff" : "#ccc"} />
                <Text style={orderType === "Take Away" ? styles.orderTypeActiveText : styles.orderTypeInactiveText}>Take Away</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.orderTypeBtn, orderType === "Delivery" && styles.orderTypeActive]}
                onPress={() => setOrderType("Delivery")}
              >
                <Ionicons name="bicycle-outline" size={16} color={orderType === "Delivery" ? "#fff" : "#ccc"} />
                <Text style={orderType === "Delivery" ? styles.orderTypeActiveText : styles.orderTypeInactiveText}>Delivery</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.cartItemsScroll} contentContainerStyle={{ paddingTop: 12, paddingRight: 12, paddingLeft: 4, paddingBottom: 12 }} showsVerticalScrollIndicator={false}>
              {Object.values(cart).map((item) => {
                if (!item || item.quantity <= 0) return null;
                const fullItem = menuItems.find(m => m.id === item.id);
                const itemImg = fullItem?.image || 'https://via.placeholder.com/150';
                return (
                  <View key={item.id} style={styles.cartItemCard}>
                    <TouchableOpacity 
                      style={styles.removeBtn} 
                      onPress={() => removeItem(item.id as any)}
                    >
                      <Ionicons name="close" size={14} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.cartItemTop}>
                      <Image source={{ uri: itemImg }} style={styles.cartItemImg} resizeMode="cover" />
                      <View style={styles.cartItemInfo}>
                        <Text style={styles.cartItemName} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.cartItemPrice}>Rs. {item.price}</Text>
                      </View>
                      <View style={styles.cartItemRight}>
                        <View style={styles.stepper}>
                          <TouchableOpacity style={styles.stepBtnMinus} onPress={() => decrementQuantity(item.id as any)}>
                            <Ionicons name="remove" size={16} color="#f87171" />
                          </TouchableOpacity>
                          <Text style={styles.stepVal}>{item.quantity}</Text>
                          <TouchableOpacity style={styles.stepBtnPlus} onPress={() => incrementQuantity(item.id as any)}>
                            <Ionicons name="add" size={16} color="#fff" />
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                    <TextInput 
                      style={styles.instructionInput}
                      placeholder="Please, Just a little bit spicy only...."
                      placeholderTextColor="#999"
                    />
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.placeOrderContainer}>
              {orderType === "Dine In" ? (
                dineInSession.isActive && dineInSession.activeDbOrderId ? (
                  <TouchableOpacity
                    style={styles.placeOrderBtn}
                    onPress={() => handleDineInOrder(true)}
                    disabled={isPlacingOrder}
                    activeOpacity={0.85}
                  >
                    {isPlacingOrder ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.placeOrderText}>
                        Add to Table Order (#{dineInSession.activeOrderId})
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={styles.placeOrderBtn}
                      onPress={() => handleDineInOrder(true)}
                      disabled={isPlacingOrder}
                      activeOpacity={0.85}
                    >
                      {isPlacingOrder ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.placeOrderText}>
                          Order Now (Pay at End of Meal)
                        </Text>
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.payNowSecondaryBtn}
                      onPress={() => {
                        setIsCartModalVisible(false);
                        router.push({ pathname: '/checkout' });
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.payNowSecondaryText}>or Pay Now via Checkout ›</Text>
                    </TouchableOpacity>
                  </>
                )
              ) : (
                <TouchableOpacity
                  style={styles.placeOrderBtn}
                  onPress={() => {
                    setIsCartModalVisible(false);
                    router.push({ pathname: '/checkout' });
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.placeOrderText}>Place Order</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Item Details Modal */}
      <Modal
        visible={!!selectedItem}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedItem(null)}
      >
        <TouchableOpacity 
          style={styles.itemModalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedItem(null)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.itemModalContent}>
            {selectedItem && (
              <>
                <View style={styles.itemModalHero}>
                  <Image source={{ uri: selectedItem.image }} style={styles.itemModalImg} resizeMode="cover" />
                </View>
                
                {(() => {
                  const isAvail = selectedItem.available !== false;
                  const itemQty = cart[selectedItem.id]?.quantity ?? cart[String(selectedItem.id)]?.quantity ?? 0;

                  return (
                    <>
                      <ScrollView contentContainerStyle={styles.itemModalBody}>
                        <View style={[styles.availBadge, !isAvail && styles.unavailBadge, { alignSelf: 'flex-start', marginBottom: 8 }]}>
                          <View style={[styles.availDot, !isAvail && styles.unavailDot]} />
                          <Text style={[styles.availText, !isAvail && styles.unavailText]}>
                            {isAvail ? 'Available' : 'Not Available'}
                          </Text>
                        </View>
                        <Text style={styles.itemModalTitle}>{selectedItem.name}</Text>
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#ff4500', marginBottom: 8 }}>Rs. {selectedItem.price}</Text>
                        {selectedItem.desc ? <Text style={styles.itemModalDesc}>{selectedItem.desc}</Text> : null}
                      </ScrollView>

                      <View style={[styles.itemModalFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                        <View style={styles.modalStepper}>
                          <TouchableOpacity 
                            style={[styles.modalStepBtnMinus, (!isAvail || itemQty === 0) && styles.stepBtnDisabled]}
                            onPress={() => handleDecrement(selectedItem.id)}
                            disabled={!isAvail || itemQty === 0}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="remove" size={20} color={(!isAvail || itemQty === 0) ? "#ccc" : "#f87171"} />
                          </TouchableOpacity>
                          <Text style={styles.modalStepVal}>{itemQty}</Text>
                          <TouchableOpacity 
                            style={[styles.modalStepBtnPlus, !isAvail && styles.stepBtnDisabled]}
                            onPress={() => handleIncrement(selectedItem.id, selectedItem)}
                            disabled={!isAvail}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="add" size={20} color="#fff" />
                          </TouchableOpacity>
                        </View>
                        
                        <TouchableOpacity 
                          style={[styles.itemModalAddBtn, !isAvail && { backgroundColor: '#ccc' }]} 
                          onPress={() => {
                            if (!isAvail) return;
                            handleIncrement(selectedItem.id, selectedItem);
                            setSelectedItem(null);
                          }}
                          disabled={!isAvail}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.itemModalAddText}>Add Item <Ionicons name="add" size={16} color="#fff" /></Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  );
                })()}
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Filter Popover/Modal */}
      <Modal
        visible={isFilterModalVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsFilterModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.popoverOverlay} 
          activeOpacity={1} 
          onPress={() => setIsFilterModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.popoverContent, { top: insets.top + 120 }]}>
            
            <Text style={styles.filterSectionTitle}>FILTER</Text>
            <TouchableOpacity 
              style={[styles.filterOptionBtn, availabilityFilter === "All Items" && styles.filterOptionActive]}
              onPress={() => { setAvailabilityFilter("All Items"); setIsFilterModalVisible(false); }}
            >
              <Text style={[styles.filterOptionText, availabilityFilter === "All Items" && styles.filterOptionTextActive]}>All Items</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.filterOptionBtn, availabilityFilter === "Available Only" && styles.filterOptionActive]}
              onPress={() => { setAvailabilityFilter("Available Only"); setIsFilterModalVisible(false); }}
            >
              <Text style={[styles.filterOptionText, availabilityFilter === "Available Only" && styles.filterOptionTextActive]}>Available Only</Text>
            </TouchableOpacity>
            
            <View style={styles.filterDivider} />
            
            <Text style={styles.filterSectionTitle}>SORT BY PRICE</Text>
            <TouchableOpacity 
              style={[styles.filterOptionBtn, priceSort === "Default" && styles.filterOptionActive]}
              onPress={() => { setPriceSort("Default"); setIsFilterModalVisible(false); }}
            >
              <Text style={[styles.filterOptionText, priceSort === "Default" && styles.filterOptionTextActive]}>Default</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.filterOptionBtn, priceSort === "Low to High" && styles.filterOptionActive]}
              onPress={() => { setPriceSort("Low to High"); setIsFilterModalVisible(false); }}
            >
              <Text style={[styles.filterOptionText, priceSort === "Low to High" && styles.filterOptionTextActive]}>Low to High</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.filterOptionBtn, priceSort === "High to Low" && styles.filterOptionActive]}
              onPress={() => { setPriceSort("High to Low"); setIsFilterModalVisible(false); }}
            >
              <Text style={[styles.filterOptionText, priceSort === "High to Low" && styles.filterOptionTextActive]}>High to Low</Text>
            </TouchableOpacity>
            
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fcfcfc' },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    backgroundColor: '#222',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  backBtn: {
    padding: 8,
    marginRight: -4,
  },
  homeBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  tableBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tableTextContainer: {
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dfdfdf',
  },
  tableText: { fontSize: 10, fontWeight: '600', color: '#000' },
  tableLine: {
    width: 10,
    height: 2,
    backgroundColor: '#fff',
  },
  tableCircle: {
    backgroundColor: '#ff3400',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  tableCircleText: { color: '#fff', fontSize: 16, fontWeight: 'bold', fontFamily: 'serif' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' },
  logoImageFull: { width: 140, height: 36, resizeMode: 'contain' },
  globeIcon: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 12, color: '#333' },
  filterBtn: {
    width: 40, height: 40,
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  regionScroll: { paddingHorizontal: 16, gap: 12, paddingBottom: 12 },
  regionTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dfdfdf',
  },
  regionTabActive: { backgroundColor: '#00a01d', borderColor: '#00a01d' },
  regionText: { fontSize: 13, color: '#333', fontWeight: '600' },
  regionTextActive: { color: '#fff' },
  
  catScroll: { paddingHorizontal: 16, gap: 12, paddingBottom: 8 },
  catTab: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#dfdfdf',
  },
  catTabActive: { backgroundColor: '#ff5a1f', borderColor: '#ff5a1f' },
  catText: { fontSize: 12, color: '#555', fontWeight: '500' },
  catTextActive: { color: '#fff', fontWeight: 'bold' },
  gridContainer: { paddingHorizontal: 16, paddingBottom: 100, paddingTop: 8 },
  gridRow: { justifyContent: 'space-between', marginBottom: 12 },
  card: {
    width: '48%',
    backgroundColor: '#fcfcfc',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    overflow: 'hidden',
  },
  imagePlaceholder: {
    height: 120,
    width: '100%',
    backgroundColor: '#e0e0e0',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  cardContent: { padding: 12 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  itemName: { fontSize: 12, fontWeight: 'bold', color: '#000', flex: 1, marginRight: 4 },
  availBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#00a01d', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10 },
  unavailBadge: { backgroundColor: '#ff0000' },
  availDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', marginRight: 4 },
  unavailDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff', marginRight: 4 },
  availText: { fontSize: 10, fontWeight: '500', color: '#fff' },
  unavailText: { color: '#fff' },
  itemDesc: { fontSize: 10, color: '#777', marginBottom: 12, lineHeight: 14 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  price: { fontSize: 10, color: '#777' },
  priceVal: { fontSize: 12, fontWeight: 'bold', color: '#000' },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f9f9f9', borderRadius: 4, borderWidth: 1, borderColor: '#f4f4f4', padding: 2 },
  stepBtnMinus: { backgroundColor: '#f2f2f2', padding: 2, borderRadius: 2 },
  stepBtnPlus: { backgroundColor: '#ff3400', padding: 2, borderRadius: 2 },
  stepBtnDisabled: { opacity: 0.5 },
  stepVal: { fontSize: 12, color: '#000', width: 24, textAlign: 'center' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', paddingTop: 64 },
  emptyText: { color: '#777', fontSize: 14, marginTop: 12 },
  floatingContainer: {
    position: 'absolute',
    bottom: 24,
    right: 16,
    alignItems: 'flex-end',
    gap: 12,
  },
  talkToChefBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    gap: 12,
    borderWidth: 1,
    borderColor: '#eee',
    marginTop: 12,
  },
  chefIconContainer: {
    width: 36,
    height: 36,
    backgroundColor: '#f5f5f5',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  talkChefImg: {
    width: 28,
    height: 28,
  },
  talkChefTextCol: {
    justifyContent: 'center',
  },
  talkChefTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
  },
  talkChefSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  talkChefSub: {
    fontSize: 10,
    color: '#666',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  cartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cartTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000',
  },
  tableSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tableSelectorText: {
    color: '#00a01d',
    fontWeight: 'bold',
    fontSize: 14,
  },
  orderIdText: {
    color: '#777',
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
  },
  orderTypeContainer: {
    flexDirection: 'row',
    backgroundColor: '#fcfcfc',
    borderRadius: 8,
    padding: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  orderTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
    gap: 8,
  },
  orderTypeActive: {
    backgroundColor: '#ff3400',
  },
  orderTypeActiveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  orderTypeInactiveText: {
    color: '#ccc',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cartItemsScroll: {
    marginBottom: 16,
  },
  cartItemCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    padding: 12,
    marginBottom: 12,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  removeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    zIndex: 10,
    backgroundColor: '#000',
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cartItemTop: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  cartItemImg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 12,
  },
  cartItemInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  cartItemServes: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
  },
  cartItemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  cartItemRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  cartItemTotalLabel: {
    fontSize: 10,
    color: '#999',
  },
  cartItemTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ff3400',
  },
  cartItemTax: {
    fontSize: 8,
    color: '#000',
    fontWeight: 'bold',
  },
  instructionInput: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#333',
  },
  placeOrderContainer: {
    paddingTop: 12,
  },
  placeOrderBtn: {
    backgroundColor: '#00a01d',
    borderRadius: 24,
    paddingVertical: 14,
    alignItems: 'center',
  },
  placeOrderText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  payNowSecondaryBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  payNowSecondaryText: {
    color: '#666',
    fontSize: 13,
    fontWeight: '600',
  },
  itemModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  itemModalContent: {
    backgroundColor: '#fff',
    borderRadius: 24,
    overflow: 'hidden',
    maxHeight: '85%',
    width: '100%',
  },
  itemModalHero: {
    width: '100%',
    height: 250,
    position: 'relative',
  },
  itemModalImg: {
    width: '100%',
    height: '100%',
  },
  itemModalClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemModalBody: {
    padding: 20,
  },
  itemModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 8,
  },
  itemModalDesc: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  itemModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
  },
  itemModalAddBtn: {
    backgroundColor: '#ff3400', // Application's primary orange tone
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    flex: 1,
    marginLeft: 16,
    justifyContent: 'center',
  },
  itemModalAddPrice: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#fff',
  },
  itemModalAddText: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#fff',
  },
  modalStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#f4f4f4',
    padding: 4,
  },
  modalStepBtnMinus: {
    backgroundColor: '#f2f2f2',
    padding: 8,
    borderRadius: 6,
  },
  modalStepBtnPlus: {
    backgroundColor: '#ff3400',
    padding: 8,
    borderRadius: 6,
  },
  modalStepVal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#000',
    width: 32,
    textAlign: 'center',
  },
  popoverOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-start',
  },
  popoverContent: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  filterSectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#888',
    marginBottom: 8,
    marginTop: 8,
  },
  filterOptionBtn: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
  },
  filterOptionActive: {
    backgroundColor: '#f9f9f9',
  },
  filterOptionText: {
    fontSize: 14,
    color: '#333',
  },
  filterOptionTextActive: {
    color: '#00a01d',
    fontWeight: 'bold',
  },
  filterDivider: {
    height: 1,
    backgroundColor: '#eee',
    marginVertical: 8,
  }
});

