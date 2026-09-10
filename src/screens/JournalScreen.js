import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../auth/AuthContext";
import { KEYS, getJSON, setJSON } from "../storage/storage";

export default function JournalScreen() {
  const { colors, textScale } = useTheme();
  const { syncVersion } = useAuth();
  const s = useMemo(() => makeStyles(colors, textScale), [colors, textScale]);

  const [entries, setEntries] = useState([]);
  const [text, setText] = useState("");
  const [refInput, setRefInput] = useState("");

  const refresh = useCallback(async () => setEntries(await getJSON(KEYS.journal, [])), []);
  // Re-reads after a sign-in pull replaces local data (see AuthContext.js) —
  // otherwise this screen wouldn't notice until it happened to remount.
  useEffect(() => { refresh(); }, [refresh, syncVersion]);

  const submit = async () => {
    if (!text.trim()) return;
    const id = "j" + Date.now() + Math.random().toString(36).slice(2, 8);
    const list = [{ id, text: text.trim(), linkedRef: refInput.trim() || null, date: new Date().toISOString() }, ...entries];
    setEntries(list);
    await setJSON(KEYS.journal, list);
    setText("");
    setRefInput("");
  };

  const remove = async (id) => {
    const list = entries.filter(e => e.id !== id);
    setEntries(list);
    await setJSON(KEYS.journal, list);
  };

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.pageSub}>Reflections, saved verses, and notes — stored on this device, and synced to your account if you're signed in.</Text>

      <View style={s.card}>
        <TextInput
          style={s.textarea}
          multiline
          placeholder="What's on your heart today?"
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
        />
        <View style={s.row}>
          <TextInput
            style={s.refInput}
            placeholder="Link a verse (optional), e.g. Psalm 23:1"
            placeholderTextColor={colors.textMuted}
            value={refInput}
            onChangeText={setRefInput}
          />
          <Pressable style={s.primaryBtn} onPress={submit}>
            <Text style={s.primaryBtnText}>Save Entry</Text>
          </Pressable>
        </View>
      </View>

      {entries.length === 0 && (
        <Text style={s.mutedText}>No journal entries yet. Reflections, saved prayers, and notes on verses will appear here — stored on this device, and synced to your account if you're signed in.</Text>
      )}
      {entries.map(e => (
        <View key={e.id} style={s.entry}>
          <Text style={s.entryMeta}>{new Date(e.date).toLocaleString()}{e.linkedRef ? ` · ${e.linkedRef}` : ""}</Text>
          <Text style={s.entryText}>{e.text}</Text>
          <Pressable onPress={() => remove(e.id)}><Text style={s.deleteText}>Delete</Text></Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

function makeStyles(c, textScale) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    pageSub: { color: c.textMuted, fontSize: 13 * textScale, marginBottom: 16 },
    card: { backgroundColor: c.bgElevated, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 16 },
    textarea: { borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, color: c.text, backgroundColor: c.bg, minHeight: 90, textAlignVertical: "top" },
    row: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" },
    refInput: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14, color: c.text, backgroundColor: c.bg },
    primaryBtn: { backgroundColor: c.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 14 },
    primaryBtnText: { color: c.accentContrast, fontWeight: "700", fontSize: 13 * textScale },
    mutedText: { color: c.textMuted, fontSize: 13 * textScale },
    entry: { borderLeftWidth: 3, borderLeftColor: c.accent, paddingLeft: 12, marginBottom: 16 },
    entryMeta: { color: c.textMuted, fontSize: 11 * textScale, marginBottom: 4 },
    entryText: { color: c.text, fontSize: 14 * textScale, lineHeight: 20 * textScale, marginBottom: 6 },
    deleteText: { color: c.danger, fontSize: 12 * textScale },
  });
}
