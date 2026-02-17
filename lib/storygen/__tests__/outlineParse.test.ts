import test from "node:test";
import assert from "node:assert/strict";
import { parseOutlineStrict } from "@/lib/storygen/generator";

test("parseOutlineStrict repairs broken outline JSON", async () => {
  const broken = `{
    title: "The Night Compass",
    "target_audience_age": "ages 4-7",
    "tone": "calm bedtime",
    "characters": [
      { "name": "Milo", "traits": ["curious", "kind"], "relationship": "brother", }
    ],
    "setting": "Moonlight Meadow",
    "scenes": [
      { "scene_id": "s1", "scene_goal": "find clue", "new_event": "a map appears", "new_detail": "it smells like pine", "conflict_turn": "the wind snatches a corner", "mini_payoff": "they hold it together" },
      { "scene_id": "s2", "scene_goal": "cross bridge", "new_event": "a lantern lights itself", "new_detail": "water sounds soft", "conflict_turn": "bridge creaks", "mini_payoff": "they cross safely" },
      { "scene_id": "s3", "scene_goal": "ask for help", "new_event": "an owl gives directions", "new_detail": "feathers glow silver", "conflict_turn": "path splits", "mini_payoff": "they choose the north trail" },
      { "scene_id": "s4", "scene_goal": "solve riddle", "new_event": "stones whisper clues", "new_detail": "air feels warm", "conflict_turn": "answer seems wrong", "mini_payoff": "Nana spots the pattern" },
      { "scene_id": "s5", "scene_goal": "find final key", "new_event": "key appears under moss", "new_detail": "moss is velvet-soft", "conflict_turn": "it slips away", "mini_payoff": "Milo catches it" },
      { "scene_id": "s6", "scene_goal": "return home", "new_event": "door opens at dawn", "new_detail": "kitchen smells like toast", "conflict_turn": "they fear they are late", "mini_payoff": "everyone is waiting with smiles" }
    ],
    "ending_payoff": "The family laughs and settles into calm sleep.",
    "theme": "Kind teamwork brings gentle courage."
  }`;

  const repaired = JSON.stringify({
    title: "The Night Compass",
    target_audience_age: "ages 4-7",
    tone: "calm bedtime",
    characters: [{ name: "Milo", traits: ["curious", "kind"], relationship: "brother" }],
    setting: "Moonlight Meadow",
    scenes: [
      { scene_id: "s1", scene_goal: "find clue", new_event: "a map appears", new_detail: "it smells like pine", conflict_turn: "the wind snatches a corner", mini_payoff: "they hold it together" },
      { scene_id: "s2", scene_goal: "cross bridge", new_event: "a lantern lights itself", new_detail: "water sounds soft", conflict_turn: "bridge creaks", mini_payoff: "they cross safely" },
      { scene_id: "s3", scene_goal: "ask for help", new_event: "an owl gives directions", new_detail: "feathers glow silver", conflict_turn: "path splits", mini_payoff: "they choose the north trail" },
      { scene_id: "s4", scene_goal: "solve riddle", new_event: "stones whisper clues", new_detail: "air feels warm", conflict_turn: "answer seems wrong", mini_payoff: "Nana spots the pattern" },
      { scene_id: "s5", scene_goal: "find final key", new_event: "key appears under moss", new_detail: "moss is velvet-soft", conflict_turn: "it slips away", mini_payoff: "Milo catches it" },
      { scene_id: "s6", scene_goal: "return home", new_event: "door opens at dawn", new_detail: "kitchen smells like toast", conflict_turn: "they fear they are late", mini_payoff: "everyone is waiting with smiles" },
    ],
    ending_payoff: "The family laughs and settles into calm sleep.",
    theme: "Kind teamwork brings gentle courage.",
  });

  const result = await parseOutlineStrict(broken, {
    repairFn: async () => repaired,
  });

  assert.equal(result.outline.title, "The Night Compass");
  assert.equal(result.outline.scenes.length, 6);
  assert.equal(result.warnings.length, 0);
});

test("parseOutlineStrict repairs schema-invalid outline with empty conflict_turn", async () => {
  const schemaInvalid = JSON.stringify({
    title: "Lanterns at Willow Hill",
    target_audience_age: "ages 4-7",
    tone: "calm bedtime",
    characters: [{ name: "Ari", traits: ["gentle", "curious"], relationship: "sister" }],
    setting: "Willow Hill",
    scenes: [
      {
        scene_id: "s1",
        scene_goal: "start the evening walk",
        new_event: "they discover a tiny glowing map",
        new_detail: "the grass is cool and dewy",
        conflict_turn: "",
        mini_payoff: "they decide to follow one clue at a time",
      },
      {
        scene_id: "s2",
        scene_goal: "cross the bridge",
        new_event: "a lantern flickers on by itself",
        new_detail: "the stream sounds like soft bells",
        conflict_turn: "the bridge sways a little in the wind",
        mini_payoff: "they cross slowly and safely",
      },
      {
        scene_id: "s3",
        scene_goal: "pick the right path",
        new_event: "fireflies gather near one trail",
        new_detail: "the air smells like pine",
        conflict_turn: "two paths look almost the same",
        mini_payoff: "they notice a star-shaped stone marker",
      },
      {
        scene_id: "s4",
        scene_goal: "solve a clue",
        new_event: "an old sign reveals a rhyme",
        new_detail: "the sign is warm from the day sun",
        conflict_turn: "they mix up one word at first",
        mini_payoff: "they decode the rhyme together",
      },
      {
        scene_id: "s5",
        scene_goal: "find the final lantern",
        new_event: "a hidden lantern appears beneath ivy",
        new_detail: "the ivy feels soft as velvet",
        conflict_turn: "the lantern is tucked just out of reach",
        mini_payoff: "Ari climbs a low stump and gently lifts it down",
      },
      {
        scene_id: "s6",
        scene_goal: "return home",
        new_event: "the porch lights glow as they arrive",
        new_detail: "hot cocoa smells sweet and warm",
        conflict_turn: "they worry it might be too late",
        mini_payoff: "their family is waiting with smiles and blankets",
      },
    ],
    ending_payoff: "They share cocoa and stories, then settle into sleep.",
    theme: "Small teamwork makes big adventures feel safe.",
  });

  const repaired = JSON.stringify({
    title: "Lanterns at Willow Hill",
    target_audience_age: "ages 4-7",
    tone: "calm bedtime",
    characters: [{ name: "Ari", traits: ["gentle", "curious"], relationship: "sister" }],
    setting: "Willow Hill",
    scenes: [
      {
        scene_id: "s1",
        scene_goal: "start the evening walk",
        new_event: "they discover a tiny glowing map",
        new_detail: "the grass is cool and dewy",
        conflict_turn: "A small challenge arises when the map's first mark is hard to read in the dusk.",
        mini_payoff: "they decide to follow one clue at a time",
      },
      {
        scene_id: "s2",
        scene_goal: "cross the bridge",
        new_event: "a lantern flickers on by itself",
        new_detail: "the stream sounds like soft bells",
        conflict_turn: "the bridge sways a little in the wind",
        mini_payoff: "they cross slowly and safely",
      },
      {
        scene_id: "s3",
        scene_goal: "pick the right path",
        new_event: "fireflies gather near one trail",
        new_detail: "the air smells like pine",
        conflict_turn: "two paths look almost the same",
        mini_payoff: "they notice a star-shaped stone marker",
      },
      {
        scene_id: "s4",
        scene_goal: "solve a clue",
        new_event: "an old sign reveals a rhyme",
        new_detail: "the sign is warm from the day sun",
        conflict_turn: "they mix up one word at first",
        mini_payoff: "they decode the rhyme together",
      },
      {
        scene_id: "s5",
        scene_goal: "find the final lantern",
        new_event: "a hidden lantern appears beneath ivy",
        new_detail: "the ivy feels soft as velvet",
        conflict_turn: "the lantern is tucked just out of reach",
        mini_payoff: "Ari climbs a low stump and gently lifts it down",
      },
      {
        scene_id: "s6",
        scene_goal: "return home",
        new_event: "the porch lights glow as they arrive",
        new_detail: "hot cocoa smells sweet and warm",
        conflict_turn: "they worry it might be too late",
        mini_payoff: "their family is waiting with smiles and blankets",
      },
    ],
    ending_payoff: "They share cocoa and stories, then settle into sleep.",
    theme: "Small teamwork makes big adventures feel safe.",
  });

  const result = await parseOutlineStrict(schemaInvalid, {
    repairFn: async () => repaired,
  });

  assert.equal(result.outline.scenes[0]?.conflict_turn.length > 0, true);
  assert.equal(result.warnings.length, 0);
});
