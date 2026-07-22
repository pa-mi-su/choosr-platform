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
  takeCustomPhoto,
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
  const [photos, setPhotos] = useState<CustomPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = photos.length;

  const addPhotos = async () => {
    setError(null);
    try {
      const selected = await chooseCustomPhotos(10 - total);
      setPhotos(current => [...current, ...selected].slice(0, 10));
    } catch (cause) {
      logPhotoFailure('custom-selection', cause);
      setError(photoFailureMessage(cause, 8));
    }
  };
  const takePhoto = async () => {
    setError(null);
    try {
      const selected = await takeCustomPhoto();
      if (selected) setPhotos(current => [...current, selected].slice(0, 10));
    } catch (cause) {
      logPhotoFailure('custom-camera', cause);
      setError(photoFailureMessage(cause, 8));
    }
  };
  const continueToRoom = async () => {
    if (!prompt.trim()) return setError('Give this room a title.');
    if (total < 2) return setError('Add at least two photos.');
    if (photos.some(photo => !photo.label.trim()))
      return setError('Label every photo before creating the room.');
    setLoading(true);
    setError(null);
    try {
      const customItems = await buildCustomDecisionDeck({
        prompt,
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
        <Text style={styles.title}>Create a photo choice</Text>
        <Text style={styles.helper}>
          Give the room a title, then add and label each photo.
        </Text>
        <TextInput
          accessibilityLabel="Custom room title"
          placeholder="Pick my guitar"
          placeholderTextColor={colors.faint}
          maxLength={80}
          value={prompt}
          onChangeText={setPrompt}
          style={styles.prompt}
        />
        <View style={styles.sectionTop}>
          <Text style={styles.sectionTitle}>PHOTO CHOICES</Text>
          <Text style={styles.count}>{total} / 10</Text>
        </View>
        {photos.length ? (
          <View style={styles.photoList}>
            {photos.map((photo, index) => (
              <View key={`${photo.uri}-${index}`} style={styles.photoChoice}>
                <Image source={{ uri: photo.uri }} style={styles.photo} />
                <TextInput
                  accessibilityLabel={`Label photo ${index + 1}`}
                  placeholder="Label this photo"
                  placeholderTextColor={colors.faint}
                  maxLength={80}
                  value={photo.label}
                  onChangeText={label =>
                    setPhotos(current =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, label } : item,
                      ),
                    )
                  }
                  style={styles.choiceInput}
                />
                <Pressable
                  accessibilityLabel={`Remove photo ${index + 1}`}
                  onPress={() =>
                    setPhotos(current =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  style={styles.remove}
                >
                  <Text style={styles.removeText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        <Button
          label="Choose photos"
          variant="secondary"
          disabled={total >= 10}
          onPress={addPhotos}
        />
        <Button
          label="Take a photo"
          variant="secondary"
          disabled={total >= 10}
          onPress={takePhoto}
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
  helper: { color: colors.muted, fontSize: 13, lineHeight: 19 },
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
  photoList: { gap: 9 },
  photoChoice: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  photo: {
    width: 72,
    height: 90,
    borderRadius: 12,
    backgroundColor: colors.raised,
  },
  error: { color: colors.danger, fontSize: 12, textAlign: 'center' },
});
