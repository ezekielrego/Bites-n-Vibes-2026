import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import LottieView from 'lottie-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, shadow } from '../theme';
import type { AnimationObject } from 'lottie-react-native';
import { OnboardingTapCue } from './OnboardingTapCue';

const WELCOME_ANIMATION = require('../../assets/lottie/man-woman-hi.json') as AnimationObject;
const FIREWORKS_ANIMATION = require('../../assets/lottie/fireworks.json') as AnimationObject;

export type OnboardingStage = 'checking' | 'welcome' | 'scroll' | 'create' | 'menu' | 'success' | 'done';

export function OnboardingOverlay({
  stage,
  onNext,
  onFinish,
}: {
  stage: OnboardingStage;
  onNext: () => void;
  onFinish: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (stage !== 'success') {
      return;
    }

    const timer = setTimeout(onFinish, 2600);
    return () => clearTimeout(timer);
  }, [onFinish, stage]);

  if (stage === 'checking' || stage === 'create' || stage === 'menu' || stage === 'done') {
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
            colors={['#E53935', '#F2221C', '#FF9A96']}
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
        <OnboardingTapCue
          backgroundColor="rgba(8,10,14,0.64)"
          iconSize={36}
          size={SCROLL_CUE_SIZE}
          style={[styles.scrollCue, { bottom: insets.bottom + 138, left: width / 2 - SCROLL_CUE_SIZE / 2 }]}
          travel={[18, -26]}
        />
      ) : null}
    </View>
  );
}

const SCROLL_CUE_SIZE = 58;

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
    color: '#FF9A96',
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
  scrollCue: {
    position: 'absolute',
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
