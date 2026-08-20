/* Three theme packs (nature / minimalist / classical) x light/dark — ported
   1:1 from the web app's CSS custom properties (css/styles.css). */

export const THEMES = {
  nature: {
    light: {
      bg: "#f6f3ec", bgElevated: "#ffffff", bgSunken: "#eee8db",
      text: "#2f3a2e", textMuted: "#6b7566", accent: "#6f8a5f", accentContrast: "#ffffff",
      border: "#e0d9c7", danger: "#b5533f", success: "#5a8a5f",
    },
    dark: {
      bg: "#1b1f19", bgElevated: "#23281f", bgSunken: "#14170f",
      text: "#eae7db", textMuted: "#a3ab97", accent: "#8fb37c", accentContrast: "#10150c",
      border: "#333a2c", danger: "#e0796a", success: "#82c18a",
    },
  },
  minimalist: {
    light: {
      bg: "#ffffff", bgElevated: "#ffffff", bgSunken: "#f4f4f4",
      text: "#1a1a1a", textMuted: "#6e6e6e", accent: "#1a1a1a", accentContrast: "#ffffff",
      border: "#e5e5e5", danger: "#c0392b", success: "#2e7d32",
    },
    dark: {
      bg: "#121212", bgElevated: "#1a1a1a", bgSunken: "#000000",
      text: "#f2f2f2", textMuted: "#9a9a9a", accent: "#f2f2f2", accentContrast: "#121212",
      border: "#2a2a2a", danger: "#ff6b5b", success: "#6fcf74",
    },
  },
  classical: {
    light: {
      bg: "#f5ecd7", bgElevated: "#fffaf0", bgSunken: "#ecdfc0",
      text: "#3a2b1a", textMuted: "#7a6650", accent: "#9c6b2e", accentContrast: "#fffaf0",
      border: "#ddc99e", danger: "#a13d2a", success: "#556b2f",
    },
    dark: {
      bg: "#1c1610", bgElevated: "#251d15", bgSunken: "#120e09",
      text: "#ecdfc4", textMuted: "#b0a084", accent: "#c99a4e", accentContrast: "#1c1610",
      border: "#3a2f20", danger: "#d97a5f", success: "#8fae5c",
    },
  },
};

export const THEME_SWATCHES = [
  { id: "nature", label: "Nature", color: "#6f8a5f" },
  { id: "minimalist", label: "Minimal", color: "#1a1a1a" },
  { id: "classical", label: "Classical", color: "#9c6b2e" },
];

// Optional override for the main reading/body text color, independent of
// theme pack. "null" means "use the theme's default text color".
export const FONT_COLORS = [
  { id: null, label: "Theme Default", swatch: "#9a9a9a" },
  { id: "#1a1a1a", label: "Black", swatch: "#1a1a1a" },
  { id: "#2f3a2e", label: "Forest", swatch: "#2f3a2e" },
  { id: "#1b2a4a", label: "Navy", swatch: "#1b2a4a" },
  { id: "#4a1b1b", label: "Maroon", swatch: "#4a1b1b" },
  { id: "#3a2b1a", label: "Sepia", swatch: "#3a2b1a" },
  { id: "#f2f2f2", label: "White", swatch: "#f2f2f2" },
];
