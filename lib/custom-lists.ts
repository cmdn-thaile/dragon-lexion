export interface CustomWord {
  w: string;
  lvl: string;
  pos: string;
  ipa: string;
  def: string;
  vi: string;
  ex: string;
}

export interface CustomList {
  id: string;
  name: string;
  createdAt: number;
  words: CustomWord[];
}

export const STORAGE_KEY = "dl-custom-lists";
export const DEFAULT_REVIEW_LIST_NAME = "Từ cần ôn tập";

function isLocalStorageAvailable(): boolean {
  return typeof localStorage !== "undefined";
}

export function getCustomLists(): CustomList[] {
  if (!isLocalStorageAvailable()) {
    return [];
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.map((item) => ({
      id: String(item.id || ""),
      name: String(item.name || ""),
      createdAt: Number(item.createdAt) || Date.now(),
      words: Array.isArray(item.words) ? item.words : [],
    }));
  } catch {
    return [];
  }
}

function saveCustomLists(lists: CustomList[]): void {
  if (!isLocalStorageAvailable()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch {
    // Gracefully handle storage errors (e.g. quota exceeded)
  }
}

export function createCustomList(name: string): CustomList {
  const lists = getCustomLists();
  const trimmedName = name?.trim() || "Danh sách mới";
  const newList: CustomList = {
    id: `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: trimmedName,
    createdAt: Date.now(),
    words: [],
  };

  lists.push(newList);
  saveCustomLists(lists);
  return newList;
}

export function deleteCustomList(id: string): void {
  const lists = getCustomLists().filter((list) => list.id !== id);
  saveCustomLists(lists);
}

export function addWordToList(
  listId: string,
  word: CustomWord
): { success: boolean; alreadyExists?: boolean } {
  const lists = getCustomLists();
  const targetList = lists.find((list) => list.id === listId);

  if (!targetList) {
    return { success: false };
  }

  const targetWordLower = word.w.trim().toLowerCase();
  const exists = targetList.words.some(
    (item) => item.w.trim().toLowerCase() === targetWordLower
  );

  if (exists) {
    return { success: false, alreadyExists: true };
  }

  targetList.words.push({
    w: word.w,
    lvl: word.lvl || "",
    pos: word.pos || "",
    ipa: word.ipa || "",
    def: word.def || "",
    vi: word.vi || "",
    ex: word.ex || "",
  });

  saveCustomLists(lists);
  return { success: true };
}

export function removeWordFromList(listId: string, wordStr: string): void {
  const lists = getCustomLists();
  const targetList = lists.find((list) => list.id === listId);

  if (!targetList) {
    return;
  }

  const targetWordLower = wordStr.trim().toLowerCase();
  targetList.words = targetList.words.filter(
    (item) => item.w.trim().toLowerCase() !== targetWordLower
  );

  saveCustomLists(lists);
}

export function migrateLegacyReview(
  reviewObj: Record<string, number>,
  allWords: CustomWord[]
): void {
  if (!reviewObj || typeof reviewObj !== "object") {
    return;
  }

  const reviewEntries = Object.entries(reviewObj).filter(
    ([, count]) => count > 0
  );
  if (reviewEntries.length === 0) {
    return;
  }

  const lists = getCustomLists();
  let reviewList = lists.find(
    (list) => list.name === DEFAULT_REVIEW_LIST_NAME
  );

  if (!reviewList) {
    reviewList = {
      id: `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: DEFAULT_REVIEW_LIST_NAME,
      createdAt: Date.now(),
      words: [],
    };
    lists.push(reviewList);
  }

  // Build a lookup map of allWords by lowercase w for fast lookup
  const wordsLookup = new Map<string, CustomWord>();
  if (Array.isArray(allWords)) {
    for (const w of allWords) {
      if (w && w.w) {
        wordsLookup.set(w.w.trim().toLowerCase(), w);
      }
    }
  }

  let modified = false;
  for (const [rawKey] of reviewEntries) {
    const key = rawKey.trim();
    const keyLower = key.toLowerCase();
    const alreadyExists = reviewList.words.some(
      (w) => w.w.trim().toLowerCase() === keyLower
    );

    if (!alreadyExists) {
      const matched = wordsLookup.get(keyLower);
      if (matched) {
        reviewList.words.push({
          w: matched.w,
          lvl: matched.lvl || "",
          pos: matched.pos || "",
          ipa: matched.ipa || "",
          def: matched.def || "",
          vi: matched.vi || "",
          ex: matched.ex || "",
        });
      } else {
        reviewList.words.push({
          w: key,
          lvl: "",
          pos: "",
          ipa: "",
          def: "",
          vi: "",
          ex: "",
        });
      }
      modified = true;
    }
  }

  if (modified || !lists.some((l) => l.id === reviewList?.id)) {
    saveCustomLists(lists);
  }
}
