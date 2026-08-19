import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResolutionStep } from "./ResolutionStep";
import {
  extractUnresolvedExercises,
  groupResolutionOccurrences,
  storedOccurrenceCounts,
  type ResolutionGroup,
} from "@/lib/import/resolution";
import { makeEightBackSquatReview } from "@/lib/import/resolution.testFixtures";

const { review, expectedEightPaths } = makeEightBackSquatReview();
const items = extractUnresolvedExercises(review.warnings);
const groups = groupResolutionOccurrences(review.warnings);
const storedCounts = storedOccurrenceCounts(review.program, groups);

function renderStep(overrides: {
  resolutions?: Record<string, string>;
  remembered?: Record<string, boolean>;
  groups?: ResolutionGroup[];
  storedCounts?: Record<string, number>;
} = {}) {
  const onChange = jest.fn();
  const onRememberChange = jest.fn();
  const utils = render(
    <ResolutionStep
      items={items}
      groups={overrides.groups ?? groups}
      storedCounts={overrides.storedCounts ?? storedCounts}
      resolutions={overrides.resolutions ?? {}}
      remembered={overrides.remembered ?? {}}
      userExercises={[]}
      onChange={onChange}
      onRememberChange={onRememberChange}
      onAddToUserCatalog={jest.fn()}
      onBack={jest.fn()}
      onNext={jest.fn()}
    />,
  );
  return { ...utils, onChange, onRememberChange };
}

function uniform(id: string): Record<string, string> {
  return Object.fromEntries(expectedEightPaths.map((path) => [path, id]));
}

describe("ResolutionStep grouped choices", () => {
  it("shows one choice for eight repeated occurrences", () => {
    renderStep();
    expect(items).toHaveLength(8);
    // One heading for eight occurrences (before grouping there were eight).
    // `selector` excludes the identically named generic candidate `<option>`.
    expect(screen.getAllByText("Back Squat", { selector: "p" })).toHaveLength(1);
    expect(screen.getByText("used 8 times")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Choose version for Back Squat"),
    ).toBeInTheDocument();
  });

  it("shows the stored-exercise count, not the occurrence-path count", () => {
    // A base-day path expands into one stored exercise per week-clone, so the
    // two numbers differ for any routine with more than one week. Here the
    // group has eight paths while only four exercises would be patched.
    expect(groups[0].occurrenceCount).toBe(8);
    renderStep({ storedCounts: { [groups[0].groupKey]: 4 } });
    expect(screen.getByText("used 4 times")).toBeInTheDocument();
    expect(screen.queryByText("used 8 times")).not.toBeInTheDocument();
  });

  it("fans one selection out to every authoritative occurrence path", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep();
    await user.selectOptions(
      screen.getByLabelText("Choose version for Back Squat"),
      "barbell-high-bar-squat",
    );
    expect(onChange.mock.calls.map(([path]) => path)).toEqual(expectedEightPaths);
    expect(
      onChange.mock.calls.every(([, id]) => id === "barbell-high-bar-squat"),
    ).toBe(true);
  });

  it("does not tick Remember for the user, and reports an explicit tick", async () => {
    const user = userEvent.setup();
    const { onRememberChange } = renderStep({
      resolutions: uniform("barbell-low-bar-squat"),
    });
    const remember = screen.getByRole("checkbox", {
      name: "Remember this interpretation",
    });
    expect(remember).not.toBeChecked();
    await user.click(remember);
    expect(onRememberChange).toHaveBeenCalledWith(groups[0].groupKey, true);
  });

  it("cannot remember an ambiguous name, but can remember an agreed one", () => {
    const agreed = renderStep({ resolutions: uniform("barbell-low-bar-squat") });
    expect(
      screen.getByRole("checkbox", { name: "Remember this interpretation" }),
    ).toBeEnabled();
    agreed.unmount();

    const split = uniform("barbell-low-bar-squat");
    split[expectedEightPaths[3]] = "barbell-high-bar-squat";
    renderStep({ resolutions: split });
    expect(
      screen.getByRole("checkbox", { name: "Remember this interpretation" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/different versions .* can't be remembered/i),
    ).toBeInTheDocument();
  });

  it("expands into one selector per authoritative path", async () => {
    const user = userEvent.setup();
    const { onChange } = renderStep();
    await user.click(
      screen.getByRole("button", { name: /resolve occurrences separately/i }),
    );
    for (const path of expectedEightPaths) {
      expect(
        screen.getByLabelText(`Choose version for Back Squat at ${path}`),
      ).toBeInTheDocument();
    }
    await user.selectOptions(
      screen.getByLabelText(`Choose version for Back Squat at ${expectedEightPaths[2]}`),
      "barbell-low-bar-squat",
    );
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(expectedEightPaths[2], "barbell-low-bar-squat");
  });
});
