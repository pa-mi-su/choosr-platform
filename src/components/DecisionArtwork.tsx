import React from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors } from '../theme';
import type { DecisionItem } from '../types/domain';

export function DecisionArtwork({
  item,
  style,
}: {
  item: DecisionItem;
  style?: ViewStyle;
}): React.JSX.Element {
  return (
    <View
      style={[styles.artwork, { backgroundColor: item.background }, style]}
      accessibilityLabel={`${item.title} artwork`}
    >
      <View style={[styles.orb, { backgroundColor: item.accent }]} />
      <View style={styles.copy}>
        <Text style={styles.kicker}>{item.kicker}</Text>
        <Text numberOfLines={3} style={styles.title}>
          {item.title.toUpperCase()}
        </Text>
        <Text style={styles.meta}>{item.meta}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: { overflow: 'hidden', borderRadius: 24, minHeight: 320 },
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
  meta: { color: colors.white, opacity: 0.8, fontSize: 12, marginTop: 8 },
});
