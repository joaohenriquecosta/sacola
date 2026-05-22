import retry from "async-retry";

import { query } from "infra/database";
import { getOrigin } from "infra/webserver";

export const testBaseUrl = getOrigin();

export { clearDatabase, runPendingMigrations, waitForAllServices };

function isJsonResponse(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").includes("application/json");
}

async function waitForAllServices(): Promise<void> {
  await waitForWebServer();

  async function waitForWebServer() {
    return retry(assertStatusOk, {
      retries: 30,
      maxTimeout: 1500,
      onRetry: (error: Error, attempt: number) => {
        console.log(`Attempt ${attempt} failed waiting for Next.js API. Error: ${error.message}`);
      },
    });

    async function assertStatusOk() {
      const res = await fetch(`${testBaseUrl}/api/v1/status`);
      if (res.status !== 200 || !isJsonResponse(res)) {
        throw new Error(
          `status: want 200+json, got ${res.status} content-type=${res.headers.get("content-type")}`,
        );
      }
    }
  }
}

async function clearDatabase(): Promise<void> {
  await query("DROP SCHEMA PUBLIC CASCADE; CREATE SCHEMA PUBLIC;");
}

async function runPendingMigrations(): Promise<void> {
  await fetch(`${testBaseUrl}/api/v1/migrations`, { method: "POST" });
}
