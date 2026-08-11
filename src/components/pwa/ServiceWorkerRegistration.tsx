"use client";

import { useEffect } from "react";
import { BASE_URL, IS_PROD } from "@/lib/pwa/viteEnv";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !IS_PROD) return;
    navigator.serviceWorker
      .register(`${BASE_URL}sw.js`, { scope: BASE_URL })
      .catch((e) => console.error("[sw] registration failed", e));
  }, []);

  return null;
}
