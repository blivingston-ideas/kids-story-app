import { z } from "zod";

const nullableEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.enum(values).nullable().optional().default(null);

const nullableBool = z.boolean().nullable().optional().default(null);

export const profileAppearanceSchema = z.object({
  ageApprox: z.number().int().min(0).max(120).nullable().optional().default(null),
  genderPresentation: z
    .preprocess((value) => (value === "neutral" ? null : value), z.enum(["boy", "girl"]).nullable().optional())
    .default(null),

  skinTone: nullableEnum([
    "very_fair",
    "fair",
    "light",
    "light_medium",
    "medium",
    "medium_dark",
    "dark",
    "very_dark",
  ]),
  freckles: nullableBool,

  eyeColor: nullableEnum(["brown", "hazel", "green", "blue", "grey"]),

  hairColor: nullableEnum([
    "black",
    "dark_brown",
    "brown",
    "light_brown",
    "blonde",
    "red",
    "strawberry_blonde",
    "grey",
  ]),
  hairLength: nullableEnum(["buzz", "short", "medium", "long"]),
  hairTexture: nullableEnum(["straight", "wavy", "curly", "coily"]),
  hairStyle: z.string().trim().max(120).nullable().optional().default(null),

  distinctiveFeatures: z.array(z.string().trim().min(1).max(80)).nullable().optional().default(null),
  glasses: nullableBool,

  mustKeep: z.array(z.string().trim().min(1).max(140)).optional().default([]),
  mustNot: z.array(z.string().trim().min(1).max(140)).optional().default([]),
});

export type ProfileAppearance = z.infer<typeof profileAppearanceSchema>;

export function normalizeProfileAppearance(input: unknown): ProfileAppearance {
  return profileAppearanceSchema.parse(input ?? {});
}

export function parseCsvToStringArray(input: string): string[] {
  return input
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
