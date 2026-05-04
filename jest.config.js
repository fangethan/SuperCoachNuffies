/**
 * Jest config for unit tests on pure-logic code.
 *
 * Uses ts-jest with a node environment — we deliberately avoid jest-expo so
 * the suite stays fast in CI. Tests live next to the code they cover (e.g.
 * `src/utils/scoring.test.ts`). React-rendering and integration tests are
 * out of scope for this preset and will need a separate config if added.
 *
 * Heavy native modules (expo-sqlite, react-native-ml-kit, expo-image-picker)
 * are mocked at the module level via __mocks__/ so importing through
 * `src/store/cache.ts` etc. doesn't reach the native bindings.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/**/*.test.ts',
    '<rootDir>/src/**/*.test.tsx',
    '<rootDir>/app/**/*.test.ts',
    '<rootDir>/app/**/*.test.tsx',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // Pure-logic tests don't need the RN bridge. If a test imports a module
  // that transitively pulls a native package, mock it under __mocks__/.
  modulePathIgnorePatterns: ['<rootDir>/ios', '<rootDir>/android'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.test.{ts,tsx}',
    '!src/types/**',
  ],
};
