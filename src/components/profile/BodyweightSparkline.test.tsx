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
    expect(screen.getByText(/Current 81 kg/i)).toBeInTheDocument();
  });

  it("derives change and range and keeps a small change off the plot edges", () => {
    render(
      <BodyweightSparkline
        entries={[
          { id: "2026-10-05", value: 169, unit: "lb", recordedAt: "2026-10-05T00:00:00.000Z" },
          { id: "2026-10-19", value: 168, unit: "lb", recordedAt: "2026-10-19T00:00:00.000Z" },
        ]}
      />
    );
    expect(screen.getByText("Change −1 lb · Range 168–169 lb")).toBeInTheDocument();
    const ys = document.querySelector("svg polyline")!.getAttribute("points")!.split(" ").map((p) => Number(p.split(",")[1]));
    expect(Math.min(...ys)).toBeGreaterThan(8);
    expect(Math.max(...ys)).toBeLessThan(72);
  });

  it("plots only entries in the latest unit and says so when units are mixed", () => {
    render(
      <BodyweightSparkline
        entries={[
          { id: "2026-10-01", value: 80, unit: "kg", recordedAt: "2026-10-01T00:00:00.000Z" },
          { id: "2026-10-05", value: 169, unit: "lb", recordedAt: "2026-10-05T00:00:00.000Z" },
          { id: "2026-10-19", value: 168, unit: "lb", recordedAt: "2026-10-19T00:00:00.000Z" },
        ]}
      />
    );
    expect(screen.getByText(/Chart shows 2 entries in lb/)).toBeInTheDocument();
    expect(screen.getByText(/1 entry in other units not plotted/)).toBeInTheDocument();
  });
});
