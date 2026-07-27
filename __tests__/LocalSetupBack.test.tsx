import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockSearchLocations = jest.fn();

jest.mock('../src/services/locationService', () => ({
  locationQueryHint: jest.fn(() => null),
  searchLocations: (...args: unknown[]) => mockSearchLocations(...args),
}));

import { LocalSetupScreen } from '../src/screens/LocalSetupScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('room creator location setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchLocations.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('keeps Back navigation non-destructive before the room is created', async () => {
    const goBack = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <LocalSetupScreen
            navigation={{ goBack, replace: jest.fn() } as never}
            route={{
              key: 'location',
              name: 'LocalSetup',
              params: { mode: 'eat' },
            }}
          />
        </SafeAreaProvider>,
      );
    });

    renderer.root.findByProps({ accessibilityLabel: 'Back' }).props.onPress();

    expect(goBack).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  test('passes the selected cuisine with the validated food location', async () => {
    jest.useFakeTimers();
    mockSearchLocations.mockResolvedValue([
      {
        id: 'orlando',
        label: 'Orlando, Florida',
        latitude: 28.5383,
        longitude: -81.3792,
        countryCode: 'US',
      },
    ]);
    const navigate = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={metrics}>
          <LocalSetupScreen
            navigation={{ goBack: jest.fn(), navigate } as never}
            route={{
              key: 'food-location',
              name: 'LocalSetup',
              params: { mode: 'eat' },
            }}
          />
        </SafeAreaProvider>,
      );
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Cuisine: Mexican' })
        .props.onPress();
      renderer.root
        .findByProps({ testID: 'search-area-input' })
        .props.onChangeText('32801');
    });

    await ReactTestRenderer.act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Use Orlando, Florida' })
        .props.onPress();
    });

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({ accessibilityLabel: 'Continue' })
        .props.onPress();
    });

    expect(navigate).toHaveBeenCalledWith('Waiting', {
      mode: 'eat',
      searchArea: 'Orlando, Florida',
      searchLatitude: 28.5383,
      searchLongitude: -81.3792,
      cuisineFilter: 'mexican',
    });

    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
