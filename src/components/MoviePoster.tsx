import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { colors } from '../theme';
import type { Movie } from '../types/domain';

export function MoviePoster({
  movie,
  style,
}: {
  movie: Movie;
  style?: ViewStyle;
}): React.JSX.Element {
  return (
    <View
      style={[styles.poster, { backgroundColor: movie.background }, style]}
      accessibilityLabel={`${movie.title} poster artwork`}
    >
      <View style={[styles.orb, { backgroundColor: movie.accent }]} />
      <View style={styles.copy}>
        <Text style={styles.kicker}>A FILM TOGETHER</Text>
        <Text numberOfLines={3} style={styles.title}>
          {movie.title.toUpperCase()}
        </Text>
        <Text style={styles.year}>{movie.year}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: { overflow: 'hidden', borderRadius: 24, minHeight: 320 },
  orb: {
    position: 'absolute',
    width: 290,
    height: 290,
    borderRadius: 145,
    opacity: 0.7,
    top: -85,
    right: -100,
  },
  copy: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 24,
    backgroundColor: 'rgba(0,0,0,0.14)',
  },
  kicker: {
    color: colors.white,
    opacity: 0.75,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 8,
  },
  title: {
    color: colors.white,
    fontSize: 32,
    lineHeight: 33,
    fontWeight: '900',
    letterSpacing: -1.3,
  },
  year: { color: colors.white, opacity: 0.8, fontSize: 12, marginTop: 8 },
});
