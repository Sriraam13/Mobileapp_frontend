import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCartStore } from '../../store';

export default function DeliveryCompletedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId: string;
    cart: string;
  }>();

  const { clearCart, addItem, setOrderType } = useCartStore();

  const [foodRating, setFoodRating] = useState(0);
  const [deliveryRating, setDeliveryRating] = useState(0);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const tags = ["Great packaging", "Tasty Food", "Fast Delivery", "Friendly Rider", "Perfect Temperature"];

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleReorder = () => {
    let parsedCart: any[] = [];
    try {
      if (params.cart && params.cart !== '[object Object]') {
        parsedCart = JSON.parse(params.cart);
      }
    } catch (e) {
      console.error(e);
    }
    
    if (parsedCart.length > 0) {
      clearCart();
      setOrderType('Delivery');
      parsedCart.forEach(item => {
        addItem({
          id: item.id || item.menu_item_id,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          image: item.image || item.image_url || 'https://via.placeholder.com/150',
          category: item.category || 'Special',
        });
      });
      router.push('/checkout');
    }
  };

  const renderStars = (rating: number, setRating: (val: number) => void) => {
    return (
      <View style={styles.starsRow}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
            <Ionicons
              name={star <= rating ? "star" : "star-outline"}
              size={24}
              color={star <= rating ? "#ffc107" : "#ccc"}
              style={styles.starIcon}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: '#00a01d' }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces={false}>
        
        {/* Header Section */}
        <View style={styles.headerBox}>
          <MaterialCommunityIcons name="party-popper" size={48} color="#fff" />
          <Text style={styles.headerTitle}>Order Delivered!</Text>
          <Text style={styles.headerSubtitle}>Enjoy your delicious South Indian meal!</Text>
        </View>

        {/* White Body Section */}
        <View style={[styles.bodySection, { minHeight: 600 }]}>
          
          {/* Rating Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Rate Your Experience</Text>
            
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>Food Quality</Text>
              {renderStars(foodRating, setFoodRating)}
            </View>
            
            <View style={styles.ratingRow}>
              <Text style={styles.ratingLabel}>Delivery Service</Text>
              {renderStars(deliveryRating, setDeliveryRating)}
            </View>

            <Text style={styles.tagsTitle}>WHAT DID YOU LIKE MOST?</Text>
            <View style={styles.tagsContainer}>
              {tags.map((tag) => {
                const isActive = selectedTags.includes(tag);
                return (
                  <TouchableOpacity 
                    key={tag} 
                    style={[styles.tagBtn, isActive && styles.tagBtnActive]}
                    onPress={() => toggleTag(tag)}
                  >
                    <Text style={[styles.tagText, isActive && styles.tagTextActive]}>{tag}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            
            <TouchableOpacity style={styles.submitFeedbackBtn}>
              <Text style={styles.submitFeedbackText}>Submit Feedback</Text>
            </TouchableOpacity>
          </View>

          {/* Loyalty Points Pill */}
          <View style={styles.loyaltyPill}>
            <MaterialCommunityIcons name="medal-outline" size={20} color="#000" />
            <Text style={styles.loyaltyText}>You earned 15 Loyalty Points!</Text>
          </View>

          {/* Action Buttons */}
          <TouchableOpacity style={styles.invoiceBtn}>
            <Ionicons name="document-text-outline" size={18} color="#ff3400" />
            <Text style={styles.invoiceBtnText}>Download Invoice</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.reorderBtn} onPress={handleReorder}>
            <Text style={styles.reorderBtnText}>Reorder This Meal</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.homeBtn} onPress={() => {
            router.dismissAll();
            router.replace('/home');
          }}>
            <Text style={styles.homeBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  headerBox: {
    backgroundColor: '#00a01d',
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginTop: 16,
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
  },
  bodySection: {
    backgroundColor: '#fff',
    flex: 1,
    paddingTop: 24,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: '#f9f9f9',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  ratingLabel: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
  },
  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starIcon: {
    marginLeft: 4,
  },
  tagsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 12,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  tagBtn: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginBottom: 8,
  },
  tagBtnActive: {
    borderColor: '#ff3400',
    backgroundColor: '#fff5f2',
  },
  tagText: {
    fontSize: 13,
    color: '#888',
  },
  tagTextActive: {
    color: '#ff3400',
    fontWeight: '500',
  },
  submitFeedbackBtn: {
    marginTop: 16,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#e6f7eb',
    borderRadius: 8,
  },
  submitFeedbackText: {
    color: '#00a01d',
    fontWeight: '600',
    fontSize: 14,
  },
  loyaltyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginBottom: 24,
  },
  loyaltyText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 8,
  },
  invoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ff3400',
    backgroundColor: '#fff',
    marginBottom: 12,
  },
  invoiceBtnText: {
    color: '#ff3400',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  reorderBtn: {
    backgroundColor: '#ff3400',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  reorderBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  homeBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 30,
  },
  homeBtnText: {
    color: '#888',
    fontSize: 15,
    fontWeight: '500',
  },
});
