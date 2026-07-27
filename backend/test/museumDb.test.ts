import { describe, expect, it } from "vitest";

describe("museumDb", () => {
  it("inserts and lists museum entries newest first, round-tripping JSON columns", async () => {
    process.env.MUSEUM_DB_PATH = ":memory:";
    const { insertMuseumEntry, listMuseumEntries } = await import("../src/db/museumDb.js");

    insertMuseumEntry({
      id: "entry-1",
      roomName: "테스트 방",
      teamId: "A",
      teamName: "T라노 팀",
      isWinner: true,
      form: "NORMAL",
      tyrannoName: "렉스",
      teamMembers: ["철수", "영희"],
      mvpNickname: "철수",
      mvpScore: 42,
      decorations: { HAT: "crown" },
      excavationMs: 1000,
      assemblyMs: 2000,
      chargingMs: 3000,
      accuracy: 0.8,
      fossils: 2,
      createdAt: 1000,
    });
    insertMuseumEntry({
      id: "entry-2",
      roomName: "테스트 방",
      teamId: "B",
      teamName: "F라노 팀",
      isWinner: false,
      form: "YRANNO",
      tyrannoName: null,
      teamMembers: ["민수"],
      mvpNickname: null,
      mvpScore: null,
      decorations: {},
      excavationMs: null,
      assemblyMs: null,
      chargingMs: null,
      accuracy: 0,
      fossils: 0,
      createdAt: 2000,
    });

    const entries = listMuseumEntries(10);
    expect(entries.map((e) => e.id)).toEqual(["entry-2", "entry-1"]); // newest first

    const winner = entries.find((e) => e.id === "entry-1")!;
    expect(winner.isWinner).toBe(true);
    expect(winner.teamMembers).toEqual(["철수", "영희"]);
    expect(winner.decorations).toEqual({ HAT: "crown" });

    const loser = entries.find((e) => e.id === "entry-2")!;
    expect(loser.isWinner).toBe(false);
    expect(loser.tyrannoName).toBeNull();
    expect(loser.decorations).toEqual({});
  });

  it("respects the limit and ordering across more entries than requested", async () => {
    process.env.MUSEUM_DB_PATH = ":memory:";
    const { insertMuseumEntry, listMuseumEntries } = await import("../src/db/museumDb.js?variant=limit");

    for (let i = 0; i < 5; i += 1) {
      insertMuseumEntry({
        id: `limit-${i}`,
        roomName: "방",
        teamId: i % 2 === 0 ? "A" : "B",
        teamName: i % 2 === 0 ? "T라노 팀" : "F라노 팀",
        isWinner: false,
        form: "NORMAL",
        tyrannoName: null,
        teamMembers: [],
        mvpNickname: null,
        mvpScore: null,
        decorations: {},
        excavationMs: null,
        assemblyMs: null,
        chargingMs: null,
        accuracy: 0,
        fossils: 0,
        createdAt: i,
      });
    }

    const top3 = listMuseumEntries(3);
    expect(top3.map((e) => e.id)).toEqual(["limit-4", "limit-3", "limit-2"]);
  });
});
