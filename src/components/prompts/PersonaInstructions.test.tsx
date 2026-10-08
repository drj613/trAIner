import { fireEvent, render, screen } from "@testing-library/react";
import { PersonaInstructions } from "./PersonaInstructions";
import { DEFAULT_PERSONAS } from "@/lib/prompts/personas";

const persona = DEFAULT_PERSONAS[0];

test("shows labeled philosophy, methodology and principles without XML or an editor", () => {
  const { container } = render(<PersonaInstructions name={persona.name} text={persona.block} onChange={jest.fn()} />);
  expect(screen.getByRole("heading", { name: "Philosophy" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Methodology" })).toBeVisible();
  expect(screen.getByRole("heading", { name: "Programming principles" })).toBeVisible();
  expect(screen.getAllByRole("listitem").length).toBeGreaterThan(3);
  expect(container.textContent).not.toContain("<coach_persona>");
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});

test("edits a labeled principle while preserving the rest of the copied source", () => {
  const onChange = jest.fn();
  render(<PersonaInstructions name={persona.name} text={persona.block} onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Edit coach details" }));
  fireEvent.change(screen.getByLabelText("Principle 1"), { target: { value: "Train consistently & patiently." } });
  const updated = onChange.mock.calls[0][0] as string;
  expect(updated).toContain("<principle>Train consistently &amp; patiently.</principle>");
  expect(updated).toContain(persona.block.match(/<methodology>[\s\S]*?<\/methodology>/)![0]);
});

test("custom instructions stay verbatim and can be edited without XML", () => {
  const onChange = jest.fn();
  render(<PersonaInstructions name={persona.name} text="My own instructions." onChange={onChange} />);
  expect(screen.getByText("My own instructions.")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Edit coach details" }));
  fireEvent.change(screen.getByLabelText(persona.name), { target: { value: "New custom instructions." } });
  expect(onChange).toHaveBeenCalledWith("New custom instructions.");
});

test.each(DEFAULT_PERSONAS)("prettifies $name without changing its source", (coach) => {
  const onChange = jest.fn();
  const { container } = render(<PersonaInstructions name={coach.name} text={coach.block} onChange={onChange} />);
  expect(screen.getByRole("heading", { name: "Programming principles" })).toBeVisible();
  expect(container.textContent).not.toMatch(/<\/?(?:coach_persona|principle|methodology|philosophy)>/);
  expect(onChange).not.toHaveBeenCalled();
});
