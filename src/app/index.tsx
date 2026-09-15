import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, StatusBar, TouchableOpacity, ImageBackground, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useAuthStore, useRestaurantStore } from '../store';

const { width, height } = Dimensions.get('window');
const AnimatedImageBackground = Animated.createAnimatedComponent(ImageBackground);

export default function SplashScreen() {
  const router = useRouter();
  const { isAuthenticated } = useAuthStore();
  const { selectedOutlet } = useRestaurantStore();

  const navigateToHome = () => {
    if (isAuthenticated) {
      if (selectedOutlet) {
        router.replace('/home');
      } else {
        router.replace('/outlet-selector');
      }
    } else {
      router.replace('/login');
    }
  };

  useEffect(() => {
    const timer = setTimeout(navigateToHome, 5000); // Navigate after 5 seconds
    return () => clearTimeout(timer);
  }, [isAuthenticated]);

  // Shared animation values
  const bgScale = useSharedValue(1.15);
  const bgOpacity = useSharedValue(0);
  const welcomeOpacity = useSharedValue(0);
  const welcomeTranslateY = useSharedValue(-20);
  const logoScale = useSharedValue(0.7);
  const logoOpacity = useSharedValue(0);
  const subOpacity = useSharedValue(0);
  const subTranslateY = useSharedValue(20);
  const mascotOpacity = useSharedValue(0);
  const mascotTranslateY = useSharedValue(40);
  const loaderOpacity = useSharedValue(0);
  const rotation = useSharedValue(0);
  const topBoardTranslateY = useSharedValue(-60);

  useEffect(() => {
    // 1. Background Image
    bgOpacity.value = withTiming(1, { duration: 1000 });
    bgScale.value = withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) });

    // 2. "Welcome To" Text
    welcomeOpacity.value = withSequence(
      withTiming(0, { duration: 300 }),
      withTiming(1, { duration: 700 })
    );
    welcomeTranslateY.value = withSequence(
      withTiming(-20, { duration: 300 }),
      withTiming(0, { duration: 700, easing: Easing.out(Easing.back(1.5)) })
    );

    // 3. Main logo
    logoOpacity.value = withSequence(
      withTiming(0, { duration: 500 }),
      withTiming(1, { duration: 700 })
    );
    logoScale.value = withSequence(
      withTiming(0.7, { duration: 500 }),
      withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.5)) })
    );

    // 4. Subtitle Text
    subOpacity.value = withSequence(
      withTiming(0, { duration: 800 }),
      withTiming(1, { duration: 700 })
    );
    subTranslateY.value = withSequence(
      withTiming(20, { duration: 800 }),
      withTiming(0, { duration: 700, easing: Easing.out(Easing.quad) })
    );

    // 5. Chef Mascot
    mascotOpacity.value = withSequence(
      withTiming(0, { duration: 1000 }),
      withTiming(1, { duration: 800 })
    );
    mascotTranslateY.value = withSequence(
      withTiming(40, { duration: 1000 }),
      withTiming(0, { duration: 800, easing: Easing.out(Easing.back(1.4)) })
    );

    // 6. Loader Spinner
    loaderOpacity.value = withSequence(
      withTiming(0, { duration: 1400 }),
      withTiming(1, { duration: 600 })
    );

    // 7. Infinite spinner rotation
    rotation.value = withRepeat(
      withTiming(360, { duration: 1200, easing: Easing.linear }),
      -1,
      false
    );

    // 8. Top board slide down
    topBoardTranslateY.value = withSequence(
      withTiming(-60, { duration: 200 }),
      withTiming(0, { duration: 800, easing: Easing.out(Easing.back(1.2)) })
    );
  }, []);

  const bgAnimatedStyle = useAnimatedStyle(() => ({
    opacity: bgOpacity.value,
    transform: [{ scale: bgScale.value }],
  }));

  const welcomeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: welcomeOpacity.value,
    transform: [{ translateY: welcomeTranslateY.value }],
  }));

  const logoAnimatedStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ scale: logoScale.value }],
  }));

  const subAnimatedStyle = useAnimatedStyle(() => ({
    opacity: subOpacity.value,
    transform: [{ translateY: subTranslateY.value }],
  }));

  const mascotAnimatedStyle = useAnimatedStyle(() => ({
    opacity: mascotOpacity.value,
    transform: [{ translateY: mascotTranslateY.value }],
  }));

  const loaderAnimatedStyle = useAnimatedStyle(() => ({
    opacity: loaderOpacity.value,
  }));

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const topBoardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: topBoardTranslateY.value }],
  }));

  return (
    <AnimatedImageBackground
      source={require('../../assets/images/frontpage_bg.png')}
      style={[styles.backgroundImage, bgAnimatedStyle]}
      resizeMode="cover"
    >
      {/* Dark overlay for contrast and premium aesthetic */}
      <View style={styles.overlay} />

      <TouchableOpacity activeOpacity={1} style={styles.touchableContainer} onPress={navigateToHome}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        <SafeAreaView style={styles.safeAreaContent} edges={['top', 'bottom', 'left', 'right']}>
          {/* Top Section: Hanging Banner */}
          <View style={styles.topSection}>
            <Animated.View style={topBoardAnimatedStyle}>
              <Image 
                source={require('../../assets/images/udupi-banner.png')} 
                style={styles.topBannerImage} 
                resizeMode="contain" 
              />
            </Animated.View>
          </View>

          {/* Middle Section: Perfectly centered Welcome + Logo + Tagline */}
          <View style={styles.middleSection}>
            <Animated.Text style={[styles.welcomeText, welcomeAnimatedStyle]}>
              Welcome To
            </Animated.Text>

            <Animated.Image
              source={require('../../assets/images/Dataudupi.png')}
              style={[styles.logo, logoAnimatedStyle]}
              resizeMode="contain"
            />

            <Animated.Text style={[styles.subtitleText, subAnimatedStyle]}>
              {"40 YEARS OF EXCELLENCE IN SOUTH INDIAN\nVEGETARIAN CUISINE"}
            </Animated.Text>
          </View>

          {/* Bottom Section: Chef Mascot + Spinner */}
          <Animated.View style={[styles.bottomSection, mascotAnimatedStyle]}>
            <Image
              source={require('../../assets/images/chef_mascot.png')}
              style={styles.mascot}
              resizeMode="contain"
            />

            <Animated.View style={[styles.loadingContainer, loaderAnimatedStyle]}>
              <Animated.View style={[styles.spinnerRing, spinnerStyle]}>
                <View style={styles.spinnerDot} />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </SafeAreaView>
      </TouchableOpacity>
    </AnimatedImageBackground>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.84)',
  },
  touchableContainer: {
    flex: 1,
    width: '100%',
  },
  safeAreaContent: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  topSection: {
    width: '100%',
    alignItems: 'center',
    paddingTop: Platform.OS === 'android' ? 10 : 0,
  },
  topBannerImage: {
    width: Math.min(width * 0.65, 230),
    height: 70,
  },
  middleSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  welcomeText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 4,
    marginBottom: 14,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  logo: {
    width: Math.min(width * 0.82, 300),
    height: 95,
    marginBottom: 16,
  },
  subtitleText: {
    color: 'rgba(255, 255, 255, 0.82)',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 2,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 20,
    textTransform: 'uppercase',
  },
  bottomSection: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 10,
  },
  mascot: {
    width: 185,
    height: 185,
    marginBottom: 8,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 44,
  },
  spinnerRing: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: 'rgba(255, 69, 0, 0.2)',
    borderTopColor: '#ff4500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#ff4500',
    position: 'absolute',
    top: 2,
  },
});
