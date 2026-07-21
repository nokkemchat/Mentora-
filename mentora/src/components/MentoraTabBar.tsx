import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useDerivedValue,
  interpolate,
  interpolateColor,
  Extrapolation,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_WIDTH = Math.min(SCREEN_WIDTH - 40, 390);
const TAB_COUNT = 4;
const ITEM_WIDTH = BAR_WIDTH / TAB_COUNT;
const PILL_WIDTH = ITEM_WIDTH - 24; // Generous padding inside
const PILL_HEIGHT = 56;
const BAR_HEIGHT = 72;

// The physics requested by the user
const SPRING_CONFIG = {
  stiffness: 380,
  damping: 30,
  mass: 0.9,
  overshootClamping: false,
};

const TABS = [
  { name: 'index',   label: 'Home',    activeIcon: 'home',              inactiveIcon: 'home-outline' },
  { name: 'courses', label: 'Courses', activeIcon: 'library',           inactiveIcon: 'library-outline' },
  { name: 'rooms',   label: 'Rooms',   activeIcon: 'chatbubbles',       inactiveIcon: 'chatbubbles-outline' },
  { name: 'profile', label: 'Profile', activeIcon: 'person-circle',     inactiveIcon: 'person-circle-outline' },
] as const;

type TabItemProps = {
  tab: typeof TABS[number];
  isActive: boolean;
  onPress: () => void;
  themeColors: any;
  isDark: boolean;
};

function TabItem({ tab, isActive, onPress, themeColors, isDark }: TabItemProps) {
  // Shared values for transitions
  const activeProgress = useSharedValue(isActive ? 1 : 0);

  useEffect(() => {
    activeProgress.value = withSpring(isActive ? 1 : 0, SPRING_CONFIG);
  }, [isActive]);

  // Active Icon color depends on theme
  // Made monochrome (colorless) for maximum readability as requested
  const activeIconColor = isDark ? '#FFFFFF' : '#1C1C1E';
  const inactiveIconColor = isDark ? '#A1A1AA' : '#71717A';

  const iconAnimStyle = useAnimatedStyle(() => {
    const scale = interpolate(activeProgress.value, [0, 1], [1, 1.15], Extrapolation.CLAMP);
    
    return {
      transform: [
        { scale }
      ],
    };
  });

  const labelAnimStyle = useAnimatedStyle(() => {
    const translateY = interpolate(activeProgress.value, [0, 1], [10, 0], Extrapolation.CLAMP);
    const opacity = interpolate(activeProgress.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    
    return {
      opacity,
      transform: [{ translateY }],
    };
  });

  // Ionicons doesn't have strokeWidth, we just rely on the bold filled variant
  const iconName = isActive ? tab.activeIcon : tab.inactiveIcon;

  return (
    <Pressable
      style={styles.tabItem}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
    >
      <Animated.View style={[styles.iconWrapper, iconAnimStyle]}>
        <Ionicons
          name={iconName as any}
          size={24}
          color={isActive ? activeIconColor : inactiveIconColor}
        />
        <Animated.View style={[styles.labelContainer, labelAnimStyle]}>
          <Text style={[styles.label, { color: isActive ? activeIconColor : inactiveIconColor }]}>
            {tab.label}
          </Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export function MentoraTabBar({ state, navigation }: any) {
  const { colors, isDark } = useAppTheme();
  const activeIndex = state.index;

  const pillX = useSharedValue(
    activeIndex * ITEM_WIDTH + (ITEM_WIDTH - PILL_WIDTH) / 2
  );
  
  // To calculate the stretch based on velocity
  const prevX = useSharedValue(pillX.value);

  useEffect(() => {
    const target = activeIndex * ITEM_WIDTH + (ITEM_WIDTH - PILL_WIDTH) / 2;
    pillX.value = withSpring(target, SPRING_CONFIG);
  }, [activeIndex]);

  const pillAnimStyle = useAnimatedStyle(() => {
    // Calculate pseudo-velocity (distance moved per frame)
    const diff = Math.abs(pillX.value - prevX.value);
    prevX.value = pillX.value;
    
    // Stretch horizontally based on speed, max 30% stretch
    const scaleX = 1 + Math.min(diff / 25, 0.3);
    
    // Compress vertically slightly based on speed
    const scaleY = 1 - Math.min(diff / 100, 0.1);

    return {
      transform: [
        { translateX: pillX.value },
        { scaleX },
        { scaleY },
      ],
    };
  });

  // Make the background translucent to let the blur show through
  const barBgColor = isDark ? 'rgba(28, 28, 30, 0.65)' : 'rgba(255, 255, 255, 0.75)';
  const barBorderColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
  
  // Indicator color: Light = Navy (#1E3A8A), Dark = Gold (#FBBF24)
  const indicatorColor = isDark ? colors.accent : colors.primary;

  // Shadow styles based on theme
  const shadowStyle = isDark
    ? {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
      }
    : {
        shadowColor: '#64748B',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 12,
      };

  return (
    <View style={[styles.outerContainer, shadowStyle]} pointerEvents="box-none">
      <BlurView
        intensity={isDark ? 50 : 80}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.barContainer,
          { backgroundColor: barBgColor, borderColor: barBorderColor },
        ]}
      >
        {/* Continuous Active Indicator (Water Bubble / Liquid Glass) */}
        <Animated.View style={[styles.activePillContainer, pillAnimStyle]}>
          <View style={[styles.activePill, { backgroundColor: 'transparent' }]}>
            {/* Glass Curvature Gradient */}
            <LinearGradient
              colors={['rgba(255, 255, 255, 0.45)', 'rgba(255, 255, 255, 0.05)', 'rgba(255, 255, 255, 0.25)']}
              locations={[0, 0.5, 1]}
              start={{ x: 0.2, y: 0.1 }}
              end={{ x: 0.8, y: 0.9 }}
              style={StyleSheet.absoluteFillObject}
            />
          </View>
        </Animated.View>

        {/* Navigation Items */}
        <View style={styles.tabsRow}>
          {TABS.map((tab, index) => {
            const isActive = index === activeIndex;
            const onPress = () => {
              if (!isActive) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                themeColors={colors}
                isDark={isDark}
              />
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 36 : 24,
    alignSelf: 'center',
    width: BAR_WIDTH,
  },
  barContainer: {
    width: '100%',
    height: BAR_HEIGHT,
    borderRadius: 9999, // Perfect pill shape
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  activePillContainer: {
    position: 'absolute',
    top: (BAR_HEIGHT - PILL_HEIGHT) / 2,
    width: PILL_WIDTH,
    height: PILL_HEIGHT,
  },
  activePill: {
    width: '100%',
    height: '100%',
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    overflow: 'hidden',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 5,
  },
  bubbleSpecular: {
    position: 'absolute',
    top: 6,
    left: 12,
    width: 20,
    height: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    transform: [{ rotate: '-25deg' }],
  },
  bubbleBottomGlow: {
    position: 'absolute',
    bottom: -8,
    left: 8,
    right: 8,
    height: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ scaleY: 0.6 }],
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
    height: '100%',
  },
  labelContainer: {
    position: 'absolute',
    bottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontFamily: 'Outfit_600SemiBold',
  },
});
