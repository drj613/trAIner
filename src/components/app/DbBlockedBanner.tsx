"use client";

import { useEffect, useState } from "react";

// Fixed to the top and above the app shell (AppShell fills the viewport, so
// a static banner would render below the fold). --z-toast (80) is the
// highest layer in the app's existing z-index scale (globals.css); this
// alert is at least as urgent as a toast, so it reuses that layer rather
// than inventing a new one.
const bannerStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  zIndex: "var(--z-toast)",
  padding: "8px 12px",
  background: "var(--warn, #e6b664)",
  color: "#000",
  fontSize: 13,
};

const reloadButtonStyle: React.CSSProperties = {
  marginLeft: 8,
  background: "none",
  border: "none",
  padding: 0,
  font: "inherit",
  color: "#000",
  textDecoration: "underline",
  cursor: "pointer",
};

export function DbBlockedBanner() {
  // Independent: "blocked" clears itself once the stuck open resolves, but
  // "blocking" must stay until the user actually reloads this tab.
  const [blocked, setBlocked] = useState(false);
  const [blocking, setBlocking] = useState(false);

  useEffect(() => {
    const onBlocked = () => setBlocked(true);
    const onUnblocked = () => setBlocked(false);
    const onBlocking = () => setBlocking(true);
    window.addEventListener("trainer-db-blocked", onBlocked);
    window.addEventListener("trainer-db-unblocked", onUnblocked);
    window.addEventListener("trainer-db-blocking", onBlocking);
    return () => {
      window.removeEventListener("trainer-db-blocked", onBlocked);
      window.removeEventListener("trainer-db-unblocked", onUnblocked);
      window.removeEventListener("trainer-db-blocking", onBlocking);
    };
  }, []);

  if (blocking) {
    return (
      <div role="alert" style={bannerStyle}>
        Another trAIner tab or window is waiting on this one to release its database connection.
        <button type="button" style={reloadButtonStyle} onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }

  if (blocked) {
    return (
      <div role="alert" style={bannerStyle}>
        Waiting for a database update — close other trAIner tabs or windows, then reload this page.
      </div>
    );
  }

  return null;
}
