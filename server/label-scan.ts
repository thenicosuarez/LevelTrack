import { z } from "zod";
import { getOpenAI } from "./openai";

// Reads supplement facts from 1–3 label photos with a vision model.

export const scanLabelRequestSchema = z.object({
  images: z.array(
    z.string()
      .regex(/^data:image\/(jpeg|png|webp);base64,/, "Expected a JPEG, PNG or WebP data URL")
      .max(4_000_000, "Image too large"),
  ).min(1).max(3),
});

const scanResultSchema = z.object({
  isSupplementLabel: z.boolean(),
  supplementName: z.string().default(""),
  brand: z.string().default(""),
  dosageAmount: z.coerce.string().default(""),
  dosageUnit: z.string().default(""),
  servingSize: z.string().default(""),
  ingredients: z.array(z.string()).default([]),
  confidence: z.coerce.number().min(0).max(100).default(0),
  suggestions: z.array(z.string()).max(5).default([]),
});

export type ScanResult = Omit<z.infer<typeof scanResultSchema>, "isSupplementLabel">;

export class NotALabelError extends Error {}

const PROMPT = `You read supplement and medication labels from photos.
Return only a JSON object with these keys:
- isSupplementLabel: true if the photos show a supplement or medication label you can read, else false
- supplementName: the product name, or the main active ingredient if no product name
- brand: the brand, or "" if not visible
- dosageAmount: amount of the main active ingredient per serving, as a number string (e.g. "200")
- dosageUnit: its unit as printed (mg, mcg, g, IU, ml, ...)
- servingSize: the serving size as printed (e.g. "2 capsules")
- ingredients: the listed ingredients, in label order
- confidence: 0-100, how confident you are in the fields above
- suggestions: up to 3 short, general tips that restate the label's own directions (timing, take with food). Never recommend doses, never give medical advice.
Use "" or [] for anything you can't read. Don't guess values that aren't printed.`;

export async function scanSupplementLabel(images: string[]): Promise<ScanResult> {
  const completion = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    response_format: { type: "json_object" },
    temperature: 0,
    messages: [
      { role: "system", content: PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Read this label." },
          ...images.map(url => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
        ],
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "";
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("Label scan returned malformed JSON");
  }
  const parsed = scanResultSchema.safeParse(json);
  if (!parsed.success) throw new Error("Label scan returned an unexpected shape");
  const { isSupplementLabel, ...result } = parsed.data;
  if (!isSupplementLabel || !result.supplementName) throw new NotALabelError();
  return result;
}
