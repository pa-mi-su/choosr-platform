import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import {
  buildCustomDecisionDeck,
  chooseCustomPhotos,
  type CustomPhoto,
} from '../services/customDecisionService';
import {
  logPhotoFailure,
  photoFailureMessage,
} from '../services/photoUploadService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomSetup'>;

export function CustomSetupScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const [prompt, setPrompt] = useState('');
  const [choices, setChoices] = useState(['', '']);
  const [photos, setPhotos] = useState<CustomPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textCount = choices.filter(value => value.trim()).length;
  const total = textCount + photos.length;

  const addPhotos = async () => {
    setError(null);
    try {
      const selected = await chooseCustomPhotos(10 - total);
      setPhotos(current => [...current, ...selected].slice(0, 10 - textCount));
    } catch (cause) {
      logPhotoFailure('custom-selection', cause);
      setError(photoFailureMessage(cause, 8));
    }
  };
  const continueToRoom = async () => {
    if (!prompt.trim())
      return setError('Tell everyone what you want help choosing.');
    if (total < 2) return setError('Add at least two text choices or photos.');
    setLoading(true);
    setError(null);
    try {
      const customItems = await buildCustomDecisionDeck({
        prompt,
        choices,
        photos,
      });
      navigation.navigate('Waiting', {
        mode: 'custom',
        customPrompt: prompt.trim(),
        customItems,
        connectionId: route.params.connectionId,
        connectionName: route.params.connectionName,
      });
    } catch (cause) {
      logPhotoFailure('custom-upload', cause);
      setError(photoFailureMessage(cause, 8));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen testID="custom-setup-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Back" variant="quiet" onPress={navigation.goBack} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.eyebrow}>CUSTOM CHOICE</Text>
        <Text style={styles.title}>What do you want to choose?</Text>
        <TextInput
          accessibilityLabel="Custom decision question"
          placeholder="Help me pick what to wear tonight"
          placeholderTextColor={colors.faint}
          maxLength={80}
          value={prompt}
          onChangeText={setPrompt}
          style={styles.prompt}
        />
        <View style={styles.sectionTop}>
          <Text style={styles.sectionTitle}>TEXT CHOICES</Text>
          <Text style={styles.count}>{total} / 10</Text>
        </View>
        {choices.map((choice, index) => (
          <View key={index} style={styles.choiceRow}>
            <TextInput
              accessibilityLabel={`Choice ${index + 1}`}
              placeholder={`Choice ${index + 1}`}
              placeholderTextColor={colors.faint}
              maxLength={80}
              value={choice}
              onChangeText={value =>
                setChoices(current =>
                  current.map((item, itemIndex) =>
                    itemIndex === index ? value : item,
                  ),
                )
              }
              style={styles.choiceInput}
            />
            {choices.length > 2 ? (
              <Pressable
                onPress={() =>
                  setChoices(current =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
                style={styles.remove}
              >
                <Text style={styles.removeText}>×</Text>
              </Pressable>
            ) : null}
          </View>
        ))}
        <Button
          label="Add another text choice"
          variant="secondary"
          disabled={choices.length + photos.length >= 10}
          onPress={() => setChoices(current => [...current, ''])}
        />
        <View style={styles.divider}>
          <View style={styles.line} />
          <Text style={styles.or}>OR ADD PHOTOS</Text>
          <View style={styles.line} />
        </View>
        {photos.length ? (
          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <Pressable
                key={`${photo.uri}-${index}`}
                onPress={() =>
                  setPhotos(current =>
                    current.filter((_, itemIndex) => itemIndex !== index),
                  )
                }
              >
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                <View style={styles.photoRemove}>
                  <Text style={styles.photoRemoveText}>×</Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}
        <Button
          label="Choose photos"
          variant="secondary"
          disabled={total >= 10}
          onPress={addPhotos}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : (
        <Button label="Create private room" onPress={continueToRoom} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 20 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  content: { paddingVertical: 24, gap: 11 },
  eyebrow: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 31,
    lineHeight: 35,
    fontWeight: '900',
    letterSpacing: -1.2,
  },
  prompt: {
    minHeight: 62,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  sectionTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  sectionTitle: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  count: { color: colors.faint, fontSize: 10 },
  choiceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  choiceInput: {
    flex: 1,
    height: 52,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 15,
    paddingHorizontal: 14,
  },
  remove: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: colors.danger, fontSize: 26 },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginVertical: 5,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  or: { color: colors.faint, fontSize: 9, fontWeight: '900' },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: {
    width: 72,
    height: 90,
    borderRadius: 12,
    backgroundColor: colors.raised,
  },
  photoRemove: {
    position: 'absolute',
    top: -5,
    right: -5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoRemoveText: { color: colors.white, fontSize: 15, fontWeight: '900' },
  error: { color: colors.danger, fontSize: 12, textAlign: 'center' },
});
