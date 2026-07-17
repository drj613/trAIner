import { render, screen, fireEvent } from "@testing-library/react";
import { RankedGoalsEditor, RankedGoalsList } from "./RankedGoalsEditor";

describe("RankedGoalsList", () => {
  it("renders items as a numbered list in given order", () => {
    render(<RankedGoalsList items={["Fix shoulder pain", "Compete again"]} />);
    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1");
    expect(items[0]).toHaveTextContent("Fix shoulder pain");
    expect(items[1]).toHaveTextContent("2");
    expect(items[1]).toHaveTextContent("Compete again");
  });

  it("shows a placeholder when there are no goals", () => {
    render(<RankedGoalsList items={[]} />);
    expect(screen.getByText(/no goals yet/i)).toBeInTheDocument();
  });
});

describe("RankedGoalsEditor", () => {
  it("renders existing goals as a numbered list", () => {
    render(<RankedGoalsEditor items={["a", "b"]} onChange={jest.fn()} />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("1");
    expect(items[0]).toHaveTextContent("a");
    expect(items[1]).toHaveTextContent("2");
    expect(items[1]).toHaveTextContent("b");
  });

  it("adds a new goal at the end (lowest priority) via the text input", () => {
    const onChange = jest.fn();
    render(<RankedGoalsEditor items={["a"]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/add goal/i), {
      target: { value: "b" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(onChange).toHaveBeenCalledWith(["a", "b"]);
  });

  it("does not add a duplicate or blank goal", () => {
    const onChange = jest.fn();
    render(<RankedGoalsEditor items={["a"]} onChange={onChange} />);
    fireEvent.change(screen.getByPlaceholderText(/add goal/i), {
      target: { value: "a" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    fireEvent.change(screen.getByPlaceholderText(/add goal/i), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: /^add$/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("removes a goal and keeps the rest in order", () => {
    const onChange = jest.fn();
    render(<RankedGoalsEditor items={["a", "b", "c"]} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /remove b/i }));
    expect(onChange).toHaveBeenCalledWith(["a", "c"]);
  });

  it("shows a placeholder when there are no goals", () => {
    render(<RankedGoalsEditor items={[]} onChange={jest.fn()} />);
    expect(screen.getByText(/no goals yet/i)).toBeInTheDocument();
  });
});
