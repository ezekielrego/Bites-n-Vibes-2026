import React, { useDeferredValue, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  FlatListProps,
  NativeSyntheticEvent,
  type ViewToken,
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
import { ResizeMode, type AVPlaybackStatus, Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_VERSION, TAB_ITEMS } from '../constants';
import { fetchAppFeed } from '../api';
import { theme, shadow } from '../theme';
import {
  AppCategory,
  AppEvent,
  AppNotification,
  AppTicket,
  AppUser,
  CategoryId,
  ChangePasswordInput,
  CreateAppEventInput,
  TabId,
  UpdateProfileInput,
} from '../types';
import {
  CategoryPill,
  IconButton,
  ScreenTransition,
  SectionHeader,
  useJellyPressAnimation,
} from './Primitives';
import { CreateTabView, InboxTabView, ProfileTabView, StreamTabView } from './SecondaryTabViews';

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
const CARD_VIDEO_PREVIEW_DELAY_MS = 640;

export function HomeScreen({
  activeTab,
  categories,
  createPending,
  createProgress,
  createStage,
  createError,
  editingListing,
  events,
  historyEvents,
  myListings,
  notifications,
  receivedTickets,
  tickets,
  unreadNotificationCount,
  profile,
  onCancelTicket,
  onClearHistory,
  onSelectEvent,
  onTabChange,
  onOpenTicket,
  onOpenNearby,
  onRemoveHistoryItem,
  onToggleSave,
  onOpenNotification,
  onMarkAllRead,
  onMarkTicketUsed,
  onCreateEvent,
  onCancelEditListing,
  onChangePassword,
  onDeleteListings,
  onSignOut,
  onStartEditListing,
  tabDirection,
  onToggleEmailNotifications,
  onTogglePushNotifications,
  onUpdateProfile,
}: {
  activeTab: TabId;
  categories: AppCategory[];
  createPending: boolean;
  createProgress: number;
  createStage: string | null;
  createError: string | null;
  editingListing: AppEvent | null;
  events: AppEvent[];
  historyEvents: AppEvent[];
  myListings: AppEvent[];
  notifications: AppNotification[];
  receivedTickets: AppTicket[];
  tickets: AppTicket[];
  unreadNotificationCount: number;
  profile: AppUser | null;
  onCancelTicket: (ticket: AppTicket) => Promise<void>;
  onClearHistory: () => Promise<void>;
  onSelectEvent: (event: AppEvent) => void;
  onOpenTicket: (ticket: AppTicket) => void;
  onOpenNearby: () => void;
  onRemoveHistoryItem: (event: AppEvent) => Promise<void>;
  onTabChange: (tab: TabId) => void;
  onToggleSave: (event: AppEvent) => void;
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
  onMarkTicketUsed: (ticket: AppTicket) => Promise<void>;
  onCreateEvent: (input: CreateAppEventInput) => Promise<void>;
  onCancelEditListing: () => void;
  onChangePassword: (input: ChangePasswordInput) => Promise<{ message: string }>;
  onDeleteListings: (eventIds: string[]) => Promise<void>;
  onSignOut: () => void;
  onStartEditListing: (event: AppEvent) => void;
  tabDirection: 1 | -1;
  onToggleEmailNotifications: (enabled: boolean) => Promise<AppUser>;
  onTogglePushNotifications: (enabled: boolean) => Promise<AppUser>;
  onUpdateProfile: (input: UpdateProfileInput) => Promise<AppUser>;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedEvents, setFeedEvents] = useState<AppEvent[]>(events);
  const [feedNextPage, setFeedNextPage] = useState<number | null>(2);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedTotalCount, setFeedTotalCount] = useState(events.length);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [floatingSearchVisible, setFloatingSearchVisible] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const searchInputRef = useRef<TextInput>(null);
  const floatingSearchInputRef = useRef<TextInput>(null);
  const pendingSearchFocus = useRef(false);
  const searchFocusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floatingSearchVisibleRef = useRef(false);
  const feedRequestKeyRef = useRef('');
  const categoryRailRef = useRef<ScrollView>(null);
  const categoryLayoutsRef = useRef<Partial<Record<CategoryId, { width: number; x: number }>>>({});
  const menuTranslate = useRef(new Animated.Value(-Math.min(width * 0.76, 320))).current;
  const menuOverlayOpacity = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const previewEventIdRef = useRef<string | null>(null);
  const [previewEventId, setPreviewEventId] = useState<string | null>(null);
  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 72,
    minimumViewTime: 280,
  }).current;
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: Array<ViewToken<AppEvent>> }) => {
    const nextPreviewEvent = viewableItems
      .map((entry) => entry.item)
      .find((item): item is AppEvent => Boolean(item && hasCardPreviewVideo(item)));
    const nextPreviewId = nextPreviewEvent?.id ?? null;

    if (nextPreviewId === previewEventIdRef.current) {
      return;
    }

    previewEventIdRef.current = nextPreviewId;
    setPreviewEventId(nextPreviewId);
  }).current;

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
    setFeedEvents(events);
    setFeedTotalCount(events.length);
    setFeedNextPage(2);
  }, [events]);

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

  const handleOpenCategory = (categoryId: CategoryId) => {
    setActiveCategory(categoryId);
    setSearchQuery('');
    previewEventIdRef.current = null;
    setPreviewEventId(null);
    scrollCategoryIntoView(categoryId);
    if (activeTab !== 'discover') {
      onTabChange('discover');
    }
  };

  const scrollCategoryIntoView = (categoryId: CategoryId) => {
    const layout = categoryLayoutsRef.current[categoryId];
    if (!layout) {
      return;
    }

    const targetX = Math.max(0, layout.x - Math.max(16, (width - layout.width) / 2));
    categoryRailRef.current?.scrollTo({ x: targetX, y: 0, animated: true });
  };

  useEffect(() => {
    const timer = setTimeout(() => scrollCategoryIntoView(activeCategory), 80);
    return () => clearTimeout(timer);
  }, [activeCategory, width]);

  useEffect(() => {
    if (activeTab !== 'discover' || categories.length === 0) {
      return;
    }

    const requestKey = `${activeCategory}|${deferredSearchQuery.trim()}`;
    feedRequestKeyRef.current = requestKey;
    setFeedRefreshing(true);

    const timeout = setTimeout(() => {
      fetchAppFeed({
        categories,
        categoryId: activeCategory,
        page: 1,
        pageSize: 10,
        search: deferredSearchQuery,
      })
        .then((page) => {
          if (feedRequestKeyRef.current !== requestKey) {
            return;
          }
          setFeedEvents(page.events);
          setFeedNextPage(page.nextPage);
          setFeedTotalCount(page.totalCount);
        })
        .catch(() => {
          if (feedRequestKeyRef.current !== requestKey) {
            return;
          }
          const localQuery = deferredSearchQuery.trim().toLowerCase();
          const localEvents = events.filter((event) => {
            const matchesCategory =
              activeCategory === 'all' || event.categories.some((category) => category.id === activeCategory);
            const matchesQuery =
              localQuery.length === 0 ||
              [event.artist, event.title, event.city, event.venue].some((value) =>
                value.toLowerCase().includes(localQuery),
              );

            return matchesCategory && matchesQuery;
          });
          setFeedEvents(localEvents);
          setFeedNextPage(null);
          setFeedTotalCount(localEvents.length);
        })
        .finally(() => {
          if (feedRequestKeyRef.current === requestKey) {
            setFeedRefreshing(false);
          }
        });
    }, 260);

    return () => clearTimeout(timeout);
  }, [activeCategory, activeTab, categories, deferredSearchQuery, events]);

  const loadNextFeedPage = () => {
    if (feedLoading || feedRefreshing || !feedNextPage || activeTab !== 'discover') {
      return;
    }

    const requestKey = `${activeCategory}|${deferredSearchQuery.trim()}`;
    setFeedLoading(true);
    fetchAppFeed({
      categories,
      categoryId: activeCategory,
      page: feedNextPage,
      pageSize: 10,
      search: deferredSearchQuery,
    })
      .then((page) => {
        if (feedRequestKeyRef.current !== requestKey) {
          return;
        }

        setFeedEvents((current) => {
          const seen = new Set(current.map((event) => event.id));
          return [...current, ...page.events.filter((event) => !seen.has(event.id))];
        });
        setFeedNextPage(page.nextPage);
        setFeedTotalCount(page.totalCount);
      })
      .catch(() => undefined)
      .finally(() => setFeedLoading(false));
  };

  const filteredEvents = feedEvents;
  const activeCategoryDetails = categories.find((category) => category.id === activeCategory);
  const categoryFeedTitle =
    activeCategory === 'all' ? 'All categories' : activeCategoryDetails?.name ?? 'Category';

  useEffect(() => {
    if (!previewEventId) {
      return;
    }

    const stillVisible = filteredEvents.some((event) => event.id === previewEventId);
    if (!stillVisible) {
      previewEventIdRef.current = null;
      setPreviewEventId(null);
    }
  }, [filteredEvents, previewEventId]);

  const spotlightEvents = buildDynamicSpotlightEvents(filteredEvents.length > 0 ? filteredEvents : events, activeCategory);
  const spotlightCardWidth = Math.max(width - 84, 292);
  const savedEvents = events.filter((event) => event.isSaved);
  const discoverContentPadding: StyleProp<ViewStyle> = [
    styles.content,
    styles.discoverContent,
    {
      paddingTop: insets.top + FLOATING_HEADER_HEIGHT + FLOATING_HEADER_GAP,
      paddingBottom: insets.bottom + 110,
    },
  ];
  const contentPadding: StyleProp<ViewStyle> = [
    styles.content,
    activeTab === 'create' ? styles.createContent : null,
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
        events={events}
        editingListing={editingListing}
        createPending={createPending}
        createProgress={createProgress}
        createStage={createStage}
        historyEvents={historyEvents}
        menuOpen={menuOpen}
        myListings={myListings}
        notifications={notifications}
        onCancelTicket={onCancelTicket}
        onClearHistory={onClearHistory}
        tickets={tickets}
        receivedTickets={receivedTickets}
        onCancelEditListing={onCancelEditListing}
        onChangePassword={onChangePassword}
        onDeleteListings={onDeleteListings}
        onCreateEvent={onCreateEvent}
        onMarkAllRead={onMarkAllRead}
        onMarkTicketUsed={onMarkTicketUsed}
        onOpenNotification={onOpenNotification}
        onOpenNearby={onOpenNearby}
        onOpenTicket={onOpenTicket}
        onOpenCategory={handleOpenCategory}
        onRemoveHistoryItem={onRemoveHistoryItem}
        onSelectEvent={onSelectEvent}
        onSignOut={onSignOut}
        onStartEditListing={onStartEditListing}
        onTabChange={onTabChange}
        onToggleMenu={() => setMenuOpen((current) => !current)}
        onToggleEmailNotifications={onToggleEmailNotifications}
        onTogglePushNotifications={onTogglePushNotifications}
        onToggleSave={onToggleSave}
        onUpdateProfile={onUpdateProfile}
        profile={profile}
        savedEvents={savedEvents}
        unreadNotificationCount={unreadNotificationCount}
      />
    ) : (
      <AnimatedFlatList
        key={`discover-${activeCategory}`}
        data={filteredEvents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={discoverContentPadding}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        onEndReached={loadNextFeedPage}
        onEndReachedThreshold={0.72}
        onViewableItemsChanged={onViewableItemsChanged}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          {
            useNativeDriver: true,
            listener: handleDiscoverScroll,
          },
        )}
        scrollEventThrottle={16}
        updateCellsBatchingPeriod={48}
        viewabilityConfig={viewabilityConfig}
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
        ListFooterComponent={feedLoading ? <FeedFooterSkeleton /> : null}
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

            <ScrollView
              ref={categoryRailRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryRow}
            >
              {categories.map((category) => (
                <View
                  key={category.id}
                  onLayout={(event) => {
                    categoryLayoutsRef.current[category.id] = event.nativeEvent.layout;
                  }}
                >
                  <CategoryPill
                    active={category.id === activeCategory}
                    category={category}
                    onPress={() => handleOpenCategory(category.id)}
                  />
                </View>
              ))}
            </ScrollView>

            {activeCategory !== 'all' ? (
              <View style={styles.categoryFeedBanner}>
                <View style={styles.categoryFeedIcon}>
                  <Feather color={theme.colors.accentStrong} name={(activeCategoryDetails?.icon as FeatherName) ?? 'grid'} size={15} />
                </View>
                <View style={styles.categoryFeedCopy}>
                  <Text style={styles.categoryFeedTitle}>{categoryFeedTitle}</Text>
                  <Text style={styles.categoryFeedHint}>
                    {feedTotalCount} listing{feedTotalCount === 1 ? '' : 's'} in this category
                  </Text>
                </View>
              </View>
            ) : null}

            {spotlightEvents.length > 0 ? (
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                snapToAlignment="start"
                snapToInterval={spotlightCardWidth + 12}
                decelerationRate="normal"
                contentContainerStyle={styles.spotlightRail}
              >
                {spotlightEvents.map((spotlightEvent) => (
                  <Pressable key={spotlightEvent.id} delayLongPress={120} onPress={() => onSelectEvent(spotlightEvent)}>
                    <LinearGradient
                      colors={['rgba(255,107,61,0.24)', 'rgba(40,48,70,0.95)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={[styles.spotlightCard, { width: spotlightCardWidth }]}
                    >
                      <View style={styles.spotlightImageWrap}>
                        <Image
                          source={spotlightEvent.ticketImage ?? spotlightEvent.image}
                          contentFit="cover"
                          style={styles.spotlightImage}
                          transition={200}
                        />
                        <LinearGradient
                          colors={['rgba(40,48,70,0.98)', 'rgba(40,48,70,0.56)', 'rgba(40,48,70,0.04)']}
                          start={{ x: 0, y: 0.5 }}
                          end={{ x: 1, y: 0.5 }}
                          style={styles.spotlightImageFade}
                        />
                      </View>
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
                    </LinearGradient>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <SectionHeader title={activeCategory === 'all' ? 'Upcoming events' : `${categoryFeedTitle} feed`} actionLabel="See all" />
          </>
        }
        renderItem={({ item }) => (
          <EventCard
            event={item}
            isPreviewActive={previewEventId === item.id}
            onPress={() => onSelectEvent(item)}
            onToggleSave={() => onToggleSave(item)}
          />
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
        onOpenNearby={onOpenNearby}
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
  events,
  editingListing,
  createPending,
  createProgress,
  createStage,
  historyEvents,
  menuOpen,
  myListings,
  notifications,
  onCancelTicket,
  onClearHistory,
  tickets,
  receivedTickets,
  onCancelEditListing,
  onChangePassword,
  onDeleteListings,
  onCreateEvent,
  onMarkAllRead,
  onMarkTicketUsed,
  onOpenNearby,
  onOpenNotification,
  onOpenTicket,
  onOpenCategory,
  onRemoveHistoryItem,
  onSelectEvent,
  onSignOut,
  onStartEditListing,
  onTabChange,
  onToggleMenu,
  onToggleEmailNotifications,
  onTogglePushNotifications,
  onToggleSave,
  onUpdateProfile,
  profile,
  savedEvents,
  unreadNotificationCount,
}: {
  activeTab: TabId;
  categories: AppCategory[];
  contentPadding: StyleProp<ViewStyle>;
  createError: string | null;
  events: AppEvent[];
  editingListing: AppEvent | null;
  createPending: boolean;
  createProgress: number;
  createStage: string | null;
  historyEvents: AppEvent[];
  menuOpen: boolean;
  myListings: AppEvent[];
  notifications: AppNotification[];
  onCancelTicket: (ticket: AppTicket) => Promise<void>;
  onClearHistory: () => Promise<void>;
  tickets: AppTicket[];
  receivedTickets: AppTicket[];
  onCancelEditListing: () => void;
  onChangePassword: (input: ChangePasswordInput) => Promise<{ message: string }>;
  onDeleteListings: (eventIds: string[]) => Promise<void>;
  onCreateEvent: (input: CreateAppEventInput) => Promise<void>;
  onMarkAllRead: () => void;
  onMarkTicketUsed: (ticket: AppTicket) => Promise<void>;
  onOpenNearby: () => void;
  onOpenNotification: (notification: AppNotification) => void;
  onOpenTicket: (ticket: AppTicket) => void;
  onOpenCategory: (categoryId: CategoryId) => void;
  onRemoveHistoryItem: (event: AppEvent) => Promise<void>;
  onSelectEvent: (event: AppEvent) => void;
  onSignOut: () => void;
  onStartEditListing: (event: AppEvent) => void;
  onTabChange: (tab: TabId) => void;
  onToggleMenu: () => void;
  onToggleEmailNotifications: (enabled: boolean) => Promise<AppUser>;
  onTogglePushNotifications: (enabled: boolean) => Promise<AppUser>;
  onToggleSave: (event: AppEvent) => void;
  onUpdateProfile: (input: UpdateProfileInput) => Promise<AppUser>;
  profile: AppUser | null;
  savedEvents: AppEvent[];
  unreadNotificationCount: number;
}) {
  if (activeTab === 'stream') {
    return <StreamTabView events={events} onSelectEvent={onSelectEvent} onToggleSave={onToggleSave} />;
  }

  return (
    <ScrollView contentContainerStyle={contentPadding} showsVerticalScrollIndicator={false}>
      <HomeHeader menuOpen={menuOpen} onOpenNearby={onOpenNearby} onToggleMenu={onToggleMenu} profile={profile} />

      {activeTab === 'create' ? (
        <CreateTabView
          categories={categories}
          editingEvent={editingListing}
          isSubmitting={createPending}
          onCancelEdit={onCancelEditListing}
          profile={profile}
          submitProgress={createProgress}
          submitStage={createStage}
          submitError={createError}
          onSubmit={onCreateEvent}
        />
      ) : null}

      {activeTab === 'inbox' ? (
        <InboxTabView
          notifications={notifications}
          receivedTickets={receivedTickets}
          tickets={tickets}
          unreadCount={unreadNotificationCount}
          onMarkAllRead={onMarkAllRead}
          onOpenNotification={onOpenNotification}
          onOpenTicket={onOpenTicket}
        />
      ) : null}

      {activeTab === 'profile' ? (
        <ProfileTabView
          categories={categories}
          historyEvents={historyEvents}
          myListings={myListings}
          onCancelTicket={onCancelTicket}
          onChangePassword={onChangePassword}
          onDeleteListings={onDeleteListings}
          onClearHistory={onClearHistory}
          onEditListing={onStartEditListing}
          onMarkTicketUsed={onMarkTicketUsed}
          onOpenCategory={onOpenCategory}
          onOpenSavedTab={() => onTabChange('stream')}
          onSignOut={onSignOut}
          onStartCreate={() => {
            onCancelEditListing();
            onTabChange('create');
          }}
          onToggleEmailNotifications={onToggleEmailNotifications}
          onTogglePushNotifications={onTogglePushNotifications}
          onUpdateProfile={onUpdateProfile}
          profile={profile}
          receivedTickets={receivedTickets}
          onOpenTicket={onOpenTicket}
          onRemoveHistoryItem={onRemoveHistoryItem}
          savedEvents={savedEvents}
          tickets={tickets}
          unreadCount={unreadNotificationCount}
          onSelectEvent={onSelectEvent}
        />
      ) : null}
    </ScrollView>
  );
}

function HomeHeader({
  menuOpen,
  onOpenNearby,
  onToggleMenu,
  profile,
}: {
  menuOpen: boolean;
  onOpenNearby: () => void;
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
      <NearbyTrigger onPress={onOpenNearby} />
      <View style={styles.avatar}>
        <Image source={avatarSource} contentFit="cover" style={styles.avatarImage} transition={120} />
      </View>
    </View>
  );
}

function NearbyTrigger({
  onPress,
  style,
}: {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.02,
    pressedScaleY: 0.95,
  });

  return (
    <Pressable onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={[styles.locationChip, style, jelly.animatedStyle]}>
        <Feather color={theme.colors.accentStrong} name={'map-pin' as FeatherName} size={15} />
        <Text style={styles.locationText}>Explore nearby</Text>
      </Animated.View>
    </Pressable>
  );
}

function DiscoverFloatingHeaderLayer({
  floatingSearchProgress,
  floatingSearchVisible,
  inputRef,
  isFocused,
  menuOpen,
  onOpenNearby,
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
  onOpenNearby: () => void;
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
            pointerEvents={floatingSearchVisible || isFocused ? 'none' : 'auto'}
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
            <NearbyTrigger onPress={onOpenNearby} style={styles.floatingLocationChip} />
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

function FeedFooterSkeleton() {
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1350,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1350,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [breathe]);

  const animatedStyle = {
    opacity: breathe.interpolate({
      inputRange: [0, 1],
      outputRange: [0.36, 0.82],
    }),
    transform: [
      {
        scaleY: breathe.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 0.985],
        }),
      },
    ],
  };

  return (
    <View style={styles.feedFooter}>
      <Animated.View style={[styles.feedFooterCard, animatedStyle]} />
      <Animated.View style={[styles.feedFooterCard, animatedStyle]} />
    </View>
  );
}

function EventCard({
  event,
  isPreviewActive,
  onPress,
  onToggleSave,
}: {
  event: AppEvent;
  isPreviewActive: boolean;
  onPress: () => void;
  onToggleSave: () => void;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.012,
    pressedScaleY: 0.972,
  });
  const previewVideo = getCardPreviewVideo(event);
  const previewVideoRef = useRef<Video>(null);
  const previewSegmentsRef = useRef<Array<{ start: number; end: number }>>([]);
  const previewSegmentIndexRef = useRef(0);
  const previewDelayTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showVideoPreview, setShowVideoPreview] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    if (!previewVideo || !isPreviewActive) {
      if (previewDelayTimeout.current) {
        clearTimeout(previewDelayTimeout.current);
        previewDelayTimeout.current = null;
      }
      previewSegmentsRef.current = [];
      previewSegmentIndexRef.current = 0;
      setShowVideoPreview(false);
      setVideoReady(false);
      previewVideoRef.current?.stopAsync().catch(() => undefined);
      return;
    }

    previewDelayTimeout.current = setTimeout(() => {
      previewSegmentsRef.current = [];
      previewSegmentIndexRef.current = 0;
      setVideoReady(false);
      setShowVideoPreview(true);
      previewDelayTimeout.current = null;
    }, CARD_VIDEO_PREVIEW_DELAY_MS);

    return () => {
      if (previewDelayTimeout.current) {
        clearTimeout(previewDelayTimeout.current);
        previewDelayTimeout.current = null;
      }
    };
  }, [isPreviewActive, previewVideo]);

  useEffect(() => {
    return () => {
      if (previewDelayTimeout.current) {
        clearTimeout(previewDelayTimeout.current);
      }
    };
  }, []);

  const handleVideoLoad = (status: AVPlaybackStatus) => {
    if (!previewVideo || !isPreviewActive || !('isLoaded' in status) || !status.isLoaded) {
      return;
    }

    previewSegmentsRef.current = buildCardPreviewSegments(status.durationMillis ?? 0);
    previewSegmentIndexRef.current = 0;
    setVideoReady(true);
    const firstSegment = previewSegmentsRef.current[0];
    previewVideoRef.current?.playFromPositionAsync(firstSegment?.start ?? 0).catch(() => undefined);
  };

  const handleVideoStatusUpdate = (status: AVPlaybackStatus) => {
    if (!previewVideo || !isPreviewActive || !('isLoaded' in status) || !status.isLoaded) {
      return;
    }

    if (previewSegmentsRef.current.length === 0) {
      previewSegmentsRef.current = buildCardPreviewSegments(status.durationMillis ?? 0);
    }

    const activeSegment = previewSegmentsRef.current[previewSegmentIndexRef.current];
    if (!activeSegment || status.positionMillis + 140 < activeSegment.end) {
      return;
    }

    const nextSegment = previewSegmentsRef.current[previewSegmentIndexRef.current + 1];
    if (!nextSegment) {
      previewVideoRef.current?.pauseAsync().catch(() => undefined);
      return;
    }

    previewSegmentIndexRef.current += 1;
    previewVideoRef.current?.playFromPositionAsync(nextSegment.start).catch(() => undefined);
  };

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
          {previewVideo && showVideoPreview ? (
            <Video
              isMuted
              onLoad={handleVideoLoad}
              onPlaybackStatusUpdate={handleVideoStatusUpdate}
              ref={previewVideoRef}
              resizeMode={ResizeMode.COVER}
              shouldPlay={false}
              source={{ uri: previewVideo.source }}
              style={[styles.cardVideo, !videoReady && styles.cardVideoHidden]}
              usePoster={false}
            />
          ) : null}
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
              <Text numberOfLines={2} style={styles.cardAbout}>
                {event.blurb || event.about}
              </Text>
            </View>

            <View style={styles.priceChip}>
              <Text style={styles.priceText}>{event.price}</Text>
            </View>
          </View>

          {previewVideo ? (
            <View style={styles.cardVideoChip}>
              <Feather color={theme.colors.white} name={'play-circle' as FeatherName} size={14} />
              <Text style={styles.cardVideoChipText}>Preview</Text>
            </View>
          ) : null}
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

function hasCardPreviewVideo(event: AppEvent) {
  return Boolean(getCardPreviewVideo(event));
}

function getCardPreviewVideo(event: AppEvent) {
  return event.media.find((item) => item.kind === 'video' && item.role === 'hero')
    ?? event.media.find((item) => item.kind === 'video');
}

function buildCardPreviewSegments(durationMillis: number) {
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

function buildDynamicSpotlightEvents(sourceEvents: AppEvent[], activeCategory: CategoryId) {
  const pool = sourceEvents.filter((event) => event.image || event.media.length > 0);
  const todaySeed = Math.floor(Date.now() / 86_400_000);

  return pool
    .map((event, index) => ({
      event,
      score: getSpotlightScore(event, index, activeCategory, todaySeed),
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map((entry) => entry.event);
}

function getSpotlightScore(event: AppEvent, index: number, activeCategory: CategoryId, seed: number) {
  const categoryMatch = activeCategory !== 'all' && event.categories.some((category) => category.id === activeCategory);
  const hasVideo = event.media.some((media) => media.kind === 'video');
  const createdAgeHours = event.createdAt ? Math.max(0, (Date.now() - Date.parse(event.createdAt)) / 3_600_000) : 240;
  const freshness = createdAgeHours <= 48 ? 26 : createdAgeHours <= 168 ? 15 : createdAgeHours <= 720 ? 7 : 0;
  const rotation = seededSpotlightNoise(event.id, seed) * 18;

  return (
    (event.isFeatured ? 48 : 0) +
    (event.isTrending ? 36 : 0) +
    (event.isVerified ? 8 : 0) +
    (categoryMatch ? 18 : 0) +
    (hasVideo ? 10 : 0) +
    freshness +
    Math.min(event.rating * 4, 20) +
    Math.min((event.ratingCount ?? 0) * 1.5, 12) +
    Math.min(event.saveCount * 1.2, 24) +
    Math.min((event.commentCount ?? 0) * 1.1, 14) +
    Math.min((event.vibePercentage ?? 25) / 8, 12) +
    rotation -
    index * 0.65
  );
}

function seededSpotlightNoise(value: string, seed: number) {
  let hash = seed * 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 4,
  },
  discoverContent: {
    paddingHorizontal: 4,
  },
  createContent: {
    paddingHorizontal: 4,
  },
  separator: {
    height: 0,
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
    borderRadius: 11,
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
    borderRadius: 11,
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
  categoryFeedBanner: {
    minHeight: 60,
    marginHorizontal: -4,
    marginBottom: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 4,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  categoryFeedIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryFeedCopy: {
    flex: 1,
    gap: 2,
  },
  categoryFeedTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  categoryFeedHint: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  spotlightCard: {
    marginTop: 4,
    marginBottom: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    padding: 16,
    minHeight: 178,
    justifyContent: 'center',
  },
  spotlightRail: {
    gap: 12,
    paddingRight: 42,
  },
  spotlightBody: {
    width: '54%',
    gap: 8,
    zIndex: 2,
  },
  spotlightImageWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '56%',
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
    width: '100%',
    height: '100%',
  },
  spotlightImageFade: {
    ...StyleSheet.absoluteFillObject,
  },
  cardShell: {
    marginHorizontal: -4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingTop: 6,
    paddingBottom: 8,
  },
  card: {
    minHeight: 318,
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  cardImage: {
    ...StyleSheet.absoluteFillObject,
  },
  cardVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  cardVideoHidden: {
    opacity: 0,
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
    width: 30,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(12,15,23,0.74)',
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveChipButtonActive: {
    backgroundColor: theme.colors.accentSoft,
    borderColor: 'rgba(255,107,61,0.24)',
  },
  cardFooter: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  cardTextBlock: {
    flex: 1,
    gap: 7,
  },
  cardTitle: {
    color: theme.colors.white,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cardMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  cardAbout: {
    color: 'rgba(245,247,252,0.78)',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  priceChip: {
    minHeight: 38,
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
  cardVideoChip: {
    position: 'absolute',
    right: 16,
    bottom: 82,
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(8,10,14,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardVideoChipText: {
    color: theme.colors.white,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
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
  feedFooter: {
    marginHorizontal: -4,
    paddingTop: 6,
    gap: 8,
  },
  feedFooterCard: {
    height: 146,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
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
    flexDirection: 'column',
    gap: 0,
  },
  drawerUtilityPressable: {
    alignSelf: 'stretch',
  },
  drawerUtilityAction: {
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  drawerUtilityIconWrap: {
    position: 'relative',
    width: 22,
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
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  drawerSearchText: {
    flex: 1,
    color: theme.colors.textSoft,
    fontSize: 14,
    fontWeight: '600',
  },
  drawerOptions: {
    gap: 0,
  },
  drawerBottomGroup: {
    marginTop: 34,
    paddingBottom: 36,
    gap: 0,
  },
  drawerSectionDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 12,
  },
  drawerOptionPressable: {
    alignSelf: 'stretch',
  },
  drawerOption: {
    minHeight: 54,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  drawerOptionActive: {
    backgroundColor: 'transparent',
    borderBottomColor: 'rgba(255,107,61,0.24)',
  },
  drawerIconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drawerIconWrapActive: {
    backgroundColor: 'transparent',
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
