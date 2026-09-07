import { registerRootComponent } from "expo";

import { prepareSplash } from "./src/splash";
import App from "./App";

// Mantener splash nativo hasta game_ready (o timeout 8s).
void prepareSplash();

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
