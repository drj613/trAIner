import { useEffect, useState } from "react";

export type VisualViewportState = {
  /** Current visualViewport.height — undefined if the API is unavailable. */
  height: number | undefined;
  /** True once the hook has read from the API at least once. */
  ready: boolean;
};

/**
 * Tracks the height of `window.visualViewport`. Updates on resize and scroll
 * (iOS Safari fires `scroll` — not `resize` — during keyboard transitions and pinch-zoom).
 * Returns `ready: false` on SSR or in browsers without the VisualViewport API,
 * so callers can fall back to `100dvh` or similar.
 */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>(() => {
    const vv = typeof window === "undefined" ? undefined : window.visualViewport;
    return vv ? { height: vv.height, ready: true } : { height: undefined, ready: false };
  });

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      setState({ height: vv!.height, ready: true });
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return state;
}
