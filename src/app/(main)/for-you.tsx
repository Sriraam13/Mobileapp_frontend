import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar, Image, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';;
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, getFullImageUrl } from '../../constants/api';
import { useAuthStore, useRestaurantStore, useOrderStore } from '../../store';

interface FavouriteItem {
  id: string;
  name: string;
  price: number;
  image: string;
  isFavourite: boolean;
}

interface AiCombo {
  id: string;
  name: string;
  price: number;
  image: string;
  reason: string;
}

export default function ForYou() {
  const router = useRouter();
  const { phone } = useAuthStore();
  const { selectedOutlet } = useRestaurantStore();

  const [favouriteItems, setFavouriteItems] = useState<FavouriteItem[]>([]);
  const [aiCombos, setAiCombos] = useState<AiCombo[]>([]);

  const { pastOrders } = useOrderStore();

  React.useEffect(() => {
    const loadForYouData = async () => {
      try {
        // 1. Fetch Menu Items
        const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : 1;
        
        const itemRes = await fetch(`${API_BASE_URL}/api/v1/public/menu/items?restaurant_id=${restId}`);
        const itemData = await itemRes.json();
        const menuItems = itemData.map((item: any) => ({
            id: item.id.toString(),
            name: item.name,
            price: item.price,
            image: getFullImageUrl(item.image_url),
        }));

        // 2. Use Local Orders (backend does not support order history by phone)
        const ordersList = pastOrders || [];

        // Count item frequencies
        const frequencyMap: Record<string, number> = {};
        ordersList.forEach(order => {
          if (order.items) {
            const items = order.items.split(',').map((i: string) => i.trim());
            items.forEach((itemStr: string) => {
              const nameMatch = itemStr.match(/(.*)\s+x\s+\d+/i);
              const name = nameMatch ? nameMatch[1].trim() : itemStr;
              frequencyMap[name] = (frequencyMap[name] || 0) + 1;
            });
          }
        });

        // Determine Top Favourites
        const sortedNames = Object.keys(frequencyMap).sort((a, b) => frequencyMap[b] - frequencyMap[a]);
        const topNames = sortedNames.slice(0, 3);
        
        let calculatedFavs: FavouriteItem[] = [];
        topNames.forEach(name => {
          const menuItem = menuItems.find((m: any) => m.name.toLowerCase() === name.toLowerCase());
          if (menuItem) {
            calculatedFavs.push({ ...menuItem, isFavourite: true });
          }
        });

        // Fallback to defaults if no history
        if (calculatedFavs.length === 0) {
          calculatedFavs = menuItems.slice(0, 2).map((m: any) => ({ ...m, isFavourite: true }));
        }
        setFavouriteItems(calculatedFavs);

        // Generate AI Combos
        const generatedCombos: AiCombo[] = [];
        if (calculatedFavs.length > 0) {
          const fav1 = calculatedFavs[0];
          const otherItem1 = menuItems.find((m: any) => m.id !== fav1.id && m.price < 100) || menuItems[1];
          if (otherItem1) {
            const comboPrice = Math.floor((fav1.price + otherItem1.price) * 0.9); // 10% discount
            generatedCombos.push({
              id: 'ai-1',
              name: `${fav1.name} + ${otherItem1.name}`,
              price: comboPrice,
              image: otherItem1.image,
              reason: `Because you loved ${fav1.name}`
            });
          }
          if (calculatedFavs.length > 1) {
            const fav2 = calculatedFavs[1];
            const otherItem2 = menuItems.find((m: any) => m.id !== fav2.id && m.id !== fav1.id) || menuItems[0];
            if (otherItem2) {
              const comboPrice2 = Math.floor((fav2.price + otherItem2.price) * 0.9);
              generatedCombos.push({
                id: 'ai-2',
                name: `${fav2.name} + ${otherItem2.name}`,
                price: comboPrice2,
                image: fav2.image,
                reason: `Because you order ${fav2.name} often`
              });
            }
          }
        }
        
        // Fallback Combos
        if (generatedCombos.length === 0 && menuItems.length >= 2) {
          generatedCombos.push({
            id: 'ai-1',
            name: `${menuItems[0].name} + ${menuItems[1].name}`,
            price: Math.floor((menuItems[0].price + menuItems[1].price) * 0.9),
            image: menuItems[0].image,
            reason: "Popular pairing for you"
          });
        }
        setAiCombos(generatedCombos);
      } catch (err) {
        console.error("Error loading For You data:", err);
      }
    };
    loadForYouData();
  }, []);

  const toggleFavourite = (id: string) => {
    setFavouriteItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, isFavourite: !item.isFavourite } : item
      )
    );
  };

  const handleAddToCart = (itemName: string) => {
    Alert.alert('Added to Cart', `${itemName} has been added to your order!`);
  };

  const handleReorderUsual = () => {
    Alert.alert(
      'Reorder Your Usual',
      'Masala Dosa + Filter Coffee have been added to your order!'
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.push('/home');
            }
          }}
        >
          <Ionicons name="chevron-back" size={22} color="#111" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>For You</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Your Favourites Section */}
        <Text style={styles.sectionTitle}>Your Favourites</Text>

        <View style={styles.favouritesGrid}>
          {favouriteItems.map((item) => (
            <View key={item.id} style={styles.favouriteCard}>
              <View style={styles.imageContainer}>
                <Image
                  source={{ uri: item.image }}
                  style={styles.dishImage}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={styles.heartBtn}
                  activeOpacity={0.8}
                  onPress={() => toggleFavourite(item.id)}
                >
                  <Ionicons
                    name={item.isFavourite ? 'heart' : 'heart-outline'}
                    size={16}
                    color="#ff4500"
                  />
                </TouchableOpacity>
              </View>

              <Text style={styles.dishName} numberOfLines={1}>
                {item.name}
              </Text>

              <View style={styles.priceRow}>
                <Text style={styles.dishPrice}>Rs. {item.price}</Text>
                <TouchableOpacity
                  style={styles.addCircleBtn}
                  activeOpacity={0.8}
                  onPress={() => handleAddToCart(item.name)}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {/* AI Recommendations Section */}
        <View style={styles.aiHeaderRow}>
          <Text style={styles.aiTitle}>AI Combos</Text>
          <View style={styles.sparkleBadge}>
            <Text style={styles.sparkleText}>SPARKLE</Text>
          </View>
        </View>

        {aiCombos.map((combo) => (
          <View key={combo.id} style={styles.aiCard}>
            <View style={styles.aiCardLeft}>
              <Image
                source={{ uri: combo.image }}
                style={styles.aiDishImage}
                resizeMode="cover"
              />
              <View style={styles.aiTextColumn}>
                <Text style={styles.reasonText}>{combo.reason}</Text>
                <Text style={styles.aiDishTitle} numberOfLines={2}>{combo.name}</Text>
                <Text style={styles.aiDishPrice}>Rs. {combo.price}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.addPillBtn}
              activeOpacity={0.8}
              onPress={() => handleAddToCart(combo.name)}
            >
              <Text style={styles.addPillText}>Add</Text>
            </TouchableOpacity>
          </View>
        ))}

        {favouriteItems.length > 0 && (
          <TouchableOpacity
            style={styles.reorderCard}
            activeOpacity={0.8}
            onPress={handleReorderUsual}
          >
            <View style={styles.reorderLeft}>
              <View style={styles.repeatIconBadge}>
                <Ionicons name="repeat" size={22} color="#ff4500" />
              </View>
              <View style={styles.reorderTextColumn}>
                <Text style={styles.reorderTitle}>Reorder Your Usual?</Text>
                <Text style={styles.reorderSubtitle} numberOfLines={1}>
                  {favouriteItems.map(f => f.name).join(' + ')}
                </Text>
              </View>
            </View>

            <Ionicons name="chevron-forward" size={20} color="#8e8e93" />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name="home-outline" size={24} color="#ff4500" />
          <Text style={[styles.navText, { color: '#ff4500' }]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/menu')}>
          <Ionicons name="search-outline" size={24} color="#888" />
          <Text style={styles.navText}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/orders')}>
          <Ionicons name="receipt-outline" size={24} color="#888" />
          <Text style={styles.navText}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/profile')}>
          <Ionicons name="person-outline" size={24} color="#888" />
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
    paddingVertical: 14,
    backgroundColor: '#fff',
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1c1c1e',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 110,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1c1c1e',
    marginBottom: 16,
  },
  favouritesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 26,
  },
  favouriteCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  imageContainer: {
    width: '100%',
    height: 115,
    borderRadius: 14,
    backgroundColor: '#f5f5f5',
    marginBottom: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  dishImage: {
    width: '100%',
    height: '100%',
  },
  heartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dishName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1c1c1e',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dishPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1c1c1e',
  },
  addCircleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ff4500',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#ff4500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  aiTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1c1c1e',
    marginRight: 10,
  },
  sparkleBadge: {
    backgroundColor: '#fff0e6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sparkleText: {
    color: '#ff4500',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  aiCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  aiCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  aiDishImage: {
    width: 72,
    height: 72,
    borderRadius: 14,
    marginRight: 14,
    backgroundColor: '#f5f5f5',
  },
  aiTextColumn: {
    flex: 1,
  },
  reasonText: {
    color: '#ff4500',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  aiDishTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1c1c1e',
    marginBottom: 3,
  },
  aiDishPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1c1c1e',
  },
  addPillBtn: {
    backgroundColor: '#ff4500',
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 20,
    marginLeft: 10,
    shadowColor: '#ff4500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  addPillText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  reorderCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  reorderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  repeatIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff0e6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  reorderTextColumn: {
    flex: 1,
  },
  reorderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1c1c1e',
    marginBottom: 3,
  },
  reorderSubtitle: {
    fontSize: 13,
    color: '#8e8e93',
    fontWeight: '500',
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  navItem: {
    alignItems: 'center',
  },
  navText: {
    fontSize: 11,
    marginTop: 4,
    color: '#888',
  },
});
