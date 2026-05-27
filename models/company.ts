// Companies are the unit of multi-tenancy: every business resource (members,
// invitations, eventually products/orders/stock) lives under one. Whoever
// creates a company gets an `owner` membership automatically; everyone else
// arrives via invitation.

import { query } from "infra/database";
import { NotFoundError, ValidationError } from "infra/errors";
import { SLUG_MAX_LENGTH, slugify } from "@/lib/slugify";
import { deleteClientsByCompany } from "models/client";
import { createMembership, deleteMembershipsByCompany } from "models/membership";
import { deleteOrdersByCompany } from "models/order";
import { deletePaymentsByCompany } from "models/payment";
import { deleteProductsByCompany } from "models/product";
import { deleteMovementsByCompany } from "models/stock";

export { slugify };

export type Company = {
  id: string;
  name: string;
  slug: string;
  created_at: Date;
  updated_at: Date;
};

const NAME_MIN = 2;
const NAME_MAX = 80;
const SLUG_MIN = 2;
const SLUG_MAX = SLUG_MAX_LENGTH;
// kebab-case, lowercase: starts/ends with alnum, internal hyphens allowed
const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export type CreateCompanyInput = {
  name: string;
  slug?: string;
  ownerUserId: string;
};

// Single-transaction logic split as: insert company → insert owner membership.
// No DB transaction (query() opens a fresh client per call) — if the second
// insert fails we compensate by deleting the company. UNIQUE(slug) handles
// the race window between callers picking the same suggestion.
export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const name = normalizeName(input.name);
  validateName(name);

  const slug = (input.slug ?? "").trim().toLowerCase() || (await suggestUniqueSlug(name));
  validateSlug(slug);

  const inserted = await insertCompanyQuery(name, slug);
  try {
    await createMembership({ userId: input.ownerUserId, companyId: inserted.id, role: "owner" });
  } catch (error) {
    await deleteCompanyById(inserted.id);
    throw error;
  }
  return inserted;
}

export async function getCompanyBySlug(slug: string): Promise<Company> {
  const company = await findCompanyBySlugQuery(slug);
  if (!company) {
    throw new NotFoundError({
      cause: new Error(`Company "${slug}" not found`),
      message: "Empresa não encontrada.",
      action: `Verifique se o slug "${slug}" está correto.`,
    });
  }
  return company;
}

export async function getCompanyById(id: string): Promise<Company> {
  const result = await query<Company>({
    text: `SELECT * FROM companies WHERE id = $1 LIMIT 1;`,
    values: [id],
  });
  const company = result.rows[0];
  if (!company) {
    throw new NotFoundError({
      cause: new Error(`Company ${id} not found`),
      message: "Empresa não encontrada.",
      action: "Verifique se o id está correto.",
    });
  }
  return company;
}

// Companies the user has a membership in. Joined with the membership row so
// the caller can also render the user's role per company.
export type CompanyWithRole = Company & { role: string };

export async function listCompaniesForUser(userId: string): Promise<CompanyWithRole[]> {
  const result = await query<CompanyWithRole>({
    text: `
      SELECT c.*, m.role
      FROM companies c
      JOIN memberships m ON m.company_id = c.id
      WHERE m.user_id = $1
      ORDER BY c.created_at ASC
    ;`,
    values: [userId],
  });
  return result.rows;
}

export type UpdateCompanyInput = {
  name?: string;
  slug?: string;
};

export async function updateCompany(id: string, patch: UpdateCompanyInput): Promise<Company> {
  const fields: string[] = [];
  const values: unknown[] = [id];

  if (patch.name !== undefined) {
    const name = normalizeName(patch.name);
    validateName(name);
    values.push(name);
    fields.push(`name = $${values.length}`);
  }
  if (patch.slug !== undefined) {
    const slug = patch.slug.trim().toLowerCase();
    validateSlug(slug);
    values.push(slug);
    fields.push(`slug = $${values.length}`);
  }
  if (fields.length === 0) {
    throw new ValidationError({
      message: "Nenhum campo para atualizar.",
      action: "Informe ao menos um campo (name ou slug).",
    });
  }
  fields.push(`updated_at = timezone('utc', now())`);

  const result = await query<Company>({
    text: `
      UPDATE companies
      SET ${fields.join(", ")}
      WHERE id = $1
      RETURNING *
    ;`,
    values,
  });
  if (!result.rows[0]) {
    throw new NotFoundError({
      cause: new Error(`Company ${id} not found`),
      message: "Empresa não encontrada.",
    });
  }
  return result.rows[0];
}

// Deletes the company and cascades to memberships in application code (no FK
// constraints on the schema — convention from the existing tables).
export async function deleteCompanyById(id: string): Promise<void> {
  // Order matters: tudo que referencia produtos/clientes/orders vai antes
  // deles. Payments referencia orders → apaga primeiro.
  await deletePaymentsByCompany(id);
  await deleteMovementsByCompany(id);
  await deleteOrdersByCompany(id);
  await deleteClientsByCompany(id);
  await deleteProductsByCompany(id);
  await deleteMembershipsByCompany(id);
  await query({ text: `DELETE FROM companies WHERE id = $1;`, values: [id] });
}

// Walks "base", "base-2", "base-3"… until UNIQUE(slug) accepts. Bounded so a
// pathological collision burst can't loop forever.
async function suggestUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "empresa";
  for (let n = 0; n < 100; n++) {
    const candidate = n === 0 ? base : truncate(`${base}-${n + 1}`, SLUG_MAX);
    const taken = await findCompanyBySlugQuery(candidate);
    if (!taken) return candidate;
  }
  throw new ValidationError({
    message: "Não foi possível gerar um slug único para esta empresa.",
    action: "Escolha um slug manualmente.",
  });
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s;
}

function normalizeName(name: unknown): string {
  if (typeof name !== "string") {
    throw new ValidationError({ message: "Nome inválido.", action: "Informe um nome de texto." });
  }
  return name.trim().replace(/\s+/g, " ");
}

function validateName(name: string): void {
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    throw new ValidationError({
      message: "Nome inválido.",
      action: `Use entre ${NAME_MIN} e ${NAME_MAX} caracteres.`,
    });
  }
}

function validateSlug(slug: unknown): asserts slug is string {
  if (
    typeof slug !== "string" ||
    slug.length < SLUG_MIN ||
    slug.length > SLUG_MAX ||
    !SLUG_PATTERN.test(slug)
  ) {
    throw new ValidationError({
      message: "Slug inválido.",
      action: `Use ${SLUG_MIN}-${SLUG_MAX} caracteres em letras minúsculas, números e hífen (sem hífen no início/fim).`,
    });
  }
}

async function findCompanyBySlugQuery(slug: string): Promise<Company | null> {
  const result = await query<Company>({
    text: `SELECT * FROM companies WHERE slug = $1 LIMIT 1;`,
    values: [slug],
  });
  return result.rows[0] ?? null;
}

async function insertCompanyQuery(name: string, slug: string): Promise<Company> {
  try {
    const result = await query<Company>({
      text: `
        INSERT INTO companies (name, slug)
        VALUES ($1, $2)
        RETURNING *
      ;`,
      values: [name, slug],
    });
    return result.rows[0];
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "cause" in error &&
      isUniqueViolation((error as { cause: unknown }).cause)
    ) {
      throw new ValidationError({
        cause: error,
        message: `O slug "${slug}" já está em uso.`,
        action: "Escolha outro slug.",
      });
    }
    throw error;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  );
}
