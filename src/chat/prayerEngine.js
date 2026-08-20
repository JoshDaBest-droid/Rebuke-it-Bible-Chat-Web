/* Personalized Verse Generator — pick a topic, get a random related Bible
   verse. Just the verse, nothing else (no generated prayer text). */
import { VERSES } from "../data/bibleData";

export const VERSE_GENERATOR_POOLS = {
  anxious: ["Philippians 4:6", "Philippians 4:7", "Matthew 6:26", "Matthew 6:34", "Psalm 46:1", "Isaiah 41:10"],
  grieving: ["Psalm 23:4", "Psalm 34:18", "Matthew 11:28", "Romans 8:28", "Jeremiah 29:11"],
  doubting: ["James 1:5", "Proverbs 3:5", "Proverbs 3:6", "Romans 8:28"],
  grateful: ["Philippians 4:8", "Psalm 139:14", "Galatians 5:22", "1 Corinthians 13:4"],
  purpose: ["Jeremiah 29:11", "Romans 8:28", "Proverbs 3:5", "Proverbs 3:6", "Psalm 139:14", "Genesis 1:1"],
};

export const MOOD_OPTIONS = [
  { value: "anxious", label: "Anxious" },
  { value: "grieving", label: "Grieving" },
  { value: "doubting", label: "Doubting" },
  { value: "grateful", label: "Grateful" },
  { value: "purpose", label: "Searching for purpose" },
];

export function generateRandomVerseForMood(moodKey) {
  const pool = VERSE_GENERATOR_POOLS[moodKey] || ["Jeremiah 29:11", "Romans 8:28"];
  const ref = pool[Math.floor(Math.random() * pool.length)];
  return VERSES.find(x => x.ref === ref) || VERSES[0];
}
