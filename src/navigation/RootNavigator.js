import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme, DarkTheme, DrawerActions, getFocusedRouteNameFromRoute } from "@react-navigation/native";
import { createDrawerNavigator, DrawerContentScrollView } from "@react-navigation/drawer";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useTheme } from "../theme/ThemeContext";

import HomeScreen from "../screens/HomeScreen";
import BibleScreen from "../screens/BibleScreen";
import ChatScreen from "../screens/ChatScreen";
import DiscussScreen from "../screens/DiscussScreen";
import PrayerScreen from "../screens/PrayerScreen";
import JournalScreen from "../screens/JournalScreen";
import PlansScreen from "../screens/PlansScreen";
import SettingsScreen from "../screens/SettingsScreen";

const Drawer = createDrawerNavigator();
const Tab = createBottomTabNavigator();

// All 7 screens live in this one list — Home/Bible/Chat show as bottom tab
// buttons AND appear here in the drawer; Prayer/Journal/Plans/Settings are
// drawer-only, but since they're still Tab.Screens under the hood, the
// bottom tab bar (with Home/Bible/Chat) stays on screen no matter which one
// is open. `route` is the internal Tab.Screen name (used for navigation);
// `label` is what's actually shown — kept separate so renaming a screen in
// the UI (e.g. Chat -> Guide) never touches the route/navigation wiring.
const MENU_ITEMS = [
  { route: "Home", label: "Home" },
  { route: "Bible", label: "Bible" },
  { route: "Chat", label: "Guide" },
  { route: "Discuss", label: "Discuss" },
  { route: "Prayer", label: "Prayer" },
  { route: "Journal", label: "Journal" },
  { route: "Plans", label: "Plans" },
  { route: "Settings", label: "Settings" },
];

function MenuButton({ navigation, colors }) {
  return (
    <Pressable
      onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
      hitSlop={12}
      style={{ paddingHorizontal: 14 }}
      accessibilityLabel="Open menu"
    >
      <Ionicons name="menu" size={24} color={colors.accent} />
    </Pressable>
  );
}

function MainTabs() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ navigation }) => ({
        headerStyle: { backgroundColor: colors.bgElevated },
        headerTitleStyle: { color: colors.text },
        headerShadowVisible: false,
        headerLeft: () => <MenuButton navigation={navigation} colors={colors} />,
        tabBarStyle: { backgroundColor: colors.bgElevated, borderTopColor: colors.border, height: 68, paddingTop: 8, paddingBottom: 10 },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 15, fontWeight: "600" },
        tabBarIcon: () => null,
        tabBarIconStyle: { width: 0, height: 0, margin: 0 },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Rebuke it: Bible Chat", tabBarLabel: "Home" }} />
      <Tab.Screen name="Bible" component={BibleScreen} />
      <Tab.Screen name="Chat" component={ChatScreen} options={{ title: "Guide", tabBarLabel: "Guide" }} />
      <Tab.Screen name="Discuss" component={DiscussScreen} />
      <Tab.Screen name="Prayer" component={PrayerScreen} options={{ tabBarItemStyle: { display: "none" } }} />
      <Tab.Screen name="Journal" component={JournalScreen} options={{ tabBarItemStyle: { display: "none" } }} />
      <Tab.Screen name="Plans" component={PlansScreen} options={{ tabBarItemStyle: { display: "none" } }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarItemStyle: { display: "none" } }} />
    </Tab.Navigator>
  );
}

function CustomDrawerContent(props) {
  const { colors, textScale } = useTheme();
  const insets = useSafeAreaInsets();
  const s = makeDrawerStyles(colors, textScale);

  const tabsRoute = props.state.routes.find(r => r.name === "Tabs");
  const activeName = (tabsRoute && getFocusedRouteNameFromRoute(tabsRoute)) ?? "Home";

  const go = (name) => {
    props.navigation.navigate("Tabs", { screen: name });
    props.navigation.closeDrawer();
  };

  return (
    <View style={{ flex: 1 }}>
      <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 8 }}>
        <View style={s.brandRow}>
          <View style={s.brandMark}><Text style={s.brandMarkText}>✝</Text></View>
          <Text style={s.brandName}>Rebuke it: Bible Chat</Text>
        </View>
        {MENU_ITEMS.map(({ route, label }) => {
          const active = route === activeName;
          return (
            <Pressable key={route} onPress={() => go(route)} style={[s.item, active && s.itemActive]}>
              <Text style={[s.itemText, active && s.itemTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </DrawerContentScrollView>
      <View style={[s.footer, { paddingBottom: Math.max(14, insets.bottom + 4) }]}>
        <Text style={s.footerText}>Free forever · No ads{"\n"}Your data, your device — synced only if you sign in</Text>
        <Text style={s.verseFooter}>Joshua 1:9</Text>
      </View>
    </View>
  );
}

function DrawerNav() {
  const { colors } = useTheme();
  return (
    <Drawer.Navigator
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={({ route }) => ({
        headerShown: false,
        title: getFocusedRouteNameFromRoute(route) ?? "Home",
      })}
    >
      <Drawer.Screen name="Tabs" component={MainTabs} />
    </Drawer.Navigator>
  );
}

export default function RootNavigator() {
  const { colors, mode } = useTheme();
  const navTheme = {
    ...(mode === "dark" ? DarkTheme : DefaultTheme),
    colors: {
      ...(mode === "dark" ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.bg,
      card: colors.bgElevated,
      text: colors.text,
      border: colors.border,
      primary: colors.accent,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      <DrawerNav />
    </NavigationContainer>
  );
}

function makeDrawerStyles(c, textScale) {
  return StyleSheet.create({
    brandRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 16, marginBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
    brandMark: { width: 32, height: 32, borderRadius: 8, backgroundColor: c.accent, alignItems: "center", justifyContent: "center" },
    brandMarkText: { color: c.accentContrast, fontWeight: "bold", fontSize: 16 },
    brandName: { color: c.text, fontWeight: "700", fontSize: 16 * textScale, flexShrink: 1 },
    item: { paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10, marginHorizontal: 8 },
    itemActive: { backgroundColor: c.bgSunken },
    itemText: { color: c.text, fontSize: 17 * textScale },
    itemTextActive: { color: c.accent, fontWeight: "700" },
    footer: { borderTopWidth: 1, borderTopColor: c.border, paddingHorizontal: 16, paddingTop: 14, marginBottom: 6 },
    footerText: { color: c.textMuted, fontSize: 13 * textScale, lineHeight: 18 * textScale },
    verseFooter: { color: c.textMuted, fontSize: 13 * textScale, marginTop: 8, opacity: 0.75 },
  });
}
