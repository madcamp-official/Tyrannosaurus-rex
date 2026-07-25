/** Plan.md §8, §29. 회원가입 없는 MVP의 로컬 박물관 저장소. */

import { MUSEUM_MAX_ENTRIES, MUSEUM_STORAGE_KEY, type MuseumTyranno } from "@trex/shared";

function isMuseumTyranno(value: unknown): value is MuseumTyranno {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string" && v.dataVersion === 1;
}

/** 손상된 항목은 건너뛰고 나머지 전시를 유지한다. */
export function loadMuseumEntries(): MuseumTyranno[] {
  const raw = window.localStorage.getItem(MUSEUM_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isMuseumTyranno);
  } catch {
    return [];
  }
}

export function saveMuseumEntry(entry: MuseumTyranno): MuseumTyranno[] {
  const entries = [entry, ...loadMuseumEntries()].slice(0, MUSEUM_MAX_ENTRIES);
  window.localStorage.setItem(MUSEUM_STORAGE_KEY, JSON.stringify(entries));
  return entries;
}
