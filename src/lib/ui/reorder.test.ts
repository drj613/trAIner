import { moveItem } from "./reorder";

describe("moveItem", () => {
  it("moves an item earlier in the array", () => {
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("moves an item later in the array", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });

  it("is a no-op when from and to are the same index", () => {
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const input = ["a", "b", "c"];
    moveItem(input, 0, 2);
    expect(input).toEqual(["a", "b", "c"]);
  });

  it("moves the only item in a single-element array", () => {
    expect(moveItem(["a"], 0, 0)).toEqual(["a"]);
  });
});
