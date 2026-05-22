import { Client } from "pg";

// Suppress console.error noise from production code logging errors before throwing.
// Tests that need to assert on console.error output can spy on it themselves.
jest.spyOn(console, "error").mockImplementation(() => {});

// Connection params are snapshotted at module load time so individual tests
// cannot break the advisory lock by mutating POSTGRES_*, NODE_ENV, or ssl.

const TEST_DATABASE_LOCK_ID = 1777590040231;
let testLockClient: Client | null = null;

const LOCK_CLIENT_PARAMS = {
  host: process.env.POSTGRES_HOST,
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  user: process.env.POSTGRES_USER,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  ssl: false,
};

async function newLockClient(): Promise<Client> {
  const client = new Client(LOCK_CLIENT_PARAMS);
  await client.connect();
  await client.query("SET timezone = 'UTC'");
  return client;
}

beforeEach(async () => {
  testLockClient = await newLockClient();
  await testLockClient.query("SELECT pg_advisory_lock($1);", [TEST_DATABASE_LOCK_ID]);
});

afterEach(async () => {
  if (!testLockClient) return;

  try {
    await testLockClient.query("SELECT pg_advisory_unlock($1);", [TEST_DATABASE_LOCK_ID]);
  } finally {
    await testLockClient.end();
    testLockClient = null;
  }
});
