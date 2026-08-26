import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, StatusBar, Image, ActivityIndicator,
  TextInput, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { customerApi } from '../../services/apiService';
import { getFullImageUrl } from '../../constants/api';
import {
  useAuthStore,
  useAddressStore,
  useCartStore,
  useOrderStore,
  useLiveOrderStore,
  useDineInSessionStore,
  useRestaurantStore
} from '../../store';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerProfile {
  id: number;
  name: string;
  phone: string;
  email?: string | null;
  profile_picture_url?: string | null;
  loyalty_points?: number;
  address?: string | null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Profile() {
  const router = useRouter();

  // Read from auth store — the single source of truth
  const { customerId, customerName, phone } = useAuthStore();

  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);

  // ── Profile fetch ──
  const fetchProfile = useCallback(async () => {
    if (!customerId) {
      // Not logged in properly
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data: CustomerProfile = await customerApi.getProfileById(customerId);
      setProfile(data);
      setEditName(data.name || '');
      setEditEmail(data.email || '');
    } catch (e: any) {
      console.warn('[Profile] Failed to fetch profile:', e.message);
      // Show what we have from auth store as fallback
      if (customerName || phone) {
        setProfile({
          id: customerId,
          name: customerName || 'Guest',
          phone: phone || '',
        });
      }
    } finally {
      setLoading(false);
    }
  }, [customerId, customerName, phone]);

  // Refresh when screen gains focus
  useFocusEffect(
    useCallback(() => {
      fetchProfile();
    }, [fetchProfile])
  );

  // ── Profile save ──
  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }
    if (!customerId) return;
    setSaving(true);
    try {
      const updated = await customerApi.updateProfile(customerId, {
        name: editName.trim(),
        email: editEmail.trim() || undefined,
      });
      setProfile(updated);
      // Update auth store name too
      useAuthStore.setState({ customerName: updated.name });
      setIsEditing(false);
      Alert.alert('✓ Saved', 'Profile updated successfully');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  // ── Image picker ──
  const handlePickImage = async () => {
    Alert.alert(
      'Change Profile Photo',
      'Choose a source',
      [
        { text: 'Take Photo', onPress: () => openCamera() },
        { text: 'Choose from Gallery', onPress: () => openGallery() },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Camera access is required to take a photo.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.75,
    });
    if (!result.canceled) {
      await uploadImage(result.assets[0].uri, result.assets[0].fileName);
    }
  };

  const openGallery = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission denied', 'Photo library access is required to pick a photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.75,
    });
    if (!result.canceled) {
      await uploadImage(result.assets[0].uri, result.assets[0].fileName);
    }
  };

  const uploadImage = async (uri: string, fileName?: string | null) => {
    if (!customerId) return;
    setUploadingImage(true);
    try {
      const ext = (fileName || uri.split('/').pop() || 'photo.jpg').split('.').pop() || 'jpg';
      const name = `profile_${customerId}.${ext}`;
      const type = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const formData = new FormData();
      formData.append('file', { uri, name, type } as any);

      const updated = await customerApi.uploadProfilePicture(customerId, formData);
      setProfile(updated);
      Alert.alert('✓ Updated', 'Profile picture updated!');
    } catch (e: any) {
      Alert.alert('Upload failed', e.message || 'Could not upload picture');
    } finally {
      setUploadingImage(false);
    }
  };

  // ── Logout ──
  const handleLogout = () => {
    useAuthStore.getState().logout();
    useCartStore.getState().clearCart();
    useAddressStore.getState().clearAddresses();
    useOrderStore.getState().clearCurrentOrder();
    useLiveOrderStore.getState().setPollingActive(false);
    useLiveOrderStore.getState().clearLiveOrder();
    useDineInSessionStore.getState().closeSession();
    useRestaurantStore.getState().setSelectedOutlet(null);
    router.replace('/login');
  };

  // ── Menu items ──
  const menuItems = [
    { id: 1, title: 'My Addresses', icon: 'location-outline', iconColor: '#ff4500', iconBg: '#ffe5e5', route: '/my-addresses' },
    { id: 2, title: 'Payment Methods', icon: 'card-outline', iconColor: '#1e90ff', iconBg: '#e6f2ff', route: '/payment-methods' },
    { id: 3, title: 'Order History', icon: 'receipt-outline', iconColor: '#00cc66', iconBg: '#e6ffe6', route: '/orders' },
    { id: 4, title: 'Favourite Orders', icon: 'heart-outline', iconColor: '#ff6699', iconBg: '#ffe6f0', route: '/favourites' },
    { id: 5, title: 'Rewards & Loyalty', icon: 'gift-outline', iconColor: '#9933ff', iconBg: '#f2e6ff', route: '/rewards' },
  ] as const;

  // ── Profile picture URI ──
  const picUri = profile?.profile_picture_url
    ? getFullImageUrl(profile.profile_picture_url)
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/home')}
        >
          <Ionicons name="arrow-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* User Card */}
        <View style={styles.userCard}>
          {loading ? (
            <ActivityIndicator size="small" color="#ff4500" style={{ margin: 20 }} />
          ) : (
            <>
              {/* Avatar */}
              <View style={styles.imageContainer}>
                {picUri ? (
                  <Image source={{ uri: picUri }} style={styles.userImage} />
                ) : (
                  <View style={[styles.userImage, styles.placeholderImage]}>
                    <Ionicons name="person" size={32} color="#aaa" />
                  </View>
                )}
                <TouchableOpacity
                  style={styles.cameraBtn}
                  onPress={handlePickImage}
                  disabled={uploadingImage}
                >
                  {uploadingImage
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Ionicons name="camera" size={14} color="#fff" />}
                </TouchableOpacity>
              </View>

              {/* Info */}
              <View style={styles.userInfo}>
                {isEditing ? (
                  <>
                    <TextInput
                      style={styles.inputName}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Your Name"
                    />
                    <Text style={[styles.userDetails, { marginVertical: 4 }]}>
                      {profile?.phone || phone || ''}
                    </Text>
                    <TextInput
                      style={styles.inputEmail}
                      value={editEmail}
                      onChangeText={setEditEmail}
                      placeholder="Email Address"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </>
                ) : (
                  <>
                    <Text style={styles.userName}>{profile?.name || customerName || 'Guest'}</Text>
                    <Text style={styles.userDetails}>{profile?.phone || phone || ''}</Text>
                    {profile?.email ? (
                      <Text style={styles.userDetails}>{profile.email}</Text>
                    ) : null}
                    {/* Loyalty points — only shown if actually > 0 in backend */}
                    {(profile?.loyalty_points ?? 0) > 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                        <Ionicons name="gift-outline" size={12} color="#ff4500" />
                        <Text style={[styles.userDetails, { marginLeft: 4, marginBottom: 0, color: '#ff4500', fontWeight: 'bold' }]}>
                          {profile!.loyalty_points} Loyalty Points
                        </Text>
                      </View>
                    ) : null}
                  </>
                )}
              </View>

              {/* Edit / Save button */}
              {isEditing ? (
                <TouchableOpacity
                  style={[styles.editBtn, { backgroundColor: '#e6ffe6' }]}
                  onPress={handleSaveProfile}
                  disabled={saving}
                >
                  {saving
                    ? <ActivityIndicator size="small" color="#00cc66" />
                    : <Ionicons name="checkmark" size={16} color="#00cc66" />}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={styles.editBtn}
                  onPress={() => {
                    setEditName(profile?.name || '');
                    setEditEmail(profile?.email || '');
                    setIsEditing(true);
                  }}
                >
                  <Ionicons name="pencil" size={16} color="#ff4500" />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Menu */}
        <View style={styles.menuContainer}>
          {menuItems.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.menuItem}
              onPress={() => router.push(item.route as any)}
            >
              <View style={styles.menuLeft}>
                <View style={[styles.iconContainer, { backgroundColor: item.iconBg }]}>
                  <Ionicons name={item.icon as any} size={20} color={item.iconColor} />
                </View>
                <Text style={styles.menuTitle}>{item.title}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#ccc" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Bottom Nav */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/home')}>
          <Ionicons name="home-outline" size={24} color="#888" />
          <Text style={styles.navText}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/menu' as any)}>
          <Ionicons name="search-outline" size={24} color="#888" />
          <Text style={styles.navText}>Search</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => router.replace('/orders' as any)}>
          <Ionicons name="receipt-outline" size={24} color="#888" />
          <Text style={styles.navText}>Orders</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem}>
          <Ionicons name="person" size={24} color="#ff4500" />
          <Text style={[styles.navText, { color: '#ff4500' }]}>Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
  backBtn: { marginRight: 15 },
  headerTitle: { fontSize: 18, fontWeight: 'bold' },
  scrollContent: { padding: 20, paddingBottom: 100 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  imageContainer: { position: 'relative', marginRight: 15 },
  userImage: { width: 60, height: 60, borderRadius: 30 },
  placeholderImage: { backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center' },
  cameraBtn: {
    position: 'absolute', bottom: 0, right: 0,
    backgroundColor: '#ff4500',
    width: 24, height: 24, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  userInfo: { flex: 1 },
  userName: { fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  userDetails: { fontSize: 12, color: '#888', marginBottom: 2 },
  editBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#fff0e6',
    justifyContent: 'center', alignItems: 'center',
    marginLeft: 10,
  },
  inputName: {
    fontSize: 18, fontWeight: 'bold',
    borderBottomWidth: 1, borderBottomColor: '#ccc',
    padding: 0, marginBottom: 4,
  },
  inputEmail: {
    fontSize: 12, color: '#333',
    borderBottomWidth: 1, borderBottomColor: '#ccc',
    padding: 0, marginTop: 2,
  },
  menuContainer: { gap: 15, marginBottom: 30 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center' },
  iconContainer: {
    width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 15,
  },
  menuTitle: { fontSize: 15, fontWeight: '600', color: '#333' },
  logoutBtn: {
    paddingVertical: 15, borderRadius: 25,
    borderWidth: 1, borderColor: '#ff4500',
    alignItems: 'center', backgroundColor: '#fff',
  },
  logoutText: { color: '#ff4500', fontSize: 16, fontWeight: 'bold' },
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: 15, backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#f0f0f0',
  },
  navItem: { alignItems: 'center' },
  navText: { fontSize: 10, marginTop: 5, color: '#888' },
});
