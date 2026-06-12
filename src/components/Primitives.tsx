import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { theme, shadow } from '../theme';
import { AppCategory, AppIconName } from '../types';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

export function useJellyPressAnimation({
  pressedScaleX = 1.035,
  pressedScaleY = 0.935,
}: {
  pressedScaleX?: number;
  pressedScaleY?: number;
} = {}) {
  const progress = useRef(new Animated.Value(0)).current;

  const animateTo = (toValue: number) => {
    Animated.spring(progress, {
      toValue,
      stiffness: toValue === 1 ? 360 : 300,
      damping: toValue === 1 ? 20 : 18,
      mass: 0.72,
      useNativeDriver: true,
    }).start();
  };

  return {
    animatedStyle: {
      transform: [
        {
          scaleX: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, pressedScaleX],
          }),
        },
        {
          scaleY: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [1, pressedScaleY],
          }),
        },
      ],
    },
    onPressIn: () => animateTo(1),
    onPressOut: () => animateTo(0),
  };
}

export function AppBackground({ children }: { children: React.ReactNode }) {
  return (
    <LinearGradient
      colors={['#0A0D13', '#111827', '#0A0D13']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.background}
    >
      <View pointerEvents="none" style={[styles.orb, styles.orbTop]} />
      {children}
    </LinearGradient>
  );
}

export function ScreenTransition({
  children,
  direction = 1,
  distance = 28,
}: {
  children: React.ReactNode;
  direction?: 1 | -1;
  distance?: number;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(direction * distance)).current;
  const scale = useRef(new Animated.Value(0.985)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateX.setValue(direction * distance);
    scale.setValue(0.985);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 190,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateX, {
        toValue: 0,
        stiffness: 220,
        damping: 24,
        mass: 0.9,
        overshootClamping: false,
        restDisplacementThreshold: 0.2,
        restSpeedThreshold: 0.2,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        stiffness: 260,
        damping: 24,
        mass: 0.82,
        useNativeDriver: true,
      }),
    ]).start();
  }, [direction, distance, opacity, scale, translateX]);

  return (
    <Animated.View
      style={[
        styles.screen,
        {
          opacity,
          transform: [{ translateX }, { scale }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  light = false,
  darkGlass = false,
  compact = false,
}: {
  icon: AppIconName;
  onPress?: () => void;
  accessibilityLabel?: string;
  light?: boolean;
  darkGlass?: boolean;
  compact?: boolean;
}) {
  const jelly = useJellyPressAnimation();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.pressableReset}
    >
      <Animated.View
        style={[
          styles.iconButton,
          compact && styles.iconButtonCompact,
          light && styles.iconButtonLight,
          darkGlass && styles.iconButtonDarkGlass,
          jelly.animatedStyle,
        ]}
      >
        <Feather color={theme.colors.text} name={icon as FeatherName} size={compact ? 16 : 18} />
      </Animated.View>
    </Pressable>
  );
}

export function PrimaryButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: AppIconName;
  onPress?: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.025,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.flex}
    >
      <Animated.View style={jelly.animatedStyle}>
        <LinearGradient colors={[theme.colors.accentStrong, theme.colors.accent]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.primaryButton}>
          {icon ? <Feather color={theme.colors.white} name={icon as FeatherName} size={16} /> : null}
          <Text style={styles.primaryButtonText}>{label}</Text>
        </LinearGradient>
      </Animated.View>
    </Pressable>
  );
}

export function SecondaryButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon?: AppIconName;
  onPress?: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.025,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.flex}
    >
      <Animated.View style={[styles.secondaryButton, jelly.animatedStyle]}>
        {icon ? <Feather color={theme.colors.paperInk} name={icon as FeatherName} size={16} /> : null}
        <Text style={styles.secondaryButtonText}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function CategoryPill({
  category,
  active,
  onPress,
  compact = false,
}: {
  category: AppCategory;
  active: boolean;
  onPress?: () => void;
  compact?: boolean;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.025,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.pressableReset}
    >
      <Animated.View style={[styles.categoryPill, compact && styles.categoryPillCompact, active && styles.categoryPillActive, jelly.animatedStyle]}>
        <Feather color={active ? theme.colors.white : theme.colors.accentStrong} name={category.icon as FeatherName} size={compact ? 13 : 15} />
        <Text style={[styles.categoryText, compact && styles.categoryTextCompact, active && styles.categoryTextActive]}>{category.name}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  actionArrow = false,
  onActionPress,
}: {
  title: string;
  actionLabel?: string;
  actionArrow?: boolean;
  onActionPress?: () => void;
}) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel ? (
        <Pressable accessibilityRole={onActionPress ? 'button' : undefined} onPress={onActionPress} style={styles.sectionActionPressable}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
          {actionArrow ? <Feather color={theme.colors.accentStrong} name="chevron-right" size={15} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

export function Tag({ label }: { label: string }) {
  return (
    <View style={styles.tag}>
      <Text style={styles.tagText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  orbTop: {
    top: -120,
    right: -60,
    width: 240,
    height: 240,
    backgroundColor: 'rgba(242,34,28,0.16)',
  },
  screen: {
    flex: 1,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  iconButtonCompact: {
    width: 36,
    height: 36,
  },
  iconButtonLight: {
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  iconButtonDarkGlass: {
    backgroundColor: 'rgba(8,10,14,0.46)',
    borderColor: 'rgba(255,255,255,0.07)',
  },
  primaryButton: {
    minHeight: 48,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadow,
  },
  primaryButtonText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  secondaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 18,
    backgroundColor: theme.colors.paper,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryButtonText: {
    color: theme.colors.paperInk,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  categoryPill: {
    minHeight: 38,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginRight: 10,
  },
  categoryPillCompact: {
    minHeight: 32,
    paddingHorizontal: 11,
    borderRadius: 10,
    gap: 6,
    marginRight: 8,
  },
  categoryPillActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(242,34,28,0.24)',
  },
  categoryText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  categoryTextCompact: {
    fontSize: 12,
    fontWeight: '700',
  },
  categoryTextActive: {
    color: theme.colors.white,
  },
  sectionHeader: {
    marginTop: 10,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  sectionAction: {
    color: theme.colors.accentStrong,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionActionPressable: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    justifyContent: 'center',
    paddingLeft: 12,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tagText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  flex: {
    flex: 1,
  },
  pressableReset: {
    alignSelf: 'flex-start',
  },
});
