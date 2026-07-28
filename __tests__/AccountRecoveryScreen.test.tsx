import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('../src/services/accountRecovery', () => ({
  accountRecoveryErrorMessage: jest.fn(() => 'Recovery unavailable.'),
  loadAccountIdentity: jest.fn(() => Promise.resolve({ isAnonymous: true })),
  requestAccountRecovery: jest.fn(),
  requestPhoneProtection: jest.fn(),
  verifyAccountRecovery: jest.fn(),
  verifyPhoneProtection: jest.fn(),
}));

import { AccountRecoveryScreen } from '../src/screens/AccountRecoveryScreen';

test('offers explicit protect and recover paths without exposing a phone number', async () => {
  const screen = await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, right: 0, bottom: 34, left: 0 },
      }}
    >
      <AccountRecoveryScreen
        navigation={{ goBack: jest.fn() } as never}
        route={{ key: 'account', name: 'AccountRecovery' } as never}
      />
    </SafeAreaProvider>,
  );

  await waitFor(() => {
    expect(screen.getByText('Protect this Choosr')).toBeTruthy();
  });
  expect(screen.getByText('Recover my Choosr')).toBeTruthy();
  expect(screen.getByLabelText('Phone number with country code')).toBeTruthy();
  expect(
    screen.getByText(/Your number is never shown to other people/),
  ).toBeTruthy();
});
