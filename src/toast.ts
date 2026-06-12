export type AppToastTone = 'success' | 'error' | 'info';

export type AppToastMessage = {
  id: number;
  title: string;
  message?: string;
  tone: AppToastTone;
  durationMs: number;
};

type ToastInput = {
  title: string;
  message?: string;
  tone?: AppToastTone;
  durationMs?: number;
};

type ToastListener = (toast: AppToastMessage) => void;

const listeners = new Set<ToastListener>();
let nextToastId = 1;

export function showAppToast({ title, message, tone = 'info', durationMs = 3200 }: ToastInput) {
  const toast = {
    id: nextToastId,
    title,
    message,
    tone,
    durationMs,
  };
  nextToastId += 1;

  listeners.forEach((listener) => listener(toast));
}

export function subscribeToAppToasts(listener: ToastListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
