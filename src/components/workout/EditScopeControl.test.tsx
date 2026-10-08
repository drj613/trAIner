import { fireEvent, render, screen } from "@testing-library/react";
import { EditScopeControl } from "./EditScopeControl";

describe("EditScopeControl", () => {
  it("offers occurrence and remaining routine-day scope with the workout title", () => {
    const onChange = jest.fn();
    render(<EditScopeControl scope="occurrence" onChange={onChange} title="Lower B" />);
    expect(screen.getByRole("radio", { name: "This occurrence" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "Apply to remaining occurrences of Lower B" }));
    expect(onChange).toHaveBeenCalledWith("routine-day");
  });

  it("uses a day fallback when the workout title is empty", () => {
    render(<EditScopeControl scope="occurrence" onChange={jest.fn()} title="" dayNumber={3} />);
    expect(screen.getByRole("radio", { name: /remaining occurrences of Day 3/i })).toBeInTheDocument();
  });

  it("labels scope for import review and disables both choices when requested", () => {
    render(<EditScopeControl scope="occurrence" onChange={jest.fn()} title="Lower B" atImport disabled />);
    expect(screen.getByRole("radio", { name: "Every occurrence of Lower B" })).toBeDisabled();
  });
});
