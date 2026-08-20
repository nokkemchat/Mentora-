import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const BAR_WIDTH = Math.min(SCREEN_WIDTH - 32, 380);
const TAB_COUNT = 4;
const ITEM_WIDTH = BAR_WIDTH / TAB_COUNT;
const PILL_WIDTH = ITEM_WIDTH - 10;
const PILL_HEIGHT = 52;
const BAR_HEIGHT = 68;

const SPRING_CONFIG = {
  stiffness: 340,
  damping: 28,
  mass: 0.8,
  overshootClamping: false,
};

const TABS = [
  { name: 'index',      label: 'Explore', activeIcon: 'compass',       inactiveIcon: 'compass-outline' },
  { name: 'my-classes', label: 'Classes', activeIcon: 'book',          inactiveIcon: 'book-outline' },
  { name: 'rooms',      label: 'Rooms',   activeIcon: 'chatbubbles',   inactiveIcon: 'chatbubbles-outline' },
  { name: 'profile',    label: 'Profile', activeIcon: 'person',        inactiveIcon: 'person-outline' },
] as const;

type TabItemProps = {
  tab: typeof TABS[number];
  isActive: boolean;
  onPress: () => void;
  themeColors: any;
  isDark: boolean;
};

function TabItem({ tab, isActive, onPress, themeColors, isDark }: TabItemProps) {
  const activeProgress = useSharedValue(isActive ? 1 : 0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    activeProgress.value = withSpring(isActive ? 1 : 0, SPRING_CONFIG);
  }, [isActive]);

  const activeColor = themeColors.primary;
  const inactiveColor = isDark ? 'rgba(148, 163, 184, 0.7)' : 'rgba(100, 116, 139, 0.8)';

  const iconAnimStyle = useAnimatedStyle(() => {
    const scale = interpolate(activeProgress.value, [0, 1], [1, 1.15], Extrapolation.CLAMP);
    const translateY = interpolate(activeProgress.value, [0, 1], [0, -2], Extrapolation.CLAMP);
    
    return {
      transform: [
        { scale: scale * pressScale.value },
        { translateY },
      ],
    };
  });

  const labelAnimStyle = useAnimatedStyle(() => {
    const scale = interpolate(activeProgress.value, [0, 1], [0.95, 1.05], Extrapolation.CLAMP);
    const opacity = interpolate(activeProgress.value, [0, 1], [0.65, 1], Extrapolation.CLAMP);
    
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const iconName = isActive ? tab.activeIcon : tab.inactiveIcon;

  return (
    <Pressable
      style={styles.tabItem}
      onPress={onPress}
      onPressIn={() => {
        pressScale.value = withSpring(0.9, { stiffness: 400, damping: 25 });
      }}
      onPressOut={() => {
        pressScale.value = withSpring(1, SPRING_CONFIG);
      }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
    >
      <Animated.View style={[styles.tabContent, iconAnimStyle]}>
        <Ionicons
          name={iconName as any}
          size={22}
          color={isActive ? activeColor : inactiveColor}
        />
        <Animated.View style={labelAnimStyle}>
          <Text style={[
            styles.label, 
            { 
              color: isActive ? activeColor : inactiveColor,
              fontWeight: isActive ? '700' : '500',
            }
          ]}>
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

  useEffect(() => {
    const target = activeIndex * ITEM_WIDTH + (ITEM_WIDTH - PILL_WIDTH) / 2;
    pillX.value = withSpring(target, SPRING_CONFIG);
  }, [activeIndex]);

  const pillAnimStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: pillX.value }],
    };
  });

  const barBgColor = isDark ? 'rgba(15, 23, 42, 0.85)' : 'rgba(255, 255, 255, 0.85)';
  const barBorderColor = isDark ? 'rgba(51, 65, 85, 0.5)' : 'rgba(226, 232, 240, 0.8)';
  
  const pillGradient = isDark
    ? ['#818CF838', '#4F46E51E']
    : ['#EEF2FF', '#E0E7FF'];

  const pillBorderColor = isDark
    ? 'rgba(129, 140, 248, 0.35)'
    : '#C7D2FE';

  const shadowStyle = isDark
    ? {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.45,
        shadowRadius: 18,
        elevation: 12,
      }
    : {
        shadowColor: '#4F46E5',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.12,
        shadowRadius: 20,
        elevation: 10,
      };

  return (
    <View style={[styles.outerContainer, shadowStyle]} pointerEvents="box-none">
      <BlurView
        intensity={isDark ? 45 : 75}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.barContainer,
          { backgroundColor: barBgColor, borderColor: barBorderColor },
        ]}
      >
        {/* Animated Active Tab Capsule */}
        <Animated.View style={[styles.activePillContainer, pillAnimStyle]}>
          <View style={[styles.activePill, { borderColor: pillBorderColor }]}>
            <LinearGradient
              colors={pillGradient as [string, string]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={[styles.topGlowDot, { backgroundColor: colors.primary }]} />
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
    bottom: Platform.OS === 'ios' ? 28 : 20,
    alignSelf: 'center',
    width: BAR_WIDTH,
  },
  barContainer: {
    width: '100%',
    height: BAR_HEIGHT,
    borderRadius: 34,
    borderWidth: 1.5,
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
    borderRadius: 26,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
  },
  topGlowDot: {
    position: 'absolute',
    top: 3,
    width: 14,
    height: 3,
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
  tabContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  label: {
    fontSize: 11,
  },
});

