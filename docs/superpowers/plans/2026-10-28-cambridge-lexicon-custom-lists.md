# Cambridge Lexicon System & Custom Word Lists Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all game stages with categorized Cambridge Lexicon stages (A1–A2 Easy, B1–B2 Medium, C1–C2 Hard, Specialized) with Global Leaderboard support, tabbed Hub navigation, and personal word lists (manual Save Word & custom battle start).

**Architecture:**
- A Node.js ingestion script compiles `Cambridge/*.json` into optimized game stages in `public/data/words.json` and updates `data/stages.meta.json` for server validation.
- Client-side storage layer (`lib/custom-lists.ts`) handles CRUD operations for user word lists in `localStorage` (`dl-custom-lists`) and migrates legacy review mistakes.
- Hub UI introduces a 5-tab selector (Easy, Medium, Hard, Specialized, Custom Lists) and question feedback gains a Save Word modal dialog wired directly into the game engine.

**Tech Stack:** Next.js 15 (App Router), React 19, TypeScript, Prisma ORM (MongoDB), HTML5 Canvas, Web Audio API, Web Speech API, Node.js test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-10-28-cambridge-lexicon-custom-lists-design.md`

## Global Constraints
- Cambridge source data lives in `Cambridge/` at project root.
- All new Cambridge stages must be registered in `data/stages.meta.json` with `vi` and `hp` matching client stages.
- Personal word lists must be stored locally in `localStorage` under key `dl-custom-lists`.
- Answering questions incorrectly must NEVER automatically add words to review or personal lists.
- A custom list must have at least 4 words to start a battle.
- Custom list battles are unranked (no submission to `/api/scores`), but award Knight progress (`totalCorrect`, `bestStreak`).

## Review Focus
1. Empty IPA strings in Cambridge entries must not cause speech synthesis or phonetic rendering errors.
2. Words with special characters or punctuation in definitions must render cleanly without broken markup.
3. Attempting to add a word that already exists in a custom list must notify the user rather than creating duplicates.
4. Custom lists with exactly 4 words must generate 3 distinct distractors correctly during question creation without crashing or infinite loops.
5. Legacy players with non-empty `P.review` must have their words migrated to a default `"Từ cần ôn tập"` list seamlessly without data loss.

---

### Task 1: Cambridge Data Ingestion Script & Metadata Generation

**Files:**
- Create: `scripts/build-cambridge-data.mjs`
- Create: `tests/build-cambridge-data.test.mjs`
- Modify: `data/stages.meta.json`
- Modify: `public/data/words.json`

**Interfaces:**
- Produces:
  - `data/stages.meta.json`: Record<string, { vi: string; hp: number }>
  - `public/data/words.json`: `{ stages: Stage[], bank: WordEntry[] }`
  - Each `Stage`: `{ id: string, vi: string, en: string, lvl: string, hp: number, atk: number, tier: string, dragon: object, raw: WordEntry[] }`
  - Each `WordEntry`: `[word: string, level: string, pos: string, ipa: string, def: string, vi: string, ex: string]`

- [ ] **Step 1: Write the failing test for Cambridge data conversion**

Create `tests/build-cambridge-data.test.mjs`:
```javascript
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Cambridge build script generates valid stages and metadata", async () => {
  const { generateDatasets } = await import("../scripts/build-cambridge-data.mjs");
  const result = generateDatasets({ testMode: true });

  assert.ok(result.stages.length >= 40, `Expected at least 40 stages, got ${result.stages.length}`);
  assert.ok(result.meta, "Meta object must be generated");

  const sample = result.stages[0];
  assert.ok(sample.id && sample.vi && sample.hp && sample.dragon, "Stage must have required properties");
  assert.ok(sample.raw.length >= 4, "Each stage must have at least 4 words");
  assert.equal(sample.raw[0].length, 7, "Each word entry must have 7 fields");

  // Verify meta contains stage
  assert.equal(result.meta[sample.id].vi, sample.vi);
  assert.equal(result.meta[sample.id].hp, sample.hp);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/build-cambridge-data.test.mjs`  
Expected: FAIL with "Cannot find module '../scripts/build-cambridge-data.mjs'"

- [ ] **Step 3: Implement `generateDatasets()` in `scripts/build-cambridge-data.mjs`**

Implement the data transformer:
1. Reads `Cambridge/cambridge_vocab_A1_A2.json`, `B1_B2`, `C1_C2`, `Specialized_Technical`.
2. Groups entries by topic/domain.
3. Formats each entry into `[word, level, pos, ipa, def, vi, ex]`.
4. Assigns dragon boss configs (palettes, horns, HP) per tier:
   - A1–A2: 250 HP, ATK 12
   - B1–B2: 340 HP, ATK 15
   - C1–C2: 420 HP, ATK 18
   - Specialized: 450 HP, ATK 20
5. Outputs `public/data/words.json` and `data/stages.meta.json` when run as CLI script.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/build-cambridge-data.test.mjs`  
Expected: PASS

- [ ] **Step 5: Run full script to build production datasets**

Run: `node scripts/build-cambridge-data.mjs`  
Expected: Successfully generates `public/data/words.json` and `data/stages.meta.json`.

- [ ] **Step 6: Commit**

```bash
git add scripts/build-cambridge-data.mjs tests/build-cambridge-data.test.mjs data/stages.meta.json public/data/words.json
git commit -m "feat: implement Cambridge lexicon ingestion script and generate stage datasets"
```

---

### Task 2: Custom Lists Storage Module & Review Data Migration

**Files:**
- Create: `lib/custom-lists.ts`
- Create: `tests/custom-lists.test.mjs`

**Interfaces:**
- Produces:
  - `export interface CustomList { id: string; name: string; createdAt: number; words: CustomWord[] }`
  - `export interface CustomWord { w: string; lvl: string; pos: string; ipa: string; def: string; vi: string; ex: string }`
  - `getCustomLists(): CustomList[]`
  - `createCustomList(name: string): CustomList`
  - `deleteCustomList(id: string): void`
  - `addWordToList(listId: string, word: CustomWord): { success: boolean; alreadyExists?: boolean }`
  - `removeWordFromList(listId: string, wordStr: string): void`
  - `migrateLegacyReview(reviewObj: Record<string, number>, allWords: CustomWord[]): void`

- [ ] **Step 1: Write the failing tests for custom lists operations**

Create `tests/custom-lists.test.mjs`:
```javascript
import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage
const store = new Map();
global.localStorage = {
  getItem: k => store.get(k) || null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};

test("custom lists CRUD and migration operations", async () => {
  const {
    getCustomLists,
    createCustomList,
    addWordToList,
    removeWordFromList,
    deleteCustomList,
    migrateLegacyReview
  } = await import("../lib/custom-lists.ts");

  store.clear();
  assert.deepEqual(getCustomLists(), []);

  const list = createCustomList("Danh sách 1");
  assert.equal(list.name, "Danh sách 1");
  assert.equal(getCustomLists().length, 1);

  const word = { w: "apple", lvl: "A1", pos: "noun", ipa: "/ˈæp.əl/", def: "a fruit", vi: "quả táo", ex: "Eat an apple" };
  const addResult = addWordToList(list.id, word);
  assert.equal(addResult.success, true);

  const dupResult = addWordToList(list.id, word);
  assert.equal(dupResult.success, false);
  assert.equal(dupResult.alreadyExists, true);

  removeWordFromList(list.id, "apple");
  assert.equal(getCustomLists()[0].words.length, 0);

  deleteCustomList(list.id);
  assert.equal(getCustomLists().length, 0);

  // Test legacy review migration
  migrateLegacyReview({ "banana": 2 }, [{ w: "banana", lvl: "A1", pos: "noun", ipa: "", def: "yellow fruit", vi: "quả chuối", ex: "" }]);
  const migrated = getCustomLists();
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].name, "Từ cần ôn tập");
  assert.equal(migrated[0].words[0].w, "banana");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/custom-lists.test.mjs`  
Expected: FAIL with "Cannot find module '../lib/custom-lists.ts'"

- [ ] **Step 3: Implement `lib/custom-lists.ts`**

Implement functions with robust JSON parsing, duplicate checking by word string (`w.toLowerCase()`), and safe localStorage updates.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/custom-lists.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/custom-lists.ts tests/custom-lists.test.mjs
git commit -m "feat: implement custom lists management and review migration"
```

---

### Task 3: Game Markup & Styling for Tabbed Hub and Modals

**Files:**
- Modify: `components/GameMarkup.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Markup elements added:
  - Tabs in Hub: `<div class="hub-tabs" role="tablist">` with buttons for each tier:
    `data-tab="easy"`, `data-tab="med"`, `data-tab="hard"`, `data-tab="spec"`, `data-tab="custom"`.
  - Save button in feedback section: `<button class="btn small ghost" id="saveWordBtn">💾 Lưu từ</button>`.
  - Save Word overlay modal: `<div class="overlay" id="saveOv" hidden>...</div>` with list selection, "+ Tạo nhóm mới" input, and submit/cancel buttons.
  - Custom List management overlay modal: `<div class="overlay" id="customListOv" hidden>...</div>` allowing inspecting and removing words.
  - Toast notification element: `<div class="pixel-toast" id="pixelToast" hidden></div>`.

- [ ] **Step 1: Update `components/GameMarkup.tsx`**

Add the Hub tabs container `#hubTabs`, `#stageGrid`, the "💾 Lưu từ" button inside `.feedback .row`, the `#saveOv` modal, `#customListOv` modal, and `#pixelToast`.

- [ ] **Step 2: Add CSS rules in `app/globals.css`**

Add responsive pixel styling for:
- `.hub-tabs`: Tab bar with active highlight (`--gold`).
- `.save-modal`: Pixel card styling for list choices and input fields.
- `.custom-word-list`: Scrollable word list with delete icons.
- `.pixel-toast`: Floating pixel badge that displays confirmation messages ("Đã lưu từ vào nhóm!").

- [ ] **Step 3: Verify build without syntax errors**

Run: `npx next build --no-lint` (or `npm run build`)  
Expected: Builds without TypeScript or JSX errors.

- [ ] **Step 4: Commit**

```bash
git add components/GameMarkup.tsx app/globals.css
git commit -m "feat: add markup and styles for hub tabs, save modal, and custom list manager"
```

---

### Task 4: Game Engine Updates (No Auto-Review, Custom Stage Support, Tabbed Hub)

**Files:**
- Modify: `lib/game/engine.js`

**Interfaces:**
- Consumes:
  - `getCustomLists()`, `addWordToList()`, `createCustomList()`, `migrateLegacyReview()` from `lib/custom-lists.ts`
- Engine changes:
  - `buildStage(id)`: Detects `id.startsWith("custom_")`, builds dynamic boss (dragon scaled to word count), pulls words from corresponding `CustomList`.
  - `resolve(i)`:
    - Removes `P.review[S.q.w] = ...` auto-adding on wrong answers.
    - Preserves decrementing `P.review` if it existed on correct answers.
  - `renderHub()`: Supports filtering stages by active tab (`easy`, `med`, `hard`, `spec`, `custom`).
  - Wire Save Word button: Opens save modal, lists existing custom groups, enables creating new groups on the fly, shows toast feedback.
  - Wire Custom List Tab: Lists player's custom groups with word count, "Xóa nhóm", "Xem từ", and allows selecting for battle.

- [ ] **Step 1: Write test for custom stage building & no auto-review in engine**

Create `tests/engine-behavior.test.mjs`:
```javascript
import test from "node:test";
import assert from "node:assert/strict";

test("resolve does not auto-add wrong answers to review pool", async () => {
  // Verify that the code string does not contain the old review increment
  const fs = await import("node:fs");
  const code = fs.readFileSync("lib/game/engine.js", "utf-8");
  
  assert.ok(
    !code.includes('P.review[S.q.w] = Math.min(3, (P.review[S.q.w] || 0) + 1);'),
    "Auto-adding wrong answers to P.review must be removed"
  );
  assert.ok(code.includes('custom_'), "buildStage must support custom stages");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/engine-behavior.test.mjs`  
Expected: FAIL because auto-adding code is still present in `engine.js`.

- [ ] **Step 3: Update `lib/game/engine.js`**

1. Import custom list helpers from `../custom-lists`.
2. Update `loadProgress()` / `initGame()` to run `migrateLegacyReview(P.review, ALL)` on startup.
3. Update `buildStage(id)`:
   - If `id.startsWith("custom_")`, find list in `getCustomLists()`, return stage with scaled HP (`Math.max(150, Math.min(450, words.length * 35))`), dragon, and word items.
4. Update `resolve(i)`: Remove the `P.review[S.q.w] = ...` line.
5. Add tab filtering state `currentHubTab` (default: `"easy"`).
6. Implement modal handlers for `#saveWordBtn`, `#saveOv`, `#customListOv`, and tab switching.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/engine-behavior.test.mjs`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/game/engine.js tests/engine-behavior.test.mjs
git commit -m "feat: integrate custom stages, tabbed hub, and manual save word modal into engine"
```

---

### Task 5: End-to-End Verification & Leaderboard Compatibility

**Files:**
- Modify: `components/GameClient.tsx` (if needed for prop passing)
- Run: Full Next.js production build & unit tests

**Interfaces:**
- Verifies:
  - All tests in `tests/*.test.mjs` pass cleanly.
  - `npm run build` succeeds with zero errors.
  - Server route `/api/scores` properly verifies stages via `data/stages.meta.json`.
  - All 4 Cambridge tiers + Custom lists render and function without console errors.

- [ ] **Step 1: Run all unit tests**

Run: `node --test tests/*.test.mjs`  
Expected: All tests PASS.

- [ ] **Step 2: Run full build and typecheck**

Run: `npm run build`  
Expected: Build succeeds with static/dynamic routes cleanly generated.

- [ ] **Step 3: Commit final integration changes**

```bash
git add .
git commit -m "chore: complete integration of Cambridge lexicon tiers and custom word lists"
```
