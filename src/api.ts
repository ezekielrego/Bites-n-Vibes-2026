import {
  AppBootstrap,
  AppCategory,
  AppComment,
  AppCommentAttachment,
  AppCommentPage,
  AppCommentUser,
  AppEvent,
  AppEventPage,
  AppEventMedia,
  AppEventCategory,
  AppIconName,
  AppNotification,
  AppSearchSuggestion,
  AppTicket,
  AppUpdatePolicy,
  AppUser,
  BookingCheckoutInput,
  ChangePasswordInput,
  CreateAppCommentInput,
  CreateAppEventInput,
  EventContactLink,
  EventSocialLink,
  LocalUploadFile,
  LocalUploadImage,
  UpdateProfileInput,
} from './types';
import { API_ROOT, BACKEND_ORIGIN } from './config';
import {
  clearStoredSessionTokens,
  readStoredSessionTokens,
  writeStoredSessionTokens,
} from './sessionStore';

const VALID_CATEGORY_ICONS = new Set<AppIconName>([
  'calendar',
  'chevron-left',
  'clock',
  'coffee',
  'disc',
  'download',
  'external-link',
  'grid',
  'heart',
  'info',
  'map-pin',
  'menu',
  'message-circle',
  'music',
  'plus-circle',
  'search',
  'settings',
  'share-2',
  'sliders',
  'star',
  'user',
  'x',
  'zap',
]);

type BackendCategory = {
  id: number;
  name: string;
  slug: string;
  icon?: string | null;
  order?: number;
};

type BackendListing = {
  id: number;
  name: string;
  category_name: string;
  category_slug: string;
  category_icon?: string | null;
  description: string;
  address: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  display_price?: string | null;
  price_range?: string | null;
  primary_image?: string | null;
  ticket_image?: string | null;
  average_rating?: number | string | null;
  rating_count?: number;
  comment_count?: number;
  owner_name?: string | null;
  owner_can_edit?: boolean;
  owner_edit_expires_at?: string | null;
  owner_sold_count?: number;
  owner_revenue_total?: string | number;
  accepts_internal_payments?: boolean;
  is_trending?: boolean;
  is_featured?: boolean;
  is_verified?: boolean;
  vibe_percentage?: number;
  created_at?: string;
  user_has_saved?: boolean;
  saved_count?: number;
  user_has_ticket?: boolean;
  app_data?: Record<string, unknown> | null;
  images?: BackendListingMedia[];
};

type BackendListingMedia = {
  id: number;
  image_url?: string | null;
  video_url?: string | null;
  alt_text?: string | null;
  image_type?: 'hero' | 'ticket' | 'gallery' | null;
  media_kind?: 'image' | 'video' | null;
  is_primary?: boolean;
  order?: number;
};

type BackendNotification = {
  id: number;
  notification_type: AppNotification['type'];
  title: string;
  message: string;
  listing_id?: number | null;
  listing_name?: string | null;
  is_read: boolean;
  created_at: string;
};

type BackendUser = {
  id: number;
  email: string;
  name: string;
  phone?: string | null;
  display_avatar?: string | null;
  email_notifications_enabled: boolean;
  push_notifications_enabled: boolean;
};

type BackendCommentAttachment = {
  id: number;
  attachment_type: AppCommentAttachment['type'];
  file_url?: string | null;
  thumbnail_url?: string | null;
  url?: string | null;
  link_title?: string | null;
  link_description?: string | null;
  link_image?: string | null;
  alt_text?: string | null;
  created_at: string;
};

type BackendComment = {
  id: number;
  listing?: number;
  user: BackendUser;
  parent_id?: string | null;
  parent_author?: string | null;
  message: string;
  role?: string | null;
  replies?: BackendComment[];
  attachments?: BackendCommentAttachment[];
  is_edited: boolean;
  is_deleted: boolean;
  is_pinned: boolean;
  depth: number;
  reply_count: number;
  created_at: string;
  updated_at: string;
};

type BackendPaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

type BackendBootstrapResponse = {
  categories: BackendCategory[];
  listings: BackendListing[];
  my_listings?: BackendListing[];
  history?: BackendListing[];
  tickets?: BackendTicket[];
  received_tickets?: BackendTicket[];
  notifications?: BackendNotification[];
  unread_notification_count?: number;
  profile?: BackendUser | null;
};

type BackendAppVersionResponse = {
  latest_version: string;
  min_required_version: string;
  force_update: boolean;
  update_url: string;
  message: string;
};

type BackendSearchSuggestion = {
  id?: string | number;
  label: string;
  query?: string;
  type?: AppSearchSuggestion['type'];
  hint?: string | null;
};

type BackendTicket = {
  id: number;
  listing?: BackendListing;
  listing_id: number;
  listing_name?: string | null;
  buyer_name?: string | null;
  buyer_email?: string | null;
  action_type?: AppTicket['actionType'];
  quantity?: number;
  unit_price?: string | number;
  total_amount?: string | number;
  currency?: string;
  reference_code: string;
  qr_payload: string;
  status: AppTicket['status'];
  payment_status?: AppTicket['paymentStatus'];
  payment_method?: string | null;
  payer_phone?: string | null;
  request_note?: string | null;
  paynow_reference?: string | null;
  can_cancel?: boolean;
  can_accept?: boolean;
  can_mark_used?: boolean;
  can_manage?: boolean;
  booked_at: string;
  updated_at: string;
};

type AuthResponse = {
  user?: BackendUser;
  tokens: {
    access: string;
    refresh: string;
  };
  message?: string;
};

type RefreshResponse = {
  access: string;
  refresh?: string;
};

type TokenPairResponse = {
  access: string;
  refresh: string;
};

type MessageResponse = {
  message: string;
};

type GoogleAuthUrlResponse = {
  url: string;
};

type ToggleSaveResponse = {
  listing_id: number;
  is_saved: boolean;
  saved_count: number;
};

type RatingResponse = {
  average_rating: number;
  rating_count: number;
};

let accessToken = '';
let refreshToken = '';

export async function restoreStoredSession() {
  const stored = await readStoredSessionTokens();
  if (!stored) {
    return null;
  }

  accessToken = stored.access;
  refreshToken = stored.refresh;

  try {
    return await fetchUserProfile();
  } catch (error) {
    await signOut();
    return null;
  }
}

export async function signInWithStoredTokens(tokens: { access: string; refresh: string }) {
  await persistSessionTokens(tokens);
  return fetchUserProfile();
}

export async function initializeAppSession() {
  const session = await postJson<AuthResponse>('/auth/app-session/', {});
  await persistSessionTokens(session.tokens);
  return session;
}

export async function requestEmailMagicLink(email: string, redirectTo: string) {
  return postJson<MessageResponse>('/auth/email-login/', {
    email,
    redirect_to: redirectTo,
  });
}

export async function requestPasswordReset(email: string, redirectTo: string) {
  return postJson<MessageResponse>('/auth/password-reset/', {
    email,
    redirect_to: redirectTo,
  });
}

export async function confirmPasswordReset(token: string, password: string, password2: string) {
  return postJson<MessageResponse>('/auth/password-reset/confirm/', {
    token,
    password,
    password2,
  });
}

export async function signInWithPassword(email: string, password: string) {
  const response = await fetch(`${API_ROOT}/auth/token/`, {
    method: 'POST',
    headers: buildHeaders(undefined, { includeJsonContentType: true, includeAuth: false }),
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error('Email or password is incorrect. You can also use a login link.');
  }

  const tokens = (await response.json()) as TokenPairResponse;
  await persistSessionTokens(tokens);
  return fetchUserProfile();
}

export async function verifyEmailMagicLink(token: string) {
  const session = await postJson<AuthResponse>('/auth/email-login/verify/', { token });
  await persistSessionTokens(session.tokens);
  return session.user ? mapUser(session.user) : fetchUserProfile();
}

export async function getGoogleAuthUrl(redirectTo: string) {
  const response = await fetch(
    `${API_ROOT}/auth/google/url/?${new URLSearchParams({ redirect_to: redirectTo }).toString()}`,
  );

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  const payload = (await response.json()) as GoogleAuthUrlResponse;
  return payload.url;
}

export async function fetchUserProfile() {
  const payload = await apiFetchJson<BackendUser>('/auth/profile/');
  return mapUser(payload);
}

export async function updateUserProfile(input: UpdateProfileInput) {
  if (input.avatar) {
    const formData = new FormData();
    formData.append('name', input.name.trim());
    formData.append('phone', input.phone.trim());
    formData.append('email_notifications_enabled', input.emailNotificationsEnabled ? 'true' : 'false');
    formData.append('push_notifications_enabled', input.pushNotificationsEnabled ? 'true' : 'false');
    appendUploadFile(formData, 'avatar', input.avatar);

    const payload = await uploadFormDataJson<BackendUser>('/auth/profile/update/', formData, undefined, 'PATCH');
    return mapUser(payload);
  }

  const payload = await apiFetchJson<BackendUser>('/auth/profile/update/', {
    method: 'PATCH',
    body: JSON.stringify({
      name: input.name.trim(),
      phone: input.phone.trim(),
      email_notifications_enabled: input.emailNotificationsEnabled,
      push_notifications_enabled: input.pushNotificationsEnabled,
    }),
  });
  return mapUser(payload);
}

export async function changeUserPassword(input: ChangePasswordInput) {
  return postJson<MessageResponse>('/auth/change-password/', {
    old_password: input.oldPassword?.trim() || '',
    new_password: input.newPassword,
    new_password2: input.confirmPassword,
  });
}

export async function registerPushDevice(token: string, platform: string, provider = 'firebase', deviceName?: string) {
  return postJson<MessageResponse>('/auth/push/register/', {
    token,
    platform,
    provider,
    device_name: deviceName ?? '',
  });
}

export async function unregisterPushDevice(token?: string) {
  return postJson<MessageResponse>('/auth/push/unregister/', {
    token: token ?? '',
  });
}

export async function signOut() {
  accessToken = '';
  refreshToken = '';
  await clearStoredSessionTokens();
}

export async function fetchAppBootstrap() {
  const payload = await apiFetchJson<BackendBootstrapResponse>('/listings/app-bootstrap/');
  return mapBootstrap(payload);
}

export async function fetchAppUpdatePolicy(platform: string): Promise<AppUpdatePolicy> {
  const params = new URLSearchParams({ platform });
  const payload = await apiFetchJson<BackendAppVersionResponse>(`/listings/app-version/?${params.toString()}`);

  return {
    latestVersion: payload.latest_version,
    minRequiredVersion: payload.min_required_version,
    forceUpdate: Boolean(payload.force_update),
    updateUrl: payload.update_url,
    message: payload.message,
  };
}

export async function fetchAppFeed({
  categories,
  categoryId = 'all',
  latitude,
  longitude,
  page = 1,
  pageSize = 10,
  search = '',
}: {
  categories: AppCategory[];
  categoryId?: string;
  latitude?: number | null;
  longitude?: number | null;
  page?: number;
  pageSize?: number;
  search?: string;
}): Promise<AppEventPage> {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
  });

  const trimmedSearch = search.trim();
  if (trimmedSearch) {
    params.set('search', trimmedSearch);
  }

  if (categoryId && categoryId !== 'all') {
    params.set('category', categoryId);
  }

  if (typeof latitude === 'number' && Number.isFinite(latitude)) {
    params.set('lat', latitude.toFixed(6));
  }

  if (typeof longitude === 'number' && Number.isFinite(longitude)) {
    params.set('lng', longitude.toFixed(6));
  }

  const payload = await apiFetchJson<BackendPaginatedResponse<BackendListing>>(`/listings/app-feed/?${params.toString()}`);
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));

  return {
    events: (payload.results ?? []).map((listing) => mapListingToEvent(listing, categoryLookup)),
    nextPage: readNextPage(payload.next),
    totalCount: payload.count ?? 0,
  };
}

export async function fetchAppSearchSuggestions({
  categoryId = 'all',
  query = '',
  limit = 8,
}: {
  categoryId?: string;
  query?: string;
  limit?: number;
} = {}): Promise<AppSearchSuggestion[]> {
  const params = new URLSearchParams({
    limit: String(limit),
  });
  const trimmedQuery = query.trim();

  if (trimmedQuery) {
    params.set('q', trimmedQuery);
  }

  if (categoryId && categoryId !== 'all') {
    params.set('category', categoryId);
  }

  const payload = await apiFetchJson<{ results?: BackendSearchSuggestion[] }>(
    `/listings/app-search-suggestions/?${params.toString()}`,
  );

  return (payload.results ?? [])
    .map((suggestion, index) => ({
      id: String(suggestion.id ?? `${suggestion.type ?? 'suggestion'}-${index}`),
      label: suggestion.label,
      query: suggestion.query ?? suggestion.label,
      type: suggestion.type ?? 'popular',
      hint: suggestion.hint ?? undefined,
    }))
    .filter((suggestion) => suggestion.label.trim().length > 0 && suggestion.query.trim().length > 0);
}

export async function recordSearchQuery({
  categoryId = 'all',
  query,
  resultCount = 0,
}: {
  categoryId?: string;
  query: string;
  resultCount?: number;
}) {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return;
  }

  await apiFetchJson<{ ok: boolean }>('/listings/app-search-log/', {
    method: 'POST',
    body: JSON.stringify({
      category: categoryId,
      query: trimmedQuery,
      result_count: resultCount,
    }),
  });
}

export async function fetchAppSpotlight({
  categories,
  categoryId = 'all',
  latitude,
  longitude,
  limit = 4,
}: {
  categories: AppCategory[];
  categoryId?: string;
  latitude?: number | null;
  longitude?: number | null;
  limit?: number;
}): Promise<AppEvent[]> {
  const params = new URLSearchParams({
    limit: String(limit),
  });

  if (categoryId && categoryId !== 'all') {
    params.set('category', categoryId);
  }

  if (typeof latitude === 'number' && Number.isFinite(latitude)) {
    params.set('lat', latitude.toFixed(6));
  }

  if (typeof longitude === 'number' && Number.isFinite(longitude)) {
    params.set('lng', longitude.toFixed(6));
  }

  const payload = await apiFetchJson<{ results?: BackendListing[] }>(`/listings/app-spotlight/?${params.toString()}`);
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return (payload.results ?? []).map((listing) => mapListingToEvent(listing, categoryLookup));
}

export async function recordListingView(eventId: string) {
  await apiFetchJson(`/listings/${eventId}/record-view/`, {
    method: 'POST',
  });
}

export async function fetchEventListing(eventId: string, categories: AppCategory[]) {
  const listing = await apiFetchJson<BackendListing>(`/listings/${eventId}/`);
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return mapListingToEvent(listing, categoryLookup);
}

export async function toggleSavedListing(eventId: string) {
  const response = await apiFetchJson<ToggleSaveResponse>(`/listings/${eventId}/toggle-save/`, {
    method: 'POST',
  });

  return {
    eventId: String(response.listing_id),
    isSaved: response.is_saved,
    saveCount: response.saved_count,
  };
}

export async function submitEventRating(eventId: string, rating: number) {
  const response = await apiFetchJson<RatingResponse>(`/listings/${eventId}/ratings/`, {
    method: 'POST',
    body: JSON.stringify({ rating }),
  });

  return {
    averageRating: response.average_rating,
    ratingCount: response.rating_count,
  };
}

export async function fetchListingComments({
  listingId,
  page = 1,
  parentId,
  replyPreviewLimit = 2,
}: {
  listingId: string;
  page?: number;
  parentId?: string | null;
  replyPreviewLimit?: number;
}): Promise<AppCommentPage> {
  const params = new URLSearchParams({
    listing: listingId,
    page: String(page),
    include_replies: 'true',
    reply_preview_limit: String(replyPreviewLimit),
  });

  if (parentId) {
    params.set('parent', parentId);
  } else {
    params.set('top_level', 'true');
  }

  const payload = await apiFetchJson<BackendPaginatedResponse<BackendComment>>(`/comments/?${params.toString()}`);

  return {
    comments: (payload.results ?? []).map(mapComment),
    nextPage: readNextPage(payload.next),
    totalCount: payload.count ?? 0,
  };
}

export async function createListingComment(input: CreateAppCommentInput) {
  const message = input.message.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.attachments.length > 0 ? 25000 : 15000);

  try {
    let payload: BackendComment;

    if (input.attachments.length === 0) {
      const body: Record<string, string> = {
        listing: input.listingId,
        message,
      };
      if (input.parentId) {
        body.parent = input.parentId;
      }

      payload = await apiFetchJson<BackendComment>('/comments/', {
        method: 'POST',
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } else {
      const formData = new FormData();

      formData.append('listing', input.listingId);
      if (input.parentId) {
        formData.append('parent', input.parentId);
      }
      if (message) {
        formData.append('message', message);
      }

      input.attachments.forEach((attachment) => {
        appendUploadFile(formData, 'files', attachment);
      });

      payload = await apiFetchJson<BackendComment>('/comments/', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
    }

    return mapComment(payload);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Comment request timed out. Please try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function markNotificationRead(notificationId: string) {
  await apiFetchJson(`/notifications/${notificationId}/mark_read/`, {
    method: 'POST',
  });
}

export async function markAllNotificationsRead() {
  await apiFetchJson('/notifications/mark_all_read/', {
    method: 'POST',
  });
}

export async function bookEventTicket(eventId: string, categories: AppCategory[], input?: BookingCheckoutInput) {
  const response = await apiFetchJson<{
    created: boolean;
    payment_required?: boolean;
    payment_status?: AppTicket['paymentStatus'];
    poll_after_seconds?: number | null;
    ticket: BackendTicket;
  }>(`/listings/${eventId}/book/`, {
    method: 'POST',
    body: JSON.stringify({
      payment_method: input?.paymentMethod,
      phone: input?.phone,
      quantity: input?.quantity ?? 1,
      request_note: input?.requestNote,
    }),
  });
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return mapTicket(response.ticket, categoryLookup);
}

export async function pollTicketPayment(ticketId: string, categories: AppCategory[]) {
  const response = await apiFetchJson<{ ticket: BackendTicket }>(`/listings/tickets/${ticketId}/poll-payment/`, {
    method: 'POST',
  });
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return mapTicket(response.ticket, categoryLookup);
}

export async function verifyTicketQr(qr: string, categories: AppCategory[]) {
  const response = await apiFetchJson<{ valid: boolean; message?: string; ticket: BackendTicket }>('/listings/tickets/verify-qr/', {
    method: 'POST',
    body: JSON.stringify({ qr }),
  });
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return {
    valid: response.valid,
    message: response.message ?? 'Booking verified.',
    ticket: mapTicket(response.ticket, categoryLookup),
  };
}

export async function verifyTicketReference(reference: string, categories: AppCategory[]) {
  const response = await apiFetchJson<{ valid: boolean; message?: string; ticket: BackendTicket }>('/listings/tickets/verify-qr/', {
    method: 'POST',
    body: JSON.stringify({ reference }),
  });
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return {
    valid: response.valid,
    message: response.message ?? 'Booking verified.',
    ticket: mapTicket(response.ticket, categoryLookup),
  };
}

export async function setListingInternalPayments(eventId: string, acceptsInternalPayments: boolean, categories: AppCategory[]) {
  const listing = await apiFetchJson<BackendListing>(`/listings/${eventId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ accepts_internal_payments: acceptsInternalPayments }),
  });
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return mapListingToEvent(listing, categoryLookup);
}

export async function cancelTicket(ticketId: string, categories: AppCategory[]) {
  const response = await apiFetchJson<{ message?: string; ticket: BackendTicket }>(`/listings/tickets/${ticketId}/cancel/`, {
    method: 'POST',
  });
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return {
    message: response.message ?? 'Ticket cancelled.',
    ticket: mapTicket(response.ticket, categoryLookup),
  };
}

export async function confirmTicket(ticketId: string, categories: AppCategory[]) {
  const response = await apiFetchJson<{ message?: string; ticket: BackendTicket }>(`/listings/tickets/${ticketId}/confirm/`, {
    method: 'POST',
  });
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return {
    message: response.message ?? 'Booking confirmed.',
    ticket: mapTicket(response.ticket, categoryLookup),
  };
}

export const acceptTicket = confirmTicket;

export async function markTicketUsed(ticketId: string, categories: AppCategory[]) {
  const response = await apiFetchJson<{ message?: string; ticket: BackendTicket }>(`/listings/tickets/${ticketId}/mark-used/`, {
    method: 'POST',
  });
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return {
    message: response.message ?? 'Ticket marked as used.',
    ticket: mapTicket(response.ticket, categoryLookup),
  };
}

export async function clearHistory() {
  return apiFetchJson<{ message: string; deleted_count: number }>('/listings/clear-history/', {
    method: 'POST',
  });
}

export async function removeHistoryItem(eventId: string) {
  return apiFetchJson<{ listing_id: number; removed: boolean }>(`/listings/${eventId}/remove-from-history/`, {
    method: 'POST',
  });
}

export async function createEventListing(
  input: CreateAppEventInput,
  categories: AppCategory[],
  callbacks: {
    onProgress?: (progress: number) => void;
    onStageChange?: (stage: string) => void;
  } = {},
) {
  if (!input.heroImage) {
    throw new Error('Upload the hero image before publishing.');
  }

  const primaryCategory = categories.find((category) => category.id === input.categoryId);
  if (!primaryCategory) {
    throw new Error('Select a valid category before publishing.');
  }

  const socials = buildSocials(input);
  const contacts = buildContacts(input);
  const fallbackAddress = [input.venue, input.city].filter(Boolean).join(', ') || input.venue;
  const payload = {
    listing_kind: 'event',
    name: input.venue,
    category: resolveCategoryNumericId(primaryCategory.id, categories),
    description: input.about || input.blurb || `${input.title} at ${input.venue}`,
    address: input.address || fallbackAddress,
    latitude: input.latitude,
    longitude: input.longitude,
    phone: input.phone || null,
    website: input.website || null,
    email: input.email || null,
    price_range: input.priceRange,
    display_price: formatDisplayPrice(input.price || input.priceRange),
    accepts_internal_payments: input.acceptsInternalPayments ?? true,
    app_data: {
      artist: input.artist,
      title: input.title,
      venue: input.venue,
      city: input.city,
      date_label: input.dateLabel,
      day: input.day,
      month: input.month,
      weekday: input.weekday,
      time: input.time,
      price: formatDisplayPrice(input.price || input.priceRange),
      blurb: input.blurb,
      highlights: input.highlights,
      location: {
        label: input.locationLabel,
        address: input.address || fallbackAddress,
        note: input.locationNote,
        latitude_delta: 0.012,
        longitude_delta: 0.012,
      },
      contacts,
      socials,
    },
    tag_names: input.tags,
  };

  callbacks.onStageChange?.('Saving details');
  callbacks.onProgress?.(0.08);

  const created = await apiFetchJson<BackendListing>('/listings/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  callbacks.onStageChange?.('Uploading media');
  callbacks.onProgress?.(0.16);

  try {
    await uploadListingMedia(created.id, input, (ratio) => {
      callbacks.onProgress?.(clampProgress(0.16 + clampProgress(ratio) * 0.74));
    });
  } catch (error) {
    await apiFetch(`/listings/${created.id}/`, { method: 'DELETE' }).catch(() => undefined);
    throw error;
  }

  callbacks.onStageChange?.('Finishing');
  callbacks.onProgress?.(0.94);
  const hydrated = await apiFetchJson<BackendListing>(`/listings/${created.id}/`);
  callbacks.onProgress?.(1);
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return mapListingToEvent(hydrated, categoryLookup);
}

export async function updateEventListing(
  eventId: string,
  input: CreateAppEventInput,
  categories: AppCategory[],
  existingEvent: AppEvent,
  callbacks: {
    onProgress?: (progress: number) => void;
    onStageChange?: (stage: string) => void;
  } = {},
) {
  const primaryCategory = categories.find((category) => category.id === input.categoryId);
  if (!primaryCategory) {
    throw new Error('Select a valid category before saving.');
  }

  const socials = buildSocials(input);
  const contacts = buildContacts(input);
  const fallbackAddress = [input.venue, input.city].filter(Boolean).join(', ') || input.venue;
  const preservedMedia = (input.existingMedia ?? existingEvent.media).map((media, index) => ({
    image_type: media.role,
    media_kind: media.kind,
    image_url: media.kind === 'image' ? media.source : media.preview ?? existingEvent.image,
    video_url: media.kind === 'video' ? media.source : null,
    alt_text: media.altText ?? `${input.title} media`,
    is_primary: media.role === 'hero' && media.kind === 'image',
    order: index,
  }));

  const payload = {
    listing_kind: 'event',
    name: input.venue,
    category: resolveCategoryNumericId(primaryCategory.id, categories),
    description: input.about || input.blurb || `${input.title} at ${input.venue}`,
    address: input.address || fallbackAddress,
    latitude: input.latitude,
    longitude: input.longitude,
    phone: input.phone || null,
    website: input.website || null,
    email: input.email || null,
    price_range: input.priceRange,
    display_price: formatDisplayPrice(input.price || input.priceRange),
    accepts_internal_payments: input.acceptsInternalPayments ?? existingEvent.acceptsInternalPayments,
    images_payload: preservedMedia,
    app_data: {
      artist: input.artist,
      title: input.title,
      venue: input.venue,
      city: input.city,
      date_label: input.dateLabel,
      day: input.day,
      month: input.month,
      weekday: input.weekday,
      time: input.time,
      price: formatDisplayPrice(input.price || input.priceRange),
      blurb: input.blurb,
      highlights: input.highlights,
      location: {
        label: input.locationLabel,
        address: input.address || fallbackAddress,
        note: input.locationNote,
        latitude_delta: existingEvent.location.latitudeDelta,
        longitude_delta: existingEvent.location.longitudeDelta,
      },
      contacts,
      socials,
    },
    tag_names: input.tags,
  };

  callbacks.onStageChange?.('Saving changes');
  callbacks.onProgress?.(0.08);

  await apiFetchJson<BackendListing>(`/listings/${eventId}/`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  const hasNewMedia = Boolean(input.heroImage || input.ticketImage || input.galleryMedia.length > 0);
  if (hasNewMedia) {
    callbacks.onStageChange?.('Uploading new media');
    callbacks.onProgress?.(0.24);
    await uploadListingMedia(
      Number(eventId),
      {
        ...input,
        heroImage: input.heroImage ?? null,
      } as CreateAppEventInput,
      (ratio) => callbacks.onProgress?.(clampProgress(0.24 + clampProgress(ratio) * 0.58)),
      {
        includeHero: Boolean(input.heroImage),
        includeTicket: Boolean(input.ticketImage),
      },
    );
  }

  callbacks.onStageChange?.('Finishing');
  callbacks.onProgress?.(0.94);
  const hydrated = await apiFetchJson<BackendListing>(`/listings/${eventId}/`);
  callbacks.onProgress?.(1);
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));
  return mapListingToEvent(hydrated, categoryLookup);
}

export async function deleteEventListing(eventId: string) {
  await apiFetch(`/listings/${eventId}/`, {
    method: 'DELETE',
  });
}

async function apiFetchJson<T>(path: string, init: RequestInit = {}) {
  const response = await apiFetch(path, init);
  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${API_ROOT}${path}`, {
    method: 'POST',
    headers: buildHeaders(undefined, { includeJsonContentType: true, includeAuth: false }),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(await readApiErrorMessage(response));
  }

  return (await response.json()) as T;
}

async function apiFetch(path: string, init: RequestInit = {}) {
  const isFormData = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: buildHeaders(init.headers, { includeJsonContentType: !isFormData }),
  });

  if (response.status !== 401 || !refreshToken) {
    if (!response.ok) {
      throw new Error(await readApiErrorMessage(response));
    }
    return response;
  }

  try {
    const refreshed = await postJson<RefreshResponse>('/auth/token/refresh/', { refresh: refreshToken });
    await persistSessionTokens({
      access: refreshed.access ?? '',
      refresh: refreshed.refresh ?? refreshToken,
    });
  } catch (error) {
    await signOut();
    throw error;
  }

  const retry = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: buildHeaders(init.headers, { includeJsonContentType: !isFormData }),
  });

  if (!retry.ok) {
    throw new Error(await readApiErrorMessage(retry));
  }

  return retry;
}

async function persistSessionTokens(tokens: { access: string; refresh: string }) {
  accessToken = tokens.access;
  refreshToken = tokens.refresh;
  await writeStoredSessionTokens(tokens);
}

function buildHeaders(
  headersInit?: HeadersInit,
  options: {
    includeJsonContentType?: boolean;
    includeAuth?: boolean;
  } = {},
) {
  const headers = new Headers(headersInit);

  if (options.includeJsonContentType && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (options.includeAuth !== false && accessToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  return headers;
}

function appendUploadFile(formData: FormData, fieldName: string, file: LocalUploadFile) {
  if (file.webFile) {
    formData.append(fieldName, file.webFile);
    return;
  }

  formData.append(fieldName, {
    uri: file.uri,
    name: file.name,
    type: file.mimeType,
  } as never);
}

function isVideoUpload(file: LocalUploadImage) {
  return file.mimeType.startsWith('video/');
}

async function readApiErrorMessage(response: Response) {
  const fallback =
    response.status >= 500
      ? 'Something went wrong. Please try again.'
      : `Request failed with ${response.status}`;

  let raw = '';

  try {
    raw = await response.text();
  } catch {
    return fallback;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const payload = JSON.parse(trimmed) as Record<string, unknown>;
    const extracted = extractApiErrorMessage(payload);
    if (extracted) {
      return extracted;
    }
  } catch {
    if (!trimmed.startsWith('<!doctype') && !trimmed.startsWith('<html')) {
      return trimmed;
    }
  }

  if (response.status === 400) {
    return 'Please review the information and try again.';
  }

  return fallback;
}

function extractApiErrorMessage(payload: Record<string, unknown>) {
  const message = readString(payload.message);
  if (message) {
    return message;
  }

  const detail = readString(payload.detail);
  if (detail) {
    return detail;
  }

  const errors = payload.errors;
  if (errors && typeof errors === 'object' && !Array.isArray(errors)) {
    const firstError = Object.values(errors).flatMap(flattenApiErrorValues)[0];
    if (firstError) {
      return firstError;
    }
  }

  const firstValue = Object.values(payload).flatMap(flattenApiErrorValues)[0];
  return firstValue ?? null;
}

function flattenApiErrorValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.trim() ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap(flattenApiErrorValues);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(flattenApiErrorValues);
  }

  return [];
}

async function uploadFormDataJson<T>(
  path: string,
  formData: FormData,
  onProgress?: (progress: number) => void,
  method: 'POST' | 'PATCH' = 'POST',
) {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, `${API_ROOT}${path}`);

    const headers = buildHeaders(undefined, { includeJsonContentType: false });
    headers.forEach((value, key) => {
      xhr.setRequestHeader(key, value);
    });

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(clampProgress(event.loaded / event.total));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Upload failed. Please check your connection and try again.'));
    };

    xhr.onload = () => {
      const status = xhr.status;
      const responseText = xhr.responseText ?? '';

      if (status >= 200 && status < 300) {
        try {
          resolve(JSON.parse(responseText) as T);
        } catch {
          resolve([] as T);
        }
        return;
      }

      reject(new Error(readApiErrorMessageFromText(status, responseText)));
    };

    xhr.send(formData);
  });
}

function clampProgress(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(value, 1));
}

function readApiErrorMessageFromText(status: number, raw: string) {
  const trimmed = raw.trim();
  const fallback = status >= 500 ? 'Something went wrong. Please try again.' : `Request failed with ${status}`;

  if (!trimmed) {
    return fallback;
  }

  try {
    const payload = JSON.parse(trimmed) as Record<string, unknown>;
    return extractApiErrorMessage(payload) ?? fallback;
  } catch {
    if (!trimmed.startsWith('<!doctype') && !trimmed.startsWith('<html')) {
      return trimmed;
    }
  }

  if (status === 400) {
    return 'Please review the information and try again.';
  }

  return fallback;
}

async function uploadListingMedia(
  listingId: number,
  input: CreateAppEventInput,
  onProgress?: (progress: number) => void,
  options: {
    includeHero?: boolean;
    includeTicket?: boolean;
  } = {},
) {
  const files: Array<{
    file: LocalUploadImage;
    imageType: 'hero' | 'ticket' | 'gallery';
    altText: string;
    isPrimary: boolean;
    order: number;
  }> = [];

  if ((options.includeHero ?? true) && input.heroImage) {
    files.push({
      file: input.heroImage,
      imageType: 'hero',
      altText: `${input.title} hero media`,
      isPrimary: true,
      order: files.length,
    });
  }

  if ((options.includeTicket ?? true) && input.ticketImage) {
    files.push({
      file: input.ticketImage,
      imageType: 'ticket',
      altText: `${input.title} ticket art`,
      isPrimary: false,
      order: files.length,
    });
  }

  input.galleryMedia.forEach((file) => {
    files.push({
      file,
      imageType: 'gallery',
      altText: `${input.title} gallery media`,
      isPrimary: false,
      order: files.length,
    });
  });

  const formData = new FormData();

  files.forEach((entry, index) => {
    appendUploadFile(formData, 'media', entry.file);
    if (entry.file.posterImage) {
      appendUploadFile(formData, `poster_${index}`, entry.file.posterImage);
    }
    formData.append(`alt_text_${index}`, entry.altText);
    formData.append(`image_type_${index}`, entry.imageType);
    formData.append(`media_kind_${index}`, isVideoUpload(entry.file) ? 'video' : 'image');
    formData.append(`is_primary_${index}`, entry.isPrimary ? 'true' : 'false');
    formData.append(`order_${index}`, String(entry.order));
  });

  if (files.length === 0) {
    onProgress?.(1);
    return;
  }

  await uploadFormDataJson(`/listings/${listingId}/upload_images/`, formData, onProgress);
}

function mapBootstrap(payload: BackendBootstrapResponse): AppBootstrap {
  const categories = mapCategories(payload.categories ?? []);
  const categoryLookup = new Map(categories.map((category) => [category.id, category]));

  return {
    categories,
    events: (payload.listings ?? []).map((listing) => mapListingToEvent(listing, categoryLookup)),
    myListings: (payload.my_listings ?? []).map((listing) => mapListingToEvent(listing, categoryLookup)),
    history: (payload.history ?? []).map((listing) => mapListingToEvent(listing, categoryLookup)),
    tickets: (payload.tickets ?? []).map((ticket) => mapTicket(ticket, categoryLookup)),
    receivedTickets: (payload.received_tickets ?? []).map((ticket) => mapTicket(ticket, categoryLookup)),
    notifications: (payload.notifications ?? []).map(mapNotification),
    unreadNotificationCount: payload.unread_notification_count ?? 0,
    profile: payload.profile ? mapUser(payload.profile) : null,
  };
}

function mapCategories(categories: BackendCategory[]): AppCategory[] {
  const mapped = categories
    .slice()
    .sort((left, right) => (left.order ?? left.id) - (right.order ?? right.id))
    .map((category) => ({
      id: category.slug,
      name: category.name,
      icon: resolveCategoryIcon(category.icon, category.slug),
      backendId: category.id,
    }));

  return [
    {
      id: 'all',
      name: 'For you',
      icon: 'zap',
    },
    ...mapped,
  ];
}

function mapListingToEvent(listing: BackendListing, categoryLookup: Map<string, AppCategory>): AppEvent {
  const appData = (listing.app_data ?? {}) as Record<string, unknown>;
  const categoryRefs = buildCategoryRefs(listing, appData, categoryLookup);
  const media = mapListingMedia(listing);
  const lat = toNumber(listing.latitude) ?? 0;
  const lng = toNumber(listing.longitude) ?? 0;
  const location = readObject(appData.location);
  const contacts = readContacts(appData.contacts);
  const socials = readSocials(appData.socials);
  const ratingFromBackend = toNumber(listing.average_rating);
  const rating = ratingFromBackend && ratingFromBackend > 0 ? ratingFromBackend : toNumber(appData.rating) ?? 0;
  const heroMedia = media.find((item) => item.role === 'hero');
  const heroImage =
    (heroMedia?.kind === 'image' ? heroMedia.source : heroMedia?.preview) ??
    media.find((item) => item.kind === 'image')?.source ??
    media.find((item) => item.preview)?.preview ??
    normalizeBackendMediaUrl(listing.primary_image) ??
    '';

  return {
    id: String(listing.id),
    artist: readString(appData.artist) ?? readString(appData.title) ?? listing.name,
    title: readString(appData.title) ?? listing.name,
    city: readString(appData.city) ?? extractCity(listing.address),
    venue: readString(appData.venue) ?? listing.name,
    dateLabel: readString(appData.date_label) ?? 'Coming soon',
    day: readString(appData.day) ?? '--',
    month: readString(appData.month) ?? '--',
    weekday: readString(appData.weekday) ?? 'Any day',
    time: readString(appData.time) ?? 'TBA',
    price: formatDisplayPrice(readString(appData.price) ?? listing.display_price ?? listing.price_range ?? '$$'),
    rating,
    ratingCount: listing.rating_count ?? 0,
    commentCount: listing.comment_count ?? 0,
    image: heroImage,
    ticketImage: normalizeBackendMediaUrl(listing.ticket_image) ?? normalizeBackendMediaUrl(listing.primary_image) ?? '',
    media,
    blurb: readString(appData.blurb) ?? listing.description,
    about: listing.description,
    highlights: readStringArray(appData.highlights),
    categories: categoryRefs,
    location: {
      label: readString(location.label) ?? 'Location',
      address: readString(location.address) ?? listing.address,
      note: readString(location.note) ?? 'Check the map before you head out.',
      latitude: lat,
      longitude: lng,
      latitudeDelta: toNumber(location.latitude_delta) ?? 0.012,
      longitudeDelta: toNumber(location.longitude_delta) ?? 0.012,
    },
    contacts,
    socials,
    isSaved: Boolean(listing.user_has_saved),
    saveCount: listing.saved_count ?? 0,
    hasTicket: Boolean((listing as BackendListing & { user_has_ticket?: boolean }).user_has_ticket),
    acceptsInternalPayments: listing.accepts_internal_payments !== false,
    ownerName: listing.owner_name ?? null,
    ownerCanEdit: Boolean(listing.owner_can_edit),
    ownerEditExpiresAt: listing.owner_edit_expires_at ?? null,
    ownerSoldCount: listing.owner_sold_count ?? 0,
    ownerRevenueTotal: String(listing.owner_revenue_total ?? '0.00'),
    createdAt: listing.created_at,
    isTrending: Boolean(listing.is_trending),
    isFeatured: Boolean(listing.is_featured),
    isVerified: Boolean(listing.is_verified),
    vibePercentage: listing.vibe_percentage ?? 25,
  };
}

function mapTicket(ticket: BackendTicket, categoryLookup: Map<string, AppCategory>): AppTicket {
  const fallbackListing: BackendListing = ticket.listing ?? {
    id: ticket.listing_id,
    name: ticket.listing_name ?? 'Ticket',
    category_name: '',
    category_slug: '',
    description: '',
    address: '',
    app_data: {},
  };
  const event = mapListingToEvent(
    {
      ...fallbackListing,
      user_has_ticket: ['confirmed', 'accepted'].includes(ticket.status),
    },
    categoryLookup,
  );

  return {
    id: String(ticket.id),
    eventId: String(ticket.listing_id),
    event,
    buyerName: ticket.buyer_name ?? null,
    buyerEmail: ticket.buyer_email ?? null,
    actionType: ticket.action_type ?? 'ticket',
    quantity: ticket.quantity ?? 1,
    unitPrice: String(ticket.unit_price ?? '0.00'),
    totalAmount: String(ticket.total_amount ?? '0.00'),
    currency: ticket.currency ?? 'USD',
    referenceCode: ticket.reference_code,
    qrValue: ticket.qr_payload,
    status: ticket.status,
    paymentStatus: ticket.payment_status ?? 'not_required',
    paymentMethod: ticket.payment_method ?? null,
    paynowReference: ticket.paynow_reference ?? null,
    requestNote: ticket.request_note ?? '',
    canCancel: Boolean(ticket.can_cancel),
    canAccept: Boolean(ticket.can_accept),
    canMarkUsed: Boolean(ticket.can_mark_used),
    canManage: Boolean(ticket.can_manage),
    bookedAt: ticket.booked_at,
    updatedAt: ticket.updated_at,
  };
}

function formatDisplayPrice(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '$$';
  }

  if (/^\${1,4}$/.test(trimmed) || /^(free|tba|coming soon)$/i.test(trimmed)) {
    return trimmed;
  }

  if (/^\d+(?:\.\d{1,2})?$/.test(trimmed.replace(',', ''))) {
    return `$${trimmed}`;
  }

  return trimmed;
}

function mapNotification(notification: BackendNotification): AppNotification {
  return {
    id: String(notification.id),
    type: notification.notification_type,
    title: notification.title,
    message: notification.message,
    listingId: notification.listing_id ? String(notification.listing_id) : undefined,
    listingName: notification.listing_name ?? undefined,
    isRead: notification.is_read,
    createdAt: notification.created_at,
  };
}

function mapComment(comment: BackendComment): AppComment {
  return {
    id: String(comment.id),
    listingId: String(comment.listing ?? ''),
    user: mapCommentUser(comment.user),
    parentId: comment.parent_id ?? null,
    parentAuthor: comment.parent_author ?? null,
    message: comment.message,
    role: comment.role ?? null,
    replies: (comment.replies ?? []).map(mapComment),
    attachments: (comment.attachments ?? []).map(mapCommentAttachment),
    isEdited: comment.is_edited,
    isDeleted: comment.is_deleted,
    isPinned: comment.is_pinned,
    depth: comment.depth ?? 0,
    replyCount: comment.reply_count ?? 0,
    createdAt: comment.created_at,
    updatedAt: comment.updated_at,
  };
}

function mapCommentUser(user: BackendUser): AppCommentUser {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    avatar: normalizeBackendMediaUrl(user.display_avatar) ?? null,
  };
}

function mapCommentAttachment(attachment: BackendCommentAttachment): AppCommentAttachment {
  return {
    id: String(attachment.id),
    type: attachment.attachment_type,
    fileUrl: normalizeBackendMediaUrl(attachment.file_url) ?? null,
    thumbnailUrl: normalizeBackendMediaUrl(attachment.thumbnail_url) ?? null,
    url: attachment.url ?? null,
    title: attachment.link_title ?? null,
    description: attachment.link_description ?? null,
    image: normalizeBackendMediaUrl(attachment.link_image) ?? attachment.link_image ?? null,
    altText: attachment.alt_text ?? null,
    createdAt: attachment.created_at,
  };
}

function mapUser(user: BackendUser): AppUser {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    phone: user.phone ?? null,
    avatar: normalizeBackendMediaUrl(user.display_avatar) ?? null,
    emailNotificationsEnabled: user.email_notifications_enabled,
    pushNotificationsEnabled: user.push_notifications_enabled,
  };
}

function normalizeBackendMediaUrl(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (value.startsWith('/media/')) {
    return `${BACKEND_ORIGIN}${value}`;
  }

  try {
    const url = new URL(value);
    if (url.pathname.startsWith('/media/')) {
      return `${BACKEND_ORIGIN}${url.pathname}${url.search}`;
    }
  } catch {
    return value;
  }

  return value;
}

function mapListingMedia(listing: BackendListing): AppEventMedia[] {
  const media = (listing.images ?? [])
    .slice()
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .flatMap((item, index) => {
      const kind: AppEventMedia['kind'] = item.media_kind === 'video' ? 'video' : 'image';
      const source = normalizeBackendMediaUrl(kind === 'video' ? item.video_url : item.image_url);

      if (!source) {
        return [];
      }

      return [
        {
          id: String(item.id ?? `${listing.id}-media-${index}`),
          kind,
          role: readMediaRole(item.image_type),
          source,
          preview: normalizeBackendMediaUrl(item.image_url) ?? normalizeBackendMediaUrl(listing.primary_image) ?? null,
          altText: item.alt_text ?? null,
        },
      ];
    })
    .filter((item) => item.role !== 'ticket');

  if (media.length > 0) {
    return dedupeMedia(media);
  }

  const fallback = normalizeBackendMediaUrl(listing.primary_image);
  if (!fallback) {
    return [];
  }

  return [
    {
      id: `${listing.id}-fallback`,
      kind: 'image',
      role: 'hero',
      source: fallback,
      preview: fallback,
      altText: listing.name,
    },
  ];
}

function dedupeMedia(media: AppEventMedia[]) {
  const seen = new Set<string>();
  return media.filter((item) => {
    const key = `${item.kind}:${item.source}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function readMediaRole(value: unknown): AppEventMedia['role'] {
  if (value === 'hero' || value === 'ticket') {
    return value;
  }
  return 'gallery';
}

function readNextPage(next: string | null | undefined) {
  if (!next) {
    return null;
  }

  try {
    const url = new URL(next, API_ROOT);
    const page = Number(url.searchParams.get('page'));
    return Number.isFinite(page) && page > 0 ? page : null;
  } catch {
    return null;
  }
}

function buildCategoryRefs(
  listing: BackendListing,
  appData: Record<string, unknown>,
  categoryLookup: Map<string, AppCategory>,
) {
  const refs: AppEventCategory[] = [];
  const primary = categoryLookup.get(listing.category_slug);

  if (primary) {
    refs.push(primary);
  } else {
    refs.push({
      id: listing.category_slug,
      name: listing.category_name,
      icon: resolveCategoryIcon(listing.category_icon, listing.category_slug),
    });
  }

  const secondary = readStringArray(appData.secondary_category_slugs);
  secondary.forEach((slug) => {
    const existing = refs.find((category) => category.id === slug);
    if (existing) {
      return;
    }

    const category = categoryLookup.get(slug);
    if (category) {
      refs.push(category);
      return;
    }

    refs.push({
      id: slug,
      name: humanizeSlug(slug),
      icon: resolveCategoryIcon(undefined, slug),
    });
  });

  return refs;
}

function buildContacts(input: CreateAppEventInput): EventContactLink[] {
  const contacts: EventContactLink[] = [];

  if (input.phone.trim().length > 0) {
    contacts.push({
      id: 'phone',
      label: 'Call host',
      icon: 'phone-call',
      url: input.phone.startsWith('tel:') ? input.phone : `tel:${input.phone}`,
    });
  }

  if (input.email.trim().length > 0) {
    contacts.push({
      id: 'mail',
      label: 'Email',
      icon: 'mail',
      url: input.email.startsWith('mailto:') ? input.email : `mailto:${input.email}`,
    });
  }

  if (input.website.trim().length > 0) {
    contacts.push({
      id: 'web',
      label: 'Venue site',
      icon: 'globe',
      url: input.website,
    });
  }

  return contacts;
}

function buildSocials(input: CreateAppEventInput): EventSocialLink[] {
  const socials: EventSocialLink[] = [];

  Object.entries(input.socials).forEach(([platform, url]) => {
    if (!url || url.trim().length === 0) {
      return;
    }

    socials.push({
      id: platform,
      platform: platform as EventSocialLink['platform'],
      url,
    });
  });

  if (input.website.trim().length > 0 && !socials.some((social) => social.platform === 'web')) {
    socials.push({
      id: 'web',
      platform: 'web',
      url: input.website,
    });
  }

  return socials;
}

function resolveCategoryNumericId(categoryId: string, categories: AppCategory[]) {
  const category = categories.find((item) => item.id === categoryId);
  if (!category?.backendId) {
    throw new Error('That category is unavailable right now. Please choose another one.');
  }
  return category.backendId;
}

function resolveCategoryIcon(icon: string | null | undefined, slug: string): AppIconName {
  if (icon && VALID_CATEGORY_ICONS.has(icon as AppIconName)) {
    return icon as AppIconName;
  }

  switch (slug) {
    case 'restaurants':
      return 'coffee';
    case 'bars-lounges':
      return 'disc';
    case 'fast-food':
      return 'zap';
    case 'chill-spots':
      return 'music';
    case 'resorts':
      return 'map-pin';
    case 'bnbs':
      return 'map-pin';
    case 'resorts-and-bnbs':
      return 'map-pin';
    default:
      return 'grid';
  }
}

function readContacts(value: unknown): EventContactLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readObject(item))
    .map((item, index) => ({
      id: readString(item.id) ?? `contact-${index}`,
      label: readString(item.label) ?? 'Contact',
      icon: readContactIcon(item.icon),
      url: readString(item.url) ?? '',
    }))
    .filter((item) => item.url.length > 0);
}

function readSocials(value: unknown): EventSocialLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => readObject(item))
    .map((item, index) => ({
      id: readString(item.id) ?? `social-${index}`,
      platform: readSocialPlatform(item.platform),
      url: readString(item.url) ?? '',
    }))
    .filter((item) => item.url.length > 0);
}

function readContactIcon(value: unknown): EventContactLink['icon'] {
  switch (value) {
    case 'phone-call':
    case 'mail':
    case 'globe':
      return value;
    default:
      return 'globe';
  }
}

function readSocialPlatform(value: unknown): EventSocialLink['platform'] {
  switch (value) {
    case 'tiktok':
    case 'youtube':
    case 'facebook':
    case 'instagram':
    case 'x':
    case 'web':
      return value;
    default:
      return 'web';
  }
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function readObject(value: unknown) {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function toNumber(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function extractCity(address: string) {
  const parts = address.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.slice(-2).join(', ') || address;
}

function humanizeSlug(slug: string) {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
