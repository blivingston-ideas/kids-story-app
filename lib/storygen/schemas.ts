import { z } from "zod";

export const outlineCharacterSchema = z.object({
  name: z.string().trim().min(1),
  traits: z.array(z.string().trim().min(1)).min(1),
  relationship: z.string().trim().min(1),
});

export const outlineSceneSchema = z.object({
  scene_id: z.string().trim().min(1),
  scene_goal: z.string().trim().min(1),
  new_event: z.string().trim().min(1),
  new_detail: z.string().trim().min(1),
  conflict_turn: z.string().trim().min(1),
  mini_payoff: z.string().trim().min(1),
});

export const outlineSchema = z.object({
  title: z.string().trim().min(1).max(180),
  target_audience_age: z.string().trim().min(1),
  tone: z.enum(["calm bedtime", "silly", "adventurous"]),
  characters: z.array(outlineCharacterSchema).min(1),
  setting: z.string().trim().min(1),
  scenes: z.array(outlineSceneSchema).min(6).max(12),
  ending_payoff: z.string().trim().min(1),
  theme: z.string().trim().min(1),
});

export const generateStoryInputSchema = z.object({
  universeId: z.string().uuid(),
  kidProfileIds: z.array(z.string().uuid()).default([]),
  adultProfileIds: z.array(z.string().uuid()).default([]),
  audienceAge: z.number().int().min(1).max(17),
  tone: z.enum(["calm", "silly", "adventurous"]),
  lengthMinutes: z.number().int().min(1).max(30),
  surpriseVsGuided: z.enum(["surprise", "guided"]),
  optionalPrompt: z.string().trim().max(2000).optional().default(""),
});

export type Outline = z.infer<typeof outlineSchema>;
export type GenerateStoryInput = z.infer<typeof generateStoryInputSchema>;
