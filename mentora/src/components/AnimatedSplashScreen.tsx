import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Easing } from 'react-native';

interface AnimatedSplashScreenProps {
  authReady: boolean;
  onFinish: () => void;
}

export function AnimatedSplashScreen({ authReady, onFinish }: AnimatedSplashScreenProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const hasMinTimeElapsed = useRef(false);

  useEffect(() => {
    // Pulse animation (logo grows and shrinks)
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.15,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    // Force the splash screen to stay for at least 1.5 seconds so the user can see the animation
    const timer = setTimeout(() => {
      hasMinTimeElapsed.current = true;
      checkFinish();
    }, 1500);

    return () => {
      clearTimeout(timer);
      loop.stop();
    };
  }, []);

  const checkFinish = () => {
    // We only finish if BOTH the minimum time has elapsed AND AuthContext finished loading
    if (hasMinTimeElapsed.current && authReady) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        onFinish();
      });
    }
  };

  useEffect(() => {
    checkFinish();
  }, [authReady]);

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <Animated.Image 
        source={require('../../assets/images/splash-icon.png')} 
        style={[styles.logo, { transform: [{ scale: pulseAnim }] }]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#208AEF', // Matches app.json native splash background
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999, // Ensure it covers everything
  },
  logo: {
    width: 76, // Matches app.json imageWidth
    height: 76,
    resizeMode: 'contain',
  }
});
