import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('../src/services/locationService', () => ({
  locationQueryHint: jest.fn(() => null),
  searchLocations: jest.fn(() => Promise.resolve([])),
}));

import { LocalSetupScreen } from '../src/screens/LocalSetupScreen';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, right: 0, bottom: 34, left: 0 },
};

describe('room creator location setup', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
});
