import { PRIVATE_VIDEO_ID } from "./env";

/**
 * Fixed mock video ids. The mock provider derives each source video's length
 * from a hash of its id; these all hash to ~70s (the minimum) so source
 * generation and analysis stay fast. Distinct ids per spec make the server
 * logs easy to attribute.
 */
export const VIDEO_IDS = {
  happyPath: "e2e00000029",
  editing: "e2e00000048",
  editingInvalid: "e2e00000053",
  apiJobs: "e2e00000105",
  apiMedia: "e2e00000110",
  private: PRIVATE_VIDEO_ID,
} as const;

export const youtubeUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;
