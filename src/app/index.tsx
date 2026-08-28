import React, { useEffect, useRef } from 'react';
import { View, Text, Image, StyleSheet, Dimensions, StatusBar, TouchableOpacity, ImageBackground, Animated, Easing } from 'react-native';
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

        <TouchableOpacity activeOpacity={1} style={styles.container} onPress={navigateToHome}>
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

            <Animated.Text style={[styles.subtitleText, { opacity: subOpacity, transform: [{ translateY: subTranslateY }] }, { marginBottom: 25 }]}>
              {"40 YEARS OF EXCELLENCE IN SOUTH INDIAN\nVEGETARIAN CUISINE"}
            </Animated.Text>

            <Animated.Image
              source={require('../../assets/images/Dataudupi.png')}
              style={[styles.logo, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
              resizeMode="contain"
            />
          </View>

          {/* Footer Area: Large Mascot + Loading Symbol at the very bottom */}
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
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerContainer: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 40,
  },
  mascot: {
    width: 220,
    height: 220,
    marginBottom: 10,
  },
  topBoardWrapper: {
    position: 'absolute',
    top: 25,
    alignSelf: 'center',
    zIndex: 10,
    alignItems: 'center',
  },
  topBannerImage: {
    width: width * 0.8,
    height: 80,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 40,
  },
  spinnerRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderTopColor: '#ff4500',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  spinnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ff8c00',
    marginTop: -3,
  },
});
