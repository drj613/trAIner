import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { classifyCell, SetCell } from "./SetCell";

describe("classifyCell", () => {
  it("empty string → empty", () => expect(classifyCell("")).toBe("empty"));
  it("skip → skip", () => expect(classifyCell("skip")).toBe("skip"));
  it("pain → pain", () => expect(classifyCell("pain")).toBe("pain"));
  it("+70x9 → pr", () => expect(classifyCell("+70x9")).toBe("pr"));
  it("65pr → pr", () => expect(classifyCell("65pr")).toBe("pr"));
  it("65x10! → miss", () => expect(classifyCell("65x10!")).toBe("miss"));
  it("fail → miss", () => expect(classifyCell("fail")).toBe("miss"));
  it("BWx12 → bw", () => expect(classifyCell("BWx12")).toBe("bw"));
  it("65x10 → done", () => expect(classifyCell("65x10")).toBe("done"));
  it("100 → done", () => expect(classifyCell("100")).toBe("done"));
});

describe("SetCell render", () => {
  it("renders an input with the given value", () => {
    render(<SetCell value="65x10" onChange={jest.fn()} />);
    expect(screen.getByRole("textbox")).toHaveValue("65x10");
  });

  it("calls onChange when the user types", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<SetCell value="" onChange={handleChange} />);
    await user.type(screen.getByRole("textbox"), "80x5");
    expect(handleChange).toHaveBeenCalled();
  });

  it("reverts to original value on Escape", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<SetCell value="65x10" onChange={handleChange} />);
    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "99x99");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("65x10");
    expect(handleChange).not.toHaveBeenCalledWith("99x99");
  });
});
