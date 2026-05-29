import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.innerWidth < MOBILE_BREAKPOINT;
}

// SSR has no viewport; assume desktop and let the client correct on mount.
function getServerSnapshot() {
  return false;
}

// Reads the viewport via useSyncExternalStore instead of an effect + setState,
// which keeps it SSR-safe and avoids the react-hooks/set-state-in-effect rule.
export function useIsMobile() {
  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
