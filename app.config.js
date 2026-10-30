// app.config.js (replaces app.json) so extra.* below can pull from process.env
// at config-evaluation time — a reliable, well-established mechanism (Expo
// CLI loads .env into process.env before evaluating this file) — instead of
// the app reading process.env.EXPO_PUBLIC_* itself at runtime. That runtime
// path goes through a "virtual module" Expo SDK 57 added for dev-mode env
// injection (expo/virtual/env.js) that isn't reaching the device reliably —
// confirmed by a real Expo GitHub issue in this same mechanism. Reading
// these via expo-constants (see src/supabase/client.js, src/chat/claudeClient.js)
// sidesteps that bug entirely, on every platform.
module.exports = {
  expo: {
    name: "Rebuke it: Bible Chat",
    slug: "foundation-bible-chat-app",
    scheme: "rebukeit",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.rebukeit.biblechat",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: "com.rebukeit.biblechat",
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-secure-store",
      [
        "expo-splash-screen",
        {
          image: "./assets/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#E6F4FE",
        },
      ],
      "expo-status-bar",
      "expo-font",
    ],
    extra: {
      eas: {
        projectId: "42d32872-9264-47ef-af1b-4e807e5dd342",
      },
      // Not real secrets — see the comments in client.js/claudeClient.js.
      // Values come from .env at config-evaluation time (Node), not at
      // app runtime, which is exactly what avoids the SDK 57 bug above.
      supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      appSharedSecret: process.env.EXPO_PUBLIC_APP_SHARED_SECRET,
    },
    owner: "joshdabests-droid",
  },
};
