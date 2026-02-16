import test from "node:test";
import assert from "node:assert/strict";
import { cleanupTrailingDuplicateEndingParagraphs } from "@/lib/storygen/generator";

test("cleanupTrailingDuplicateEndingParagraphs collapses repeated ending paragraph run", () => {
  const repeatedEnding = [
    "Milo and Nana followed the lantern path through the quiet garden.",
    "They solved each clue by listening, sharing, and being patient.",
    "At home, everyone curled under warm blankets and felt proud of their teamwork.",
    "At home, everyone curled under warm blankets and felt proud of their teamwork.",
    "At home, everyone curled under warm blankets and felt proud of their teamwork.",
  ].join("\n\n");

  const cleaned = cleanupTrailingDuplicateEndingParagraphs(repeatedEnding);
  const paragraphs = cleaned.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  assert.equal(paragraphs.length, 3);
  assert.equal(
    paragraphs[2],
    "At home, everyone curled under warm blankets and felt proud of their teamwork."
  );
});
