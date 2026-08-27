import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, FlatList, Platform, StatusBar, Image, Modal, BackHandler } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { menuApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import { useRestaurantStore } from '../../store';
import { useCartStore } from '../../store/useCartStore';

export default function App() {
  const router = useRouter();
  const params = useLocalSearchParams<{ orderType?: string; tableNumber?: string; categoryId?: string }>();
  const insets = useSafeAreaInsets();
  const { items: cart, addItem, removeItem, incrementQuantity, decrementQuantity, orderType, setOrderType, tableNumber, setTableNumber, getItemCount, getSubtotal } = useCartStore();
  
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
    const initialOrderType = (params.orderType as string) || "Dine In";
    const mappedOrderType = initialOrderType === "Takeaway" ? "Take Away" : (initialOrderType === "Dine-in" ? "Dine In" : initialOrderType) as "Dine In" | "Take Away";
    if (mappedOrderType) setOrderType(mappedOrderType);
    if (params.tableNumber) setTableNumber(params.tableNumber as string);
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
  const [availabilityFilter, setAvailabilityFilter] = useState("All Items");
  const [priceSort, setPriceSort] = useState("Default");
  
  const { selectedOutlet } = useRestaurantStore();
  const restaurantId = selectedOutlet?.restaurant_id || 1;

  useEffect(() => {
    const fetchMenu = async () => {
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

  const handleIncrement = (id: number) => {
    if (!cart[id]) {
      const item = menuItems.find(m => m.id === id);
      if (item) {
        addItem({ id: item.id, name: item.name, price: item.price, image: item.image, category: item.category, desc: item.desc, quantity: 1 });
      }
    } else {
      incrementQuantity(id);
    }
  };

  const handleDecrement = (id: number) => {
    if (cart[id]) {
      decrementQuantity(id);
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/home')}>
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>

        {/* Table No */}
        {orderType === "Dine In" && (
          <View style={styles.tableBadge}>
            <Text style={styles.tableText}>Table no : </Text>
            <View style={styles.tableCircle}>
              <Text style={styles.tableCircleText}>{tableNumber.replace('T-', '')}</Text>
            </View>
          </View>
        )}
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

      {/* Floating Buttons */}
      <View style={[styles.floatingContainer, { bottom: 24 + insets.bottom }]}>
        {cartItemCount > 0 && (
          <TouchableOpacity style={styles.viewCartBtn} onPress={() => setIsCartModalVisible(true)}>
            <Ionicons name="cart-outline" size={18} color="#fff" />
            <Text style={styles.viewCartText}>View Cart</Text>
            <View style={styles.viewCartBadge}>
              <Text style={styles.viewCartBadgeText}>{cartItemCount}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Talk to Chef button removed */}
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
                      onPress={() => removeItem(item.id)}
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
                          <TouchableOpacity style={styles.stepBtnMinus} onPress={() => handleDecrement(item.id)}>
                            <Ionicons name="remove" size={16} color="#f87171" />
                          </TouchableOpacity>
                          <Text style={styles.stepVal}>{item.quantity}</Text>
                          <TouchableOpacity style={styles.stepBtnPlus} onPress={() => handleIncrement(item.id)}>
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
              <TouchableOpacity style={styles.placeOrderBtn} onPress={() => {
                 setIsCartModalVisible(false);
                 router.push({ pathname: '/checkout' });
              }}>
                <Text style={styles.placeOrderText}>Place Order</Text>
              </TouchableOpacity>
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
                
                <ScrollView contentContainerStyle={styles.itemModalBody}>
                  <View style={[styles.availBadge, !selectedItem.available && styles.unavailBadge, { alignSelf: 'flex-start', marginBottom: 8 }]}>
                    <View style={[styles.availDot, !selectedItem.available && styles.unavailDot]} />
                  </View>
                  <Text style={styles.itemModalTitle}>{selectedItem.name}</Text>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#ff4500', marginBottom: 8 }}>Rs. {selectedItem.price}</Text>
                  {selectedItem.desc ? <Text style={styles.itemModalDesc}>{selectedItem.desc}</Text> : null}
                </ScrollView>

                <View style={[styles.itemModalFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                  <View style={styles.modalStepper}>
                    <TouchableOpacity 
                      style={[styles.modalStepBtnMinus, (!selectedItem.available || (cart[selectedItem.id]?.quantity ?? 0) === 0) && styles.stepBtnDisabled]}
                      onPress={() => handleDecrement(selectedItem.id)}
                      disabled={!selectedItem.available || (cart[selectedItem.id]?.quantity ?? 0) === 0}
                    >
                      <Ionicons name="remove" size={20} color={(!selectedItem.available || (cart[selectedItem.id]?.quantity ?? 0) === 0) ? "#ccc" : "#f87171"} />
                    </TouchableOpacity>
                    <Text style={styles.modalStepVal}>{cart[selectedItem.id]?.quantity ?? 0}</Text>
                    <TouchableOpacity 
                      style={[styles.modalStepBtnPlus, !selectedItem.available && styles.stepBtnDisabled]}
                      onPress={() => handleIncrement(selectedItem.id)}
                      disabled={!selectedItem.available}
                    >
                      <Ionicons name="add" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  
                  <TouchableOpacity 
                    style={styles.itemModalAddBtn} 
                    onPress={() => handleIncrement(selectedItem.id)}
                    disabled={!selectedItem.available}
                  >
                    <Text style={styles.itemModalAddText}>Add Item <Ionicons name="add" size={16} color="#fff" /></Text>
                  </TouchableOpacity>
                </View>
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
  tableBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingLeft: 10,
    paddingRight: 2,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: '#dfdfdf'
  },
  tableText: { fontSize: 10, fontWeight: '600', color: '#000' },
  tableCircle: {
    backgroundColor: '#ff3400',
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#dfdfdf',
    marginLeft: 4,
  },
  tableCircleText: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
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
  viewCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#00a01d',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
    gap: 8,
  },
  viewCartText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  viewCartBadge: {
    backgroundColor: '#32d366',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  viewCartBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
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

