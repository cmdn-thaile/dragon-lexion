import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeScore } from "../lib/score.ts";

const metaPath = path.resolve(process.cwd(), "data/stages.meta.json");
const wordsPath = path.resolve(process.cwd(), "public/data/words.json");

const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
const words = JSON.parse(fs.readFileSync(wordsPath, "utf-8"));

// Implementation matching lib/stages.ts: isRankedStage(id)
const isRankedStage = (id) => typeof id === "string" && id in meta;

test("Leaderboard stage compatibility: all 51 Cambridge stages and 2 bank stages are ranked and valid", () => {
  const stageIds = Object.keys(meta);
  assert.equal(stageIds.length, 53, `Expected 53 stages in meta (51 Cambridge + 2 bank), found ${stageIds.length}`);

  // Count by tier
  const easyStages = stageIds.filter(id => id.startsWith("easy_"));
  const medStages = stageIds.filter(id => id.startsWith("med_"));
  const hardStages = stageIds.filter(id => id.startsWith("hard_"));
  const specStages = stageIds.filter(id => id.startsWith("spec_"));
  const bankStages = stageIds.filter(id => id.startsWith("bank"));

  assert.equal(easyStages.length, 18, "Easy tier must have 18 stages");
  assert.equal(medStages.length, 18, "Medium tier must have 18 stages");
  assert.equal(hardStages.length, 8, "Hard tier must have 8 stages");
  assert.equal(specStages.length, 7, "Special tier must have 7 stages");
  assert.equal(bankStages.length, 2, "Bank tier must have 2 stages");

  for (const id of stageIds) {
    assert.equal(isRankedStage(id), true, `Stage ${id} should be recognized as a ranked stage`);
    const s = meta[id];
    assert.ok(typeof s.vi === "string" && s.vi.length > 0, `Stage ${id} must have a Vietnamese title`);
    assert.ok(typeof s.hp === "number" && s.hp > 0, `Stage ${id} must have positive HP`);

    if (id.startsWith("easy_")) assert.equal(s.hp, 250);
    if (id.startsWith("med_")) assert.equal(s.hp, 340);
    if (id.startsWith("hard_")) assert.equal(s.hp, 420);
    if (id.startsWith("spec_")) assert.equal(s.hp, 450);
  }
});

test("Leaderboard stage compatibility: unranked and custom stages are rejected by isRankedStage", () => {
  assert.equal(isRankedStage("review"), false, "Review stage must not be ranked");
  assert.equal(isRankedStage("custom_my_list"), false, "Custom stage must not be ranked");
  assert.equal(isRankedStage("custom_123"), false, "Custom stage id must not be ranked");
  assert.equal(isRankedStage("non_existent_stage"), false, "Non-existent stage must not be ranked");
  assert.equal(isRankedStage(null), false, "null must not be ranked");
  assert.equal(isRankedStage(undefined), false, "undefined must not be ranked");
  assert.equal(isRankedStage(123), false, "number must not be ranked");
  assert.equal(isRankedStage({}), false, "object must not be ranked");
});

test("Leaderboard stage compatibility: public/data/words.json matches stages.meta.json", () => {
  assert.equal(words.stages.length, 51, `Expected 51 stages in words.json, got ${words.stages.length}`);

  const metaKeys = new Set(Object.keys(meta));
  for (const stage of words.stages) {
    assert.ok(metaKeys.has(stage.id), `words.json stage ${stage.id} must exist in stages.meta.json`);
    assert.equal(meta[stage.id].vi, stage.vi, `Vietnamese title mismatch for stage ${stage.id}`);
    assert.equal(meta[stage.id].hp, stage.hp, `HP mismatch for stage ${stage.id}`);
  }
});

test("Scoring compatibility: computeScore calculates valid scores for Cambridge stages", () => {
  // Test win on easy stage (250 HP)
  const easyScore = computeScore({
    won: true,
    correct: 12,
    answered: 12,
    bestStreak: 12,
    dealt: 250,
  });
  // dealt (250) + winBonus (1000 + 300 - 120 = 1180) + acc*5 (100*5 = 500) + streak*25 (12*25 = 300) = 2230
  assert.equal(easyScore, 2230);

  // Test loss on spec stage (450 HP)
  const lossScore = computeScore({
    won: false,
    correct: 5,
    answered: 10,
    bestStreak: 3,
    dealt: 120,
  });
  // dealt (120) + winBonus (0) + acc*5 (50*5 = 250) + streak*25 (3*25 = 75) = 445
  assert.equal(lossScore, 445);
});
