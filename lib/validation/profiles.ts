import { z } from "zod";

const baseProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  themes: z.string().optional().default(""),
  books_we_like: z.string().optional().default(""),
  character_traits: z.string().optional().default(""),
});

export const kidProfileSchema = baseProfileSchema.extend({
  age: z
    .string()
    .trim()
    .optional()
    .transform((value) => {
      if (!value) return null;
      const n = Number(value);
      if (!Number.isFinite(n) || n < 0 || n > 18) {
        throw new Error("Age must be a number between 0 and 18");
      }
      return Math.trunc(n);
    }),
  avatar_url: z.string().trim().url("Avatar URL must be valid").optional().or(z.literal("")),
});

export const adultProfileSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80, "Name is too long"),
  persona_label: z.string().trim().max(80, "Role label is too long").optional().default(""),
  avatar_url: z.string().trim().url("Avatar URL must be valid").optional().or(z.literal("")),
});

export const inviteCreateSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  role: z.enum(["parent", "grandparent", "kid"]),
});

export function parseCsvList(input: string): string[] {
  return [...new Set(input.split(",").map((s) => s.trim()).filter(Boolean))];
}
