"use client";

import { useEffect, useState } from "react";

export function DbBlockedBanner() {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const on = () => setBlocked(true);
    window.addEventListener("trainer-db-blocked", on);
    return () => window.removeEventListener("trainer-db-blocked", on);
  }, []);
  if (!blocked) return null;
  return (
    <div role="alert" style={{ padding: "8px 12px", background: "var(--warn, #e6b664)", color: "#000", fontSize: 13 }}>
      Waiting for a database update — close other trAIner tabs, then reload this page.
    </div>
  );
}
