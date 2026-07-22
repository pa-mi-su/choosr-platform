/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';

jest.mock('../src/lib/supabase', () => ({
  registerAuthAutoRefresh: jest.fn(() => jest.fn()),
}));
jest.mock('../src/services/pushNotifications', () => ({
  registerPushListeners: jest.fn(() => jest.fn()),
}));
jest.mock('../src/services/notificationService', () => ({
  refreshNotificationState: jest.fn(() => Promise.resolve()),
  registerNotificationSynchronization: jest.fn(() => jest.fn()),
  loadUnreadNotificationCount: jest.fn(() => Promise.resolve(0)),
  subscribeToNotificationState: jest.fn(() => jest.fn()),
}));

import App from '../App';

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
