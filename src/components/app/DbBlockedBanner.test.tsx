import { render, screen, act } from "@testing-library/react";
import { DbBlockedBanner } from "./DbBlockedBanner";

it("shows the close-other-tabs instruction on trainer-db-blocked", () => {
  render(<DbBlockedBanner />);
  expect(screen.queryByRole("alert")).toBeNull();
  act(() => { window.dispatchEvent(new CustomEvent("trainer-db-blocked")); });
  expect(screen.getByRole("alert")).toHaveTextContent(/close other trAIner tabs/i);
});
