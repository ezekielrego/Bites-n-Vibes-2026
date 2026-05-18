const DEFAULT_BACKEND_ORIGIN = 'http://127.0.0.1:8000';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

export const BACKEND_ORIGIN = trimTrailingSlash(
  process.env.EXPO_PUBLIC_BACKEND_ORIGIN ?? DEFAULT_BACKEND_ORIGIN,
);

export const API_ROOT = `${BACKEND_ORIGIN}/api`;
