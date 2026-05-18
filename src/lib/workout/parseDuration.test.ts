import { parseDuration } from "./parseDuration";

describe("parseDuration", () => {
  it("parses '60s' to 60", () => { expect(parseDuration("60s")).toBe(60); });
  it("parses '90 sec' to 90", () => { expect(parseDuration("90 sec")).toBe(90); });
  it("parses '2 min' to 120", () => { expect(parseDuration("2 min")).toBe(120); });
  it("parses '1:30' to 90", () => { expect(parseDuration("1:30")).toBe(90); });
  it("parses '0:45' to 45", () => { expect(parseDuration("0:45")).toBe(45); });
  it("parses '45-60s' to midpoint 53", () => { expect(parseDuration("45-60s")).toBe(53); });
  it("parses '90 to 120 seconds' to midpoint 105", () => { expect(parseDuration("90 to 120 seconds")).toBe(105); });
  it("parses a mixed sentence with a duration in it", () => { expect(parseDuration("rest 75s between sets")).toBe(75); });
  it("returns undefined for unknown formats", () => { expect(parseDuration("no time here")).toBeUndefined(); });
  it("returns undefined for empty string", () => { expect(parseDuration("")).toBeUndefined(); });
  it("treats bare number as seconds", () => { expect(parseDuration("90")).toBe(90); });
});
