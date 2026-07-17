import React, { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Brand, Screen } from '../components/UI';
import { SwipeCard } from '../components/SwipeCard';
import { movies, simulatedPartnerLikes } from '../data/movies';
import { getSwipeOutcome } from '../services/swipeOutcome';
import { colors } from '../theme';
import type { SwipeDirection } from '../types/domain';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'Swipe'>;
export function SwipeScreen({ navigation }: Props): React.JSX.Element {
  const [index, setIndex] = useState(0);
  const movie = movies[index];
  const swipe = useCallback(
    (direction: SwipeDirection) => {
      const outcome = getSwipeOutcome({
        direction,
        movieId: movie.id,
        index,
        deckSize: movies.length,
        partnerLikes: simulatedPartnerLikes,
      });
      if (outcome === 'match') {
        navigation.replace('Match', { movie });
      } else if (outcome === 'no-match') {
        navigation.replace('NoMatch');
      } else {
        setIndex(current => current + 1);
      }
    },
    [index, movie, navigation],
  );
  return (
    <Screen testID="swipe-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <View style={styles.online}>
          <View style={styles.dot} />
          <Text style={styles.onlineText}>PARTNER ONLINE</Text>
        </View>
      </View>
      <View style={styles.progress}>
        <Text style={styles.prompt}>Would you watch this?</Text>
        <Text style={styles.count}>
          {index + 1} / {movies.length}
        </Text>
      </View>
      <View style={styles.deck}>
        <View style={styles.behind} />
        <SwipeCard key={movie.id} movie={movie} onSwipe={swipe} />
      </View>
      <View style={styles.controls}>
        <Pressable
          testID="pass-button"
          accessibilityRole="button"
          accessibilityLabel="Pass on this movie"
          onPress={() => swipe('left')}
          style={({ pressed }) => [styles.control, pressed && styles.pressed]}
        >
          <Text style={styles.pass}>×</Text>
        </Pressable>
        <View style={styles.hints}>
          <Text style={styles.hint}>SWIPE OR TAP</Text>
          <Text style={styles.private}>Your choice stays private</Text>
        </View>
        <Pressable
          testID="like-button"
          accessibilityRole="button"
          accessibilityLabel="Like this movie"
          onPress={() => swipe('right')}
          style={({ pressed }) => [
            styles.control,
            styles.like,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.heart}>♥</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
const styles = StyleSheet.create({
  screen: { paddingHorizontal: 18 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  online: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: 99,
    padding: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.success,
  },
  onlineText: { color: colors.muted, fontSize: 9, fontWeight: '900' },
  progress: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    marginBottom: 9,
  },
  prompt: { color: colors.muted, fontSize: 13 },
  count: { color: colors.faint, fontSize: 12 },
  deck: { flex: 1, marginHorizontal: 3, marginBottom: 12 },
  behind: {
    position: 'absolute',
    top: 8,
    left: 9,
    right: 9,
    bottom: -6,
    borderRadius: 28,
    backgroundColor: colors.raised,
    borderWidth: 1,
    borderColor: colors.border,
  },
  controls: {
    height: 70,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  control: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  like: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { opacity: 0.75, transform: [{ scale: 0.92 }] },
  pass: { color: colors.muted, fontSize: 38, fontWeight: '300' },
  heart: { color: colors.white, fontSize: 25 },
  hints: { alignItems: 'center' },
  hint: {
    color: colors.faint,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  private: { color: colors.faint, fontSize: 10, marginTop: 4 },
});
