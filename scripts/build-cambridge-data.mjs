import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const DRAGON_TEMPLATES = [
  {
    name: "Hỏa long Ignis",
    body: "#b3322a", dark: "#7d1f1a", belly: "#f0c27a", wing: "#8a2219", wingBack: "#5e150f",
    horn: "#f2c14e", eye: "#ffe14d", accent: "#f2c14e", horns: "swept", feat: null,
    breath: ["#fff6b0", "#ffb02e", "#ff4d1a"]
  },
  {
    name: "Hải long Azure",
    body: "#2f6f9f", dark: "#1d4a6e", belly: "#cfe7f5", wing: "#275a85", wingBack: "#173a57",
    horn: "#e9f2ff", eye: "#b8f3ff", accent: "#f2d34e", horns: "crown", feat: "frill",
    breath: ["#b8f3ff", "#5eb8ff", "#1f62b3"]
  },
  {
    name: "Băng long Frost",
    body: "#8fbcd8", dark: "#5f8eb0", belly: "#eef7fc", wing: "#79a9c9", wingBack: "#4f7896",
    horn: "#ffffff", eye: "#2f63d6", accent: "#e6f6ff", horns: "antler", feat: "icicles",
    breath: ["#ffffff", "#b8f3ff", "#5eb8ff"]
  },
  {
    name: "Kim long Aureus",
    body: "#c99a2e", dark: "#8e6a17", belly: "#f7e3a6", wing: "#a97c1c", wingBack: "#77560f",
    horn: "#fff3c4", eye: "#e33b2c", accent: "#fff3c4", horns: "ram", feat: "gems",
    breath: ["#fff6b0", "#ffd34d", "#f2a01e"]
  },
  {
    name: "Ám long Umbra",
    body: "#4b2f6e", dark: "#2f1c48", belly: "#9b86c4", wing: "#3a2357", wingBack: "#24153a",
    horn: "#c9b6ff", eye: "#7dffd0", accent: "#c9b6ff", horns: "swept", feat: "whiskers",
    breath: ["#e9d8ff", "#b388ff", "#7c4dff"]
  },
  {
    name: "Bích long Jade",
    body: "#2d6a4f", dark: "#1b4332", belly: "#95d5b2", wing: "#24553f", wingBack: "#153326",
    horn: "#d8f3dc", eye: "#ffb703", accent: "#74c69d", horns: "ram", feat: null,
    breath: ["#e8f5e9", "#81c784", "#388e3c"]
  },
  {
    name: "Lôi long Volt",
    body: "#6b52a1", dark: "#433266", belly: "#ffeaa7", wing: "#573d8a", wingBack: "#342354",
    horn: "#f9ca24", eye: "#ffeaa7", accent: "#f9ca24", horns: "crown", feat: "gems",
    breath: ["#ffffff", "#f9ca24", "#6c5ce7"]
  },
  {
    name: "Cổ long Dread",
    body: "#2c2b35", dark: "#17161c", belly: "#b33a2e", wing: "#3a1218", wingBack: "#22090d",
    horn: "#e6b84a", eye: "#ff5a3a", accent: "#e6b84a", horns: "crown", feat: "elder",
    breath: ["#fff6b0", "#ff5a3a", "#b3150f"]
  }
];

const TIER_CONFIGS = [
  {
    tier: "easy",
    lvl: "A1–A2",
    hp: 250,
    atk: 12,
    tint: "rgba(80,200,120,.12)",
    elder: false,
    file: "cambridge_vocab_A1_A2.json",
    idPrefix: "easy"
  },
  {
    tier: "med",
    lvl: "B1–B2",
    hp: 340,
    atk: 15,
    tint: "rgba(90,160,255,.12)",
    elder: false,
    file: "cambridge_vocab_B1_B2.json",
    idPrefix: "med"
  },
  {
    tier: "hard",
    lvl: "C1–C2",
    hp: 420,
    atk: 18,
    tint: "rgba(180,100,240,.12)",
    elder: false,
    file: "cambridge_vocab_C1_C2.json",
    idPrefix: "hard"
  },
  {
    tier: "spec",
    lvl: "Chuyên khoa",
    hp: 450,
    atk: 20,
    tint: "rgba(240,160,60,.12)",
    elder: true,
    file: "cambridge_vocab_Specialized_Technical.json",
    idPrefix: "spec"
  }
];

function normalizePos(pos) {
  if (!pos) return "";
  const p = pos.trim();
  if (p.includes("Danh từ") || p.toLowerCase().includes("noun")) return "noun";
  if (p.includes("Động từ") || p.toLowerCase().includes("verb")) return "verb";
  if (p.includes("Tính từ") || p.toLowerCase().includes("adjective")) return "adj";
  if (p.includes("Thành ngữ") || p.toLowerCase().includes("idiom") || p.toLowerCase().includes("phrase")) return "phrase";
  if (p.includes("Thuật ngữ") || p.toLowerCase().includes("term")) return "term";
  if (p.includes("Từ vựng") || p.toLowerCase().includes("vocabulary")) return "vocab";
  return p;
}

function normalizeLevel(level, tier) {
  if (tier === "spec") return "Spec";
  if (level) {
    const l = level.trim();
    if (["A1", "A2", "B1", "B2", "C1", "C2"].includes(l)) return l;
    if (l.includes("Specialized") || l.includes("Chuyên ngành")) return "Spec";
  }
  return tier === "easy" ? "A1" : tier === "med" ? "B1" : tier === "hard" ? "C1" : "Spec";
}

function scoreEntry(e) {
  let s = 0;
  if (e.ipa && e.ipa.trim()) s += 2;
  if (e.examples && e.examples.length > 0 && e.examples[0].en) s += 2;
  if (e.definition_en && e.definition_en.trim()) s += 1;
  if (e.meaning_vi && e.meaning_vi.trim()) s += 1;
  return s;
}

function parseGroupTitle(rawTitle) {
  const match = rawTitle.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (match) {
    return {
      vi: match[1].trim(),
      en: match[2].trim()
    };
  }
  return {
    vi: rawTitle.trim(),
    en: rawTitle.trim()
  };
}

function formatWordEntry(e, tier) {
  const word = (e.word || e.raw_word || "").trim();
  const lvl = normalizeLevel(e.level, tier);
  const pos = normalizePos(e.pos);
  const ipa = e.ipa ? e.ipa.trim() : "";
  const def = (e.definition_en || "").trim();
  const vi = (e.meaning_vi || e.translation || "").trim();
  const ex = (e.examples && e.examples.length > 0 && e.examples[0].en) ? e.examples[0].en.trim() : "";
  return [word, lvl, pos, ipa, def, vi, ex];
}

export function generateDatasets(options = {}) {
  const { testMode = false, write = false } = options;
  const stages = [];
  const meta = {};
  let globalStageIndex = 0;

  for (const cfg of TIER_CONFIGS) {
    const filePath = path.join(ROOT_DIR, "Cambridge", cfg.file);
    const content = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(content);
    const entries = json.all_entries || [];

    // Group entries by topic / domain preserving discovery order
    const groupsMap = new Map();
    for (const entry of entries) {
      const groupName = (entry.topic || entry.domain || "").trim();
      if (!groupName) continue;
      if (!groupsMap.has(groupName)) {
        groupsMap.set(groupName, []);
      }
      groupsMap.get(groupName).push(entry);
    }

    let tierStageIndex = 1;
    for (const [groupName, groupEntries] of groupsMap.entries()) {
      const stageId = `${cfg.idPrefix}_${tierStageIndex}`;
      const titles = parseGroupTitle(groupName);

      // Deduplicate words within this group
      const wordMap = new Map();
      for (const entry of groupEntries) {
        const wordKey = (entry.word || entry.raw_word || "").trim().toLowerCase();
        if (!wordKey) continue;
        if (!wordMap.has(wordKey)) {
          wordMap.set(wordKey, entry);
        } else {
          const existing = wordMap.get(wordKey);
          if (scoreEntry(entry) > scoreEntry(existing)) {
            wordMap.set(wordKey, entry);
          }
        }
      }

      const rawWords = Array.from(wordMap.values()).map(e => formatWordEntry(e, cfg.tier));
      const dragonTemplate = DRAGON_TEMPLATES[globalStageIndex % DRAGON_TEMPLATES.length];
      const dragon = {
        ...dragonTemplate,
        sprite: stageId
      };

      const stage = {
        id: stageId,
        vi: titles.vi,
        en: titles.en,
        lvl: cfg.lvl,
        hp: cfg.hp,
        atk: cfg.atk,
        tier: cfg.tier,
        tint: cfg.tint,
        elder: cfg.elder,
        dragon,
        raw: rawWords
      };

      stages.push(stage);
      meta[stageId] = {
        vi: titles.vi,
        hp: cfg.hp
      };

      tierStageIndex++;
      globalStageIndex++;
    }
  }

  // Build C1/C2 word bank from cambridge_vocab_C1_C2.json
  const c1c2Path = path.join(ROOT_DIR, "Cambridge", "cambridge_vocab_C1_C2.json");
  const c1c2Json = JSON.parse(fs.readFileSync(c1c2Path, "utf-8"));
  const bankMap = new Map();
  for (const entry of c1c2Json.all_entries || []) {
    const wordKey = (entry.word || entry.raw_word || "").trim().toLowerCase();
    if (!wordKey) continue;
    if (!bankMap.has(wordKey)) {
      bankMap.set(wordKey, entry);
    } else {
      const existing = bankMap.get(wordKey);
      if (scoreEntry(entry) > scoreEntry(existing)) {
        bankMap.set(wordKey, entry);
      }
    }
  }

  const bank = Array.from(bankMap.values())
    .map(e => formatWordEntry(e, "hard"))
    .sort((a, b) => a[0].localeCompare(b[0]));

  const result = { stages, meta, bank };

  if (write && !testMode) {
    const wordsJsonPath = path.join(ROOT_DIR, "public", "data", "words.json");
    const metaJsonPath = path.join(ROOT_DIR, "data", "stages.meta.json");

    fs.mkdirSync(path.dirname(wordsJsonPath), { recursive: true });
    fs.mkdirSync(path.dirname(metaJsonPath), { recursive: true });

    fs.writeFileSync(wordsJsonPath, JSON.stringify({ stages, bank }, null, 2), "utf-8");
    fs.writeFileSync(metaJsonPath, JSON.stringify(meta, null, 2), "utf-8");
    console.log(`Generated ${stages.length} stages and ${bank.length} bank words.`);
    console.log(`Wrote ${wordsJsonPath} and ${metaJsonPath}.`);
  }

  return result;
}

// CLI runner
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectExecution) {
  generateDatasets({ write: true });
}
