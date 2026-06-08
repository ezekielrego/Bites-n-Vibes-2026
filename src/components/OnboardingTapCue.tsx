import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { shadow } from '../theme';

export function OnboardingTapCue({
  backgroundColor = 'rgba(8,10,14,0.26)',
  iconSize = 28,
  size = 40,
  style,
  travel = [7, -1],
}: {
  backgroundColor?: string;
  iconSize?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
  travel?: [number, number];
}) {
  const motion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, {
          toValue: 1,
          duration: 780,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(motion, {
          toValue: 0,
          duration: 520,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [motion]);

  const translateY = motion.interpolate({
    inputRange: [0, 1],
    outputRange: travel,
  });
  const scale = motion.interpolate({
    inputRange: [0, 0.72, 1],
    outputRange: [1, 0.9, 1],
  });
  const opacity = motion.interpolate({
    inputRange: [0, 0.2, 0.84, 1],
    outputRange: [0.62, 1, 1, 0.72],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.root,
        {
          backgroundColor,
          borderRadius: size / 2,
          height: size,
          opacity,
          transform: [{ translateY }, { scale }],
          width: size,
        },
        style,
      ]}
    >
      <MaterialIcons color="#FFFFFF" name="touch-app" size={iconSize} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    ...shadow,
  },
});
