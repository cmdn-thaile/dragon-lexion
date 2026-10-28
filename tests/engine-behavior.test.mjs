import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("resolve does not auto-add wrong answers to review pool", () => {
  const code = fs.readFileSync("lib/game/engine.js", "utf-8");
  
  assert.ok(
    !code.includes('P.review[S.q.w] = Math.min(3, (P.review[S.q.w] || 0) + 1);'),
    "Auto-adding wrong answers to P.review must be removed"
  );
  assert.ok(code.includes('custom_'), "buildStage must support custom stages");
});

test("engine imports and integrates custom-lists modules", () => {
  const code = fs.readFileSync("lib/game/engine.js", "utf-8");

  assert.ok(
    code.includes("getCustomLists") &&
    code.includes("addWordToList") &&
    code.includes("createCustomList") &&
    code.includes("migrateLegacyReview"),
    "engine.js must import custom-lists functions"
  );
  assert.ok(
    code.includes("migrateLegacyReview("),
    "engine.js must call migrateLegacyReview on startup"
  );
});

test("engine supports 5 hub tabs (easy, med, hard, spec, custom)", () => {
  const code = fs.readFileSync("lib/game/engine.js", "utf-8");

  assert.ok(
    code.includes("currentHubTab") || code.includes("hubTab"),
    "engine.js must track active hub tab"
  );
  assert.ok(
    code.includes("easy") && code.includes("med") && code.includes("hard") && code.includes("spec") && code.includes("custom"),
    "engine.js must support the 5 category tabs"
  );
});

test("engine wires save word button and custom list modal", () => {
  const code = fs.readFileSync("lib/game/engine.js", "utf-8");

  assert.ok(code.includes("saveWordBtn"), "engine.js must wire #saveWordBtn");
  assert.ok(code.includes("saveOv"), "engine.js must manage #saveOv overlay");
  assert.ok(code.includes("customListOv"), "engine.js must manage #customListOv overlay");
  assert.ok(code.includes("pixelToast"), "engine.js must show toast notifications");
  assert.ok(code.includes("removeWordFromList"), "engine.js must support removing word from custom list");
  assert.ok(code.includes("deleteCustomList"), "engine.js must support deleting custom list");
});

test("custom stages are unranked and scale HP properly", () => {
  const code = fs.readFileSync("lib/game/engine.js", "utf-8");

  assert.ok(
    code.includes('!S.stage.id.startsWith("custom_")'),
    "Custom stages must be excluded from server leaderboard ranking and progress cleared list"
  );
  assert.ok(
    code.includes("Math.max(150, Math.min(450, words.length * 35))"),
    "Boss HP must scale with word count between 150 and 450"
  );
});

test("globals.css defines toastIn keyframes", () => {
  const css = fs.readFileSync("app/globals.css", "utf-8");
  assert.ok(css.includes("@keyframes toastIn"), "globals.css must define @keyframes toastIn");
});

