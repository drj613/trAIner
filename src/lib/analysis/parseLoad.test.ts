import { parseLoad } from "./parseLoad";

describe("parseLoad", () => {
  it("returns {} for missing/empty/unrecognized input", () => {
    expect(parseLoad(undefined)).toEqual({});
    expect(parseLoad("")).toEqual({});
    expect(parseLoad("bodyweight")).toEqual({});
    expect(parseLoad("BWx8")).toEqual({});
  });

  it("extracts percent of 1RM", () => {
    expect(parseLoad("75%")).toEqual({ pct1rm: 75 });
    expect(parseLoad("@ 92.5%")).toEqual({ pct1rm: 92 });
  });

  it("extracts RPE (including half steps)", () => {
    expect(parseLoad("RPE 8")).toEqual({ rpe: 8 });
    expect(parseLoad("rpe 9.5")).toEqual({ rpe: 9.5 });
  });

  it("extracts RIR", () => {
    expect(parseLoad("2 RIR")).toEqual({ rir: 2 });
    expect(parseLoad("RIR 1")).toEqual({ rir: 1 });
  });

  it("extracts rep-max", () => {
    expect(parseLoad("5RM")).toEqual({ repMax: 5 });
  });

  it("extracts multiple signals from one string", () => {
    expect(parseLoad("80% RPE 9")).toEqual({ pct1rm: 80, rpe: 9 });
  });

  it("does not treat the '1RM' unit label after a percent as a rep-max", () => {
    expect(parseLoad("70% 1RM")).toEqual({ pct1rm: 70 });
    expect(parseLoad("85% 1RM")).toEqual({ pct1rm: 85 });
    expect(parseLoad("@90% 1RM, RPE 9")).toEqual({ pct1rm: 90, rpe: 9 });
  });

  it("still extracts a bare 1RM prescription (no percent)", () => {
    expect(parseLoad("1RM")).toEqual({ repMax: 1 });
  });
});
