// Clients: as pessoas/empresas para quem a empresa vende. Scoped por
// company_id; rotas garantem o cross-tenant guard. Pedido (próximo
// passo) vai referenciar client_id, e a cascade de empresa apaga aqui
// também.

import { query } from "infra/database";
import { NotFoundError, ValidationError } from "infra/errors";

export type Client = {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

const NAME_MIN = 1;
const NAME_MAX = 120;
const PHONE_MAX = 32;
const NOTES_MAX = 2000;

export type CreateClientInput = {
  companyId: string;
  name: string;
  phone?: string | null;
  notes?: string | null;
};

export async function createClient(input: CreateClientInput): Promise<Client> {
  const name = normalizeName(input.name);
  const phone = normalizePhone(input.phone);
  const notes = normalizeNotes(input.notes);

  const result = await query<Client>({
    text: `
      INSERT INTO clients (company_id, name, phone, notes)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    ;`,
    values: [input.companyId, name, phone, notes],
  });
  return result.rows[0];
}

export async function getClientById(id: string): Promise<Client> {
  const result = await query<Client>({
    text: `SELECT * FROM clients WHERE id = $1 LIMIT 1;`,
    values: [id],
  });
  if (!result.rows[0]) {
    throw new NotFoundError({
      cause: new Error(`Client ${id} not found`),
      message: "Cliente não encontrado.",
    });
  }
  return result.rows[0];
}

export async function listClientsByCompany(companyId: string): Promise<Client[]> {
  const result = await query<Client>({
    text: `
      SELECT *
      FROM clients
      WHERE company_id = $1
      ORDER BY name ASC
    ;`,
    values: [companyId],
  });
  return result.rows;
}

export type UpdateClientInput = {
  name?: string;
  phone?: string | null;
  notes?: string | null;
};

export async function updateClient(id: string, input: UpdateClientInput): Promise<Client> {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (input.name !== undefined) {
    sets.push(`name = $${sets.length + 2}`);
    values.push(normalizeName(input.name));
  }
  if (input.phone !== undefined) {
    sets.push(`phone = $${sets.length + 2}`);
    values.push(normalizePhone(input.phone));
  }
  if (input.notes !== undefined) {
    sets.push(`notes = $${sets.length + 2}`);
    values.push(normalizeNotes(input.notes));
  }

  if (sets.length === 0) {
    throw new ValidationError({
      message: "Nada para atualizar.",
      action: "Envie pelo menos um campo: name, phone ou notes.",
    });
  }

  sets.push(`updated_at = timezone('utc', now())`);

  const result = await query<Client>({
    text: `UPDATE clients SET ${sets.join(", ")} WHERE id = $1 RETURNING *;`,
    values: [id, ...values],
  });
  if (!result.rows[0]) {
    throw new NotFoundError({
      cause: new Error(`Client ${id} not found`),
      message: "Cliente não encontrado.",
    });
  }
  return result.rows[0];
}

export async function deleteClient(id: string): Promise<void> {
  const result = await query({
    text: `DELETE FROM clients WHERE id = $1;`,
    values: [id],
  });
  if (result.rowCount === 0) {
    throw new NotFoundError({
      cause: new Error(`Client ${id} not found`),
      message: "Cliente não encontrado.",
    });
  }
}

export async function deleteClientsByCompany(companyId: string): Promise<void> {
  await query({
    text: `DELETE FROM clients WHERE company_id = $1;`,
    values: [companyId],
  });
}

function normalizeName(name: unknown): string {
  if (typeof name !== "string") {
    throw new ValidationError({ message: "Nome inválido." });
  }
  const trimmed = name.trim();
  if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) {
    throw new ValidationError({
      message: `Nome precisa ter entre ${NAME_MIN} e ${NAME_MAX} caracteres.`,
    });
  }
  return trimmed;
}

function normalizePhone(phone: unknown): string | null {
  if (phone === undefined || phone === null) return null;
  if (typeof phone !== "string") {
    throw new ValidationError({ message: "Telefone inválido." });
  }
  const trimmed = phone.trim();
  if (!trimmed) return null;
  if (trimmed.length > PHONE_MAX) {
    throw new ValidationError({
      message: `Telefone precisa ter no máximo ${PHONE_MAX} caracteres.`,
    });
  }
  return trimmed;
}

function normalizeNotes(notes: unknown): string | null {
  if (notes === undefined || notes === null) return null;
  if (typeof notes !== "string") {
    throw new ValidationError({ message: "Observações inválidas." });
  }
  const trimmed = notes.trim();
  if (!trimmed) return null;
  if (trimmed.length > NOTES_MAX) {
    throw new ValidationError({
      message: `Observações precisam ter no máximo ${NOTES_MAX} caracteres.`,
    });
  }
  return trimmed;
}
