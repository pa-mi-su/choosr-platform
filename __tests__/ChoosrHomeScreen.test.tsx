import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: jest.fn(),
}));

import { ChoosrHomeScreen } from '../src/screens/ChoosrHomeScreen';

test('top-level gateway preserves Choose and adds isolated Chat entry points', async () => {
  const navigate = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  await ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <SafeAreaProvider
        initialMetrics={{
          frame: { x: 0, y: 0, width: 390, height: 844 },
          insets: { top: 47, right: 0, bottom: 34, left: 0 },
        }}
      >
        <ChoosrHomeScreen
          navigation={{ navigate } as never}
          route={{ key: 'home', name: 'Home' } as never}
        />
      </SafeAreaProvider>,
    );
  });

  renderer?.root
    .findByProps({ testID: 'choose-together-entry' })
    .props.onPress();
  expect(navigate).toHaveBeenCalledWith('ChooseHome');

  renderer?.root
    .findByProps({ testID: 'chat-privately-entry' })
    .props.onPress();
  expect(navigate).toHaveBeenCalledWith('ChatHome');

  await ReactTestRenderer.act(() => renderer?.unmount());
});
