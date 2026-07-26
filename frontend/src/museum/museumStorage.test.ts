import { beforeEach, describe, expect, it } from "vitest";
import { MUSEUM_STORAGE_KEY } from "@trex/shared";
import { loadMuseumEntries, saveMuseumEntry } from "./museumStorage";

function validEntry(id: string) {
  return {
    id,
    name: "렉스",
    form: "NORMAL" as const,
    teamId: "A" as const,
    teamMembers: ["P1"],
    createdAt: 1,
    dataVersion: 1 as const,
    excavationMs: 1000,
    assemblyMs: 1000,
    chargingMs: 1000,
    accuracy: 0.5,
    decorations: {},
    fossils: 0,
  };
}

describe("museumStorage", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("returns an empty list when nothing is stored", () => {
    expect(loadMuseumEntries()).toEqual([]);
  });

  it("saves and reloads an entry, newest first", () => {
    saveMuseumEntry(validEntry("a"));
    saveMuseumEntry(validEntry("b"));
    const entries = loadMuseumEntries();
    expect(entries.map((e) => e.id)).toEqual(["b", "a"]);
  });

  it("skips corrupted stored data instead of throwing", () => {
    window.localStorage.setItem(MUSEUM_STORAGE_KEY, "not json");
    expect(loadMuseumEntries()).toEqual([]);
  });

  it("filters out malformed entries but keeps valid ones", () => {
    window.localStorage.setItem(MUSEUM_STORAGE_KEY, JSON.stringify([validEntry("ok"), { garbage: true }]));
    const entries = loadMuseumEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.id).toBe("ok");
  });
});
