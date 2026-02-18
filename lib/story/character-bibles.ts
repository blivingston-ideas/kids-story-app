import { createHash } from "crypto";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const visualBibleSchema = z.object({
  hair: z.string().trim().min(1),
  eyes: z.string().trim().min(1),
  skin: z.string().trim().min(1),
  outfit: z.string().trim().min(1),
  accessories: z.string().trim().min(1),
  proportions: z.string().trim().min(1),
  style_notes: z.string().trim().min(1),
});

const normalizedProfileAttributesSchema = visualBibleSchema.partial();

const profileKindSchema = z.enum(["kid", "adult"]);
export type ProfileKind = z.infer<typeof profileKindSchema>;
export type VisualBible = z.infer<typeof visualBibleSchema>;

export type CharacterBibleRecord = {
  id: string;
  universe_id: string;
  profile_kind: ProfileKind;
  profile_id: string;
  version: number;
  source_hash: string;
  visual_bible_json: VisualBible;
  style_guide_json: Record<string, unknown> | null;
  status: string;
  created_at: string;
};

export type CharacterReferenceImageRecord = {
  id: string;
  character_bible_id: string;
  kind: "portrait" | "full_body" | "turnaround";
  image_url: string;
  model: string | null;
  seed: string | null;
  params_json: Record<string, unknown> | null;
  created_at: string;
};

type ProfileSnapshot = {
  kind: ProfileKind;
  profileId: string;
  universeId: string;
  name: string;
  profilePhotoUrl: string | null;
  profileAttributes: Record<string, unknown>;
  fallbackNotes: string;
};

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

async function loadProfile(kind: ProfileKind, profileId: string): Promise<ProfileSnapshot> {
  const supabase = createSupabaseAdminClient();
  if (kind === "kid") {
    const { data, error } = await supabase
      .from("profiles_kid")
      .select(
        "id, universe_id, display_name, age, themes, books_we_like, profile_photo_url, profile_attributes_json, avatar_url"
      )
      .eq("id", profileId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Kid profile not found.");
    return {
      kind,
      profileId: data.id,
      universeId: data.universe_id,
      name: data.display_name,
      profilePhotoUrl: data.profile_photo_url ?? data.avatar_url ?? null,
      profileAttributes: (data.profile_attributes_json as Record<string, unknown> | null) ?? {},
      fallbackNotes: [
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
    kind,
    profileId: data.id,
    universeId: data.universe_id,
    name: data.display_name,
    profilePhotoUrl: data.profile_photo_url ?? data.avatar_url ?? null,
    profileAttributes: (data.profile_attributes_json as Record<string, unknown> | null) ?? {},
    fallbackNotes: data.persona_label ? `persona: ${data.persona_label}` : "supportive adult",
  };
}

async function extractVisualBibleFromPhoto(photoUrl: string, name: string): Promise<VisualBible> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const schemaHint = [
    "{",
    '  "hair": "string",',
    '  "eyes": "string",',
    '  "skin": "string",',
    '  "outfit": "string",',
    '  "accessories": "string",',
    '  "proportions": "string",',
    '  "style_notes": "string"',
    "}",
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
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
            "You extract visual character attributes from a photo for children's illustrations. Output strict JSON only.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Extract a visual bible for character ${name}. Output JSON only.` },
            { type: "text", text: `Schema:\n${schemaHint}` },
            { type: "image_url", image_url: { url: photoUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Vision extraction failed: ${response.status} ${txt}`);
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = payload.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("Vision extraction returned empty result.");

  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) throw new Error("Vision extraction did not return JSON.");
  const parsed = visualBibleSchema.safeParse(JSON.parse(raw.slice(first, last + 1)) as unknown);
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
  }
  return parsed.data;
}

function normalizeAttributes(
  attrs: Record<string, unknown>,
  fallback: { name: string; fallbackNotes: string }
): VisualBible {
  const parsed = normalizedProfileAttributesSchema.safeParse(attrs);
  const partial = parsed.success ? parsed.data : {};
  const base = fallback.fallbackNotes || "friendly family character";
  return {
    hair: partial.hair ?? "soft brown hair",
    eyes: partial.eyes ?? "warm expressive eyes",
    skin: partial.skin ?? "natural skin tone",
    outfit: partial.outfit ?? "cozy playful outfit",
    accessories: partial.accessories ?? "simple child-safe accessories",
    proportions: partial.proportions ?? "gentle picture-book proportions",
    style_notes: partial.style_notes ?? `${fallback.name}: ${base}`,
  };
}

function mergeVisualBible(base: VisualBible, explicitAttrs: Record<string, unknown>): VisualBible {
  const explicit = normalizedProfileAttributesSchema.safeParse(explicitAttrs);
  if (!explicit.success) return base;
  return {
    hair: explicit.data.hair ?? base.hair,
    eyes: explicit.data.eyes ?? base.eyes,
    skin: explicit.data.skin ?? base.skin,
    outfit: explicit.data.outfit ?? base.outfit,
    accessories: explicit.data.accessories ?? base.accessories,
    proportions: explicit.data.proportions ?? base.proportions,
    style_notes: explicit.data.style_notes ?? base.style_notes,
  };
}

export async function getOrCreateCharacterReferenceImages(
  characterBibleId: string
): Promise<CharacterReferenceImageRecord[]> {
  const supabase = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("character_reference_images")
    .select("id, character_bible_id, kind, image_url, model, seed, params_json, created_at")
    .eq("character_bible_id", characterBibleId)
    .eq("kind", "portrait")
    .order("created_at", { ascending: false });
  if (existingError) throw new Error(existingError.message);
  if ((existing ?? []).length > 0) return existing as CharacterReferenceImageRecord[];

  const { data: bible, error: bibleError } = await supabase
    .from("character_bibles")
    .select("id, universe_id, profile_kind, profile_id, visual_bible_json")
    .eq("id", characterBibleId)
    .maybeSingle();
  if (bibleError) throw new Error(bibleError.message);
  if (!bible) throw new Error("Character bible not found.");

  const visual = visualBibleSchema.safeParse(bible.visual_bible_json);
  if (!visual.success) {
    throw new Error(visual.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(" | "));
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

  const prompt = [
    "children's picture book illustration, clean shapes, soft shading",
    "Toy Box Adventure palette: #FF9F1C, #2EC4B6, #FFBF69, #CBF3F0, #293241",
    "neutral portrait on soft plain background",
    "consistent character design",
    "no text, no watermark, no logo, no caption",
    `hair: ${visual.data.hair}`,
    `eyes: ${visual.data.eyes}`,
    `skin: ${visual.data.skin}`,
    `outfit: ${visual.data.outfit}`,
    `accessories: ${visual.data.accessories}`,
    `proportions: ${visual.data.proportions}`,
    `style notes: ${visual.data.style_notes}`,
  ].join(". ");

  const response = await fetch("https://api.openai.com/v1/images/generations", {
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
  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Reference portrait generation failed: ${response.status} ${txt}`);
  }
  const payload = (await response.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = payload.data?.[0]?.b64_json;
  if (!b64) throw new Error("Reference portrait returned empty image data.");

  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  const path = `refs/${bible.universe_id}/${bible.profile_kind}_${bible.profile_id}_v${characterBibleId}.png`;
  const upload = await supabase.storage.from("story-illustrations").upload(path, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (upload.error) throw new Error(upload.error.message);

  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!baseUrl) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not set.");
  const imageUrl = `${baseUrl}/storage/v1/object/public/story-illustrations/${path}`;

  const { data: inserted, error: insertError } = await supabase
    .from("character_reference_images")
    .insert({
      character_bible_id: characterBibleId,
      kind: "portrait",
      image_url: imageUrl,
      model: "gpt-image-1",
      params_json: { size: "1024x1536" },
    })
    .select("id, character_bible_id, kind, image_url, model, seed, params_json, created_at");
  if (insertError) throw new Error(insertError.message);

  return (inserted ?? []) as CharacterReferenceImageRecord[];
}

export async function getOrCreateCharacterBible(input: {
  profile_id: string;
  profile_kind: ProfileKind;
}): Promise<{ bible: CharacterBibleRecord; refs: CharacterReferenceImageRecord[] }> {
  const kind = profileKindSchema.parse(input.profile_kind);
  const profile = await loadProfile(kind, input.profile_id);
  const sourceHash = computeProfileSourceHash({
    profile_photo_url: profile.profilePhotoUrl,
    profile_attributes_json: profile.profileAttributes,
  });

  const supabase = createSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("character_bibles")
    .select(
      "id, universe_id, profile_kind, profile_id, version, source_hash, visual_bible_json, style_guide_json, status, created_at"
    )
    .eq("profile_kind", kind)
    .eq("profile_id", profile.profileId)
    .eq("status", "active")
    .eq("source_hash", sourceHash)
    .order("version", { ascending: false })
    .limit(1);
  if (existingError) throw new Error(existingError.message);

  if ((existing ?? []).length > 0) {
    const current = existing?.[0] as CharacterBibleRecord;
    const refs = await getOrCreateCharacterReferenceImages(current.id);
    return { bible: current, refs };
  }

  const { data: allVersions, error: versionError } = await supabase
    .from("character_bibles")
    .select("version")
    .eq("profile_kind", kind)
    .eq("profile_id", profile.profileId)
    .order("version", { ascending: false })
    .limit(1);
  if (versionError) throw new Error(versionError.message);
  const nextVersion = ((allVersions?.[0]?.version as number | undefined) ?? 0) + 1;

  let visualFromPhoto: VisualBible | null = null;
  if (profile.profilePhotoUrl) {
    try {
      visualFromPhoto = await extractVisualBibleFromPhoto(profile.profilePhotoUrl, profile.name);
    } catch {
      visualFromPhoto = null;
    }
  }
  const normalized = visualFromPhoto ?? normalizeAttributes(profile.profileAttributes, profile);
  const merged = mergeVisualBible(normalized, profile.profileAttributes);

  const { data: created, error: createError } = await supabase
    .from("character_bibles")
    .insert({
      universe_id: profile.universeId,
      profile_kind: kind,
      profile_id: profile.profileId,
      version: nextVersion,
      source_hash: sourceHash,
      visual_bible_json: merged,
      style_guide_json: { palette: "Toy Box Adventure", consistency: "high" },
      status: "active",
    })
    .select(
      "id, universe_id, profile_kind, profile_id, version, source_hash, visual_bible_json, style_guide_json, status, created_at"
    )
    .single();
  if (createError) throw new Error(createError.message);

  const refs = await getOrCreateCharacterReferenceImages(created.id);
  return { bible: created as CharacterBibleRecord, refs };
}
