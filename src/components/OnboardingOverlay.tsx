import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleProp, StyleSheet, Text, useWindowDimensions, View, ViewStyle } from 'react-native';
import { Feather, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, shadow } from '../theme';
import type { AnimationObject } from 'lottie-react-native';

const WELCOME_ANIMATION = require('../../assets/lottie/man-woman-hi.json') as AnimationObject;
const FIREWORKS_ANIMATION = require('../../assets/lottie/fireworks.json') as AnimationObject;

export type OnboardingStage = 'checking' | 'welcome' | 'scroll' | 'create' | 'menu' | 'success' | 'done';

export function OnboardingOverlay({
  createTarget,
  stage,
  onNext,
  onFinish,
}: {
  createTarget?: { x: number; y: number };
  stage: OnboardingStage;
  onNext: () => void;
  onFinish: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const createCuePosition = createTarget
    ? centerCueOnTarget(createTarget, CREATE_CUE_SIZE, CREATE_CUE_Y_OFFSET)
    : getCreateTabCuePosition(width, height, insets.bottom);
  const menuCuePosition = getMenuCuePosition(insets.top);

  useEffect(() => {
    if (stage !== 'success') {
      return;
    }

    const timer = setTimeout(onFinish, 2600);
    return () => clearTimeout(timer);
  }, [onFinish, stage]);

  if (stage === 'checking' || stage === 'done') {
    return null;
  }

  if (stage === 'welcome') {
    return (
      <LinearGradient
        colors={['#080B10', '#121826', '#0A0D13']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.fullScreen, { paddingTop: insets.top + 26, paddingBottom: insets.bottom + 28 }]}
      >
        <View style={styles.welcomeBody}>
          <LottieView
            autoPlay
            loop
            source={WELCOME_ANIMATION}
            style={styles.welcomeAnimation}
            webStyle={styles.webWelcomeAnimation}
          />
          <View style={styles.welcomeCopy}>
            <Text style={styles.eyebrow}>BITES & VIBES</Text>
            <Text style={styles.welcomeTitle}>Welcome in</Text>
            <Text style={styles.welcomeText}>Find the nights, tickets and people worth showing up for.</Text>
          </View>
        </View>

        <Pressable accessibilityRole="button" onPress={onNext} style={styles.nextPressable}>
          <LinearGradient
            colors={['#E53935', '#FF6B3D', '#FFB15C']}
            locations={[0, 0.48, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={styles.nextButton}
          >
            <Text style={styles.nextText}>Next</Text>
            <Feather color="#FFFFFF" name="arrow-right" size={18} />
          </LinearGradient>
        </Pressable>
      </LinearGradient>
    );
  }

  if (stage === 'success') {
    return (
      <View pointerEvents="auto" style={styles.transparentScreen}>
        <LottieView
          autoPlay
          loop={false}
          source={FIREWORKS_ANIMATION}
          style={styles.fireworksAnimation}
          webStyle={styles.webFireworksAnimation}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="none" style={styles.transparentScreen}>
      {stage === 'scroll' ? (
        <PointerCue variant="scroll" style={[styles.scrollCue, { bottom: insets.bottom + 138, left: width / 2 - SCROLL_CUE_SIZE / 2 }]} />
      ) : null}

      {stage === 'create' ? (
        <PointerCue variant="create" style={[styles.createCue, createCuePosition]} />
      ) : null}

      {stage === 'menu' ? (
        <PointerCue variant="menu" style={[styles.menuCue, menuCuePosition]} />
      ) : null}
    </View>
  );
}

function PointerCue({
  variant,
  style,
}: {
  variant: 'create' | 'menu' | 'scroll';
  style: StyleProp<ViewStyle>;
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
    outputRange: variant === 'scroll' ? [18, -26] : [7, -1],
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
    <View style={[styles.cue, style]}>
      <Animated.View
        style={[
          styles.pointerCueIcon,
          variant === 'scroll'
            ? styles.scrollPointerIcon
            : variant === 'create'
              ? styles.createPointerIcon
              : styles.menuPointerIcon,
          {
            opacity,
            transform: [{ translateY }, { scale }],
          },
        ]}
      >
        <MaterialIcons
          color="#FFFFFF"
          name="touch-app"
          size={variant === 'scroll' ? 36 : variant === 'create' ? 32 : 28}
        />
      </Animated.View>
    </View>
  );
}

const CREATE_CUE_SIZE = 46;
const MENU_CUE_SIZE = 40;
const SCROLL_CUE_SIZE = 58;
const CREATE_CUE_Y_OFFSET = 14;

function centerCueOnTarget(target: { x: number; y: number }, cueSize: number, yOffset = 0) {
  return {
    left: target.x - cueSize / 2,
    top: target.y - cueSize / 2 + yOffset,
  };
}

function getCreateTabCuePosition(viewportWidth: number, viewportHeight: number, bottomInset: number) {
  const shellWidth = Math.min(viewportWidth * 0.94, 430);
  const shellLeft = (viewportWidth - shellWidth) / 2;
  const innerWidth = shellWidth - 16;
  const totalGrow = 1.55 + 0.86 * 4;
  const targetCenterX =
    shellLeft +
    8 +
    innerWidth * ((1.55 + 0.86 + 0.86 / 2) / totalGrow);
  const targetCenterY = viewportHeight - (bottomInset + 10 + 66 / 2);

  return {
    left: targetCenterX - CREATE_CUE_SIZE / 2,
    top: targetCenterY - CREATE_CUE_SIZE / 2 + CREATE_CUE_Y_OFFSET,
  };
}

function getMenuCuePosition(topInset: number) {
  const targetCenterX = 20 + 42 / 2;
  const targetCenterY = topInset + 8 + 42 / 2;

  return {
    left: targetCenterX - MENU_CUE_SIZE / 2 - 8,
    top: targetCenterY - MENU_CUE_SIZE / 2,
  };
}

const styles = StyleSheet.create({
  fullScreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    paddingHorizontal: 26,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  transparentScreen: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  welcomeBody: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  welcomeAnimation: {
    width: '100%',
    maxWidth: 430,
    aspectRatio: 1.12,
  },
  webWelcomeAnimation: {
    width: '100%',
    maxWidth: 430,
    aspectRatio: 1.12,
  },
  welcomeCopy: {
    width: '100%',
    maxWidth: 430,
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    color: '#FFB15C',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.6,
  },
  welcomeTitle: {
    color: theme.colors.white,
    fontSize: 42,
    lineHeight: 48,
    fontWeight: '900',
    textAlign: 'center',
  },
  welcomeText: {
    maxWidth: 340,
    color: '#C8D0DE',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  nextPressable: {
    width: '100%',
    maxWidth: 430,
  },
  nextButton: {
    minHeight: 56,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    ...shadow,
  },
  nextText: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '900',
  },
  cue: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createCue: {
    alignItems: 'center',
  },
  scrollCue: {
    alignItems: 'center',
  },
  menuCue: {
    left: 30,
    alignItems: 'flex-start',
  },
  pointerCueIcon: {
    backgroundColor: 'rgba(8,10,14,0.64)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createPointerIcon: {
    width: CREATE_CUE_SIZE,
    height: CREATE_CUE_SIZE,
    borderRadius: CREATE_CUE_SIZE / 2,
    ...shadow,
  },
  scrollPointerIcon: {
    width: SCROLL_CUE_SIZE,
    height: SCROLL_CUE_SIZE,
    borderRadius: SCROLL_CUE_SIZE / 2,
    ...shadow,
  },
  menuPointerIcon: {
    width: MENU_CUE_SIZE,
    height: MENU_CUE_SIZE,
    borderRadius: MENU_CUE_SIZE / 2,
  },
  fireworksAnimation: {
    width: '96%',
    maxWidth: 520,
    aspectRatio: 1,
  },
  webFireworksAnimation: {
    width: '96%',
    maxWidth: 520,
    aspectRatio: 1,
  },
});
