import { expect, test } from "@playwright/test";

test("Workspace shows the saved theme on direct navigation", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("trainer-theme", "terminal"));
  await page.goto("settings");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "terminal");
  await expect(page.getByRole("button", { name: "terminal", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("navigation identifies the current screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("history");
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("dialog").getByRole("link", { name: "History", exact: true })).toHaveAttribute("aria-current", "page");
});

test("Escape closes navigation and returns focus to its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("today");
  const trigger = page.getByRole("button", { name: "Open menu" });
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(trigger).toBeFocused();
});

test("desktop navigation stays visible without a duplicate drawer trigger", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("today");
  await expect(page.getByRole("navigation", { name: "Main navigation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toHaveCount(0);
});

for (const theme of ["linen", "terminal", "editor", "logbook", "paper", "midnight"]) {
  test(`${theme} secondary text and accent labels have readable contrast`, async ({ page }) => {
    await page.goto("import");
    const ratios = await page.evaluate((selectedTheme) => {
      document.documentElement.setAttribute("data-theme", selectedTheme);
      const style = getComputedStyle(document.documentElement);
      function luminance(hex: string) {
        const digits = hex.trim().replace("#", "");
        const expanded = digits.length === 3 ? [...digits].map(value => value + value).join("") : digits;
        const values = expanded.match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
        return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
      }
      function ratio(foreground: string, background: string) {
        const a = luminance(style.getPropertyValue(foreground));
        const b = luminance(style.getPropertyValue(background));
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      }
      return {
        secondary: ratio("--fg-3", "--bg-2"),
        caption: ratio("--fg-4", "--bg-2"),
        accent: ratio("--accent", "--bg-1"),
        warning: ratio("--warn", "--bg-1"),
      };
    }, theme);
    for (const [role, ratio] of Object.entries(ratios)) {
      expect(ratio, `${theme} ${role} contrast`).toBeGreaterThanOrEqual(4.5);
    }
  });
}
