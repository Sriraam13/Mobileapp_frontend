import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { getFullImageUrl } from '../../constants/api';
import { useAuthStore, useRestaurantStore, useFavoritesStore, useCartStore } from '../../store';
import { customerApi } from '../../services/apiService';
import BottomNavBar from '../../components/layout/BottomNavBar';

interface RecommendationItem {
  id: number;
  menu_item_id: number;
  name: string;
  price: number;
  image_url: string;
  is_available: boolean;
  is_favorite: boolean;
  is_veg?: boolean;
  reason: string;
}

interface ComboItem {
  id: string;
  name: string;
  price: number;
  image_url: string;
  reason: string;
  items: RecommendationItem[];
}

interface RecommendationsData {
  favorites: RecommendationItem[];
  frequently_ordered: RecommendationItem[];
  popular_items: RecommendationItem[];
  recommended_items: RecommendationItem[];
  combos: ComboItem[];
}

export default function ForYou() {
  const router = useRouter();
  const { phone, customerId } = useAuthStore();
  const { selectedOutlet } = useRestaurantStore();
  const { favorites, setFavorites, addFavorite, removeFavorite, isFavorite } = useFavoritesStore();
  const { addItem } = useCartStore();

  const [data, setData] = useState<RecommendationsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadForYouData = async () => {
      try {
        setLoading(true);
        if (customerId) {
          const restId = selectedOutlet?.restaurant_id ? Number(selectedOutlet.restaurant_id) : 1;
          const recs = await customerApi.getRecommendations(customerId, restId);
          setData(recs);

          // Sync favorites to local store
          if (recs.favorites) {
            setFavorites(recs.favorites);
          }
        }
      } catch (err) {
        console.error("Error loading For You data:", err);
      } finally {
        setLoading(false);
      }
    };
    loadForYouData();
  }, [customerId, selectedOutlet]);

  const toggleFavourite = async (menuItemId: number, currentItem: RecommendationItem) => {
    if (!customerId) {
      Alert.alert('Login Required', 'Please login to save favorites.');
      return;
    }

    try {
      if (isFavorite(menuItemId)) {
        await customerApi.removeFavorite(customerId, menuItemId);
        removeFavorite(menuItemId);
        // Optimistically update local data
        if (data) {
          setData({ ...data, favorites: data.favorites.filter(f => f.menu_item_id !== menuItemId) });
        }
      } else {
        await customerApi.addFavorite(customerId, menuItemId);
        addFavorite({
          favorite_id: Date.now(), // Temp ID
          menu_item_id: menuItemId,
          name: currentItem.name,
          price: currentItem.price,
          image_url: currentItem.image_url || null,
          is_veg: currentItem.is_veg || true
        });
        // Optimistically update local data
        if (data) {
          setData({ ...data, favorites: [...data.favorites, currentItem] });
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update favorites');
    }
  };

  const handleAddToCart = (item: RecommendationItem) => {
    if (item.is_available === false) {
      Alert.alert('Unavailable', `${item.name} is not available right now.`);
      return;
    }

    addItem({
      id: item.menu_item_id,
      name: item.name,
      price: Number(item.price),
      image: getFullImageUrl(item.image_url, item.name),
      category: 'Favorite',
    });
    Alert.alert('Added to Cart', `${item.name} has been added to your order!`);
  };

  const handleComboAddToCart = (combo: any) => {
    addItem({
      id: combo.id || combo.menu_item_id,
      name: combo.name,
      price: Number(combo.price),
      image: getFullImageUrl(combo.image_url, combo.name),
      category: 'Combo',
    });
    Alert.alert('Added to Cart', `${combo.name} has been added to your order!`);
  };

  const renderItemCard = (item: RecommendationItem) => (
    <View key={item.menu_item_id} style={styles.favouriteCard}>
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: getFullImageUrl(item.image_url, item.name) }}
          style={styles.dishImage}
          resizeMode="cover"
        />
        <TouchableOpacity
          style={styles.heartBtn}
          activeOpacity={0.8}
          onPress={() => toggleFavourite(item.menu_item_id, item)}
        >
          <Ionicons
            name={isFavorite(item.menu_item_id) ? 'heart' : 'heart-outline'}
            size={16}
            color="#ff4500"
          />
        </TouchableOpacity>
      </View>

      <Text style={styles.reasonText}>{item.reason}</Text>
      <Text style={styles.dishName} numberOfLines={1}>
        {item.name}
      </Text>

      <View style={styles.priceRow}>
        <Text style={styles.dishPrice}>Rs. {item.price}</Text>
        <TouchableOpacity
          style={styles.addCircleBtn}
          activeOpacity={0.8}
          onPress={() => handleAddToCart(item)}
        >
          <Ionicons name="add" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const isNewCustomer = !data?.frequently_ordered || data.frequently_ordered.length === 0;

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

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#ff4500" />
          <Text style={styles.loadingText}>Curating your recommendations...</Text>
        </View>
      ) : !customerId ? (
        <View style={styles.centerContainer}>
          <Text style={styles.loadingText}>Please login to see personalized recommendations.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isNewCustomer ? (
            <>
              {/* NEW CUSTOMER VIEW */}
              {data?.popular_items && data.popular_items.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Popular at Data Udipi</Text>
                  <View style={styles.favouritesGrid}>
                    {data.popular_items.map(renderItemCard)}
                  </View>
                </>
              )}

              {data?.combos && data.combos.length > 0 && (
                <>
                  <View style={styles.aiHeaderRow}>
                    <Text style={styles.aiTitle}>Trending Combos</Text>
                  </View>
                  {data.combos.map((combo) => (
                    <View key={combo.id} style={styles.aiCard}>
                      <View style={styles.aiCardLeft}>
                        <Image
                          source={{ uri: getFullImageUrl(combo.image_url, combo.name) }}
                          style={styles.aiDishImage}
                          resizeMode="cover"
                        />
                        <View style={styles.aiTextColumn}>
                          <Text style={styles.comboReasonText}>{combo.reason}</Text>
                          <Text style={styles.aiDishTitle} numberOfLines={2}>{combo.name}</Text>
                          <Text style={styles.aiDishPrice}>Rs. {combo.price}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.addPillBtn}
                        activeOpacity={0.8}
                        onPress={() => handleComboAddToCart(combo)}
                      >
                        <Text style={styles.addPillText}>Add</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
            </>
          ) : (
            <>
              {/* EXISTING CUSTOMER VIEW */}

              {data?.favorites && data.favorites.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Your Favourites</Text>
                  <View style={styles.favouritesGrid}>
                    {data.favorites.map(renderItemCard)}
                  </View>
                </>
              )}

              {data?.frequently_ordered && data.frequently_ordered.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Order Again</Text>
                  <View style={styles.favouritesGrid}>
                    {data.frequently_ordered.map(renderItemCard)}
                  </View>
                </>
              )}

              {data?.recommended_items && data.recommended_items.length > 0 && (
                <>
                  <Text style={styles.sectionTitle}>Recommended For You</Text>
                  <View style={styles.favouritesGrid}>
                    {data.recommended_items.map(renderItemCard)}
                  </View>
                </>
              )}

              {data?.combos && data.combos.length > 0 && (
                <>
                  <View style={styles.aiHeaderRow}>
                    <Text style={styles.aiTitle}>Personalized Combos</Text>
                    <View style={styles.sparkleBadge}>
                      <Text style={styles.sparkleText}>MATCH</Text>
                    </View>
                  </View>

                  {data.combos.map((combo) => (
                    <View key={combo.id} style={styles.aiCard}>
                      <View style={styles.aiCardLeft}>
                        <Image
                          source={{ uri: getFullImageUrl(combo.image_url, combo.name) }}
                          style={styles.aiDishImage}
                          resizeMode="cover"
                        />
                        <View style={styles.aiTextColumn}>
                          <Text style={styles.comboReasonText}>{combo.reason}</Text>
                          <Text style={styles.aiDishTitle} numberOfLines={2}>{combo.name}</Text>
                          <Text style={styles.aiDishPrice}>Rs. {combo.price}</Text>
                        </View>
                      </View>

                      <TouchableOpacity
                        style={styles.addPillBtn}
                        activeOpacity={0.8}
                        onPress={() => handleComboAddToCart(combo)}
                      >
                        <Text style={styles.addPillText}>Add</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>
      )}

      {/* Bottom Navigation */}
      <BottomNavBar activeTab="home" />
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
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#8e8e93',
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
    flexWrap: 'wrap',
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
    marginBottom: 16,
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
  reasonText: {
    color: '#8e8e93',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
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
  comboReasonText: {
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
});
