import React, { Suspense, lazy, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Linking as NativeLinking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ExpoLinking from 'expo-linking';
import { Image } from 'expo-image';
import * as SecureStore from 'expo-secure-store';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import {
  bookEventTicket,
  cancelTicket,
  changeUserPassword,
  clearHistory,
  confirmPasswordReset,
  createEventListing,
  deleteEventListing,
  fetchAppBootstrap,
  fetchAppUpdatePolicy,
  fetchEventListing,
  getGoogleAuthUrl,
  markAllNotificationsRead,
  markTicketUsed,
  markNotificationRead,
  pollTicketPayment,
  removeHistoryItem,
  registerPushDevice,
  recordListingView,
  requestEmailMagicLink,
  requestPasswordReset,
  restoreStoredSession,
  signInWithPassword,
  signInWithStoredTokens,
  signOut,
  submitEventRating,
  toggleSavedListing,
  unregisterPushDevice,
  updateEventListing,
  updateUserProfile,
  verifyEmailMagicLink,
} from './api';
import { APP_VERSION, TAB_ITEMS } from './constants';
import { AuthScreen } from './components/AuthScreen';
import { BottomNav } from './components/BottomNav';
import { OnboardingOverlay, OnboardingStage } from './components/OnboardingOverlay';
import { AppBackground, PrimaryButton, ScreenTransition } from './components/Primitives';
import { DetailsScreenSkeleton, HomeScreenSkeleton, TicketScreenSkeleton } from './components/Skeletons';
import { configureNotificationHandlingAsync, registerForPushNotificationsAsync } from './push';
import {
  AppCategory,
  AppEvent,
  AppNotification,
  AppTicket,
  AppUpdatePolicy,
  AppUser,
  BookingCheckoutInput,
  ChangePasswordInput,
  CreateAppEventInput,
  Screen,
  TabId,
  UpdateProfileInput,
} from './types';

WebBrowser.maybeCompleteAuthSession();
void configureNotificationHandlingAsync();
const APP_LOGO = require('../logo.png');
const ONBOARDING_COMPLETE_KEY = 'bites_onboarding_complete_v1';
const SHOW_ONBOARDING_EVERY_LOGIN_FOR_TESTING = true;

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

const NearbyScreen = lazy(async () => {
  const module = await import('./components/NearbyScreen');
  return { default: module.NearbyScreen };
});

function AppContent() {
  const [authState, setAuthState] = useState<'checking' | 'signedOut' | 'signedIn'>('checking');
  const [authBusyProvider, setAuthBusyProvider] = useState<'google' | 'email' | 'password' | 'reset' | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [passwordResetToken, setPasswordResetToken] = useState<string | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [categories, setCategories] = useState<AppCategory[]>([]);
  const [myListings, setMyListings] = useState<AppEvent[]>([]);
  const [historyEvents, setHistoryEvents] = useState<AppEvent[]>([]);
  const [tickets, setTickets] = useState<AppTicket[]>([]);
  const [receivedTickets, setReceivedTickets] = useState<AppTicket[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [profile, setProfile] = useState<AppUser | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [currentScreen, setCurrentScreen] = useState<Screen>('home');
  const [selectedEvent, setSelectedEvent] = useState<AppEvent | null>(null);
  const [selectedTicket, setSelectedTicket] = useState<AppTicket | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('discover');
  const [direction, setDirection] = useState<1 | -1>(1);
  const [tabDirection, setTabDirection] = useState<1 | -1>(1);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [editingListing, setEditingListing] = useState<AppEvent | null>(null);
  const [createPending, setCreatePending] = useState(false);
  const [createProgress, setCreateProgress] = useState(0);
  const [createStage, setCreateStage] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [updatePolicy, setUpdatePolicy] = useState<AppUpdatePolicy | null>(null);
  const [updateDismissedVersion, setUpdateDismissedVersion] = useState<string | null>(null);
  const [onboardingStage, setOnboardingStage] = useState<OnboardingStage>('checking');
  const [onboardingTargets, setOnboardingTargets] = useState<Partial<Record<TabId, { x: number; y: number }>>>({});
  const lastHandledAuthUrl = useRef<string | null>(null);
  const pushTokenRef = useRef<string | null>(null);
  const updatePrompt = useMemo(() => {
    if (!updatePolicy || !isAppUpdateAvailable(APP_VERSION, updatePolicy.latestVersion)) {
      return null;
    }

    const required = updatePolicy.forceUpdate || isAppUpdateAvailable(APP_VERSION, updatePolicy.minRequiredVersion);
    if (!required && updateDismissedVersion === updatePolicy.latestVersion) {
      return null;
    }

    return {
      ...updatePolicy,
      required,
    };
  }, [updateDismissedVersion, updatePolicy]);

  const loadApp = useCallback(async () => {
    setIsBootstrapping(true);
    setBootstrapError(null);

    try {
      const payload = await fetchAppBootstrap();

      setCategories(payload.categories);
      setEvents(payload.events);
      setMyListings(payload.myListings);
      setHistoryEvents(payload.history);
      setTickets(payload.tickets);
      setReceivedTickets(payload.receivedTickets);
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

  useEffect(() => {
    let cancelled = false;

    const loadOnboardingState = async () => {
      const completed = await readOnboardingCompleted();
      if (!cancelled) {
        setOnboardingStage(completed ? 'done' : 'welcome');
      }
    };

    void loadOnboardingState();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkForUpdates = async () => {
      try {
        const policy = await fetchAppUpdatePolicy(Platform.OS);
        if (!cancelled) {
          setUpdatePolicy(policy);
        }
      } catch {
        // Update checks should never block opening the app.
      }
    };

    void checkForUpdates();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLogout = useCallback(async () => {
    await signOut();
    setEvents([]);
    setCategories([]);
    setMyListings([]);
    setHistoryEvents([]);
    setTickets([]);
    setReceivedTickets([]);
    setNotifications([]);
    setProfile(null);
    setUnreadNotificationCount(0);
    setSelectedEvent(null);
    setSelectedTicket(null);
    setCurrentScreen('home');
    setActiveTab('discover');
    setEditingListing(null);
    setPasswordResetToken(null);
    setBootstrapError(null);
    setCreateProgress(0);
    setCreateStage(null);
    setCreateError(null);
    setAuthError(null);
    setAuthBusyProvider(null);
    setAuthMessage(null);
    setIsBootstrapping(false);
    setOnboardingStage('welcome');
    setAuthState('signedOut');
  }, []);

  const consumeAuthUrl = useCallback(
    async (url: string) => {
      if (!url || url === lastHandledAuthUrl.current) {
        return false;
      }

      const parsed = ExpoLinking.parse(url);
      const queryParams = parsed.queryParams ?? {};
      const path = parsed.path ?? '';
      const token = firstStringParam(queryParams.token);
      const access = firstStringParam(queryParams.access);
      const refresh = firstStringParam(queryParams.refresh);
      const errorCode = firstStringParam(queryParams.error);
      const errorDetail = firstStringParam(queryParams.detail);
      const isResetFlow = path.includes('auth/reset');

      if (!token && !(access && refresh) && !errorCode) {
        return false;
      }

      lastHandledAuthUrl.current = url;
      setAuthError(null);

      try {
        if (isResetFlow && token) {
          setPasswordResetToken(token);
          setAuthBusyProvider(null);
          setAuthMessage('Choose your new password to finish recovery.');
          setAuthState('signedOut');
          return true;
        }

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

  useEffect(() => {
    if (authState !== 'signedIn' || !profile?.pushNotificationsEnabled) {
      return;
    }

    let cancelled = false;

    const syncPush = async () => {
      const registration = await registerForPushNotificationsAsync();
      if (cancelled || !registration.token) {
        return;
      }

      pushTokenRef.current = registration.token;
      await registerPushDevice(registration.token, registration.platform, registration.provider).catch(() => undefined);
    };

    void syncPush();

    return () => {
      cancelled = true;
    };
  }, [authState, profile?.id, profile?.pushNotificationsEnabled]);

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

  const handleForgotPassword = useCallback(async (email: string) => {
    setAuthBusyProvider('reset');
    setAuthError(null);

    try {
      const redirectTo = ExpoLinking.createURL('auth/reset');
      const response = await requestPasswordReset(email, redirectTo);
      setAuthMessage(response.message ?? 'Check your email for the recovery link.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to send the recovery link.');
    } finally {
      setAuthBusyProvider(null);
    }
  }, []);

  const handleResetPassword = useCallback(async (password: string, confirmPassword: string) => {
    if (!passwordResetToken) {
      setAuthError('This recovery link is missing or expired.');
      return;
    }

    setAuthBusyProvider('reset');
    setAuthError(null);

    try {
      const response = await confirmPasswordReset(passwordResetToken, password, confirmPassword);
      setPasswordResetToken(null);
      setAuthMessage(response.message ?? 'Password updated. Sign in with your new password.');
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to reset your password.');
    } finally {
      setAuthBusyProvider(null);
    }
  }, [passwordResetToken]);

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
    setTickets((current) =>
      current.map((ticket) =>
        ticket.eventId === eventId
          ? {
              ...ticket,
              event: {
                ...ticket.event,
                ...patch,
              },
            }
          : ticket,
      ),
    );
    setSelectedEvent((current) => (current?.id === eventId ? { ...current, ...patch } : current));
  }, []);

  const upsertEvent = useCallback((nextEvent: AppEvent) => {
    const applyUpsert = (current: AppEvent[]) => {
      const index = current.findIndex((event) => event.id === nextEvent.id);
      if (index === -1) {
        return [nextEvent, ...current];
      }

      return current.map((event) => (event.id === nextEvent.id ? nextEvent : event));
    };

    setEvents(applyUpsert);
    setMyListings(applyUpsert);
    setHistoryEvents((current) => current.map((event) => (event.id === nextEvent.id ? nextEvent : event)));
    setTickets((current) =>
      current.map((ticket) =>
        ticket.eventId === nextEvent.id
          ? {
              ...ticket,
              event: {
                ...ticket.event,
                ...nextEvent,
              },
            }
          : ticket,
      ),
    );
    setSelectedEvent((current) => (current?.id === nextEvent.id ? nextEvent : current));
  }, []);

  const promoteHistoryEvent = useCallback((event: AppEvent) => {
    setHistoryEvents((current) => {
      const deduped = current.filter((item) => item.id !== event.id);
      return [event, ...deduped].slice(0, 20);
    });
  }, []);

  useEffect(() => {
    if (!selectedEvent) {
      setSelectedTicket(null);
      return;
    }

    setSelectedTicket((current) => {
      if (current) {
        const matchingCurrent = tickets.find((ticket) => ticket.id === current.id);
        if (matchingCurrent) {
          return matchingCurrent;
        }
      }

      return (
        tickets.find((ticket) => ticket.eventId === selectedEvent.id && ticket.status === 'confirmed') ??
        tickets.find((ticket) => ticket.eventId === selectedEvent.id) ??
        null
      );
    });
  }, [selectedEvent, tickets]);

  const handleSelectEvent = (event: AppEvent) => {
    promoteHistoryEvent(event);
    void recordListingView(event.id).catch(() => undefined);
    startTransition(() => {
      setSelectedEvent(event);
      setDirection(1);
      setCurrentScreen('details');
    });
    void fetchEventListing(event.id, categories)
      .then((freshEvent) => {
        upsertEvent(freshEvent);
        promoteHistoryEvent(freshEvent);
      })
      .catch(() => undefined);
  };

  const handleBookTicket = async (input?: BookingCheckoutInput) => {
    if (!selectedEvent) {
      return null;
    }

    const existingTicket =
      tickets.find((ticket) => ticket.eventId === selectedEvent.id && ticket.status === 'confirmed') ?? null;

    if (existingTicket) {
      setSelectedTicket(existingTicket);
      startTransition(() => {
        setDirection(1);
        setCurrentScreen('ticket');
      });
      return existingTicket;
    }

    try {
      let ticket = await bookEventTicket(selectedEvent.id, categories, input);
      if (ticket.status === 'pending' || ticket.paymentStatus === 'pending') {
        for (let attempt = 0; attempt < 6; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 3500));
          ticket = await pollTicketPayment(ticket.id, categories);
          if (ticket.status !== 'pending' && ticket.paymentStatus !== 'pending') {
            break;
          }
        }
      }

      setTickets((current) => {
        const existingIndex = current.findIndex((item) => item.id === ticket.id);
        if (existingIndex === -1) {
          return [ticket, ...current];
        }
        return current.map((item) => (item.id === ticket.id ? ticket : item));
      });
      setSelectedTicket(ticket);
      updateEventState(selectedEvent.id, { hasTicket: ticket.status === 'confirmed' });

      if (ticket.status === 'confirmed') {
        startTransition(() => {
          setDirection(1);
          setCurrentScreen('ticket');
        });
      } else if (ticket.status === 'pending') {
        Alert.alert('Payment pending', 'Approve the payment on your phone. We will keep checking and update your booking.');
      } else {
        Alert.alert('Payment not completed', 'The payment was not completed. Please try again.');
      }
      return ticket;
    } catch (error) {
      Alert.alert('Ticket not ready', error instanceof Error ? error.message : 'Unable to prepare your ticket right now.');
      return null;
    }
  };

  const handleOpenTicket = useCallback((ticket: AppTicket) => {
    setSelectedEvent(ticket.event);
    setSelectedTicket(ticket);
    startTransition(() => {
      setDirection(1);
      setCurrentScreen('ticket');
    });
  }, []);

  const handleOpenNearby = useCallback(() => {
    startTransition(() => {
      setDirection(1);
      setCurrentScreen('nearby');
    });
  }, []);

  const handleCancelTicket = useCallback(async (ticket: AppTicket) => {
    return new Promise<void>((resolve, reject) => {
      Alert.alert(
        'Cancel booking?',
        `This will cancel ${ticket.referenceCode}. You can only continue if you are sure.`,
        [
          {
            text: 'Keep it',
            style: 'cancel',
            onPress: () => resolve(),
          },
          {
            text: 'Cancel booking',
            style: 'destructive',
            onPress: async () => {
              try {
                const response = await cancelTicket(ticket.id, categories);
                const wasInMyTickets = tickets.some((item) => item.id === ticket.id);
                const wasInReceivedTickets = receivedTickets.some((item) => item.id === ticket.id);
                let nextUserTickets: AppTicket[] = [];

                setTickets((current) => {
                  if (!wasInMyTickets) {
                    nextUserTickets = current;
                    return current;
                  }
                  nextUserTickets = upsertTicketItem(current, response.ticket);
                  return nextUserTickets;
                });
                setReceivedTickets((current) => (wasInReceivedTickets ? upsertTicketItem(current, response.ticket) : current));
                setSelectedTicket((current) => (current?.id === response.ticket.id ? response.ticket : current));

                if (wasInMyTickets) {
                  const hasConfirmed = hasConfirmedTicketForEvent(nextUserTickets, response.ticket.eventId);
                  updateEventState(response.ticket.eventId, { hasTicket: hasConfirmed });

                  if (selectedEvent?.id === response.ticket.eventId) {
                    setSelectedEvent((current) =>
                      current ? { ...current, hasTicket: hasConfirmed } : current,
                    );
                  }
                }

                Alert.alert('Ticket updated', response.message);
                resolve();
              } catch (error) {
                reject(error);
              }
            },
          },
        ],
      );
    });
  }, [categories, receivedTickets, selectedEvent?.id, tickets, updateEventState]);

  const handleMarkTicketUsed = useCallback(async (ticket: AppTicket) => {
    const response = await markTicketUsed(ticket.id, categories);
    const wasInMyTickets = tickets.some((item) => item.id === ticket.id);
    const wasInReceivedTickets = receivedTickets.some((item) => item.id === ticket.id);
    let nextUserTickets: AppTicket[] = [];

    setTickets((current) => {
      if (!wasInMyTickets) {
        nextUserTickets = current;
        return current;
      }
      nextUserTickets = upsertTicketItem(current, response.ticket);
      return nextUserTickets;
    });
    setReceivedTickets((current) => (wasInReceivedTickets ? upsertTicketItem(current, response.ticket) : current));
    setSelectedTicket((current) => (current?.id === response.ticket.id ? response.ticket : current));

    if (wasInMyTickets) {
      const hasConfirmed = hasConfirmedTicketForEvent(nextUserTickets, response.ticket.eventId);
      updateEventState(response.ticket.eventId, { hasTicket: hasConfirmed });

      if (selectedEvent?.id === response.ticket.eventId) {
        setSelectedEvent((current) =>
          current ? { ...current, hasTicket: hasConfirmed } : current,
        );
      }
    }

    Alert.alert('Ticket updated', response.message);
  }, [categories, receivedTickets, selectedEvent?.id, tickets, updateEventState]);

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

    if (nextTab === 'create') {
      setOnboardingStage((current) => (current === 'create' ? 'menu' : current));
    }
  };

  const handleToggleSave = async (event: AppEvent) => {
    const result = await toggleSavedListing(event.id);
    updateEventState(result.eventId, { isSaved: result.isSaved, saveCount: result.saveCount });
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

  const handleSubmitListing = async (input: CreateAppEventInput) => {
    setCreatePending(true);
    setCreateProgress(0.04);
    setCreateStage(editingListing ? 'Saving changes' : 'Preparing');
    setCreateError(null);

    try {
      const createdOrUpdated = editingListing
        ? await updateEventListing(editingListing.id, input, categories, editingListing, {
            onProgress: setCreateProgress,
            onStageChange: setCreateStage,
          })
        : await createEventListing(input, categories, {
            onProgress: setCreateProgress,
            onStageChange: setCreateStage,
          });

      upsertEvent(createdOrUpdated);
      setCreateProgress(1);
      setCreateStage('Done');
      setEditingListing(null);

      startTransition(() => {
        setSelectedEvent(createdOrUpdated);
        setDirection(1);
        setCurrentScreen('details');
      });
    } catch (error) {
      setCreateError(
        error instanceof Error
          ? error.message
          : editingListing
            ? 'Unable to save your changes right now.'
            : 'Unable to publish this listing right now.',
      );
      throw error;
    } finally {
      setCreateProgress(0);
      setCreateStage(null);
      setCreatePending(false);
    }
  };

  const handleDeleteListings = useCallback(
    async (eventIds: string[]) => {
      if (eventIds.length === 0) {
        return;
      }

      await Promise.all(eventIds.map((eventId) => deleteEventListing(eventId)));

      if (selectedEvent && eventIds.includes(selectedEvent.id)) {
        startTransition(() => {
          setSelectedTicket(null);
          setDirection(-1);
          setCurrentScreen('home');
          setActiveTab('profile');
        });
      }

      setEditingListing((current) => (current && eventIds.includes(current.id) ? null : current));
      await loadApp();
    },
    [loadApp, selectedEvent],
  );

  const handleStartEditListing = useCallback((event: AppEvent) => {
    if (event.ownerCanEdit === false) {
      Alert.alert(
        'Edit window closed',
        'Listings can only be edited within the first 24 hours after posting.',
      );
      return;
    }

    const currentIndex = TAB_ITEMS.findIndex((tab) => tab.id === activeTab);
    const createIndex = TAB_ITEMS.findIndex((tab) => tab.id === 'create');

    setEditingListing(event);
    startTransition(() => {
      setTabDirection(createIndex >= currentIndex ? 1 : -1);
      setActiveTab('create');
      setCurrentScreen('home');
    });
  }, [activeTab]);

  const handleCancelEditListing = useCallback(() => {
    setEditingListing(null);
  }, []);

  const handleClearHistory = useCallback(async () => {
    await clearHistory();
    setHistoryEvents([]);
  }, []);

  const handleRemoveHistoryItem = useCallback(async (event: AppEvent) => {
    await removeHistoryItem(event.id);
    setHistoryEvents((current) => current.filter((item) => item.id !== event.id));
  }, []);

  const handleUpdateProfile = useCallback(async (input: UpdateProfileInput) => {
    const updated = await updateUserProfile(input);
    setProfile(updated);
    return updated;
  }, []);

  const handleChangePassword = useCallback(async (input: ChangePasswordInput) => {
    return changeUserPassword(input);
  }, []);

  const handleToggleEmailNotifications = useCallback(async (enabled: boolean) => {
    if (!profile) {
      throw new Error('Your profile is not ready yet.');
    }

    const updated = await updateUserProfile({
      name: profile.name,
      phone: profile.phone ?? '',
      emailNotificationsEnabled: enabled,
      pushNotificationsEnabled: profile.pushNotificationsEnabled,
    });
    setProfile(updated);
    return updated;
  }, [profile]);

  const handleTogglePushNotifications = useCallback(async (enabled: boolean) => {
    if (!profile) {
      throw new Error('Your profile is not ready yet.');
    }

    if (!enabled) {
      if (pushTokenRef.current) {
        await unregisterPushDevice(pushTokenRef.current).catch(() => undefined);
      } else {
        await unregisterPushDevice().catch(() => undefined);
      }

      const updated = await updateUserProfile({
        name: profile.name,
        phone: profile.phone ?? '',
        emailNotificationsEnabled: profile.emailNotificationsEnabled,
        pushNotificationsEnabled: false,
      });
      setProfile(updated);
      pushTokenRef.current = null;
      return updated;
    }

    const registration = await registerForPushNotificationsAsync();
    if (!registration.token) {
      throw new Error(registration.message ?? 'Push notifications are not available on this device right now.');
    }

    await registerPushDevice(registration.token, registration.platform, registration.provider);
    pushTokenRef.current = registration.token;

    const updated = await updateUserProfile({
      name: profile.name,
      phone: profile.phone ?? '',
      emailNotificationsEnabled: profile.emailNotificationsEnabled,
      pushNotificationsEnabled: true,
    });
    setProfile(updated);
    return updated;
  }, [profile]);

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

      if (currentScreen === 'nearby') {
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

  const handleOnboardingNext = useCallback(() => {
    setOnboardingStage('scroll');
  }, []);

  const handleOnboardingDiscoverScroll = useCallback((offsetY: number) => {
    setOnboardingStage((current) => (current === 'scroll' && offsetY > 18 ? 'create' : current));
  }, []);

  const handleOnboardingMenuOpen = useCallback(() => {
    setOnboardingStage((current) => (current === 'menu' ? 'success' : current));
  }, []);

  const handleOnboardingFinish = useCallback(() => {
    setOnboardingStage('done');
    void writeOnboardingCompleted();
  }, []);

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
            onForgotPassword={handleForgotPassword}
            onGoogleLogin={handleGoogleLogin}
            onPasswordLogin={handlePasswordLogin}
            onResetPassword={handleResetPassword}
            onCancelReset={() => setPasswordResetToken(null)}
            passwordResetToken={passwordResetToken}
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
                editingListing={editingListing}
                events={events}
                historyEvents={historyEvents}
                myListings={myListings}
                notifications={notifications}
                receivedTickets={receivedTickets}
                onCancelEditListing={handleCancelEditListing}
                onCancelTicket={handleCancelTicket}
                onClearHistory={handleClearHistory}
                onCreateEvent={handleSubmitListing}
                onChangePassword={handleChangePassword}
                onDeleteListings={handleDeleteListings}
                onMarkAllRead={handleMarkAllRead}
                onMarkTicketUsed={handleMarkTicketUsed}
                onOpenNotification={handleOpenNotification}
                onOpenNearby={handleOpenNearby}
                onOpenTicket={handleOpenTicket}
                onRemoveHistoryItem={handleRemoveHistoryItem}
                onStartEditListing={handleStartEditListing}
                onSelectEvent={handleSelectEvent}
                onSignOut={() => void handleLogout()}
                onTabChange={handleTabChange}
                onToggleEmailNotifications={handleToggleEmailNotifications}
                onTogglePushNotifications={handleTogglePushNotifications}
                onToggleSave={handleToggleSave}
                onUpdateProfile={handleUpdateProfile}
                onDiscoverScroll={handleOnboardingDiscoverScroll}
                onMenuOpen={handleOnboardingMenuOpen}
                profile={profile}
                tabDirection={tabDirection}
                tickets={tickets}
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

        {authState === 'signedIn' && !showStartupState && currentScreen === 'nearby' ? (
          <ScreenTransition key="nearby" direction={direction}>
            <Suspense fallback={<HomeScreenSkeleton activeTab={activeTab} />}>
              <NearbyScreen
                events={events}
                onBack={handleBack}
                onOpenEvent={handleSelectEvent}
                profile={profile}
              />
            </Suspense>
          </ScreenTransition>
        ) : null}

        {authState === 'signedIn' && !showStartupState && currentScreen === 'ticket' && selectedEvent ? (
          <ScreenTransition key="ticket" direction={direction}>
            <Suspense fallback={<TicketScreenSkeleton />}>
              <TicketScreen
                event={selectedEvent}
                ticket={selectedTicket}
                onBack={handleBack}
                onCancelTicket={handleCancelTicket}
              />
            </Suspense>
          </ScreenTransition>
        ) : null}

        {authState === 'signedIn' && !showStartupState && currentScreen === 'home' ? (
          <BottomNav
            activeTab={activeTab}
            onTabChange={handleTabChange}
            onTabTargetLayout={(tab, target) =>
              setOnboardingTargets((current) => {
                const previous = current[tab];
                if (previous && Math.abs(previous.x - target.x) < 0.5 && Math.abs(previous.y - target.y) < 0.5) {
                  return current;
                }

                return {
                  ...current,
                  [tab]: target,
                };
              })
            }
            unreadCount={unreadNotificationCount}
          />
        ) : null}

        {updatePrompt ? (
          <AppUpdateModal
            currentVersion={APP_VERSION}
            latestVersion={updatePrompt.latestVersion}
            message={updatePrompt.message}
            required={updatePrompt.required}
            updateUrl={updatePrompt.updateUrl}
            onDismiss={() => setUpdateDismissedVersion(updatePrompt.latestVersion)}
          />
        ) : null}

        {authState === 'signedIn' && !showStartupState ? (
          <OnboardingOverlay
            createTarget={onboardingTargets.create}
            stage={onboardingStage}
            onNext={handleOnboardingNext}
            onFinish={handleOnboardingFinish}
          />
        ) : null}
      </View>
    </AppBackground>
  );
}

function AppUpdateModal({
  currentVersion,
  latestVersion,
  message,
  required,
  updateUrl,
  onDismiss,
}: {
  currentVersion: string;
  latestVersion: string;
  message: string;
  required: boolean;
  updateUrl: string;
  onDismiss: () => void;
}) {
  const openUpdate = () => {
    void NativeLinking.openURL(updateUrl).catch(() => undefined);
  };

  return (
    <Modal animationType="fade" transparent visible>
      <View style={styles.updateModalBackdrop}>
        <View style={styles.updateModalCard}>
          <View style={styles.updateAppHeader}>
            <View style={styles.updateLogoShell}>
              <Image source={APP_LOGO} contentFit="cover" style={styles.updateLogo} />
            </View>
            <View style={styles.updateAppCopy}>
              <Text style={styles.updateAppName}>Bites & Vibes</Text>
              <Text style={styles.updatePublisher}>BITESNVIBES</Text>
              <Text style={styles.updatePurchaseText}>{required ? 'Important update' : 'Update available'}</Text>
            </View>
          </View>

          <View style={styles.updateStatsRow}>
            <View style={styles.updateStat}>
              <Feather color="#FBBF24" name="star" size={19} />
              <Text style={styles.updateStatLabel}>Review</Text>
            </View>
            <View style={styles.updateDivider} />
            <View style={styles.updateStat}>
              <Feather color="#DDE4F2" name="shield" size={20} />
              <Text style={styles.updateStatLabel}>Rate</Text>
            </View>
            <View style={styles.updateDivider} />
            <View style={styles.updateStat}>
              <Feather color="#DDE4F2" name="download" size={24} />
              <Text style={styles.updateStatLabel}>Latest v{latestVersion}</Text>
            </View>
          </View>

          <Text style={styles.updateModalCopy}>{message}</Text>
          <Text style={styles.updateModalMeta}>Installed v{currentVersion}</Text>

          <Pressable accessibilityRole="button" onPress={openUpdate}>
            <LinearGradient
              colors={['#E53935', '#FF6B3D', '#FFB15C']}
              locations={[0, 0.46, 1]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.updateInstallButton}
            >
              <Text style={styles.updateInstallText}>{required ? 'Install required update' : 'Install'}</Text>
            </LinearGradient>
          </Pressable>
          {!required ? (
            <Pressable accessibilityRole="button" onPress={onDismiss} style={styles.updateModalLater}>
              <Text style={styles.updateModalLaterText}>Later</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function isAppUpdateAvailable(currentVersion: string, targetVersion: string) {
  return compareVersions(currentVersion, targetVersion) < 0;
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersionParts(left);
  const rightParts = normalizeVersionParts(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] ?? 0;
    const rightValue = rightParts[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue > rightValue ? 1 : -1;
    }
  }

  return 0;
}

function normalizeVersionParts(version: string) {
  return version
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
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

function upsertTicketItem(current: AppTicket[], nextTicket: AppTicket) {
  const existingIndex = current.findIndex((ticket) => ticket.id === nextTicket.id);
  if (existingIndex === -1) {
    return [nextTicket, ...current];
  }

  return current.map((ticket) => (ticket.id === nextTicket.id ? nextTicket : ticket));
}

function hasConfirmedTicketForEvent(tickets: AppTicket[], eventId: string) {
  return tickets.some((ticket) => ticket.eventId === eventId && ticket.status === 'confirmed');
}

async function readOnboardingCompleted() {
  if (SHOW_ONBOARDING_EVERY_LOGIN_FOR_TESTING) {
    return false;
  }

  if (Platform.OS === 'web') {
    return globalThis.localStorage?.getItem(ONBOARDING_COMPLETE_KEY) === 'true';
  }

  return (await SecureStore.getItemAsync(ONBOARDING_COMPLETE_KEY)) === 'true';
}

async function writeOnboardingCompleted() {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(ONBOARDING_COMPLETE_KEY, 'true');
    return;
  }

  await SecureStore.setItemAsync(ONBOARDING_COMPLETE_KEY, 'true');
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
  updateModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(4,7,13,0.72)',
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateModalCard: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 16,
    padding: 18,
    backgroundColor: 'rgba(15,16,18,0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 18,
  },
  updateAppHeader: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  updateLogoShell: {
    width: 86,
    height: 86,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#0A0D13',
    borderWidth: 1,
    borderColor: 'rgba(255,107,61,0.24)',
  },
  updateLogo: {
    width: '100%',
    height: '100%',
  },
  updateAppCopy: {
    flex: 1,
    gap: 4,
  },
  updateAppName: {
    color: '#F5F7FC',
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  updatePublisher: {
    color: '#FFB15C',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  updatePurchaseText: {
    color: '#B9C2D1',
    fontSize: 14,
    fontWeight: '700',
  },
  updateStatsRow: {
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'center',
  },
  updateStat: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  updateStatInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  updateStatLabel: {
    color: '#B9C2D1',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  updateDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  updateModalCopy: {
    color: '#C8D0DE',
    fontSize: 13,
    lineHeight: 19,
  },
  updateModalMeta: {
    color: '#8C96A8',
    fontSize: 12,
    fontWeight: '700',
  },
  updateInstallButton: {
    minHeight: 58,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateInstallText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  updateModalLater: {
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateModalLaterText: {
    color: '#C8D0DE',
    fontSize: 13,
    fontWeight: '800',
  },
});
