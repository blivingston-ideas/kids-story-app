import test from "node:test";
import assert from "node:assert/strict";
import { detectRepetition } from "@/lib/storygen/generator";

test("repetition detector flags repetitive trigrams and paragraphs", () => {
  const repetitive = [
    "Milo ran through the woods and then he ran through the woods again.",
    "Milo ran through the woods and then he ran through the woods again.",
    "Milo ran through the woods and then he ran through the woods again.",
  ].join("\n\n");

  const report = detectRepetition(repetitive);
  assert.equal(report.hasProblem, true);
  assert.ok(report.trigramRepeatRatio > 0);
  assert.ok(report.repeatedParagraphCount > 0);
});

test("repetition detector allows varied prose", () => {
  const varied = [
    "At dusk, the window glowed like honey and Milo noticed a folded map.",
    "Nana June touched the paper and laughed softly, \"This looks like a moonlight puzzle.\"",
    "They followed the silver path past sleepy flowers and listened for the gentle river.",
  ].join("\n\n");

  const report = detectRepetition(varied);
  assert.equal(report.hasProblem, false);
});
