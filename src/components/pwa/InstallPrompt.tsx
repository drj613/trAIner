"use client";

/**
 * iOS-only instructional install prompt. There is no programmatic install on
 * iOS (no beforeinstallprompt) — the user must do Share → Add to Home Screen.
 * Installing matters for durability: installed web apps are exempt from
 * WebKit's ~7-day-of-non-use storage eviction (ITP) and make persist()
 * grantable. Detection deliberately matches any iOS browser (Chrome,
 * Firefox, etc. are all WebKit under the hood on iOS), not just Safari.
 *
 * CRITICAL COPY: installed iOS apps do NOT share IndexedDB with the browser
 * tab. An existing user who installs without exporting first opens an empty
 * app. The migration paragraph below is load-bearing — it must keep naming
 * the real "Download backup file" / "Import workspace" actions and the
 * "starts with its own empty storage" reason; do not remove or genericize it.
 */
export function shouldShowInstallPrompt(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  // iPadOS Safari defaults to a desktop ("Macintosh") user agent; the
  // established heuristic is Mac UA + multitouch, since most Macs report 0
  // touch points. This can false-positive on a touch-capable Mac (Touch Bar,
  // an attached touchscreen) — harmless, since the only effect is showing a
  // Mac user irrelevant iPhone install instructions, not any data loss.
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
      iOS clears this app&apos;s data if you don&apos;t open it for about a
      week. Adding trAIner to your home screen exempts it, and lets the
      browser grant persistent storage: tap <strong>Share</strong> →{" "}
      <strong>Add to Home Screen</strong>.
      <div style={{ marginTop: 6, color: "var(--warn, #e6b664)" }}>
        If you&apos;ve been using trAIner in your browser, the installed app
        starts with its own empty storage. Use <strong>Download backup file</strong>{" "}
        here first, then <strong>Import workspace</strong> inside the
        installed app — otherwise it opens with none of your history.
      </div>
    </div>
  );
}
