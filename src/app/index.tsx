import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, StatusBar, TouchableOpacity, ImageBackground } from 'react-native';
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
  const welcomeTranslateY = useSharedValue(-25);
  const logoScale = useSharedValue(0.6);
  const logoOpacity = useSharedValue(0);
  const subOpacity = useSharedValue(0);
  const subTranslateY = useSharedValue(25);
  const mascotOpacity = useSharedValue(0);
  const mascotTranslateY = useSharedValue(90);
  const loaderOpacity = useSharedValue(0);
  const rotation = useSharedValue(0);
  const topBoardTranslateY = useSharedValue(-100);

  useEffect(() => {
    // 1. Background Image
    bgOpacity.value = withTiming(1, { duration: 1000 });
    bgScale.value = withTiming(1, { duration: 1800, easing: Easing.out(Easing.quad) });

    // 2. "Welcome To" Text
    welcomeOpacity.value = withSequence(
      withTiming(0, { duration: 300 }),
      withTiming(1, { duration: 800 })
    );
    welcomeTranslateY.value = withSequence(
      withTiming(-25, { duration: 300 }),
      withTiming(0, { duration: 800, easing: Easing.out(Easing.back(1.5)) })
    );

    // 3. Main logo
    logoOpacity.value = withSequence(
      withTiming(0, { duration: 600 }),
      withTiming(1, { duration: 800 })
    );
    logoScale.value = withSequence(
      withTiming(0.6, { duration: 600 }),
      withTiming(1, { duration: 800, easing: Easing.out(Easing.back(1.6)) })
    );

    // 4. Subtitle Text
    subOpacity.value = withSequence(
      withTiming(0, { duration: 900 }),
      withTiming(1, { duration: 800 })
    );
    subTranslateY.value = withSequence(
      withTiming(25, { duration: 900 }),
      withTiming(0, { duration: 800, easing: Easing.out(Easing.quad) })
    );

    // 5. Chef Mascot
    mascotOpacity.value = withSequence(
      withTiming(0, { duration: 1200 }),
      withTiming(1, { duration: 800 })
    );
    mascotTranslateY.value = withSequence(
      withTiming(90, { duration: 1200 }),
      withTiming(0, { duration: 900, easing: Easing.out(Easing.back(1.4)) })
    );

    // 6. Loader Spinner
    loaderOpacity.value = withSequence(
      withTiming(0, { duration: 1600 }),
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
      withTiming(-100, { duration: 200 }),
      withTiming(0, { duration: 1000, easing: Easing.bounce })
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

      <TouchableOpacity activeOpacity={1} style={styles.container} onPress={navigateToHome}>
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

        {/* Top Hanging Banner */}
        <Animated.View style={[styles.topBoardWrapper, topBoardAnimatedStyle]}>
          <Image 
            source={require('../../assets/images/udupi-banner.png')} 
            style={styles.topBannerImage} 
            resizeMode="contain" 
          />
        </Animated.View>

        {/* Middle Area: Reveals in order */}
        <View style={styles.middleContainer}>
          <Animated.Text style={[styles.welcomeText, welcomeAnimatedStyle]}>
            Welcome To
          </Animated.Text>

          <Animated.Text style={[styles.subtitleText, subAnimatedStyle, { marginBottom: 25 }]}>
            {"40 YEARS OF EXCELLENCE IN SOUTH INDIAN\nVEGETARIAN CUISINE"}
          </Animated.Text>

          <Animated.Image
            source={require('../../assets/images/Dataudupi.png')}
            style={[styles.logo, logoAnimatedStyle]}
            resizeMode="contain"
          />
        </View>

        {/* Footer Area: Large Mascot + Loading Symbol at the very bottom */}
        <Animated.View style={[styles.footerContainer, mascotAnimatedStyle]}>
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
    backgroundColor: 'rgba(0, 0, 0, 0.84)', // Sleek, dark transparent overlay to resolve brightness
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  middleContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  welcomeText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
    fontFamily: 'serif',
    letterSpacing: 3,
    marginBottom: 20,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  logo: {
    width: width * 0.85,
    height: 140,
  },
  subtitleText: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'serif',
    letterSpacing: 2.2,
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 20,
    textTransform: 'uppercase',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 20,
    alignItems: 'center',
    width: '100%',
  },
  mascot: {
    width: 200,
    height: 200,
    marginBottom: 10,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    height: 60,
  },
  spinnerRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3.5,
    borderColor: 'rgba(255, 69, 0, 0.15)',
    borderTopColor: '#ff4500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spinnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff4500',
    position: 'absolute',
    top: 2,
  },
  topBoardWrapper: {
    position: 'absolute',
    top: 40,
    alignItems: 'center',
    width: '100%',
    zIndex: 10,
  },
  topBannerImage: {
    width: 250,
    height: 100,
  }
});
