import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { Brand, Button, Screen } from '../components/UI';
import { cuisineOptions, type CuisineFilter } from '../data/cuisines';
import { modeById } from '../data/decisions';
import {
  locationQueryHint,
  searchLocations,
  type LocationSuggestion,
} from '../services/locationService';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'LocalSetup'>;

export function LocalSetupScreen({
  navigation,
  route,
}: Props): React.JSX.Element {
  const [searchArea, setSearchArea] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [selectedLocation, setSelectedLocation] =
    useState<LocationSuggestion | null>(null);
  const [searching, setSearching] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [cuisineFilter, setCuisineFilter] = useState<CuisineFilter>('all');
  const mode = modeById[route.params.mode];

  useEffect(() => {
    const query = searchArea.trim();
    if (selectedLocation?.label === query) {
      setSuggestions([]);
      setLookupMessage(null);
      setSearching(false);
      return;
    }
    const queryHint = locationQueryHint(query);
    if (queryHint) {
      setSuggestions([]);
      setLookupMessage(queryHint);
      setSearching(false);
      return;
    }
    if (!query) {
      setSuggestions([]);
      setLookupMessage(null);
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);
    setLookupMessage(null);
    const timer = setTimeout(() => {
      searchLocations(query)
        .then(locations => {
          if (!active) return;
          setSuggestions(locations);
          setLookupMessage(
            locations.length
              ? null
              : 'No matching city or ZIP was found. Check your entry.',
          );
        })
        .catch(() => {
          if (!active) return;
          setSuggestions([]);
          setLookupMessage(
            'Location validation is temporarily unavailable. Please retry.',
          );
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchArea, selectedLocation]);

  const continueToRoom = async () => {
    if (!selectedLocation || selectedLocation.label !== searchArea.trim()) {
      setError('Select a validated city or ZIP from the suggestions.');
      return;
    }
    setError(null);
    navigation.navigate('Waiting', {
      mode: mode.id,
      ...(route.params.connectionId
        ? {
            connectionId: route.params.connectionId,
            connectionName: route.params.connectionName,
          }
        : {}),
      searchArea: selectedLocation.label,
      searchLatitude: selectedLocation.latitude,
      searchLongitude: selectedLocation.longitude,
      ...(mode.id === 'eat' ? { cuisineFilter } : {}),
    });
  };

  return (
    <Screen testID="local-setup-screen" style={styles.screen}>
      <View style={styles.top}>
        <Brand compact />
        <Button label="Back" variant="quiet" onPress={navigation.goBack} />
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        style={styles.contentScroll}
      >
        <View style={styles.pin}>
          <Text style={styles.pinText}>⌖</Text>
        </View>
        <Text style={styles.eyebrow}>{mode.eyebrow}</Text>
        <Text style={styles.title}>Where should we look?</Text>
        <Text style={styles.subtitle}>
          Enter a city or ZIP/postal code, then select the validated location.
          Choosr will build five strong choices around your selected area for
          both people.
        </Text>
        {mode.id === 'eat' ? (
          <View style={styles.cuisineSection}>
            <Text style={styles.cuisineTitle}>WHAT SOUNDS GOOD?</Text>
            <Text style={styles.cuisineHint}>
              Choose one cuisine, or leave it on All.
            </Text>
            <ScrollView
              horizontal
              contentContainerStyle={styles.cuisineList}
              showsHorizontalScrollIndicator={false}
              style={styles.cuisineScroll}
            >
              {cuisineOptions.map(cuisine => {
                const selected = cuisine.id === cuisineFilter;
                return (
                  <Pressable
                    key={cuisine.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Cuisine: ${cuisine.label}`}
                    onPress={() => {
                      setCuisineFilter(cuisine.id);
                      if (error) setError(null);
                    }}
                    style={({ pressed }) => [
                      styles.cuisineChip,
                      selected && styles.cuisineChipSelected,
                      pressed && styles.suggestionPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.cuisineChipText,
                        selected && styles.cuisineChipTextSelected,
                      ]}
                    >
                      {cuisine.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
        <TextInput
          testID="search-area-input"
          accessibilityLabel="Search city, neighborhood, or postal code"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={80}
          placeholder="Orlando or 32801"
          placeholderTextColor={colors.faint}
          selectionColor={colors.primary}
          value={searchArea}
          onChangeText={value => {
            setSearchArea(value);
            setSelectedLocation(null);
            if (error) setError(null);
          }}
          onSubmitEditing={() => {
            continueToRoom().catch(() => undefined);
          }}
          style={styles.input}
        />
        {searching ? (
          <View style={styles.lookupStatus}>
            <ActivityIndicator color={colors.primary} size="small" />
            <Text style={styles.lookupText}>Validating location…</Text>
          </View>
        ) : null}
        {suggestions.length ? (
          <View style={styles.suggestions}>
            {suggestions.map(location => (
              <Pressable
                key={location.id}
                accessibilityRole="button"
                accessibilityLabel={`Use ${location.label}`}
                onPress={() => {
                  setSelectedLocation(location);
                  setSearchArea(location.label);
                  setSuggestions([]);
                  setLookupMessage(null);
                  setError(null);
                }}
                style={({ pressed }) => [
                  styles.suggestion,
                  pressed && styles.suggestionPressed,
                ]}
              >
                <Text style={styles.suggestionTitle}>{location.label}</Text>
                <Text style={styles.suggestionCountry}>
                  {location.countryCode === 'US' ? 'United States' : 'Canada'}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {selectedLocation ? (
          <Text style={styles.valid}>✓ {selectedLocation.label}</Text>
        ) : lookupMessage ? (
          <Text style={styles.lookupMessage}>{lookupMessage}</Text>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={styles.privacyBox}>
          <Text style={styles.privacyTitle}>NO LOCATION TRACKING</Text>
          <Text style={styles.privacyText}>
            We use this code for this Room only. Choosr does not create a
            permanent location profile.
          </Text>
        </View>
      </ScrollView>
      <Button
        label="Continue"
        disabled={!selectedLocation || searching}
        onPress={() => {
          continueToRoom().catch(() => undefined);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'space-between' },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  contentScroll: { flex: 1, marginVertical: 12 },
  content: { alignItems: 'center', paddingBottom: 12 },
  pin: {
    width: 82,
    height: 82,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.raised,
    marginBottom: 25,
  },
  pinText: { color: colors.accent, fontSize: 42 },
  eyebrow: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    color: colors.text,
    fontSize: 35,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginTop: 10,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 11,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    height: 64,
    color: colors.text,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    marginTop: 20,
    paddingHorizontal: 18,
    fontSize: 16,
  },
  cuisineSection: {
    width: '100%',
    marginTop: 20,
  },
  cuisineTitle: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  cuisineHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  cuisineScroll: {
    marginHorizontal: -24,
    marginTop: 10,
  },
  cuisineList: {
    gap: 8,
    paddingHorizontal: 24,
  },
  cuisineChip: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  cuisineChipSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  cuisineChipText: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  cuisineChipTextSelected: {
    color: colors.background,
  },
  lookupStatus: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 7,
  },
  lookupText: { color: colors.muted, fontSize: 12 },
  lookupMessage: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: 7,
  },
  suggestions: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    marginTop: 7,
  },
  suggestion: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  suggestionPressed: { backgroundColor: colors.raised },
  suggestionTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  suggestionCountry: { color: colors.faint, fontSize: 10, marginTop: 2 },
  valid: {
    color: colors.success,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 7,
  },
  privacyBox: {
    width: '100%',
    backgroundColor: colors.raised,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  privacyTitle: {
    color: colors.success,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  privacyText: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  error: { color: colors.danger, fontSize: 12, marginTop: 9 },
});
