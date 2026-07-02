import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileClient } from "./ProfileClient";

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: { list: jest.fn().mockResolvedValue([]) },
}));

const mockSaveProfile = jest.fn().mockResolvedValue(undefined);

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    profile: undefined,
    loading: false,
    error: null,
    saveProfile: mockSaveProfile,
  }),
}));

beforeEach(() => jest.clearAllMocks());

describe("ProfileClient — no profile", () => {
  it("renders a creation form, not the dead-end message", () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    expect(screen.queryByText(/import a program/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument();
  });

  it("saves when the Save profile button is clicked", async () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/your name/i), {
      target: { value: "Alex" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Alex",
          id: "local-profile",
          defaultDaysPerWeek: 4,
        })
      );
    });
  });

  it("saves the selected primary training goal", async () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/your name/i), {
      target: { value: "Alex" },
    });
    fireEvent.change(screen.getByLabelText(/primary training goal/i), {
      target: { value: "strength" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ primaryGoal: "strength" })
      );
    });
  });
});
