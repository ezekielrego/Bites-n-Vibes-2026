import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather, FontAwesome6, MaterialCommunityIcons } from '@expo/vector-icons';
import { ResizeMode, type AVPlaybackStatus, Video } from 'expo-av';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import MapView, { Marker } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, shadow } from '../theme';
import { AppEvent, AppEventMedia, AppUser, ContactIconName, SocialPlatform } from '../types';
import { IconButton, PrimaryButton, Tag, useJellyPressAnimation } from './Primitives';
import { CommentsSheet } from './CommentsSheet';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
type FontAwesome6Name = React.ComponentProps<typeof FontAwesome6>['name'];

const SOCIAL_ICON_MAP: Record<SocialPlatform, { name: FontAwesome6Name; brand?: true; color: string }> = {
  tiktok: { name: 'tiktok', brand: true, color: theme.colors.text },
  youtube: { name: 'youtube', brand: true, color: '#FF6E66' },
  facebook: { name: 'facebook', brand: true, color: '#78A8FF' },
  instagram: { name: 'instagram', brand: true, color: '#FF9C74' },
  x: { name: 'x-twitter', brand: true, color: theme.colors.text },
  web: { name: 'globe', color: theme.colors.textMuted },
};

export function DetailsScreen({
  event,
  isSaved,
  profile,
  onBack,
  onBook,
  onCommentCountChange,
  onRate,
  onToggleSave,
}: {
  event: AppEvent;
  isSaved: boolean;
  profile: AppUser | null;
  onBack: () => void;
  onBook: () => void;
  onCommentCountChange: (nextCount: number) => void;
  onRate: (value: number) => Promise<void>;
  onToggleSave: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const heroHeight = Math.min(width * 1.08, 420);
  const [selectedRating, setSelectedRating] = useState(() => Math.round(event.rating));
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingPending, setRatingPending] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(event.commentCount ?? 0);
  const [mapExpanded, setMapExpanded] = useState(false);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [fullscreenVideo, setFullscreenVideo] = useState<AppEventMedia | null>(null);
  const tags = event.categories.map((category) => category.name);
  const heroMedia = useMemo(() => buildHeroMedia(event), [event]);
  const activeMedia = heroMedia[activeMediaIndex] ?? heroMedia[0] ?? null;
  const heroPagerRef = useRef<ScrollView>(null);
  const autoplayHoldUntil = useRef(0);
  const mapPreviewJelly = useJellyPressAnimation({
    pressedScaleX: 1.01,
    pressedScaleY: 0.984,
  });

  useEffect(() => {
    setSelectedRating(Math.round(event.rating));
    setRatingOpen(false);
  }, [event.id, event.rating]);

  useEffect(() => {
    setCommentsOpen(false);
    setActiveMediaIndex(0);
    setFullscreenVideo(null);
  }, [event.id]);

  useEffect(() => {
    setCommentCount(event.commentCount ?? 0);
  }, [event.commentCount]);

  const openLink = (url: string) => {
    void Linking.openURL(url).catch(() => undefined);
  };

  const goToMediaIndex = useCallback(
    (nextIndex: number, animated = true) => {
      if (heroMedia.length === 0) {
        return;
      }

      const boundedIndex = ((nextIndex % heroMedia.length) + heroMedia.length) % heroMedia.length;
      heroPagerRef.current?.scrollTo({
        x: boundedIndex * width,
        y: 0,
        animated,
      });
      setActiveMediaIndex(boundedIndex);
    },
    [heroMedia.length, width],
  );

  const advanceMedia = useCallback(() => {
    if (heroMedia.length < 2) {
      return;
    }

    goToMediaIndex(activeMediaIndex + 1);
  }, [activeMediaIndex, goToMediaIndex, heroMedia.length]);

  useEffect(() => {
    if (heroMedia.length < 2 || !activeMedia || activeMedia.kind === 'video') {
      return;
    }

    const holdFor = Math.max(0, autoplayHoldUntil.current - Date.now());
    const timer = setTimeout(() => {
      advanceMedia();
    }, holdFor + 3600);

    return () => clearTimeout(timer);
  }, [activeMedia, advanceMedia, heroMedia.length]);

  const handleHeroMomentumEnd = useCallback(
    (scrollEvent: NativeSyntheticEvent<NativeScrollEvent>) => {
      const nextIndex = Math.round(scrollEvent.nativeEvent.contentOffset.x / Math.max(width, 1));
      setActiveMediaIndex(Math.max(0, Math.min(nextIndex, heroMedia.length - 1)));
      autoplayHoldUntil.current = Date.now() + 5200;
    },
    [heroMedia.length, width],
  );

  const handleVideoStatusUpdate = useCallback(
    (status: AVPlaybackStatus, mediaId: string) => {
      if (!status.isLoaded || !status.didJustFinish) {
        return;
      }

      if (activeMedia?.id !== mediaId || heroMedia.length < 2) {
        return;
      }

      advanceMedia();
    },
    [activeMedia?.id, advanceMedia, heroMedia.length],
  );

  const handleOpenDirections = async () => {
    const { latitude, longitude } = event.location;
    const destination = `${latitude},${longitude}`;
    const fallbackUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
    const appUrl =
      Platform.OS === 'ios'
        ? `comgooglemaps://?daddr=${encodeURIComponent(destination)}&directionsmode=driving`
        : Platform.OS === 'android'
          ? `google.navigation:q=${encodeURIComponent(destination)}&mode=d`
          : fallbackUrl;

    try {
      if (appUrl !== fallbackUrl && (await Linking.canOpenURL(appUrl))) {
        await Linking.openURL(appUrl);
        return;
      }
    } catch {}

    void Linking.openURL(fallbackUrl).catch(() => undefined);
  };

  const handleRate = async (value: number) => {
    setSelectedRating(value);
    setRatingPending(true);

    try {
      await onRate(value);
    } finally {
      setRatingPending(false);
      setTimeout(() => {
        setRatingOpen(false);
      }, 160);
    }
  };

  const handleCommentCountChange = (nextCount: number) => {
    setCommentCount(nextCount);
    onCommentCountChange(nextCount);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 132 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { height: heroHeight }]}>
          <ScrollView
            ref={heroPagerRef}
            bounces={false}
            horizontal
            onMomentumScrollEnd={handleHeroMomentumEnd}
            onScrollBeginDrag={() => {
              autoplayHoldUntil.current = Date.now() + 5200;
            }}
            pagingEnabled
            showsHorizontalScrollIndicator={false}
          >
            {heroMedia.map((media) => (
              <HeroMediaSlide
                key={media.id}
                height={heroHeight}
                isActive={activeMedia?.id === media.id && !fullscreenVideo}
                media={media}
                onOpenVideo={() => setFullscreenVideo(media)}
                onVideoFinish={handleVideoStatusUpdate}
                width={width}
              />
            ))}
          </ScrollView>
          <LinearGradient
            colors={['rgba(8,10,14,0.10)', 'rgba(8,10,14,0.86)']}
            start={{ x: 0.5, y: 0.1 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          {heroMedia.length > 1 ? <HeroPaginationDots activeIndex={activeMediaIndex} count={heroMedia.length} /> : null}
          {activeMedia?.kind === 'video' ? (
            <View pointerEvents="none" style={styles.heroVideoHint}>
              <Feather color={theme.colors.white} name="play-circle" size={14} />
              <Text style={styles.heroVideoHintText}>Tap video to expand</Text>
            </View>
          ) : null}

          <View style={[styles.heroControls, { paddingTop: insets.top + 8 }]}>
            <IconButton icon="chevron-left" onPress={onBack} accessibilityLabel="Go back" />
            <View style={styles.heroActionRow}>
              <SaveHeroButton saved={isSaved} onPress={onToggleSave} />
              <IconButton icon="share-2" accessibilityLabel="Share event" />
            </View>
          </View>

          <View style={styles.heroFooter}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroLabel}>Featured concert</Text>
              <Text style={styles.heroTitle}>{event.artist}</Text>
              <Text style={styles.heroSubtitle}>
                {event.venue} - {event.city}
              </Text>
            </View>

            <View style={styles.heroPriceChip}>
              <Text style={styles.heroPrice}>{event.price}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sheet}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.eventBlurb}>{event.blurb}</Text>

          <View style={styles.metricRow}>
            <MetricCard icon="calendar" label="Date" value={event.dateLabel} />
            <MetricCard icon="clock" label="Starts" value={event.time} />
          </View>

          <View style={styles.metricRow}>
            <MetricCard icon="map-pin" label="Venue" value={event.venue} />
            <MetricCard icon="star" label="Rating" value={event.rating.toFixed(1)} />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Location</Text>
            <View style={styles.mapCard}>
              <Pressable
                onPress={() => setMapExpanded(true)}
                onPressIn={mapPreviewJelly.onPressIn}
                onPressOut={mapPreviewJelly.onPressOut}
                style={styles.mapPreviewPressable}
              >
                <Animated.View style={[styles.mapFrame, mapPreviewJelly.animatedStyle]}>
                  <MapView
                    key={event.id}
                    initialRegion={{
                      latitude: event.location.latitude,
                      longitude: event.location.longitude,
                      latitudeDelta: event.location.latitudeDelta,
                      longitudeDelta: event.location.longitudeDelta,
                    }}
                    loadingEnabled
                    pitchEnabled={false}
                    rotateEnabled={false}
                    scrollEnabled={false}
                    showsCompass={false}
                    style={styles.map}
                    toolbarEnabled={false}
                    zoomEnabled={false}
                  >
                    <Marker
                      coordinate={{
                        latitude: event.location.latitude,
                        longitude: event.location.longitude,
                      }}
                      description={event.location.address}
                      title={event.venue}
                    />
                  </MapView>
                  <View pointerEvents="none" style={styles.mapBadge}>
                    <Feather color={theme.colors.accentStrong} name="map-pin" size={13} />
                    <Text style={styles.mapBadgeText}>{event.location.label}</Text>
                  </View>
                  <View pointerEvents="none" style={styles.mapExpandHint}>
                    <Feather color={theme.colors.text} name="maximize-2" size={12} />
                    <Text style={styles.mapExpandHintText}>Open map</Text>
                  </View>
                </Animated.View>
              </Pressable>

              <View style={styles.mapMeta}>
                <Text style={styles.mapAddress}>{event.location.address}</Text>
                <Text style={styles.mapNote}>{event.location.note}</Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About the night</Text>
            <Text style={styles.sectionText}>{event.about}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What to expect</Text>
            <View style={styles.highlightList}>
              {event.highlights.map((highlight) => (
                <View key={highlight} style={styles.highlightRow}>
                  <View style={styles.highlightDot}>
                    <View style={styles.highlightInnerDot} />
                  </View>
                  <Text style={styles.highlightText}>{highlight}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Connect</Text>
            <View style={styles.contactRow}>
              {event.contacts.map((contact) => (
                <ContactButton key={contact.id} icon={contact.icon} label={contact.label} onPress={() => openLink(contact.url)} />
              ))}
            </View>

            <View style={styles.socialRow}>
              {event.socials.map((social) => (
                <SocialButton key={social.id} platform={social.platform} onPress={() => openLink(social.url)} />
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tags</Text>
            <View style={styles.tagRow}>
              {tags.map((tag) => (
                <Tag key={tag} label={tag} />
              ))}
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.bottomBarInner}>
          <PrimaryButton label="Get ticket" onPress={onBook} />
          <RatingDock
            isOpen={ratingOpen}
            isSubmitting={ratingPending}
            onRate={handleRate}
            onToggle={() => setRatingOpen((open) => !open)}
            selectedRating={selectedRating}
          />
          <CommentDock count={commentCount} onPress={() => setCommentsOpen(true)} />
        </View>
      </View>

      <CommentsSheet
        eventId={event.id}
        onClose={() => setCommentsOpen(false)}
        onCountChange={handleCommentCountChange}
        profile={profile}
        totalCount={commentCount}
        visible={commentsOpen}
      />

      <Modal animationType="fade" onRequestClose={() => setMapExpanded(false)} transparent visible={mapExpanded}>
        <View style={styles.mapModalBackdrop}>
          <View style={[styles.mapModalShell, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.mapModalHeader}>
              <View style={styles.mapModalHeaderCopy}>
                <Text style={styles.mapModalTitle}>{event.venue}</Text>
                <Text style={styles.mapModalSubtitle}>{event.location.address}</Text>
              </View>
              <IconButton icon="x" onPress={() => setMapExpanded(false)} accessibilityLabel="Close map" />
            </View>

            <View style={styles.mapModalFrame}>
              <MapView
                key={`${event.id}-expanded`}
                initialRegion={{
                  latitude: event.location.latitude,
                  longitude: event.location.longitude,
                  latitudeDelta: event.location.latitudeDelta,
                  longitudeDelta: event.location.longitudeDelta,
                }}
                loadingEnabled
                showsCompass
                style={styles.mapModalMap}
                toolbarEnabled
              >
                <Marker
                  coordinate={{
                    latitude: event.location.latitude,
                    longitude: event.location.longitude,
                  }}
                  description={event.location.address}
                  title={event.venue}
                />
              </MapView>
            </View>

            <View style={styles.mapModalMeta}>
              <Text style={styles.mapAddress}>{event.location.address}</Text>
              <Text style={styles.mapNote}>{event.location.note}</Text>
            </View>

            <MapDirectionsButton onPress={() => void handleOpenDirections()} />
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={() => setFullscreenVideo(null)}
        statusBarTranslucent
        visible={Boolean(fullscreenVideo)}
      >
        <View style={styles.fullscreenVideoRoot}>
          <View style={[styles.fullscreenVideoHeader, { paddingTop: insets.top + 8 }]}>
            <View style={styles.fullscreenVideoCopy}>
              <Text style={styles.fullscreenVideoTitle}>{event.title}</Text>
              <Text style={styles.fullscreenVideoSubtitle}>{event.venue}</Text>
            </View>
            <IconButton icon="x" onPress={() => setFullscreenVideo(null)} accessibilityLabel="Close video" />
          </View>

          {fullscreenVideo ? (
            <Video
              shouldPlay
              source={{ uri: fullscreenVideo.source }}
              style={styles.fullscreenVideoPlayer}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function SaveHeroButton({
  saved,
  onPress,
}: {
  saved: boolean;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.08,
    pressedScaleY: 0.9,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut} style={styles.heroSavePressable}>
      <Animated.View style={[styles.heroSaveButton, saved && styles.heroSaveButtonActive, jelly.animatedStyle]}>
        <Feather color={saved ? theme.colors.white : theme.colors.accentStrong} name="heart" size={17} />
      </Animated.View>
    </Pressable>
  );
}

function MapDirectionsButton({
  onPress,
}: {
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.02,
    pressedScaleY: 0.95,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut} style={styles.mapDirectionsPressable}>
      <Animated.View style={[styles.mapDirectionsButton, jelly.animatedStyle]}>
        <Feather color={theme.colors.white} name="navigation" size={15} />
        <Text style={styles.mapDirectionsText}>Open in Google Maps</Text>
      </Animated.View>
    </Pressable>
  );
}

function HeroMediaSlide({
  media,
  width,
  height,
  isActive,
  onOpenVideo,
  onVideoFinish,
}: {
  media: AppEventMedia;
  width: number;
  height: number;
  isActive: boolean;
  onOpenVideo: () => void;
  onVideoFinish: (status: AVPlaybackStatus, mediaId: string) => void;
}) {
  if (media.kind === 'video') {
    return (
      <Pressable onPress={onOpenVideo} style={{ width, height }}>
        <Video
          isLooping={false}
          onPlaybackStatusUpdate={(status) => onVideoFinish(status, media.id)}
          posterSource={media.preview ? { uri: media.preview } : undefined}
          posterStyle={styles.heroMedia}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive}
          source={{ uri: media.source }}
          style={styles.heroMedia}
          usePoster={Boolean(media.preview)}
        />
      </Pressable>
    );
  }

  return <Image contentFit="cover" source={media.source} style={{ width, height }} transition={220} />;
}

function HeroPaginationDots({
  activeIndex,
  count,
}: {
  activeIndex: number;
  count: number;
}) {
  return (
    <View pointerEvents="none" style={styles.heroPagination}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={[styles.heroPaginationDot, index === activeIndex && styles.heroPaginationDotActive]} />
      ))}
    </View>
  );
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon: FeatherName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}>
        <Feather color={theme.colors.accentStrong} name={icon} size={15} />
      </View>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text numberOfLines={2} style={styles.metricValue}>
        {value}
      </Text>
    </View>
  );
}

function ContactButton({
  icon,
  label,
  onPress,
}: {
  icon: ContactIconName;
  label: string;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.045,
    pressedScaleY: 0.93,
  });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.contactPressable}
    >
      <Animated.View style={[styles.contactChip, jelly.animatedStyle]}>
        <Feather color={theme.colors.accentStrong} name={icon} size={14} />
        <Text numberOfLines={1} style={styles.contactChipText}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function SocialButton({
  platform,
  onPress,
}: {
  platform: SocialPlatform;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.09,
    pressedScaleY: 0.9,
  });
  const icon = SOCIAL_ICON_MAP[platform];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.socialPressable}
    >
      <Animated.View style={[styles.socialButton, jelly.animatedStyle]}>
        <FontAwesome6 brand={icon.brand} color={icon.color} name={icon.name} size={15} />
      </Animated.View>
    </Pressable>
  );
}

function RatingDock({
  selectedRating,
  isOpen,
  isSubmitting,
  onToggle,
  onRate,
}: {
  selectedRating: number;
  isOpen: boolean;
  isSubmitting: boolean;
  onToggle: () => void;
  onRate: (value: number) => Promise<void>;
}) {
  const progress = useRef(new Animated.Value(isOpen ? 1 : 0)).current;
  const triggerJelly = useJellyPressAnimation({
    pressedScaleX: 1.07,
    pressedScaleY: 0.92,
  });

  useEffect(() => {
    Animated.spring(progress, {
      toValue: isOpen ? 1 : 0,
      stiffness: isOpen ? 250 : 280,
      damping: 18,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [isOpen, progress]);

  return (
    <View style={styles.ratingDock}>
      <Animated.View
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={[
          styles.ratingRail,
          {
            opacity: progress,
            transform: [
              {
                translateY: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, 0],
                }),
              },
              {
                scaleX: progress.interpolate({
                  inputRange: [0, 0.65, 1],
                  outputRange: [0.78, 1.06, 1],
                }),
              },
              {
                scaleY: progress.interpolate({
                  inputRange: [0, 0.65, 1],
                  outputRange: [0.58, 1.12, 1],
                }),
              },
            ],
          },
        ]}
      >
        {[5, 4, 3, 2, 1].map((value, index) => (
          <RatingStarButton
            key={value}
            active={value <= selectedRating}
            index={index}
            motion={progress}
            onPress={() => onRate(value)}
            value={value}
          />
        ))}
      </Animated.View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Rate this event"
        onPress={onToggle}
        onPressIn={triggerJelly.onPressIn}
        onPressOut={triggerJelly.onPressOut}
        style={styles.ratingTriggerPressable}
      >
        <Animated.View style={[styles.ratingTrigger, triggerJelly.animatedStyle]}>
          <MaterialCommunityIcons color={theme.colors.accentStrong} name={isSubmitting ? 'star-four-points' : 'star'} size={20} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

function CommentDock({
  count,
  onPress,
}: {
  count: number;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.07,
    pressedScaleY: 0.92,
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open comments"
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.commentTriggerPressable}
    >
      <Animated.View style={[styles.commentTrigger, jelly.animatedStyle]}>
        <Feather color={theme.colors.accentStrong} name="message-circle" size={18} />
        {count > 0 ? (
          <View style={styles.commentBadge}>
            <Text style={styles.commentBadgeText}>{count > 99 ? '99+' : String(count)}</Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function RatingStarButton({
  value,
  index,
  active,
  motion,
  onPress,
}: {
  value: number;
  index: number;
  active: boolean;
  motion: Animated.Value;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.1,
    pressedScaleY: 0.88,
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Rate ${value} stars`}
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.ratingStarPressable}
    >
      <Animated.View
        style={[
          styles.ratingStarMotion,
          {
            opacity: motion.interpolate({
              inputRange: [0, 0.25, 1],
              outputRange: [0, 0.36, 1],
            }),
            transform: [
              {
                translateY: motion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12 + index * 6, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Animated.View style={[styles.ratingStar, active && styles.ratingStarActive, jelly.animatedStyle]}>
          <MaterialCommunityIcons
            color={active ? theme.colors.white : theme.colors.textMuted}
            name={active ? 'star' : 'star-outline'}
            size={16}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

function buildHeroMedia(event: AppEvent) {
  if (event.media.length > 0) {
    return event.media;
  }

  if (typeof event.image === 'string' && event.image.length > 0) {
    return [
      {
        id: `${event.id}-hero-fallback`,
        kind: 'image' as const,
        role: 'hero' as const,
        source: event.image,
        preview: event.image,
        altText: event.title,
      },
    ];
  }

  return [];
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    overflow: 'hidden',
  },
  heroMedia: {
    width: '100%',
    height: '100%',
  },
  heroControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  heroSavePressable: {
    alignSelf: 'flex-start',
  },
  heroSaveButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSaveButtonActive: {
    backgroundColor: 'rgba(255,107,61,0.24)',
    borderColor: 'rgba(255,107,61,0.28)',
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
    gap: 6,
  },
  heroPagination: {
    position: 'absolute',
    bottom: 90,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  heroPaginationDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  heroPaginationDotActive: {
    width: 20,
    backgroundColor: theme.colors.white,
  },
  heroVideoHint: {
    position: 'absolute',
    right: 20,
    bottom: 92,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
    minHeight: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(8,10,14,0.46)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  heroVideoHintText: {
    color: theme.colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  heroLabel: {
    color: theme.colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: theme.colors.white,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 36,
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },
  heroPriceChip: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPrice: {
    color: theme.colors.paperInk,
    fontSize: 15,
    fontWeight: '800',
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
  eventTitle: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  eventBlurb: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minHeight: 108,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 14,
    gap: 8,
  },
  metricIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  metricValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  sectionText: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  mapCard: {
    gap: 12,
  },
  mapPreviewPressable: {
    alignSelf: 'stretch',
  },
  mapFrame: {
    overflow: 'hidden',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
  },
  map: {
    width: '100%',
    height: 184,
  },
  mapBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(10,13,19,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,61,0.22)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapBadgeText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  mapExpandHint: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(10,13,19,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mapExpandHintText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  mapMeta: {
    gap: 6,
  },
  mapModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(6,8,12,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  mapModalShell: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(12,15,23,0.98)',
    paddingHorizontal: 12,
    gap: 12,
    ...shadow,
  },
  mapModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mapModalHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  mapModalTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  mapModalSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  mapModalFrame: {
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
  },
  mapModalMap: {
    width: '100%',
    height: 420,
  },
  mapModalMeta: {
    gap: 6,
  },
  mapDirectionsPressable: {
    alignSelf: 'stretch',
  },
  mapDirectionsButton: {
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: theme.colors.accentStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  mapDirectionsText: {
    color: theme.colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  fullscreenVideoRoot: {
    flex: 1,
    backgroundColor: '#05070C',
  },
  fullscreenVideoHeader: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  fullscreenVideoCopy: {
    flex: 1,
    gap: 4,
  },
  fullscreenVideoTitle: {
    color: theme.colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  fullscreenVideoSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  fullscreenVideoPlayer: {
    flex: 1,
    backgroundColor: '#05070C',
  },
  mapAddress: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  mapNote: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  highlightList: {
    gap: 12,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  highlightDot: {
    marginTop: 3,
    width: 18,
    height: 18,
    borderRadius: 999,
    backgroundColor: theme.colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  highlightInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.accentStrong,
  },
  highlightText: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  contactRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  contactPressable: {
    alignSelf: 'flex-start',
  },
  contactChip: {
    minHeight: 38,
    maxWidth: 132,
    paddingHorizontal: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactChipText: {
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  socialPressable: {
    alignSelf: 'flex-start',
  },
  socialButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  ratingDock: {
    position: 'relative',
    width: 54,
    alignItems: 'center',
  },
  ratingRail: {
    position: 'absolute',
    right: 0,
    bottom: 56,
    padding: 6,
    borderRadius: 22,
    backgroundColor: 'rgba(12,15,23,0.96)',
    borderWidth: 1,
    borderColor: 'rgba(255,107,61,0.2)',
    gap: 6,
    ...shadow,
  },
  ratingStarPressable: {
    alignSelf: 'center',
  },
  ratingStarMotion: {
    alignItems: 'center',
  },
  ratingStar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  ratingStarActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(255,107,61,0.28)',
  },
  ratingTriggerPressable: {
    alignSelf: 'flex-end',
  },
  ratingTrigger: {
    width: 52,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(255,107,61,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentTriggerPressable: {
    alignSelf: 'flex-end',
  },
  commentTrigger: {
    width: 52,
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(255,107,61,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentBadge: {
    position: 'absolute',
    top: -4,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: 'rgba(10,13,19,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentBadgeText: {
    color: theme.colors.white,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
