import "react-native-gesture-handler";
import React from "react";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { AuthProvider } from "./src/auth/AuthContext";
import { VerseSheetProvider } from "./src/components/VerseSheetContext";
import RootNavigator from "./src/navigation/RootNavigator";

function AppInner() {
  const { mode, loaded } = useTheme();
  if (!loaded) return null;
  return (
    <AuthProvider>
      <VerseSheetProvider>
        <RootNavigator />
        <StatusBar style={mode === "dark" ? "light" : "dark"} />
      </VerseSheetProvider>
    </AuthProvider>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppInner />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
