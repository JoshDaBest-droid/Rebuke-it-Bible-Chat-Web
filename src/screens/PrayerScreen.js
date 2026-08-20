import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Modal, FlatList } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useVerseSheet } from "../components/VerseSheetContext";
import { useAuth } from "../auth/AuthContext";
import { MOOD_OPTIONS, generateRandomVerseForMood } from "../chat/prayerEngine";
import { KEYS, getJSON, setJSON } from "../storage/storage";

export default function PrayerScreen() {
  const { colors, textScale } = useTheme();
  const { openVerseSheet } = useVerseSheet();
  const { syncVersion } = useAuth();
  const s = useMemo(() => makeStyles(colors, textScale), [colors, textScale]);

  const [mood, setMood] = useState("anxious");
  const [moodPicker, setMoodPicker] = useState(false);
  const [generatedVerse, setGeneratedVerse] = useState(null);
  const [ownPrayer, setOwnPrayer] = useState("");
  const [prayers, setPrayers] = useState([]);

  const refresh = useCallback(async () => setPrayers(await getJSON(KEYS.prayers, [])), []);
  useEffect(() => { refresh(); }, [refresh, syncVersion]);

  const generateVerse = () => setGeneratedVerse(generateRandomVerseForMood(mood));

  const savePrayer = async (text, type) => {
    if (!text || !text.trim()) return;
    const id = "pr" + Date.now() + Math.random().toString(36).slice(2, 8);
    const list = [{ id, text: text.trim(), type, date: new Date().toISOString() }, ...prayers];
    setPrayers(list);
    await setJSON(KEYS.prayers, list);
  };

  const deletePrayer = async (id) => {
    const list = prayers.filter(p => p.id !== id);
    setPrayers(list);
    await setJSON(KEYS.prayers, list);
  };

  const moodLabel = MOOD_OPTIONS.find(m => m.value === mood)?.label;

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.pageSub}>Completely private. Only you can see anything here — no public feed, no other users. Synced to your account if you're signed in.</Text>

      <View style={s.card}>
        <Text style={s.badge}>PERSONALIZED VERSE GENERATOR</Text>
        <Pressable style={s.pill} onPress={() => setMoodPicker(true)}>
          <Text style={s.pillText}>{moodLabel} ▾</Text>
        </Pressable>
        <Pressable style={s.primaryBtn} onPress={generateVerse}>
          <Text style={s.primaryBtnText}>Generate Verse</Text>
        </Pressable>

        {generatedVerse && (
          <View style={s.verseCard}>
            <Pressable onPress={() => openVerseSheet(generatedVerse.ref, generatedVerse.text)}>
              <Text style={s.verseCardRef}>{generatedVerse.ref}</Text>
            </Pressable>
            <Text style={s.verseCardText}>{generatedVerse.text}</Text>
            <Pressable style={s.smallPill} onPress={generateVerse}>
              <Text style={s.smallPillText}>Generate another</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.badge}>WRITE YOUR OWN PRAYER</Text>
        <TextInput
          style={s.textarea}
          multiline
          placeholder="Write a prayer in your own words — visible only to you..."
          placeholderTextColor={colors.textMuted}
          value={ownPrayer}
          onChangeText={setOwnPrayer}
        />
        <Pressable style={s.saveBtn} onPress={async () => { await savePrayer(ownPrayer, "written"); setOwnPrayer(""); }}>
          <Text style={s.primaryBtnText}>Save Prayer</Text>
        </Pressable>
      </View>

      <View style={s.card}>
        <Text style={s.badge}>MY PRAYERS — PRIVATE</Text>
        <Text style={s.mutedText}>Stored on this device, and synced to your account if you're signed in. Never shared, never public.</Text>
        {prayers.length === 0 && (
          <Text style={[s.mutedText, { marginTop: 10 }]}>No saved prayers yet. Write one above — it stays private to you.</Text>
        )}
        {prayers.map(p => (
          <View key={p.id} style={s.prayerEntry}>
            <Text style={s.prayerMeta}>{new Date(p.date).toLocaleString()} · {p.type === "ai" ? "AI-generated" : "Your words"}</Text>
            <Text style={s.prayerText}>{p.text}</Text>
            <Pressable onPress={() => deletePrayer(p.id)}><Text style={s.deleteText}>Delete</Text></Pressable>
          </View>
        ))}
      </View>

      <Modal visible={moodPicker} animationType="slide" transparent onRequestClose={() => setMoodPicker(false)}>
        <View style={s.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMoodPicker(false)} />
          <View style={s.pickerSheet}>
            <FlatList
              data={MOOD_OPTIONS}
              keyExtractor={m => m.value}
              renderItem={({ item }) => (
                <Pressable style={s.pickerRow} onPress={() => { setMood(item.value); setMoodPicker(false); }}>
                  <Text style={s.pickerRowText}>{item.label}</Text>
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function makeStyles(c, textScale) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    pageSub: { color: c.textMuted, fontSize: 13 * textScale, marginBottom: 16 },
    card: { backgroundColor: c.bgElevated, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 16 },
    badge: { color: c.textMuted, fontSize: 11 * textScale, fontWeight: "700", letterSpacing: 0.6, marginBottom: 10 },
    pill: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: c.bgSunken, alignSelf: "flex-start", marginBottom: 12 },
    pillText: { color: c.text, fontSize: 13 * textScale },
    primaryBtn: { backgroundColor: c.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, alignSelf: "flex-start" },
    primaryBtnText: { color: c.accentContrast, fontWeight: "700", fontSize: 13 * textScale },
    saveBtn: { backgroundColor: c.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, alignSelf: "flex-end", marginTop: 8 },
    verseCard: { backgroundColor: c.bgSunken, borderRadius: 12, padding: 14, marginTop: 14 },
    verseCardRef: { color: c.accent, fontWeight: "700", fontSize: 12 * textScale, textTransform: "uppercase" },
    verseCardText: { color: c.text, fontSize: 15 * textScale, lineHeight: 22 * textScale, marginTop: 6 },
    smallPill: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, alignSelf: "flex-start", marginTop: 10 },
    smallPillText: { color: c.text, fontSize: 12 * textScale },
    textarea: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, color: c.text, backgroundColor: c.bg, minHeight: 80, textAlignVertical: "top" },
    mutedText: { color: c.textMuted, fontSize: 12 * textScale },
    prayerEntry: { borderLeftWidth: 3, borderLeftColor: c.accent, paddingLeft: 12, marginTop: 14 },
    prayerMeta: { color: c.textMuted, fontSize: 11 * textScale, marginBottom: 4 },
    prayerText: { color: c.text, fontSize: 14 * textScale, lineHeight: 20 * textScale, marginBottom: 6 },
    deleteText: { color: c.danger, fontSize: 12 * textScale },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
    pickerSheet: { backgroundColor: c.bgElevated, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, maxHeight: "60%" },
    pickerRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.border },
    pickerRowText: { color: c.text, fontSize: 15 * textScale },
  });
}
