import { buildInitialCells, updateCell, addSet, type CellMap } from "./cellMap";
import { demoProgram } from "@/lib/programs/sample";

const day = demoProgram.days[0];

describe("buildInitialCells", () => {
  it("creates one entry per exercise keyed by exercise id", () => {
    const map = buildInitialCells(day);
    const allExIds = day.sections.flatMap((s) => s.groups.flatMap((g) => g.exercises.map((e) => e.id)));
    expect(Object.keys(map).sort()).toEqual(allExIds.sort());
  });

  it("uses exercise.sets count for initial array length", () => {
    const map = buildInitialCells(day);
    const pullup = day.sections[1].groups[0].exercises[0];
    expect(map[pullup.id]).toHaveLength(pullup.sets ?? 3);
  });

  it("defaults to 3 cells when exercise has no sets defined", () => {
    const noSets = {
      ...day,
      sections: [
        {
          ...day.sections[0],
          groups: [
            {
              ...day.sections[0].groups[0],
              exercises: [{ ...day.sections[0].groups[0].exercises[0], sets: undefined }],
            },
          ],
        },
      ],
    };
    const map = buildInitialCells(noSets);
    const exId = noSets.sections[0].groups[0].exercises[0].id;
    expect(map[exId]).toHaveLength(3);
  });

  it("initialises all cells to empty string", () => {
    const map = buildInitialCells(day);
    for (const cells of Object.values(map)) {
      expect(cells.every((c) => c === "")).toBe(true);
    }
  });
});

describe("updateCell", () => {
  it("returns a new map with the updated cell", () => {
    const map: CellMap = { "ex-1": ["", "", ""] };
    const next = updateCell(map, "ex-1", 1, "65x10");
    expect(next["ex-1"]).toEqual(["", "65x10", ""]);
    expect(map["ex-1"]).toEqual(["", "", ""]);
  });

  it("grows the array if index is out of bounds", () => {
    const map: CellMap = { "ex-1": ["70x5"] };
    const next = updateCell(map, "ex-1", 2, "60x8");
    expect(next["ex-1"][2]).toBe("60x8");
  });
});

describe("addSet", () => {
  it("appends an empty cell to the exercise's array", () => {
    const map: CellMap = { "ex-1": ["65x10", "65x10"] };
    const next = addSet(map, "ex-1");
    expect(next["ex-1"]).toHaveLength(3);
    expect(next["ex-1"][2]).toBe("");
    expect(map["ex-1"]).toHaveLength(2);
  });
});
