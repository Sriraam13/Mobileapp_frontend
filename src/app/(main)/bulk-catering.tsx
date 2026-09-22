import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ImageBackground, Image, SafeAreaView, Platform, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function BulkCatering() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#fff' />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        {/* Header Image */}
        <ImageBackground 
          source={require('../../../assets/images/banner_bg.jpg')} 
          style={styles.headerImageContainer}
          imageStyle={{ resizeMode: 'cover' }}
        >
          {/* Back button */}
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          
          <View style={styles.headerOverlay}>
            <Text style={styles.headerTitle}>South Indian{'\n'}Delights</Text>
            <View style={styles.tagContainer}>
              <MaterialCommunityIcons name="food-apple" size={12} color="#fff" style={{marginRight: 4}} />
              <Text style={styles.tagText}>PREMIUM CATERING</Text>
            </View>
            <Text style={styles.headerSubtitle}>Fresh vegetarian catering for 50+ guests</Text>
          </View>
        </ImageBackground>

        {/* Content Container */}
        <View style={styles.contentContainer}>
          <Text style={styles.title}>Data Udipi Bulk Catering</Text>
          <Text style={styles.description}>
            Experience 40 years of South Indian vegetarian culinary excellence at your special event. From intimate family gatherings to grand feasts.
          </Text>

          <Text style={styles.sectionTitle}>Why choose Data Udipi?</Text>

          {/* Features */}
          <View style={styles.featureCard}>
            <View style={styles.featureIconContainer}>
              <MaterialCommunityIcons name="calendar-clock" size={24} color="#ff4500" />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Advance Booking</Text>
              <Text style={styles.featureDesc}>Secure your preferred slot up to 12 months in advance</Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIconContainer}>
              <MaterialCommunityIcons name="silverware-fork-knife" size={24} color="#ff4500" />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>Customisable Menu</Text>
              <Text style={styles.featureDesc}>Swap dishes, adjust spice levels & add special request notes</Text>
            </View>
          </View>

          <View style={styles.featureCard}>
            <View style={styles.featureIconContainer}>
              <MaterialCommunityIcons name="truck-fast-outline" size={24} color="#ff4500" />
            </View>
            <View style={styles.featureTextContainer}>
              <Text style={styles.featureTitle}>On-Time Hot Service</Text>
              <Text style={styles.featureDesc}>Guaranteed warm delivery and professional handling</Text>
            </View>
          </View>

        </View>
      </ScrollView>

      {/* Bottom Buttons */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20 }]}>
        <TouchableOpacity 
          style={styles.primaryButton}
          onPress={() => router.push('/(main)/catering-event-details')}
        >
          <Text style={styles.primaryButtonText}>Start Planning</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>View Scheduled Orders</Text>
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
  scrollContent: {
    paddingBottom: 180,
  },
  headerImageContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    justifyContent: 'flex-end',
  },
  headerOverlay: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    padding: 15,
    width: '100%',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 28,
    fontFamily: 'serif',
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  tagContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  tagText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  headerSubtitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  contentContainer: {
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: '#666',
    lineHeight: 22,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 16,
  },
  featureCard: {
    flexDirection: 'row',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
  },
  featureIconContainer: {
    width: 24,
    alignItems: 'center',
    marginRight: 16,
  },
  featureTextContainer: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111',
    marginBottom: 4,
  },
  featureDesc: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  primaryButton: {
    backgroundColor: '#ff4500',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 16,
    fontWeight: '600',
  },
});
