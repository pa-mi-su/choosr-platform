/* global jest */
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = require('ws');
}
require('react-native-gesture-handler/jestSetup');
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);
jest.mock('react-native-worklets', () =>
  require('react-native-worklets/src/mock'),
);
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock'),
);
jest.mock('@react-native-firebase/messaging', () => ({
  AuthorizationStatus: { AUTHORIZED: 1, PROVISIONAL: 2 },
  getMessaging: jest.fn(() => ({})),
  getInitialNotification: jest.fn(() => Promise.resolve(null)),
  getToken: jest.fn(() => Promise.resolve('test-firebase-token-long-enough')),
  hasPermission: jest.fn(() => Promise.resolve(1)),
  isDeviceRegisteredForRemoteMessages: jest.fn(() => true),
  onMessage: jest.fn(() => jest.fn()),
  onNotificationOpenedApp: jest.fn(() => jest.fn()),
  onTokenRefresh: jest.fn(() => jest.fn()),
  registerDeviceForRemoteMessages: jest.fn(() => Promise.resolve()),
  requestPermission: jest.fn(() => Promise.resolve(1)),
  setBackgroundMessageHandler: jest.fn(),
}));

jest.mock('react-native-image-picker', () => ({
  launchCamera: jest.fn(),
  launchImageLibrary: jest.fn(),
}));
jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Camera: Object.assign(props => React.createElement(View, props), {
      requestCameraPermission: jest.fn(() => Promise.resolve('granted')),
    }),
    useCameraDevice: jest.fn(() => ({ id: 'test-camera' })),
    useCodeScanner: jest.fn(options => options),
  };
});
jest.mock('react-native-qrcode-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return props => React.createElement(View, { ...props, testID: 'qr-code' });
});
jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: { setBadgeCount: jest.fn(() => Promise.resolve()) },
}));
