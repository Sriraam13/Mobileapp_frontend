import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { BrandColors } from '../../constants/theme';

export type BottomNavTab = 'home' | 'search' | 'menu' | 'orders' | 'profile';

interface BottomNavBarProps {
  activeTab?: BottomNavTab;
  onSearchPress?: () => void;
  onMenuPress?: () => void;
}

export default function BottomNavBar({ activeTab, onSearchPress, onMenuPress }: BottomNavBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 10) + 6;

  const pathname = usePathname();

  const isCurrent = (target: string) => {
    if (!pathname) return false;
    return pathname === target || pathname.endsWith(target);
  };

  const handleHome = () => {
    if (!isCurrent('/home')) {
      router.replace('/home');
    }
  };

  const handleMenu = () => {
    if (onMenuPress) {
      onMenuPress();
    } else if (onSearchPress) {
      onSearchPress();
    } else if (!isCurrent('/menu')) {
      router.replace('/menu' as any);
    }
  };

  const handleOrders = () => {
    if (!isCurrent('/orders')) {
      router.replace('/orders' as any);
    }
  };

  const handleProfile = () => {
    if (!isCurrent('/profile')) {
      router.replace('/profile');
    }
  };

  const isMenuActive = activeTab === 'menu' || activeTab === 'search';

  const getTabColor = (tab: BottomNavTab) =>
    (activeTab === tab || (tab === 'menu' && isMenuActive)) ? '#FF3400' : '#6B7280';

  return (
    <View style={[styles.bottomNav, { paddingBottom: bottomPadding }]}>
      {/* Home */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={handleHome}
        activeOpacity={0.7}
      >
        <View style={styles.iconBox}>
          <Ionicons
            name="home-outline"
            size={22}
            color={getTabColor('home')}
          />
        </View>
        <Text style={[styles.navText, activeTab === 'home' && styles.navTextActive]}>
          Home
        </Text>
      </TouchableOpacity>

      {/* Menu */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={handleMenu}
        activeOpacity={0.7}
      >
        <View style={styles.iconBox}>
          <Ionicons
            name={isMenuActive ? 'restaurant' : 'restaurant-outline'}
            size={22}
            color={getTabColor('menu')}
          />
        </View>
        <Text style={[styles.navText, isMenuActive && styles.navTextActive]}>
          Menu
        </Text>
      </TouchableOpacity>

      {/* Orders */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={handleOrders}
        activeOpacity={0.7}
      >
        <View style={styles.iconBox}>
          <Ionicons
            name="receipt-outline"
            size={22}
            color={getTabColor('orders')}
          />
          <Text style={[styles.dollarBadge, { color: getTabColor('orders') }]}>
            $
          </Text>
        </View>
        <Text style={[styles.navText, activeTab === 'orders' && styles.navTextActive]}>
          Orders
        </Text>
      </TouchableOpacity>

      {/* Profile */}
      <TouchableOpacity
        style={styles.navItem}
        onPress={handleProfile}
        activeOpacity={0.7}
      >
        <View style={styles.iconBox}>
          <Ionicons
            name="person-outline"
            size={22}
            color={getTabColor('profile')}
          />
        </View>
        <Text style={[styles.navText, activeTab === 'profile' && styles.navTextActive]}>
          Profile
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: -2 },
    shadowRadius: 5,
    zIndex: 100,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 64,
  },
  iconBox: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dollarBadge: {
    position: 'absolute',
    fontSize: 9,
    fontWeight: '800',
    top: 5.5,
  },
  navText: {
    fontFamily: Platform.select({ ios: 'Poppins', android: 'Poppins' }),
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    marginTop: 2,
    color: '#6B7280',
    textAlign: 'center',
  },
  navTextActive: {
    color: '#FF3400',
    fontWeight: '600',
  },
});
