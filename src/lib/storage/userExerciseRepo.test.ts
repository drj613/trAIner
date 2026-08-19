import { userExerciseRepo } from "./userExerciseRepo";
import { deleteDB } from "idb";
import { DB_NAME, resetDbConnection } from "./appDb";

beforeEach(async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});

afterEach(() => {
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

  it("dispatches once after save commits", async () => {
    let committedRead: ReturnType<typeof userExerciseRepo.list> | undefined;
    const listener = jest.fn(() => {
      committedRead = userExerciseRepo.list();
    });
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      const saved = await userExerciseRepo.save("Hatfield Squat");
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(committedRead).resolves.toContainEqual(saved);
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });

  it("dispatches once after remove and can suppress internal-write events", async () => {
    const saved = await userExerciseRepo.save("Hatfield Squat", { dispatch: false });
    const listener = jest.fn();
    window.addEventListener("trainer-exercise-identity-changed", listener);

    try {
      await userExerciseRepo.remove(saved.id);
      expect(listener).toHaveBeenCalledTimes(1);
      await expect(userExerciseRepo.get(saved.id)).resolves.toBeUndefined();
    } finally {
      window.removeEventListener("trainer-exercise-identity-changed", listener);
    }
  });
});
