// Polls until `next dev` is serving JSON from the API routes used by integration tests.
// Probes GET /api/v1/status (always 200+JSON, verifies server + DB are both ready).
// Exit 0 on success, exit 1 on timeout.
const baseUrl = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const timeoutMs = Number(process.env.WAIT_FOR_NEXT_MS ?? 120_000);
const intervalMs = Number(process.env.WAIT_FOR_NEXT_INTERVAL_MS ?? 400);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isJsonResponse(response) {
  const ct = response.headers.get("content-type") || "";
  return ct.includes("application/json");
}

async function assertNextApiReady() {
  const statusRes = await fetch(`${baseUrl}/api/v1/status`);
  if (statusRes.status !== 200 || !isJsonResponse(statusRes)) {
    throw new Error(
      `status: want 200+json, got ${statusRes.status} content-type=${statusRes.headers.get("content-type")}`,
    );
  }

  const migrationsRes = await fetch(`${baseUrl}/api/v1/migrations`);
  const migrationsOk =
    isJsonResponse(migrationsRes) &&
    (migrationsRes.status === 200 || migrationsRes.status === 403);
  if (!migrationsOk) {
    throw new Error(
      `migrations: want 200/403+json, got ${migrationsRes.status} content-type=${migrationsRes.headers.get("content-type")}`,
    );
  }
}

async function main() {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      await assertNextApiReady();
      console.log("Next.js dev API routes ready for integration tests.");
      return;
    } catch (error) {
      lastError = error;
      await sleep(intervalMs);
    }
  }

  console.error("Timed out waiting for Next.js dev server.", lastError);
  process.exit(1);
}

main();
