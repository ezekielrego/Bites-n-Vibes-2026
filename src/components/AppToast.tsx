import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shadow, theme } from '../theme';
import { AppToastMessage, subscribeToAppToasts } from '../toast';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

export function AppToastHost() {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<AppToastMessage | null>(null);
  const progress = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return subscribeToAppToasts((nextToast) => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }

      setToast(nextToast);
      progress.stopAnimation();
      progress.setValue(0);
      Animated.timing(progress, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();

      hideTimer.current = setTimeout(() => {
        Animated.timing(progress, {
          toValue: 0,
          duration: 210,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) {
            setToast(null);
          }
        });
      }, nextToast.durationMs);
    });
  }, [progress]);

  useEffect(
    () => () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
      }
    },
    [],
  );

  if (!toast) {
    return null;
  }

  const toneStyle = getToastToneStyle(toast.tone);
  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-18, 0],
  });

  const dismiss = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.timing(progress, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setToast(null);
      }
    });
  };

  return (
    <Modal animationType="none" onRequestClose={dismiss} statusBarTranslucent transparent visible={Boolean(toast)}>
      <View pointerEvents="box-none" style={[styles.toastLayer, { paddingTop: insets.top + 10 }]}>
      <Animated.View
        style={[
          styles.toastCard,
          toneStyle.card,
          {
            opacity: progress,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={[styles.toastIcon, toneStyle.icon]}>
          <Feather color={theme.colors.white} name={toneStyle.name} size={15} />
        </View>
        <View style={styles.toastCopy}>
          <Text numberOfLines={1} style={styles.toastTitle}>
            {toast.title}
          </Text>
          {toast.message ? (
            <Text numberOfLines={2} style={styles.toastMessage}>
              {toast.message}
            </Text>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" hitSlop={8} onPress={dismiss} style={styles.toastClose}>
          <Feather color={theme.colors.textMuted} name="x" size={15} />
        </Pressable>
      </Animated.View>
      </View>
    </Modal>
  );
}

function getToastToneStyle(tone: AppToastMessage['tone']): {
  card: object;
  icon: object;
  name: FeatherName;
} {
  if (tone === 'success') {
    return {
      card: styles.toastCardSuccess,
      icon: styles.toastIconSuccess,
      name: 'check',
    };
  }
  if (tone === 'error') {
    return {
      card: styles.toastCardError,
      icon: styles.toastIconError,
      name: 'alert-circle',
    };
  }
  return {
    card: styles.toastCardInfo,
    icon: styles.toastIconInfo,
    name: 'bell',
  };
}

const styles = StyleSheet.create({
  toastLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 200,
    elevation: 200,
    paddingHorizontal: 14,
  },
  toastCard: {
    minHeight: 58,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(12,15,23,0.96)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...shadow,
  },
  toastCardSuccess: {
    borderColor: 'rgba(139,226,139,0.3)',
  },
  toastCardError: {
    borderColor: 'rgba(242,34,28,0.38)',
  },
  toastCardInfo: {
    borderColor: 'rgba(242,34,28,0.26)',
  },
  toastIcon: {
    width: 31,
    height: 31,
    borderRadius: 15.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastIconSuccess: {
    backgroundColor: 'rgba(64,180,93,0.92)',
  },
  toastIconError: {
    backgroundColor: theme.colors.accentStrong,
  },
  toastIconInfo: {
    backgroundColor: 'rgba(242,34,28,0.86)',
  },
  toastCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  toastTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '900',
  },
  toastMessage: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  toastClose: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
