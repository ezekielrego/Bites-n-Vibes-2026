import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  FlatList,
  FlatListProps,
  NativeSyntheticEvent,
  PanResponder,
  type ViewToken,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type GestureResponderHandlers,
  NativeScrollEvent,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ResizeMode, type AVPlaybackStatus, Video } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_VERSION, TAB_ITEMS } from '../constants';
import { fetchAppFeed, fetchAppSearchSuggestions, fetchAppSpotlight, recordSearchQuery } from '../api';
import { theme, shadow } from '../theme';
import {
  AppCategory,
  AppEvent,
  AppNotification,
  AppSearchSuggestion,
  AppTicket,
  AppUser,
  CategoryId,
  ChangePasswordInput,
  CreateAppEventInput,
  TabId,
  UpdateProfileInput,
} from '../types';
import {
  IconButton,
  ScreenTransition,
  SectionHeader,
  useJellyPressAnimation,
} from './Primitives';
import { CreateTabView, InboxTabView, ProfileTabView, StreamTabView } from './SecondaryTabViews';
import { OnboardingTapCue } from './OnboardingTapCue';

type FeatherName = React.ComponentProps<typeof Feather>['name'];
const APP_LOGO = require('../../logo.png');
const AnimatedFlatList = Animated.createAnimatedComponent(FlatList) as React.ComponentType<
  FlatListProps<AppEvent>
>;
type UserCoordinates = {
  latitude: number;
  longitude: number;
};

const SEARCH_HINTS = [
  'Search events',
  'Search artists',
  'Search venues',
  'Search nightlife',
];
const FLOATING_SEARCH_THRESHOLD = 86;
const FLOATING_HEADER_HEIGHT = 38;
const FLOATING_CATEGORY_RAIL_HEIGHT = 34;
const FLOATING_HEADER_GAP = 10;
const FLOATING_HEADER_TOP_PADDING = 8;
const CARD_VIDEO_PREVIEW_DELAY_MS = 640;
const FOR_YOU_CATEGORY_PAGE_SIZE = 8;
const FLOATING_SEARCH_AUTO_REVEAL_MS = 4000;
const FLOATING_SEARCH_VISIBLE_CYCLE_MS = 15000;

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
  onAcceptTicket,
  onCancelTicket,
  onClearNotifications,
  onClearHistory,
  onSelectEvent,
  onTabChange,
  onOpenTicket,
  onOpenNearby,
  onOpenSearch,
  onRemoveHistoryItem,
  onToggleSave,
  onToggleVibe,
  onOpenNotification,
  onMarkAllRead,
  onMarkTicketUsed,
  onDeleteNotification,
  onRefresh,
  onCreateEvent,
  onCancelEditListing,
  onChangePassword,
  onDeleteListings,
  onSignOut,
  onStartEditListing,
  tabDirection,
  refreshing,
  onToggleEmailNotifications,
  onTogglePushNotifications,
  onUpdateProfile,
  onDiscoverScroll,
  onMenuOpen,
  onMenuVisibilityChange,
  showMenuTapCue = false,
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
  onAcceptTicket: (ticket: AppTicket) => Promise<void>;
  onCancelTicket: (ticket: AppTicket) => Promise<void>;
  onClearNotifications: () => Promise<void>;
  onClearHistory: () => Promise<void>;
  onSelectEvent: (event: AppEvent) => void;
  onOpenTicket: (ticket: AppTicket) => void;
  onOpenNearby: () => void;
  onOpenSearch: () => void;
  onRemoveHistoryItem: (event: AppEvent) => Promise<void>;
  onTabChange: (tab: TabId) => void;
  onToggleSave: (event: AppEvent) => void;
  onToggleVibe: (event: AppEvent) => void;
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
  onMarkTicketUsed: (ticket: AppTicket) => Promise<void>;
  onDeleteNotification: (notification: AppNotification) => Promise<void>;
  onRefresh: () => Promise<void>;
  onCreateEvent: (input: CreateAppEventInput) => Promise<void>;
  onCancelEditListing: () => void;
  onChangePassword: (input: ChangePasswordInput) => Promise<{ message: string }>;
  onDeleteListings: (eventIds: string[]) => Promise<void>;
  onSignOut: () => void;
  onStartEditListing: (event: AppEvent) => void;
  tabDirection: 1 | -1;
  refreshing: boolean;
  onToggleEmailNotifications: (enabled: boolean) => Promise<AppUser>;
  onTogglePushNotifications: (enabled: boolean) => Promise<AppUser>;
  onUpdateProfile: (input: UpdateProfileInput) => Promise<AppUser>;
  onDiscoverScroll?: (offsetY: number) => void;
  onMenuOpen?: () => void;
  onMenuVisibilityChange?: (open: boolean) => void;
  showMenuTapCue?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [activeCategory, setActiveCategory] = useState<CategoryId>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [inboxSearchQuery, setInboxSearchQuery] = useState('');
  const [isInboxSearchFocused, setIsInboxSearchFocused] = useState(false);
  const [ticketSearchQuery, setTicketSearchQuery] = useState('');
  const [isTicketSearchFocused, setIsTicketSearchFocused] = useState(false);
  const [profileHeaderMode, setProfileHeaderMode] = useState<'default' | 'tickets'>('default');
  const [feedEvents, setFeedEvents] = useState<AppEvent[]>(events);
  const [feedNextPage, setFeedNextPage] = useState<number | null>(2);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedRefreshing, setFeedRefreshing] = useState(false);
  const [feedTotalCount, setFeedTotalCount] = useState(events.length);
  const [homeUserLocation, setHomeUserLocation] = useState<UserCoordinates | null>(null);
  const [searchSuggestions, setSearchSuggestions] = useState<AppSearchSuggestion[]>([]);
  const [backendSpotlightEvents, setBackendSpotlightEvents] = useState<AppEvent[]>([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [floatingSearchVisible, setFloatingSearchVisible] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const floatingSearchInputRef = useRef<TextInput>(null);
  const inboxSearchInputRef = useRef<TextInput>(null);
  const ticketSearchInputRef = useRef<TextInput>(null);
  const pendingSearchFocus = useRef(false);
  const searchFocusTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSearchRevealTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const floatingSearchVisibleRef = useRef(false);
  const autoSearchRevealedRef = useRef(false);
  const discoverScrollOffsetRef = useRef(0);
  const feedRequestKeyRef = useRef('');
  const categoryRailRef = useRef<ScrollView>(null);
  const categoryLayoutsRef = useRef<Partial<Record<CategoryId, { width: number; x: number }>>>({});
  const menuTranslate = useRef(new Animated.Value(-Math.min(width * 0.76, 320))).current;
  const menuOverlayOpacity = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const autoSearchProgress = useRef(new Animated.Value(0)).current;
  const categorySwipeX = useRef(new Animated.Value(0)).current;
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
  const setAutoSearchVisible = useCallback((visible: boolean, animated = true) => {
    autoSearchRevealedRef.current = visible;
    floatingSearchVisibleRef.current = visible;
    setFloatingSearchVisible(visible);

    if (!animated) {
      autoSearchProgress.setValue(visible ? 1 : 0);
      return;
    }

    Animated.timing(autoSearchProgress, {
      toValue: visible ? 1 : 0,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [autoSearchProgress]);

  const loadHomeUserLocation = useCallback(
    async ({ requestIfUndetermined = false }: { requestIfUndetermined?: boolean } = {}) => {
      try {
        let permission = await Location.getForegroundPermissionsAsync();

        if (!permission.granted && requestIfUndetermined && permission.status === Location.PermissionStatus.UNDETERMINED) {
          permission = await Location.requestForegroundPermissionsAsync();
        }

        if (!permission.granted) {
          return null;
        }

        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const nextLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };

        setHomeUserLocation(nextLocation);
        return nextLocation;
      } catch {
        setHomeUserLocation(null);
        return null;
      }
    },
    [],
  );

  const handleDiscoverRefresh = useCallback(async () => {
    await Promise.all([
      onRefresh(),
      loadHomeUserLocation({ requestIfUndetermined: true }),
    ]);
  }, [loadHomeUserLocation, onRefresh]);

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
    let cancelled = false;

    if (autoSearchRevealTimeout.current) {
      clearTimeout(autoSearchRevealTimeout.current);
      autoSearchRevealTimeout.current = null;
    }

    if (activeTab !== 'discover') {
      return;
    }

    const shouldShowSearchImmediately = searchQuery.trim().length > 0 || isSearchFocused;
    setAutoSearchVisible(shouldShowSearchImmediately, false);

    if (shouldShowSearchImmediately) {
      return;
    }

    const scheduleCycle = (visible: boolean) => {
      autoSearchRevealTimeout.current = setTimeout(
        () => {
          if (cancelled) {
            return;
          }

          const nextVisible = !visible;
          setAutoSearchVisible(nextVisible);
          scheduleCycle(nextVisible);
        },
        visible ? FLOATING_SEARCH_VISIBLE_CYCLE_MS : FLOATING_SEARCH_AUTO_REVEAL_MS,
      );
    };

    scheduleCycle(false);

    return () => {
      cancelled = true;
      if (autoSearchRevealTimeout.current) {
        clearTimeout(autoSearchRevealTimeout.current);
        autoSearchRevealTimeout.current = null;
      }
    };
  }, [activeTab, isSearchFocused, searchQuery, setAutoSearchVisible]);

  useEffect(() => {
    if (menuOpen) {
      onMenuOpen?.();
    }
    onMenuVisibilityChange?.(menuOpen);
  }, [menuOpen, onMenuOpen, onMenuVisibilityChange]);

  useEffect(() => {
    if (activeTab === 'inbox' && unreadNotificationCount > 0) {
      void onMarkAllRead();
    }
  }, [activeTab, onMarkAllRead, unreadNotificationCount]);

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
    if (activeTab !== 'discover') {
      return;
    }

    void loadHomeUserLocation({ requestIfUndetermined: true });
  }, [activeTab, loadHomeUserLocation]);

  useEffect(() => {
    if (activeTab !== 'discover' || !isSearchFocused) {
      return;
    }

    let cancelled = false;
    const timeout = setTimeout(() => {
      fetchAppSearchSuggestions({
        categoryId: activeCategory,
        query: searchQuery,
        limit: 8,
      })
        .then((suggestions) => {
          if (!cancelled) {
            setSearchSuggestions(suggestions);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setSearchSuggestions(buildLocalSearchSuggestions(searchQuery, activeCategory, categories, events));
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [activeCategory, activeTab, categories, events, isSearchFocused, searchQuery]);

  useEffect(() => {
    const localEvents = events.filter((event) => eventMatchesFeedFilters(event, activeCategory, deferredSearchQuery));
    setFeedEvents((current) => {
      if (activeCategory !== 'all') {
        return localEvents;
      }

      const currentMatchingEvents = current.filter((event) =>
        eventMatchesFeedFilters(event, activeCategory, deferredSearchQuery),
      );
      return buildForYouMingledEvents(mergeUniqueEvents(currentMatchingEvents, localEvents));
    });
    setFeedTotalCount((current) =>
      activeCategory === 'all' ? Math.max(current, localEvents.length) : localEvents.length,
    );
    setFeedNextPage(2);
  }, [activeCategory, deferredSearchQuery, events]);

  useEffect(() => {
    if (!pendingSearchFocus.current || menuOpen || activeTab !== 'discover') {
      return;
    }

    if (searchFocusTimeout.current) {
      clearTimeout(searchFocusTimeout.current);
    }

    searchFocusTimeout.current = setTimeout(() => {
      floatingSearchInputRef.current?.focus();
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
      if (autoSearchRevealTimeout.current) {
        clearTimeout(autoSearchRevealTimeout.current);
      }
    };
  }, []);

  const handleDrawerSearchPress = () => {
    onOpenSearch();
    setMenuOpen(false);
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

  const categorySwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !menuOpen &&
          Math.abs(gesture.dx) > 14 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25,
        onPanResponderGrant: () => {
          categorySwipeX.stopAnimation();
          categorySwipeX.setValue(0);
        },
        onPanResponderMove: (_, gesture) => {
          categorySwipeX.setValue(Math.max(-width, Math.min(width, gesture.dx)));
        },
        onPanResponderRelease: (_, gesture) => {
          const currentIndex = categories.findIndex((category) => category.id === activeCategory);
          const nextIndex = gesture.dx < 0 ? currentIndex + 1 : currentIndex - 1;
          const nextCategory = categories[nextIndex];
          const crossedHalf = Math.abs(gesture.dx) >= width * 0.5;

          if (crossedHalf && nextCategory) {
            Animated.timing(categorySwipeX, {
              toValue: gesture.dx < 0 ? -width : width,
              duration: 170,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: false,
            }).start(({ finished }) => {
              if (finished) {
                handleOpenCategory(nextCategory.id);
                requestAnimationFrame(() => {
                  categorySwipeX.setValue(0);
                });
              }
            });
            return;
          }

          Animated.spring(categorySwipeX, {
            toValue: 0,
            stiffness: 260,
            damping: 24,
            mass: 0.9,
            useNativeDriver: false,
          }).start();
        },
        onPanResponderTerminate: () => {
          Animated.spring(categorySwipeX, {
            toValue: 0,
            stiffness: 260,
            damping: 24,
            mass: 0.9,
            useNativeDriver: false,
          }).start();
        },
      }),
    [activeCategory, categories, categorySwipeX, handleOpenCategory, menuOpen, width],
  );

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
        .then(async (page) => {
          if (feedRequestKeyRef.current !== requestKey) {
            return;
          }

          if (activeCategory === 'all') {
            const categoryEvents = await fetchForYouCategoryEvents(categories, deferredSearchQuery);
            if (feedRequestKeyRef.current !== requestKey) {
              return;
            }

            const mixedEvents = buildForYouMingledEvents(
              mergeUniqueEvents(
                page.events,
                categoryEvents,
                events.filter((event) => eventMatchesFeedFilters(event, activeCategory, deferredSearchQuery)),
              ),
            );
            setFeedEvents(mixedEvents);
            setFeedNextPage(page.nextPage);
            setFeedTotalCount(Math.max(page.totalCount, mixedEvents.length));
            return;
          }

          setFeedEvents((current) => mergeUniqueEvents(page.events, current));
          setFeedNextPage(page.nextPage);
          setFeedTotalCount(Math.max(page.totalCount, page.events.length));
        })
        .catch(() => {
          if (feedRequestKeyRef.current !== requestKey) {
            return;
          }
          const localEvents = events.filter((event) =>
            eventMatchesFeedFilters(event, activeCategory, deferredSearchQuery),
          );
          setFeedEvents(activeCategory === 'all' ? buildForYouMingledEvents(localEvents) : localEvents);
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

  useEffect(() => {
    if (activeTab !== 'discover' || categories.length === 0) {
      return;
    }

    let cancelled = false;
    fetchAppSpotlight({
      categories,
      categoryId: activeCategory,
      latitude: homeUserLocation?.latitude ?? null,
      longitude: homeUserLocation?.longitude ?? null,
      limit: 4,
    })
      .then((spotlightEvents) => {
        if (!cancelled) {
          setBackendSpotlightEvents(spotlightEvents);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBackendSpotlightEvents([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeCategory, activeTab, categories, homeUserLocation]);

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

  const filteredEvents = useMemo(
    () =>
      activeCategory === 'all'
        ? buildForYouMingledEvents(
            mergeUniqueEvents(
              feedEvents.filter((event) => eventMatchesFeedFilters(event, activeCategory, deferredSearchQuery)),
              events.filter((event) => eventMatchesFeedFilters(event, activeCategory, deferredSearchQuery)),
            ),
          )
        : feedEvents.filter((event) => eventMatchesFeedFilters(event, activeCategory, deferredSearchQuery)),
    [activeCategory, deferredSearchQuery, events, feedEvents],
  );
  const activeCategoryDetails = categories.find((category) => category.id === activeCategory);
  const activeCategoryIndex = categories.findIndex((category) => category.id === activeCategory);
  const previousCategory = activeCategoryIndex > 0 ? categories[activeCategoryIndex - 1] : null;
  const nextCategory =
    activeCategoryIndex >= 0 && activeCategoryIndex < categories.length - 1 ? categories[activeCategoryIndex + 1] : null;
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

  const spotlightEvents =
    backendSpotlightEvents.length > 0
      ? backendSpotlightEvents
      : buildDynamicSpotlightEvents(filteredEvents.length > 0 ? filteredEvents : events, activeCategory);
  const spotlightCardWidth = Math.max(width - 84, 292);
  const savedEvents = events.filter((event) => event.isSaved);
  const fixedTopNavOffset =
    insets.top +
    FLOATING_HEADER_TOP_PADDING +
    FLOATING_HEADER_HEIGHT +
    FLOATING_CATEGORY_RAIL_HEIGHT +
    FLOATING_HEADER_GAP +
    12;
  const discoverContentPadding: StyleProp<ViewStyle> = [
    styles.content,
    styles.discoverContent,
    {
      paddingTop:
        insets.top +
        FLOATING_HEADER_TOP_PADDING +
        FLOATING_HEADER_HEIGHT +
        FLOATING_CATEGORY_RAIL_HEIGHT +
        FLOATING_HEADER_GAP +
        12,
      paddingBottom: insets.bottom + 110,
    },
  ];
  const contentPadding: StyleProp<ViewStyle> = [
    styles.content,
    activeTab === 'create' ? styles.createContent : null,
    {
      paddingTop: activeTab === 'create' || activeTab === 'inbox' || activeTab === 'profile' ? fixedTopNavOffset + 12 : insets.top + 8,
      paddingBottom: insets.bottom + 110,
    },
  ];
  const floatingSearchRevealProgress = autoSearchProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const handleDiscoverScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetY = event.nativeEvent.contentOffset.y;
    discoverScrollOffsetRef.current = offsetY;
    onDiscoverScroll?.(offsetY);

    if (offsetY >= FLOATING_SEARCH_THRESHOLD && !autoSearchRevealedRef.current) {
      setAutoSearchVisible(true);
    }
  };

  const handleSearchSuggestionPress = (suggestion: AppSearchSuggestion) => {
    if (suggestion.type === 'nearby') {
      onOpenNearby();
      return;
    }

    setSearchQuery(suggestion.query);
    setIsSearchFocused(false);
    floatingSearchInputRef.current?.blur();
    void recordSearchQuery({
      categoryId: activeCategory,
      query: suggestion.query,
      resultCount: filteredEvents.length,
    }).catch(() => undefined);
  };

  const handleCloseSearch = useCallback(() => {
    setSearchQuery('');
    setIsSearchFocused(false);
    setSearchSuggestions([]);
    floatingSearchInputRef.current?.blur();
    setAutoSearchVisible(false);
  }, [setAutoSearchVisible]);

  useEffect(() => {
    if (activeTab !== 'discover' || (!isSearchFocused && searchQuery.trim().length === 0)) {
      return;
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleCloseSearch();
      return true;
    });

    return () => subscription.remove();
  }, [activeTab, handleCloseSearch, isSearchFocused, searchQuery]);

  useEffect(() => {
    if (activeTab !== 'profile') {
      setProfileHeaderMode('default');
      setTicketSearchQuery('');
      setIsTicketSearchFocused(false);
      ticketSearchInputRef.current?.blur();
    }
  }, [activeTab]);

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
        inboxSearchQuery={inboxSearchQuery}
        myListings={myListings}
        notifications={notifications}
        onAcceptTicket={onAcceptTicket}
        onCancelTicket={onCancelTicket}
        onClearNotifications={onClearNotifications}
        onClearHistory={onClearHistory}
        tickets={tickets}
        receivedTickets={receivedTickets}
        onCancelEditListing={onCancelEditListing}
        onChangePassword={onChangePassword}
        onDeleteListings={onDeleteListings}
        onCreateEvent={onCreateEvent}
        onMarkAllRead={onMarkAllRead}
        onMarkTicketUsed={onMarkTicketUsed}
        onDeleteNotification={onDeleteNotification}
        onOpenNotification={onOpenNotification}
        onOpenTicket={onOpenTicket}
        onOpenCategory={handleOpenCategory}
        onRemoveHistoryItem={onRemoveHistoryItem}
        onRefresh={onRefresh}
        onSelectEvent={onSelectEvent}
        onSignOut={onSignOut}
        onStartEditListing={onStartEditListing}
        onTabChange={onTabChange}
        onToggleEmailNotifications={onToggleEmailNotifications}
        onTogglePushNotifications={onTogglePushNotifications}
        onToggleSave={onToggleSave}
        onToggleVibe={onToggleVibe}
        onUpdateProfile={onUpdateProfile}
        profile={profile}
        refreshing={refreshing}
        savedEvents={savedEvents}
        ticketSearchQuery={ticketSearchQuery}
        unreadNotificationCount={unreadNotificationCount}
        onProfileHeaderModeChange={setProfileHeaderMode}
      />
    ) : (
      <AnimatedFlatList
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
        refreshControl={
          <RefreshControl
            colors={[theme.colors.accentStrong]}
            progressBackgroundColor={theme.colors.surfaceStrong}
            refreshing={refreshing}
            tintColor={theme.colors.accentStrong}
            onRefresh={() => void handleDiscoverRefresh()}
          />
        }
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
            {activeCategory !== 'all' ? (
              <View style={styles.categoryFeedBanner}>
                <View style={styles.categoryFeedIcon}>
                  <Feather color={theme.colors.accentStrong} name={(activeCategoryDetails?.icon as FeatherName) ?? 'grid'} size={15} />
                </View>
                <View style={styles.categoryFeedCopy}>
                  <Text style={styles.categoryFeedTitle}>{categoryFeedTitle}</Text>
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
                  <Pressable
                    key={spotlightEvent.id}
                    delayLongPress={120}
                    onPress={() => onSelectEvent(spotlightEvent)}
                    style={[styles.spotlightCard, { width: spotlightCardWidth }]}
                  >
                    <Image
                      source={spotlightEvent.ticketImage ?? spotlightEvent.image}
                      contentFit="cover"
                      style={styles.spotlightImage}
                      transition={200}
                    />
                    <LinearGradient
                      colors={['rgba(8,10,14,0.02)', 'rgba(8,10,14,0.9)']}
                      start={{ x: 0.4, y: 0.12 }}
                      end={{ x: 0.5, y: 1 }}
                      style={styles.spotlightImageFade}
                    />
                    <LinearGradient
                      colors={['rgba(242,34,28,0.26)', 'rgba(242,34,28,0)']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0.75 }}
                      style={styles.spotlightBrandWash}
                    />
                    <View style={styles.spotlightContent}>
                      <View style={styles.spotlightBody}>
                        <View style={styles.spotlightBadge}>
                          <View style={styles.spotlightDot} />
                          <Text style={styles.spotlightBadgeText}>Spotlight</Text>
                        </View>
                        <View style={styles.spotlightTitleRow}>
                          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.spotlightTitle}>
                            {spotlightEvent.artist || spotlightEvent.title}
                          </Text>
                          {spotlightEvent.isVerified ? <VerifiedBadge /> : null}
                        </View>
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
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}

            <SectionHeader
              title={activeCategory === 'all' ? 'Mixed Vibes' : `${categoryFeedTitle} feed`}
              actionLabel="Find nearby"
              actionArrow
              onActionPress={onOpenNearby}
            />
          </>
        }
        renderItem={({ item }) => (
          <EventCard
            event={item}
            isPreviewActive={previewEventId === item.id}
            onPress={() => onSelectEvent(item)}
            onToggleSave={() => onToggleSave(item)}
            userLocation={homeUserLocation}
          />
        )}
      />
    );

  return (
    <View style={styles.root}>
      <ScreenTransition key={activeTab} direction={tabDirection} distance={42}>
        {activeTab === 'discover' ? (
          <Animated.View
            {...categorySwipeResponder.panHandlers}
            style={[styles.categorySwipeSurface, { transform: [{ translateX: categorySwipeX }] }]}
          >
            {content}
            {previousCategory ? (
              <CategorySwipePreview
                category={previousCategory}
                left={-width}
                paddingTop={
                  insets.top +
                  FLOATING_HEADER_TOP_PADDING +
                  FLOATING_HEADER_HEIGHT +
                  FLOATING_CATEGORY_RAIL_HEIGHT +
                  FLOATING_HEADER_GAP +
                  12
                }
                width={width}
              />
            ) : null}
            {nextCategory ? (
              <CategorySwipePreview
                category={nextCategory}
                left={width}
                paddingTop={
                  insets.top +
                  FLOATING_HEADER_TOP_PADDING +
                  FLOATING_HEADER_HEIGHT +
                  FLOATING_CATEGORY_RAIL_HEIGHT +
                  FLOATING_HEADER_GAP +
                  12
                }
                width={width}
              />
            ) : null}
          </Animated.View>
        ) : (
          content
        )}
      </ScreenTransition>

      {activeTab === 'discover' ? (
      <DiscoverFloatingHeaderLayer
        activeCategory={activeCategory}
        categories={categories}
        categoryLayoutsRef={categoryLayoutsRef}
        categoryRailRef={categoryRailRef}
        categorySwipeX={categorySwipeX}
        floatingSearchProgress={floatingSearchRevealProgress}
        floatingSearchVisible={floatingSearchVisible}
        inputRef={floatingSearchInputRef}
        isFocused={isSearchFocused}
        menuOpen={menuOpen}
        onCloseSearch={handleCloseSearch}
        onOpenCategory={handleOpenCategory}
        onOpenNearby={onOpenNearby}
        onOpenSearch={onOpenSearch}
        onSearchSuggestionPress={handleSearchSuggestionPress}
        profile={profile}
        query={searchQuery}
        safeTop={insets.top}
        screenWidth={width}
        searchSuggestions={searchSuggestions}
        onBlur={() => setIsSearchFocused(false)}
        onChangeText={setSearchQuery}
        onFocus={() => setIsSearchFocused(true)}
        onToggleMenu={() => setMenuOpen((current) => !current)}
        showMenuTapCue={showMenuTapCue}
      />
      ) : null}

      {activeTab === 'create' || activeTab === 'inbox' || activeTab === 'profile' ? (
        <FixedAppHeaderLayer
          activeCategory={activeCategory}
          categories={categories}
          categoryLayoutsRef={categoryLayoutsRef}
          categoryRailRef={categoryRailRef}
          categorySwipeResponder={categorySwipeResponder.panHandlers}
          categorySwipeX={categorySwipeX}
          headerMode={activeTab === 'inbox' ? 'inbox' : activeTab === 'profile' && profileHeaderMode === 'tickets' ? 'tickets' : 'default'}
          inboxInputRef={activeTab === 'profile' && profileHeaderMode === 'tickets' ? ticketSearchInputRef : inboxSearchInputRef}
          inboxIsFocused={activeTab === 'profile' && profileHeaderMode === 'tickets' ? isTicketSearchFocused : isInboxSearchFocused}
          inboxQuery={activeTab === 'profile' && profileHeaderMode === 'tickets' ? ticketSearchQuery : inboxSearchQuery}
          menuOpen={menuOpen}
          onInboxBlur={() => (activeTab === 'profile' && profileHeaderMode === 'tickets' ? setIsTicketSearchFocused(false) : setIsInboxSearchFocused(false))}
          onInboxChangeText={activeTab === 'profile' && profileHeaderMode === 'tickets' ? setTicketSearchQuery : setInboxSearchQuery}
          onInboxFocus={() => (activeTab === 'profile' && profileHeaderMode === 'tickets' ? setIsTicketSearchFocused(true) : setIsInboxSearchFocused(true))}
          onOpenCategory={handleOpenCategory}
          onOpenNearby={onOpenNearby}
          profile={profile}
          safeTop={insets.top}
          screenWidth={width}
          onToggleMenu={() => setMenuOpen((current) => !current)}
          showMenuTapCue={showMenuTapCue}
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
        topOffset={0}
        translateX={menuTranslate}
        width={Math.min(width * 0.76, 320)}
      />
    </View>
  );
}

function SearchShell({
  hints = SEARCH_HINTS,
  inputRef,
  isFocused,
  leadingIcon = 'search',
  leadingIconAccessibilityLabel = 'Search action',
  leadingIconColor = theme.colors.textMuted,
  onLeadingIconPress,
  query,
  onBlur,
  onChangeText,
  onFocus,
  onSubmitSearch,
  onSuggestionPress,
  showSuggestions = false,
  style,
  suggestions = [],
}: {
  hints?: string[];
  inputRef: React.RefObject<TextInput | null>;
  isFocused: boolean;
  leadingIcon?: FeatherName;
  leadingIconAccessibilityLabel?: string;
  leadingIconColor?: string;
  onLeadingIconPress?: () => void;
  query: string;
  onBlur: () => void;
  onChangeText: (value: string) => void;
  onFocus: () => void;
  onSubmitSearch?: (query: string) => void;
  onSuggestionPress?: (suggestion: AppSearchSuggestion) => void;
  showSuggestions?: boolean;
  style?: StyleProp<ViewStyle>;
  suggestions?: AppSearchSuggestion[];
}) {
  const leadingIconNode = <Feather color={leadingIconColor} name={leadingIcon} size={18} />;
  const visibleSuggestions = showSuggestions ? suggestions.slice(0, 8) : [];

  return (
    <View style={[styles.searchShell, style]}>
      {onLeadingIconPress ? (
        <Pressable
          accessibilityLabel={leadingIconAccessibilityLabel}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onLeadingIconPress}
          style={styles.searchLeadingIconButton}
        >
          {leadingIconNode}
        </Pressable>
      ) : (
        <View style={styles.searchLeadingIconStatic}>{leadingIconNode}</View>
      )}
      <View style={styles.searchInputWrap}>
        {!query && !isFocused ? <JellySearchPlaceholder phrases={hints} /> : null}
        <TextInput
          onSubmitEditing={() => {
            if (query.trim().length > 0) {
              onSubmitSearch?.(query);
            }
          }}
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
      {visibleSuggestions.length > 0 ? (
        <View style={styles.searchSuggestionsPanel}>
          {visibleSuggestions.map((suggestion) => (
            <Pressable
              key={suggestion.id}
              accessibilityRole="button"
              onPress={() => onSuggestionPress?.(suggestion)}
              style={styles.searchSuggestionRow}
            >
              <View style={styles.searchSuggestionIcon}>
                <Feather color={theme.colors.accentStrong} name={getSearchSuggestionIcon(suggestion.type)} size={14} />
              </View>
              <View style={styles.searchSuggestionCopy}>
                <Text numberOfLines={1} style={styles.searchSuggestionLabel}>{suggestion.label}</Text>
                {suggestion.hint ? (
                  <Text numberOfLines={1} style={styles.searchSuggestionHint}>{suggestion.hint}</Text>
                ) : null}
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function SearchLaunchShell({
  hints = SEARCH_HINTS,
  leadingIcon = 'search',
  leadingIconAccessibilityLabel = 'Search action',
  leadingIconColor = theme.colors.textMuted,
  onLeadingIconPress,
  onPress,
  style,
}: {
  hints?: string[];
  leadingIcon?: FeatherName;
  leadingIconAccessibilityLabel?: string;
  leadingIconColor?: string;
  onLeadingIconPress?: () => void;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const leadingIconNode = <Feather color={leadingIconColor} name={leadingIcon} size={18} />;

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.searchShell, style]}>
      {onLeadingIconPress ? (
        <Pressable
          accessibilityLabel={leadingIconAccessibilityLabel}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onLeadingIconPress}
          style={styles.searchLeadingIconButton}
        >
          {leadingIconNode}
        </Pressable>
      ) : (
        <View style={styles.searchLeadingIconStatic}>{leadingIconNode}</View>
      )}
      <View style={styles.searchInputWrap} pointerEvents="none">
        <JellySearchPlaceholder phrases={hints} />
      </View>
      <View style={styles.searchDivider} />
      <Feather color={theme.colors.textMuted} name={'sliders' as FeatherName} size={16} />
    </Pressable>
  );
}

function JellySearchPlaceholder({ phrases }: { phrases: string[] }) {
  const phraseKey = phrases.join('|');
  const normalizedPhrases = useMemo(() => phrases.filter((phrase) => phrase.trim().length > 0), [phraseKey]);
  const [phraseIndex, setPhraseIndex] = useState(0);
  const motion = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (normalizedPhrases.length === 0) {
      return;
    }

    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    setPhraseIndex(0);
    motion.setValue(1);

    const scheduleNextPhrase = () => {
      timeoutId = setTimeout(() => {
        Animated.timing(motion, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(({ finished: didFinish }) => {
          if (!didFinish || cancelled) {
            return;
          }

          setPhraseIndex((current) => (current + 1) % normalizedPhrases.length);
          motion.setValue(0);

          Animated.timing(motion, {
            toValue: 1,
            duration: 260,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start(({ finished }) => {
            if (finished && !cancelled) {
              scheduleNextPhrase();
            }
          });
        });
      }, 2200);
    };

    scheduleNextPhrase();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      motion.stopAnimation();
    };
  }, [motion, normalizedPhrases.length, phraseKey]);

  const phrase = normalizedPhrases[phraseIndex % Math.max(normalizedPhrases.length, 1)];

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
            inputRange: [0, 1],
            outputRange: [0, 0.52],
          }),
          transform: [
            {
              translateY: motion.interpolate({
                inputRange: [0, 1],
                outputRange: [5, 0],
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

function getSearchSuggestionIcon(type: AppSearchSuggestion['type']): FeatherName {
  switch (type) {
    case 'nearby':
      return 'map-pin';
    case 'listing':
      return 'coffee';
    case 'category':
      return 'grid';
    case 'tag':
      return 'hash' as FeatherName;
    case 'recent':
      return 'clock';
    case 'popular':
    default:
      return 'search';
  }
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
  inboxSearchQuery,
  myListings,
  notifications,
  onAcceptTicket,
  onCancelTicket,
  onClearNotifications,
  onClearHistory,
  tickets,
  receivedTickets,
  onCancelEditListing,
  onChangePassword,
  onDeleteListings,
  onCreateEvent,
  onMarkAllRead,
  onMarkTicketUsed,
  onDeleteNotification,
  onOpenNotification,
  onOpenTicket,
  onOpenCategory,
  onProfileHeaderModeChange,
  onRemoveHistoryItem,
  onRefresh,
  onSelectEvent,
  onSignOut,
  onStartEditListing,
  onTabChange,
  onToggleEmailNotifications,
  onTogglePushNotifications,
  onToggleSave,
  onToggleVibe,
  onUpdateProfile,
  profile,
  refreshing,
  savedEvents,
  ticketSearchQuery,
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
  inboxSearchQuery: string;
  myListings: AppEvent[];
  notifications: AppNotification[];
  onAcceptTicket: (ticket: AppTicket) => Promise<void>;
  onCancelTicket: (ticket: AppTicket) => Promise<void>;
  onClearNotifications: () => Promise<void>;
  onClearHistory: () => Promise<void>;
  tickets: AppTicket[];
  receivedTickets: AppTicket[];
  onCancelEditListing: () => void;
  onChangePassword: (input: ChangePasswordInput) => Promise<{ message: string }>;
  onDeleteListings: (eventIds: string[]) => Promise<void>;
  onCreateEvent: (input: CreateAppEventInput) => Promise<void>;
  onMarkAllRead: () => void;
  onMarkTicketUsed: (ticket: AppTicket) => Promise<void>;
  onDeleteNotification: (notification: AppNotification) => Promise<void>;
  onOpenNotification: (notification: AppNotification) => void;
  onOpenTicket: (ticket: AppTicket) => void;
  onOpenCategory: (categoryId: CategoryId) => void;
  onProfileHeaderModeChange: (mode: 'default' | 'tickets') => void;
  onRemoveHistoryItem: (event: AppEvent) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSelectEvent: (event: AppEvent) => void;
  onSignOut: () => void;
  onStartEditListing: (event: AppEvent) => void;
  onTabChange: (tab: TabId) => void;
  onToggleEmailNotifications: (enabled: boolean) => Promise<AppUser>;
  onTogglePushNotifications: (enabled: boolean) => Promise<AppUser>;
  onToggleSave: (event: AppEvent) => void;
  onToggleVibe: (event: AppEvent) => void;
  onUpdateProfile: (input: UpdateProfileInput) => Promise<AppUser>;
  profile: AppUser | null;
  refreshing: boolean;
  savedEvents: AppEvent[];
  ticketSearchQuery: string;
  unreadNotificationCount: number;
}) {
  if (activeTab === 'stream') {
    return (
      <StreamTabView
        events={events}
        onRefresh={onRefresh}
        onSelectEvent={onSelectEvent}
        onToggleVibe={onToggleVibe}
        refreshing={refreshing}
      />
    );
  }

  return (
    <ScrollView
      contentContainerStyle={contentPadding}
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
          searchQuery={inboxSearchQuery}
          onAcceptTicket={onAcceptTicket}
          onClearNotifications={onClearNotifications}
          onDeleteNotification={onDeleteNotification}
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
          onHeaderModeChange={onProfileHeaderModeChange}
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
          ticketSearchQuery={ticketSearchQuery}
          tickets={tickets}
          unreadCount={unreadNotificationCount}
          onSelectEvent={onSelectEvent}
        />
      ) : null}
    </ScrollView>
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
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={styles.locationText}>
          Bites n Vibes | Explore Nearby
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function DiscoverFloatingHeaderLayer({
  activeCategory,
  categories,
  categoryLayoutsRef,
  categoryRailRef,
  categorySwipeX,
  floatingSearchProgress,
  floatingSearchVisible,
  inputRef,
  isFocused,
  menuOpen,
  onOpenNearby,
  onOpenSearch,
  profile,
  query,
  safeTop,
  screenWidth,
  onBlur,
  onChangeText,
  onCloseSearch,
  onFocus,
  onOpenCategory,
  onToggleMenu,
  onSearchSuggestionPress,
  showMenuTapCue,
  searchSuggestions,
}: {
  activeCategory: CategoryId;
  categories: AppCategory[];
  categoryLayoutsRef: React.MutableRefObject<Partial<Record<CategoryId, { width: number; x: number }>>>;
  categoryRailRef: React.RefObject<ScrollView | null>;
  categorySwipeX: Animated.Value;
  floatingSearchProgress: Animated.AnimatedInterpolation<string | number>;
  floatingSearchVisible: boolean;
  inputRef: React.RefObject<TextInput | null>;
  isFocused: boolean;
  menuOpen: boolean;
  onOpenNearby: () => void;
  onOpenSearch: () => void;
  profile?: AppUser | null;
  query: string;
  safeTop: number;
  screenWidth: number;
  onBlur: () => void;
  onChangeText: (value: string) => void;
  onCloseSearch: () => void;
  onFocus: () => void;
  onOpenCategory: (categoryId: CategoryId) => void;
  onToggleMenu: () => void;
  onSearchSuggestionPress: (suggestion: AppSearchSuggestion) => void;
  showMenuTapCue: boolean;
  searchSuggestions: AppSearchSuggestion[];
}) {
  const avatarSource = profile?.avatar ? profile.avatar : APP_LOGO;
  const hasSearchQuery = query.trim().length > 0;
  const currentIndex = categories.findIndex((category) => category.id === activeCategory);
  const currentLayout = categoryLayoutsRef.current[activeCategory];
  const previousLayout = currentIndex > 0 ? categoryLayoutsRef.current[categories[currentIndex - 1]?.id] : currentLayout;
  const nextLayout =
    currentIndex >= 0 && currentIndex < categories.length - 1
      ? categoryLayoutsRef.current[categories[currentIndex + 1]?.id]
      : currentLayout;
  const indicatorX = categorySwipeX.interpolate({
    inputRange: [-Math.max(1, screenWidth), 0, Math.max(1, screenWidth)],
    outputRange: [nextLayout?.x ?? currentLayout?.x ?? 0, currentLayout?.x ?? 0, previousLayout?.x ?? currentLayout?.x ?? 0],
    extrapolate: 'clamp',
  });
  const indicatorWidth = categorySwipeX.interpolate({
    inputRange: [-Math.max(1, screenWidth), 0, Math.max(1, screenWidth)],
    outputRange: [
      nextLayout?.width ?? currentLayout?.width ?? 0,
      currentLayout?.width ?? 0,
      previousLayout?.width ?? currentLayout?.width ?? 0,
    ],
    extrapolate: 'clamp',
  });

  return (
    <View pointerEvents="box-none" style={[styles.floatingHeaderWrap, { paddingTop: safeTop + FLOATING_HEADER_TOP_PADDING }]}>
      <View style={styles.floatingHeaderShell}>
        <View style={styles.floatingHeaderRow}>
          <View style={styles.menuButtonTarget}>
            <IconButton
              compact
              darkGlass
              icon={menuOpen ? 'x' : 'menu'}
              onPress={onToggleMenu}
              accessibilityLabel={menuOpen ? 'Close menu' : 'Open menu'}
            />
            {showMenuTapCue ? <OnboardingTapCue iconSize={27} size={38} style={styles.menuTapCue} /> : null}
          </View>

          <View pointerEvents="box-none" style={styles.floatingCenterRail}>
            <Animated.View
              pointerEvents={floatingSearchVisible || isFocused ? 'none' : 'auto'}
              style={[
                styles.floatingLocationLayer,
                {
                  opacity: floatingSearchProgress.interpolate({
                    inputRange: [0, 0.54, 1],
                    outputRange: isFocused ? [0, 0, 0] : [1, 0.16, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      translateY: floatingSearchProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, -7],
                        extrapolate: 'clamp',
                      }),
                    },
                    {
                      scaleX: floatingSearchProgress.interpolate({
                        inputRange: [0, 0.68, 1],
                        outputRange: [1, 1.01, 0.96],
                        extrapolate: 'clamp',
                      }),
                    },
                    {
                      scaleY: floatingSearchProgress.interpolate({
                        inputRange: [0, 0.68, 1],
                        outputRange: [1, 0.992, 0.94],
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
                    outputRange: isFocused ? [1, 1, 1] : [0, 0.1, 1],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      translateY: floatingSearchProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [10, 0],
                        extrapolate: 'clamp',
                      }),
                    },
                    {
                      scaleX: floatingSearchProgress.interpolate({
                        inputRange: [0, 0.66, 1],
                        outputRange: [0.95, 1.008, 1],
                        extrapolate: 'clamp',
                      }),
                    },
                    {
                      scaleY: floatingSearchProgress.interpolate({
                        inputRange: [0, 0.66, 1],
                        outputRange: [1.035, 0.986, 1],
                        extrapolate: 'clamp',
                      }),
                    },
                  ],
                },
              ]}
            >
              <SearchLaunchShell
                leadingIcon={(hasSearchQuery ? 'chevron-left' : 'map-pin') as FeatherName}
                leadingIconAccessibilityLabel={hasSearchQuery ? 'Clear search' : 'Explore nearby'}
                leadingIconColor={theme.colors.accentStrong}
                onLeadingIconPress={hasSearchQuery ? onCloseSearch : onOpenNearby}
                onPress={onOpenSearch}
                style={styles.floatingSearchShell}
              />
            </Animated.View>
          </View>

          <View style={styles.avatar}>
            <Image source={avatarSource} contentFit="cover" style={styles.avatarImage} transition={120} />
          </View>
        </View>

        <ScrollView
          ref={categoryRailRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.floatingCategoryRow}
        >
          {currentLayout ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.headerCategoryMovingUnderline,
                {
                  width: indicatorWidth,
                  transform: [{ translateX: indicatorX }],
                },
              ]}
            />
          ) : null}
          {categories.map((category) => (
            <View
              key={category.id}
              onLayout={(event) => {
                categoryLayoutsRef.current[category.id] = event.nativeEvent.layout;
              }}
            >
              <HeaderCategoryTab
                active={category.id === activeCategory}
                label={category.name}
                onPress={() => onOpenCategory(category.id)}
                showUnderline={false}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function FixedAppHeaderLayer({
  activeCategory,
  categories,
  categoryLayoutsRef,
  categoryRailRef,
  categorySwipeResponder,
  categorySwipeX,
  headerMode,
  inboxInputRef,
  inboxIsFocused,
  inboxQuery,
  menuOpen,
  onInboxBlur,
  onInboxChangeText,
  onInboxFocus,
  onOpenCategory,
  onOpenNearby,
  profile,
  safeTop,
  screenWidth,
  onToggleMenu,
  showMenuTapCue,
}: {
  activeCategory: CategoryId;
  categories: AppCategory[];
  categoryLayoutsRef: React.MutableRefObject<Partial<Record<CategoryId, { width: number; x: number }>>>;
  categoryRailRef: React.RefObject<ScrollView | null>;
  categorySwipeResponder: GestureResponderHandlers;
  categorySwipeX: Animated.Value;
  headerMode: 'default' | 'inbox' | 'tickets';
  inboxInputRef: React.RefObject<TextInput | null>;
  inboxIsFocused: boolean;
  inboxQuery: string;
  menuOpen: boolean;
  onInboxBlur: () => void;
  onInboxChangeText: (value: string) => void;
  onInboxFocus: () => void;
  onOpenCategory: (categoryId: CategoryId) => void;
  onOpenNearby: () => void;
  profile?: AppUser | null;
  safeTop: number;
  screenWidth: number;
  onToggleMenu: () => void;
  showMenuTapCue: boolean;
}) {
  const avatarSource = profile?.avatar ? profile.avatar : APP_LOGO;
  const currentIndex = categories.findIndex((category) => category.id === activeCategory);
  const currentLayout = categoryLayoutsRef.current[activeCategory];
  const previousLayout = currentIndex > 0 ? categoryLayoutsRef.current[categories[currentIndex - 1]?.id] : currentLayout;
  const nextLayout =
    currentIndex >= 0 && currentIndex < categories.length - 1
      ? categoryLayoutsRef.current[categories[currentIndex + 1]?.id]
      : currentLayout;
  const indicatorX = categorySwipeX.interpolate({
    inputRange: [-Math.max(1, screenWidth), 0, Math.max(1, screenWidth)],
    outputRange: [nextLayout?.x ?? currentLayout?.x ?? 0, currentLayout?.x ?? 0, previousLayout?.x ?? currentLayout?.x ?? 0],
    extrapolate: 'clamp',
  });
  const indicatorWidth = categorySwipeX.interpolate({
    inputRange: [-Math.max(1, screenWidth), 0, Math.max(1, screenWidth)],
    outputRange: [
      nextLayout?.width ?? currentLayout?.width ?? 0,
      currentLayout?.width ?? 0,
      previousLayout?.width ?? currentLayout?.width ?? 0,
    ],
    extrapolate: 'clamp',
  });

  return (
    <View pointerEvents="box-none" style={[styles.floatingHeaderWrap, { paddingTop: safeTop + FLOATING_HEADER_TOP_PADDING }]}>
      <View style={styles.floatingHeaderShell}>
        <View style={styles.floatingHeaderRow}>
          <View style={styles.menuButtonTarget}>
            <IconButton
              compact
              darkGlass
              icon={menuOpen ? 'x' : 'menu'}
              onPress={onToggleMenu}
              accessibilityLabel={menuOpen ? 'Close menu' : 'Open menu'}
            />
            {showMenuTapCue ? <OnboardingTapCue iconSize={27} size={38} style={styles.menuTapCue} /> : null}
          </View>

          <View style={styles.fixedHeaderCenter}>
            {headerMode === 'inbox' || headerMode === 'tickets' ? (
              <SearchShell
                hints={[headerMode === 'tickets' ? 'Search tickets' : 'Search inbox']}
                inputRef={inboxInputRef}
                isFocused={inboxIsFocused}
                query={inboxQuery}
                onBlur={onInboxBlur}
                onChangeText={onInboxChangeText}
                onFocus={onInboxFocus}
                style={styles.floatingSearchShell}
              />
            ) : (
              <NearbyTrigger onPress={onOpenNearby} style={styles.floatingLocationChip} />
            )}
          </View>

          <View style={styles.avatar}>
            <Image source={avatarSource} contentFit="cover" style={styles.avatarImage} transition={120} />
          </View>
        </View>

        <ScrollView
          {...categorySwipeResponder}
          ref={categoryRailRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.floatingCategoryRow}
        >
          {currentLayout ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.headerCategoryMovingUnderline,
                {
                  width: indicatorWidth,
                  transform: [{ translateX: indicatorX }],
                },
              ]}
            />
          ) : null}
          {categories.map((category) => (
            <View
              key={category.id}
              onLayout={(event) => {
                categoryLayoutsRef.current[category.id] = event.nativeEvent.layout;
              }}
            >
              <HeaderCategoryTab
                active={category.id === activeCategory}
                label={category.name}
                onPress={() => onOpenCategory(category.id)}
                showUnderline={false}
              />
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

function HeaderCategoryTab({
  active,
  label,
  onPress,
  showUnderline = true,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  showUnderline?: boolean;
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.025,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable accessibilityRole="button" onPress={onPress} onPressIn={jelly.onPressIn} onPressOut={jelly.onPressOut}>
      <Animated.View style={[styles.headerCategoryTab, jelly.animatedStyle]}>
        <Text numberOfLines={1} style={[styles.headerCategoryText, active && styles.headerCategoryTextActive]}>
          {label}
        </Text>
        {showUnderline ? <View style={[styles.headerCategoryUnderline, active && styles.headerCategoryUnderlineActive]} /> : null}
      </Animated.View>
    </Pressable>
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
  topOffset,
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
  topOffset: number;
  translateX: Animated.Value;
  width: number;
}) {
  const avatarSource = profile?.avatar ? profile.avatar : APP_LOGO;

  return (
    <View pointerEvents={menuOpen ? 'auto' : 'box-none'} style={[StyleSheet.absoluteFillObject, styles.drawerLayer, { top: topOffset }]}>
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
          contentContainerStyle={[styles.drawerScrollContent, topOffset > 0 && styles.drawerScrollContentBelowTopNav]}
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

function CategorySwipePreview({
  category,
  left,
  paddingTop,
  width,
}: {
  category: AppCategory;
  left: number;
  paddingTop: number;
  width: number;
}) {
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 1250,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 1250,
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
      outputRange: [0.36, 0.78],
    }),
  };

  return (
    <View
      pointerEvents="none"
      style={[
        styles.categorySwipePreview,
        {
          left,
          paddingTop,
          width,
        },
      ]}
    >
      <View style={styles.categorySwipePreviewBanner}>
        <View style={styles.categorySwipePreviewIcon}>
          <Feather color={theme.colors.accentStrong} name={(category.icon as FeatherName) ?? 'grid'} size={15} />
        </View>
        <View style={styles.categorySwipePreviewCopy}>
          <Text style={styles.categorySwipePreviewTitle}>{category.name}</Text>
          <Animated.View style={[styles.categorySwipePreviewLine, { width: '54%' }, animatedStyle]} />
        </View>
      </View>
      <Animated.View style={[styles.categorySwipeSpotlightSkeleton, animatedStyle]} />
      <View style={styles.categorySwipeSectionRow}>
        <Animated.View style={[styles.categorySwipeHeadingSkeleton, animatedStyle]} />
        <Animated.View style={[styles.categorySwipeActionSkeleton, animatedStyle]} />
      </View>
      <Animated.View style={[styles.categorySwipeCardSkeleton, animatedStyle]} />
      <Animated.View style={[styles.categorySwipeCardSkeleton, animatedStyle]} />
    </View>
  );
}

function EventCard({
  event,
  isPreviewActive,
  onPress,
  onToggleSave,
  userLocation,
}: {
  event: AppEvent;
  isPreviewActive: boolean;
  onPress: () => void;
  onToggleSave: () => void;
  userLocation: UserCoordinates | null;
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
  const distanceKm = userLocation
    ? calculateDistanceKm(
        userLocation.latitude,
        userLocation.longitude,
        event.location.latitude,
        event.location.longitude,
      )
    : null;
  const locationMeta = distanceKm == null
    ? `${event.city}  -  ${event.time}`
    : `${event.city}  -  ${getHomeDistanceLabel(distanceKm)}  -  ${event.time}`;

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

          {(event.ratingCount ?? 0) > 0 ? (
            <View style={styles.ratingChip}>
              <Feather color="#FBBF24" name={'star' as FeatherName} size={12} />
              <Text style={styles.ratingText}>{formatRatingSummary(event)}</Text>
            </View>
          ) : null}

          <View style={styles.saveChip}>
            <MiniSaveAction saved={event.isSaved} onPress={onToggleSave} />
          </View>

          <View style={styles.cardFooter}>
            <View style={styles.cardTextBlock}>
              <View style={styles.cardTitleRow}>
                <Text numberOfLines={1} ellipsizeMode="tail" style={styles.cardTitle}>
                  {event.title}
                </Text>
                {event.isVerified || previewVideo ? (
                  <View style={styles.cardTitleBadgeGroup}>
                    {event.isVerified ? <VerifiedBadge /> : null}
                    {previewVideo ? <PreviewBadge /> : null}
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={1} style={styles.cardMeta}>
                {locationMeta}
              </Text>
              <Text numberOfLines={2} style={styles.cardAbout}>
                {event.blurb || event.about}
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

function VerifiedBadge() {
  return (
    <View style={styles.verifiedBadge}>
      <Feather color={theme.colors.white} name={'check' as FeatherName} size={9} />
      <Text style={styles.verifiedBadgeText}>Verified</Text>
    </View>
  );
}

function PreviewBadge() {
  return (
    <View style={styles.previewBadge}>
      <Feather color={theme.colors.white} name={'play-circle' as FeatherName} size={9} />
      <Text style={styles.previewBadgeText}>Preview</Text>
    </View>
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

function eventMatchesFeedFilters(event: AppEvent, activeCategory: CategoryId, searchQuery: string) {
  const matchesCategory =
    activeCategory === 'all' || event.categories.some((category) => category.id === activeCategory);
  const query = searchQuery.trim().toLowerCase();
  const matchesQuery =
    query.length === 0 ||
    [event.artist, event.title, event.city, event.venue].some((value) => value.toLowerCase().includes(query));

  return matchesCategory && matchesQuery;
}

function buildLocalSearchSuggestions(
  query: string,
  activeCategory: CategoryId,
  categories: AppCategory[],
  events: AppEvent[],
) {
  const normalizedQuery = query.trim().toLowerCase();
  const suggestions: AppSearchSuggestion[] = [];
  const seen = new Set<string>();

  const addSuggestion = (suggestion: AppSearchSuggestion) => {
    const key = suggestion.query.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return;
    }
    seen.add(key);
    suggestions.push(suggestion);
  };

  if (!normalizedQuery || 'near me'.includes(normalizedQuery) || 'nearby'.includes(normalizedQuery)) {
    addSuggestion({
      id: 'local-near-me',
      label: 'Near me',
      query: 'near me',
      type: 'nearby',
      hint: 'Closest listings around you',
    });
  }

  ['Pizza', 'Fast food', 'Restaurants', 'Tonight', 'Live music'].forEach((phrase, index) => {
    if (!normalizedQuery || phrase.toLowerCase().includes(normalizedQuery)) {
      addSuggestion({
        id: `local-popular-${index}`,
        label: phrase,
        query: phrase,
        type: 'popular',
        hint: 'Popular search',
      });
    }
  });

  categories
    .filter((category) => category.id !== 'all')
    .filter((category) => !normalizedQuery || category.name.toLowerCase().includes(normalizedQuery))
    .slice(0, 3)
    .forEach((category) => {
      addSuggestion({
        id: `local-category-${category.id}`,
        label: category.name,
        query: category.name,
        type: 'category',
        hint: 'Category',
      });
    });

  events
    .filter((event) => eventMatchesFeedFilters(event, activeCategory, query))
    .slice(0, 4)
    .forEach((event) => {
      addSuggestion({
        id: `local-listing-${event.id}`,
        label: event.title,
        query: event.title,
        type: 'listing',
        hint: event.city,
      });
    });

  return suggestions.slice(0, 8);
}

async function fetchForYouCategoryEvents(categories: AppCategory[], searchQuery: string) {
  const feedCategories = categories.filter((category) => category.id !== 'all');
  const categoryPages = await Promise.allSettled(
    feedCategories.map((category) =>
      fetchAppFeed({
        categories,
        categoryId: category.id,
        page: 1,
        pageSize: FOR_YOU_CATEGORY_PAGE_SIZE,
        search: searchQuery,
      }),
    ),
  );

  return categoryPages.flatMap((result) => (result.status === 'fulfilled' ? result.value.events : []));
}

function mergeUniqueEvents(...eventGroups: AppEvent[][]) {
  const seen = new Set<string>();
  const merged: AppEvent[] = [];

  eventGroups.flat().forEach((event) => {
    if (seen.has(event.id)) {
      return;
    }

    seen.add(event.id);
    merged.push(event);
  });

  return merged;
}

function buildForYouMingledEvents(sourceEvents: AppEvent[]) {
  const uniqueEvents = mergeUniqueEvents(sourceEvents);
  const buckets = new Map<CategoryId, Array<{ event: AppEvent; score: number }>>();
  const categoryOrder: CategoryId[] = [];

  uniqueEvents.forEach((event, index) => {
    const categoryId = event.categories[0]?.id ?? 'uncategorized';
    if (!buckets.has(categoryId)) {
      buckets.set(categoryId, []);
      categoryOrder.push(categoryId);
    }

    buckets.get(categoryId)?.push({
      event,
      score: getForYouEventScore(event, index),
    });
  });

  const orderedBuckets = categoryOrder
    .map((categoryId) => (buckets.get(categoryId) ?? []).sort((left, right) => right.score - left.score))
    .sort((left, right) => (right[0]?.score ?? 0) - (left[0]?.score ?? 0));
  const mingledEvents: AppEvent[] = [];
  let index = 0;
  let addedEvent = true;

  while (addedEvent) {
    addedEvent = false;
    orderedBuckets.forEach((bucket) => {
      const entry = bucket[index];
      if (entry) {
        mingledEvents.push(entry.event);
        addedEvent = true;
      }
    });
    index += 1;
  }

  return mingledEvents;
}

function getForYouEventScore(event: AppEvent, sourceIndex: number) {
  const createdAgeHours = event.createdAt ? Math.max(0, (Date.now() - Date.parse(event.createdAt)) / 3_600_000) : 240;
  const freshness = createdAgeHours <= 48 ? 22 : createdAgeHours <= 168 ? 13 : createdAgeHours <= 720 ? 6 : 0;

  return (
    (event.isSaved ? 120 : 0) +
    (event.isFeatured ? 36 : 0) +
    (event.isTrending ? 30 : 0) +
    (event.isVerified ? 8 : 0) +
    freshness +
    Math.min(event.rating * 5, 25) +
    Math.min((event.ratingCount ?? 0) * 1.4, 18) +
    Math.min(event.saveCount * 1.5, 30) +
    Math.min((event.commentCount ?? 0), 16) +
    Math.min((event.vibePercentage ?? 25) / 6, 14) -
    sourceIndex * 0.25
  );
}

function calculateDistanceKm(startLat: number, startLng: number, endLat: number, endLng: number) {
  if (![startLat, startLng, endLat, endLng].every(Number.isFinite)) {
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

function getHomeDistanceLabel(distanceKm: number) {
  const distance = formatHomeDistance(distanceKm);
  if (distanceKm <= 5) {
    return `Nearby  -  ${distance}`;
  }
  if (distanceKm <= 25) {
    return `Around you  -  ${distance}`;
  }
  return `${distance} away`;
}

function formatRatingSummary(event: AppEvent) {
  return `${event.rating.toFixed(1)}(${event.ratingCount ?? 0})`;
}

function formatHomeDistance(distanceKm: number) {
  if (distanceKm < 1) {
    return `${Math.max(100, Math.round(distanceKm * 1000))} m`;
  }

  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
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
  const scoredEvents = pool
    .map((event, index) => ({
      event,
      score: getSpotlightScore(event, index, activeCategory, todaySeed),
    }))
    .sort((left, right) => right.score - left.score);
  const signalCandidates = scoredEvents.filter((entry) => hasSpotlightSignal(entry.event));
  const spotlightCandidates = signalCandidates.length >= 4 ? signalCandidates : scoredEvents;

  if (activeCategory === 'all') {
    return mingleSpotlightByCategory(spotlightCandidates).slice(0, 4);
  }

  return spotlightCandidates
    .slice(0, 4)
    .map((entry) => entry.event);
}

function mingleSpotlightByCategory(scoredEvents: Array<{ event: AppEvent; score: number }>) {
  const buckets = new Map<CategoryId, Array<{ event: AppEvent; score: number }>>();
  const categoryOrder: CategoryId[] = [];

  scoredEvents.forEach((entry) => {
    const categoryId = entry.event.categories[0]?.id ?? 'uncategorized';
    if (!buckets.has(categoryId)) {
      buckets.set(categoryId, []);
      categoryOrder.push(categoryId);
    }

    buckets.get(categoryId)?.push(entry);
  });

  const orderedBuckets = categoryOrder
    .map((categoryId) => buckets.get(categoryId) ?? [])
    .sort((left, right) => (right[0]?.score ?? 0) - (left[0]?.score ?? 0));
  const mixedEvents: AppEvent[] = [];
  let index = 0;
  let addedEvent = true;

  while (addedEvent) {
    addedEvent = false;
    orderedBuckets.forEach((bucket) => {
      const entry = bucket[index];
      if (entry) {
        mixedEvents.push(entry.event);
        addedEvent = true;
      }
    });
    index += 1;
  }

  return mixedEvents;
}

function getSpotlightScore(event: AppEvent, index: number, activeCategory: CategoryId, seed: number) {
  const categoryMatch = activeCategory !== 'all' && event.categories.some((category) => category.id === activeCategory);
  const createdAgeHours = event.createdAt ? Math.max(0, (Date.now() - Date.parse(event.createdAt)) / 3_600_000) : 240;
  const freshness = getSpotlightFreshnessScore(createdAgeHours);
  const engagement = getSpotlightEngagementScore(event);
  const weakSignalPenalty = engagement <= 0 && !event.isFeatured && !event.isTrending && !event.isSaved ? 42 : 0;
  const stalePenalty = createdAgeHours > 720 && engagement <= 6 && !event.isFeatured ? 24 : 0;
  const rotation = seededSpotlightNoise(event.id, seed) * 6;

  return (
    (event.isFeatured ? 42 : 0) +
    (event.isSaved ? 70 : 0) +
    (event.isTrending ? 42 : 0) +
    (event.isVerified ? 8 : 0) +
    (categoryMatch ? 18 : 0) +
    freshness +
    engagement +
    Math.min((event.vibePercentage ?? 25) / 10, 10) +
    rotation -
    weakSignalPenalty -
    stalePenalty -
    index * 0.65
  );
}

function hasSpotlightSignal(event: AppEvent) {
  const createdAgeHours = event.createdAt ? Math.max(0, (Date.now() - Date.parse(event.createdAt)) / 3_600_000) : 240;
  return (
    event.isFeatured ||
    event.isTrending ||
    event.isSaved ||
    createdAgeHours <= 168 ||
    (event.ratingCount ?? 0) > 0 ||
    event.saveCount > 0 ||
    (event.commentCount ?? 0) > 0
  );
}

function getSpotlightFreshnessScore(createdAgeHours: number) {
  if (createdAgeHours <= 24) {
    return 42;
  }
  if (createdAgeHours <= 72) {
    return 34;
  }
  if (createdAgeHours <= 168) {
    return 24;
  }
  if (createdAgeHours <= 720) {
    return 9;
  }
  return 0;
}

function getSpotlightEngagementScore(event: AppEvent) {
  const ratingCount = event.ratingCount ?? 0;
  const commentCount = event.commentCount ?? 0;

  return (
    Math.min(ratingCount * 4.5, 36) +
    Math.min(event.saveCount * 3.2, 38) +
    Math.min(commentCount * 3.6, 32) +
    (ratingCount > 0 ? Math.min(event.rating * 3.2, 18) : 0)
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
    overflow: 'hidden',
  },
  categorySwipeSurface: {
    flex: 1,
  },
  categorySwipePreview: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    paddingHorizontal: 4,
    paddingBottom: 120,
    backgroundColor: 'transparent',
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
  menuButtonTarget: {
    position: 'relative',
    width: 36,
    height: 36,
  },
  menuTapCue: {
    top: -1,
    left: -1,
  },
  floatingHeaderWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 12,
    backgroundColor: 'rgba(12,15,23,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  floatingHeaderShell: {
    paddingHorizontal: 12,
    paddingBottom: 7,
    gap: 6,
  },
  floatingHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  floatingCenterRail: {
    flex: 1,
    minHeight: FLOATING_HEADER_HEIGHT,
    justifyContent: 'center',
  },
  fixedHeaderCenter: {
    flex: 1,
    minHeight: FLOATING_HEADER_HEIGHT,
    alignItems: 'center',
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
    minHeight: 36,
    marginBottom: 0,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(8,10,14,0.28)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  floatingLocationChip: {
    alignSelf: 'stretch',
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(8,10,14,0.28)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  locationChip: {
    maxWidth: '100%',
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: 11,
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationText: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: 'rgba(242,34,28,0.2)',
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
  searchLeadingIconButton: {
    width: 22,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchLeadingIconStatic: {
    width: 22,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
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
    opacity: 0.72,
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
  searchSuggestionsPanel: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(12,15,23,0.98)',
    overflow: 'hidden',
    zIndex: 30,
    elevation: 30,
    ...shadow,
  },
  searchSuggestionRow: {
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  searchSuggestionIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchSuggestionCopy: {
    flex: 1,
    minWidth: 0,
  },
  searchSuggestionLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  searchSuggestionHint: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '600',
  },
  categoryRow: {
    paddingBottom: 10,
  },
  floatingCategoryRow: {
    position: 'relative',
    minHeight: FLOATING_CATEGORY_RAIL_HEIGHT,
    alignItems: 'center',
    paddingRight: 16,
    gap: 18,
  },
  headerCategoryMovingUnderline: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    borderRadius: 999,
    backgroundColor: theme.colors.accentStrong,
  },
  headerCategoryTab: {
    minHeight: FLOATING_CATEGORY_RAIL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  headerCategoryText: {
    color: theme.colors.textSoft,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  headerCategoryTextActive: {
    color: theme.colors.white,
  },
  headerCategoryUnderline: {
    width: '100%',
    height: 2,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  headerCategoryUnderlineActive: {
    backgroundColor: theme.colors.accentStrong,
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
  categorySwipePreviewBanner: {
    minHeight: 60,
    marginBottom: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  categorySwipePreviewIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categorySwipePreviewCopy: {
    flex: 1,
    gap: 7,
  },
  categorySwipePreviewTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  categorySwipePreviewLine: {
    height: 11,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  categorySwipeSpotlightSkeleton: {
    height: 224,
    marginTop: 4,
    marginBottom: 14,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  categorySwipeSectionRow: {
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categorySwipeHeadingSkeleton: {
    width: 132,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  categorySwipeActionSkeleton: {
    width: 86,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  categorySwipeCardSkeleton: {
    height: 318,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  spotlightCard: {
    marginTop: 4,
    marginBottom: 14,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
    padding: 16,
    minHeight: 224,
    justifyContent: 'flex-end',
  },
  spotlightRail: {
    gap: 12,
    paddingRight: 42,
  },
  spotlightBody: {
    width: '100%',
    gap: 8,
    zIndex: 2,
  },
  spotlightContent: {
    flex: 1,
    justifyContent: 'flex-end',
    zIndex: 2,
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
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.white,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  spotlightTitleRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  spotlightCopy: {
    color: 'rgba(245,247,252,0.78)',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
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
    color: theme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  spotlightImage: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlightImageFade: {
    ...StyleSheet.absoluteFillObject,
  },
  spotlightBrandWash: {
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
    borderColor: 'rgba(242,34,28,0.24)',
  },
  cardFooter: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 20,
  },
  cardTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  cardTitleRow: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.white,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  cardTitleBadgeGroup: {
    marginLeft: 'auto',
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  verifiedBadge: {
    minHeight: 18,
    flexShrink: 0,
    borderRadius: 9,
    backgroundColor: 'rgba(242,34,28,0.82)',
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  verifiedBadgeText: {
    color: theme.colors.white,
    fontSize: 9,
    fontWeight: '900',
  },
  previewBadge: {
    minHeight: 18,
    flexShrink: 0,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  previewBadgeText: {
    color: theme.colors.white,
    fontSize: 9,
    fontWeight: '900',
  },
  cardMeta: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  cardAbout: {
    paddingRight: 92,
    color: 'rgba(245,247,252,0.78)',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  priceChip: {
    position: 'absolute',
    right: 0,
    bottom: 0,
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
  drawerLayer: {
    zIndex: 80,
    elevation: 80,
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
  drawerScrollContentBelowTopNav: {
    paddingTop: 24,
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
    borderColor: 'rgba(242,34,28,0.24)',
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
    borderBottomColor: 'rgba(242,34,28,0.24)',
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
