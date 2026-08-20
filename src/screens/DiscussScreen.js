import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { View, Text, TextInput, Pressable, FlatList, Modal, StyleSheet, KeyboardAvoidingView, Platform } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useVerseSheet } from "../components/VerseSheetContext";
import { useAuth } from "../auth/AuthContext";
import { resolveCitationText } from "../chat/chatEngine";
import { sendDiscussTurn, deriveThreadTitle } from "../chat/conversationEngine";
import { KEYS, getJSON, setJSON } from "../storage/storage";

const SEED_MESSAGE = {
  id: "seed",
  role: "ai",
  content: "I'm here to talk — bring me a real question or pushback, and I'll reason it through with you, grounded in Scripture.",
  citations: [],
  isCrisis: false,
};

function newId(prefix) {
  return prefix + Date.now() + Math.random().toString(36).slice(2, 8);
}

function formatThreadDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

export default function DiscussScreen() {
  const { colors, textScale } = useTheme();
  const { openVerseSheet } = useVerseSheet();
  const { syncVersion } = useAuth();
  const s = useMemo(() => makeStyles(colors, textScale), [colors, textScale]);
  const listRef = useRef(null);

  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([SEED_MESSAGE]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [hasSent, setHasSent] = useState(false);

  const [historyVisible, setHistoryVisible] = useState(false);
  const [threads, setThreads] = useState([]);
  const refreshThreads = useCallback(async () => setThreads(await getJSON(KEYS.discussThreads, [])), []);
  useEffect(() => { refreshThreads(); }, [refreshThreads, syncVersion]);

  const scrollDown = () => setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);

  const persistThread = async (id, msgs) => {
    const current = await getJSON(KEYS.discussThreads, []);
    const existing = current.find(t => t.id === id);
    const firstUserMessage = msgs.find(m => m.role === "user");
    const now = new Date().toISOString();
    const thread = {
      id,
      title: existing?.title || deriveThreadTitle(firstUserMessage ? firstUserMessage.content : "New conversation"),
      messages: msgs,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    };
    const updated = [thread, ...current.filter(t => t.id !== id)];
    await setJSON(KEYS.discussThreads, updated);
    setThreads(updated);
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message) return;
    setHasSent(true);
    setInput("");
    setTyping(true);

    const threadId = activeThreadId ?? newId("t");
    if (!activeThreadId) setActiveThreadId(threadId);

    const withUser = [...messages, { id: newId("u"), role: "user", content: message }];
    setMessages(withUser);
    scrollDown();

    const fullHistory = withUser
      .filter(m => m.id !== "seed")
      .map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.content }));

    try {
      const reply = await sendDiscussTurn(fullHistory);
      const withReply = [...withUser, { id: newId("a"), role: "ai", content: reply.text, citations: reply.citations, isCrisis: reply.isCrisis }];
      setMessages(withReply);
      await persistThread(threadId, withReply);
    } catch (err) {
      const withError = [...withUser, { id: newId("a"), role: "ai", content: "Something went wrong reaching the server — please try again.", citations: [], isCrisis: false, isError: true }];
      setMessages(withError);
    } finally {
      setTyping(false);
      scrollDown();
    }
  };

  const newThread = () => {
    setActiveThreadId(null);
    setMessages([SEED_MESSAGE]);
    setHasSent(false);
    setHistoryVisible(false);
  };

  const openThread = (thread) => {
    setActiveThreadId(thread.id);
    setMessages(thread.messages);
    setHasSent(true);
    setHistoryVisible(false);
    scrollDown();
  };

  const deleteThread = async (id) => {
    const current = await getJSON(KEYS.discussThreads, []);
    const updated = current.filter(t => t.id !== id);
    await setJSON(KEYS.discussThreads, updated);
    setThreads(updated);
    if (id === activeThreadId) newThread();
  };

  const clearAllThreads = async () => {
    await setJSON(KEYS.discussThreads, []);
    setThreads([]);
    newThread();
  };

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <View style={s.topBar}>
        <Pressable onPress={newThread} hitSlop={12} style={s.topBarBtn}>
          <Text style={s.topBarBtnText}>New</Text>
        </Pressable>
        <Pressable onPress={() => setHistoryVisible(true)} hitSlop={12} style={s.topBarBtn}>
          <Text style={s.topBarBtnText}>History</Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        style={s.messages}
        contentContainerStyle={{ padding: 16, gap: 12 }}
        data={messages}
        keyExtractor={m => m.id}
        renderItem={({ item }) => (
          <MessageBubble item={item} colors={colors} s={s} openVerseSheet={openVerseSheet} />
        )}
        ListFooterComponent={typing ? <Text style={s.typing}>· · ·</Text> : null}
      />

      {!hasSent && (
        <Text style={s.hint}>Ask a sincere question, or push back on something — I'll engage with it directly, reasoning from Scripture, without budging on what the Bible actually teaches.</Text>
      )}

      <View style={s.inputRow}>
        <TextInput
          style={s.input}
          placeholder="Say what's on your mind — agree, push back, ask anything."
          placeholderTextColor={colors.textMuted}
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => send()}
        />
        <Pressable style={s.sendBtn} onPress={() => send()}>
          <Text style={s.sendBtnText}>Send</Text>
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
              <Text style={s.historyTitle}>Conversations</Text>
              <Pressable onPress={() => setHistoryVisible(false)}><Text style={s.historyClose}>Done</Text></Pressable>
            </View>

            {threads.length === 0 ? (
              <Text style={s.historyEmpty}>Nothing here yet — conversations you start will show up here so you can pick them back up.</Text>
            ) : (
              <FlatList
                data={threads}
                keyExtractor={t => t.id}
                style={s.historyList}
                renderItem={({ item }) => (
                  <View style={s.historyRow}>
                    <Pressable style={{ flex: 1 }} onPress={() => openThread(item)}>
                      <Text style={s.historyQuestion} numberOfLines={2}>{item.title}</Text>
                      <Text style={s.historyDate}>{formatThreadDate(item.updatedAt)}</Text>
                    </Pressable>
                    <Pressable onPress={() => deleteThread(item.id)} hitSlop={10} style={s.historyDeleteBtn}>
                      <Text style={s.historyDeleteText}>×</Text>
                    </Pressable>
                  </View>
                )}
              />
            )}

            {threads.length > 0 && (
              <Pressable onPress={clearAllThreads} style={s.historyClearBtn}>
                <Text style={s.historyClearText}>Clear all</Text>
              </Pressable>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ item, colors, s, openVerseSheet }) {
  if (item.role === "user") {
    return (
      <View style={s.userBubble}>
        <Text style={s.userText}>{item.content}</Text>
      </View>
    );
  }

  return (
    <View style={[s.aiBubble, item.isCrisis && s.crisisBubble]}>
      <Text style={s.aiText}>{item.content}</Text>
      {item.citations && item.citations.length > 0 && item.citations.map(ref => {
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

function makeStyles(c, textScale) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    topBar: { flexDirection: "row", justifyContent: "flex-end", gap: 4, paddingHorizontal: 12, paddingTop: 8 },
    topBarBtn: { paddingHorizontal: 10, paddingVertical: 6 },
    topBarBtnText: { color: c.accent, fontSize: 13, fontWeight: "700" },
    messages: { flex: 1 },
    userBubble: { alignSelf: "flex-end", backgroundColor: c.accent, borderRadius: 16, borderBottomRightRadius: 4, padding: 12, maxWidth: "82%" },
    userText: { color: c.accentContrast, fontSize: 15 * textScale },
    aiBubble: { alignSelf: "flex-start", backgroundColor: c.bgElevated, borderWidth: 1, borderColor: c.border, borderRadius: 16, borderBottomLeftRadius: 4, padding: 12, maxWidth: "92%" },
    crisisBubble: { borderColor: c.danger, borderWidth: 1.5 },
    aiText: { color: c.text, fontSize: 15 * textScale, lineHeight: 22 * textScale },
    citeCard: { backgroundColor: c.bgSunken, borderRadius: 10, padding: 10, marginTop: 8 },
    citeRef: { color: c.accent, fontWeight: "700", fontSize: 11 * textScale, marginBottom: 3, textTransform: "uppercase" },
    citeText: { color: c.text, fontSize: 13 * textScale, lineHeight: 19 * textScale },
    typing: { color: c.textMuted, fontSize: 18 * textScale, paddingLeft: 4 },
    hint: { color: c.textMuted, fontSize: 12 * textScale, paddingHorizontal: 16, paddingBottom: 4 },
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
    historyDate: { color: c.textMuted, fontSize: 11.5 * textScale, marginTop: 2 },
    historyDeleteBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    historyDeleteText: { color: c.textMuted, fontSize: 20 * textScale, fontWeight: "600" },
    historyClearBtn: { marginTop: 14, alignSelf: "center" },
    historyClearText: { color: c.danger, fontSize: 13 * textScale, fontWeight: "600" },
  });
}
