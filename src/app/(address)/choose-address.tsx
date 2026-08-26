import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, StatusBar, Image, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../../constants/api';
import { useAddressStore, useAuthStore } from '../../store';

const MapView = Platform.OS !== 'web' ? require('react-native-maps').default : null;
const { PROVIDER_GOOGLE } = Platform.OS !== 'web' ? require('react-native-maps') : { PROVIDER_GOOGLE: 'google' };
const Marker = Platform.OS !== 'web' ? require('react-native-maps').Marker : null;

export default function ChooseAddress() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { customerId } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const { addresses, setAddresses, setSelectedDeliveryAddress } = useAddressStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [addressType, setAddressType] = useState('Home');
  const [isLocating, setIsLocating] = useState(false);
  const [selectedAddressText, setSelectedAddressText] = useState('Fetching address...');
  const [region, setRegion] = useState({
    latitude: 13.0405,
    longitude: 80.2036,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  });

  const loadAddresses = async () => {
    if (!customerId) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses`);
      if (response.ok) {
        const data = await response.json();
        const formattedAddresses = data.map((item: any) => ({
          id: item.id.toString(),
          type: item.address_type,
          address: item.flat_house_no + (item.building_apartment_name ? `, ${item.building_apartment_name}` : ''),
          full_address: item.full_address,
          icon: item.address_type.toLowerCase() === 'home' ? 'home' : (item.address_type.toLowerCase() === 'work' ? 'briefcase' : 'location'),
          iconBg: item.address_type.toLowerCase() === 'home' ? '#ffe5e5' : (item.address_type.toLowerCase() === 'work' ? '#e6f2ff' : '#e6ffe6'),
          iconColor: item.address_type.toLowerCase() === 'home' ? '#ff4500' : (item.address_type.toLowerCase() === 'work' ? '#1e90ff' : '#00cc66'),
          isDefault: item.is_default
        }));
        setAddresses(formattedAddresses);
      }
    } catch (e) {
      console.error("Error loading addresses", e);
    } finally {
      setLoading(false);
    }
  };

  const detectLocation = async () => {
    setIsLocating(true);
    setSelectedAddressText('Locating...');
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setSelectedAddressText('Location permission denied.');
        setIsLocating(false);
        return;
      }
      
      let location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      
      setRegion({
        latitude,
        longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
      
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg';
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;
      
      const response = await fetch(geocodeUrl);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        setSelectedAddressText(data.results[0].formatted_address);
      } else {
        setSelectedAddressText('Could not get address');
      }
    } catch (e) {
      console.error("Error detecting location:", e);
      setSelectedAddressText('Error getting location');
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    loadAddresses();
    detectLocation();
  }, []);

  const handleSelectAddress = (addressString: string, id: number) => {
    setSelectedDeliveryAddress(addressString, id);
    if (params.fromCheckout) {
      router.back();
    } else {
      router.replace({ pathname: '/menu', params: { orderType: 'Delivery' } });
    }
  };

  const handleConfirmLocation = () => {
    // If we're confirming a map location without a saved ID, we can't fully proceed to delivery order 
    // unless we create it, but for now we'll just navigate to add-address with this info
    router.push({ pathname: '/add-address', params: { predefinedAddress: selectedAddressText } });
  };

  const handleConfirmProceed = () => {
    const state = useAddressStore.getState();
    if (state.selectedDeliveryAddress) {
      if (params.fromCheckout) {
        router.back();
      } else {
        router.replace({ pathname: '/menu', params: { orderType: 'Delivery' } });
      }
    } else {
      if (addresses.length > 0) {
        // Auto-select the default address, or the first available one
        const defaultAddr = addresses.find(a => a.isDefault) || addresses[0];
        setSelectedDeliveryAddress(defaultAddr.address, Number(defaultAddr.id));
        if (params.fromCheckout) {
          router.back();
        } else {
          router.replace({ pathname: '/menu', params: { orderType: 'Delivery' } });
        }
      } else {
        // Alert the user if no addresses exist
        if (Platform.OS === 'web') {
          window.alert("Please add a delivery address first.");
        } else {
          const { Alert } = require('react-native');
          Alert.alert("Address Required", "Please add a delivery address first.");
        }
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#fff' />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/menu')}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Choose Delivery Address</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled'>
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#888" style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search for area, street..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity style={styles.targetBtn} onPress={detectLocation}>
            <Ionicons name="locate" size={20} color="#ff4500" />
          </TouchableOpacity>
        </View>

        {/* Use Current Location Pill */}
        <TouchableOpacity style={styles.currentLocPill} onPress={detectLocation}>
          <Ionicons name="locate" size={16} color="#00a01d" />
          <Text style={styles.currentLocText}>Use Current Location</Text>
        </TouchableOpacity>

        {/* Address Type Chips */}
        <View style={styles.chipsContainer}>
          {['Home', 'Work', 'Other'].map((type) => {
            const iconName = type === 'Home' ? 'home-outline' : type === 'Work' ? 'briefcase-outline' : 'location-outline';
            const isActive = addressType === type;
            return (
              <TouchableOpacity 
                key={type}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setAddressType(type)}
              >
                <Ionicons name={iconName} size={16} color={isActive ? '#333' : '#666'} />
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{type}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Map View */}
        <View style={styles.mapContainer}>
          {Platform.OS === 'web' ? (
            <Image 
              source={{ uri: `https://maps.googleapis.com/maps/api/staticmap?center=${region.latitude},${region.longitude}&zoom=16&size=600x400&markers=color:orange%7C${region.latitude},${region.longitude}&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg'}` }} 
              style={styles.mapImage} 
              resizeMode="cover"
            />
          ) : (
            <MapView
              style={styles.mapImage}
              provider={PROVIDER_GOOGLE}
              region={region}
              onRegionChangeComplete={(reg: any) => setRegion(reg)}
            >
              <Marker
                coordinate={{ latitude: region.latitude, longitude: region.longitude }}
                title="Selected Location"
              >
                 <View style={styles.customMarker}>
                    <View style={styles.customMarkerInner}>
                      <Text style={styles.customMarkerText}>Data</Text>
                      <Text style={styles.customMarkerTextBottom}>UDIPI</Text>
                    </View>
                    <View style={styles.markerTriangle} />
                 </View>
              </Marker>
            </MapView>
          )}
          
          {/* Selected Location Card floating over map */}
          <View style={styles.selectedLocationCard}>
             <Text style={styles.selectedLocLabel}>Selected Location</Text>
             <View style={styles.selectedLocRow}>
               <Text style={styles.selectedLocAddress} numberOfLines={2}>{selectedAddressText}</Text>
               <TouchableOpacity style={styles.editBtn}>
                 <Ionicons name="pencil-outline" size={14} color="#888" />
               </TouchableOpacity>
             </View>
             <TouchableOpacity style={styles.confirmLocBtn} onPress={handleConfirmLocation}>
               <Text style={styles.confirmLocBtnText}>Confirm Location</Text>
             </TouchableOpacity>
          </View>
        </View>

        {/* Saved Addresses Section */}
        <Text style={styles.sectionTitle}>Saved Addresses</Text>
        
        {loading ? (
          <ActivityIndicator size="small" color="#ff4500" style={{marginTop: 20}} />
        ) : (
          <View style={styles.savedAddressesContainer}>
            {addresses.map((item) => (
              <TouchableOpacity key={item.id} style={[styles.savedAddressCard, item.isDefault && styles.savedAddressCardDefault]} onPress={() => handleSelectAddress(item.address, Number(item.id))}>
                <View style={[styles.savedIconContainer, { backgroundColor: item.isDefault ? '#ff4500' : item.iconBg }]}>
                  <Ionicons name={item.icon as any} size={20} color={item.isDefault ? '#fff' : item.iconColor} />
                </View>
                <View style={styles.savedAddressContent}>
                  <View style={styles.savedTitleRow}>
                    <Text style={styles.savedAddressType}>{item.type}</Text>
                    {item.isDefault && (
                      <View style={styles.defaultBadge}>
                        <Text style={styles.defaultBadgeText}>DEFAULT</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.savedAddressText} numberOfLines={2}>{item.address}</Text>
                  
                  {item.isDefault && (
                    <View style={styles.savedActionRow}>
                      <TouchableOpacity><Text style={styles.savedActionTextRed}>Edit</Text></TouchableOpacity>
                      <TouchableOpacity onPress={async () => {
                        try {
                          await fetch(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses/${item.id}`, { method: 'DELETE' });
                          loadAddresses();
                        } catch (e) {
                          console.error("Error deleting address:", e);
                        }
                      }}><Text style={styles.savedActionText}>Delete</Text></TouchableOpacity>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity style={styles.addNewAddressBtn} onPress={() => router.push('/add-address')}>
          <Ionicons name="add" size={20} color="#333" />
          <Text style={styles.addNewAddressText}>Add New Address</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Bottom Fixed Button */}
      <View style={styles.bottomFixedContainer}>
        <TouchableOpacity style={styles.confirmProceedBtn} onPress={handleConfirmProceed}>
          <Text style={styles.confirmProceedBtnText}>Confirm and Proceed</Text>
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
    paddingBottom: 100,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 15,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 25,
    paddingHorizontal: 40,
    paddingVertical: 12,
    fontSize: 14,
    color: '#333',
    borderWidth: 1,
    borderColor: '#eee',
  },
  searchIcon: {
    position: 'absolute',
    left: 15,
    zIndex: 1,
  },
  targetBtn: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: '#fff5f0',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ffe0d0',
  },
  currentLocPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginHorizontal: 20,
    marginBottom: 15,
    gap: 8,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
    elevation: 2,
  },
  currentLocText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  chipsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    gap: 6,
    boxShadow: '0px 1px 2px rgba(0, 0, 0, 0.05)',
    elevation: 1,
  },
  chipActive: {
    borderColor: '#ddd',
  },
  chipText: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#333',
    fontWeight: '600',
  },
  mapContainer: {
    height: 350,
    width: '100%',
    backgroundColor: '#f5f5f5',
    position: 'relative',
    marginBottom: 20,
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  customMarker: {
    alignItems: 'center',
  },
  customMarkerInner: {
    backgroundColor: '#fff',
    borderRadius: 25,
    padding: 2,
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#ff4500',
  },
  customMarkerText: {
    color: '#ff4500',
    fontSize: 9,
    fontWeight: 'bold',
  },
  customMarkerTextBottom: {
    color: '#00a01d',
    fontSize: 9,
    fontWeight: 'bold',
  },
  markerTriangle: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#ff4500',
    transform: [{ rotate: '180deg' }],
    marginTop: -2,
  },
  selectedLocationCard: {
    position: 'absolute',
    bottom: -30,
    left: 20,
    right: 20,
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.1)',
    elevation: 5,
    zIndex: 10,
  },
  selectedLocLabel: {
    color: '#00a01d',
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  selectedLocRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  selectedLocAddress: {
    flex: 1,
    fontSize: 13,
    color: '#555',
    marginRight: 10,
  },
  editBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmLocBtn: {
    backgroundColor: '#ff4500',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmLocBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginHorizontal: 20,
    marginTop: 50,
    marginBottom: 15,
  },
  savedAddressesContainer: {
    paddingHorizontal: 20,
    gap: 15,
  },
  savedAddressCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 15,
    borderWidth: 1,
    borderColor: '#eee',
  },
  savedAddressCardDefault: {
    borderColor: '#ffcda8',
  },
  savedIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  savedAddressContent: {
    flex: 1,
  },
  savedTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  savedAddressType: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 10,
  },
  defaultBadge: {
    backgroundColor: '#ff4500',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  defaultBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: 'bold',
  },
  savedAddressText: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
    marginBottom: 10,
  },
  savedActionRow: {
    flexDirection: 'row',
    gap: 15,
  },
  savedActionTextRed: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ff4500',
  },
  savedActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#555',
  },
  addNewAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginTop: 15,
    marginBottom: 30,
    paddingVertical: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    gap: 8,
  },
  addNewAddressText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  bottomFixedContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  confirmProceedBtn: {
    backgroundColor: '#00a01d',
    borderRadius: 25,
    paddingVertical: 15,
    alignItems: 'center',
  },
  confirmProceedBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
