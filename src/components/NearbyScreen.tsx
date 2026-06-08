import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, useJellyPressAnimation } from './Primitives';
import { shadow, theme } from '../theme';
import { AppEvent, AppUser } from '../types';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

export function NearbyScreen({
  events,
  onBack,
  onRefresh,
  onOpenEvent,
  profile,
  refreshing,
}: {
  events: AppEvent[];
  onBack: () => void;
  onRefresh: () => Promise<void>;
  onOpenEvent: (event: AppEvent) => void;
  profile?: AppUser | null;
  refreshing: boolean;
}) {
  const insets = useSafeAreaInsets();
  const [locationState, setLocationState] = useState<{
    loading: boolean;
    error: string | null;
    label: string;
    latitude: number | null;
    longitude: number | null;
  }>({
    loading: true,
    error: null,
    label: 'Checking your location',
    latitude: null,
    longitude: null,
  });

  const loadNearbyLocation = async () => {
    setLocationState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationState({
          loading: false,
          error: 'Allow location access to explore what is closest to you.',
          label: 'Location access needed',
          latitude: null,
          longitude: null,
        });
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      let label = 'Your current area';

      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (place) {
          label = [place.city, place.region].filter(Boolean).join(', ') || place.region || place.city || label;
        }
      } catch {}

      setLocationState({
        loading: false,
        error: null,
        label,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch {
      setLocationState({
        loading: false,
        error: 'Your location could not be loaded right now. Try again in a moment.',
        label: 'Location unavailable',
        latitude: null,
        longitude: null,
      });
    }
  };

  useEffect(() => {
    void loadNearbyLocation();
  }, []);

  const handleRefresh = async () => {
    await Promise.all([onRefresh(), loadNearbyLocation()]);
  };

  const sortedNearbyEvents = useMemo(() => {
    return events
      .map((event) => ({
        event,
        distanceKm:
          locationState.latitude == null || locationState.longitude == null
            ? null
            : calculateDistanceKm(
                locationState.latitude,
                locationState.longitude,
                event.location.latitude,
                event.location.longitude,
              ),
      }))
      .sort((left, right) => {
        if (left.distanceKm == null && right.distanceKm == null) {
          return 0;
        }
        if (left.distanceKm == null) {
          return 1;
        }
        if (right.distanceKm == null) {
          return -1;
        }
        return left.distanceKm - right.distanceKm;
      });
  }, [events, locationState.latitude, locationState.longitude]);

  const closestEvents = sortedNearbyEvents.slice(0, 3);
  const allNearbyEvents = sortedNearbyEvents.slice(0, 12);
  const avatarSource = profile?.avatar ? profile.avatar : require('../../logo.png');

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl
            colors={[theme.colors.accentStrong]}
            progressBackgroundColor={theme.colors.surfaceStrong}
            refreshing={refreshing}
            tintColor={theme.colors.accentStrong}
            onRefresh={() => void handleRefresh()}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <IconButton icon="chevron-left" onPress={onBack} accessibilityLabel="Go back" />
          <View style={styles.headerCopy}>
            <Text style={styles.headerTitle}>Explore nearby</Text>
            <Text style={styles.headerSubtitle}>What is around you right now</Text>
          </View>
          <View style={styles.avatar}>
            <Image source={avatarSource} contentFit="cover" style={styles.avatarImage} transition={120} />
          </View>
        </View>

        <View style={styles.locationCard}>
          <View style={styles.locationCardTop}>
            <View style={styles.locationBadge}>
              <Feather color={theme.colors.accentStrong} name={'map-pin' as FeatherName} size={14} />
              <Text style={styles.locationBadgeText}>Live location</Text>
            </View>
            <RefreshNearbyButton onPress={() => void loadNearbyLocation()} />
          </View>

          <Text style={styles.locationCardTitle}>{locationState.label}</Text>
          {locationState.loading ? (
            <View style={styles.locationLoadingRow}>
              <ActivityIndicator color={theme.colors.accentStrong} />
              <Text style={styles.locationCardCopy}>Finding the nearest spots and events for you.</Text>
            </View>
          ) : (
            <Text style={styles.locationCardCopy}>
              {locationState.error
                ? locationState.error
                : `Showing listings sorted from the closest match first using your current location.`}
            </Text>
          )}
        </View>

        <NearbySection title="Closest now" hint="Best matches first">
          {closestEvents.length === 0 ? (
            <NearbyEmptyState />
          ) : (
            closestEvents.map(({ event, distanceKm }) => (
              <NearbyListingCard
                key={`closest-${event.id}`}
                distanceKm={distanceKm}
                event={event}
                onPress={() => onOpenEvent(event)}
              />
            ))
          )}
        </NearbySection>

        <NearbySection title="More around you" hint="Wider nearby feed">
          {allNearbyEvents.length === 0 ? (
            <NearbyEmptyState />
          ) : (
            allNearbyEvents.map(({ event, distanceKm }) => (
              <NearbyListingRow
                key={`nearby-${event.id}`}
                distanceKm={distanceKm}
                event={event}
                onPress={() => onOpenEvent(event)}
              />
            ))
          )}
        </NearbySection>
      </ScrollView>
    </View>
  );
}

function NearbySection({
  children,
  hint,
  title,
}: {
  children: React.ReactNode;
  hint: string;
  title: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionHint}>{hint}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function NearbyListingCard({
  distanceKm,
  event,
  onPress,
}: {
  distanceKm: number | null;
  event: AppEvent;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.012,
    pressedScaleY: 0.972,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={jelly.animatedStyle}>
        <View style={styles.cardShell}>
          <View style={styles.cardGlow} />
          <View style={styles.cardBorder}>
            <View style={styles.cardImageWrap}>
              <Image source={event.image} contentFit="cover" style={styles.cardImage} transition={150} />
            </View>
            <View style={styles.cardCopy}>
              <Text numberOfLines={1} style={styles.cardTitle}>
                {event.title}
              </Text>
              <Text numberOfLines={1} style={styles.cardMeta}>
                {event.venue} | {event.city}
              </Text>
              <Text numberOfLines={2} style={styles.cardBlurb}>
                {event.blurb || event.about}
              </Text>
              <View style={styles.cardFooter}>
                <View style={styles.distanceChip}>
                  <Feather color={theme.colors.accentStrong} name={'navigation' as FeatherName} size={12} />
                  <Text style={styles.distanceText}>{formatDistance(distanceKm)}</Text>
                </View>
                <Text style={styles.cardPrice}>{event.price}</Text>
              </View>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function NearbyListingRow({
  distanceKm,
  event,
  onPress,
}: {
  distanceKm: number | null;
  event: AppEvent;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.01,
    pressedScaleY: 0.97,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <View style={styles.rowShell}>
        <View style={styles.rowWrap}>
          <Animated.View style={jelly.animatedStyle}>
            <View style={styles.rowContent}>
              <Image source={event.image} contentFit="cover" style={styles.rowImage} transition={120} />
              <View style={styles.rowCopy}>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {event.title}
                </Text>
                <Text numberOfLines={1} style={styles.rowMeta}>
                  {event.location.address || `${event.venue} | ${event.city}`}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.rowDistance}>{formatDistance(distanceKm)}</Text>
                <Text style={styles.rowPrice}>{event.price}</Text>
              </View>
            </View>
          </Animated.View>
        </View>
      </View>
    </Pressable>
  );
}

function NearbyEmptyState() {
  return (
    <View style={styles.emptyState}>
      <Feather color={theme.colors.accentStrong} name={'map-pin' as FeatherName} size={16} />
      <Text style={styles.emptyStateTitle}>No nearby listings yet</Text>
      <Text style={styles.emptyStateCopy}>Once listings with location data are available, they will show up here.</Text>
    </View>
  );
}

function RefreshNearbyButton({ onPress }: { onPress: () => void }) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.02,
    pressedScaleY: 0.95,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={[styles.refreshButton, jelly.animatedStyle]}>
        <Feather color={theme.colors.textMuted} name={'sliders' as FeatherName} size={14} />
        <Text style={styles.refreshButtonText}>Refresh</Text>
      </Animated.View>
    </Pressable>
  );
}

function calculateDistanceKm(startLat: number, startLng: number, endLat: number, endLng: number) {
  if (!Number.isFinite(startLat) || !Number.isFinite(startLng) || !Number.isFinite(endLat) || !Number.isFinite(endLng)) {
    return null;
  }

  if (Math.abs(endLat) < 0.000001 && Math.abs(endLng) < 0.000001) {
    return null;
  }

  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const latDelta = toRadians(endLat - startLat);
  const lngDelta = toRadians(endLng - startLng);
  const a =
    Math.sin(latDelta / 2) * Math.sin(latDelta / 2) +
    Math.cos(toRadians(startLat)) *
      Math.cos(toRadians(endLat)) *
      Math.sin(lngDelta / 2) *
      Math.sin(lngDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function formatDistance(distanceKm: number | null) {
  if (distanceKm == null) {
    return 'Distance soon';
  }

  if (distanceKm < 1) {
    return `${Math.max(100, Math.round(distanceKm * 1000))} m`;
  }

  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 4,
    gap: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerCopy: {
    flex: 1,
    gap: 3,
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  locationCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    padding: 16,
    gap: 12,
    ...shadow,
  },
  locationCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  locationBadgeText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  refreshButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refreshButtonText: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
  },
  locationCardTitle: {
    color: theme.colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  locationCardCopy: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  locationLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  section: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  sectionHint: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionBody: {
    gap: 10,
  },
  cardShell: {
    position: 'relative',
  },
  cardGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    backgroundColor: 'rgba(242,34,28,0.08)',
  },
  cardBorder: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    overflow: 'hidden',
  },
  cardImageWrap: {
    height: 176,
    backgroundColor: theme.colors.surfaceMuted,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  cardCopy: {
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  cardMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  cardBlurb: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  distanceChip: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  distanceText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  cardPrice: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  rowShell: {
    ...shadow,
  },
  rowWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  rowContent: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowImage: {
    width: 56,
    height: 56,
    borderRadius: 10,
    backgroundColor: theme.colors.surfaceMuted,
  },
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  rowMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  rowRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  rowDistance: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  rowPrice: {
    color: theme.colors.accentStrong,
    fontSize: 12,
    fontWeight: '800',
  },
  emptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 14,
    gap: 8,
    alignItems: 'flex-start',
  },
  emptyStateTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyStateCopy: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
});
