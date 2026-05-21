import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LayoutChangeEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TAB_ITEMS } from '../constants';
import { theme, shadow } from '../theme';
import { TabId } from '../types';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

export function BottomNav({
  activeTab,
  onTabChange,
  unreadCount = 0,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  unreadCount?: number;
}) {
  const insets = useSafeAreaInsets();
  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorWidth = useRef(new Animated.Value(72)).current;
  const jelly = useRef(new Animated.Value(0)).current;
  const hasMounted = useRef(false);
  const [layouts, setLayouts] = useState<Partial<Record<TabId, { width: number; x: number }>>>({});

  useEffect(() => {
    const activeLayout = layouts[activeTab];

    if (!activeLayout) {
      return;
    }

    if (!hasMounted.current) {
      indicatorX.setValue(activeLayout.x);
      indicatorWidth.setValue(activeLayout.width);
      hasMounted.current = true;
      return;
    }

    Animated.parallel([
      Animated.spring(indicatorX, {
        toValue: activeLayout.x,
        stiffness: 220,
        damping: 24,
        mass: 0.92,
        overshootClamping: false,
        restDisplacementThreshold: 0.2,
        restSpeedThreshold: 0.2,
        useNativeDriver: false,
      }),
      Animated.spring(indicatorWidth, {
        toValue: activeLayout.width,
        stiffness: 210,
        damping: 24,
        mass: 0.98,
        overshootClamping: false,
        restDisplacementThreshold: 0.2,
        restSpeedThreshold: 0.2,
        useNativeDriver: false,
      }),
      Animated.sequence([
        Animated.timing(jelly, {
          toValue: 1,
          duration: 145,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.spring(jelly, {
          toValue: 0,
          stiffness: 220,
          damping: 14,
          mass: 0.72,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [activeTab, indicatorWidth, indicatorX, jelly, layouts]);

  const handleItemLayout = (tabId: TabId, event: LayoutChangeEvent) => {
    const { width, x } = event.nativeEvent.layout;

    setLayouts((current) => {
      const previous = current[tabId];

      if (previous && previous.width === width && previous.x === x) {
        return current;
      }

      return {
        ...current,
        [tabId]: { width, x },
      };
    });
  };

  const scaleX = jelly.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [1, 1.14, 1],
  });

  const scaleY = jelly.interpolate({
    inputRange: [0, 0.45, 1],
    outputRange: [1, 0.88, 1],
  });

  return (
    <View pointerEvents="box-none" style={[styles.outer, { paddingBottom: insets.bottom + 10 }]}>
      <View style={styles.shell}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicatorFrame,
            {
              left: indicatorX,
              width: indicatorWidth,
            },
          ]}
        >
          <Animated.View
            style={[
              styles.indicator,
              {
                transform: [{ scaleX }, { scaleY }],
              },
            ]}
          >
            <LinearGradient
              colors={['#E53935', theme.colors.accent, theme.colors.accent]}
              locations={[0, 0.36, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>
        </Animated.View>

        {TAB_ITEMS.map((tab) => (
          <NavItem
            key={tab.id}
            active={tab.id === activeTab}
            icon={tab.icon as FeatherName}
            label={tab.label}
            badgeCount={tab.id === 'inbox' ? unreadCount : 0}
            onLayout={(event) => handleItemLayout(tab.id, event)}
            onPress={() => onTabChange(tab.id)}
          />
        ))}
      </View>
    </View>
  );
}

function NavItem({
  active,
  icon,
  label,
  badgeCount,
  onLayout,
  onPress,
}: {
  active: boolean;
  icon: FeatherName;
  label: string;
  badgeCount: number;
  onLayout: (event: LayoutChangeEvent) => void;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const labelOpacity = useRef(new Animated.Value(active ? 1 : 0)).current;
  const labelTranslate = useRef(new Animated.Value(active ? 0 : 8)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(labelOpacity, {
        toValue: active ? 1 : 0,
        duration: active ? 190 : 130,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(labelTranslate, {
        toValue: active ? 0 : 8,
        stiffness: 240,
        damping: 24,
        mass: 0.82,
        useNativeDriver: true,
      }),
    ]).start();
  }, [active, labelOpacity, labelTranslate]);

  const animateScale = (toValue: number) => {
    Animated.spring(scale, {
      toValue,
      stiffness: 360,
      damping: 20,
      mass: 0.7,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      accessibilityRole="button"
      onLayout={onLayout}
      onPress={onPress}
      onPressIn={() => animateScale(0.92)}
      onPressOut={() => animateScale(1)}
      style={[styles.pressable, active ? styles.pressableActive : styles.pressableIdle]}
    >
      <Animated.View style={[styles.item, { transform: [{ scale }] }]}>
        <View style={styles.iconWrap}>
          <Feather color={active ? theme.colors.white : theme.colors.textSoft} name={icon} size={18} />
          {badgeCount > 0 ? <NotificationBadge count={badgeCount} /> : null}
        </View>
        <Animated.Text
          numberOfLines={1}
          style={[
            styles.label,
            {
              opacity: labelOpacity,
              transform: [{ translateX: labelTranslate }],
            },
          ]}
        >
          {label}
        </Animated.Text>
      </Animated.View>
    </Pressable>
  );
}

function NotificationBadge({ count }: { count: number }) {
  const displayCount = count > 99 ? '99+' : String(count);

  return (
    <View style={styles.badgeWrap}>
      <LinearGradient
        colors={['#E53935', theme.colors.accentStrong, theme.colors.accent]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.badgeBorder}
      >
        <View style={styles.badgeInner}>
          <Text style={styles.badgeText}>{displayCount}</Text>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  shell: {
    minHeight: 66,
    width: '94%',
    maxWidth: 430,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(12,15,23,0.92)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 8,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'stretch',
    position: 'relative',
    overflow: 'hidden',
    ...shadow,
  },
  indicatorFrame: {
    position: 'absolute',
    top: 7,
    bottom: 7,
    paddingHorizontal: 2,
  },
  indicator: {
    flex: 1,
    borderRadius: theme.radius.pill,
    overflow: 'hidden',
  },
  pressable: {
    zIndex: 1,
    justifyContent: 'center',
  },
  pressableActive: {
    flexGrow: 1.55,
    flexBasis: 0,
  },
  pressableIdle: {
    flexGrow: 0.86,
    flexBasis: 0,
  },
  item: {
    minHeight: 46,
    width: '100%',
    paddingHorizontal: 10,
    borderRadius: theme.radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  iconWrap: {
    position: 'relative',
  },
  badgeWrap: {
    position: 'absolute',
    top: -9,
    right: -13,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
  },
  badgeBorder: {
    flex: 1,
    minWidth: 18,
    padding: 1,
  },
  badgeInner: {
    flex: 1,
    minWidth: 16,
    borderRadius: 999,
    backgroundColor: 'rgba(12,15,23,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: theme.colors.white,
    fontSize: 9,
    fontWeight: '900',
    includeFontPadding: false,
  },
  label: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.15,
    flexShrink: 1,
    includeFontPadding: false,
  },
});
