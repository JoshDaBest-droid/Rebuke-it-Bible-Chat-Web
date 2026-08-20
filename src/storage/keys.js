/* AsyncStorage key names, in their own module with zero dependencies.
   storage.js and sync/sync.js both need these, and sync.js also needs
   things storage.js exports (indirectly) — putting KEYS here instead of in
   storage.js breaks what would otherwise be a storage.js <-> sync.js
   circular import (which really did crash at runtime with "Cannot access
   'KEYS' before initialization", since sync.js's module-level lookup
   tables reference KEYS.* immediately, not inside a function body). */
export const KEYS = {
  theme: "foundation_theme",
  mode: "foundation_mode",
  textScale: "foundation_textscale",
  contrast: "foundation_contrast",
  reducedMotion: "foundation_motion",
  fontColor: "foundation_fontcolor",
  highlights: "foundation_highlights",
  bookmarks: "foundation_bookmarks",
  journal: "foundation_journal",
  prayers: "foundation_prayers",
  planProgress: "foundation_plan_progress",
  chatHistory: "foundation_chat_history",
  discussThreads: "foundation_discuss_threads",
};
