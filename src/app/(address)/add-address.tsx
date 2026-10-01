import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, StatusBar, Image, Alert, ActivityIndicator, RefreshControl, Modal, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../../constants/api';
import { useAuthStore, useAddressStore } from '../../store';
import BottomNavBar from '../../components/layout/BottomNavBar';
import { isWithinDeliveryArea } from '../../utils/deliveryArea';

const MapView = Platform.OS !== 'web' ? require('react-native-maps').default : null;
const { PROVIDER_GOOGLE } = Platform.OS !== 'web' ? require('react-native-maps') : { PROVIDER_GOOGLE: 'google' };
const Marker = Platform.OS !== 'web' ? require('react-native-maps').Marker : null;

export default function AddAddress() {
  const router = useRouter();
  const params = useLocalSearchParams<{ predefinedAddress?: string; latitude?: string; longitude?: string; addressType?: string }>();
  const { phone, customerId, customerName } = useAuthStore();
  const { addAddress, addresses, setSelectedDeliveryAddress } = useAddressStore();
  
  const [addressType, setAddressType] = useState(params.addressType as string || 'Home');
  const [flat, setFlat] = useState('');
  const [floor, setFloor] = useState('');
  const [building, setBuilding] = useState('');
  const [landmark, setLandmark] = useState('');
  const [fullAddress, setFullAddress] = useState(params.predefinedAddress || '');
  const [isLocating, setIsLocating] = useState(false);
  const [region, setRegion] = useState({
    latitude: params.latitude ? Number(params.latitude) : 13.0223,
    longitude: params.longitude ? Number(params.longitude) : 80.2229,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasConfirmedLocation, setHasConfirmedLocation] = useState(Boolean(params.latitude && params.longitude));
  const [showDeliveryUnavailable, setShowDeliveryUnavailable] = useState(false);
  const mapRef = useRef<any>(null);

  const handleSearch = async (text: string) => {
    setSearchQuery(text);
    if (text.length > 2) {
      setIsSearching(true);
      try {
        const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg';
        const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(text)}&key=${apiKey}&components=country:in`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.status === 'OK') {
          setSearchResults(data.predictions);
        } else {
          setSearchResults([]);
        }
      } catch (e) {
        console.error("Error fetching places:", e);
      } finally {
        setIsSearching(false);
      }
    } else {
      setSearchResults([]);
    }
  };

  const handleSelectPlace = async (placeId: string, description: string) => {
    setSearchQuery(description);
    setSearchResults([]);
    try {
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg';
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=geometry&key=${apiKey}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK' && data.result?.geometry?.location) {
        const { lat, lng } = data.result.geometry.location;
        const selectedRegion = {
          latitude: lat,
          longitude: lng,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        };
        setRegion(selectedRegion);
        mapRef.current?.animateToRegion(selectedRegion, 500);
        setHasConfirmedLocation(true);
        setFullAddress(description);
      }
    } catch (e) {
      console.error("Error fetching place details:", e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    setRefreshing(false);
  };

  const detectLocation = async () => {
    setIsLocating(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permission Denied", "Could not request location permission. Please fill in details manually.");
        setIsLocating(false);
        return;
      }
      
      let location = await Location.getCurrentPositionAsync({});
      const { latitude, longitude } = location.coords;
      
      const detectedRegion = {
        latitude,
        longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      };
      setRegion(detectedRegion);
      mapRef.current?.animateToRegion(detectedRegion, 500);
      setHasConfirmedLocation(true);
      
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg';
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;
      
      const response = await fetch(geocodeUrl);
      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const result = data.results[0];
        const formatted = result.formatted_address;
        
        setFullAddress(formatted);
        
        let streetNumber = '';
        let route = '';
        let sublocality = '';
        let locality = '';
        
        result.address_components.forEach((comp: any) => {
          if (comp.types.includes('street_number')) streetNumber = comp.long_name;
          if (comp.types.includes('route')) route = comp.long_name;
          if (comp.types.includes('sublocality') || comp.types.includes('sublocality_level_1')) sublocality = comp.long_name;
          if (comp.types.includes('locality')) locality = comp.long_name;
        });
        
        if (streetNumber) setFlat(streetNumber);
        if (route) setBuilding(route);
        if (sublocality || locality) setLandmark(sublocality || locality);
      } else {
        console.warn("Geocoding failed:", data.status, data.error_message);
      }
    } catch (e) {
      console.error("Error detecting location:", e);
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    if (isLocating) return;
    const parts = [
      flat ? `${flat}` : '',
      floor ? `${floor}` : '',
      building ? `${building}` : '',
      landmark ? `${landmark}` : ''
    ].filter(Boolean);
    if (parts.length > 0) {
       setFullAddress(parts.join(', '));
    }
  }, [flat, floor, building, landmark]);

  const handleSave = async () => {
    if (!fullAddress.trim()) {
      Alert.alert("Error", "Please fill in address details.");
      return;
    }

    if (!hasConfirmedLocation || !isWithinDeliveryArea(region.latitude, region.longitude)) {
      setShowDeliveryUnavailable(true);
      return;
    }
    
    setIsSaving(true);
    const newId = Date.now();
    const payload = {
      id: newId,
      type: addressType,
      address: fullAddress.trim(),
      full_address: fullAddress.trim(),
      latitude: region.latitude,
      longitude: region.longitude,
      flat_house_no: flat || '',
      floor: floor || '',
      building_apartment_name: building || '',
      landmark: landmark || '',
      contact_name: customerName || 'Customer',
      contact_phone: phone || '',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600001',
      icon: addressType === 'Home' ? 'home' : addressType === 'Work' ? 'briefcase' : 'location',
      iconBg: addressType === 'Home' ? '#ff4500' : addressType === 'Work' ? '#e6f2ff' : '#e6ffe6',
      iconColor: addressType === 'Home' ? '#fff' : addressType === 'Work' ? '#1e90ff' : '#00cc66',
      isDefault: addresses.length === 0
    };

    if (customerId) {
      try {
        const { customerApi } = await import('../../services/apiService');
        const resp = await customerApi.addAddress(customerId, {
          address_type: addressType,
          flat_house_no: flat || 'N/A',
          floor: floor || null,
          building_apartment_name: building || null,
          landmark: landmark || null,
          full_address: fullAddress.trim(),
          latitude: region.latitude,
          longitude: region.longitude,
          city: 'Chennai',
          state: 'Tamil Nadu',
          pincode: '600001',
          contact_name: customerName || 'Customer',
          contact_phone: phone || '',
          is_default: addresses.length === 0
        });
        
        // Update store only after backend success
        const finalId = resp?.address?.id || resp?.id || newId;
        payload.id = finalId;
        addAddress(payload);
        setSelectedDeliveryAddress(fullAddress.trim(), finalId);
        setIsSaving(false);
        router.replace({ pathname: '/menu', params: { orderType: 'Delivery' } });
      } catch (e: any) {
        setIsSaving(false);
        console.warn('Address backend sync note:', e);
        Alert.alert("Unable to save address", e?.message || "The address could not be saved. Please try again.");
      }
    } else {
      addAddress(payload);
      setSelectedDeliveryAddress(fullAddress.trim(), newId);
      setIsSaving(false);
      router.replace({ pathname: '/menu', params: { orderType: 'Delivery' } });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle='dark-content' backgroundColor='#fff' />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/my-addresses')}>
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Add Address</Text>
      </View>

      <ScrollView 
        contentContainerStyle={styles.scrollContent} 
        showsVerticalScrollIndicator={false} 
        keyboardShouldPersistTaps='handled'
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#ff4500']} />}
      >
        
        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={20} color="#888" style={styles.searchIcon} />
          <TextInput 
            style={styles.searchInput}
            placeholder="Search for area, street..."
            placeholderTextColor="#999"
            value={searchQuery}
            onChangeText={handleSearch}
          />
        </View>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <View style={styles.searchResultsContainer}>
            {searchResults.map((item, index) => (
              <TouchableOpacity 
                key={item.place_id} 
                style={[styles.searchResultItem, index < searchResults.length - 1 && styles.searchResultBorder]}
                onPress={() => handleSelectPlace(item.place_id, item.description)}
              >
                <Ionicons name="location-outline" size={18} color="#666" style={{marginRight: 10}} />
                <Text style={styles.searchResultText} numberOfLines={2}>{item.description}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Map View */}
        <View style={styles.mapContainer}>
          {Platform.OS === 'web' ? (
            <Image 
              source={{ uri: `https://maps.googleapis.com/maps/api/staticmap?center=${region.latitude},${region.longitude}&zoom=16&size=600x300&markers=color:red%7C${region.latitude},${region.longitude}&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg'}` }} 
              style={styles.mapImage} 
              resizeMode="cover"
            />
          ) : (
            <MapView
              ref={mapRef}
              style={styles.mapImage}
              region={region}
              onRegionChangeComplete={async (newRegion: any, details: any) => {
                setRegion(newRegion);
                if (!isLocating && details?.isGesture) {
                  setHasConfirmedLocation(true);
                  try {
                    const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg';
                    const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${newRegion.latitude},${newRegion.longitude}&key=${apiKey}`;
                    const response = await fetch(geocodeUrl);
                    const data = await response.json();
                    
                    if (data.status === 'OK' && data.results && data.results.length > 0) {
                      const result = data.results[0];
                      setFullAddress(result.formatted_address);
                    }
                  } catch (e) {
                    console.error("Geocoding on pan failed:", e);
                  }
                }
              }}
            >
              <Marker
                coordinate={{ latitude: region.latitude, longitude: region.longitude }}
                title="Your Location"
              />
            </MapView>
          )}
          {isLocating && (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255,255,255,0.85)', justifyContent: 'center', alignItems: 'center' }]}>
              <ActivityIndicator size="large" color="#ff4500" />
              <Text style={{ marginTop: 10, fontWeight: 'bold', color: '#ff4500', fontSize: 13 }}>Detecting your location...</Text>
            </View>
          )}
          
          {/* Locate Me Button */}
          {!isLocating && (
            <TouchableOpacity 
              style={{ position: 'absolute', bottom: 16, right: 16, backgroundColor: '#fff', width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 5 }} 
              onPress={detectLocation}
            >
              <Ionicons name="locate" size={24} color="#ff4500" />
            </TouchableOpacity>
          )}
        </View>

        {/* Address Type */}
        <Text style={styles.sectionLabel}>ADDRESS TYPE</Text>
        <View style={styles.typeContainer}>
          {['Home', 'Work', 'Other'].map(type => (
            <TouchableOpacity 
              key={type}
              style={[styles.typeBtn, addressType === type && styles.typeBtnActive]}
              onPress={() => setAddressType(type)}
            >
              <Text style={[styles.typeText, addressType === type && styles.typeTextActive]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Form Fields */}
        <View style={styles.row}>
          <View style={styles.halfInputContainer}>
            <Text style={styles.inputLabel}>Flat / House No</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. Flat 101 / House No" 
              value={flat}
              onChangeText={setFlat}
            />
          </View>
          <View style={styles.halfInputContainer}>
            <Text style={styles.inputLabel}>Floor</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. 1st Floor (Optional)" 
              value={floor}
              onChangeText={setFloor}
            />
          </View>
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Building / Apartment Name</Text>
          <TextInput 
            style={styles.input} 
            placeholder="e.g. Apartment / Building name" 
            value={building}
            onChangeText={setBuilding}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Landmark</Text>
          <TextInput 
            style={styles.input} 
            placeholder="e.g. Nearby landmark" 
            value={landmark}
            onChangeText={setLandmark}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Full Address</Text>
          <TextInput 
            style={[styles.input, styles.multilineInput]} 
            placeholder="e.g. Enter your full address here"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={fullAddress}
            onChangeText={setFullAddress}
          />
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={isSaving}>
          {isSaving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveBtnText}>Confirm and Save Address</Text>
          )}
        </TouchableOpacity>

      </ScrollView>

      <Modal
        visible={showDeliveryUnavailable}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDeliveryUnavailable(false)}
      >
        <Pressable style={styles.deliveryModalBackdrop} onPress={() => setShowDeliveryUnavailable(false)}>
          <Pressable style={styles.deliveryModalCard} onPress={() => undefined}>
            <View style={styles.deliveryModalIcon}>
              <Ionicons name="location-outline" size={26} color="#0BA01E" />
            </View>
            <Text style={styles.deliveryModalTitle}>Delivery unavailable</Text>
            <Text style={styles.deliveryModalMessage}>Data Udipi isn&apos;t available here.</Text>
            <TouchableOpacity
              style={styles.deliveryModalButton}
              onPress={() => {
                setShowDeliveryUnavailable(false);
                setSearchQuery('');
              }}
            >
              <Text style={styles.deliveryModalButtonText}>Try another location</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Bottom Navigation */}
      <BottomNavBar activeTab="profile" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    
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
    paddingBottom: 350,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 15,
    gap: 10,
    zIndex: 2,
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
  searchResultsContainer: {
    marginHorizontal: 20,
    marginTop: -10,
    marginBottom: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
    maxHeight: 200,
    zIndex: 1000,
    overflow: 'hidden',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#fff',
  },
  searchResultBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchResultText: {
    flex: 1,
    fontSize: 13,
    color: '#333',
  },
  mapContainer: {
    height: 300,
    width: '100%',
    backgroundColor: '#eee',
    marginBottom: 20,
    zIndex: 1,
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#888',
    paddingHorizontal: 20,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  typeContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 20,
    gap: 10,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  typeBtnActive: {
    borderColor: '#ff4500',
    backgroundColor: '#fff5f0',
  },
  typeText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  typeTextActive: {
    color: '#ff4500',
    fontWeight: 'bold',
  },
  row: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 15,
    marginBottom: 15,
  },
  halfInputContainer: {
    flex: 1,
  },
  inputContainer: {
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 15,
    paddingVertical: 12,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#fff',
  },
  multilineInput: {
    height: 80,
    paddingTop: 12,
  },
  deliveryModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  deliveryModalCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 18,
    elevation: 10,
  },
  deliveryModalIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#e8f7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  deliveryModalTitle: {
    color: '#111',
    fontSize: 21,
    fontWeight: '800',
    marginBottom: 8,
  },
  deliveryModalMessage: {
    color: '#555',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 22,
  },
  deliveryModalButton: {
    width: '100%',
    backgroundColor: '#0BA01E',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  deliveryModalButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: '#ff4500',
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 20,
    paddingVertical: 15,
    borderRadius: 25,
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
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
  }
});
