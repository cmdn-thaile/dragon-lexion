# Design Document: Cambridge Lexicon System & Custom Word Lists

**Date:** 2026-10-28  
**Topic:** Full replacement of stages with Cambridge Lexicon (A1–A2 Easy, B1–B2 Medium, C1–C2 Hard, Specialized), Global Leaderboards, and Personal Word Lists (Save & Play)  
**Status:** Approved by User  

---

## 1. Intent & Background

Dragon Lexicon is upgrading its entire content library from the legacy 16 stages (`w1`–`w10`, `s1`–`s6`) to a comprehensive dictionary system powered by Cambridge Dictionary data (~22,490 words).

Key user requirements:
1. **Full Replacement with Cambridge Lexicon**:
   - Replace all old stages with new topic-based stages extracted from `Cambridge/`:
     - **Dễ (A1–A2)**: Stages from `cambridge_vocab_A1_A2.json`.
     - **Trung bình (B1–B2)**: Stages from `cambridge_vocab_B1_B2.json`.
     - **Khó (C1–C2)**: Stages from `cambridge_vocab_C1_C2.json`.
     - **Chuyên khoa (Specialized & Technical)**: Stages from `cambridge_vocab_Specialized_Technical.json` (no difficulty grading).
2. **Global Leaderboards**:
   - All newly generated Cambridge topic stages support global leaderboards (🏆 Leaderboard) via `/api/scores` and `BestScore` in MongoDB/Prisma.
   - `data/stages.meta.json` is updated with all new stage IDs, names, and HP values.
3. **Tabbed Hub Interface**:
   - The Hub stage selector is organized into 5 tabs:
     - `[ Dễ (A1–A2) ]`
     - `[ Trung bình (B1–B2) ]`
     - `[ Khó (C1–C2) ]`
     - `[ Chuyên khoa ]`
     - `[ List từ cá nhân ]`
4. **Manual Save Word & Personal Lists**:
   - Remove automatic insertion of wrong answers into `review`.
   - On question feedback (correct or incorrect), provide a **💾 Lưu từ** button.
   - Clicking opens a pixel modal allowing selection of an existing personal list or creation of a new one.
   - Saved locally in `localStorage` (`dl-custom-lists`).
   - In the **List từ cá nhân** tab, players can review, manage words, and launch a full game session ("Vào trận") using their custom list (unranked practice, >= 4 words required).

---

## 2. Ingestion Pipeline & Stage Data Structure

### 2.1 Build Script (`scripts/build-cambridge-data.mjs`)
Transforms `Cambridge/*.json` into optimized game stages:
- **Grouping**: Group entries by `topic` (for A1–A2, B1–B2) or `domain` (for C1–C2, Specialized).
- **Entry format**: Compact array `[word, level, pos, ipa, definition_en, meaning_vi, example_sentence]`.
- **Dragon Stats per Tier**:
  - Dễ (A1–A2): 250 HP, ATK 12.
  - Trung bình (B1–B2): 340 HP, ATK 15.
  - Khó (C1–C2): 420 HP, ATK 18.
  - Chuyên khoa: 450 HP, ATK 20.
  - Dragons randomly assigned visual color palettes and horn/breath styles from the dragon sprite engine.
- **Stage Metadata**:
  - `data/stages.meta.json` updated with all stage IDs, titles (`vi`), and `hp` for server-side scoring verification in `lib/stages.ts` and `/api/scores`.
- **Output**:
  - `public/data/words.json` containing the new stages grouped by tier, plus global bank/distractors.

---

## 3. Gameplay & UI Architecture

### 3.1 Sảnh chính (Hub)
- Pixel-styled tab strip at the top of the Hub stage selection area.
- Selecting a tab renders stage cards for that category.
- Each stage card features:
  - Vietnamese stage title & English sub-title.
  - Level badge (`A1`, `B2`, `C1`, `Spec`, etc.).
  - Dragon HP and word count.
  - Status indicator (e.g. "Đã hạ ✓").
  - 🏆 Leaderboard button opening `<Leaderboard />` for that stage.
- Selected stage updates the "Vào trận: <Tên màn>" button.

### 3.2 Question Feedback & "Lưu từ" (Save Word)
- In the feedback box (`#fb`), add a button:
  `💾 Lưu từ`
- Clicking opens a modal:
  - Displays word, phonetic, and Vietnamese meaning.
  - Shows existing custom lists with radio selection.
  - Includes text input "+ Tạo nhóm mới" with "Tạo & Lưu".
  - Confirmation toast displayed upon saving.
  - If word already exists in selected list, alert user cleanly.

### 3.3 List từ cá nhân (Personal Lists Tab)
- Lists user's custom lists stored in `localStorage` under `dl-custom-lists`.
- Migrates any legacy `P.review` words on first load into a default list `"Từ cần ôn tập"`.
- Each list card displays:
  - List name and word count.
  - "Vào trận" action if words >= 4.
  - "Quản lý / Xóa" to inspect list words or delete the list.
- In-game behavior for custom lists:
  - Boss HP scaled dynamically (e.g., `Math.max(150, Math.min(450, words.length * 35))`).
  - Distractors drawn from the custom list, supplemented by Cambridge bank if needed.
  - Unranked (no server leaderboard), but rewards `totalCorrect` and `bestStreak` for Knight unlocks.

---

## 4. Calls Made by Builder
1. **Handling Empty IPA / Malformed Source Data**: When Cambridge data has empty `ipa` (`""`), the UI omits phonetic rendering and speech synthesis continues using the word string via Web Speech API.
2. **Review Data Migration**: Existing `P.review` entries are migrated on startup to a custom list named `"Từ cần ôn tập"` so past player mistakes are preserved in the new custom list system.
3. **Custom List Distractors**: If a custom list has between 4 and 10 words, distractors come from other words in the list plus standard vocabulary fallback to ensure varied choices.
