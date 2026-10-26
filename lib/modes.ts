import type { MatchMode } from "./types";

/** Presentation metadata for the three version types. */
export const MODES: {
  id: MatchMode;
  label: string;
  short: string;
  hint: string;
}[] = [
  {
    id: "slowed",
    label: "Slowed + reverb",
    short: "Slowed",
    hint: "0.8× + reverb",
  },
  {
    id: "instrumental",
    label: "Instrumental",
    short: "Instrumental",
    hint: "No vocals",
  },
  {
    id: "spedup",
    label: "Sped up",
    short: "Sped up",
    hint: "Faster + pitched",
  },
];

export const DEFAULT_MODE: MatchMode = "slowed";

export function modeLabel(mode: MatchMode): string {
  return MODES.find((item) => item.id === mode)?.label ?? "Slowed + reverb";
}

export function modeShort(mode: MatchMode): string {
  return MODES.find((item) => item.id === mode)?.short ?? "Slowed";
}
