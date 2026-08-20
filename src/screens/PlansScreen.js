import React, { useState, useEffect, useCallback, useMemo } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useVerseSheet } from "../components/VerseSheetContext";
import { useAuth } from "../auth/AuthContext";
import { READING_PLANS, getWeeklyPlanOrder } from "../data/devotionals";
import { VERSES } from "../data/bibleData";
import { KEYS, getJSON, setJSON } from "../storage/storage";

export default function PlansScreen() {
  const { colors, textScale } = useTheme();
  const { openVerseSheet } = useVerseSheet();
  const { syncVersion } = useAuth();
  const s = useMemo(() => makeStyles(colors, textScale), [colors, textScale]);

  const [progress, setProgress] = useState({});
  const [openPlanId, setOpenPlanId] = useState(null);
  const weeklyPlans = useMemo(() => getWeeklyPlanOrder(), []);

  const refresh = useCallback(async () => setProgress(await getJSON(KEYS.planProgress, {})), []);
  useEffect(() => { refresh(); }, [refresh, syncVersion]);

  const toggleDay = async (planId, ref) => {
    const list = progress[planId] || [];
    const next = list.includes(ref) ? list.filter(r => r !== ref) : [...list, ref];
    const updated = { ...progress, [planId]: next };
    setProgress(updated);
    await setJSON(KEYS.planProgress, updated);
  };

  const openPlan = openPlanId ? READING_PLANS.find(p => p.id === openPlanId) : null;

  if (openPlan) {
    const done = progress[openPlan.id] || [];
    return (
      <ScrollView style={s.screen} contentContainerStyle={{ padding: 16 }}>
        <Pressable onPress={() => setOpenPlanId(null)}><Text style={s.backLink}>← Back to plans</Text></Pressable>
        <Text style={s.title}>{openPlan.title}</Text>
        {openPlan.refs.map((ref, i) => {
          const v = VERSES.find(x => x.ref === ref);
          const isDone = done.includes(ref);
          return (
            <View key={ref} style={s.card}>
              <View style={s.dayRow}>
                <View style={{ flex: 1 }}>
                  <Pressable onPress={() => openVerseSheet(ref, v?.text)}>
                    <Text style={s.dayRef}>Day {i + 1} · {ref}</Text>
                  </Pressable>
                  <Text style={s.dayText}>{v ? v.text : ""}</Text>
                </View>
                <Pressable style={[s.doneBtn, isDone && s.doneBtnActive]} onPress={() => toggleDay(openPlan.id, ref)}>
                  <Text style={[s.doneBtnText, isDone && s.doneBtnTextActive]}>{isDone ? "✓ Done" : "Mark Done"}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16 }}>
      <Text style={s.sectionTitle}>Reading Plans</Text>
      {weeklyPlans.map((plan, i) => {
        const doneCount = (progress[plan.id] || []).length;
        const pct = Math.round((doneCount / plan.days) * 100);
        return (
          <View key={plan.id} style={s.card}>
            <Text style={s.badge}>{i === 0 ? "★ FEATURED THIS WEEK" : plan.category.toUpperCase()}</Text>
            <Text style={s.title}>{plan.title}</Text>
            <Text style={s.desc}>{plan.description}</Text>
            <View style={s.track}><View style={[s.fill, { width: `${pct}%` }]} /></View>
            <View style={s.dayRow}>
              <Text style={s.mutedText}>{doneCount}/{plan.days} days</Text>
              <Pressable style={s.primaryBtn} onPress={() => setOpenPlanId(plan.id)}>
                <Text style={s.primaryBtnText}>{doneCount > 0 ? "Continue" : "Start"}</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function makeStyles(c, textScale) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.bg },
    sectionTitle: { color: c.text, fontSize: 18 * textScale, fontWeight: "700", fontStyle: "italic", marginBottom: 12 },
    card: { backgroundColor: c.bgElevated, borderRadius: 18, borderWidth: 1, borderColor: c.border, padding: 16, marginBottom: 14 },
    badge: { color: c.textMuted, fontSize: 10 * textScale, fontWeight: "700", letterSpacing: 0.6, marginBottom: 6 },
    title: { color: c.text, fontSize: 16 * textScale, fontWeight: "700", marginBottom: 4 },
    desc: { color: c.textMuted, fontSize: 13 * textScale, marginBottom: 12, lineHeight: 19 * textScale },
    track: { height: 8, backgroundColor: c.bgSunken, borderRadius: 999, overflow: "hidden", marginBottom: 10 },
    fill: { height: "100%", backgroundColor: c.accent },
    dayRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    mutedText: { color: c.textMuted, fontSize: 12 * textScale },
    primaryBtn: { backgroundColor: c.accent, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 14 },
    primaryBtnText: { color: c.accentContrast, fontWeight: "700", fontSize: 12 * textScale },
    backLink: { color: c.accent, fontSize: 13 * textScale, marginBottom: 10 },
    dayRef: { color: c.accent, fontWeight: "700", fontSize: 12 * textScale, marginBottom: 6, textTransform: "uppercase" },
    dayText: { color: c.text, fontSize: 14 * textScale, lineHeight: 20 * textScale },
    doneBtn: { borderWidth: 1, borderColor: c.border, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 10, marginLeft: 10 },
    doneBtnActive: { backgroundColor: c.accent, borderColor: "transparent" },
    doneBtnText: { color: c.text, fontSize: 11 * textScale },
    doneBtnTextActive: { color: c.accentContrast },
  });
}
