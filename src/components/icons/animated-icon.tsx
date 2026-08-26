import React, { useState } from 'react';
import { StyleSheet, View, Text, ImageBackground } from 'react-native';
import Animated, { Easing, Keyframe, FadeIn, FadeOut } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DURATION = 3000;

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const overlayKeyframe = new Keyframe({
    0: { opacity: 1 },
    80: { opacity: 1 },
    100: { opacity: 0 },
  });

  const logoKeyframe = new Keyframe({
    0: { transform: [{ scale: 0.5 }, { translateY: -50 }], opacity: 0 },
    30: { transform: [{ scale: 1.1 }, { translateY: 0 }], opacity: 1, easing: Easing.elastic(1.2) },
    100: { transform: [{ scale: 1 }, { translateY: 0 }], opacity: 1 },
  });

  const textKeyframe = new Keyframe({
    0: { opacity: 0, transform: [{ translateY: 20 }] },
    40: { opacity: 0, transform: [{ translateY: 20 }] },
    60: { opacity: 1, transform: [{ translateY: 0 }] },
    100: { opacity: 1, transform: [{ translateY: 0 }] },
  });

  const mascotKeyframe = new Keyframe({
    0: { transform: [{ scale: 0 }, { translateY: 50 }], opacity: 0 },
    50: { transform: [{ scale: 1.2 }, { translateY: 0 }], opacity: 1, easing: Easing.elastic(1.5) },
    100: { transform: [{ scale: 1 }, { translateY: 0 }], opacity: 1 },
  });

  return (
    <Animated.View
      entering={overlayKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashContainer}
    >
      <ImageBackground 
        source={require('@/assets/images/logo-glow.png')}
        style={styles.background}
        blurRadius={10}
      >
        <View style={styles.overlay}>
          <Animated.Image 
            source={require('@/assets/images/Dataudupi-Title.jpg')} 
            style={styles.logo} 
            entering={logoKeyframe.duration(DURATION * 0.8)}
            resizeMode="contain"
          />
          
          <Animated.Text 
            style={styles.subtitle}
            entering={textKeyframe.duration(DURATION * 0.8)}
          >
            40 YEARS OF EXCELLENCE IN SOUTH INDIAN VEGETARIAN CUISINE
          </Animated.Text>

          <View style={styles.mascotContainer}>
            <Animated.Image 
              source={require('@/assets/images/chef_mascot.png')} 
              style={styles.mascot} 
              entering={mascotKeyframe.duration(DURATION * 0.8)}
              resizeMode="contain"
            />
          </View>
        </View>
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  splashContainer: {
    ...(StyleSheet.absoluteFill as any),
    zIndex: 9999,
  },
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  logo: {
    width: 250,
    height: 80,
    marginBottom: 20,
  },
  subtitle: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 2,
    lineHeight: 18,
    marginBottom: 60,
  },
  mascotContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  mascot: {
    width: 280,
    height: 200,
  },
});
