/**
 * Local roster + composer-draft persistence (localStorage).
 * Message history is NOT cached beyond whatever is already in memory this session.
 */

import type { Bot, Group } from "@/types/gateway";

export const ROSTER_KEY = "pica.roster.v2";
export const DRAFTS_KEY = "pica.drafts.v1";

export type RosterEntry = {
  savedAt: number;
  bots: Bot[];
  groups: Group[];
};

export type RosterFile = {
  v: 2;
  byBaseUrl: Record<string, RosterEntry>;
};

export type DraftsEntry = {
  savedAt: number;
  drafts: Record<string, string>;
};

export type DraftsFile = {
  v: 1;
  byBaseUrl: Record<string, DraftsEntry>;
};

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Quota / private mode */
  }
}

function readRosterFile(): RosterFile {
  const raw = readJson<Record<string, unknown>>(ROSTER_KEY);
  if (!raw || (raw.v !== 2 && raw.v !== 1)) return { v: 2, byBaseUrl: {} };
  if (raw.byBaseUrl && typeof raw.byBaseUrl === "object") {
    const by: Record<string, RosterEntry> = {};
    for (const [url, entry] of Object.entries(raw.byBaseUrl as Record<string, Record<string, unknown>>)) {
      const bots = Array.isArray(entry.bots) ? (entry.bots as Bot[]) : [];
      const groups = Array.isArray(entry.groups)
        ? (entry.groups as Group[])
        : [];
      by[url] = {
        savedAt: typeof entry.savedAt === "number" ? entry.savedAt : 0,
        bots,
        groups,
      };
    }
    return { v: 2, byBaseUrl: by };
  }
  return { v: 2, byBaseUrl: {} };
}

function readDraftsFile(): DraftsFile {
  const raw = readJson<Record<string, unknown>>(DRAFTS_KEY);
  if (!raw || raw.v !== 1) return { v: 1, byBaseUrl: {} };
  if (raw.byBaseUrl && typeof raw.byBaseUrl === "object") {
    return { v: 1, byBaseUrl: raw.byBaseUrl as Record<string, DraftsEntry> };
  }
  return { v: 1, byBaseUrl: {} };
}

export function loadRoster(baseUrl: string): RosterEntry | null {
  if (!baseUrl) return null;
  const file = readRosterFile();
  const entry = file.byBaseUrl[baseUrl];
  if (!entry) return null;
  return {
    savedAt: typeof entry.savedAt === "number" ? entry.savedAt : 0,
    bots: Array.isArray(entry.bots) ? entry.bots : [],
    groups: Array.isArray(entry.groups) ? entry.groups : [],
  };
}

export function saveRoster(
  baseUrl: string,
  data: { bots: Bot[]; groups: Group[] },
): void {
  if (!baseUrl) return;
  const file = readRosterFile();
  file.byBaseUrl[baseUrl] = {
    savedAt: Date.now(),
    bots: data.bots,
    groups: data.groups,
  };
  writeJson(ROSTER_KEY, file);
}

export function loadDrafts(baseUrl: string): Record<string, string> {
  if (!baseUrl) return {};
  const file = readDraftsFile();
  const entry = file.byBaseUrl[baseUrl];
  if (!entry?.drafts || typeof entry.drafts !== "object") return {};
  const out: Record<string, string> = {};
  for (const [id, text] of Object.entries(entry.drafts)) {
    if (typeof text === "string" && text.length > 0) out[id] = text;
  }
  return out;
}

export function saveDrafts(baseUrl: string, drafts: Record<string, string>): void {
  if (!baseUrl) return;
  const cleaned: Record<string, string> = {};
  for (const [id, text] of Object.entries(drafts)) {
    if (text.length > 0) cleaned[id] = text;
  }
  const file = readDraftsFile();
  file.byBaseUrl[baseUrl] = { savedAt: Date.now(), drafts: cleaned };
  writeJson(DRAFTS_KEY, file);
}

export function clearLocalCache(): void {
  try {
    localStorage.removeItem(ROSTER_KEY);
    localStorage.removeItem("pica.roster.v1");
    localStorage.removeItem(DRAFTS_KEY);
  } catch {
    /* ignore */
  }
}
