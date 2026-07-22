import React from 'react';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AboutScreen } from '../src/screens/AboutScreen';

describe('AboutScreen', () => {
  it('summarizes Choosr and displays the generated version and build', async () => {
    const screen = await render(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, right: 0, bottom: 34, left: 0 },
        }}
      >
        <AboutScreen
          navigation={{ goBack: jest.fn() } as never}
          route={{ key: 'about', name: 'About' } as never}
        />
      </SafeAreaProvider>,
    );

    expect(
      screen.getByText('Decide together.\nWithout the debate.'),
    ).toBeTruthy();
    expect(screen.getByText('Version 1.0.0 (1)')).toBeTruthy();
    expect(screen.getByText('DEV BUILD')).toBeTruthy();
  });
});
