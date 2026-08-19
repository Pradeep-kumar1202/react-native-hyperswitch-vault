const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const workspaceRoot = path.resolve(__dirname, '..');

/*
 * Pin react-native to ONE copy.
 *
 * yarn installs react-native 0.79.7 twice — once here (the app depends on it) and once at the
 * workspace root (the library needs it to compile and to bundle). The library is consumed through a
 * symlink to that root, so without this its `import 'react-native'` resolves the ROOT copy while the
 * app resolves this one. Two instances means two `ReactNativeViewConfigRegistry`s: the card form's
 * TextInput registers `AndroidTextInput` in one, the renderer looks it up in the other, and the app
 * dies at render with
 *
 *   View config getter callback for component `AndroidTextInput` must be a function
 *   (received `undefined`)
 *
 * This copy is the one that must win: the Android build compiled against it
 * (the React Native Gradle plugin's default reactNativeDir is example/node_modules/react-native), so
 * the JavaScript has to match the native side. `example/jest.config.js` pins the same copy through
 * moduleNameMapper for the same reason.
 *
 * `extraNodeModules` cannot do this — it is only consulted when normal resolution FAILS, and here
 * both copies resolve successfully. Redirecting the resolution origin is what actually forces it.
 *
 * A merchant installing from npm never needs any of this; they have exactly one react-native.
 */
const reactNativeDir = path.resolve(__dirname, 'node_modules/react-native');

/**
 * The example consumes the library through its published package exports, never by reaching into
 * src/. Metro therefore needs to watch the workspace root and resolve hoisted dependencies from it.
 */
const config = {
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    unstable_enablePackageExports: true,
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'react-native' || moduleName.startsWith('react-native/')) {
        return context.resolveRequest(
          {...context, originModulePath: path.join(reactNativeDir, 'index.js')},
          moduleName,
          platform,
        );
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
