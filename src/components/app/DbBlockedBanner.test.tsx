import { render, screen, act, fireEvent } from "@testing-library/react";
import { DbBlockedBanner } from "./DbBlockedBanner";

describe("DbBlockedBanner", () => {
  let originalLocation: typeof window.location;

  beforeEach(() => {
    originalLocation = window.location;
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  });

  it("shows the close-other-tabs instruction on trainer-db-blocked", () => {
    render(<DbBlockedBanner />);
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => { window.dispatchEvent(new CustomEvent("trainer-db-blocked")); });
    expect(screen.getByRole("alert")).toHaveTextContent(/close other trAIner tabs or windows/i);
  });

  it("clears the blocked banner once trainer-db-unblocked fires", () => {
    render(<DbBlockedBanner />);
    act(() => { window.dispatchEvent(new CustomEvent("trainer-db-blocked")); });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => { window.dispatchEvent(new CustomEvent("trainer-db-unblocked")); });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows a stale-connection banner with a reload button on trainer-db-blocking", () => {
    render(<DbBlockedBanner />);
    act(() => { window.dispatchEvent(new CustomEvent("trainer-db-blocking")); });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
  });

  it("does not clear the blocking banner on trainer-db-unblocked", () => {
    render(<DbBlockedBanner />);
    act(() => { window.dispatchEvent(new CustomEvent("trainer-db-blocking")); });
    act(() => { window.dispatchEvent(new CustomEvent("trainer-db-unblocked")); });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
  });

  it("reloads the page when the reload button is clicked", () => {
    const reloadMock = jest.fn();
    Object.defineProperty(window, "location", { value: { reload: reloadMock }, writable: true });

    render(<DbBlockedBanner />);
    act(() => { window.dispatchEvent(new CustomEvent("trainer-db-blocking")); });
    fireEvent.click(screen.getByRole("button", { name: /reload/i }));

    expect(reloadMock).toHaveBeenCalled();
  });
});
