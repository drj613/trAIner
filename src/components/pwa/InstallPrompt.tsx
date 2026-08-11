"use client";

/**
 * iOS-only instructional install prompt. There is no programmatic install on
 * iOS (no beforeinstallprompt) — the user must do Share → Add to Home Screen.
 * Installing matters for durability: installed web apps are exempt from
 * Safari's 7-day storage cap and make persist() grantable.
 *
 * CRITICAL COPY: installed iOS apps do NOT share IndexedDB with Safari. An
 * existing user who installs without exporting first opens an empty app.
 * The migration line below is load-bearing — do not remove it.
 */
export function shouldShowInstallPrompt(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPadOS Safari defaults to a desktop ("Macintosh") user agent; the
  // established signal is Mac UA + multitouch. Real Macs report 0 touch points.
  const isIos =
    /iPhone|iPad|iPod/.test(ua) ||
    (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1);
  // matchMedia is absent in jsdom (and guarded here so merely importing the
  // Settings page never throws in tests or exotic embedders).
  const installed =
    (window.matchMedia?.("(display-mode: standalone)")?.matches ?? false) ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return isIos && !installed;
}

export function InstallPrompt() {
  if (!shouldShowInstallPrompt()) return null;
  return (
    <div
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r, 6px)",
        padding: 10,
        fontSize: 11.5,
        color: "var(--fg-2)",
        lineHeight: 1.55,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span className="tx-up" style={{ color: "var(--accent)" }}>Protect your data — install</span>
      </div>
      Safari deletes this app&apos;s data after 7 days without a visit. Installing
      to your home screen exempts it: tap <strong>Share</strong> →{" "}
      <strong>Add to Home Screen</strong>.
      <div style={{ marginTop: 6, color: "var(--warn, #e6b664)" }}>
        If you&apos;ve been using this in your browser, you&apos;ll need to
        download your profile data and import it into the installed app — the
        installed copy starts with its own empty storage.
      </div>
    </div>
  );
}
