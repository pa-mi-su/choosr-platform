import React, { type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../theme';

export function Screen({
  children,
  style,
  testID,
}: PropsWithChildren<{
  style?: ViewStyle;
  testID?: string;
}>): React.JSX.Element {
  const insets = useSafeAreaInsets();
  return (
    <View
      testID={testID}
      style={[
        styles.screen,
        {
          paddingTop: Math.max(insets.top, 16),
          paddingBottom: Math.max(insets.bottom, 16),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Brand({
  compact = false,
}: {
  compact?: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.brand}>
      <View style={[styles.logo, compact && styles.logoSmall]}>
        <View
          style={[styles.logoCard, { transform: [{ rotate: '-13deg' }] }]}
        />
        <View style={[styles.logoCard, { transform: [{ rotate: '13deg' }] }]} />
        <View style={styles.logoHeart} />
      </View>
      <Text style={[styles.wordmark, compact && styles.wordmarkSmall]}>
        choosr
      </Text>
    </View>
  );
}

type ButtonProps = PressableProps & {
  label: string;
  variant?: 'primary' | 'secondary' | 'quiet';
  loading?: boolean;
};
export function Button({
  label,
  variant = 'primary',
  loading,
  disabled,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        styles[variant],
        pressed && styles.pressed,
        (disabled || loading) && styles.disabled,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={colors.white} />
      ) : (
        <Text
          style={[styles.buttonText, variant === 'quiet' && styles.quietText]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 24,
    backgroundColor: colors.background,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoSmall: { width: 32, height: 32, transform: [{ scale: 0.72 }] },
  logoCard: {
    position: 'absolute',
    width: 22,
    height: 30,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: colors.text,
  },
  logoHeart: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
  wordmark: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.4,
  },
  wordmarkSmall: { fontSize: 23 },
  button: {
    minHeight: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quiet: { minHeight: 44, backgroundColor: 'transparent' },
  pressed: { opacity: 0.8, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
  buttonText: { color: colors.white, fontSize: 17, fontWeight: '800' },
  quietText: { color: colors.muted, fontSize: 15 },
});
