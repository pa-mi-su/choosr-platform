import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { colors } from '../theme';

type Props = {
  displayName: string;
  photoUrl?: string | null;
  size?: 'medium' | 'small';
  style?: ViewStyle;
};

export function ProfileAvatar({
  displayName,
  photoUrl,
  size = 'medium',
  style,
}: Props): React.JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);
  const dimension = size === 'small' ? 44 : 56;

  useEffect(() => {
    setImageFailed(false);
  }, [photoUrl]);

  return (
    <View
      style={[
        styles.avatar,
        size === 'small' ? styles.small : styles.medium,
        { width: dimension, height: dimension },
        style,
      ]}
    >
      {photoUrl && !imageFailed ? (
        <Image
          accessibilityLabel={`${displayName}'s profile photo`}
          onError={() => setImageFailed(true)}
          resizeMode="cover"
          source={{ uri: photoUrl }}
          style={styles.image}
        />
      ) : (
        <Text style={size === 'small' ? styles.smallText : styles.mediumText}>
          {displayName.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  medium: { borderRadius: 19, backgroundColor: colors.primary },
  small: { borderRadius: 15, backgroundColor: colors.raised },
  image: { width: '100%', height: '100%' },
  mediumText: { color: colors.background, fontSize: 24, fontWeight: '900' },
  smallText: { color: colors.primary, fontSize: 18, fontWeight: '900' },
});
