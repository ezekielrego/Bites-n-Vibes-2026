import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { APP_VERSION } from '../constants';
import { shadow, theme } from '../theme';
import {
  AppCategory,
  AppEvent,
  AppNotification,
  AppUser,
  CreateAppEventInput,
  LocalUploadImage,
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

export function InboxTabView({
  notifications,
  unreadCount,
  onMarkAllRead,
  onOpenNotification,
}: {
  notifications: AppNotification[];
  unreadCount: number;
  onMarkAllRead: () => void;
  onOpenNotification: (notification: AppNotification) => void;
}) {
  return (
    <View style={styles.sectionStack}>
      <View style={[styles.sectionHeading, styles.sectionHeadingTight]}>
        <View>
          <Text style={styles.sectionTitle}>Inbox</Text>
          <Text style={styles.sectionCopy}>Tickets, booking moves, and event nudges land here.</Text>
        </View>

        <CompactActionButton
          label={unreadCount > 0 ? `Read all (${unreadCount})` : 'All caught up'}
          icon="check"
          disabled={unreadCount === 0}
          onPress={onMarkAllRead}
          tone="muted"
        />
      </View>

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

export function CreateTabView({
  categories,
  isSubmitting,
  submitProgress,
  submitStage,
  submitError,
  onSubmit,
}: {
  categories: AppCategory[];
  isSubmitting: boolean;
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
  useEffect(() => {
    if (selectableCategories.length === 0) {
      return;
    }

    setDraft((current) => {
      if (current.categoryId && current.categoryId !== 'all') {
        return current;
      }

      return {
        ...current,
        categoryId: selectableCategories[0]?.id ?? '',
      };
    });
  }, [selectableCategories]);

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
    }));
  };

  const toggleTagSelection = (tagLabel: string) => {
    const nextTags = selectedTags.includes(tagLabel)
      ? selectedTags.filter((tag) => tag !== tagLabel)
      : [...selectedTags, tagLabel];

    setField('tagsText', nextTags.join(', '));
  };

  const handlePickImage = async (field: 'heroImage' | 'ticketImage') => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Photos needed', 'Allow photo access so you can upload listing images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.92,
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    setField(field, toLocalUploadImage(result.assets[0], field === 'heroImage' ? 'hero' : 'ticket'));
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
    });

    if (result.canceled || result.assets.length === 0) {
      return;
    }

    const nextItems = result.assets
      .slice(0, remaining)
      .map((asset, index) => toLocalUploadImage(asset, `gallery-${Date.now()}-${index}`));

    setField('galleryMedia', [...draft.galleryMedia, ...nextItems].slice(0, MAX_CREATE_GALLERY_MEDIA));
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

      const latitude = String(position.coords.latitude);
      const longitude = String(position.coords.longitude);
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

  const handleNext = () => {
    const validation = validateRequiredStep(draft);
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
    const validation = validateRequiredStep(draft);
    if (validation) {
      setLocalError(validation);
      setStep(0);
      return;
    }

    setLocalError(null);

    try {
      await onSubmit(buildCreateInput(draft));
      setDraft(buildInitialDraft(selectableCategories));
      setStep(0);
    } catch (error) {
      return;
    }
  };

  return (
    <View style={styles.sectionStack}>
      <View style={styles.sectionHeading}>
        <View>
          <Text style={styles.sectionTitle}>Create</Text>
          <Text style={styles.sectionCopy}>Start with the essentials, then add the extras when you are ready.</Text>
        </View>
      </View>

      <StepStrip currentStep={step} />

      <View style={styles.formCard}>
        {step === 0 ? (
          <View style={styles.formStepStack}>
            <StepIntro
              title="Basics and images"
              copy="Collect the name, tags, and artwork first. Hero art is required, and you can add more gallery images or a video for the details slider."
            />

            <CompactField
              label="Listing title"
              placeholder="Late Night Brunch"
              value={draft.title}
              onChangeText={(value) => setField('title', value)}
            />
            <CompactField
              label="Artist or host"
              placeholder="DJ Nova"
              value={draft.artist}
              onChangeText={(value) => setField('artist', value)}
              optional
            />
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
            <View style={styles.row}>
              <View style={styles.rowCell}>
                <CompactField
                  label="Price"
                  placeholder="$18"
                  value={draft.price}
                  onChangeText={(value) => setField('price', value)}
                  optional
                />
              </View>
              <View style={styles.rowCell}>
                <FieldLabel label="Price range" optional />
                <View style={styles.priceRangeRow}>
                  {PRICE_RANGE_OPTIONS.map((option) => (
                    <CompactChoicePill
                      key={option}
                      active={draft.priceRange === option}
                      label={option}
                      onPress={() => setField('priceRange', option)}
                    />
                  ))}
                </View>
              </View>
            </View>

            <SingleSelectDropdown
              label="Primary category"
              options={categoryOptions}
              placeholder="Choose a category"
              selectedValue={draft.categoryId}
              selectedLabel={selectedCategoryOption?.label}
              onSelect={handlePrimaryCategorySelect}
            />

            <MultiSelectDropdown
              label="Tags"
              options={CREATE_TAG_OPTIONS}
              placeholder="Select tags"
              selectedValues={selectedTags}
              onToggle={toggleTagSelection}
            />

            <View style={styles.uploadRow}>
              <UploadTile
                label="Hero image"
                hint="Required"
                image={draft.heroImage}
                onPress={() => void handlePickImage('heroImage')}
              />
              <UploadTile
                label="Ticket image"
                hint="Optional"
                image={draft.ticketImage}
                onPress={() => void handlePickImage('ticketImage')}
              />
            </View>

            <GalleryMediaPicker
              items={draft.galleryMedia}
              maxItems={MAX_CREATE_GALLERY_MEDIA}
              onAdd={() => void handlePickGalleryMedia()}
              onRemove={handleRemoveGalleryMedia}
            />
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
                    ? `${submitStage} ${Math.max(1, Math.round(submitProgress * 100))}%`
                    : 'Publishing...'
                  : step === 2
                    ? 'Publish'
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
  historyEvents,
  myListings,
  onSignOut,
  profile,
  savedEvents,
  unreadCount,
  onSelectEvent,
}: {
  historyEvents: AppEvent[];
  myListings: AppEvent[];
  onSignOut: () => void;
  profile: AppUser | null;
  savedEvents: AppEvent[];
  unreadCount: number;
  onSelectEvent: (event: AppEvent) => void;
}) {
  const savedTickets = savedEvents.slice(0, 4);
  const recentViews = historyEvents.slice(0, 6);

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
          <MiniStatCard label="Alerts" value={String(unreadCount)} />
        </View>

        <View style={styles.profileActionRow}>
          <CompactActionButton icon="log-out" label="Sign out" onPress={onSignOut} tone="muted" />
        </View>
      </View>

      <View style={styles.profileSection}>
        <View style={styles.compactSectionHeader}>
          <Text style={styles.compactSectionTitle}>Saved tickets</Text>
          <Text style={styles.compactSectionHint}>Quick access</Text>
        </View>

        {savedTickets.length === 0 ? (
          <EmptyState
            icon="download"
            title="No tickets saved yet"
            copy="Once you save a place or event, its ticket art can live here."
            compact
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ticketRail}>
            {savedTickets.map((event) => (
              <PressableTicketCard key={event.id} event={event} onPress={() => onSelectEvent(event)} />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.profileSection}>
        <View style={styles.compactSectionHeader}>
          <Text style={styles.compactSectionTitle}>Recently viewed</Text>
          <Text style={styles.compactSectionHint}>History</Text>
        </View>

        {recentViews.length === 0 ? (
          <EmptyState
            icon="clock"
            title="No recent views yet"
            copy="Open a few listings and your view history will settle here."
            compact
          />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ticketRail}>
            {recentViews.map((event) => (
              <PressableTicketCard key={`history-${event.id}`} event={event} onPress={() => onSelectEvent(event)} />
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.profileSection}>
        <View style={styles.compactSectionHeader}>
          <Text style={styles.compactSectionTitle}>Settings</Text>
          <Text style={styles.compactSectionHint}>Tighter controls</Text>
        </View>

        <View style={styles.settingsStack}>
          <SettingsRow
            icon="bell"
            label="Notifications"
            value={profile?.pushNotificationsEnabled ? 'Push on' : 'Push off'}
          />
          <SettingsRow icon="heart" label="Saved places" value={`${savedEvents.length}`} />
          <SettingsRow icon="grid" label="Hosted listings" value={`${myListings.length}`} />
          <SettingsRow icon="mail" label="Email updates" value={profile?.emailNotificationsEnabled ? 'On' : 'Off'} />
          <SettingsRow icon="user" label="Account" value={profile?.phone ?? 'No phone yet'} />
          <SettingsRow icon="info" label="About app" value="Bites & Vibes" />
          <SettingsRow icon="settings" label="Version" value={`v${APP_VERSION}`} />
        </View>
      </View>
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  optional?: boolean;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
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
  onPress,
}: {
  label: string;
  hint: string;
  image: LocalUploadImage | null;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.018,
    pressedScaleY: 0.962,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut} style={styles.uploadCell}>
      <Animated.View style={[styles.uploadTile, jelly.animatedStyle]}>
        {image ? (
          <Image source={image.uri} contentFit="cover" style={styles.uploadPreview} transition={120} />
        ) : (
          <View style={styles.uploadEmpty}>
            <Feather color={theme.colors.accentStrong} name={'plus-circle' as FeatherName} size={18} />
          </View>
        )}

        <View style={styles.uploadCopy}>
          <Text style={styles.uploadTitle}>{label}</Text>
          <Text style={styles.uploadHint}>{image ? image.name : hint}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function GalleryMediaPicker({
  items,
  maxItems,
  onAdd,
  onRemove,
}: {
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
              {items.length}/{maxItems} selected
            </Text>
          </View>
        </Pressable>

        {items.length > 0 ? (
          <View style={styles.galleryMediaGrid}>
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

  return (
    <View style={styles.galleryMediaCard}>
      {isVideo ? (
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

function CompactChoicePill({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.024,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut} style={styles.priceOptionPressable}>
      <Animated.View style={[styles.priceOption, active && styles.priceOptionActive, jelly.animatedStyle]}>
        <Text style={[styles.priceOptionText, active && styles.priceOptionTextActive]}>{label}</Text>
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
  };
}

function validateRequiredStep(draft: CreateDraft) {
  if (!draft.title.trim()) {
    return 'Add a listing title first.';
  }

  if (!draft.venue.trim()) {
    return 'Add the venue name before moving on.';
  }

  if (!draft.categoryId) {
    return 'Pick a primary category.';
  }

  if (!draft.heroImage) {
    return 'Upload the hero image before publishing.';
  }

  return null;
}

function buildCreateInput(draft: CreateDraft): CreateAppEventInput {
  const title = draft.title.trim();
  const venue = draft.venue.trim();
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
    artist: draft.artist.trim(),
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
    heroImage: draft.heroImage as LocalUploadImage,
    ticketImage: draft.ticketImage,
    galleryMedia: draft.galleryMedia,
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
  return Number.isFinite(parsed) ? parsed : null;
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

function toLocalUploadImage(asset: ImagePicker.ImagePickerAsset, prefix: string): LocalUploadImage {
  const extension = guessExtension(asset.mimeType);
  const webFile =
    typeof File !== 'undefined'
      ? ((asset as ImagePicker.ImagePickerAsset & { file?: File | null }).file ?? null)
      : null;

  return {
    uri: asset.uri,
    name: asset.fileName ?? `${prefix}-${Date.now()}${extension}`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    webFile,
  };
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

const styles = StyleSheet.create({
  sectionStack: {
    gap: 16,
  },
  sectionHeading: {
    gap: 4,
  },
  sectionHeadingTight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  notificationList: {
    gap: 10,
  },
  notificationCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    padding: 12,
  },
  notificationCardUnread: {
    backgroundColor: 'rgba(255,107,61,0.07)',
    borderColor: 'rgba(255,107,61,0.18)',
  },
  notificationIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,107,61,0.12)',
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    padding: 14,
    gap: 14,
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
    borderRadius: 14,
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
    borderRadius: 16,
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
    borderRadius: 14,
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
    borderRadius: 16,
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
    borderRadius: 12,
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
    gap: 10,
  },
  uploadCell: {
    flex: 1,
  },
  uploadTile: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 10,
    gap: 10,
  },
  uploadPreview: {
    width: '100%',
    height: 116,
    borderRadius: 12,
  },
  uploadEmpty: {
    width: '100%',
    height: 116,
    borderRadius: 12,
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
    borderRadius: 16,
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
  formActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  formActionRight: {
    flexDirection: 'row',
    gap: 8,
  },
  actionSpacer: {
    flex: 1,
  },
  actionButtonPressable: {
    alignSelf: 'flex-start',
  },
  actionButton: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
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
    fontSize: 13,
    fontWeight: '800',
  },
  actionButtonTextAccent: {
    color: theme.colors.white,
  },
  actionButtonTextMuted: {
    color: theme.colors.textMuted,
  },
  profileCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceStrong,
    padding: 14,
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
    gap: 8,
  },
  profileActionRow: {
    paddingTop: 2,
    alignItems: 'flex-start',
  },
  miniStatCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
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
    gap: 10,
  },
  compactSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  compactSectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  compactSectionHint: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ticketRail: {
    gap: 10,
    paddingRight: 10,
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
    gap: 8,
  },
  settingsRow: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingsIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: 'rgba(255,107,61,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  settingsValue: {
    color: theme.colors.textMuted,
    fontSize: 12,
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
