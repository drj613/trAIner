import { demoProgram } from "./sample";
import { getRenderableDays } from "./overrides";

describe("program overrides", () => {
  it("layers a day override without mutating the base day", () => {
    const baseTitle = demoProgram.days[0].title;
    const program = {
      ...demoProgram,
      overrides: [
        {
          id: "override-1",
          scope: "day" as const,
          programId: demoProgram.id,
          dayId: demoProgram.days[0].id,
          replacement: { ...demoProgram.days[0], title: "Replacement Day" },
          createdAt: new Date().toISOString()
        }
      ]
    };

    expect(getRenderableDays(program)[0].title).toBe("Replacement Day");
    expect(demoProgram.days[0].title).toBe(baseTitle);
  });
});
