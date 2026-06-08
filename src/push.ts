import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

type PushPlatform = 'android' | 'ios' | 'web' | 'unknown';
type PushProvider = 'firebase' | 'expo';

export async function registerForPushNotificationsAsync(): Promise<{
  token: string | null;
  platform: PushPlatform;
  provider: PushProvider;
  message?: string;
}> {
  const platform: PushPlatform =
    Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : Platform.OS === 'web' ? 'web' : 'unknown';

  if (platform === 'web') {
    return {
      token: null,
      platform,
      provider: 'firebase',
      message: 'Push notifications are not available in the web build yet.',
    };
  }

  if (isExpoGoRuntime()) {
    return {
      token: null,
      platform,
      provider: 'firebase',
      message: 'Push notifications need a development build on this device.',
    };
  }

  if (!Device.isDevice) {
    return {
      token: null,
      platform,
      provider: 'firebase',
      message: 'Push notifications need a physical device.',
    };
  }

  const Notifications = await import('expo-notifications');

  if (platform === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#F2221C',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;

  if (finalStatus !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  if (finalStatus !== 'granted') {
    return {
      token: null,
      platform,
      provider: 'firebase',
      message: 'Allow notifications in system settings to turn push on.',
    };
  }

  try {
    const nativeToken = await Notifications.getDevicePushTokenAsync();
    const token = typeof nativeToken.data === 'string' ? nativeToken.data : String(nativeToken.data ?? '');
    if (token) {
      return {
        token,
        platform,
        provider: 'firebase',
      };
    }
  } catch {
    // Fall back to Expo's token below so development builds keep working before Firebase is wired.
  }

  const projectId =
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    (Constants.expoConfig?.extra as { projectId?: string } | undefined)?.projectId;

  try {
    const response = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return {
      token: response.data,
      platform,
      provider: 'expo',
    };
  } catch {
    return {
      token: null,
      platform,
      provider: 'firebase',
      message: 'Push could not be registered on this build yet.',
    };
  }
}

export async function configureNotificationHandlingAsync() {
  if (isExpoGoRuntime()) {
    return;
  }

  try {
    const Notifications = await import('expo-notifications');
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  } catch {
    // Keep notification setup non-fatal on unsupported local runtimes.
  }
}

function isExpoGoRuntime() {
  return Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
}
