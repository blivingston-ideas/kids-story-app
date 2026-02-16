import test from "node:test";
import assert from "node:assert/strict";
import { outlineSchema } from "@/lib/storygen/schemas";

test("outline schema validates a correct outline payload", () => {
  const outline = {
    title: "The Lantern Path",
    target_audience_age: "ages 4-7",
    tone: "calm bedtime",
    characters: [
      { name: "Milo", traits: ["curious", "kind"], relationship: "brother" },
      { name: "Nana June", traits: ["wise", "playful"], relationship: "grandmother" },
    ],
    setting: "Story Universe Forest",
    scenes: Array.from({ length: 6 }).map((_, i) => ({
      scene_id: `scene_${i + 1}`,
      scene_goal: "Move toward the mystery",
      new_event: "A clue appears",
      new_detail: "The trees smell like cinnamon",
      conflict_turn: "The trail forks",
      mini_payoff: "They choose together",
    })),
    ending_payoff: "They bring the lantern home and feel safe.",
    theme: "Kind teamwork helps everyone rest well.",
  };

  const parsed = outlineSchema.safeParse(outline);
  assert.equal(parsed.success, true);
});
