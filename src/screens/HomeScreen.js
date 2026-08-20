import React, { useMemo } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useVerseSheet } from "../components/VerseSheetContext";
import { getTodaysDevotional, getTodaysHomeQuote } from "../data/devotionals";
import { parseRef } from "../data/bibleData";

export default function HomeScreen({ navigation }) {
  const { colors, textScale } = useTheme();
  const { openVerseSheet } = useVerseSheet();
  const s = useMemo(() => makeStyles(colors, textScale), [colors, textScale]);

  const quote = getTodaysHomeQuote();
  const devo = getTodaysDevotional();
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const readInContext = () => {
    const p = parseRef(devo.verseRef);
    if (p) navigation.navigate("Bible", { book: p.book, chapter: p.chapter, key: Date.now() });
    else navigation.navigate("Bible");
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 20 }}>
      <Text style={s.quoteText}>{quote.text}</Text>
      <Text style={s.quoteRef}>{quote.ref}</Text>
      <Text style={s.dateText}>{dateStr}</Text>

      <View style={s.heroCard}>
        <Text style={s.badge}>TODAY'S VERSE</Text>
        <Text style={s.verseText}>"{devo.verseText}"</Text>
        <Text style={s.verseRef}>{devo.verseRef}</Text>
        <View style={s.pillRow}>
          <Pressable style={s.primaryBtn} onPress={readInContext}>
            <Text style={s.primaryBtnText}>Read in context</Text>
          </Pressable>
          <Pressable style={s.pill} onPress={() => openVerseSheet(devo.verseRef, devo.verseText)}>
            <Text style={s.pillText}>Share</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.card}>
        <Text style={s.badge}>TODAY'S DEVOTIONAL</Text>
        <Text style={s.devoTitle}>{devo.title}</Text>
        <Text style={s.devoBody}>{devo.body}</Text>
      </View>
    </ScrollView>
  );
}

function makeStyles(c, textScale) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    quoteText: { color: c.text, fontSize: 26 * textScale, fontWeight: "700", marginBottom: 2 },
    quoteRef: { color: c.textMuted, fontSize: 12 * textScale, marginBottom: 6 },
    dateText: { color: c.textMuted, fontSize: 14 * textScale, marginBottom: 20 },
    heroCard: { backgroundColor: c.bgElevated, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 20, marginBottom: 16 },
    card: { backgroundColor: c.bgElevated, borderRadius: 22, borderWidth: 1, borderColor: c.border, padding: 20, marginBottom: 16 },
    badge: { color: c.textMuted, fontSize: 11 * textScale, fontWeight: "700", letterSpacing: 0.6 },
    verseText: { color: c.text, fontSize: 18 * textScale, lineHeight: 27 * textScale, marginTop: 10, fontStyle: "italic" },
    verseRef: { color: c.accent, fontSize: 12 * textScale, fontWeight: "700", marginTop: 8, textTransform: "uppercase" },
    devoTitle: { color: c.text, fontSize: 17 * textScale, fontWeight: "700", marginTop: 8, marginBottom: 6 },
    devoBody: { color: c.textMuted, fontSize: 14 * textScale, lineHeight: 21 * textScale },
    pillRow: { flexDirection: "row", gap: 10, marginTop: 16 },
    primaryBtn: { backgroundColor: c.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
    primaryBtnText: { color: c.accentContrast, fontWeight: "700", fontSize: 13 * textScale },
    pill: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
    pillText: { color: c.text, fontSize: 13 * textScale },
  });
}
