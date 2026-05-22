// Resolves the absolute origin (scheme + host) the app is reachable at.
// Used by tests to build the base URL and (later) by features that need
// to emit absolute links (emails, server-side fetches).

export function getOrigin(): string {
  if (process.env.TEST_BASE_URL) {
    return process.env.TEST_BASE_URL;
  }
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.CI) {
    return "http://127.0.0.1:3000";
  }
  if (process.env.NODE_ENV === "production" && process.env.PUBLIC_ORIGIN) {
    return process.env.PUBLIC_ORIGIN;
  }
  return "http://localhost:3000";
}
