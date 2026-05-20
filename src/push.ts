import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

type PushPlatform = 'android' | 'ios' | 'web' | 'unknown';

export async function registerForPushNotificationsAsync(): Promise<{
  token: string | null;
  platform: PushPlatform;
  message?: string;
}> {
  const platform: PushPlatform =
    Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : Platform.OS === 'web' ? 'web' : 'unknown';

  if (platform === 'web') {
    return {
      token: null,
      platform,
      message: 'Push notifications are not available in the web build yet.',
    };
  }

  if (isExpoGoRuntime()) {
    return {
      token: null,
      platform,
      message: 'Push notifications need a development build on this device.',
    };
  }

  if (!Device.isDevice) {
    return {
      token: null,
      platform,
      message: 'Push notifications need a physical device.',
    };
  }

  const Notifications = await import('expo-notifications');

  if (platform === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: '#FF6B3D',
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
      message: 'Allow notifications in system settings to turn push on.',
    };
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
    };
  } catch {
    return {
      token: null,
      platform,
      message: 'Push could not be registered on this build yet.',
    };
  }
}

function isExpoGoRuntime() {
  return Constants.executionEnvironment === 'storeClient' || Constants.appOwnership === 'expo';
}
