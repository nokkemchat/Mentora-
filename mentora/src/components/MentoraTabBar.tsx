import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet, Platform, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Compass, BookOpen, Users, User } from 'lucide-react-native';
import { useAppTheme } from '@/context/ThemeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Sleek, compact floating capsule dock matching modern iOS luxury aesthetics
const BAR_WIDTH = Math.min(SCREEN_WIDTH - 64, 300);
const BAR_HEIGHT = 64;
const TAB_COUNT = 4;
const CIRCLE_SIZE = 48;

const SPRING_CONFIG = {
  stiffness: 380,
  damping: 30,
  mass: 0.7,
  overshootClamping: false,
};

const TABS = [
  { name: 'index',      Icon: Compass,  label: 'Explore' },
  { name: 'my-classes', Icon: BookOpen, label: 'Classes' },
  { name: 'rooms',      Icon: Users,    label: 'Rooms' },
  { name: 'profile',    Icon: User,     label: 'Profile' },
] as const;

type TabItemProps = {
  tab: typeof TABS[number];
  isActive: boolean;
  onPress: () => void;
  isDark: boolean;
};

function TabItem({ tab, isActive, onPress, isDark }: TabItemProps) {
  const IconComponent = tab.Icon;
  const iconColor = isActive 
    ? '#FFFFFF' 
    : isDark ? '#A1A1AA' : '#64748B';

  return (
    <Pressable
      style={styles.tabSlot}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
    >
      {({ pressed }) => (
        <View style={[styles.iconCircleSlot, { transform: [{ scale: pressed ? 0.92 : 1 }] }]}>
          <IconComponent
            size={22}
            color={iconColor}
            strokeWidth={isActive ? 2.4 : 1.8}
          />
        </View>
      )}
    </Pressable>
  );
}

export function MentoraTabBar({ state, navigation }: any) {
  const { isDark } = useAppTheme();
  const activeIndex = state.index ?? 0;

  const [slotLayouts, setSlotLayouts] = useState<{ [key: number]: { x: number; width: number } }>({});
  
  const fallbackSlotW = BAR_WIDTH / TAB_COUNT;
  const initialX = activeIndex * fallbackSlotW + (fallbackSlotW - CIRCLE_SIZE) / 2;
  const indicatorX = useSharedValue(initialX);

  useEffect(() => {
    const layout = slotLayouts[activeIndex];
    if (layout && layout.width > 0) {
      const targetX = layout.x + (layout.width - CIRCLE_SIZE) / 2;
      indicatorX.value = withSpring(targetX, SPRING_CONFIG);
    } else {
      const targetX = activeIndex * fallbackSlotW + (fallbackSlotW - CIRCLE_SIZE) / 2;
      indicatorX.value = withSpring(targetX, SPRING_CONFIG);
    }
  }, [activeIndex, slotLayouts]);

  const indicatorAnimStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: indicatorX.value }],
    };
  });

  const barBgColor = isDark ? 'rgba(24, 24, 27, 0.88)' : 'rgba(255, 255, 255, 0.88)';
  const barBorderColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <View style={styles.outerContainer} pointerEvents="box-none">
      <BlurView
        intensity={Platform.OS === 'ios' ? 85 : 100}
        tint={isDark ? 'dark' : 'light'}
        style={[
          styles.dockBar,
          { backgroundColor: barBgColor, borderColor: barBorderColor },
        ]}
      >
        <View style={styles.tabsRow}>
          {/* Smooth Gliding Active Glowing Gradient Disc (positioned underneath tab icons) */}
          <Animated.View 
            pointerEvents="none"
            style={[
              styles.activeIndicatorContainer, 
              indicatorAnimStyle
            ]} 
          >
            <LinearGradient
              colors={isDark ? ['#3B82F6', '#1D4ED8'] : ['#2563EB', '#1D4ED8']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.activeIndicatorGradient}
            />
          </Animated.View>

          {/* Tab Items Row with higher zIndex so icons sit crisply on top */}
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
                navigation.navigate(state.routes[index]?.name || tab.name);
              }
            };
            return (
              <View
                key={tab.name}
                style={styles.slotWrapper}
                onLayout={(e) => {
                  const { x, width } = e.nativeEvent.layout;
                  setSlotLayouts((prev) => {
                    if (prev[index]?.x === x && prev[index]?.width === width) return prev;
                    return { ...prev, [index]: { x, width } };
                  });
                }}
              >
                <TabItem
                  tab={tab}
                  isActive={isActive}
                  onPress={onPress}
                  isDark={isDark}
                />
              </View>
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
    bottom: Platform.OS === 'ios' ? 30 : 20,
    alignSelf: 'center',
    width: BAR_WIDTH,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 14,
  },
  dockBar: {
    width: '100%',
    height: BAR_HEIGHT,
    borderRadius: 36,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tabsRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    position: 'relative',
  },
  activeIndicatorContainer: {
    position: 'absolute',
    left: 0,
    top: (BAR_HEIGHT - CIRCLE_SIZE) / 2,
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 4,
  },
  activeIndicatorGradient: {
    width: '100%',
    height: '100%',
    borderRadius: CIRCLE_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  slotWrapper: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  tabSlot: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleSlot: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    borderRadius: CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
