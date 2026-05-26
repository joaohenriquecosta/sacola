import retry from "async-retry";

import { query } from "infra/database";
import { getOrigin } from "infra/webserver";

export const testBaseUrl = getOrigin();

const MAILPIT_API_URL = process.env.MAILPIT_API_URL ?? "http://127.0.0.1:8025/api/v1";

export {
  clearDatabase,
  deleteAllEmails,
  getActivationTokenForUserEmail,
  getLastEmail,
  registerAndActivateUser,
  runPendingMigrations,
  waitForAllServices,
};

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

// Reads the pending activation token directly from the DB so tests that
// just need an activated user can skip the email roundtrip. Tests that want
// to verify the email content itself use getLastEmail() instead.
async function getActivationTokenForUserEmail(email: string): Promise<string> {
  const result = await query<{ token: string }>({
    text: `
      SELECT t.token
      FROM user_activation_tokens t
      JOIN users u ON u.id = t.user_id
      WHERE LOWER(u.email) = LOWER($1)
        AND t.used_at IS NULL
        AND t.expires_at > timezone('utc', now())
      ORDER BY t.created_at DESC
      LIMIT 1
    ;`,
    values: [email],
  });
  const token = result.rows[0]?.token;
  if (!token) {
    throw new Error(`No valid activation token for ${email}`);
  }
  return token;
}

type RegisterInput = { username: string; email: string; password: string };

// Full "create + activate" path used by tests that need a logged-in user
// without caring about the email flow. Throws if any step fails — these are
// preconditions, not assertions.
async function registerAndActivateUser(input: RegisterInput): Promise<void> {
  const registerRes = await fetch(`${testBaseUrl}/api/v1/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (registerRes.status !== 201) {
    throw new Error(`registerAndActivateUser: register status ${registerRes.status}`);
  }
  const token = await getActivationTokenForUserEmail(input.email);
  const activateRes = await fetch(`${testBaseUrl}/api/v1/activations/${token}`, {
    method: "PATCH",
  });
  if (activateRes.status !== 200) {
    throw new Error(`registerAndActivateUser: activate status ${activateRes.status}`);
  }
}

// Mailpit helpers — only used by tests that assert email content. The dev
// stack starts mailpit in compose; if it isn't running these will throw.

type MailpitMessageSummary = {
  ID: string;
  From: { Address: string; Name: string };
  To: { Address: string; Name: string }[];
  Subject: string;
  Created: string;
};

type MailpitMessage = MailpitMessageSummary & {
  Text: string;
  HTML: string;
};

async function deleteAllEmails(): Promise<void> {
  const res = await fetch(`${MAILPIT_API_URL}/messages`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(`mailpit DELETE /messages: ${res.status}`);
  }
}

async function getLastEmail(): Promise<MailpitMessage> {
  const listRes = await fetch(`${MAILPIT_API_URL}/messages?start=0&limit=1`);
  if (!listRes.ok) {
    throw new Error(`mailpit GET /messages: ${listRes.status}`);
  }
  const list = (await listRes.json()) as { messages: MailpitMessageSummary[] };
  const summary = list.messages?.[0];
  if (!summary) {
    throw new Error("no emails captured by mailpit");
  }
  const detailRes = await fetch(`${MAILPIT_API_URL}/message/${summary.ID}`);
  if (!detailRes.ok) {
    throw new Error(`mailpit GET /message/${summary.ID}: ${detailRes.status}`);
  }
  return (await detailRes.json()) as MailpitMessage;
}
