import React, { useEffect } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Button, Screen } from '../components/UI';
import { MoviePoster } from '../components/MoviePoster';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Match'>;
export function MatchScreen({ navigation, route }: Props): React.JSX.Element {
  const { movie } = route.params;
  const scale = useSharedValue(0.82);
  const opacity = useSharedValue(0);
  useEffect(() => {
    scale.value = withSpring(1);
    opacity.value = withTiming(1, { duration: 400 });
  }, [opacity, scale]);
  const reveal = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));
  return (
    <Screen testID="match-screen" style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>YOU BOTH SAID YES</Text>
        <Text style={styles.title}>It’s a match!</Text>
        <Text style={styles.subtitle}>Movie night starts here.</Text>
      </View>
      <Animated.View style={[styles.posterWrap, reveal]}>
        <MoviePoster movie={movie} style={styles.poster} />
        <View style={styles.badge}>
          <Text style={styles.badgeText}>♥ MATCHED</Text>
        </View>
      </Animated.View>
      <View style={styles.details}>
        <Text style={styles.movie}>{movie.title}</Text>
        <Text style={styles.meta}>
          {movie.year} · {movie.runtime} · ★ {movie.rating}
        </Text>
        <Text style={styles.available}>AVAILABLE ON</Text>
        <View style={styles.providers}>
          {movie.providers.map(item => (
            <View key={item} style={styles.provider}>
              <Text style={styles.providerText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        <Button
          label="Share the match"
          onPress={() =>
            Share.share({
              message: `We matched on ${movie.title} with Choosr.`,
            })
          }
        />
        <Button
          label="Choose another movie"
          variant="secondary"
          onPress={() => navigation.replace('Swipe')}
        />
        <Button
          label="Back home"
          variant="quiet"
          onPress={() => navigation.popToTop()}
        />
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  screen: { alignItems: 'center' },
  header: { alignItems: 'center' },
  eyebrow: {
    color: colors.success,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1.7,
    marginTop: 4,
  },
  subtitle: { color: colors.muted, marginTop: 3 },
  posterWrap: { width: 214, height: 294, marginTop: 20 },
  poster: { width: '100%', height: '100%', minHeight: 0 },
  badge: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: -14,
    backgroundColor: colors.success,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 99,
  },
  badgeText: { color: '#123229', fontSize: 10, fontWeight: '900' },
  details: { alignItems: 'center', marginTop: 24 },
  movie: { color: colors.text, fontSize: 23, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 12, marginTop: 5 },
  available: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 12,
  },
  providers: { flexDirection: 'row', gap: 7, marginTop: 6 },
  provider: {
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  providerText: { color: colors.text, fontSize: 10, fontWeight: '800' },
  actions: { width: '100%', gap: 8, marginTop: 'auto' },
});
