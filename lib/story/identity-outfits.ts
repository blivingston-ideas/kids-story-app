import { createHash } from "crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { callOpenAIWithCost } from "@/lib/openai/callWithCost";
import { getProfileVisualSpec } from "@/lib/profiles/getProfileVisualSpec";
import type { ProfileAppearance } from "@/lib/schemas/profileAppearance";

const profileKindSchema = z.enum(["kid", "adult"]);
export type ProfileKind = z.infer<typeof profileKindSchema>;

export const identityBibleSchema = z.object({
  hair: z.string().trim().min(1),
  eyes: z.string().trim().min(1),
  skin_tone: z.string().trim().min(1),
  face_features: z.string().trim().min(1),
  body_proportions: z.string().trim().min(1),
  must_keep: z.array(z.string().trim().min(1)).min(1),
  must_not: z.array(z.string().trim().min(1)).min(1),
});

export const outfitSchema = z.object({
  top: z.string().trim().min(1),
  bottom: z.string().trim().min(1),
  shoes: z.string().trim().min(1),
  accessories: z.array(z.string().trim().min(1)).default([]),
  palette: z.array(z.string().trim().min(1)).min(1),
});

type ProfileData = {
  universeId: string;
  displayName: string;
  profilePhotoUrl: string | null;
  profileAttributes: Record<string, unknown>;
  descriptor: string;
};

function toIdentityAttributeHints(appearance: ProfileAppearance): Record<string, unknown> {
  const hairBits = [appearance.hairColor, appearance.hairLength, appearance.hairTexture, appearance.hairStyle]
    .filter(Boolean)
    .map((value) => String(value).replaceAll("_", " "));
  const eyeBits = [appearance.eyeColor ? `${appearance.eyeColor} eyes` : "", "round eyes"]
    .filter(Boolean)
    .map(String);
  const faceBits = [
    "round face",
    appearance.freckles ? "freckles" : "",
    appearance.glasses ? "glasses" : "",
    ...(appearance.distinctiveFeatures ?? []),
  ]
    .filter(Boolean)
    .map((value) => String(value).replaceAll("_", " "));
  const bodyBits = [
    appearance.ageApprox ? `about ${appearance.ageApprox} years old` : "",
    appearance.genderPresentation ?? "",
  ]
    .filter(Boolean)
    .map((value) => String(value).replaceAll("_", " "));

  return {
    hair: hairBits.join(", "),
    eyes: eyeBits.join(", "),
    skin_tone: [appearance.skinTone]
      .filter(Boolean)
      .map((value) => String(value).replaceAll("_", " "))
      .join(", "),
    face_features: faceBits.join(", "),
    body_proportions: bodyBits.join(", "),
    must_keep: appearance.mustKeep,
    must_not: appearance.mustNot,
  };
}

function sortObject(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObject);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b)
    );
    return Object.fromEntries(entries.map(([k, v]) => [k, sortObject(v)]));
  }
  return value;
}

export function computeProfileSourceHash(profile: {
  profile_photo_url: string | null;
  profile_attributes_json: Record<string, unknown> | null;
}): string {
  const photo = profile.profile_photo_url ?? "";
  const attrs = JSON.stringify(sortObject(profile.profile_attributes_json ?? {}));
  return createHash("sha256").update(`${photo}|${attrs}`).digest("hex");
}

function parseJsonObject(raw: string): unknown {
  const cleaned = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "").trim();
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) throw new Error("No JSON object found.");
  return JSON.parse(cleaned.slice(first, last + 1)) as unknown;
}

async function loadProfile(profileId: string, profileKind: ProfileKind): Promise<ProfileData> {
  const supabase = createSupabaseAdminClient();
  const visual = await getProfileVisualSpec(profileId, profileKind);
  const visualHints = toIdentityAttributeHints(visual.appearance);
  if (profileKind === "kid") {
    const { data, error } = await supabase
      .from("profiles_kid")
      .select(
        "id, universe_id, display_name, age, themes, profile_photo_url, profile_attributes_json, avatar_url"
      )
      .eq("id", profileId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Kid profile not found.");
    return {
      universeId: data.universe_id,
      displayName: data.display_name,
      profilePhotoUrl: visual.photoPath ?? data.profile_photo_url ?? data.avatar_url ?? null,
      profileAttributes: {
        ...((data.profile_attributes_json as Record<string, unknown> | null) ?? {}),
        ...visualHints,
      },
      descriptor: [
        typeof data.age === "number" ? `age ${data.age}` : "",
        data.themes?.length ? `themes: ${data.themes.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    };
  }

  const { data, error } = await supabase
    .from("profiles_adult")
    .select("id, universe_id, display_name, persona_label, profile_photo_url, profile_attributes_json, avatar_url")
    .eq("id", profileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Adult profile not found.");
  return {
    universeId: data.universe_id,
    displayName: data.display_name,
    profilePhotoUrl: visual.photoPath ?? data.profile_photo_url ?? data.avatar_url ?? null,
    profileAttributes: {
      ...((data.profile_attributes_json as Record<string, unknown> | null) ?? {}),
      ...visualHints,
    },
    descriptor: data.persona_label ?? "supportive adult",
  };
}

function mergeExplicitIdentity(
  base: z.infer<typeof identityBibleSchema>,
  explicit: Record<string, unknown>
): z.infer<typeof identityBibleSchema> {
  const attrs = explicit as Record<string, unknown>;
  const mustKeepExtra = Array.isArray(attrs.must_keep)
    ? (attrs.must_keep as unknown[]).filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  const mustNotExtra = Array.isArray(attrs.must_not)
    ? (attrs.must_not as unknown[]).filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    : [];
  return {
    hair: typeof attrs.hair === "string" && attrs.hair.trim() ? attrs.hair : base.hair,
    eyes: typeof attrs.eyes === "string" && attrs.eyes.trim() ? attrs.eyes : base.eyes,
    skin_tone:
      typeof attrs.skin_tone === "string" && attrs.skin_tone.trim() ? attrs.skin_tone : base.skin_tone,
    face_features:
      typeof attrs.face_features === "string" && attrs.face_features.trim()
        ? attrs.face_features
        : base.face_features,
    body_proportions:
      typeof attrs.body_proportions === "string" && attrs.body_proportions.trim()
        ? attrs.body_proportions
        : base.body_proportions,
    must_keep: [...new Set([...base.must_keep, ...mustKeepExtra])],
    must_not: [...new Set([...base.must_not, ...mustNotExtra])],
  };
}

async function extractIdentityFromPhoto(
  photoUrl: string,
  displayName: string,
  tracking?: { storyId?: string | null; pageNumber?: number | null }
): Promise<z.infer<typeof identityBibleSchema>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const schemaHint = [
    "{",
    '  "hair": "string",',
    '  "eyes": "string",',
    '  "skin_tone": "string",',
    '  "face_features": "string",',
    '  "body_proportions": "string",',
    '  "must_keep": ["string"],',
    '  "must_not": ["string"]',
    "}",
  ].join("\n");

  const response = await callOpenAIWithCost({
    storyId: tracking?.storyId,
    pageNumber: tracking?.pageNumber,
    step: "identity_extract",
    model: "gpt-4.1-mini",
    createResponseFn: async () => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4.1-mini",
          temperature: 0.2,
          messages: [
            {
              role: "system",
              content:
                "You extract stable visual identity from a person photo for consistent illustration. Output JSON only.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: `Extract identity bible for ${displayName}.` },
                { type: "text", text: `Schema:\n${schemaHint}` },
                { type: "image_url", image_url: { url: photoUrl } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Identity extraction failed: ${res.status} ${txt}`);
      }
      return (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        id?: string;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
          prompt_tokens_details?: { cached_tokens?: number };
          completion_tokens_details?: { reasoning_tokens?: number };
        };
      };
    },
  });
  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Identity extraction returned empty response.");
  const parsed = identityBibleSchema.safeParse(parseJsonObject(raw));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
  }
  return parsed.data;
}

function fallbackIdentity(profile: ProfileData): z.infer<typeof identityBibleSchema> {
  return {
    hair: "natural hair, keep style consistent",
    eyes: "warm expressive eyes",
    skin_tone: "natural skin tone, keep consistent",
    face_features: profile.descriptor || "friendly face",
    body_proportions: "age-appropriate picture-book proportions",
    must_keep: [
      "hair color/style must remain consistent",
      "skin tone must remain consistent",
      "eye color must remain consistent",
      "face shape must remain consistent",
      "age/body proportions must remain consistent",
    ],
    must_not: ["do not change identity-defining features", "no dramatic age shift"],
  };
}

async function createNeutralIdentityPortrait(
  identityBibleId: string,
  universeId: string,
  profileKind: ProfileKind,
  profileId: string,
  identity: z.infer<typeof identityBibleSchema>,
  tracking?: { storyId?: string | null; pageNumber?: number | null }
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const prompt = [
    "children's picture book illustration, clean shapes, soft shading",
    "Toy Box Adventure palette: #FF9F1C, #2EC4B6, #FFBF69, #CBF3F0, #293241",
    "neutral portrait, soft plain background",
    "focus on stable facial identity",
    "neutral clothing only",
    "no text, no watermark, no logo, no caption",
    `hair: ${identity.hair}`,
    `eyes: ${identity.eyes}`,
    `skin tone: ${identity.skin_tone}`,
    `face features: ${identity.face_features}`,
    `body proportions: ${identity.body_proportions}`,
  ].join(". ");

  const response = await callOpenAIWithCost({
    storyId: tracking?.storyId,
    pageNumber: tracking?.pageNumber,
    step: "identity_reference_image",
    model: "gpt-image-1",
    createResponseFn: async () => {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-image-1",
          size: "1024x1536",
          prompt,
        }),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Identity portrait generation failed: ${res.status} ${txt}`);
      }
      return (await res.json()) as { data?: Array<{ b64_json?: string }>; id?: string };
    },
  });
  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("Identity portrait returned empty image data.");

  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  const path = `identity-refs/${universeId}/${profileKind}_${profileId}_v${identityBibleId}.png`;
  const upload = await supabase.storage.from("story-illustrations").upload(path, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (upload.error) throw new Error(upload.error.message);

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  const imageUrl = `${baseUrl}/storage/v1/object/public/story-illustrations/${path}`;

  const insert = await supabase.from("character_identity_reference_images").insert({
    identity_bible_id: identityBibleId,
    kind: "portrait",
    image_url: imageUrl,
    model: "gpt-image-1",
    params_json: { size: "1024x1536" },
  });
  if (insert.error) throw new Error(insert.error.message);
}

export async function getOrCreateIdentityBible(input: {
  profile_id: string;
  profile_kind: ProfileKind;
  tracking?: { storyId?: string | null; pageNumber?: number | null };
}): Promise<{
  identityBible: {
    id: string;
    profile_kind: ProfileKind;
    profile_id: string;
    identity_bible_json: z.infer<typeof identityBibleSchema>;
  };
  referenceImages: Array<{ id: string; kind: "portrait" | "full_body"; image_url: string }>;
}> {
  const profileKind = profileKindSchema.parse(input.profile_kind);
  const profile = await loadProfile(input.profile_id, profileKind);
  const sourceHash = computeProfileSourceHash({
    profile_photo_url: profile.profilePhotoUrl,
    profile_attributes_json: profile.profileAttributes,
  });

  const supabase = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("character_identity_bibles")
    .select("id, profile_kind, profile_id, identity_bible_json")
    .eq("profile_kind", profileKind)
    .eq("profile_id", input.profile_id)
    .eq("status", "active")
    .eq("source_hash", sourceHash)
    .order("version", { ascending: false })
    .limit(1);
  if (existingError) throw new Error(existingError.message);

  let identityRow = existing?.[0];
  if (!identityRow) {
    const extracted = profile.profilePhotoUrl
      ? await extractIdentityFromPhoto(profile.profilePhotoUrl, profile.displayName, input.tracking).catch(() =>
          fallbackIdentity(profile)
        )
      : fallbackIdentity(profile);
    const merged = mergeExplicitIdentity(extracted, profile.profileAttributes);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: latestVersion, error: versionError } = await supabase
        .from("character_identity_bibles")
        .select("version")
        .eq("profile_kind", profileKind)
        .eq("profile_id", input.profile_id)
        .order("version", { ascending: false })
        .limit(1);
      if (versionError) throw new Error(versionError.message);
      const nextVersion = ((latestVersion?.[0]?.version as number | undefined) ?? 0) + 1;

      const insert = await supabase
        .from("character_identity_bibles")
        .insert({
          universe_id: profile.universeId,
          profile_kind: profileKind,
          profile_id: input.profile_id,
          version: nextVersion,
          source_hash: sourceHash,
          identity_bible_json: merged,
          status: "active",
        })
        .select("id, profile_kind, profile_id, identity_bible_json")
        .single();

      if (!insert.error) {
        identityRow = insert.data;
        break;
      }

      const duplicateVersion =
        insert.error.message.includes("character_identity_bibles_profile_kind_profile_id_version_key") ||
        insert.error.message.includes("duplicate key value violates unique constraint");
      if (!duplicateVersion) throw new Error(insert.error.message);

      const { data: winner, error: winnerError } = await supabase
        .from("character_identity_bibles")
        .select("id, profile_kind, profile_id, identity_bible_json")
        .eq("profile_kind", profileKind)
        .eq("profile_id", input.profile_id)
        .eq("status", "active")
        .eq("source_hash", sourceHash)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (winnerError) throw new Error(winnerError.message);
      if (winner) {
        identityRow = winner;
        break;
      }
    }

    if (!identityRow) {
      throw new Error("Failed to create character identity bible after retry.");
    }
  }

  const identityBible = identityBibleSchema.safeParse(identityRow.identity_bible_json);
  if (!identityBible.success) {
    throw new Error(identityBible.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
  }

  const refsQuery = await supabase
    .from("character_identity_reference_images")
    .select("id, kind, image_url")
    .eq("identity_bible_id", identityRow.id)
    .eq("kind", "portrait")
    .order("created_at", { ascending: false });
  if (refsQuery.error) throw new Error(refsQuery.error.message);
  if ((refsQuery.data ?? []).length === 0) {
    await createNeutralIdentityPortrait(
      identityRow.id,
      profile.universeId,
      profileKind,
      input.profile_id,
      identityBible.data,
      input.tracking
    );
  }

  const refs = await supabase
    .from("character_identity_reference_images")
    .select("id, kind, image_url")
    .eq("identity_bible_id", identityRow.id)
    .order("created_at", { ascending: false });
  if (refs.error) throw new Error(refs.error.message);

  return {
    identityBible: {
      id: identityRow.id as string,
      profile_kind: identityRow.profile_kind as ProfileKind,
      profile_id: identityRow.profile_id as string,
      identity_bible_json: identityBible.data,
    },
    referenceImages: (refs.data ?? []) as Array<{ id: string; kind: "portrait" | "full_body"; image_url: string }>,
  };
}

export async function getOrCreateStoryOutfit(input: {
  story_id: string;
  profile_id: string;
  profile_kind: ProfileKind;
  story_context: { setting: string; season: string; tone: string };
  pageNumber?: number | null;
}): Promise<{
  id: string;
  outfit_json: z.infer<typeof outfitSchema>;
  outfit_lock: boolean;
}> {
  const profileKind = profileKindSchema.parse(input.profile_kind);
  const supabase = createSupabaseAdminClient();

  const existing = await supabase
    .from("story_character_outfits")
    .select("id, outfit_json, outfit_lock")
    .eq("story_id", input.story_id)
    .eq("profile_kind", profileKind)
    .eq("profile_id", input.profile_id)
    .maybeSingle();
  if (existing.error) throw new Error(existing.error.message);

  if (existing.data && existing.data.outfit_lock) {
    const parsed = outfitSchema.safeParse(existing.data.outfit_json);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid locked outfit.");
    return { id: existing.data.id as string, outfit_json: parsed.data, outfit_lock: true };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  let outfit: z.infer<typeof outfitSchema> = {
    top: "cozy top",
    bottom: "comfortable bottoms",
    shoes: "soft shoes",
    accessories: ["small story-themed accessory"],
    palette: ["#FF9F1C", "#2EC4B6", "#FFBF69"],
  };

  if (apiKey) {
    const schemaHint = [
      "{",
      '  "top": "string",',
      '  "bottom": "string",',
      '  "shoes": "string",',
      '  "accessories": ["string"],',
      '  "palette": ["string"]',
      "}",
    ].join("\n");

    const response = await callOpenAIWithCost({
      storyId: input.story_id,
      pageNumber: input.pageNumber ?? null,
      step: "outfit_generate",
      model: "gpt-4.1-mini",
      createResponseFn: async () => {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4.1-mini",
            temperature: 0.4,
            messages: [
              {
                role: "system",
                content:
                  "You design child-safe story outfits in strict JSON. Keep identity separate from clothing.",
              },
              {
                role: "user",
                content: [
                  `Setting: ${input.story_context.setting}`,
                  `Season: ${input.story_context.season}`,
                  `Tone: ${input.story_context.tone}`,
                  "Output outfit JSON only:",
                  schemaHint,
                ].join("\n"),
              },
            ],
          }),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`Outfit generation failed: ${res.status} ${txt}`);
        }
        return (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          id?: string;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            prompt_tokens_details?: { cached_tokens?: number };
            completion_tokens_details?: { reasoning_tokens?: number };
          };
        };
      },
    }).catch(() => null);

    if (response) {
      const raw = response.choices?.[0]?.message?.content;
      if (raw) {
        const parsed = outfitSchema.safeParse(parseJsonObject(raw));
        if (parsed.success) outfit = parsed.data;
      }
    }
  }

  if (!existing.data) {
    const insert = await supabase
      .from("story_character_outfits")
      .insert({
        story_id: input.story_id,
        profile_kind: profileKind,
        profile_id: input.profile_id,
        outfit_json: outfit,
        outfit_lock: false,
      })
      .select("id, outfit_json, outfit_lock")
      .single();
    if (insert.error) throw new Error(insert.error.message);
    return { id: insert.data.id as string, outfit_json: outfit, outfit_lock: false };
  }

  const update = await supabase
    .from("story_character_outfits")
    .update({ outfit_json: outfit })
    .eq("id", existing.data.id)
    .select("id, outfit_json, outfit_lock")
    .single();
  if (update.error) throw new Error(update.error.message);
  return {
    id: update.data.id as string,
    outfit_json: outfitSchema.parse(update.data.outfit_json),
    outfit_lock: Boolean(update.data.outfit_lock),
  };
}
