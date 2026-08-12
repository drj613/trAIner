import { render, screen } from "@testing-library/react";
import { InstallPrompt, shouldShowInstallPrompt } from "./InstallPrompt";

function setEnv({ ios, standaloneNav, standaloneMedia }: { ios: boolean; standaloneNav?: boolean; standaloneMedia: boolean }) {
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: ios
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1"
      : "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0 Safari/537.36",
  });
  (window.navigator as unknown as { standalone?: boolean }).standalone = standaloneNav;
  window.matchMedia = jest.fn().mockReturnValue({ matches: standaloneMedia }) as unknown as typeof window.matchMedia;
}

describe("shouldShowInstallPrompt", () => {
  it("true on iOS Safari, not installed", () => {
    setEnv({ ios: true, standaloneNav: false, standaloneMedia: false });
    expect(shouldShowInstallPrompt()).toBe(true);
  });
  it("false when already installed (navigator.standalone)", () => {
    setEnv({ ios: true, standaloneNav: true, standaloneMedia: false });
    expect(shouldShowInstallPrompt()).toBe(false);
  });
  it("false when already installed (display-mode: standalone)", () => {
    setEnv({ ios: true, standaloneNav: false, standaloneMedia: true });
    expect(shouldShowInstallPrompt()).toBe(false);
  });
  it("false off iOS", () => {
    setEnv({ ios: false, standaloneMedia: false });
    Object.defineProperty(window.navigator, "maxTouchPoints", { configurable: true, value: 0 });
    expect(shouldShowInstallPrompt()).toBe(false);
  });
  it("true on iPadOS Safari's desktop (Macintosh) user agent", () => {
    setEnv({ ios: false, standaloneNav: false, standaloneMedia: false }); // Mac UA
    Object.defineProperty(window.navigator, "maxTouchPoints", { configurable: true, value: 5 });
    expect(shouldShowInstallPrompt()).toBe(true);
  });
  it("does not throw when matchMedia is missing (jsdom default)", () => {
    setEnv({ ios: true, standaloneNav: false, standaloneMedia: false });
    // @ts-expect-error simulate jsdom without matchMedia
    delete window.matchMedia;
    expect(shouldShowInstallPrompt()).toBe(true);
  });
});

describe("InstallPrompt", () => {
  it("renders the Add to Home Screen instruction on iOS", () => {
    setEnv({ ios: true, standaloneNav: false, standaloneMedia: false });
    render(<InstallPrompt />);
    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
  });
  it("names the real Settings actions for migrating data", () => {
    setEnv({ ios: true, standaloneNav: false, standaloneMedia: false });
    render(<InstallPrompt />);
    expect(screen.getByText(/Download backup file/i)).toBeInTheDocument();
    expect(screen.getByText(/Import workspace/i)).toBeInTheDocument();
  });
  it("explains why: the installed app starts with its own empty storage", () => {
    setEnv({ ios: true, standaloneNav: false, standaloneMedia: false });
    render(<InstallPrompt />);
    expect(screen.getByText(/starts with its own empty storage/i)).toBeInTheDocument();
  });
  it("renders nothing when installed", () => {
    setEnv({ ios: true, standaloneNav: true, standaloneMedia: false });
    const { container } = render(<InstallPrompt />);
    expect(container).toBeEmptyDOMElement();
  });
});
