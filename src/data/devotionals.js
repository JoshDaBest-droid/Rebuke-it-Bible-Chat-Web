/* Daily devotionals and mood -> verse pools for AI-chat journeys — demo
   dataset. */
import { VERSES } from "./bibleData";

export const DAILY_DEVOTIONALS = [
  { verseRef: "Psalm 46:10", title: "Be Still", body: "Before you check your phone, before the to-do list loads in your mind — be still. Stillness isn't the absence of a plan; it's the posture that lets you remember who's actually holding the plan." },
  { verseRef: "Philippians 4:6", title: "Anxious for Nothing", body: "Paul wrote this from a prison cell, not a spa retreat. Peace was never meant to depend on your circumstances lining up first. Bring today's worry to God before you carry it any further alone." },
  { verseRef: "Romans 8:28", title: "Working For Good", body: "This verse doesn't promise every chapter will feel good. It promises the Author is still writing, and that hardship isn't the final word in the story God is telling through your life." },
  { verseRef: "Isaiah 41:10", title: "Do Not Fear", body: "Fear shrinks your world down to the size of the threat in front of you. This verse widens it back out: the God who upholds you is bigger than what you're facing today." },
  { verseRef: "1 Corinthians 13:4", title: "What Love Actually Does", body: "Love here isn't a feeling — it's a list of verbs: patient, kind, not proud. Whoever you're struggling to love today, try substituting their name for 'love' in this verse and see what changes." },
  { verseRef: "Jeremiah 29:11", title: "A Future and a Hope", body: "This promise was written to exiles, people whose lives had been upended. If God had a plan for them in displacement, he has one for you in whatever uncertainty you're in now." },
  { verseRef: "Matthew 11:28", title: "Come and Rest", body: "Not 'earn rest.' Not 'deserve rest.' Come. Whatever you're carrying today — deadlines, guilt, grief — this is an open invitation, not a performance review." },
];

export function getTodaysDevotional() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const d = DAILY_DEVOTIONALS[dayOfYear % DAILY_DEVOTIONALS.length];
  const verse = VERSES.find(v => v.ref === d.verseRef);
  return { ...d, verseText: verse ? verse.text : "" };
}

// The short headline quote at the very top of Home. Each is a real, exact
// KJV excerpt (verified against the full offline text, not a paraphrase),
// trimmed down to a couple of words so it reads like a headline.
export const HOME_QUOTES = [
  { text: "Be still.", ref: "Psalm 46:10" },
  { text: "The LORD is my shepherd.", ref: "Psalm 23:1" },
  { text: "Let there be light.", ref: "Genesis 1:3" },
  { text: "God is love.", ref: "1 John 4:8" },
  { text: "I am the way.", ref: "John 14:6" },
  { text: "This is the day.", ref: "Psalm 118:24" },
  { text: "Rejoice evermore.", ref: "1 Thessalonians 5:16" },
  { text: "Pray without ceasing.", ref: "1 Thessalonians 5:17" },
  { text: "Be of good cheer.", ref: "Matthew 14:27" },
  { text: "Come unto me.", ref: "Matthew 11:28" },
  { text: "It is finished.", ref: "John 19:30" },
  { text: "The LORD is my light.", ref: "Psalm 27:1" },
  { text: "Trust in the LORD.", ref: "Proverbs 3:5" },
  { text: "Draw nigh to God.", ref: "James 4:8" },
  { text: "Be not afraid.", ref: "Joshua 11:6" },
];

export function getTodaysHomeQuote() {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  return HOME_QUOTES[dayOfYear % HOME_QUOTES.length];
}

/* Mood -> verse pools used by the AI chat's journey-request handling
   (see chatEngine.js). There's no dedicated "mood journey" screen — ask
   the AI in chat, e.g. "can you make me a journey for feeling anxious?" */
export const JOURNEY_MOODS = {
  anxious: { label: "Anxious", refs: ["Philippians 4:6", "Matthew 6:26", "Psalm 46:1", "Isaiah 41:10", "Philippians 4:7"] },
  grieving: { label: "Grieving", refs: ["Psalm 23:4", "Matthew 11:28", "Romans 8:28", "Jeremiah 29:11", "Psalm 23:1"] },
  doubting: { label: "Doubting", refs: ["James 1:5", "Proverbs 3:5", "Proverbs 3:6", "Romans 8:28"] },
  grateful: { label: "Grateful", refs: ["Philippians 4:8", "Psalm 139:14", "Galatians 5:22"] },
  joyful: { label: "Joyful", refs: ["James 1:2", "Galatians 5:22", "Philippians 4:4"] },
  overwhelmed: { label: "Overwhelmed", refs: ["Matthew 11:28", "Matthew 6:34", "Psalm 46:10", "Joshua 1:9", "Philippians 4:6"] },
};
