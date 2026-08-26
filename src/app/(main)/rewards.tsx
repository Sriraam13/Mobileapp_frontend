import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar, Image, ActivityIndicator, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../store';
import { customerApi } from '../../services/apiService';

export default function Rewards() {
  const router = useRouter();
  const { phone } = useAuthStore();
  const [loyaltyPoints, setLoyaltyPoints] = useState(0);
  const [ordersProgress, setOrdersProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showHowItWorks, setShowHowItWorks] = useState(false);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const testPhone = phone || '+919876543210';
      let profileData = await customerApi.getProfile(testPhone).catch(() => null);
      if (profileData) {
        setLoyaltyPoints(profileData.loyalty_points || 0);
        setOrdersProgress(profileData.orders_progress || 0);
      }
    } catch (e) {
      console.error("Failed to fetch profile", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#fff' />

      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backBtn} 
          onPress={() => router.canGoBack() ? router.back() : router.replace('/home')}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rewards & Loyalty</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* Loyalty Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>LOYALTY BALANCE</Text>
          {loading ? (
            <ActivityIndicator size="large" color="#fff" style={{ marginVertical: 10 }} />
          ) : (
            <Text style={styles.balanceValue}>{loyaltyPoints} Points</Text>
          )}

          <View style={styles.balanceFooter}>
            <Text style={styles.balanceWorth}>Worth Rs. {(loyaltyPoints * 0.1).toFixed(2)}</Text>
            <TouchableOpacity
              style={styles.howItWorksBtn}
              onPress={() => setShowHowItWorks(true)}
            >
              <Text style={styles.howItWorksText}>How it works</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Milestones & Quests */}
        <Text style={styles.sectionTitle}>Milestones & Quests</Text>
        <View style={styles.questCard}>
          <View style={styles.questIconContainer}>
            <Ionicons name="trending-up" size={20} color="#00cc66" />
          </View>
          <View style={styles.questInfo}>
            <Text style={styles.questTitle}>Order 3 times this week</Text>
            <Text style={styles.questProgress}>Progress: {ordersProgress}/3 orders  Get 100 pts</Text>
          </View>
        </View>

        {/* Available Rewards */}
        <Text style={styles.sectionTitle}>Available Rewards</Text>

        <View style={styles.rewardCard}>
          <Image source={{ uri: 'https://via.placeholder.com/100' }} style={styles.rewardImage} />
          <View style={styles.rewardInfo}>
            <Text style={styles.rewardTitle}>Free Filter Coffee</Text>
            <Text style={styles.rewardPoints}>150 Points required</Text>
          </View>
          <TouchableOpacity style={styles.redeemBtn}>
            <Text style={styles.redeemText}>Redeem</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.rewardCard}>
          <Image source={{ uri: 'https://via.placeholder.com/100' }} style={styles.rewardImage} />
          <View style={styles.rewardInfo}>
            <Text style={styles.rewardTitle}>Free Medu Vada (1 Pc)</Text>
            <Text style={styles.rewardPoints}>250 Points required</Text>
          </View>
          <TouchableOpacity style={styles.redeemBtn}>
            <Text style={styles.redeemText}>Redeem</Text>
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
          <Ionicons name='receipt-outline' size={24} color='#888' />
          <Text style={styles.navText}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/profile')}>
          <Ionicons name='person' size={24} color='#ff4500' />
          <Text style={[styles.navText, { color: '#ff4500' }]}>Profile</Text>
        </TouchableOpacity>
      </View>
      {/* How it works Modal */}
      <Modal
        visible={showHowItWorks}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowHowItWorks(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="information-circle" size={28} color="#ff4500" />
              <Text style={styles.modalTitle}>How It Works</Text>
            </View>
            <Text style={styles.modalText}>
              • Order 3 times in a week to earn 100 loyalty points.{"\n\n"}
              • Each point is worth Rs.10.{"\n\n"}
              • Redeem your accumulated points for free food items and exclusive discounts!
            </Text>
            <TouchableOpacity
              style={styles.modalCloseBtn}
              onPress={() => setShowHowItWorks(false)}
            >
              <Text style={styles.modalCloseBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  balanceCard: {
    backgroundColor: '#ff4500',
    borderRadius: 15,
    padding: 20,
    marginBottom: 25,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  balanceValue: {
    color: '#fff',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  balanceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceWorth: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  howItWorksBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  howItWorksText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  questCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  questIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e6ffe6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  questInfo: {
    flex: 1,
  },
  questTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  questProgress: {
    fontSize: 12,
    color: '#888',
  },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  rewardImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 15,
  },
  rewardInfo: {
    flex: 1,
  },
  rewardTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  rewardPoints: {
    fontSize: 12,
    color: '#888',
  },
  redeemBtn: {
    backgroundColor: '#ff4500',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
  },
  redeemText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
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
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 10,
  },
  modalText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 24,
  },
  modalCloseBtn: {
    backgroundColor: '#ff4500',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});
