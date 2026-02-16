import { z } from "zod";

export const characterRefSchema = z.object({
  type: z.enum(["kid", "adult"]),
  id: z.string().uuid("Invalid character id"),
  label: z.string().trim().min(1).max(120),
});

export const wizardInputSchema = z
  .object({
    mode: z.enum(["surprise", "guided"]),
    guidedBeginning: z.string().trim().max(400).optional().default(""),
    guidedMiddle: z.string().trim().max(400).optional().default(""),
    guidedEnding: z.string().trim().max(400).optional().default(""),
    stage: z.string().trim().max(800).optional().default(""),
    audienceAge: z.string().trim().optional().default("6"),
    tone: z.enum(["calm", "silly", "adventurous"]),
    lengthChoice: z.enum(["5", "10", "20", "custom"]),
    customMinutes: z.string().trim().optional().default(""),
    selectedCharactersJson: z.string().trim().optional().default("[]"),
    customCharacterName: z.string().trim().max(80).optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (data.lengthChoice === "custom") {
      const minutes = Number(data.customMinutes);
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["customMinutes"],
          message: "Custom minutes must be between 1 and 60.",
        });
      }
    }

    const audienceAge = Number(data.audienceAge);
    if (!Number.isFinite(audienceAge) || audienceAge < 1 || audienceAge > 17) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["audienceAge"],
        message: "Audience age must be between 1 and 17.",
      });
    }
  });

export const generatedStorySchema = z.object({
  title: z.string().trim().min(1).max(160),
  content: z.string().trim().min(1),
});

export type WizardInput = z.infer<typeof wizardInputSchema>;
export type CharacterRef = z.infer<typeof characterRefSchema>;

export function parseLengthMinutes(input: WizardInput): number {
  const minutes = input.lengthChoice === "custom" ? Math.trunc(Number(input.customMinutes)) : Number(input.lengthChoice);
  return Math.max(1, Math.min(60, minutes));
}

export function parseCharacterRefs(rawJson: string): CharacterRef[] {
  let parsed: unknown = [];
  try {
    parsed = JSON.parse(rawJson || "[]");
  } catch {
    throw new Error("Invalid character selection payload.");
  }

  const result = z.array(characterRefSchema).safeParse(parsed);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid character selection.");
  }
  return result.data;
}
