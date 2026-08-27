import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Image, ImageBackground, Platform, StatusBar, Alert, Modal, ActivityIndicator, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { customerApi, menuApi, tableApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useCartStore } from '../../store/useCartStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useRestaurantStore } from '../../store';

export default function Home() {
  const router = useRouter();
  const { phone } = useAuthStore();
  const { selectedOutlet } = useRestaurantStore();
  const scrollRef = useRef<ScrollView>(null);
  const slideIndex = useRef(0);
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const insets = useSafeAreaInsets();
  const { items: cart, addItem, incrementQuantity, decrementQuantity } = useCartStore();

  const handleIncrement = (itemId: string) => {
    const item = popularDishes.find(i => i.id === itemId);
    if (!item) return;
    if (cart[itemId]) {
      incrementQuantity(itemId);
    } else {
      addItem({
        id: item.id,
        name: item.name,
        price: item.price,
        image: item.image,
        quantity: 1,
        category: 'Popular',
        desc: item.desc
      });
    }
  };

  const handleDecrement = (itemId: string) => {
    decrementQuantity(itemId);
  };

  useEffect(() => {
    useCartStore.getState().removeDiscount();
  }, []);

  const [baseOffersList] = useState(() => {
    const isWeekend = new Date().getDay() === 0 || new Date().getDay() === 6;
    const base = [
      { id: '1', discount: '30% OFF', subtitle: 'On Your First Order', color: '#ff4500' },
      { id: '2', discount: '5% OFF', subtitle: 'On 5th Day (5 Days Continuous Orders)', color: '#4CAF50' },
    ];
    if (isWeekend) {
      base.push({ id: '3', discount: '5% OFF', subtitle: 'On Weekends', color: '#9C27B0' });
    } else {
      base.push({ id: '4', discount: '10% OFF', subtitle: 'On Weekdays', color: '#2196F3' });
    }
    return base;
  });

  const [usedOffers, setUsedOffers] = useState<string[]>([]);

  const offersList = React.useMemo(() => {
    const filteredBase = baseOffersList.filter(o => !usedOffers.includes(o.discount));
    if (filteredBase.length === 0) return [];
    // Duplicate items to simulate infinite scroll without rewinding
    return Array(50).fill(filteredBase).flat().map((o, i) => ({ ...o, uniqueId: `off-${i}` }));
  }, [baseOffersList, usedOffers]);

  useEffect(() => {
    const interval = setInterval(() => {
      slideIndex.current += 1;
      if (slideIndex.current >= offersList.length - 1) {
        slideIndex.current = 1;
        scrollRef.current?.scrollTo({ x: 335, animated: false });
        return;
      }
      scrollRef.current?.scrollTo({ x: slideIndex.current * 335, animated: true });
    }, 5000);

    return () => clearInterval(interval);
  }, [offersList.length]);
  const [activeTab, setActiveTab] = useState('Dine-in');
  const [popularDishes, setPopularDishes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedBranchName, setSelectedBranchName] = useState('Koramangala, Bangalore');

  const [tableNumber, setTableNumber] = useState<string | null>(null);
  const [tableStatus, setTableStatus] = useState<string | null>(null);
  const [isScannerVisible, setIsScannerVisible] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [isVerifyingTable, setIsVerifyingTable] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [mockTableNumber, setMockTableNumber] = useState('T-01');

  const [customAlert, setCustomAlert] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: 'success' | 'error' | 'info';
    buttons?: { text: string; onPress?: () => void; style?: 'cancel' | 'default' }[];
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info'
  });

  const showPopup = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'info',
    onConfirm?: () => void,
    buttons?: { text: string; onPress?: () => void; style?: 'cancel' | 'default' }[]
  ) => {
    setCustomAlert({
      visible: true,
      title,
      message,
      type,
      buttons: buttons || (onConfirm ? [{ text: 'Continue', onPress: onConfirm }] : [{ text: 'Continue' }])
    });
  };

  useEffect(() => {
    const loadSavedTable = async () => {
      try {
        let saved = null;
        try {
          saved = await AsyncStorage.getItem('dineInTable');
        } catch (e) {
          // suppressed AsyncStorage warning
        }
        if (!saved) {
          try {
            if (typeof localStorage !== 'undefined') {
              saved = localStorage.getItem('dineInTable');
            }
          } catch (e) { }
        }
        if (!saved) {
          saved = (global as any).dineInTable || null;
        }
        if (saved) {
          setTableNumber(saved);
          let restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : 1;
          tableApi.verifyTable(saved, restId)
            .then(data => {
               if (data.valid && data.table) {
                  setTableStatus(data.table.status);
               }
            })
            .catch(() => {});
        }
      } catch (e) {
        console.warn("Failed to load saved table number:", e);
      }
    };
    loadSavedTable();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Retrieve selected restaurant ID
        let restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : 1;

        if (selectedOutlet?.name) {
          const cleanName = selectedOutlet.name.replace(/^Data Udipi\s*—\s*/i, '');
          setSelectedBranchName(cleanName);
        }

        // Fetch popular dishes
        const itemData = await menuApi.getItems(restId);
        const formattedItems = itemData.slice(0, 5).map((item: any) => ({
          id: item.id,
          name: item.name,
          desc: item.description,
          price: item.price,
          available: item.is_available ?? true,
          image: getFullImageUrl(item.image_url, item.name),
        }));
        setPopularDishes(formattedItems);

        // Fetch categories
        const catData = await menuApi.getCategories(restId);
        const categoryImageMap: Record<string, any> = {
          'breakfast & dinner': require('../../../assets/images/categories/breakfast_dinner.jpg'),
          'dosa varieties': require('../../../assets/images/categories/dosa_varieties.jpg'),
          'evening snacks': require('../../../assets/images/categories/evening_snacks.jpg'),
          'hot beverages': require('../../../assets/images/categories/hot_beverages.jpg'),
          'lunch': require('../../../assets/images/categories/lunch.jpg'),
          'noodles': { uri: 'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=500&auto=format&fit=crop&q=80' },
          'rice varieties': require('../../../assets/images/categories/rice_varieties.jpg'),
          'salad': require('../../../assets/images/categories/salad.jpg'),
          'soups': require('../../../assets/images/categories/soups.jpg'),
          'tandoori breads': require('../../../assets/images/categories/tandoori_breads.jpg'),
          'tandoori side dishes': require('../../../assets/images/categories/tandoori_side_dishes.jpg'),
          'tandoori starters': require('../../../assets/images/categories/tandoori_starters.jpg'),
          'raitha': require('../../../assets/images/categories/raitha.jpg'),
        };
        const getCategoryImage = (name: string) => {
          // Remove things like (MGR Nagar) and standardize typos like 'varities'
          const normalized = name.toLowerCase().replace(/\s*\(.*?\)\s*/g, '').replace('varities', 'varieties').trim();
          return categoryImageMap[normalized] || { uri: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80' };
        };
        const getCategoryDisplayName = (c: any) => {
          if (c.description === 'South Indian' || c.description === 'North Indian') {
            // Strip the (MGR Nagar) or (Mugalivakkam) for a cleaner customer UI
            return c.name.replace(/\s*\(.*?\)\s*/g, '').trim();
          }
          if (c.name.startsWith('mugalivakkam_') || c.name.startsWith('mgrnagar_')) {
            return c.description || c.name;
          }
          return c.name;
        };

        const branchSuffix = selectedOutlet?.name ? selectedOutlet.name.replace(/^Data Udipi\s*[-—]\s*/i, '').trim() : '';

        const formattedCats = catData
          .filter((c: any) => {
            if (c.name.toLowerCase() === 'all') return false;
            // Only show categories that belong to the current branch to hide unwanted/legacy ones
            if (branchSuffix && !c.name.includes(branchSuffix)) return false;
            return true;
          })
          .map((c: any) => ({
            id: c.id,
            name: getCategoryDisplayName(c),
            image: getCategoryImage(c.name)
          }));
        setCategories(formattedCats);

        // Fetch user profile to get used offers
        if (phone) {
          try {
            const profileData = await customerApi.getProfile(phone);
            if (profileData.used_offers) {
              setUsedOffers(profileData.used_offers);
            }
          } catch (e) {
            // Silently ignore if profile is not found or fails
          }
        }
      } catch (e) {
        console.error('Error fetching home screen data', e);
      }
    };
    fetchData();
  }, []);

  const verifyTableAndEnter = async (tableNum: string) => {
    if (!tableNum.trim()) return;
    setIsVerifyingTable(true);
    try {
      const cleanTableNum = tableNum.trim();
      let restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : 1;
      
      let tableStatus = "Vacant";
      let isTableActive = true;
      
      // Verify table against the backend
      const data = await tableApi.verifyTable(cleanTableNum, restId);
      if (!data.valid) {
         showPopup("Invalid Table", data.message || "This table doesn't belong to the selected restaurant.", "error");
         setScanned(false);
         setIsVerifyingTable(false);
         return;
      }
      tableStatus = data.table.status;
      isTableActive = data.table.is_active;
      
      if (isTableActive === false) {
         showPopup("Table Inactive", "This table is currently marked as inactive and cannot be used.", "error");
         setScanned(false);
         setIsVerifyingTable(false);
         return;
      }
      let saved = false;
      try {
        await AsyncStorage.setItem('dineInTable', cleanTableNum);
        saved = true;
      } catch (e) {
        console.warn("AsyncStorage.setItem failed, using fallback:", e);
      }
      if (!saved) {
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('dineInTable', cleanTableNum);
            saved = true;
          }
        } catch (e) {
          console.warn("localStorage.setItem failed:", e);
        }
      }
      if (!saved) {
        (global as any).dineInTable = cleanTableNum;
      }

      setTableNumber(cleanTableNum);
      setTableStatus(tableStatus);
      setIsScannerVisible(false);
      setScanned(false);

      showPopup(
        "Welcome!",
        `You are checked into Table ${cleanTableNum.replace('T-', '')}. Status: ${tableStatus}. Enjoy your meal!`,
        "success",
        () => {
          router.push({
            pathname: '/menu',
            params: {
              orderType: 'Dine In',
              tableNumber: cleanTableNum
            }
          });
        }
      );
    } catch (error) {
      console.error("Error verifying table:", error);
      showPopup("Error", "Something went wrong verifying the table. Please try again.", "error");
      setScanned(false);
    } finally {
      setIsVerifyingTable(false);
    }
  };

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (scanned || isVerifyingTable) return;
    setScanned(true);

    let tableNum = data;
    if (data.includes('?table=')) {
      const match = data.match(/\?table=([^&]+)/);
      if (match) {
        tableNum = match[1];
      }
    }
    verifyTableAndEnter(tableNum);
  };

  const handleCloseScanner = () => {
    setIsScannerVisible(false);
    setScanned(false);
  };

  const handleDineInPress = async () => {
    // Request permission on all platforms (including web)
    if (!permission || !permission.granted) {
      try {
        const status = await requestPermission();
        if (!status.granted) {
          showPopup("Permission Denied", "Camera permission is required to scan table QR codes. Showing test panel instead.", "info", () => {
            setIsScannerVisible(true);
          });
          return;
        }
      } catch (e) {
        console.warn("Failed to request camera permission:", e);
        setIsScannerVisible(true);
        return;
      }
    }
    setIsScannerVisible(true);
  };

  const handleClearTable = async () => {
    try {
      // Backend does not have a /vacate endpoint for customers.
      // We clear the table locally only.

      try {
        await AsyncStorage.removeItem('dineInTable');
      } catch (e) { }
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('dineInTable');
        }
      } catch (e) { }
    delete (global as any).dineInTable;
    setTableNumber(null);
    setTableStatus(null);
    showPopup("Table Cleared", "You have left the table.", "info");
    } catch (e) {
      console.warn("Failed to clear table:", e);
    }
  };

  const handleSearchFocus = () => {
    if (activeTab === 'Dine-in' && !tableNumber) {
      showPopup(
        "Scan QR Code",
        "Please scan the QR code on your table to view menu and order.",
        "info",
        undefined,
        [
          { text: "Scan QR", onPress: handleDineInPress },
          { text: "Cancel", style: "cancel" }
        ]
      );
      return;
    }
    router.push({
      pathname: '/menu',
      params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '' }
    });
  };

  const handleOrderNow = () => {
    if (activeTab === 'Dine-in' && !tableNumber) {
      showPopup(
        "Scan QR Code",
        "Please scan the QR code on your table to view menu and order.",
        "info",
        undefined,
        [
          { text: "Scan QR", onPress: handleDineInPress },
          { text: "Cancel", style: "cancel" }
        ]
      );
      return;
    }
    router.push({
      pathname: '/menu',
      params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '' }
    });
  };

  const handleCategoryPress = (catId: number) => {
    if (activeTab === 'Dine-in' && !tableNumber) {
      showPopup(
        "Scan QR Code",
        "Please scan the QR code on your table to view menu and order.",
        "info",
        undefined,
        [
          { text: "Scan QR", onPress: handleDineInPress },
          { text: "Cancel", style: "cancel" }
        ]
      );
      return;
    }
    router.push({
      pathname: '/menu',
      params: {
        orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab,
        tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '',
        categoryId: catId.toString()
      }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#fff' />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/')}>
            <Image source={require('../../../assets/images/Dataudupi-Title.jpg')} style={styles.logo} resizeMode='contain' />
          </TouchableOpacity>
          <TouchableOpacity style={styles.profileBtn} onPress={() => router.push('/profile')}>
            <View style={[styles.profileImg, { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }]}>
              <Ionicons name="person" size={24} color="#aaa" />
            </View>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.locationContainer}
          onPress={() => router.push('/outlet-selector')}
          activeOpacity={0.7}
        >
          <Ionicons name='location' size={16} color='#ff4500' />
          <Text style={styles.locationText}>{selectedBranchName}</Text>
          <Ionicons name='chevron-down' size={16} color='#000' />
        </TouchableOpacity>

        {/* Search */}
        <View style={styles.searchBar}>
          <Ionicons name='search' size={20} color='#888' />
          <TextInput
            placeholder='Search crispy dosa, soft idli, filter coffee...'
            style={styles.searchInput}
            placeholderTextColor='#888'
            onFocus={handleSearchFocus}
          />
        </View>

        {/* Banner Carousel */}
        <View style={styles.carouselWrapper}>
          {offersList.length > 0 && (
            <ScrollView
              ref={scrollRef}
              horizontal
              snapToInterval={335}
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              style={styles.carouselContainer}
            >
              {offersList.map((offer) => (
                <View key={offer.uniqueId} style={styles.carouselSlide}>
                  <ImageBackground
                    source={require('../../../assets/images/banner_bg.jpg')}
                    style={styles.banner}
                    imageStyle={styles.bannerImage}
                    resizeMode="cover"
                  >
                    <View style={[styles.bannerOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.55)' }]}>
                      <Text style={[styles.bannerDiscount, { color: offer.color }]}>{offer.discount}</Text>
                      <Text style={styles.bannerSubtitle}>{offer.subtitle}</Text>
                      <TouchableOpacity style={[styles.orderNowBtn, { backgroundColor: offer.color }]} onPress={async () => {
                        showPopup(
                          "Congratulations! 🎉",
                          `You've selected the ${offer.discount} offer.`,
                          "success",
                          async () => {
                            if (activeTab === 'Dine-in' && !tableNumber) {
                              showPopup("Scan QR Code", "Please scan the QR code on your table to order.", "info", undefined, [
                                {
                                  text: "Scan QR", onPress: async () => {
                                    useCartStore.getState().applyDiscount(offer.discount);
                                    handleDineInPress();
                                  }
                                },
                                { text: "Cancel", style: "cancel" }
                              ]);
                              return;
                            }
                            useCartStore.getState().applyDiscount(offer.discount);
                            router.push({
                              pathname: '/menu',
                              params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '' }
                            });
                          }
                        );
                      }}>
                        <Text style={styles.orderNowText}>Order Now</Text>
                      </TouchableOpacity>
                    </View>
                  </ImageBackground>
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Dine-in / Takeaway / Delivery Tabs */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'Dine-in' && styles.activeTabBtn]}
            onPress={() => {
              setActiveTab('Dine-in');
              if (!tableNumber) {
                handleDineInPress();
              }
            }}
          >
            <Text style={[styles.tabText, activeTab === 'Dine-in' && styles.activeTabText]}>Dine-in</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'Takeaway' && styles.activeTabBtn]}
            onPress={() => setActiveTab('Takeaway')}
          >
            <Text style={[styles.tabText, activeTab === 'Takeaway' && styles.activeTabText]}>Takeaway</Text>
          </TouchableOpacity>
        </View>

        {/* Table Status Card for Dine-in */}
        {activeTab === 'Dine-in' && (
          <View style={styles.tableStatusCard}>
            {tableNumber ? (
              <View style={styles.tableStatusRow}>
                <View style={styles.tableStatusLeft}>
                  <Ionicons name="restaurant" size={20} color="#ff4500" />
                  <Text style={styles.tableStatusText}>
                    Seated at Table <Text style={{ fontWeight: 'bold', color: '#ff4500' }}>{tableNumber.replace('T-', '')}</Text>
                    {tableStatus ? <Text style={{ color: tableStatus.toLowerCase() === 'vacant' ? '#4CAF50' : '#ff4500' }}> ({tableStatus})</Text> : null}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity style={styles.tableActionBtn} onPress={handleDineInPress}>
                    <Text style={styles.tableActionText}>Change</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.tableActionBtn, { backgroundColor: '#ffe5e0' }]} onPress={handleClearTable}>
                    <Text style={[styles.tableActionText, { color: '#ff4500' }]}>Leave</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.tableStatusRow}>
                <View style={styles.tableStatusLeft}>
                  <Ionicons name="qr-code-outline" size={20} color="#666" />
                  <Text style={[styles.tableStatusText, { color: '#666' }]}>Scan table QR code to start</Text>
                </View>
                <TouchableOpacity style={[styles.tableActionBtn, { backgroundColor: '#ff4500' }]} onPress={handleDineInPress}>
                  <Text style={[styles.tableActionText, { color: '#fff' }]}>Scan QR</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Categories */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Explore Categories</Text>
          <TouchableOpacity onPress={() => {
            if (activeTab === 'Dine-in' && !tableNumber) {
              showPopup("Scan QR Code", "Please scan the QR code on your table to view menu and order.", "info", undefined, [
                { text: "Scan QR", onPress: handleDineInPress },
                { text: "Cancel", style: "cancel" }
              ]);
              return;
            }
            router.push({
              pathname: '/menu',
              params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '' }
            });
          }}>
            <Text style={[styles.seeAllText, { color: '#ff4500' }]}>For You ✨</Text>
          </TouchableOpacity>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoriesScroll}>
          {categories.map(cat => (
            <TouchableOpacity
              key={cat.id}
              style={styles.categoryItem}
              onPress={() => {
                if (activeTab === 'Dine-in' && !tableNumber) {
                  showPopup("Scan QR Code", "Please scan the QR code on your table to view menu and order.", "info", undefined, [
                    { text: "Scan QR", onPress: handleDineInPress },
                    { text: "Cancel", style: "cancel" }
                  ]);
                  return;
                }
                router.push({
                  pathname: '/menu',
                  params: {
                    orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab,
                    tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '',
                    categoryId: cat.id.toString()
                  }
                });
              }}
            >
              <Image source={cat.image} style={styles.categoryImage} />
              <Text style={styles.categoryName}>{cat.name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Popular Dishes */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Popular Dishes</Text>
          <TouchableOpacity onPress={() => {
            if (activeTab === 'Dine-in' && !tableNumber) {
              showPopup("Scan QR Code", "Please scan the QR code on your table to view menu and order.", "info", undefined, [
                { text: "Scan QR", onPress: handleDineInPress },
                { text: "Cancel", style: "cancel" }
              ]);
              return;
            }
            router.push({
              pathname: '/menu',
              params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '' }
            });
          }}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>

        {popularDishes.map(dish => (
          <TouchableOpacity
            key={dish.id}
            style={styles.dishCard}
            onPress={() => {
              if (activeTab === 'Dine-in' && !tableNumber) {
                showPopup("Scan QR Code", "Please scan the QR code on your table to view menu and order.", "info", undefined, [
                  { text: "Scan QR", onPress: handleDineInPress },
                  { text: "Cancel", style: "cancel" }
                ]);
                return;
              }
              setSelectedItem(dish);
            }}
          >
            <Image source={{ uri: dish.image }} style={styles.dishImage} />
            <View style={styles.dishInfo}>
              <View style={styles.dishMeta}>
              </View>
              <Text style={styles.dishName}>{dish.name}</Text>
              <Text style={styles.dishDesc} numberOfLines={1}>{dish.desc}</Text>
              <View style={styles.dishFooter}>
                <Text style={styles.dishPrice}>Rs. {dish.price}</Text>
                <TouchableOpacity
                  style={styles.addBtn}
                  onPress={() => {
                    const cartItem = {
                      id: dish.id,
                      name: dish.name,
                      price: dish.price,
                      image: dish.image,
                      quantity: 1,
                      category: 'Popular',
                      desc: dish.desc,
                    };
                    useCartStore.getState().addItem(cartItem);
                    setCustomAlert({
                      visible: true,
                      title: "Added to Cart",
                      message: `${dish.name} has been added to your cart.`,
                      type: "success",
                      buttons: [{ text: "OK" }]
                    });
                  }}
                >
                  <Ionicons name='add' size={20} color='#fff' />
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {/* QR Scanner / Table Selector Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={isScannerVisible}
          onRequestClose={handleCloseScanner}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.scannerModalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Scan Table QR Code</Text>
                <TouchableOpacity onPress={handleCloseScanner}>
                  <Ionicons name="close-circle" size={28} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Camera view on all platforms when permission is granted */}
              {permission && permission.granted ? (
                <>
                  <View style={styles.cameraWrapper}>
                    <CameraView
                      style={StyleSheet.absoluteFillObject}
                      facing="back"
                      onBarcodeScanned={handleBarcodeScanned}
                      barcodeScannerSettings={{ barcodeTypes: ['qr'] as any }}
                    />
                    <View style={styles.scanTargetFrame} />
                    <Text style={styles.scanInstructionText}>
                      Align the QR Code inside the square
                    </Text>
                  </View>

                  {/* Camera Fallback for Emulators/Broken Expo Go */}
                  <View style={{ marginTop: 20, width: '100%', alignSelf: 'center', backgroundColor: '#f9f9f9', padding: 15, borderRadius: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 }}>
                    <Text style={{ fontSize: 13, fontWeight: 'bold', color: '#ff3400', marginBottom: 8 }}>Camera Not Working? Enter Table Manually:</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: '100%' }}>
                      <TextInput
                        placeholder="e.g. T-04"
                        style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 8, paddingHorizontal: 12, height: 44, backgroundColor: '#fff', color: '#000' }}
                        onChangeText={setMockTableNumber}
                        value={mockTableNumber}
                      />
                      <TouchableOpacity
                        style={{ backgroundColor: '#ff4500', paddingHorizontal: 16, height: 44, justifyContent: 'center', borderRadius: 8 }}
                        onPress={() => verifyTableAndEnter(mockTableNumber || 'T-06')}
                        disabled={isVerifyingTable}
                      >
                        {isVerifyingTable ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Enter</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.webFallbackContainer}>
                  <Ionicons name="camera-reverse-outline" size={48} color="#ccc" style={{ marginBottom: 15 }} />
                  <Text style={styles.webFallbackText}>
                    {Platform.OS === 'web'
                      ? 'Camera scanning is simulated on Web'
                      : 'Camera permission not granted'}
                  </Text>
                </View>
              )}
            </View>
          </View>
        </Modal>

      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/home')}>
          <Ionicons name='home' size={24} color='#ff4500' />
          <Text style={[styles.navText, { color: '#ff4500' }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => {
          if (activeTab === 'Dine-in' && !tableNumber) {
            showPopup("Scan QR Code", "Please scan the QR code on your table to view menu and order.", "info", undefined, [
              { text: "Scan QR", onPress: handleDineInPress },
              { text: "Cancel", style: "cancel" }
            ]);
            return;
          }
          router.replace({ pathname: '/menu', params: { orderType: activeTab === 'Dine-in' ? 'Dine In' : activeTab, tableNumber: activeTab === 'Dine-in' ? (tableNumber || '') : '' } })
        }}>
          <Ionicons name='search-outline' size={24} color='#888' />
          <Text style={styles.navText}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/orders')}>
          <Ionicons name='receipt-outline' size={24} color='#888' />
          <Text style={styles.navText}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/profile')}>
          <Ionicons name='person-outline' size={24} color='#888' />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>

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

      {/* Custom Premium Alert Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={customAlert.visible}
        onRequestClose={() => setCustomAlert(prev => ({ ...prev, visible: false }))}
      >
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <View style={[
              styles.alertIconBg,
              customAlert.type === 'success' && { backgroundColor: '#e6ffe6' },
              customAlert.type === 'error' && { backgroundColor: '#ffe5e0' },
              customAlert.type === 'info' && { backgroundColor: '#e6f2ff' }
            ]}>
              <Ionicons
                name={
                  customAlert.type === 'success'
                    ? 'checkmark-circle'
                    : customAlert.type === 'error'
                      ? 'alert-circle'
                      : 'information-circle'
                }
                size={48}
                color={
                  customAlert.type === 'success'
                    ? '#00cc66'
                    : customAlert.type === 'error'
                      ? '#ff4500'
                      : '#1e90ff'
                }
              />
            </View>
            <Text style={styles.alertTitle}>{customAlert.title}</Text>
            <Text style={styles.alertMessage}>{customAlert.message}</Text>
            <View style={[styles.alertBtnContainer, customAlert.buttons && customAlert.buttons.length > 2 ? { flexDirection: 'column' } : { flexDirection: 'row' }]}>
              {customAlert.buttons && customAlert.buttons.length > 0 ? (
                customAlert.buttons.map((btn, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.alertBtn,
                      btn.style === 'cancel'
                        ? { backgroundColor: '#f0f0f0', borderWidth: 1, borderColor: '#ccc' }
                        : { backgroundColor: '#ff4500' },
                      (!customAlert.buttons || customAlert.buttons.length <= 2) && { flex: 1 }
                    ]}
                    onPress={() => {
                      setCustomAlert(prev => ({ ...prev, visible: false }));
                      if (btn.onPress) {
                        btn.onPress();
                      }
                    }}
                  >
                    <Text style={[
                      styles.alertBtnText,
                      btn.style === 'cancel' && { color: '#666' }
                    ]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                ))
              ) : (
                <TouchableOpacity
                  style={[
                    styles.alertBtn,
                    customAlert.type === 'success' && { backgroundColor: '#00cc66' },
                    customAlert.type === 'error' && { backgroundColor: '#ff4500' },
                    customAlert.type === 'info' && { backgroundColor: '#1e90ff' }
                  ]}
                  onPress={() => {
                    setCustomAlert(prev => ({ ...prev, visible: false }));
                    if (customAlert.onConfirm) {
                      customAlert.onConfirm();
                    }
                  }}
                >
                  <Text style={styles.alertBtnText}>Continue</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 0,
  },
  logo: {
    width: 150,
    height: 40,
  },
  profileBtn: {
    padding: 5,
  },
  profileImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    gap: 5,
  },
  locationText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 25,
    paddingHorizontal: 15,
    height: 50,
    marginBottom: 20,
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
  },
  carouselWrapper: {
    marginBottom: 20,
  },
  carouselContainer: {
    overflow: 'visible',
  },
  carouselSlide: {
    width: 320,
    marginRight: 15,
  },
  banner: {
    width: '100%',
    borderRadius: 15,
    overflow: 'hidden',
    height: 150,
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
  },
  bannerImage: {
    width: 320,
    height: 150,
    borderRadius: 15,
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    padding: 20,
    justifyContent: 'center',
    borderRadius: 15,
  },
  bannerDiscount: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
  },
  bannerSubtitle: {
    color: '#fff',
    fontSize: 14,
    marginTop: 5,
    marginBottom: 15,
  },
  orderNowBtn: {
    backgroundColor: '#ff4500',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  orderNowText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#f5f5f5',
    borderRadius: 25,
    marginBottom: 25,
    padding: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 25,
  },
  activeTabBtn: {
    backgroundColor: '#ff4500',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  activeTabText: {
    color: '#fff',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 25,
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  seeAllText: {
    color: '#ff4500',
    fontWeight: '600',
  },
  categoriesScroll: {
    marginTop: 15,
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: 20,
  },
  categoryImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
    marginBottom: 8,
  },
  categoryName: {
    fontSize: 12,
    fontWeight: '500',
  },
  dishCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderRadius: 15,
    padding: 10,
    marginBottom: 15,
  },
  dishImage: {
    width: 90,
    height: 90,
    borderRadius: 10,
  },
  dishInfo: {
    flex: 1,
    marginLeft: 15,
    justifyContent: 'space-between',
  },
  dishMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dishRating: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 5,
    marginRight: 10,
  },
  dishTime: {
    fontSize: 12,
    color: '#888',
  },
  dishName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 5,
  },
  dishDesc: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  dishFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  dishPrice: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  addBtn: {
    backgroundColor: '#ff4500',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
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
  },
  tableStatusCard: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ffd0c7',
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
    shadowColor: '#ff4500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  tableStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tableStatusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  tableStatusText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  tableActionBtn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ff4500',
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 15,
  },
  tableActionText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#ff4500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  scannerModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 400,
    overflow: 'hidden',
    padding: 20,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  cameraWrapper: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 15,
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanTargetFrame: {
    width: '60%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: '#ff4500',
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  scanInstructionText: {
    position: 'absolute',
    bottom: 15,
    color: '#fff',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
  },
  webFallbackContainer: {
    width: '100%',
    aspectRatio: 1.5,
    backgroundColor: '#f5f5f5',
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderStyle: 'dashed',
  },
  webFallbackText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
  },
  mockSelectorContainer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 15,
  },
  mockLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    fontWeight: '600',
  },
  mockSelectorRow: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  mockTableBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    backgroundColor: '#f0f0f0',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  mockTableBtnActive: {
    backgroundColor: '#ff4500',
    borderColor: '#ff4500',
  },
  mockTableBtnText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  mockTableBtnTextActive: {
    color: '#fff',
  },
  verifyBtn: {
    backgroundColor: '#ff4500',
    borderRadius: 25,
    height: 45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  alertBox: {
    backgroundColor: '#fff',
    borderRadius: 24,
    width: '90%',
    maxWidth: 320,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  alertIconBg: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  alertTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
    textAlign: 'center',
    marginBottom: 10,
  },
  alertMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 10,
  },
  alertBtn: {
    width: '100%',
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  alertBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  alertBtnContainer: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
    marginTop: 10,
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
    backgroundColor: '#ff3400',
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
  stepBtnDisabled: {
    opacity: 0.5,
  },
  availBadge: {
    padding: 4,
    borderRadius: 10,
    backgroundColor: '#e6ffe6',
  },
  unavailBadge: {
    backgroundColor: '#ffe5e0',
  },
  availDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00cc66',
  },
  unavailDot: {
    backgroundColor: '#ff4500',
  }
});
