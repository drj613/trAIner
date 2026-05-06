import { userExerciseRepo } from "./userExerciseRepo";
import { resetDbConnection } from "./appDb";

beforeEach(() => {
  resetDbConnection();
});

describe("userExerciseRepo", () => {
  it("saves and retrieves a user exercise by id", async () => {
    const saved = await userExerciseRepo.save("Copenhagen Plank");
    const fetched = await userExerciseRepo.get(saved.id);
    expect(fetched).toMatchObject({ id: saved.id, name: "Copenhagen Plank" });
  });

  it("assigns an id prefixed with 'user-'", async () => {
    const saved = await userExerciseRepo.save("Dead Hang");
    expect(saved.id).toMatch(/^user-/);
  });

  it("trims whitespace from the name", async () => {
    const saved = await userExerciseRepo.save("  Wall Walk  ");
    expect(saved.name).toBe("Wall Walk");
  });

  it("lists all saved exercises", async () => {
    await userExerciseRepo.save("Exercise A");
    await userExerciseRepo.save("Exercise B");
    const list = await userExerciseRepo.list();
    expect(list.length).toBeGreaterThanOrEqual(2);
    const names = list.map((e) => e.name);
    expect(names).toContain("Exercise A");
    expect(names).toContain("Exercise B");
  });

  it("returns undefined for a missing id", async () => {
    const result = await userExerciseRepo.get("user-does-not-exist");
    expect(result).toBeUndefined();
  });
});
