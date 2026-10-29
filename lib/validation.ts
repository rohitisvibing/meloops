import { z } from "zod";
import { MEDIA_ID_RE } from "./media/types";
import { formatTimecode } from "./time";

export const MIN_SEGMENT_MS = 3000;

export type SegmentTimesError = { field: "start" | "end"; message: string };

/**
 * Validate segment bounds. `durationMs` is optional because manual entries may not know it.
 */
export function validateSegmentTimes(
  startMs: number | null,
  endMs: number | null,
  durationMs?: number | null,
): SegmentTimesError | null {
  if (startMs === null) return { field: "start", message: "Enter a start time like 00:42." };
  if (endMs === null) return { field: "end", message: "Enter an end time like 01:18." };
  if (startMs < 0) return { field: "start", message: "Start can't be before 00:00." };
  if (endMs <= startMs) return { field: "end", message: "End has to be after the start." };
  if (endMs - startMs < MIN_SEGMENT_MS) {
    return { field: "end", message: "Make the moment at least 3 seconds long." };
  }
  if (durationMs && endMs > durationMs) {
    return {
      field: "end",
      message: `End time is past the song's length (${formatTimecode(durationMs)}). Pick an earlier end.`,
    };
  }
  return null;
}

export const providerSchema = z.enum(["youtube", "spotify"]);

export const segmentInputSchema = z
  .object({
    provider: providerSchema,
    mediaId: z.string(),
    title: z.string().trim().min(1, "Add the song title.").max(200),
    artist: z.string().trim().max(200).default(""),
    durationMs: z.number().int().positive().nullable().default(null),
    startMs: z.number().int(),
    endMs: z.number().int(),
    note: z.string().trim().max(280).default(""),
    playlistId: z.string().uuid().nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (!MEDIA_ID_RE[value.provider].test(value.mediaId)) {
      ctx.addIssue({ code: "custom", path: ["mediaId"], message: "That song link looks incomplete." });
    }
    const error = validateSegmentTimes(value.startMs, value.endMs, value.durationMs);
    if (error) {
      ctx.addIssue({
        code: "custom",
        path: [error.field === "start" ? "startMs" : "endMs"],
        message: error.message,
      });
    }
  });

export type SegmentInput = z.infer<typeof segmentInputSchema>;

export const playlistInputSchema = z.object({
  title: z.string().trim().min(1, "Give the playlist a name.").max(80),
  description: z.string().trim().max(300).default(""),
});
