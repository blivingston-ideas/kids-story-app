import test from "node:test";
import assert from "node:assert/strict";
import { detectRepetition } from "@/lib/storygen/generator";

const shouldRun = process.env.RUN_STORYGEN_GOLDEN === "1";

const golden = shouldRun ? test : test.skip;

golden("golden sample stays under trigram repetition threshold", () => {
  const sample = [
    "Moonlight spilled across the floor as Milo opened the tiny brass compass and heard it hum.",
    "Nana June smiled and whispered, \"Let the gentle clues guide us, one step at a time.\"",
    "Outside, the garden smelled like warm mint, and each lantern flicker pointed toward a new surprise.",
    "They crossed a wooden bridge, solved a riddle about kindness, and tucked the answer in their pockets.",
    "By the time the stars softened, they found the last clue and carried it home in grateful silence.",
    "Under blankets, they retold the adventure and drifted to sleep with calm hearts and bright dreams.",
  ].join("\n\n");

  const report = detectRepetition(sample);
  assert.ok(report.trigramRepeatRatio <= 0.02);
  assert.equal(report.repeatedParagraphCount, 0);
});
