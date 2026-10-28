import test from "node:test";
import assert from "node:assert/strict";

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

  // Verify all tiers exist with correct stats
  const tiers = new Set(result.stages.map(s => s.tier));
  assert.ok(tiers.has("easy"));
  assert.ok(tiers.has("med"));
  assert.ok(tiers.has("hard"));
  assert.ok(tiers.has("spec"));

  for (const s of result.stages) {
    assert.ok(s.id, "Stage must have an id");
    assert.ok(s.vi, "Stage must have Vietnamese title");
    assert.ok(s.en, "Stage must have English subtitle");
    assert.ok(s.dragon.name, "Stage dragon must have name");
    assert.ok(Array.isArray(s.dragon.breath) && s.dragon.breath.length === 3, "Dragon breath must have 3 colors");
    assert.ok(s.raw.length >= 4, `Stage ${s.id} must have at least 4 words`);
    assert.equal(result.meta[s.id].vi, s.vi);
    assert.equal(result.meta[s.id].hp, s.hp);

    if (s.tier === "easy") {
      assert.equal(s.hp, 250);
      assert.equal(s.atk, 12);
    } else if (s.tier === "med") {
      assert.equal(s.hp, 340);
      assert.equal(s.atk, 15);
    } else if (s.tier === "hard") {
      assert.equal(s.hp, 420);
      assert.equal(s.atk, 18);
    } else if (s.tier === "spec") {
      assert.equal(s.hp, 450);
      assert.equal(s.atk, 20);
    }
  }

  // Verify bank
  assert.ok(Array.isArray(result.bank), "Bank must be an array");
  assert.ok(result.bank.length > 500, `Bank should have substantial vocabulary, got ${result.bank.length}`);
  assert.equal(result.bank[0].length, 7, "Bank entries must have 7 fields");
});
