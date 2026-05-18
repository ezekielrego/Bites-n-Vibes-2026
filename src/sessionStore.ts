import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const ACCESS_TOKEN_KEY = 'bites_access_token';
const REFRESH_TOKEN_KEY = 'bites_refresh_token';

export type StoredSessionTokens = {
  access: string;
  refresh: string;
};

export async function readStoredSessionTokens(): Promise<StoredSessionTokens | null> {
  if (Platform.OS === 'web') {
    const access = globalThis.localStorage?.getItem(ACCESS_TOKEN_KEY) ?? '';
    const refresh = globalThis.localStorage?.getItem(REFRESH_TOKEN_KEY) ?? '';
    return access && refresh ? { access, refresh } : null;
  }

  const access = (await SecureStore.getItemAsync(ACCESS_TOKEN_KEY)) ?? '';
  const refresh = (await SecureStore.getItemAsync(REFRESH_TOKEN_KEY)) ?? '';

  return access && refresh ? { access, refresh } : null;
}

export async function writeStoredSessionTokens(tokens: StoredSessionTokens) {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(ACCESS_TOKEN_KEY, tokens.access);
    globalThis.localStorage?.setItem(REFRESH_TOKEN_KEY, tokens.refresh);
    return;
  }

  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.access);
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refresh);
}

export async function clearStoredSessionTokens() {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(ACCESS_TOKEN_KEY);
    globalThis.localStorage?.removeItem(REFRESH_TOKEN_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}
