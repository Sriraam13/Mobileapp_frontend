import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Platform, StatusBar, Image, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';;
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
        
        if (streetNumber) {
          setFlat(streetNumber);
        }
        if (route) {
          setBuilding(route);
        }
        if (sublocality || locality) {
          setLandmark(sublocality || locality);
        }
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
    detectLocation();
  }, []);

  useEffect(() => {
    if (isLocating) return;
    const parts = [
      flat ? `${flat}` : '',
      floor ? `${floor}` : '',
      building ? `${building}` : '',
      landmark ? `${landmark}` : ''
    ].filter(Boolean);
    setFullAddress(parts.join(', '));
  }, [flat, floor, building, landmark, isLocating]);
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
              source={{ uri: `https://maps.googleapis.com/maps/api/staticmap?center=${region.latitude},${region.longitude}&zoom=16&size=600x300&markers=color:red%7C${region.latitude},${region.longitude}&key=${process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || 'AIzaSyA2qxAJag8F89Q_TdtjqU_42W6JAVJ5_qg'}` }} 
              style={styles.mapImage} 
              resizeMode="cover"
            />
          ) : (
            <MapView
              style={styles.mapImage}
              region={region}
              onRegionChangeComplete={async (newRegion: any) => {
                setRegion(newRegion);
                if (!isLocating) {
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
              >
                <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                  <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', borderWidth: 2, borderColor: '#ff4500', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    <Image source={require('../../../assets/images/Dataudupi.png')} style={{ width: 34, height: 34 }} resizeMode="contain" />
                  </View>
                  <View style={{ width: 0, height: 0, backgroundColor: 'transparent', borderStyle: 'solid', borderLeftWidth: 6, borderRightWidth: 6, borderBottomWidth: 12, borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#ff4500', transform: [{ rotate: '180deg' }], marginTop: -2 }} />
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#ff8c00', marginTop: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 4 }} />
                </View>
              </Marker>
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
    height: 200,
    width: '100%',
    backgroundColor: '#eee',
    marginBottom: 20,
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
