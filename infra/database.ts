// Espelha o padrão do automanews (cliente por query, sem pool).
// Cada `query()` abre uma conexão, executa e fecha — funciona bem com
// ambientes serverless (Vercel + Neon) e mantém os testes simples.
import { Client } from "pg";
import type { QueryResult, QueryResultRow } from "pg";
import { ServiceError } from "infra/errors";

type QueryInput = string | { text: string; values?: unknown[] };

export async function query<T extends QueryResultRow = QueryResultRow>(
  queryObject: QueryInput,
): Promise<QueryResult<T>> {
  let client: Client | undefined;

  try {
    client = await getNewClient();
  } catch (error) {
    const publicError = new ServiceError({
      cause: error,
      message: "Erro na conexão com o Banco de Dados.",
    });
    console.error(publicError);
    throw publicError;
  }

  try {
    const result =
      typeof queryObject === "string"
        ? await client.query<T>(queryObject)
        : await client.query<T>(queryObject.text, queryObject.values as never);
    return result;
  } catch (error) {
    const publicError = new ServiceError({
      cause: error,
      message: "Erro na Query ao Banco de Dados.",
    });
    console.error(publicError);
    throw publicError;
  } finally {
    await client?.end();
  }
}

export async function getNewClient(): Promise<Client> {
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT ?? 5432),
    user: process.env.POSTGRES_USER,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    ssl: process.env.NODE_ENV === "production",
  });
  await client.connect();
  await client.query("SET timezone = 'UTC'");
  return client;
}
