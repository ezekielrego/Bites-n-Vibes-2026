const DEFAULT_API_BASE_URL = 'https://bitesnvibes.co.zw/api';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

function deriveBackendOrigin(apiBaseUrl: string) {
  return apiBaseUrl.replace(/\/api$/i, '');
}

export const API_ROOT = trimTrailingSlash(
  process.env.EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL,
);

export const BACKEND_ORIGIN = deriveBackendOrigin(API_ROOT);
