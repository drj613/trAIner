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

/**
 * A group for a name the resolver can never look an alias up for, in the shape
 * the parser really produces for one: `unmatched`, fuzzy suggestions only.
 */
function makeUnmatchedGroup(rawName: string): ResolutionGroup {
  const path = `days.9.sections.0.groups.0.exercises.0`;
  return {
    groupKey: `unmatched:${rawName.toLowerCase()}`,
    normalizedRawName: rawName.toLowerCase(),
    kind: "unmatched",
    occurrences: [{ path, rawName, kind: "unmatched", candidates: [] }],
    occurrenceCount: 1,
    remember: false,
  };
}

describe("ResolutionStep: a Remember tick that could never take effect", () => {
  function renderName(rawName: string) {
    const group = makeUnmatchedGroup(rawName);
    const path = group.occurrences[0].path;
    return renderStep({
      groups: [group],
      resolutions: { [path]: "barbell-low-bar-squat" },
      storedCounts: { [group.groupKey]: 1 },
    });
  }

  it("refuses the tick, in words, for a name that offers a choice of exercises", () => {
    renderName("Back Squat or Lunge");
    expect(
      screen.getByRole("checkbox", { name: /^Remember "Back Squat or Lunge"/ }),
    ).toBeDisabled();
    expect(screen.getByText(/names more than one exercise/i)).toBeInTheDocument();
    expect(screen.getByText(/this import only/i)).toBeInTheDocument();
  });

  it("refuses the tick, in words, for a name that is nothing but annotations", () => {
    renderName("Competition");
    expect(screen.getByRole("checkbox", { name: /^Remember "Competition"/ })).toBeDisabled();
    expect(screen.getByText(/no exercise name/i)).toBeInTheDocument();
  });

  it("still offers the tick for an ordinary name in the same shape", () => {
    // The control: without it, a card that failed to render its checkbox at all
    // would satisfy both tests above.
    renderName("Jefferson Curl");
    expect(
      screen.getByRole("checkbox", { name: /^Remember "Jefferson Curl"/ }),
    ).toBeEnabled();
    expect(screen.queryByText(/this import only/i)).not.toBeInTheDocument();
  });
});

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
    const remember = screen.getByRole("checkbox", { name: /^Remember "Back Squat"/ });
    expect(remember).not.toBeChecked();
    await user.click(remember);
    expect(onRememberChange).toHaveBeenCalledWith(groups[0].groupKey, true);
  });

  it("cannot remember an ambiguous name, but can remember an agreed one", () => {
    const agreed = renderStep({ resolutions: uniform("barbell-low-bar-squat") });
    expect(
      screen.getByRole("checkbox", { name: /^Remember "Back Squat"/ }),
    ).toBeEnabled();
    agreed.unmount();

    const split = uniform("barbell-low-bar-squat");
    split[expectedEightPaths[3]] = "barbell-high-bar-squat";
    renderStep({ resolutions: split });
    expect(
      screen.getByRole("checkbox", { name: /^Remember "Back Squat"/ }),
    ).toBeDisabled();
    expect(
      screen.getByText(/different versions .* can't be remembered/i),
    ).toBeInTheDocument();
  });

  it("says so when a decision would not reach any exercise", () => {
    // storedOccurrenceCounts returns 0 for a structurally ambiguous day:
    // applyResolutions refuses to patch it, so the choice is a silent no-op
    // unless the row says so.
    renderStep({ storedCounts: { [groups[0].groupKey]: 0 } });
    expect(screen.getByText(/won't apply/i)).toBeInTheDocument();
    expect(screen.queryByText(/^used \d+ times$/)).not.toBeInTheDocument();
  });

  it("names the exercise and the chosen version in the Remember label", () => {
    const agreed = renderStep({ resolutions: uniform("barbell-low-bar-squat") });
    expect(
      screen.getByRole("checkbox", { name: 'Remember "Back Squat" as Low Bar Back Squat' }),
    ).toBeInTheDocument();
    agreed.unmount();

    // Nothing chosen yet: the label still names which exercise it is about,
    // because two ambiguous names would otherwise be indistinguishable.
    renderStep();
    expect(
      screen.getByRole("checkbox", { name: 'Remember "Back Squat"' }),
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
