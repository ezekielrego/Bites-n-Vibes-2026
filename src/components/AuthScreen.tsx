import React, { useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgXml } from 'react-native-svg';
import { theme } from '../theme';
import { useJellyPressAnimation } from './Primitives';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const APP_LOGO = require('../../logo.webp');
const GOOGLE_ICON_XML = `
<svg width="800px" height="800px" viewBox="-3 0 262 262" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid">
  <path d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622 38.755 30.023 2.685.268c24.659-22.774 38.875-56.282 38.875-96.027" fill="#4285F4"/>
  <path d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055-34.523 0-63.824-22.773-74.269-54.25l-1.531.13-40.298 31.187-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1" fill="#34A853"/>
  <path d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82 0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602l42.356-32.782" fill="#FBBC05"/>
  <path d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0 79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251" fill="#EB4335"/>
</svg>`;

export function AuthScreen({
  authError,
  authMessage,
  busyProvider,
  onEmailLogin,
  onForgotPassword,
  onGoogleLogin,
  onCancelReset,
  onPasswordLogin,
  onResetPassword,
  passwordResetToken,
}: {
  authError: string | null;
  authMessage: string | null;
  busyProvider: 'google' | 'email' | 'password' | 'reset' | null;
  onEmailLogin: (email: string) => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onCancelReset: () => void;
  onPasswordLogin: (email: string, password: string) => Promise<void>;
  onResetPassword: (password: string, confirmPassword: string) => Promise<void>;
  passwordResetToken: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const validateEmail = () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setLocalError('Enter a valid email address first.');
      return null;
    }

    setLocalError(null);
    return trimmed;
  };

  const handleEmailLogin = async () => {
    const trimmed = validateEmail();
    if (!trimmed) {
      return;
    }

    await onEmailLogin(trimmed);
  };

  const handlePasswordLogin = async () => {
    const trimmed = validateEmail();
    if (!trimmed) {
      return;
    }

    if (!password.trim()) {
      setLocalError('Enter your password to continue.');
      return;
    }

    setLocalError(null);
    await onPasswordLogin(trimmed, password);
  };

  const handleForgotPassword = async () => {
    const trimmed = validateEmail();
    if (!trimmed) {
      return;
    }

    await onForgotPassword(trimmed);
  };

  const handleResetPassword = async () => {
    if (!password.trim()) {
      setLocalError('Enter your new password first.');
      return;
    }

    if (!confirmPassword.trim()) {
      setLocalError('Confirm your new password to continue.');
      return;
    }

    setLocalError(null);
    await onResetPassword(password, confirmPassword);
  };

  return (
    <ScrollView
      bounces={false}
      contentContainerStyle={styles.root}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.logoWrap}>
        <Image source={APP_LOGO} contentFit="contain" style={styles.logo} transition={0} />
      </View>

      <View style={styles.copyWrap}>
        <Text style={styles.title}>{passwordResetToken ? 'Reset password' : 'Welcome back'}</Text>
      </View>

      <View style={styles.authCard}>
        {passwordResetToken ? (
          <>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>New password</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Choose a new password"
                placeholderTextColor={theme.colors.textSoft}
                secureTextEntry
                style={styles.input}
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Confirm password</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Repeat the password"
                placeholderTextColor={theme.colors.textSoft}
                secureTextEntry
                style={styles.input}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
              />
            </View>

            <AuthButton
              disabled={busyProvider !== null}
              icon="lock"
              label={busyProvider === 'reset' ? 'Updating...' : 'Update password'}
              onPress={() => void handleResetPassword()}
              tone="accent"
            />

            <AuthButton
              disabled={busyProvider !== null}
              icon="chevron-left"
              label="Back to sign in"
              onPress={onCancelReset}
              tone="paper"
            />
          </>
        ) : (
          <>
            <AuthButton
              disabled={busyProvider !== null}
              googleIcon
              icon="chrome"
              label={busyProvider === 'google' ? 'Opening Google...' : 'Continue with Google'}
              onPress={() => void onGoogleLogin()}
              tone="paper"
            />

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={theme.colors.textSoft}
                style={styles.input}
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={styles.fieldGroup}>
              <View style={styles.fieldLabelRow}>
                <Text style={styles.fieldLabel}>Password</Text>
                <Pressable onPress={() => void handleForgotPassword()}>
                  <Text style={styles.inlineLink}>Forgot password?</Text>
                </Pressable>
              </View>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Enter your password"
                placeholderTextColor={theme.colors.textSoft}
                secureTextEntry
                style={styles.input}
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <AuthButton
              disabled={busyProvider !== null}
              icon="lock"
              label={busyProvider === 'password' ? 'Signing in...' : 'Sign in'}
              onPress={() => void handlePasswordLogin()}
              tone="accent"
            />

            <AuthButton
              disabled={busyProvider !== null}
              icon="mail"
              label={busyProvider === 'email' ? 'Sending link...' : 'Send login link'}
              onPress={() => void handleEmailLogin()}
              tone="paper"
            />
          </>
        )}

        {localError || authError ? (
          <StatusCard icon="info" message={localError ?? authError ?? ''} tone="error" />
        ) : null}

        {authMessage ? <StatusCard icon="check-circle" message={authMessage} tone="success" /> : null}
      </View>
    </ScrollView>
  );
}

function AuthButton({
  disabled,
  googleIcon = false,
  icon,
  label,
  onPress,
  tone,
}: {
  disabled: boolean;
  googleIcon?: boolean;
  icon: FeatherName;
  label: string;
  onPress: () => void;
  tone: 'accent' | 'paper';
}) {
  const jelly = useJellyPressAnimation({
    pressedScaleX: 1.025,
    pressedScaleY: 0.94,
  });

  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      onPressIn={jelly.onPressIn}
      onPressOut={jelly.onPressOut}
      style={styles.buttonPressable}
    >
      <Animated.View
        style={[
          styles.button,
          tone === 'accent' ? styles.buttonAccent : styles.buttonPaper,
          disabled && styles.buttonDisabled,
          jelly.animatedStyle,
        ]}
      >
        {tone === 'accent' ? (
          <LinearGradient
            colors={['#E53935', theme.colors.accent, theme.colors.accent]}
            locations={[0, 0.34, 1]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            pointerEvents="none"
            style={StyleSheet.absoluteFillObject}
          />
        ) : null}
        {googleIcon ? (
          <SvgXml height={16} width={16} xml={GOOGLE_ICON_XML} />
        ) : (
          <Feather
            color={tone === 'accent' ? theme.colors.white : theme.colors.paperInk}
            name={icon}
            size={16}
          />
        )}
        <Text style={[styles.buttonText, tone === 'accent' ? styles.buttonTextAccent : styles.buttonTextPaper]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function StatusCard({
  icon,
  message,
  tone,
}: {
  icon: FeatherName;
  message: string;
  tone: 'error' | 'success';
}) {
  return (
    <View style={[styles.statusCard, tone === 'error' ? styles.statusCardError : styles.statusCardSuccess]}>
      <Feather color={tone === 'error' ? theme.colors.accentStrong : '#8BE28B'} name={icon} size={15} />
      <Text style={styles.statusText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 34,
    justifyContent: 'center',
    gap: 22,
  },
  logoWrap: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    backgroundColor: 'transparent',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  copyWrap: {
    alignItems: 'center',
    gap: 6,
  },
  title: {
    color: theme.colors.white,
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  authCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(18,23,34,0.94)',
    padding: 16,
    gap: 14,
  },
  buttonPressable: {
    alignSelf: 'stretch',
  },
  button: {
    minHeight: 50,
    borderRadius: 16,
    overflow: 'hidden',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonAccent: {
    backgroundColor: theme.colors.accent,
  },
  buttonPaper: {
    backgroundColor: theme.colors.paper,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  buttonTextAccent: {
    color: theme.colors.white,
  },
  buttonTextPaper: {
    color: theme.colors.paperInk,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  divider: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  dividerText: {
    color: theme.colors.textSoft,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  fieldGroup: {
    gap: 7,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  fieldLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inlineLink: {
    color: theme.colors.accentStrong,
    fontSize: 11,
    fontWeight: '700',
  },
  input: {
    minHeight: 48,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 14,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  statusCard: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusCardError: {
    backgroundColor: 'rgba(255,107,61,0.09)',
    borderColor: 'rgba(255,107,61,0.18)',
  },
  statusCardSuccess: {
    backgroundColor: 'rgba(94,194,94,0.1)',
    borderColor: 'rgba(94,194,94,0.18)',
  },
  statusText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 18,
  },
});
