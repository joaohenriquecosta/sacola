"use client";

// Thin top-of-viewport progress bar. Driven by a counter — calling start()
// twice and stop() once keeps it visible, matching real-world flows where
// a form-submit triggers both a fetch and a router navigation that should
// share a single "stuff is happening" indicator.
//
// The CSS does the work: a 2px tall bar with a moving gradient shimmer.
// Purely indeterminate (we don't know the API latency upfront) but the
// animation gives the user a sustained signal something is in flight.

import { createContext, useCallback, useContext, useState } from "react";

const LoadingBarContext = createContext<{
  start: () => void;
  stop: () => void;
} | null>(null);

export function LoadingBarProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState(0);

  const start = useCallback(() => setActive((n) => n + 1), []);
  const stop = useCallback(() => setActive((n) => Math.max(0, n - 1)), []);

  return (
    <LoadingBarContext.Provider value={{ start, stop }}>
      {active > 0 && <Bar />}
      {children}
    </LoadingBarContext.Provider>
  );
}

export function useLoadingBar(): { start: () => void; stop: () => void } {
  const ctx = useContext(LoadingBarContext);
  if (!ctx) {
    // SSR-safe fallback — outside the provider, calls are no-ops.
    return { start: () => {}, stop: () => {} };
  }
  return ctx;
}

function Bar() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] overflow-hidden bg-transparent"
    >
      <div className="animate-loading-shimmer bg-primary absolute inset-y-0 w-1/3 rounded-r-full" />
    </div>
  );
}
