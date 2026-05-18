import { Platform } from 'react-native';

export const theme = {
  colors: {
    background: '#0A0D13',
    backgroundElevated: '#121722',
    surface: 'rgba(255,255,255,0.07)',
    surfaceStrong: '#171D2A',
    surfaceMuted: 'rgba(255,255,255,0.05)',
    border: 'rgba(255,255,255,0.08)',
    text: '#F7F8FB',
    textMuted: '#A7B0C2',
    textSoft: '#788196',
    accent: '#FF6B3D',
    accentStrong: '#FF885D',
    accentSoft: 'rgba(255,107,61,0.18)',
    paper: '#F5F0E8',
    paperInk: '#1B1714',
    white: '#FFFFFF',
  },
  radius: {
    md: 18,
    lg: 24,
    xl: 32,
    pill: 999,
  },
};

export const shadow = Platform.select({
  ios: {
    shadowColor: '#000000',
    shadowOpacity: 0.26,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
  },
  android: {
    elevation: 18,
  },
  default: {},
});
