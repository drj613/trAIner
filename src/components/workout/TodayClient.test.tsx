import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TodayClient } from "./TodayClient";

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    programs: [],
    profile: undefined,
    loading: false,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: { listForProgram: jest.fn().mockResolvedValue([]) },
}));

describe("TodayClient", () => {
  it("shows profile setup banner when no profile exists", () => {
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    expect(screen.getByText(/set up your Profile/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to profile/i })).toHaveAttribute("href", "/profile");
  });

  it("does not show the banner when profile exists", () => {
    jest.resetModules();
  });
});
