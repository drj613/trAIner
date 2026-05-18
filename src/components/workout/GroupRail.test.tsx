import { render, screen } from "@testing-library/react";
import { GroupRail } from "./GroupRail";

describe("GroupRail", () => {
  it("renders children without label for single-type group", () => {
    render(
      <GroupRail type="single">
        <span>Exercise A</span>
      </GroupRail>
    );
    expect(screen.getByText("Exercise A")).toBeInTheDocument();
    expect(screen.queryByText(/SUPERSET|CIRCUIT|GIANT SET/i)).toBeNull();
  });

  it("renders SUPERSET label for superset group", () => {
    render(<GroupRail type="superset"><span>A</span></GroupRail>);
    expect(screen.getByText("SUPERSET")).toBeInTheDocument();
  });

  it("renders CIRCUIT label for circuit group", () => {
    render(<GroupRail type="circuit"><span>A</span></GroupRail>);
    expect(screen.getByText("CIRCUIT")).toBeInTheDocument();
  });

  it("renders GIANT SET label for giant-set group", () => {
    render(<GroupRail type="giant-set"><span>A</span></GroupRail>);
    expect(screen.getByText("GIANT SET")).toBeInTheDocument();
  });

  it("appends notes text to the label when notes provided", () => {
    render(<GroupRail type="superset" notes="rest 90s"><span>A</span></GroupRail>);
    expect(screen.getByText(/SUPERSET · rest 90s/)).toBeInTheDocument();
  });
});
