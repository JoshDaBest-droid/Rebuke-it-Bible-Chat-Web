import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { Modal, View, Text, Pressable, ScrollView, StyleSheet, Share } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { VERSES, COMMENTARY, CROSS_REFS, lookupKJVVerse, getBibleOnlyExplanation } from "../data/bibleData";
import { KEYS, getJSON, setJSON } from "../storage/storage";
import { DISCLAIMER_TEXT } from "../chat/chatEngine";
import { useAuth } from "../auth/AuthContext";

const VerseSheetCtx = createContext(null);

export function useVerseSheet() {
  const ctx = useContext(VerseSheetCtx);
  if (!ctx) throw new Error("useVerseSheet must be used within VerseSheetProvider");
  return ctx;
}

export function VerseSheetProvider({ children }) {
  const { syncVersion } = useAuth();
  const [visible, setVisible] = useState(false);
  const [ref, setRef] = useState(null);
  const [text, setText] = useState("");
  const [tab, setTab] = useState("crossrefs");
  const [highlights, setHighlights] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [aiInsight, setAiInsight] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setHighlights(await getJSON(KEYS.highlights, []));
      setBookmarks(await getJSON(KEYS.bookmarks, []));
    })();
  }, [syncVersion]); // re-read after a sign-in pull replaces local data

  const openVerseSheet = useCallback((r, fallbackText) => {
    const v = VERSES.find(x => x.ref === r);
    const t = (v && v.text) || fallbackText || lookupKJVVerse(r) || "(verse text unavailable)";
    setRef(r);
    setText(t);
    setTab("crossrefs");
    setAiInsight(null);
    setVisible(true);
  }, []);

  const closeSheet = useCallback(() => setVisible(false), []);

  const isHighlighted = ref && highlights.some(h => h.ref === ref);
  const isBookmarked = ref && bookmarks.some(b => b.ref === ref);

  const toggleHighlight = useCallback(async () => {
    let list = highlights;
    const idx = list.findIndex(h => h.ref === ref);
    if (idx >= 0) list = list.filter(h => h.ref !== ref);
    else list = [...list, { ref, text, date: new Date().toISOString() }];
    setHighlights(list);
    await setJSON(KEYS.highlights, list);
  }, [highlights, ref, text]);

  const toggleBookmark = useCallback(async () => {
    let list = bookmarks;
    const idx = list.findIndex(b => b.ref === ref);
    if (idx >= 0) list = list.filter(b => b.ref !== ref);
    else list = [...list, { ref, text, date: new Date().toISOString() }];
    setBookmarks(list);
    await setJSON(KEYS.bookmarks, list);
  }, [bookmarks, ref, text]);

  const shareVerse = useCallback(() => {
    Share.share({ message: `"${text}" — ${ref} (KJV, via Rebuke it: Bible Chat)` }).catch(() => {});
  }, [text, ref]);

  const askAIInsight = useCallback(() => {
    setAiLoading(true);
    setTimeout(() => {
      const { context, cross } = getBibleOnlyExplanation(ref);
      setAiInsight({ context, cross });
      setAiLoading(false);
    }, 450);
  }, [ref]);

  const value = { openVerseSheet, closeSheet };

  const crossRefs = ref ? (CROSS_REFS[ref] || []) : [];
  const commentary = ref ? COMMENTARY[ref] : null;

  return (
    <VerseSheetCtx.Provider value={value}>
      {children}
      <Modal visible={visible} animationType="slide" transparent onRequestClose={closeSheet}>
        <VerseSheetContent
          ref={ref} text={text} tab={tab} setTab={setTab}
          isHighlighted={isHighlighted} isBookmarked={isBookmarked}
          toggleHighlight={toggleHighlight} toggleBookmark={toggleBookmark}
          shareVerse={shareVerse} closeSheet={closeSheet}
          crossRefs={crossRefs} commentary={commentary}
          aiInsight={aiInsight} aiLoading={aiLoading} askAIInsight={askAIInsight}
          openVerseSheet={openVerseSheet}
        />
      </Modal>
    </VerseSheetCtx.Provider>
  );
}

function VerseSheetContent({ ref, text, tab, setTab, isHighlighted, isBookmarked, toggleHighlight, toggleBookmark, shareVerse, closeSheet, crossRefs, commentary, aiInsight, aiLoading, askAIInsight, openVerseSheet }) {
  const { colors, textScale } = useTheme();
  const s = makeStyles(colors, textScale);
  if (!ref) return null;

  return (
    <View style={s.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={closeSheet} />
      <View style={s.sheet}>
        <View style={s.headerRow}>
          <Text style={s.refText}>{ref}</Text>
          <Pressable onPress={closeSheet} hitSlop={10}><Text style={s.close}>✕</Text></Pressable>
        </View>
        <ScrollView style={{ maxHeight: "70%" }}>
          <Text style={s.verseText}>{text}</Text>

          <View style={s.pillRow}>
            <Pressable style={[s.pill, isHighlighted && s.pillActive]} onPress={toggleHighlight}>
              <Text style={[s.pillText, isHighlighted && s.pillTextActive]}>Highlight</Text>
            </Pressable>
            <Pressable style={[s.pill, isBookmarked && s.pillActive]} onPress={toggleBookmark}>
              <Text style={[s.pillText, isBookmarked && s.pillTextActive]}>Bookmark</Text>
            </Pressable>
            <Pressable style={s.pill} onPress={shareVerse}>
              <Text style={s.pillText}>Share</Text>
            </Pressable>
          </View>

          <View style={s.tabRow}>
            {[["crossrefs", "Cross-References"], ["commentary", "Commentary"], ["ai", "AI Insight"]].map(([id, label]) => (
              <Pressable key={id} onPress={() => setTab(id)} style={s.tabBtn}>
                <Text style={[s.tabText, tab === id && s.tabTextActive]}>{label}</Text>
                {tab === id && <View style={s.tabUnderline} />}
              </Pressable>
            ))}
          </View>

          {tab === "crossrefs" && (
            crossRefs.length ? crossRefs.map(r => (
              <Pressable key={r} style={s.verseCard} onPress={() => openVerseSheet(r)}>
                <Text style={s.verseCardRef}>{r}</Text>
              </Pressable>
            )) : <Text style={s.mutedText}>No cross-references indexed for this verse in the demo corpus.</Text>
          )}

          {tab === "commentary" && (
            commentary ? <Text style={s.bodyText}>{commentary}</Text>
              : <Text style={s.mutedText}>No commentary indexed for this verse in the demo corpus yet.</Text>
          )}

          {tab === "ai" && (
            <View>
              {!aiInsight && !aiLoading && (
                <Pressable style={s.primaryBtn} onPress={askAIInsight}>
                  <Text style={s.primaryBtnText}>Ask AI to explain this verse</Text>
                </Pressable>
              )}
              {aiLoading && <Text style={s.mutedText}>Thinking…</Text>}
              {aiInsight && (
                <View style={s.aiCard}>
                  {aiInsight.context.length > 0 && (
                    <>
                      <Text style={s.bodyText}>Read in its immediate context:</Text>
                      {aiInsight.context.map(c => (
                        <Pressable key={c.ref} style={s.verseCard} onPress={() => openVerseSheet(c.ref, c.text)}>
                          <Text style={s.verseCardRef}>{c.ref}</Text>
                          <Text style={s.verseCardText}>{c.text}</Text>
                        </Pressable>
                      ))}
                    </>
                  )}
                  {aiInsight.cross.length > 0 && (
                    <>
                      <Text style={[s.bodyText, { marginTop: 10 }]}>Related passages elsewhere in scripture:</Text>
                      {aiInsight.cross.map(c => (
                        <Pressable key={c.ref} style={s.verseCard} onPress={() => openVerseSheet(c.ref, c.text)}>
                          <Text style={s.verseCardRef}>{c.ref}</Text>
                          <Text style={s.verseCardText}>{c.text}</Text>
                        </Pressable>
                      ))}
                    </>
                  )}
                  {aiInsight.context.length === 0 && aiInsight.cross.length === 0 && (
                    <Text style={s.mutedText}>No further Bible context is indexed for this verse yet — try reading the rest of the chapter.</Text>
                  )}
                  <Text style={s.disclaimer}>{DISCLAIMER_TEXT}</Text>
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  );
}

function makeStyles(c, textScale) {
  return StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    sheet: { backgroundColor: c.bgElevated, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, maxHeight: "85%" },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
    refText: { color: c.accent, fontWeight: "700", fontSize: 14 * textScale, textTransform: "uppercase", letterSpacing: 0.5 },
    close: { color: c.textMuted, fontSize: 18 },
    verseText: { color: c.text, fontSize: 17 * textScale, lineHeight: 26 * textScale, marginBottom: 14 },
    pillRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
    pill: { borderWidth: 1, borderColor: c.border, backgroundColor: c.bgSunken, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
    pillActive: { backgroundColor: c.accent, borderColor: "transparent" },
    pillText: { color: c.textMuted, fontSize: 13 * textScale },
    pillTextActive: { color: c.accentContrast },
    tabRow: { flexDirection: "row", gap: 18, borderBottomWidth: 1, borderBottomColor: c.border, marginBottom: 12 },
    tabBtn: { paddingBottom: 8 },
    tabText: { color: c.textMuted, fontSize: 13 * textScale },
    tabTextActive: { color: c.text, fontWeight: "600" },
    tabUnderline: { height: 2, backgroundColor: c.accent, marginTop: 6, borderRadius: 1 },
    verseCard: { backgroundColor: c.bgSunken, borderRadius: 10, padding: 12, marginBottom: 8 },
    verseCardRef: { color: c.accent, fontWeight: "700", fontSize: 12 * textScale, marginBottom: 4, textTransform: "uppercase" },
    verseCardText: { color: c.text, fontSize: 14 * textScale, lineHeight: 20 * textScale },
    mutedText: { color: c.textMuted, fontSize: 14 * textScale },
    bodyText: { color: c.text, fontSize: 14 * textScale, lineHeight: 21 * textScale },
    primaryBtn: { backgroundColor: c.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, alignSelf: "flex-start" },
    primaryBtnText: { color: c.accentContrast, fontWeight: "600", fontSize: 13 * textScale },
    aiCard: { backgroundColor: c.bgSunken, borderRadius: 12, padding: 14 },
    disclaimer: { color: c.textMuted, fontSize: 11 * textScale, marginTop: 12, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8, lineHeight: 16 * textScale },
  });
}
