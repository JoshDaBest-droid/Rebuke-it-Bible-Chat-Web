import React, { useState, useMemo, useEffect, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Modal, FlatList, TextInput, ScrollView, PanResponder } from "react-native";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useVerseSheet } from "../components/VerseSheetContext";
import { KJV_DATA } from "../data/kjvFull";
import { KEYS, getJSON } from "../storage/storage";

// Minimum horizontal drag (px) before a swipe counts as a chapter change —
// high enough that a slightly-diagonal scroll attempt doesn't accidentally
// trigger it, low enough to feel responsive.
const SWIPE_THRESHOLD = 60;

function findBook(name) {
  return KJV_DATA.find(b => b.name === name);
}

export default function BibleScreen({ route }) {
  const { colors, textScale, reducedMotion } = useTheme();
  const { openVerseSheet } = useVerseSheet();
  const s = useMemo(() => makeStyles(colors, textScale), [colors, textScale]);

  const [book, setBook] = useState("Psalms");
  const [chapter, setChapter] = useState(23);
  const [bookPicker, setBookPicker] = useState(false);
  const [chapterPicker, setChapterPicker] = useState(false);
  const [bookQuery, setBookQuery] = useState("");
  const [chapterQuery, setChapterQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [highlights, setHighlights] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const refresh = useCallback(async () => {
    setHighlights(await getJSON(KEYS.highlights, []));
    setBookmarks(await getJSON(KEYS.bookmarks, []));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (route.params?.book && route.params?.chapter) {
      setBook(route.params.book);
      setChapter(route.params.chapter);
    }
  }, [route.params?.key]);

  const bookObj = findBook(book);
  const verses = bookObj ? bookObj.chapters[chapter - 1] || [] : [];

  const goPrev = () => {
    const bIdx = KJV_DATA.findIndex(b => b.name === book);
    if (chapter > 1) setChapter(chapter - 1);
    else if (bIdx > 0) { setBook(KJV_DATA[bIdx - 1].name); setChapter(KJV_DATA[bIdx - 1].chapters.length); }
  };
  const goNext = () => {
    const bIdx = KJV_DATA.findIndex(b => b.name === book);
    if (chapter < bookObj.chapters.length) setChapter(chapter + 1);
    else if (bIdx < KJV_DATA.length - 1) { setBook(KJV_DATA[bIdx + 1].name); setChapter(1); }
  };

  // Swipe left/right anywhere on the chapter to move forward/back — created
  // fresh each render (cheap) so it always closes over the current
  // book/chapter via goPrev/goNext, never a stale one. Only claims the
  // gesture once a drag is clearly more horizontal than vertical, so normal
  // up/down scrolling through the chapter is unaffected.
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) =>
      Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 2,
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx <= -SWIPE_THRESHOLD) goNext();
      else if (gesture.dx >= SWIPE_THRESHOLD) goPrev();
    },
  });

  // KJV read-aloud — currently the app's only translation, so this speaks
  // whatever chapter is on screen. Stops automatically if the user
  // navigates to a different chapter/book or leaves the screen, so speech
  // never keeps playing over content the user isn't looking at anymore.
  useEffect(() => {
    return () => { Speech.stop(); };
  }, [book, chapter]);

  const toggleSpeak = () => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }
    if (verses.length === 0) return;
    setIsSpeaking(true);
    verses.forEach((text, i) => {
      const isLast = i === verses.length - 1;
      Speech.speak(text, isLast ? { onDone: () => setIsSpeaking(false), onStopped: () => setIsSpeaking(false), onError: () => setIsSpeaking(false) } : undefined);
    });
  };

  const runSearch = () => {
    const q = query.trim().toLowerCase();
    if (!q) { setResults([]); return; }
    const found = [];
    outer:
    for (const b of KJV_DATA) {
      for (let ci = 0; ci < b.chapters.length; ci++) {
        for (let vi = 0; vi < b.chapters[ci].length; vi++) {
          if (b.chapters[ci][vi].toLowerCase().includes(q)) {
            found.push({ ref: `${b.name} ${ci + 1}:${vi + 1}`, text: b.chapters[ci][vi] });
            if (found.length >= 40) break outer;
          }
        }
      }
    }
    setResults(found);
  };

  const isHi = (ref) => highlights.some(h => h.ref === ref);

  const filteredBooks = useMemo(() => {
    const q = bookQuery.trim().toLowerCase();
    if (!q) return KJV_DATA;
    return KJV_DATA.filter(b => b.name.toLowerCase().includes(q) || b.abbr.toLowerCase().includes(q));
  }, [bookQuery]);

  const chapterNumbers = bookObj ? bookObj.chapters.map((_, i) => i + 1) : [];
  const filteredChapters = useMemo(() => {
    const q = chapterQuery.trim();
    if (!q) return chapterNumbers;
    return chapterNumbers.filter(n => String(n).includes(q));
  }, [chapterQuery, chapterNumbers]);

  return (
    <View style={s.screen}>
      <View style={s.toolbar}>
        <Pressable style={s.pill} onPress={() => { setBookQuery(""); setBookPicker(true); }}><Text style={s.pillText} numberOfLines={1}>{book} ▾</Text></Pressable>
        <Pressable style={s.pill} onPress={() => { setChapterQuery(""); setChapterPicker(true); }}><Text style={s.pillText}>Ch {chapter} ▾</Text></Pressable>
        <Pressable style={s.arrowBtn} onPress={goPrev} accessibilityLabel="Previous chapter">
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <Pressable style={s.arrowBtn} onPress={goNext} accessibilityLabel="Next chapter">
          <Ionicons name="chevron-forward" size={20} color={colors.text} />
        </Pressable>
        <Pressable style={s.arrowBtn} onPress={toggleSpeak} accessibilityLabel={isSpeaking ? "Stop reading aloud" : "Read chapter aloud"}>
          <Ionicons name={isSpeaking ? "stop-circle-outline" : "volume-high-outline"} size={20} color={colors.text} />
        </Pressable>
        <Pressable style={s.arrowBtn} onPress={() => setSearchVisible(true)} accessibilityLabel="Search the Bible">
          <Ionicons name="search-outline" size={20} color={colors.text} />
        </Pressable>
      </View>

      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      <FlatList
        style={s.screen}
        contentContainerStyle={{ padding: 20 }}
        data={verses}
        keyExtractor={(_, i) => String(i)}
        ListHeaderComponent={
          <View>
            <Text style={s.chapterTitle}>{book} {chapter}</Text>
          </View>
        }
        renderItem={({ item, index }) => {
          const ref = `${book} ${chapter}:${index + 1}`;
          return (
            <Pressable
              style={[s.verseRow, isHi(ref) && s.verseRowHi]}
              onPress={() => openVerseSheet(ref, item)}
            >
              <Text style={s.verseNum}>{index + 1} </Text>
              <Text style={s.verseText}>{item}</Text>
            </Pressable>
          );
        }}
        ListFooterComponent={
          <View>
            <View style={s.navRow}>
              <Pressable style={s.navBtn} onPress={goPrev}>
                <Ionicons name="chevron-back" size={13} color={colors.text} />
                <Text style={s.navBtnText}>Previous Chapter</Text>
              </Pressable>
              <Pressable style={s.navBtn} onPress={goNext}>
                <Text style={s.navBtnText}>Next Chapter</Text>
                <Ionicons name="chevron-forward" size={13} color={colors.text} />
              </Pressable>
            </View>

            <View style={s.compactCard}>
              <Text style={s.badge}>YOUR HIGHLIGHTS & BOOKMARKS</Text>
              {highlights.length === 0 && bookmarks.length === 0 && (
                <Text style={s.mutedText}>No highlights or bookmarks yet — tap any verse while reading to save one.</Text>
              )}
              {bookmarks.map(b => (
                <Pressable key={"bm" + b.ref} style={s.compactRow} onPress={() => openVerseSheet(b.ref, b.text)}>
                  <Ionicons name="bookmark" size={13} color={colors.accent} />
                  <Text style={s.compactRowRef} numberOfLines={1}>{b.ref}</Text>
                  <Text style={s.compactRowText} numberOfLines={1}>{b.text}</Text>
                </Pressable>
              ))}
              {highlights.map(h => (
                <Pressable key={"hl" + h.ref} style={s.compactRow} onPress={() => openVerseSheet(h.ref, h.text)}>
                  <Ionicons name="color-wand" size={13} color={colors.accent} />
                  <Text style={s.compactRowRef} numberOfLines={1}>{h.ref}</Text>
                  <Text style={s.compactRowText} numberOfLines={1}>{h.text}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
      />
      </View>

      <Modal visible={searchVisible} animationType="slide" transparent onRequestClose={() => setSearchVisible(false)}>
        <PickerModal title="Search the Bible" onClose={() => setSearchVisible(false)} colors={colors} textScale={textScale}>
          <View style={s.searchRow}>
            <TextInput
              style={s.input}
              placeholder="Search verses, topics, or references..."
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={runSearch}
              autoFocus
            />
            <Pressable style={s.primaryBtn} onPress={runSearch}><Text style={s.primaryBtnText}>Search</Text></Pressable>
          </View>
          <FlatList
            data={results}
            keyExtractor={r => r.ref}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={query.trim() ? <Text style={s.mutedText}>No matches for "{query}".</Text> : null}
            renderItem={({ item: r }) => (
              <Pressable style={s.verseCard} onPress={() => { openVerseSheet(r.ref, r.text); setSearchVisible(false); }}>
                <Text style={s.verseCardRef}>{r.ref}</Text>
                <Text style={s.verseCardText}>{r.text}</Text>
              </Pressable>
            )}
          />
        </PickerModal>
      </Modal>

      <Modal visible={bookPicker} animationType="slide" transparent onRequestClose={() => setBookPicker(false)}>
        <PickerModal title="Choose a Book" onClose={() => setBookPicker(false)} colors={colors} textScale={textScale}>
          <TextInput
            style={s.pickerSearchInput}
            placeholder="Search books..."
            placeholderTextColor={colors.textMuted}
            value={bookQuery}
            onChangeText={setBookQuery}
            autoFocus
          />
          <FlatList
            data={filteredBooks}
            keyExtractor={b => b.name}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={s.mutedText}>No books match "{bookQuery}".</Text>}
            renderItem={({ item }) => (
              <Pressable style={s.pickerRow} onPress={() => { setBook(item.name); setChapter(1); setBookPicker(false); }}>
                <Text style={s.pickerRowText}>{item.name}</Text>
              </Pressable>
            )}
          />
        </PickerModal>
      </Modal>

      <Modal visible={chapterPicker} animationType="slide" transparent onRequestClose={() => setChapterPicker(false)}>
        <PickerModal title={`${book} — Choose a Chapter`} onClose={() => setChapterPicker(false)} colors={colors} textScale={textScale}>
          <TextInput
            style={s.pickerSearchInput}
            placeholder="Jump to chapter number..."
            placeholderTextColor={colors.textMuted}
            value={chapterQuery}
            onChangeText={setChapterQuery}
            keyboardType="number-pad"
            autoFocus
          />
          <FlatList
            data={filteredChapters}
            keyExtractor={n => String(n)}
            numColumns={5}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={s.mutedText}>No chapter matches "{chapterQuery}".</Text>}
            renderItem={({ item }) => (
              <Pressable style={s.chapterCell} onPress={() => { setChapter(item); setChapterPicker(false); }}>
                <Text style={s.pickerRowText}>{item}</Text>
              </Pressable>
            )}
          />
        </PickerModal>
      </Modal>
    </View>
  );
}

function PickerModal({ title, onClose, colors, textScale, children }) {
  const s = makeStyles(colors, textScale);
  return (
    <View style={s.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      <View style={s.pickerSheet}>
        <View style={s.headerRow}>
          <Text style={s.chapterTitle}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10}><Ionicons name="close" size={22} color={colors.textMuted} /></Pressable>
        </View>
        {children}
      </View>
    </View>
  );
}

function makeStyles(c, textScale) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    toolbar: { flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.bgElevated },
    pill: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: c.bgSunken, maxWidth: 130 },
    pillText: { color: c.text, fontSize: 13 * textScale },
    arrowBtn: { paddingVertical: 8, paddingHorizontal: 10 },
    chapterTitle: { color: c.text, fontSize: 22 * textScale, fontWeight: "700", fontStyle: "italic", marginBottom: 12 },
    verseRow: { flexDirection: "row", paddingVertical: 4, borderRadius: 6 },
    verseRowHi: { backgroundColor: c.bgSunken },
    verseNum: { color: c.accent, fontWeight: "700", fontSize: 11 * textScale },
    verseText: { flex: 1, color: c.text, fontSize: 16 * textScale, lineHeight: 25 * textScale },
    navRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, marginBottom: 16 },
    navBtn: { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 },
    navBtnText: { color: c.text, fontSize: 12 * textScale },
    compactCard: { backgroundColor: c.bgElevated, borderRadius: 14, borderWidth: 1, borderColor: c.border, padding: 12, marginBottom: 16 },
    badge: { color: c.textMuted, fontSize: 11 * textScale, fontWeight: "700", letterSpacing: 0.6, marginBottom: 6 },
    compactRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: c.border },
    compactRowRef: { color: c.accent, fontWeight: "700", fontSize: 11 * textScale, maxWidth: "42%" },
    compactRowText: { flex: 1, color: c.textMuted, fontSize: 12 * textScale },
    searchRow: { flexDirection: "row", gap: 8 },
    input: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, color: c.text, backgroundColor: c.bg },
    primaryBtn: { backgroundColor: c.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14, justifyContent: "center" },
    primaryBtnText: { color: c.accentContrast, fontWeight: "700", fontSize: 13 * textScale },
    verseCard: { backgroundColor: c.bgSunken, borderRadius: 10, padding: 12, marginTop: 10 },
    verseCardRef: { color: c.accent, fontWeight: "700", fontSize: 11 * textScale, marginBottom: 4, textTransform: "uppercase" },
    verseCardText: { color: c.text, fontSize: 14 * textScale, lineHeight: 20 * textScale },
    mutedText: { color: c.textMuted, fontSize: 13 * textScale },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    pickerSheet: { backgroundColor: c.bgElevated, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, height: "70%" },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    pickerSearchInput: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, color: c.text, backgroundColor: c.bgSunken, marginTop: 12, marginBottom: 8, fontSize: 14 * textScale },
    pickerRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
    pickerRowText: { color: c.text, fontSize: 15 * textScale },
    chapterCell: { width: "20%", alignItems: "center", paddingVertical: 14 },
  });
}
