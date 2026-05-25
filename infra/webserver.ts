// Resolves the absolute origin (scheme + host) the app is reachable at.
// Used by features that need to emit absolute links (activation emails,
// server-side fetches) and by the test orchestrator.
//
// Precedence:
//   1. PUBLIC_ORIGIN   — explicit override (set in production Vercel env to
//                        the public alias, e.g. https://sacola1.vercel.app).
//   2. VERCEL_URL      — set by Vercel for preview deployments; produces a
//                        per-deploy URL that's reachable by the user clicking
//                        an activation link.
//   3. TEST_BASE_URL   — set by the test orchestrator when booting next-dev.
//   4. CI fallback     — 127.0.0.1:3000.
//   5. Local dev       — localhost:3000.

export function getOrigin(): string {
  if (process.env.PUBLIC_ORIGIN) {
    return process.env.PUBLIC_ORIGIN.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.TEST_BASE_URL) {
    return process.env.TEST_BASE_URL.replace(/\/$/, "");
  }
  if (process.env.CI) {
    return "http://127.0.0.1:3000";
  }
  return "http://localhost:3000";
}
