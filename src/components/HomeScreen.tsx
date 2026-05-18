import React, { useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  FlatListProps,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  NativeScrollEvent,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_VERSION, TAB_ITEMS } from '../constants';
import { theme, shadow } from '../theme';
import {
  AppCategory,
  AppEvent,
  AppNotification,
  AppUser,
  CategoryId,
  CreateAppEventInput,
  TabId,
} from '../types';
import {
  CategoryPill,
  IconButton,
  ScreenTransition,
  SectionHeader,
  useJellyPressAnimation,
} from './Primitives';
import { CreateTabView, InboxTabView, ProfileTabView, SavedTabView } from './SecondaryTabViews';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
const APP_LOGO = require('../../logo.png');
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList) as React.ComponentType<
  FlatListProps<AppEvent>
>;

const SEARCH_HINTS = [
  'Search events',
  'Search artists',
  'Search venues',
  'Search nightlife',
];
const FLOATING_SEARCH_THRESHOLD = 86;
const FLOATING_HEADER_HEIGHT = 50;
const FLOATING_HEADER_GAP = 14;

export function HomeScreen({
  activeTab,
  categories,
  createPending,
  createProgress,
  createStage,
  createError,
  events,
  historyEvents,
  myListings,
  notifications,
  unreadNotificationCount,
  profile,
  onSelectEvent,
  onTabChange,
  onToggleSave,
  onOpenNotification,
  onMarkAllRead,
  onCreateEvent,
  onSignOut,
  tabDirection,
}: {
  activeTab: TabId;
  categories: AppCategory[];
  createPending: boolean;
  createProgress: number;
  createStage: string | null;
  createError: string | null;
  events: AppEvent[];
  historyEvents: AppEvent[];
  myListings: AppEvent[];
  notifications: AppNotification[];
  unreadNotificationCount: number;
  profile: AppUser | null;
  onSelectEvent: (event: AppEvent) => void;
  onTabChange: (tab: TabId) => void;
  onToggleSave: (event: AppEvent) => void;
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
  onCreateEvent: (input: CreateAppEventInput) => Promise<void>;
  onSignOut: () => void;
  tabDirection: 1 | -1;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [floatingSearchVisible, setFloatingSearchVisible] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchInputRef = useRef<TextInput>(null);
  const floatingSearchInputRef = useRef<TextInput>(null);
  const pendingSearchFocus = useRef(false);
  const searchFocusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floatingSearchVisibleRef = useRef(false);
  const menuTranslate = useRef(new Animated.Value(-Math.min(width * 0.76, 320))).current;
  const menuOverlayOpacity = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const drawerWidth = Math.min(width * 0.76, 320);
    const target = menuOpen ? 0 : -drawerWidth;

    Animated.parallel([
      Animated.spring(menuTranslate, {
        toValue: target,
        stiffness: 210,
        damping: 24,
        mass: 0.92,
        useNativeDriver: true,
      }),
      Animated.timing(menuOverlayOpacity, {
        toValue: menuOpen ? 1 : 0,
        duration: menuOpen ? 180 : 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [menuOpen, menuOverlayOpacity, menuTranslate, width]);

  useEffect(() => {
    setMenuOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (categories.length === 0) {
      return;
    }

    const categoryExists = categories.some((category) => category.id === activeCategory);
    if (!categoryExists) {
      setActiveCategory(categories[0].id);
    }
  }, [activeCategory, categories]);

  useEffect(() => {
    if (!pendingSearchFocus.current || menuOpen || activeTab !== 'discover') {
      return;
    }

    if (searchFocusTimeout.current) {
      clearTimeout(searchFocusTimeout.current);
    }

    searchFocusTimeout.current = setTimeout(() => {
      if (floatingSearchVisibleRef.current) {
        floatingSearchInputRef.current?.focus();
      } else {
        searchInputRef.current?.focus();
      }
      pendingSearchFocus.current = false;
      searchFocusTimeout.current = null;
    }, 260);

    return () => {
      if (searchFocusTimeout.current) {
        clearTimeout(searchFocusTimeout.current);
        searchFocusTimeout.current = null;
      }
    };
  }, [activeTab, menuOpen]);

  useEffect(() => {
    return () => {
      if (searchFocusTimeout.current) {
        clearTimeout(searchFocusTimeout.current);
      }
    };
  }, []);

  const handleDrawerSearchPress = () => {
    pendingSearchFocus.current = true;
    setMenuOpen(false);

    if (activeTab !== 'discover') {
      onTabChange('discover');
    }
  };

  const query = deferredSearchQuery.trim().toLowerCase();
  const filteredEvents = events.filter((event) => {
    const matchesCategory =
      activeCategory === 'all' || event.categories.some((category) => category.id === activeCategory);
    const matchesQuery =
      query.length === 0 ||
      [event.artist, event.title, event.city, event.venue].some((value) =>
        value.toLowerCase().includes(query),
      );

    return matchesCategory && matchesQuery;
  });

  const spotlightEvent = filteredEvents[0] ?? events[0];
  const savedEvents = events.filter((event) => event.isSaved);
  const discoverContentPadding: StyleProp<ViewStyle> = [
    styles.content,
    {
      paddingTop: insets.top + FLOATING_HEADER_HEIGHT + FLOATING_HEADER_GAP,
      paddingBottom: insets.bottom + 110,
    },
  ];
  const contentPadding: StyleProp<ViewStyle> = [
    styles.content,
    { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 110 },
  ];
  const floatingSearchProgress = scrollY.interpolate({
    inputRange: [0, FLOATING_SEARCH_THRESHOLD * 0.45, FLOATING_SEARCH_THRESHOLD],
    outputRange: [0, 0.35, 1],
    extrapolate: 'clamp',
  });

  const handleDiscoverScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextVisible = event.nativeEvent.contentOffset.y >= FLOATING_SEARCH_THRESHOLD;
    if (nextVisible !== floatingSearchVisibleRef.current) {
      floatingSearchVisibleRef.current = nextVisible;
      setFloatingSearchVisible(nextVisible);
    }
  };

  const content =
    activeTab !== 'discover' ? (
      <SecondaryTabContent
        activeTab={activeTab}
        categories={categories}
        contentPadding={contentPadding}
        createError={createError}
        createPending={createPending}
        createProgress={createProgress}
        createStage={createStage}
        historyEvents={historyEvents}
        menuOpen={menuOpen}
        myListings={myListings}
        notifications={notifications}
        onCreateEvent={onCreateEvent}
        onMarkAllRead={onMarkAllRead}
        onOpenNotification={onOpenNotification}
        onSelectEvent={onSelectEvent}
        onSignOut={onSignOut}
        onToggleMenu={() => setMenuOpen((current) => !current)}
        onToggleSave={onToggleSave}
        profile={profile}
        savedEvents={savedEvents}
        unreadNotificationCount={unreadNotificationCount}
      />
    ) : (
      <AnimatedFlatList
        data={filteredEvents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={discoverContentPadding}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: handleDiscoverScroll,
          },
        )}
        scrollEventThrottle={16}
        updateCellsBatchingPeriod={48}
        windowSize={5}
        removeClippedSubviews
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No events match that filter yet</Text>
            <Text style={styles.emptyDescription}>Try a shorter search or switch back to another category.</Text>
          </View>
        }
        ListHeaderComponent={
          <>
            <SearchShell
              inputRef={searchInputRef}
              isFocused={isSearchFocused}
              query={searchQuery}
              onBlur={() => setIsSearchFocused(false)}
              onChangeText={setSearchQuery}
              onFocus={() => setIsSearchFocused(true)}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              {categories.map((category) => (
                <CategoryPill
                  key={category.id}
                  active={category.id === activeCategory}
                  category={category}
                  onPress={() => setActiveCategory(category.id)}
                />
              ))}
            </ScrollView>

            {spotlightEvent ? (
              <LinearGradient
                colors={['rgba(255,107,61,0.24)', 'rgba(40,48,70,0.95)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.spotlightCard}
              >
                <View style={styles.spotlightBody}>
                  <View style={styles.spotlightBadge}>
                    <View style={styles.spotlightDot} />
                    <Text style={styles.spotlightBadgeText}>Spotlight</Text>
                  </View>
                  <Text style={styles.spotlightTitle}>{spotlightEvent.artist}</Text>
                  <Text style={styles.spotlightCopy} numberOfLines={2}>
                    {spotlightEvent.blurb}
                  </Text>
                  <View style={styles.spotlightMeta}>
                    <Text style={styles.spotlightPrice}>{spotlightEvent.price}</Text>
                    <Text style={styles.spotlightMetaText}>
                      {spotlightEvent.day} {spotlightEvent.month}
                    </Text>
                  </View>
                </View>
                <Image
                  source={spotlightEvent.ticketImage ?? spotlightEvent.image}
                  contentFit="cover"
                  style={styles.spotlightImage}
                  transition={200}
                />
              </LinearGradient>
            ) : null}

            <SectionHeader title="Upcoming events" actionLabel="See all" />
          </>
        }
        renderItem={({ item }) => (
          <EventCard event={item} onPress={() => onSelectEvent(item)} onToggleSave={() => onToggleSave(item)} />
        )}
      />
    );

  return (
    <View style={styles.root}>
      <ScreenTransition key={activeTab} direction={tabDirection} distance={42}>
        {content}
      </ScreenTransition>

      {activeTab === 'discover' ? (
      <DiscoverFloatingHeaderLayer
        floatingSearchProgress={floatingSearchProgress}
        floatingSearchVisible={floatingSearchVisible}
        inputRef={floatingSearchInputRef}
        isFocused={isSearchFocused}
        menuOpen={menuOpen}
        profile={profile}
        query={searchQuery}
        safeTop={insets.top}
        onBlur={() => setIsSearchFocused(false)}
        onChangeText={setSearchQuery}
        onFocus={() => setIsSearchFocused(true)}
        onToggleMenu={() => setMenuOpen((current) => !current)}
      />
      ) : null}

      <DrawerMenu
        activeTab={activeTab}
        menuOpen={menuOpen}
        onClose={() => setMenuOpen(false)}
        profile={profile}
        onSearchPress={handleDrawerSearchPress}
        onTabChange={onTabChange}
        overlayOpacity={menuOverlayOpacity}
        translateX={menuTranslate}
        width={Math.min(width * 0.76, 320)}
      />
    </View>
  );
}

function SearchShell({
  inputRef,
  isFocused,
  query,
  onBlur,
  onChangeText,
  onFocus,
  style,
}: {
  inputRef: React.RefObject<TextInput | null>;
  isFocused: boolean;
  query: string;
  onBlur: () => void;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.searchShell, style]}>
      <Feather color={theme.colors.textMuted} name={'search' as FeatherName} size={18} />
      <View style={styles.searchInputWrap}>
        {!query && !isFocused ? <JellySearchPlaceholder phrases={SEARCH_HINTS} /> : null}
        <TextInput
          placeholder=""
          ref={inputRef}
          style={styles.searchInput}
          value={query}
          onBlur={onBlur}
          onChangeText={onChangeText}
          onFocus={onFocus}
        />
      </View>
      <View style={styles.searchDivider} />
      <Feather color={theme.colors.textMuted} name={'sliders' as FeatherName} size={16} />
    </View>
  );
}

function JellySearchPlaceholder({ phrases }: { phrases: string[] }) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const motion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (phrases.length === 0) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    motion.setValue(0);

    Animated.spring(motion, {
      toValue: 1,
      stiffness: 110,
      damping: 26,
      mass: 1.12,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || cancelled) {
        return;
      }

      timeoutId = setTimeout(() => {
        Animated.timing(motion, {
          toValue: 0,
          duration: 300,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished: didFinish }) => {
          if (!didFinish || cancelled) {
            return;
          }

          setPhraseIndex((current) => (current + 1) % phrases.length);
        });
      }, 1680);
    });

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      motion.stopAnimation();
    };
  }, [motion, phraseIndex, phrases]);

  const phrase = phrases[phraseIndex];

  if (!phrase) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.animatedPlaceholder,
        {
          opacity: motion.interpolate({
            inputRange: [0, 0.52, 1],
            outputRange: [0, 0.7, 1],
          }),
          transform: [
            {
              translateY: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [14, 0],
              }),
            },
            {
              scaleX: motion.interpolate({
                inputRange: [0, 0.62, 1],
                outputRange: [0.985, 1.012, 1],
              }),
            },
            {
              scaleY: motion.interpolate({
                inputRange: [0, 0.62, 1],
                outputRange: [1.035, 0.982, 1],
              }),
            },
          ],
        },
      ]}
    >
      <Text numberOfLines={1} style={styles.animatedPlaceholderText}>
        {phrase}
      </Text>
    </Animated.View>
  );
}

function SecondaryTabContent({
  activeTab,
  categories,
  contentPadding,
  createError,
  createPending,
  createProgress,
  createStage,
  historyEvents,
  menuOpen,
  myListings,
  notifications,
  onCreateEvent,
  onMarkAllRead,
  onOpenNotification,
  onSelectEvent,
  onSignOut,
  onToggleMenu,
  onToggleSave,
  profile,
  savedEvents,
  unreadNotificationCount,
}: {
  activeTab: TabId;
  categories: AppCategory[];
  contentPadding: StyleProp<ViewStyle>;
  createError: string | null;
  createPending: boolean;
  createProgress: number;
  createStage: string | null;
  historyEvents: AppEvent[];
  menuOpen: boolean;
  myListings: AppEvent[];
  notifications: AppNotification[];
  onCreateEvent: (input: CreateAppEventInput) => Promise<void>;
  onMarkAllRead: () => void;
  onOpenNotification: (notification: AppNotification) => void;
  onSelectEvent: (event: AppEvent) => void;
  onSignOut: () => void;
  onToggleMenu: () => void;
  onToggleSave: (event: AppEvent) => void;
  profile: AppUser | null;
  savedEvents: AppEvent[];
  unreadNotificationCount: number;
}) {
  return (
    <ScrollView contentContainerStyle={contentPadding} showsVerticalScrollIndicator={false}>
      <HomeHeader menuOpen={menuOpen} onToggleMenu={onToggleMenu} profile={profile} />

      {activeTab === 'saved' ? (
        <SavedTabView events={savedEvents} onSelectEvent={onSelectEvent} />
      ) : null}

      {activeTab === 'create' ? (
        <CreateTabView
          categories={categories}
          isSubmitting={createPending}
          submitProgress={createProgress}
          submitStage={createStage}
          submitError={createError}
          onSubmit={onCreateEvent}
        />
      ) : null}

      {activeTab === 'inbox' ? (
        <InboxTabView
          notifications={notifications}
          unreadCount={unreadNotificationCount}
          onMarkAllRead={onMarkAllRead}
          onOpenNotification={onOpenNotification}
        />
      ) : null}

      {activeTab === 'profile' ? (
        <ProfileTabView
          historyEvents={historyEvents}
          myListings={myListings}
          onSignOut={onSignOut}
          profile={profile}
          savedEvents={savedEvents}
          unreadCount={unreadNotificationCount}
          onSelectEvent={onSelectEvent}
        />
      ) : null}
    </ScrollView>
  );
}

function HomeHeader({
  menuOpen,
  onToggleMenu,
  profile,
}: {
  menuOpen: boolean;
  onToggleMenu: () => void;
  profile?: AppUser | null;
}) {
  const avatarSource = profile?.avatar ? profile.avatar : APP_LOGO;

  return (
    <View style={styles.headerRow}>
      <IconButton
        icon={menuOpen ? 'x' : 'menu'}
        onPress={onToggleMenu}
        accessibilityLabel={menuOpen ? 'Close menu' : 'Open menu'}
      />
      <View style={styles.locationChip}>
        <Feather color={theme.colors.accentStrong} name={'map-pin' as FeatherName} size={15} />
        <Text style={styles.locationText}>Explore nearby</Text>
      </View>
      <View style={styles.avatar}>
        <Image source={avatarSource} contentFit="cover" style={styles.avatarImage} transition={120} />
      </View>
    </View>
  );
}

function DiscoverFloatingHeaderLayer({
  floatingSearchProgress,
  floatingSearchVisible,
  inputRef,
  isFocused,
  menuOpen,
  profile,
  query,
  safeTop,
  onBlur,
  onChangeText,
  onFocus,
  onToggleMenu,
}: {
  floatingSearchProgress: Animated.AnimatedInterpolation<string | number>;
  floatingSearchVisible: boolean;
  inputRef: React.RefObject<TextInput | null>;
  isFocused: boolean;
  menuOpen: boolean;
  profile?: AppUser | null;
  query: string;
  safeTop: number;
  onBlur: () => void;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onToggleMenu: () => void;
}) {
  const avatarSource = profile?.avatar ? profile.avatar : APP_LOGO;

  return (
    <View pointerEvents="box-none" style={[styles.floatingHeaderWrap, { paddingTop: safeTop + 8 }]}>
      <View style={styles.floatingHeaderRow}>
        <IconButton
          darkGlass
          icon={menuOpen ? 'x' : 'menu'}
          onPress={onToggleMenu}
          accessibilityLabel={menuOpen ? 'Close menu' : 'Open menu'}
        />

        <View pointerEvents="box-none" style={styles.floatingCenterRail}>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.floatingLocationLayer,
              {
                opacity: floatingSearchProgress.interpolate({
                  inputRange: [0, 0.54, 1],
                  outputRange: [1, 0.16, 0],
                  extrapolate: 'clamp',
                }),
                transform: [
                  {
                    translateY: floatingSearchProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, -9],
                      extrapolate: 'clamp',
                    }),
                  },
                  {
                    scaleX: floatingSearchProgress.interpolate({
                      inputRange: [0, 0.68, 1],
                      outputRange: [1, 1.015, 0.95],
                      extrapolate: 'clamp',
                    }),
                  },
                  {
                    scaleY: floatingSearchProgress.interpolate({
                      inputRange: [0, 0.68, 1],
                      outputRange: [1, 0.992, 0.92],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
          >
            <View style={[styles.locationChip, styles.floatingLocationChip]}>
              <Feather color={theme.colors.accentStrong} name={'map-pin' as FeatherName} size={15} />
              <Text style={styles.locationText}>Explore nearby</Text>
            </View>
          </Animated.View>

          <Animated.View
            pointerEvents={floatingSearchVisible || isFocused ? 'auto' : 'none'}
            style={[
              styles.floatingSearchLayer,
              {
                opacity: floatingSearchProgress.interpolate({
                  inputRange: [0, 0.42, 1],
                  outputRange: [0, 0.1, 1],
                  extrapolate: 'clamp',
                }),
                transform: [
                  {
                    translateY: floatingSearchProgress.interpolate({
                      inputRange: [0, 1],
                      outputRange: [12, 0],
                      extrapolate: 'clamp',
                    }),
                  },
                  {
                    scaleX: floatingSearchProgress.interpolate({
                      inputRange: [0, 0.66, 1],
                      outputRange: [0.945, 1.012, 1],
                      extrapolate: 'clamp',
                    }),
                  },
                  {
                    scaleY: floatingSearchProgress.interpolate({
                      inputRange: [0, 0.66, 1],
                      outputRange: [1.045, 0.986, 1],
                      extrapolate: 'clamp',
                    }),
                  },
                ],
              },
            ]}
          >
            <SearchShell
              inputRef={inputRef}
              isFocused={isFocused}
              query={query}
              onBlur={onBlur}
              onChangeText={onChangeText}
              onFocus={onFocus}
              style={styles.floatingSearchShell}
            />
          </Animated.View>
        </View>

        <View style={styles.avatar}>
          <Image source={avatarSource} contentFit="cover" style={styles.avatarImage} transition={120} />
        </View>
      </View>
    </View>
  );
}

function DrawerMenu({
  activeTab,
  menuOpen,
  onClose,
  profile,
  onSearchPress,
  onTabChange,
  overlayOpacity,
  translateX,
  width,
}: {
  activeTab: TabId;
  menuOpen: boolean;
  onClose: () => void;
  profile?: AppUser | null;
  onSearchPress: () => void;
  onTabChange: (tab: TabId) => void;
  overlayOpacity: Animated.Value;
  translateX: Animated.Value;
  width: number;
}) {
  const avatarSource = profile?.avatar ? profile.avatar : APP_LOGO;

  return (
    <View pointerEvents={menuOpen ? 'auto' : 'box-none'} style={StyleSheet.absoluteFillObject}>
      <Animated.View pointerEvents={menuOpen ? 'auto' : 'none'} style={[styles.drawerOverlay, { opacity: overlayOpacity }]}>
        <Pressable onPress={onClose} style={styles.drawerOverlayPressable} />
      </Animated.View>

      <Animated.View
        style={[
          styles.drawer,
          {
            transform: [{ translateX }],
            width,
          },
        ]}
      >
        <ScrollView
          bounces
          contentContainerStyle={styles.drawerScrollContent}
          showsVerticalScrollIndicator={false}
          style={styles.drawerScroll}
        >
          <View style={styles.drawerProfile}>
            <View style={styles.drawerAvatarOrb}>
              <Image source={avatarSource} contentFit="cover" style={styles.drawerAvatarImage} transition={120} />
            </View>

            <View style={styles.drawerUtilityRow}>
              <DrawerUtilityAction
                icon="settings"
                label="Settings"
                onPress={() => {
                  onTabChange('profile');
                  onClose();
                }}
              />
              <DrawerUtilityAction
                icon="bell"
                label="Notifications"
                onPress={() => {
                  onTabChange('inbox');
                  onClose();
                }}
                showDot
              />
            </View>
          </View>

          <DrawerSearchShortcut onPress={onSearchPress} />

          <View style={styles.drawerOptions}>
            {TAB_ITEMS.map((tab) => (
              <DrawerOption
                key={tab.id}
                active={tab.id === activeTab}
                icon={tab.icon}
                label={tab.label}
                onPress={() => {
                  onTabChange(tab.id);
                  onClose();
                }}
              />
            ))}
          </View>

          <View style={styles.drawerBottomGroup}>
            <View style={styles.drawerSectionDivider} />

            <DrawerOption
              active={false}
              icon="info"
              label="About app"
              onPress={() => {
                onTabChange('profile');
                onClose();
              }}
            />

            <View style={styles.drawerFooter}>
              <Text style={styles.drawerFooterLabel}>Version</Text>
              <Text style={styles.drawerFooterValue}>v{APP_VERSION}</Text>
            </View>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

function DrawerOption({
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
    pressedScaleX: 1.02,
    pressedScaleY: 0.95,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut} style={styles.drawerOptionPressable}>
      <Animated.View style={[styles.drawerOption, active && styles.drawerOptionActive, jelly.animatedStyle]}>
        <View style={[styles.drawerIconWrap, active && styles.drawerIconWrapActive]}>
          <Feather
            color={active ? theme.colors.white : theme.colors.accentStrong}
            name={icon as FeatherName}
            size={17}
          />
        </View>
        <Text style={[styles.drawerOptionText, active && styles.drawerOptionTextActive]}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function DrawerUtilityAction({
  icon,
  label,
  onPress,
  showDot = false,
}: {
  icon: FeatherName;
  label: string;
  onPress: () => void;
  showDot?: boolean;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.03,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut} style={styles.drawerUtilityPressable}>
      <Animated.View style={[styles.drawerUtilityAction, jelly.animatedStyle]}>
        <View style={styles.drawerUtilityIconWrap}>
          <Feather color={theme.colors.accentStrong} name={icon} size={15} />
          {showDot ? <View style={styles.drawerUtilityDot} /> : null}
        </View>
        <Text numberOfLines={1} style={styles.drawerUtilityText}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function DrawerSearchShortcut({ onPress }: { onPress: () => void }) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.02,
    pressedScaleY: 0.95,
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open home search"
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.drawerSearchPressable}
    >
      <Animated.View style={[styles.drawerSearchShortcut, jelly.animatedStyle]}>
        <Feather color={theme.colors.textMuted} name={'search' as FeatherName} size={16} />
        <Text numberOfLines={1} style={styles.drawerSearchText}>
          Search events
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function EventCard({
  event,
  onPress,
  onToggleSave,
}: {
  event: AppEvent;
  onPress: () => void;
  onToggleSave: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.012,
    pressedScaleY: 0.972,
  });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.cardShell}
    >
      <Animated.View style={jelly.animatedStyle}>
        <View style={styles.card}>
          <Image source={event.image} contentFit="cover" style={styles.cardImage} transition={200} />
          <LinearGradient
            colors={['rgba(8,10,14,0.02)', 'rgba(8,10,14,0.88)']}
            start={{ x: 0.4, y: 0.1 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFillObject}
          />

          <View style={styles.dateBadge}>
            <Text style={styles.dateDay}>{event.day}</Text>
            <Text style={styles.dateMonth}>{event.month}</Text>
          </View>

          <View style={styles.ratingChip}>
            <Feather color="#FBBF24" name={'star' as FeatherName} size={12} />
            <Text style={styles.ratingText}>{event.rating.toFixed(1)}</Text>
          </View>

          <View style={styles.saveChip}>
            <MiniSaveAction saved={event.isSaved} onPress={onToggleSave} />
          </View>

          <View style={styles.cardFooter}>
            <View style={styles.cardTextBlock}>
              <Text numberOfLines={1} style={styles.cardTitle}>
                {event.title}
              </Text>
              <Text numberOfLines={1} style={styles.cardMeta}>
                {event.city}  -  {event.time}
              </Text>
            </View>

            <View style={styles.priceChip}>
              <Text style={styles.priceText}>{event.price}</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function MiniSaveAction({
  saved,
  onPress,
}: {
  saved: boolean;
  onPress: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.08,
    pressedScaleY: 0.88,
  });

  return (
    <Pressable
      onPress={(pressEvent) => {
        pressEvent.stopPropagation();
        onPress();
      }}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.saveChipPressable}
    >
      <Animated.View style={[styles.saveChipButton, saved && styles.saveChipButtonActive, jelly.animatedStyle]}>
        <Feather color={saved ? theme.colors.white : theme.colors.accentStrong} name={'heart' as FeatherName} size={13} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
  },
  separator: {
    height: 14,
  },
  headerRow: {
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  floatingHeaderWrap: {
    position: 'absolute',
    top: 0,
    left: 20,
    right: 20,
    zIndex: 12,
  },
  floatingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  floatingCenterRail: {
    flex: 1,
    minHeight: FLOATING_HEADER_HEIGHT,
    justifyContent: 'center',
  },
  floatingLocationLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingSearchLayer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  floatingSearchShell: {
    width: '100%',
    marginBottom: 0,
    backgroundColor: 'rgba(8,10,14,0.44)',
    borderColor: 'rgba(255,255,255,0.07)',
  },
  floatingLocationChip: {
    backgroundColor: 'rgba(8,10,14,0.4)',
    borderColor: 'rgba(255,255,255,0.07)',
  },
  locationChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,107,61,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  searchShell: {
    minHeight: 50,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchInputWrap: {
    flex: 1,
    minHeight: 24,
    justifyContent: 'center',
  },
  animatedPlaceholder: {
    position: 'absolute',
    left: 0,
    right: 0,
    justifyContent: 'center',
  },
  animatedPlaceholderText: {
    color: theme.colors.textSoft,
    fontSize: 14,
    fontWeight: '600',
  },
  searchInput: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 0,
  },
  searchDivider: {
    width: 1,
    height: 18,
    backgroundColor: theme.colors.border,
  },
  categoryRow: {
    paddingBottom: 10,
  },
  spotlightCard: {
    marginTop: 4,
    marginBottom: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  spotlightBody: {
    flex: 1,
    gap: 8,
  },
  spotlightBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  spotlightDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: theme.colors.accentStrong,
  },
  spotlightBadgeText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  spotlightTitle: {
    color: theme.colors.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  spotlightCopy: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  spotlightMeta: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  spotlightPrice: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  spotlightMetaText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  spotlightImage: {
    width: 92,
    height: 110,
    borderRadius: 20,
  },
  cardShell: {
    ...shadow,
  },
  card: {
    height: 208,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceStrong,
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
  },
  dateBadge: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 48,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(12,15,23,0.78)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateDay: {
    color: theme.colors.white,
    fontSize: 18,
    fontWeight: '800',
  },
  dateMonth: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  ratingChip: {
    position: 'absolute',
    top: 14,
    left: 14,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(12,15,23,0.7)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ratingText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  saveChip: {
    position: 'absolute',
    top: 48,
    left: 14,
  },
  saveChipPressable: {
    alignSelf: 'flex-start',
  },
  saveChipButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(12,15,23,0.74)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveChipButtonActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(255,107,61,0.24)',
  },
  cardFooter: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 10,
  },
  cardTextBlock: {
    flex: 1,
    gap: 6,
  },
  cardTitle: {
    color: theme.colors.white,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cardMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  priceChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.paper,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceText: {
    color: theme.colors.paperInk,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyCard: {
    marginTop: 8,
    borderRadius: theme.radius.lg,
    padding: 20,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 8,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDescription: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 7, 13, 0.52)',
  },
  drawerOverlayPressable: {
    flex: 1,
  },
  drawer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(12, 15, 23, 0.98)',
    borderRightWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
    ...shadow,
  },
  drawerScroll: {
    flex: 1,
  },
  drawerScrollContent: {
    paddingTop: 88,
    paddingHorizontal: 20,
    paddingBottom: 156,
  },
  drawerProfile: {
    marginBottom: 22,
    alignItems: 'center',
    gap: 14,
  },
  drawerAvatarOrb: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(255,107,61,0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  drawerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  drawerUtilityRow: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
  },
  drawerUtilityPressable: {
    flex: 1,
  },
  drawerUtilityAction: {
    minHeight: 46,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  drawerUtilityIconWrap: {
    position: 'relative',
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerUtilityDot: {
    position: 'absolute',
    top: -1,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.accentStrong,
  },
  drawerUtilityText: {
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  drawerSearchPressable: {
    alignSelf: 'stretch',
    marginBottom: 16,
  },
  drawerSearchShortcut: {
    minHeight: 50,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  drawerSearchText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 14,
    fontWeight: '600',
  },
  drawerOptions: {
    gap: 12,
  },
  drawerBottomGroup: {
    marginTop: 34,
    paddingBottom: 36,
    gap: 18,
  },
  drawerSectionDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  drawerOptionPressable: {
    alignSelf: 'stretch',
  },
  drawerOption: {
    minHeight: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  drawerOptionActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(255,107,61,0.28)',
  },
  drawerIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,107,61,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerIconWrapActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  drawerOptionText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  drawerOptionTextActive: {
    color: theme.colors.white,
  },
  drawerFooter: {
    paddingTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  drawerFooterLabel: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  drawerFooterValue: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
});
