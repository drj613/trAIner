import { VOLUME_LANDMARKS } from "./thresholds";
import { ALL_MUSCLE_GROUPS } from "./types";

describe("VOLUME_LANDMARKS", () => {
  it("keeps landmarks monotonic (mv ≤ mev ≤ mavLow ≤ mavHigh ≤ mrv) for every muscle", () => {
    for (const muscle of ALL_MUSCLE_GROUPS) {
      const lm = VOLUME_LANDMARKS[muscle];
      expect(lm.mv).toBeLessThanOrEqual(lm.mev);
      expect(lm.mev).toBeLessThanOrEqual(lm.mavLow);
      expect(lm.mavLow).toBeLessThanOrEqual(lm.mavHigh);
      expect(lm.mavHigh).toBeLessThanOrEqual(lm.mrv);
    }
  });
});
