import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, StatusBar, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { API_BASE_URL } from '../../constants/api';
import { useAuthStore, useAddressStore } from '../../store';

const MapView = Platform.OS !== 'web' ? require('react-native-maps').default : null;
const { PROVIDER_GOOGLE } = Platform.OS !== 'web' ? require('react-native-maps') : { PROVIDER_GOOGLE: 'google' };
const Marker = Platform.OS !== 'web' ? require('react-native-maps').Marker : null;

export default function AddAddress() {
  const router = useRouter();
  const { phone } = useAuthStore();
  const { addAddress, addresses } = useAddressStore();
  const mapRef = useRef<any>(null);
  const [addressType, setAddressType] = useState('Home');
  const [flat, setFlat] = useState('');
  const [floor, setFloor] = useState('');
  const [building, setBuilding] = useState('');
  const [landmark, setLandmark] = useState('');
  const [fullAddress, setFullAddress] = useState('');
  const [isLocating, setIsLocating] = useState(false);
  const [region, setRegion] = useState({
    latitude: 13.0405,
    longitude: 80.2036,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  });
  const [markerCoord, setMarkerCoord] = useState({
    latitude: 13.0405,
    longitude: 80.2036,
  });
  const [isGeocoding, setIsGeocoding] = useState(false);

  const reverseGeocode = async (latitude: number, longitude: number) => {
    setIsGeocoding(true);
    let resolvedAddress = '';
    let streetNumber = '';
    let route = '';
    let sublocality = '';
    let locality = '';

    // 1. Try Google Maps Geocoding API
    try {
      const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg';
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${apiKey}`;
      const response = await fetch(geocodeUrl);
      const data = await response.json();
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const result = data.results[0];
        if (result.formatted_address) {
          resolvedAddress = result.formatted_address;
        }
        result.address_components.forEach((comp: any) => {
          if (comp.types.includes('street_number')) streetNumber = comp.long_name;
          if (comp.types.includes('route')) route = comp.long_name;
          if (comp.types.includes('sublocality') || comp.types.includes('sublocality_level_1')) sublocality = comp.long_name;
          if (comp.types.includes('locality')) locality = comp.long_name;
        });
      }
    } catch (e) {
      console.warn("Google reverse geocoding error:", e);
    }

    // 2. Try OpenStreetMap Nominatim if empty
    if (!resolvedAddress) {
      try {
        const osmUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`;
        const res = await fetch(osmUrl, { headers: { 'User-Agent': 'DataUdipiApp/1.0' } });
        const osmData = await res.json();
        if (osmData && osmData.display_name) {
          resolvedAddress = osmData.display_name;
          if (osmData.address) {
            route = osmData.address.road || route;
            sublocality = osmData.address.suburb || osmData.address.neighbourhood || sublocality;
            locality = osmData.address.city || osmData.address.town || locality;
          }
        }
      } catch (e) {
        console.warn("OSM reverse geocoding error:", e);
      }
    }

    // 3. Try Expo native Location reverseGeocodeAsync
    if (!resolvedAddress) {
      try {
        const expoResults = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (expoResults && expoResults.length > 0) {
          const item = expoResults[0];
          streetNumber = item.streetNumber || '';
          route = item.street || item.name || '';
          sublocality = item.district || item.subregion || '';
          locality = item.city || item.subregion || '';

          const fullParts = [
            item.name && item.name !== item.street ? item.name : '',
            item.streetNumber,
            item.street,
            item.district,
            item.subregion,
            item.city,
            item.region,
            item.postalCode,
          ].filter(Boolean);

          const deduped = fullParts.filter((p, i, arr) => arr.indexOf(p) === i);
          if (deduped.length > 0) {
            resolvedAddress = deduped.join(', ');
          }
        }
      } catch (e) {
        console.warn("Expo reverse geocoding error:", e);
      }
    }

    if (resolvedAddress) {
      setFullAddress(resolvedAddress);
    }
    setFlat(streetNumber || '');
    setBuilding(route || '');
    setLandmark(sublocality || locality || '');

    setIsGeocoding(false);
  };

  const handleSelectCoordinate = (coordinate: { latitude: number; longitude: number }) => {
    if (!coordinate || !coordinate.latitude || !coordinate.longitude) return;
    setMarkerCoord({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    });
    setRegion(prev => ({
      ...prev,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    }));
    mapRef.current?.animateToRegion({
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      latitudeDelta: region.latitudeDelta || 0.015,
      longitudeDelta: region.longitudeDelta || 0.015,
    }, 300);
    reverseGeocode(coordinate.latitude, coordinate.longitude);
  };

  const detectLocation = async () => {
    setIsLocating(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permission Denied", "Could not request location permission. Please tap on the map or fill details manually.");
        setIsLocating(false);
        return;
      }
      
      let location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { latitude, longitude } = location.coords;
      
      setMarkerCoord({ latitude, longitude });
      setRegion({
        latitude,
        longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      });
      mapRef.current?.animateToRegion({
        latitude,
        longitude,
        latitudeDelta: 0.015,
        longitudeDelta: 0.015,
      }, 400);
      
      await reverseGeocode(latitude, longitude);
    } catch (e) {
      console.error("Error detecting location:", e);
    } finally {
      setIsLocating(false);
    }
  };

  useEffect(() => {
    detectLocation();
  }, []);

  const { customerId, customerName, phone: authPhone } = useAuthStore();
  const handleSave = async () => {
    if (!fullAddress.trim()) {
      Alert.alert("Error", "Please fill in address details.");
      return;
    }
    if (!customerId) {
      Alert.alert("Error", "You must be logged in to add an address.");
      return;
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/public/customers/${customerId}/addresses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          address_type: addressType,
          flat_house_no: flat || '',
          floor: floor || '',
          building_apartment_name: building || '',
          landmark: landmark || '',
          full_address: fullAddress.trim(),
          latitude: region.latitude,
          longitude: region.longitude,
          city: 'Chennai',
          state: 'Tamil Nadu',
          pincode: '600001', // Example pincode
          contact_name: customerName || 'Guest',
          contact_phone: authPhone || '',
          is_default: addresses.length === 0
        })
      });
      
      if (!response.ok) {
        throw new Error("Failed to save address to backend.");
      }
      
      const savedAddress = await response.json();
      
      const payload = {
        id: savedAddress.id.toString(),
        type: addressType,
        address: fullAddress.trim(),
        full_address: fullAddress.trim(),
        icon: addressType === 'Home' ? 'home' : addressType === 'Office' ? 'briefcase' : 'location',
        iconBg: addressType === 'Home' ? '#ff4500' : addressType === 'Office' ? '#e6f2ff' : '#e6ffe6',
        iconColor: addressType === 'Home' ? '#fff' : addressType === 'Office' ? '#1e90ff' : '#00cc66',
        isDefault: savedAddress.is_default
      };

      addAddress(payload);
      router.back();
    } catch (e) {
      console.error("Failed to save address:", e);
      Alert.alert("Error", "Failed to save address. Please try again.");
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps='handled'>
        
        {/* Map View */}
        <View style={styles.mapContainer}>
          {Platform.OS === 'web' ? (
            <Image 
              source={{ uri: `https://maps.googleapis.com/maps/api/staticmap?center=${region.latitude},${region.longitude}&zoom=16&size=600x400&markers=color:red%7C${region.latitude},${region.longitude}&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg'}` }} 
              style={styles.mapImage} 
              resizeMode="cover"
            />
          ) : (
            <MapView
              ref={mapRef}
              style={styles.mapImage}
              provider={PROVIDER_GOOGLE}
              region={region}
              onPress={(e: any) => {
                if (e?.nativeEvent?.coordinate) {
                  handleSelectCoordinate(e.nativeEvent.coordinate);
                }
              }}
              onPoiClick={(e: any) => {
                if (e?.nativeEvent?.coordinate) {
                  handleSelectCoordinate(e.nativeEvent.coordinate);
                }
              }}
              onRegionChangeComplete={(newRegion: any) => {
                setRegion(newRegion);
              }}
            >
              <Marker
                coordinate={markerCoord}
                draggable
                onDragEnd={(e: any) => {
                  if (e?.nativeEvent?.coordinate) {
                    handleSelectCoordinate(e.nativeEvent.coordinate);
                  }
                }}
                anchor={{ x: 0.5, y: 1 }}
                title="Delivery Location"
                description={fullAddress || "Selected Location"}
              >
                <View style={styles.modernMarkerContainer}>
                  <View style={styles.markerPin}>
                    <Ionicons name="location" size={22} color="#fff" />
                  </View>
                  <View style={styles.markerPinTip} />
                  <View style={styles.markerShadow} />
                </View>
              </Marker>
            </MapView>
          )}

          {/* Map Helper Guide Badge */}
          <View style={styles.mapHelperBadge} pointerEvents="none">
            <Ionicons name="hand-left-outline" size={13} color="#ff4500" />
            <Text style={styles.mapHelperText}>Tap map or drag pin to select location</Text>
          </View>

          {isLocating && (
            <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(255,255,255,0.85)', justifyContent: 'center', alignItems: 'center' }]}>
              <ActivityIndicator size="large" color="#ff4500" />
              <Text style={{ marginTop: 10, fontWeight: 'bold', color: '#ff4500', fontSize: 13 }}>Detecting your location...</Text>
            </View>
          )}
          
          {/* Live Address Preview on Map */}
          <View style={styles.mapAddressBar} pointerEvents="none">
            {isGeocoding ? (
              <View style={styles.geocodingRow}>
                <ActivityIndicator size="small" color="#ff4500" />
                <Text style={styles.geocodingText}>Fetching address at location...</Text>
              </View>
            ) : (
              <View style={styles.geocodingRow}>
                <Ionicons name="checkmark-circle" size={16} color="#00a01d" />
                <Text style={styles.mapAddressText} numberOfLines={1}>
                  {fullAddress || "Tap anywhere on map"}
                </Text>
              </View>
            )}
          </View>

          {/* Locate Me Button */}
          {!isLocating && (
            <TouchableOpacity 
              style={styles.locateMeBtn} 
              onPress={detectLocation}
              activeOpacity={0.8}
            >
              <Ionicons name="locate" size={24} color="#ff4500" />
            </TouchableOpacity>
          )}
        </View>

        {/* Address Type */}
        <Text style={styles.sectionLabel}>ADDRESS TYPE</Text>
        <View style={styles.typeContainer}>
          {['Home', 'Office', 'Other'].map(type => (
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

        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Address</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Bottom Navigation */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/home')}>
          <Ionicons name='home-outline' size={24} color='#888' />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/menu')}>
          <Ionicons name='search-outline' size={24} color='#888' />
          <Text style={styles.navText}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/orders')}>
          <Ionicons name='receipt-outline' size={24} color='#888' />
          <Text style={styles.navText}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.push('/profile')}>
          <Ionicons name='person' size={24} color='#ff4500' />
          <Text style={[styles.navText, { color: '#ff4500' }]}>Profile</Text>
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
  mapContainer: {
    height: 320,
    width: '100%',
    backgroundColor: '#eee',
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  mapImage: {
    width: '100%',
    height: '100%',
  },
  modernMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 60,
    height: 70,
  },
  markerPin: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ff4500',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 8,
    zIndex: 2,
  },
  markerPinTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#ff4500',
    marginTop: -3,
    zIndex: 1,
  },
  markerShadow: {
    width: 14,
    height: 5,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    marginTop: 2,
  },
  mapHelperBadge: {
    position: 'absolute',
    top: 14,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  mapHelperText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
  },
  mapAddressBar: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 74,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  geocodingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  geocodingText: {
    fontSize: 12,
    color: '#ff4500',
    fontWeight: '600',
  },
  mapAddressText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
    flex: 1,
  },
  locateMeBtn: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: '#fff',
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 6,
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
