import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BodyweightWidget } from "./BodyweightWidget";

const saveMock = jest.fn().mockResolvedValue(undefined);
const listMock = jest.fn().mockResolvedValue([]);

jest.mock("@/lib/storage/bodyweightRepo", () => ({
  bodyweightRepo: {
    list: () => listMock(),
    save: (...args: unknown[]) => saveMock(...args),
  },
}));

beforeEach(() => { saveMock.mockClear(); listMock.mockReset().mockResolvedValue([]); });

describe("BodyweightWidget", () => {
  it("shows the call-to-action when no entry exists for today", async () => {
    render(<BodyweightWidget />);
    expect(await screen.findByText(/log bodyweight/i)).toBeInTheDocument();
  });

  it("saves an entry when the user submits", async () => {
    const user = userEvent.setup();
    render(<BodyweightWidget />);
    await user.click(await screen.findByText(/log bodyweight/i));
    await user.type(screen.getByPlaceholderText(/weight/i), "80");
    await user.click(screen.getByRole("button", { name: /save/i }));
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ value: 80, unit: "lb" }));
  });

  it("shows the current weight when an entry exists for today", async () => {
    listMock.mockResolvedValue([
      { id: "2026-05-18", value: 81, unit: "lb", recordedAt: "2026-05-18T10:00:00.000Z" },
    ]);
    render(<BodyweightWidget today="2026-05-18" />);
    expect(await screen.findByText(/81 lb/i)).toBeInTheDocument();
  });
});
