import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileClient } from "./ProfileClient";
import { profileRepo } from "@/lib/storage/profileRepo";

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: { list: jest.fn().mockResolvedValue([]) },
}));

jest.mock("@/lib/storage/profileRepo", () => ({
  profileRepo: { save: jest.fn().mockResolvedValue(undefined) },
}));

const mockRefresh = jest.fn().mockResolvedValue(undefined);

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    profile: undefined,
    loading: false,
    error: null,
    refresh: mockRefresh,
  }),
}));

beforeEach(() => jest.clearAllMocks());

describe("ProfileClient — no profile", () => {
  it("renders a creation form, not the dead-end message", () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    expect(screen.queryByText(/import a program/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument();
  });

  it("saves and refreshes when the Save profile button is clicked", async () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/your name/i), {
      target: { value: "Alex" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => {
      expect(profileRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: "Alex", id: "local-profile" })
      );
      expect(mockRefresh).toHaveBeenCalled();
    });
  });
});
