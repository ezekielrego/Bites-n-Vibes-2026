import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type ImageSourcePropType,
  useWindowDimensions,
  type ViewToken,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_VERSION } from '../constants';
import { setListingInternalPayments, verifyTicketQr, verifyTicketReference } from '../api';
import { BACKEND_ORIGIN } from '../config';
import { shadow, theme } from '../theme';
import {
  AppCategory,
  AppEvent,
  AppNotification,
  AppTicket,
  AppUser,
  ChangePasswordInput,
  CreateAppEventInput,
  LocalUploadImage,
  UpdateProfileInput,
} from '../types';
import { Tag, useJellyPressAnimation } from './Primitives';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
type CreateStep = 0 | 1 | 2;
type PriceRange = CreateAppEventInput['priceRange'];
type SelectOption = {
  value: string;
  label: string;
  icon?: FeatherName;
};

const APP_LOGO = require('../../logo.png');
const PRICE_RANGE_OPTIONS: PriceRange[] = ['$', '$$', '$$$', '$$$$'];
const PRICE_RANGE_SELECT_OPTIONS: SelectOption[] = PRICE_RANGE_OPTIONS.map((value) => ({
  value,
  label: value,
  icon: 'dollar-sign',
}));
const MAX_VIDEO_SOFT_LIMIT_BYTES = 20 * 1024 * 1024;
const MAX_CREATE_GALLERY_MEDIA = 8;
const CREATE_TAG_OPTIONS: SelectOption[] = [
  { value: 'Rooftop', label: 'Rooftop', icon: 'map-pin' },
  { value: 'Live Music', label: 'Live Music', icon: 'music' },
  { value: 'Late Night', label: 'Late Night', icon: 'moon' },
  { value: 'Cocktails', label: 'Cocktails', icon: 'coffee' },
  { value: 'Quick Bites', label: 'Quick Bites', icon: 'zap' },
  { value: 'Chill', label: 'Chill', icon: 'smile' },
  { value: 'Brunch', label: 'Brunch', icon: 'sun' },
  { value: 'Family Friendly', label: 'Family Friendly', icon: 'users' },
  { value: 'Romantic', label: 'Romantic', icon: 'heart' },
  { value: 'Outdoor', label: 'Outdoor', icon: 'wind' },
  { value: 'Poolside', label: 'Poolside', icon: 'droplet' },
  { value: 'Fine Dining', label: 'Fine Dining', icon: 'star' },
];

type CreateDraft = {
  artist: string;
  title: string;
  venue: string;
  city: string;
  categoryId: string;
  tagsText: string;
  heroImage: LocalUploadImage | null;
  ticketImage: LocalUploadImage | null;
  galleryMedia: LocalUploadImage[];
  scheduledAt: string;
  dateLabel: string;
  day: string;
  month: string;
  weekday: string;
  time: string;
  price: string;
  priceRange: PriceRange;
  blurb: string;
  about: string;
  highlightsText: string;
  address: string;
  locationLabel: string;
  locationNote: string;
  latitude: string;
  longitude: string;
  phone: string;
  email: string;
  website: string;
  tiktok: string;
  youtube: string;
  facebook: string;
  instagram: string;
  x: string;
  acceptsInternalPayments: boolean;
};

export function SavedTabView({
  events,
  onSelectEvent,
}: {
  events: AppEvent[];
  onSelectEvent: (event: AppEvent) => void;
}) {
  return (
    <View style={styles.sectionStack}>
      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>Saved</Text>
        <Text style={styles.sectionCount}>{events.length} kept close</Text>
      </View>

      {events.length === 0 ? (
        <EmptyState
          icon="heart"
          title="No saved spots yet"
          copy="Save restaurants, lounges, and events you want to revisit later."
        />
      ) : (
        <View style={styles.savedList}>
          {events.map((event) => (
            <SavedEventCard key={event.id} event={event} onPress={() => onSelectEvent(event)} />
          ))}
        </View>
      )}
    </View>
  );
}

type StreamVideoItem = {
  id: string;
  event: AppEvent;
  source: string;
  poster: string | ImageSourcePropType | null;
};

export function StreamTabView({
  events,
  onSelectEvent,
  onToggleSave,
}: {
  events: AppEvent[];
  onSelectEvent: (event: AppEvent) => void;
  onToggleSave: (event: AppEvent) => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [viewerItem, setViewerItem] = useState<StreamVideoItem | null>(null);
  const streamItems = useMemo(
    () =>
      events.flatMap((event) =>
        event.media
          .filter((item) => item.kind === 'video')
          .map((item) => ({
            id: `${event.id}:${item.id}`,
            event,
            source: item.source,
            poster: item.preview ?? event.image ?? null,
          })),
      ),
    [events],
  );
  const itemHeight = Math.max(height - insets.bottom, 560);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 48,
    minimumViewTime: 60,
  }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<ViewToken<StreamVideoItem>> }) => {
    setActiveVideoId(viewableItems[0]?.item.id ?? null);
  }).current;

  useEffect(() => {
    if (!activeVideoId && streamItems.length > 0) {
      setActiveVideoId(streamItems[0].id);
    }
  }, [activeVideoId, streamItems]);

  if (streamItems.length === 0) {
    return (
      <View style={[styles.streamEmpty, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 110 }]}>
        <Feather color={theme.colors.accentStrong} name={'play-circle' as FeatherName} size={26} />
        <Text style={styles.streamEmptyTitle}>No stream videos yet</Text>
        <Text style={styles.streamEmptyCopy}>Videos attached to listings will play here once creators add them.</Text>
      </View>
    );
  }

  return (
    <View style={styles.streamRoot}>
      <FlatList
        data={streamItems}
        keyExtractor={(item) => item.id}
        getItemLayout={(_, index) => ({
          length: itemHeight,
          offset: itemHeight * index,
          index,
        })}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        snapToAlignment="start"
        snapToInterval={itemHeight}
        decelerationRate="fast"
        windowSize={3}
        removeClippedSubviews
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <StreamVideoCard
            active={item.id === activeVideoId}
            height={itemHeight}
            item={item}
            safeTop={insets.top}
            onOpen={() => onSelectEvent(item.event)}
            onOpenViewer={() => setViewerItem(item)}
            onToggleSave={() => onToggleSave(item.event)}
          />
        )}
      />

      <Modal
        animationType="fade"
        onRequestClose={() => setViewerItem(null)}
        statusBarTranslucent
        visible={Boolean(viewerItem)}
      >
        <View style={styles.streamViewerRoot}>
          <View style={[styles.streamViewerHeader, { paddingTop: insets.top + 8 }]}>
            <View style={styles.streamViewerCopy}>
              <Text numberOfLines={1} style={styles.streamViewerTitle}>{viewerItem?.event.title ?? 'Stream video'}</Text>
              <Text numberOfLines={1} style={styles.streamViewerSubtitle}>{viewerItem?.event.venue ?? ''}</Text>
            </View>
            <Pressable onPress={() => setViewerItem(null)} style={styles.streamViewerClose}>
              <Feather color={theme.colors.white} name="x" size={20} />
            </Pressable>
          </View>

          {viewerItem ? (
            <Video
              isLooping={false}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay
              source={{ uri: viewerItem.source }}
              style={styles.streamViewerVideo}
              useNativeControls
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

export function InboxTabView({
  notifications,
  receivedTickets,
  tickets,
  unreadCount,
  onMarkAllRead,
  onOpenNotification,
  onOpenTicket,
}: {
  notifications: AppNotification[];
  receivedTickets: AppTicket[];
  tickets: AppTicket[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onOpenNotification: (notification: AppNotification) => void;
  onOpenTicket: (ticket: AppTicket) => void;
}) {
  const ticketActivity = useMemo(
    () =>
      [
        ...tickets.map((ticket) => ({ ticket, title: ticket.event.title, subtitle: ticket.event.venue, kind: 'Booked' })),
        ...receivedTickets.map((ticket) => ({
          ticket,
          title: ticket.buyerName || 'Guest',
          subtitle: ticket.event.title,
          kind: 'Received',
        })),
      ]
        .sort((left, right) => Date.parse(right.ticket.updatedAt || right.ticket.bookedAt) - Date.parse(left.ticket.updatedAt || left.ticket.bookedAt))
        .slice(0, 8),
    [receivedTickets, tickets],
  );

  return (
    <View style={styles.sectionStack}>
      <View style={[styles.sectionHeading, styles.sectionHeadingTight]}>
        <View style={styles.inboxHeadingCopy}>
          <Text style={styles.sectionTitle}>Inbox</Text>
          <Text style={styles.sectionCopy}>Tickets, booking moves, and event nudges land here.</Text>
        </View>

        <InboxReadAllButton
          disabled={unreadCount === 0}
          label={unreadCount > 0 ? `Read all ${unreadCount}` : 'Caught up'}
          onPress={onMarkAllRead}
        />
      </View>

      {ticketActivity.length > 0 ? (
        <View style={styles.profileSection}>
          <View style={styles.compactSectionHeader}>
            <View style={styles.compactSectionCopy}>
              <Text style={styles.compactSectionTitle}>Ticket activity</Text>
              <Text style={styles.compactSectionHint}>Bookings and received tickets</Text>
            </View>
          </View>

          <View style={styles.ticketManagementList}>
            {ticketActivity.map(({ ticket, title, subtitle, kind }) => (
              <TicketManagementRow
                key={`inbox-ticket-${kind}-${ticket.id}`}
                title={title}
                subtitle={subtitle}
                meta={`${kind} ticket | Ref ${ticket.referenceCode} | ${formatTicketDate(ticket.bookedAt)}`}
                status={ticket.status}
                primaryActionLabel="Open"
                onPrimaryAction={() => onOpenTicket(ticket)}
              />
            ))}
          </View>
        </View>
      ) : null}

      {notifications.length === 0 ? (
        <EmptyState
          icon="message-circle"
          title="Your inbox is quiet"
          copy="Once tickets or listing updates arrive, they will show up here."
        />
      ) : (
        <View style={styles.notificationList}>
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              onPress={() => onOpenNotification(notification)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function InboxReadAllButton({
  disabled,
  label,
  onPress,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.018,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.inboxReadAllPressable}
    >
      <Animated.View style={[styles.inboxReadAllButton, disabled && styles.inboxReadAllButtonDisabled, jelly.animatedStyle]}>
        <Feather color={disabled ? theme.colors.textSoft : theme.colors.accentStrong} name="check" size={13} />
        <Text style={[styles.inboxReadAllText, disabled && styles.inboxReadAllTextDisabled]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

export function CreateTabView({
  categories,
  editingEvent,
  isSubmitting,
  onCancelEdit,
  profile,
  submitProgress,
  submitStage,
  submitError,
  onSubmit,
}: {
  categories: AppCategory[];
  editingEvent: AppEvent | null;
  isSubmitting: boolean;
  onCancelEdit: () => void;
  profile: AppUser | null;
  submitProgress: number;
  submitStage: string | null;
  submitError: string | null;
  onSubmit: (input: CreateAppEventInput) => Promise<void>;
}) {
  const selectableCategories = useMemo(
    () => categories.filter((category) => category.id !== 'all'),
    [categories],
  );
  const [step, setStep] = useState<CreateStep>(0);
  const [draft, setDraft] = useState<CreateDraft>(() => buildInitialDraft(selectableCategories));
  const [localError, setLocalError] = useState<string | null>(null);
  const [pickerMode, setPickerMode] = useState<'date' | 'time' | null>(null);
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [activeQuickSheet, setActiveQuickSheet] = useState<'details' | 'schedule' | 'location' | 'tags' | null>(null);
  const insets = useSafeAreaInsets();
  const selectedTags = useMemo(() => splitCommaList(draft.tagsText), [draft.tagsText]);
  const selectedSchedule = useMemo(() => readScheduledDate(draft.scheduledAt), [draft.scheduledAt]);
  const scheduleSummary = useMemo(
    () => (selectedSchedule ? formatCreateSchedule(selectedSchedule) : 'Pick date and time'),
    [selectedSchedule],
  );
  const locationSummary = useMemo(() => {
    if (draft.address.trim()) {
      return draft.address.trim();
    }

    if (draft.latitude.trim() && draft.longitude.trim()) {
      return `${draft.latitude.trim()}, ${draft.longitude.trim()}`;
    }

    return 'Use your current location to fill the place faster.';
  }, [draft.address, draft.latitude, draft.longitude]);
  const categoryOptions = useMemo<SelectOption[]>(
    () =>
      selectableCategories.map((category) => ({
        value: category.id,
        label: category.name,
        icon: category.icon as FeatherName,
      })),
    [selectableCategories],
  );
  const selectedCategoryOption = useMemo(
    () => categoryOptions.find((option) => option.value === draft.categoryId) ?? null,
    [categoryOptions, draft.categoryId],
  );
  const selectedPriceRangeOption = useMemo(
    () => PRICE_RANGE_SELECT_OPTIONS.find((option) => option.value === draft.priceRange) ?? null,
    [draft.priceRange],
  );
  const showArtistField = useMemo(() => categorySupportsArtist(draft.categoryId), [draft.categoryId]);
  const creatorAvatarSource = profile?.avatar ? profile.avatar : APP_LOGO;
  const creatorName = profile?.name ?? 'Your profile';
  const locationChipLabel = draft.locationLabel.trim() || draft.city.trim() || 'Location';
  const scheduleChipLabel = selectedSchedule
    ? selectedSchedule.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : 'When';
  const tagChipLabel = selectedTags.length > 0 ? `${selectedTags.length} tags` : 'Tags';
  const categoryChipLabel = selectedCategoryOption?.label ?? 'Category';
  const hostChipLabel = draft.artist.trim() || 'Host';
  const mediaCount =
    draft.galleryMedia.length +
    (draft.heroImage || editingEvent?.image ? 1 : 0) +
    (draft.ticketImage || editingEvent?.ticketImage ? 1 : 0);
  useEffect(() => {
    if (selectableCategories.length === 0) {
      return;
    }

    setDraft((current) =>
      editingEvent
        ? buildDraftFromEvent(editingEvent, selectableCategories)
        : current.categoryId && current.categoryId !== 'all'
          ? current
          : {
              ...current,
              categoryId: selectableCategories[0]?.id ?? '',
            },
    );
  }, [editingEvent, selectableCategories]);

  useEffect(() => {
    if (editingEvent) {
      setDraft(buildDraftFromEvent(editingEvent, selectableCategories));
      setStep(0);
      setLocalError(null);
      return;
    }

    setDraft(buildInitialDraft(selectableCategories));
    setStep(0);
    setLocalError(null);
  }, [editingEvent, selectableCategories]);

  const setField = <K extends keyof CreateDraft>(field: K, value: CreateDraft[K]) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const applyScheduledAt = (nextDate: Date) => {
    const nextParts = formatScheduleParts(nextDate);
    setDraft((current) => ({
      ...current,
      scheduledAt: nextDate.toISOString(),
      ...nextParts,
    }));
  };

  const handlePrimaryCategorySelect = (categoryId: string) => {
    setDraft((current) => ({
      ...current,
      categoryId,
      artist: categorySupportsArtist(categoryId) ? current.artist : '',
    }));
  };

  const toggleTagSelection = (tagLabel: string) => {
    const nextTags = selectedTags.includes(tagLabel)
      ? selectedTags.filter((tag) => tag !== tagLabel)
      : [...selectedTags, tagLabel];

    setField('tagsText', nextTags.join(', '));
  };

  const handlePickImage = async (field: 'heroImage' | 'ticketImage') => {
    const allowVideo = field === 'heroImage';
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos needed', 'Allow photo access so you can upload listing media.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: !allowVideo,
      mediaTypes: allowVideo ? ['images', 'videos'] : ['images'],
      quality: 0.92,
      videoExportPreset: allowVideo && Platform.OS === 'ios' ? ImagePicker.VideoExportPreset.MediumQuality : undefined,
      videoQuality:
        allowVideo && Platform.OS === 'ios' ? ImagePicker.UIImagePickerControllerQualityType.Medium : undefined,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const nextMedia = await toLocalUploadImage(result.assets[0], field === 'heroImage' ? 'hero' : 'ticket');
    setField(field, nextMedia);
    warnIfVideoNeedsCompression(nextMedia);
  };

  const handlePickGalleryMedia = async () => {
    const remaining = MAX_CREATE_GALLERY_MEDIA - draft.galleryMedia.length;
    if (remaining <= 0) {
      setLocalError(`You can add up to ${MAX_CREATE_GALLERY_MEDIA} gallery files.`);
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Media needed', 'Allow photo access so you can add gallery images and video.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      allowsMultipleSelection: true,
      mediaTypes: ['images', 'videos'],
      quality: 0.92,
      selectionLimit: remaining,
      videoExportPreset: Platform.OS === 'ios' ? ImagePicker.VideoExportPreset.MediumQuality : undefined,
      videoQuality: Platform.OS === 'ios' ? ImagePicker.UIImagePickerControllerQualityType.Medium : undefined,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const nextItems = await Promise.all(
      result.assets
        .slice(0, remaining)
        .map((asset, index) => toLocalUploadImage(asset, `gallery-${Date.now()}-${index}`)),
    );

    setField('galleryMedia', [...draft.galleryMedia, ...nextItems].slice(0, MAX_CREATE_GALLERY_MEDIA));
    warnIfVideoNeedsCompression(...nextItems);
    setLocalError(null);
  };

  const handleRemoveGalleryMedia = (index: number) => {
    setField(
      'galleryMedia',
      draft.galleryMedia.filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const handleOpenPicker = (mode: 'date' | 'time') => {
    if (!draft.scheduledAt) {
      applyScheduledAt(new Date());
    }
    setPickerMode(mode);
  };

  const handlePickerChange = (event: DateTimePickerEvent, pickedDate?: Date) => {
    const activeMode = pickerMode;

    if (Platform.OS === 'android') {
      setPickerMode(null);
    }

    if (event.type === 'dismissed' || !pickedDate || !activeMode) {
      return;
    }

    const baseDate = selectedSchedule ? new Date(selectedSchedule) : new Date();
    const nextDate = new Date(baseDate);

    if (activeMode === 'date') {
      nextDate.setFullYear(pickedDate.getFullYear(), pickedDate.getMonth(), pickedDate.getDate());
    } else {
      nextDate.setHours(pickedDate.getHours(), pickedDate.getMinutes(), 0, 0);
    }

    applyScheduledAt(nextDate);
  };

  const handleDetectLocation = async () => {
    setLocalError(null);
    setDetectingLocation(true);

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocalError('Allow location access so we can detect the listing position.');
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const latitude = formatCoordinate(position.coords.latitude);
      const longitude = formatCoordinate(position.coords.longitude);
      let address = '';
      let city = '';
      let region = '';

      try {
        const [place] = await Location.reverseGeocodeAsync({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        if (place) {
          address = formatDetectedAddress(place);
          city = place.city ?? place.subregion ?? '';
          region = place.region ?? '';
        }
      } catch {}

      setDraft((current) => ({
        ...current,
        latitude,
        longitude,
        address: address || current.address,
        city: city || current.city,
        locationLabel: current.locationLabel || region || city || 'Detected location',
      }));
    } catch {
      setLocalError('Current location could not be detected right now. Try again in a moment.');
    } finally {
      setDetectingLocation(false);
    }
  };

  const warnIfVideoNeedsCompression = (...items: LocalUploadImage[]) => {
    const hasLargeVideo = items.some(
      (item) => item.mimeType.startsWith('video/') && (item.fileSize ?? 0) > MAX_VIDEO_SOFT_LIMIT_BYTES,
    );

    if (!hasLargeVideo || Platform.OS === 'ios') {
      return;
    }

    Alert.alert(
      'Large video selected',
      'Videos over 20MB will upload as-is on this device. Shorter clips keep uploads lighter and home previews smoother.',
    );
  };

  const handleStoryChange = (value: string) => {
    setDraft((current) => ({
      ...current,
      about: value,
      blurb: current.blurb.trim() ? current.blurb : value.split('\n').map((item) => item.trim()).find(Boolean) ?? '',
    }));
  };

  const handleNext = () => {
    const validation = validateRequiredStep(draft, Boolean(editingEvent));
    if (validation) {
      setLocalError(validation);
      return;
    }

    setLocalError(null);
    setStep((current) => Math.min(2, current + 1) as CreateStep);
  };

  const handleBack = () => {
    setLocalError(null);
    setStep((current) => Math.max(0, current - 1) as CreateStep);
  };

  const handleSkip = async () => {
    if (step === 2) {
      await handlePublish();
      return;
    }

    setLocalError(null);
    setStep((current) => Math.min(2, current + 1) as CreateStep);
  };

  const handlePublish = async () => {
    const validation = validateRequiredStep(draft, Boolean(editingEvent));
    if (validation) {
      setLocalError(validation);
      setStep(0);
      return;
    }

    setLocalError(null);

    try {
      await onSubmit(buildCreateInput(draft, editingEvent?.media ?? []));
      setDraft(buildInitialDraft(selectableCategories));
      setStep(0);
    } catch (error) {
      return;
    }
  };

  return (
    <View style={styles.sectionStack}>
      <View style={styles.createComposerTopBar}>
        <Pressable
          disabled={!editingEvent}
          onPress={onCancelEdit}
          style={styles.createComposerTopIcon}
        >
          <Feather color={editingEvent ? theme.colors.text : theme.colors.textSoft} name={'x' as FeatherName} size={24} />
        </Pressable>
        <Text style={styles.createComposerTopTitle}>{editingEvent ? 'Edit post' : 'New post'}</Text>
        <View style={styles.createComposerTopIcon}>
          <Feather color={theme.colors.textSoft} name={'more-horizontal' as FeatherName} size={22} />
        </View>
      </View>

      <View style={styles.formCard}>
        {step === 0 ? (
          <View style={styles.createComposerStep}>
            <View style={styles.createComposerProfileRow}>
              <View style={styles.createComposerAvatar}>
                <Image source={creatorAvatarSource} contentFit="cover" style={styles.createComposerAvatarImage} transition={120} />
              </View>
              <View style={styles.createComposerProfileText}>
                <Text style={styles.createComposerProfileName}>{creatorName}</Text>
                <Text style={styles.createComposerProfileMeta}>
                  {editingEvent ? 'Updating your listing' : 'Creating a new listing'}
                </Text>
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.createComposerChipRow}>
              <CreateComposerChip
                active={Boolean(selectedCategoryOption)}
                icon="grid"
                label={categoryChipLabel}
                onPress={() => setActiveQuickSheet('details')}
              />
              {showArtistField ? (
                <CreateComposerChip
                  active={Boolean(draft.artist.trim())}
                  icon="users"
                  label={hostChipLabel}
                  onPress={() => setActiveQuickSheet('details')}
                />
              ) : null}
              <CreateComposerChip
                active={Boolean(draft.locationLabel.trim() || draft.address.trim() || draft.latitude.trim())}
                icon="map-pin"
                label={locationChipLabel}
                onPress={() => setActiveQuickSheet('location')}
              />
              <CreateComposerChip
                active={Boolean(selectedSchedule)}
                icon="calendar"
                label={scheduleChipLabel}
                onPress={() => setActiveQuickSheet('schedule')}
              />
              <CreateComposerChip
                active={selectedTags.length > 0}
                icon="tag"
                label={tagChipLabel}
                onPress={() => setActiveQuickSheet('tags')}
              />
            </ScrollView>

            <View style={styles.createComposerTextArea}>
              <TextInput
                placeholder="Name this listing"
                placeholderTextColor={theme.colors.textSoft}
                style={styles.createComposerTitleInput}
                value={draft.title}
                onChangeText={(value) => setField('title', value)}
              />
              {draft.venue.trim() || draft.city.trim() ? (
                <Text style={styles.createComposerVenueText}>
                  {[draft.venue.trim(), draft.city.trim()].filter(Boolean).join('  |  ')}
                </Text>
              ) : null}
              <TextInput
                multiline
                placeholder="What's on your mind?"
                placeholderTextColor={theme.colors.textSoft}
                style={styles.createComposerStoryInput}
                textAlignVertical="top"
                value={draft.about || draft.blurb}
                onChangeText={handleStoryChange}
              />
            </View>

            <View style={styles.createComposerMediaTray}>
              <CreateMediaTrayButton
                icon="image"
                label="Hero"
                stateLabel={draft.heroImage || editingEvent?.image ? 'Ready' : 'Required'}
                onPress={() => void handlePickImage('heroImage')}
              />
              <CreateMediaTrayButton
                icon="credit-card"
                label="Ticket"
                stateLabel={draft.ticketImage || editingEvent?.ticketImage ? 'Ready' : 'Optional'}
                onPress={() => void handlePickImage('ticketImage')}
              />
              <CreateMediaTrayButton
                icon="film"
                label="Gallery"
                stateLabel={mediaCount > 0 ? `${mediaCount} media` : 'Add more'}
                onPress={() => void handlePickGalleryMedia()}
              />
            </View>

            {selectedTags.length > 0 ? (
              <View style={styles.createComposerSelectedTags}>
                {selectedTags.map((tag) => (
                  <CompactChip key={tag} active icon={'tag' as FeatherName} label={tag} onPress={() => toggleTagSelection(tag)} />
                ))}
              </View>
            ) : null}

            {(draft.galleryMedia.length > 0 || (editingEvent?.media.length ?? 0) > 0) ? (
              <GalleryMediaPicker
                existingItems={editingEvent?.media ?? []}
                items={draft.galleryMedia}
                maxItems={MAX_CREATE_GALLERY_MEDIA}
                onAdd={() => void handlePickGalleryMedia()}
                onRemove={handleRemoveGalleryMedia}
              />
            ) : null}
          </View>
        ) : null}

        {step === 1 ? (
          <View style={styles.formStepStack}>
            <StepIntro
              title="Timing and story"
              copy="This screen is optional. Pick the schedule quickly, then add the story if you want."
            />

            <View style={styles.fieldGroup}>
              <FieldLabel label="Date and time" optional />
              <View style={styles.utilityCard}>
                <View style={styles.utilityCardHeader}>
                  <View style={styles.utilityTextWrap}>
                    <Text style={styles.utilityTitle}>{scheduleSummary}</Text>
                    <Text style={styles.utilityCopy}>
                      {selectedSchedule ? 'Update the schedule whenever you need to.' : 'Choose when this listing should happen.'}
                    </Text>
                  </View>
                  <Feather color={theme.colors.accentStrong} name="calendar" size={16} />
                </View>

                <View style={styles.utilityButtonRow}>
                  <CompactActionButton
                    icon="calendar"
                    label={selectedSchedule ? 'Change date' : 'Pick date'}
                    onPress={() => handleOpenPicker('date')}
                    tone="muted"
                  />
                  <CompactActionButton
                    icon="clock"
                    label={selectedSchedule ? 'Change time' : 'Pick time'}
                    onPress={() => handleOpenPicker('time')}
                    tone="muted"
                  />
                </View>

                {pickerMode ? (
                  <View style={styles.pickerWrap}>
                    <DateTimePicker
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      mode={pickerMode}
                      minimumDate={pickerMode === 'date' ? new Date() : undefined}
                      onChange={handlePickerChange}
                      value={selectedSchedule ?? new Date()}
                    />
                    {Platform.OS !== 'android' ? (
                      <View style={styles.pickerActions}>
                        <CompactActionButton icon="check" label="Done" onPress={() => setPickerMode(null)} tone="accent" />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>

            <CompactField
              label="Short blurb"
              placeholder="A rooftop night with warm plates and vinyl textures."
              value={draft.blurb}
              onChangeText={(value) => setField('blurb', value)}
              optional
              multiline
            />
            <CompactField
              label="About"
              placeholder="Write a fuller story for the listing if you want."
              value={draft.about}
              onChangeText={(value) => setField('about', value)}
              optional
              multiline
            />
            <CompactField
              label="Highlights"
              placeholder={'Ocean view\nLive band\nSignature cocktails'}
              value={draft.highlightsText}
              onChangeText={(value) => setField('highlightsText', value)}
              optional
              multiline
            />
          </View>
        ) : null}

        {step === 2 ? (
          <View style={styles.formStepStack}>
            <StepIntro
              title="Location and contact"
              copy="This last screen is also skippable. Detect the place in one tap, then add contact details if you want."
            />

            <View style={styles.fieldGroup}>
              <FieldLabel label="Location" optional />
              <View style={styles.utilityCard}>
                <View style={styles.utilityCardHeader}>
                  <View style={styles.utilityTextWrap}>
                    <Text style={styles.utilityTitle}>{draft.locationLabel.trim() || 'Use current location'}</Text>
                    <Text style={styles.utilityCopy}>{locationSummary}</Text>
                  </View>
                  {detectingLocation ? (
                    <ActivityIndicator color={theme.colors.accentStrong} />
                  ) : (
                    <Feather color={theme.colors.accentStrong} name="map-pin" size={16} />
                  )}
                </View>
                <View style={styles.utilityButtonRow}>
                  <CompactActionButton
                    disabled={detectingLocation}
                    icon="map-pin"
                    label={detectingLocation ? 'Finding...' : 'Use current location'}
                    onPress={() => void handleDetectLocation()}
                    tone="muted"
                  />
                </View>
              </View>
            </View>

            <CompactField
              label="Address"
              placeholder="45 Samora Machel Ave"
              value={draft.address}
              onChangeText={(value) => setField('address', value)}
              optional
            />
            <CompactField
              label="Location label"
              placeholder="Main entrance"
              value={draft.locationLabel}
              onChangeText={(value) => setField('locationLabel', value)}
              optional
            />
            <CompactField
              label="Location note"
              placeholder="Parking through the side gate."
              value={draft.locationNote}
              onChangeText={(value) => setField('locationNote', value)}
              optional
              multiline
            />

            <CompactField
              label="Phone"
              placeholder="+263 77 123 4567"
              value={draft.phone}
              onChangeText={(value) => setField('phone', value)}
              optional
              keyboardType="phone-pad"
            />
            <CompactField
              label="Email"
              placeholder="host@example.com"
              value={draft.email}
              onChangeText={(value) => setField('email', value)}
              optional
              keyboardType="email-address"
            />
            <CompactField
              label="Website"
              placeholder="https://example.com"
              value={draft.website}
              onChangeText={(value) => setField('website', value)}
              optional
              autoCapitalize="none"
            />

            <FieldLabel label="Social links" optional />
            <View style={styles.socialGrid}>
              <CompactField
                label="TikTok"
                placeholder="tiktok.com/@..."
                value={draft.tiktok}
                onChangeText={(value) => setField('tiktok', value)}
                optional
                autoCapitalize="none"
              />
              <CompactField
                label="Instagram"
                placeholder="instagram.com/..."
                value={draft.instagram}
                onChangeText={(value) => setField('instagram', value)}
                optional
                autoCapitalize="none"
              />
              <CompactField
                label="YouTube"
                placeholder="youtube.com/..."
                value={draft.youtube}
                onChangeText={(value) => setField('youtube', value)}
                optional
                autoCapitalize="none"
              />
              <CompactField
                label="Facebook"
                placeholder="facebook.com/..."
                value={draft.facebook}
                onChangeText={(value) => setField('facebook', value)}
                optional
                autoCapitalize="none"
              />
              <CompactField
                label="X"
                placeholder="x.com/..."
                value={draft.x}
                onChangeText={(value) => setField('x', value)}
                optional
                autoCapitalize="none"
              />
            </View>
          </View>
        ) : null}

        <SettingsModalShell
          title="Details"
          visible={activeQuickSheet === 'details'}
          onClose={() => setActiveQuickSheet(null)}
          topInset={insets.top}
        >
          <View style={styles.formStepStack}>
            <CompactField
              label="Venue"
              placeholder="Moonline Lounge"
              value={draft.venue}
              onChangeText={(value) => setField('venue', value)}
            />
            <CompactField
              label="City"
              placeholder="Harare"
              value={draft.city}
              onChangeText={(value) => setField('city', value)}
              optional
            />
            <SingleSelectDropdown
              label="Primary category"
              options={categoryOptions}
              placeholder="Choose a category"
              selectedValue={draft.categoryId}
              selectedLabel={selectedCategoryOption?.label}
              onSelect={handlePrimaryCategorySelect}
            />
            {showArtistField ? (
              <CompactField
                label="Artist or host"
                placeholder="DJ Nova"
                value={draft.artist}
                onChangeText={(value) => setField('artist', value)}
                optional
              />
            ) : null}
            <SingleSelectDropdown
              label="Price range"
              options={PRICE_RANGE_SELECT_OPTIONS}
              placeholder="Choose price range"
              selectedValue={draft.priceRange}
              selectedLabel={selectedPriceRangeOption?.label}
              onSelect={(value) => setField('priceRange', value as PriceRange)}
            />
            <CompactField
              label="Price"
              placeholder="$18"
              value={draft.price}
              onChangeText={(value) => setField('price', value)}
              optional
            />
            <View style={styles.utilityCard}>
              <View style={styles.utilityCardHeader}>
                <View style={styles.utilityTextWrap}>
                  <Text style={styles.utilityTitle}>Internal payments</Text>
                  <Text style={styles.utilityCopy}>
                    {draft.acceptsInternalPayments
                      ? 'Customers can pay in-app and receive a QR reference.'
                      : 'Customers can contact you, but in-app payments are off.'}
                  </Text>
                </View>
                <CompactActionButton
                  icon={draft.acceptsInternalPayments ? 'zap' : 'x'}
                  label={draft.acceptsInternalPayments ? 'On' : 'Off'}
                  onPress={() => setField('acceptsInternalPayments', !draft.acceptsInternalPayments)}
                  tone="muted"
                />
              </View>
            </View>
          </View>
        </SettingsModalShell>

        <SettingsModalShell
          title="Tags"
          visible={activeQuickSheet === 'tags'}
          onClose={() => setActiveQuickSheet(null)}
          topInset={insets.top}
        >
          <View style={styles.formStepStack}>
            <MultiSelectDropdown
              label="Tags"
              options={CREATE_TAG_OPTIONS}
              placeholder="Select tags"
              selectedValues={selectedTags}
              onToggle={toggleTagSelection}
            />
            <CompactField
              label="Short blurb"
              placeholder="A rooftop night with warm plates and vinyl textures."
              value={draft.blurb}
              onChangeText={(value) => setField('blurb', value)}
              optional
              multiline
            />
          </View>
        </SettingsModalShell>

        <SettingsModalShell
          title="Date and time"
          visible={activeQuickSheet === 'schedule'}
          onClose={() => {
            setPickerMode(null);
            setActiveQuickSheet(null);
          }}
          topInset={insets.top}
        >
          <View style={styles.formStepStack}>
            <View style={styles.utilityCard}>
              <View style={styles.utilityCardHeader}>
                <View style={styles.utilityTextWrap}>
                  <Text style={styles.utilityTitle}>{scheduleSummary}</Text>
                  <Text style={styles.utilityCopy}>
                    {selectedSchedule ? 'Update the schedule whenever you need to.' : 'Choose when this listing should happen.'}
                  </Text>
                </View>
                <Feather color={theme.colors.accentStrong} name="calendar" size={16} />
              </View>

              <View style={styles.utilityButtonRow}>
                <CompactActionButton
                  icon="calendar"
                  label={selectedSchedule ? 'Change date' : 'Pick date'}
                  onPress={() => handleOpenPicker('date')}
                  tone="muted"
                />
                <CompactActionButton
                  icon="clock"
                  label={selectedSchedule ? 'Change time' : 'Pick time'}
                  onPress={() => handleOpenPicker('time')}
                  tone="muted"
                />
              </View>

              {pickerMode ? (
                <View style={styles.pickerWrap}>
                  <DateTimePicker
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    mode={pickerMode}
                    minimumDate={pickerMode === 'date' ? new Date() : undefined}
                    onChange={handlePickerChange}
                    value={selectedSchedule ?? new Date()}
                  />
                  {Platform.OS !== 'android' ? (
                    <View style={styles.pickerActions}>
                      <CompactActionButton icon="check" label="Done" onPress={() => setPickerMode(null)} tone="accent" />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
        </SettingsModalShell>

        <SettingsModalShell
          title="Location"
          visible={activeQuickSheet === 'location'}
          onClose={() => setActiveQuickSheet(null)}
          topInset={insets.top}
        >
          <View style={styles.formStepStack}>
            <View style={styles.utilityCard}>
              <View style={styles.utilityCardHeader}>
                <View style={styles.utilityTextWrap}>
                  <Text style={styles.utilityTitle}>{draft.locationLabel.trim() || 'Use current location'}</Text>
                  <Text style={styles.utilityCopy}>{locationSummary}</Text>
                </View>
                <Feather color={theme.colors.accentStrong} name="map-pin" size={16} />
              </View>

              <View style={styles.utilityButtonRow}>
                <CompactActionButton
                  icon={detectingLocation ? 'loader' : 'navigation'}
                  label={detectingLocation ? 'Detecting...' : 'Use current location'}
                  onPress={() => void handleDetectLocation()}
                  tone="muted"
                  disabled={detectingLocation}
                />
              </View>
            </View>

            <CompactField
              label="Address"
              placeholder="12 Sunset Road"
              value={draft.address}
              onChangeText={(value) => setField('address', value)}
              optional
            />
            <CompactField
              label="Location label"
              placeholder="Harbor front"
              value={draft.locationLabel}
              onChangeText={(value) => setField('locationLabel', value)}
              optional
            />
          </View>
        </SettingsModalShell>

        {isSubmitting ? <CreateUploadProgress progress={submitProgress} stage={submitStage} /> : null}

        {localError || submitError ? (
          <View style={styles.inlineError}>
            <Feather color={theme.colors.accentStrong} name={'info' as FeatherName} size={14} />
            <Text style={styles.inlineErrorText}>{localError ?? submitError}</Text>
          </View>
        ) : null}

        <View style={styles.formActions}>
          {step > 0 ? (
            <CompactActionButton icon="chevron-left" label="Back" onPress={handleBack} tone="muted" />
          ) : (
            <View style={styles.actionSpacer} />
          )}

          <View style={styles.formActionRight}>
            {step > 0 ? (
              <CompactActionButton
                icon="x"
                label={step === 2 ? 'Skip & publish' : 'Skip'}
                onPress={() => void handleSkip()}
                tone="muted"
              />
            ) : null}

            <CompactActionButton
              icon={step === 2 ? 'plus-circle' : 'chevron-right'}
              label={
                isSubmitting
                  ? submitStage
                    ? `${submitStage} ${Math.max(1, Math.min(100, Math.round(submitProgress * 100)))}%`
                    : 'Publishing...'
                  : step === 2
                    ? editingEvent
                      ? 'Save changes'
                      : 'Publish'
                    : 'Next'
              }
              onPress={() => void (step === 2 ? handlePublish() : handleNext())}
              tone="accent"
              disabled={isSubmitting}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

export function ProfileTabView({
  categories,
  historyEvents,
  myListings,
  onCancelTicket,
  onChangePassword,
  onDeleteListings,
  onClearHistory,
  onEditListing,
  onMarkTicketUsed,
  onOpenCategory,
  onOpenSavedTab,
  onOpenTicket,
  onRemoveHistoryItem,
  onSignOut,
  onStartCreate,
  onToggleEmailNotifications,
  onTogglePushNotifications,
  onUpdateProfile,
  profile,
  receivedTickets,
  savedEvents,
  tickets,
  unreadCount,
  onSelectEvent,
}: {
  categories: AppCategory[];
  historyEvents: AppEvent[];
  myListings: AppEvent[];
  onCancelTicket: (ticket: AppTicket) => Promise<void>;
  onChangePassword: (input: ChangePasswordInput) => Promise<{ message: string }>;
  onDeleteListings: (eventIds: string[]) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onEditListing: (event: AppEvent) => void;
  onMarkTicketUsed: (ticket: AppTicket) => Promise<void>;
  onOpenCategory: (categoryId: string) => void;
  onOpenSavedTab: () => void;
  onOpenTicket: (ticket: AppTicket) => void;
  onRemoveHistoryItem: (event: AppEvent) => Promise<void>;
  onSignOut: () => void;
  onStartCreate: () => void;
  onToggleEmailNotifications: (enabled: boolean) => Promise<AppUser>;
  onTogglePushNotifications: (enabled: boolean) => Promise<AppUser>;
  onUpdateProfile: (input: UpdateProfileInput) => Promise<AppUser>;
  profile: AppUser | null;
  receivedTickets: AppTicket[];
  savedEvents: AppEvent[];
  tickets: AppTicket[];
  unreadCount: number;
  onSelectEvent: (event: AppEvent) => void;
}) {
  const insets = useSafeAreaInsets();
  const [activePanel, setActivePanel] = useState<'profile' | 'password' | 'notifications' | 'about' | null>(null);
  const [profilePage, setProfilePage] = useState<'main' | 'hosted' | 'tickets'>('main');
  const [busyKey, setBusyKey] = useState<'profile' | 'password' | 'push' | 'email' | 'hosted-delete' | 'hosted-payment' | 'verify' | null>(null);
  const [ticketBusyKey, setTicketBusyKey] = useState<string | null>(null);
  const [historyBusyKey, setHistoryBusyKey] = useState<string | null>(null);
  const [showAllMyTickets, setShowAllMyTickets] = useState(false);
  const [showAllReceivedTickets, setShowAllReceivedTickets] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [avatarUpload, setAvatarUpload] = useState<LocalUploadImage | null>(null);
  const [name, setName] = useState(profile?.name ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [hostedSearchQuery, setHostedSearchQuery] = useState('');
  const [hostedSelectionMode, setHostedSelectionMode] = useState(false);
  const [showAllHostedListings, setShowAllHostedListings] = useState(false);
  const [showAllTicketPage, setShowAllTicketPage] = useState(false);
  const [selectedHostedIds, setSelectedHostedIds] = useState<string[]>([]);
  const [paymentOverrides, setPaymentOverrides] = useState<Record<string, boolean>>({});
  const [verifyListing, setVerifyListing] = useState<AppEvent | null>(null);
  const [verifyReference, setVerifyReference] = useState('');
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const visibleMyTickets = showAllMyTickets ? tickets : tickets.slice(0, 4);
  const visibleReceivedTickets = showAllReceivedTickets ? receivedTickets : receivedTickets.slice(0, 5);
  const recentViews = showAllHistory ? historyEvents : historyEvents.slice(0, 6);
  const activeTicketCount = tickets.filter((ticket) => ticket.status === 'confirmed').length;
  const ticketHistoryCount = tickets.filter((ticket) => ticket.status !== 'confirmed').length;
  const categoryShortcuts = categories.filter((category) => category.id !== 'all');
  const hostedListings = useMemo(
    () => myListings.map((event) => ({
      ...event,
      acceptsInternalPayments: paymentOverrides[event.id] ?? event.acceptsInternalPayments,
    })),
    [myListings, paymentOverrides],
  );
  const filteredHostedListings = useMemo(() => {
    const query = hostedSearchQuery.trim().toLowerCase();
    if (!query) {
      return hostedListings;
    }

    return hostedListings.filter((event) =>
      [event.title, event.venue, event.city, event.ownerName ?? ''].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [hostedSearchQuery, hostedListings]);
  const visibleHostedListings = showAllHostedListings ? filteredHostedListings : filteredHostedListings.slice(0, 8);
  const visibleTicketPageItems = showAllTicketPage ? tickets : tickets.slice(0, 8);

  useEffect(() => {
    setName(profile?.name ?? '');
    setPhone(profile?.phone ?? '');
  }, [profile?.name, profile?.phone]);

  useEffect(() => {
    setSelectedHostedIds((current) => current.filter((id) => myListings.some((event) => event.id === id)));
  }, [myListings]);

  const handleAvatarPick = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos needed', 'Allow photo access so you can update your profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.92,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    setAvatarUpload(await toLocalUploadImage(result.assets[0], 'avatar'));
  };

  const handleSaveProfile = async () => {
    if (!profile) {
      return;
    }

    setBusyKey('profile');
    setError(null);
    setNotice(null);

    try {
      await onUpdateProfile({
        name,
        phone,
        emailNotificationsEnabled: profile.emailNotificationsEnabled,
        pushNotificationsEnabled: profile.pushNotificationsEnabled,
        avatar: avatarUpload,
      });
      setAvatarUpload(null);
      setNotice('Profile updated.');
      setActivePanel(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Profile could not be updated right now.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleSavePassword = async () => {
    setBusyKey('password');
    setError(null);
    setNotice(null);

    try {
      const response = await onChangePassword({
        oldPassword,
        newPassword,
        confirmPassword,
      });
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setNotice(response.message ?? 'Password updated.');
      setActivePanel(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Password could not be updated right now.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleTogglePush = async () => {
    if (!profile) {
      return;
    }

    setBusyKey('push');
    setError(null);
    setNotice(null);

    try {
      const next = !profile.pushNotificationsEnabled;
      await onTogglePushNotifications(next);
      setNotice(next ? 'Push notifications are on.' : 'Push notifications are off.');
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Push notifications could not be updated.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleEmail = async () => {
    if (!profile) {
      return;
    }

    setBusyKey('email');
    setError(null);
    setNotice(null);

    try {
      const next = !profile.emailNotificationsEnabled;
      await onToggleEmailNotifications(next);
      setNotice(next ? 'Email updates are on.' : 'Email updates are off.');
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Email updates could not be updated.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleManagedTicketCancel = async (ticket: AppTicket) => {
    setTicketBusyKey(`${ticket.id}:cancel`);
    setError(null);
    setNotice(null);

    try {
      await onCancelTicket(ticket);
      setNotice('Ticket cancelled.');
    } catch (ticketError) {
      setError(ticketError instanceof Error ? ticketError.message : 'Ticket could not be cancelled right now.');
    } finally {
      setTicketBusyKey(null);
    }
  };

  const handleManagedTicketUsed = async (ticket: AppTicket) => {
    setTicketBusyKey(`${ticket.id}:used`);
    setError(null);
    setNotice(null);

    try {
      await onMarkTicketUsed(ticket);
      setNotice('Ticket marked as used.');
    } catch (ticketError) {
      setError(ticketError instanceof Error ? ticketError.message : 'Ticket could not be updated right now.');
    } finally {
      setTicketBusyKey(null);
    }
  };

  const handleRemoveHistory = async (event: AppEvent) => {
    setHistoryBusyKey(event.id);
    setError(null);
    setNotice(null);

    try {
      await onRemoveHistoryItem(event);
      setNotice('History item removed.');
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'History item could not be removed.');
    } finally {
      setHistoryBusyKey(null);
    }
  };

  const handleClearViewedHistory = async () => {
    setHistoryBusyKey('clear');
    setError(null);
    setNotice(null);

    try {
      await onClearHistory();
      setNotice('History cleared.');
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'History could not be cleared right now.');
    } finally {
      setHistoryBusyKey(null);
    }
  };

  const handleOpenHostedPage = () => {
    setHostedSelectionMode(false);
    setShowAllHostedListings(false);
    setSelectedHostedIds([]);
    setHostedSearchQuery('');
    setProfilePage('hosted');
  };

  const handleOpenTicketsPage = () => {
    setShowAllTicketPage(false);
    setProfilePage('tickets');
  };

  const handleToggleHostedSelection = (eventId: string) => {
    setSelectedHostedIds((current) =>
      current.includes(eventId) ? current.filter((id) => id !== eventId) : [...current, eventId],
    );
  };

  const performDeleteHostedListings = async () => {
    if (selectedHostedIds.length === 0) {
      setError('Select one or more listings first.');
      return;
    }

    setBusyKey('hosted-delete');
    setError(null);
    setNotice(null);

    try {
      await onDeleteListings(selectedHostedIds);
      setSelectedHostedIds([]);
      setHostedSelectionMode(false);
      setNotice(selectedHostedIds.length === 1 ? 'Listing deleted.' : 'Listings deleted.');
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Listings could not be deleted right now.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteHostedListings = () => {
    if (selectedHostedIds.length === 0) {
      setError('Select one or more listings first.');
      return;
    }

    Alert.alert(
      selectedHostedIds.length === 1 ? 'Delete this listing?' : `Delete ${selectedHostedIds.length} listings?`,
      'This will remove them from your hosted page and the public feed.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void performDeleteHostedListings();
          },
        },
      ],
    );
  };

  const handleToggleInternalPayments = async (event: AppEvent) => {
    const nextValue = !event.acceptsInternalPayments;
    setBusyKey('hosted-payment');
    setError(null);
    setNotice(null);

    try {
      const updated = await setListingInternalPayments(event.id, nextValue, categories);
      setPaymentOverrides((current) => ({
        ...current,
        [event.id]: updated.acceptsInternalPayments,
      }));
      setNotice(updated.acceptsInternalPayments ? 'Internal payments enabled.' : 'Internal payments disabled.');
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Payment setting could not be updated.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleVerifyByReference = async () => {
    if (!verifyReference.trim()) {
      setVerifyResult('Enter the customer reference first.');
      return;
    }

    setBusyKey('verify');
    setVerifyResult(null);
    try {
      const result = await verifyTicketReference(verifyReference.trim(), categories);
      setVerifyResult(`${result.message} ${result.ticket.referenceCode} is ${result.ticket.status}.`);
    } catch (verifyError) {
      setVerifyResult(verifyError instanceof Error ? verifyError.message : 'Could not verify this reference.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleVerifyByQr = async (value: string) => {
    setBusyKey('verify');
    setVerifyResult(null);
    try {
      const result = await verifyTicketQr(value, categories);
      setVerifyResult(`${result.message} ${result.ticket.referenceCode} is ${result.ticket.status}.`);
    } catch (verifyError) {
      setVerifyResult(verifyError instanceof Error ? verifyError.message : 'Could not verify this QR code.');
    } finally {
      setBusyKey(null);
    }
  };

  if (profilePage === 'hosted') {
    return (
      <>
        <HostedListingsPage
          busy={busyKey === 'hosted-delete'}
          listings={visibleHostedListings}
          totalShownCount={filteredHostedListings.length}
          query={hostedSearchQuery}
          rawCount={myListings.length}
          selectedIds={selectedHostedIds}
          showAll={showAllHostedListings}
          selectionMode={hostedSelectionMode}
          onBack={() => {
            setProfilePage('main');
            setHostedSelectionMode(false);
            setShowAllHostedListings(false);
            setSelectedHostedIds([]);
          }}
          onChangeQuery={setHostedSearchQuery}
          onCreate={onStartCreate}
          onDeleteSelected={handleDeleteHostedListings}
          onEdit={onEditListing}
          onOpen={onSelectEvent}
          onOpenVerifier={(event) => {
            setVerifyListing(event);
            setVerifyReference('');
            setVerifyResult(null);
          }}
          onTogglePayments={handleToggleInternalPayments}
          onToggleShowAll={() => setShowAllHostedListings((current) => !current)}
          onSelectAll={() =>
            setSelectedHostedIds((current) =>
              filteredHostedListings.every((event) => current.includes(event.id))
                ? current.filter((id) => !filteredHostedListings.some((event) => event.id === id))
                : Array.from(new Set([...current, ...filteredHostedListings.map((event) => event.id)])),
            )
          }
          onToggleSelect={handleToggleHostedSelection}
          onToggleSelectionMode={() => {
            setHostedSelectionMode((current) => {
              if (current) {
                setSelectedHostedIds([]);
              }
              return !current;
            });
          }}
        />
        <TicketVerifierModal
          busy={busyKey === 'verify'}
          listing={verifyListing}
          reference={verifyReference}
          result={verifyResult}
          onChangeReference={setVerifyReference}
          onClose={() => setVerifyListing(null)}
          onVerifyReference={() => void handleVerifyByReference()}
          onVerifyQr={(value) => void handleVerifyByQr(value)}
        />
      </>
    );
  }

  if (profilePage === 'tickets') {
    return (
      <TicketsPage
        activeCount={activeTicketCount}
        showAll={showAllTicketPage}
        tickets={visibleTicketPageItems}
        totalCount={tickets.length}
        onBack={() => {
          setProfilePage('main');
          setShowAllTicketPage(false);
        }}
        onCancelTicket={(ticket) => void handleManagedTicketCancel(ticket)}
        onOpenTicket={onOpenTicket}
        onToggleShowAll={() => setShowAllTicketPage((current) => !current)}
        ticketBusyKey={ticketBusyKey}
      />
    );
  }

  return (
    <View style={styles.sectionStack}>
      <Text style={styles.sectionTitle}>Me</Text>

      <View style={styles.profileCard}>
        <View style={styles.profileTopRow}>
          <View style={styles.profileAvatar}>
            {profile?.avatar ? (
              <Image source={profile.avatar} contentFit="cover" style={styles.profileAvatarImage} transition={120} />
            ) : (
              <Image source={APP_LOGO} contentFit="cover" style={styles.profileAvatarImage} transition={0} />
            )}
          </View>

          <View style={styles.profileText}>
            <Text style={styles.profileName}>{profile?.name ?? 'Your profile'}</Text>
            <Text style={styles.profileMeta}>{profile?.email ?? 'Signed in'}</Text>
          </View>
        </View>

        <View style={styles.profileStatsRow}>
          <MiniStatCard label="Saved" value={String(savedEvents.length)} />
          <MiniStatCard label="Hosting" value={String(myListings.length)} />
          <MiniStatCard label="Received" value={String(receivedTickets.length)} />
        </View>

        <View style={styles.profileActionRow}>
          <CompactActionButton
            icon="user"
            label="Edit profile"
            onPress={() => setActivePanel('profile')}
            tone="muted"
          />
          <CompactActionButton icon="log-out" label="Sign out" onPress={onSignOut} tone="muted" />
        </View>
      </View>

      {notice ? (
        <View style={styles.inlineSuccess}>
          <Feather color="#8BE28B" name={'check-circle' as FeatherName} size={14} />
          <Text style={styles.inlineSuccessText}>{notice}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.inlineError}>
          <Feather color={theme.colors.accentStrong} name={'info' as FeatherName} size={14} />
          <Text style={styles.inlineErrorText}>{error}</Text>
        </View>
      ) : null}

      {false ? (
        <>
      {false ? (
        <>
      <View style={styles.profileSection}>
        <View style={styles.compactSectionHeader}>
          <View style={styles.compactSectionCopy}>
            <Text style={styles.compactSectionTitle}>My tickets</Text>
            <Text style={styles.compactSectionHint}>
              {activeTicketCount} active{ticketHistoryCount > 0 ? ` • ${ticketHistoryCount} history` : ''}
            </Text>
          </View>
          {tickets.length > 4 ? (
            <CompactActionButton
              icon={showAllMyTickets ? 'chevron-up' : 'chevron-down'}
              label={showAllMyTickets ? 'Less' : 'View all'}
              onPress={() => setShowAllMyTickets((current) => !current)}
              tone="muted"
            />
          ) : null}
        </View>

        {tickets.length === 0 ? (
          <EmptyState
            icon="download"
            title="No tickets saved yet"
            copy="Book a listing and your real tickets will show up here."
            compact
          />
        ) : (
          <View style={styles.ticketManagementList}>
            {visibleMyTickets.map((ticket) => (
              <TicketManagementRow
                key={`my-ticket-${ticket.id}`}
                title={ticket.event.title}
                subtitle={ticket.event.venue}
                meta={`Ref ${ticket.referenceCode} • ${formatTicketDate(ticket.bookedAt)}`}
                status={ticket.status}
                primaryActionLabel="Open"
                onPrimaryAction={() => onOpenTicket(ticket)}
                secondaryActionLabel={ticket.canCancel ? (ticketBusyKey === `${ticket.id}:cancel` ? 'Cancelling...' : 'Cancel') : undefined}
                onSecondaryAction={ticket.canCancel ? () => void handleManagedTicketCancel(ticket) : undefined}
                secondaryActionDisabled={ticketBusyKey !== null}
              />
            ))}
          </View>
        )}
      </View>

        </>
      ) : null}

      <View style={styles.profileSection}>
        <View style={styles.compactSectionHeader}>
          <View style={styles.compactSectionCopy}>
            <Text style={styles.compactSectionTitle}>Received tickets</Text>
            <Text style={styles.compactSectionHint}>Host dashboard</Text>
          </View>
          {receivedTickets.length > 5 ? (
            <CompactActionButton
              icon={showAllReceivedTickets ? 'chevron-up' : 'chevron-down'}
              label={showAllReceivedTickets ? 'Less' : 'View all'}
              onPress={() => setShowAllReceivedTickets((current) => !current)}
              tone="muted"
            />
          ) : null}
        </View>

        {receivedTickets.length === 0 ? (
          <EmptyState
            icon="user"
            title="No incoming tickets yet"
            copy="When people book your listings, they will appear here with quick controls."
            compact
          />
        ) : (
          <View style={styles.ticketManagementList}>
            {visibleReceivedTickets.map((ticket) => (
              <TicketManagementRow
                key={`received-ticket-${ticket.id}`}
                title={ticket.buyerName || 'Guest'}
                subtitle={ticket.event.title}
                meta={`Ref ${ticket.referenceCode} • ${formatTicketDate(ticket.bookedAt)}`}
                status={ticket.status}
                primaryActionLabel="Listing"
                onPrimaryAction={() => onSelectEvent(ticket.event)}
                secondaryActionLabel={ticket.canMarkUsed ? (ticketBusyKey === `${ticket.id}:used` ? 'Saving...' : 'Used') : undefined}
                onSecondaryAction={ticket.canMarkUsed ? () => void handleManagedTicketUsed(ticket) : undefined}
                secondaryActionTone="accent"
                secondaryActionDisabled={ticketBusyKey !== null}
                tertiaryActionLabel={ticket.canCancel ? (ticketBusyKey === `${ticket.id}:cancel` ? 'Cancelling...' : 'Cancel') : undefined}
                onTertiaryAction={ticket.canCancel ? () => void handleManagedTicketCancel(ticket) : undefined}
                tertiaryActionDisabled={ticketBusyKey !== null}
              />
            ))}
          </View>
        )}
      </View>
        </>
      ) : null}

      <View style={styles.profileSection}>
        <View style={styles.compactSectionHeader}>
          <View style={styles.compactSectionCopy}>
            <Text style={styles.compactSectionTitle}>Hosting</Text>
            <Text style={styles.compactSectionHint}>Separate page</Text>
          </View>
          <CompactActionButton icon="grid" label="Open" onPress={handleOpenHostedPage} tone="muted" />
        </View>

        <View style={styles.hostingSummaryCard}>
          <MiniStatCard label="Listings" value={`${myListings.length}`} />
          <MiniStatCard label="Received" value={`${receivedTickets.length}`} />
          <MiniStatCard label="Create" value="Open" />
        </View>
      </View>

      <View style={styles.profileSection}>
        <View style={styles.compactSectionHeader}>
          <View style={styles.compactSectionCopy}>
            <Text style={styles.compactSectionTitle}>Recently viewed</Text>
            <Text style={styles.compactSectionHint}>History</Text>
          </View>
          <View style={styles.sectionHeaderActions}>
            {historyEvents.length > 6 ? (
              <CompactActionButton
                icon={showAllHistory ? 'chevron-up' : 'chevron-down'}
                label={showAllHistory ? 'Less' : 'View all'}
                onPress={() => setShowAllHistory((current) => !current)}
                tone="muted"
              />
            ) : null}
            {historyEvents.length > 0 ? (
              <CompactActionButton
                icon="x"
                label={historyBusyKey === 'clear' ? 'Clearing...' : 'Clear'}
                onPress={() => void handleClearViewedHistory()}
                tone="muted"
                disabled={historyBusyKey !== null}
              />
            ) : null}
          </View>
        </View>

        {historyEvents.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No recent views yet"
            copy="Open a few listings and your view history will settle here."
            compact
          />
        ) : !showAllHistory ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ticketRail}>
            {recentViews.map((event) => (
              <PressableTicketCard key={`history-${event.id}`} event={event} onPress={() => onSelectEvent(event)} />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.historyList}>
            {recentViews.map((event) => (
              <HistoryEventRow
                key={`history-${event.id}`}
                event={event}
                busy={historyBusyKey === event.id}
                onOpen={() => onSelectEvent(event)}
                onRemove={() => void handleRemoveHistory(event)}
              />
            ))}
          </View>
        )}
      </View>

      <View style={styles.profileSection}>
        <View style={styles.compactSectionHeader}>
          <View style={styles.compactSectionCopy}>
            <Text style={styles.compactSectionTitle}>Categories</Text>
            <Text style={styles.compactSectionHint}>Jump to discover</Text>
          </View>
        </View>

        <View style={styles.categoryShortcutWrap}>
          {categoryShortcuts.map((category) => (
            <CompactChip
              key={`category-shortcut-${category.id}`}
              active={false}
              icon={(category.icon as FeatherName) ?? 'grid'}
              label={category.name}
              onPress={() => onOpenCategory(category.id)}
            />
          ))}
        </View>
      </View>

      <View style={styles.profileSection}>
        <View style={styles.compactSectionHeader}>
          <View style={styles.compactSectionCopy}>
            <Text style={styles.compactSectionTitle}>Settings</Text>
            <Text style={styles.compactSectionHint}>Tighter controls</Text>
          </View>
        </View>

        <View style={styles.settingsStack}>
          <SettingsActionRow
            icon="bell"
            label="Notifications"
            value={profile?.pushNotificationsEnabled ? 'On' : 'Off'}
            onPress={() => setActivePanel('notifications')}
          />
          <SettingsRow icon="message-circle" label="Inbox" value={unreadCount > 0 ? `${unreadCount} new` : 'Up to date'} />
          <SettingsActionRow icon="heart" label="Saved places" value={`${savedEvents.length}`} onPress={onOpenSavedTab} />
          <SettingsActionRow icon="grid" label="Hosted listings" value={`${myListings.length}`} onPress={handleOpenHostedPage} />
          <SettingsActionRow icon="download" label="My tickets" value={`${tickets.length}`} onPress={handleOpenTicketsPage} />
          <SettingsActionRow
            icon="mail"
            label="Email updates"
            value={profile?.emailNotificationsEnabled ? 'On' : 'Off'}
            onPress={() => setActivePanel('notifications')}
          />
          <SettingsActionRow
            icon="user"
            label="Account"
            value={profile?.phone ?? 'No phone yet'}
            onPress={() => setActivePanel('profile')}
          />
          <SettingsActionRow
            icon="settings"
            label="Password"
            value="Change"
            onPress={() => setActivePanel('password')}
          />
          <SettingsActionRow
            icon="info"
            label="Terms"
            value="Open"
            onPress={() => void Linking.openURL(`${BACKEND_ORIGIN}/terms/`)}
          />
          <SettingsActionRow
            icon="shield"
            label="Privacy"
            value="Open"
            onPress={() => void Linking.openURL(`${BACKEND_ORIGIN}/privacy/`)}
          />
          <SettingsActionRow
            icon="info"
            label="About app"
            value="Bites & Vibes"
            onPress={() => setActivePanel('about')}
          />
          <SettingsRow icon="settings" label="Version" value={`v${APP_VERSION}`} />
        </View>
      </View>

      <SettingsModalShell
        title="Account details"
        visible={activePanel === 'profile'}
        onClose={() => setActivePanel(null)}
        topInset={insets.top}
      >
        <View style={styles.profilePanel}>
          <View style={styles.profilePanelHeader}>
            <Text style={styles.profilePanelTitle}>Account details</Text>
            <CompactActionButton icon="image" label="Avatar" onPress={() => void handleAvatarPick()} tone="muted" />
          </View>

          <View style={styles.profileEditorTop}>
            <View style={styles.profileEditorAvatar}>
              <Image
                source={avatarUpload?.uri ?? profile?.avatar ?? APP_LOGO}
                contentFit="cover"
                style={styles.profileAvatarImage}
                transition={120}
              />
            </View>
            <Text style={styles.profileEditorHint}>Keep your public details fresh for bookings and hosted listings.</Text>
          </View>

          <CompactField label="Name" placeholder="Your name" value={name} onChangeText={setName} />
          <CompactField
            label="Phone"
            placeholder="+263 77 123 4567"
            value={phone}
            onChangeText={setPhone}
            optional
            keyboardType="phone-pad"
          />

          <View style={styles.profilePanelActions}>
            <CompactActionButton icon="x" label="Close" onPress={() => setActivePanel(null)} tone="muted" />
            <CompactActionButton
              icon="check"
              label={busyKey === 'profile' ? 'Saving...' : 'Save'}
              onPress={() => void handleSaveProfile()}
              tone="accent"
              disabled={busyKey === 'profile'}
            />
          </View>
        </View>
      </SettingsModalShell>

      <SettingsModalShell
        title="Password"
        visible={activePanel === 'password'}
        onClose={() => setActivePanel(null)}
        topInset={insets.top}
      >
        <View style={styles.profilePanel}>
          <View style={styles.profilePanelHeader}>
            <Text style={styles.profilePanelTitle}>Password</Text>
          </View>

          <CompactField
            label="Current password"
            placeholder="Enter current password"
            value={oldPassword}
            onChangeText={setOldPassword}
            optional
            autoCapitalize="none"
            secureTextEntry
          />
          <CompactField
            label="New password"
            placeholder="Choose a new password"
            value={newPassword}
            onChangeText={setNewPassword}
            autoCapitalize="none"
            secureTextEntry
          />
          <CompactField
            label="Confirm password"
            placeholder="Repeat the new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            autoCapitalize="none"
            secureTextEntry
          />

          <View style={styles.profilePanelActions}>
            <CompactActionButton icon="x" label="Close" onPress={() => setActivePanel(null)} tone="muted" />
            <CompactActionButton
              icon="check"
              label={busyKey === 'password' ? 'Saving...' : 'Update'}
              onPress={() => void handleSavePassword()}
              tone="accent"
              disabled={busyKey === 'password'}
            />
          </View>
        </View>
      </SettingsModalShell>

      <SettingsModalShell
        title="Notifications"
        visible={activePanel === 'notifications'}
        onClose={() => setActivePanel(null)}
        topInset={insets.top}
      >
        <View style={styles.modalStack}>
          <NotificationPreferenceCard
            busy={busyKey === 'push'}
            description="Receive device push alerts for tickets, bookings, and updates."
            enabled={Boolean(profile?.pushNotificationsEnabled)}
            label="Push notifications"
            onToggle={() => void handleTogglePush()}
          />
          <NotificationPreferenceCard
            busy={busyKey === 'email'}
            description="Receive email notices when something important changes."
            enabled={Boolean(profile?.emailNotificationsEnabled)}
            label="Email updates"
            onToggle={() => void handleToggleEmail()}
          />
        </View>
      </SettingsModalShell>

      <SettingsModalShell
        title="About app"
        visible={activePanel === 'about'}
        onClose={() => setActivePanel(null)}
        topInset={insets.top}
      >
        <View style={styles.aboutPanel}>
          <View style={styles.aboutHero}>
            <Image source={APP_LOGO} contentFit="contain" style={styles.aboutLogo} transition={120} />
            <View style={styles.aboutHeroCopy}>
              <Text style={styles.aboutTitle}>Bites & Vibes</Text>
              <Text style={styles.aboutMadeBy}>Made by Pavwell Excel Solutions</Text>
            </View>
          </View>

          <Text style={styles.aboutBody}>
            Bites & Vibes helps people discover restaurants, bars, lounges, fast food spots, chill spots, resorts, BnBs,
            events, and local experiences around them. It brings discovery, bookings, tickets, saved places,
            notifications, comments, media, and creator tools into one app so customers and business owners can meet in
            the same place.
          </Text>

          <View style={styles.aboutLines}>
            <View style={styles.aboutLineItem}>
              <Feather color={theme.colors.accentStrong} name="map-pin" size={15} />
              <Text style={styles.aboutLineText}>Find nearby places and category-based recommendations.</Text>
            </View>
            <View style={styles.aboutLineItem}>
              <Feather color={theme.colors.accentStrong} name="shopping-bag" size={15} />
              <Text style={styles.aboutLineText}>Reserve, book, buy tickets, and manage activity from your account.</Text>
            </View>
            <View style={styles.aboutLineItem}>
              <Feather color={theme.colors.accentStrong} name="video" size={15} />
              <Text style={styles.aboutLineText}>Share listings with photos, videos, pricing, location, and updates.</Text>
            </View>
          </View>

          <Text style={styles.aboutFooter}>Version v{APP_VERSION}</Text>
        </View>
      </SettingsModalShell>

    </View>
  );
}

function HostedListingsPage({
  busy,
  listings,
  totalShownCount,
  query,
  rawCount,
  selectedIds,
  showAll,
  selectionMode,
  onBack,
  onChangeQuery,
  onCreate,
  onDeleteSelected,
  onEdit,
  onOpen,
  onOpenVerifier,
  onSelectAll,
  onTogglePayments,
  onToggleShowAll,
  onToggleSelect,
  onToggleSelectionMode,
}: {
  busy: boolean;
  listings: AppEvent[];
  totalShownCount: number;
  query: string;
  rawCount: number;
  selectedIds: string[];
  showAll: boolean;
  selectionMode: boolean;
  onBack: () => void;
  onChangeQuery: (value: string) => void;
  onCreate: () => void;
  onDeleteSelected: () => void;
  onEdit: (event: AppEvent) => void;
  onOpen: (event: AppEvent) => void;
  onOpenVerifier: (event: AppEvent) => void;
  onSelectAll: () => void;
  onTogglePayments: (event: AppEvent) => void;
  onToggleShowAll: () => void;
  onToggleSelect: (eventId: string) => void;
  onToggleSelectionMode: () => void;
}) {
  const allVisibleSelected = listings.length > 0 && listings.every((event) => selectedIds.includes(event.id));

  return (
    <View style={styles.sectionStack}>
      <View style={styles.hostedPageHeader}>
        <CompactActionButton icon="chevron-left" label="Back" onPress={onBack} tone="muted" />
        <View style={styles.hostedPageTitleWrap}>
          <Text style={styles.hostedPageTitle}>Hosted listings</Text>
          <Text style={styles.hostedPageHint}>{rawCount} total listings</Text>
        </View>
        <CompactActionButton icon="plus-circle" label="Create" onPress={onCreate} tone="accent" />
      </View>

      <View style={styles.hostedSearchShell}>
        <Feather color={theme.colors.textMuted} name="search" size={16} />
        <TextInput
          placeholder="Search hosted listings"
          placeholderTextColor={theme.colors.textSoft}
          style={styles.hostedSearchInput}
          value={query}
          onChangeText={onChangeQuery}
        />
      </View>

      <View style={styles.hostedToolbar}>
        <Text style={styles.hostedToolbarMeta}>
          {listings.length} shown{totalShownCount > listings.length ? ` of ${totalShownCount}` : ''}{selectionMode ? ` • ${selectedIds.length} selected` : ''}
        </Text>
        <View style={styles.hostedToolbarActions}>
          {totalShownCount > 8 ? (
            <CompactActionButton
              icon={showAll ? 'chevron-up' : 'chevron-down'}
              label={showAll ? 'Less' : 'View all'}
              onPress={onToggleShowAll}
              tone="muted"
            />
          ) : null}
          {selectionMode ? (
            <>
              <CompactActionButton
                icon={allVisibleSelected ? 'check-square' : 'square'}
                label={allVisibleSelected ? 'All selected' : 'Select all'}
                onPress={onSelectAll}
                tone="muted"
              />
              <CompactActionButton
                icon="trash-2"
                label={busy ? 'Deleting...' : 'Delete'}
                onPress={onDeleteSelected}
                tone="muted"
                disabled={busy || selectedIds.length === 0}
              />
            </>
          ) : null}
          <CompactActionButton
            icon={selectionMode ? 'x' : 'check-square'}
            label={selectionMode ? 'Done' : 'Select'}
            onPress={onToggleSelectionMode}
            tone="muted"
          />
        </View>
      </View>

      {rawCount === 0 ? (
        <EmptyState
          icon="grid"
          title="No hosted listings yet"
          copy="Create your first listing, then come back here to manage it."
          compact
        />
      ) : listings.length === 0 ? (
        <EmptyState
          icon="search"
          title="Nothing matched that search"
          copy="Try a shorter search or clear it to see all your hosted listings again."
          compact
        />
      ) : (
        <View style={styles.hostedManagerList}>
          {listings.map((event) => (
            <HostedListingManagementRow
              key={`hosted-page-${event.id}`}
              event={event}
              selected={selectedIds.includes(event.id)}
              selectionMode={selectionMode}
              onEdit={() => onEdit(event)}
              onOpen={() => onOpen(event)}
              onOpenVerifier={() => onOpenVerifier(event)}
              onTogglePayments={() => onTogglePayments(event)}
              onToggleSelect={() => onToggleSelect(event.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function TicketVerifierModal({
  busy,
  listing,
  reference,
  result,
  onChangeReference,
  onClose,
  onVerifyReference,
  onVerifyQr,
}: {
  busy: boolean;
  listing: AppEvent | null;
  reference: string;
  result: string | null;
  onChangeReference: (value: string) => void;
  onClose: () => void;
  onVerifyReference: () => void;
  onVerifyQr: (value: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerLocked, setScannerLocked] = useState(false);

  useEffect(() => {
    if (!listing) {
      setScannerActive(false);
      setScannerLocked(false);
    }
  }, [listing]);

  const handleScanPress = async () => {
    if (!permission?.granted) {
      const nextPermission = await requestPermission();
      if (!nextPermission.granted) {
        return;
      }
    }
    setScannerLocked(false);
    setScannerActive(true);
  };

  return (
    <Modal animationType="slide" transparent visible={Boolean(listing)} onRequestClose={onClose}>
      <View style={styles.verifyBackdrop}>
        <View style={styles.verifySheet}>
          <View style={styles.verifyHeader}>
            <View style={styles.verifyHeaderCopy}>
              <Text style={styles.verifyEyebrow}>Owner verification</Text>
              <Text numberOfLines={1} style={styles.verifyTitle}>{listing?.title ?? 'Verify booking'}</Text>
            </View>
            <CompactActionButton icon="x" label="Close" onPress={onClose} tone="muted" />
          </View>

          <View style={styles.verifyCameraFrame}>
            {scannerActive && permission?.granted ? (
              <CameraView
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={(scan) => {
                  if (scannerLocked) {
                    return;
                  }
                  setScannerLocked(true);
                  setScannerActive(false);
                  onVerifyQr(scan.data);
                }}
                style={StyleSheet.absoluteFillObject}
              />
            ) : (
              <View style={styles.verifyCameraPlaceholder}>
                <Feather color={theme.colors.accentStrong} name="grid" size={28} />
                <Text style={styles.verifyPlaceholderText}>Scan the customer QR code here.</Text>
              </View>
            )}
          </View>

          <View style={styles.verifyActions}>
            <CompactActionButton icon="camera" label="Scan QR" onPress={() => void handleScanPress()} tone="accent" />
            <CompactActionButton icon="x" label="Stop" onPress={() => setScannerActive(false)} tone="muted" />
          </View>

          <View style={styles.verifyManualBox}>
            <Text style={styles.verifyLabel}>Manual reference</Text>
            <View style={styles.verifyInputLine}>
              <Feather color={theme.colors.textMuted} name="hash" size={15} />
              <TextInput
                autoCapitalize="characters"
                onChangeText={onChangeReference}
                placeholder="Enter reference code"
                placeholderTextColor={theme.colors.textSoft}
                style={styles.verifyInput}
                value={reference}
              />
            </View>
            <CompactActionButton
              disabled={busy}
              icon="check"
              label={busy ? 'Checking...' : 'Verify reference'}
              onPress={onVerifyReference}
              tone="accent"
            />
          </View>

          {result ? <Text style={styles.verifyResult}>{result}</Text> : null}
        </View>
      </View>
    </Modal>
  );
}

function TicketsPage({
  activeCount,
  showAll,
  tickets,
  totalCount,
  onBack,
  onCancelTicket,
  onOpenTicket,
  onToggleShowAll,
  ticketBusyKey,
}: {
  activeCount: number;
  showAll: boolean;
  tickets: AppTicket[];
  totalCount: number;
  onBack: () => void;
  onCancelTicket: (ticket: AppTicket) => void;
  onOpenTicket: (ticket: AppTicket) => void;
  onToggleShowAll: () => void;
  ticketBusyKey: string | null;
}) {
  return (
    <View style={styles.sectionStack}>
      <View style={styles.hostedPageHeader}>
        <CompactActionButton icon="chevron-left" label="Back" onPress={onBack} tone="muted" />
        <View style={styles.hostedPageTitleWrap}>
          <Text style={styles.hostedPageTitle}>My tickets</Text>
          <Text style={styles.hostedPageHint}>{totalCount} total tickets</Text>
        </View>
      </View>

      <View style={styles.hostedToolbar}>
        <Text style={styles.hostedToolbarMeta}>
          {tickets.length} shown{totalCount > tickets.length ? ` of ${totalCount}` : ''} | {activeCount} active
        </Text>
        {totalCount > 8 ? (
          <CompactActionButton
            icon={showAll ? 'chevron-up' : 'chevron-down'}
            label={showAll ? 'Less' : 'View all'}
            onPress={onToggleShowAll}
            tone="muted"
          />
        ) : null}
      </View>

      {totalCount === 0 ? (
        <EmptyState
          icon="download"
          title="No tickets saved yet"
          copy="Book a listing and your real tickets will show up here."
          compact
        />
      ) : (
        <View style={styles.ticketManagementList}>
          {tickets.map((ticket) => (
            <TicketManagementRow
              key={`tickets-page-${ticket.id}`}
              title={ticket.event.title}
              subtitle={ticket.event.venue}
              meta={`Ref ${ticket.referenceCode} | ${formatTicketDate(ticket.bookedAt)}`}
              status={ticket.status}
              primaryActionLabel="Open"
              onPrimaryAction={() => onOpenTicket(ticket)}
              secondaryActionLabel={
                ticket.canCancel ? (ticketBusyKey === `${ticket.id}:cancel` ? 'Cancelling...' : 'Cancel') : undefined
              }
              onSecondaryAction={ticket.canCancel ? () => onCancelTicket(ticket) : undefined}
              secondaryActionDisabled={ticketBusyKey !== null}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function TicketManagementRow({
  title,
  subtitle,
  meta,
  status,
  primaryActionLabel,
  onPrimaryAction,
  secondaryActionLabel,
  onSecondaryAction,
  secondaryActionTone = 'muted',
  secondaryActionDisabled = false,
  tertiaryActionLabel,
  onTertiaryAction,
  tertiaryActionDisabled = false,
}: {
  title: string;
  subtitle: string;
  meta: string;
  status: AppTicket['status'];
  primaryActionLabel: string;
  onPrimaryAction: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  secondaryActionTone?: 'accent' | 'muted';
  secondaryActionDisabled?: boolean;
  tertiaryActionLabel?: string;
  onTertiaryAction?: () => void;
  tertiaryActionDisabled?: boolean;
}) {
  return (
    <View style={styles.ticketManagementRow}>
      <View style={styles.ticketManagementTop}>
        <View style={styles.ticketManagementCopy}>
          <Text numberOfLines={1} style={styles.ticketManagementTitle}>
            {title}
          </Text>
          <Text numberOfLines={1} style={styles.ticketManagementSubtitle}>
            {subtitle}
          </Text>
        </View>
        <StatusPill status={status} />
      </View>

      <Text numberOfLines={1} style={styles.ticketManagementMeta}>
        {meta}
      </Text>

      <View style={styles.ticketManagementActions}>
        <CompactActionButton icon="external-link" label={primaryActionLabel} onPress={onPrimaryAction} tone="muted" />
        {secondaryActionLabel && onSecondaryAction ? (
          <CompactActionButton
            icon={secondaryActionTone === 'accent' ? 'check' : 'x'}
            label={secondaryActionLabel}
            onPress={onSecondaryAction}
            tone={secondaryActionTone}
            disabled={secondaryActionDisabled}
          />
        ) : null}
        {tertiaryActionLabel && onTertiaryAction ? (
          <CompactActionButton
            icon="x"
            label={tertiaryActionLabel}
            onPress={onTertiaryAction}
            tone="muted"
            disabled={tertiaryActionDisabled}
          />
        ) : null}
      </View>
    </View>
  );
}

function HistoryEventRow({
  event,
  busy,
  onOpen,
  onRemove,
}: {
  event: AppEvent;
  busy: boolean;
  onOpen: () => void;
  onRemove: () => void;
}) {
  return (
    <View style={styles.historyRow}>
      <Pressable onPress={onOpen} style={styles.historyRowPressable}>
        <View style={styles.historyRowCard}>
          <Image source={event.image} contentFit="cover" style={styles.historyRowImage} transition={120} />
          <View style={styles.historyRowCopy}>
            <Text numberOfLines={1} style={styles.historyRowTitle}>
              {event.title}
            </Text>
            <Text numberOfLines={1} style={styles.historyRowMeta}>
              {event.venue}  |  {event.day} {event.month}  |  {event.time}
            </Text>
          </View>
        </View>
      </Pressable>
      <CompactActionButton
        icon="x"
        label={busy ? 'Removing...' : 'Remove'}
        onPress={onRemove}
        tone="muted"
        disabled={busy}
      />
    </View>
  );
}

function StatusPill({ status }: { status: AppTicket['status'] }) {
  if (status === 'confirmed') {
    return null;
  }

  return (
    <View
      style={[
        styles.ticketStatusPill,
        status === 'used' ? styles.ticketStatusPillUsed : null,
        status === 'cancelled' ? styles.ticketStatusPillCancelled : null,
      ]}
    >
      <Text
        style={[
          styles.ticketStatusText,
          status === 'used' ? styles.ticketStatusTextUsed : null,
          status === 'cancelled' ? styles.ticketStatusTextCancelled : null,
        ]}
      >
        {status}
      </Text>
    </View>
  );
}

function SettingsModalShell({
  title,
  visible,
  onClose,
  topInset,
  children,
}: {
  title: string;
  visible: boolean;
  onClose: () => void;
  topInset: number;
  children: React.ReactNode;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalShell, { marginTop: topInset + 12 }]}>
          <View style={styles.modalTitleRow}>
            <Text style={styles.modalTitle}>{title}</Text>
            <CompactActionButton icon="x" label="Close" onPress={onClose} tone="muted" />
          </View>
          <ScrollView contentContainerStyle={styles.modalScrollContent} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function NotificationPreferenceCard({
  label,
  description,
  enabled,
  busy,
  onToggle,
}: {
  label: string;
  description: string;
  enabled: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={styles.notificationPrefCard}>
      <View style={styles.notificationPrefCopy}>
        <Text style={styles.notificationPrefTitle}>{label}</Text>
        <Text style={styles.notificationPrefDescription}>{description}</Text>
      </View>
      <CompactActionButton
        icon={enabled ? 'x' : 'check'}
        label={busy ? 'Saving...' : enabled ? 'Turn off' : 'Turn on'}
        onPress={onToggle}
        tone={enabled ? 'muted' : 'accent'}
        disabled={busy}
      />
    </View>
  );
}

function SavedEventCard({
  event,
  onPress,
}: {
  event: AppEvent;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.018,
    pressedScaleY: 0.968,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={[styles.savedCard, jelly.animatedStyle]}>
        <Image source={event.image} contentFit="cover" style={styles.savedCardImage} transition={180} />

        <View style={styles.savedCardBody}>
          <View style={styles.savedCardTop}>
            <Text numberOfLines={1} style={styles.savedCardTitle}>
              {event.title}
            </Text>
            <View style={styles.savedPriceChip}>
              <Text style={styles.savedPriceText}>{event.price}</Text>
            </View>
          </View>

          <Text numberOfLines={1} style={styles.savedCardVenue}>
            {event.venue}
          </Text>
          <Text numberOfLines={1} style={styles.savedCardMeta}>
            {event.city}  •  {event.day} {event.month}  •  {event.time}
          </Text>

          <View style={styles.savedCardFooter}>
            <View style={styles.savedCardTags}>
              {event.categories.slice(0, 2).map((category) => (
                <Tag key={category.id} label={category.name} />
              ))}
            </View>

            <View style={styles.savedRatingPill}>
              <Feather color="#FBBF24" name={'star' as FeatherName} size={12} />
              <Text style={styles.savedRatingText}>{event.rating.toFixed(1)}</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function NotificationCard({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.01,
    pressedScaleY: 0.97,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={[styles.notificationCard, !notification.isRead && styles.notificationCardUnread, jelly.animatedStyle]}>
        <View style={styles.notificationIcon}>
          <Feather color={theme.colors.accentStrong} name={notificationIconForType(notification.type)} size={15} />
        </View>

        <View style={styles.notificationBody}>
          <View style={styles.notificationHeader}>
            <Text numberOfLines={1} style={styles.notificationTitle}>
              {notification.title}
            </Text>
            {!notification.isRead ? <View style={styles.notificationDot} /> : null}
          </View>

          <Text numberOfLines={2} style={styles.notificationMessage}>
            {notification.message}
          </Text>
          <Text style={styles.notificationMeta}>{formatRelativeDate(notification.createdAt)}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function PressableTicketCard({
  event,
  onPress,
}: {
  event: AppEvent;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.018,
    pressedScaleY: 0.962,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={[styles.ticketCard, jelly.animatedStyle]}>
        <Image source={event.ticketImage ?? event.image} contentFit="cover" style={styles.ticketCardImage} transition={180} />
        <View style={styles.ticketCardOverlay} />

        <View style={styles.ticketCardContent}>
          <Text numberOfLines={1} style={styles.ticketCardTitle}>
            {event.title}
          </Text>
          <Text numberOfLines={1} style={styles.ticketCardMeta}>
            {event.day} {event.month}  •  {event.time}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function CreateComposerChip({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: FeatherName;
  label: string;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.018,
    pressedScaleY: 0.95,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={[styles.createComposerChip, active && styles.createComposerChipActive, jelly.animatedStyle]}>
        <Feather color={active ? theme.colors.white : theme.colors.textMuted} name={icon} size={15} />
        <Text numberOfLines={1} style={[styles.createComposerChipText, active && styles.createComposerChipTextActive]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function CreateMediaTrayButton({
  icon,
  label,
  stateLabel,
  onPress,
}: {
  icon: FeatherName;
  label: string;
  stateLabel: string;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.024,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut} style={styles.createMediaTrayPressable}>
      <Animated.View style={[styles.createMediaTrayButton, jelly.animatedStyle]}>
        <Feather color={theme.colors.text} name={icon} size={20} />
        <Text style={styles.createMediaTrayLabel}>{label}</Text>
        <Text style={styles.createMediaTrayState}>{stateLabel}</Text>
      </Animated.View>
    </Pressable>
  );
}

function StreamVideoCard({
  active,
  height,
  item,
  safeTop,
  onOpen,
  onOpenViewer,
  onToggleSave,
}: {
  active: boolean;
  height: number;
  item: StreamVideoItem;
  safeTop: number;
  onOpen: () => void;
  onOpenViewer: () => void;
  onToggleSave: () => void;
}) {
  const videoRef = useRef<Video>(null);
  const [muted, setMuted] = useState(true);
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.02,
    pressedScaleY: 0.95,
  });

  useEffect(() => {
    if (active) {
      videoRef.current?.playAsync().catch(() => undefined);
      return;
    }

    videoRef.current?.pauseAsync().catch(() => undefined);
  }, [active]);

  return (
    <View style={[styles.streamCard, { height }]}>
      {item.poster ? <Image source={item.poster} contentFit="cover" style={styles.streamPoster} transition={120} /> : null}
      <Video
        isLooping
        isMuted={muted}
        progressUpdateIntervalMillis={500}
        ref={videoRef}
        resizeMode={ResizeMode.COVER}
        shouldPlay={active}
        source={{ uri: item.source }}
        style={styles.streamVideo}
      />
      <View pointerEvents="none" style={styles.streamShade} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open stream video viewer"
        onPress={onOpenViewer}
        style={styles.streamTapTarget}
      />

      <View style={[styles.streamTopBar, { paddingTop: safeTop + 12 }]}>
        <Text style={styles.streamTitle}>Stream</Text>
        <Pressable onPress={() => setMuted((current) => !current)} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
          <Animated.View style={[styles.streamRoundAction, jelly.animatedStyle]}>
            <Feather color={theme.colors.white} name={muted ? 'volume-x' : 'volume-2'} size={17} />
          </Animated.View>
        </Pressable>
      </View>

      <View style={styles.streamActions}>
        <Pressable onPress={onToggleSave} style={styles.streamSideAction}>
          <View style={[styles.streamRoundAction, item.event.isSaved && styles.streamRoundActionActive]}>
            <Feather color={theme.colors.white} name="heart" size={19} />
          </View>
          <Text style={styles.streamActionLabel}>{formatCompactCount(item.event.saveCount)}</Text>
        </Pressable>
        <Pressable onPress={onOpen} style={styles.streamSideAction}>
          <View style={styles.streamRoundAction}>
            <Feather color={theme.colors.white} name="external-link" size={18} />
          </View>
          <Text style={styles.streamActionLabel}>Open</Text>
        </Pressable>
      </View>

      <View style={styles.streamCopy}>
        <Text numberOfLines={1} style={styles.streamEventTitle}>
          {item.event.title}
        </Text>
        <Text numberOfLines={1} style={styles.streamEventMeta}>
          {item.event.venue} | {item.event.city} | {item.event.price}
        </Text>
        <Text numberOfLines={2} style={styles.streamEventBlurb}>
          {item.event.blurb || item.event.about}
        </Text>
      </View>
    </View>
  );
}

function StepStrip({ currentStep }: { currentStep: CreateStep }) {
  const steps = [
    { id: 0, label: 'Basics' },
    { id: 1, label: 'Story' },
    { id: 2, label: 'Extras' },
  ] as const;

  return (
    <View style={styles.stepStrip}>
      {steps.map((step) => (
        <View key={step.id} style={[styles.stepChip, currentStep === step.id && styles.stepChipActive]}>
          <Text style={[styles.stepChipIndex, currentStep === step.id && styles.stepChipIndexActive]}>
            {step.id + 1}
          </Text>
          <Text style={[styles.stepChipText, currentStep === step.id && styles.stepChipTextActive]}>
            {step.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function StepIntro({
  title,
  copy,
}: {
  title: string;
  copy: string;
}) {
  return (
    <View style={styles.stepIntro}>
      <Text style={styles.stepIntroTitle}>{title}</Text>
      <Text style={styles.stepIntroCopy}>{copy}</Text>
    </View>
  );
}

function CompactField({
  label,
  value,
  onChangeText,
  placeholder,
  optional = false,
  multiline = false,
  keyboardType,
  autoCapitalize = 'sentences',
  secureTextEntry = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  optional?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
}) {
  return (
    <View style={styles.fieldGroup}>
      <FieldLabel label={label} optional={optional} />
      <TextInput
        autoCapitalize={autoCapitalize}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textSoft}
        secureTextEntry={secureTextEntry}
        style={[styles.compactInput, multiline && styles.compactInputMultiline]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}

function FieldLabel({
  label,
  optional = false,
}: {
  label: string;
  optional?: boolean;
}) {
  return (
    <View style={styles.fieldLabelRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {optional ? <Text style={styles.fieldOptional}>Optional</Text> : null}
    </View>
  );
}

function UploadTile({
  label,
  hint,
  image,
  remotePreview,
  onPress,
}: {
  label: string;
  hint: string;
  image: LocalUploadImage | null;
  remotePreview?: string | null;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.018,
    pressedScaleY: 0.962,
  });
  const isVideo = Boolean(image?.mimeType.startsWith('video/'));
  const previewSource = image?.previewUri ?? image?.posterImage?.uri ?? (image ? image.uri : remotePreview ?? null);
  const hintText = image
    ? isVideo
      ? `${image.fileSize && image.fileSize > MAX_VIDEO_SOFT_LIMIT_BYTES ? 'Optimized video' : 'Video'} ready`
      : image.name
    : remotePreview
      ? 'Current media'
      : hint;

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut} style={styles.uploadCell}>
      <Animated.View style={[styles.uploadTile, jelly.animatedStyle]}>
        {previewSource ? (
          <View>
            <Image source={previewSource} contentFit="cover" style={styles.uploadPreview} transition={120} />
            {isVideo ? (
              <View style={styles.uploadVideoBadge}>
                <Feather color={theme.colors.white} name={'play-circle' as FeatherName} size={14} />
                <Text style={styles.uploadVideoBadgeText}>Video</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.uploadEmpty}>
            <Feather color={theme.colors.accentStrong} name={'plus-circle' as FeatherName} size={18} />
          </View>
        )}

        <View style={styles.uploadCopy}>
          <Text style={styles.uploadTitle}>{label}</Text>
          <Text style={styles.uploadHint}>{hintText}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function GalleryMediaPicker({
  existingItems,
  items,
  maxItems,
  onAdd,
  onRemove,
}: {
  existingItems: AppEvent['media'];
  items: LocalUploadImage[];
  maxItems: number;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return (
    <View style={styles.fieldGroup}>
      <FieldLabel label="Gallery and video" optional />
      <Text style={styles.galleryHelperText}>
        Add extra images or one or more videos. They will slide in the details header automatically.
      </Text>

      <View style={styles.galleryPickerShell}>
        <Pressable onPress={onAdd} style={styles.galleryAddPressable}>
          <View style={styles.galleryAddTile}>
            <Feather color={theme.colors.accentStrong} name={'plus-circle' as FeatherName} size={18} />
            <Text style={styles.galleryAddTitle}>Add media</Text>
            <Text style={styles.galleryAddHint}>
              {items.length + existingItems.length}/{maxItems + existingItems.length} showing
            </Text>
          </View>
        </Pressable>

        {existingItems.length > 0 || items.length > 0 ? (
          <View style={styles.galleryMediaGrid}>
            {existingItems.map((item) => (
              <ExistingGalleryMediaCard key={item.id} item={item} />
            ))}
            {items.map((item, index) => (
              <GalleryMediaCard key={`${item.name}-${index}`} item={item} onRemove={() => onRemove(index)} />
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function GalleryMediaCard({
  item,
  onRemove,
}: {
  item: LocalUploadImage;
  onRemove: () => void;
}) {
  const isVideo = item.mimeType.startsWith('video/');
  const previewSource = item.previewUri ?? item.posterImage?.uri ?? (isVideo ? null : item.uri);

  return (
    <View style={styles.galleryMediaCard}>
      {previewSource ? (
        <View>
          <Image source={previewSource} contentFit="cover" style={styles.galleryMediaPreview} transition={120} />
          {isVideo ? (
            <View style={styles.galleryMediaVideoBadge}>
              <Feather color={theme.colors.white} name={'play-circle' as FeatherName} size={16} />
            </View>
          ) : null}
        </View>
      ) : isVideo ? (
        <View style={[styles.galleryMediaPreview, styles.galleryMediaVideoPreview]}>
          <Feather color={theme.colors.accentStrong} name={'play-circle' as FeatherName} size={20} />
        </View>
      ) : (
        <Image source={item.uri} contentFit="cover" style={styles.galleryMediaPreview} transition={120} />
      )}

      <Pressable onPress={onRemove} style={styles.galleryRemoveButton}>
        <Feather color={theme.colors.white} name={'x' as FeatherName} size={11} />
      </Pressable>

      <Text numberOfLines={2} style={styles.galleryMediaName}>
        {item.name}
      </Text>
    </View>
  );
}

function ExistingGalleryMediaCard({ item }: { item: AppEvent['media'][number] }) {
  const previewSource = item.kind === 'video' ? item.preview ?? null : item.source;
  return (
    <View style={styles.galleryMediaCard}>
      {previewSource ? (
        <View>
          <Image source={previewSource} contentFit="cover" style={styles.galleryMediaPreview} transition={120} />
          {item.kind === 'video' ? (
            <View style={styles.galleryMediaVideoBadge}>
              <Feather color={theme.colors.white} name={'play-circle' as FeatherName} size={16} />
            </View>
          ) : null}
        </View>
      ) : item.kind === 'video' ? (
        <View style={[styles.galleryMediaPreview, styles.galleryMediaVideoPreview]}>
          <Feather color={theme.colors.accentStrong} name={'play-circle' as FeatherName} size={20} />
        </View>
      ) : (
        <Image source={item.source} contentFit="cover" style={styles.galleryMediaPreview} transition={120} />
      )}

      <View style={styles.galleryExistingBadge}>
        <Text style={styles.galleryExistingBadgeText}>Current</Text>
      </View>

      <Text numberOfLines={2} style={styles.galleryMediaName}>
        {item.altText ?? 'Existing media'}
      </Text>
    </View>
  );
}

function CreateUploadProgress({
  progress,
  stage,
}: {
  progress: number;
  stage: string | null;
}) {
  const clamped = Math.max(0.02, Math.min(progress, 1));

  return (
    <View style={styles.progressCard}>
      <View style={styles.progressCopyRow}>
        <Text style={styles.progressTitle}>{stage ?? 'Publishing'}</Text>
        <Text style={styles.progressValue}>{Math.round(clamped * 100)}%</Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(clamped * 100)}%` }]} />
      </View>
      <Text style={styles.progressHint}>Uploading your listing media. Keep the app open for the smoothest finish.</Text>
    </View>
  );
}

function SingleSelectDropdown({
  label,
  options,
  placeholder,
  selectedLabel,
  selectedValue,
  onSelect,
}: {
  label: string;
  options: SelectOption[];
  placeholder: string;
  selectedLabel?: string | null;
  selectedValue: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.015,
    pressedScaleY: 0.965,
  });

  return (
    <View style={styles.fieldGroup}>
      <FieldLabel label={label} />

      <Pressable onPress={() => setOpen((current) => !current)} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
        <Animated.View style={[styles.dropdownTrigger, jelly.animatedStyle]}>
          <Text numberOfLines={1} style={[styles.dropdownTriggerText, !selectedLabel && styles.dropdownTriggerPlaceholder]}>
            {selectedLabel || placeholder}
          </Text>
          <Feather color={theme.colors.textMuted} name={open ? 'chevron-up' : 'chevron-down'} size={16} />
        </Animated.View>
      </Pressable>

      {open ? (
        <View style={styles.dropdownMenu}>
          {options.map((option) => (
            <SelectOptionRow
              key={option.value}
              active={selectedValue === option.value}
              icon={option.icon}
              label={option.label}
              onPress={() => {
                onSelect(option.value);
                setOpen(false);
              }}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MultiSelectDropdown({
  label,
  options,
  placeholder,
  selectedValues,
  onToggle,
}: {
  label: string;
  options: SelectOption[];
  placeholder: string;
  selectedValues: string[];
  onToggle: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.015,
    pressedScaleY: 0.965,
  });
  const selectedOptions = options.filter((option) => selectedValues.includes(option.value));

  return (
    <View style={styles.fieldGroup}>
      <FieldLabel label={label} optional />

      <Pressable onPress={() => setOpen((current) => !current)} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
        <Animated.View style={[styles.dropdownTrigger, jelly.animatedStyle]}>
          <Text
            numberOfLines={1}
            style={[styles.dropdownTriggerText, selectedOptions.length === 0 && styles.dropdownTriggerPlaceholder]}
          >
            {selectedOptions.length === 0
              ? placeholder
              : selectedOptions.length === 1
                ? selectedOptions[0]?.label
                : `${selectedOptions.length} selected`}
          </Text>
          <Feather color={theme.colors.textMuted} name={open ? 'chevron-up' : 'chevron-down'} size={16} />
        </Animated.View>
      </Pressable>

      {open ? (
        <View style={styles.dropdownMenu}>
          {options.map((option) => (
            <SelectOptionRow
              key={option.value}
              active={selectedValues.includes(option.value)}
              icon={option.icon}
              label={option.label}
              onPress={() => {
                onToggle(option.value);
                setOpen(false);
              }}
            />
          ))}
        </View>
      ) : null}

      {selectedOptions.length > 0 ? (
        <View style={styles.choiceWrap}>
          {selectedOptions.map((option) => (
            <CompactChip
              key={option.value}
              active
              icon={(option.icon ?? 'check') as FeatherName}
              label={option.label}
              onPress={() => onToggle(option.value)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SelectOptionRow({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon?: FeatherName;
  label: string;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.012,
    pressedScaleY: 0.972,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={[styles.dropdownOptionRow, active && styles.dropdownOptionRowActive, jelly.animatedStyle]}>
        <View style={styles.dropdownOptionLeft}>
          {icon ? (
            <View style={[styles.dropdownOptionIcon, active && styles.dropdownOptionIconActive]}>
              <Feather color={active ? theme.colors.white : theme.colors.accentStrong} name={icon} size={14} />
            </View>
          ) : null}
          <Text style={[styles.dropdownOptionText, active && styles.dropdownOptionTextActive]}>{label}</Text>
        </View>
        <Feather
          color={active ? theme.colors.accentStrong : theme.colors.textSoft}
          name={active ? 'check-circle' : 'circle'}
          size={15}
        />
      </Animated.View>
    </Pressable>
  );
}

function CompactChip({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: FeatherName;
  label: string;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.018,
    pressedScaleY: 0.95,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={[styles.compactChip, active && styles.compactChipActive, jelly.animatedStyle]}>
        <Feather color={active ? theme.colors.white : theme.colors.accentStrong} name={icon} size={14} />
        <Text style={[styles.compactChipText, active && styles.compactChipTextActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function CompactActionButton({
  icon,
  label,
  onPress,
  tone,
  disabled = false,
}: {
  icon: FeatherName;
  label: string;
  onPress: () => void;
  tone: 'accent' | 'muted';
  disabled?: boolean;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.024,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.actionButtonPressable}
    >
      <Animated.View
        style={[
          styles.actionButton,
          tone === 'accent' ? styles.actionButtonAccent : styles.actionButtonMuted,
          disabled && styles.actionButtonDisabled,
          jelly.animatedStyle,
        ]}
      >
        <Feather
          color={tone === 'accent' ? theme.colors.white : theme.colors.textMuted}
          name={icon}
          size={14}
        />
        <Text style={[styles.actionButtonText, tone === 'accent' ? styles.actionButtonTextAccent : styles.actionButtonTextMuted]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function ManagedListingRow({
  event,
  editDisabled = false,
  editLabel = 'Edit',
  detailText,
  onEdit,
  onOpen,
}: {
  event: AppEvent;
  editDisabled?: boolean;
  editLabel?: string;
  detailText?: string | null;
  onEdit: () => void;
  onOpen: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.01,
    pressedScaleY: 0.97,
  });

  return (
    <View style={styles.managedListingRowShell}>
      <Pressable onPress={onOpen} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut} style={styles.managedListingRowPressable}>
        <Animated.View style={[styles.managedListingRow, jelly.animatedStyle]}>
          <Image source={event.image} contentFit="cover" style={styles.managedListingImage} transition={120} />
          <View style={styles.managedListingBody}>
            <Text numberOfLines={1} style={styles.managedListingTitle}>
              {event.title}
            </Text>
            <Text numberOfLines={1} style={styles.managedListingMeta}>
              {event.venue}  |  {event.day} {event.month}
            </Text>
            {detailText ? (
              <Text numberOfLines={1} style={styles.managedListingHint}>
                {detailText}
              </Text>
            ) : null}
          </View>
        </Animated.View>
      </Pressable>
      <View style={styles.managedListingAction}>
        <CompactActionButton
          icon={editDisabled ? 'clock' : 'settings'}
          label={editLabel}
          onPress={onEdit}
          tone="muted"
          disabled={editDisabled}
        />
      </View>
    </View>
  );
}

function HostedListingManagementRow({
  event,
  selected,
  selectionMode,
  onEdit,
  onOpen,
  onOpenVerifier,
  onTogglePayments,
  onToggleSelect,
}: {
  event: AppEvent;
  selected: boolean;
  selectionMode: boolean;
  onEdit: () => void;
  onOpen: () => void;
  onOpenVerifier: () => void;
  onTogglePayments: () => void;
  onToggleSelect: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.01,
    pressedScaleY: 0.97,
  });

  return (
    <View style={[styles.hostedListingRow, selected && styles.hostedListingRowSelected]}>
      <Pressable
        onPress={selectionMode ? onToggleSelect : onOpen}
        onPressIn={jelly.onPressIn}
        onPressOut={jelly.onPressOut}
        style={styles.hostedListingRowPressable}
      >
        <Animated.View style={[styles.hostedListingRowInner, jelly.animatedStyle]}>
          {selectionMode ? (
            <View style={[styles.hostedListingSelectCircle, selected && styles.hostedListingSelectCircleActive]}>
              <Feather
                color={selected ? theme.colors.white : theme.colors.textSoft}
                name={selected ? 'check' : 'circle'}
                size={14}
              />
            </View>
          ) : null}

          <Image source={event.image} contentFit="cover" style={styles.hostedListingImage} transition={120} />

          <View style={styles.hostedListingCopy}>
            <Text numberOfLines={1} style={styles.hostedListingTitle}>
              {event.title}
            </Text>
            <Text numberOfLines={1} style={styles.hostedListingMeta}>
              {event.venue}  |  {event.city}
            </Text>
            <Text numberOfLines={1} style={styles.hostedListingHint}>
              {formatEditWindowHint(event)}
            </Text>
            <Text numberOfLines={1} style={styles.hostedListingSales}>
              {event.ownerSoldCount ?? 0} sold | USD {event.ownerRevenueTotal ?? '0.00'}
            </Text>
          </View>
        </Animated.View>
      </Pressable>

      {!selectionMode ? (
        <View style={styles.hostedListingActions}>
          <CompactActionButton icon="external-link" label="Open" onPress={onOpen} tone="muted" />
          <CompactActionButton icon="grid" label="Verify" onPress={onOpenVerifier} tone="muted" />
          <CompactActionButton
            icon={event.acceptsInternalPayments ? 'zap' : 'x'}
            label={event.acceptsInternalPayments ? 'Pay on' : 'Pay off'}
            onPress={onTogglePayments}
            tone="muted"
          />
          <CompactActionButton
            icon={event.ownerCanEdit === false ? 'clock' : 'settings'}
            label={event.ownerCanEdit === false ? 'Locked' : 'Edit'}
            onPress={onEdit}
            tone="muted"
            disabled={event.ownerCanEdit === false}
          />
        </View>
      ) : null}
    </View>
  );
}

function SettingsActionRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: FeatherName;
  label: string;
  value: string;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.01,
    pressedScaleY: 0.97,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={[styles.settingsRow, styles.settingsRowPressable, jelly.animatedStyle]}>
        <View style={styles.settingsIcon}>
          <Feather color={theme.colors.accentStrong} name={icon} size={15} />
        </View>
        <Text style={styles.settingsLabel}>{label}</Text>
        <Text numberOfLines={1} style={styles.settingsValue}>
          {value}
        </Text>
        <Feather color={theme.colors.textSoft} name={'chevron-right' as FeatherName} size={13} />
      </Animated.View>
    </Pressable>
  );
}

function SettingsRow({
  icon,
  label,
  value,
}: {
  icon: FeatherName;
  label: string;
  value: string;
}) {
  return (
    <View style={styles.settingsRow}>
      <View style={styles.settingsIcon}>
        <Feather color={theme.colors.accentStrong} name={icon} size={15} />
      </View>
      <Text style={styles.settingsLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.settingsValue}>
        {value}
      </Text>
    </View>
  );
}

function MiniStatCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.miniStatCard}>
      <Text style={styles.miniStatValue}>{value}</Text>
      <Text style={styles.miniStatLabel}>{label}</Text>
    </View>
  );
}

function EmptyState({
  icon,
  title,
  copy,
  compact = false,
}: {
  icon: FeatherName;
  title: string;
  copy: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.emptyState, compact && styles.emptyStateCompact]}>
      <View style={styles.emptyStateIcon}>
        <Feather color={theme.colors.accentStrong} name={icon} size={16} />
      </View>
      <Text style={styles.emptyStateTitle}>{title}</Text>
      <Text style={styles.emptyStateCopy}>{copy}</Text>
    </View>
  );
}

function buildInitialDraft(categories: AppCategory[]): CreateDraft {
  const firstCategory = categories[0]?.id ?? '';

  return {
    artist: '',
    title: '',
    venue: '',
    city: '',
    categoryId: firstCategory,
    tagsText: '',
    heroImage: null,
    ticketImage: null,
    galleryMedia: [],
    scheduledAt: '',
    dateLabel: '',
    day: '',
    month: '',
    weekday: '',
    time: '',
    price: '',
    priceRange: '$$',
    blurb: '',
    about: '',
    highlightsText: '',
    address: '',
    locationLabel: '',
    locationNote: '',
    latitude: '',
    longitude: '',
    phone: '',
    email: '',
    website: '',
    tiktok: '',
    youtube: '',
    facebook: '',
    instagram: '',
    x: '',
    acceptsInternalPayments: true,
  };
}

function buildDraftFromEvent(event: AppEvent, categories: AppCategory[]): CreateDraft {
  const scheduled = buildScheduledAtFromEvent(event);

  return {
    artist: event.artist,
    title: event.title,
    venue: event.venue,
    city: event.city,
    categoryId: event.categories[0]?.id ?? categories[0]?.id ?? '',
    tagsText: '',
    heroImage: null,
    ticketImage: null,
    galleryMedia: [],
    scheduledAt: scheduled,
    dateLabel: event.dateLabel,
    day: event.day,
    month: event.month,
    weekday: event.weekday,
    time: event.time,
    price: event.price,
    priceRange: normalizePriceRange(event.price),
    blurb: event.blurb,
    about: event.about,
    highlightsText: event.highlights.join('\n'),
    address: event.location.address,
    locationLabel: event.location.label,
    locationNote: event.location.note,
    latitude: event.location.latitude ? String(event.location.latitude) : '',
    longitude: event.location.longitude ? String(event.location.longitude) : '',
    phone: event.contacts.find((contact) => contact.id === 'phone')?.url.replace(/^tel:/, '') ?? '',
    email: event.contacts.find((contact) => contact.id === 'mail')?.url.replace(/^mailto:/, '') ?? '',
    website: event.contacts.find((contact) => contact.id === 'web')?.url ?? '',
    tiktok: event.socials.find((social) => social.platform === 'tiktok')?.url ?? '',
    youtube: event.socials.find((social) => social.platform === 'youtube')?.url ?? '',
    facebook: event.socials.find((social) => social.platform === 'facebook')?.url ?? '',
    instagram: event.socials.find((social) => social.platform === 'instagram')?.url ?? '',
    x: event.socials.find((social) => social.platform === 'x')?.url ?? '',
    acceptsInternalPayments: event.acceptsInternalPayments,
  };
}

function validateRequiredStep(draft: CreateDraft, isEditing = false) {
  if (!draft.title.trim()) {
    return 'Add a listing title first.';
  }

  const hasPlace = Boolean(
    draft.venue.trim() ||
      draft.locationLabel.trim() ||
      draft.address.trim() ||
      (draft.latitude.trim() && draft.longitude.trim()),
  );

  if (!hasPlace) {
    return 'Add a venue or use your current location before moving on.';
  }

  if (!draft.categoryId) {
    return 'Pick a primary category.';
  }

  if (!isEditing && !draft.heroImage) {
    return 'Upload the hero image before publishing.';
  }

  return null;
}

function buildCreateInput(draft: CreateDraft, existingMedia: AppEvent['media'] = []): CreateAppEventInput {
  const title = draft.title.trim();
  const venue = draft.venue.trim() || draft.locationLabel.trim() || draft.address.trim() || title;
  const blurb = draft.blurb.trim();
  const about = draft.about.trim() || blurb || `${title} at ${venue}`;
  const website = normalizeUrl(draft.website);
  const scheduled = readScheduledDate(draft.scheduledAt);
  const scheduledParts = scheduled ? formatScheduleParts(scheduled) : null;
  const fallbackDateLabel = draft.dateLabel.trim() || 'Coming soon';
  const fallbackDay = draft.day.trim() || '--';
  const fallbackMonth = draft.month.trim() || '--';
  const fallbackWeekday = draft.weekday.trim() || 'Any day';
  const fallbackTime = draft.time.trim() || 'TBA';

  return {
    artist: categorySupportsArtist(draft.categoryId) ? draft.artist.trim() : '',
    title,
    venue,
    city: draft.city.trim(),
    dateLabel: scheduledParts?.dateLabel ?? fallbackDateLabel,
    day: scheduledParts?.day ?? fallbackDay,
    month: scheduledParts?.month ?? fallbackMonth,
    weekday: scheduledParts?.weekday ?? fallbackWeekday,
    time: scheduledParts?.time ?? fallbackTime,
    price: draft.price.trim() || draft.priceRange,
    priceRange: draft.priceRange,
    categoryId: draft.categoryId,
    blurb,
    about,
    highlights: splitLines(draft.highlightsText),
    tags: splitCommaList(draft.tagsText),
    address: draft.address.trim(),
    locationLabel: draft.locationLabel.trim() || 'Location',
    locationNote: draft.locationNote.trim(),
    latitude: parseOptionalNumber(draft.latitude),
    longitude: parseOptionalNumber(draft.longitude),
    phone: draft.phone.trim(),
    email: draft.email.trim(),
    website,
    heroImage: draft.heroImage,
    ticketImage: draft.ticketImage,
    galleryMedia: draft.galleryMedia,
    existingMedia,
    acceptsInternalPayments: draft.acceptsInternalPayments,
    socials: {
      tiktok: normalizeUrl(draft.tiktok),
      youtube: normalizeUrl(draft.youtube),
      facebook: normalizeUrl(draft.facebook),
      instagram: normalizeUrl(draft.instagram),
      x: normalizeUrl(draft.x),
    },
  };
}

function splitCommaList(value: string) {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildScheduledAtFromEvent(event: AppEvent) {
  const parsed = new Date(`${event.dateLabel} ${event.time}`);
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
}

function normalizePriceRange(value: string): PriceRange {
  if (value.includes('$$$$')) {
    return '$$$$';
  }
  if (value.includes('$$$')) {
    return '$$$';
  }
  if (value.includes('$$')) {
    return '$$';
  }
  return '$';
}

function categorySupportsArtist(categoryId: string) {
  return ['bars-lounges', 'chill-spots'].includes(categoryId);
}

function splitLines(value: string) {
  return value
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalNumber(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampCoordinatePrecision(parsed) : null;
}

function clampCoordinatePrecision(value: number) {
  return Number(value.toFixed(6));
}

function formatCoordinate(value: number) {
  return clampCoordinatePrecision(value).toFixed(6);
}

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

async function toLocalUploadImage(asset: ImagePicker.ImagePickerAsset, prefix: string): Promise<LocalUploadImage> {
  const extension = guessExtension(asset.mimeType);
  const webFile =
    typeof File !== 'undefined'
      ? ((asset as ImagePicker.ImagePickerAsset & { file?: File | null }).file ?? null)
      : null;
  const mimeType = asset.mimeType ?? 'image/jpeg';
  const isVideo = mimeType.startsWith('video/');
  const posterImage = isVideo ? await buildVideoPosterUpload(asset, prefix) : null;

  return {
    uri: asset.uri,
    name: asset.fileName ?? `${prefix}-${Date.now()}${extension}`,
    mimeType,
    webFile,
    previewUri: posterImage?.uri ?? null,
    fileSize: asset.fileSize ?? null,
    durationMs: asset.duration ?? null,
    posterImage,
  };
}

async function buildVideoPosterUpload(asset: ImagePicker.ImagePickerAsset, prefix: string) {
  try {
    const thumbnail = await VideoThumbnails.getThumbnailAsync(asset.uri, {
      time: Math.max(320, Math.min(asset.duration ?? 1200, 1600)),
    });

    return {
      uri: thumbnail.uri,
      name: `${prefix}-poster-${Date.now()}.jpg`,
      mimeType: 'image/jpeg',
      webFile: null,
    };
  } catch {
    return null;
  }
}

function guessExtension(mimeType?: string | null) {
  switch (mimeType) {
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    case 'video/mp4':
      return '.mp4';
    case 'video/quicktime':
      return '.mov';
    default:
      return '.jpg';
  }
}

function readScheduledDate(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatScheduleParts(value: Date) {
  return {
    dateLabel: value.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    day: value.toLocaleDateString(undefined, { day: '2-digit' }),
    month: value.toLocaleDateString(undefined, { month: 'short' }),
    weekday: value.toLocaleDateString(undefined, { weekday: 'long' }),
    time: value.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    }),
  };
}

function formatCreateSchedule(value: Date) {
  return `${value.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })} at ${value.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

function formatDetectedAddress(place: Location.LocationGeocodedAddress) {
  return [
    [place.streetNumber, place.street].filter(Boolean).join(' ').trim(),
    place.district ?? '',
    place.city ?? place.subregion ?? '',
    place.region ?? '',
  ]
    .filter(Boolean)
    .join(', ');
}

function notificationIconForType(type: AppNotification['type']): FeatherName {
  switch (type) {
    case 'ticket':
    case 'booking':
      return 'download';
    case 'event':
    case 'new_listing':
      return 'calendar';
    case 'rating':
      return 'star';
    case 'reply':
    case 'new_comment':
      return 'message-circle';
    default:
      return 'bell';
  }
}

function formatRelativeDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Just now';
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function formatTicketDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Recently';
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function formatCompactCount(value: number) {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(value >= 10000000 ? 0 : 1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}K`;
  }

  return String(value);
}

function formatEditWindowHint(event: AppEvent) {
  if (event.ownerCanEdit === false) {
    return 'Edit window closed';
  }

  if (!event.ownerEditExpiresAt) {
    return 'Editable now';
  }

  const expiresAt = new Date(event.ownerEditExpiresAt);
  if (Number.isNaN(expiresAt.getTime())) {
    return 'Editable now';
  }

  return `Edit until ${expiresAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${expiresAt.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

const styles = StyleSheet.create({
  sectionStack: {
    gap: 16,
  },
  sectionHeading: {
    gap: 4,
  },
  sectionHeadingTight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  inboxHeadingCopy: {
    flex: 1,
    gap: 4,
  },
  inboxReadAllPressable: {
    flexShrink: 0,
    marginTop: 5,
  },
  inboxReadAllButton: {
    minHeight: 30,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,107,61,0.34)',
    paddingHorizontal: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  inboxReadAllButtonDisabled: {
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  inboxReadAllText: {
    color: theme.colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  inboxReadAllTextDisabled: {
    color: theme.colors.textSoft,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sectionCopy: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  sectionCount: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  savedList: {
    gap: 12,
  },
  savedCard: {
    flexDirection: 'row',
    gap: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    padding: 12,
    ...shadow,
  },
  savedCardImage: {
    width: 92,
    height: 102,
    borderRadius: 14,
  },
  savedCardBody: {
    flex: 1,
    gap: 7,
  },
  savedCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  savedCardTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  savedPriceChip: {
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedPriceText: {
    color: theme.colors.paperInk,
    fontSize: 12,
    fontWeight: '800',
  },
  savedCardVenue: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  savedCardMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  savedCardFooter: {
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  savedCardTags: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  savedRatingPill: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  savedRatingText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  streamRoot: {
    flex: 1,
    marginTop: -8,
    marginHorizontal: -4,
    backgroundColor: '#05070B',
  },
  streamCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#05070B',
  },
  streamPoster: {
    ...StyleSheet.absoluteFillObject,
  },
  streamVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  streamShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.14)',
  },
  streamTapTarget: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  streamTopBar: {
    position: 'absolute',
    zIndex: 2,
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 14,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streamTitle: {
    color: theme.colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
  streamRoundAction: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(8,10,14,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  streamRoundActionActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(255,107,61,0.3)',
  },
  streamActions: {
    position: 'absolute',
    zIndex: 2,
    right: 12,
    bottom: 156,
    gap: 18,
    alignItems: 'center',
  },
  streamSideAction: {
    alignItems: 'center',
    gap: 6,
  },
  streamActionLabel: {
    color: theme.colors.white,
    fontSize: 11,
    fontWeight: '800',
  },
  streamCopy: {
    position: 'absolute',
    zIndex: 2,
    left: 16,
    right: 74,
    bottom: 116,
    gap: 7,
  },
  streamEventTitle: {
    color: theme.colors.white,
    fontSize: 24,
    fontWeight: '800',
  },
  streamEventMeta: {
    color: 'rgba(245,247,252,0.78)',
    fontSize: 13,
    fontWeight: '700',
  },
  streamEventBlurb: {
    color: 'rgba(245,247,252,0.74)',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  streamViewerRoot: {
    flex: 1,
    backgroundColor: '#05070B',
  },
  streamViewerHeader: {
    paddingHorizontal: 14,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  streamViewerCopy: {
    flex: 1,
    gap: 3,
  },
  streamViewerTitle: {
    color: theme.colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  streamViewerSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  streamViewerClose: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  streamViewerVideo: {
    flex: 1,
    backgroundColor: '#05070B',
  },
  streamEmpty: {
    flex: 1,
    marginHorizontal: -4,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  streamEmptyTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  streamEmptyCopy: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  notificationList: {
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  notificationCard: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 13,
  },
  notificationCardUnread: {
    borderBottomColor: 'rgba(255,107,61,0.24)',
  },
  notificationIcon: {
    width: 24,
    height: 24,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationBody: {
    flex: 1,
    gap: 5,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  notificationTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  notificationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accentStrong,
  },
  notificationMessage: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  notificationMeta: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  stepStrip: {
    flexDirection: 'row',
    gap: 8,
  },
  stepChip: {
    flex: 1,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  stepChipActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(255,107,61,0.24)',
  },
  stepChipIndex: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  stepChipIndexActive: {
    color: theme.colors.white,
  },
  stepChipText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  stepChipTextActive: {
    color: theme.colors.white,
  },
  formCard: {
    marginHorizontal: -4,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 14,
  },
  createComposerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  createComposerTopIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createComposerTopTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  createComposerStep: {
    gap: 16,
  },
  createComposerProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  createComposerAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  createComposerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  createComposerProfileText: {
    flex: 1,
    gap: 4,
  },
  createComposerProfileName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  createComposerProfileMeta: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  createComposerChipRow: {
    gap: 10,
    paddingRight: 6,
  },
  createComposerChip: {
    minHeight: 40,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  createComposerChipActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(255,107,61,0.22)',
  },
  createComposerChipText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  createComposerChipTextActive: {
    color: theme.colors.white,
  },
  createComposerTextArea: {
    minHeight: 250,
    gap: 10,
  },
  createComposerTitleInput: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '800',
    paddingVertical: 0,
  },
  createComposerVenueText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  createComposerStoryInput: {
    minHeight: 176,
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '500',
    paddingVertical: 0,
  },
  createComposerMediaTray: {
    flexDirection: 'row',
    gap: 12,
  },
  createMediaTrayPressable: {
    flex: 1,
  },
  createMediaTrayButton: {
    minHeight: 108,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  createMediaTrayLabel: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  createMediaTrayState: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  createComposerSelectedTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formStepStack: {
    gap: 12,
  },
  stepIntro: {
    gap: 4,
  },
  stepIntroTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  stepIntroCopy: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  dropdownGroup: {
    gap: 3,
  },
  dropdownGroupTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  dropdownGroupCopy: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 16,
  },
  fieldGroup: {
    gap: 7,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  fieldOptional: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  compactInput: {
    minHeight: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  compactInputMultiline: {
    minHeight: 88,
    paddingTop: 12,
    paddingBottom: 12,
  },
  utilityCard: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    gap: 12,
  },
  utilityCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  utilityTextWrap: {
    flex: 1,
    gap: 4,
  },
  utilityTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  utilityCopy: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  utilityButtonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerWrap: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: 10,
    gap: 10,
  },
  pickerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  dropdownTrigger: {
    minHeight: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dropdownTriggerText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  dropdownTriggerPlaceholder: {
    color: theme.colors.textSoft,
  },
  dropdownMenu: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(16,20,30,0.98)',
    overflow: 'hidden',
  },
  dropdownOptionRow: {
    minHeight: 46,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  dropdownOptionRowActive: {
    backgroundColor: 'rgba(255,107,61,0.09)',
  },
  dropdownOptionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dropdownOptionIcon: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: 'rgba(255,107,61,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownOptionIconActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  dropdownOptionText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  dropdownOptionTextActive: {
    color: theme.colors.white,
  },
  choiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  compactChip: {
    minHeight: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  compactChipActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(255,107,61,0.24)',
  },
  compactChipText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  compactChipTextActive: {
    color: theme.colors.white,
  },
  uploadRow: {
    flexDirection: 'row',
    gap: 8,
  },
  uploadCell: {
    flex: 1,
  },
  uploadTile: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 10,
    gap: 10,
  },
  uploadPreview: {
    width: '100%',
    height: 116,
    borderRadius: 9,
  },
  uploadVideoBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    minHeight: 24,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(8,10,14,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  uploadVideoBadgeText: {
    color: theme.colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  uploadEmpty: {
    width: '100%',
    height: 116,
    borderRadius: 9,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadCopy: {
    gap: 3,
  },
  uploadTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  uploadHint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  galleryHelperText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  galleryPickerShell: {
    gap: 10,
  },
  galleryAddPressable: {
    alignSelf: 'stretch',
  },
  galleryAddTile: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  galleryAddTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  galleryAddHint: {
    marginLeft: 'auto',
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  galleryMediaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  galleryMediaCard: {
    width: 88,
    gap: 6,
    position: 'relative',
  },
  galleryMediaPreview: {
    width: 88,
    height: 88,
    borderRadius: 14,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  galleryMediaVideoPreview: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryMediaVideoBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(8,10,14,0.82)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryRemoveButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(8,10,14,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  galleryMediaName: {
    color: theme.colors.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  galleryExistingBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(8,10,14,0.82)',
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  galleryExistingBadgeText: {
    color: theme.colors.white,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  progressCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(255,107,61,0.24)',
    backgroundColor: 'rgba(255,107,61,0.08)',
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 9,
  },
  progressCopyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  progressTitle: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  progressValue: {
    color: theme.colors.accentStrong,
    fontSize: 12,
    fontWeight: '800',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: theme.colors.accentStrong,
  },
  progressHint: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  rowCell: {
    flex: 1,
  },
  priceRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  priceOptionPressable: {
    minWidth: 42,
  },
  priceOption: {
    minHeight: 34,
    paddingHorizontal: 11,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceOptionActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(255,107,61,0.24)',
  },
  priceOptionText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '800',
  },
  priceOptionTextActive: {
    color: theme.colors.white,
  },
  socialGrid: {
    gap: 10,
  },
  inlineError: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,107,61,0.2)',
    backgroundColor: 'rgba(255,107,61,0.09)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineErrorText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 17,
  },
  inlineSuccess: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(139,226,139,0.24)',
    backgroundColor: 'rgba(139,226,139,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineSuccessText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 17,
  },
  formActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    rowGap: 8,
    gap: 10,
  },
  formActionRight: {
    flexDirection: 'row',
    flex: 1,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    rowGap: 8,
    gap: 8,
  },
  actionSpacer: {
    flex: 1,
  },
  actionButtonPressable: {
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
  },
  actionButton: {
    minHeight: 38,
    borderRadius: 7,
    paddingHorizontal: 12,
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionButtonAccent: {
    backgroundColor: theme.colors.accent,
  },
  actionButtonMuted: {
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '800',
  },
  actionButtonTextAccent: {
    color: theme.colors.white,
  },
  actionButtonTextMuted: {
    color: theme.colors.textMuted,
  },
  profileCard: {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 12,
    gap: 12,
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  profileAvatarImage: {
    width: '100%',
    height: '100%',
  },
  profileText: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  profileMeta: {
    color: theme.colors.textMuted,
    fontSize: 12,
  },
  profileStatsRow: {
    flexDirection: 'row',
    gap: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  profileActionRow: {
    paddingTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  profilePanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    gap: 10,
  },
  profilePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  profilePanelTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  profileEditorTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  profileEditorAvatar: {
    width: 54,
    height: 54,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  profileEditorHint: {
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  profilePanelActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  miniStatCard: {
    flex: 1,
    borderRadius: 0,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  miniStatValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  miniStatLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  profileSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
    gap: 8,
  },
  hostingSummaryCard: {
    flexDirection: 'row',
    gap: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  hostedPageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hostedPageTitleWrap: {
    flex: 1,
    gap: 3,
  },
  hostedPageTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  hostedPageHint: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hostedSearchShell: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hostedSearchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
    paddingVertical: 0,
  },
  hostedToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    flexWrap: 'wrap',
  },
  hostedToolbarMeta: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  hostedToolbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  hostedManagerList: {
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  compactSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  compactSectionCopy: {
    flex: 1,
    gap: 3,
  },
  compactSectionTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  compactSectionHint: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ticketManagementList: {
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  ticketManagementRow: {
    borderRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 12,
    gap: 8,
  },
  ticketManagementTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  ticketManagementCopy: {
    flex: 1,
    gap: 4,
  },
  ticketManagementTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  ticketManagementSubtitle: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  ticketManagementMeta: {
    color: theme.colors.textSoft,
    fontSize: 11,
    lineHeight: 15,
  },
  ticketManagementActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  ticketStatusPill: {
    minHeight: 24,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: 'rgba(88,195,132,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(88,195,132,0.26)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketStatusPillUsed: {
    backgroundColor: 'rgba(255,184,77,0.14)',
    borderColor: 'rgba(255,184,77,0.26)',
  },
  ticketStatusPillCancelled: {
    backgroundColor: 'rgba(255,107,61,0.14)',
    borderColor: 'rgba(255,107,61,0.26)',
  },
  ticketStatusText: {
    color: '#8BE28B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  ticketStatusTextUsed: {
    color: '#FFCF76',
  },
  ticketStatusTextCancelled: {
    color: theme.colors.accentStrong,
  },
  ticketRail: {
    gap: 10,
    paddingRight: 10,
  },
  managedListingStack: {
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  managedListingRowShell: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  managedListingRowPressable: {
    flex: 1,
  },
  managedListingRow: {
    borderRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  managedListingImage: {
    width: 54,
    height: 54,
    borderRadius: 9,
    backgroundColor: theme.colors.surfaceMuted,
  },
  managedListingBody: {
    flex: 1,
    gap: 4,
  },
  managedListingAction: {
    justifyContent: 'center',
  },
  managedListingTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  managedListingMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  managedListingHint: {
    color: theme.colors.textSoft,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  hostedListingRow: {
    borderRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 10,
    gap: 8,
  },
  hostedListingRowSelected: {
    borderBottomColor: 'rgba(255,107,61,0.34)',
    backgroundColor: 'transparent',
  },
  hostedListingRowPressable: {
    alignSelf: 'stretch',
  },
  hostedListingRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  hostedListingSelectCircle: {
    width: 24,
    height: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostedListingSelectCircleActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(255,107,61,0.34)',
  },
  hostedListingImage: {
    width: 58,
    height: 58,
    borderRadius: 13,
    backgroundColor: theme.colors.surfaceMuted,
  },
  hostedListingCopy: {
    flex: 1,
    gap: 4,
  },
  hostedListingTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  hostedListingMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  hostedListingHint: {
    color: theme.colors.textSoft,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  hostedListingSales: {
    color: theme.colors.accentStrong,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '800',
  },
  hostedListingActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  verifyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,7,13,0.68)',
    justifyContent: 'flex-end',
  },
  verifySheet: {
    backgroundColor: 'rgba(12,15,23,0.98)',
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 16,
    gap: 14,
    ...shadow,
  },
  verifyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  verifyHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  verifyEyebrow: {
    color: theme.colors.accentStrong,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  verifyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  verifyCameraFrame: {
    height: 240,
    overflow: 'hidden',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
  },
  verifyCameraPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 18,
  },
  verifyPlaceholderText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  verifyActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  verifyManualBox: {
    borderTopWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingTop: 12,
    gap: 10,
  },
  verifyLabel: {
    color: theme.colors.textSoft,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  verifyInputLine: {
    minHeight: 44,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  verifyInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
    paddingVertical: 0,
  },
  verifyResult: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
  },
  ticketCard: {
    width: 188,
    height: 112,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceStrong,
  },
  ticketCardImage: {
    ...StyleSheet.absoluteFillObject,
  },
  ticketCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,10,14,0.42)',
  },
  ticketCardContent: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
    gap: 3,
  },
  ticketCardTitle: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  ticketCardMeta: {
    color: '#D0D6E2',
    fontSize: 11,
    fontWeight: '600',
  },
  settingsStack: {
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(8,10,14,0.76)',
    paddingHorizontal: 6,
    paddingBottom: 16,
    alignItems: 'center',
  },
  modalShell: {
    flex: 1,
    width: '100%',
    maxWidth: 560,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#111621',
    paddingHorizontal: 14,
    paddingTop: 14,
    ...shadow,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingBottom: 10,
  },
  modalTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  modalScrollContent: {
    paddingBottom: 20,
    gap: 12,
  },
  modalStack: {
    gap: 12,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  aboutPanel: {
    gap: 14,
  },
  aboutHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingBottom: 14,
  },
  aboutLogo: {
    width: 58,
    height: 58,
  },
  aboutHeroCopy: {
    flex: 1,
    gap: 3,
  },
  aboutTitle: {
    color: theme.colors.text,
    fontSize: 19,
    fontWeight: '900',
  },
  aboutMadeBy: {
    color: theme.colors.accentStrong,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  aboutBody: {
    color: theme.colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
  aboutLines: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  aboutLineItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 12,
  },
  aboutLineText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  aboutFooter: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
  },
  notificationPrefCard: {
    borderRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 12,
    gap: 10,
  },
  notificationPrefCopy: {
    gap: 4,
  },
  notificationPrefTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  notificationPrefDescription: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  historyList: {
    gap: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  historyRowPressable: {
    flex: 1,
  },
  historyRowCard: {
    borderRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyRowImage: {
    width: 48,
    height: 48,
    borderRadius: 11,
    backgroundColor: theme.colors.surfaceMuted,
  },
  historyRowCopy: {
    flex: 1,
    gap: 4,
  },
  historyRowTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  historyRowMeta: {
    color: theme.colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },
  categoryShortcutWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  settingsRow: {
    minHeight: 52,
    borderRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'transparent',
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsRowPressable: {
    paddingRight: 8,
  },
  settingsIcon: {
    width: 22,
    height: 22,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  settingsValue: {
    color: theme.colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
    padding: 18,
    alignItems: 'center',
    gap: 8,
  },
  emptyStateCompact: {
    paddingVertical: 16,
  },
  emptyStateIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,61,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  emptyStateCopy: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});
