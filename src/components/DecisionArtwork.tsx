import React, { useEffect, useState } from 'react';
import {
  ImageBackground,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { colors } from '../theme';
import type { DecisionItem } from '../types/domain';

export function DecisionArtwork({
  item,
  style,
}: {
  item: DecisionItem;
  style?: ViewStyle;
}): React.JSX.Element {
  const [retry, setRetry] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => {
    setRetry(0);
    setImageFailed(false);
  }, [item.imageUrl]);

  const content = (
    <>
      <View style={[styles.orb, { backgroundColor: item.accent }]} />
      {item.mode === 'eat' && (!item.imageUrl || imageFailed) ? (
        <View style={styles.foodFallback}>
          <Text
            accessibilityLabel="Generic food illustration"
            style={styles.foodGlyph}
          >
            🍽️
          </Text>
        </View>
      ) : null}
      <View style={styles.copy}>
        <Text style={styles.kicker}>{item.kicker}</Text>
        <Text numberOfLines={3} style={styles.title}>
          {item.title.toUpperCase()}
        </Text>
        <Text style={styles.meta}>{item.meta}</Text>
      </View>
    </>
  );
  if (item.imageUrl && !imageFailed) {
    const separator = item.imageUrl.includes('?') ? '&' : '?';
    return (
      <ImageBackground
        source={{
          uri:
            retry === 0
              ? item.imageUrl
              : `${item.imageUrl}${separator}choosr_retry=${retry}`,
          cache: retry === 0 ? 'default' : 'reload',
        }}
        resizeMode="cover"
        style={[styles.artwork, { backgroundColor: item.background }, style]}
        imageStyle={styles.image}
        accessibilityLabel={`${item.title} photo`}
        onError={() => {
          if (retry === 0) setRetry(1);
          else setImageFailed(true);
        }}
      >
        {content}
      </ImageBackground>
    );
  }
  return (
    <View
      style={[styles.artwork, { backgroundColor: item.background }, style]}
      accessibilityLabel={`${item.title} artwork`}
    >
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  artwork: { overflow: 'hidden', borderRadius: 24, minHeight: 320 },
  image: { borderRadius: 24 },
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
  foodFallback: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 36,
    alignItems: 'center',
  },
  foodGlyph: { fontSize: 92, opacity: 0.92 },
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
