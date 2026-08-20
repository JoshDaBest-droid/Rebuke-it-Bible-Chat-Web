import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Appearance } from "react-native";
import { THEMES } from "./themes";
import { KEYS, getString, setString } from "../storage/storage";
import { onLocalDataPulled } from "../sync/sync";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [pack, setPack] = useState("nature");
  const [mode, setMode] = useState(Appearance.getColorScheme() === "dark" ? "dark" : "light");
  const [textScale, setTextScaleState] = useState(1);
  const [contrast, setContrastState] = useState(false);
  const [reducedMotion, setReducedMotionState] = useState(false);
  const [fontColor, setFontColorState] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const loadPrefs = async () => {
      const savedPack = await getString(KEYS.theme, "nature");
      const savedMode = await getString(KEYS.mode, mode);
      const savedScale = await getString(KEYS.textScale, "1");
      const savedContrast = await getString(KEYS.contrast, "false");
      const savedMotion = await getString(KEYS.reducedMotion, "false");
      const savedFontColor = await getString(KEYS.fontColor, "");
      setPack(savedPack);
      setMode(savedMode);
      setTextScaleState(parseFloat(savedScale));
      setContrastState(savedContrast === "true");
      setReducedMotionState(savedMotion === "true");
      setFontColorState(savedFontColor || null);
      setLoaded(true);
    };
    loadPrefs();
    // Can't use useAuth() here — ThemeProvider sits above AuthProvider in
    // App.js — so a sign-in pull replacing local prefs is picked up via this
    // plain event instead of the syncVersion pattern the other screens use.
    return onLocalDataPulled(loadPrefs);
  }, []);

  const setThemePack = (id) => { setPack(id); setString(KEYS.theme, id); };
  const setMode2 = (m) => { setMode(m); setString(KEYS.mode, m); };
  const setTextScale = (v) => { setTextScaleState(v); setString(KEYS.textScale, String(v)); };
  const setContrast = (v) => { setContrastState(v); setString(KEYS.contrast, String(v)); };
  const setReducedMotion = (v) => { setReducedMotionState(v); setString(KEYS.reducedMotion, String(v)); };
  const setFontColor = (v) => { setFontColorState(v); setString(KEYS.fontColor, v || ""); };

  const colors = useMemo(() => {
    let c = THEMES[pack][mode];
    if (contrast) {
      // High contrast: collapse muted text to full text color, like the web version.
      c = { ...c, textMuted: c.text };
    }
    if (fontColor) {
      // User-chosen font color overrides the theme's main reading/body text
      // color only — labels and muted text stay on the theme's own tone.
      c = { ...c, text: fontColor };
    }
    return c;
  }, [pack, mode, contrast, fontColor]);

  const value = {
    pack, mode, textScale, contrast, reducedMotion, fontColor, colors, loaded,
    setThemePack, setMode: setMode2, setTextScale, setContrast, setReducedMotion, setFontColor,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
