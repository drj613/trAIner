import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PromptBuilderClient } from "./PromptBuilderClient";

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    profile: undefined,
    programs: [],
    loading: false,
    error: null,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe("PromptBuilderClient", () => {
  it("shows a no-profile warning when profile is undefined", () => {
    render(<MemoryRouter><PromptBuilderClient /></MemoryRouter>);
    expect(screen.getByText(/no profile found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });
});
