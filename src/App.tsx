import React, { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Linking as NativeLinking, StyleSheet, Text, View } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import {
  createEventListing,
  fetchAppBootstrap,
  getGoogleAuthUrl,
  markAllNotificationsRead,
  markNotificationRead,
  recordListingView,
  requestEmailMagicLink,
  restoreStoredSession,
  signInWithPassword,
  signInWithStoredTokens,
  signOut,
  submitEventRating,
  toggleSavedListing,
  verifyEmailMagicLink,
} from './api';
import { TAB_ITEMS } from './constants';
import { AuthScreen } from './components/AuthScreen';
import { BottomNav } from './components/BottomNav';
import { AppBackground, PrimaryButton, ScreenTransition } from './components/Primitives';
import { DetailsScreenSkeleton, HomeScreenSkeleton, TicketScreenSkeleton } from './components/Skeletons';
import { AppCategory, AppEvent, AppNotification, AppUser, CreateAppEventInput, Screen, TabId } from './types';

WebBrowser.maybeCompleteAuthSession();

const HomeScreen = lazy(async () => {
  const module = await import('./components/HomeScreen');
  return { default: module.HomeScreen };
});

const DetailsScreen = lazy(async () => {
  const module = await import('./components/DetailsScreen');
  return { default: module.DetailsScreen };
});

const TicketScreen = lazy(async () => {
  const module = await import('./components/TicketScreen');
  return { default: module.TicketScreen };
});

function AppContent() {
  const [authState, setAuthState] = useState<'checking' | 'signedOut' | 'signedIn'>('checking');
  const [authBusyProvider, setAuthBusyProvider] = useState<'google' | 'email' | 'password' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [categories, setCategories] = useState<AppCategory[]>([]);
  const [myListings, setMyListings] = useState<AppEvent[]>([]);
  const [historyEvents, setHistoryEvents] = useState<AppEvent[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('discover');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [tabDirection, setTabDirection] = useState<1 | -1>(1);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [createProgress, setCreateProgress] = useState(0);
  const [createStage, setCreateStage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const lastHandledAuthUrl = useRef<string | null>(null);

  const loadApp = useCallback(async () => {
    setIsBootstrapping(true);
    setBootstrapError(null);

    try {
      const payload = await fetchAppBootstrap();

      setCategories(payload.categories);
      setEvents(payload.events);
      setMyListings(payload.myListings);
      setHistoryEvents(payload.history);
      setNotifications(payload.notifications);
      setProfile(payload.profile);
      setUnreadNotificationCount(payload.unreadNotificationCount);
      setSelectedEvent((current) => {
        if (current) {
          return (
            payload.events.find((event) => event.id === current.id) ??
            payload.myListings.find((event) => event.id === current.id) ??
            payload.events[0] ??
            payload.myListings[0] ??
            null
          );
        }

        return payload.events[0] ?? payload.myListings[0] ?? null;
      });
    } catch (error) {
      setBootstrapError('We could not load the latest content. Check your connection and try again.');
    } finally {
      setIsBootstrapping(false);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    await signOut();
    setEvents([]);
    setCategories([]);
    setMyListings([]);
    setHistoryEvents([]);
    setNotifications([]);
    setProfile(null);
    setUnreadNotificationCount(0);
    setSelectedEvent(null);
    setCurrentScreen('home');
    setActiveTab('discover');
    setBootstrapError(null);
    setCreateProgress(0);
    setCreateStage(null);
    setCreateError(null);
    setAuthError(null);
    setAuthBusyProvider(null);
    setAuthMessage(null);
    setIsBootstrapping(false);
    setAuthState('signedOut');
  }, []);

  const consumeAuthUrl = useCallback(
    async (url: string) => {
      if (!url || url === lastHandledAuthUrl.current) {
        return false;
      }

      const parsed = ExpoLinking.parse(url);
      const queryParams = parsed.queryParams ?? {};
      const token = firstStringParam(queryParams.token);
      const access = firstStringParam(queryParams.access);
      const refresh = firstStringParam(queryParams.refresh);
      const errorCode = firstStringParam(queryParams.error);
      const errorDetail = firstStringParam(queryParams.detail);

      if (!token && !(access && refresh) && !errorCode) {
        return false;
      }

      lastHandledAuthUrl.current = url;
      setAuthError(null);

      try {
        if (errorCode) {
          setAuthBusyProvider(null);
          setAuthMessage(null);
          setAuthState('signedOut');
          setAuthError(formatAuthRedirectError(errorCode, errorDetail));
          return true;
        }

        if (token) {
          setAuthBusyProvider('email');
          setAuthMessage('Finishing email sign in...');
          await verifyEmailMagicLink(token);
        } else if (access && refresh) {
          setAuthBusyProvider('google');
          setAuthMessage('Finishing Google sign in...');
          await signInWithStoredTokens({ access, refresh });
        } else {
          return false;
        }

        setAuthState('signedIn');
        setAuthBusyProvider(null);
        setAuthMessage(null);
        await loadApp();
        return true;
      } catch (error) {
        await handleLogout();
        setAuthError(error instanceof Error ? error.message : 'Unable to finish sign in.');
        return true;
      }
    },
    [handleLogout, loadApp],
  );

  useEffect(() => {
    const subscription = NativeLinking.addEventListener('url', ({ url }) => {
      void consumeAuthUrl(url);
    });

    return () => subscription.remove();
  }, [consumeAuthUrl]);

  useEffect(() => {
    let active = true;

    const bootstrapAuth = async () => {
      setAuthState('checking');
      setAuthError(null);
      setAuthMessage(null);

      const initialUrl = await NativeLinking.getInitialURL();
      if (!active) {
        return;
      }

      if (initialUrl) {
        const handled = await consumeAuthUrl(initialUrl);
        if (handled || !active) {
          return;
        }
      }

      const restoredUser = await restoreStoredSession();
      if (!active) {
        return;
      }

      if (restoredUser) {
        setAuthState('signedIn');
        await loadApp();
        return;
      }

      setIsBootstrapping(false);
      setAuthState('signedOut');
    };

    void bootstrapAuth();

    return () => {
      active = false;
    };
  }, [consumeAuthUrl, loadApp]);

  const handleGoogleLogin = useCallback(async () => {
    setAuthBusyProvider('google');
    setAuthError(null);
    setAuthMessage(null);

    try {
      const redirectTo = ExpoLinking.createURL('auth/callback');
      const authUrl = await getGoogleAuthUrl(redirectTo);
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);

      if (result.type === 'success' && result.url) {
        await consumeAuthUrl(result.url);
      }
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to start Google sign in.');
    } finally {
      setAuthBusyProvider(null);
    }
  }, [consumeAuthUrl]);

  const handleEmailLogin = useCallback(async (email: string) => {
    setAuthBusyProvider('email');
    setAuthError(null);

    try {
      const redirectTo = ExpoLinking.createURL('auth/login');
      const response = await requestEmailMagicLink(email, redirectTo);
      setAuthMessage(response.message ?? 'Check your email for the sign-in link.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to send your login link.');
    } finally {
      setAuthBusyProvider(null);
    }
  }, []);

  const handlePasswordLogin = useCallback(async (email: string, password: string) => {
    setAuthBusyProvider('password');
    setAuthError(null);
    setAuthMessage(null);

    try {
      await signInWithPassword(email, password);
      setAuthState('signedIn');
      await loadApp();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign in with password.');
    } finally {
      setAuthBusyProvider(null);
    }
  }, [loadApp]);

  const updateEventState = useCallback((eventId: string, patch: Partial<AppEvent>) => {
    setEvents((current) => current.map((event) => (event.id === eventId ? { ...event, ...patch } : event)));
    setMyListings((current) => current.map((event) => (event.id === eventId ? { ...event, ...patch } : event)));
    setHistoryEvents((current) => current.map((event) => (event.id === eventId ? { ...event, ...patch } : event)));
    setSelectedEvent((current) => (current?.id === eventId ? { ...current, ...patch } : current));
  }, []);

  const promoteHistoryEvent = useCallback((event: AppEvent) => {
    setHistoryEvents((current) => {
      const deduped = current.filter((item) => item.id !== event.id);
      return [event, ...deduped].slice(0, 20);
    });
  }, []);

  const handleSelectEvent = (event: AppEvent) => {
    promoteHistoryEvent(event);
    void recordListingView(event.id).catch(() => undefined);
    startTransition(() => {
      setSelectedEvent(event);
      setDirection(1);
      setCurrentScreen('details');
    });
  };

  const handleBookTicket = () => {
    if (!selectedEvent) {
      return;
    }

    startTransition(() => {
      setDirection(1);
      setCurrentScreen('ticket');
    });
  };

  const handleBack = () => {
    startTransition(() => {
      setDirection(-1);
      setCurrentScreen((screen) => (screen === 'ticket' ? 'details' : 'home'));
    });
  };

  const handleTabChange = (nextTab: TabId) => {
    if (nextTab === activeTab) {
      return;
    }

    const currentIndex = TAB_ITEMS.findIndex((tab) => tab.id === activeTab);
    const nextIndex = TAB_ITEMS.findIndex((tab) => tab.id === nextTab);

    startTransition(() => {
      setTabDirection(nextIndex > currentIndex ? 1 : -1);
      setActiveTab(nextTab);
    });
  };

  const handleToggleSave = async (event: AppEvent) => {
    const result = await toggleSavedListing(event.id);
    updateEventState(result.eventId, { isSaved: result.isSaved });
  };

  const handleRateEvent = async (value: number) => {
    if (!selectedEvent) {
      return;
    }

    const result = await submitEventRating(selectedEvent.id, value);
    updateEventState(selectedEvent.id, {
      rating: result.averageRating,
      ratingCount: result.ratingCount,
    });
  };

  const handleOpenNotification = async (notification: AppNotification) => {
    if (!notification.isRead) {
      await markNotificationRead(notification.id);
      setNotifications((current) =>
        current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)),
      );
      setUnreadNotificationCount((current) => Math.max(0, current - 1));
    }

    if (!notification.listingId) {
      return;
    }

    const target =
      events.find((event) => event.id === notification.listingId) ??
      myListings.find((event) => event.id === notification.listingId);

    if (!target) {
      return;
    }

    promoteHistoryEvent(target);
    void recordListingView(target.id).catch(() => undefined);

    startTransition(() => {
      setSelectedEvent(target);
      setDirection(1);
      setCurrentScreen('details');
    });
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications((current) => current.map((notification) => ({ ...notification, isRead: true })));
    setUnreadNotificationCount(0);
  };

  const handleCreateEvent = async (input: CreateAppEventInput) => {
    setCreatePending(true);
    setCreateProgress(0.04);
    setCreateStage('Preparing');
    setCreateError(null);

    try {
      const created = await createEventListing(input, categories, {
        onProgress: setCreateProgress,
        onStageChange: setCreateStage,
      });
      setEvents((current) => [created, ...current]);
      setMyListings((current) => [created, ...current]);
      setCreateProgress(1);
      setCreateStage('Done');

      startTransition(() => {
        setSelectedEvent(created);
        setDirection(1);
        setCurrentScreen('details');
      });
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : 'Unable to publish this listing right now.');
      throw error;
    } finally {
      setCreateProgress(0);
      setCreateStage(null);
      setCreatePending(false);
    }
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (currentScreen === 'ticket') {
        startTransition(() => {
          setDirection(-1);
          setCurrentScreen('details');
        });
        return true;
      }

      if (currentScreen === 'details') {
        startTransition(() => {
          setDirection(-1);
          setCurrentScreen('home');
        });
        return true;
      }

      if (activeTab !== 'discover') {
        const currentIndex = TAB_ITEMS.findIndex((tab) => tab.id === activeTab);
        const discoverIndex = TAB_ITEMS.findIndex((tab) => tab.id === 'discover');

        startTransition(() => {
          setTabDirection(discoverIndex > currentIndex ? 1 : -1);
          setActiveTab('discover');
        });
        return true;
      }

      return false;
    });

    return () => subscription.remove();
  }, [activeTab, currentScreen]);

  const showStartupState = useMemo(
    () =>
      authState === 'checking' ||
      (authState === 'signedIn' && (isBootstrapping || (bootstrapError && events.length === 0 && myListings.length === 0))),
    [authState, bootstrapError, events.length, isBootstrapping, myListings.length],
  );

  return (
    <AppBackground>
      <StatusBar style="light" />
      <View style={styles.container}>
        {authState === 'signedOut' ? (
          <AuthScreen
            authError={authError}
            authMessage={authMessage}
            busyProvider={authBusyProvider}
            onEmailLogin={handleEmailLogin}
            onGoogleLogin={handleGoogleLogin}
            onPasswordLogin={handlePasswordLogin}
          />
        ) : null}

        {authState !== 'signedOut' && showStartupState ? (
          bootstrapError ? (
            <StartupErrorState message={bootstrapError} onRetry={loadApp} />
          ) : (
            <HomeScreenSkeleton activeTab={activeTab} />
          )
        ) : null}

        {authState === 'signedIn' && !showStartupState && currentScreen === 'home' ? (
          <ScreenTransition key="home" direction={direction}>
            <Suspense fallback={<HomeScreenSkeleton activeTab={activeTab} />}>
              <HomeScreen
                activeTab={activeTab}
                categories={categories}
                createPending={createPending}
                createProgress={createProgress}
                createStage={createStage}
                createError={createError}
                events={events}
                historyEvents={historyEvents}
                myListings={myListings}
                notifications={notifications}
                onCreateEvent={handleCreateEvent}
                onMarkAllRead={handleMarkAllRead}
                onOpenNotification={handleOpenNotification}
                onSelectEvent={handleSelectEvent}
                onSignOut={() => void handleLogout()}
                onTabChange={handleTabChange}
                onToggleSave={handleToggleSave}
                profile={profile}
                tabDirection={tabDirection}
                unreadNotificationCount={unreadNotificationCount}
              />
            </Suspense>
          </ScreenTransition>
        ) : null}

        {authState === 'signedIn' && !showStartupState && currentScreen === 'details' && selectedEvent ? (
          <ScreenTransition key="details" direction={direction}>
            <Suspense fallback={<DetailsScreenSkeleton />}>
              <DetailsScreen
                event={selectedEvent}
                isSaved={selectedEvent.isSaved}
                onBack={handleBack}
                onBook={handleBookTicket}
                onCommentCountChange={(nextCount) =>
                  updateEventState(selectedEvent.id, {
                    commentCount: nextCount,
                  })
                }
                onRate={handleRateEvent}
                profile={profile}
                onToggleSave={() => void handleToggleSave(selectedEvent)}
              />
            </Suspense>
          </ScreenTransition>
        ) : null}

        {authState === 'signedIn' && !showStartupState && currentScreen === 'ticket' && selectedEvent ? (
          <ScreenTransition key="ticket" direction={direction}>
            <Suspense fallback={<TicketScreenSkeleton />}>
              <TicketScreen event={selectedEvent} onBack={handleBack} />
            </Suspense>
          </ScreenTransition>
        ) : null}

        {authState === 'signedIn' && !showStartupState && currentScreen === 'home' ? (
          <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
        ) : null}
      </View>
    </AppBackground>
  );
}

function firstStringParam(value: string | string[] | undefined) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }

  return undefined;
}

function formatAuthRedirectError(errorCode: string, detail?: string) {
  switch (errorCode) {
    case 'token_exchange_failed':
      return detail ? `Google sign in could not finish: ${detail}` : 'Google sign in could not finish.';
    case 'user_info_failed':
      return 'Google sign in could not read your account details.';
    case 'no_code':
    case 'no_access_token':
      return 'Google sign in ended too early. Please try again.';
    case 'access_denied':
      return 'Google sign in was cancelled before completion.';
    default:
      return 'Authentication could not be completed right now.';
  }
}

function StartupErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.startupState}>
      <Text style={styles.startupTitle}>Connection issue</Text>
      <Text style={styles.startupCopy}>{message}</Text>
      <View style={styles.retryWrap}>
        <PrimaryButton label="Try again" onPress={onRetry} />
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  startupState: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  startupTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
  },
  startupCopy: {
    color: '#A7B0C2',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  retryWrap: {
    width: '100%',
  },
});
