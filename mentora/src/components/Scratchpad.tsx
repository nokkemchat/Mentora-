import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';
import Animated, { useSharedValue, runOnJS } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useThemeColors, spacing, typography, borderRadius } from '../constants/theme';

interface ScratchpadProps {
  onClose: () => void;
  isVisible: boolean;
}

export default function Scratchpad({ onClose, isVisible }: ScratchpadProps) {
  const colors = useThemeColors();
  
  // paths is an array of SVG path strings e.g. "M 10 10 L 20 20 L ..."
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>('');

  // We need to use refs for the current path in the gesture handler
  // because Reanimated worklets (even runOnJS) can sometimes capture stale state
  const pathRef = React.useRef('');

  const handleStart = useCallback((x: number, y: number) => {
    const startStr = `M ${x} ${y}`;
    pathRef.current = startStr;
    setCurrentPath(startStr);
  }, []);

  const handleUpdate = useCallback((x: number, y: number) => {
    const updatedStr = `${pathRef.current} L ${x} ${y}`;
    pathRef.current = updatedStr;
    setCurrentPath(updatedStr);
  }, []);

  const handleEnd = useCallback(() => {
    if (pathRef.current) {
      setPaths((prev) => [...prev, pathRef.current]);
      pathRef.current = '';
      setCurrentPath('');
    }
  }, []);

  const handleUndo = () => {
    setPaths((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPaths([]);
    setCurrentPath('');
    pathRef.current = '';
  };

  const pan = Gesture.Pan()
    .minDistance(1)
    .onStart((e) => {
      runOnJS(handleStart)(e.x, e.y);
    })
    .onUpdate((e) => {
      runOnJS(handleUpdate)(e.x, e.y);
    })
    .onEnd(() => {
      runOnJS(handleEnd)();
    });

  if (!isVisible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <Animated.View style={styles.canvasContainer}>
          <Svg style={StyleSheet.absoluteFill}>
            {paths.map((p, i) => (
              <Path
                key={i}
                d={p}
                stroke={colors.primary}
                strokeWidth={4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
            {currentPath ? (
              <Path
                d={currentPath}
                stroke={colors.primary}
                strokeWidth={4}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
          </Svg>
        </Animated.View>
      </GestureDetector>

      {/* Floating Toolbar */}
      <View style={[styles.toolbar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Pressable 
          style={({ pressed }) => [styles.toolButton, pressed && { opacity: 0.7 }]}
          onPress={handleUndo}
          disabled={paths.length === 0}
        >
          <Feather name="rotate-ccw" size={24} color={paths.length > 0 ? colors.text : colors.textSecondary} />
          <Text style={[styles.toolText, { color: paths.length > 0 ? colors.text : colors.textSecondary }]}>Undo</Text>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable 
          style={({ pressed }) => [styles.toolButton, pressed && { opacity: 0.7 }]}
          onPress={handleClear}
        >
          <Feather name="trash-2" size={24} color={colors.error} />
          <Text style={[styles.toolText, { color: colors.error }]}>Clear</Text>
        </Pressable>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        <Pressable 
          style={({ pressed }) => [styles.toolButton, pressed && { opacity: 0.7 }]}
          onPress={onClose}
        >
          <Feather name="x" size={24} color={colors.text} />
          <Text style={[styles.toolText, { color: colors.text }]}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  canvasContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.02)', // very slight tint to show it's active
  },
  toolbar: {
    position: 'absolute',
    bottom: spacing.xxl,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.round,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  toolButton: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.sm,
    minWidth: 64,
  },
  toolText: {
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.medium,
    marginTop: 4,
  },
  divider: {
    width: 1,
    height: 32,
    marginHorizontal: spacing.sm,
  },
});
