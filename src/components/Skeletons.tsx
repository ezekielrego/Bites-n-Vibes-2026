import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  ScrollView,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, shadow } from '../theme';
import { TabId } from '../types';

type SkeletonBlockProps = {
  width?: number | string;
  height: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

function SkeletonBlock({
  width = '100%',
  height,
  radius = theme.radius.md,
  style,
}: SkeletonBlockProps) {
  const progress = useRef(new Animated.Value(0)).current;
  const dimensionStyle: ViewStyle = {
    width: width as ViewStyle['width'],
    height,
    borderRadius: radius,
  };

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();

    return () => loop.stop();
  }, [progress]);

  return (
    <Animated.View
      style={[
        styles.block,
        dimensionStyle,
        style,
        {
          opacity: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.44, 0.9],
          }),
          transform: [
            {
              scaleX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.035],
              }),
            },
            {
              scaleY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 0.965],
              }),
            },
          ],
        },
      ]}
    />
  );
}

export function HomeScreenSkeleton({ activeTab }: { activeTab: TabId }) {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 110 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <SkeletonBlock height={42} radius={21} width={42} />
        <SkeletonBlock height={40} radius={999} width={136} />
        <SkeletonBlock height={42} radius={21} width={42} />
      </View>

      {activeTab === 'discover' ? (
        <>
          <SkeletonBlock height={50} radius={999} />

          <View style={styles.pillRow}>
            <SkeletonBlock height={38} radius={999} width={90} />
            <SkeletonBlock height={38} radius={999} width={84} />
            <SkeletonBlock height={38} radius={999} width={104} />
            <SkeletonBlock height={38} radius={999} width={98} />
          </View>

          <View style={styles.spotlightCard}>
            <View style={styles.spotlightBody}>
              <SkeletonBlock height={24} radius={999} width={78} />
              <SkeletonBlock height={26} width="72%" />
              <SkeletonBlock height={16} width="88%" />
              <SkeletonBlock height={16} width="58%" />
            </View>
            <SkeletonBlock height={110} radius={20} width={92} />
          </View>

          <View style={styles.sectionHeader}>
            <SkeletonBlock height={20} width={150} />
            <SkeletonBlock height={14} width={54} />
          </View>

          <SkeletonBlock height={208} radius={theme.radius.lg} style={styles.cardShadow} />
          <SkeletonBlock height={208} radius={theme.radius.lg} style={styles.cardShadow} />
        </>
      ) : (
        <>
          <View style={styles.sectionHeader}>
            <SkeletonBlock height={22} width={188} />
          </View>
          <View style={styles.placeholderCard}>
            <SkeletonBlock height={28} width="68%" />
            <SkeletonBlock height={16} width="100%" />
            <SkeletonBlock height={16} width="82%" />
            <View style={styles.innerCard}>
              <SkeletonBlock height={14} width={82} />
              <SkeletonBlock height={16} width="100%" />
              <SkeletonBlock height={16} width="92%" />
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

export function DetailsScreenSkeleton() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.detailsHero}>
          <SkeletonBlock height={400} radius={0} />
          <View style={[styles.heroControls, { paddingTop: insets.top + 8 }]}>
            <SkeletonBlock height={42} radius={21} width={42} />
            <SkeletonBlock height={42} radius={21} width={42} />
          </View>
          <View style={styles.heroFooter}>
            <View style={styles.heroCopy}>
              <SkeletonBlock height={14} width={104} />
              <SkeletonBlock height={34} width="76%" />
              <SkeletonBlock height={16} width="62%" />
            </View>
            <SkeletonBlock height={40} radius={999} width={86} />
          </View>
        </View>

        <View style={styles.sheet}>
          <SkeletonBlock height={28} width="56%" />
          <SkeletonBlock height={16} width="100%" />
          <SkeletonBlock height={16} width="86%" />

          <View style={styles.metricRow}>
            <SkeletonBlock height={108} radius={theme.radius.md} style={styles.flex} />
            <SkeletonBlock height={108} radius={theme.radius.md} style={styles.flex} />
          </View>

          <View style={styles.metricRow}>
            <SkeletonBlock height={108} radius={theme.radius.md} style={styles.flex} />
            <SkeletonBlock height={108} radius={theme.radius.md} style={styles.flex} />
          </View>

          <View style={styles.copySection}>
            <SkeletonBlock height={18} width={132} />
            <SkeletonBlock height={16} width="100%" />
            <SkeletonBlock height={16} width="94%" />
            <SkeletonBlock height={16} width="86%" />
          </View>

          <View style={styles.copySection}>
            <SkeletonBlock height={18} width={142} />
            <SkeletonBlock height={16} width="92%" />
            <SkeletonBlock height={16} width="88%" />
            <SkeletonBlock height={16} width="80%" />
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.bottomBarInner}>
          <SkeletonBlock height={48} radius={999} style={styles.flex} />
          <SkeletonBlock height={48} radius={24} width={52} />
          <SkeletonBlock height={48} radius={24} width={52} />
        </View>
      </View>
    </View>
  );
}

export function TicketScreenSkeleton() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 28 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerRow}>
        <SkeletonBlock height={42} radius={21} width={42} />
        <SkeletonBlock height={24} width={96} />
        <SkeletonBlock height={42} radius={21} width={42} />
      </View>

      <View style={styles.ticketShell}>
        <SkeletonBlock height={248} radius={26} />
        <View style={styles.ticketPaper}>
          <SkeletonBlock height={28} width="52%" style={styles.centerBlock} />
          <SkeletonBlock height={14} width="38%" style={styles.centerBlock} />
          <SkeletonBlock height={1} width="100%" style={styles.divider} />

          <View style={styles.infoGrid}>
            <SkeletonBlock height={48} width="46%" />
            <SkeletonBlock height={48} width="46%" />
            <SkeletonBlock height={48} width="46%" />
            <SkeletonBlock height={48} width="46%" />
          </View>

          <SkeletonBlock height={1} width="100%" style={styles.divider} />
          <SkeletonBlock height={74} radius={12} />
        </View>
      </View>

      <View style={styles.actions}>
        <SkeletonBlock height={48} radius={999} style={styles.flex} />
        <SkeletonBlock height={48} radius={999} style={styles.flex} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  block: {
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  page: {
    paddingHorizontal: 20,
    gap: 16,
  },
  headerRow: {
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pillRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 2,
  },
  spotlightCard: {
    marginTop: 4,
    marginBottom: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  spotlightBody: {
    flex: 1,
    gap: 10,
  },
  sectionHeader: {
    marginTop: 8,
    marginBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardShadow: {
    ...shadow,
  },
  placeholderCard: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 20,
    gap: 12,
  },
  innerCard: {
    borderRadius: theme.radius.md,
    padding: 16,
    backgroundColor: theme.colors.backgroundElevated,
    gap: 8,
  },
  detailsHero: {
    position: 'relative',
    overflow: 'hidden',
  },
  heroControls: {
    position: 'absolute',
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroFooter: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroCopy: {
    flex: 1,
    gap: 8,
  },
  sheet: {
    marginTop: -22,
    marginHorizontal: 16,
    padding: 20,
    borderRadius: theme.radius.xl,
    backgroundColor: 'rgba(12,15,23,0.94)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 18,
    ...shadow,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  copySection: {
    gap: 10,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 24,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(10,13,19,0.82)',
  },
  bottomBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ticketShell: {
    borderRadius: 34,
    padding: 14,
    backgroundColor: 'rgba(38,22,19,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    ...shadow,
  },
  ticketPaper: {
    marginTop: 12,
    borderRadius: 24,
    backgroundColor: theme.colors.paper,
    paddingHorizontal: 22,
    paddingVertical: 20,
    gap: 18,
  },
  centerBlock: {
    alignSelf: 'center',
  },
  divider: {
    opacity: 0.5,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  actions: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 12,
  },
});
