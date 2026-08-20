import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { View, Text, TextInput, Pressable, FlatList, Modal, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { useVerseSheet } from "../components/VerseSheetContext";
import { useAuth } from "../auth/AuthContext";
import { VOICES, generateAIResponse, exploreTheme, resolveCitationText } from "../chat/chatEngine";
import { KEYS, getJSON, setJSON } from "../storage/storage";

// Capped so history can't grow without bound on-device (and, for signed-in
// users, in the synced chat_history table).
const HISTORY_LIMIT = 200;

function formatHistoryDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

// A fixed pool (not freeform) so repeated taps — by this user or any other —
// are exact-text matches against the worker's response cache, turning into
// free cache hits instead of new Claude calls. Rotates daily (same pattern
// as getWeeklyPlanOrder in devotionals.js) so regulars see variety over
// time, while everyone sees the same 4 on a given day, which maximizes how
// often those 4 are already warm in the cache.
const QUICK_PROMPTS = [
  "I feel anxious about the future",
  "I feel like God has forgotten me",
  "I am doubting my faith lately",
  "Explain John 3:16",
  "I feel guilty about my past",
  "I'm struggling to forgive someone who hurt me",
  "I feel alone right now",
  "I don't know my purpose in life",
  "I'm grateful today, where should I read?",
  "I'm grieving the loss of someone I love",
];
const QUICK_PROMPTS_SHOWN = 4;

function getRotatingQuickPrompts() {
  const dayIndex = Math.floor(Date.now() / 86400000);
  const offset = dayIndex % QUICK_PROMPTS.length;
  const rotated = [...QUICK_PROMPTS.slice(offset), ...QUICK_PROMPTS.slice(0, offset)];
  return rotated.slice(0, QUICK_PROMPTS_SHOWN);
}

export default function ChatScreen() {
  const { colors, textScale } = useTheme();
  const { openVerseSheet } = useVerseSheet();
  const { syncVersion } = useAuth();
  const navigation = useNavigation();
  const s = useMemo(() => makeStyles(colors, textScale), [colors, textScale]);
  const listRef = useRef(null);
  const quickPrompts = useMemo(() => getRotatingQuickPrompts(), []);

  // No more pastoral/scholarly/devotional/wwjd picker — the AI always
  // blends all of those perspectives into one, so there's nothing to pick.
  const voice = "combined";
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [hasSent, setHasSent] = useState(false);
  const [messages, setMessages] = useState([
    { id: "seed", role: "ai", content: {
      text: "Peace to you. Tell me what's on your mind or ask about a passage — I'll point you to the parts of Scripture that speak to it, so you can read them for yourself.",
      citations: [], voice: "pastoral", isCrisis: false,
    } },
  ]);

  const [historyVisible, setHistoryVisible] = useState(false);
  const [history, setHistory] = useState([]);
  const refreshHistory = useCallback(async () => setHistory(await getJSON(KEYS.chatHistory, [])), []);
  useEffect(() => { refreshHistory(); }, [refreshHistory, syncVersion]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => setHistoryVisible(true)} hitSlop={12} style={{ paddingHorizontal: 14 }} accessibilityLabel="View past questions">
          <Text style={{ color: colors.accent, fontSize: 13, fontWeight: "700" }}>History</Text>
        </Pressable>
      ),
    });
  }, [navigation, colors]);

  const scrollDown = () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

  const saveToHistory = async (question, response) => {
    const current = await getJSON(KEYS.chatHistory, []);
    const entry = { id: "h" + Date.now() + Math.random().toString(36).slice(2, 8), question, response, date: new Date().toISOString() };
    const updated = [entry, ...current].slice(0, HISTORY_LIMIT);
    await setJSON(KEYS.chatHistory, updated);
    setHistory(updated);
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message) return;
    setHasSent(true);
    setMessages(prev => [...prev, { id: "u" + Date.now(), role: "user", content: message }]);
    setInput("");
    setTyping(true);
    scrollDown();

    const response = await generateAIResponse(message, voice);
    setMessages(prev => [...prev, { id: "a" + Date.now(), role: "ai", content: response }]);
    setTyping(false);
    scrollDown();
    saveToHistory(message, response);
  };

  // Tapping a related-topic chip is a pure local lookup (shared/themes.json)
  // — no AI call, no network, instant. This is the main way the app
  // encourages further Bible study without spending anything.
  const exploreRelated = (label) => {
    const result = exploreTheme(label);
    if (!result) return;
    setHasSent(true);
    setMessages(prev => [
      ...prev,
      { id: "u" + Date.now(), role: "user", content: `Explore: ${label}` },
      { id: "a" + Date.now() + 1, role: "ai", content: result },
    ]);
    scrollDown();
  };

  const openHistoryEntry = (entry) => {
    setHistoryVisible(false);
    setHasSent(true);
    setMessages(prev => [
      ...prev,
      { id: "u" + Date.now(), role: "user", content: entry.question },
      { id: "a" + Date.now() + 1, role: "ai", content: entry.response },
    ]);
    scrollDown();
  };

  const clearHistory = async () => {
    await setJSON(KEYS.chatHistory, []);
    setHistory([]);
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <FlatList
        ref={listRef}
        style={s.messages}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item }) => (
          <ChatBubble item={item} colors={colors} s={s} openVerseSheet={openVerseSheet} onExplore={exploreRelated} />
        )}
        ListFooterComponent={typing ? <Text style={s.typing}>· · ·</Text> : null}
      />

      {!hasSent && (
        <>
          <Text style={s.hint}>Tip: describe a real situation ("I feel like God has forgotten me") and I'll point you to the passages that speak to it — or ask for a short scripture journey, e.g. "make me a journey for feeling anxious."</Text>
          <View style={s.quickRow}>
            {quickPrompts.map(q => (
              <Pressable key={q} style={s.quickPill} onPress={() => send(q)}>
                <Text style={s.quickPillText}>{q}</Text>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          placeholder="What's on your mind, or which passage?"
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send()}
        />
        <Pressable style={s.sendBtn} onPress={() => send()}>
          <Text style={s.sendBtnText}>Search</Text>
        </Pressable>
      </View>

      {!hasSent && (
        <Text style={s.footerDisclaimer}>For anything serious, please also talk to your pastor, counselor, or church community.</Text>
      )}

      <Modal visible={historyVisible} animationType="slide" transparent onRequestClose={() => setHistoryVisible(false)}>
        <View style={s.historyOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHistoryVisible(false)} />
          <View style={s.historySheet}>
            <View style={s.historyHeaderRow}>
              <Text style={s.historyTitle}>Past Questions</Text>
              <Pressable onPress={() => setHistoryVisible(false)}><Text style={s.historyClose}>Done</Text></Pressable>
            </View>

            {history.length === 0 ? (
              <Text style={s.historyEmpty}>Nothing here yet — questions you ask will show up here so you can find them again.</Text>
            ) : (
              <FlatList
                data={history}
                keyExtractor={h => h.id}
                style={s.historyList}
                renderItem={({ item }) => (
                  <Pressable style={s.historyRow} onPress={() => openHistoryEntry(item)}>
                    <Text style={s.historyQuestion} numberOfLines={2}>{item.question}</Text>
                    <Text style={s.historyDate}>{formatHistoryDate(item.date)}</Text>
                  </Pressable>
                )}
              />
            )}

            {history.length > 0 && (
              <Pressable onPress={clearHistory} style={s.historyClearBtn}>
                <Text style={s.historyClearText}>Clear history</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function ChatBubble({ item, colors, s, openVerseSheet, onExplore }) {
  if (item.role === "user") {
    return (
      <View style={s.userBubble}>
        <Text style={s.userText}>{item.content}</Text>
      </View>
    );
  }

  // Two possible AI shapes: a written prose message (crisis response, or a
  // scripture journey) still uses {text, citations}; every ordinary
  // question now returns a discovery result {themes, passages, relatedTopics}.
  // See src/chat/chatEngine.js.
  if (item.content.themes) {
    return <DiscoveryCard content={item.content} s={s} openVerseSheet={openVerseSheet} onExplore={onExplore} />;
  }

  const { text, citations, voice, isCrisis } = item.content;
  return (
    <View style={[s.aiBubble, isCrisis && s.crisisBubble]}>
      {voice ? <Text style={s.voiceTag}>{VOICES[voice]?.label}</Text> : null}
      <Text style={s.aiText}>{text}</Text>
      {citations && citations.length > 0 && citations.map(ref => {
        const t = resolveCitationText(ref);
        if (!t) return null;
        return (
          <Pressable key={ref} style={s.citeCard} onPress={() => openVerseSheet(ref, t)}>
            <Text style={s.citeRef}>{ref}</Text>
            <Text style={s.citeText}>{t}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DiscoveryCard({ content, s, openVerseSheet, onExplore }) {
  const { lifeSituation, answer, themes, passages, relatedTopics } = content;
  return (
    <View style={s.aiBubble}>
      {lifeSituation ? <Text style={s.lifeSituationText}>{lifeSituation}</Text> : null}

      {themes && themes.length > 0 && (
        <View style={s.chipRow}>
          {themes.map(label => (
            <View key={label} style={s.themeChip}>
              <Text style={s.themeChipText}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      {answer ? <Text style={s.aiText}>{answer}</Text> : null}

      {passages && passages.length > 0 && (
        <View style={s.passagesBlock}>
          <Text style={s.sectionLabel}>SUGGESTED PASSAGES</Text>
          {passages.map(p => {
            const t = resolveCitationText(p.ref);
            if (!t) return null;
            return (
              <Pressable key={p.ref} style={s.citeCard} onPress={() => openVerseSheet(p.ref, t)}>
                <Text style={s.citeRef}>{p.ref}</Text>
                <Text style={s.citeText}>{t}</Text>
                {p.why ? <Text style={s.passageWhy}>{p.why}</Text> : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {relatedTopics && relatedTopics.length > 0 && (
        <View style={s.passagesBlock}>
          <Text style={s.sectionLabel}>RELATED TOPICS</Text>
          <View style={s.chipRow}>
            {relatedTopics.map(label => (
              <Pressable key={label} style={s.topicChip} onPress={() => onExplore(label)}>
                <Text style={s.topicChipText}>{label} →</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

function makeStyles(c, textScale) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    messages: { flex: 1 },
    userBubble: { alignSelf: "flex-end", backgroundColor: c.accent, borderRadius: 16, borderBottomRightRadius: 4, padding: 12, maxWidth: "82%" },
    userText: { color: c.accentContrast, fontSize: 15 * textScale },
    aiBubble: { alignSelf: "flex-start", backgroundColor: c.bgElevated, borderWidth: 1, borderColor: c.border, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12, maxWidth: "92%" },
    crisisBubble: { borderColor: c.danger, borderWidth: 1.5 },
    voiceTag: { color: c.textMuted, fontSize: 10 * textScale, fontWeight: "700", letterSpacing: 0.5, marginBottom: 6, textTransform: "uppercase" },
    aiText: { color: c.text, fontSize: 15 * textScale, lineHeight: 22 * textScale },
    lifeSituationText: { color: c.textMuted, fontSize: 13 * textScale, fontStyle: "italic", marginBottom: 10, lineHeight: 19 * textScale },
    sectionLabel: { color: c.textMuted, fontSize: 10 * textScale, fontWeight: "700", letterSpacing: 0.6, marginBottom: 8 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 4 },
    themeChip: { backgroundColor: c.accent, borderRadius: 999, paddingVertical: 5, paddingHorizontal: 11, marginBottom: 6 },
    themeChipText: { color: c.accentContrast, fontSize: 12 * textScale, fontWeight: "600" },
    passagesBlock: { marginTop: 12 },
    citeCard: { backgroundColor: c.bgSunken, borderRadius: 10, padding: 10, marginTop: 8 },
    citeRef: { color: c.accent, fontWeight: "700", fontSize: 11 * textScale, marginBottom: 3, textTransform: "uppercase" },
    citeText: { color: c.text, fontSize: 13 * textScale, lineHeight: 19 * textScale },
    passageWhy: { color: c.textMuted, fontSize: 12 * textScale, lineHeight: 17 * textScale, marginTop: 6, fontStyle: "italic" },
    topicChip: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: c.bg, marginBottom: 6 },
    topicChipText: { color: c.accent, fontSize: 12 * textScale, fontWeight: "600" },
    typing: { color: c.textMuted, fontSize: 18 * textScale, paddingLeft: 4 },
    hint: { color: c.textMuted, fontSize: 12 * textScale, paddingHorizontal: 16, paddingBottom: 4 },
    quickRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
    quickPill: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, backgroundColor: c.bgSunken },
    quickPillText: { color: c.text, fontSize: 12 * textScale },
    inputRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 6, alignItems: "center" },
    input: { flex: 1, borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, color: c.text, backgroundColor: c.bgElevated },
    sendBtn: { backgroundColor: c.accent, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16 },
    sendBtnText: { color: c.accentContrast, fontWeight: "700", fontSize: 13 * textScale },
    footerDisclaimer: { color: c.textMuted, fontSize: 9.5 * textScale, textAlign: "center", paddingHorizontal: 24, paddingVertical: 6, lineHeight: 13 * textScale, opacity: 0.85 },
    historyOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
    historySheet: { backgroundColor: c.bgElevated, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 34, maxHeight: "75%" },
    historyHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
    historyTitle: { color: c.text, fontSize: 17 * textScale, fontWeight: "700" },
    historyClose: { color: c.accent, fontSize: 14 * textScale, fontWeight: "600" },
    historyEmpty: { color: c.textMuted, fontSize: 13.5 * textScale, lineHeight: 19 * textScale, paddingVertical: 12 },
    historyList: { flexGrow: 0 },
    historyRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 },
    historyQuestion: { color: c.text, fontSize: 14 * textScale, flex: 1 },
    historyDate: { color: c.textMuted, fontSize: 11.5 * textScale },
    historyClearBtn: { marginTop: 14, alignSelf: "center" },
    historyClearText: { color: c.danger, fontSize: 13 * textScale, fontWeight: "600" },
  });
}
