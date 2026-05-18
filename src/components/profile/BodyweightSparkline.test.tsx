import { render, screen } from "@testing-library/react";
import { BodyweightSparkline } from "./BodyweightSparkline";

describe("BodyweightSparkline", () => {
  it("renders a placeholder when there are fewer than two entries", () => {
    render(<BodyweightSparkline entries={[]} />);
    expect(screen.getByText(/not enough data/i)).toBeInTheDocument();
  });

  it("renders an SVG line for two or more entries", () => {
    render(
      <BodyweightSparkline
        entries={[
          { id: "2026-05-10", value: 80, unit: "kg", recordedAt: "2026-05-10T00:00:00.000Z" },
          { id: "2026-05-12", value: 81, unit: "kg", recordedAt: "2026-05-12T00:00:00.000Z" },
          { id: "2026-05-14", value: 82, unit: "kg", recordedAt: "2026-05-14T00:00:00.000Z" },
        ]}
      />
    );
    expect(document.querySelector("svg polyline")).toBeTruthy();
  });

  it("shows latest value with unit", () => {
    render(
      <BodyweightSparkline
        entries={[
          { id: "2026-05-10", value: 80, unit: "kg", recordedAt: "2026-05-10T00:00:00.000Z" },
          { id: "2026-05-12", value: 81, unit: "kg", recordedAt: "2026-05-12T00:00:00.000Z" },
        ]}
      />
    );
    expect(screen.getByText(/81 kg/i)).toBeInTheDocument();
  });
});
