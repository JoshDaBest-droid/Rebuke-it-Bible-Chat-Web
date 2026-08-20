// Must be the very first import — Supabase's client relies on the URL API,
// which Hermes doesn't fully provide. Anything imported before this that
// touches URL would run against the un-polyfilled version.
import 'react-native-url-polyfill/auto';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
