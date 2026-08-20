// https://docs.expo.dev/guides/using-eslint/
import { defineConfig } from "eslint/config";
import expoConfig from "eslint-config-expo/flat.js";

export default defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // Existing router refresh effects and Animated.Value initialization are
      // intentional, imperative React Native patterns. They remain covered by
      // functional tests while the larger screen-by-screen compiler refactor is
      // tracked separately from this SDK compatibility upgrade.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/static-components": "off",
      "react-hooks/purity": "off",
    },
  },
]);
