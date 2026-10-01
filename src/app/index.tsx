import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, StatusBar, TouchableOpacity, ImageBackground, Animated, Easing, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore, useRestaurantStore } from '../store';

const { width } = Dimensions.get('window');

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
    const timer = setTimeout(navigateToHome, 4000);
    return () => clearTimeout(timer);
  }, [isAuthenticated, selectedOutlet]);

  // Animated values using React Native built-in Animated (100% native driver & crash-safe)
  const bgScale = useRef(new Animated.Value(1.15)).current;
  const bgOpacity = useRef(new Animated.Value(0)).current;
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const welcomeTranslateY = useRef(new Animated.Value(-25)).current;
  const logoScale = useRef(new Animated.Value(0.6)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const subOpacity = useRef(new Animated.Value(0)).current;
  const subTranslateY = useRef(new Animated.Value(25)).current;
  const mascotOpacity = useRef(new Animated.Value(0)).current;
  const mascotTranslateY = useRef(new Animated.Value(90)).current;
  const loaderOpacity = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;
  const topBoardTranslateY = useRef(new Animated.Value(-100)).current;

  useEffect(() => {
    // 1. Background Image
    Animated.parallel([
      Animated.timing(bgOpacity, { toValue: 1, duration: 1000, useNativeDriver: true }),
      Animated.timing(bgScale, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    // 2. "Welcome To" Text
    const timer1 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(welcomeOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(welcomeTranslateY, { toValue: 0, duration: 800, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
      ]).start();
    }, 300);

    // 3. Main logo
    const timer2 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(logoOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(logoScale, { toValue: 1, duration: 800, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      ]).start();
    }, 600);

    // 4. Subtitle Text
    const timer3 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(subOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(subTranslateY, { toValue: 0, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }, 900);

    // 5. Chef Mascot
    const timer4 = setTimeout(() => {
      Animated.parallel([
        Animated.timing(mascotOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(mascotTranslateY, { toValue: 0, duration: 900, easing: Easing.out(Easing.back(1.4)), useNativeDriver: true }),
      ]).start();
    }, 1200);

    // 6. Loader Spinner
    const timer5 = setTimeout(() => {
      Animated.timing(loaderOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    }, 1600);

    // 7. Infinite spinner rotation
    Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // 8. Top board slide down
    const timer6 = setTimeout(() => {
      Animated.timing(topBoardTranslateY, {
        toValue: 0,
        duration: 1000,
        easing: Easing.bounce,
        useNativeDriver: true,
      }).start();
    }, 200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
      clearTimeout(timer6);
    };
  }, []);

  const spin = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.backgroundImage, { opacity: bgOpacity, transform: [{ scale: bgScale }] }]}>
      <ImageBackground
        source={require('../../assets/images/frontpage_bg.png')}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      >
        {/* Dark overlay for contrast and premium aesthetic */}
        <View style={styles.overlay} />

        <TouchableOpacity activeOpacity={1} style={styles.touchableContainer} onPress={navigateToHome}>
          <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

          {/* Top Hanging Banner */}
          <Animated.View style={[styles.topBoardWrapper, { transform: [{ translateY: topBoardTranslateY }] }]}>
            <Image 
              source={require('../../assets/images/udupi-banner.png')} 
              style={styles.topBannerImage} 
              resizeMode="contain" 
            />
          </Animated.View>

          {/* Middle Area: Reveals in order */}
          <View style={styles.middleContainer}>
            <Animated.Text style={[styles.welcomeText, { opacity: welcomeOpacity, transform: [{ translateY: welcomeTranslateY }] }]}>
              Welcome To
            </Animated.Text>

            <Animated.Image
              source={require('../../assets/images/Dataudupi.png')}
              style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
              resizeMode="contain"
            />

            <Animated.Text style={[styles.subtitleText, { opacity: subOpacity, transform: [{ translateY: subTranslateY }] }, { marginBottom: 25 }]}>
              {"40 YEARS OF EXCELLENCE IN SOUTH INDIAN\nVEGETARIAN CUISINE"}
            </Animated.Text>
          </View>

          {/* Footer Area: Large Mascot + Loading Symbol at the bottom */}
          <Animated.View style={[styles.footerContainer, { opacity: mascotOpacity, transform: [{ translateY: mascotTranslateY }] }]}>
            <Image
              source={require('../../assets/images/chef_mascot.png')}
              style={styles.mascot}
              resizeMode="contain"
            />

            <Animated.View style={[styles.loadingContainer, { opacity: loaderOpacity }]}>
              <Animated.View style={[styles.spinnerRing, { transform: [{ rotate: spin }] }]}>
                <View style={styles.spinnerDot} />
              </Animated.View>
            </Animated.View>
          </Animated.View>
        </TouchableOpacity>
      </ImageBackground>
    </Animated.View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  topBoardWrapper: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 25 : 40,
    alignSelf: 'center',
    zIndex: 10,
    alignItems: 'center',
  },
  topBannerImage: {
    width: Math.min(width * 0.7, 240),
    height: 70,
  },
  middleContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Platform.OS === 'android' ? 120 : 140,
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
  },
  footerContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 25,
  },
  mascot: {
    width: 200,
    height: 200,
    marginBottom: 10,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  },
  spinnerRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    borderColor: 'rgba(255, 69, 0, 0.2)',
    borderTopColor: '#ff4500',
    alignItems: 'center',
    justifyContent: 'flex-start',
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
