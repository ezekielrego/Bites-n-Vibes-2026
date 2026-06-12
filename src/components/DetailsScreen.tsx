import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Feather, FontAwesome6, MaterialCommunityIcons } from '@expo/vector-icons';
import { ResizeMode, type AVPlaybackStatus, Video } from 'expo-av';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme, shadow } from '../theme';
import {
  AppEvent,
  AppEventMedia,
  AppTicket,
  AppUser,
  BookingCheckoutInput,
  BookingPaymentMethod,
  ContactIconName,
  EventLocation,
  SocialPlatform,
} from '../types';
import { IconButton, Tag, useJellyPressAnimation } from './Primitives';
import { CommentsSheet } from './CommentsSheet';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
type FontAwesome6Name = React.ComponentProps<typeof FontAwesome6>['name'];

const SOCIAL_ICON_MAP: Record<SocialPlatform, { name: FontAwesome6Name; brand?: true; color: string }> = {
  tiktok: { name: 'tiktok', brand: true, color: theme.colors.text },
  youtube: { name: 'youtube', brand: true, color: '#FF6E66' },
  facebook: { name: 'facebook', brand: true, color: '#78A8FF' },
  instagram: { name: 'instagram', brand: true, color: '#FF6F6A' },
  x: { name: 'x-twitter', brand: true, color: theme.colors.text },
  web: { name: 'globe', color: theme.colors.textMuted },
};

const PAYMENT_METHODS: Array<{ id: BookingPaymentMethod; label: string }> = [
  { id: 'ecocash', label: 'EcoCash' },
  { id: 'onemoney', label: 'OneMoney' },
  { id: 'innbucks', label: 'Innbucks' },
  { id: 'omari', label: 'Omari' },
];

function useAnimatedProgressSnapshot(motion: Animated.Value) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const listenerId = motion.addListener(({ value }) => {
      setProgress(Math.max(0, Math.min(value, 1)));
    });

    return () => {
      motion.removeListener(listenerId);
    };
  }, [motion]);

  return progress;
}

function interpolateNumber(value: number, inputRange: number[], outputRange: number[]) {
  const clamped = Math.max(inputRange[0] ?? 0, Math.min(value, inputRange[inputRange.length - 1] ?? 1));

  for (let index = 0; index < inputRange.length - 1; index += 1) {
    const inputStart = inputRange[index];
    const inputEnd = inputRange[index + 1];

    if (clamped >= inputStart && clamped <= inputEnd) {
      const segmentProgress = inputEnd === inputStart ? 0 : (clamped - inputStart) / (inputEnd - inputStart);
      const outputStart = outputRange[index];
      const outputEnd = outputRange[index + 1];
      return outputStart + (outputEnd - outputStart) * segmentProgress;
    }
  }

  return outputRange[outputRange.length - 1] ?? 0;
}

export function DetailsScreen({
  event,
  isSaved,
  profile,
  onBack,
  onBook,
  onCommentCountChange,
  onRate,
  onRefresh,
  onToggleSave,
  refreshing,
}: {
  event: AppEvent;
  isSaved: boolean;
  profile: AppUser | null;
  onBack: () => void;
  onBook: (input?: BookingCheckoutInput) => Promise<AppTicket | null>;
  onCommentCountChange: (nextCount: number) => void;
  onRate: (value: number) => Promise<void>;
  onRefresh: () => Promise<void>;
  onToggleSave: () => void;
  refreshing: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const heroHeight = Math.min(width * 1.08, 420);
  const [selectedRating, setSelectedRating] = useState(() => getInitialUserRating(event));
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingPending, setRatingPending] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(event.commentCount ?? 0);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [fullscreenVideo, setFullscreenVideo] = useState<AppEventMedia | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<BookingPaymentMethod>('ecocash');
  const [paymentPhone, setPaymentPhone] = useState('');
  const [requestQuantity, setRequestQuantity] = useState('1');
  const [requestNote, setRequestNote] = useState('');
  const tags = event.categories.map((category) => category.name);
  const heroMedia = useMemo(() => buildHeroMedia(event), [event]);
  const activeMedia = heroMedia[activeMediaIndex] ?? heroMedia[0] ?? null;
  const heroLead = useMemo(() => (shouldShowArtist(event) ? event.artist : event.title), [event]);
  const heroSupporting = useMemo(
    () => (event.city ? `${event.venue} - ${event.city}` : event.venue),
    [event.city, event.venue],
  );
  const bookingAction = useMemo(() => getBookingAction(event), [event]);
  const ctaLabel = event.hasTicket ? `View ${bookingAction.noun}` : bookingAction.cta;
  const ratingBarProgress = useRef(new Animated.Value(0)).current;
  const heroPagerRef = useRef<ScrollView>(null);
  const autoplayHoldUntil = useRef(0);

  useEffect(() => {
    setSelectedRating(getInitialUserRating(event));
    setRatingOpen(false);
  }, [event.id, event.rating, event.userRating]);

  useEffect(() => {
    setCommentsOpen(false);
    setActiveMediaIndex(0);
    setFullscreenVideo(null);
    setCheckoutOpen(false);
    setCheckoutPending(false);
    setPaymentPhone('');
    setRequestQuantity('1');
    setRequestNote('');
  }, [event.id]);

  useEffect(() => {
    setCommentCount(event.commentCount ?? 0);
  }, [event.commentCount]);

  useEffect(() => {
    Animated.spring(ratingBarProgress, {
      toValue: ratingOpen ? 1 : 0,
      stiffness: ratingOpen ? 250 : 280,
      damping: 24,
      mass: 0.9,
      useNativeDriver: false,
    }).start();
  }, [ratingBarProgress, ratingOpen]);

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

  const handleOpenDirections = async () => {
    const destination = getDirectionsDestination(event.location);
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

  const handleShareEvent = async () => {
    await Share.share({
      title: event.title,
      message: `${event.title}\n${event.venue} • ${event.dateLabel} • ${event.time}\n${event.location.address}`,
    });
  };

  const handlePrimaryAction = () => {
    setRatingOpen(false);
    if (event.hasTicket) {
      void onBook();
      return;
    }

    setCheckoutOpen(true);
  };

  const handleConfirmCheckout = async () => {
    const needsPayment = eventNeedsPayment(event);
    const quantity = Math.max(1, Math.min(Number.parseInt(requestQuantity, 10) || 1, 20));

    if (!requestNote.trim()) {
      return;
    }

    if (needsPayment && !paymentPhone.trim()) {
      return;
    }

    setCheckoutPending(true);
    const ticket = await onBook({
      paymentMethod: needsPayment ? paymentMethod : undefined,
      phone: needsPayment ? paymentPhone.trim() : undefined,
      quantity,
      requestNote: requestNote.trim(),
    });
    setCheckoutPending(false);
    if (ticket && ['requested', 'confirmed', 'accepted'].includes(ticket.status)) {
      setCheckoutOpen(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 132 }}
        refreshControl={
          <RefreshControl
            colors={[theme.colors.accentStrong]}
            progressBackgroundColor={theme.colors.surfaceStrong}
            refreshing={refreshing}
            tintColor={theme.colors.accentStrong}
            onRefresh={() => void onRefresh()}
          />
        }
        showsVerticalScrollIndicator={false}
      >
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
                width={width}
              />
            ))}
          </ScrollView>
          <LinearGradient
            colors={['rgba(8,10,14,0.10)', 'rgba(8,10,14,0.86)']}
            start={{ x: 0.5, y: 0.1 }}
            end={{ x: 0.5, y: 1 }}
            pointerEvents="none"
            style={StyleSheet.absoluteFillObject}
          />

          {heroMedia.length > 1 ? <HeroPaginationDots activeIndex={activeMediaIndex} count={heroMedia.length} /> : null}
          {activeMedia?.kind === 'video' ? (
            <View pointerEvents="none" style={styles.heroVideoHint}>
              <Feather color={theme.colors.white} name="play-circle" size={14} />
              <Text style={styles.heroVideoHintText}>Tap to play full video</Text>
            </View>
          ) : null}

          <View style={[styles.heroControls, { paddingTop: insets.top + 8 }]}>
            <IconButton icon="chevron-left" onPress={onBack} accessibilityLabel="Go back" />
            <View style={styles.heroActionRow}>
              <SaveHeroButton saved={isSaved} onPress={onToggleSave} />
              <IconButton icon="share-2" onPress={() => void handleShareEvent()} accessibilityLabel="Share event" />
            </View>
          </View>

          <View style={styles.heroFooter}>
            <View style={styles.heroCopy}>
              <Text style={styles.heroLabel}>{event.categories[0]?.name ?? 'Featured'}</Text>
              <Text style={styles.heroTitle}>{heroLead}</Text>
              <Text style={styles.heroSubtitle}>{heroSupporting}</Text>
            </View>

            <View style={styles.heroPriceChip}>
              <Text style={styles.heroPrice}>{event.price}</Text>
            </View>
          </View>
        </View>

        <View style={styles.sheet}>
          <Text style={styles.eventTitle}>{event.title}</Text>
          <Text style={styles.eventBlurb}>{event.blurb}</Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.detailsMetaScroller}
            contentContainerStyle={styles.detailsMetaRow}
          >
            <DetailMetaItem icon="calendar" value={event.dateLabel} />
            <DetailMetaItem icon="clock" value={event.time} />
            <DetailMetaItem icon="map-pin" value={event.venue} wide onPress={() => void handleOpenDirections()} />
            <DetailMetaItem icon="star" value={formatRatingSummary(event)} />
          </ScrollView>

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
              <ContactButton icon="navigation" label="Directions" onPress={() => void handleOpenDirections()} />
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

      {ratingOpen ? <Pressable onPress={() => setRatingOpen(false)} style={styles.ratingDismissLayer} /> : null}

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        <View style={styles.bottomBarInner}>
          <ReserveActionButton label={ctaLabel} motion={ratingBarProgress} onPress={handlePrimaryAction} width={width} />
          <RatingDock
            isOpen={ratingOpen}
            isSubmitting={ratingPending}
            motion={ratingBarProgress}
            onRate={handleRate}
            onToggle={() => setRatingOpen((open) => !open)}
            selectedRating={selectedRating}
            width={width}
          />
          <CommentDock count={commentCount} onPress={() => {
            setRatingOpen(false);
            setCommentsOpen(true);
          }} />
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

      <BookingCheckoutSheet
        actionLabel={bookingAction.noun}
        event={event}
        method={paymentMethod}
        phone={paymentPhone}
        pending={checkoutPending}
        quantity={requestQuantity}
        requestNote={requestNote}
        visible={checkoutOpen}
        onChangeMethod={setPaymentMethod}
        onChangePhone={setPaymentPhone}
        onChangeQuantity={setRequestQuantity}
        onChangeRequestNote={setRequestNote}
        onClose={() => {
          if (!checkoutPending) {
            setCheckoutOpen(false);
          }
        }}
        onConfirm={handleConfirmCheckout}
      />

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
              isLooping={false}
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

function BookingCheckoutSheet({
  actionLabel,
  event,
  method,
  phone,
  pending,
  quantity,
  requestNote,
  visible,
  onChangeMethod,
  onChangePhone,
  onChangeQuantity,
  onChangeRequestNote,
  onClose,
  onConfirm,
}: {
  actionLabel: string;
  event: AppEvent;
  method: BookingPaymentMethod;
  phone: string;
  pending: boolean;
  quantity: string;
  requestNote: string;
  visible: boolean;
  onChangeMethod: (method: BookingPaymentMethod) => void;
  onChangePhone: (phone: string) => void;
  onChangeQuantity: (quantity: string) => void;
  onChangeRequestNote: (note: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const insets = useSafeAreaInsets();
  const needsPayment = eventNeedsPayment(event);
  const canSubmit = requestNote.trim().length > 0 && (!needsPayment || phone.trim().length >= 7) && !pending;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.checkoutBackdrop}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.checkoutSheet, { paddingBottom: insets.bottom + 18 }]}>
            <ScrollView
              bounces={false}
              contentContainerStyle={styles.checkoutScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.checkoutHandle} />
              <View style={styles.checkoutHeader}>
                <View>
                  <Text style={styles.checkoutEyebrow}>In-app payment</Text>
                  <Text style={styles.checkoutTitle}>Complete {actionLabel}</Text>
                </View>
                <IconButton icon="x" onPress={onClose} accessibilityLabel="Close checkout" />
              </View>

              <View style={styles.checkoutSummary}>
                <Text style={styles.checkoutListing} numberOfLines={1}>{event.title}</Text>
                <Text style={styles.checkoutAmount}>{event.price}</Text>
              </View>

              <Text style={styles.checkoutLabel}>Quantity</Text>
              <View style={styles.checkoutInputLine}>
                <Feather color={theme.colors.textMuted} name="hash" size={16} />
                <TextInput
                  keyboardType="number-pad"
                  onChangeText={(value) => onChangeQuantity(value.replace(/[^\d]/g, '').slice(0, 2))}
                  placeholder="1"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.checkoutInput}
                  value={quantity}
                />
              </View>

              <Text style={styles.checkoutLabel}>Message to the host</Text>
              <View style={[styles.checkoutInputLine, styles.checkoutNoteLine]}>
                <Feather color={theme.colors.textMuted} name="message-square" size={16} />
                <TextInput
                  multiline
                  onChangeText={onChangeRequestNote}
                  placeholder="Tell them your preferred time, quantity, table size, or anything they should review."
                  placeholderTextColor={theme.colors.textMuted}
                  scrollEnabled
                  style={[styles.checkoutInput, styles.checkoutNoteInput]}
                  textAlignVertical="top"
                  value={requestNote}
                />
              </View>

              {needsPayment ? (
                <>
                  <Text style={styles.checkoutLabel}>Pay with</Text>
                  <View style={styles.paymentMethodGrid}>
                    {PAYMENT_METHODS.map((item) => (
                      <PaymentMethodChip
                        key={item.id}
                        active={item.id === method}
                        label={item.label}
                        onPress={() => onChangeMethod(item.id)}
                      />
                    ))}
                  </View>

                  <Text style={styles.checkoutLabel}>Wallet phone number</Text>
                  <View style={styles.checkoutInputLine}>
                    <Feather color={theme.colors.textMuted} name="phone" size={16} />
                    <TextInput
                      keyboardType="phone-pad"
                      onChangeText={onChangePhone}
                      placeholder="e.g. 0771234567"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.checkoutInput}
                      value={phone}
                    />
                  </View>

                  <Text style={styles.checkoutHelp}>
                    Wait for the payment merchant prompt to show on your phone, then confirm by entering your PIN.
                  </Text>
                </>
              ) : (
                <Text style={styles.checkoutHelp}>The host will review your request and confirm it in the app.</Text>
              )}

              <Pressable
                accessibilityRole="button"
                disabled={!canSubmit}
                onPress={onConfirm}
                style={[styles.checkoutSubmit, !canSubmit && styles.checkoutSubmitDisabled]}
              >
                <LinearGradient
                  colors={['#E7392F', theme.colors.accentStrong, theme.colors.accent]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.checkoutSubmitGradient}
                >
                  <Text style={styles.checkoutSubmitText}>{pending ? 'Sending...' : needsPayment ? `Pay ${event.price}` : 'Send request'}</Text>
                </LinearGradient>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function PaymentMethodChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.03,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut} style={styles.paymentMethodPressable}>
      <Animated.View style={[styles.paymentMethodChip, active && styles.paymentMethodChipActive, jelly.animatedStyle]}>
        <Text style={[styles.paymentMethodText, active && styles.paymentMethodTextActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
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

function HeroMediaSlide({
  media,
  width,
  height,
  isActive,
  onOpenVideo,
}: {
  media: AppEventMedia;
  width: number;
  height: number;
  isActive: boolean;
  onOpenVideo: () => void;
}) {
  if (media.kind === 'video') {
    return <HeroVideoPreviewSlide height={height} isActive={isActive} media={media} onOpenVideo={onOpenVideo} width={width} />;
  }

  return <Image contentFit="cover" source={media.source} style={{ width, height }} transition={220} />;
}

function HeroVideoPreviewSlide({
  height,
  isActive,
  media,
  onOpenVideo,
  width,
}: {
  height: number;
  isActive: boolean;
  media: AppEventMedia;
  onOpenVideo: () => void;
  width: number;
}) {
  const videoRef = useRef<Video>(null);
  const previewSegmentsRef = useRef<Array<{ start: number; end: number }>>([]);
  const previewSegmentIndexRef = useRef(0);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (!isActive) {
      videoRef.current?.pauseAsync().catch(() => undefined);
      return;
    }

    const firstSegment = previewSegmentsRef.current[0];
    if (videoReady && firstSegment) {
      previewSegmentIndexRef.current = 0;
      videoRef.current?.playFromPositionAsync(firstSegment.start).catch(() => undefined);
    }
  }, [isActive, videoReady]);

  useEffect(() => {
    return () => {
      videoRef.current?.stopAsync().catch(() => undefined);
    };
  }, []);

  const handleVideoLoad = (status: AVPlaybackStatus) => {
    if (!('isLoaded' in status) || !status.isLoaded) {
      return;
    }

    previewSegmentsRef.current = buildHeroPreviewSegments(status.durationMillis ?? 0);
    previewSegmentIndexRef.current = 0;
    setVideoReady(true);

    if (isActive) {
      const firstSegment = previewSegmentsRef.current[0];
      videoRef.current?.playFromPositionAsync(firstSegment?.start ?? 0).catch(() => undefined);
    }
  };

  const handleVideoStatusUpdate = (status: AVPlaybackStatus) => {
    if (!isActive || !('isLoaded' in status) || !status.isLoaded) {
      return;
    }

    if (previewSegmentsRef.current.length === 0) {
      previewSegmentsRef.current = buildHeroPreviewSegments(status.durationMillis ?? 0);
    }

    const activeSegment = previewSegmentsRef.current[previewSegmentIndexRef.current];
    if (!activeSegment || status.positionMillis + 140 < activeSegment.end) {
      return;
    }

    const nextSegment = previewSegmentsRef.current[previewSegmentIndexRef.current + 1];
    if (!nextSegment) {
      videoRef.current?.pauseAsync().catch(() => undefined);
      return;
    }

    previewSegmentIndexRef.current += 1;
    videoRef.current?.playFromPositionAsync(nextSegment.start).catch(() => undefined);
  };

  return (
    <Pressable onPress={onOpenVideo} style={{ width, height }}>
      {media.preview ? (
        <Image contentFit="cover" source={media.preview} style={{ width, height }} transition={180} />
      ) : (
        <View style={[styles.heroVideoPlaceholder, { width, height }]} />
      )}
      <Video
        isMuted
        onLoad={handleVideoLoad}
        onPlaybackStatusUpdate={handleVideoStatusUpdate}
        pointerEvents="none"
        ref={videoRef}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        source={{ uri: media.source }}
        style={[styles.heroMedia, styles.heroPreviewVideo, !videoReady && styles.heroPreviewVideoHidden]}
      />
      <View pointerEvents="none" style={styles.heroVideoPlayOverlay}>
        <Feather color={theme.colors.white} name="play" size={22} />
      </View>
    </Pressable>
  );
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

function DetailMetaItem({
  icon,
  value,
  wide = false,
  onPress,
}: {
  icon: FeatherName;
  value: string;
  wide?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <View style={[styles.detailsMetaItem, wide && styles.detailsMetaItemWide, onPress && styles.detailsMetaItemPressable]}>
      <Feather color={theme.colors.accentStrong} name={icon} size={14} />
      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.detailsMetaValue}>
        {value}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={`Open directions to ${value}`} onPress={onPress}>
        {content}
      </Pressable>
    );
  }

  return (
    content
  );
}

function ContactButton({
  icon,
  label,
  onPress,
}: {
  icon: ContactIconName | FeatherName;
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

function ReserveActionButton({
  label,
  motion,
  onPress,
  width,
}: {
  label: string;
  motion: Animated.Value;
  onPress: () => void;
  width: number;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.07,
    pressedScaleY: 0.92,
  });
  const motionProgress = useAnimatedProgressSnapshot(motion);
  const expandedWidth = Math.max(width - 150, 174);
  const actionWidth = interpolateNumber(motionProgress, [0, 1], [expandedWidth, 52]);
  const labelOpacity = interpolateNumber(motionProgress, [0, 0.58, 1], [1, 0.2, 0]);
  const labelTranslateX = interpolateNumber(motionProgress, [0, 1], [0, -8]);
  const labelMaxWidth = interpolateNumber(motionProgress, [0, 1], [expandedWidth - 72, 0]);
  const labelMarginLeft = interpolateNumber(motionProgress, [0, 1], [8, 0]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.reserveActionPressable}
    >
      <View style={[styles.reserveActionSizer, { width: actionWidth }]}>
        <Animated.View style={[styles.reserveActionButton, jelly.animatedStyle]}>
          <LinearGradient
            colors={['#E7392F', theme.colors.accentStrong, theme.colors.accent]}
            locations={[0, 0.48, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
          <Feather color={theme.colors.white} name="calendar" size={19} />
          <Text
            numberOfLines={1}
            style={[
              styles.reserveActionText,
              {
                marginLeft: labelMarginLeft,
                maxWidth: labelMaxWidth,
                opacity: labelOpacity,
                transform: [{ translateX: labelTranslateX }],
              },
            ]}
          >
            {label}
          </Text>
        </Animated.View>
      </View>
    </Pressable>
  );
}

function RatingDock({
  selectedRating,
  isOpen,
  isSubmitting,
  motion,
  onToggle,
  onRate,
  width,
}: {
  selectedRating: number;
  isOpen: boolean;
  isSubmitting: boolean;
  motion: Animated.Value;
  onToggle: () => void;
  onRate: (value: number) => Promise<void>;
  width: number;
}) {
  const triggerJelly = useJellyPressAnimation({
    pressedScaleX: 1.07,
    pressedScaleY: 0.92,
  });
  const motionProgress = useAnimatedProgressSnapshot(motion);
  const availableWidth = Math.max(width - 32, 280);
  const openRailWidth = Math.max(222, availableWidth - 52 - 52 - 52 - 24);
  const railWidth = interpolateNumber(motionProgress, [0, 1], [0, openRailWidth]);
  const railTranslateX = interpolateNumber(motionProgress, [0, 1], [18, 0]);
  const railScaleX = interpolateNumber(motionProgress, [0, 0.65, 1], [0.72, 1.04, 1]);
  const railScaleY = interpolateNumber(motionProgress, [0, 0.65, 1], [0.8, 1.08, 1]);

  return (
    <View style={styles.ratingDockRow}>
      <View
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={[
          styles.ratingRail,
          {
            opacity: motionProgress,
            width: railWidth,
            transform: [{ translateX: railTranslateX }, { scaleX: railScaleX }, { scaleY: railScaleY }],
          },
        ]}
      >
        {[1, 2, 3, 4, 5].map((value, index) => (
          <RatingStarButton
            key={value}
            active={value <= selectedRating}
            index={index}
            motion={motion}
            onPress={() => onRate(value)}
            value={value}
          />
        ))}
      </View>

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
  const displayCount = formatCompactCount(count);

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
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72} style={styles.commentBadgeText}>
              {displayCount}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}

function formatCompactCount(count: number) {
  const safeCount = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  if (safeCount < 1000) {
    return String(safeCount);
  }

  const units = [
    { value: 1_000_000_000, suffix: 'B' },
    { value: 1_000_000, suffix: 'M' },
    { value: 1_000, suffix: 'k' },
  ];
  const unit = units.find((item) => safeCount >= item.value) ?? units[2];
  const value = safeCount / unit.value;
  const formatted = value >= 10 ? Math.floor(value).toString() : value.toFixed(1).replace(/\.0$/, '');
  return `${formatted}${unit.suffix}`;
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
                translateX: motion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18 + index * 5, 0],
                }),
              },
            ],
          },
        ]}
      >
        <Animated.View style={[styles.ratingStar, active && styles.ratingStarActive, jelly.animatedStyle]}>
          <MaterialCommunityIcons
            color={active ? '#FBBF24' : theme.colors.textMuted}
            name={active ? 'star' : 'star-outline'}
            size={22}
          />
          <Text style={[styles.ratingStarNumber, active && styles.ratingStarNumberActive]}>{value}</Text>
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

function buildHeroPreviewSegments(durationMillis: number) {
  const clipLength = 5000;
  const clipCount = 4;
  const totalPreviewLength = clipLength * clipCount;

  if (!Number.isFinite(durationMillis) || durationMillis <= totalPreviewLength + 120) {
    return [{ start: 0, end: Math.max(1200, durationMillis - 120) }];
  }

  const maxStart = Math.max(durationMillis - clipLength - 120, 0);
  const step = maxStart / Math.max(clipCount - 1, 1);
  const segments: Array<{ start: number; end: number }> = [];

  for (let index = 0; index < clipCount; index += 1) {
    const start = Math.min(Math.round(step * index), maxStart);
    segments.push({
      start,
      end: Math.min(start + clipLength, durationMillis - 120),
    });
  }

  return segments.length > 0 ? segments : [{ start: 0, end: Math.max(1200, durationMillis - 120) }];
}

function shouldShowArtist(event: AppEvent) {
  const primaryCategory = event.categories[0]?.id ?? '';
  if (!event.artist || event.artist.trim().length === 0) {
    return false;
  }

  return ['bars-lounges', 'chill-spots'].includes(primaryCategory);
}

function getBookingAction(event: AppEvent) {
  const categoryIds = event.categories.map((category) => category.id);
  if (categoryIds.includes('restaurants')) {
    return { cta: 'Reserve table', noun: 'reservation' };
  }
  if (categoryIds.includes('fast-food')) {
    return { cta: 'Order now', noun: 'order' };
  }
  if (categoryIds.includes('resorts') || categoryIds.includes('bnbs') || categoryIds.includes('resorts-bnbs')) {
    return { cta: 'Book stay', noun: 'booking' };
  }
  if (categoryIds.includes('bars-lounges') || categoryIds.includes('chill-spots')) {
    return { cta: 'Reserve spot', noun: 'reservation' };
  }
  return { cta: 'Get ticket', noun: 'ticket' };
}

function eventNeedsPayment(event: AppEvent) {
  return event.acceptsInternalPayments && /\d/.test(event.price) && !/free|tba|soon/i.test(event.price);
}

function getInitialUserRating(event: AppEvent) {
  return event.userRating ?? Math.round(event.rating);
}

function formatRatingSummary(event: AppEvent) {
  return `${event.rating.toFixed(1)}(${event.ratingCount ?? 0})`;
}

function hasMappableCoordinates(location: EventLocation) {
  const { latitude, longitude, latitudeDelta, longitudeDelta } = location;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Number.isFinite(latitudeDelta) &&
    Number.isFinite(longitudeDelta) &&
    !(latitude === 0 && longitude === 0)
  );
}

function getDirectionsDestination(location: EventLocation) {
  if (hasMappableCoordinates(location)) {
    return `${location.latitude},${location.longitude}`;
  }

  return location.address || location.label;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#05070C',
  },
  hero: {
    overflow: 'hidden',
  },
  heroMedia: {
    width: '100%',
    height: '100%',
  },
  heroVideoPlaceholder: {
    backgroundColor: '#05070C',
  },
  heroPreviewVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  heroPreviewVideoHidden: {
    opacity: 0,
  },
  heroVideoPlayOverlay: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 58,
    height: 58,
    marginLeft: -29,
    marginTop: -29,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,10,14,0.58)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
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
    backgroundColor: 'rgba(242,34,28,0.24)',
    borderColor: 'rgba(242,34,28,0.28)',
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
    marginHorizontal: 4,
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
  detailsMetaScroller: {
    marginTop: -4,
  },
  detailsMetaRow: {
    alignItems: 'center',
    gap: 14,
    paddingRight: 6,
  },
  detailsMetaItem: {
    maxWidth: 142,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailsMetaItemWide: {
    maxWidth: 190,
  },
  detailsMetaItemPressable: {
    paddingVertical: 3,
  },
  detailsMetaValue: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
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
  checkoutBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,7,13,0.66)',
    justifyContent: 'flex-end',
  },
  checkoutSheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: 'rgba(12,15,23,0.98)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 14,
    ...shadow,
  },
  checkoutScrollContent: {
    gap: 14,
  },
  checkoutHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    marginBottom: 4,
  },
  checkoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  checkoutEyebrow: {
    color: theme.colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  checkoutTitle: {
    color: theme.colors.text,
    fontSize: 21,
    fontWeight: '800',
  },
  checkoutSummary: {
    minHeight: 48,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  checkoutListing: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  checkoutAmount: {
    color: theme.colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  checkoutLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  paymentMethodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paymentMethodPressable: {
    alignSelf: 'flex-start',
  },
  paymentMethodChip: {
    minHeight: 38,
    paddingHorizontal: 13,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentMethodChipActive: {
    backgroundColor: 'rgba(242,34,28,0.16)',
    borderColor: 'rgba(231,57,47,0.54)',
  },
  paymentMethodText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  paymentMethodTextActive: {
    color: theme.colors.white,
  },
  checkoutInputLine: {
    minHeight: 46,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkoutNoteLine: {
    minHeight: 106,
    alignItems: 'flex-start',
    paddingTop: 12,
  },
  checkoutInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
    paddingVertical: 0,
  },
  checkoutNoteInput: {
    minHeight: 88,
    maxHeight: 148,
    lineHeight: 19,
  },
  checkoutHelp: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  checkoutSubmit: {
    alignSelf: 'stretch',
  },
  checkoutSubmitDisabled: {
    opacity: 0.48,
  },
  checkoutSubmitGradient: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutSubmitText: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '900',
  },
  ratingDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 3,
    paddingTop: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(10,13,19,0.74)',
  },
  bottomBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  reserveActionPressable: {
    alignSelf: 'flex-end',
  },
  reserveActionSizer: {
    minHeight: 44,
  },
  reserveActionButton: {
    width: '100%',
    minHeight: 44,
    borderRadius: 22,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadow,
  },
  reserveActionText: {
    flexShrink: 1,
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '900',
  },
  ratingDockRow: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingRail: {
    height: 44,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    gap: 3,
  },
  ratingStarPressable: {
    alignSelf: 'center',
  },
  ratingStarMotion: {
    alignItems: 'center',
  },
  ratingStar: {
    width: 38,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    gap: 1,
  },
  ratingStarActive: {
    backgroundColor: 'transparent',
  },
  ratingStarNumber: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '900',
    includeFontPadding: false,
  },
  ratingStarNumberActive: {
    color: theme.colors.white,
  },
  ratingTriggerPressable: {
    alignSelf: 'flex-end',
  },
  ratingTrigger: {
    width: 48,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(242,34,28,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentTriggerPressable: {
    alignSelf: 'flex-end',
  },
  commentTrigger: {
    width: 48,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(242,34,28,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  commentBadge: {
    position: 'absolute',
    top: -4,
    right: -3,
    minWidth: 18,
    maxWidth: 42,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
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
    letterSpacing: 0,
    includeFontPadding: false,
    textAlign: 'center',
  },
});
