import React, { useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Dimensions,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  Easing,
  interpolateColor,
  interpolate,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Home, BookOpen, MessagesSquare, UserRound } from 'lucide-react-native';

// ─── Constants ─────────────────────────────────────────────────────────────────
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_WIDTH = Math.min(SCREEN_WIDTH - 40, 390); // Mobile width target 360-390
const TAB_COUNT = 4;
const ITEM_WIDTH = BAR_WIDTH / TAB_COUNT;
const BUBBLE_W = 52;
const BUBBLE_H = 48;
const BAR_HEIGHT = 72; // 68-74px requested

const TABS = [
  { name: 'index',   label: 'Home',    Icon: Home },
  { name: 'courses', label: 'Courses', Icon: BookOpen },
  { name: 'rooms',   label: 'Rooms',   Icon: MessagesSquare },
  { name: 'profile', label: 'Profile', Icon: UserRound },
] as const;

// Physics: high damping, medium stiffness. "Feels like physical glass sliding."
const SPRING_BUBBLE = { damping: 22, stiffness: 220, mass: 1.1 };
const SPRING_ICON = { damping: 14, stiffness: 280, mass: 0.9 };

// "Microscopic grain texture" for etched glass feel.
const NOISE_BASE64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyBAMAAADsEZWCAAAAGFBMVEUAAAAAAP////////////////////////8F5Jj+AAAACHRSTlMA/////////9n632MAAABySURBVDjLxY3BEoMwDAQzGZ/R///RDCv0Yk/b2TkD6V2ZtTnnH2N8b/jP0W+N1t0b1r93rP7esXofrN4Hq/fB6n2weh+s3ger98HqfbB6H6zeB6v3wep9sHofbLwP1r93vP5u+M/Rb43W3Rvf25zzD6yYDhG5q8aHAAAAAElFTkSuQmCC';

// ─── Single Tab Item ───────────────────────────────────────────────────────────
type TabItemProps = {
  tab: typeof TABS[number];
  isActive: boolean;
  onPress: () => void;
};

function TabItem({ tab, isActive, onPress }: TabItemProps) {
  // Icon lifting and scaling
  const translateY = useSharedValue(isActive ? -4 : 0);
  const scale = useSharedValue(1);
  const activeProgress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    translateY.value = withSpring(isActive ? -4 : 0, SPRING_ICON);
    activeProgress.value = withTiming(isActive ? 1 : 0, { duration: 300 });

    if (isActive) {
      // 1.00 -> 1.15 -> 1.00 natural bounce
      scale.value = withSequence(
        withSpring(1.15, { damping: 12, stiffness: 300 }),
        withSpring(1.0, { damping: 14, stiffness: 250 })
      );
    } else {
      scale.value = withSpring(1.0, SPRING_ICON);
    }
  }, [isActive]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    opacity: activeProgress.value,
    transform: [{ translateY: interpolate(activeProgress.value, [0, 1], [4, 0]) }],
  }));

  return (
    <Pressable
      style={styles.tabItem}
      onPress={onPress}
      onPressIn={() => {
        scale.value = withSpring(0.95, { damping: 20, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(isActive ? 1.0 : 1.0, SPRING_ICON);
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
    >
      <Animated.View style={[styles.iconWrapper, animStyle]}>
        <tab.Icon
          size={24}
          color={isActive ? '#FFFFFF' : 'rgba(160, 170, 180, 0.7)'}
          strokeWidth={isActive ? 2.2 : 2.0}
        />
        {/* Label fades in to bold when active */}
        <Animated.View style={[styles.labelContainer, labelStyle]}>
          <Text style={styles.label}>{tab.label}</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ─── Main Tab Bar ──────────────────────────────────────────────────────────────
export function MentoraTabBar({ state, navigation }: any) {
  const activeIndex = state.index;

  // 1. Sliding Bubble Position
  const bubbleX = useSharedValue(
    activeIndex * ITEM_WIDTH + (ITEM_WIDTH - BUBBLE_W) / 2
  );

  useEffect(() => {
    const target = activeIndex * ITEM_WIDTH + (ITEM_WIDTH - BUBBLE_W) / 2;
    bubbleX.value = withSpring(target, SPRING_BUBBLE);
  }, [activeIndex]);

  const bubbleAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: bubbleX.value }],
  }));

  // 2. Slow Reflection Sweep (15s loop)
  const reflectionX = useSharedValue(-BAR_WIDTH);
  
  useEffect(() => {
    reflectionX.value = withRepeat(
      withTiming(BAR_WIDTH * 2, {
        duration: 16000,
        easing: Easing.linear,
      }),
      -1,
      false
    );
  }, []);

  const reflectionAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reflectionX.value }],
  }));

  // 3. Continuous Floating Effect (1-2px)
  const floatY = useSharedValue(0);

  useEffect(() => {
    floatY.value = withRepeat(
      withSequence(
        withTiming(-1.5, { duration: 2500, easing: Easing.inOut(Easing.sin) }),
        withTiming(1.5, { duration: 2500, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      true
    );
  }, []);

  const floatAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: floatY.value }],
    shadowOffset: { width: 0, height: interpolate(floatY.value, [-1.5, 1.5], [12, 8]) },
    shadowOpacity: interpolate(floatY.value, [-1.5, 1.5], [0.15, 0.12]),
  }));

  return (
    <Animated.View style={[styles.outerContainer, floatAnimStyle]} pointerEvents="box-none">
      <View style={styles.barContainer}>
        {/* 1. Frosted Glass Blur Backdrop */}
        <BlurView
          tint="light"
          intensity={40}
          style={StyleSheet.absoluteFillObject}
        />

        {/* 2. White Tint & Edge Lighting (10-15% white opacity) */}
        <LinearGradient
          colors={['rgba(255,255,255,0.18)', 'rgba(255,255,255,0.06)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
          pointerEvents="none"
        />

        {/* 3. Microscopic Grain Texture */}
        <Image
          source={{ uri: NOISE_BASE64 }}
          style={styles.noiseTexture}
          resizeMode="repeat"
        />

        {/* 4. Sliding Light Reflection (Glass sheen) */}
        <Animated.View style={[styles.reflectionContainer, reflectionAnimStyle]} pointerEvents="none">
          <LinearGradient
            colors={['rgba(255,255,255,0.0)', 'rgba(255,255,255,0.15)', 'rgba(255,255,255,0.0)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>

        {/* 5. Active Bubble Track */}
        <Animated.View style={[styles.bubbleTrack, bubbleAnimStyle]} pointerEvents="none">
          {/* Bubble Glow / Bloom */}
          <View style={styles.bubbleBloom} />
          {/* Bubble Material (20% opacity gradient) */}
          <LinearGradient
            colors={['rgba(69, 240, 199, 0.25)', 'rgba(59, 130, 246, 0.20)', 'rgba(124, 92, 255, 0.25)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bubble}
          />
          <View style={styles.bubbleHighlight} />
        </Animated.View>

        {/* 6. Navigation Items */}
        <View style={styles.tabsRow}>
          {TABS.map((tab, index) => {
            const isActive = index === activeIndex;
            const onPress = () => {
              if (!isActive) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
              }
              const event = navigation.emit({
                type: 'tabPress',
                target: state.routes[index]?.key,
                canPreventDefault: true,
              });
              if (!isActive && !event.defaultPrevented) {
                navigation.navigate(state.routes[index].name);
              }
            };
            return (
              <TabItem
                key={tab.name}
                tab={tab}
                isActive={isActive}
                onPress={onPress}
              />
            );
          })}
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    left: 0,
    right: 0,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  barContainer: {
    width: BAR_WIDTH,
    height: BAR_HEIGHT,
    borderRadius: 40, // Large rounded corners (40px+)
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)', // Hairline white border
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  noiseTexture: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.03, // Very subtle 2-3%
    pointerEvents: 'none',
  },
  reflectionContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 150,
    transform: [{ skewX: '-20deg' }],
  },
  bubbleTrack: {
    position: 'absolute',
    top: (BAR_HEIGHT - BUBBLE_H) / 2,
    width: BUBBLE_W,
    height: BUBBLE_H,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
  },
  bubbleBloom: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    left: -10,
    right: -10,
    borderRadius: 40,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    // Fake blur bloom for React Native
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  bubbleHighlight: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 2,
  },
  tabsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItem: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelContainer: {
    position: 'absolute',
    bottom: -16,
    width: 60,
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});

