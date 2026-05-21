import { AppIconName, TabId } from './types';

export const TAB_ITEMS: Array<{ id: TabId; label: string; icon: AppIconName }> = [
  { id: 'discover', label: 'Discover', icon: 'grid' },
  { id: 'stream', label: 'Stream', icon: 'play-circle' },
  { id: 'create', label: 'Create', icon: 'plus-circle' },
  { id: 'inbox', label: 'Inbox', icon: 'message-circle' },
  { id: 'profile', label: 'Me', icon: 'user' },
];

export const BARCODE_PATTERN = [
  88, 96, 74, 90, 84, 98, 72, 94, 86, 82, 100, 77, 92, 83, 97, 70, 95, 88, 76, 99, 80, 93, 85, 71, 91, 97, 78, 100,
  84, 89, 73, 95, 81, 98, 75, 90, 86, 94, 72, 96,
];

export const APP_VERSION = '1.1.0';
