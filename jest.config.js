module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|@react-native-async-storage|@react-navigation|@supabase|react-native-gesture-handler|react-native-reanimated|react-native-url-polyfill|react-native-worklets|react-native-screens|react-native-safe-area-context)/)',
  ],
};
