/**
 * The example is a yarn workspace of the library, and yarn installs react-native both here and at
 * the workspace root. The library is consumed through a symlink to that root, so its
 * `require('react-native')` resolves the ROOT copy while the jest preset mocks the copy in this
 * directory — two React Native instances, and the first native-module access then fails with
 * "__fbBatchedBridgeConfig is not set".
 *
 * A merchant installing from npm never sees this: they have exactly one react-native. Mapping every
 * react-native specifier onto this directory's copy reproduces that single-instance reality inside
 * the test run.
 */
module.exports = {
  preset: 'react-native',
  moduleNameMapper: {
    '^react-native$': '<rootDir>/node_modules/react-native',
    '^react-native/(.*)$': '<rootDir>/node_modules/react-native/$1',
  },
};
