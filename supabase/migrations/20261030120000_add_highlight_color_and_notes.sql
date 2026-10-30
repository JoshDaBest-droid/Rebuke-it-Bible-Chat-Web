-- Adds verse highlight colors and a shared note field to highlights and
-- bookmarks — both set from the verse popup (src/components/VerseSheetContext.js).
-- color is one of src/theme/themes.js's HIGHLIGHT_COLORS ids
-- ("yellow"/"green"/"blue"/"pink"); null means not set (pre-feature rows,
-- or bookmarks, which have no color concept).
alter table highlights add column if not exists color text;
alter table highlights add column if not exists note text;
alter table bookmarks add column if not exists note text;
