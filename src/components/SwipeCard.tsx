import React, { useMemo } from 'react';
import {
  Dimensions,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../theme';
import type { DecisionItem, SwipeDirection } from '../types/domain';
import { DecisionArtwork } from './DecisionArtwork';

const width = Dimensions.get('window').width;
const threshold = width * 0.24;

export function SwipeCard({
  item,
  onSwipe,
}: {
  item: DecisionItem;
  onSwipe: (direction: SwipeDirection) => void;
}): React.JSX.Element {
  const x = useSharedValue(0);
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onUpdate(event => {
          x.value = event.translationX;
        })
        .onEnd(event => {
          const projected = event.translationX + event.velocityX * 0.12;
          if (Math.abs(projected) >= threshold) {
            const direction: SwipeDirection = projected > 0 ? 'right' : 'left';
            x.value = withTiming(
              projected > 0 ? width * 1.4 : -width * 1.4,
              { duration: 220 },
              finished => {
                if (finished) {
                  runOnJS(onSwipe)(direction);
                }
              },
            );
          } else {
            x.value = withSpring(0, { damping: 16, stiffness: 190 });
          }
        }),
    [onSwipe, x],
  );
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: x.value },
      {
        rotate: `${interpolate(x.value, [-width, 0, width], [-13, 0, 13])}deg`,
      },
    ],
  }));
  const yesStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [0, threshold], [0, 1], 'clamp'),
  }));
  const passStyle = useAnimatedStyle(() => ({
    opacity: interpolate(x.value, [-threshold, 0], [1, 0], 'clamp'),
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View testID="swipe-card" style={[styles.card, cardStyle]}>
        <DecisionArtwork item={item} style={styles.poster} />
        <Animated.Text style={[styles.yes, yesStyle]}>YES</Animated.Text>
        <Animated.Text style={[styles.pass, passStyle]}>PASS</Animated.Text>
        <View style={styles.details}>
          <View style={styles.row}>
            <Text style={styles.title}>{item.title}</Text>
          </View>
          <Text style={styles.meta}>{item.tags.join(' · ')}</Text>
          <Text numberOfLines={2} style={styles.overview}>
            {item.description}
          </Text>
          {item.attribution ? (
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`Open ${item.attribution.label}`}
              hitSlop={8}
              onPress={async () => {
                await Linking.openURL(item.attribution!.url);
              }}
            >
              <Text style={styles.attribution}>{item.attribution.label}</Text>
            </Pressable>
          ) : null}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  poster: { flex: 1, minHeight: 0, borderRadius: 0 },
  details: { padding: 18 },
  row: { flexDirection: 'row', gap: 10 },
  title: { flex: 1, color: colors.text, fontSize: 22, fontWeight: '900' },
  meta: { color: colors.muted, fontSize: 11, marginTop: 6 },
  overview: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 8 },
  attribution: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '400',
    marginTop: 8,
    textDecorationLine: 'underline',
  },
  yes: {
    position: 'absolute',
    top: 25,
    left: 22,
    color: colors.success,
    borderWidth: 4,
    borderColor: colors.success,
    borderRadius: 10,
    padding: 6,
    fontSize: 26,
    fontWeight: '900',
    transform: [{ rotate: '-9deg' }],
  },
  pass: {
    position: 'absolute',
    top: 25,
    right: 22,
    color: colors.danger,
    borderWidth: 4,
    borderColor: colors.danger,
    borderRadius: 10,
    padding: 6,
    fontSize: 24,
    fontWeight: '900',
    transform: [{ rotate: '9deg' }],
  },
});
