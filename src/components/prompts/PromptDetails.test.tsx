import { fireEvent, render, screen, within } from "@testing-library/react";
import { PromptDetails } from "./PromptDetails";

describe("PromptDetails", () => {
  it("renders prompt sections as headings, paragraphs, labeled fields, and lists", () => {
    render(<PromptDetails text={`## Profile\n### Training notes\nGoals (priority order):\n1. Hypertrophy\nEquipment: Full gym\n\nUse steady progression.\n\nConstraints:\n- bad knee\n- limited time\n\nProgression steps:\n1. Add reps\n2. Add load`} />);

    expect(screen.queryByRole("heading", { name: "Profile" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Training notes" })).toBeInTheDocument();
    expect(screen.getByText("Use steady progression.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Goals (priority order)" })).toBeInTheDocument();
    expect(screen.getByText("Hypertrophy")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Goals (priority order)" }).tagName).toBe("OL");
    expect(screen.getByRole("list", { name: "Constraints" })).toHaveAttribute("aria-label", "Constraints");
    expect(within(screen.getByRole("list", { name: "Constraints" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("list", { name: "Progression steps" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Progression steps" }).tagName).toBe("OL");
  });

  it("renders fenced JSON as nested labeled objects and lists without a raw code wall", () => {
    render(<PromptDetails text={`## Routine example\n\n\`\`\`json\n{"days":[{"title":"Lower A","sections":[{"name":"Strength","exercises":[{"name":"Squat","sets":3,"reps":"5-8"}]}]}]}\n\`\`\``} />);

    expect(screen.queryByRole("heading", { name: "Routine example" })).not.toBeInTheDocument();
    expect(screen.getByText("Lower A")).toBeInTheDocument();
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(screen.getByText("Sets")).toBeInTheDocument();
    expect(screen.queryByText(/\{"days"/)).not.toBeInTheDocument();
    expect(screen.queryByRole("code")).not.toBeInTheDocument();
  });

  it("renders a bare JSON example from the required contract semantically", () => {
    render(<PromptDetails text={`## Routine JSON contract\nExample structure:\n\n{"title":"Program","days":[{"title":"Upper","sections":[{"type":"strength"}]}]}`} />);
    expect(screen.getByText("Example routine structure")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Structured example" }).querySelector("details")).not.toHaveAttribute("open");
    fireEvent.click(screen.getByText("Example routine structure"));
    expect(screen.getByRole("region", { name: "Structured example" }).querySelector("details")).toHaveAttribute("open");
    expect(screen.getByText("Program")).toBeInTheDocument();
    expect(screen.getByText("Upper")).toBeInTheDocument();
    expect(screen.getByText("strength")).toBeInTheDocument();
    expect(screen.queryByText(/\{"title"/)).not.toBeInTheDocument();
  });

  it("labels plain prose blocks in order when labels are provided", () => {
    render(<PromptDetails text={`## Coaching\nAsk focused questions first.\n\nExplain choices in plain language.`} paragraphLabels={["Response style", "Programming guidance"]} />);
    expect(screen.getByRole("heading", { name: "Response style" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Programming guidance" })).toBeInTheDocument();
    expect(screen.getByText("Ask focused questions first.")).toBeInTheDocument();
  });

  it("displays XML-shaped source as readable labeled content, not markup", () => {
    render(<PromptDetails text={`## Output\n<routine>\n  <weeks>8</weeks>\n  <days>\n    <day>Lower A</day>\n  </days>\n</routine>`} />);

    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("Lower A")).toBeInTheDocument();
    expect(screen.queryByText(/<routine>/)).not.toBeInTheDocument();
  });

  it("preserves text surrounding XML elements", () => {
    render(<PromptDetails text={`Before the routine.\n<routine><weeks>8</weeks></routine>\nAfter the routine.`} />);
    expect(screen.getByText("Before the routine.")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("After the routine.")).toBeInTheDocument();
  });
});
