import type { ImageSourcePropType } from 'react-native';

export type Screen = 'home' | 'details' | 'ticket' | 'nearby';
export type TabId = 'discover' | 'stream' | 'create' | 'inbox' | 'profile';
export type CategoryId = string;
export type ContactIconName = 'phone-call' | 'mail' | 'globe';
export type SocialPlatform = 'tiktok' | 'youtube' | 'facebook' | 'instagram' | 'x' | 'web';
export type NotificationType =
  | 'new_listing'
  | 'new_comment'
  | 'reply'
  | 'rating'
  | 'booking'
  | 'ticket'
  | 'event'
  | 'system';
export type AppIconName =
  | 'calendar'
  | 'chevron-left'
  | 'clock'
  | 'coffee'
  | 'disc'
  | 'external-link'
  | 'download'
  | 'grid'
  | 'heart'
  | 'info'
  | 'map-pin'
  | 'menu'
  | 'message-circle'
  | 'music'
  | 'play-circle'
  | 'plus-circle'
  | 'search'
  | 'settings'
  | 'share-2'
  | 'sliders'
  | 'star'
  | 'user'
  | 'x'
  | 'zap';

export interface EventLocation {
  label: string;
  address: string;
  note: string;
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface EventContactLink {
  id: string;
  label: string;
  icon: ContactIconName;
  url: string;
}

export interface EventSocialLink {
  id: string;
  platform: SocialPlatform;
  url: string;
}

export interface AppEventCategory {
  id: CategoryId;
  name: string;
  icon?: AppIconName;
}

export type EventMediaKind = 'image' | 'video';
export type EventMediaRole = 'hero' | 'ticket' | 'gallery';

export interface AppEventMedia {
  id: string;
  kind: EventMediaKind;
  role: EventMediaRole;
  source: string;
  preview?: string | null;
  altText?: string | null;
}

export interface AppEvent {
  id: string;
  artist: string;
  title: string;
  city: string;
  venue: string;
  dateLabel: string;
  day: string;
  month: string;
  weekday: string;
  time: string;
  price: string;
  rating: number;
  image: ImageSourcePropType | string;
  ticketImage?: ImageSourcePropType | string;
  media: AppEventMedia[];
  blurb: string;
  about: string;
  highlights: string[];
  categories: AppEventCategory[];
  location: EventLocation;
  contacts: EventContactLink[];
  socials: EventSocialLink[];
  isSaved: boolean;
  saveCount: number;
  hasTicket: boolean;
  acceptsInternalPayments: boolean;
  ownerName?: string | null;
  ownerCanEdit?: boolean;
  ownerEditExpiresAt?: string | null;
  ownerSoldCount?: number;
  ownerRevenueTotal?: string;
  createdAt?: string;
  ratingCount?: number;
  commentCount?: number;
  isTrending?: boolean;
  isFeatured?: boolean;
  isVerified?: boolean;
  vibePercentage?: number;
}

export interface AppTicket {
  id: string;
  eventId: string;
  event: AppEvent;
  buyerName?: string | null;
  buyerEmail?: string | null;
  actionType: 'ticket' | 'reservation' | 'booking' | 'order' | 'enquiry';
  quantity: number;
  unitPrice: string;
  totalAmount: string;
  currency: string;
  referenceCode: string;
  qrValue: string;
  status: 'pending' | 'confirmed' | 'used' | 'cancelled' | 'failed' | 'expired';
  paymentStatus: 'not_required' | 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
  paymentMethod?: string | null;
  paynowReference?: string | null;
  canCancel: boolean;
  canMarkUsed: boolean;
  canManage: boolean;
  bookedAt: string;
  updatedAt: string;
}

export type BookingPaymentMethod = 'ecocash' | 'onemoney' | 'innbucks' | 'omari';

export interface BookingCheckoutInput {
  paymentMethod: BookingPaymentMethod;
  phone: string;
  quantity?: number;
}

export type CommentAttachmentType = 'image' | 'video' | 'link';

export interface AppCommentUser {
  id: string;
  email?: string | null;
  name: string;
  avatar?: string | null;
}

export interface AppCommentAttachment {
  id: string;
  type: CommentAttachmentType;
  fileUrl?: string | null;
  thumbnailUrl?: string | null;
  url?: string | null;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  altText?: string | null;
  createdAt: string;
}

export interface AppComment {
  id: string;
  listingId: string;
  user: AppCommentUser;
  parentId?: string | null;
  parentAuthor?: string | null;
  message: string;
  role?: string | null;
  replies: AppComment[];
  attachments: AppCommentAttachment[];
  isEdited: boolean;
  isDeleted: boolean;
  isPinned: boolean;
  depth: number;
  replyCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppCategory {
  id: CategoryId;
  name: string;
  icon: AppIconName;
  backendId?: number;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  listingId?: string;
  listingName?: string;
  isRead: boolean;
  createdAt: string;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  avatar?: string | null;
  emailNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
}

export interface AppBootstrap {
  categories: AppCategory[];
  events: AppEvent[];
  myListings: AppEvent[];
  history: AppEvent[];
  tickets: AppTicket[];
  receivedTickets: AppTicket[];
  notifications: AppNotification[];
  unreadNotificationCount: number;
  profile: AppUser | null;
}

export interface AppUpdatePolicy {
  latestVersion: string;
  minRequiredVersion: string;
  forceUpdate: boolean;
  updateUrl: string;
  message: string;
}

export interface AppEventPage {
  events: AppEvent[];
  nextPage: number | null;
  totalCount: number;
}

export interface LocalUploadFile {
  uri: string;
  name: string;
  mimeType: string;
  webFile?: File | null;
}

export interface LocalUploadImage extends LocalUploadFile {
  previewUri?: string | null;
  fileSize?: number | null;
  durationMs?: number | null;
  posterImage?: LocalUploadFile | null;
}

export interface AppCommentPage {
  comments: AppComment[];
  nextPage: number | null;
  totalCount: number;
}

export interface CreateAppCommentInput {
  listingId: string;
  parentId?: string | null;
  message: string;
  attachments: LocalUploadImage[];
}

export interface CreateAppEventInput {
  artist: string;
  title: string;
  venue: string;
  city: string;
  dateLabel: string;
  day: string;
  month: string;
  weekday: string;
  time: string;
  price: string;
  priceRange: '$' | '$$' | '$$$' | '$$$$';
  categoryId: CategoryId;
  blurb: string;
  about: string;
  highlights: string[];
  tags: string[];
  address: string;
  locationLabel: string;
  locationNote: string;
  latitude: number | null;
  longitude: number | null;
  phone: string;
  email: string;
  website: string;
  heroImage: LocalUploadImage | null;
  ticketImage?: LocalUploadImage | null;
  galleryMedia: LocalUploadImage[];
  existingMedia?: AppEventMedia[];
  socials: Partial<Record<SocialPlatform, string>>;
  acceptsInternalPayments?: boolean;
}

export interface UpdateProfileInput {
  name: string;
  phone: string;
  emailNotificationsEnabled: boolean;
  pushNotificationsEnabled: boolean;
  avatar?: LocalUploadImage | null;
}

export interface ChangePasswordInput {
  oldPassword?: string;
  newPassword: string;
  confirmPassword: string;
}
