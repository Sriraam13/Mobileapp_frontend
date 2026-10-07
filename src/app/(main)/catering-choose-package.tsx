import { API_BASE_URL } from '../../constants/api';
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Platform, StatusBar, ActivityIndicator, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';

interface CateringPackage {
  name: string;
  code: string;
  price: number;
  minimum_order_quantity: number;
  is_available: boolean;
  items_summary: string | null;
}

export default function ChoosePackage() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const auth = useAuthStore();
  
  const TABS = ['All', 'Breakfast', 'Lunch', 'Dinner', 'Evening Tiffin'];
  const TAB_KEYWORDS: Record<string, string[]> = {
    'All': [],
    'Breakfast': ['breakfast', 'idly', 'idli', 'dosa', 'vada', 'upma', 'pongal', 'poori'],
    'Lunch': ['lunch', 'rice', 'variety'],
    'Dinner': ['dinner', 'feast', 'grand', 'special'],
    'Evening Tiffin': ['tiffin', 'evening', 'snack', 'tea'],
  };

  const [activeTab, setActiveTab] = useState('All');
  const [packages, setPackages] = useState<CateringPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [creatingSession, setCreatingSession] = useState(false);

  const filteredPackages = activeTab === 'All'
    ? packages
    : packages.filter(pkg => {
        const keywords = TAB_KEYWORDS[activeTab] || [];
        const nameLower = pkg.name.toLowerCase();
        return keywords.some(kw => nameLower.includes(kw));
      });

  const fetchPackages = async () => {
    try {
      const baseUrl = API_BASE_URL;
      const response = await fetch(`${baseUrl}/api/v1/public/catering/packages`);
      const data = await response.json();
      setPackages(data);
    } catch (error) {
      console.error("Error fetching packages:", error);
      Alert.alert("Error", "Failed to load packages. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPackages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleProceed = async () => {
    if (!selectedPackage) return;
    
    setCreatingSession(true);
    try {
      const baseUrl = API_BASE_URL;
      const headers = {
        'Content-Type': 'application/json',
        ...(auth.token ? { 'Authorization': `Bearer ${auth.token}` } : {})
      };

      // 1. Create Session
      const sessionBody = {
        customer_id: auth.customerId || 1,
        package_code: selectedPackage,
        guest_count: parseInt(params.guestCount as string || '50', 10)
      };
      
      const createResponse = await fetch(`${baseUrl}/api/v1/public/catering/sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(sessionBody)
      });
      
      if (!createResponse.ok) {
        const err = await createResponse.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to create session");
      }
      
      const sessionData = await createResponse.json();
      const sessionId = sessionData.id || sessionData.session_id;

      // 2. Patch Event Details
      const eventBody: any = {
        event_name: params.eventName,
        serving_time: params.time,
        occasion: params.occasion,
        service_type: params.serviceType,
      };
      // Convert date like "21 September 2026" => "2026-09-21"
      if (params.date) {
        const dateStr = params.date as string;
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const parts = dateStr.split(" ");
        if (parts.length === 3) {
          const day = parts[0].padStart(2, '0');
          const monthIndex = months.indexOf(parts[1]);
          if (monthIndex !== -1) {
            const month = (monthIndex + 1).toString().padStart(2, '0');
            const year = parts[2];
            eventBody.event_date = `${year}-${month}-${day}`;
          }
        } else {
          // Fallback if it's already a standard format or another format
          try {
            const parsed = new Date(dateStr);
            if (!isNaN(parsed.getTime())) {
              eventBody.event_date = parsed.toISOString().split('T')[0];
            }
          } catch {}
        }
      }
      
      await fetch(`${baseUrl}/api/v1/public/catering/sessions/${sessionId}/event`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(eventBody)
      });
      
      // Navigate to Step 3 - Customise Menu
      router.push({
        pathname: '/(main)/catering-customise-menu',
        params: {
          sessionId: sessionId.toString(),
          packageCode: selectedPackage,
          guestCount: params.guestCount,
          packagePrice: packages.find(p => p.code === selectedPackage)?.price?.toString() || '0',
          packageName: packages.find(p => p.code === selectedPackage)?.name || '',
          eventName: params.eventName,
          date: params.date,
          time: params.time,
          serviceType: params.serviceType,
          address: params.address,
        }
      });

    } catch (error: any) {
      console.error("Error creating session:", error);
      Alert.alert("Error", error.message || "Failed to start session. Please try again.");
    } finally {
      setCreatingSession(false);
    }
  };


  const renderTabs = () => (
    <View style={styles.tabContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabScroll}>
        {TABS.map(tab => (
          <TouchableOpacity 
            key={tab} 
            style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.stepText}>STEP 2 OF 6</Text>
          <Text style={styles.headerTitle}>Choose a Package</Text>
        </View>
        <MaterialCommunityIcons name="leaf" size={24} color="#8bc34a" style={styles.leafIcon} />
      </View>

      {/* Progress Bar */}
      <View style={styles.progressContainer}>
        <View style={[styles.progressSegment, styles.progressActive]} />
        <View style={[styles.progressSegment, styles.progressActive]} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
        <View style={styles.progressSegment} />
      </View>

      {renderTabs()}

      <View style={styles.minOrderContainer}>
        <Text style={styles.minOrderText}>Minimum order: 50 guests</Text>
      </View>

      {loading ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color="#ff4500" />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {filteredPackages.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <MaterialCommunityIcons name="food-off" size={48} color="#ddd" />
              <Text style={{ color: '#aaa', marginTop: 12, fontSize: 14 }}>No packages available for {activeTab}</Text>
            </View>
          ) : filteredPackages.map((pkg) => {
            const isSelected = selectedPackage === pkg.code;
            return (
              <TouchableOpacity 
                key={pkg.code} 
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => setSelectedPackage(isSelected ? null : pkg.code)}
                activeOpacity={0.8}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.vegIcon}>
                    <View style={styles.vegDot} />
                  </View>
                  <Text style={styles.pkgTitle}>{pkg.name}</Text>
                  {isSelected && <Ionicons name="checkmark-circle" size={20} color="#ff4500" style={{ marginLeft: 6 }} />}
                </View>
                
                <Text style={styles.pkgItems}>{pkg.items_summary || 'Variety of items'}</Text>
                
                <View style={styles.cardFooter}>
                  <Text style={styles.priceText}>
                    Rs. {pkg.price} <Text style={styles.perPerson}>/ person</Text>
                  </Text>
                  
                  <View style={[styles.selectBtn, isSelected && styles.selectBtnActive]}>
                    <Text style={[styles.selectBtnText, isSelected && styles.selectBtnTextActive]}>
                      {isSelected ? 'Selected ✓' : 'Select'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {selectedPackage && (
        <View style={[styles.bottomContainer, { paddingBottom: insets.bottom > 0 ? insets.bottom + 10 : 20 }]}>
          <TouchableOpacity style={styles.proceedBtn} onPress={handleProceed} disabled={creatingSession}>
            {creatingSession ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.proceedBtnText}>Proceed</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
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
  backButton: {
    marginRight: 15,
  },
  headerTextContainer: {
    flex: 1,
  },
  stepText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ff4500',
    letterSpacing: 1,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  leafIcon: {
    marginLeft: 10,
  },
  progressContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  progressSegment: {
    flex: 1,
    height: 4,
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
    marginHorizontal: 2,
  },
  progressActive: {
    backgroundColor: '#ff4500',
  },
  tabContainer: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  tabScroll: {
    paddingHorizontal: 15,
  },
  tabBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginHorizontal: 5,
    backgroundColor: '#fff',
  },
  tabBtnActive: {
    backgroundColor: '#ff4500',
    borderColor: '#ff4500',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#fff',
  },
  minOrderContainer: {
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  minOrderText: {
    fontSize: 14,
    color: '#777',
    fontWeight: '600',
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#eee',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  cardSelected: {
    borderColor: '#ff4500',
    borderWidth: 1.5,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  vegIcon: {
    width: 14,
    height: 14,
    borderWidth: 1,
    borderColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderRadius: 2,
  },
  vegDot: {
    width: 6,
    height: 6,
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  pkgTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#222',
  },
  pkgItems: {
    fontSize: 13,
    color: '#777',
    lineHeight: 18,
    marginBottom: 15,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ff4500',
  },
  perPerson: {
    fontSize: 14,
    fontWeight: 'normal',
    color: '#888',
  },
  selectBtn: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#ff4500',
    backgroundColor: '#fff',
  },
  selectBtnActive: {
    backgroundColor: '#ff4500',
  },
  selectBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#ff4500',
  },
  selectBtnTextActive: {
    color: '#fff',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  proceedBtn: {
    backgroundColor: '#ff4500',
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: 'center',
  },
  proceedBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  }
});

