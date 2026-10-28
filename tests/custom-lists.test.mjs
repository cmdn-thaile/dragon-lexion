import test from "node:test";
import assert from "node:assert/strict";

// Mock localStorage
const store = new Map();
global.localStorage = {
  getItem: (k) => store.get(k) || null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

test("custom lists CRUD and migration operations", async () => {
  const {
    getCustomLists,
    createCustomList,
    addWordToList,
    removeWordFromList,
    deleteCustomList,
    migrateLegacyReview,
  } = await import("../lib/custom-lists.ts");

  store.clear();
  assert.deepEqual(getCustomLists(), []);

  const list = createCustomList("Danh sách 1");
  assert.equal(list.name, "Danh sách 1");
  assert.equal(getCustomLists().length, 1);

  const word = {
    w: "apple",
    lvl: "A1",
    pos: "noun",
    ipa: "/ˈæp.əl/",
    def: "a fruit",
    vi: "quả táo",
    ex: "Eat an apple",
  };
  const addResult = addWordToList(list.id, word);
  assert.equal(addResult.success, true);

  const dupResult = addWordToList(list.id, word);
  assert.equal(dupResult.success, false);
  assert.equal(dupResult.alreadyExists, true);

  // Case-insensitive duplicate check
  const upperWord = { ...word, w: "APPLE" };
  const upperDupResult = addWordToList(list.id, upperWord);
  assert.equal(upperDupResult.success, false);
  assert.equal(upperDupResult.alreadyExists, true);

  removeWordFromList(list.id, "apple");
  assert.equal(getCustomLists()[0].words.length, 0);

  deleteCustomList(list.id);
  assert.equal(getCustomLists().length, 0);

  // Test legacy review migration
  migrateLegacyReview({ banana: 2 }, [
    {
      w: "banana",
      lvl: "A1",
      pos: "noun",
      ipa: "",
      def: "yellow fruit",
      vi: "quả chuối",
      ex: "",
    },
  ]);
  const migrated = getCustomLists();
  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].name, "Từ cần ôn tập");
  assert.equal(migrated[0].words[0].w, "banana");

  // Repeated migration should not duplicate list or words
  migrateLegacyReview({ banana: 1, orange: 3 }, [
    {
      w: "banana",
      lvl: "A1",
      pos: "noun",
      ipa: "",
      def: "yellow fruit",
      vi: "quả chuối",
      ex: "",
    },
    {
      w: "orange",
      lvl: "A1",
      pos: "noun",
      ipa: "/ˈɒr.ɪndʒ/",
      def: "citrus fruit",
      vi: "quả cam",
      ex: "Sweet orange",
    },
  ]);
  const migratedTwice = getCustomLists();
  assert.equal(migratedTwice.length, 1);
  assert.equal(migratedTwice[0].words.length, 2);
  assert.equal(migratedTwice[0].words[0].w, "banana");
  assert.equal(migratedTwice[0].words[1].w, "orange");
});

test("handles corrupted localStorage gracefully", async () => {
  const { getCustomLists } = await import("../lib/custom-lists.ts");

  store.set("dl-custom-lists", "not-valid-json");
  assert.deepEqual(getCustomLists(), []);

  store.set("dl-custom-lists", JSON.stringify({ not: "an array" }));
  assert.deepEqual(getCustomLists(), []);
});

test("edge cases: non-existent list and missing word details in migration", async () => {
  const {
    createCustomList,
    addWordToList,
    removeWordFromList,
    migrateLegacyReview,
    getCustomLists,
  } = await import("../lib/custom-lists.ts");

  store.clear();
  const word = {
    w: "cherry",
    lvl: "A2",
    pos: "noun",
    ipa: "",
    def: "",
    vi: "quả anh đào",
    ex: "",
  };

  // Add to non-existent list
  const notFoundAdd = addWordToList("fake-id", word);
  assert.equal(notFoundAdd.success, false);

  // Remove from non-existent list (should not throw)
  assert.doesNotThrow(() => removeWordFromList("fake-id", "cherry"));

  // Migration with empty review object should do nothing
  migrateLegacyReview({}, []);
  assert.deepEqual(getCustomLists(), []);

  // Migration when word is not in allWords creates a fallback word object
  migrateLegacyReview({ dragon: 1 }, []);
  const lists = getCustomLists();
  assert.equal(lists.length, 1);
  assert.equal(lists[0].words.length, 1);
  assert.equal(lists[0].words[0].w, "dragon");
});
